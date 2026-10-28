-- =====================================================================
--  K-CORE · Один довідник обладнання — складська номенклатура
--
--  НАВІЩО: обладнання було записане в трьох місцях:
--    • equipment   (9)   — моделі для «Обладнання на об'єктах» (S/N, логіни)
--    • equipments  (47)  — «Прайс обладнання» з цінами
--    • nomenclature (262) — склад
--  Та сама модель жила в різних списках під різними назвами, і ціна
--  з прайсу ніяк не була пов'язана зі складом.
--
--  Тепер єдиний довідник — nomenclature. Ця міграція:
--   1. додає в номенклатуру ціну продажу (sale_price + валюта) —
--      те, що раніше було в прайсі;
--   2. кожну модель зі старих довідників знаходить у номенклатурі
--      (за тим самим ключем назви, що й захист від дублікатів складу),
--      а якщо її там немає — створює в потрібній категорії;
--   3. прив'язує встановлене на об'єктах обладнання до номенклатури
--      (installed_equipment.nomenclature_id);
--   4. переносить ціни з прайсу.
--  Старі таблиці лишаються як архів (з позначкою, куди що перенесено),
--  але програма їх більше не використовує.
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================

-- ---------------------------------------------------------------------
--  1. Ціна продажу в номенклатурі
-- ---------------------------------------------------------------------

ALTER TABLE nomenclature
  ADD COLUMN IF NOT EXISTS sale_price            numeric(14,2),
  ADD COLUMN IF NOT EXISTS sale_currency         text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS sale_price_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nomenclature_sale_price_check') THEN
    ALTER TABLE nomenclature ADD CONSTRAINT nomenclature_sale_price_check
      CHECK ((sale_price IS NULL OR sale_price >= 0) AND sale_currency IN ('USD', 'UAH'));
  END IF;
END $$;


-- ---------------------------------------------------------------------
--  2. Категорія для логерів (у складі такої не було)
-- ---------------------------------------------------------------------

INSERT INTO categories (name, parent_id)
SELECT 'Логери', NULL
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name = 'Логери');


-- ---------------------------------------------------------------------
--  3. Допоміжні функції (тимчасові, лише на час міграції)
-- ---------------------------------------------------------------------

-- Категорія за шляхом назв від кореня: {'Інвертор','Гібридний','1-фазний'}
CREATE OR REPLACE FUNCTION pg_temp.category_by_path(p_path text[])
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_id bigint := NULL;
    v_part text;
BEGIN
    FOREACH v_part IN ARRAY p_path LOOP
        SELECT id INTO v_id FROM categories
         WHERE name = v_part AND parent_id IS NOT DISTINCT FROM v_id
         ORDER BY id LIMIT 1;
        IF v_id IS NULL THEN
            -- немає такої гілки — беремо «Інше»
            SELECT id INTO v_id FROM categories WHERE parent_id IS NULL AND name = 'Інше' ORDER BY id LIMIT 1;
            RETURN v_id;
        END IF;
    END LOOP;
    RETURN v_id;
END $$;

-- Знайти модель у номенклатурі або створити її
CREATE OR REPLACE FUNCTION pg_temp.equip_to_nom(p_brand text, p_model text, p_category bigint, p_power numeric, p_phase text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE
    v_brand text := NULLIF(btrim(p_brand), '');
    v_name  text := btrim(regexp_replace(COALESCE(p_model, ''), '\s+', ' ', 'g'));
    v_id    bigint;
BEGIN
    -- службові префікси старого довідника: «Ін S5-GC30K», «лог WIFI …»
    v_name := regexp_replace(v_name, '^(ін|лог)\s+', '', 'i');
    -- назва, що починається з бренду («DEYE SUN-10K…»): бренд і так у своєму полі
    IF v_brand IS NOT NULL AND lower(v_name) LIKE lower(v_brand) || ' %'
       AND length(v_name) - length(v_brand) > 6 THEN
        v_name := btrim(substr(v_name, length(v_brand) + 2));
    END IF;
    -- модель без літер («11.7») сама нічого не каже — додаємо бренд
    IF v_name !~ '[A-Za-zА-Яа-яІіЇїЄєҐґ]{2,}' AND v_brand IS NOT NULL THEN
        v_name := v_brand || ' ' || v_name;
    END IF;

    -- Ключ лише за НАЗВОЮ, без характеристик: у складі модель часто має заповнені
    -- характеристики («6», «5.12 кВт»), а в старих довідниках їх немає. Якщо
    -- порівнювати готовий name_key (назва + характеристики), такі моделі не
    -- знаходяться і створюються повторно — саме так і сталося при першому
    -- застосуванні 15.10.2026 (виправлено міграцією single_equipment_catalog_dedupe).
    -- Об'єднані позиції ведемо на головну.
    SELECT COALESCE(n.merged_into_id, n.id) INTO v_id
      FROM nomenclature n
     WHERE n.type = 'good'
       AND nomenclature_name_key(n.name) IN (nomenclature_name_key(v_name), nomenclature_name_key(COALESCE(v_brand, '') || ' ' || v_name))
     ORDER BY n.is_active DESC, (n.merged_into_id IS NULL) DESC, n.id
     LIMIT 1;

    IF v_id IS NULL THEN
        INSERT INTO nomenclature (type, category_id, unit_id, name, brand, is_active, specifications)
        VALUES ('good', p_category, (SELECT id FROM units WHERE name = 'Штука' ORDER BY id LIMIT 1),
                v_name, v_brand, true,
                jsonb_strip_nulls(jsonb_build_object('power_kw', p_power, 'phases', NULLIF(p_phase, '—'))))
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END $$;


-- ---------------------------------------------------------------------
--  4. Старі довідники → номенклатура (зв'язок записуємо в самі таблиці)
-- ---------------------------------------------------------------------

ALTER TABLE equipment  ADD COLUMN IF NOT EXISTS nomenclature_id bigint REFERENCES nomenclature(id);
ALTER TABLE equipments ADD COLUMN IF NOT EXISTS nomenclature_id bigint REFERENCES nomenclature(id);

UPDATE equipment e
   SET nomenclature_id = pg_temp.equip_to_nom(
         e.manufacturer, e.name,
         pg_temp.category_by_path(CASE e.category
             WHEN 'inverter'    THEN ARRAY['Інвертор']
             WHEN 'solar_panel' THEN ARRAY['Сонячні панелі']
             WHEN 'battery'     THEN ARRAY['АКБ']
             WHEN 'logger'      THEN ARRAY['Логери']
             ELSE ARRAY['Інше'] END),
         e.power_kw::numeric, NULL)
 WHERE e.nomenclature_id IS NULL;

UPDATE equipments q
   SET nomenclature_id = pg_temp.equip_to_nom(
         q.brand, q.model,
         pg_temp.category_by_path(CASE q.system_type
             WHEN 'звичайний гібрид' THEN CASE q.phase_count
                     WHEN '1-фазний' THEN ARRAY['Інвертор', 'Гібридний', '1-фазний']
                     WHEN '3-фазний' THEN ARRAY['Інвертор', 'Гібридний', '3-фазний', 'Низьковольтний']
                     ELSE ARRAY['Інвертор', 'Гібридний'] END
             WHEN 'високовольтний' THEN ARRAY['Інвертор', 'Гібридний', '3-фазний', 'Високовольтний']
             WHEN 'мережевий'      THEN ARRAY['Інвертор', 'Мережевий']
             WHEN 'акб'            THEN ARRAY['АКБ']
             WHEN 'панелі'         THEN ARRAY['Сонячні панелі']
             ELSE ARRAY['Інше'] END),
         q.power_kw, q.phase_count)
 WHERE q.nomenclature_id IS NULL;


-- ---------------------------------------------------------------------
--  5. Обладнання на об'єктах → номенклатура
-- ---------------------------------------------------------------------

ALTER TABLE installed_equipment
  ADD COLUMN IF NOT EXISTS nomenclature_id bigint REFERENCES nomenclature(id) ON DELETE RESTRICT;

ALTER TABLE installed_equipment ALTER COLUMN equipment_id DROP NOT NULL;

UPDATE installed_equipment ie
   SET nomenclature_id = e.nomenclature_id
  FROM equipment e
 WHERE e.id = ie.equipment_id
   AND ie.nomenclature_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_installed_equipment_nomenclature ON installed_equipment (nomenclature_id);
CREATE INDEX IF NOT EXISTS idx_installed_equipment_installation ON installed_equipment (installation_custom_id);


-- ---------------------------------------------------------------------
--  6. Ціни з прайсу (у доларах, як і були) — лише туди, де ціни ще немає
-- ---------------------------------------------------------------------

UPDATE nomenclature n
   SET sale_price            = p.price,
       sale_currency         = 'USD',
       sale_price_updated_at = COALESCE(p.updated_at::timestamptz, now())
  FROM (
        SELECT DISTINCT ON (nomenclature_id) nomenclature_id, price, updated_at
          FROM equipments
         WHERE nomenclature_id IS NOT NULL AND price IS NOT NULL AND price > 0
         ORDER BY nomenclature_id, updated_at DESC NULLS LAST, id DESC
       ) p
 WHERE n.id = p.nomenclature_id
   AND n.sale_price IS NULL;


-- ---------------------------------------------------------------------
--  7. Старі таблиці — архів
-- ---------------------------------------------------------------------

COMMENT ON TABLE equipment  IS 'АРХІВ (2026-10): довідник обладнання перенесено в nomenclature, див. equipment.nomenclature_id. Програмою не використовується.';
COMMENT ON TABLE equipments IS 'АРХІВ (2026-10): прайс перенесено в nomenclature.sale_price, див. equipments.nomenclature_id. Програмою не використовується.';


-- ---------------------------------------------------------------------
--  ПЕРЕВІРКА
-- ---------------------------------------------------------------------

-- 1) Усе встановлене обладнання прив'язане до номенклатури (очікується 0)
SELECT count(*) AS installed_without_nomenclature
FROM installed_equipment WHERE nomenclature_id IS NULL;

-- 2) Кожна модель старих довідників має відповідник (очікується 0 і 0)
SELECT (SELECT count(*) FROM equipment  WHERE nomenclature_id IS NULL) AS equipment_unmapped,
       (SELECT count(*) FROM equipments WHERE nomenclature_id IS NULL) AS equipments_unmapped;

-- 3) Скільки моделей з цінами тепер у номенклатурі
SELECT count(*) AS priced_items FROM nomenclature WHERE sale_price IS NOT NULL;
