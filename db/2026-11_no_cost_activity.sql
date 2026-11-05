-- =====================================================================
--  «Без вартості», «Робота йде» і без норм етапів
--
--  Власник 05.11:
--   • є об'єкти, де вартість навмисно не вносять (закриті угоди, підряди) —
--     окрема позначка, щоб «Немає вартості угоди» їх не чіпало;
--   • норми днів на етап не потрібні взагалі («об'єкт можна зробити за
--     3 дні, а можна за 2 місяці»): ні «довше норми», ні «норма етапу»;
--   • «без руху» лишається, але з кнопкою «Робота йде»: позначили — об'єкт
--     вважається активним і не засмічує «Потребує уваги».
--
--  Що змінюється:
--   • installations.no_cost — вартість не вноситься;
--   • installations.activity_confirmed_at / _by — «Робота йде» (хто й коли);
--   • v_object_activity — рухом тепер рахуються й звіти бригад, і дні в
--     графіку робіт (заплановані теж — як сьогодні), і «Робота йде»;
--   • v_deal_review — без норм (norm_days лишається порожнім, щоб старий
--     бот на сервері не зламався), + no_cost;
--   • v_stage_overdue — завжди порожній: нагадувань «етап довше норми»
--     більше немає навіть від старого бота;
--   • журнал змін об'єкта пише ще курс угоди, «без вартості» і «Робота йде».
--
--  Копія до змін: backup.installations_20261105 (db/2026-11_deal_rate.sql)
-- =====================================================================

alter table public.installations
    add column if not exists no_cost boolean not null default false,
    add column if not exists activity_confirmed_at timestamptz,
    add column if not exists activity_confirmed_by integer;

comment on column public.installations.no_cost is
    'Вартість навмисно не вноситься (закрита угода, підряд) — «Немає вартості» не нагадує';
comment on column public.installations.activity_confirmed_at is
    '«Робота йде»: позначили, що об''єкт активний, — рахується як рух';
comment on column public.installations.activity_confirmed_by is
    'Хто позначив «Робота йде» (employees.id)';

-- Рух по об'єкту: + звіти бригад, дні в графіку, «Робота йде»
create or replace view public.v_object_activity as
select i.custom_id as installation_custom_id,
       coalesce(st.entered_at, i.created_at::timestamp with time zone) as stage_entered_at,
       greatest(i.created_at::timestamp with time zone, ev.last_event_at, pay.last_payment_at, note.last_note_at,
                co.last_offer_at, rep.last_report_at, wk.last_work_at, i.activity_confirmed_at) as last_activity_at
  from installations i
  left join lateral (select max(e.created_at) as entered_at
                       from workflow_events e
                      where e.installation_custom_id = i.custom_id and e.new_status = 'active'::text
                        and e.stage_key = i.workflow_stage) st on true
  left join lateral (select max(e.created_at) as last_event_at
                       from workflow_events e
                      where e.installation_custom_id = i.custom_id) ev on true
  left join lateral (select max(p.created_at)::timestamp with time zone as last_payment_at
                       from payment_history p
                      where p.installation_custom_id = i.custom_id) pay on true
  left join lateral (select max(a.created_at) as last_note_at
                       from project_additional_info a
                      where a.installation_custom_id = i.custom_id) note on true
  left join lateral (select max(c.created_at) as last_offer_at
                       from commercial_offers c
                      where c.installation_custom_id = i.custom_id) co on true
  left join lateral (select max(r.submitted_at) as last_report_at
                       from installer_reports r
                      where r.installation_custom_id = i.custom_id) rep on true
  -- День у графіку робіт; запланований наперед — рахується як сьогодні
  left join lateral (select (max(least(w.work_date, (now() at time zone 'Europe/Kyiv')::date)) + time '12:00')
                                at time zone 'Europe/Kyiv' as last_work_at
                       from installation_workers w
                      where w.installation_custom_id = i.custom_id) wk on true;

-- Угоди на перегляд — без норм
create or replace view public.v_deal_review as
select i.custom_id,
       i.name,
       i.status,
       i.workflow_stage,
       i.responsible_emp_id,
       i.total_cost,
       i.currency,
       a.last_activity_at,
       a.stage_entered_at,
       floor(extract(epoch from now() - coalesce(a.last_activity_at, i.created_at::timestamp with time zone)) / 86400::numeric)::integer as idle_days,
       floor(extract(epoch from now() - coalesce(a.stage_entered_at, i.created_at::timestamp with time zone)) / 86400::numeric)::integer as stage_days,
       null::integer as norm_days,
       i.no_cost
  from installations i
  left join v_object_activity a on a.installation_custom_id = i.custom_id
 where i.status = any (array['planning'::text, 'in_progress'::text])
   and coalesce(i.is_subcontract, false) = false;

-- «Етап довше норми» — більше нікому
create or replace view public.v_stage_overdue as
select i.custom_id as installation_custom_id,
       i.name,
       i.status,
       i.workflow_stage,
       i.responsible_emp_id,
       a.stage_entered_at,
       current_date - a.stage_entered_at::date as stage_days,
       null::integer as norm_days,
       null::integer as over_days
  from installations i
  join v_object_activity a on a.installation_custom_id = i.custom_id
 where false;

-- Журнал змін об'єкта: + курс угоди, «без вартості», «Робота йде»
drop trigger if exists trg_log_installations on public.installations;
create trigger trg_log_installations
    after insert or delete or update on public.installations
    for each row execute function public.log_changes(
        'name', 'status', 'workflow_stage', 'responsible_emp_id', 'total_cost', 'currency', 'capacity_kw',
        'station_type', 'start_date', 'end_date', 'lost_reason', 'client_id', 'working_company', 'bank', 'bank_name',
        'exchange_rate', 'no_cost', 'activity_confirmed_at');
