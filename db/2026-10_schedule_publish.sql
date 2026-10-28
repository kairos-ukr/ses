-- =====================================================================
--  K-CORE · Публікація графіка дня
--
--  Графік складають на день наперед і ввечері «надсилають». Тепер це
--  кнопка «Зберегти й надіслати» в Календарі:
--   • schedule_publications — коли день збережено і коли надіслано;
--   • після надсилання кожен, хто в графіку цього дня (або в поїздці),
--     отримує сповіщення: де працює, з ким, на чому їде (і пуш на телефон);
--   • Telegram-бот бачить новий запис і публікує графік у гілці графіка
--     (так само, як команда /schedule).
--  Повторне надсилання після змін — «Графік змінено: …».
-- =====================================================================

create table if not exists public.schedule_publications (
    work_date      date primary key,
    saved_at       timestamptz,
    saved_by       integer references public.employees(id) on delete set null,
    published_at   timestamptz,
    published_by   integer references public.employees(id) on delete set null,
    publish_count  integer not null default 0,
    sent_at        timestamptz          -- коли бот опублікував у Telegram
);

do $$
begin
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedule_publications') then
        alter publication supabase_realtime add table public.schedule_publications;
    end if;
end $$;

-- Сповіщення людям, що графік надіслано
create or replace function public.notify_schedule_published()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_days  text[] := array['неділю','понеділок','вівторок','середу','четвер','пʼятницю','суботу'];
    v_title text;
    v_cid   integer;
    v_emp   employees%rowtype;
    v_inst  integer;
    v_notes text;
    v_name  text;
    v_place text;
    v_body  text;
    v_team  text;
    v_trip  record;
begin
    if NEW.published_at is null then return NEW; end if;
    if TG_OP = 'UPDATE' and OLD.published_at is not distinct from NEW.published_at then return NEW; end if;

    v_title := case when NEW.publish_count > 1 then 'Графік змінено: ' else 'Графік на ' end
               || v_days[extract(dow from NEW.work_date)::int + 1] || ', ' || to_char(NEW.work_date, 'DD.MM');

    for v_cid in
        select distinct p.cid from (
            select employee_custom_id as cid from installation_workers
             where work_date = NEW.work_date and employee_custom_id is not null
            union
            select driver_custom_id from trips
             where trip_date = NEW.work_date and status <> 'cancelled' and driver_custom_id is not null
            union
            select unnest(crew) from trips
             where trip_date = NEW.work_date and status <> 'cancelled'
        ) p where p.cid is not null
    loop
        select * into v_emp from employees where custom_id = v_cid;
        continue when v_emp.id is null or v_emp.access_blocked_at is not null;

        v_inst := null; v_notes := null; v_name := null; v_place := null; v_team := null;
        select iw.installation_custom_id, nullif(btrim(iw.notes), ''), i.name, c.populated_place
          into v_inst, v_notes, v_name, v_place
          from installation_workers iw
          left join installations i on i.custom_id = iw.installation_custom_id
          left join clients c on c.custom_id = i.client_id
         where iw.work_date = NEW.work_date and iw.employee_custom_id = v_cid
         limit 1;

        v_body := case
            when v_inst is not null then '📍 ' || coalesce(v_place || ', ', '') || coalesce(v_name, 'обʼєкт #' || v_inst)
            when v_notes is not null then '📝 ' || v_notes
            else '🚐 Поїздка' end;
        if v_inst is not null and v_notes is not null then
            v_body := v_body || E'\n' || v_notes;
        end if;

        select string_agg(e2.name, ', ' order by e2.name) into v_team
          from installation_workers iw2
          join employees e2 on e2.custom_id = iw2.employee_custom_id
         where iw2.work_date = NEW.work_date and iw2.employee_custom_id <> v_cid
           and ((v_inst is not null and iw2.installation_custom_id = v_inst)
             or (v_inst is null and v_notes is not null and iw2.installation_custom_id is null and btrim(iw2.notes) = v_notes));
        if v_team is not null then
            v_body := v_body || E'\nЗ вами: ' || v_team;
        end if;

        select t.driver_custom_id, v.name as vname, v.plate, o.name as owner_name, d.name as driver_name
          into v_trip
          from trips t
          left join vehicles v on v.id = t.vehicle_id
          left join employees o on o.custom_id = t.own_car_custom_id
          left join employees d on d.custom_id = t.driver_custom_id
         where t.trip_date = NEW.work_date and t.status <> 'cancelled'
           and (t.driver_custom_id = v_cid or v_cid = any(t.crew))
         order by (t.driver_custom_id = v_cid) desc nulls last, t.id
         limit 1;
        if found then
            v_body := v_body || E'\n🚐 '
                || coalesce(v_trip.vname || coalesce(' ' || v_trip.plate, ''), 'власне авто: ' || v_trip.owner_name, 'транспорт')
                || case when v_trip.driver_custom_id = v_cid then ' · ви за кермом'
                        when v_trip.driver_name is not null then ' · водій ' || v_trip.driver_name
                        else '' end;
        end if;

        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        values (v_emp.id, 'schedule', NEW.work_date::text || ':' || NEW.publish_count, v_title, v_body,
                case when v_emp.role = 'installer' then '/m/schedule'
                     else '/employees?tab=planning&d=' || NEW.work_date::text end)
        on conflict (employee_id, kind, ref_key) do nothing;
    end loop;
    return NEW;
exception when others then
    return NEW;
end $$;

drop trigger if exists trg_schedule_published on public.schedule_publications;
create trigger trg_schedule_published
    after insert or update of published_at on public.schedule_publications
    for each row execute function public.notify_schedule_published();
