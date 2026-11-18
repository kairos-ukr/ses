-- =====================================================================
--  Графік монтажу: хто в ньому і відрядження (рішення власника 18.11.2026)
--
--   • У графіку, «Вільних», календарі «По людях» та історії виїздів —
--     лише монтажники (бригадири теж). Директор, комірник, офіс — ні,
--     але кожного можна додати в бригаду, набравши ім'я в пошуку.
--     employees.in_schedule: порожньо — за роллю (монтажник — так,
--     інші — ні); так/ні — вручну з картки працівника («У графіку
--     монтажу»).
--   • Не в графіку в робочий день = вихідний сам собою (окремо
--     відмічаються лише відпустка й лікарняний) — це рахує інтерфейс,
--     у базі нічого не пишемо.
--   • Відрядження: installation_workers.business_trip — бригада на цьому
--     об'єкті у відрядженні (добові); у графіку такі об'єкти — першими.
--
--  Копії до змін: не потрібні (лише нові стовпці зі значенням за
--  замовчуванням, наявні дані не змінюються).
-- =====================================================================

alter table public.employees
    add column if not exists in_schedule boolean;
comment on column public.employees.in_schedule is 'У графіку монтажу: null — за роллю (монтажник), true/false — вручну';

alter table public.installation_workers
    add column if not exists business_trip boolean not null default false;
comment on column public.installation_workers.business_trip is 'Відрядження (добові) — на цьому об''єкті цього дня';

-- Графік дня для бота (гілка графіка в Telegram): відрядження — позначка
-- й першими; «Вихідні» — монтажники, яких немає в графіку (і не у
-- відпустці чи на лікарняному), плюс ті, кому вихідний поставили вручну
create or replace function public.get_daily_schedule(target_date date)
returns jsonb
language plpgsql
as $function$
declare
    result jsonb;
begin
    with daily_assignments as (
        select iw.installation_custom_id, iw.employee_custom_id, e.name as employee_name, iw.notes,
               coalesce(iw.business_trip, false) as business_trip
          from installation_workers iw
          join employees e on iw.employee_custom_id = e.custom_id
         where iw.work_date = target_date
    ),
    objects_data as (
        select i.custom_id, i.name,
               bool_or(da.business_trip) as business_trip,
               jsonb_agg(jsonb_build_object('name', da.employee_name)) filter (where da.employee_name is not null) as workers,
               string_agg(distinct da.notes, '; ') filter (where da.notes is not null and da.notes <> '') as notes
          from installations i
          join daily_assignments da on i.custom_id = da.installation_custom_id
         group by i.custom_id, i.name
    ),
    tasks_without_object_data as (
        select jsonb_agg(jsonb_build_object('worker_name', da.employee_name, 'notes', da.notes, 'business_trip', da.business_trip)) as tasks
          from daily_assignments da
         where da.installation_custom_id is null and da.notes is not null and da.notes <> ''
    ),
    off_duty_data as (
        select jsonb_agg(jsonb_build_object('name', x.name) order by x.name) as employees
          from (
            select e.name from attendance a join employees e on a.employee_custom_id = e.custom_id
             where a.work_date = target_date and a.status = 'OFF'
            union
            select e.name from employees e
             where coalesce(e.in_schedule, e.role = 'installer')
               and not coalesce(e.hidden_from_list, false) and e.access_blocked_at is null
               and extract(dow from target_date) <> 0
               and not exists (select 1 from installation_workers iw where iw.work_date = target_date and iw.employee_custom_id = e.custom_id)
               and not exists (select 1 from attendance a where a.work_date = target_date and a.employee_custom_id = e.custom_id
                                                        and a.status in ('VACATION', 'SICK_LEAVE'))
          ) x
    )
    select jsonb_build_object(
        'objects', coalesce((select jsonb_agg(od order by od.business_trip desc, od.name) from objects_data od), '[]'::jsonb),
        'tasks_without_object', coalesce((select tasks from tasks_without_object_data), '[]'::jsonb),
        'off_duty', coalesce((select employees from off_duty_data), '[]'::jsonb)
    ) into result;
    return result;
end;
$function$;

-- Особисте сповіщення про графік: «🧳 Відрядження (добові)» — тим, хто їде у відрядження.
-- Правка наявної функції notify_schedule_published (решта тексту — без змін)
do $mig$
declare v_def text;
begin
  select pg_get_functiondef('public.notify_schedule_published()'::regprocedure) into v_def;
  if position('v_away' in v_def) > 0 then return; end if;   -- уже оновлено
  v_def := replace(v_def, E'v_brig  boolean;', E'v_brig  boolean;\n    v_away  boolean;');
  v_def := replace(v_def, E'v_inst := null; v_notes := null;', E'v_inst := null; v_notes := null; v_away := false;');
  v_def := replace(v_def, E'select iw.installation_custom_id, nullif(btrim(iw.notes), \'\'), i.name, c.populated_place\n          into v_inst, v_notes, v_name, v_place',
                          E'select iw.installation_custom_id, nullif(btrim(iw.notes), \'\'), i.name, c.populated_place, coalesce(iw.business_trip, false)\n          into v_inst, v_notes, v_name, v_place, v_away');
  v_def := replace(v_def, E'v_body := v_body || E\'\\nЗ вами: \' || v_team;\n        end if;',
                          E'v_body := v_body || E\'\\nЗ вами: \' || v_team;\n        end if;\n        if v_away then\n            v_body := v_body || E\'\\n🧳 Відрядження (добові)\';\n        end if;');
  if position('v_away := false' in v_def) = 0 or position('into v_inst, v_notes, v_name, v_place, v_away' in v_def) = 0
     or position('Відрядження (добові)' in v_def) = 0 then
    raise exception 'notify_schedule_published: не знайшов місце для правки';
  end if;
  execute v_def;
end $mig$;

-- Збереження графіка дня — тепер і з позначкою «відрядження»
create or replace function public.save_day_schedule(p_work_date date, p_records jsonb)
returns void
language plpgsql
as $function$
begin
  delete from installation_workers where work_date = p_work_date;

  insert into installation_workers
    (installation_custom_id, employee_custom_id, work_date, work_hours, notes, visit_plan_id, business_trip)
  select
    (r->>'installation_custom_id')::integer,
    (r->>'employee_custom_id')::integer,
    p_work_date,
    coalesce((r->>'work_hours')::integer, 8),
    r->>'notes',
    (r->>'visit_plan_id')::bigint,
    coalesce((r->>'business_trip')::boolean, false)
  from jsonb_array_elements(p_records) as r;

  update installation_visit_plan
  set status = 'done', updated_at = now()
  where status = 'planned'
    and id in (
      select distinct (r->>'visit_plan_id')::bigint
      from jsonb_array_elements(p_records) as r
      where r->>'visit_plan_id' is not null
    );
end;
$function$;
