-- =====================================================================
--  K-CORE · Об'єднання дублікатів клієнтів
--
--  НАВІЩО: той самий клієнт буває записаний двічі (на 15.10.2026 —
--  8 груп з однаковим телефоном). Його об'єкти розходяться по двох
--  картках, а в Telegram з'являються дві теми.
--
--  merge_clients(джерело, ціль, хто) переносить на клієнта, який
--  лишається (ціль), усе, що висить на джерелі:
--    • об'єкти (installations)
--    • складські рухи й документи видачі (stock_movements, issue_orders)
--    • Telegram-тему (client_threads) — якщо в цілі своєї теми ще немає;
--      якщо є, лишається тема цілі, а тема джерела просто перестає
--      оновлюватись (у групі вона залишиться як архів)
--  Порожні поля цілі заповнюються з джерела; інший телефон та інше
--  написання імені дописуються в примітки, щоб нічого не загубилось.
--  Після цього джерело видаляється, а його повна копія лягає в
--  client_merges — з неї можна відновити дані вручну.
--
--  Кого з ким об'єднувати, вирішує людина у вікні «Дублікати»
--  на сторінці «Клієнти». Автоматично нічого не зливається.
--
--  Застосовувати в Supabase → SQL Editor.
-- =====================================================================

CREATE TABLE IF NOT EXISTS client_merges (
    id               bigserial PRIMARY KEY,
    source_custom_id integer NOT NULL,
    target_custom_id integer NOT NULL,
    source_snapshot  jsonb   NOT NULL,      -- повний запис джерела до видалення
    moved            jsonb,                 -- що саме перенесено
    merged_by        integer REFERENCES employees(id) ON DELETE SET NULL,
    merged_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE client_merges IS 'Журнал об''єднань клієнтів: копія видаленого дубліката і що з нього перенесено';


CREATE OR REPLACE FUNCTION merge_clients(p_source integer, p_target integer, p_emp integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    s clients%ROWTYPE;
    t clients%ROWTYPE;
    n_inst    integer := 0;
    n_moves   integer := 0;
    n_orders  integer := 0;
    n_threads integer := 0;
    v_threads jsonb;
    v_thread_kept boolean;
    v_extra   text[] := '{}';
    v_notes   text;
    norm_s    text;
    norm_t    text;
BEGIN
    IF p_source = p_target THEN
        RAISE EXCEPTION 'Не можна об''єднати клієнта сам із собою' USING ERRCODE = 'P0001';
    END IF;

    -- Блокуємо обидва записи в сталому порядку, щоб два одночасні злиття не зачепились
    PERFORM 1 FROM clients WHERE custom_id IN (p_source, p_target) ORDER BY id FOR UPDATE;
    SELECT * INTO s FROM clients WHERE custom_id = p_source;
    SELECT * INTO t FROM clients WHERE custom_id = p_target;
    IF s.id IS NULL OR t.id IS NULL THEN
        RAISE EXCEPTION 'Клієнта не знайдено — можливо, його вже об''єднали. Оновіть сторінку.' USING ERRCODE = 'P0001';
    END IF;

    -- 1. Об'єкти й склад
    UPDATE installations   SET client_id = t.custom_id WHERE client_id = s.custom_id;
    GET DIAGNOSTICS n_inst = ROW_COUNT;
    UPDATE stock_movements SET client_id = t.id WHERE client_id = s.id;
    GET DIAGNOSTICS n_moves = ROW_COUNT;
    UPDATE issue_orders    SET client_id = t.id WHERE client_id = s.id;
    GET DIAGNOSTICS n_orders = ROW_COUNT;

    -- 2. Telegram-тема: у клієнта лишається одна
    SELECT jsonb_agg(to_jsonb(ct)) INTO v_threads FROM client_threads ct WHERE ct.client_id = s.id;
    v_thread_kept := EXISTS (SELECT 1 FROM client_threads WHERE client_id = t.id);
    IF v_thread_kept THEN
        DELETE FROM client_threads WHERE client_id = s.id;
    ELSE
        UPDATE client_threads SET client_id = t.id WHERE client_id = s.id;
        GET DIAGNOSTICS n_threads = ROW_COUNT;
    END IF;

    -- 3. Що відрізняється — у примітки, щоб не загубити
    IF COALESCE(s.phone, '') <> ''
       AND right(regexp_replace(s.phone, '\D', '', 'g'), 9) IS DISTINCT FROM right(regexp_replace(COALESCE(t.phone, ''), '\D', '', 'g'), 9)
       AND COALESCE(t.phone, '') <> '' THEN
        v_extra := v_extra || ('Інший телефон: ' || s.phone);
    END IF;
    norm_s := lower(regexp_replace(btrim(COALESCE(s.name, '')), '\s+', ' ', 'g'));
    norm_t := lower(regexp_replace(btrim(COALESCE(t.name, '')), '\s+', ' ', 'g'));
    IF norm_s <> '' AND norm_s <> norm_t THEN
        v_extra := v_extra || ('Також записаний як: ' || s.name);
    END IF;
    IF COALESCE(s.company_name, '') <> '' AND COALESCE(t.company_name, '') <> ''
       AND lower(btrim(s.company_name)) <> lower(btrim(t.company_name)) THEN
        v_extra := v_extra || ('Також компанія: ' || s.company_name);
    END IF;

    v_notes := NULLIF(concat_ws(E'\n',
        NULLIF(btrim(COALESCE(t.notes, '')), ''),
        CASE WHEN btrim(COALESCE(s.notes, '')) <> ''
              AND position(btrim(s.notes) IN COALESCE(t.notes, '')) = 0
             THEN btrim(s.notes) END,
        NULLIF(array_to_string(v_extra, E'\n'), '')
    ), '');

    -- 4. Порожні поля цілі — з джерела
    UPDATE clients SET
        phone              = COALESCE(NULLIF(t.phone, ''), s.phone),
        company_name       = COALESCE(NULLIF(t.company_name, ''), s.company_name),
        oblast             = COALESCE(NULLIF(t.oblast, ''), s.oblast),
        populated_place    = COALESCE(NULLIF(t.populated_place, ''), s.populated_place),
        object_type        = COALESCE(NULLIF(t.object_type, ''), s.object_type),
        contractor_company = COALESCE(NULLIF(t.contractor_company, ''), s.contractor_company),
        working_company    = COALESCE(NULLIF(t.working_company, ''), s.working_company),
        is_subcontract     = COALESCE(t.is_subcontract, s.is_subcontract),
        first_contact      = LEAST(t.first_contact, s.first_contact),
        notes              = v_notes,
        thread             = COALESCE(t.thread, false) OR n_threads > 0,
        telegram_synced    = false,          -- бот оновить закріплене повідомлення теми
        updated_at         = now()
    WHERE id = t.id;

    -- 5. Журнал і видалення дубліката
    INSERT INTO client_merges (source_custom_id, target_custom_id, source_snapshot, moved, merged_by)
    VALUES (s.custom_id, t.custom_id, to_jsonb(s),
            jsonb_build_object(
                'installations', n_inst,
                'stock_movements', n_moves,
                'issue_orders', n_orders,
                'telegram_threads_moved', n_threads,
                'telegram_threads_left', CASE WHEN v_thread_kept THEN v_threads END
            ),
            p_emp);

    DELETE FROM clients WHERE id = s.id;

    RETURN jsonb_build_object('installations', n_inst, 'stock_movements', n_moves, 'issue_orders', n_orders);
END $$;


-- ---------------------------------------------------------------------
--  ПЕРЕВІРКА
-- ---------------------------------------------------------------------

-- Групи з однаковим телефоном (останні 9 цифр)
SELECT right(regexp_replace(phone, '\D', '', 'g'), 9) AS phone_key,
       count(*) AS clients,
       string_agg(custom_id::text, ', ') AS ids
FROM clients
WHERE length(regexp_replace(COALESCE(phone, ''), '\D', '', 'g')) >= 9
GROUP BY 1 HAVING count(*) > 1
ORDER BY 2 DESC;
