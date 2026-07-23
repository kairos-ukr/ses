-- =====================================================================
--  ВИПРАВЛЕННЯ: chk_stock_movements_warehouse_logic
--  Старий констрейнт не враховував нові типи операцій (partner_transfer,
--  issue, return) → блокував їх. Замінюємо на повний і послідовний.
--  Виконати у Supabase SQL Editor.
--
--  Логіка складів за типом операції:
--    purchase / return  → надходження: має бути warehouse_to
--    issue / sale /
--    partner_transfer /
--    writeoff           → видаток:     має бути warehouse_from
--    transfer           → переміщення: мають бути обидва склади
--    reserve/unreserve  → рухом не проводяться (ELSE TRUE)
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
