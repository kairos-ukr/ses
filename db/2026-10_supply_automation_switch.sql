-- =====================================================================
--  K-CORE · Забезпечення: автоматика лише за ручним перемикачем
--
--  Власник вирішує сам, чи система:
--    • alerts   — сама створює нагадування забезпечення (скласти
--                 специфікацію електрозахисту, забезпечити матеріал);
--    • requests — сама ставить заявки в закупівлю на те, чого бракує за
--                 затвердженою специфікацією.
--  Обидва перемикачі за замовчуванням ВИМКНЕНІ. Перемикаються в CRM:
--  «Забезпечення» → Налаштування (і в «Доступи» → Налаштування).
--
--  Поки нагадування вимкнені, вже наявні не видаляються — їх просто
--  не видно (v_supply_alerts) і бот їх не надсилає (v_supply_alert_outbox).
--  Увімкнули — перерахунок відновить актуальні.
--
--  Заодно: дзвіночок «Вам доручено задачу» веде в «Мій день»
--  (/tasks?tab=day), бо «Задачі та етапи» тепер відкриваються на «Етапах».
--
--  Резервна копія: backup.app_settings_20261021.
--  RLS не чіпаємо.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.app_settings_20261021 AS TABLE public.app_settings;

-- ---------------------------------------------------------------------
--  Перемикачі
-- ---------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('supply_automation', '{"alerts": false, "requests": false}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.supply_auto(p_what text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
    SELECT COALESCE((SELECT (value ->> p_what)::boolean FROM app_settings WHERE key = 'supply_automation'), false)
$$;

GRANT EXECUTE ON FUNCTION public.supply_auto(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
--  Перерахунок одного об'єкта.
--  Нагадування — лише коли увімкнено alerts. Заявки — лише коли
--  увімкнено requests і виклик прийшов від зміни даних (тригер), а не
--  від перегляду сторінки. Скільки купувати: непокрита потреба мінус
--  те, що в дорозі/замовлено, мінус відкриті заявки, мінус вільне на
--  складі. Відхилену закупівельником автоматичну заявку не ставимо знову.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_object_supply(p_installation integer, p_create_requests boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_alerts      boolean := supply_auto('alerts');
    v_requests    boolean := p_create_requests AND supply_auto('requests');
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
    v_created     integer := 0;
    v_to_buy      numeric;
    v_rows        integer;
    r             record;
BEGIN
    IF NOT v_alerts AND NOT v_requests THEN
        RETURN jsonb_build_object('ok', true, 'skipped', 'automation_off');
    END IF;

    SELECT * INTO v_inst FROM installations WHERE custom_id = p_installation;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'installation_not_found');
    END IF;

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

    IF v_alerts THEN
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
    END IF;

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

            -- Замовлене без прив'язки до об'єкта в «дорозі» не видно, тому
            -- з двох оцінок беремо більшу, а не суму
            v_to_buy := r.left_qty - GREATEST(r.incoming, r.ordered) - r.requested - r.free_stock;

            IF v_requests AND v_live AND v_to_buy > 0 AND NOT r.rejected_auto THEN
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

    IF v_alerts THEN
        PERFORM supply_alert_set(
            p_installation, 'protection_supply',
            v_live AND v_spec_id IS NOT NULL AND v_missing > 0,
            COALESCE(v_inst.start_date - 7, v_spec_date + 5),
            jsonb_build_object('positions', v_positions, 'missing', v_missing,
                               'reservable', v_reservable, 'spec_id', v_spec_id),
            v_assignee
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'positions', v_positions,
        'missing', v_missing,
        'reservable', v_reservable,
        'assigned_to', v_assignee,
        'requests_created', v_created
    );
END $function$;

-- Тригери (зміна КП, етапу, специфікації, об'єкта) — можуть ставити
-- заявки, якщо це увімкнено
CREATE OR REPLACE FUNCTION public.refresh_object_supply_safe(p_installation integer)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
    IF p_installation IS NULL THEN
        RETURN;
    END IF;
    PERFORM refresh_object_supply(p_installation, true);
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'refresh_object_supply(%) failed: %', p_installation, SQLERRM;
END $function$;

-- Перерахунок усіх — при відкритті сторінок; при вимкненій автоматиці
-- одразу виходить
CREATE OR REPLACE FUNCTION public.refresh_supply_alerts(p_create_requests boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    r        record;
    v_done   integer := 0;
    v_failed integer := 0;
BEGIN
    IF NOT supply_auto('alerts') AND NOT (p_create_requests AND supply_auto('requests')) THEN
        RETURN jsonb_build_object('ok', true, 'skipped', 'automation_off');
    END IF;
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
            RAISE WARNING 'refresh_object_supply(%): %', r.custom_id, SQLERRM;
        END;
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'objects', v_done, 'failed', v_failed);
END $function$;

-- ---------------------------------------------------------------------
--  Вимкнені нагадування не видно в CRM і бот їх не надсилає
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_supply_alerts AS
 SELECT a.id,
    a.installation_custom_id,
    a.kind,
    a.status,
    a.due_date,
    a.details,
    a.snoozed_until,
    a.opened_at,
    a.last_reminder_sent_at,
    i.name AS installation_name,
    i.status AS installation_status,
    i.start_date,
    c.name AS client_name,
    c.company_name,
    a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE AS is_overdue,
    a.assigned_to,
    a.assigned_manually,
    e.name AS assignee_name,
    e.telegram_user_id IS NOT NULL AS assignee_has_telegram
   FROM supply_alerts a
     JOIN installations i ON i.custom_id = a.installation_custom_id
     LEFT JOIN clients c ON c.custom_id = i.client_id
     LEFT JOIN employees e ON e.id = a.assigned_to
  WHERE a.status = 'open'::text AND (a.snoozed_until IS NULL OR a.snoozed_until <= CURRENT_DATE)
    AND supply_auto('alerts');

CREATE OR REPLACE VIEW public.v_supply_alert_outbox AS
 SELECT a.id AS alert_id,
    a.kind,
        CASE a.kind
            WHEN 'protection_spec'::text THEN 'Скласти специфікацію електрозахисту'::text
            WHEN 'protection_supply'::text THEN 'Забезпечити електрозахист'::text
            ELSE a.kind
        END AS title,
        CASE a.kind
            WHEN 'protection_spec'::text THEN
            CASE
                WHEN COALESCE((a.details ->> 'from_offer'::text)::boolean, false) THEN 'У КП є електричний захист, а що саме купувати — ще не розписано'::text
                ELSE 'Етап «Комплектація ел. захисту» в роботі, специфікації ще немає'::text
            END
            WHEN 'protection_supply'::text THEN (((('Бракує '::text || COALESCE(a.details ->> 'missing'::text, '?'::text)) || ' з '::text) || COALESCE(a.details ->> 'positions'::text, '?'::text)) || ' позицій'::text) ||
            CASE
                WHEN COALESCE((a.details ->> 'reservable'::text)::integer, 0) > 0 THEN (', '::text || (a.details ->> 'reservable'::text)) || ' є на складі — зарезервуйте'::text
                ELSE ''::text
            END
            ELSE ''::text
        END AS summary,
    a.installation_custom_id,
    i.name AS installation_name,
    COALESCE(c.company_name, c.name) AS client_name,
    a.due_date,
    a.due_date IS NOT NULL AND a.due_date < CURRENT_DATE AS is_overdue,
    e.id AS employee_id,
    e.name AS employee_name,
    e.telegram_user_id AS telegram_chat_id,
        CASE
            WHEN a.last_reminder_sent_at IS NULL THEN 'new'::text
            WHEN a.due_date < CURRENT_DATE THEN 'overdue'::text
            ELSE 'reminder'::text
        END AS reason,
    a.last_reminder_sent_at
   FROM supply_alerts a
     JOIN installations i ON i.custom_id = a.installation_custom_id
     LEFT JOIN clients c ON c.custom_id = i.client_id
     JOIN employees e ON e.id = a.assigned_to
  WHERE a.status = 'open'::text AND (i.status = ANY (ARRAY['planning'::text, 'in_progress'::text, 'pending'::text])) AND (a.snoozed_until IS NULL OR a.snoozed_until <= CURRENT_DATE) AND e.telegram_user_id IS NOT NULL AND (a.last_reminder_sent_at IS NULL OR a.last_reminder_sent_at < (now() - '1 day'::interval))
    AND supply_auto('alerts');

-- ---------------------------------------------------------------------
--  Доручення → «Мій день»
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_emp   employees%ROWTYPE;
    v_inst  record;
    v_body  text;
BEGIN
    IF NEW.assigned_to IS NULL OR NEW.status NOT IN ('нове', 'в процесі') THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_emp FROM employees WHERE custom_id = NEW.assigned_to;
    IF v_emp.id IS NULL THEN RETURN NEW; END IF;
    IF NEW.creator_email IS NOT NULL AND lower(NEW.creator_email) = lower(COALESCE(v_emp.email, '')) THEN
        RETURN NEW;
    END IF;

    v_body := left(btrim(regexp_replace(COALESCE(NEW.task_text, ''), '<[^>]+>', '', 'g')), 400);
    IF NEW.installation_id IS NOT NULL THEN
        SELECT custom_id, name INTO v_inst FROM installations WHERE id = NEW.installation_id;
        IF v_inst.custom_id IS NOT NULL THEN
            v_body := v_body || E'\nОбʼєкт: ' || COALESCE(v_inst.name, 'без назви') || ' #' || v_inst.custom_id;
        END IF;
    END IF;
    IF NEW.due_date IS NOT NULL THEN
        v_body := v_body || E'\nДедлайн: ' || to_char(NEW.due_date, 'DD.MM.YYYY');
    END IF;

    INSERT INTO app_notifications (employee_id, kind, ref_key, title, body, link)
    VALUES (v_emp.id, 'task_assigned', btrim(NEW.custom_id::text) || ':' || NEW.assigned_to,
            'Вам доручено задачу #' || btrim(NEW.custom_id::text), v_body, '/tasks?tab=day')
    ON CONFLICT (employee_id, kind, ref_key) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $function$;
