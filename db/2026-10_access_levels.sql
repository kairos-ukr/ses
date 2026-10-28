-- =====================================================================
--  K-CORE · Рівневі доступи
--
--  access_templates — шаблони доступу (Директор, Адміністратор, Офіс,
--  Менеджер продажів, Проєктант, Закупівлі, Бухгалтер, Маркетинг,
--  Комірник, Бригадир, Монтажник). perms — по кожному розділу:
--  { view, add, edit, delete, all } (all — усі записи, інакше лише свої).
--
--  employees.access_template     — шаблон людини (порожньо — за роллю:
--                                  адміністратор → «Адміністратор»,
--                                  офіс → «Офіс», монтажник → «Монтажник»);
--  employees.access_overrides    — особисті відхилення по розділах;
--  employees.access_unrestricted — «без обмежень»: усе відкрито.
--
--  Щоб після оновлення ніхто нічого не втратив: хто мав «фінанси компанії»
--  (finance_access), отримує «без обмежень» — це той самий набір прав.
--  Опис розділів — src/domain/access.js.
--
--  Резервна копія: backup.employees_20261021. RLS не вмикаємо.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.employees_20261021 AS TABLE public.employees;

CREATE TABLE IF NOT EXISTS public.access_templates (
    key         text PRIMARY KEY,
    name        text NOT NULL,
    app         text NOT NULL DEFAULT 'crm' CHECK (app IN ('crm', 'montazh')),
    perms       jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort        integer NOT NULL DEFAULT 100,
    builtin     boolean NOT NULL DEFAULT false,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    updated_by  integer
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_templates TO anon, authenticated;

ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS access_template     text,
    ADD COLUMN IF NOT EXISTS access_overrides    jsonb   NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS access_unrestricted boolean NOT NULL DEFAULT false;

INSERT INTO public.access_templates (key, name, app, perms, sort, builtin) VALUES
    ('director', 'Директор', 'crm', '{"today":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"leads":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"clients":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"offers":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"objects":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"money":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"payments":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"profit":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"analytics":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"provisioning":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"stock":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"purchases":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"price":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"team":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"schedule":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"fleet":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"timeoff":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"documents":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"partners":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"settings":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"access":{"view":true,"add":true,"edit":true,"delete":true,"all":true}}'::jsonb, 10, true),
    ('admin', 'Адміністратор', 'crm', '{"today":{"view":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"leads":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"clients":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"objects":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"money":{"view":true,"all":false},"payments":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"provisioning":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"stock":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"purchases":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"price":{"view":true,"edit":true,"all":true},"team":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"schedule":{"view":true,"edit":true,"all":true},"fleet":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"timeoff":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"documents":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"partners":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"settings":{"view":true,"edit":true,"all":true},"access":{"view":true,"edit":true,"all":true}}'::jsonb, 20, true),
    ('office', 'Офіс', 'crm', '{"today":{"view":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"leads":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"clients":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"objects":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"money":{"view":true,"all":false},"payments":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"provisioning":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"stock":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"purchases":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"price":{"view":true,"edit":true,"all":true},"team":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"schedule":{"view":true,"edit":true,"all":true},"fleet":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"timeoff":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"documents":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"partners":{"view":true,"add":true,"edit":true,"delete":true,"all":true}}'::jsonb, 30, true),
    ('sales', 'Менеджер продажів', 'crm', '{"today":{"view":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"all":true},"leads":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"clients":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"offers":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"objects":{"view":true,"add":true,"edit":true,"all":true},"money":{"view":true,"all":false},"payments":{"view":true,"add":true},"provisioning":{"view":true,"all":true},"stock":{"view":true,"all":true},"price":{"view":true,"all":true},"team":{"view":true,"all":true},"schedule":{"view":true,"all":true},"timeoff":{"view":true,"all":true},"documents":{"view":true,"add":true,"edit":true,"all":true},"partners":{"view":true,"all":true}}'::jsonb, 40, true),
    ('designer', 'Проєктант', 'crm', '{"today":{"view":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"all":true},"clients":{"view":true,"all":true},"offers":{"view":true,"all":true},"objects":{"view":true,"edit":true,"all":true},"provisioning":{"view":true,"add":true,"edit":true,"all":true},"stock":{"view":true,"all":true},"purchases":{"view":true,"all":true},"price":{"view":true,"all":true},"team":{"view":true,"all":true},"schedule":{"view":true,"all":true},"timeoff":{"view":true,"all":true},"documents":{"view":true,"add":true,"edit":true,"all":true},"partners":{"view":true,"all":true}}'::jsonb, 50, true),
    ('procurement', 'Закупівлі', 'crm', '{"today":{"view":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"all":true},"clients":{"view":true,"all":true},"objects":{"view":true,"all":true},"provisioning":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"stock":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"purchases":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"price":{"view":true,"all":true},"team":{"view":true,"all":true},"schedule":{"view":true,"all":true},"fleet":{"view":true,"all":true},"timeoff":{"view":true,"all":true},"documents":{"view":true,"add":true,"edit":true,"all":true},"partners":{"view":true,"all":true}}'::jsonb, 60, true),
    ('accountant', 'Бухгалтер', 'crm', '{"today":{"view":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"all":true},"clients":{"view":true,"all":true},"objects":{"view":true,"all":true},"money":{"view":true,"all":true},"payments":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"team":{"view":true,"all":true},"timeoff":{"view":true,"all":true},"documents":{"view":true,"add":true,"edit":true,"all":true}}'::jsonb, 70, true),
    ('marketing', 'Маркетинг', 'crm', '{"today":{"view":true,"all":true},"tasks":{"view":true,"add":true,"edit":true,"all":true},"leads":{"view":true,"add":true,"edit":true,"delete":true,"all":true},"clients":{"view":true,"all":true},"documents":{"view":true,"all":true}}'::jsonb, 80, true),
    ('storekeeper', 'Комірник', 'crm', '{"tasks":{"view":true,"add":true,"edit":true,"all":true},"provisioning":{"view":true,"all":true},"stock":{"view":true,"add":true,"edit":true,"all":true},"purchases":{"view":true,"add":true,"edit":true,"all":true},"timeoff":{"view":true,"all":true},"documents":{"view":true,"all":true}}'::jsonb, 90, true),
    ('brigadier', 'Бригадир', 'montazh', '{}'::jsonb, 100, true),
    ('installer', 'Монтажник', 'montazh', '{}'::jsonb, 110, true)
ON CONFLICT (key) DO NOTHING;

UPDATE public.employees SET access_unrestricted = true WHERE finance_access = true;
