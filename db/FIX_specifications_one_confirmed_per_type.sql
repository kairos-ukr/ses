-- =====================================================================
--  FIX: дозволити ОДНУ затверджену специфікацію НА КОЖЕН ТИП об'єкта.
--
--  Стара логіка: unique-індекс "одна confirmed-специфікація на об'єкт"
--  (uq_specifications_one_confirmed_per_installation). Він створювався,
--  коли специфікація була одна. Тепер їх два типи на об'єкт:
--    notes = 'complectation'   — комплектація матеріалів
--    notes = 'comp_protection' — комплектація ел. захисту
--  Тому "матеріали" затверджені -> "захист" падає з помилкою 23505.
--
--  Нова логіка: одна confirmed-специфікація на пару (об'єкт, тип).
--  v_object_material_needs вже підсумовує ВСІ confirmed-специфікації
--  об'єкта, тож для забезпечення об'єктів нічого не змінюється.
-- =====================================================================

-- Прибираємо старе обмеження (воно могло бути створене як constraint або як index)
ALTER TABLE specifications DROP CONSTRAINT IF EXISTS uq_specifications_one_confirmed_per_installation;
DROP INDEX IF EXISTS uq_specifications_one_confirmed_per_installation;

-- Нове: унікальність confirmed у межах (об'єкт, тип специфікації).
-- COALESCE(notes,'') — щоб специфікації без типу теж не дублювались між собою.
CREATE UNIQUE INDEX IF NOT EXISTS uq_specifications_one_confirmed_per_type
ON specifications (installation_custom_id, COALESCE(notes, ''))
WHERE status = 'confirmed';
