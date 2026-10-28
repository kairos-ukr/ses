-- =====================================================================
--  K-CORE · Заявки з сайту → «Ліди», «Взяти в роботу», файли ліда
--
--  1. Заявка з форми сайту (Contact Form 7 → плагін «CF7 to Webhook»)
--     приходить у функцію site-lead (supabase/functions/site-lead), а та
--     викликає site_lead_intake(ключ, дані):
--       • ключ звіряється з integration_keys ('site_leads');
--       • без нормального телефону (менше 9 цифр) — не приймаємо (спам);
--       • такий телефон уже є серед активних лідів — новий не створюємо,
--         а дописуємо в нотатки «Повторна заявка з сайту …»;
--       • інакше — новий лід: джерело «Заявка з сайту», без відповідального
--         (його бачать усі), зв'язатись — сьогодні.
--     Сповіщення (дзвіночок, пуш, Telegram) — тим, у кого в картці
--     працівника відмічено «Нові заявки з сайту» (notification_subscriptions,
--     тема site_leads). Про повторну заявку на лід, який уже хтось веде, —
--     лише йому.
--
--  2. leads.taken_at / taken_by — хто і коли взяв лід у роботу.
--     leads.site_info — з якої форми, сторінки й реклами прийшла заявка.
--
--  3. Файли ліда лежать на Google Диску в папці «Ліди / Лід #12 …» —
--     це робить сервер документів (doc-server), база для цього не
--     змінюється: папка записується в drive_folders з ключем 'lead-12'.
--
--  Резервні копії: backup.leads_20261028, backup.notification_subscriptions_20261028.
--  RLS на наявних таблицях не вмикаємо; integration_keys — закрита
--  (RLS без правил і без прав для anon/authenticated): ключ бачить лише сервер.
--
--  Застосовувати в Supabase → SQL Editor, цілим файлом.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.leads_20261028 AS TABLE public.leads;
CREATE TABLE IF NOT EXISTS backup.notification_subscriptions_20261028 AS TABLE public.notification_subscriptions;

BEGIN;

-- ---------------------------------------------------------------------
--  Ліди: хто взяв у роботу і звідки з сайту
-- ---------------------------------------------------------------------

ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS taken_at  timestamptz,
    ADD COLUMN IF NOT EXISTS taken_by  integer,
    ADD COLUMN IF NOT EXISTS site_info jsonb;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_taken_by_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_taken_by_fkey
    FOREIGN KEY (taken_by) REFERENCES public.employees(custom_id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leads.taken_at IS 'Коли лід узяли в роботу (кнопка «Взяти в роботу» або перше призначення відповідального).';
COMMENT ON COLUMN public.leads.taken_by IS 'Хто взяв у роботу (employees.custom_id).';
COMMENT ON COLUMN public.leads.site_info IS 'Заявка з сайту: form, page, url, utm, received_at, repeats, last_at.';

-- ---------------------------------------------------------------------
--  Нова тема особистих сповіщень: «Нові заявки з сайту»
-- ---------------------------------------------------------------------

ALTER TABLE public.notification_subscriptions DROP CONSTRAINT IF EXISTS notification_subscriptions_topic_check;
ALTER TABLE public.notification_subscriptions ADD CONSTRAINT notification_subscriptions_topic_check
    CHECK (topic IN ('low_stock', 'system', 'site_leads'));

-- ---------------------------------------------------------------------
--  Ключ, з яким сайт надсилає заявки (видно лише серверу)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.integration_keys (
    name        text PRIMARY KEY,
    secret      text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integration_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_keys FROM anon, authenticated;

INSERT INTO public.integration_keys (name, secret)
VALUES ('site_leads', replace(gen_random_uuid()::text, '-', ''))
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------
--  Сповіщення про заявку з сайту
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.site_lead_notify(p_lead_id bigint, p_repeat boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    l  leads%ROWTYPE;
BEGIN
    SELECT * INTO l FROM leads WHERE id = p_lead_id;
    IF NOT FOUND THEN RETURN; END IF;

    INSERT INTO app_notifications (employee_id, kind, ref_key, title, body, link)
    SELECT e.id, 'site_lead',
           l.id::text || CASE WHEN p_repeat THEN ':' || COALESCE(l.site_info->>'repeats', '1') ELSE '' END,
           CASE WHEN p_repeat THEN 'Повторна заявка з сайту' ELSE 'Нова заявка з сайту' END,
           concat_ws(E'\n', concat_ws(' · ', l.contact_name, l.phone), l.request),
           '/leads?lead=' || l.id
    FROM employees e
    WHERE e.access_blocked_at IS NULL
      AND CASE
            -- лід уже хтось веде — про повторну заявку тільки йому
            WHEN p_repeat AND l.responsible_emp_id IS NOT NULL THEN e.custom_id = l.responsible_emp_id
            ELSE e.id IN (SELECT employee_id FROM notification_subscriptions WHERE topic = 'site_leads')
          END
    ON CONFLICT (employee_id, kind, ref_key) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'site_lead_notify(%): %', p_lead_id, SQLERRM;   -- сповіщення ніколи не заважає прийняти заявку
END $$;

-- ---------------------------------------------------------------------
--  Прийом заявки з сайту
--  p_data: { name, phone, form, page, url, utm: {...} } або { check: true }
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.site_lead_intake(p_key text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_name    text := left(btrim(COALESCE(p_data->>'name', '')), 120);
    v_phone   text := left(btrim(COALESCE(p_data->>'phone', '')), 40);
    v_digits  text := right(regexp_replace(COALESCE(p_data->>'phone', ''), '\D', '', 'g'), 9);
    v_form    text := NULLIF(left(btrim(COALESCE(p_data->>'form', '')), 120), '');
    v_page    text := NULLIF(left(btrim(COALESCE(p_data->>'page', '')), 120), '');
    v_today   date := (now() AT TIME ZONE 'Europe/Kyiv')::date;
    v_when    text := to_char(now() AT TIME ZONE 'Europe/Kyiv', 'DD.MM о HH24:MI');
    v_request text;
    v_info    jsonb;
    l         leads%ROWTYPE;
    v_id      bigint;
BEGIN
    IF p_key IS NULL OR NOT EXISTS (SELECT 1 FROM integration_keys WHERE name = 'site_leads' AND secret = p_key) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'key');
    END IF;
    IF (p_data->>'check') = 'true' THEN
        RETURN jsonb_build_object('ok', true, 'check', true);
    END IF;
    IF length(v_digits) < 9 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'phone');
    END IF;

    v_request := NULLIF(concat_ws(' · ', v_form, 'сторінка «' || v_page || '»'), '');
    v_info := jsonb_strip_nulls(jsonb_build_object(
        'form', v_form,
        'page', v_page,
        'url', NULLIF(left(COALESCE(p_data->>'url', ''), 500), ''),
        'utm', CASE WHEN jsonb_typeof(p_data->'utm') = 'object' AND p_data->'utm' <> '{}'::jsonb THEN p_data->'utm' END,
        'received_at', now()
    ));

    -- Та сама людина вже є серед активних лідів — не дублюємо, а дописуємо
    SELECT * INTO l FROM leads
    WHERE status IN ('new', 'contacted', 'measure')
      AND right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 9) = v_digits
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        UPDATE leads SET
            contact_name = CASE WHEN contact_name = 'Заявка з сайту' AND v_name <> '' THEN v_name ELSE contact_name END,
            notes = concat_ws(E'\n', NULLIF(notes, ''), 'Повторна заявка з сайту ' || v_when || COALESCE(': ' || v_request, '')),
            next_action_at = LEAST(COALESCE(next_action_at, v_today), v_today),
            site_info = COALESCE(site_info, '{}'::jsonb)
                || jsonb_build_object('repeats', COALESCE((site_info->>'repeats')::int, 0) + 1, 'last_at', now())
        WHERE id = l.id;
        PERFORM site_lead_notify(l.id, true);
        RETURN jsonb_build_object('ok', true, 'lead_id', l.id, 'repeat', true);
    END IF;

    INSERT INTO leads (contact_name, phone, source, request, status, first_contact_at, next_action_at, site_info)
    VALUES (COALESCE(NULLIF(v_name, ''), 'Заявка з сайту'), v_phone, 'site', v_request, 'new', v_today, v_today, v_info)
    RETURNING id INTO v_id;

    PERFORM site_lead_notify(v_id, false);
    RETURN jsonb_build_object('ok', true, 'lead_id', v_id);
END $$;

COMMENT ON FUNCTION public.site_lead_intake(text, jsonb) IS
    'Заявка з форми сайту → лід (або дописка до активного ліда з тим самим телефоном). Викликає лише функція site-lead.';

REVOKE ALL ON FUNCTION public.site_lead_intake(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_lead_notify(bigint, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_lead_intake(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.site_lead_notify(bigint, boolean) TO service_role;

COMMIT;

-- =====================================================================
--  Перевірка
-- =====================================================================
-- Ключ для адреси на сайті:
--   SELECT secret FROM integration_keys WHERE name = 'site_leads';
--
-- Пробний прийом без сліду (усе відкочується):
--   DO $$
--   DECLARE r jsonb; k text;
--   BEGIN
--       SELECT secret INTO k FROM integration_keys WHERE name = 'site_leads';
--       r := site_lead_intake('wrong', '{}'::jsonb);                       ASSERT r->>'error' = 'key';
--       r := site_lead_intake(k, '{"name":"Тест","phone":"12"}');          ASSERT r->>'error' = 'phone';
--       r := site_lead_intake(k, '{"name":"Тест","phone":"+380 99 000 00 01","form":"Замовити дзвінок","page":"Кондиціонери"}');
--       ASSERT (r->>'ok')::boolean AND r->>'repeat' IS NULL;
--       r := site_lead_intake(k, '{"name":"Тест","phone":"0990000001"}');  ASSERT (r->>'repeat')::boolean;
--       RAISE EXCEPTION 'OK — перевірку пройдено, усе відкочено: %', r;
--   END $$;
--
-- Заявки з сайту:
--   SELECT id, contact_name, phone, request, responsible_emp_id, taken_at, site_info FROM leads WHERE source = 'site' ORDER BY id DESC;
