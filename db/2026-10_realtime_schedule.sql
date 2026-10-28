-- =====================================================================
--  K-CORE · Графік наживо (17.10.2026)
--
--  Вмикає штатні оновлення Supabase Realtime для таблиць графіка:
--  коли хтось змінює графік, відсутність, виїзд чи чернетку дня —
--  у всіх, у кого відкритий «Календар», це з'являється за секунду,
--  без перезавантаження сторінки.
--  Дані не змінюються; лише база починає повідомляти про зміни.
--  Відкат: alter publication supabase_realtime drop table <таблиця>;
-- =====================================================================

alter publication supabase_realtime add table
  public.installation_workers,
  public.attendance,
  public.schedule_day_drafts,
  public.installation_visit_plan,
  public.installation_visit_plan_employees;

-- Перевірка:
-- select tablename from pg_publication_tables where pubname = 'supabase_realtime';
