-- =====================================================================
--  K-CORE · Гроші й склад напряму на клієнта + пробіг авто
--
--  1. Платіж можна внести на клієнта без об'єкта (payment_history.client_id).
--     Платежі по об'єктах теж отримують клієнта (з об'єкта) — у картці
--     клієнта видно всю його історію грошей.
--  2. Резерв обладнання можна оформити на клієнта без об'єкта
--     (reservations.client_id; об'єкт тепер необов'язковий — але щось одне
--     з двох має бути). reserve_for_client() — як reserve_for_object().
--     Продаж клієнту (sell_to_object без об'єкта, з клієнтом) спершу
--     знімає резерв цього клієнта — як це вже робиться для об'єкта.
--  3. car_mileage — пробіг: працівник вносить показник спідометра і скільки
--     км проїхав по роботі (своє авто чи авто компанії). Офіс бачить в
--     «Автопарку».
--
--  Перед змінами копії: backup.payment_history_20261020b,
--  backup.reservations_20261020
-- =====================================================================

create schema if not exists backup;
create table if not exists backup.payment_history_20261020b as table public.payment_history;
create table if not exists backup.reservations_20261020 as table public.reservations;

/* ---------- 1. Платежі на клієнта ---------- */

alter table public.payment_history add column if not exists client_id integer references public.clients(id);
create index if not exists payment_history_client_idx on public.payment_history(client_id);

-- Наявні платежі: клієнт — з об'єкта
update public.payment_history p
   set client_id = c.id
  from public.installations i
  join public.clients c on c.custom_id = i.client_id
 where p.installation_custom_id = i.custom_id and p.client_id is null;

alter table public.payment_history drop constraint if exists payment_history_target_check;
alter table public.payment_history add constraint payment_history_target_check
    check (installation_custom_id is not null or client_id is not null);

create or replace function public.payment_history_prepare()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
    v_cur    text;
    v_client integer;
begin
    if NEW.installation_custom_id is null then
        -- Платіж напряму на клієнта: без перерахунку, курс — довідка
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
        raise exception 'Угода в %, а платіж у %: вкажіть курс (гривень за 1 долар)',
            case v_cur when 'USD' then 'доларах' else 'гривнях' end,
            case NEW.currency when 'USD' then 'доларах' else 'гривнях' end
            using errcode = 'P0001';
    elsif NEW.currency = 'UAH' and v_cur = 'USD' then
        NEW.amount_object := round(NEW.amount / NEW.exchange_rate, 2);
    else
        NEW.amount_object := round(NEW.amount * NEW.exchange_rate, 2);
    end if;
    return NEW;
end $$;

/* ---------- 2. Резерв на клієнта ---------- */

alter table public.reservations add column if not exists client_id integer references public.clients(id);
alter table public.reservations alter column installation_custom_id drop not null;
alter table public.reservations drop constraint if exists reservations_target_check;
alter table public.reservations add constraint reservations_target_check
    check (installation_custom_id is not null or client_id is not null);
create index if not exists reservations_client_idx on public.reservations(client_id) where client_id is not null;

create or replace function public.reserve_for_client(
    p_client integer, p_warehouse bigint, p_nomenclature bigint, p_qty numeric,
    p_note text default null, p_emp integer default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_available numeric;
    v_id        bigint;
begin
    if p_client is null then
        return jsonb_build_object('ok', false, 'message', 'Оберіть клієнта');
    end if;
    if p_qty is null or p_qty <= 0 then
        return jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    end if;
    select coalesce(quantity_available, 0) into v_available
      from v_warehouse_stock_available
     where warehouse_id = p_warehouse and nomenclature_id = p_nomenclature;
    v_available := coalesce(v_available, 0);
    if p_qty > v_available then
        return jsonb_build_object('ok', false, 'message', format('Недостатньо вільного залишку (вільно: %s)', v_available));
    end if;
    insert into reservations(client_id, warehouse_id, nomenclature_id, reserved_quantity, status, notes, created_by, updated_by)
    values (p_client, p_warehouse, p_nomenclature, p_qty, 'active', nullif(btrim(p_note), ''), p_emp, p_emp)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'reservation_id', v_id, 'reserved', p_qty);
end $$;

-- Продаж: резерв об'єкта або (без об'єкта) резерв клієнта знімається першим
create or replace function public.sell_to_object(
    p_installation integer, p_warehouse bigint, p_nomenclature bigint, p_qty numeric,
    p_op text default 'sale', p_client integer default null, p_sale_price numeric default null,
    p_currency text default 'USD', p_exchange_rate numeric default 1, p_reference text default null,
    p_reason text default null, p_emp integer default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_on_hand numeric; v_available numeric; v_reserved_here numeric; v_reserved_total numeric;
    v_issuable numeric; v_remaining numeric; v_take numeric;
    v_primary_res bigint := null; v_mv_id bigint; rec record;
    v_by_client boolean := p_installation is null and p_client is not null;
begin
    if p_qty is null or p_qty <= 0 then
        return jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    end if;
    if p_op not in ('sale', 'partner_transfer') then
        return jsonb_build_object('ok', false, 'message', 'Невідомий тип операції');
    end if;
    select coalesce(quantity_on_hand, 0), coalesce(quantity_available, 0) into v_on_hand, v_available
      from v_warehouse_stock_available where warehouse_id = p_warehouse and nomenclature_id = p_nomenclature;
    v_on_hand := coalesce(v_on_hand, 0); v_available := coalesce(v_available, 0);

    if p_installation is not null or v_by_client then
        select coalesce(sum(reserved_quantity - released_quantity), 0) into v_reserved_total
          from reservations where status = 'active' and warehouse_id = p_warehouse and nomenclature_id = p_nomenclature;
        select coalesce(sum(reserved_quantity - released_quantity), 0) into v_reserved_here
          from reservations where status = 'active' and warehouse_id = p_warehouse and nomenclature_id = p_nomenclature
           and (case when v_by_client then client_id = p_client and installation_custom_id is null
                     else installation_custom_id = p_installation end);
        v_issuable := v_on_hand - (v_reserved_total - v_reserved_here);
        if p_qty > v_issuable then
            return jsonb_build_object('ok', false, 'message', format('Недостатньо на складі (доступно: %s)', v_issuable));
        end if;
        v_remaining := p_qty;
        for rec in
            select id, (reserved_quantity - released_quantity) as active
              from reservations
             where status = 'active' and warehouse_id = p_warehouse and nomenclature_id = p_nomenclature
               and (case when v_by_client then client_id = p_client and installation_custom_id is null
                         else installation_custom_id = p_installation end)
               and (reserved_quantity - released_quantity) > 0
             order by reserved_at asc
        loop
            exit when v_remaining <= 0;
            v_take := least(rec.active, v_remaining);
            update reservations
               set released_quantity = released_quantity + v_take,
                   status = case when released_quantity + v_take >= reserved_quantity then 'fulfilled'::reservation_status else status end,
                   updated_by = p_emp, updated_at = now()
             where id = rec.id;
            if v_primary_res is null then v_primary_res := rec.id; end if;
            v_remaining := v_remaining - v_take;
        end loop;
    else
        if p_qty > v_available then
            return jsonb_build_object('ok', false, 'message', format('Недостатньо вільного залишку (вільно: %s)', v_available));
        end if;
    end if;

    insert into stock_movements(operation_type, nomenclature_id, quantity, warehouse_from_id,
                                installation_custom_id, client_id, reservation_id, sale_price,
                                currency, exchange_rate, reference_document, notes, performed_by, created_by)
    values (p_op::stock_operation_type, p_nomenclature, p_qty, p_warehouse, p_installation, p_client,
            v_primary_res, p_sale_price, p_currency, p_exchange_rate, p_reference, p_reason, p_emp, p_emp)
    returning id into v_mv_id;
    return jsonb_build_object('ok', true, 'movement_id', v_mv_id, 'reservation_id', v_primary_res);
end $$;

/* ---------- 3. Пробіг авто ---------- */

create table if not exists public.car_mileage (
    id          bigserial primary key,
    employee_id integer not null references public.employees(id) on delete cascade,
    vehicle_id  bigint references public.vehicles(id) on delete set null,   -- null — власне авто працівника
    log_date    date not null default current_date,
    odometer    integer check (odometer is null or odometer >= 0),       -- показник спідометра, км
    work_km     numeric(8,1) check (work_km is null or work_km >= 0),    -- проїхано по роботі за день, км
    note        text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint car_mileage_value_check check (odometer is not null or work_km is not null)
);
create unique index if not exists car_mileage_day_uq on public.car_mileage(employee_id, log_date, coalesce(vehicle_id, 0));
create index if not exists car_mileage_date_idx on public.car_mileage(log_date);

do $$
begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'car_mileage') then
        alter publication supabase_realtime add table public.car_mileage;
    end if;
end $$;
