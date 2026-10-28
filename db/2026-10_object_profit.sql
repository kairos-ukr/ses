-- =====================================================================
--  K-CORE · Прибуток з об'єкта: план і факт (етап 4, п.17)
--
--  Прибуток = вартість для клієнта − матеріали − роботи − інші витрати.
--  Усе рахується в гривнях; долари переводяться за курсом з налаштувань
--  (app_settings 'usd_uah_rate', змінюється у вкладці «Прибуток»).
--
--  Звідки цифри:
--   • матеріали — видане на об'єкт зі складу (мінус повернення) ×
--     ціна закупівлі позиції (nomenclature.cost_price). Ціна закупівлі
--     підтягується сама з замовлень постачальникам, решту вводять у
--     вкладці «Прибуток» прямо біля позиції;
--   • роботи — людино-дні бригади на об'єкті (installation_workers) ×
--     денна ставка працівника (employees.day_rate);
--   • інші витрати — object_expenses (транспорт, підрядники тощо);
--   • план матеріалів — потреба за специфікацією × ціна закупівлі.
--
--  Резервні копії перед міграцією: backup.nomenclature_20261015c,
--  backup.employees_20261015c.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Ціна закупівлі позиції і денна ставка працівника
-- ---------------------------------------------------------------------

ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS cost_price numeric(14,2);
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS cost_currency text NOT NULL DEFAULT 'UAH';
ALTER TABLE public.nomenclature ADD COLUMN IF NOT EXISTS cost_price_updated_at timestamptz;
COMMENT ON COLUMN public.nomenclature.cost_price IS 'Ціна закупівлі за одиницю (собівартість) — для прибутку з об''єкта. Оновлюється з замовлень постачальникам.';

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS day_rate numeric(10,2);
COMMENT ON COLUMN public.employees.day_rate IS 'Вартість одного робочого дня працівника на об''єкті, грн — для прибутку з об''єкта.';

-- Ціна з останнього замовлення постачальнику (де вона є)
UPDATE public.nomenclature n
SET cost_price = last.unit_price,
    cost_currency = last.currency,
    cost_price_updated_at = now()
FROM (
    SELECT DISTINCT ON (poi.nomenclature_id)
        poi.nomenclature_id, poi.unit_price, COALESCE(po.currency, 'UAH') AS currency
    FROM public.purchase_order_items poi
    JOIN public.purchase_orders po ON po.id = poi.purchase_order_id
    WHERE COALESCE(poi.unit_price, 0) > 0 AND NOT COALESCE(poi.is_package, false)
    ORDER BY poi.nomenclature_id, po.order_date DESC NULLS LAST, poi.id DESC
) last
WHERE n.id = last.nomenclature_id AND n.cost_price IS NULL;

-- Далі — сама: нове замовлення постачальнику оновлює ціну закупівлі
CREATE OR REPLACE FUNCTION public.nomenclature_cost_from_purchase()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE v_cur text;
BEGIN
    IF NEW.nomenclature_id IS NULL OR COALESCE(NEW.unit_price, 0) <= 0 OR COALESCE(NEW.is_package, false) THEN
        RETURN NEW;
    END IF;
    SELECT COALESCE(currency, 'UAH') INTO v_cur FROM purchase_orders WHERE id = NEW.purchase_order_id;
    UPDATE nomenclature
    SET cost_price = NEW.unit_price, cost_currency = COALESCE(v_cur, 'UAH'), cost_price_updated_at = now()
    WHERE id = NEW.nomenclature_id;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_purchase_item_cost ON public.purchase_order_items;
CREATE TRIGGER trg_purchase_item_cost
    AFTER INSERT OR UPDATE OF unit_price ON public.purchase_order_items
    FOR EACH ROW EXECUTE FUNCTION public.nomenclature_cost_from_purchase();

-- ---------------------------------------------------------------------
--  2. Налаштування (курс долара) і інші витрати об'єкта
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  integer
);
COMMENT ON TABLE public.app_settings IS 'Загальні налаштування програми (ключ → значення).';
INSERT INTO public.app_settings (key, value) VALUES ('usd_uah_rate', '{"rate": 41.5}')
ON CONFLICT (key) DO NOTHING;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.object_expenses (
    id                      bigserial PRIMARY KEY,
    installation_custom_id  integer NOT NULL REFERENCES public.installations(custom_id) ON DELETE CASCADE,
    title                   text NOT NULL,
    amount                  numeric(14,2) NOT NULL CHECK (amount > 0),
    currency                text NOT NULL DEFAULT 'UAH',
    spent_at                date NOT NULL DEFAULT current_date,
    created_by              integer,
    created_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.object_expenses IS 'Інші витрати об''єкта (транспорт, підрядники, оренда техніки…) — для прибутку.';
CREATE INDEX IF NOT EXISTS object_expenses_installation_idx ON public.object_expenses (installation_custom_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.object_expenses TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.object_expenses_id_seq TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  3. Розрахунок
-- ---------------------------------------------------------------------

-- Матеріали по об'єкту: видано мінус повернуто, × ціна закупівлі
CREATE OR REPLACE VIEW public.v_object_materials_cost
WITH (security_invoker = true) AS
WITH r AS (
    SELECT COALESCE((SELECT (value->>'rate')::numeric FROM public.app_settings WHERE key = 'usd_uah_rate'), 41.5) AS usd
), q AS (
    SELECT installation_custom_id, nomenclature_id,
           sum(CASE WHEN operation_type = 'return' THEN -quantity ELSE quantity END) AS qty
    FROM public.stock_movements
    WHERE installation_custom_id IS NOT NULL AND operation_type IN ('issue', 'return')
    GROUP BY 1, 2
)
SELECT
    q.installation_custom_id,
    q.nomenclature_id,
    n.name,
    n.brand,
    u.name                              AS unit_name,
    q.qty,
    n.cost_price,
    n.cost_currency,
    CASE WHEN n.cost_price IS NULL THEN NULL
         WHEN n.cost_currency = 'USD' THEN n.cost_price * r.usd
         ELSE n.cost_price END          AS unit_cost_uah,
    q.qty * CASE WHEN n.cost_price IS NULL THEN NULL
                 WHEN n.cost_currency = 'USD' THEN n.cost_price * r.usd
                 ELSE n.cost_price END  AS amount_uah
FROM q
JOIN public.nomenclature n ON n.id = q.nomenclature_id
LEFT JOIN public.units u ON u.id = n.unit_id
CROSS JOIN r
WHERE q.qty <> 0;

-- Роботи по об'єкту: людино-дні × денна ставка
CREATE OR REPLACE VIEW public.v_object_labour_cost
WITH (security_invoker = true) AS
SELECT
    w.installation_custom_id,
    w.employee_custom_id,
    e.name,
    count(*)                AS days,
    e.day_rate,
    count(*) * e.day_rate   AS amount_uah
FROM public.installation_workers w
LEFT JOIN public.employees e ON e.custom_id = w.employee_custom_id
GROUP BY w.installation_custom_id, w.employee_custom_id, e.name, e.day_rate;

-- Прибуток по об'єкту
CREATE OR REPLACE VIEW public.v_object_profit
WITH (security_invoker = true) AS
WITH r AS (
    SELECT COALESCE((SELECT (value->>'rate')::numeric FROM public.app_settings WHERE key = 'usd_uah_rate'), 41.5) AS usd
), m AS (
    SELECT installation_custom_id,
           sum(amount_uah)                                  AS materials_uah,
           count(*)                                         AS materials_items,
           count(*) FILTER (WHERE cost_price IS NULL)       AS materials_missing
    FROM public.v_object_materials_cost GROUP BY 1
), l AS (
    SELECT installation_custom_id,
           sum(days)                                        AS labour_days,
           sum(amount_uah)                                  AS labour_uah,
           count(*) FILTER (WHERE day_rate IS NULL)         AS labour_missing
    FROM public.v_object_labour_cost GROUP BY 1
), x AS (
    SELECT e.installation_custom_id,
           sum(CASE WHEN e.currency = 'USD' THEN e.amount * r.usd ELSE e.amount END) AS expenses_uah,
           count(*)                                         AS expenses_items
    FROM public.object_expenses e CROSS JOIN r GROUP BY 1
), p AS (
    SELECT nd.installation_custom_id,
           sum(nd.required_quantity * CASE WHEN n.cost_currency = 'USD' THEN n.cost_price * r.usd ELSE n.cost_price END)
               FILTER (WHERE n.cost_price IS NOT NULL)       AS plan_materials_uah,
           count(*) FILTER (WHERE n.cost_price IS NULL)     AS plan_missing
    FROM public.v_object_material_needs nd
    JOIN public.nomenclature n ON n.id = nd.nomenclature_id
    CROSS JOIN r
    GROUP BY 1
), base AS (
    SELECT
        i.custom_id                                         AS installation_custom_id,
        i.name, i.status, i.workflow_stage, i.created_at, i.end_date,
        COALESCE(i.currency, 'USD')                         AS currency,
        i.total_cost,
        r.usd                                               AS usd_rate,
        CASE WHEN COALESCE(i.currency, 'USD') = 'USD' THEN COALESCE(i.total_cost, 0) * r.usd
             ELSE COALESCE(i.total_cost, 0) END             AS revenue_uah,
        COALESCE(m.materials_uah, 0)                        AS materials_uah,
        COALESCE(m.materials_items, 0)                      AS materials_items,
        COALESCE(m.materials_missing, 0)                    AS materials_missing,
        COALESCE(l.labour_days, 0)                          AS labour_days,
        COALESCE(l.labour_uah, 0)                           AS labour_uah,
        COALESCE(l.labour_missing, 0)                       AS labour_missing,
        COALESCE(x.expenses_uah, 0)                         AS expenses_uah,
        COALESCE(x.expenses_items, 0)                       AS expenses_items,
        p.plan_materials_uah,
        COALESCE(p.plan_missing, 0)                         AS plan_missing
    FROM public.installations i
    CROSS JOIN r
    LEFT JOIN m ON m.installation_custom_id = i.custom_id
    LEFT JOIN l ON l.installation_custom_id = i.custom_id
    LEFT JOIN x ON x.installation_custom_id = i.custom_id
    LEFT JOIN p ON p.installation_custom_id = i.custom_id
    WHERE COALESCE(i.is_subcontract, false) = false
)
SELECT
    base.*,
    materials_uah + labour_uah + expenses_uah                       AS cost_uah,
    revenue_uah - (materials_uah + labour_uah + expenses_uah)       AS profit_uah,
    CASE WHEN revenue_uah > 0
         THEN round((revenue_uah - (materials_uah + labour_uah + expenses_uah)) / revenue_uah * 100, 1) END AS margin_pct,
    CASE WHEN plan_materials_uah IS NOT NULL AND revenue_uah > 0
         THEN revenue_uah - plan_materials_uah END                  AS plan_profit_before_labour_uah
FROM base;

COMMENT ON VIEW public.v_object_profit IS
    'Прибуток з об''єкта в гривнях: виручка, матеріали (видано × ціна закупівлі), роботи (людино-дні × ставка), інші витрати; скільки позицій/людей без ціни. План матеріалів — за специфікацією.';

GRANT SELECT ON public.v_object_materials_cost, public.v_object_labour_cost, public.v_object_profit
    TO anon, authenticated, service_role;
