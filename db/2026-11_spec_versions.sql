-- =====================================================================
--  K-CORE · Версії специфікацій: що робити зі старим
--
--  Комплектацію зробили на дахове кріплення, а виявилось — наземна
--  конструкція: створюють нову версію специфікації, стара йде в архів.
--  Потреба об'єкта (забезпечення, «Взяти з собою», видача) і так уже
--  рахується за чинною версією. Нове тут — те, що лишилось від старої:
--   • v_object_spec_leftovers — позиції, яких у новій версії менше або
--     немає зовсім, а на об'єкт їх уже видали чи зарезервували:
--       to_return  — видано більше, ніж тепер потрібно: повернути на склад;
--       to_release — резерв більший за потребу: зняти резерв.
--     Рахується лише за останньою зміною версії кожного виду
--     специфікації, а не за всією історією видачі.
--     in_work — об'єкт у роботі (етапи «Обладнання» — «Запуск»): тоді
--     це бачить і бригада в «Взяти з собою».
--   • spec_leftover_kept — рішення «лишити на об'єкті» (пішло в роботу,
--     лишили запасом): ця кількість більше не просить повернення.
--   • take_list_text — до «Взяти з собою» додано «Повернути на склад».
--
--  Нова таблиця — без RLS, як і решта. Інші таблиці не змінюються.
-- =====================================================================

-- ---------------------------------------------------------------------
--  «Лишити на об'єкті»
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spec_leftover_kept (
    id                     bigserial PRIMARY KEY,
    installation_custom_id integer   NOT NULL,
    nomenclature_id        bigint    NOT NULL,
    quantity               numeric   NOT NULL CHECK (quantity > 0),
    note                   text,
    created_by             integer,
    created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS spec_leftover_kept_obj_idx
    ON public.spec_leftover_kept (installation_custom_id, nomenclature_id);

GRANT SELECT, INSERT, DELETE ON public.spec_leftover_kept TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.spec_leftover_kept_id_seq TO authenticated;

-- ---------------------------------------------------------------------
--  Зайве після зміни версії
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_object_spec_leftovers AS
WITH cur AS (
    SELECT s.id, s.installation_custom_id, s.notes AS kind, s.version
      FROM specifications s
     WHERE s.status = 'confirmed'
       AND s.notes IN ('complectation', 'comp_protection', 'commercial_proposal')
), pairs AS (
    SELECT c.installation_custom_id, c.kind, c.id AS cur_id,
           (SELECT p.id FROM specifications p
             WHERE p.installation_custom_id = c.installation_custom_id
               AND p.notes = c.kind AND p.status = 'archived' AND p.version < c.version
             ORDER BY p.version DESC LIMIT 1) AS prev_id
      FROM cur c
), changed AS (
    SELECT pr.installation_custom_id,
           si.nomenclature_id,
           COALESCE(SUM(si.quantity) FILTER (WHERE si.specification_id = pr.prev_id), 0) AS old_q,
           COALESCE(SUM(si.quantity) FILTER (WHERE si.specification_id = pr.cur_id), 0) AS new_q,
           MIN(NULLIF(btrim(si.original_name), '')) FILTER (WHERE si.specification_id = pr.prev_id) AS old_name,
           MAX(pr.cur_id) AS cur_spec_id,
           MAX(pr.prev_id) AS prev_spec_id
      FROM pairs pr
      JOIN specification_items si ON si.specification_id IN (pr.prev_id, pr.cur_id)
     WHERE pr.prev_id IS NOT NULL AND si.nomenclature_id IS NOT NULL
     GROUP BY pr.installation_custom_id, si.nomenclature_id
    HAVING COALESCE(SUM(si.quantity) FILTER (WHERE si.specification_id = pr.prev_id), 0)
         > COALESCE(SUM(si.quantity) FILTER (WHERE si.specification_id = pr.cur_id), 0)
), req AS (
    SELECT s.installation_custom_id, si.nomenclature_id, SUM(si.quantity) AS q
      FROM specifications s
      JOIN specification_items si ON si.specification_id = s.id
     WHERE s.status = 'confirmed'
       AND s.installation_custom_id IN (SELECT installation_custom_id FROM changed)
     GROUP BY s.installation_custom_id, si.nomenclature_id
), iss AS (
    SELECT m.installation_custom_id, m.nomenclature_id,
           SUM(CASE WHEN m.operation_type IN ('issue', 'sale', 'partner_transfer') THEN m.quantity
                    WHEN m.operation_type = 'return' THEN -m.quantity
                    ELSE 0 END) AS q
      FROM stock_movements m
     WHERE m.installation_custom_id IN (SELECT installation_custom_id FROM changed)
       AND m.operation_type IN ('issue', 'sale', 'partner_transfer', 'return')
     GROUP BY m.installation_custom_id, m.nomenclature_id
), res AS (
    SELECT r.installation_custom_id, r.nomenclature_id,
           SUM(r.reserved_quantity - r.released_quantity) AS q,
           string_agg(DISTINCT w.name, ', ') AS at
      FROM reservations r
      JOIN warehouses w ON w.id = r.warehouse_id
     WHERE r.status = 'active'
       AND r.reserved_quantity > r.released_quantity
       AND r.installation_custom_id IN (SELECT installation_custom_id FROM changed)
     GROUP BY r.installation_custom_id, r.nomenclature_id
), kept AS (
    SELECT installation_custom_id, nomenclature_id, SUM(quantity) AS q
      FROM spec_leftover_kept
     GROUP BY installation_custom_id, nomenclature_id
), calc AS (
    SELECT c.installation_custom_id, c.nomenclature_id, c.old_q, c.new_q, c.old_name,
           c.cur_spec_id, c.prev_spec_id,
           COALESCE(req.q, 0)               AS required,
           GREATEST(COALESCE(iss.q, 0), 0)  AS issued,
           COALESCE(res.q, 0)               AS reserved,
           res.at                           AS reserved_at,
           COALESCE(kept.q, 0)              AS kept
      FROM changed c
      LEFT JOIN req  ON req.installation_custom_id  = c.installation_custom_id AND req.nomenclature_id  = c.nomenclature_id
      LEFT JOIN iss  ON iss.installation_custom_id  = c.installation_custom_id AND iss.nomenclature_id  = c.nomenclature_id
      LEFT JOIN res  ON res.installation_custom_id  = c.installation_custom_id AND res.nomenclature_id  = c.nomenclature_id
      LEFT JOIN kept ON kept.installation_custom_id = c.installation_custom_id AND kept.nomenclature_id = c.nomenclature_id
)
SELECT calc.installation_custom_id,
       calc.nomenclature_id,
       COALESCE(calc.old_name, n.name)::text                                       AS name,
       lower(COALESCE(u.code, u.name, ''))::text                                   AS unit,
       calc.old_q,
       calc.new_q,
       calc.required,
       calc.issued,
       calc.reserved,
       calc.reserved_at,
       calc.kept,
       GREATEST(calc.issued - calc.required - calc.kept, 0)                        AS to_return,
       GREATEST(calc.reserved - GREATEST(calc.required - calc.issued, 0), 0)       AS to_release,
       calc.cur_spec_id,
       calc.prev_spec_id,
       (COALESCE(i.status, '') NOT IN ('completed', 'cancelled', 'lost')
         AND i.workflow_stage IN ('equipment', 'complectation', 'installation', 'monitoring_setup',
                                  'installation_finish', 'mon_launch_station'))    AS in_work
  FROM calc
  JOIN installations i ON i.custom_id = calc.installation_custom_id
  LEFT JOIN nomenclature n ON n.id = calc.nomenclature_id
  LEFT JOIN units u ON u.id = n.unit_id
 WHERE calc.issued - calc.required - calc.kept > 0
    OR calc.reserved - GREATEST(calc.required - calc.issued, 0) > 0;

GRANT SELECT ON public.v_object_spec_leftovers TO anon, authenticated;

-- ---------------------------------------------------------------------
--  «Взяти з собою» текстом + «Повернути на склад»
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.take_list_text(p_installation integer, p_limit integer DEFAULT 12)
RETURNS text
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $$
DECLARE
    v_out   text := '';
    v_where text;
    v_shown integer;
    v_back  integer;
    s       record;
    g       record;
    r       record;
BEGIN
    FOR s IN
        SELECT (reserved + free > 0) AS avail, count(*) AS n
          FROM v_object_take_list
         WHERE installation_custom_id = p_installation
         GROUP BY 1
         ORDER BY 1 DESC
    LOOP
        v_out := v_out || CASE WHEN v_out = '' THEN '' ELSE E'\n' END
              || CASE WHEN s.avail THEN '🧰 Взяти з собою — ' ELSE '⚠️ Немає на складі, уточніть в офісі — ' END
              || s.n || ' поз.:';
        FOR g IN
            SELECT kind, count(*) AS n
              FROM v_object_take_list
             WHERE installation_custom_id = p_installation AND (reserved + free > 0) = s.avail
             GROUP BY kind
             ORDER BY CASE kind WHEN 'protection' THEN 1 WHEN 'equipment' THEN 2 ELSE 3 END
        LOOP
            v_out := v_out || E'\n' || CASE g.kind WHEN 'protection' THEN '🛡 Ел. захист'
                                                   WHEN 'equipment' THEN '⚡ Обладнання'
                                                   ELSE '📦 Матеріали' END || ':';
            v_shown := 0;
            FOR r IN
                SELECT name, unit, to_take, missing, reserved + free AS have
                  FROM v_object_take_list
                 WHERE installation_custom_id = p_installation AND kind = g.kind
                   AND (reserved + free > 0) = s.avail
                 ORDER BY name
            LOOP
                EXIT WHEN v_shown >= p_limit;
                v_out := v_out || E'\n• ' || r.name || ' — ' || replace(trim_scale(r.to_take)::text, '.', ',')
                      || CASE WHEN r.unit <> '' THEN ' ' || r.unit ELSE '' END
                      || CASE WHEN r.have > 0 AND r.missing > 0
                              THEN ' (на складі лише ' || replace(trim_scale(r.have)::text, '.', ',') || ')'
                              ELSE '' END;
                v_shown := v_shown + 1;
            END LOOP;
            IF g.n > v_shown THEN
                v_out := v_out || E'\n…і ще ' || (g.n - v_shown) || ' — у «Монтажі»';
            END IF;
        END LOOP;

        -- Звідки брати: склад резерву, інакше склад, де вільного найбільше
        IF s.avail THEN
            SELECT string_agg(DISTINCT x.w, ', ') INTO v_where
              FROM (SELECT btrim(unnest(string_to_array(COALESCE(reserved_at, split_part(free_at, ',', 1)), ','))) AS w
                      FROM v_object_take_list
                     WHERE installation_custom_id = p_installation AND reserved + free > 0) x
             WHERE x.w <> '';
            IF v_where IS NOT NULL THEN
                v_out := v_out || E'\nСклад: ' || v_where;
            END IF;
        END IF;
    END LOOP;

    -- Після зміни специфікації: що вже на об'єкті, але більше не потрібне
    SELECT count(*) INTO v_back
      FROM v_object_spec_leftovers
     WHERE installation_custom_id = p_installation AND in_work AND to_return > 0;
    IF v_back > 0 THEN
        v_out := v_out || CASE WHEN v_out = '' THEN '' ELSE E'\n' END
              || '↩️ Повернути на склад (за новою специфікацією не потрібні) — ' || v_back || ' поз.:';
        v_shown := 0;
        FOR r IN
            SELECT name, unit, to_return
              FROM v_object_spec_leftovers
             WHERE installation_custom_id = p_installation AND in_work AND to_return > 0
             ORDER BY name
        LOOP
            EXIT WHEN v_shown >= p_limit;
            v_out := v_out || E'\n• ' || r.name || ' — ' || replace(trim_scale(r.to_return)::text, '.', ',')
                  || CASE WHEN r.unit <> '' THEN ' ' || r.unit ELSE '' END;
            v_shown := v_shown + 1;
        END LOOP;
        IF v_back > v_shown THEN
            v_out := v_out || E'\n…і ще ' || (v_back - v_shown) || ' — у «Монтажі»';
        END IF;
    END IF;
    RETURN NULLIF(v_out, '');
END $$;

GRANT EXECUTE ON FUNCTION public.take_list_text(integer, integer) TO anon, authenticated;
