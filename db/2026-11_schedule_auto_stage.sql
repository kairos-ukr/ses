-- =====================================================================
--  Об'єкт поставили в графік — етап у воронці сам стає «Монтаж»
--  (рішення власника 18.11.2026)
--
--   Якщо об'єкт ще на ранньому етапі (заміри, проект, КП, обладнання,
--   комплектація), а бригаду вже поставили на нього в графік, етап сам
--   переходить на «Монтаж»: у воронці угод він одразу там, де справді є.
--   Назад не рухаємо: «Монтаж», «Запуск» і пізніші не чіпаємо.
--   Не чіпаємо скасовані, втрачені й завершені об'єкти, а також виїзд на
--   заміри (у «Що робимо» написано «замір»).
--   У журналі змін видно, хто склав графік; у подіях етапу — «Графік робіт».
--
--  Інше в цьому файлі (зроблено того ж дня):
--   • графік у Telegram без «Взяти з собою» — перемикач «Разом із
--     графіком» вимкнено (app_settings.take_reminders.schedule = false);
--   • у графіку дня для бота — ще й «Відпустка / лікарняний»
--     (get_daily_schedule → leave; функція — у 2026-11_schedule_people.sql
--     плюс поле leave);
--   • Василю Гонті — право «Витрати на авто» (бачить, додає, змінює).
--   • Разово (за згодою власника 18.11): 6 об'єктів, що вже стояли в
--     графіку на 18–19.11 на ранніх етапах, переведено на «Монтаж»:
--     7698, 2289, 3434, 2971, 3529 (з «Обладнання») і 9549 (із «Замірів»).
-- =====================================================================

create or replace function public.schedule_auto_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
    r record;
begin
    for r in
        select distinct i.id, i.custom_id, i.workflow_stage
          from new_rows n
          join installations i on i.custom_id = n.installation_custom_id
         where n.installation_custom_id is not null
           and coalesce(n.notes, '') !~* 'замір'
           and i.workflow_stage in ('tech_review', 'project', 'proposal', 'equipment', 'complectation')
           and coalesce(i.status, '') not in ('cancelled', 'lost', 'completed')
    loop
        update installations set workflow_stage = 'installation' where id = r.id;
        insert into workflow_events (installation_custom_id, stage_key, old_status, new_status, comment, actor, created_at, telegram_sent)
        values (r.custom_id, 'installation', r.workflow_stage, 'active',
                'Бригада в графіку — етап «Монтаж» автоматично', 'Графік робіт', now(), true);
    end loop;
    return null;
exception when others then
    return null;   -- графік зберігається в будь-якому разі
end $function$;

drop trigger if exists trg_schedule_auto_stage on public.installation_workers;
create trigger trg_schedule_auto_stage
    after insert on public.installation_workers
    referencing new table as new_rows
    for each statement execute function public.schedule_auto_stage();

-- Графік у Telegram і в особистих сповіщеннях — без «Взяти з собою»
insert into app_settings (key, value, updated_at)
values ('take_reminders', '{"schedule": false}'::jsonb, now())
on conflict (key) do update set value = coalesce(app_settings.value, '{}'::jsonb) || '{"schedule": false}'::jsonb, updated_at = now();

-- Право «Витрати на авто» Василю Гонті (custom_id 90)
update employees
   set access_overrides = coalesce(access_overrides, '{}'::jsonb)
       || jsonb_build_object('fleet_costs', jsonb_build_object('view', true, 'add', true, 'edit', true, 'all', true))
 where custom_id = 90;
