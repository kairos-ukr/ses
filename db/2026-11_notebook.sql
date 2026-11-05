-- =====================================================================
--  «Задачі» → «Нотатник»: особисті нотатки з нагадуванням
--
--  Власник 04.11: «власний нотатник з нагадуванням, видно лише мені,
--  бот надсилає нагадування, або дозволити певним особам бачити».
--  Нотатки живуть у тій самій таблиці, що й нагадування «Мій день»
--  (personal_reminders): той самий автор, «кому показати» (shared_with)
--  і нагадування ботом у вибраний час (send_personal_reminders) —
--  нічого нового в боті не потрібно. Відрізняє їх is_note; нотатки не
--  «виконуються», їх можна закріпити вгорі (pinned).
--
--  Копія до змін: backup.personal_reminders_20261104
-- =====================================================================

create schema if not exists backup;

create table if not exists backup.personal_reminders_20261104 as
    select * from public.personal_reminders;

alter table public.personal_reminders
    add column if not exists is_note boolean not null default false,
    add column if not exists pinned  boolean not null default false;

comment on column public.personal_reminders.is_note is 'Нотатка з «Нотатника» (а не справа «Мій день»)';
comment on column public.personal_reminders.pinned  is 'Нотатку закріплено вгорі';

create index if not exists personal_reminders_owner_note
    on public.personal_reminders (owner_id, is_note);
