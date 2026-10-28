-- =====================================================================
--  K-CORE · Нагадування забезпечення: без автозаявок, готові для бота
--
--  Доповнює db/2026-09_stock_rules_and_alerts.sql. Дві зміни:
--
--  1. АВТОЗАЯВКИ ВИМКНЕНО. Нагадування більше не ставлять заявки в
--     закупівлю самі — ні тригерами, ні кнопкою. Підхід до автоматичної
--     закупівлі буде переосмислено окремо. Заявки, які вже встигли
--     створитись (source = 'auto_protection'), лишаються як є.
--
--  2. ГОТОВНІСТЬ ДО TELEGRAM-БОТА. Бот надсилатиме нагадування
--     особисто відповідальному. Для цього:
--       · employees.telegram_user_id — куди писати людині;
--       · supply_alerts.assigned_to — кому доручено нагадування.
--         Рахується саме: відповідальний за етап «Комплектація ел.
--         захисту», інакше — відповідальний за об'єкт. Призначене
--         руками перерахунок не перебиває;
--       · v_supply_alert_outbox — що саме зараз треба надіслати;
--       · supply_alert_mark_sent() — бот позначає надіслане;
--       · supply_alert_notifications — журнал: що, кому, коли, яке
--         повідомлення в Telegram (щоб потім його редагувати).
--
--  Бот працює з ключем service_role, тому черга й позначка доступні
--  лише йому. Інтерфейсу вони не потрібні.
--
--  Застосовувати в Supabase → SQL Editor, цілим файлом.
-- =====================================================================

BEGIN;


-- =====================================================================
--  БЛОК A · Кому писати
-- =====================================================================

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS telegram_user_id bigint;

-- Один Telegram — одна людина: інакше нагадування іншого працівника
-- прийде не тому
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_telegram_user_id
    ON employees (telegram_user_id) WHERE telegram_user_id IS NOT NULL;

ALTER TABLE supply_alerts
    ADD COLUMN IF NOT EXISTS assigned_to       integer REFERENCES employees(id),
    ADD COLUMN IF NOT EXISTS assigned_manually boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_supply_alerts_assignee
    ON supply_alerts (assigned_to) WHERE status = 'open';

-- Нагадування передали іншій людині — вона має отримати його як нове,
-- а не чекати добу до наступного повтору
CREATE OR REPLACE FUNCTION supply_alerts_on_reassign()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        NEW.last_reminder_sent_at := NULL;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_supply_alerts_reassign ON supply_alerts;
CREATE TRIGGER trg_supply_alerts_reassign
    BEFORE UPDATE OF assigned_to ON supply_alerts
    FOR EACH ROW EXECUTE FUNCTION supply_alerts_on_reassign();


-- =====================================================================
--  БЛОК B · Відкрити / закрити нагадування — тепер із відповідальним
--
--  Стара п'ятипараметрична версія лишилась би перевантаженням, і виклик
--  із п'ятьма аргументами став би неоднозначним. Тому — спершу DROP.
-- =====================================================================

DROP FUNCTION IF EXISTS supply_alert_set(integer, text, boolean, date, jsonb);

CREATE OR REPLACE FUNCTION supply_alert_set(
    p_installation integer,
    p_kind         text,
    p_open         boolean,
    p_due          date    DEFAULT NULL,
    p_details      jsonb   DEFAULT '{}'::jsonb,
    p_assignee     integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_open THEN
        INSERT INTO supply_alerts (installation_custom_id, kind, status, due_date, details, assigned_to)
        VALUES (p_installation, p_kind, 'open', p_due, COALESCE(p_details, '{}'::jsonb), p_assignee)
        ON CONFLICT (installation_custom_id, kind) DO UPDATE
           SET status        = CASE WHEN supply_alerts.status = 'dismissed' THEN 'dismissed' ELSE 'open' END,
               opened_at     = CASE WHEN supply_alerts.status = 'done' THEN now() ELSE supply_alerts.opened_at END,
               resolved_at   = CASE WHEN supply_alerts.status = 'done' THEN NULL ELSE supply_alerts.resolved_at END,
               snoozed_until = CASE WHEN supply_alerts.status = 'done' THEN NULL ELSE supply_alerts.snoozed_until END,
               last_reminder_sent_at = CASE WHEN supply_alerts.status = 'done' THEN NULL
                                            ELSE supply_alerts.last_reminder_sent_at END,
               due_date      = EXCLUDED.due_date,
               details       = EXCLUDED.details,
               assigned_to   = CASE WHEN supply_alerts.assigned_manually THEN supply_alerts.assigned_to
                                    ELSE EXCLUDED.assigned_to END,
               updated_at    = now()
         WHERE supply_alerts.status = 'done'
            OR supply_alerts.due_date IS DISTINCT FROM EXCLUDED.due_date
            OR supply_alerts.details  IS DISTINCT FROM EXCLUDED.details
            OR (NOT supply_alerts.assigned_manually
                AND supply_alerts.assigned_to IS DISTINCT FROM EXCLUDED.assigned_to);
    ELSE
        UPDATE supply_alerts
           SET status = 'done', resolved_at = now(), updated_at = now()
         WHERE installation_custom_id = p_installation
           AND kind = p_kind
           AND status = 'open';
    END IF;
END $$;


-- =====================================================================
--  БЛОК C · Перерахунок об'єкта без автозаявок
--
--  Сигнатура та сама — щоб не ламати гранти й виклики. Параметр
--  p_create_requests лишився для сумісності й ні на що не впливає.
-- =====================================================================

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
    v_stage_resp  integer;
    v_assignee    integer;
    v_spec_id     bigint;
    v_spec_date   date;
    v_positions   integer := 0;
    v_missing     integer := 0;
    v_reservable  integer := 0;
    r             record;
BEGIN
    SELECT * INTO v_inst FROM installations WHERE custom_id = p_installation;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'installation_not_found');
    END IF;

    -- На паузі й закриті об'єкти не нагадують
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

    SELECT status, responsible_emp_custom_id INTO v_stage, v_stage_resp
      FROM project_stages
     WHERE installation_custom_id = p_installation
       AND stage_key = 'comp_protection'
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1;

    -- Відповідальний за етап захисту, інакше — за об'єкт. В етапах і
    -- об'єктах це custom_id працівника, у складських таблицях — id.
    SELECT e.id INTO v_assignee
      FROM employees e
     WHERE e.custom_id = COALESCE(v_stage_resp, v_inst.responsible_emp_id)
     LIMIT 1;

    SELECT id, confirmed_at::date INTO v_spec_id, v_spec_date
      FROM specifications
     WHERE installation_custom_id = p_installation
       AND notes = 'comp_protection'
       AND status = 'confirmed'
     ORDER BY version DESC
     LIMIT 1;

    -- КРОК 1 · Скласти специфікацію
    PERFORM supply_alert_set(
        p_installation, 'protection_spec',
        v_live
            AND v_spec_id IS NULL
            AND (v_offer_has OR v_stage = 'in_progress')
            AND v_stage IS DISTINCT FROM 'done',
        COALESCE(v_inst.start_date - 14, v_offer_date + 3),
        jsonb_build_object('from_offer', v_offer_has, 'stage_status', v_stage),
        v_assignee
    );

    -- КРОК 2 · Забезпечити специфікацію: лише рахуємо, нічого не замовляємо
    IF v_spec_id IS NOT NULL THEN
        FOR r IN
            SELECT nd.outstanding_need                    AS left_qty,
                   GREATEST(COALESCE(st.available, 0), 0) AS free_stock
              FROM (SELECT DISTINCT nomenclature_id
                      FROM specification_items
                     WHERE specification_id = v_spec_id) it
              JOIN v_object_material_needs nd
                ON nd.installation_custom_id = p_installation
               AND nd.nomenclature_id        = it.nomenclature_id
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
        END LOOP;
    END IF;

    PERFORM supply_alert_set(
        p_installation, 'protection_supply',
        v_live AND v_spec_id IS NOT NULL AND v_missing > 0,
        COALESCE(v_inst.start_date - 7, v_spec_date + 5),
        jsonb_build_object('positions', v_positions, 'missing', v_missing,
                           'reservable', v_reservable, 'spec_id', v_spec_id),
        v_assignee
    );

    RETURN jsonb_build_object(
        'ok', true,
        'positions', v_positions,
        'missing', v_missing,
        'reservable', v_reservable,
        'assigned_to', v_assignee
    );
END $$;

-- Тригери кличуть цю обгортку — тепер без заявок
CREATE OR REPLACE FUNCTION refresh_object_supply_safe(p_installation integer)
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF p_installation IS NULL THEN
        RETURN;
    END IF;
    PERFORM refresh_object_supply(p_installation, false);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'refresh_object_supply(%) failed: %', p_installation, SQLERRM;
END $$;

-- Змінили відповідального за об'єкт чи за етап — нагадування переходить до нього
DROP TRIGGER IF EXISTS trg_installations_supply ON installations;
CREATE TRIGGER trg_installations_supply
    AFTER UPDATE OF status, start_date, responsible_emp_id ON installations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
       OR OLD.start_date IS DISTINCT FROM NEW.start_date
       OR OLD.responsible_emp_id IS DISTINCT FROM NEW.responsible_emp_id)
    EXECUTE FUNCTION trg_supply_on_installation();

DROP TRIGGER IF EXISTS trg_project_stages_supply ON project_stages;
CREATE TRIGGER trg_project_stages_supply
    AFTER INSERT OR UPDATE OF status, responsible_emp_custom_id ON project_stages
    FOR EACH ROW
    WHEN (NEW.stage_key = 'comp_protection')
    EXECUTE FUNCTION trg_supply_on_stage();


-- =====================================================================
--  БЛОК D · Для інтерфейсу: хто відповідає і чи дійде до нього бот
--
--  Нові колонки — лише в кінці: так CREATE OR REPLACE VIEW дозволено.
--  Сам Telegram ID інтерфейсу не віддаємо — достатньо знати, що він є.
-- =====================================================================

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
    (a.due_date IS NOT NULL AND a.due_date < current_date) AS is_overdue,
    a.assigned_to,
    a.assigned_manually,
    e.name        AS assignee_name,
    (e.telegram_user_id IS NOT NULL) AS assignee_has_telegram
FROM supply_alerts a
JOIN installations i ON i.custom_id = a.installation_custom_id
LEFT JOIN clients c  ON c.custom_id = i.client_id
LEFT JOIN employees e ON e.id = a.assigned_to
WHERE a.status = 'open'
  AND (a.snoozed_until IS NULL OR a.snoozed_until <= current_date);

GRANT SELECT ON v_supply_alerts TO anon, authenticated;


-- =====================================================================
--  БЛОК E · Журнал надісланого
-- =====================================================================

CREATE TABLE IF NOT EXISTS supply_alert_notifications (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert_id             bigint  NOT NULL REFERENCES supply_alerts(id) ON DELETE CASCADE,
    employee_id          integer REFERENCES employees(id),
    telegram_chat_id     bigint  NOT NULL,
    telegram_message_id  bigint,
    reason               text    NOT NULL DEFAULT 'reminder'
        CHECK (reason IN ('new', 'reminder', 'overdue')),
    sent_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supply_alert_notifications_alert
    ON supply_alert_notifications (alert_id, sent_at DESC);

ALTER TABLE supply_alert_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "supply_alert_notifications_read" ON supply_alert_notifications;
CREATE POLICY "supply_alert_notifications_read" ON supply_alert_notifications
    FOR SELECT TO authenticated USING (true);


-- =====================================================================
--  БЛОК F · Черга для бота
--
--  Один рядок — одне повідомлення, яке треба надіслати зараз:
--    · нагадування відкрите, не відкладене, об'єкт діючий;
--    · відповідальний є і вказав Telegram;
--    · ще не надсилали — або надсилали понад добу тому.
--
--  reason підказує тон повідомлення: new — перше, overdue — термін
--  минув, reminder — звичайний повтор.
--
--  Бот: SELECT * FROM v_supply_alert_outbox; → надіслав →
--       SELECT supply_alert_mark_sent(alert_id, telegram_chat_id, message_id, reason);
--  Тихі години, вихідні й частоту повторів зручніше тримати в боті:
--  черга лише каже, що вже «можна».
-- =====================================================================

CREATE OR REPLACE VIEW v_supply_alert_outbox AS
SELECT
    a.id                                   AS alert_id,
    a.kind,
    CASE a.kind
        WHEN 'protection_spec'   THEN 'Скласти специфікацію електрозахисту'
        WHEN 'protection_supply' THEN 'Забезпечити електрозахист'
        ELSE a.kind
    END                                    AS title,
    CASE a.kind
        WHEN 'protection_spec' THEN
            CASE WHEN COALESCE((a.details->>'from_offer')::boolean, false)
                 THEN 'У КП є електричний захист, а що саме купувати — ще не розписано'
                 ELSE 'Етап «Комплектація ел. захисту» в роботі, специфікації ще немає' END
        WHEN 'protection_supply' THEN
            'Бракує ' || COALESCE(a.details->>'missing', '?') || ' з '
            || COALESCE(a.details->>'positions', '?') || ' позицій'
            || CASE WHEN COALESCE((a.details->>'reservable')::int, 0) > 0
                    THEN ', ' || (a.details->>'reservable') || ' є на складі — зарезервуйте'
                    ELSE '' END
        ELSE ''
    END                                    AS summary,
    a.installation_custom_id,
    i.name                                 AS installation_name,
    COALESCE(c.company_name, c.name)       AS client_name,
    a.due_date,
    (a.due_date IS NOT NULL AND a.due_date < current_date) AS is_overdue,
    e.id                                   AS employee_id,
    e.name                                 AS employee_name,
    e.telegram_user_id                     AS telegram_chat_id,
    CASE WHEN a.last_reminder_sent_at IS NULL THEN 'new'
         WHEN a.due_date < current_date      THEN 'overdue'
         ELSE 'reminder' END               AS reason,
    a.last_reminder_sent_at
FROM supply_alerts a
JOIN installations i ON i.custom_id = a.installation_custom_id
LEFT JOIN clients c  ON c.custom_id = i.client_id
JOIN employees e     ON e.id = a.assigned_to
WHERE a.status = 'open'
  AND i.status IN ('planning', 'in_progress', 'pending')
  AND (a.snoozed_until IS NULL OR a.snoozed_until <= current_date)
  AND e.telegram_user_id IS NOT NULL
  AND (a.last_reminder_sent_at IS NULL
       OR a.last_reminder_sent_at < now() - interval '1 day');

-- Лише для бота: у черзі Telegram ID людей
REVOKE ALL ON v_supply_alert_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON v_supply_alert_outbox TO service_role;


CREATE OR REPLACE FUNCTION supply_alert_mark_sent(
    p_alert_id   bigint,
    p_chat_id    bigint,
    p_message_id bigint DEFAULT NULL,
    p_reason     text   DEFAULT 'reminder'
) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO supply_alert_notifications (alert_id, employee_id, telegram_chat_id, telegram_message_id, reason)
    SELECT a.id, a.assigned_to, p_chat_id, p_message_id, COALESCE(p_reason, 'reminder')
      FROM supply_alerts a
     WHERE a.id = p_alert_id;

    UPDATE supply_alerts
       SET last_reminder_sent_at = now()
     WHERE id = p_alert_id;
END $$;

REVOKE ALL ON FUNCTION supply_alert_mark_sent(bigint, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION supply_alert_mark_sent(bigint, bigint, bigint, text) TO service_role;

COMMIT;


-- =====================================================================
--  БЛОК G · Перерахунок: розставити відповідальних
-- =====================================================================

SELECT refresh_supply_alerts(false);


-- =====================================================================
--  БЛОК H · Перевірка
-- =====================================================================

-- Нагадування та кому доручено:
-- SELECT installation_custom_id, installation_name, kind, assignee_name, assignee_has_telegram
--   FROM v_supply_alerts ORDER BY due_date NULLS LAST;

-- Хто ще без Telegram, хоча має відкриті нагадування:
-- SELECT DISTINCT assignee_name FROM v_supply_alerts
--  WHERE assigned_to IS NOT NULL AND NOT assignee_has_telegram;

-- Нагадування без відповідального (ні в етапі, ні в об'єкті нікого):
-- SELECT installation_custom_id, installation_name, kind FROM v_supply_alerts WHERE assigned_to IS NULL;
