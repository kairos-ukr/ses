-- =====================================================================
--  K-CORE · Особисті нагадування (планер «Мій день», 17.10.2026)
--
--  Власні робочі нагадування людини: що зробити, на який день і коли
--  нагадати. Бачить лише автор і ті, з ким він поділився (shared_with).
--  Окрема таблиця, а не microtasks: бот публікує кожну нову мікрозадачу
--  в загальний чат команди — особисте туди потрапляти не повинно.
--
--  Нагадування в час remind_at надсилає бот (особисто + дзвіночок CRM)
--  і ставить reminded_at, щоб не повторювати.
--  Приватність зараз — на рівні програми; захист у самій базі з'явиться
--  разом із RLS-політиками, коли власник вирішить їх вмикати.
-- =====================================================================

create table if not exists public.personal_reminders (
  id                     bigserial primary key,
  owner_id               integer not null references public.employees(id) on delete cascade,
  text                   text not null check (length(btrim(text)) > 0),
  note                   text,
  plan_date              date,                          -- на який день заплановано
  remind_at              timestamptz,                   -- коли нагадати
  shared_with            integer[] not null default '{}', -- employees.id, кому теж видно
  installation_custom_id integer,                       -- якщо стосується об'єкта
  done_at                timestamptz,
  reminded_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists personal_reminders_owner_idx  on public.personal_reminders (owner_id) where done_at is null;
create index if not exists personal_reminders_shared_idx on public.personal_reminders using gin (shared_with);
create index if not exists personal_reminders_due_idx    on public.personal_reminders (remind_at) where done_at is null and reminded_at is null;

drop trigger if exists set_updated_at on public.personal_reminders;
create trigger set_updated_at before update on public.personal_reminders
  for each row execute function update_updated_at();

-- Змінили час нагадування — нагадати знову
create or replace function public.personal_reminder_rearm() returns trigger
language plpgsql as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_personal_reminder_rearm on public.personal_reminders;
create trigger trg_personal_reminder_rearm before update of remind_at on public.personal_reminders
  for each row execute function public.personal_reminder_rearm();

-- Наживо: поділились нагадуванням — у колеги воно з'являється одразу.
-- Мікрозадачі теж: узяв задачу — інші бачать, що вона вже не вільна.
alter publication supabase_realtime add table public.personal_reminders, public.microtasks;

-- Перевірка:
-- select * from public.personal_reminders limit 1;
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
