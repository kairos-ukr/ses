-- =====================================================================
--  K-CORE · Особисті повідомлення Telegram-бота
--
--  Група з гілками об'єктів лишається для всієї команди. Особисто
--  людині бот пише те, що стосується саме її: доручені задачі та їхні
--  дедлайни, призначення відповідальним за етап, нагадування
--  забезпечення, низькі залишки.
--
--  Тут три речі:
--
--  1. bot_personal_messages — журнал надісланого особисто. Ключ
--     (вид, посилання, чат) не дає надіслати те саме двічі: ні при
--     повторному проході циклу, ні після перезапуску бота.
--
--  2. notification_subscriptions — хто що отримує поза власними
--     задачами. Налаштовується в картці працівника:
--       low_stock — низькі залишки на складі;
--       system    — системні повідомлення: оцифровка, помилки бота,
--                   підключення людей до бота (додатково до ADMIN_ID
--                   з налаштувань бота).
--
--  3. stock_min_notified — які позиції вже «повідомлені» як нижчі за
--     мінімум. Бот пише, коли позиція опускається нижче, а не щоразу,
--     поки вона там лежить. Щойно залишок відновився — рядок зникає,
--     і наступне падіння знову буде новиною.
--
--  Залежить від: 2026-09_stock_rules_and_alerts.sql,
--                2026-09_supply_alerts_bot_ready.sql.
--  Застосовувати в Supabase → SQL Editor, цілим файлом.
-- =====================================================================

BEGIN;


-- =====================================================================
--  БЛОК A · Журнал особистих повідомлень
-- =====================================================================

CREATE TABLE IF NOT EXISTS bot_personal_messages (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id          integer REFERENCES employees(id) ON DELETE SET NULL,
    telegram_chat_id     bigint  NOT NULL,
    -- task_assigned | task_deadline | stage_assigned | supply_alert | low_stock
    kind                 text    NOT NULL,
    -- що саме надіслали: номер задачі, події, нагадування (+ дата для щоденних)
    ref_key              text    NOT NULL,
    telegram_message_id  bigint,
    sent_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bot_personal_messages_once
    ON bot_personal_messages (kind, ref_key, telegram_chat_id);

CREATE INDEX IF NOT EXISTS idx_bot_personal_messages_employee
    ON bot_personal_messages (employee_id, sent_at DESC);

ALTER TABLE bot_personal_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bot_personal_messages_read" ON bot_personal_messages;
CREATE POLICY "bot_personal_messages_read" ON bot_personal_messages
    FOR SELECT TO authenticated USING (true);


-- =====================================================================
--  БЛОК B · Хто що отримує
-- =====================================================================

CREATE TABLE IF NOT EXISTS notification_subscriptions (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id  integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    topic        text    NOT NULL CHECK (topic IN ('low_stock', 'system')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (employee_id, topic)
);

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_subscriptions_authenticated" ON notification_subscriptions;
CREATE POLICY "notification_subscriptions_authenticated" ON notification_subscriptions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- =====================================================================
--  БЛОК C · Стан низьких залишків для бота
-- =====================================================================

CREATE TABLE IF NOT EXISTS stock_min_notified (
    nomenclature_id   bigint PRIMARY KEY REFERENCES nomenclature(id) ON DELETE CASCADE,
    below_since       timestamptz NOT NULL DEFAULT now(),
    last_notified_at  timestamptz
);

ALTER TABLE stock_min_notified ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_min_notified_read" ON stock_min_notified;
CREATE POLICY "stock_min_notified_read" ON stock_min_notified
    FOR SELECT TO authenticated USING (true);

COMMIT;


-- =====================================================================
--  БЛОК D · Перевірка
-- =====================================================================

-- Хто підключений до бота:
-- SELECT name, telegram_user_id FROM employees WHERE telegram_user_id IS NOT NULL ORDER BY name;

-- Хто що отримує:
-- SELECT e.name, s.topic FROM notification_subscriptions s JOIN employees e ON e.id = s.employee_id ORDER BY s.topic, e.name;

-- Що бот надіслав особисто за добу:
-- SELECT m.sent_at, m.kind, m.ref_key, e.name
--   FROM bot_personal_messages m LEFT JOIN employees e ON e.id = m.employee_id
--  WHERE m.sent_at > now() - interval '1 day' ORDER BY m.sent_at DESC;
