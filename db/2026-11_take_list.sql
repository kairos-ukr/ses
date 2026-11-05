-- =====================================================================
--  K-CORE · «Взяти з собою»: що бригаді забрати на об'єкт
--
--  Бригади забувають щось зі специфікації — найчастіше ел. захист.
--  Тепер система нагадує сама:
--   • v_object_take_list — що за затвердженими специфікаціями
--     (обладнання з КП, комплектація матеріалів, ел. захист) ще не
--     видано на об'єкт: скільки взяти (потрібно − видано), де лежить
--     (резерв під цей об'єкт або вільний залишок, склад) і скільки
--     бракує. Лише об'єкти в роботі на етапах від «Обладнання» до
--     «Запуску»; завершені, скасовані й програні — без списку (там
--     видачу раніше часто не проводили, і список був би хибним).
--   • take_list_text(об'єкт) — той самий список текстом для сповіщень.
--   • app_settings.take_reminders — перемикачі («Доступи» → Налаштування):
--       schedule — дописувати «Взяти з собою» до особистого сповіщення
--                  «Графік на …» і рядок у гілку графіка (типово так);
--       morning  — бот о 7:00 нагадує особисто, що взяти сьогодні
--                  (типово так);
--       to       — crew (усім, хто їде) або brigadier (бригадиру; якщо
--                  бригадира немає — усім).
--   • notify_schedule_published — до сповіщення «Графік на …» додано
--     список «Взяти з собою» для об'єкта людини (решта як було).
--  Читають: «Монтаж» (картка виїзду), Календар, бот.
--
--  Таблиці не змінюються; в app_settings додається один рядок.
--  Резервна копія: backup.app_settings_20261102. Попередня версія
--  notify_schedule_published — у 2026-10_schedule_publish.sql.
--  RLS не чіпаємо.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.app_settings_20261102 AS TABLE public.app_settings;

-- ---------------------------------------------------------------------
--  Перемикачі
-- ---------------------------------------------------------------------
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('take_reminders', '{"schedule": true, "morning": true, "to": "crew"}'::jsonb, now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.take_reminders_cfg()
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
    SELECT '{"schedule": true, "morning": true, "to": "crew"}'::jsonb
        || COALESCE((SELECT value FROM app_settings WHERE key = 'take_reminders'), '{}'::jsonb)
$$;

GRANT EXECUTE ON FUNCTION public.take_reminders_cfg() TO anon, authenticated;

-- ---------------------------------------------------------------------
--  Що взяти: невидане за затвердженими специфікаціями
--  kind: protection (ел. захист) / equipment (обладнання з КП) /
--        materials (комплектація). Позиція в кількох специфікаціях —
--        один рядок; захист важливіший за обладнання, обладнання — за
--        матеріали.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_object_take_list AS
WITH objs AS (
    SELECT custom_id
      FROM installations
     WHERE COALESCE(status, '') NOT IN ('completed', 'cancelled', 'lost')
       AND workflow_stage IN ('equipment', 'complectation', 'installation', 'monitoring_setup',
                              'installation_finish', 'mon_launch_station')
), spec AS (
    SELECT s.installation_custom_id,
           si.nomenclature_id,
           SUM(si.quantity) AS required,
           CASE WHEN bool_or(s.notes = 'comp_protection') THEN 'protection'
                WHEN bool_or(s.notes = 'commercial_proposal') THEN 'equipment'
                ELSE 'materials' END AS kind,
           MIN(COALESCE(NULLIF(btrim(si.original_name), ''), n.name)::text) AS name
      FROM specifications s
      JOIN specification_items si ON si.specification_id = s.id
      JOIN nomenclature n ON n.id = si.nomenclature_id
     WHERE s.status = 'confirmed'
       AND s.installation_custom_id IN (SELECT custom_id FROM objs)
     GROUP BY s.installation_custom_id, si.nomenclature_id
), issued AS (
    SELECT m.installation_custom_id,
           m.nomenclature_id,
           SUM(CASE WHEN m.operation_type IN ('issue', 'sale', 'partner_transfer') THEN m.quantity
                    WHEN m.operation_type = 'return' THEN -m.quantity
                    ELSE 0 END) AS qty
      FROM stock_movements m
     WHERE m.installation_custom_id IN (SELECT custom_id FROM objs)
       AND m.operation_type IN ('issue', 'sale', 'partner_transfer', 'return')
     GROUP BY m.installation_custom_id, m.nomenclature_id
), res AS (
    SELECT r.installation_custom_id,
           r.nomenclature_id,
           SUM(r.reserved_quantity - r.released_quantity) AS qty,
           string_agg(DISTINCT w.name, ', ') AS at
      FROM reservations r
      JOIN warehouses w ON w.id = r.warehouse_id
     WHERE r.status = 'active'
       AND r.reserved_quantity > r.released_quantity
       AND r.installation_custom_id IN (SELECT custom_id FROM objs)
     GROUP BY r.installation_custom_id, r.nomenclature_id
), free AS (
    SELECT a.nomenclature_id,
           SUM(a.quantity_available) AS qty,
           string_agg(w.name, ', ' ORDER BY a.quantity_available DESC) AS at
      FROM v_warehouse_stock_available a
      JOIN warehouses w ON w.id = a.warehouse_id AND w.is_active
     WHERE a.quantity_available > 0
       AND a.nomenclature_id IN (SELECT nomenclature_id FROM spec)
     GROUP BY a.nomenclature_id
)
SELECT sp.installation_custom_id,
       sp.nomenclature_id,
       sp.kind,
       sp.name,
       lower(COALESCE(u.code, u.name, ''))::text AS unit,
       sp.required,
       GREATEST(COALESCE(i.qty, 0), 0) AS issued,
       sp.required - GREATEST(COALESCE(i.qty, 0), 0) AS to_take,
       COALESCE(r.qty, 0) AS reserved,
       r.at AS reserved_at,
       COALESCE(f.qty, 0) AS free,
       f.at AS free_at,
       GREATEST(sp.required - GREATEST(COALESCE(i.qty, 0), 0) - COALESCE(r.qty, 0) - COALESCE(f.qty, 0), 0) AS missing
  FROM spec sp
  LEFT JOIN issued i ON i.installation_custom_id = sp.installation_custom_id AND i.nomenclature_id = sp.nomenclature_id
  LEFT JOIN res r ON r.installation_custom_id = sp.installation_custom_id AND r.nomenclature_id = sp.nomenclature_id
  LEFT JOIN free f ON f.nomenclature_id = sp.nomenclature_id
  LEFT JOIN nomenclature n ON n.id = sp.nomenclature_id
  LEFT JOIN units u ON u.id = n.unit_id
 WHERE sp.required - GREATEST(COALESCE(i.qty, 0), 0) > 0;

GRANT SELECT ON public.v_object_take_list TO anon, authenticated;

-- ---------------------------------------------------------------------
--  Той самий список текстом (сповіщення, бот). NULL — брати нічого.
--  Дві частини: що є на складі («Взяти з собою», і з якого складу) та
--  чого на складі немає («уточніть в офісі»). Усередині — ел. захист,
--  обладнання, матеріали. p_limit — скільки позицій показати в групі,
--  решта «у Монтажі».
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
    RETURN NULLIF(v_out, '');
END $$;

GRANT EXECUTE ON FUNCTION public.take_list_text(integer, integer) TO anon, authenticated;

-- ---------------------------------------------------------------------
--  Сповіщення «Графік на …» + «Взяти з собою»
--  Як і раніше: де, з ким, на чому. Нове — список того, що ще не видано
--  на об'єкт (за перемикачем). Помилка в списку не зриває сповіщення.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_schedule_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
    v_days  text[] := array['неділю','понеділок','вівторок','середу','четвер','пʼятницю','суботу'];
    v_title text;
    v_cid   integer;
    v_emp   employees%rowtype;
    v_inst  integer;
    v_notes text;
    v_name  text;
    v_place text;
    v_body  text;
    v_team  text;
    v_trip  record;
    v_cfg   jsonb := take_reminders_cfg();
    v_take  text;
    v_brig  boolean;
begin
    if NEW.published_at is null then return NEW; end if;
    if TG_OP = 'UPDATE' and OLD.published_at is not distinct from NEW.published_at then return NEW; end if;

    v_title := case when NEW.publish_count > 1 then 'Графік змінено: ' else 'Графік на ' end
               || v_days[extract(dow from NEW.work_date)::int + 1] || ', ' || to_char(NEW.work_date, 'DD.MM');

    for v_cid in
        select distinct p.cid from (
            select employee_custom_id as cid from installation_workers
             where work_date = NEW.work_date and employee_custom_id is not null
            union
            select driver_custom_id from trips
             where trip_date = NEW.work_date and status <> 'cancelled' and driver_custom_id is not null
            union
            select unnest(crew) from trips
             where trip_date = NEW.work_date and status <> 'cancelled'
        ) p where p.cid is not null
    loop
        select * into v_emp from employees where custom_id = v_cid;
        continue when v_emp.id is null or v_emp.access_blocked_at is not null;

        v_inst := null; v_notes := null; v_name := null; v_place := null; v_team := null;
        select iw.installation_custom_id, nullif(btrim(iw.notes), ''), i.name, c.populated_place
          into v_inst, v_notes, v_name, v_place
          from installation_workers iw
          left join installations i on i.custom_id = iw.installation_custom_id
          left join clients c on c.custom_id = i.client_id
         where iw.work_date = NEW.work_date and iw.employee_custom_id = v_cid
         limit 1;

        v_body := case
            when v_inst is not null then '📍 ' || coalesce(v_place || ', ', '') || coalesce(v_name, 'обʼєкт #' || v_inst)
            when v_notes is not null then '📝 ' || v_notes
            else '🚐 Поїздка' end;
        if v_inst is not null and v_notes is not null then
            v_body := v_body || E'\n' || v_notes;
        end if;

        select string_agg(e2.name, ', ' order by e2.name) into v_team
          from installation_workers iw2
          join employees e2 on e2.custom_id = iw2.employee_custom_id
         where iw2.work_date = NEW.work_date and iw2.employee_custom_id <> v_cid
           and ((v_inst is not null and iw2.installation_custom_id = v_inst)
             or (v_inst is null and v_notes is not null and iw2.installation_custom_id is null and btrim(iw2.notes) = v_notes));
        if v_team is not null then
            v_body := v_body || E'\nЗ вами: ' || v_team;
        end if;

        select t.driver_custom_id, v.name as vname, v.plate, o.name as owner_name, d.name as driver_name
          into v_trip
          from trips t
          left join vehicles v on v.id = t.vehicle_id
          left join employees o on o.custom_id = t.own_car_custom_id
          left join employees d on d.custom_id = t.driver_custom_id
         where t.trip_date = NEW.work_date and t.status <> 'cancelled'
           and (t.driver_custom_id = v_cid or v_cid = any(t.crew))
         order by (t.driver_custom_id = v_cid) desc nulls last, t.id
         limit 1;
        if found then
            v_body := v_body || E'\n🚐 '
                || coalesce(v_trip.vname || coalesce(' ' || v_trip.plate, ''), 'власне авто: ' || v_trip.owner_name, 'транспорт')
                || case when v_trip.driver_custom_id = v_cid then ' · ви за кермом'
                        when v_trip.driver_name is not null then ' · водій ' || v_trip.driver_name
                        else '' end;
        end if;

        -- Що взяти з собою: усім, хто їде, або лише бригадиру (якщо він є)
        if v_inst is not null and coalesce((v_cfg ->> 'schedule')::boolean, true) then
            v_take := null;
            begin
                v_brig := false;
                if v_cfg ->> 'to' = 'brigadier' and coalesce(v_emp.tier, 0) <> 1 then
                    select exists (
                        select 1 from installation_workers iw3
                          join employees e3 on e3.custom_id = iw3.employee_custom_id
                         where iw3.work_date = NEW.work_date and iw3.installation_custom_id = v_inst
                           and e3.tier = 1 and e3.access_blocked_at is null)
                      into v_brig;
                end if;
                if not v_brig then
                    v_take := take_list_text(v_inst, 8);
                end if;
            exception when others then
                v_take := null;
            end;
            if v_take is not null then
                v_body := v_body || E'\n\n' || v_take;
            end if;
        end if;

        insert into app_notifications (employee_id, kind, ref_key, title, body, link)
        values (v_emp.id, 'schedule', NEW.work_date::text || ':' || NEW.publish_count, v_title, v_body,
                case when v_emp.role = 'installer' then '/m/schedule'
                     else '/employees?tab=planning&d=' || NEW.work_date::text end)
        on conflict (employee_id, kind, ref_key) do nothing;
    end loop;
    return NEW;
exception when others then
    return NEW;
end $function$;
