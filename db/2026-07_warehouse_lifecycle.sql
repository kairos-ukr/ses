-- =====================================================================
--  K-CORE · Складський цикл комплектації
--  Резерв → Видача (issue) / Продаж (sale) / Передача (partner_transfer) → Повернення
--
--  Застосовувати в Supabase → SQL Editor.
--  ВАЖЛИВО: тип операції в цій БД називається stock_operation_type.
-- =====================================================================


-- =====================================================================
--  БЛОК A · Значення enum (idempotent; здебільшого no-op — усе вже є)
-- =====================================================================
ALTER TYPE stock_operation_type ADD VALUE IF NOT EXISTS 'issue';
ALTER TYPE stock_operation_type ADD VALUE IF NOT EXISTS 'return';
ALTER TYPE stock_operation_type ADD VALUE IF NOT EXISTS 'reserve';
ALTER TYPE stock_operation_type ADD VALUE IF NOT EXISTS 'unreserve';
ALTER TYPE stock_operation_type ADD VALUE IF NOT EXISTS 'transfer';
ALTER TYPE stock_operation_type ADD VALUE IF NOT EXISTS 'partner_transfer';
ALTER TYPE reservation_status   ADD VALUE IF NOT EXISTS 'fulfilled';
ALTER TYPE reservation_status   ADD VALUE IF NOT EXISTS 'cancelled';


-- =====================================================================
--  БЛОК B · В'юхи (джерело правди для дашбордів)
-- =====================================================================

DROP VIEW IF EXISTS v_warehouse_stock_available;
CREATE VIEW v_warehouse_stock_available AS
WITH flows AS (
    SELECT warehouse_to_id   AS warehouse_id, nomenclature_id,
           SUM(quantity)     AS qty_in, 0::numeric AS qty_out
    FROM stock_movements
    WHERE warehouse_to_id IS NOT NULL
      AND operation_type IN ('purchase','return','transfer')
    GROUP BY warehouse_to_id, nomenclature_id
    UNION ALL
    SELECT warehouse_from_id AS warehouse_id, nomenclature_id,
           0::numeric        AS qty_in, SUM(quantity) AS qty_out
    FROM stock_movements
    WHERE warehouse_from_id IS NOT NULL
      AND operation_type IN ('issue','sale','partner_transfer','writeoff','transfer')
    GROUP BY warehouse_from_id, nomenclature_id
),
on_hand AS (
    SELECT warehouse_id, nomenclature_id, SUM(qty_in) - SUM(qty_out) AS quantity_on_hand
    FROM flows GROUP BY warehouse_id, nomenclature_id
),
reserved AS (
    SELECT warehouse_id, nomenclature_id,
           SUM(reserved_quantity - released_quantity) AS quantity_reserved
    FROM reservations WHERE status = 'active'
    GROUP BY warehouse_id, nomenclature_id
)
SELECT
    COALESCE(oh.warehouse_id,   r.warehouse_id)   AS warehouse_id,
    COALESCE(oh.nomenclature_id, r.nomenclature_id) AS nomenclature_id,
    COALESCE(oh.quantity_on_hand, 0)::numeric      AS quantity_on_hand,
    COALESCE(r.quantity_reserved, 0)::numeric      AS quantity_reserved,
    (COALESCE(oh.quantity_on_hand, 0) - COALESCE(r.quantity_reserved, 0))::numeric AS quantity_available
FROM on_hand oh
FULL OUTER JOIN reserved r
    ON oh.warehouse_id = r.warehouse_id AND oh.nomenclature_id = r.nomenclature_id;


DROP VIEW IF EXISTS v_object_material_needs;
CREATE VIEW v_object_material_needs AS
WITH active_spec_items AS (
    SELECT s.installation_custom_id,
           si.id                              AS specification_item_id,
           si.nomenclature_id,
           COALESCE(si.original_name, n.name) AS nomenclature_name,
           si.quantity                        AS required_quantity
    FROM specifications s
    JOIN specification_items si ON si.specification_id = s.id
    JOIN nomenclature n         ON n.id = si.nomenclature_id
    WHERE s.status = 'confirmed'
),
reserved AS (
    SELECT installation_custom_id, nomenclature_id,
           SUM(reserved_quantity - released_quantity) AS reserved_quantity
    FROM reservations WHERE status = 'active'
    GROUP BY installation_custom_id, nomenclature_id
),
issued AS (
    SELECT installation_custom_id, nomenclature_id,
           SUM(CASE WHEN operation_type IN ('issue','sale','partner_transfer') THEN quantity
                    WHEN operation_type = 'return'                             THEN -quantity
                    ELSE 0 END) AS issued_quantity
    FROM stock_movements
    WHERE installation_custom_id IS NOT NULL
      AND operation_type IN ('issue','sale','partner_transfer','return')
    GROUP BY installation_custom_id, nomenclature_id
)
SELECT
    asi.installation_custom_id,
    asi.specification_item_id,
    asi.nomenclature_id,
    asi.nomenclature_name,
    asi.required_quantity,
    COALESCE(r.reserved_quantity, 0)::numeric AS reserved_quantity,
    COALESCE(i.issued_quantity, 0)::numeric   AS issued_quantity,
    GREATEST(asi.required_quantity - COALESCE(r.reserved_quantity, 0) - COALESCE(i.issued_quantity, 0), 0)::numeric AS outstanding_need
FROM active_spec_items asi
LEFT JOIN reserved r ON r.installation_custom_id = asi.installation_custom_id AND r.nomenclature_id = asi.nomenclature_id
LEFT JOIN issued   i ON i.installation_custom_id = asi.installation_custom_id AND i.nomenclature_id = asi.nomenclature_id;


-- =====================================================================
--  БЛОК C · RPC-функції (атомарні операції циклу). Повертають jsonb.
-- =====================================================================

CREATE OR REPLACE FUNCTION reserve_for_object(
    p_installation integer, p_warehouse bigint, p_nomenclature bigint,
    p_spec_item bigint, p_qty numeric, p_emp integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_available numeric; v_id bigint;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    END IF;
    SELECT COALESCE(quantity_available, 0) INTO v_available
    FROM v_warehouse_stock_available
    WHERE warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature;
    v_available := COALESCE(v_available, 0);
    IF p_qty > v_available THEN
        RETURN jsonb_build_object('ok', false, 'message', format('Недостатньо вільного залишку (вільно: %s)', v_available));
    END IF;
    INSERT INTO reservations(installation_custom_id, warehouse_id, nomenclature_id,
                             specification_item_id, reserved_quantity, status, created_by, updated_by)
    VALUES (p_installation, p_warehouse, p_nomenclature, p_spec_item, p_qty, 'active', p_emp, p_emp)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'reservation_id', v_id, 'reserved', p_qty);
END $$;


CREATE OR REPLACE FUNCTION release_reservation(
    p_reservation_id bigint, p_qty numeric DEFAULT NULL, p_emp integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r reservations%ROWTYPE; v_active numeric; v_rel numeric;
BEGIN
    SELECT * INTO r FROM reservations WHERE id = p_reservation_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Резерв не знайдено'); END IF;
    v_active := r.reserved_quantity - r.released_quantity;
    v_rel := COALESCE(p_qty, v_active);
    IF v_rel <= 0 THEN RETURN jsonb_build_object('ok', false, 'message', 'Немає активного резерву для зняття'); END IF;
    IF v_rel > v_active THEN v_rel := v_active; END IF;
    UPDATE reservations
    SET released_quantity = released_quantity + v_rel,
        status = CASE WHEN released_quantity + v_rel >= reserved_quantity THEN 'cancelled'::reservation_status ELSE status END,
        updated_by = p_emp, updated_at = now()
    WHERE id = p_reservation_id;
    RETURN jsonb_build_object('ok', true, 'released', v_rel);
END $$;


CREATE OR REPLACE FUNCTION issue_to_object(
    p_installation integer, p_warehouse bigint, p_nomenclature bigint,
    p_qty numeric, p_reason text DEFAULT NULL, p_emp integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_on_hand numeric; v_reserved_here numeric; v_reserved_total numeric;
    v_issuable numeric; v_remaining numeric; v_take numeric;
    v_primary_res bigint := NULL; v_mv_id bigint; rec record;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    END IF;
    SELECT COALESCE(quantity_on_hand, 0) INTO v_on_hand
    FROM v_warehouse_stock_available WHERE warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature;
    v_on_hand := COALESCE(v_on_hand, 0);
    SELECT COALESCE(SUM(reserved_quantity - released_quantity), 0) INTO v_reserved_total
    FROM reservations WHERE status = 'active' AND warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature;
    SELECT COALESCE(SUM(reserved_quantity - released_quantity), 0) INTO v_reserved_here
    FROM reservations WHERE status = 'active' AND warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature
      AND installation_custom_id = p_installation;
    v_issuable := v_on_hand - (v_reserved_total - v_reserved_here);
    IF p_qty > v_issuable THEN
        RETURN jsonb_build_object('ok', false, 'message', format('Недостатньо на складі (доступно з урахуванням чужих резервів: %s)', v_issuable));
    END IF;
    v_remaining := p_qty;
    FOR rec IN
        SELECT id, (reserved_quantity - released_quantity) AS active
        FROM reservations
        WHERE status = 'active' AND warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature
          AND installation_custom_id = p_installation AND (reserved_quantity - released_quantity) > 0
        ORDER BY reserved_at ASC
    LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(rec.active, v_remaining);
        UPDATE reservations
        SET released_quantity = released_quantity + v_take,
            status = CASE WHEN released_quantity + v_take >= reserved_quantity THEN 'fulfilled'::reservation_status ELSE status END,
            updated_by = p_emp, updated_at = now()
        WHERE id = rec.id;
        IF v_primary_res IS NULL THEN v_primary_res := rec.id; END IF;
        v_remaining := v_remaining - v_take;
    END LOOP;
    INSERT INTO stock_movements(operation_type, nomenclature_id, quantity, warehouse_from_id,
                                installation_custom_id, reservation_id, notes, performed_by, created_by)
    VALUES ('issue', p_nomenclature, p_qty, p_warehouse, p_installation, v_primary_res, p_reason, p_emp, p_emp)
    RETURNING id INTO v_mv_id;
    RETURN jsonb_build_object('ok', true, 'movement_id', v_mv_id, 'reservation_id', v_primary_res);
END $$;


CREATE OR REPLACE FUNCTION sell_to_object(
    p_installation integer, p_warehouse bigint, p_nomenclature bigint, p_qty numeric,
    p_op text DEFAULT 'sale', p_client integer DEFAULT NULL,
    p_sale_price numeric DEFAULT NULL, p_currency text DEFAULT 'USD',
    p_exchange_rate numeric DEFAULT 1, p_reference text DEFAULT NULL,
    p_reason text DEFAULT NULL, p_emp integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_on_hand numeric; v_available numeric; v_reserved_here numeric; v_reserved_total numeric;
    v_issuable numeric; v_remaining numeric; v_take numeric;
    v_primary_res bigint := NULL; v_mv_id bigint; rec record;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    END IF;
    IF p_op NOT IN ('sale', 'partner_transfer') THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Невідомий тип операції');
    END IF;
    SELECT COALESCE(quantity_on_hand, 0), COALESCE(quantity_available, 0) INTO v_on_hand, v_available
    FROM v_warehouse_stock_available WHERE warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature;
    v_on_hand := COALESCE(v_on_hand, 0); v_available := COALESCE(v_available, 0);

    IF p_installation IS NOT NULL THEN
        SELECT COALESCE(SUM(reserved_quantity - released_quantity), 0) INTO v_reserved_total
        FROM reservations WHERE status = 'active' AND warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature;
        SELECT COALESCE(SUM(reserved_quantity - released_quantity), 0) INTO v_reserved_here
        FROM reservations WHERE status = 'active' AND warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature
          AND installation_custom_id = p_installation;
        v_issuable := v_on_hand - (v_reserved_total - v_reserved_here);
        IF p_qty > v_issuable THEN
            RETURN jsonb_build_object('ok', false, 'message', format('Недостатньо на складі (доступно: %s)', v_issuable));
        END IF;
        v_remaining := p_qty;
        FOR rec IN
            SELECT id, (reserved_quantity - released_quantity) AS active
            FROM reservations
            WHERE status = 'active' AND warehouse_id = p_warehouse AND nomenclature_id = p_nomenclature
              AND installation_custom_id = p_installation AND (reserved_quantity - released_quantity) > 0
            ORDER BY reserved_at ASC
        LOOP
            EXIT WHEN v_remaining <= 0;
            v_take := LEAST(rec.active, v_remaining);
            UPDATE reservations
            SET released_quantity = released_quantity + v_take,
                status = CASE WHEN released_quantity + v_take >= reserved_quantity THEN 'fulfilled'::reservation_status ELSE status END,
                updated_by = p_emp, updated_at = now()
            WHERE id = rec.id;
            IF v_primary_res IS NULL THEN v_primary_res := rec.id; END IF;
            v_remaining := v_remaining - v_take;
        END LOOP;
    ELSE
        IF p_qty > v_available THEN
            RETURN jsonb_build_object('ok', false, 'message', format('Недостатньо вільного залишку (вільно: %s)', v_available));
        END IF;
    END IF;

    INSERT INTO stock_movements(operation_type, nomenclature_id, quantity, warehouse_from_id,
                                installation_custom_id, client_id, reservation_id, sale_price,
                                currency, exchange_rate, reference_document, notes, performed_by, created_by)
    VALUES (p_op::stock_operation_type, p_nomenclature, p_qty, p_warehouse, p_installation, p_client,
            v_primary_res, p_sale_price, p_currency, p_exchange_rate, p_reference, p_reason, p_emp, p_emp)
    RETURNING id INTO v_mv_id;
    RETURN jsonb_build_object('ok', true, 'movement_id', v_mv_id, 'reservation_id', v_primary_res);
END $$;


CREATE OR REPLACE FUNCTION return_from_object(
    p_installation integer, p_warehouse bigint, p_nomenclature bigint,
    p_qty numeric, p_reason text DEFAULT NULL, p_emp integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mv_id bigint;
BEGIN
    IF p_qty IS NULL OR p_qty <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    END IF;
    INSERT INTO stock_movements(operation_type, nomenclature_id, quantity, warehouse_to_id,
                                installation_custom_id, notes, performed_by, created_by)
    VALUES ('return', p_nomenclature, p_qty, p_warehouse, p_installation, p_reason, p_emp, p_emp)
    RETURNING id INTO v_mv_id;
    RETURN jsonb_build_object('ok', true, 'movement_id', v_mv_id);
END $$;


-- =====================================================================
--  БЛОК D · Дозволи
-- =====================================================================
GRANT EXECUTE ON FUNCTION reserve_for_object(integer,bigint,bigint,bigint,numeric,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION release_reservation(bigint,numeric,integer)                        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION issue_to_object(integer,bigint,bigint,numeric,text,integer)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION sell_to_object(integer,bigint,bigint,numeric,text,integer,numeric,text,numeric,text,text,integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION return_from_object(integer,bigint,bigint,numeric,text,integer)      TO anon, authenticated;


-- =====================================================================
--  БЛОК E · Констрейнт логіки складів (враховує всі типи операцій)
-- =====================================================================
ALTER TABLE public.stock_movements
    DROP CONSTRAINT IF EXISTS chk_stock_movements_warehouse_logic;
ALTER TABLE public.stock_movements
    ADD CONSTRAINT chk_stock_movements_warehouse_logic CHECK (
        CASE operation_type
            WHEN 'purchase'         THEN warehouse_to_id   IS NOT NULL
            WHEN 'return'           THEN warehouse_to_id   IS NOT NULL
            WHEN 'transfer'         THEN warehouse_from_id IS NOT NULL AND warehouse_to_id IS NOT NULL
            WHEN 'issue'            THEN warehouse_from_id IS NOT NULL
            WHEN 'sale'             THEN warehouse_from_id IS NOT NULL
            WHEN 'partner_transfer' THEN warehouse_from_id IS NOT NULL
            WHEN 'writeoff'         THEN warehouse_from_id IS NOT NULL
            ELSE TRUE
        END
    );

-- Кінець частини 1.
