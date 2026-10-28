-- =====================================================================
--  K-CORE · Монтаж: денний звіт бригади (18.10.2026, етап 2)
--
--  Один звіт на об'єкт за день (installation_custom_id + work_date).
--  Здає бригадир за всю бригаду; хто з бригади хоче — додає свої фото
--  чи коментар (installer_report_addons). Рядок звіту створюється при
--  першому дотику (чернетка, submitted_at = null), надсилається одним
--  натиском — тоді офіс його бачить, а бот публікує в гілці об'єкта.
--
--  Що в звіті:
--   • підетапи монтажу, які зроблено (самі етапи оновлює програма через
--     update_workflow_stage — так, як і з CRM);
--   • фото (Google Диск, папка об'єкта), коментар, «як пройшов день»;
--   • що використано (installer_report_usage) — склад вдруге не списує:
--     матеріал уже видано на об'єкт, звіт лише фіксує, скільки пішло;
--   • гроші, отримані від клієнта на об'єкті, — офіс підтверджує їх
--     у платежі (money_payment_id). У Telegram сума не йде;
--   • плани й потреби на завтра (поки текстом; список зі складу — етап 3).
--
--  v_object_site_stock — що лежить на об'єкті: видано зі складу (як у
--  «Забезпеченні»: видача, продаж, передача партнеру мінус повернення)
--  мінус використане за звітами.
--
--  Повідомлення в дзвіночок: гроші від клієнта — адміністраторам;
--  проблемний день — відповідальному за об'єкт і адміністраторам.
--  Кому саме — налаштування з'являться на етапі 3.
-- =====================================================================

create table if not exists public.installer_reports (
  id                     bigserial primary key,
  installation_custom_id integer not null,
  work_date              date not null,
  author_id              integer references public.employees(id) on delete set null,  -- хто надіслав
  crew                   integer[] not null default '{}',   -- employees.custom_id з графіка
  done_stages            jsonb not null default '{}',       -- {stage_key: статус}, позначене у звіті
  comment                text,
  day_status             text check (day_status in ('ok', 'no_material', 'weather', 'client', 'other')),
  plan_tomorrow          text,
  need_tomorrow          text,
  photos                 text[] not null default '{}',
  photo_file_ids         text[] not null default '{}',
  money_amount           numeric check (money_amount is null or money_amount > 0),
  money_currency         text check (money_currency in ('UAH', 'USD')),
  money_note             text,
  money_payment_id       integer references public.payment_history(id) on delete set null,
  submitted_at           timestamptz,
  telegram_sent          boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (installation_custom_id, work_date)
);

create index if not exists installer_reports_date_idx on public.installer_reports (work_date desc);
create index if not exists installer_reports_unsent_idx on public.installer_reports (id)
  where submitted_at is not null and telegram_sent = false;

create table if not exists public.installer_report_addons (
  id              bigserial primary key,
  report_id       bigint not null references public.installer_reports(id) on delete cascade,
  author_id       integer references public.employees(id) on delete set null,
  text            text,
  photos          text[] not null default '{}',
  photo_file_ids  text[] not null default '{}',
  telegram_sent   boolean not null default false,
  created_at      timestamptz not null default now(),
  check (length(btrim(coalesce(text, ''))) > 0 or cardinality(photos) > 0)
);
create index if not exists installer_report_addons_report_idx on public.installer_report_addons (report_id);

create table if not exists public.installer_report_usage (
  id               bigserial primary key,
  report_id        bigint not null references public.installer_reports(id) on delete cascade,
  nomenclature_id  bigint references public.nomenclature(id) on delete set null,
  name             text not null check (length(btrim(name)) > 0),
  quantity         numeric not null check (quantity > 0),
  unit             text,
  created_at       timestamptz not null default now()
);
create index if not exists installer_report_usage_report_idx on public.installer_report_usage (report_id);

-- updated_at
create or replace function public.installer_reports_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_installer_reports_touch on public.installer_reports;
create trigger trg_installer_reports_touch
  before update on public.installer_reports
  for each row execute function public.installer_reports_touch();

-- Що лежить на об'єкті: видано мінус використано за звітами
create or replace view public.v_object_site_stock
with (security_invoker = true) as
with issued as (
  select m.installation_custom_id, m.nomenclature_id,
         sum(case when m.operation_type in ('issue', 'sale', 'partner_transfer') then m.quantity
                  when m.operation_type = 'return' then -m.quantity else 0 end) as issued_quantity
    from public.stock_movements m
   where m.installation_custom_id is not null
     and m.operation_type in ('issue', 'sale', 'partner_transfer', 'return')
   group by 1, 2
), used as (
  select r.installation_custom_id, u.nomenclature_id, sum(u.quantity) as used_quantity
    from public.installer_report_usage u
    join public.installer_reports r on r.id = u.report_id
   where r.submitted_at is not null and u.nomenclature_id is not null
   group by 1, 2
)
select coalesce(i.installation_custom_id, u.installation_custom_id) as installation_custom_id,
       coalesce(i.nomenclature_id, u.nomenclature_id) as nomenclature_id,
       n.name as nomenclature_name,
       coalesce(un.code, un.name) as unit,
       coalesce(i.issued_quantity, 0) as issued_quantity,
       coalesce(u.used_quantity, 0) as used_quantity,
       coalesce(i.issued_quantity, 0) - coalesce(u.used_quantity, 0) as on_site_quantity
  from issued i
  full join used u on u.installation_custom_id = i.installation_custom_id and u.nomenclature_id = i.nomenclature_id
  left join public.nomenclature n on n.id = coalesce(i.nomenclature_id, u.nomenclature_id)
  left join public.units un on un.id = n.unit_id;

-- Дзвіночок: гроші від клієнта і проблемний день
create or replace function public.notify_installer_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_inst  record;
    v_who   text;
    v_place text;
    v_label text;
begin
    if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
        return new;
    end if;

    select i.custom_id, i.name, i.responsible_emp_id into v_inst
      from installations i where i.custom_id = new.installation_custom_id;
    select name into v_who from employees where id = new.author_id;
    v_place := coalesce(v_inst.name, 'обʼєкт') || ' #' || new.installation_custom_id;

    if new.money_amount is not null then
        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        select e.id, 'report_money', new.id::text,
               'Монтажники отримали гроші: ' ||
                 replace(regexp_replace(trim(trailing '.' from trim(trailing '0' from round(new.money_amount, 2)::text)),
                         '(\d)(?=(\d{3})+(\.|$))', '\1 ', 'g'), '.', ',') || ' ' ||
                 case new.money_currency when 'USD' then '$' else '₴' end,
               v_place || ' · ' || coalesce(v_who, 'бригада') || ' · ' || to_char(new.work_date, 'DD.MM') ||
                 coalesce(E'\n' || nullif(btrim(new.money_note), ''), '') || E'\nПеревірте й внесіть у платежі.',
               '/brigade-reports?r=' || new.id
          from employees e
         where e.role = 'super_admin' and e.access_blocked_at is null
        on conflict (employee_id, kind, ref_key) do nothing;
    end if;

    if new.day_status is not null and new.day_status <> 'ok' then
        v_label := case new.day_status
            when 'no_material' then 'бракує матеріалу'
            when 'weather' then 'погода'
            when 'client' then 'питання з клієнтом'
            else 'інше' end;
        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        select e.id, 'report_problem', new.id::text,
               'Проблема на обʼєкті: ' || v_label,
               v_place || ' · ' || coalesce(v_who, 'бригада') ||
                 coalesce(E'\n' || nullif(btrim(new.comment), ''), ''),
               '/brigade-reports?r=' || new.id
          from employees e
         where e.access_blocked_at is null
           and (e.role = 'super_admin' or e.custom_id = v_inst.responsible_emp_id)
        on conflict (employee_id, kind, ref_key) do nothing;
    end if;

    return new;
exception when others then
    return new;   -- повідомлення не повинно ламати збереження звіту
end $$;

drop trigger if exists trg_notify_installer_report on public.installer_reports;
create trigger trg_notify_installer_report
  after insert or update of submitted_at on public.installer_reports
  for each row execute function public.notify_installer_report();

-- Офіс бачить звіти наживо
do $$ begin
  begin alter publication supabase_realtime add table public.installer_reports; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.installer_report_addons; exception when duplicate_object then null; end;
end $$;
