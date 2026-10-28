-- =====================================================================
--  K-CORE · Який саме банк (17.10.2026)
--
--  Поле «Через банк?» лишається як було («Так» / «Ні»). Якщо «Так» —
--  тепер можна вказати, через який банк іде угода (Ощадбанк, Приват…),
--  щоб бачити це на картці й фільтрувати.
--  Нова колонка порожня для всіх наявних угод — дані не змінюються.
--  Журнал змін тепер пише і «через банк», і назву банку.
-- =====================================================================

alter table public.installations add column if not exists bank_name text;

comment on column public.installations.bank_name is 'Банк, через який іде угода (коли bank = ''Так'')';

drop trigger if exists trg_log_installations on public.installations;
create trigger trg_log_installations
  after insert or delete or update on public.installations
  for each row execute function log_changes(
    'name', 'status', 'workflow_stage', 'responsible_emp_id', 'total_cost', 'currency', 'capacity_kw',
    'station_type', 'start_date', 'end_date', 'lost_reason', 'client_id', 'working_company',
    'bank', 'bank_name'
  );

-- Перевірка:
-- select column_name from information_schema.columns where table_name = 'installations' and column_name = 'bank_name';
-- select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_log_installations';
