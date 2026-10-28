-- =====================================================================
--  K-CORE · Аналітика власника (етап 4, п.19)
--
--  v_stage_durations — скільки днів об'єкт реально пробув на кожному
--  етапі, який уже пройдено: від переходу на етап до переходу на
--  наступний (події «Changed active stage» у workflow_events; початок
--  «Замірів» — дата створення об'єкта). Для «Скільки триває кожен етап».
--
--  v_object_launch — коли об'єкт перейшов на «Запуск» (перший раз).
--  Для «скільки запущено» і прибутку по місяцях.
--
--  Лише перегляди: дані не змінюються.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_stage_durations
WITH (security_invoker = true) AS
WITH sw AS (
    SELECT e.installation_custom_id, e.stage_key, e.created_at
    FROM public.workflow_events e
    WHERE e.new_status = 'active'
      AND (e.old_status IS NULL OR e.comment = 'Changed active stage')
    UNION ALL
    SELECT i.custom_id, 'tech_review', i.created_at::timestamptz
    FROM public.installations i
    WHERE COALESCE(i.is_subcontract, false) = false
), ordered AS (
    SELECT
        installation_custom_id, stage_key, created_at,
        lead(created_at) OVER w AS left_at,
        lead(stage_key)  OVER w AS next_stage
    FROM sw
    WINDOW w AS (PARTITION BY installation_custom_id ORDER BY created_at)
)
SELECT
    o.installation_custom_id,
    o.stage_key,
    o.created_at                                        AS entered_at,
    o.left_at,
    o.next_stage,
    round((EXTRACT(epoch FROM o.left_at - o.created_at) / 86400)::numeric, 1) AS days
FROM ordered o
JOIN public.installations i ON i.custom_id = o.installation_custom_id
WHERE o.left_at IS NOT NULL
  AND o.stage_key IS DISTINCT FROM o.next_stage
  AND COALESCE(i.is_subcontract, false) = false;

COMMENT ON VIEW public.v_stage_durations IS
    'Пройдені етапи об''єктів: коли зайшли, коли перейшли далі, скільки днів. Для аналітики «скільки триває етап».';

CREATE OR REPLACE VIEW public.v_object_launch
WITH (security_invoker = true) AS
SELECT e.installation_custom_id, min(e.created_at) AS launched_at
FROM public.workflow_events e
WHERE e.new_status = 'active'
  AND e.stage_key IN ('monitoring_setup', 'mon_launch_station')
GROUP BY e.installation_custom_id;

COMMENT ON VIEW public.v_object_launch IS 'Коли об''єкт уперше перейшов на етап «Запуск».';

GRANT SELECT ON public.v_stage_durations, public.v_object_launch TO anon, authenticated, service_role;
