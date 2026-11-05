-- =====================================================================
--  K-CORE · Номенклатура складу: розділи, повні назви, артикули
--
--  Погоджений план (04.11.2026, https://claude.ai/artifact/KYCAb5wDocC4gQVS3Q4VKj):
--   • «Інше» (101 позицій) — по нових розділах: Електрозахист (9 підрозділів),
--     Наконечники та конектори, Гофра й труби, Витратні матеріали; кабелі й
--     проводи — кожне у свій розділ; логер, аксесуари АКБ, стійка, кріплення.
--   • Між розділами: Кабель ↔ Провід, метизи й кріплення — у свої
--     підрозділи, інвертори — у правильну гілку, інструмент — у свої групи.
--   • Повні назви: 95 позицій («Гвинт М8*20» замість «М8*20»).
--     6 перейменувань пропущено — ці позиції мають у довіднику двійника,
--     і захист від дублікатів їх не пропускає. Вони лише переїжджають; назву
--     дамо, коли двійників об'єднають: 233, 235, 224, 148, 173, 74.
--   • «Стійка під акумулятори» → «Стійки»; прибрано 3 криві категорії
--     (лише якщо в них нічого не лишилось).
--   • Артикули для 29 позицій без артикула (G-xxxxxx, як у решти).
--  Залишки, рух, резерви, специфікації, КП — не змінюються: усе тримається
--  за номером позиції, а не за назвою чи категорією.
--
--  Резервні копії: backup.nomenclature_20261104, backup.categories_20261104.
--  RLS не чіпаємо.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.nomenclature_20261104 AS TABLE public.nomenclature;
CREATE TABLE IF NOT EXISTS backup.categories_20261104 AS TABLE public.categories;

-- Категорія за шляхом «Корінь › Підкатегорія»; create — створити, якщо немає
CREATE OR REPLACE FUNCTION pg_temp.cat_id(p_path text, p_create boolean DEFAULT false)
RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE
    seg    text;
    parent bigint := NULL;
    cur    bigint;
BEGIN
    FOREACH seg IN ARRAY string_to_array(p_path, ' › ') LOOP
        cur := NULL;
        SELECT id INTO cur FROM categories
         WHERE name = seg AND parent_id IS NOT DISTINCT FROM parent
         ORDER BY id LIMIT 1;
        IF cur IS NULL THEN
            IF NOT p_create THEN
                RAISE EXCEPTION 'Немає категорії: %', p_path;
            END IF;
            INSERT INTO categories (name, parent_id, is_active) VALUES (seg, parent, true) RETURNING id INTO cur;
        END IF;
        parent := cur;
    END LOOP;
    RETURN parent;
END $fn$;

-- ---------------------------------------------------------------------
--  Нові категорії й перейменування
-- ---------------------------------------------------------------------
SELECT pg_temp.cat_id('Електрозахист', true);
SELECT pg_temp.cat_id('Електрозахист › Автоматичні вимикачі', true);
SELECT pg_temp.cat_id('Електрозахист › Перемикачі 3-позиційні', true);
SELECT pg_temp.cat_id('Електрозахист › АВР', true);
SELECT pg_temp.cat_id('Електрозахист › ОПН', true);
SELECT pg_temp.cat_id('Електрозахист › Захист DC', true);
SELECT pg_temp.cat_id('Електрозахист › Вимірювання', true);
SELECT pg_temp.cat_id('Електрозахист › Розетки на DIN-рейку', true);
SELECT pg_temp.cat_id('Електрозахист › Щити й бокси', true);
SELECT pg_temp.cat_id('Електрозахист › Клеми', true);
SELECT pg_temp.cat_id('Наконечники та конектори', true);
SELECT pg_temp.cat_id('Гофра й труби', true);
SELECT pg_temp.cat_id('Витратні матеріали', true);

-- Категорію шукаємо один раз на команду (підзапит): інакше пошук повторюється
-- для кожного рядка і вже не знаходить щойно перейменовану чи видалену
UPDATE categories SET name = 'Стійки' WHERE id = (SELECT pg_temp.cat_id('Стійка під акумулятори'));

-- ---------------------------------------------------------------------
--  Переїзд позицій
-- ---------------------------------------------------------------------
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › Автоматичні вимикачі')) WHERE id IN (100, 123, 128, 143, 99, 168, 154, 182, 130, 108, 109, 111, 199, 144, 124, 184);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › Перемикачі 3-позиційні')) WHERE id IN (239, 317, 241, 129, 101, 313, 170, 164, 185, 169, 122, 126, 136, 145, 160);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › АВР')) WHERE id IN (137, 189, 138, 197);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › ОПН')) WHERE id IN (102, 121, 97, 96, 98);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › Захист DC')) WHERE id IN (147, 95);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › Вимірювання')) WHERE id IN (243, 234, 233, 235, 238, 231);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › Розетки на DIN-рейку')) WHERE id IN (89, 162);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › Щити й бокси')) WHERE id IN (116, 115, 113, 91, 112, 257, 196, 155, 139, 221, 228);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Електрозахист › Клеми')) WHERE id IN (94, 93);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Наконечники та конектори')) WHERE id IN (259, 161, 85, 178, 225, 110, 258, 90, 256, 120, 152, 180, 224, 212, 18);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Гофра й труби')) WHERE id IN (201, 167, 132, 119, 205);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Витратні матеріали')) WHERE id IN (215, 54, 15, 208, 207, 210, 171, 209, 142);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Кабель')) WHERE id IN (254, 177, 118, 183, 179, 166, 151);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Провід')) WHERE id IN (260, 146, 163, 198, 104, 103, 200);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Логери')) WHERE id IN (186);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('АКБ')) WHERE id IN (192);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Стійки')) WHERE id IN (206);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Кріплення')) WHERE id IN (202, 229);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Метизи › Анкер')) WHERE id IN (140, 148, 173);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Метизи › Болт')) WHERE id IN (316);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Метизи › Шайба')) WHERE id IN (57);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Метизи › Гайка')) WHERE id IN (8);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Метизи › Заклепка')) WHERE id IN (176);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Кріплення › Оцинкована Траверса')) WHERE id IN (248);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Інструмент › Бетономішалка')) WHERE id IN (318);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Інструмент › Драбина')) WHERE id IN (250, 227);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Інвертор › Мережевий')) WHERE id IN (218);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Інвертор › Гібридний › 1-фазний')) WHERE id IN (271, 252, 158, 270, 266);
UPDATE nomenclature SET category_id = (SELECT pg_temp.cat_id('Інвертор › Гібридний › 3-фазний › Високовольтний')) WHERE id IN (251);

-- ---------------------------------------------------------------------
--  Повні назви
-- ---------------------------------------------------------------------
UPDATE nomenclature SET name = 'Автоматичний вимикач 2-полюсний (40А)' WHERE id = 128;   -- було: Автоматичний вимикач 2 полюсний (40А)
UPDATE nomenclature SET name = 'Автоматичний вимикач 2-полюсний (63А)' WHERE id = 143;   -- було: Автоматичний вимикач 2 полюсний 63 А
UPDATE nomenclature SET name = 'Автоматичний вимикач 2-полюсний (50А)' WHERE id = 130;   -- було: автоматичний вимикач 2-полюсний 50А
UPDATE nomenclature SET name = 'Автоматичний вимикач 3-полюсний (63А)' WHERE id = 108;   -- було: Автоматичний вимикач 3 полюсний (63А)
UPDATE nomenclature SET name = 'Автоматичний вимикач 3-полюсний (125А)' WHERE id = 109;   -- було: Автоматичний вимикач 3 полюсний 125 а
UPDATE nomenclature SET name = 'Автоматичний вимикач 3-полюсний (160А)' WHERE id = 111;   -- було: Автоматичний вимикач 3 полюсний 160 а
UPDATE nomenclature SET name = 'Автоматичний вимикач 3-полюсний (250А)' WHERE id = 199;   -- було: Автоматичний вимикач 3 полюсний 250А
UPDATE nomenclature SET name = 'Автоматичний вимикач 3-полюсний (40А)' WHERE id = 144;   -- було: Автоматичний вимикач 3 полюсний 40 А
UPDATE nomenclature SET name = 'Автоматичний вимикач 3-полюсний (50А)' WHERE id = 184;   -- було: Автоматичний вимикач 3-полюсний 50А
UPDATE nomenclature SET name = '3-позиційний перемикач 4-полюсний (100A)' WHERE id = 145;   -- було: Інше 3-позиційний перемикач 4-полюсний (100A)
UPDATE nomenclature SET name = 'АВР 250А' WHERE id = 138;   -- було: АВР 250 А
UPDATE nomenclature SET name = 'Вольтметр одномодульний (1-фазний)' WHERE id = 243;   -- було: Вольтметер 1модульний (1 фазний)
UPDATE nomenclature SET name = 'Вольтметр однополюсний (1-фазний)' WHERE id = 238;   -- було: Вольтметр однополюсний (1 фазний)
UPDATE nomenclature SET name = 'Трансформатор струму 150А' WHERE id = 231;   -- було: Трансформатор струму 150 А
UPDATE nomenclature SET name = 'Пластиковий щит ЕСН (на 18 модулів)' WHERE id = 113;   -- було: Пластиковий щит ЕСН на 18 модулів
UPDATE nomenclature SET name = 'Пластиковий щит ЕСН (на 6 модулів)' WHERE id = 91;   -- було: Пластиковий щит ЕСН на 6 модулів
UPDATE nomenclature SET name = 'Пластиковий щит ЕСН (на 8 модулів)' WHERE id = 112;   -- було: Пластиковий щит ЕСН на 8 модулів
UPDATE nomenclature SET name = 'Термобокс' WHERE id = 228;   -- було: ТЕРМОБОКС
UPDATE nomenclature SET name = 'Наконечник мідний кабельний 35 мм' WHERE id = 259;   -- було: Мідний кабельний наконечник 35 мм
UPDATE nomenclature SET name = 'Наконечник мідний луджений e.end.stand.jg.6, D6.2' WHERE id = 161;   -- було: Мідний луджений кабельний наконечник e.end.stand.jg.6, D6.2
UPDATE nomenclature SET name = 'Конектор МС-4' WHERE id = 85;   -- було: МС-4 конектора
UPDATE nomenclature SET name = 'Наконечник алюмінієво-мідний DT (16 мм)' WHERE id = 178;   -- було: Накінечник алюмінієво-мідний DT (16 мм)
UPDATE nomenclature SET name = 'Наконечник алюмінієво-мідний DT (35 мм)' WHERE id = 225;   -- було: Накінечник алюмінієво-мідний DT 35 мм
UPDATE nomenclature SET name = 'Наконечник мідно-алюмінієвий (35 мм)' WHERE id = 110;   -- було: Накінечник мідно-алюмінієвий 35 мм
UPDATE nomenclature SET name = 'Наконечник мідно-алюмінієвий (70 мм)' WHERE id = 258;   -- було: Накінечник мідно-алюмінієвий 70 мм
UPDATE nomenclature SET name = 'Наконечник мідно-луджений DT' WHERE id = 90;   -- було: Накінечник мідно-луджений  DT
UPDATE nomenclature SET name = 'Наконечник мідно-луджений DT (10 мм)' WHERE id = 256;   -- було: Накінечник мідно-луджений DT (10 MM)
UPDATE nomenclature SET name = 'Наконечник мідно-луджений DT (25 мм)' WHERE id = 120;   -- було: Накінечник мідно-луджений DT (25 мм)
UPDATE nomenclature SET name = 'Наконечник мідно-луджений DT (4 мм)' WHERE id = 152;   -- було: Накінечник мідно-луджений DT (4 MM)
UPDATE nomenclature SET name = 'Наконечник мідно-луджений DT (6 мм)' WHERE id = 180;   -- було: Накінечник мідно-луджений DT (6 мм)
UPDATE nomenclature SET name = 'Наконечник мідно-луджений Т (10 мм)' WHERE id = 212;   -- було: Накінечник мідно-луджений Т (10 мм)
UPDATE nomenclature SET name = 'Наконечник трубчастий НТ 6,0-12 чорний' WHERE id = 18;   -- було: Наконечники трубчаті НТ 6,0-12 чорні
UPDATE nomenclature SET name = 'Труба гофрована УФ 32 мм' WHERE id = 132;   -- було: Труба гофрована УФ (32)
UPDATE nomenclature SET name = 'Труба каналізаційна пластикова (d=250 мм)' WHERE id = 205;   -- було: Пластикова каналізаційна труба (d=250 mm)
UPDATE nomenclature SET name = 'Бетон' WHERE id = 215;   -- було: бетон
UPDATE nomenclature SET name = 'Електроди для зварювання (облік по факту)' WHERE id = 208;   -- було: Електроди для зварювання конструкції (yn по факту)
UPDATE nomenclature SET name = 'Пензлі й валики' WHERE id = 210;   -- було: Пензлі (валик) (-)
UPDATE nomenclature SET name = 'Фарба антикорозійна (облік по факту)' WHERE id = 209;   -- було: Фарба антикорозійна (- по факту)
UPDATE nomenclature SET name = 'АВВГ 4*16' WHERE id = 177;   -- було: АВВГ (4*16)
UPDATE nomenclature SET name = 'АВВГ 4*25' WHERE id = 118;   -- було: АВВГ (4*25)
UPDATE nomenclature SET name = 'ВВГ 3*16' WHERE id = 183;   -- було: ВВГ (3*16)
UPDATE nomenclature SET name = 'ВВГ 4*6' WHERE id = 179;   -- було: ВВГ (4*6)
UPDATE nomenclature SET name = 'Логер Solis S5-WiFi-ST (4 pin)' WHERE id = 186;   -- було: S5-Wifi-ST-4Pin
UPDATE nomenclature SET name = 'Комплект аксесуарів BOS-B' WHERE id = 192;   -- було: BOS-B Accessories Package
UPDATE nomenclature SET name = 'Заглушка пластикова для профільної труби 40*40' WHERE id = 229;   -- було: Пластикові заглушки для профільної труби (40*40)
UPDATE nomenclature SET name = 'Заклепка М4,8' WHERE id = 176;   -- було: Заклепка (M4,8)
UPDATE nomenclature SET name = 'Траверса оцинкована 38*38' WHERE id = 248;   -- було: Оцинкована Траверса 38*38
UPDATE nomenclature SET name = 'Кабель 4*50' WHERE id = 214;   -- було: 4*50
UPDATE nomenclature SET name = 'ВВГ 5*25' WHERE id = 223;   -- було: Кабель ВВГ (5*25)
UPDATE nomenclature SET name = 'ВВГ 2*4' WHERE id = 219;   -- було: ВВГ (2*4)
UPDATE nomenclature SET name = 'ВВГ 3*6' WHERE id = 240;   -- було: ВВГ (3*6)
UPDATE nomenclature SET name = 'ПВ-3 жовто-зелений' WHERE id = 44;   -- було: ПВ-3 жлвто-зелений
UPDATE nomenclature SET name = 'ПВС 5*16' WHERE id = 117;   -- було: ПВС (5*16)
UPDATE nomenclature SET name = 'Саморіз для кріплення кронштейна' WHERE id = 134;   -- було: Саморізи для кріплення кронштейну
UPDATE nomenclature SET name = 'Анкер 10*100' WHERE id = 175;   -- було: Анкер (10*100)
UPDATE nomenclature SET name = 'Болт М8*120' WHERE id = 72;   -- було: М8*120
UPDATE nomenclature SET name = 'Болт М8*40' WHERE id = 315;   -- було: М8*40
UPDATE nomenclature SET name = 'Гайка М10' WHERE id = 79;   -- було: М10
UPDATE nomenclature SET name = 'Гайка М8' WHERE id = 80;   -- було: М8
UPDATE nomenclature SET name = 'Гайка М8 з фланцем' WHERE id = 17;   -- було: М8 з фланцем
UPDATE nomenclature SET name = 'Гвинт М10*50 з фланцем' WHERE id = 253;   -- було: Гвинт з фланцем (M10*50)
UPDATE nomenclature SET name = 'Гвинт М8*100' WHERE id = 73;   -- було: М8*100
UPDATE nomenclature SET name = 'Гвинт М8*130' WHERE id = 56;   -- було: М8*130
UPDATE nomenclature SET name = 'Гвинт М8*20 з фланцем' WHERE id = 16;   -- було: М8*20 з фланцем
UPDATE nomenclature SET name = 'Гвинт М8*25' WHERE id = 5;   -- було: М8*25
UPDATE nomenclature SET name = 'Гвинт М8*30' WHERE id = 75;   -- було: М8*30
UPDATE nomenclature SET name = 'Гвинт М8*45' WHERE id = 76;   -- було: М8*45
UPDATE nomenclature SET name = 'Гвинт М8*50 з фланцем' WHERE id = 77;   -- було: М8*50 з фланцем
UPDATE nomenclature SET name = 'Гвинт М8*60' WHERE id = 69;   -- було: М8*60
UPDATE nomenclature SET name = 'Гвинт М8*70' WHERE id = 71;   -- було: М8*70
UPDATE nomenclature SET name = 'Гвинт М8*80' WHERE id = 70;   -- було: М8*80
UPDATE nomenclature SET name = 'Гвинт М8*90' WHERE id = 213;   -- було: М8*90
UPDATE nomenclature SET name = 'Саморіз з шестигранною головкою М6*50' WHERE id = 194;   -- було: Саморіз з шестигранною головкою (M6*50)
UPDATE nomenclature SET name = 'Гровер М8' WHERE id = 78;   -- було: М8
UPDATE nomenclature SET name = 'Двигвинт-шуруп М10*200' WHERE id = 9;   -- було: М10*200
UPDATE nomenclature SET name = 'Інбус М8*40' WHERE id = 249;   -- було: Інбус (М8*40)
UPDATE nomenclature SET name = 'Інбус М8*20' WHERE id = 68;   -- було: М8*20
UPDATE nomenclature SET name = 'Інбус М8*25' WHERE id = 84;   -- було: М8*25
UPDATE nomenclature SET name = 'Інбус М8*30' WHERE id = 6;   -- було: М8*30
UPDATE nomenclature SET name = 'Інбус М8*35' WHERE id = 65;   -- було: М8*35
UPDATE nomenclature SET name = 'Інбус М8*45' WHERE id = 7;   -- було: М8*45
UPDATE nomenclature SET name = 'Інбус М8*50' WHERE id = 66;   -- було: М8*50
UPDATE nomenclature SET name = 'Інбус М8*70' WHERE id = 67;   -- було: М8*70
UPDATE nomenclature SET name = 'Шайба М10 вузька' WHERE id = 88;   -- було: М10 вузька
UPDATE nomenclature SET name = 'Шайба М10 збільшена' WHERE id = 87;   -- було: М10 збільшена
UPDATE nomenclature SET name = 'Шайба М8 вузька' WHERE id = 86;   -- було: М8 вузька
UPDATE nomenclature SET name = 'Кронштейн L-подібний алюмінієвий' WHERE id = 135;   -- було: кронштейн L-подібний алюмінієвий
UPDATE nomenclature SET name = 'Траверса оцинкована 41*20' WHERE id = 12;   -- було: 41*20
UPDATE nomenclature SET name = 'Траверса оцинкована 41*41' WHERE id = 10;   -- було: 41*41
UPDATE nomenclature SET name = 'Притиск міжмодульний T 20' WHERE id = 14;   -- було: Міжмодульний T 20
UPDATE nomenclature SET name = 'Притиск стартовий S 30' WHERE id = 13;   -- було: Стартовий S 30
UPDATE nomenclature SET name = 'Бетономішалка Dnipro-m' WHERE id = 3;   -- було: Dnipro-m
UPDATE nomenclature SET name = 'Драбина алюмінієва' WHERE id = 62;   -- було: Алюмінієва
UPDATE nomenclature SET name = 'Драбина-трансформер' WHERE id = 61;   -- було: Трансформер
UPDATE nomenclature SET name = 'Логер Solis WiFi (data logging stick)' WHERE id = 265;   -- було: WIFI Solis data loging stick

-- ---------------------------------------------------------------------
--  Артикули
-- ---------------------------------------------------------------------
UPDATE nomenclature SET sku = 'G-394859' WHERE id = 264 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-402778' WHERE id = 265 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-410697' WHERE id = 266 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-418616' WHERE id = 267 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-426535' WHERE id = 268 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-434454' WHERE id = 269 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-442373' WHERE id = 270 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-450292' WHERE id = 271 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-474049' WHERE id = 274 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-481968' WHERE id = 275 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-505725' WHERE id = 278 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-513644' WHERE id = 279 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-521563' WHERE id = 280 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-529482' WHERE id = 281 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-569077' WHERE id = 286 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-592834' WHERE id = 289 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-608672' WHERE id = 291 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-616591' WHERE id = 292 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-640348' WHERE id = 295 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-648267' WHERE id = 296 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-656186' WHERE id = 297 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-672024' WHERE id = 299 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-687862' WHERE id = 301 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-695781' WHERE id = 302 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-703700' WHERE id = 303 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-711619' WHERE id = 304 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-735376' WHERE id = 307 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-743295' WHERE id = 308 AND (sku IS NULL OR btrim(sku) = '');
UPDATE nomenclature SET sku = 'G-751214' WHERE id = 309 AND (sku IS NULL OR btrim(sku) = '');

-- ---------------------------------------------------------------------
--  Криві категорії — лише якщо порожні
-- ---------------------------------------------------------------------
DELETE FROM categories c WHERE c.id = (SELECT pg_temp.cat_id('Інвертор › Гібридний › 1-фазний › 3-фазний'))   -- порожня гілка, 3-фазні сидять усередині 1-фазних
   AND NOT EXISTS (SELECT 1 FROM nomenclature n WHERE n.category_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id);
DELETE FROM categories c WHERE c.id = (SELECT pg_temp.cat_id('Інструмент › Драбина 3-ох секційна'))   -- порожня, дублює «Драбина»
   AND NOT EXISTS (SELECT 1 FROM nomenclature n WHERE n.category_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id);
DELETE FROM categories c WHERE c.id = (SELECT pg_temp.cat_id('Метизи › Гайка ромбовидна'))   -- одна позиція — переходить у «Гайка»
   AND NOT EXISTS (SELECT 1 FROM nomenclature n WHERE n.category_id = c.id)
   AND NOT EXISTS (SELECT 1 FROM categories k WHERE k.parent_id = c.id);
