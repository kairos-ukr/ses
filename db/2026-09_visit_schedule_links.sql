-- =====================================================================
--  K-CORE · Графік виїздів: зв'язок план/факт + чернетка + історія
--
--  ПРОБЛЕМА: installation_workers (факт — хто фактично вийшов, редагується
--  в WorkCalendar.jsx) і installation_visit_plan (план виїзду, статуси
--  planned/moved/done/cancelled, редагується в PlannedVisitsPage.jsx) — це
--  дві повністю незалежні таблиці. Позначення виїзду "виконано" ніяк не
--  створює запис факту, і навпаки — адмін веде облік двічі вручну.
--
--  Крім того, день у графіку зберігався прямим delete+insert з клієнта
--  (два окремих HTTP-виклики, без транзакції) — якщо insert впаде після
--  delete, день лишається порожнім. Чернетки для незавершеного редагування
--  дня не було взагалі — незбережені зміни жили лише в React-стані.
--
--  ЩО РОБИМО:
--    1) installation_workers.visit_plan_id — трасування, з якого плану
--       взялась картка в графіку.
--    2) Унікальний індекс — той самий працівник не може двічі потрапити
--       на той самий реальний об'єкт того самого дня.
--    3) save_day_schedule(...) — одна транзакція замість delete+insert,
--       яка заодно автоматично закриває (status='done') план виїзду,
--       якщо збережена картка на нього посилається.
--    4) schedule_day_drafts — чернетка дня графіка (одна на дату).
--    5) v_employee_work_history — зведений потік подій (факт + план) по
--       employee_custom_id для нового фільтру історії супер-адміна.
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================


-- =====================================================================
--  БЛОК 1 · Зв'язок факт → план
-- =====================================================================

ALTER TABLE installation_workers
  ADD COLUMN IF NOT EXISTS visit_plan_id bigint REFERENCES installation_visit_plan(id);


-- =====================================================================
--  БЛОК 2 · Захист від дублю (той самий працівник двічі на об'єкт/день)
--  Custom-картки (installation_custom_id IS NULL) не чіпаємо — вони й
--  зараз групуються по notes, а не по об'єкту.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS installation_workers_unique_real
  ON installation_workers (installation_custom_id, employee_custom_id, work_date)
  WHERE installation_custom_id IS NOT NULL;


-- =====================================================================
--  БЛОК 3 · Атомарне збереження дня + автозакриття плану
-- =====================================================================

CREATE OR REPLACE FUNCTION save_day_schedule(p_work_date date, p_records jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM installation_workers WHERE work_date = p_work_date;

  INSERT INTO installation_workers
    (installation_custom_id, employee_custom_id, work_date, work_hours, notes, visit_plan_id)
  SELECT
    (r->>'installation_custom_id')::integer,
    (r->>'employee_custom_id')::integer,
    p_work_date,
    COALESCE((r->>'work_hours')::integer, 8),
    r->>'notes',
    (r->>'visit_plan_id')::bigint
  FROM jsonb_array_elements(p_records) AS r;

  UPDATE installation_visit_plan
  SET status = 'done', updated_at = now()
  WHERE status = 'planned'
    AND id IN (
      SELECT DISTINCT (r->>'visit_plan_id')::bigint
      FROM jsonb_array_elements(p_records) AS r
      WHERE r->>'visit_plan_id' IS NOT NULL
    );
END;
$$;


-- =====================================================================
--  БЛОК 4 · Чернетка дня графіка (одна на дату, останній редактор виграє)
-- =====================================================================

CREATE TABLE IF NOT EXISTS schedule_day_drafts (
  work_date date PRIMARY KEY,
  payload jsonb NOT NULL,
  updated_by_email text,
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
--  БЛОК 5 · Історія працівника (факт + план в одному потоці)
-- =====================================================================

CREATE OR REPLACE VIEW v_employee_work_history AS
SELECT
  iw.employee_custom_id,
  iw.work_date            AS event_date,
  iw.installation_custom_id,
  'actual'::text           AS source,
  NULL::text                AS status,
  iw.notes
FROM installation_workers iw
UNION ALL
SELECT
  e.custom_id              AS employee_custom_id,
  ivp.planned_date         AS event_date,
  ivp.installation_custom_id,
  'planned'::text          AS source,
  ivp.status,
  COALESCE(ivp.custom_task_title, ivp.comment) AS notes
FROM installation_visit_plan ivp
JOIN installation_visit_plan_employees ivpe ON ivpe.visit_plan_id = ivp.id
JOIN employees e ON e.id = ivpe.employee_id;
