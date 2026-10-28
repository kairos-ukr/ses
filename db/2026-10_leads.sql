-- =====================================================================
--  K-CORE · Ліди — облік з першого дзвінка (етап 4, п.15)
--
--  Звернення живе тут, поки не стане об'єктом: хто, звідки дізнався,
--  що хоче, хто веде, коли наступний контакт. Статуси:
--    new → contacted (зв'язались) → measure (домовились про заміри)
--    → converted (став об'єктом) або lost (відмова з причиною).
--
--  convert_lead(lead) — одним кроком: знаходить клієнта за телефоном
--  (останні 9 цифр) або створює нового, створює об'єкт на етапі «Заміри»
--  і позначає лід як «став об'єктом».
--
--  merge_clients — доповнено: при об'єднанні дублікатів клієнтів ліди
--  переходять до клієнта, який лишається.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.leads (
    id                      bigserial PRIMARY KEY,
    contact_name            text NOT NULL,
    phone                   text,
    place                   text,
    source                  text,
    request                 text,
    capacity_kw             numeric(10,2),
    station_type            text,
    status                  text NOT NULL DEFAULT 'new'
                            CHECK (status IN ('new', 'contacted', 'measure', 'converted', 'lost')),
    first_contact_at        date NOT NULL DEFAULT current_date,
    next_action_at          date,
    responsible_emp_id      integer,
    lost_reason             text,
    lost_comment            text,
    lost_at                 timestamptz,
    notes                   text,
    client_id               integer,
    installation_custom_id  integer REFERENCES public.installations(custom_id) ON DELETE SET NULL,
    converted_at            timestamptz,
    created_by              integer,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.leads IS
    'Ліди: звернення до того, як вони стали об''єктом. source — звідки дізнались (ключі в src/domain/leads.js).';
COMMENT ON COLUMN public.leads.responsible_emp_id IS 'Хто веде (employees.custom_id).';
COMMENT ON COLUMN public.leads.client_id IS 'Клієнт (clients.custom_id), коли лід став об''єктом або його пов''язали з наявним клієнтом.';

-- Відповідальний і клієнт — лише наявні; видалили людину/клієнта — лід лишається без них
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_responsible_emp_id_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_responsible_emp_id_fkey
    FOREIGN KEY (responsible_emp_id) REFERENCES public.employees(custom_id) ON DELETE SET NULL;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_client_id_fkey;
ALTER TABLE public.leads ADD CONSTRAINT leads_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES public.clients(custom_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads (status, next_action_at);
CREATE INDEX IF NOT EXISTS leads_responsible_idx ON public.leads (responsible_emp_id);

DROP TRIGGER IF EXISTS set_updated_at_leads ON public.leads;
CREATE TRIGGER set_updated_at_leads
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.leads_id_seq TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Лід → клієнт + об'єкт
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.convert_lead(
    p_lead_id       bigint,
    p_client_id     integer DEFAULT NULL,
    p_creator_email text    DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
    l        leads%ROWTYPE;
    v_client integer := p_client_id;
    v_phone  text;
    v_inst   integer;
BEGIN
    SELECT * INTO l FROM leads WHERE id = p_lead_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Лід не знайдено — можливо, його видалили. Оновіть сторінку.' USING ERRCODE = 'P0001';
    END IF;
    IF l.installation_custom_id IS NOT NULL THEN
        RETURN l.installation_custom_id;   -- уже став об'єктом
    END IF;

    v_client := COALESCE(v_client, l.client_id);

    -- Той самий клієнт за телефоном: +380 67 123 45 67 = 0671234567
    v_phone := right(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g'), 9);
    IF v_client IS NULL AND length(v_phone) = 9 THEN
        SELECT custom_id INTO v_client
        FROM clients
        WHERE right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 9) = v_phone
        ORDER BY created_at
        LIMIT 1;
    END IF;

    IF v_client IS NULL THEN
        INSERT INTO clients (name, phone, populated_place, first_contact, notes)
        VALUES (l.contact_name, NULLIF(l.phone, ''), NULLIF(l.place, ''), l.first_contact_at, NULLIF(l.notes, ''))
        RETURNING custom_id INTO v_client;
    END IF;

    INSERT INTO installations (
        client_id, name, status, workflow_stage, capacity_kw, station_type,
        responsible_emp_id, creator_email, notes
    ) VALUES (
        v_client,
        NULLIF(concat_ws(' ', NULLIF(l.place, ''), l.contact_name), ''),
        'planning', 'tech_review', l.capacity_kw, NULLIF(l.station_type, ''),
        l.responsible_emp_id, p_creator_email, NULLIF(l.request, '')
    )
    RETURNING custom_id INTO v_inst;

    UPDATE leads SET
        status = 'converted',
        client_id = v_client,
        installation_custom_id = v_inst,
        converted_at = now(),
        lost_reason = NULL, lost_comment = NULL, lost_at = NULL
    WHERE id = p_lead_id;

    RETURN v_inst;
END $$;

COMMENT ON FUNCTION public.convert_lead(bigint, integer, text) IS
    'Лід → клієнт (знайдений за телефоном або новий) + об''єкт на етапі «Заміри». Повертає custom_id об''єкта.';

GRANT EXECUTE ON FUNCTION public.convert_lead(bigint, integer, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
--  Об'єднання дублікатів клієнтів: ліди теж переходять до того, хто лишається
-- ---------------------------------------------------------------------

DO $$
DECLARE d text;
BEGIN
    SELECT pg_get_functiondef('public.merge_clients(integer,integer,integer)'::regprocedure) INTO d;
    IF position('UPDATE leads' IN d) = 0 THEN
        d := replace(d,
            '    UPDATE stock_movements SET client_id = t.id WHERE client_id = s.id;',
            E'    UPDATE leads SET client_id = t.custom_id WHERE client_id = s.custom_id;\n    UPDATE stock_movements SET client_id = t.id WHERE client_id = s.id;');
        IF position('UPDATE leads' IN d) = 0 THEN
            RAISE EXCEPTION 'merge_clients: не знайшов місце для вставки';
        END IF;
        EXECUTE d;
    END IF;
END $$;
