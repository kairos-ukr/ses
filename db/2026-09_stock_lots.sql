-- =====================================================================
--  K-CORE · Поштучний облік носіїв: бухти, барабани, рулони
--
--  Задача: партія сонячного кабелю — 20 бухт приблизно по 500 м.
--  Кожна бухта стоїть на обліку окремо, і по кожній видно поточний
--  залишок метрів. Видача ріже конкретну бухту (або кілька), а не
--  абстрактну «кількість зі складу».
--
--  Модель навмисно загальна («носій»), а не «кабель»: той самий
--  механізм закриває барабани, рулони плівки, мішки суміші.
--  Номенклатура сама вирішує, чи вести облік поштучно.
--
--  ІНВАРІАНТ: для позиції з tracking_mode = 'lot'
--      SUM(stock_lots.remaining_quantity) = quantity_on_hand
--  по кожній парі (склад, номенклатура). Розбіжність показує
--  в'юха v_lot_drift — див. БЛОК E.
--
--  ПОРЯДОК ЗАСТОСУВАННЯ:
--    Блоки A–I — виконати одразу, вони безпечні й нічого не ламають.
--    Блок J    — увімкнути ПІЗНІШЕ, коли «Забезпечення об'єктів»
--                навчиться видавати з носіїв. Деталі в самому блоці.
--
--  Застосовувати в Supabase → SQL Editor, блоками зверху вниз.
-- =====================================================================


-- =====================================================================
--  БЛОК A · Як ведеться облік по позиції номенклатури
-- =====================================================================

ALTER TABLE nomenclature
    ADD COLUMN IF NOT EXISTS tracking_mode varchar NOT NULL DEFAULT 'bulk';

ALTER TABLE nomenclature DROP CONSTRAINT IF EXISTS chk_nomenclature_tracking_mode;
ALTER TABLE nomenclature ADD CONSTRAINT chk_nomenclature_tracking_mode
    CHECK (tracking_mode IN ('bulk', 'lot'));

COMMENT ON COLUMN nomenclature.tracking_mode IS
    'bulk — звичайний облік кількості; lot — поштучний облік носіїв (бухта, барабан, рулон)';

-- Як називати носій в інтерфейсі: «бухта», «барабан», «рулон», «мішок»
ALTER TABLE nomenclature ADD COLUMN IF NOT EXISTS lot_unit_name varchar;

-- Типовий розмір носія — підставляється у форму приймання (напр. 500 м)
ALTER TABLE nomenclature ADD COLUMN IF NOT EXISTS lot_default_size numeric;


-- =====================================================================
--  БЛОК B · Носії (бухти)
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS stock_lot_label_seq;

CREATE TABLE IF NOT EXISTS stock_lots (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nomenclature_id        bigint  NOT NULL REFERENCES nomenclature(id),
    warehouse_id           bigint  NOT NULL REFERENCES warehouses(id),

    -- Номер на бирці бухти. Унікальний у межах номенклатури.
    label                  varchar NOT NULL,

    initial_quantity       numeric NOT NULL CHECK (initial_quantity > 0),
    remaining_quantity     numeric NOT NULL CHECK (remaining_quantity >= 0),

    -- active — на складі й доступна; depleted — змотана в нуль;
    -- written_off — списана актом
    status                 varchar NOT NULL DEFAULT 'active',

    -- Звідки прийшла
    purchase_order_item_id bigint  REFERENCES purchase_order_items(id),
    batch_code             varchar,           -- номер партії постачальника
    supplier_lot_no        varchar,           -- номер бухти в документах постачальника

    opened_at              timestamptz,       -- коли вперше різали
    notes                  text,

    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    created_by             integer REFERENCES employees(id),
    updated_by             integer REFERENCES employees(id),

    CONSTRAINT chk_stock_lots_status
        CHECK (status IN ('active', 'depleted', 'written_off')),
    -- Змотати можна лише те, що було намотано
    CONSTRAINT chk_stock_lots_remaining_le_initial
        CHECK (remaining_quantity <= initial_quantity)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_lots_label
    ON stock_lots (nomenclature_id, label);
CREATE INDEX IF NOT EXISTS idx_stock_lots_lookup
    ON stock_lots (warehouse_id, nomenclature_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_lots_active_remaining
    ON stock_lots (nomenclature_id, remaining_quantity) WHERE status = 'active';

ALTER TABLE stock_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_lots_authenticated" ON stock_lots;
CREATE POLICY "stock_lots_authenticated" ON stock_lots
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =====================================================================
--  БЛОК C · Який рух які носії зачепив
--  Один рух може різати кілька бухт: треба 700 м, у першій лишилось
--  340 — беремо 340 звідти й 360 з наступної.
-- =====================================================================

CREATE TABLE IF NOT EXISTS stock_movement_lots (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    stock_movement_id bigint  NOT NULL REFERENCES stock_movements(id) ON DELETE CASCADE,
    lot_id            bigint  NOT NULL REFERENCES stock_lots(id),
    quantity          numeric NOT NULL CHECK (quantity > 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (stock_movement_id, lot_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_movement_lots_lot ON stock_movement_lots (lot_id);

ALTER TABLE stock_movement_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movement_lots_authenticated" ON stock_movement_lots;
CREATE POLICY "stock_movement_lots_authenticated" ON stock_movement_lots
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =====================================================================
--  БЛОК D · Блокування пари (склад × номенклатура)
--
--  Без нього двоє комірників, які одночасно ріжуть одну бухту,
--  обидва пройдуть перевірку залишку і змотають більше, ніж є.
--  Лок тримається до кінця транзакції і не заважає роботі
--  з іншими позиціями.
-- =====================================================================

CREATE OR REPLACE FUNCTION lock_stock_slot(p_warehouse bigint, p_nomenclature bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtext('stock:' || p_warehouse::text || ':' || p_nomenclature::text)
    );
END $$;


-- =====================================================================
--  БЛОК E · В'юхи
-- =====================================================================

DROP VIEW IF EXISTS v_lot_balance;
CREATE VIEW v_lot_balance AS
SELECT
    l.warehouse_id,
    l.nomenclature_id,
    COUNT(*) FILTER (WHERE l.status = 'active')                       AS lots_active,
    COUNT(*) FILTER (WHERE l.status = 'active'
                       AND l.remaining_quantity < l.initial_quantity) AS lots_opened,
    COALESCE(SUM(l.remaining_quantity) FILTER (WHERE l.status = 'active'), 0) AS quantity_in_lots
FROM stock_lots l
GROUP BY l.warehouse_id, l.nomenclature_id;


-- Розбіжність між сумою носіїв і загальним залишком.
-- Порожній результат = все зійшлось. Непорожній — привід розібратись.
DROP VIEW IF EXISTS v_lot_drift;
CREATE VIEW v_lot_drift AS
SELECT
    s.warehouse_id,
    s.nomenclature_id,
    n.name                          AS nomenclature_name,
    w.name                          AS warehouse_name,
    s.quantity_on_hand,
    COALESCE(b.quantity_in_lots, 0) AS quantity_in_lots,
    s.quantity_on_hand - COALESCE(b.quantity_in_lots, 0) AS drift
FROM v_warehouse_stock_available s
JOIN nomenclature n ON n.id = s.nomenclature_id
JOIN warehouses   w ON w.id = s.warehouse_id
LEFT JOIN v_lot_balance b
       ON b.warehouse_id = s.warehouse_id AND b.nomenclature_id = s.nomenclature_id
WHERE n.tracking_mode = 'lot'
  AND ABS(s.quantity_on_hand - COALESCE(b.quantity_in_lots, 0)) > 0.0001;


-- =====================================================================
--  БЛОК F · Приймання партії носіїв
--
--  p_lots — масив об'єктів: [{"qty":500},{"qty":480},…]
--           або [{"label":"Б-0142","qty":500,"supplier_lot_no":"7788"}]
--  Бирка, якщо не задана, генерується автоматично.
-- =====================================================================

CREATE OR REPLACE FUNCTION receive_stock_lots(
    p_warehouse      bigint,
    p_nomenclature   bigint,
    p_lots           jsonb,
    p_po_item        bigint  DEFAULT NULL,
    p_batch_code     text    DEFAULT NULL,
    p_reference      text    DEFAULT NULL,
    p_notes          text    DEFAULT NULL,
    p_emp            integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    rec      jsonb;
    v_qty    numeric;
    v_label  text;
    v_total  numeric := 0;
    v_count  integer := 0;
    v_mv_id  bigint;
    v_ids    bigint[] := '{}';
    v_lot_id bigint;
    v_mode   varchar;
BEGIN
    -- Дозвіл для тригера з блоку J: рух проводить «легальна» функція
    PERFORM set_config('kcore.lot_context', 'on', true);

    IF p_lots IS NULL OR jsonb_typeof(p_lots) <> 'array' OR jsonb_array_length(p_lots) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Не передано жодного носія');
    END IF;

    SELECT tracking_mode INTO v_mode FROM nomenclature WHERE id = p_nomenclature;
    IF v_mode IS DISTINCT FROM 'lot' THEN
        RETURN jsonb_build_object('ok', false,
            'message', 'Ця позиція не ведеться поштучно. Увімкніть облік по носіях у картці номенклатури.');
    END IF;

    PERFORM lock_stock_slot(p_warehouse, p_nomenclature);

    FOR rec IN SELECT * FROM jsonb_array_elements(p_lots)
    LOOP
        v_qty := NULLIF(rec->>'qty', '')::numeric;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RETURN jsonb_build_object('ok', false,
                'message', 'У кожного носія має бути кількість більша за 0');
        END IF;

        v_label := NULLIF(trim(rec->>'label'), '');
        IF v_label IS NULL THEN
            v_label := 'Б-' || lpad(nextval('stock_lot_label_seq')::text, 5, '0');
        END IF;

        INSERT INTO stock_lots(
            nomenclature_id, warehouse_id, label,
            initial_quantity, remaining_quantity, status,
            purchase_order_item_id, batch_code, supplier_lot_no, notes,
            created_by, updated_by
        ) VALUES (
            p_nomenclature, p_warehouse, v_label,
            v_qty, v_qty, 'active',
            p_po_item, p_batch_code, NULLIF(trim(rec->>'supplier_lot_no'), ''), p_notes,
            p_emp, p_emp
        ) RETURNING id INTO v_lot_id;

        v_ids   := v_ids || v_lot_id;
        v_total := v_total + v_qty;
        v_count := v_count + 1;
    END LOOP;

    -- Один прихід на всю партію — щоб загальний залишок зійшовся з сумою носіїв
    INSERT INTO stock_movements(
        operation_type, nomenclature_id, quantity, warehouse_to_id,
        purchase_order_item_id, reference_document, notes, performed_by, created_by
    ) VALUES (
        'purchase', p_nomenclature, v_total, p_warehouse,
        p_po_item, p_reference,
        trim(COALESCE(p_notes, '') || ' · прийнято носіїв: ' || v_count),
        p_emp, p_emp
    ) RETURNING id INTO v_mv_id;

    INSERT INTO stock_movement_lots(stock_movement_id, lot_id, quantity)
    SELECT v_mv_id, l.id, l.initial_quantity FROM stock_lots l WHERE l.id = ANY(v_ids);

    RETURN jsonb_build_object(
        'ok', true, 'movement_id', v_mv_id,
        'lots_created', v_count, 'total_quantity', v_total, 'lot_ids', to_jsonb(v_ids)
    );
END $$;


-- =====================================================================
--  БЛОК G · Видача / продаж / списання з конкретних носіїв
--
--  p_cuts — [{"lot_id":12,"qty":120},{"lot_id":15,"qty":80}]
--  Створює ОДИН рух на суму й розписує, з яких носіїв скільки змотано.
-- =====================================================================

CREATE OR REPLACE FUNCTION consume_from_lots(
    p_operation      text,
    p_warehouse      bigint,
    p_nomenclature   bigint,
    p_cuts           jsonb,
    p_installation   integer DEFAULT NULL,
    p_client         integer DEFAULT NULL,
    p_reason         text    DEFAULT NULL,
    p_reference      text    DEFAULT NULL,
    p_emp            integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    rec       jsonb;
    v_lot     stock_lots%ROWTYPE;
    v_qty     numeric;
    v_total   numeric := 0;
    v_mv_id   bigint;
    v_touched integer := 0;
    v_emptied integer := 0;
BEGIN
    PERFORM set_config('kcore.lot_context', 'on', true);

    IF p_operation NOT IN ('issue', 'sale', 'writeoff', 'partner_transfer') THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Непідтримувана операція: ' || p_operation);
    END IF;
    IF p_cuts IS NULL OR jsonb_typeof(p_cuts) <> 'array' OR jsonb_array_length(p_cuts) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Не обрано жодного носія');
    END IF;

    PERFORM lock_stock_slot(p_warehouse, p_nomenclature);

    -- Перевіряємо ВСЕ до того, як щось змінювати
    FOR rec IN SELECT * FROM jsonb_array_elements(p_cuts)
    LOOP
        v_qty := NULLIF(rec->>'qty', '')::numeric;
        IF v_qty IS NULL OR v_qty <= 0 THEN
            RETURN jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
        END IF;

        SELECT * INTO v_lot FROM stock_lots WHERE id = (rec->>'lot_id')::bigint FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'message', 'Носій не знайдено');
        END IF;
        IF v_lot.warehouse_id <> p_warehouse OR v_lot.nomenclature_id <> p_nomenclature THEN
            RETURN jsonb_build_object('ok', false,
                'message', format('Носій %s лежить на іншому складі', v_lot.label));
        END IF;
        IF v_lot.status <> 'active' THEN
            RETURN jsonb_build_object('ok', false,
                'message', format('Носій %s недоступний (%s)', v_lot.label, v_lot.status));
        END IF;
        IF v_qty > v_lot.remaining_quantity THEN
            RETURN jsonb_build_object('ok', false,
                'message', format('На носії %s лишилось %s — більше змотати не можна',
                                  v_lot.label, v_lot.remaining_quantity));
        END IF;

        v_total := v_total + v_qty;
    END LOOP;

    INSERT INTO stock_movements(
        operation_type, nomenclature_id, quantity, warehouse_from_id,
        installation_custom_id, client_id, reference_document, notes,
        performed_by, created_by
    ) VALUES (
        p_operation::stock_operation_type, p_nomenclature, v_total, p_warehouse,
        p_installation, p_client, p_reference, p_reason, p_emp, p_emp
    ) RETURNING id INTO v_mv_id;

    FOR rec IN SELECT * FROM jsonb_array_elements(p_cuts)
    LOOP
        v_qty := (rec->>'qty')::numeric;

        UPDATE stock_lots
        SET remaining_quantity = remaining_quantity - v_qty,
            status     = CASE WHEN remaining_quantity - v_qty <= 0.0001 THEN 'depleted' ELSE status END,
            opened_at  = COALESCE(opened_at, now()),
            updated_at = now(),
            updated_by = p_emp
        WHERE id = (rec->>'lot_id')::bigint;

        INSERT INTO stock_movement_lots(stock_movement_id, lot_id, quantity)
        VALUES (v_mv_id, (rec->>'lot_id')::bigint, v_qty);

        v_touched := v_touched + 1;
        IF EXISTS (SELECT 1 FROM stock_lots
                   WHERE id = (rec->>'lot_id')::bigint AND status = 'depleted') THEN
            v_emptied := v_emptied + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'ok', true, 'movement_id', v_mv_id,
        'total_quantity', v_total, 'lots_touched', v_touched, 'lots_emptied', v_emptied
    );
END $$;


-- =====================================================================
--  БЛОК H · Повернення на носій
--  З об'єкта привезли недомотку. Або домотуємо на ту саму бухту,
--  або заводимо новий носій-обрізок.
-- =====================================================================

CREATE OR REPLACE FUNCTION return_to_lot(
    p_warehouse      bigint,
    p_nomenclature   bigint,
    p_qty            numeric,
    p_lot_id         bigint  DEFAULT NULL,   -- NULL → створити новий носій-обрізок
    p_label          text    DEFAULT NULL,
    p_installation   integer DEFAULT NULL,
    p_reason         text    DEFAULT NULL,
    p_emp            integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_lot    stock_lots%ROWTYPE;
    v_mv_id  bigint;
    v_lot_id bigint;
    v_label  text;
BEGIN
    PERFORM set_config('kcore.lot_context', 'on', true);

    IF p_qty IS NULL OR p_qty <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Кількість має бути більшою за 0');
    END IF;

    PERFORM lock_stock_slot(p_warehouse, p_nomenclature);

    IF p_lot_id IS NOT NULL THEN
        SELECT * INTO v_lot FROM stock_lots WHERE id = p_lot_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'message', 'Носій не знайдено');
        END IF;
        IF v_lot.remaining_quantity + p_qty > v_lot.initial_quantity THEN
            RETURN jsonb_build_object('ok', false,
                'message', format('На носій %s більше %s не намотати — заведіть новий обрізок',
                                  v_lot.label, v_lot.initial_quantity - v_lot.remaining_quantity));
        END IF;

        UPDATE stock_lots
        SET remaining_quantity = remaining_quantity + p_qty,
            status       = CASE WHEN status = 'depleted' THEN 'active' ELSE status END,
            warehouse_id = p_warehouse,
            updated_at   = now(), updated_by = p_emp
        WHERE id = p_lot_id;

        v_lot_id := p_lot_id;
    ELSE
        v_label := COALESCE(NULLIF(trim(p_label), ''),
                            'ОБР-' || lpad(nextval('stock_lot_label_seq')::text, 5, '0'));

        INSERT INTO stock_lots(
            nomenclature_id, warehouse_id, label,
            initial_quantity, remaining_quantity, status, notes, created_by, updated_by
        ) VALUES (
            p_nomenclature, p_warehouse, v_label, p_qty, p_qty, 'active',
            COALESCE(p_reason, 'Повернення з об''єкта'), p_emp, p_emp
        ) RETURNING id INTO v_lot_id;
    END IF;

    INSERT INTO stock_movements(
        operation_type, nomenclature_id, quantity, warehouse_to_id,
        installation_custom_id, notes, performed_by, created_by
    ) VALUES (
        'return', p_nomenclature, p_qty, p_warehouse,
        p_installation, p_reason, p_emp, p_emp
    ) RETURNING id INTO v_mv_id;

    INSERT INTO stock_movement_lots(stock_movement_id, lot_id, quantity)
    VALUES (v_mv_id, v_lot_id, p_qty);

    RETURN jsonb_build_object('ok', true, 'movement_id', v_mv_id, 'lot_id', v_lot_id);
END $$;


-- =====================================================================
--  БЛОК I · Переміщення носія на інший склад
--  Бухту возять цілком, тому переміщується весь залишок.
-- =====================================================================

CREATE OR REPLACE FUNCTION transfer_lot(
    p_lot_id       bigint,
    p_warehouse_to bigint,
    p_reason       text    DEFAULT NULL,
    p_emp          integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_lot   stock_lots%ROWTYPE;
    v_mv_id bigint;
BEGIN
    PERFORM set_config('kcore.lot_context', 'on', true);

    SELECT * INTO v_lot FROM stock_lots WHERE id = p_lot_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Носій не знайдено');
    END IF;
    IF v_lot.status <> 'active' OR v_lot.remaining_quantity <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Порожній носій переміщувати нема сенсу');
    END IF;
    IF v_lot.warehouse_id = p_warehouse_to THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Носій уже на цьому складі');
    END IF;

    PERFORM lock_stock_slot(v_lot.warehouse_id, v_lot.nomenclature_id);
    PERFORM lock_stock_slot(p_warehouse_to,     v_lot.nomenclature_id);

    INSERT INTO stock_movements(
        operation_type, nomenclature_id, quantity,
        warehouse_from_id, warehouse_to_id, notes, performed_by, created_by
    ) VALUES (
        'transfer', v_lot.nomenclature_id, v_lot.remaining_quantity,
        v_lot.warehouse_id, p_warehouse_to,
        COALESCE(p_reason, 'Переміщення носія ' || v_lot.label), p_emp, p_emp
    ) RETURNING id INTO v_mv_id;

    INSERT INTO stock_movement_lots(stock_movement_id, lot_id, quantity)
    VALUES (v_mv_id, p_lot_id, v_lot.remaining_quantity);

    UPDATE stock_lots
    SET warehouse_id = p_warehouse_to, updated_at = now(), updated_by = p_emp
    WHERE id = p_lot_id;

    RETURN jsonb_build_object('ok', true, 'movement_id', v_mv_id);
END $$;


-- =====================================================================
--  БЛОК J · Захист від розсинхрону  ⚠ ВМИКАТИ НЕ ЗАРАЗ
--
--  Тригер забороняє рухати «просто кількістю» позицію, яку ведуть
--  поштучно. Інакше сума носіїв розійдеться із загальним залишком
--  у перший же день.
--
--  АЛЕ: поки «Забезпечення об'єктів» (issue_to_object, return_from_object)
--  не вміє працювати з носіями, увімкнений тригер заблокує видачу
--  кабелю на об'єкт. Тому:
--
--    1. Спочатку виконайте блоки A–I і попрацюйте з носіями на складі.
--    2. Коли видача з носіїв з'явиться в «Забезпеченні» — розкоментуйте
--       і виконайте цей блок.
--
--  До того часу за розбіжністю стежить v_lot_drift:
--    SELECT * FROM v_lot_drift;      -- має бути порожньо
-- =====================================================================

-- CREATE OR REPLACE FUNCTION trg_stock_movements_require_lots()
-- RETURNS trigger
-- LANGUAGE plpgsql SET search_path = public AS $$
-- DECLARE v_mode varchar;
-- BEGIN
--     SELECT tracking_mode INTO v_mode FROM nomenclature WHERE id = NEW.nomenclature_id;
--
--     IF v_mode = 'lot' AND current_setting('kcore.lot_context', true) IS DISTINCT FROM 'on' THEN
--         RAISE EXCEPTION
--             'Позиція ведеться поштучно. Проведіть операцію через носії (бухти), а не простою кількістю.'
--             USING ERRCODE = 'P0001';
--     END IF;
--
--     RETURN NEW;
-- END $$;
--
-- DROP TRIGGER IF EXISTS stock_movements_require_lots ON stock_movements;
-- CREATE TRIGGER stock_movements_require_lots
--     BEFORE INSERT ON stock_movements
--     FOR EACH ROW EXECUTE FUNCTION trg_stock_movements_require_lots();


-- =====================================================================
--  БЛОК K · Приклад: заводимо кабель і приймаємо партію
--  Розкоментуйте й підставте свої id, якщо хочете перевірити одразу.
-- =====================================================================

-- UPDATE nomenclature
--    SET tracking_mode = 'lot', lot_unit_name = 'бухта', lot_default_size = 500
--  WHERE id = <id кабелю>;
--
-- SELECT receive_stock_lots(
--     p_warehouse    => <id складу>,
--     p_nomenclature => <id кабелю>,
--     p_lots         => (SELECT jsonb_agg(jsonb_build_object('qty', 500))
--                        FROM generate_series(1, 20)),
--     p_reference    => 'Накладна №1234'
-- );
--
-- SELECT * FROM v_lot_drift;   -- має бути порожньо
