-- =====================================================================
--  K-CORE · Звіти бригад: сповіщення і журнал
--
--  app_settings.report_reminders — перемикачі («Доступи» → Налаштування):
--    crew        — нагадувати бригаді, поки звіту немає (бот):
--                  first / second — о котрій (друге — null, якщо не треба),
--                  to — brigadier (бригадиру; немає бригадира — усім) або crew;
--    manager     — менеджеру об'єкта щойно звіт надіслано (база, одразу):
--                  що зроблено, проблеми, гроші, плани й потреби на завтра;
--    digest      — ввечері (digest_time) зведення «звіту немає»: кожному
--                  менеджеру — його об'єкти, а людям з digest_to — усе (бот).
--  Типово все увімкнено: 15:30 і 17:30 бригадиру, зведення о 19:00.
--
--  notify_installer_report: коли «менеджеру» увімкнено, відповідальний за
--  об'єкт отримує ОДНЕ повідомлення «Звіт: …» (з грошима й проблемою
--  всередині), а не три окремі. Решта (фінанси, бригадир) — як було.
--
--  Журнал змін: надісланий звіт і його правки (хто, коли, що змінив) —
--  installer_reports у change_log. Чернетки не пишемо.
--
--  Резервна копія: backup.app_settings_20261104. Попередня версія
--  notify_installer_report — у db/2026-10_montazh_reports.sql.
--  Таблиці не змінюються (крім рядка в app_settings). RLS не чіпаємо.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.app_settings_20261104 AS TABLE public.app_settings;

-- ---------------------------------------------------------------------
--  Перемикачі
-- ---------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('report_reminders',
        '{"crew": true, "first": "15:30", "second": "17:30", "to": "brigadier", "manager": true, "digest": true, "digest_time": "19:00", "digest_to": []}'::jsonb,
        now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.report_reminders_cfg()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
    SELECT '{"crew": true, "first": "15:30", "second": "17:30", "to": "brigadier", "manager": true, "digest": true, "digest_time": "19:00", "digest_to": []}'::jsonb
        || COALESCE((SELECT value FROM app_settings WHERE key = 'report_reminders'), '{}'::jsonb)
$$;

GRANT EXECUTE ON FUNCTION public.report_reminders_cfg() TO anon, authenticated;

-- ---------------------------------------------------------------------
--  Звіт надіслано → менеджеру об'єкта одним повідомленням
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_installer_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
    v_inst   record;
    v_who    text;
    v_place  text;
    v_label  text;
    v_link   text;
    v_money  text;
    v_body   text;
    v_done   text;
    v_mgr    boolean := coalesce((report_reminders_cfg() ->> 'manager')::boolean, true);
    v_mgr_id integer;
begin
    if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
        return new;
    end if;

    select i.custom_id, i.name, i.responsible_emp_id, i.brigadier_emp_id into v_inst
      from installations i where i.custom_id = new.installation_custom_id;
    select name into v_who from employees where id = new.author_id;
    v_place := coalesce(v_inst.name, 'обʼєкт') || ' #' || new.installation_custom_id;
    v_link  := '/project/' || new.installation_custom_id || '?tab=reports&r=' || new.id;
    v_money := case when new.money_amount is null then null else
        replace(regexp_replace(trim(trailing '.' from trim(trailing '0' from round(new.money_amount, 2)::text)),
                '(\d)(?=(\d{3})+(\.|$))', '\1 ', 'g'), '.', ',') || ' ' ||
        case new.money_currency when 'USD' then '$' else '₴' end end;
    v_label := case
        when new.day_status is null or new.day_status = 'ok' then null
        when new.day_status = 'no_material' then 'бракує матеріалу'
        when new.day_status = 'weather' then 'погода'
        when new.day_status = 'client' then 'питання з клієнтом'
        else 'інше' end;

    -- Менеджер об'єкта отримує все одним повідомленням — тоді окремі
    -- «гроші» й «проблема» йому вже не потрібні
    if v_mgr and v_inst.responsible_emp_id is not null then
        select e.id into v_mgr_id from employees e
         where e.custom_id = v_inst.responsible_emp_id and e.access_blocked_at is null;
    end if;

    if new.money_amount is not null then
        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        select e.id, 'report_money', new.id::text,
               'Монтажники отримали гроші: ' || v_money,
               v_place || ' · ' || coalesce(v_who, 'бригада') || ' · ' || to_char(new.work_date, 'DD.MM') ||
                 coalesce(E'\n' || nullif(btrim(new.money_note), ''), '') || E'\nПеревірте й внесіть у платежі.',
               v_link
          from employees e
         where e.access_blocked_at is null
           and (e.finance_access or e.custom_id = v_inst.responsible_emp_id)
           and e.id is distinct from v_mgr_id
        on conflict (employee_id, kind, ref_key) do nothing;
    end if;

    if v_label is not null then
        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        select e.id, 'report_problem', new.id::text,
               'Проблема на обʼєкті: ' || v_label,
               v_place || ' · ' || coalesce(v_who, 'бригада') ||
                 coalesce(E'\n' || nullif(btrim(new.comment), ''), ''),
               v_link
          from employees e
         where e.access_blocked_at is null
           and (e.finance_access
                or e.custom_id = v_inst.responsible_emp_id
                or e.custom_id = v_inst.brigadier_emp_id)
           and e.id is distinct from v_mgr_id
        on conflict (employee_id, kind, ref_key) do nothing;
    end if;

    if v_mgr_id is not null then
        select string_agg(case k
                   when 'inst_structure' then 'Конструкція'
                   when 'inst_panels' then 'Панелі'
                   when 'inst_cabling' then 'Траса DC'
                   when 'inst_grounding' then 'Заземлення'
                   when 'inst_inverter' then 'Інвертор'
                   else k end || case when v = 'completed' then ' ✓' else ' — в роботі' end, ', '
                   order by case k when 'inst_structure' then 1 when 'inst_panels' then 2 when 'inst_cabling' then 3
                                   when 'inst_grounding' then 4 when 'inst_inverter' then 5 else 9 end)
          into v_done
          from jsonb_each_text(coalesce(new.done_stages, '{}'::jsonb)) as s(k, v)
         where coalesce(v, '') <> '';

        v_body := coalesce(v_who, 'Бригада') || ' · ' || to_char(new.work_date, 'DD.MM')
               || ' · о ' || to_char(new.submitted_at at time zone 'Europe/Kyiv', 'HH24:MI')
               || coalesce(E'\n✅ ' || v_done, '')
               || coalesce(E'\n⚠️ ' || v_label, '')
               || coalesce(E'\n' || nullif(btrim(new.comment), ''), '')
               || coalesce(E'\n💵 Отримали від клієнта: ' || v_money, '')
               || coalesce(E'\n➡️ Завтра: ' || nullif(btrim(new.plan_tomorrow), ''), '')
               || coalesce(E'\n🧰 Потрібно: ' || nullif(btrim(new.need_tomorrow), ''), '')
               || case when coalesce(array_length(new.photos, 1), 0) > 0
                       then E'\n📷 Фото: ' || array_length(new.photos, 1) else '' end;

        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        values (v_mgr_id, 'report_submitted', new.id::text, 'Звіт: ' || v_place, v_body, v_link)
        on conflict (employee_id, kind, ref_key) do nothing;
    end if;

    return new;
exception when others then
    return new;
end $function$;

-- ---------------------------------------------------------------------
--  Журнал змін: надісланий звіт і його правки
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_log_installer_reports ON public.installer_reports;
CREATE TRIGGER trg_log_installer_reports
    AFTER INSERT OR UPDATE ON public.installer_reports
    FOR EACH ROW WHEN (NEW.submitted_at IS NOT NULL)
    EXECUTE FUNCTION log_changes('submitted_at', 'work_date', 'installation_custom_id', 'crew', 'done_stages',
                                 'day_status', 'comment', 'plan_tomorrow', 'need_tomorrow', 'money_amount', 'money_currency');

DROP TRIGGER IF EXISTS trg_log_installer_reports_del ON public.installer_reports;
CREATE TRIGGER trg_log_installer_reports_del
    AFTER DELETE ON public.installer_reports
    FOR EACH ROW WHEN (OLD.submitted_at IS NOT NULL)
    EXECUTE FUNCTION log_changes('submitted_at', 'work_date', 'installation_custom_id', 'crew', 'done_stages',
                                 'day_status', 'comment', 'plan_tomorrow', 'need_tomorrow', 'money_amount', 'money_currency');
