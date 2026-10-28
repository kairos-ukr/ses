-- =====================================================================
--  K-CORE · Норма днів на етап (етап 4, п.18)
--
--  Для кожного макроетапу — скільки днів він має тривати, напр. «КП: 7».
--  Замість загальних «14/30 днів» воронка, картка об'єкта й «Сьогодні»
--  підсвічують об'єкт за нормою його етапу, а бот пише відповідальному,
--  коли норму перевищено.
--
--  Норми — стартові, власник змінює їх у «Об'єктах» → «Норми етапів».
--
--  v_stage_overdue — активні об'єкти (не на паузі), що стоять на етапі
--                    довше за норму: скільки днів, норма, на скільки більше.
--                    Для бота.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.stage_norms (
    stage_key   text PRIMARY KEY,
    days        integer NOT NULL CHECK (days > 0 AND days <= 365),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  integer
);

COMMENT ON TABLE public.stage_norms IS
    'Норма днів на макроетап об''єкта (ключі як installations.workflow_stage). Перевищення — підсвічування в CRM і повідомлення бота.';

INSERT INTO public.stage_norms (stage_key, days) VALUES
    ('tech_review',      7),
    ('project',          7),
    ('proposal',         7),
    ('equipment',       14),
    ('complectation',    7),
    ('installation',    14),
    ('monitoring_setup', 7)
ON CONFLICT (stage_key) DO NOTHING;

DROP TRIGGER IF EXISTS set_updated_at_stage_norms ON public.stage_norms;
CREATE TRIGGER set_updated_at_stage_norms
    BEFORE UPDATE ON public.stage_norms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.stage_norms TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.v_stage_overdue
WITH (security_invoker = true) AS
SELECT
    i.custom_id                                     AS installation_custom_id,
    i.name,
    i.status,
    i.workflow_stage,
    i.responsible_emp_id,
    a.stage_entered_at,
    (current_date - a.stage_entered_at::date)       AS stage_days,
    n.days                                          AS norm_days,
    (current_date - a.stage_entered_at::date) - n.days AS over_days
FROM public.installations i
JOIN public.v_object_activity a ON a.installation_custom_id = i.custom_id
JOIN public.stage_norms n       ON n.stage_key = i.workflow_stage
WHERE i.status IN ('planning', 'in_progress')
  AND COALESCE(i.is_subcontract, false) = false
  AND (current_date - a.stage_entered_at::date) > n.days;

COMMENT ON VIEW public.v_stage_overdue IS
    'Активні об''єкти, що стоять на етапі довше за норму (stage_norms). Для бота й «Сьогодні».';

GRANT SELECT ON public.v_stage_overdue TO anon, authenticated, service_role;

-- Перевірка:
--   SELECT workflow_stage, count(*), round(avg(over_days)) FROM v_stage_overdue GROUP BY 1;
