-- =====================================================================
--  K-CORE · Дзвіночок сповіщень у програмі (етап 5, п.21)
--
--  Ті самі події, що йдуть людині в Telegram, видно й у CRM — з
--  позначкою «прочитано». Сповіщення отримують і ті, в кого Telegram
--  не підключено.
--
--  Звідки беруться:
--   • миттєво, тригерами бази: людині доручили задачу; людину
--     призначили відповідальною за етап об'єкта;
--   • від бота (tg bot/notifier.py → send_personal): дедлайни задач,
--     платежі за графіком, перевищення норми етапу, нагадування
--     забезпечення тощо — бот записує їх сюди ж.
--  Один і той самий випадок (людина + вид + ключ) записується один раз,
--  тож тригер і бот не дублюють одне одного.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.app_notifications (
    id           bigserial PRIMARY KEY,
    employee_id  integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    kind         text NOT NULL,
    ref_key      text NOT NULL,
    title        text NOT NULL,
    body         text,
    link         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    read_at      timestamptz
);

COMMENT ON TABLE public.app_notifications IS
    'Сповіщення в програмі (дзвіночок). employee_id = employees.id. link — шлях у CRM, напр. /project/1234.';

CREATE UNIQUE INDEX IF NOT EXISTS app_notifications_once
    ON public.app_notifications (employee_id, kind, ref_key);
CREATE INDEX IF NOT EXISTS app_notifications_feed
    ON public.app_notifications (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS app_notifications_unread
    ON public.app_notifications (employee_id) WHERE read_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_notifications TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.app_notifications_id_seq TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Назви підетапів для тексту сповіщення (як у src/domain/stages.js)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.stage_task_label(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_key
        WHEN 'tech_review'         THEN 'Проведення замірів'
        WHEN 'project_design'      THEN 'Розробка 3D візуалізації'
        WHEN 'project_approval'    THEN 'Вибір та затвердження варіанту'
        WHEN 'tech_project'        THEN 'Технічне креслення'
        WHEN 'commercial_proposal' THEN 'Комерційна пропозиція'
        WHEN 'equipment'           THEN 'Закупівля обладнання'
        WHEN 'complectation'       THEN 'Комплектація матеріалів'
        WHEN 'comp_protection'     THEN 'Комплектація ел. захисту'
        WHEN 'inst_structure'      THEN 'Монтаж конструкції'
        WHEN 'inst_panels'         THEN 'Встановлення панелей'
        WHEN 'inst_cabling'        THEN 'Прокладання траси DC'
        WHEN 'inst_grounding'      THEN 'Заземлення'
        WHEN 'inst_inverter'       THEN 'Підключення інвертора'
        WHEN 'monitoring_setup'    THEN 'Запуск станції'
        WHEN 'project'             THEN 'Проект'
        WHEN 'proposal'            THEN 'КП'
        WHEN 'installation'        THEN 'Монтаж'
        ELSE p_key
    END
$$;

-- ---------------------------------------------------------------------
--  Миттєві сповіщення: доручили задачу
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
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
    -- Доручив сам собі — повідомляти нема про що
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
            'Вам доручено задачу #' || btrim(NEW.custom_id::text), v_body, '/tasks')
    ON CONFLICT (employee_id, kind, ref_key) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;   -- сповіщення ніколи не заважає зберегти саму задачу
END $$;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.microtasks;
CREATE TRIGGER trg_notify_task_assigned
    AFTER INSERT OR UPDATE OF assigned_to ON public.microtasks
    FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

-- ---------------------------------------------------------------------
--  Миттєві сповіщення: призначили відповідальним за етап
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_stage_assigned()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    v_emp   employees%ROWTYPE;
    v_name  text;
BEGIN
    IF NEW.new_responsible IS NULL OR NEW.new_responsible IS NOT DISTINCT FROM NEW.old_responsible THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_emp FROM employees WHERE custom_id = NEW.new_responsible;
    IF v_emp.id IS NULL THEN RETURN NEW; END IF;
    -- Призначив сам себе
    IF btrim(COALESCE(NEW.actor, '')) = btrim(COALESCE(v_emp.name, '')) THEN
        RETURN NEW;
    END IF;
    SELECT name INTO v_name FROM installations WHERE custom_id = NEW.installation_custom_id;

    INSERT INTO app_notifications (employee_id, kind, ref_key, title, body, link)
    VALUES (v_emp.id, 'stage_assigned', NEW.id::text,
            'Вас призначено відповідальним',
            stage_task_label(NEW.stage_key) || E'\nОбʼєкт: ' || COALESCE(v_name, 'без назви') || ' #' || NEW.installation_custom_id
                || CASE WHEN NEW.actor IS NOT NULL THEN E'\nПризначив: ' || NEW.actor ELSE '' END,
            '/project/' || NEW.installation_custom_id || '?tab=workflow')
    ON CONFLICT (employee_id, kind, ref_key) DO NOTHING;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_stage_assigned ON public.workflow_events;
CREATE TRIGGER trg_notify_stage_assigned
    AFTER INSERT ON public.workflow_events
    FOR EACH ROW EXECUTE FUNCTION public.notify_stage_assigned();
