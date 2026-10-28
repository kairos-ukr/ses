-- =====================================================================
--  K-CORE · Живі оновлення етапів
--  «Задачі → Етапи» оновлюються самі, коли хтось інший змінив етап.
--  Дані таблиці не змінюються — лише вмикається розсилка змін.
-- =====================================================================

do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workflow_events'
    ) then
        alter publication supabase_realtime add table public.workflow_events;
    end if;
end $$;
