-- =====================================================================
--  K-CORE · Журнал змін (етап 5, п.22)
--
--  Хто, коли і що змінив. Пише сама база (тригери), тож у журнал
--  потрапляє все — з CRM, з бота, з будь-якої сторінки.
--  Записуються лише важливі поля (список — у кожному тригері):
--    об'єкти: назва, статус, етап, відповідальний, вартість і валюта,
--             потужність, тип станції, дати, причина втрати, клієнт;
--    платежі й графік платежів; клієнти; ліди;
--    працівники: роль, рівень, блокування, ставка, прив'язка акаунта;
--    ціни продажу й закупівлі; норми етапів; курс долара.
--  Технічні зміни (позначки бота, «оновлено о…», «оплачено», яке
--  рахує база) у журнал не йдуть.
--
--  Хто змінив: працівник за акаунтом входу; зміни з бота — «Бот»;
--  ручні зміни в базі — без автора.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.change_log (
    id                      bigserial PRIMARY KEY,
    table_name              text NOT NULL,
    record_key              text,
    installation_custom_id  integer,
    action                  text NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
    changes                 jsonb NOT NULL,
    actor_user              uuid,
    actor_name              text,
    created_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.change_log IS
    'Журнал змін важливих полів: changes = { поле: [було, стало] }. Пишуть тригери log_changes().';

CREATE INDEX IF NOT EXISTS change_log_object_idx ON public.change_log (installation_custom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS change_log_time_idx   ON public.change_log (created_at DESC);
CREATE INDEX IF NOT EXISTS change_log_record_idx ON public.change_log (table_name, record_key);

GRANT SELECT ON public.change_log TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Один тригер на всі таблиці: які поля стежити — в аргументах
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_changes()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    o       jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
    n       jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
    rec     jsonb;
    ch      jsonb := '{}'::jsonb;
    c       text;
    v_uid   uuid;
    v_name  text;
    v_role  text;
    v_inst  integer;
BEGIN
    FOREACH c IN ARRAY TG_ARGV LOOP
        IF TG_OP = 'UPDATE' THEN
            IF (o -> c) IS DISTINCT FROM (n -> c) THEN
                ch := ch || jsonb_build_object(c, jsonb_build_array(o -> c, n -> c));
            END IF;
        ELSIF TG_OP = 'INSERT' THEN
            IF n ? c AND (n -> c) <> 'null'::jsonb THEN
                ch := ch || jsonb_build_object(c, jsonb_build_array(NULL, n -> c));
            END IF;
        ELSE
            IF o ? c AND (o -> c) <> 'null'::jsonb THEN
                ch := ch || jsonb_build_object(c, jsonb_build_array(o -> c, NULL));
            END IF;
        END IF;
    END LOOP;
    IF ch = '{}'::jsonb THEN
        RETURN NULL;
    END IF;

    rec := COALESCE(n, o);
    v_inst := CASE
        WHEN TG_TABLE_NAME = 'installations' THEN NULLIF(rec ->> 'custom_id', '')::integer
        ELSE NULLIF(rec ->> 'installation_custom_id', '')::integer
    END;

    -- Хто: акаунт входу → працівник; ключ сервісу — бот
    BEGIN
        v_uid := auth.uid();
        v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
    EXCEPTION WHEN OTHERS THEN
        v_uid := NULL; v_role := '';
    END;
    IF v_uid IS NOT NULL THEN
        SELECT name INTO v_name FROM employees WHERE user_id = v_uid LIMIT 1;
    ELSIF v_role = 'service_role' THEN
        v_name := 'Бот';
    END IF;

    INSERT INTO change_log (table_name, record_key, installation_custom_id, action, changes, actor_user, actor_name)
    VALUES (
        TG_TABLE_NAME,
        COALESCE(rec ->> 'custom_id', rec ->> 'stage_key', rec ->> 'key', rec ->> 'id'),
        v_inst, lower(TG_OP), ch, v_uid, v_name
    );
    RETURN NULL;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;   -- журнал ніколи не заважає зберегти саму зміну
END $$;

-- Об'єкти
DROP TRIGGER IF EXISTS trg_log_installations ON public.installations;
CREATE TRIGGER trg_log_installations
    AFTER INSERT OR UPDATE OR DELETE ON public.installations
    FOR EACH ROW EXECUTE FUNCTION public.log_changes(
        'name', 'status', 'workflow_stage', 'responsible_emp_id', 'total_cost', 'currency',
        'capacity_kw', 'station_type', 'start_date', 'end_date', 'lost_reason', 'client_id', 'working_company');

-- Платежі й графік платежів
DROP TRIGGER IF EXISTS trg_log_payment_history ON public.payment_history;
CREATE TRIGGER trg_log_payment_history
    AFTER INSERT OR UPDATE OR DELETE ON public.payment_history
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('amount', 'currency', 'exchange_rate', 'paid_at', 'payment_method');

DROP TRIGGER IF EXISTS trg_log_payment_schedule ON public.payment_schedule;
CREATE TRIGGER trg_log_payment_schedule
    AFTER INSERT OR UPDATE OR DELETE ON public.payment_schedule
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('title', 'amount', 'due_date');

-- Клієнти й ліди
DROP TRIGGER IF EXISTS trg_log_clients ON public.clients;
CREATE TRIGGER trg_log_clients
    AFTER UPDATE OR DELETE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('name', 'company_name', 'phone', 'populated_place', 'oblast');

DROP TRIGGER IF EXISTS trg_log_leads ON public.leads;
CREATE TRIGGER trg_log_leads
    AFTER UPDATE OR DELETE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('status', 'responsible_emp_id', 'lost_reason', 'installation_custom_id');

-- Працівники: доступ і гроші
DROP TRIGGER IF EXISTS trg_log_employees ON public.employees;
CREATE TRIGGER trg_log_employees
    AFTER UPDATE OR DELETE ON public.employees
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('role', 'tier', 'access_blocked_at', 'day_rate', 'user_id', 'hidden_from_list');

-- Ціни
DROP TRIGGER IF EXISTS trg_log_nomenclature_prices ON public.nomenclature;
CREATE TRIGGER trg_log_nomenclature_prices
    AFTER UPDATE OF sale_price, sale_currency, cost_price, cost_currency ON public.nomenclature
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('sale_price', 'sale_currency', 'cost_price', 'cost_currency');

-- Налаштування
DROP TRIGGER IF EXISTS trg_log_stage_norms ON public.stage_norms;
CREATE TRIGGER trg_log_stage_norms
    AFTER INSERT OR UPDATE ON public.stage_norms
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('days');

DROP TRIGGER IF EXISTS trg_log_app_settings ON public.app_settings;
CREATE TRIGGER trg_log_app_settings
    AFTER INSERT OR UPDATE ON public.app_settings
    FOR EACH ROW EXECUTE FUNCTION public.log_changes('value');
