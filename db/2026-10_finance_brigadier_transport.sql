-- =====================================================================
--  K-CORE · Фінанси лише для певних людей, бригадир об'єкта, транспорт
--  (19.10.2026)
--
--  1. employees.finance_access — «бачить фінанси компанії»: загальну
--     дебіторку, оборот, аналітику, платежі всіх об'єктів. Решта бачить
--     гроші лише по об'єктах, де вона відповідальний менеджер.
--     Типово ввімкнено тільки власнику; іншим вмикає він у «Доступах».
--
--  2. installations.brigadier_emp_id — відповідальний бригадир об'єкта
--     (поруч із відповідальним менеджером responsible_emp_id). Обидва —
--     employees.custom_id, як і в графіку.
--
--  3. Транспорт:
--     • vehicles — авто компанії (бус, вантажна, легкова…), стан
--       (на ходу / у ремонті до дати / не використовується), водій за
--       замовчуванням;
--     • employee_cars — власне авто працівника: є / у ремонті до / немає
--       (ставить сам монтажник у «Монтажі → Я», або офіс);
--     • trips — рейс на день: яке авто (або власне авто людини), водій,
--       хто їде; trip_stops — зупинки по порядку: об'єкт або адреса
--       (склад, постачальник), навіщо (доставка, забрати, монтаж,
--       сервіс, інше), прив'язаний документ видачі чи задача.
--       Так один бус за день робить доставку на кілька об'єктів.
--
--  4. Сповіщення зі звіту монтажу: про гроші — тим, хто бачить фінанси,
--     і відповідальному менеджеру; про проблему — менеджеру, бригадиру
--     і тим, хто бачить фінанси. Посилання — у картку об'єкта, вкладка
--     «Звіти монтажу» (окремої сторінки звітів більше немає).
-- =====================================================================

-- 1. Хто бачить фінанси компанії
alter table public.employees add column if not exists finance_access boolean not null default false;
update public.employees set finance_access = true where id = 74;   -- власник (Ковальчук Олексій)

-- 2. Бригадир об'єкта
alter table public.installations add column if not exists brigadier_emp_id integer;

-- 3. Транспорт
create or replace function public.transport_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create table if not exists public.vehicles (
  id                        bigserial primary key,
  name                      text not null check (length(btrim(name)) > 0),
  plate                     text,
  kind                      text not null default 'bus' check (kind in ('bus', 'van', 'car', 'truck', 'other')),
  status                    text not null default 'active' check (status in ('active', 'repair', 'inactive')),
  repair_until              date,
  default_driver_custom_id  integer,
  notes                     text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
drop trigger if exists trg_vehicles_touch on public.vehicles;
create trigger trg_vehicles_touch before update on public.vehicles
  for each row execute function public.transport_touch();

create table if not exists public.employee_cars (
  employee_id  integer primary key references public.employees(id) on delete cascade,
  status       text not null default 'none' check (status in ('own', 'repair', 'none')),
  until        date,
  note         text,
  updated_at   timestamptz not null default now()
);
drop trigger if exists trg_employee_cars_touch on public.employee_cars;
create trigger trg_employee_cars_touch before update on public.employee_cars
  for each row execute function public.transport_touch();

create table if not exists public.trips (
  id                 bigserial primary key,
  trip_date          date not null,
  vehicle_id         bigint references public.vehicles(id) on delete set null,
  own_car_custom_id  integer,              -- їде власним авто цього працівника
  driver_custom_id   integer,
  crew               integer[] not null default '{}',
  title              text,
  notes              text,
  status             text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  created_by         integer references public.employees(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists trips_date_idx on public.trips (trip_date);
drop trigger if exists trg_trips_touch on public.trips;
create trigger trg_trips_touch before update on public.trips
  for each row execute function public.transport_touch();

create table if not exists public.trip_stops (
  id                      bigserial primary key,
  trip_id                 bigint not null references public.trips(id) on delete cascade,
  position                integer not null default 0,
  installation_custom_id  integer,
  place                   text,
  purpose                 text not null default 'delivery' check (purpose in ('delivery', 'pickup', 'install', 'service', 'other')),
  note                    text,
  issue_order_id          bigint references public.issue_orders(id) on delete set null,
  microtask_id            text,
  done_at                 timestamptz,
  created_at              timestamptz not null default now(),
  check (installation_custom_id is not null or length(btrim(coalesce(place, ''))) > 0)
);
create index if not exists trip_stops_trip_idx on public.trip_stops (trip_id, position);

-- Наживо: календар, «Транспорт» і «Монтаж» бачать зміни одразу
do $$ begin
  begin alter publication supabase_realtime add table public.trips; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.trip_stops; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.employee_cars; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.vehicles; exception when duplicate_object then null; end;
end $$;

-- 4. Сповіщення зі звіту монтажу: кому й куди веде
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
    v_link  text;
begin
    if new.submitted_at is null or (tg_op = 'UPDATE' and old.submitted_at is not null) then
        return new;
    end if;

    select i.custom_id, i.name, i.responsible_emp_id, i.brigadier_emp_id into v_inst
      from installations i where i.custom_id = new.installation_custom_id;
    select name into v_who from employees where id = new.author_id;
    v_place := coalesce(v_inst.name, 'обʼєкт') || ' #' || new.installation_custom_id;
    v_link  := '/project/' || new.installation_custom_id || '?tab=reports&r=' || new.id;

    if new.money_amount is not null then
        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        select e.id, 'report_money', new.id::text,
               'Монтажники отримали гроші: ' ||
                 replace(regexp_replace(trim(trailing '.' from trim(trailing '0' from round(new.money_amount, 2)::text)),
                         '(\d)(?=(\d{3})+(\.|$))', '\1 ', 'g'), '.', ',') || ' ' ||
                 case new.money_currency when 'USD' then '$' else '₴' end,
               v_place || ' · ' || coalesce(v_who, 'бригада') || ' · ' || to_char(new.work_date, 'DD.MM') ||
                 coalesce(E'\n' || nullif(btrim(new.money_note), ''), '') || E'\nПеревірте й внесіть у платежі.',
               v_link
          from employees e
         where e.access_blocked_at is null
           and (e.finance_access or e.custom_id = v_inst.responsible_emp_id)
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
               v_link
          from employees e
         where e.access_blocked_at is null
           and (e.finance_access
                or e.custom_id = v_inst.responsible_emp_id
                or e.custom_id = v_inst.brigadier_emp_id)
        on conflict (employee_id, kind, ref_key) do nothing;
    end if;

    return new;
exception when others then
    return new;
end $$;
