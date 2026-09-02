-- =====================================================================
--  K-CORE · Документ видачі (лист комплектації)
--
--  Сценарій: людина приходить у офіс або монтажник їде на об'єкт зі
--  списком матеріалів. Менеджер заводить документ. Комірник відкриває
--  його, бачить що видавати і чи є це на складі, збирає — і аж потім
--  підтверджує видачу. Рухи по складу проводяться в момент підтвердження,
--  а не тоді, коли список тільки склали.
--
--  Чому окрема сутність, а не просто stock_movements: між «домовились»
--  і «видали» проходить час, і саме в цьому проміжку зараз немає нічого.
--  Комірник тримає список у голові або на папірці.
--
--  Застосовувати в Supabase → SQL Editor, блоками зверху вниз.
--  Поки міграцію не виконано, розділ «Видача» в інтерфейсі не з'являється.
-- =====================================================================


-- =====================================================================
--  БЛОК 0 · Блокування пари (склад × номенклатура)
--
--  Та сама функція, що і в міграції stock_lots. Дублюємо через
--  CREATE OR REPLACE, щоб цю міграцію можна було виконати окремо —
--  порядок міграцій не має значення.
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
--  БЛОК A · Документ
-- =====================================================================

CREATE SEQUENCE IF NOT EXISTS issue_order_number_seq;

CREATE TABLE IF NOT EXISTS issue_orders (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    doc_number    varchar NOT NULL UNIQUE
                  DEFAULT ('ВД-' || lpad(nextval('issue_order_number_seq')::text, 6, '0')),

    -- draft   — ще складають список
    -- ready   — передано комірнику, можна йти збирати
    -- issued  — видано повністю
    -- cancelled
    status        varchar NOT NULL DEFAULT 'draft',

    -- Звідки видаємо
    warehouse_id  bigint NOT NULL REFERENCES warehouses(id),

    -- Кому. Заповнюється щонайменше одне з трьох.
    installation_custom_id integer REFERENCES installations(custom_id),
    client_id     integer REFERENCES clients(id),
    recipient_name  varchar,          -- ПІБ того, хто прийшов і розписався
    recipient_phone varchar,

    -- issue — видача на об'єкт (без грошей)
    -- sale  — продаж клієнту
    purpose       varchar NOT NULL DEFAULT 'issue',

    needed_by     date,               -- коли треба, щоб комірник розумів терміновість
    notes         text,

    requested_by  integer REFERENCES employees(id),   -- хто склав документ
    issued_by     integer REFERENCES employees(id),   -- хто фактично видав
    issued_at     timestamptz,

    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    integer REFERENCES employees(id),
    updated_by    integer REFERENCES employees(id),

    CONSTRAINT chk_issue_orders_status
        CHECK (status IN ('draft', 'ready', 'issued', 'cancelled')),
    CONSTRAINT chk_issue_orders_purpose
        CHECK (purpose IN ('issue', 'sale')),
    -- Документ у нікуди не має сенсу: має бути об'єкт, клієнт або хоча б ПІБ
    CONSTRAINT chk_issue_orders_recipient
        CHECK (installation_custom_id IS NOT NULL
            OR client_id IS NOT NULL
            OR NULLIF(trim(recipient_name), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_issue_orders_status ON issue_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issue_orders_warehouse ON issue_orders (warehouse_id, status);
CREATE INDEX IF NOT EXISTS idx_issue_orders_installation ON issue_orders (installation_custom_id);

ALTER TABLE issue_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_orders_authenticated" ON issue_orders;
CREATE POLICY "issue_orders_authenticated" ON issue_orders
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =====================================================================
--  БЛОК B · Позиції документа
-- =====================================================================

CREATE TABLE IF NOT EXISTS issue_order_items (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_order_id   bigint  NOT NULL REFERENCES issue_orders(id) ON DELETE CASCADE,
    nomenclature_id  bigint  NOT NULL REFERENCES nomenclature(id),

    requested_quantity numeric NOT NULL CHECK (requested_quantity > 0),
    issued_quantity    numeric NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),

    unit_price       numeric,     -- заповнюється лише для purpose = 'sale'
    note             text,        -- «взяти з другої полиці», «тільки чорний»

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),

    UNIQUE (issue_order_id, nomenclature_id)
);

CREATE INDEX IF NOT EXISTS idx_issue_order_items_order ON issue_order_items (issue_order_id);

ALTER TABLE issue_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "issue_order_items_authenticated" ON issue_order_items;
CREATE POLICY "issue_order_items_authenticated" ON issue_order_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =====================================================================
--  БЛОК C · Готовність документа
--
--  Головне питання комірника: «чи можна це видавати».
--  По кожній позиції показуємо, скільки лишилось видати і скільки
--  реально вільно на тому складі, з якого видаємо.
-- =====================================================================

DROP VIEW IF EXISTS v_issue_order_readiness;
CREATE VIEW v_issue_order_readiness AS
SELECT
    o.id                                   AS issue_order_id,
    i.id                                   AS item_id,
    i.nomenclature_id,
    o.warehouse_id,
    i.requested_quantity,
    i.issued_quantity,
    GREATEST(i.requested_quantity - i.issued_quantity, 0)          AS outstanding,
    COALESCE(s.quantity_available, 0)                              AS available_at_warehouse,
    LEAST(
        GREATEST(i.requested_quantity - i.issued_quantity, 0),
        GREATEST(COALESCE(s.quantity_available, 0), 0)
    )                                                              AS can_issue_now
FROM issue_orders o
JOIN issue_order_items i ON i.issue_order_id = o.id
LEFT JOIN v_warehouse_stock_available s
       ON s.warehouse_id = o.warehouse_id
      AND s.nomenclature_id = i.nomenclature_id;


-- =====================================================================
--  БЛОК D · Проведення видачі
--
--  p_lines — [{"item_id":12,"qty":5}, …]
--  Створює рухи по складу, проставляє issued_quantity і закриває
--  документ, якщо видано все. Часткова видача дозволена: документ
--  лишається відкритим, а решта позицій чекає.
-- =====================================================================

CREATE OR REPLACE FUNCTION issue_order_execute(
    p_order_id bigint,
    p_lines    jsonb,
    p_emp      integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    o          issue_orders%ROWTYPE;
    rec        jsonb;
    it         issue_order_items%ROWTYPE;
    v_qty      numeric;
    v_avail    numeric;
    v_moves    integer := 0;
    v_total    numeric := 0;
    v_all_done boolean := true;
BEGIN
    SELECT * INTO o FROM issue_orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Документ не знайдено');
    END IF;
    IF o.status = 'cancelled' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Документ скасовано — видавати за ним не можна');
    END IF;
    IF o.status = 'issued' THEN
        RETURN jsonb_build_object('ok', false, 'message', 'За цим документом уже все видано');
    END IF;
    IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Не вказано жодної позиції до видачі');
    END IF;

    -- Спершу перевіряємо ВСЕ, і лише потім змінюємо
    FOR rec IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_qty := NULLIF(rec->>'qty', '')::numeric;
        CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

        SELECT * INTO it FROM issue_order_items
        WHERE id = (rec->>'item_id')::bigint AND issue_order_id = p_order_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'message', 'Позицію не знайдено в документі');
        END IF;
        IF v_qty > it.requested_quantity - it.issued_quantity THEN
            RETURN jsonb_build_object('ok', false,
                'message', format('Позиція %s: у документі лишилось видати %s',
                                  it.nomenclature_id, it.requested_quantity - it.issued_quantity));
        END IF;

        PERFORM lock_stock_slot(o.warehouse_id, it.nomenclature_id);

        SELECT COALESCE(quantity_available, 0) INTO v_avail
        FROM v_warehouse_stock_available
        WHERE warehouse_id = o.warehouse_id AND nomenclature_id = it.nomenclature_id;

        IF v_qty > COALESCE(v_avail, 0) THEN
            RETURN jsonb_build_object('ok', false,
                'message', format('Недостатньо вільного залишку: доступно %s', COALESCE(v_avail, 0)));
        END IF;
    END LOOP;

    -- Проводимо
    FOR rec IN SELECT * FROM jsonb_array_elements(p_lines)
    LOOP
        v_qty := NULLIF(rec->>'qty', '')::numeric;
        CONTINUE WHEN v_qty IS NULL OR v_qty <= 0;

        SELECT * INTO it FROM issue_order_items
        WHERE id = (rec->>'item_id')::bigint AND issue_order_id = p_order_id;

        INSERT INTO stock_movements(
            operation_type, nomenclature_id, quantity, warehouse_from_id,
            installation_custom_id, client_id, reference_document, notes,
            sale_price, performed_by, created_by
        ) VALUES (
            o.purpose::stock_operation_type, it.nomenclature_id, v_qty, o.warehouse_id,
            o.installation_custom_id, o.client_id, o.doc_number,
            COALESCE(o.notes, '') || CASE WHEN o.recipient_name IS NOT NULL
                                          THEN ' · отримувач: ' || o.recipient_name ELSE '' END,
            CASE WHEN o.purpose = 'sale' THEN it.unit_price ELSE NULL END,
            p_emp, p_emp
        );

        UPDATE issue_order_items
        SET issued_quantity = issued_quantity + v_qty, updated_at = now()
        WHERE id = it.id;

        v_moves := v_moves + 1;
        v_total := v_total + v_qty;
    END LOOP;

    -- Документ закритий, лише коли видано всі позиції повністю
    SELECT bool_and(issued_quantity >= requested_quantity) INTO v_all_done
    FROM issue_order_items WHERE issue_order_id = p_order_id;

    UPDATE issue_orders
    SET status     = CASE WHEN v_all_done THEN 'issued' ELSE 'ready' END,
        issued_by  = COALESCE(issued_by, p_emp),
        issued_at  = CASE WHEN v_all_done THEN now() ELSE issued_at END,
        updated_at = now(), updated_by = p_emp
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'ok', true, 'movements', v_moves, 'total_quantity', v_total,
        'fully_issued', v_all_done
    );
END $$;


-- =====================================================================
--  БЛОК E · Резерв під документ (необов'язково, але корисно)
--
--  Поки документ у стані «готовий до видачі», товар фізично ще на
--  складі — і його може забрати хтось інший. Ця функція ставить
--  резерв під об'єкт документа, щоб цього не сталось.
--  Працює лише для документів, прив'язаних до об'єкта.
-- =====================================================================

CREATE OR REPLACE FUNCTION issue_order_reserve(
    p_order_id bigint,
    p_emp      integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    o        issue_orders%ROWTYPE;
    r        record;
    v_done   integer := 0;
    v_res    jsonb;
BEGIN
    SELECT * INTO o FROM issue_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Документ не знайдено');
    END IF;
    IF o.installation_custom_id IS NULL THEN
        RETURN jsonb_build_object('ok', false,
            'message', 'Резерв ставиться лише під об’єкт. Цей документ до об’єкта не прив’язаний.');
    END IF;

    FOR r IN
        SELECT item_id, nomenclature_id, can_issue_now
        FROM v_issue_order_readiness
        WHERE issue_order_id = p_order_id AND can_issue_now > 0
    LOOP
        -- NULL обовʼязково з типом: інакше Postgres не обере перевантаження функції
        v_res := reserve_for_object(
            o.installation_custom_id, o.warehouse_id, r.nomenclature_id,
            NULL::bigint, r.can_issue_now, p_emp
        );
        IF (v_res->>'ok')::boolean THEN v_done := v_done + 1; END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'reserved_items', v_done);
END $$;


-- =====================================================================
--  БЛОК F · Перевірка
-- =====================================================================

-- SELECT * FROM issue_orders ORDER BY created_at DESC LIMIT 5;
-- SELECT * FROM v_issue_order_readiness WHERE issue_order_id = <id>;
