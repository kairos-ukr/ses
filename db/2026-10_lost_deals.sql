-- =====================================================================
--  K-CORE · Статус «Втрачено» з причиною
--
--  НАВІЩО: угоди, які не відбулись, місяцями висіли «активними» на етапі
--  КП (на 15.10.2026 — 29 об'єктів із медіаною 135 днів без руху). Вони
--  роздувають воронку й ховають справжні проблеми.
--
--  Тепер об'єкт можна закрити як «Втрачено» з причиною:
--    price      — ціна
--    competitor — обрав конкурента
--    postponed  — відклав
--    no_contact — не на зв'язку
--    other      — інше (деталі в коментарі)
--
--  «Втрачено» ≠ «Скасовано»: втрачено — клієнт так і не став клієнтом;
--  скасовано — домовились, але роботу потім скасували.
--
--  lost_stage — на якому етапі втратили (для аналітики «де губимо»).
--  Забезпечення й нагадування складу вже рахують лише planning /
--  in_progress, тож втрачені об'єкти туди автоматично не потрапляють.
--
--  Інтерфейс сам покаже «Втрачено» після цієї міграції
--  (src/utils/features.js → hasLostDeals).
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================

ALTER TABLE installations
  ADD COLUMN IF NOT EXISTS lost_reason  text,
  ADD COLUMN IF NOT EXISTS lost_comment text,
  ADD COLUMN IF NOT EXISTS lost_at      timestamptz,
  ADD COLUMN IF NOT EXISTS lost_stage   text;

-- Лише відомі причини, і «Втрачено» — завжди з причиною
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installations_lost_reason_check') THEN
    ALTER TABLE installations ADD CONSTRAINT installations_lost_reason_check
      CHECK (lost_reason IS NULL OR lost_reason IN ('price', 'competitor', 'postponed', 'no_contact', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installations_lost_needs_reason') THEN
    ALTER TABLE installations ADD CONSTRAINT installations_lost_needs_reason
      CHECK (status IS DISTINCT FROM 'lost' OR lost_reason IS NOT NULL);
  END IF;
END $$;


-- ---------------------------------------------------------------------
--  ПЕРЕВІРКА
-- ---------------------------------------------------------------------

-- 1) Колонки на місці (очікується 4 рядки)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'installations'
  AND column_name IN ('lost_reason', 'lost_comment', 'lost_at', 'lost_stage');

-- 2) Кандидати на розбір: активні об'єкти на етапі КП без жодної події понад 60 днів.
--    Нічого не змінює — лише список, щоб пройтись по ньому в картках
--    і закрити як «Втрачено» ті, що справді не відбулись.
SELECT i.custom_id,
       i.name,
       i.status,
       (now()::date - COALESCE(max(e.created_at), i.updated_at, i.created_at)::date) AS days_idle
FROM installations i
LEFT JOIN workflow_events e ON e.installation_custom_id = i.custom_id
WHERE i.status IN ('planning', 'in_progress', 'on_hold')
  AND i.workflow_stage IN ('proposal', 'commercial_proposal')
GROUP BY i.custom_id, i.name, i.status, i.updated_at, i.created_at
HAVING now() - COALESCE(max(e.created_at), i.updated_at, i.created_at) > interval '60 days'
ORDER BY days_idle DESC;
