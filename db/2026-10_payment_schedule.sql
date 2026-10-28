-- =====================================================================
--  K-CORE · Графік платежів і борги (етап 4, п.16)
--
--  Для кожного об'єкта можна розписати, коли й скільки клієнт платить:
--  «Аванс 50% до 20.10», «Залишок після монтажу» тощо. Окремих позначок
--  «сплачено» в графіку немає: внесені платежі (payment_history →
--  installations.paid_amount) самі закривають рядки графіка по черзі,
--  від першого до останнього. Тож досить вносити платежі як раніше.
--
--  v_payment_schedule — кожен рядок графіка: скільки з нього сплачено,
--                       скільки лишилось, чи прострочено і на скільки днів.
--  v_receivables      — по об'єкту: хто винен, скільки, скільки
--                       прострочено, наступний платіж. Для списку
--                       «Борги» і для бота (нагадує відповідальному).
--
--  Дебіторка — ті самі правила, що в інтерфейсі (src/domain/pipeline.js):
--  об'єкт не втрачений і не скасований, є вартість і недоплата, і клієнт
--  уже погодився (платив, об'єкт дійшов до обладнання або завершений)
--  — або в графіку є прострочений платіж.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.payment_schedule (
    id                      bigserial PRIMARY KEY,
    installation_custom_id  integer NOT NULL REFERENCES public.installations(custom_id) ON DELETE CASCADE,
    seq                     smallint NOT NULL DEFAULT 1,
    title                   text NOT NULL,
    amount                  numeric(14,2) NOT NULL CHECK (amount > 0),
    due_date                date,
    note                    text,
    created_by              integer,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.payment_schedule IS
    'Графік платежів об''єкта: що й коли клієнт має сплатити. Сплачене рахується з payment_history по черзі рядків (v_payment_schedule).';
COMMENT ON COLUMN public.payment_schedule.amount IS 'Сума у валюті об''єкта (installations.currency).';
COMMENT ON COLUMN public.payment_schedule.due_date IS 'До якої дати; порожньо — без конкретної дати (напр. «після монтажу»).';

CREATE INDEX IF NOT EXISTS payment_schedule_installation_idx
    ON public.payment_schedule (installation_custom_id, seq, id);

DROP TRIGGER IF EXISTS set_updated_at_payment_schedule ON public.payment_schedule;
CREATE TRIGGER set_updated_at_payment_schedule
    BEFORE UPDATE ON public.payment_schedule
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_schedule TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payment_schedule_id_seq TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Рядки графіка зі сплаченим і простроченим
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_payment_schedule
WITH (security_invoker = true) AS
WITH s AS (
    SELECT
        ps.*,
        COALESCE(i.currency, 'USD') AS currency,
        COALESCE(i.paid_amount, 0)  AS object_paid,
        sum(ps.amount) OVER (PARTITION BY ps.installation_custom_id ORDER BY ps.seq, ps.id) AS cum_amount
    FROM public.payment_schedule ps
    JOIN public.installations i ON i.custom_id = ps.installation_custom_id
), p AS (
    SELECT
        s.*,
        GREATEST(0, LEAST(s.amount, s.object_paid - (s.cum_amount - s.amount))) AS paid_part
    FROM s
)
SELECT
    p.id, p.installation_custom_id, p.seq, p.title, p.amount, p.due_date, p.note,
    p.currency, p.created_by, p.created_at, p.updated_at,
    p.paid_part,
    p.amount - p.paid_part AS remaining,
    CASE
        WHEN p.amount - p.paid_part <= 0.009 THEN 'paid'
        WHEN p.due_date IS NOT NULL AND p.due_date < current_date THEN 'overdue'
        WHEN p.paid_part > 0 THEN 'partial'
        ELSE 'pending'
    END AS status,
    CASE
        WHEN p.amount - p.paid_part > 0.009 AND p.due_date IS NOT NULL AND p.due_date < current_date
        THEN current_date - p.due_date
    END AS days_overdue
FROM p;

COMMENT ON VIEW public.v_payment_schedule IS
    'Рядки графіка платежів: сплачено (paid_part, по черзі з installations.paid_amount), залишок, статус paid/partial/pending/overdue, днів прострочки.';

GRANT SELECT ON public.v_payment_schedule TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Хто винен: по об'єкту
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_receivables
WITH (security_invoker = true) AS
WITH sched AS (
    SELECT
        installation_custom_id,
        count(*)                                                        AS schedule_items,
        sum(amount)                                                     AS scheduled_total,
        sum(remaining) FILTER (WHERE status = 'overdue')                AS overdue_amount,
        max(days_overdue)                                               AS days_overdue,
        min(due_date) FILTER (WHERE status <> 'paid' AND due_date IS NOT NULL) AS next_due_date
    FROM public.v_payment_schedule
    GROUP BY installation_custom_id
), next_item AS (
    SELECT DISTINCT ON (installation_custom_id)
        installation_custom_id, title AS next_title, remaining AS next_amount, due_date AS next_item_due
    FROM public.v_payment_schedule
    WHERE status <> 'paid'
    ORDER BY installation_custom_id, seq, id
), pay AS (
    SELECT installation_custom_id, max(paid_at) AS last_paid_at
    FROM public.payment_history
    GROUP BY installation_custom_id
)
SELECT
    i.custom_id                         AS installation_custom_id,
    i.name,
    i.status,
    i.workflow_stage,
    i.responsible_emp_id,
    i.working_company,
    COALESCE(i.currency, 'USD')         AS currency,
    i.total_cost,
    COALESCE(i.paid_amount, 0)          AS paid_amount,
    i.total_cost - COALESCE(i.paid_amount, 0) AS debt,
    c.custom_id                         AS client_id,
    c.name                              AS client_name,
    c.company_name                      AS client_company,
    c.phone                             AS client_phone,
    COALESCE(sched.schedule_items, 0)   AS schedule_items,
    sched.scheduled_total,
    COALESCE(sched.overdue_amount, 0)   AS overdue_amount,
    sched.days_overdue,
    next_item.next_title,
    next_item.next_amount,
    next_item.next_item_due,
    pay.last_paid_at
FROM public.installations i
LEFT JOIN public.clients c   ON c.custom_id = i.client_id
LEFT JOIN sched              ON sched.installation_custom_id = i.custom_id
LEFT JOIN next_item          ON next_item.installation_custom_id = i.custom_id
LEFT JOIN pay                ON pay.installation_custom_id = i.custom_id
WHERE COALESCE(i.is_subcontract, false) = false
  AND i.status NOT IN ('lost', 'cancelled')
  AND COALESCE(i.total_cost, 0) > 0
  AND i.total_cost - COALESCE(i.paid_amount, 0) > 0.009
  AND (
        i.status = 'completed'
     OR COALESCE(i.paid_amount, 0) > 0
     OR i.workflow_stage IN ('equipment', 'complectation', 'installation', 'monitoring_setup', 'grid_connection')
     OR COALESCE(sched.overdue_amount, 0) > 0
  );

COMMENT ON VIEW public.v_receivables IS
    'Дебіторка по об''єктах: борг, прострочено за графіком, наступний платіж, останній платіж. Правила — як у src/domain/pipeline.js isReceivable.';

GRANT SELECT ON public.v_receivables TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Перевірка (виконувати вручну):
--   SELECT * FROM v_payment_schedule ORDER BY installation_custom_id, seq;
--   SELECT installation_custom_id, debt, overdue_amount, days_overdue FROM v_receivables ORDER BY days_overdue DESC NULLS LAST;
-- ---------------------------------------------------------------------
