-- =====================================================================
--  K-CORE · Правила складу і нагадування забезпечення
--
--  Три речі, які досі трималися в головах людей:
--
--  1. МІНІМАЛЬНИЙ ЗАЛИШОК. Метизи, наконечники, стяжки, автомати
--     потрібні на кожному об'єкті. Коли їх лишилось два — пізно
--     дізнаватись про це на виїзді. Позиція тепер знає свій мінімум,
--     а закупівля бачить усе, що опустилось нижче.
--
--  2. ОДНА ПОЗИЦІЯ — ОДИН РЯДОК. «Кабель ПВ3 6мм», «ПВ-3 6 мм» і
--     «ПВ3 6 мм» — той самий товар, розмазаний по трьох рядках:
--     залишок кожного окремо малий, а разом — повна полиця. База
--     більше не дає створити позицію, назва якої після нормалізації
--     збігається з наявною. Дублікати, що вже накопичились, можна
--     обʼєднати: уся історія переходить на головну позицію. Непотрібну
--     позицію можна прибрати — видалити, а якщо є історія, в архів.
--
--  3. ЕЛЕКТРОЗАХИСТ. У КП він — один рядок «Електричний захист»,
--     а на складі — десяток автоматів, УЗІП і щиток. Розписати його
--     автоматично не можна, тож він випадав з поля зору аж до
--     комплектації, коли купувати вже пізно. Тепер об'єкт, якому
--     продали захист, нагадує сам: спершу — скласти специфікацію,
--     потім — забезпечити її. Щойно специфікацію затверджено, на все,
--     чого бракує, автоматично лягають заявки в закупівлю.
--
--  УВАГА: автоматичні заявки з цього файлу згодом вимкнено —
--  db/2026-09_supply_alerts_bot_ready.sql перевизначає refresh_object_supply
--  і supply_alert_set. Застосовувати обидва файли, у цьому порядку.
--
--  Застосовувати в Supabase → SQL Editor, цілим файлом.
--  Залежить від: 2026-07_warehouse_lifecycle.sql,
--                2026-07_procurement_requests.sql,
--                2026-09_provisioning_fixes.sql,
--                2026-09_commercial_offers.sql.
--
--  Наприкінці (блок H) нагадування заповнюються для наявних об'єктів,
--  але заявки для них НЕ створюються — щоб після міграції закупівля
--  не отримала лавину заявок по старих об'єктах. Для конкретного
--  об'єкта їх можна створити кнопкою в «Забезпеченні об'єктів».
-- =====================================================================


-- =====================================================================
--  БЛОК A · Ключ назви
--
--  Дзеркало normalizeName() із src/utils/nameMatching.js, лише без
--  пробілів: «ПВ3 6мм» і «ПВ-3 6 мм» дають один ключ. Кроки ті самі
--  й у тому самому порядку — інакше інтерфейс і база по-різному
--  вирішували б, що є дублікатом.
--
--  Великі кириличні літери переводимо явно: lower() у базі з
--  C-колацією чіпає лише латиницю.
--
--  УВАГА: name_key — збережена колонка. Якщо колись змінити цю
--  функцію, наявні ключі самі не перерахуються:
--    UPDATE nomenclature SET name = name;
-- =====================================================================

CREATE OR REPLACE FUNCTION nomenclature_name_key(p_name text, p_tech text DEFAULT NULL)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT NULLIF(
        regexp_replace(
            regexp_replace(
                translate(
                    translate(
                        regexp_replace(
                            lower(translate(
                                COALESCE(p_name, '') || ' ' || COALESCE(p_tech, ''),
                                'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЁЪЫЭ',
                                'абвгґдеєжзиіїйклмнопрстуфхцчшщьюяёъыэ')),
                            '[''’‘`"«»]', '', 'g'),
                        -- латинські двійники → кирилиця
                        'abcehikmoptxy', 'авсенікмортху'),
                    -- варіанти кириличних літер; ъ і ь просто зникають
                    'ёіїйєґъь', 'еиииег'),
                -- розміри: 4х6 / 4*6 / 4×6 / 4 x 6 → 4х6
                '(\d)\s*[х×*]\s*(\d)', '\1х\2', 'g'),
            -- усе, що не літера й не цифра, геть — разом із пробілами
            '[^a-zа-я0-9]+', '', 'g'),
        '');
$$;

ALTER TABLE nomenclature
    ADD COLUMN IF NOT EXISTS name_key text
        GENERATED ALWAYS AS (nomenclature_name_key(name, technical_characteristics)) STORED;

CREATE INDEX IF NOT EXISTS idx_nomenclature_name_key
    ON nomenclature (type, name_key) WHERE is_active;


-- =====================================================================
--  БЛОК B · Нові поля позиції
--
--  min_stock    — нижче цього вільного залишку позиція потрапляє в
--                 «Нижче мінімуму» у закупівлях. NULL — не стежимо.
--  target_stock — до скількох поповнювати. NULL — до мінімуму.
--  archived_*   — хто, коли й чому прибрав позицію з довідника.
--  merged_into_id — у яку позицію влили цей дубль.
-- =====================================================================

ALTER TABLE nomenclature
    ADD COLUMN IF NOT EXISTS min_stock      numeric,
    ADD COLUMN IF NOT EXISTS target_stock   numeric,
    ADD COLUMN IF NOT EXISTS archived_at    timestamptz,
    ADD COLUMN IF NOT EXISTS archived_by    integer REFERENCES employees(id),
    ADD COLUMN IF NOT EXISTS archive_reason text,
    ADD COLUMN IF NOT EXISTS merged_into_id bigint REFERENCES nomenclature(id);

ALTER TABLE nomenclature DROP CONSTRAINT IF EXISTS chk_nomenclature_stock_levels;
ALTER TABLE nomenclature ADD CONSTRAINT chk_nomenclature_stock_levels CHECK (
        (min_stock IS NULL OR min_stock >= 0)
    AND (target_stock IS NULL OR target_stock >= 0)
    AND (target_stock IS NULL OR min_stock IS NULL OR target_stock >= min_stock)
);

ALTER TABLE nomenclature DROP CONSTRAINT IF EXISTS chk_nomenclature_not_merged_into_self;
ALTER TABLE nomenclature ADD CONSTRAINT chk_nomenclature_not_merged_into_self
    CHECK (merged_into_id IS NULL OR merged_into_id <> id);


-- =====================================================================
--  БЛОК B2 · Заборона дублікатів
--
--  Тригер, а не лише унікальний індекс: у довіднику вже є пари
--  дублікатів, і індекс на такій таблиці просто не створиться. Тригер
--  не пускає НОВИХ двійників, не зачіпаючи старих, — їх прибирають
--  обʼєднанням (блок D).
--
--  Перевіряємо лише тоді, коли змінилось те, що робить позицію «тією
--  самою»: назва, характеристики, тип або повернення з архіву. Інакше
--  одна зі старої пари не дала б навіть поправити мінімум.
--
--  Унікальний індекс створюється, щойно дублікатів не лишилось. Після
--  обʼєднання дублікатів на складі цей DO-блок варто виконати ще раз.
-- =====================================================================

CREATE OR REPLACE FUNCTION nomenclature_reject_duplicate()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_key   text;
    v_other record;
BEGIN
    IF NOT NEW.is_active THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.is_active
       AND NEW.name IS NOT DISTINCT FROM OLD.name
       AND NEW.technical_characteristics IS NOT DISTINCT FROM OLD.technical_characteristics
       AND NEW.type IS NOT DISTINCT FROM OLD.type THEN
        RETURN NEW;
    END IF;

    -- Згенерована колонка в BEFORE-тригері ще не порахована, тому ключ — напряму
    v_key := nomenclature_name_key(NEW.name, NEW.technical_characteristics);
    IF v_key IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT id, name, sku INTO v_other
      FROM nomenclature
     WHERE is_active
       AND type = NEW.type
       AND name_key = v_key
       AND id IS DISTINCT FROM NEW.id
     ORDER BY id
     LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Така позиція вже є в довіднику: «%»%. Скористайтесь нею — друга картка розділить залишок на два рядки.',
            v_other.name,
            CASE WHEN v_other.sku IS NOT NULL THEN ' (' || v_other.sku || ')' ELSE '' END
            USING DETAIL = 'nomenclature_id=' || v_other.id;
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nomenclature_reject_duplicate ON nomenclature;
CREATE TRIGGER trg_nomenclature_reject_duplicate
    BEFORE INSERT OR UPDATE OF name, technical_characteristics, type, is_active ON nomenclature
    FOR EACH ROW EXECUTE FUNCTION nomenclature_reject_duplicate();

DO $$
DECLARE
    v_groups integer;
BEGIN
    SELECT count(*) INTO v_groups FROM (
        SELECT 1 FROM nomenclature
         WHERE is_active AND name_key IS NOT NULL
         GROUP BY type, name_key
        HAVING count(*) > 1
    ) d;

    IF v_groups = 0 THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_nomenclature_active_name_key
                   ON nomenclature (type, name_key)
                WHERE is_active AND name_key IS NOT NULL';
        RAISE NOTICE 'Дублікатів немає — унікальний індекс створено.';
    ELSE
        RAISE NOTICE 'У довіднику % груп дублікатів. Нових тригер не пустить; наявні обʼєднайте на складі («Дублікати») і виконайте цей блок ще раз.', v_groups;
    END IF;
END $$;


-- =====================================================================
--  БЛОК C · Звідки взялась заявка на закупівлю
--
--  manual          — людина натиснула «Замовити»
--  auto_protection — база сама: бракує позиції зі специфікації захисту
--
--  Автоматична заявка на пару (об'єкт, позиція) відкрита лише одна —
--  повторний перерахунок не плодить копій, а доповнює наявну.
-- =====================================================================

ALTER TABLE procurement_requests
    ADD COLUMN IF NOT EXISTS source varchar NOT NULL DEFAULT 'manual';

ALTER TABLE procurement_requests DROP CONSTRAINT IF EXISTS chk_procurement_requests_source;
ALTER TABLE procurement_requests ADD CONSTRAINT chk_procurement_requests_source
    CHECK (source IN ('manual', 'auto_protection'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_requests_auto_open
    ON procurement_requests (installation_custom_id, nomenclature_id)
    WHERE source <> 'manual' AND status IN ('requested', 'ordered');


-- =====================================================================
--  БЛОК D · Обʼєднання дублікатів і прибирання позиції
--
--  ОБʼЄДНАННЯ. Усе, що посилається на дубль, переходить на головну
--  позицію. Таблиці не перелічуємо руками: беремо всі зовнішні ключі
--  на nomenclature з каталогу. Так нова таблиця з посиланням на товар
--  не стане «забутою» — її рядки теж переїдуть.
--
--  Перед перенесенням розвʼязуємо те, що вдарилось би в унікальність:
--  рядки одного документа видачі, позиції однієї специфікації, бирки
--  носіїв і відкриті автоматичні заявки. Кількості складаються.
--
--  Назва дубліката стає памʼяттю співставлення: документ із такою
--  назвою надалі розпізнається як головна позиція.
--
--  Різні одиниці виміру або спосіб обліку — відмова: 10 «уп.» і 10 «шт»
--  не складаються, і мовчки перетворити одне на інше означало б
--  зіпсувати залишок.
--
--  SECURITY DEFINER — свідомо. Функція переписує рухи й резерви; якщо
--  політика доступу котроїсь таблиці не дозволяє UPDATE, звичайна
--  функція тихо пропустила б ці рядки, і історія розірвалась би
--  навпіл. Доступ — лише для авторизованих.
-- =====================================================================

CREATE OR REPLACE FUNCTION merge_nomenclature(
    p_source bigint,
    p_target bigint,
    p_emp    integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_src   nomenclature%ROWTYPE;
    v_dst   nomenclature%ROWTYPE;
    r_fk    record;
    r_si    record;
    v_rows  integer;
    v_moved jsonb := '{}'::jsonb;
BEGIN
    IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
    END IF;

    IF p_source = p_target THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'same');
    END IF;

    SELECT * INTO v_src FROM nomenclature WHERE id = p_source FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    SELECT * INTO v_dst FROM nomenclature WHERE id = p_target FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    IF NOT v_dst.is_active THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'target_archived');
    END IF;
    IF v_src.merged_into_id IS NOT NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'already_merged');
    END IF;
    IF v_src.type <> v_dst.type THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'type_mismatch');
    END IF;
    IF v_src.unit_id IS DISTINCT FROM v_dst.unit_id THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'unit_mismatch');
    END IF;
    IF v_src.tracking_mode IS DISTINCT FROM v_dst.tracking_mode THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'tracking_mismatch');
    END IF;

    -- 1. Документ видачі: одна позиція на документ (UNIQUE)
    UPDATE issue_order_items t
       SET requested_quantity = t.requested_quantity + s.requested_quantity,
           issued_quantity    = t.issued_quantity + s.issued_quantity,
           note = CASE WHEN s.note IS NULL THEN t.note
                       WHEN t.note IS NULL THEN s.note
                       ELSE t.note || '; ' || s.note END,
           updated_at = now()
      FROM issue_order_items s
     WHERE s.issue_order_id  = t.issue_order_id
       AND s.nomenclature_id = p_source
       AND t.nomenclature_id = p_target;

    DELETE FROM issue_order_items s
     USING issue_order_items t
     WHERE s.issue_order_id  = t.issue_order_id
       AND s.nomenclature_id = p_source
       AND t.nomenclature_id = p_target;

    -- 2. Специфікація: дві позиції того самого товару зводимо в одну,
    --    інакше sync_offer_need оновлював би обидві однаковою кількістю
    FOR r_si IN
        SELECT s.id AS src_id,
               s.quantity,
               (SELECT min(t.id) FROM specification_items t
                 WHERE t.specification_id = s.specification_id
                   AND t.nomenclature_id  = p_target) AS dst_id
          FROM specification_items s
         WHERE s.nomenclature_id = p_source
    LOOP
        CONTINUE WHEN r_si.dst_id IS NULL;
        UPDATE reservations SET specification_item_id = r_si.dst_id
         WHERE specification_item_id = r_si.src_id;
        UPDATE specification_items
           SET quantity = quantity + r_si.quantity, updated_at = now()
         WHERE id = r_si.dst_id;
        DELETE FROM specification_items WHERE id = r_si.src_id;
    END LOOP;

    -- 3. Бирки носіїв унікальні в межах позиції
    UPDATE stock_lots s
       SET label = s.label || '-' || s.id, updated_at = now()
     WHERE s.nomenclature_id = p_source
       AND EXISTS (SELECT 1 FROM stock_lots t
                    WHERE t.nomenclature_id = p_target AND t.label = s.label);

    -- 4. Відкрита автоматична заявка на пару (об'єкт, позиція) — одна
    UPDATE procurement_requests t
       SET quantity = t.quantity + s.quantity, updated_at = now()
      FROM procurement_requests s
     WHERE s.nomenclature_id = p_source
       AND t.nomenclature_id = p_target
       AND s.installation_custom_id = t.installation_custom_id
       AND s.source <> 'manual' AND t.source <> 'manual'
       AND s.status IN ('requested', 'ordered')
       AND t.status IN ('requested', 'ordered');

    DELETE FROM procurement_requests s
     USING procurement_requests t
     WHERE s.nomenclature_id = p_source
       AND t.nomenclature_id = p_target
       AND s.installation_custom_id = t.installation_custom_id
       AND s.source <> 'manual' AND t.source <> 'manual'
       AND s.status IN ('requested', 'ordered')
       AND t.status IN ('requested', 'ordered');

    -- 5. Решта посилань — усі зовнішні ключі на nomenclature з каталогу
    FOR r_fk IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f'
           AND c.confrelid = 'nomenclature'::regclass
           AND c.conrelid <> 'nomenclature'::regclass
           AND cardinality(c.conkey) = 1
    LOOP
        EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', r_fk.tbl, r_fk.col, r_fk.col)
           USING p_target, p_source;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        IF v_rows > 0 THEN
            v_moved := v_moved || jsonb_build_object(r_fk.tbl::text, v_rows);
        END IF;
    END LOOP;

    -- 6. Назва дубліката — памʼять для розпізнавання документів
    INSERT INTO supplier_mappings (supplier_item_name, nomenclature_id)
    VALUES (trim(v_src.name || ' ' || COALESCE(v_src.technical_characteristics, '')), p_target)
    ON CONFLICT (supplier_item_name) DO UPDATE SET nomenclature_id = EXCLUDED.nomenclature_id;

    -- 7. Мінімум переходить, якщо в головної його не було
    UPDATE nomenclature
       SET min_stock    = COALESCE(min_stock, v_src.min_stock),
           target_stock = CASE WHEN min_stock IS NULL THEN v_src.target_stock ELSE target_stock END,
           updated_at   = now(),
           updated_by   = COALESCE(p_emp, updated_by)
     WHERE id = p_target;

    UPDATE nomenclature
       SET is_active      = false,
           merged_into_id = p_target,
           archived_at    = now(),
           archived_by    = p_emp,
           archive_reason = 'Обʼєднано з #' || p_target || ' ' || v_dst.name,
           updated_at     = now(),
           updated_by     = COALESCE(p_emp, updated_by)
     WHERE id = p_source;

    RETURN jsonb_build_object('ok', true, 'source', p_source, 'target', p_target, 'moved', v_moved);
END $$;

REVOKE ALL ON FUNCTION merge_nomenclature(bigint, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION merge_nomenclature(bigint, bigint, integer) TO authenticated;


-- ---------------------------------------------------------------------
--  Прибрати позицію.
--    · Лежить на складі або в резерві — відмова: сховати товар, що
--      фізично є на полиці, означає його загубити.
--    · Потрібна діючим об'єктам — відмова: забезпечення її чекає.
--    · Жодної історії — видаляємо повністю.
--    · Є історія — в архів. Зникає зі списків і пошуку, історія лишається.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION nomenclature_retire(
    p_id     bigint,
    p_emp    integer DEFAULT NULL,
    p_reason text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
    v_item     nomenclature%ROWTYPE;
    v_on_hand  numeric;
    v_reserved numeric;
    v_need     numeric;
    v_used     boolean := false;
    r_fk       record;
BEGIN
    IF auth.uid() IS NULL AND session_user NOT IN ('postgres', 'supabase_admin') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
    END IF;

    SELECT * INTO v_item FROM nomenclature WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    SELECT COALESCE(SUM(quantity_on_hand), 0), COALESCE(SUM(quantity_reserved), 0)
      INTO v_on_hand, v_reserved
      FROM v_warehouse_stock_available
     WHERE nomenclature_id = p_id;

    IF abs(v_on_hand) > 0.0001 OR v_reserved > 0.0001 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'has_stock',
                                  'on_hand', v_on_hand, 'reserved', v_reserved);
    END IF;

    -- Лише діючі об'єкти: недовидане на давно закритих не має тримати довідник
    SELECT COALESCE(SUM(nd.outstanding_need), 0) INTO v_need
      FROM v_object_material_needs nd
      JOIN installations i ON i.custom_id = nd.installation_custom_id
     WHERE nd.nomenclature_id = p_id
       AND i.status IN ('planning', 'in_progress', 'pending', 'on_hold');

    IF v_need > 0.0001 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'in_need', 'need', v_need);
    END IF;

    -- Памʼять співставлень історією не вважаємо: без позиції вона безглузда
    FOR r_fk IN
        SELECT c.conrelid::regclass AS tbl, a.attname AS col
          FROM pg_constraint c
          JOIN pg_attribute a
            ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
         WHERE c.contype = 'f'
           AND c.confrelid = 'nomenclature'::regclass
           AND c.conrelid NOT IN ('nomenclature'::regclass, 'supplier_mappings'::regclass)
           AND cardinality(c.conkey) = 1
    LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', r_fk.tbl, r_fk.col)
           INTO v_used USING p_id;
        EXIT WHEN v_used;
    END LOOP;

    IF NOT v_used THEN
        v_used := EXISTS (SELECT 1 FROM nomenclature WHERE merged_into_id = p_id);
    END IF;

    -- Архівна позиція не повинна знаходитись за назвою з документа
    DELETE FROM supplier_mappings WHERE nomenclature_id = p_id;

    IF NOT v_used THEN
        DELETE FROM nomenclature WHERE id = p_id;
        RETURN jsonb_build_object('ok', true, 'result', 'deleted');
    END IF;

    UPDATE nomenclature
       SET is_active      = false,
           archived_at    = now(),
           archived_by    = p_emp,
           archive_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
           updated_at     = now(),
           updated_by     = COALESCE(p_emp, updated_by)
     WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'result', 'archived');
END $$;

REVOKE ALL ON FUNCTION nomenclature_retire(bigint, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION nomenclature_retire(bigint, integer, text) TO authenticated;


-- =====================================================================
--  БЛОК E · Нижче мінімального залишку
--
--  Порівнюємо ВІЛЬНИЙ залишок (фізично мінус резерви) плюс те, що вже
--  замовлено на склад і ще не приїхало. Замовлення під конкретний
--  об'єкт сюди не входять: вони поїдуть на об'єкт, а не на полицю.
--
--  to_order — скільки дозамовити, щоб дотягнути до target_stock
--  (або до мінімуму, якщо «поповнювати до» не задано).
-- =====================================================================

CREATE OR REPLACE VIEW v_stock_below_min AS
WITH stock AS (
    SELECT nomenclature_id,
           SUM(quantity_on_hand)   AS on_hand,
           SUM(quantity_reserved)  AS reserved,
           SUM(quantity_available) AS available
      FROM v_warehouse_stock_available
     GROUP BY nomenclature_id
),
received AS (
    SELECT purchase_order_item_id, SUM(quantity) AS qty
      FROM stock_movements
     WHERE operation_type = 'purchase' AND purchase_order_item_id IS NOT NULL
     GROUP BY purchase_order_item_id
),
incoming AS (
    SELECT poi.nomenclature_id,
           SUM(GREATEST(poi.quantity - COALESCE(rec.qty, 0), 0)) AS qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      LEFT JOIN received rec  ON rec.purchase_order_item_id = poi.id
     WHERE po.installation_custom_id IS NULL
       AND po.status IN ('draft', 'sent', 'partially_received')
     GROUP BY poi.nomenclature_id
)
SELECT
    n.id                                                AS nomenclature_id,
    n.name,
    n.sku,
    n.category_id,
    u.name                                              AS unit_name,
    n.min_stock,
    n.target_stock,
    COALESCE(s.on_hand, 0)::numeric                     AS on_hand,
    COALESCE(s.reserved, 0)::numeric                    AS reserved,
    COALESCE(s.available, 0)::numeric                   AS available,
    COALESCE(i.qty, 0)::numeric                         AS incoming,
    (COALESCE(s.available, 0) + COALESCE(i.qty, 0))::numeric AS projected,
    GREATEST(
        COALESCE(n.target_stock, n.min_stock)
        - (COALESCE(s.available, 0) + COALESCE(i.qty, 0)), 0
    )::numeric                                          AS to_order
FROM nomenclature n
LEFT JOIN units u    ON u.id = n.unit_id
LEFT JOIN stock s    ON s.nomenclature_id = n.id
LEFT JOIN incoming i ON i.nomenclature_id = n.id
WHERE n.is_active
  AND n.min_stock > 0
  AND COALESCE(s.available, 0) + COALESCE(i.qty, 0) < n.min_stock;

GRANT SELECT ON v_stock_below_min TO anon, authenticated;


-- =====================================================================
--  БЛОК F · Нагадування забезпечення
--
--  Один рядок на пару (об'єкт, вид нагадування). Рядок не
--  видаляється, а змінює стан:
--    open      — треба щось зробити
--    done      — умова зникла сама (специфікацію склали, захист
--                забезпечено, об'єкт закрили)
--    dismissed — людина сказала «не потрібно» (клієнт купує захист
--                сам, робимо поза системою). Такі не відкриваються
--                знову, хоч би що змінилось.
--  snoozed_until — «нагадай пізніше».
--  last_reminder_sent_at — для Telegram-бота, як у microtasks.
--
--  Види:
--    protection_spec   — захист продано (є в КП) або етап «Комплектація
--                        ел. захисту» в роботі, а специфікації немає.
--    protection_supply — специфікацію захисту затверджено, а частина
--                        позицій не покрита ні резервом, ні видачею.
-- =====================================================================

CREATE TABLE IF NOT EXISTS supply_alerts (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installation_custom_id  integer NOT NULL REFERENCES installations(custom_id),
    kind                    text    NOT NULL
        CHECK (kind IN ('protection_spec', 'protection_supply')),
    status                  text    NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'done', 'dismissed')),
    due_date                date,
    details                 jsonb   NOT NULL DEFAULT '{}'::jsonb,
    snoozed_until           date,
    opened_at               timestamptz NOT NULL DEFAULT now(),
    resolved_at             timestamptz,
    resolved_by             integer REFERENCES employees(id),
    resolution_note         text,
    last_reminder_sent_at   timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    UNIQUE (installation_custom_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_supply_alerts_open
    ON supply_alerts (status, due_date) WHERE status = 'open';

ALTER TABLE supply_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supply_alerts_authenticated" ON supply_alerts;
CREATE POLICY "supply_alerts_authenticated" ON supply_alerts
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ---------------------------------------------------------------------
--  Відкрити / закрити одне нагадування. Записує лише коли щось справді
--  змінилось — перерахунок на кожному відкритті сторінки не має
--  смикати updated_at.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION supply_alert_set(
    p_installation integer,
    p_kind         text,
    p_open         boolean,
    p_due          date  DEFAULT NULL,
    p_details      jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_open THEN
        INSERT INTO supply_alerts (installation_custom_id, kind, status, due_date, details)
        VALUES (p_installation, p_kind, 'open', p_due, COALESCE(p_details, '{}'::jsonb))
        ON CONFLICT (installation_custom_id, kind) DO UPDATE
           SET status        = CASE WHEN supply_alerts.status = 'dismissed' THEN 'dismissed' ELSE 'open' END,
               opened_at     = CASE WHEN supply_alerts.status = 'done' THEN now() ELSE supply_alerts.opened_at END,
               resolved_at   = CASE WHEN supply_alerts.status = 'done' THEN NULL ELSE supply_alerts.resolved_at END,
               snoozed_until = CASE WHEN supply_alerts.status = 'done' THEN NULL ELSE supply_alerts.snoozed_until END,
               last_reminder_sent_at = CASE WHEN supply_alerts.status = 'done' THEN NULL
                                            ELSE supply_alerts.last_reminder_sent_at END,
               due_date      = EXCLUDED.due_date,
               details       = EXCLUDED.details,
               updated_at    = now()
         WHERE supply_alerts.status = 'done'
            OR supply_alerts.due_date IS DISTINCT FROM EXCLUDED.due_date
            OR supply_alerts.details  IS DISTINCT FROM EXCLUDED.details;
    ELSE
        UPDATE supply_alerts
           SET status = 'done', resolved_at = now(), updated_at = now()
         WHERE installation_custom_id = p_installation
           AND kind = p_kind
           AND status = 'open';
    END IF;
END $$;


-- ---------------------------------------------------------------------
--  Перерахунок одного об'єкта.
--
--  p_create_requests — чи ставити заявки на те, чого бракує. Тригери
--  (момент затвердження специфікації) викликають з true; перерахунок
--  при відкритті сторінки — з false, щоб перегляд нічого не замовляв.
--
--  Скільки купувати: непокрита потреба мінус те, що вже в дорозі або
--  замовлено, мінус відкриті заявки, мінус вільне на складах. Вільне
--  не купуємо — його треба зарезервувати, і нагадування про це лишиться
--  відкритим, поки резерву немає.
--
--  Відхилену закупівельником автоматичну заявку не створюємо знову:
--  «ні» людини важливіше за правило.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_object_supply(
    p_installation    integer,
    p_create_requests boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_inst        installations%ROWTYPE;
    v_live        boolean;
    v_offer_has   boolean;
    v_offer_date  date;
    v_stage       text;
    v_spec_id     bigint;
    v_spec_date   date;
    v_positions   integer := 0;
    v_missing     integer := 0;
    v_reservable  integer := 0;
    v_created     integer := 0;
    v_to_buy      numeric;
    v_rows        integer;
    r             record;
BEGIN
    SELECT * INTO v_inst FROM installations WHERE custom_id = p_installation;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'installation_not_found');
    END IF;

    -- На паузі й закриті об'єкти не нагадують і нічого не замовляють
    v_live := COALESCE(v_inst.status, '') IN ('planning', 'in_progress', 'pending');

    SELECT EXISTS (SELECT 1 FROM commercial_offer_items i
                    WHERE i.offer_id = o.id AND i.category_key = 'protection'),
           o.created_at::date
      INTO v_offer_has, v_offer_date
      FROM commercial_offers o
     WHERE o.installation_custom_id = p_installation
       AND o.is_current
     LIMIT 1;
    v_offer_has := COALESCE(v_offer_has, false);

    SELECT status INTO v_stage
      FROM project_stages
     WHERE installation_custom_id = p_installation
       AND stage_key = 'comp_protection'
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1;

    SELECT id, confirmed_at::date INTO v_spec_id, v_spec_date
      FROM specifications
     WHERE installation_custom_id = p_installation
       AND notes = 'comp_protection'
       AND status = 'confirmed'
     ORDER BY version DESC
     LIMIT 1;

    -- КРОК 1 · Скласти специфікацію.
    -- «Виконано» на етапі без специфікації — рішення людини (зробили
    -- поза системою), тому таке не нагадуємо.
    PERFORM supply_alert_set(
        p_installation, 'protection_spec',
        v_live
            AND v_spec_id IS NULL
            AND (v_offer_has OR v_stage = 'in_progress')
            AND v_stage IS DISTINCT FROM 'done',
        COALESCE(v_inst.start_date - 14, v_offer_date + 3),
        jsonb_build_object('from_offer', v_offer_has, 'stage_status', v_stage)
    );

    -- КРОК 2 · Забезпечити специфікацію
    IF v_spec_id IS NOT NULL THEN
        FOR r IN
            SELECT it.nomenclature_id,
                   nd.outstanding_need                        AS left_qty,
                   COALESCE(inc.incoming_quantity, 0)         AS incoming,
                   COALESCE(req.requested, 0)                 AS requested,
                   COALESCE(req.ordered, 0)                   AS ordered,
                   COALESCE(req.rejected_auto, false)         AS rejected_auto,
                   GREATEST(COALESCE(st.available, 0), 0)     AS free_stock
              FROM (SELECT DISTINCT nomenclature_id
                      FROM specification_items
                     WHERE specification_id = v_spec_id) it
              JOIN v_object_material_needs nd
                ON nd.installation_custom_id = p_installation
               AND nd.nomenclature_id        = it.nomenclature_id
              LEFT JOIN v_object_incoming inc
                ON inc.installation_custom_id = p_installation
               AND inc.nomenclature_id        = it.nomenclature_id
              LEFT JOIN LATERAL (
                    SELECT SUM(pr.quantity) FILTER (WHERE pr.status = 'requested') AS requested,
                           SUM(pr.quantity) FILTER (WHERE pr.status = 'ordered')   AS ordered,
                           bool_or(pr.source <> 'manual' AND pr.status = 'rejected') AS rejected_auto
                      FROM procurement_requests pr
                     WHERE pr.installation_custom_id = p_installation
                       AND pr.nomenclature_id        = it.nomenclature_id
              ) req ON true
              LEFT JOIN LATERAL (
                    SELECT SUM(w.quantity_available) AS available
                      FROM v_warehouse_stock_available w
                     WHERE w.nomenclature_id = it.nomenclature_id
              ) st ON true
        LOOP
            v_positions := v_positions + 1;
            CONTINUE WHEN r.left_qty <= 0;

            v_missing := v_missing + 1;
            IF r.free_stock > 0 THEN
                v_reservable := v_reservable + 1;
            END IF;

            -- Замовлене без прив'язки до об'єкта в «дорозі» не видно,
            -- тому з двох оцінок беремо більшу, а не суму — інакше те
            -- саме замовлення відняли б двічі
            v_to_buy := r.left_qty - GREATEST(r.incoming, r.ordered) - r.requested - r.free_stock;

            IF p_create_requests AND v_live AND v_to_buy > 0 AND NOT r.rejected_auto THEN
                INSERT INTO procurement_requests (
                    installation_custom_id, nomenclature_id, quantity, status, note, source
                ) VALUES (
                    p_installation, r.nomenclature_id, v_to_buy, 'requested',
                    'Автоматично: електрозахист об''єкта', 'auto_protection'
                )
                ON CONFLICT (installation_custom_id, nomenclature_id)
                    WHERE source <> 'manual' AND status IN ('requested', 'ordered')
                DO UPDATE SET quantity   = procurement_requests.quantity + EXCLUDED.quantity,
                              updated_at = now()
                    WHERE procurement_requests.status = 'requested';
                GET DIAGNOSTICS v_rows = ROW_COUNT;
                v_created := v_created + v_rows;
            END IF;
        END LOOP;
    END IF;

    PERFORM supply_alert_set(
        p_installation, 'protection_supply',
        v_live AND v_spec_id IS NOT NULL AND v_missing > 0,
        COALESCE(v_inst.start_date - 7, v_spec_date + 5),
        jsonb_build_object('positions', v_positions, 'missing', v_missing,
                           'reservable', v_reservable, 'spec_id', v_spec_id)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'positions', v_positions,
        'missing', v_missing,
        'reservable', v_reservable,
        'requests_created', v_created
    );
END $$;

GRANT EXECUTE ON FUNCTION refresh_object_supply(integer, boolean) TO anon, authenticated;


-- ---------------------------------------------------------------------
--  Перерахунок усіх діючих об'єктів (і тих, де ще висить нагадування —
--  щоб закрити його, якщо об'єкт уже не діючий). Один збійний об'єкт
--  не зупиняє решту.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_supply_alerts(p_create_requests boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    r        record;
    v_done   integer := 0;
    v_failed integer := 0;
    -- Причини збоїв повертаємо в результаті: WARNING у SQL Editor не видно
    v_errors jsonb := '[]'::jsonb;
BEGIN
    FOR r IN
        SELECT custom_id FROM installations
         WHERE status IN ('planning', 'in_progress', 'pending')
        UNION
        SELECT installation_custom_id FROM supply_alerts WHERE status = 'open'
    LOOP
        BEGIN
            PERFORM refresh_object_supply(r.custom_id, p_create_requests);
            v_done := v_done + 1;
        EXCEPTION WHEN OTHERS THEN
            v_failed := v_failed + 1;
            v_errors := v_errors || jsonb_build_object(
                'installation', r.custom_id, 'code', SQLSTATE, 'error', SQLERRM);
            RAISE WARNING 'refresh_object_supply(%): %', r.custom_id, SQLERRM;
        END;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'objects', v_done, 'failed', v_failed, 'errors', v_errors);
END $$;

GRANT EXECUTE ON FUNCTION refresh_supply_alerts(boolean) TO anon, authenticated;


-- ---------------------------------------------------------------------
--  Відкриті нагадування для інтерфейсу й бота
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_supply_alerts AS
SELECT
    a.id,
    a.installation_custom_id,
    a.kind,
    a.status,
    a.due_date,
    a.details,
    a.snoozed_until,
    a.opened_at,
    a.last_reminder_sent_at,
    i.name        AS installation_name,
    i.status      AS installation_status,
    i.start_date,
    c.name        AS client_name,
    c.company_name,
    (a.due_date IS NOT NULL AND a.due_date < current_date) AS is_overdue
FROM supply_alerts a
JOIN installations i ON i.custom_id = a.installation_custom_id
LEFT JOIN clients c  ON c.custom_id = i.client_id
WHERE a.status = 'open'
  AND (a.snoozed_until IS NULL OR a.snoozed_until <= current_date);

GRANT SELECT ON v_supply_alerts TO anon, authenticated;


-- =====================================================================
--  БЛОК G · Коли перераховувати
--
--  Нагадування — допоміжна річ. Її збій не має зривати затвердження
--  специфікації, збереження КП чи зміну статусу об'єкта, тож кожен
--  тригер кличе перерахунок через «безпечну» обгортку.
--
--  Специфікація й позиції зберігаються окремими запитами: спершу
--  шапка, потім позиції. Тому тригер стоїть і на позиціях — саме після
--  них є що порівнювати і на що ставити заявки. На позиціях тригер
--  рівня інструкції: сто рядків однією вставкою — один перерахунок.
-- =====================================================================

CREATE OR REPLACE FUNCTION refresh_object_supply_safe(p_installation integer)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_installation IS NULL THEN
        RETURN;
    END IF;
    PERFORM refresh_object_supply(p_installation, true);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'refresh_object_supply(%) failed: %', p_installation, SQLERRM;
END $$;


-- Специфікацію захисту затвердили, заархівували або створили
CREATE OR REPLACE FUNCTION trg_supply_on_specification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM refresh_object_supply_safe(NEW.installation_custom_id);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_specifications_supply ON specifications;
CREATE TRIGGER trg_specifications_supply
    AFTER INSERT OR UPDATE OF status ON specifications
    FOR EACH ROW
    WHEN (NEW.notes = 'comp_protection')
    EXECUTE FUNCTION trg_supply_on_specification();


-- Позиції специфікації захисту
CREATE OR REPLACE FUNCTION trg_supply_on_spec_items()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_inst integer;
BEGIN
    IF TG_OP = 'DELETE' THEN
        FOR v_inst IN
            SELECT DISTINCT s.installation_custom_id
              FROM old_rows o
              JOIN specifications s ON s.id = o.specification_id
             WHERE s.notes = 'comp_protection'
        LOOP
            PERFORM refresh_object_supply_safe(v_inst);
        END LOOP;
    ELSE
        FOR v_inst IN
            SELECT DISTINCT s.installation_custom_id
              FROM new_rows n
              JOIN specifications s ON s.id = n.specification_id
             WHERE s.notes = 'comp_protection'
        LOOP
            PERFORM refresh_object_supply_safe(v_inst);
        END LOOP;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_spec_items_supply_ins ON specification_items;
CREATE TRIGGER trg_spec_items_supply_ins
    AFTER INSERT ON specification_items
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION trg_supply_on_spec_items();

DROP TRIGGER IF EXISTS trg_spec_items_supply_upd ON specification_items;
CREATE TRIGGER trg_spec_items_supply_upd
    AFTER UPDATE ON specification_items
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION trg_supply_on_spec_items();

DROP TRIGGER IF EXISTS trg_spec_items_supply_del ON specification_items;
CREATE TRIGGER trg_spec_items_supply_del
    AFTER DELETE ON specification_items
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION trg_supply_on_spec_items();


-- Позиції КП: з'явився або зник рядок «Електричний захист»
CREATE OR REPLACE FUNCTION trg_supply_on_offer_items()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_inst integer;
BEGIN
    IF TG_OP = 'DELETE' THEN
        FOR v_inst IN
            SELECT DISTINCT o.installation_custom_id
              FROM old_rows r
              JOIN commercial_offers o ON o.id = r.offer_id
             WHERE o.is_current
        LOOP
            PERFORM refresh_object_supply_safe(v_inst);
        END LOOP;
    ELSE
        FOR v_inst IN
            SELECT DISTINCT o.installation_custom_id
              FROM new_rows r
              JOIN commercial_offers o ON o.id = r.offer_id
             WHERE o.is_current
        LOOP
            PERFORM refresh_object_supply_safe(v_inst);
        END LOOP;
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_offer_items_supply_ins ON commercial_offer_items;
CREATE TRIGGER trg_offer_items_supply_ins
    AFTER INSERT ON commercial_offer_items
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION trg_supply_on_offer_items();

DROP TRIGGER IF EXISTS trg_offer_items_supply_upd ON commercial_offer_items;
CREATE TRIGGER trg_offer_items_supply_upd
    AFTER UPDATE ON commercial_offer_items
    REFERENCING NEW TABLE AS new_rows
    FOR EACH STATEMENT EXECUTE FUNCTION trg_supply_on_offer_items();

DROP TRIGGER IF EXISTS trg_offer_items_supply_del ON commercial_offer_items;
CREATE TRIGGER trg_offer_items_supply_del
    AFTER DELETE ON commercial_offer_items
    REFERENCING OLD TABLE AS old_rows
    FOR EACH STATEMENT EXECUTE FUNCTION trg_supply_on_offer_items();


-- Чинною стала інша версія КП
CREATE OR REPLACE FUNCTION trg_supply_on_offer()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM refresh_object_supply_safe(NEW.installation_custom_id);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_offers_supply ON commercial_offers;
CREATE TRIGGER trg_commercial_offers_supply
    AFTER UPDATE OF is_current ON commercial_offers
    FOR EACH ROW
    WHEN (OLD.is_current IS DISTINCT FROM NEW.is_current)
    EXECUTE FUNCTION trg_supply_on_offer();


-- Етап «Комплектація ел. захисту» взяли в роботу або закрили
CREATE OR REPLACE FUNCTION trg_supply_on_stage()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM refresh_object_supply_safe(NEW.installation_custom_id);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_project_stages_supply ON project_stages;
CREATE TRIGGER trg_project_stages_supply
    AFTER INSERT OR UPDATE OF status ON project_stages
    FOR EACH ROW
    WHEN (NEW.stage_key = 'comp_protection')
    EXECUTE FUNCTION trg_supply_on_stage();


-- Об'єкт поставили на паузу, закрили, відновили або зсунули старт
CREATE OR REPLACE FUNCTION trg_supply_on_installation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM refresh_object_supply_safe(NEW.custom_id);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_installations_supply ON installations;
CREATE TRIGGER trg_installations_supply
    AFTER UPDATE OF status, start_date ON installations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
       OR OLD.start_date IS DISTINCT FROM NEW.start_date)
    EXECUTE FUNCTION trg_supply_on_installation();


-- =====================================================================
--  БЛОК H · Початкове заповнення
--
--  Лише нагадування, без заявок (див. шапку файлу).
-- =====================================================================

SELECT refresh_supply_alerts(false);


-- =====================================================================
--  БЛОК I · Перевірка
-- =====================================================================

-- Групи дублікатів, що накопичились до цієї міграції:
-- SELECT type, name_key, count(*) AS n,
--        array_agg(id ORDER BY id)   AS ids,
--        array_agg(name ORDER BY id) AS names
--   FROM nomenclature
--  WHERE is_active AND name_key IS NOT NULL
--  GROUP BY type, name_key
-- HAVING count(*) > 1
--  ORDER BY n DESC;

-- Що нижче мінімуму:
-- SELECT * FROM v_stock_below_min ORDER BY to_order DESC;

-- Відкриті нагадування:
-- SELECT * FROM v_supply_alerts ORDER BY due_date NULLS LAST;

-- Ключ назви (має дати однаковий результат для обох):
-- SELECT nomenclature_name_key('Кабель ПВ3 6мм'), nomenclature_name_key('кабель пв-3 6 мм');
