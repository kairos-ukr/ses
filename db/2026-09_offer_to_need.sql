-- =====================================================================
--  K-CORE · Потреба об'єкта з комерційної пропозиції
--
--  НАВІЩО: сьогодні потреба в матеріалах з'являється лише тоді, коли
--  затверджена комплектація — а це етап «complectation», майже в кінці
--  робочого процесу. КП же існує на етапі «proposal», за кілька стадій
--  до того. Виходить, закупівля дізнається, що об'єкту потрібні панелі
--  й інвертор, на місяць пізніше, ніж це стало відомо компанії.
--
--  Оцифрована КП уже містить цю відповідь. Лишається донести її до
--  забезпечення — і зробити це так, щоб потреба не подвоїлась, коли
--  згодом затвердять справжню комплектацію.
--
--  ЩО САМЕ МОЖНА ПЕРЕНЕСТИ. Не весь рядок КП є товаром:
--    equipment — панель, інвертор, АКБ, кабель. Конкретна позиція,
--                яку видно в довіднику. Саме вона стає потребою.
--    bundle    — «конструкція кріплення», «електричний захист»,
--                «заземлення». Один рядок КП = десятки позицій складу
--                (профіль, притиски, метизи). Розписати їх може лише
--                комплектація; автоматично — ніяк.
--    service   — роботи, логістика. Товаром не є взагалі.
--  Тому потребою стає лише equipment, а bundle і service лишаються в
--  КП як гроші, але не як склад.
--
--  ЯК УНИКНУТИ ПОДВІЙНОГО ОБЛІКУ. v_object_material_needs підсумовує
--  ВСІ затверджені специфікації об'єкта. Якщо потребу з КП і справжню
--  комплектацію затвердити одночасно, панелі порахуються двічі. Тому
--  щойно затверджують комплектацію — потреба з КП автоматично йде в
--  архів (блок D). Вона своє відпрацювала, і жодного ручного кроку
--  для цього не потрібно.
--
--  Саме цей запобіжник дозволяє затверджувати потребу з КП одразу при
--  оцифровці, без окремого підтвердження: подвоїтись вона не може за
--  побудовою.
--
--  Застосовувати в Supabase → SQL Editor.
--  Залежить від db/2026-09_commercial_offers.sql.
-- =====================================================================


-- =====================================================================
--  БЛОК A · Позиція КП дізнається про склад
-- =====================================================================

ALTER TABLE commercial_offer_items
    -- Звідки взялась прив'язка до номенклатури. Потрібно, щоб директор
    -- бачив різницю між «система впевнена» і «система здогадалась»:
    --   memory — назву вже колись співставляли руками (supplier_mappings)
    --   exact  — назва збіглася точно
    --   fuzzy  — підібрано за схожістю, варте перевірки
    --   manual — поставила людина
    ADD COLUMN IF NOT EXISTS match_source text
        CHECK (match_source IN ('memory', 'exact', 'fuzzy', 'manual')),

    -- Чим цей рядок є з точки зору складу
    ADD COLUMN IF NOT EXISTS need_role text NOT NULL DEFAULT 'equipment'
        CHECK (need_role IN ('equipment', 'bundle', 'service'));

CREATE INDEX IF NOT EXISTS idx_commercial_offer_items_need
    ON commercial_offer_items (offer_id, need_role)
    WHERE nomenclature_id IS NOT NULL;


-- =====================================================================
--  БЛОК B · Перенесення КП у чернетку специфікації
--
--  Тип специфікації живе в specifications.notes — так само, як
--  'complectation' і 'comp_protection'. Додаємо третій:
--  'commercial_proposal'.
--
--  Специфікація на об'єкт завжди одна: повторний виклик не плодить
--  версії, а зводить позиції в тій самій. Інакше кожне збереження КП
--  залишало б по специфікації-привиду.
--
--  ЧОМУ ЗВЕДЕННЯ, А НЕ «ВИДАЛИТИ Й ВСТАВИТИ». Потреба затверджується
--  одразу, тож під її позиції вже можуть стояти резерви
--  (reservations.specification_item_id). Видалити такий рядок база не
--  дасть, та й не повинна. Тому наявні позиції оновлюються, нові
--  додаються, а зайві прибираються лише тоді, коли на них нічого не
--  зав'язано.
--
--  АВТОМАТИЧНЕ ЗАТВЕРДЖЕННЯ. За замовчуванням потреба одразу стає
--  чинною: оцифрував КП — вона вже в забезпеченні. Ручний крок тут
--  зайвий, бо подвоїтись потреба не може (блок D), а помилку в
--  співставленні видно й виправляється вона в картці КП.
-- =====================================================================

-- Стара однопараметрична версія була б перевантаженням, а не заміною
DROP FUNCTION IF EXISTS sync_offer_need(bigint);

CREATE OR REPLACE FUNCTION sync_offer_need(
    p_offer_id bigint,
    p_auto_confirm boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_offer   commercial_offers%ROWTYPE;
    v_spec_id bigint;
    v_status  text;
    v_version integer;
    v_items   integer;
    v_total   integer;
    v_unmapped integer;
    v_has_complectation boolean;
    v_confirmed boolean := false;
BEGIN
    SELECT * INTO v_offer FROM commercial_offers WHERE id = p_offer_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'offer_not_found');
    END IF;

    -- Архівна версія КП потребу не формує: чинна лише поточна пропозиція
    IF NOT v_offer.is_current THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'offer_not_current');
    END IF;

    SELECT count(*) FILTER (WHERE need_role = 'equipment'),
           count(*) FILTER (WHERE need_role = 'equipment' AND nomenclature_id IS NULL)
      INTO v_total, v_unmapped
      FROM commercial_offer_items WHERE offer_id = p_offer_id;

    v_has_complectation := EXISTS (
        SELECT 1 FROM specifications
         WHERE installation_custom_id = v_offer.installation_custom_id
           AND notes = 'complectation'
           AND status = 'confirmed');

    -- Чого саме об'єкт потребує за цією пропозицією. Кілька рядків КП
    -- можуть вказувати на одну позицію довідника — кількості складаємо.
    DROP TABLE IF EXISTS _offer_need_want;
    CREATE TEMP TABLE _offer_need_want ON COMMIT DROP AS
    SELECT i.nomenclature_id,
           SUM(i.quantity)                                AS qty,
           min(COALESCE(NULLIF(i.model, ''), i.name))     AS nm
      FROM commercial_offer_items i
     WHERE i.offer_id = p_offer_id
       AND i.need_role = 'equipment'
       AND i.nomenclature_id IS NOT NULL
       AND COALESCE(i.quantity, 0) > 0
     GROUP BY i.nomenclature_id;

    -- Діюча потреба цього типу: спершу затверджена, потім чернетка
    SELECT id, status::text INTO v_spec_id, v_status
      FROM specifications
     WHERE installation_custom_id = v_offer.installation_custom_id
       AND notes = 'commercial_proposal'
       AND status IN ('confirmed', 'draft')
     ORDER BY (status = 'confirmed') DESC, version DESC
     LIMIT 1;

    IF v_spec_id IS NULL THEN
        -- Версія наскрізна по всіх специфікаціях об'єкта: у базі
        -- унікальний ключ (installation, version) без урахування типу
        SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
          FROM specifications
         WHERE installation_custom_id = v_offer.installation_custom_id;

        INSERT INTO specifications (
            installation_custom_id, version, status, name, notes, created_by, updated_by
        ) VALUES (
            v_offer.installation_custom_id, v_version, 'draft',
            'Потреба з КП в. ' || v_offer.version,
            'commercial_proposal',
            v_offer.created_by, v_offer.created_by
        )
        RETURNING id INTO v_spec_id;
        v_status := 'draft';
    ELSE
        UPDATE specifications
           SET name = 'Потреба з КП в. ' || v_offer.version,
               updated_at = now()
         WHERE id = v_spec_id;
    END IF;

    -- Зведення: оновити наявні
    UPDATE specification_items si
       SET quantity = w.qty,
           original_name = w.nm,
           updated_at = now()
      FROM _offer_need_want w
     WHERE si.specification_id = v_spec_id
       AND si.nomenclature_id = w.nomenclature_id;

    -- додати нові
    INSERT INTO specification_items (
        specification_id, nomenclature_id, quantity, original_name, created_by
    )
    SELECT v_spec_id, w.nomenclature_id, w.qty, w.nm, v_offer.created_by
      FROM _offer_need_want w
     WHERE NOT EXISTS (
        SELECT 1 FROM specification_items si
         WHERE si.specification_id = v_spec_id
           AND si.nomenclature_id = w.nomenclature_id);

    -- прибрати те, чого в пропозиції вже немає, крім зарезервованого
    DELETE FROM specification_items si
     WHERE si.specification_id = v_spec_id
       AND NOT EXISTS (SELECT 1 FROM _offer_need_want w
                        WHERE w.nomenclature_id = si.nomenclature_id)
       AND NOT EXISTS (SELECT 1 FROM reservations r
                        WHERE r.specification_item_id = si.id);

    SELECT count(*) INTO v_items
      FROM specification_items WHERE specification_id = v_spec_id;

    -- Затверджуємо одразу: подвоїтись потреба не може, бо затверджена
    -- комплектація її витісняє тригером блоку D
    IF p_auto_confirm AND v_status = 'draft' AND v_items > 0 AND NOT v_has_complectation THEN
        UPDATE specifications
           SET status = 'archived', updated_at = now()
         WHERE installation_custom_id = v_offer.installation_custom_id
           AND notes = 'commercial_proposal'
           AND status = 'confirmed'
           AND id <> v_spec_id;

        UPDATE specifications
           SET status = 'confirmed', confirmed_at = now(), updated_at = now()
         WHERE id = v_spec_id;

        v_confirmed := true;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'specification_id', v_spec_id,
        'items', v_items,
        'equipment_total', v_total,
        'unmapped', v_unmapped,
        'confirmed', v_confirmed OR v_status = 'confirmed',
        'blocked_by_complectation', v_has_complectation
    );
END $$;

GRANT EXECUTE ON FUNCTION sync_offer_need(bigint, boolean) TO anon, authenticated;


-- =====================================================================
--  БЛОК C · Затвердження потреби руками
--
--  Запасний шлях. Зазвичай потребу затверджує сам sync_offer_need при
--  оцифровці, і сюди заходити не доводиться. Функція потрібна там, де
--  автоматика свідомо відступила: чернетку колись зняли з затвердження,
--  або КП розібралась із порожнім переліком і позиції дозаповнили руками.
--
--  Якщо комплектація вже затверджена — затверджувати потребу з КП
--  безглуздо й шкідливо: вона подвоїть те, що вже враховано. Функція
--  каже про це прямо, замість того щоб мовчки створити подвійний облік.
-- =====================================================================

CREATE OR REPLACE FUNCTION confirm_offer_need(p_offer_id bigint, p_employee_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
    v_installation integer;
    v_spec_id bigint;
    v_items integer;
BEGIN
    SELECT installation_custom_id INTO v_installation
      FROM commercial_offers WHERE id = p_offer_id AND is_current;
    IF v_installation IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'offer_not_current');
    END IF;

    IF EXISTS (
        SELECT 1 FROM specifications
         WHERE installation_custom_id = v_installation
           AND notes = 'complectation'
           AND status = 'confirmed'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'complectation_exists');
    END IF;

    SELECT id INTO v_spec_id
      FROM specifications
     WHERE installation_custom_id = v_installation
       AND notes = 'commercial_proposal'
       AND status = 'draft'
     ORDER BY version DESC
     LIMIT 1;

    IF v_spec_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'no_draft');
    END IF;

    SELECT count(*) INTO v_items FROM specification_items WHERE specification_id = v_spec_id;
    IF v_items = 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'empty');
    END IF;

    -- Попередню затверджену потребу з КП (з минулої версії пропозиції)
    -- прибираємо: чинною лишається одна
    UPDATE specifications
       SET status = 'archived', updated_at = now()
     WHERE installation_custom_id = v_installation
       AND notes = 'commercial_proposal'
       AND status = 'confirmed';

    UPDATE specifications
       SET status = 'confirmed',
           confirmed_at = now(),
           updated_by = COALESCE(p_employee_id, updated_by),
           updated_at = now()
     WHERE id = v_spec_id;

    RETURN jsonb_build_object('ok', true, 'specification_id', v_spec_id, 'items', v_items);
END $$;

GRANT EXECUTE ON FUNCTION confirm_offer_need(bigint, integer) TO anon, authenticated;


-- =====================================================================
--  БЛОК D · Комплектація витісняє потребу з КП
--
--  Головний запобіжник від подвійного обліку. Потреба з КП — це
--  тимчасовий замінник комплектації, поки її немає. Щойно з'явилась
--  справжня — замінник іде в архів автоматично, без чиєїсь пам'яті
--  про те, що це треба зробити руками.
-- =====================================================================

CREATE OR REPLACE FUNCTION specifications_supersede_offer_need()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE specifications
       SET status = 'archived', updated_at = now()
     WHERE installation_custom_id = NEW.installation_custom_id
       AND notes = 'commercial_proposal'
       AND status = 'confirmed'
       AND id <> NEW.id;
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_specifications_supersede_offer_need ON specifications;
CREATE TRIGGER trg_specifications_supersede_offer_need
    AFTER INSERT OR UPDATE OF status ON specifications
    FOR EACH ROW
    WHEN (NEW.status = 'confirmed' AND NEW.notes = 'complectation')
    EXECUTE FUNCTION specifications_supersede_offer_need();


-- =====================================================================
--  БЛОК E · Стан потреби з КП по об'єктах
--
--  Один рядок на об'єкт: скільки позицій обладнання в КП, скільки з них
--  впізнано складом, у якому стані потреба. Для панелі КП і для того,
--  щоб на забезпеченні було видно, де потреба вже є, а де ще чекає.
-- =====================================================================

CREATE OR REPLACE VIEW v_object_offer_need AS
SELECT
    o.installation_custom_id,
    o.id                                            AS offer_id,
    o.version                                       AS offer_version,
    count(*) FILTER (WHERE i.need_role = 'equipment')                                 AS equipment_lines,
    count(*) FILTER (WHERE i.need_role = 'equipment' AND i.nomenclature_id IS NOT NULL) AS mapped_lines,
    count(*) FILTER (WHERE i.need_role = 'bundle')                                    AS bundle_lines,
    count(*) FILTER (WHERE i.need_role = 'equipment' AND i.match_source = 'fuzzy')     AS fuzzy_lines,
    -- confirmed — потреба працює в забезпеченні
    -- draft     — розібрана, але ще не затверджена
    -- superseded— її замінила справжня комплектація
    -- none      — переносити нічого
    COALESCE((
        SELECT CASE
                 -- «Витіснена» має сенс лише тоді, коли потреба з КП колись була
                 WHEN bool_or(s.notes = 'commercial_proposal')
                  AND bool_or(s.status = 'confirmed' AND s.notes = 'complectation') THEN 'superseded'
                 WHEN bool_or(s.status = 'confirmed' AND s.notes = 'commercial_proposal') THEN 'confirmed'
                 WHEN bool_or(s.status = 'draft' AND s.notes = 'commercial_proposal') THEN 'draft'
               END
          FROM specifications s
         WHERE s.installation_custom_id = o.installation_custom_id
    ), 'none')                                      AS need_status
FROM commercial_offers o
LEFT JOIN commercial_offer_items i ON i.offer_id = o.id
WHERE o.is_current
GROUP BY o.installation_custom_id, o.id, o.version;

GRANT SELECT ON v_object_offer_need TO anon, authenticated;


-- =====================================================================
--  БЛОК F · Обладнання з чинних КП, рядок за рядком
--
--  Для зведення «чого з обладнання нам треба зараз» на сторінці
--  забезпечення. v_object_material_needs показує лише те, що вже
--  затверджено; ця в'юха додає до картини те, що вже пообіцяно
--  клієнту, але ще не дійшло до комплектації.
--
--  Комплекти й послуги сюди не потрапляють свідомо: закупівлі
--  потрібні позиції, які можна замовити, а не рядки кошторису.
-- =====================================================================

CREATE OR REPLACE VIEW v_object_offer_equipment AS
SELECT
    o.installation_custom_id,
    o.id                                    AS offer_id,
    o.version                               AS offer_version,
    i.id                                    AS offer_item_id,
    i.sort_order,
    i.category_key,
    i.category_label,
    COALESCE(NULLIF(i.model, ''), i.name)   AS offer_name,
    i.quantity,
    i.unit,
    i.nomenclature_id,
    i.match_source,
    n.name                                  AS nomenclature_name,
    n.sku,
    u.code                                  AS unit_code
FROM commercial_offers o
JOIN commercial_offer_items i ON i.offer_id = o.id
LEFT JOIN nomenclature n ON n.id = i.nomenclature_id
LEFT JOIN units u        ON u.id = n.unit_id
WHERE o.is_current
  AND i.need_role = 'equipment';

GRANT SELECT ON v_object_offer_equipment TO anon, authenticated;
