-- =====================================================================
--  Звіт монтажника, версія 2 (рішення власника 18.11.2026)
--
--   • «Заземлення» більше не підетап монтажу (лише в коді: старі записи
--     project_stages лишаються як історія).
--   • Скільки зроблено: installer_reports.done_qty — { inst_structure: N
--     (на скільки панелей змонтовано конструкцію, необов'язково),
--     inst_panels: N (скільки панелей поставили сьогодні) }.
--     Усього панелей — зі специфікації (розділ «Сонячні панелі»), а якщо
--     її немає — installations.panels_total (бригадир вписує раз).
--     v_object_panels: усього / змонтовано за всіма звітами.
--   • Гроші від клієнта — кілька сум у різних валютах: money_lines =
--     [{ amount, currency }] (USD / UAH / EUR). money_amount і
--     money_currency — як і раніше перша сума (для старих екранів і бота).
--   • Платежі приймають євро: курс для євро — скільки валюти угоди за 1 €.
--   • Серійні номери (бажано інвертор і логер, можна більше) — serials =
--     [{ kind, value }]; зауваження клієнта — client_notes.
--   • Повідомлення менеджеру про звіт — з усіма сумами, панелями й
--     зауваженнями клієнта.
--
--  Копії до змін: backup.installer_reports_20261118
-- =====================================================================

create schema if not exists backup;
create table if not exists backup.installer_reports_20261118 as select * from public.installer_reports;

alter table public.installer_reports
    add column if not exists done_qty jsonb not null default '{}'::jsonb,
    add column if not exists money_lines jsonb,
    add column if not exists serials jsonb not null default '[]'::jsonb,
    add column if not exists client_notes text;

comment on column public.installer_reports.done_qty is 'Скільки зроблено за день: { inst_structure: панелей під конструкцію, inst_panels: панелей поставлено }';
comment on column public.installer_reports.money_lines is 'Гроші від клієнта: [{ amount, currency, payment_id? }] — кілька сум у різних валютах';
comment on column public.installer_reports.serials is 'Серійні номери: [{ kind: Інвертор/Логер/АКБ/Інше, value }]';
comment on column public.installer_reports.client_notes is 'Зауваження клієнта';

alter table public.installations
    add column if not exists panels_total integer check (panels_total is null or panels_total > 0);
comment on column public.installations.panels_total is 'Скільки панелей на об''єкті, якщо немає специфікації (вписує бригадир у звіті)';

-- Панелі об'єкта: усього (специфікація або вручну) і скільки вже змонтовано за звітами
create or replace view public.v_object_panels as
with recursive pc as (
    select id from categories where name = 'Сонячні панелі'
    union
    select c.id from categories c join pc on c.parent_id = pc.id
), spec as (
    select nd.installation_custom_id, sum(nd.required_quantity) as total
      from v_object_material_needs nd
      join nomenclature n on n.id = nd.nomenclature_id
     where n.category_id in (select id from pc)
     group by nd.installation_custom_id
), done as (
    select r.installation_custom_id, sum(nullif(r.done_qty ->> 'inst_panels', '')::numeric) as done
      from installer_reports r
     where r.submitted_at is not null
     group by r.installation_custom_id
)
select i.custom_id as installation_custom_id,
       spec.total as spec_total,
       i.panels_total as manual_total,
       coalesce(nullif(spec.total, 0), i.panels_total) as total,
       coalesce(done.done, 0) as done
  from installations i
  left join spec on spec.installation_custom_id = i.custom_id
  left join done on done.installation_custom_id = i.custom_id;

grant select on public.v_object_panels to authenticated, anon;

-- Платежі в євро: курс — скільки валюти угоди за 1 €
alter table public.payment_history drop constraint if exists payment_history_currency_check;
alter table public.payment_history
    add constraint payment_history_currency_check check (currency is null or currency = any (array['USD', 'UAH', 'EUR']));

create or replace function public.payment_history_prepare()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
    v_cur    text;
    v_client integer;
begin
    if NEW.installation_custom_id is null then
        NEW.currency := coalesce(NEW.currency, 'USD');
        NEW.amount_object := NEW.amount;
        return NEW;
    end if;

    select i.currency, c.id into v_cur, v_client
      from installations i left join clients c on c.custom_id = i.client_id
     where i.custom_id = NEW.installation_custom_id;
    v_cur := coalesce(v_cur, 'USD');
    NEW.currency := coalesce(NEW.currency, v_cur);
    NEW.client_id := coalesce(NEW.client_id, v_client);

    if NEW.currency = v_cur then
        NEW.amount_object := NEW.amount;
    elsif NEW.exchange_rate is null then
        raise exception '%', case
            when NEW.currency = 'EUR' then 'Платіж у євро: вкажіть курс — скільки ' || case v_cur when 'USD' then 'доларів' else 'гривень' end || ' за 1 €'
            else 'Угода в ' || case v_cur when 'USD' then 'доларах' else 'гривнях' end
                 || ', а платіж у ' || case NEW.currency when 'USD' then 'доларах' else 'гривнях' end
                 || ': вкажіть курс (гривень за 1 долар)' end
            using errcode = 'P0001';
    elsif NEW.currency = 'UAH' and v_cur = 'USD' then
        NEW.amount_object := round(NEW.amount / NEW.exchange_rate, 2);
    else
        -- USD → UAH: × грн за $; EUR → валюта угоди: × скільки валюти угоди за 1 €
        NEW.amount_object := round(NEW.amount * NEW.exchange_rate, 2);
    end if;
    return NEW;
end $function$;

-- Повідомлення про звіт: усі суми, панелі, зауваження клієнта
create or replace function public.notify_installer_report()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    v_inst   record;
    v_who    text;
    v_place  text;
    v_label  text;
    v_link   text;
    v_money  text;
    v_body   text;
    v_done   text;
    v_panels text;
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

    -- Усі суми: «12 000 ₴ + 300 €»
    select string_agg(
             replace(regexp_replace(trim(trailing '.' from trim(trailing '0' from round((l ->> 'amount')::numeric, 2)::text)),
                     '(\d)(?=(\d{3})+(\.|$))', '\1 ', 'g'), '.', ',') || ' ' ||
             case l ->> 'currency' when 'USD' then '$' when 'EUR' then '€' else '₴' end, ' + ')
      into v_money
      from jsonb_array_elements(coalesce(new.money_lines,
             case when new.money_amount is null then '[]'::jsonb
                  else jsonb_build_array(jsonb_build_object('amount', new.money_amount, 'currency', new.money_currency)) end)) l
     where nullif(l ->> 'amount', '')::numeric > 0;

    v_label := case
        when new.day_status is null or new.day_status = 'ok' then null
        when new.day_status = 'no_material' then 'бракує матеріалу'
        when new.day_status = 'weather' then 'погода'
        when new.day_status = 'client' then 'питання з клієнтом'
        else 'інше' end;

    if v_mgr and v_inst.responsible_emp_id is not null then
        select e.id into v_mgr_id from employees e
         where e.custom_id = v_inst.responsible_emp_id and e.access_blocked_at is null;
    end if;

    if v_money is not null then
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

        select case when nullif(new.done_qty ->> 'inst_panels', '')::numeric > 0
                    then 'панелей сьогодні ' || (new.done_qty ->> 'inst_panels')
                         || coalesce(' · усього ' || trim_scale(p.done)::text || ' з ' || trim_scale(p.total)::text, '')
               end
          into v_panels
          from v_object_panels p where p.installation_custom_id = new.installation_custom_id;

        v_body := coalesce(v_who, 'Бригада') || ' · ' || to_char(new.work_date, 'DD.MM')
               || ' · о ' || to_char(new.submitted_at at time zone 'Europe/Kyiv', 'HH24:MI')
               || coalesce(E'\n✅ ' || v_done, '')
               || coalesce(E'\n☀️ ' || v_panels, '')
               || coalesce(E'\n⚠️ ' || v_label, '')
               || coalesce(E'\n' || nullif(btrim(new.comment), ''), '')
               || coalesce(E'\n💬 Клієнт: ' || nullif(btrim(new.client_notes), ''), '')
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
