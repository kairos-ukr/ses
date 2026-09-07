-- =====================================================================
--  K-CORE · Оцифрована комерційна пропозиція
--
--  НАВІЩО: КП — це вихідна точка проєкту. У ній зафіксовано, що саме
--  ми пообіцяли клієнту і за які гроші. Досі вона жила лише як PDF на
--  Google Drive: подивитись можна, порахувати — ні. Через це
--  «вартість угоди» в картці об'єкта вбивали руками, а порівняти
--  обіцяне із фактично закупленим не було з чого.
--
--  Тепер PDF проганяється через OCR (рушій 3, мова auto) і лягає в базу
--  двома таблицями: шапка (сума, потужність, тип станції) і позиції
--  (що, скільки, почім). Оригінал файла нікуди не дівається — тут
--  зберігаються лише посилання на нього і сирий текст розпізнавання,
--  щоб завжди можна було перевірити, звідки взялась цифра.
--
--  ХТО ЩО БАЧИТЬ: менеджер завантажує файл і йде далі — оцифровка для
--  нього невидима. Переглядає й підправляє результат super_admin.
--  Розмежування зроблено в інтерфейсі; на рівні БД доступ звичайний
--  для authenticated, як і в решті таблиць системи.
--
--  ЗВ'ЯЗОК ІЗ КАРТКОЮ ПРОЄКТУ: сума з КП автоматично стає вартістю
--  угоди, але тільки поки її не чіпали руками. Щойно людина ввела
--  свою цифру — жодне наступне КП її не перезапише (блок E).
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================


-- =====================================================================
--  БЛОК A · Шапка комерційної пропозиції
--
--  Один рядок = один завантажений файл КП. Пропозицію переглядають і
--  перевиставляють, тому рядків на об'єкт буває кілька: version росте,
--  is_current стоїть рівно в одного (блок C).
-- =====================================================================

CREATE TABLE IF NOT EXISTS commercial_offers (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installation_custom_id integer NOT NULL REFERENCES installations(custom_id),

    version     integer NOT NULL DEFAULT 1 CHECK (version > 0),
    is_current  boolean NOT NULL DEFAULT true,

    -- parsed    — розпізнано автоматично, людина ще не дивилась
    -- confirmed — super_admin переглянув і підтвердив
    -- manual    — внесено руками (OCR не впорався або файла взагалі не було)
    -- failed    — файл є, розпізнати не вдалося; лишається як маркер роботи
    status      text NOT NULL DEFAULT 'parsed'
                CHECK (status IN ('parsed', 'confirmed', 'manual', 'failed')),

    -- Звідки файл. Ідентифікатори Google Drive — ті самі, що й у решті
    -- документів об'єкта, щоб з цього рядка можна було відкрити оригінал.
    source_file_name text,
    source_file_id   text,
    source_file_url  text,

    -- --- Шапка КП ---
    total_amount  numeric,               -- сума угоди з документа
    currency      varchar NOT NULL DEFAULT 'USD',
    capacity_kw   numeric,               -- потужність масиву панелей
    inverter_kw   numeric,
    battery_kwh   numeric,
    station_type  text,                  -- «гібридна СЕС», «мережева СЕС»
    mount_type    text,                  -- дах / земля
    payment_form  text,                  -- готівковий / безготівковий

    -- --- Звірка (перераховує тригер, блок D) ---
    items_sum   numeric NOT NULL DEFAULT 0,  -- сума позицій
    parse_diff  numeric,                     -- total_amount - items_sum
    parse_ok    boolean NOT NULL DEFAULT false,
    has_by_fact boolean NOT NULL DEFAULT false, -- є позиції «згідно фактичних витрат»

    -- --- Сліди розпізнавання ---
    ocr_engine    text,      -- який рушій OCR.space відпрацював
    ocr_language  text,
    raw_text      text,      -- текст від OCR: єдиний спосіб перевірити цифру
    parse_warning text,      -- чому не вийшло / на що звернути увагу

    reviewed_by integer REFERENCES employees(id),
    reviewed_at timestamptz,

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    created_by  integer REFERENCES employees(id),
    updated_by  integer REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_offers_installation
    ON commercial_offers (installation_custom_id, version DESC);

-- Поточна пропозиція на об'єкті може бути лише одна
CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_offers_current
    ON commercial_offers (installation_custom_id) WHERE is_current;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commercial_offers_version
    ON commercial_offers (installation_custom_id, version);

ALTER TABLE commercial_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commercial_offers_authenticated" ON commercial_offers;
CREATE POLICY "commercial_offers_authenticated" ON commercial_offers
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =====================================================================
--  БЛОК B · Позиції комерційної пропозиції
--
--  Навмисно НЕ прив'язані жорстко до nomenclature: у КП пишуть те, що
--  зрозуміло клієнту («Сонячна панель Longi 620 Вт»), а не рядок з
--  довідника. nomenclature_id — необов'язковий місток на майбутнє, щоб
--  порівнювати обіцяне із закупленим; поки він порожній, позиція
--  повноцінно живе своєю текстовою назвою.
-- =====================================================================

CREATE TABLE IF NOT EXISTS commercial_offer_items (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offer_id  bigint NOT NULL REFERENCES commercial_offers(id) ON DELETE CASCADE,

    sort_order integer NOT NULL DEFAULT 0,  -- порядок рядків у документі

    -- Категорія, яку впізнав розбірник: panel, inverter, battery,
    -- dc_cable, ac_cable, mounting, protection, grounding, work, logistics.
    -- Саме за нею потім рахують «скільки коштували панелі по всіх об'єктах».
    category_key   text,
    category_label text,

    name      text,        -- назва позиції з документа
    model     text,        -- модель / характеристики
    quantity  numeric,
    unit      text,        -- шт / м / м2 / набір
    unit_price numeric,
    amount    numeric,     -- сума по рядку

    -- «Згідно фактичних витрат» — суми в документі немає, і це нормально.
    -- Без цього прапорця така позиція виглядала б як помилка розбору.
    is_by_fact boolean NOT NULL DEFAULT false,
    -- Рядок дістали з об'єднаної комірки (менеджер написав два товари в одній)
    is_merged  boolean NOT NULL DEFAULT false,
    -- Рядок додала або виправила людина, а не OCR
    is_manual  boolean NOT NULL DEFAULT false,

    nomenclature_id bigint REFERENCES nomenclature(id),
    notes     text,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_offer_items_offer
    ON commercial_offer_items (offer_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_commercial_offer_items_category
    ON commercial_offer_items (category_key);

ALTER TABLE commercial_offer_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "commercial_offer_items_authenticated" ON commercial_offer_items;
CREATE POLICY "commercial_offer_items_authenticated" ON commercial_offer_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =====================================================================
--  БЛОК C · Версійність
--
--  Нове КП не затирає старе: попереднє лишається в історії зі своїми
--  цифрами, а поточним стає щойно завантажене. Номер версії рахує база,
--  щоб два одночасні завантаження не отримали однаковий.
-- =====================================================================

CREATE OR REPLACE FUNCTION commercial_offers_set_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.version IS NULL OR NEW.version <= 1 THEN
        SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
          FROM commercial_offers
         WHERE installation_custom_id = NEW.installation_custom_id;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_offers_version ON commercial_offers;
CREATE TRIGGER trg_commercial_offers_version
    BEFORE INSERT ON commercial_offers
    FOR EACH ROW EXECUTE FUNCTION commercial_offers_set_version();


-- Знімаємо прапорець зі старої пропозиції ДО того, як ляже нова:
-- унікальний індекс uq_commercial_offers_current перевіряється одразу
-- на вставці, тож прибирати конкуренцію постфактум уже пізно.
CREATE OR REPLACE FUNCTION commercial_offers_single_current()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE commercial_offers
       SET is_current = false
     WHERE installation_custom_id = NEW.installation_custom_id
       AND id IS DISTINCT FROM NEW.id
       AND is_current;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_offers_single_current ON commercial_offers;
CREATE TRIGGER trg_commercial_offers_single_current
    BEFORE INSERT OR UPDATE OF is_current ON commercial_offers
    FOR EACH ROW WHEN (NEW.is_current)
    EXECUTE FUNCTION commercial_offers_single_current();


-- =====================================================================
--  БЛОК D · Звірка «сума позицій = підсумок у документі»
--
--  Головна перевірка достовірності: якщо рядки складаються в ту саму
--  цифру, що стоїть підсумком у PDF, — розбір можна вважати чесним.
--  Розбіжність означає, що якийсь рядок не розпізнався, і super_admin
--  побачить це червоним, замість того щоб довіритись кривій сумі.
--
--  Перераховуємо і після правок руками: виправив кількість — звірка
--  одразу показала, зійшлося чи ні.
-- =====================================================================

CREATE OR REPLACE FUNCTION recalc_commercial_offer(p_offer_id bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_sum     numeric;
    v_by_fact boolean;
BEGIN
    SELECT COALESCE(SUM(amount), 0), COALESCE(bool_or(is_by_fact), false)
      INTO v_sum, v_by_fact
      FROM commercial_offer_items
     WHERE offer_id = p_offer_id;

    UPDATE commercial_offers
       SET items_sum   = v_sum,
           has_by_fact = v_by_fact,
           parse_diff  = CASE WHEN total_amount IS NULL THEN NULL
                              ELSE round(total_amount - v_sum, 2) END,
           parse_ok    = total_amount IS NOT NULL
                         AND abs(total_amount - v_sum) < 1,
           updated_at  = now()
     WHERE id = p_offer_id
       -- Пишемо лише коли справді змінилось: інакше цей UPDATE знову
       -- підніме тригери й піде по колу
       AND (items_sum   IS DISTINCT FROM v_sum
         OR has_by_fact IS DISTINCT FROM v_by_fact
         OR parse_ok    IS DISTINCT FROM (total_amount IS NOT NULL
                                          AND abs(total_amount - v_sum) < 1));
END $$;


CREATE OR REPLACE FUNCTION commercial_offer_items_recalc()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM recalc_commercial_offer(COALESCE(NEW.offer_id, OLD.offer_id));
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_offer_items_recalc ON commercial_offer_items;
CREATE TRIGGER trg_commercial_offer_items_recalc
    AFTER INSERT OR UPDATE OR DELETE ON commercial_offer_items
    FOR EACH ROW EXECUTE FUNCTION commercial_offer_items_recalc();


-- Підсумок у шапці правили руками — звірку теж треба перерахувати
CREATE OR REPLACE FUNCTION commercial_offers_recalc_self()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM recalc_commercial_offer(NEW.id);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_offers_recalc_self ON commercial_offers;
CREATE TRIGGER trg_commercial_offers_recalc_self
    AFTER UPDATE OF total_amount ON commercial_offers
    FOR EACH ROW EXECUTE FUNCTION commercial_offers_recalc_self();


-- =====================================================================
--  БЛОК E · Сума з КП як вартість угоди в картці об'єкта
--
--  Правило одне: КП дає цифру за замовчуванням, людина завжди сильніша.
--
--  total_cost_source каже, звідки взялась поточна вартість:
--    'offer'  — приїхала з комерційної пропозиції, оновлюється разом з нею;
--    'manual' — хтось ввів свою; жодне наступне КП її не перезапише.
--
--  Прапорець ставиться сам: будь-яка зміна total_cost, крім тієї, що йде
--  з КП, переводить джерело в 'manual'. Тому старі форми редагування
--  (inst2.jsx, картка проєкту) працюють як працювали — про нову колонку
--  їм знати не треба.
-- =====================================================================

ALTER TABLE installations
    ADD COLUMN IF NOT EXISTS total_cost_source text NOT NULL DEFAULT 'manual'
        CHECK (total_cost_source IN ('manual', 'offer'));


-- Ознака «цю суму зараз пише КП, а не людина». Живе рівно один запит
-- (третій аргумент set_config = is_local), тому переплутати виклики
-- двох паралельних сесій неможливо.
CREATE OR REPLACE FUNCTION installations_mark_manual_cost()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.total_cost IS DISTINCT FROM OLD.total_cost
       AND COALESCE(current_setting('kcore.cost_from_offer', true), 'off') <> 'on' THEN
        NEW.total_cost_source := 'manual';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_installations_mark_manual_cost ON installations;
CREATE TRIGGER trg_installations_mark_manual_cost
    BEFORE UPDATE OF total_cost ON installations
    FOR EACH ROW EXECUTE FUNCTION installations_mark_manual_cost();


-- p_force = true — «взяти суму з КП» натиснули руками: тоді перезаписуємо
-- навіть те, що вводили вручну. Автоматично (з тригера) — ніколи.
CREATE OR REPLACE FUNCTION apply_offer_total(p_offer_id bigint, p_force boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_offer commercial_offers%ROWTYPE;
BEGIN
    SELECT * INTO v_offer FROM commercial_offers WHERE id = p_offer_id;
    IF NOT FOUND OR v_offer.total_amount IS NULL THEN
        RETURN;
    END IF;

    PERFORM set_config('kcore.cost_from_offer', 'on', true);

    UPDATE installations
       SET total_cost        = v_offer.total_amount,
           total_cost_source = 'offer',
           updated_at        = now()
     WHERE custom_id = v_offer.installation_custom_id
       -- Порожню суму заповнюємо; свою, з попереднього КП, оновлюємо;
       -- введену руками чіпаємо лише на явну команду
       AND (p_force
            OR total_cost IS NULL
            OR total_cost = 0
            OR total_cost_source = 'offer')
       AND total_cost IS DISTINCT FROM v_offer.total_amount::real;

    PERFORM set_config('kcore.cost_from_offer', 'off', true);
END $$;


CREATE OR REPLACE FUNCTION commercial_offers_apply_total()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.is_current AND NEW.total_amount IS NOT NULL THEN
        PERFORM apply_offer_total(NEW.id, false);
    END IF;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_commercial_offers_apply_total ON commercial_offers;
CREATE TRIGGER trg_commercial_offers_apply_total
    AFTER INSERT OR UPDATE OF total_amount, is_current ON commercial_offers
    FOR EACH ROW EXECUTE FUNCTION commercial_offers_apply_total();

GRANT EXECUTE ON FUNCTION apply_offer_total(bigint, boolean) TO anon, authenticated;


-- =====================================================================
--  БЛОК F · Збереження розібраного КП однією операцією
--
--  Шапка й позиції мають лягти разом або не лягти взагалі: пропозиція
--  без рядків виглядала б як «сума є, а за що — невідомо». З фронта це
--  два різні запити, тому зшиваємо їх тут, усередині транзакції.
--
--  p_offer  — об'єкт з полями шапки (ключі = назви колонок).
--  p_items  — масив позицій.
-- =====================================================================

CREATE OR REPLACE FUNCTION save_commercial_offer(
    p_installation_custom_id integer,
    p_offer jsonb,
    p_items jsonb DEFAULT '[]'::jsonb
) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE
    v_offer_id bigint;
BEGIN
    INSERT INTO commercial_offers (
        installation_custom_id, status, is_current,
        source_file_name, source_file_id, source_file_url,
        total_amount, currency, capacity_kw, inverter_kw, battery_kwh,
        station_type, mount_type, payment_form,
        ocr_engine, ocr_language, raw_text, parse_warning,
        created_by, updated_by
    ) VALUES (
        p_installation_custom_id,
        COALESCE(p_offer->>'status', 'parsed'),
        true,
        p_offer->>'source_file_name',
        p_offer->>'source_file_id',
        p_offer->>'source_file_url',
        NULLIF(p_offer->>'total_amount', '')::numeric,
        COALESCE(NULLIF(p_offer->>'currency', ''), 'USD'),
        NULLIF(p_offer->>'capacity_kw', '')::numeric,
        NULLIF(p_offer->>'inverter_kw', '')::numeric,
        NULLIF(p_offer->>'battery_kwh', '')::numeric,
        p_offer->>'station_type',
        p_offer->>'mount_type',
        p_offer->>'payment_form',
        p_offer->>'ocr_engine',
        p_offer->>'ocr_language',
        p_offer->>'raw_text',
        p_offer->>'parse_warning',
        NULLIF(p_offer->>'created_by', '')::integer,
        NULLIF(p_offer->>'created_by', '')::integer
    )
    RETURNING id INTO v_offer_id;

    INSERT INTO commercial_offer_items (
        offer_id, sort_order, category_key, category_label,
        name, model, quantity, unit, unit_price, amount,
        is_by_fact, is_merged
    )
    SELECT
        v_offer_id,
        COALESCE(NULLIF(it->>'sort_order', '')::integer, ord::integer),
        it->>'category_key',
        it->>'category_label',
        it->>'name',
        it->>'model',
        NULLIF(it->>'quantity', '')::numeric,
        it->>'unit',
        NULLIF(it->>'unit_price', '')::numeric,
        NULLIF(it->>'amount', '')::numeric,
        COALESCE(NULLIF(it->>'is_by_fact', '')::boolean, false),
        COALESCE(NULLIF(it->>'is_merged', '')::boolean, false)
    FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) WITH ORDINALITY AS t(it, ord);

    -- Позицій могло не бути зовсім (status = 'failed') — тоді тригер
    -- звірки не спрацював, і шапку треба порахувати явно
    PERFORM recalc_commercial_offer(v_offer_id);

    RETURN v_offer_id;
END $$;

GRANT EXECUTE ON FUNCTION save_commercial_offer(integer, jsonb, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION recalc_commercial_offer(bigint) TO anon, authenticated;


-- =====================================================================
--  БЛОК G · Поточне КП по кожному об'єкту
--
--  Зручний зріз для картки проєкту і фундамент для майбутнього
--  дашборда: тут уже порахована ціна за кВт і видно, чи розійшлась
--  вартість угоди з тим, що написано в пропозиції.
-- =====================================================================

CREATE OR REPLACE VIEW v_commercial_offer_current AS
SELECT
    o.id                AS offer_id,
    o.installation_custom_id,
    o.version,
    o.status,
    o.total_amount,
    o.currency,
    o.capacity_kw,
    o.inverter_kw,
    o.battery_kwh,
    o.station_type,
    o.mount_type,
    o.items_sum,
    o.parse_diff,
    o.parse_ok,
    o.has_by_fact,
    o.source_file_name,
    o.source_file_url,
    o.created_at,
    -- Головний показник для порівняння пропозицій між собою
    CASE WHEN COALESCE(o.capacity_kw, 0) > 0
         THEN round(o.total_amount / o.capacity_kw, 1) END AS price_per_kw,
    (SELECT count(*) FROM commercial_offer_items ci WHERE ci.offer_id = o.id) AS items_count,
    i.name              AS installation_name,
    i.total_cost        AS deal_total_cost,
    i.total_cost_source,
    -- Розбіжність між сумою угоди в картці й сумою в КП: не помилка,
    -- а привід спитати, звідки взялась різниця (знижка, доукомплектація)
    CASE WHEN o.total_amount IS NULL THEN NULL
         ELSE round(i.total_cost::numeric - o.total_amount, 2) END AS deal_vs_offer
FROM commercial_offers o
JOIN installations i ON i.custom_id = o.installation_custom_id
WHERE o.is_current;

GRANT SELECT ON v_commercial_offer_current TO anon, authenticated;
