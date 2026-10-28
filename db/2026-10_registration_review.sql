-- =====================================================================
--  K-CORE · Підтвердження нових реєстрацій
--
--  НАВІЩО: зареєструватись на сторінці входу може будь-хто, але доступ
--  до CRM тепер відкривається лише після того, як адміністратор у
--  «Доступах» прив'яже акаунт до працівника (employees.user_id).
--  Для цього сама база змін НЕ потребує — підтвердження працює вже зараз.
--
--  Ця міграція додає лише можливість ВІДХИЛИТИ реєстрацію, щоб чужі
--  або помилкові акаунти не висіли в списку «чекають» вічно, і дату
--  реєстрації для нових записів:
--
--  created_at  — коли людина зареєструвалась (для старих рядків порожньо,
--                бо справжньої дати ми не знаємо).
--  rejected_at — коли адміністратор відхилив; порожньо = чекає.
--  rejected_by — хто відхилив.
--
--  Інтерфейс сам покаже кнопку «Відхилити» після цієї міграції
--  (src/utils/features.js → hasRegistrationReview).
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================

-- Спершу без значення за замовчуванням, щоб старі рядки лишились порожніми,
-- а не отримали сьогоднішню дату, ніби всі зареєструвались сьогодні.
ALTER TABLE user_site
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by integer REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE user_site
  ALTER COLUMN created_at SET DEFAULT now();


-- ---------------------------------------------------------------------
--  ПЕРЕВІРКА
-- ---------------------------------------------------------------------

-- 1) Колонки на місці (очікується 3 рядки)
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_site'
  AND column_name IN ('created_at', 'rejected_at', 'rejected_by');

-- 2) Скільки акаунтів зараз чекають на підтвердження
--    (на момент написання міграції — 8)
SELECT count(*) AS waiting
FROM user_site u
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.user_id)
  AND u.rejected_at IS NULL;
