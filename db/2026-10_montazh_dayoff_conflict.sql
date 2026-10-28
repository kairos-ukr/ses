-- =====================================================================
--  K-CORE · Монтаж: вихідний у день, коли людина вже в графіку (18.10.2026)
--
--  Монтажник ставить собі вихідний сам, без погодження (додаток «Монтаж»,
--  вкладка «Графік»). Якщо в цей день він уже стоїть у графіку робіт
--  (installation_workers), керівник одразу отримує повідомлення в
--  дзвіночок CRM, щоб знайти заміну. Рядок графіка не чіпаємо — його
--  змінює офіс.
--
--  Повідомлення в Telegram-гілку графіка вже надсилає бот (вихідні з
--  сайту з source = null), тож тут лише дзвіночок.
--  Кому — поки адміністраторам; налаштування «кому приходить» з'являться
--  на етапі 3 плану «K-Core Монтаж».
-- =====================================================================

create or replace function public.notify_dayoff_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_emp   employees%rowtype;
    v_objs  text;
    v_label text;
begin
    if new.status not in ('OFF', 'VACATION', 'SICK_LEAVE') or coalesce(new.is_cancelled, false) then
        return new;
    end if;
    if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.work_date = new.work_date then
        return new;
    end if;
    if new.work_date < current_date then
        return new;
    end if;

    select string_agg(distinct coalesce(i.name, nullif(btrim(w.notes), ''), 'виїзд'), ', ')
      into v_objs
      from installation_workers w
      left join installations i on i.custom_id = w.installation_custom_id
     where w.employee_custom_id = new.employee_custom_id
       and w.work_date = new.work_date;
    if v_objs is null then
        return new;
    end if;

    select * into v_emp from employees where custom_id = new.employee_custom_id;
    v_label := case new.status when 'VACATION' then 'Відпустка' when 'SICK_LEAVE' then 'Лікарняний' else 'Вихідний' end;

    insert into app_notifications (employee_id, kind, ref_key, title, body, link)
    select e.id,
           'dayoff_conflict',
           new.employee_custom_id || ':' || new.work_date,
           v_label || ' у день графіка: ' || coalesce(v_emp.name, 'працівник'),
           to_char(new.work_date, 'DD.MM') || ' стоїть у графіку: ' || v_objs || '. Потрібна заміна.',
           '/employees?tab=planning'
      from employees e
     where e.role = 'super_admin'
       and e.access_blocked_at is null
       and e.id is distinct from v_emp.id
    on conflict (employee_id, kind, ref_key) do nothing;

    return new;
exception when others then
    return new;   -- повідомлення не повинно ламати збереження вихідного
end $$;

drop trigger if exists trg_notify_dayoff_conflict on public.attendance;
create trigger trg_notify_dayoff_conflict
    after insert or update on public.attendance
    for each row execute function public.notify_dayoff_conflict();
