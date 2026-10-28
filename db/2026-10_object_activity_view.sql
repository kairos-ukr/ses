-- =====================================================================
--  K-CORE · Скільки об'єкт стоїть на етапі і коли з ним щось було
--
--  Для воронки об'єктів, «Сьогодні» і картки об'єкта:
--   • stage_entered_at  — коли об'єкт перейшов на поточний макроетап
--     (подія «Changed active stage» у workflow_events; для першого етапу
--     або старих записів без такої події — дата створення об'єкта);
--   • last_activity_at  — остання дія по об'єкту: зміна етапу чи
--     підетапу, платіж, коментар, нове КП.
--
--  Лише перегляд (view): нових колонок і тригерів немає, нічого не
--  змінюється в даних. security_invoker — права як у того, хто читає.
-- =====================================================================

CREATE OR REPLACE VIEW public.v_object_activity
WITH (security_invoker = true) AS
SELECT
    i.custom_id AS installation_custom_id,
    COALESCE(st.entered_at, i.created_at::timestamptz) AS stage_entered_at,
    GREATEST(
        i.created_at::timestamptz,
        ev.last_event_at,
        pay.last_payment_at,
        note.last_note_at,
        co.last_offer_at
    ) AS last_activity_at
FROM installations i
LEFT JOIN LATERAL (
    SELECT max(e.created_at) AS entered_at
    FROM workflow_events e
    WHERE e.installation_custom_id = i.custom_id
      AND e.new_status = 'active'
      AND e.stage_key = i.workflow_stage
) st ON true
LEFT JOIN LATERAL (
    SELECT max(e.created_at) AS last_event_at
    FROM workflow_events e
    WHERE e.installation_custom_id = i.custom_id
) ev ON true
LEFT JOIN LATERAL (
    SELECT max(p.created_at)::timestamptz AS last_payment_at
    FROM payment_history p
    WHERE p.installation_custom_id = i.custom_id
) pay ON true
LEFT JOIN LATERAL (
    SELECT max(a.created_at) AS last_note_at
    FROM project_additional_info a
    WHERE a.installation_custom_id = i.custom_id
) note ON true
LEFT JOIN LATERAL (
    SELECT max(c.created_at) AS last_offer_at
    FROM commercial_offers c
    WHERE c.installation_custom_id = i.custom_id
) co ON true;

COMMENT ON VIEW public.v_object_activity IS
    'Скільки об''єкт стоїть на поточному етапі (stage_entered_at) і коли з ним була остання дія (last_activity_at). Для воронки, «Сьогодні», картки об''єкта.';

GRANT SELECT ON public.v_object_activity TO anon, authenticated, service_role;

-- Щоб перегляд рахувався швидко (по об'єкту — лише його рядки)
CREATE INDEX IF NOT EXISTS workflow_events_installation_idx ON public.workflow_events (installation_custom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS project_additional_info_installation_idx ON public.project_additional_info (installation_custom_id, created_at DESC);
