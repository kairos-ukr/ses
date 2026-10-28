-- =====================================================================
--  K-CORE · «Перегляньте свої угоди» — нагадування менеджерам (18.10.2026)
--
--  v_deal_review — угоди в роботі (без паузи): скільки днів без жодної
--  дії, скільки на етапі, яка норма етапу, чи вказана вартість.
--  deal_review_settings — кожен налаштовує під себе: чи нагадувати,
--  щодня чи щотижня (в який день), о котрій, що вважати «без руху»
--  і що ще включати (понад норму етапу, без вартості).
--  Хто не налаштовував — для офісу й керівників діє типове:
--  щопонеділка о 9:00, без руху понад 14 днів + понад норму етапу.
--  Нагадування надсилає бот (особисто + дзвіночок CRM).
-- =====================================================================

create table if not exists public.deal_review_settings (
  employee_id        integer primary key references public.employees(id) on delete cascade,
  enabled            boolean  not null default true,
  frequency          text     not null default 'weekly' check (frequency in ('daily', 'weekly')),
  weekday            smallint not null default 1 check (weekday between 1 and 7),   -- 1 = понеділок
  hour               smallint not null default 9 check (hour between 6 and 21),
  stale_days         smallint not null default 14 check (stale_days between 3 and 120),
  include_over_norm  boolean  not null default true,
  include_no_cost    boolean  not null default false,
  updated_at         timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.deal_review_settings;
create trigger set_updated_at before update on public.deal_review_settings
  for each row execute function update_updated_at();

create or replace view public.v_deal_review with (security_invoker = true) as
select
  i.custom_id,
  i.name,
  i.status,
  i.workflow_stage,
  i.responsible_emp_id,
  i.total_cost,
  i.currency,
  a.last_activity_at,
  a.stage_entered_at,
  floor(extract(epoch from now() - coalesce(a.last_activity_at, i.created_at)) / 86400)::int as idle_days,
  floor(extract(epoch from now() - coalesce(a.stage_entered_at, i.created_at)) / 86400)::int as stage_days,
  n.days as norm_days
from public.installations i
left join public.v_object_activity a on a.installation_custom_id = i.custom_id
left join public.stage_norms n on n.stage_key = i.workflow_stage
where i.status in ('planning', 'in_progress')
  and coalesce(i.is_subcontract, false) = false;

-- Перевірка:
-- select * from public.v_deal_review order by idle_days desc limit 10;
