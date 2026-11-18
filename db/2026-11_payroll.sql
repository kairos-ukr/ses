-- =====================================================================
--  Виплати працівникам (етап 3, рішення власника 18.11.2026)
--
--   • Км на своєму авто: людина щодня вносить км по роботі (car_mileage,
--     vehicle_id порожній). Записи накопичуються; коли сама вирішить —
--     «Подати на оплату» (submit_km_request): створюється заявка
--     payout_requests з усіма ще не поданими км, сума = км × ставка
--     (особиста employees.km_rate або загальна app_settings.km_rate).
--     Подані дні змінити вже не можна. Офіс: «Оплачено» або «Відхилити»
--     (тоді км знову вільні — можна виправити й подати ще раз).
--   • Оплачені дні: офіс позначає «оплачено по …» для людини —
--     pay_periods (з якого по який день, скільки днів на об'єктах, з них
--     у відрядженні, ставка за день, добові, сума). Наступного разу
--     рахуються лише дні після останнього оплаченого періоду.
--     Добові — app_settings.per_diem (₴ за день відрядження).
--   • Пальне за свої гроші (vehicle_expenses.paid_by = own) — офіс
--     позначає «Повернуто» (reimbursed_at).
--   • Право «Виплати працівникам» (payroll) — у Доступах, окремо.
--
--  Копії до змін: не потрібні (нові таблиці й стовпці; дані не змінюються).
-- =====================================================================

alter table public.employees add column if not exists km_rate numeric(8, 2) check (km_rate is null or km_rate >= 0);
comment on column public.employees.km_rate is 'Ставка за км на своєму авто, ₴ (порожньо — загальна з налаштувань)';

create table if not exists public.payout_requests (
    id            bigserial primary key,
    employee_id   integer not null references public.employees(id) on delete cascade,
    kind          text not null default 'km' check (kind in ('km')),
    period_from   date,
    period_to     date,
    km            numeric(10, 1) not null default 0,
    rate          numeric(8, 2),
    amount        numeric(12, 2) not null default 0,
    status        text not null default 'submitted' check (status in ('submitted', 'paid', 'rejected')),
    note          text,
    submitted_at  timestamptz not null default now(),
    decided_at    timestamptz,
    decided_by    integer,
    decision_note text
);
comment on table public.payout_requests is 'Заявки на оплату: км на своєму авто (подає сам працівник)';

alter table public.car_mileage add column if not exists request_id bigint references public.payout_requests(id) on delete set null;
create index if not exists car_mileage_request on public.car_mileage (request_id);

create table if not exists public.pay_periods (
    id           bigserial primary key,
    employee_id  integer not null references public.employees(id) on delete cascade,
    period_from  date not null,
    period_to    date not null check (period_to >= period_from),
    work_days    integer not null default 0,
    trip_days    integer not null default 0,
    day_rate     numeric(10, 2),
    per_diem     numeric(10, 2),
    amount       numeric(12, 2),
    note         text,
    paid_at      timestamptz not null default now(),
    paid_by      integer
);
comment on table public.pay_periods is 'Оплачені дні: офіс позначає «оплачено по …» для людини';
create index if not exists pay_periods_emp on public.pay_periods (employee_id, period_to desc);

alter table public.vehicle_expenses
    add column if not exists reimbursed_at timestamptz,
    add column if not exists reimbursed_by integer;
comment on column public.vehicle_expenses.reimbursed_at is 'Пальне за свої гроші — коли офіс повернув';

-- Подати на оплату всі ще не подані км на своєму авто (до сьогодні включно)
create or replace function public.submit_km_request(p_employee_id integer, p_note text default null)
returns public.payout_requests
language plpgsql
set search_path to 'public'
as $function$
declare
    v_rate numeric;
    v_req  public.payout_requests;
    v_km   numeric;
    v_from date;
    v_to   date;
begin
    select coalesce(sum(work_km), 0), min(log_date), max(log_date) into v_km, v_from, v_to
      from car_mileage
     where employee_id = p_employee_id and vehicle_id is null and request_id is null
       and coalesce(work_km, 0) > 0 and log_date <= current_date;
    if v_km <= 0 then
        raise exception 'Немає км, які ще не подавали на оплату' using errcode = 'P0001';
    end if;

    select coalesce(e.km_rate, nullif(s.value ->> 'rate', '')::numeric) into v_rate
      from employees e left join app_settings s on s.key = 'km_rate'
     where e.id = p_employee_id;

    insert into payout_requests (employee_id, kind, period_from, period_to, km, rate, amount, note)
    values (p_employee_id, 'km', v_from, v_to, v_km, v_rate, round(v_km * coalesce(v_rate, 0), 2), nullif(btrim(p_note), ''))
    returning * into v_req;

    update car_mileage set request_id = v_req.id
     where employee_id = p_employee_id and vehicle_id is null and request_id is null
       and coalesce(work_km, 0) > 0 and log_date <= current_date;
    return v_req;
end $function$;

-- Відхилили заявку — км знову вільні (можна виправити й подати ще раз)
create or replace function public.payout_request_released()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
    if NEW.status = 'rejected' and OLD.status is distinct from 'rejected' then
        update car_mileage set request_id = null where request_id = NEW.id;
    end if;
    return NEW;
end $function$;

drop trigger if exists trg_payout_request_released on public.payout_requests;
create trigger trg_payout_request_released
    after update of status on public.payout_requests
    for each row execute function public.payout_request_released();

-- Журнал змін: хто що оплатив
drop trigger if exists trg_log_payout_requests on public.payout_requests;
create trigger trg_log_payout_requests
    after insert or update or delete on public.payout_requests
    for each row execute function public.log_changes('employee_id', 'km', 'rate', 'amount', 'status');
drop trigger if exists trg_log_pay_periods on public.pay_periods;
create trigger trg_log_pay_periods
    after insert or update or delete on public.pay_periods
    for each row execute function public.log_changes('employee_id', 'period_from', 'period_to', 'work_days', 'trip_days', 'amount');

grant select, insert, update, delete on public.payout_requests, public.pay_periods to authenticated;
grant usage, select on sequence public.payout_requests_id_seq, public.pay_periods_id_seq to authenticated;
grant execute on function public.submit_km_request(integer, text) to authenticated;
