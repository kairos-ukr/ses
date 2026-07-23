-- =====================================================================
--  K-CORE · Складський цикл — ЧАСТИНА 2
--  Повернення КОНКРЕТНОЇ проведеної операції (напр. переплутали інвертор)
--  Застосовувати ПІСЛЯ частини 1.
-- =====================================================================

ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS source_movement_id bigint REFERENCES public.stock_movements(id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_source
    ON public.stock_movements(source_movement_id);

CREATE OR REPLACE FUNCTION return_movement(
    p_source_movement_id bigint,
    p_qty                numeric DEFAULT NULL,
    p_reason             text    DEFAULT NULL,
    p_emp                integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    src        stock_movements%ROWTYPE;
    v_returned numeric;
    v_max      numeric;
    v_qty      numeric;
    v_wh       bigint;
    v_mv_id    bigint;
BEGIN
    SELECT * INTO src FROM stock_movements WHERE id = p_source_movement_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Операцію не знайдено');
    END IF;
    IF src.operation_type NOT IN ('issue', 'sale', 'partner_transfer') THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Повертати можна лише видачу / продаж / передачу партнеру');
    END IF;
    SELECT COALESCE(SUM(quantity), 0) INTO v_returned
    FROM stock_movements
    WHERE source_movement_id = p_source_movement_id AND operation_type = 'return';
    v_max := src.quantity - v_returned;
    IF v_max <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Цю операцію вже повністю повернено');
    END IF;
    v_qty := COALESCE(p_qty, v_max);
    IF v_qty <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    END IF;
    IF v_qty > v_max THEN v_qty := v_max; END IF;
    v_wh := COALESCE(src.warehouse_from_id, src.warehouse_to_id);
    IF v_wh IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'message', 'У вихідної операції не вказано склад');
    END IF;
    INSERT INTO stock_movements(operation_type, nomenclature_id, quantity, warehouse_to_id,
                                installation_custom_id, client_id, source_movement_id,
                                reference_document, notes, performed_by, created_by)
    VALUES ('return', src.nomenclature_id, v_qty, v_wh,
            src.installation_custom_id, src.client_id, p_source_movement_id,
            'Повернення операції #' || p_source_movement_id, p_reason, p_emp, p_emp)
    RETURNING id INTO v_mv_id;
    RETURN jsonb_build_object('ok', true, 'movement_id', v_mv_id, 'returned', v_qty, 'remaining', v_max - v_qty);
END $$;

GRANT EXECUTE ON FUNCTION return_movement(bigint, numeric, text, integer) TO anon, authenticated;

-- Кінець частини 2.
