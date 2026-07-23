-- =====================================================================
--  ВИПРАВЛЕННЯ: sell_to_object
--  Причина помилки: у БД тип операції називається stock_operation_type,
--  а в касті було помилково operation_type → 'type "operation_type" does not exist'.
--  Достатньо виконати цей блок у Supabase SQL Editor.
-- =====================================================================

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

GRANT EXECUTE ON FUNCTION sell_to_object(integer,bigint,bigint,numeric,text,integer,numeric,text,numeric,text,text,integer) TO anon, authenticated;
