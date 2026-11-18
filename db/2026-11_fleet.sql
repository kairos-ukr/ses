-- =====================================================================
--  Автопарк: одометр, пальне з чеком, ТО й ремонти (рішення власника 18.11.2026)
--
--   • Водій авто компанії (постійний або той, хто віз бригаду) у
--     «Монтажі» вносить показник одометра за день, а якщо заправлявся —
--     суму, літри (бажано), хто платив і фото чека (обов'язково).
--     Одометр — car_mileage.odometer (той самий журнал пробігу).
--   • ТО й ремонти по кожному авто — vehicle_expenses: дата, одометр,
--     що робили, позиції окремо «запчастини» / «робота» (напр. шини й
--     шиномонтаж), хто платив, чеки. Суми запчастин, роботи й усього база
--     рахує сама з позицій.
--   • Аналітика по авто за місяць (км, пальне, л/100 км, ТО, грн/км) —
--     лише тим, кому дали право «Витрати на авто» (Доступи → особисто;
--     монтажнику теж можна). Права перевіряє програма (RLS не чіпаємо).
--   • Зміни сум пишуться в журнал змін.
--
--  Копії до змін: не потрібні (нова таблиця; наявні дані не змінюються).
-- =====================================================================

create table if not exists public.vehicle_expenses (
    id            bigserial primary key,
    vehicle_id    bigint not null references public.vehicles(id) on delete cascade,
    kind          text not null default 'fuel' check (kind in ('fuel', 'service', 'repair', 'other')),
    expense_date  date not null default current_date,
    odometer      integer check (odometer is null or odometer >= 0),
    title         text,
    items         jsonb not null default '[]'::jsonb,
    parts_cost    numeric(12, 2) not null default 0,
    labor_cost    numeric(12, 2) not null default 0,
    amount        numeric(12, 2) not null default 0 check (amount >= 0),
    liters        numeric(8, 2) check (liters is null or liters > 0),
    paid_by       text check (paid_by is null or paid_by in ('company_card', 'company_cash', 'own')),
    receipt_urls  text[] not null default '{}',
    receipt_fids  text[] not null default '{}',
    employee_id   integer references public.employees(id) on delete set null,
    note          text,
    created_by    integer,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

comment on table public.vehicle_expenses is 'Витрати на авто компанії: пальне (з чеком від водія), ТО, ремонти, інше';
comment on column public.vehicle_expenses.items is 'ТО/ремонт: [{ name, kind: part (запчастини) | work (робота), cost }]';
comment on column public.vehicle_expenses.paid_by is 'company_card — картка компанії, company_cash — готівка компанії, own — свої гроші (повернути)';
comment on column public.vehicle_expenses.employee_id is 'Хто заправляв / вніс запис';

create index if not exists vehicle_expenses_vehicle_date on public.vehicle_expenses (vehicle_id, expense_date desc);
create index if not exists car_mileage_vehicle_date on public.car_mileage (vehicle_id, log_date desc) where vehicle_id is not null;

-- Суми з позицій: запчастини, робота, усього (для пального — сума як є)
create or replace function public.vehicle_expenses_prepare()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
    if NEW.kind <> 'fuel' and jsonb_typeof(NEW.items) = 'array' and jsonb_array_length(NEW.items) > 0 then
        select coalesce(sum(nullif(i ->> 'cost', '')::numeric) filter (where i ->> 'kind' = 'part'), 0),
               coalesce(sum(nullif(i ->> 'cost', '')::numeric) filter (where coalesce(i ->> 'kind', 'work') <> 'part'), 0)
          into NEW.parts_cost, NEW.labor_cost
          from jsonb_array_elements(NEW.items) i;
        NEW.amount := NEW.parts_cost + NEW.labor_cost;
    elsif NEW.kind = 'fuel' then
        NEW.items := '[]'::jsonb;
        NEW.parts_cost := 0;
        NEW.labor_cost := 0;
    end if;
    NEW.updated_at := now();
    return NEW;
end $function$;

drop trigger if exists trg_vehicle_expenses_prepare on public.vehicle_expenses;
create trigger trg_vehicle_expenses_prepare
    before insert or update on public.vehicle_expenses
    for each row execute function public.vehicle_expenses_prepare();

-- Журнал змін (хто вніс чи змінив суму)
drop trigger if exists trg_log_vehicle_expenses on public.vehicle_expenses;
create trigger trg_log_vehicle_expenses
    after insert or update or delete on public.vehicle_expenses
    for each row execute function public.log_changes('vehicle_id', 'kind', 'expense_date', 'odometer', 'title', 'amount', 'parts_cost', 'labor_cost', 'liters', 'paid_by');

grant select, insert, update, delete on public.vehicle_expenses to authenticated;
grant usage, select on sequence public.vehicle_expenses_id_seq to authenticated;
