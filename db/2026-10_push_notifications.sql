-- =====================================================================
--  K-CORE · Пуш-сповіщення на телефон і комп'ютер
--
--  Кожне сповіщення дзвіночка (app_notifications) тепер ще й приходить
--  пушем на всі пристрої людини, де вона дозволила сповіщення:
--  доручили задачу, призначили на етап чи об'єкт, графік на завтра,
--  нагадування про звіт, платежі тощо.
--
--   • push_subscriptions — пристрої людини (браузер / встановлена програма);
--   • app_notifications.pushed_at — щоб одне сповіщення не пішло двічі;
--   • тригер після нового сповіщення викликає функцію push-send
--     (Supabase Edge Function), яка й надсилає пуш;
--   • ключі VAPID — у сховищі секретів (vault); push_vapid() читає їх
--     лише для службового ключа.
--  Плюс: сповіщення, коли людину призначили менеджером чи бригадиром об'єкта.
--
--  Перед змінами: копія app_notifications → backup.app_notifications_20261019
-- =====================================================================

create schema if not exists backup;
create table if not exists backup.app_notifications_20261019 as table public.app_notifications;

alter table public.app_notifications add column if not exists pushed_at timestamptz;

create table if not exists public.push_subscriptions (
    id            bigserial primary key,
    employee_id   integer not null references public.employees(id) on delete cascade,
    endpoint      text not null unique,
    p256dh        text not null,
    auth          text not null,
    user_agent    text,
    created_at    timestamptz not null default now(),
    last_ok_at    timestamptz,
    failed_count  integer not null default 0
);
create index if not exists push_subscriptions_employee_idx on public.push_subscriptions(employee_id);

-- Ключі VAPID (значення вставлено під час застосування, тут — заглушки)
do $$
begin
    if not exists (select 1 from vault.secrets where name = 'vapid_private_key') then
        perform vault.create_secret('<ЗАКРИТИЙ КЛЮЧ>', 'vapid_private_key');
        perform vault.create_secret('<ВІДКРИТИЙ КЛЮЧ>', 'vapid_public_key');
        perform vault.create_secret('mailto:kairosost38500@gmail.com', 'vapid_subject');
    end if;
end $$;

create or replace function public.push_vapid()
returns json
language sql
security definer
set search_path to 'public'
as $$
    select json_build_object(
        'public',  (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public_key'),
        'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private_key'),
        'subject', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_subject'));
$$;
revoke all on function public.push_vapid() from public, anon, authenticated;
grant execute on function public.push_vapid() to service_role;

-- Нове сповіщення → пуш (лише якщо в людини є пристрої)
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if exists (select 1 from push_subscriptions where employee_id = NEW.employee_id) then
        perform net.http_post(
            url := 'https://logxutaepqzmvgsvscle.supabase.co/functions/v1/push-send',
            body := jsonb_build_object('id', NEW.id),
            headers := jsonb_build_object('Content-Type', 'application/json'),
            timeout_milliseconds := 10000
        );
    end if;
    return NEW;
exception when others then
    return NEW;
end $$;

drop trigger if exists trg_push_on_notification on public.app_notifications;
create trigger trg_push_on_notification
    after insert on public.app_notifications
    for each row execute function public.push_on_notification();

-- Призначили менеджером чи бригадиром об'єкта → сповіщення цій людині
create or replace function public.notify_object_people()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_actor integer;
    v_place text;
    v_title text;
    v_emp   employees%rowtype;
    r       record;
begin
    select id into v_actor from employees where user_id = auth.uid();
    select populated_place into v_place from clients where custom_id = NEW.client_id;
    v_title := coalesce(NEW.name, 'Обʼєкт #' || NEW.custom_id) || coalesce(' · ' || v_place, '');

    for r in
        select 'manager' as what, NEW.responsible_emp_id as cid,
               case when TG_OP = 'UPDATE' then OLD.responsible_emp_id end as old_cid
        union all
        select 'brigadier', NEW.brigadier_emp_id,
               case when TG_OP = 'UPDATE' then OLD.brigadier_emp_id end
    loop
        continue when r.cid is null or r.cid is not distinct from r.old_cid;
        select * into v_emp from employees where custom_id = r.cid;
        continue when v_emp.id is null or v_emp.id = v_actor;
        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        values (v_emp.id, 'object_assigned',
                NEW.custom_id || ':' || r.what || ':' || extract(epoch from now())::bigint,
                case when r.what = 'manager' then 'Вас призначено відповідальним менеджером'
                     else 'Вас призначено бригадиром обʼєкта' end,
                v_title || E'\nСЕС-' || NEW.custom_id,
                case when v_emp.role = 'installer' then '/m/object/' else '/project/' end || NEW.custom_id)
        on conflict (employee_id, kind, ref_key) do nothing;
    end loop;
    return NEW;
exception when others then
    return NEW;
end $$;

drop trigger if exists trg_notify_object_people on public.installations;
create trigger trg_notify_object_people
    after insert or update of responsible_emp_id, brigadier_emp_id on public.installations
    for each row execute function public.notify_object_people();
