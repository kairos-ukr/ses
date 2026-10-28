-- =====================================================================
--  K-CORE · Особисті повідомлення в Telegram — застосування
--
--  Застосовує дві вересневі зміни, які лежали незастосованими:
--   • db/2026-09_supply_alerts_bot_ready.sql — employees.telegram_user_id
--     (куди писати людині), відповідальні за нагадування забезпечення,
--     черга для бота, без автозаявок у закупівлю;
--   • db/2026-09_bot_personal_notifications.sql — журнал особистих
--     повідомлень (щоб не надіслати двічі), підписки, стан залишків.
--  Захист рядків (RLS) для нових таблиць НЕ вмикається — як і в решті
--  бази, за рішенням власника.
--
--  Нове: app_notifications.telegram_sent_at — бот пересилає в Telegram
--  кожне сповіщення дзвіночка, якого він не надсилав сам, і позначає тут.
--
--  Перед змінами копії: backup.employees_20261020, backup.supply_alerts_20261020,
--  backup.app_notifications_20261020
-- =====================================================================

create schema if not exists backup;
create table if not exists backup.employees_20261020 as table public.employees;
create table if not exists backup.supply_alerts_20261020 as table public.supply_alerts;
create table if not exists backup.app_notifications_20261020 as table public.app_notifications;

/* ---------- 2026-09_supply_alerts_bot_ready (блоки A–G, без RLS) ---------- */

alter table employees add column if not exists telegram_user_id bigint;
create unique index if not exists uq_employees_telegram_user_id on employees (telegram_user_id) where telegram_user_id is not null;

alter table supply_alerts
    add column if not exists assigned_to       integer references employees(id),
    add column if not exists assigned_manually boolean not null default false;
create index if not exists idx_supply_alerts_assignee on supply_alerts (assigned_to) where status = 'open';

create or replace function supply_alerts_on_reassign()
returns trigger language plpgsql as $$
begin
    if NEW.assigned_to is distinct from OLD.assigned_to then
        NEW.last_reminder_sent_at := null;
    end if;
    return NEW;
end $$;
drop trigger if exists trg_supply_alerts_reassign on supply_alerts;
create trigger trg_supply_alerts_reassign before update of assigned_to on supply_alerts
    for each row execute function supply_alerts_on_reassign();

-- Далі — функції supply_alert_set (6 параметрів), refresh_object_supply,
-- refresh_object_supply_safe, тригери trg_installations_supply /
-- trg_project_stages_supply, вигляди v_supply_alerts і v_supply_alert_outbox,
-- журнал supply_alert_notifications, supply_alert_mark_sent і перерахунок
-- refresh_supply_alerts(false) — дослівно як у db/2026-09_supply_alerts_bot_ready.sql
-- (блоки B–G), лише без BEGIN/COMMIT і без рядків про RLS.

/* ---------- 2026-09_bot_personal_notifications (без RLS) ---------- */

create table if not exists bot_personal_messages (
    id                   bigint generated always as identity primary key,
    employee_id          integer references employees(id) on delete set null,
    telegram_chat_id     bigint  not null,
    kind                 text    not null,
    ref_key              text    not null,
    telegram_message_id  bigint,
    sent_at              timestamptz not null default now()
);
create unique index if not exists uq_bot_personal_messages_once on bot_personal_messages (kind, ref_key, telegram_chat_id);
create index if not exists idx_bot_personal_messages_employee on bot_personal_messages (employee_id, sent_at desc);

create table if not exists notification_subscriptions (
    id           bigint generated always as identity primary key,
    employee_id  integer not null references employees(id) on delete cascade,
    topic        text    not null check (topic in ('low_stock', 'system')),
    created_at   timestamptz not null default now(),
    unique (employee_id, topic)
);

create table if not exists stock_min_notified (
    nomenclature_id   bigint primary key references nomenclature(id) on delete cascade,
    below_since       timestamptz not null default now(),
    last_notified_at  timestamptz
);

/* ---------- Нове: дзвіночок → Telegram ---------- */

alter table app_notifications add column if not exists telegram_sent_at timestamptz;
create index if not exists idx_app_notifications_tg_pending on app_notifications (created_at) where telegram_sent_at is null;
