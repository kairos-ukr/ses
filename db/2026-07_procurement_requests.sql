-- =====================================================================
--  Заявки на закупівлю під об'єкт (інформативний місток між
--  забезпеченням об'єктів та менеджером закупівель).
--  Менеджер об'єкта: «потрібно замовити N штук під об'єкт X» (requested)
--  Закупівельник / будь-хто: міняє статус — замовлено / є на складі /
--  закрито / відхилено. Максимально гнучко, без жорстких переходів.
-- =====================================================================

CREATE TABLE IF NOT EXISTS procurement_requests (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    installation_custom_id integer NOT NULL,
    nomenclature_id bigint NOT NULL REFERENCES nomenclature(id),
    quantity numeric NOT NULL CHECK (quantity > 0),
    -- requested | ordered | stock_confirmed | done | rejected
    status varchar NOT NULL DEFAULT 'requested',
    note text,
    requested_by integer,          -- employees.id
    resolved_by integer,           -- employees.id (хто змінив статус останнім)
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_procurement_requests_installation
    ON procurement_requests (installation_custom_id);
CREATE INDEX IF NOT EXISTS idx_procurement_requests_status
    ON procurement_requests (status);

ALTER TABLE procurement_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "procurement_requests_all" ON procurement_requests;
CREATE POLICY "procurement_requests_all" ON procurement_requests
    FOR ALL USING (true) WITH CHECK (true);
