-- =====================================================================
--  K-CORE · Один список етапів і статусів: прибирання старих написань
--
--  НАВІЩО: той самий етап зберігався по-різному. Наприклад, «Монтаж
--  конструкції» мав 34 записи «completed» і 25 «done», хоча це одне й те
--  саме «Виконано». Через це лічильники в різних місцях розходились.
--
--  Програма вже читає старі написання правильно (src/domain/stages.js),
--  тож цей файл не обов'язковий для роботи. Він просто приводить дані
--  до одного вигляду, щоб база й звіти бачили те саме, що інтерфейс.
--
--  Що змінюється (≈110 рядків):
--   • монтажні підетапи:  done → completed, in_progress → started,
--                         todo → waiting_start
--   • комплектація, ел. захист, техпроект, запуск:
--                         completed → done, not_started → todo
--   • старі ключі «proposal»/«project»: active → in_progress
--   • поточний етап об'єкта: commercial_proposal → proposal,
--                            installation_finish → installation, survey → tech_review
--
--  Дати «оновлено» НЕ змінюються: інакше всі ці об'єкти виглядали б
--  так, ніби над ними щойно працювали. Тому на час оновлення тригери
--  дат вимкнені (усе в одній транзакції — при помилці нічого не зміниться).
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  1. Статуси підетапів
-- ---------------------------------------------------------------------

ALTER TABLE project_stages DISABLE TRIGGER set_updated_at_stages;

UPDATE project_stages SET status = CASE status
         WHEN 'done'        THEN 'completed'
         WHEN 'in_progress' THEN 'started'
         WHEN 'todo'        THEN 'waiting_start'
         WHEN 'not_started' THEN 'waiting_start'
       END
 WHERE stage_key IN ('inst_structure', 'inst_panels', 'inst_cabling', 'inst_grounding', 'inst_inverter', 'installation')
   AND status IN ('done', 'in_progress', 'todo', 'not_started');

UPDATE project_stages SET status = CASE status
         WHEN 'completed'   THEN 'done'
         WHEN 'not_started' THEN 'todo'
       END
 WHERE stage_key IN ('complectation', 'comp_protection', 'tech_project', 'monitoring_setup', 'grid_connection', 'advance_payment')
   AND status IN ('completed', 'not_started');

UPDATE project_stages SET status = 'in_progress'
 WHERE stage_key IN ('proposal', 'project') AND status = 'active';

ALTER TABLE project_stages ENABLE TRIGGER set_updated_at_stages;


-- ---------------------------------------------------------------------
--  2. Поточний етап об'єкта
--     Користувацькі тригери вимкнені, щоб не змінились дати й бот не
--     перезаписував теми в Telegram через технічне перейменування.
-- ---------------------------------------------------------------------

ALTER TABLE installations DISABLE TRIGGER USER;

UPDATE installations SET workflow_stage = CASE workflow_stage
         WHEN 'commercial_proposal' THEN 'proposal'
         WHEN 'installation_finish' THEN 'installation'
         WHEN 'survey'              THEN 'tech_review'
       END
 WHERE workflow_stage IN ('commercial_proposal', 'installation_finish', 'survey');

ALTER TABLE installations ENABLE TRIGGER USER;

-- Нові об'єкти без явного етапу починаються із замірів, а не з невідомого «survey»
ALTER TABLE installations ALTER COLUMN workflow_stage SET DEFAULT 'tech_review';

COMMIT;


-- ---------------------------------------------------------------------
--  ПЕРЕВІРКА
-- ---------------------------------------------------------------------

-- 1) Монтажні підетапи: мають лишитись лише waiting_start / started / completed
SELECT stage_key, status, count(*)
FROM project_stages
WHERE stage_key LIKE 'inst_%'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 2) Старих назв етапу об'єкта більше немає (очікується 0)
SELECT count(*) AS old_stage_names
FROM installations
WHERE workflow_stage IN ('commercial_proposal', 'installation_finish', 'survey');
