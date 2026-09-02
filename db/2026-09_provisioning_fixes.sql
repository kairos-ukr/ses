-- =====================================================================
--  K-CORE · Виправлення обліку потреби об'єкта
--
--  ГОЛОВНЕ: у в'юсі v_object_material_needs резерв і видача рахувались
--  подвійно, якщо та сама номенклатура зустрічається у специфікації
--  більше одного разу.
--
--  Як воно ламалось:
--    У специфікації два рядки того самого кабелю — 100 м і 120 м.
--    Підзапити reserved / issued групуються ПО НОМЕНКЛАТУРІ, тобто
--    дають один рядок «зарезервовано 50». LEFT JOIN приліплює ці 50
--    до ОБОХ рядків специфікації. У підсумку система вважає, що
--    зарезервовано 100 замість 50 — і показує дефіцит меншим, ніж він є.
--
--  Це стало реальним після FIX_specifications_one_confirmed_per_type:
--  тепер на об'єкті дві затверджені специфікації (матеріали + захист),
--  і спільна позиція в обох дає точно таке саме подвоєння.
--
--  Виправлення: спершу згортаємо позиції специфікацій до однієї на
--  пару (об'єкт, номенклатура), підсумовуючи потрібну кількість, і лише
--  потім приєднуємо резерв та видачу.
--
--  Набір колонок не змінюється, тож застосунок правити не треба.
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================


-- =====================================================================
--  БЛОК A · Потреба об'єкта без подвійного рахунку
-- =====================================================================

CREATE OR REPLACE VIEW v_object_material_needs AS
WITH spec_items AS (
    -- Одна позиція на пару (об'єкт, номенклатура). Кількості складаються,
    -- бо два рядки того самого товару — це просто одна потреба, записана двічі.
    SELECT
        s.installation_custom_id,
        si.nomenclature_id,
        MIN(si.id)                                   AS specification_item_id,
        MIN(COALESCE(si.original_name, n.name))      AS nomenclature_name,
        SUM(si.quantity)                             AS required_quantity
    FROM specifications s
    JOIN specification_items si ON si.specification_id = s.id
    JOIN nomenclature n         ON n.id = si.nomenclature_id
    WHERE s.status = 'confirmed'
    GROUP BY s.installation_custom_id, si.nomenclature_id
),
reserved AS (
    SELECT installation_custom_id, nomenclature_id,
           SUM(reserved_quantity - released_quantity) AS reserved_quantity
    FROM reservations
    WHERE status = 'active'
    GROUP BY installation_custom_id, nomenclature_id
),
issued AS (
    -- Продаж і передача теж вважаються видачею на об'єкт: матеріал
    -- фізично поїхав туди, незалежно від того, хто за нього платив.
    SELECT installation_custom_id, nomenclature_id,
           SUM(CASE WHEN operation_type IN ('issue','sale','partner_transfer') THEN quantity
                    WHEN operation_type = 'return'                             THEN -quantity
                    ELSE 0 END) AS issued_quantity
    FROM stock_movements
    WHERE installation_custom_id IS NOT NULL
      AND operation_type IN ('issue','sale','partner_transfer','return')
    GROUP BY installation_custom_id, nomenclature_id
)
SELECT
    si.installation_custom_id,
    si.specification_item_id,
    si.nomenclature_id,
    si.nomenclature_name,
    si.required_quantity,
    COALESCE(r.reserved_quantity, 0)::numeric AS reserved_quantity,
    COALESCE(i.issued_quantity, 0)::numeric   AS issued_quantity,
    GREATEST(
        si.required_quantity
        - COALESCE(r.reserved_quantity, 0)
        - COALESCE(i.issued_quantity, 0), 0
    )::numeric AS outstanding_need
FROM spec_items si
LEFT JOIN reserved r
       ON r.installation_custom_id = si.installation_custom_id
      AND r.nomenclature_id        = si.nomenclature_id
LEFT JOIN issued i
       ON i.installation_custom_id = si.installation_custom_id
      AND i.nomenclature_id        = si.nomenclature_id;


-- =====================================================================
--  БЛОК B · Що замовлено під об'єкт і ще не приїхало
--
--  Раніше це рахувалось у застосунку: тягнулись усі purchase_order_items
--  з вкладеними рухами й складались у пам'яті браузера. Тепер — запит
--  до в'юхи по одному об'єкту.
-- =====================================================================

DROP VIEW IF EXISTS v_object_incoming;
CREATE VIEW v_object_incoming AS
SELECT
    po.installation_custom_id,
    poi.nomenclature_id,
    SUM(GREATEST(poi.quantity - COALESCE(rec.received, 0), 0))::numeric AS incoming_quantity
FROM purchase_order_items poi
JOIN purchase_orders po ON po.id = poi.purchase_order_id
LEFT JOIN (
    SELECT purchase_order_item_id, SUM(quantity) AS received
    FROM stock_movements
    WHERE operation_type = 'purchase' AND purchase_order_item_id IS NOT NULL
    GROUP BY purchase_order_item_id
) rec ON rec.purchase_order_item_id = poi.id
WHERE po.installation_custom_id IS NOT NULL
  AND po.status IN ('draft', 'sent', 'partially_received')
GROUP BY po.installation_custom_id, poi.nomenclature_id
HAVING SUM(GREATEST(poi.quantity - COALESCE(rec.received, 0), 0)) > 0;


-- =====================================================================
--  БЛОК C · Заявки на закупівлю: зв'язки, яких бракувало
--
--  У procurement_requests був один-єдиний зовнішній ключ — на
--  номенклатуру. Заявка могла вказувати на неіснуючий об'єкт і на
--  звільненого працівника, а видалення об'єкта лишало заявки-сироти,
--  яких ніхто ніколи не побачить.
--
--  Перед виконанням варто глянути, чи немає вже таких сиріт:
--    SELECT * FROM procurement_requests r
--     WHERE NOT EXISTS (SELECT 1 FROM installations i
--                        WHERE i.custom_id = r.installation_custom_id);
--  Якщо щось знайдеться — видаліть або полагодьте, інакше ALTER впаде.
-- =====================================================================

ALTER TABLE procurement_requests
    DROP CONSTRAINT IF EXISTS procurement_requests_installation_fkey;
ALTER TABLE procurement_requests
    ADD CONSTRAINT procurement_requests_installation_fkey
    FOREIGN KEY (installation_custom_id) REFERENCES installations(custom_id);

ALTER TABLE procurement_requests
    DROP CONSTRAINT IF EXISTS procurement_requests_requested_by_fkey;
ALTER TABLE procurement_requests
    ADD CONSTRAINT procurement_requests_requested_by_fkey
    FOREIGN KEY (requested_by) REFERENCES employees(id);

ALTER TABLE procurement_requests
    DROP CONSTRAINT IF EXISTS procurement_requests_resolved_by_fkey;
ALTER TABLE procurement_requests
    ADD CONSTRAINT procurement_requests_resolved_by_fkey
    FOREIGN KEY (resolved_by) REFERENCES employees(id);

-- Місток «заявка → рядок замовлення постачальнику».
-- Поки що інформативний: заповнюється вручну або пізніше кодом.
-- Саме він замикає цикл із схеми В1 у ревізії.
ALTER TABLE procurement_requests
    ADD COLUMN IF NOT EXISTS purchase_order_item_id bigint;

ALTER TABLE procurement_requests
    DROP CONSTRAINT IF EXISTS procurement_requests_po_item_fkey;
ALTER TABLE procurement_requests
    ADD CONSTRAINT procurement_requests_po_item_fkey
    FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id);

-- Статус як перелік — щоб не з'явився черговий варіант написання
ALTER TABLE procurement_requests
    DROP CONSTRAINT IF EXISTS chk_procurement_requests_status;
ALTER TABLE procurement_requests
    ADD CONSTRAINT chk_procurement_requests_status
    CHECK (status IN ('requested', 'ordered', 'stock_confirmed', 'done', 'rejected'));


-- =====================================================================
--  БЛОК D · Перевірка
-- =====================================================================

-- Позиції, які зустрічаються у специфікаціях об'єкта більше одного разу.
-- Саме вони показували неправильний дефіцит до цієї міграції.
-- SELECT s.installation_custom_id, si.nomenclature_id, COUNT(*) AS lines
--   FROM specifications s
--   JOIN specification_items si ON si.specification_id = s.id
--  WHERE s.status = 'confirmed'
--  GROUP BY 1, 2 HAVING COUNT(*) > 1
--  ORDER BY 3 DESC;

-- SELECT * FROM v_object_incoming LIMIT 20;
