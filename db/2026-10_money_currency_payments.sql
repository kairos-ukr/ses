-- =====================================================================
--  K-CORE · Гроші: валюта, точні суми, «оплачено» з платежів
--
--  НАВІЩО
--   1. Валюта. КП бувають у доларах і в гривнях, а в об'єкта валюти не
--      було — сторінки показували все як «$». Тепер кожен об'єкт має
--      currency (USD або UAH), за замовчуванням USD.
--   2. Точність. Суми зберігались у типі real (≈7 значущих цифр), де
--      копійки «пливуть». Переводимо в numeric(14,2).
--   3. «Оплачено». Його вписували руками (34 об'єкти мають суму без
--      жодного платежу), а статус оплати не оновлювався: 147 завершених
--      об'єктів досі «очікують оплати». Тепер:
--        • «оплачено» = сума внесених платежів, рахує сама база;
--        • статус оплати ставиться сам: немає платежів → «очікує»,
--          частина → «часткова», уся сума → «оплачено».
--   4. Платіж в іншій валюті (угода в доларах, заплатили гривнями) —
--      вказується курс (гривень за 1 долар), і в угоду зараховується
--      перерахована сума (amount_object).
--
--  ЩОБ НІЧОГО НЕ ЗАГУБИЛОСЬ
--   Для кожного об'єкта, де вписане «оплачено» більше за суму платежів,
--   створюється платіж «Перенесено» на різницю. Тож після міграції
--   «оплачено» в кожного об'єкта лишається тим самим, що й було.
--   Дату й спосіб таких платежів потім можна уточнити в картці.
--
--  ЩО ЗАЛИШАЄТЬСЯ ЯК БУЛО
--   • Сума з КП так само підставляється у вартість, тепер разом із
--     валютою КП. Якщо по об'єкту вже є платежі в іншій валюті, сума
--     з КП не перезаписує вартість — щоб не змішати валюти.
--   • Дати «оновлено» об'єктів не змінюються (тригери дат вимкнені
--     на час перерахунку).
--
--  Інтерфейс сам перейде на новий облік після цієї міграції
--  (src/utils/features.js → hasMoneyCurrency).
--
--  Усе в одній транзакції: при помилці нічого не зміниться.
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  1. Валюта об'єкта
-- ---------------------------------------------------------------------

ALTER TABLE installations
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'installations_currency_check') THEN
    ALTER TABLE installations ADD CONSTRAINT installations_currency_check CHECK (currency IN ('USD', 'UAH'));
  END IF;
END $$;


-- ---------------------------------------------------------------------
--  2. Точні суми: real → numeric(14,2)
--     Представлення v_commercial_offer_current залежить від total_cost,
--     тому його тимчасово прибираємо і створюємо знову таким самим.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS v_commercial_offer_current;

-- Тригер «вартість введено руками» прив'язаний до колонки total_cost —
-- Postgres не дасть змінити її тип, поки тригер існує. Знімаємо й
-- одразу ставимо назад таким самим.
DROP TRIGGER IF EXISTS trg_installations_mark_manual_cost ON installations;

ALTER TABLE installations
  ALTER COLUMN total_cost  TYPE numeric(14,2) USING round(total_cost::numeric, 2),
  ALTER COLUMN paid_amount TYPE numeric(14,2) USING round(paid_amount::numeric, 2);

CREATE TRIGGER trg_installations_mark_manual_cost
    BEFORE UPDATE OF total_cost ON installations
    FOR EACH ROW EXECUTE FUNCTION installations_mark_manual_cost();

ALTER TABLE payment_history
  ALTER COLUMN amount TYPE numeric(14,2) USING round(amount::numeric, 2);

CREATE VIEW v_commercial_offer_current AS
 SELECT o.id AS offer_id,
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
        CASE
            WHEN COALESCE(o.capacity_kw, 0::numeric) > 0::numeric THEN round(o.total_amount / o.capacity_kw, 1)
            ELSE NULL::numeric
        END AS price_per_kw,
    ( SELECT count(*) AS count
           FROM commercial_offer_items ci
          WHERE ci.offer_id = o.id) AS items_count,
    i.name AS installation_name,
    i.total_cost AS deal_total_cost,
    i.total_cost_source,
        CASE
            WHEN o.total_amount IS NULL THEN NULL::numeric
            ELSE round(i.total_cost - o.total_amount, 2)
        END AS deal_vs_offer
   FROM commercial_offers o
     JOIN installations i ON i.custom_id = o.installation_custom_id
  WHERE o.is_current;

GRANT SELECT ON v_commercial_offer_current TO anon, authenticated, service_role;


-- ---------------------------------------------------------------------
--  3. Валюта з поточного КП (там, де вартість прийшла з КП)
-- ---------------------------------------------------------------------

ALTER TABLE installations DISABLE TRIGGER USER;

UPDATE installations i
   SET currency = o.currency
  FROM commercial_offers o
 WHERE o.installation_custom_id = i.custom_id
   AND o.is_current
   AND i.total_cost_source = 'offer'
   AND o.currency IN ('USD', 'UAH')
   AND i.currency IS DISTINCT FROM o.currency;

ALTER TABLE installations ENABLE TRIGGER USER;


-- ---------------------------------------------------------------------
--  4. Платежі: валюта, курс, сума в валюті угоди, хто вніс
-- ---------------------------------------------------------------------

ALTER TABLE payment_history
  ADD COLUMN IF NOT EXISTS currency      text,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(12,4),
  ADD COLUMN IF NOT EXISTS amount_object numeric(14,2),
  ADD COLUMN IF NOT EXISTS created_by    integer REFERENCES employees(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_history_currency_check') THEN
    ALTER TABLE payment_history ADD CONSTRAINT payment_history_currency_check
      CHECK (currency IS NULL OR currency IN ('USD', 'UAH'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_history_rate_check') THEN
    ALTER TABLE payment_history ADD CONSTRAINT payment_history_rate_check
      CHECK (exchange_rate IS NULL OR exchange_rate > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_history_installation ON payment_history (installation_custom_id);

-- Поки переносимо дані, старий тригер не повинен «торкатись» об'єктів
-- (інакше в них змінилась би дата оновлення). Усе перерахуємо в кроці 9.
ALTER TABLE payment_history DISABLE TRIGGER on_payment_history_change;

-- Наявні платежі вважаємо внесеними у валюті угоди (так їх і показували)
UPDATE payment_history p
   SET currency      = i.currency,
       amount_object = p.amount
  FROM installations i
 WHERE i.custom_id = p.installation_custom_id
   AND p.currency IS NULL;


-- ---------------------------------------------------------------------
--  5. Перенесення вписаного руками «оплачено» в платежі
-- ---------------------------------------------------------------------

INSERT INTO payment_history
  (installation_custom_id, amount, currency, amount_object, paid_at, payment_method, comment)
SELECT i.custom_id,
       round(i.paid_amount - COALESCE(s.paid, 0), 2),
       i.currency,
       round(i.paid_amount - COALESCE(s.paid, 0), 2),
       COALESCE(i.start_date, i.updated_at::date, i.created_at::date, CURRENT_DATE),
       'Перенесено',
       'Сума з поля «Оплачено», внесена до переходу на облік платежів (жовтень 2026). Дату й спосіб оплати можна уточнити.'
  FROM installations i
  LEFT JOIN (
        SELECT installation_custom_id, sum(amount) AS paid
          FROM payment_history
         GROUP BY installation_custom_id
       ) s ON s.installation_custom_id = i.custom_id
 WHERE COALESCE(i.paid_amount, 0) - COALESCE(s.paid, 0) > 0.5;

ALTER TABLE payment_history ENABLE TRIGGER on_payment_history_change;


-- ---------------------------------------------------------------------
--  6. Розрахунок суми платежу у валюті угоди
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION payment_history_prepare()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_cur text;
BEGIN
    SELECT currency INTO v_cur FROM installations WHERE custom_id = NEW.installation_custom_id;
    v_cur := COALESCE(v_cur, 'USD');
    NEW.currency := COALESCE(NEW.currency, v_cur);

    IF NEW.currency = v_cur THEN
        NEW.amount_object := NEW.amount;
        NEW.exchange_rate := NULL;
    ELSIF NEW.exchange_rate IS NULL THEN
        RAISE EXCEPTION 'Угода в %, а платіж у %: вкажіть курс (гривень за 1 долар)',
            CASE v_cur WHEN 'USD' THEN 'доларах' ELSE 'гривнях' END,
            CASE NEW.currency WHEN 'USD' THEN 'доларах' ELSE 'гривнях' END
            USING ERRCODE = 'P0001';
    ELSIF NEW.currency = 'UAH' AND v_cur = 'USD' THEN
        NEW.amount_object := round(NEW.amount / NEW.exchange_rate, 2);
    ELSE
        NEW.amount_object := round(NEW.amount * NEW.exchange_rate, 2);
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_history_prepare ON payment_history;
CREATE TRIGGER trg_payment_history_prepare
    BEFORE INSERT OR UPDATE ON payment_history
    FOR EACH ROW EXECUTE FUNCTION payment_history_prepare();


-- ---------------------------------------------------------------------
--  7. «Оплачено» і статус оплати рахує база
-- ---------------------------------------------------------------------

-- Будь-який запис об'єкта: «оплачено» = сума платежів, статус — з неї.
-- Тому навіть старий код чи бот не можуть розсинхронізувати ці поля.
CREATE OR REPLACE FUNCTION installations_money()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Валюту не можна міняти, якщо вже є платежі: їхні суми порахувались у старій
    IF TG_OP = 'UPDATE' AND NEW.currency IS DISTINCT FROM OLD.currency
       AND EXISTS (SELECT 1 FROM payment_history WHERE installation_custom_id = NEW.custom_id) THEN
        RAISE EXCEPTION 'Валюту угоди не можна змінити: по об''єкту вже є платежі. Спершу видаліть їх.'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(sum(amount_object), 0) INTO NEW.paid_amount
      FROM payment_history
     WHERE installation_custom_id = NEW.custom_id;

    NEW.payment_status := CASE
        WHEN NEW.paid_amount <= 0 THEN 'pending'
        WHEN COALESCE(NEW.total_cost, 0) > 0 AND NEW.paid_amount >= NEW.total_cost - 0.01 THEN 'paid'
        ELSE 'partial'
    END;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_installations_money ON installations;
CREATE TRIGGER trg_installations_money
    BEFORE INSERT OR UPDATE ON installations
    FOR EACH ROW EXECUTE FUNCTION installations_money();

-- Платіж додали, змінили чи видалили — «торкаємось» об'єкта, і він
-- перераховується тригером вище. Обробляємо і старий, і новий об'єкт
-- (на випадок, якщо платіж перенесли з одного об'єкта на інший).
CREATE OR REPLACE FUNCTION update_installation_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        UPDATE installations SET paid_amount = paid_amount WHERE custom_id = OLD.installation_custom_id;
    END IF;
    IF TG_OP IN ('INSERT', 'UPDATE')
       AND (TG_OP = 'INSERT' OR NEW.installation_custom_id IS DISTINCT FROM OLD.installation_custom_id) THEN
        UPDATE installations SET paid_amount = paid_amount WHERE custom_id = NEW.installation_custom_id;
    ELSIF TG_OP = 'UPDATE' THEN
        NULL;  -- той самий об'єкт уже перераховано вище
    END IF;
    RETURN NULL;
END $$;

-- Тригер on_payment_history_change уже викликає цю функцію (AFTER INSERT/UPDATE/DELETE)


-- ---------------------------------------------------------------------
--  8. Сума з КП — разом із валютою КП
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_offer_total(p_offer_id bigint, p_force boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_offer commercial_offers%ROWTYPE;
    v_cur   text;
BEGIN
    SELECT * INTO v_offer FROM commercial_offers WHERE id = p_offer_id;
    IF NOT FOUND OR v_offer.total_amount IS NULL THEN
        RETURN;
    END IF;

    SELECT currency INTO v_cur FROM installations WHERE custom_id = v_offer.installation_custom_id;
    -- Невідома або порожня валюта КП — лишаємо валюту угоди
    IF v_offer.currency IS NULL OR v_offer.currency NOT IN ('USD', 'UAH') THEN
        v_offer.currency := v_cur;
    END IF;

    -- КП в іншій валюті, а платежі вже йдуть у поточній — не змішуємо
    IF v_offer.currency IS DISTINCT FROM v_cur
       AND EXISTS (SELECT 1 FROM payment_history WHERE installation_custom_id = v_offer.installation_custom_id) THEN
        RETURN;
    END IF;

    PERFORM set_config('kcore.cost_from_offer', 'on', true);

    UPDATE installations
       SET total_cost        = v_offer.total_amount,
           currency          = v_offer.currency,
           total_cost_source = 'offer',
           updated_at        = now()
     WHERE custom_id = v_offer.installation_custom_id
       -- Порожню суму заповнюємо; свою, з попереднього КП, оновлюємо;
       -- введену руками чіпаємо лише на явну команду
       AND (p_force
            OR total_cost IS NULL
            OR total_cost = 0
            OR total_cost_source = 'offer')
       AND (total_cost IS DISTINCT FROM round(v_offer.total_amount, 2)
            OR currency IS DISTINCT FROM v_offer.currency);

    PERFORM set_config('kcore.cost_from_offer', 'off', true);
END $$;


-- ---------------------------------------------------------------------
--  9. Перерахунок усіх об'єктів один раз
--     Тригери дат і забезпечення вимкнені: змінюються лише гроші.
-- ---------------------------------------------------------------------

ALTER TABLE installations DISABLE TRIGGER USER;

UPDATE installations i
   SET paid_amount    = s.paid,
       payment_status = CASE
           WHEN s.paid <= 0 THEN 'pending'
           WHEN COALESCE(i.total_cost, 0) > 0 AND s.paid >= i.total_cost - 0.01 THEN 'paid'
           ELSE 'partial'
       END
  FROM (
        SELECT i2.custom_id, COALESCE(sum(p.amount_object), 0) AS paid
          FROM installations i2
          LEFT JOIN payment_history p ON p.installation_custom_id = i2.custom_id
         GROUP BY i2.custom_id
       ) s
 WHERE s.custom_id = i.custom_id;

ALTER TABLE installations ENABLE TRIGGER USER;

COMMIT;


-- ---------------------------------------------------------------------
--  ПЕРЕВІРКА
-- ---------------------------------------------------------------------

-- 1) «Оплачено» скрізь дорівнює сумі платежів (очікується 0)
SELECT count(*) AS mismatched
FROM installations i
LEFT JOIN (SELECT installation_custom_id, sum(amount_object) AS paid
             FROM payment_history GROUP BY 1) s ON s.installation_custom_id = i.custom_id
WHERE abs(COALESCE(i.paid_amount, 0) - COALESCE(s.paid, 0)) > 0.01;

-- 2) Скільки платежів «Перенесено» створено (на момент написання — 35)
SELECT count(*) AS carried_over, sum(amount) AS total
FROM payment_history WHERE payment_method = 'Перенесено';

-- 3) Розподіл статусів оплати після перерахунку
SELECT payment_status, count(*) FROM installations GROUP BY 1 ORDER BY 1;

-- 4) Об'єкти в гривнях і великі суми в доларах — перевірте валюту вручну.
--    Наприклад, вартість понад 100 000 без потужності може бути в гривнях.
SELECT custom_id, name, total_cost, currency, capacity_kw, total_cost_source
FROM installations
WHERE currency = 'UAH' OR (currency = 'USD' AND total_cost > 100000)
ORDER BY total_cost DESC;
