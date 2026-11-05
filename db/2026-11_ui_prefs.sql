-- =====================================================================
--  K-CORE · Особисті налаштування вигляду
--
--  employees.ui_prefs — що людина вибрала для себе на екранах, щоб на
--  телефоні й комп'ютері було однаково. Зараз:
--    today — «Сьогодні»: які нагадування показувати (гроші, без руху,
--            задачі, ліди, забезпечення), поріг «без руху» в днях і
--            рядки, які людина сховала (до дати або назавжди).
--
--  Резервна копія: backup.employees_20261102. RLS не вмикаємо.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.employees_20261102 AS TABLE public.employees;

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
