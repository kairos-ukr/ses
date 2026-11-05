-- =====================================================================
--  Сповіщення (дзвіночок) — лише за останні два дні
--
--  Власник 04.11: «щоб відображались лише за два дні і перезаписувались,
--  бо зараз найстаріше від 21.10». Старіші за 48 годин записи
--  прибираються самі: щоразу, коли приходить нове сповіщення (окремого
--  планувальника в базі немає). Дзвіночок у програмі теж показує лише
--  останні 48 годин — навіть якщо нових сповіщень давно не було.
--
--  Повторно старі сповіщення не прийдуть: тригери пишуть їх лише на нову
--  подію (призначили, опублікували графік, подали звіт), а бот має свій
--  журнал надісланого (bot_personal_messages).
--
--  Копія до змін: backup.app_notifications_20261104
-- =====================================================================

create schema if not exists backup;

create table if not exists backup.app_notifications_20261104 as
    select * from public.app_notifications;

-- Разове прибирання накопиченого
delete from public.app_notifications
 where created_at < now() - interval '48 hours';

-- Далі — само собою, разом із кожним новим сповіщенням
create or replace function public.app_notifications_prune()
returns trigger
language plpgsql
as $$
begin
    delete from public.app_notifications
     where created_at < now() - interval '48 hours';
    return null;
end;
$$;

drop trigger if exists trg_app_notifications_prune on public.app_notifications;
create trigger trg_app_notifications_prune
    after insert on public.app_notifications
    for each statement execute function public.app_notifications_prune();

-- Пошук старих записів без перебору всієї таблиці
create index if not exists app_notifications_created
    on public.app_notifications (created_at);
