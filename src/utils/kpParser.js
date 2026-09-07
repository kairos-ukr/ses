// =====================================================================
//  K-CORE · Розбір комерційної пропозиції
//
//  Чистий модуль без DOM і без мережі: на вхід — текст, який віддав
//  OCR, на виході — шапка, позиції і звірка. Саме цей файл є єдиним
//  двіжком розбору в системі: ним користується і бойове оцифрування
//  (utils/commercialOffer.js), і налагоджувальний інструмент
//  (tools/kp-ocr-test.html). Правило просте — правити логіку тільки тут,
//  щоб «в тесті працює, в системі ні» не могло статися в принципі.
//
//  Чому все тримається на регулярках, а не на жорсткій сітці колонок:
//  шаблони КП у менеджерів різні. Десь колонка зветься «Назва товару»,
//  десь «Позиція»; десь є колонка «Зображення», десь ні; два товари
//  цілком можуть опинитися в одній комірці. Тому кожен блок нижче
//  впізнає своє за змістом, а не за номером.
// =====================================================================

/* --- Дрібні помічники ------------------------------------------------ */

/** Число з комірки: «8 452», «1,7», «7947 $», нерозривні пробіли. */
export const toNum = (s) => {
    if (s === null || s === undefined) return null;
    const cleaned = String(s).replace(/\*/g, '').replace(/[\s  ]/g, '');
    const m = cleaned.match(/-?\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(',', '.')) : null;
};

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

/* Числа в комірці. Головна складність — пробіл: у «8 452» це розділювач
   тисяч, а в «1450 1080» це два різні числа (об'єднаний рядок на два
   товари). Розрізняємо за формою: розділювач тисяч — це 1–3 цифри, далі
   групи рівно по 3 цифри. «1450 1080» під це не підпадає, бо перша
   група має 4 цифри. */
const numbersIn = (s) => {
    if (!s) return [];
    const out = [];
    const re = /(?<!\d)\d{1,3}(?:[\s  ]\d{3})+(?!\d)|\d+(?:[.,]\d+)?/g;
    let m;
    while ((m = re.exec(s)) !== null) {
        const v = parseFloat(m[0].replace(/[\s  ]/g, '').replace(',', '.'));
        if (!isNaN(v)) out.push(v);
    }
    return out;
};

/* --- Таблиця з тексту OCR -------------------------------------------- */

/* Рушій 3 віддає Markdown-таблицю, рушій 2 — колонки через табуляцію.
   Обидва зводимо до однакового масиву рядків. */

/* Рушій 3 непослідовний у крайніх стовпчиках: на одних документах він
   віддає канонічне «| a | b |», на інших — «a | b» без бічних рисок.
   Вимога починатися з «|» відсікала другий випадок цілком: таблиця
   не бачилась, позицій виходило нуль, а сума при цьому знаходилась у
   тексті — і виглядало це як «розбір працює, просто товарів немає».
   Тому спираємось на самі роздільники, а бічні риски знімаємо, якщо є. */
function tableFromMarkdown(text) {
    const rows = [];
    for (const line of text.split('\n')) {
        let t = line.trim();
        if (!t.includes('|')) continue;
        // Роздільник шапки: «|---|---|» або «---|---|---»
        if (/^[|\s:-]+$/.test(t) && t.includes('-')) continue;

        if (t.startsWith('|')) t = t.slice(1);
        if (t.endsWith('|')) t = t.slice(0, -1);

        const cells = t.split('|').map(c => norm(c.replace(/\*\*/g, '')));
        if (cells.length >= 2 && cells.some(c => c)) rows.push(cells);
    }
    return rows;
}

function tableFromTabs(text) {
    const rows = [];
    for (const line of text.split('\n')) {
        if (!line.includes('\t')) continue;
        const cells = line.split('\t').map(norm);
        if (cells.filter(c => c).length >= 2) rows.push(cells);
    }
    return rows;
}

/* --- Категорії позицій ----------------------------------------------- */

/* Порядок важливий: «Сонячний кабель» має спрацювати раніше за
   «Сонячна панель». Увага: \b у JS не працює з кирилицею, тому межі
   слів доводиться ставити через \p{L} у lookaround. */
export const CATEGORIES = [
    { key: 'dc_cable', label: 'Сонячний кабель', re: /соняч[\p{L}]*\s*кабел/iu },
    { key: 'ac_cable', label: 'Електрика', re: /електрика|аввг|пвс\s*\d/iu },
    { key: 'panel', label: 'Сонячна панель', re: /панел/iu },
    { key: 'inverter', label: 'Інвертор', re: /інвертор|комплект\s*станц/iu },
    { key: 'battery', label: 'АКБ', re: /(?<![\p{L}])акб(?![\p{L}])|акумулятор/iu },
    { key: 'mounting', label: 'Конструкція', re: /конструкц|кріплен/iu },
    { key: 'protection', label: 'Електричний захист', re: /захист/iu },
    { key: 'grounding', label: 'Заземлення', re: /заземлен/iu },
    { key: 'work', label: 'Роботи', re: /робота|встановлен|монтаж/iu },
    { key: 'logistics', label: 'Логістика', re: /логістик|доставк/iu },
];

/** Назва категорії за ключем — для показу рядків, що прийшли з бази. */
export const categoryLabel = (key) =>
    (CATEGORIES.find(c => c.key === key) || {}).label || 'Інше';

const detectCategory = (s) => CATEGORIES.find(c => c.re.test(s || '')) || null;

/* Нижня межа правдоподібності для суми угоди. Станцій за 30 доларів не
   буває, тому все, що менше, — це не сума, а випадкове число, яке
   потрапило під регулярку (номер рядка, кількість, рік). */
const MIN_PLAUSIBLE_TOTAL = 50;

/* Сума не завжди є числом. Варіанти, які реально трапляються в КП:
   «Згідно фактичних витрат», «Див. кінець сторінки», «за фактом». */
const BY_FACT_RE = /згідно|фактичн|за\s*фактом|див\.?\s*кінець|дивись\s*кінець|нижче/iu;

/* Заголовок колонки з назвою позиції називають по-різному:
   «Назва товару» в одному шаблоні, «Позиція» в іншому. */
const HEAD_PATTERNS = {
    name: /назва|позиц|наймен/iu,
    model: /модель|характер/iu,
    qty: /к\s*-?\s*с|кільк/iu,
    price: /ціна|вартість\s*за/iu,
    sum: /сума|разом/iu,
};

/** Чи є рядок шапкою таблиці */
const isHeaderRow = (cells) => {
    const j = cells.join(' ');
    return HEAD_PATTERNS.model.test(j) && (HEAD_PATTERNS.sum.test(j) || HEAD_PATTERNS.price.test(j));
};

/* Колонки визначаємо за текстом заголовка, а не за номером: у різних
   шаблонах їх різна кількість (з колонкою «Зображення» і без неї). */
function columnIndexes(rows) {
    for (const r of rows) {
        if (!isHeaderRow(r)) continue;
        const idx = {};
        r.forEach((c, i) => {
            const t = norm(c);
            if (!t) return;
            if (idx.name === undefined && HEAD_PATTERNS.name.test(t)) idx.name = i;
            else if (idx.model === undefined && HEAD_PATTERNS.model.test(t)) idx.model = i;
            else if (idx.qty === undefined && HEAD_PATTERNS.qty.test(t)) idx.qty = i;
            else if (idx.price === undefined && HEAD_PATTERNS.price.test(t)) idx.price = i;
            else if (idx.sum === undefined && HEAD_PATTERNS.sum.test(t)) idx.sum = i;
        });
        if (idx.name !== undefined && idx.sum !== undefined) return idx;
    }
    return null;
}

/* Розкладає об'єднану комірку на кілька товарів.
   «Гібридний інвертор Deye SUN 8K … Акб Deye SE-F5 Pro-C» — менеджер
   написав два товари в одній клітинці. Шукаємо в тексті місця, де
   починається нова категорія, і ріжемо по них. Так не доводиться
   змушувати менеджерів писати «тільки отак». */
function splitMerged(text) {
    if (!text) return [];
    const marks = [];
    for (const c of CATEGORIES) {
        const re = new RegExp(c.re.source, 'giu');
        let m;
        while ((m = re.exec(text)) !== null) {
            marks.push({ at: m.index, cat: c });
            if (m.index === re.lastIndex) re.lastIndex++;   // захист від нульових збігів
        }
    }
    if (marks.length < 2) return [];

    marks.sort((a, b) => a.at - b.at);
    // Лишаємо перший збіг кожної категорії і прибираємо ті, що надто близько
    const cut = [];
    for (const m of marks) {
        if (cut.some(x => x.cat.key === m.cat.key)) continue;
        if (cut.length && m.at - cut[cut.length - 1].at < 6) continue;
        cut.push(m);
    }
    if (cut.length < 2) return [];

    return cut.map((m, i) => ({
        cat: m.cat,
        text: norm(text.slice(m.at, i + 1 < cut.length ? cut[i + 1].at : undefined)),
    }));
}

/* --- Головна функція -------------------------------------------------- */

/**
 * Розбирає текст комерційної пропозиції.
 *
 * @param {string} text — усе, що віддав OCR (сторінки склеєні через \n)
 * @returns {{head: object, items: object[], check: object}}
 *   head  — сума, валюта, потужність, тип станції, ключове обладнання;
 *   items — позиції: категорія, модель, кількість, ціна, сума;
 *   check — звірка суми позицій із підсумком у документі.
 */
export function parseOffer(text) {
    const mdRows = tableFromMarkdown(text);
    const rows = mdRows.length >= 3 ? mdRows : tableFromTabs(text);
    const idx = columnIndexes(rows) || { name: 1, model: 2, qty: 3, price: 4, sum: 5 };

    const head = {};
    const items = [];
    let total = null;

    for (const r of rows) {
        const name = norm(r[idx.name]);
        const model = norm(r[idx.model]);
        const qtyRaw = norm(r[idx.qty]);
        const priceRaw = norm(r[idx.price]);
        const sumRaw = norm(r[idx.sum]);

        // Шапка — може повторюватись, бо таблиць у документі буває кілька
        if (isHeaderRow(r)) continue;

        // Підсумковий рядок усередині таблиці.
        // Межу слова тут не можна ставити через \b: у JS він рахує
        // словом лише [A-Za-z0-9_], тому після кирилиці не спрацьовує
        // ніколи — і «Разом» тихо проходив повз як звичайна позиція.
        if (/^(сума|разом|всього|усього)(?![\p{L}])/iu.test(name)
            || /^(сума|разом|всього)(?![\p{L}])/iu.test(model)) {
            total = toNum(sumRaw || priceRaw || qtyRaw || r[r.length - 1]);
            continue;
        }

        const cat = detectCategory(name) || detectCategory(model);
        if (!cat) continue;

        const byFact = BY_FACT_RE.test(sumRaw + ' ' + priceRaw);
        const qtyParts = qtyRaw.match(/\d+(?:[.,]\d+)?\s*(?:шт|м2|мм|м)(?![\p{L}\d])/giu) || [];
        const sumParts = numbersIn(sumRaw).filter(n => n);
        const priceParts = numbersIn(priceRaw).filter(n => n);

        // Кілька товарів в одній клітинці. Спершу пробуємо розділити за
        // категоріями в тексті — так кожен рядок отримає СВОЮ назву,
        // а не успадкує категорію сусіда.
        if (!byFact && sumParts.length > 1) {
            const parts = splitMerged(`${name} ${model}`);
            const n = sumParts.length;

            if (parts.length === n) {
                parts.forEach((p, i) => {
                    const q = (qtyParts[i] || '').match(/(\d+(?:[.,]\d+)?)\s*(шт|м2|мм|м)/iu);
                    items.push({
                        category: p.cat.key, label: p.cat.label, name: p.text, model: p.text,
                        quantity: q ? toNum(q[1]) : null,
                        unit: q ? (/шт/i.test(q[2]) ? 'шт' : 'м') : null,
                        price: priceParts[i] ?? null, sum: sumParts[i] ?? null,
                        byFact: false, merged: true,
                    });
                });
                continue;
            }

            // Категорії не розпізнались, але кількостей стільки ж, скільки сум —
            // ділимо хоча б за числами, категорію лишаємо спільну
            if (qtyParts.length === n) {
                qtyParts.forEach((q, i) => {
                    const qm = q.match(/(\d+(?:[.,]\d+)?)\s*(шт|м2|мм|м)/iu);
                    items.push({
                        category: cat.key, label: cat.label, name, model,
                        quantity: qm ? toNum(qm[1]) : null,
                        unit: qm ? (/шт/i.test(qm[2]) ? 'шт' : 'м') : null,
                        price: priceParts[i] ?? null, sum: sumParts[i] ?? null,
                        byFact: false, merged: true,
                    });
                });
                continue;
            }
        }

        const q = qtyRaw.match(/(\d+(?:[.,]\d+)?)\s*(шт|м2|мм|м)(?![\p{L}\d])/iu);
        items.push({
            category: cat.key, label: cat.label, name, model,
            quantity: q ? toNum(q[1]) : (/набір|комплект/i.test(qtyRaw) ? 1 : null),
            unit: q ? (/шт/i.test(q[2]) ? 'шт' : 'м') : (/набір|комплект/i.test(qtyRaw) ? 'набір' : null),
            price: priceParts[0] ?? null,
            sum: byFact ? null : (sumParts[sumParts.length - 1] ?? null),
            byFact, merged: false,
        });
    }

    /* --- Поля з тексту поза таблицею --- */
    const plain = text.replace(/\|/g, ' ');

    const mCap = plain.match(/панел[\p{L}]*\s*([\d]+\s*[,.]?\s*\d*)\s*кВт/iu);
    head.capacityKw = mCap ? toNum(mCap[1].replace(/\s/g, '')) : null;

    const mInv = plain.match(/інвертор[\p{L}]*\s*(?:гібридний\s*)?([\d]+[,.]?\d*)\s*кВт/iu)
        || plain.match(/(?:гібридний\s*)?інвертор\s*([\d]+[,.]?\d*)\s*кВт/iu);
    head.inverterKw = mInv ? toNum(mInv[1]) : null;

    const mBat = plain.match(/АКБ\s*([\d]+[,.]?\d*)\s*кВт/iu);
    head.batteryKwh = mBat ? toNum(mBat[1]) : null;

    // «Гібридна СЕС на дах», «СЕС гібридна», «ВАРТІСТЬ ГІБРИДНОЇ СЕС» —
    // закінчення різні, тому корінь + [\p{L}]*
    const mType = plain.match(/(гібридн|мережев|автономн)[\p{L}]*\s*СЕС[^\n|#]{0,24}/iu)
        || plain.match(/СЕС\s*(гібридн|мережев|автономн)[\p{L}]*/iu);
    head.stationType = mType ? norm(mType[0]) : null;

    head.mount = /на\s*землю|наземн/iu.test(plain) ? 'земля'
        : /на\s*дах|дахов|скатн/iu.test(plain) ? 'дах' : null;

    head.payment = /безготівков/iu.test(plain) ? 'безготівковий'
        : /готівков/iu.test(plain) ? 'готівковий' : null;

    /* Підсумок не завжди рядок таблиці. У новому шаблоні він стоїть текстом:
       «Орієнтовна вартість системи \n 4 160 $». Тому, якщо в таблиці не
       знайшли, шукаємо в тексті — спершу біля ключових слів, потім
       просто найбільше число з валютою. */
    if (total == null) {
        const near = plain.match(
            /(?:орієнтовна\s+вартість|вартість\s+системи|загальна\s+вартість|усього|всього|разом|сума)[^\d]{0,40}(\d[\d\s  ]*(?:[.,]\d+)?)\s*(?:\$|USD|грн|UAH)?/iu
        );
        // Поріг обов'язковий: слово «Сума» стоїть і в шапці таблиці, а за
        // ним іде роздільник |---| і номер першого рядка. Без перевірки
        // сумою угоди ставало «1», і саме воно поїхало б у картку проєкту.
        const v = near ? toNum(near[1]) : null;
        if (v != null && v > MIN_PLAUSIBLE_TOTAL) total = v;
    }
    if (total == null) {
        const withCurrency = [...plain.matchAll(/(\d[\d\s  ]*(?:[.,]\d+)?)\s*(?:\$|USD|грн|UAH)/giu)]
            .map(m => toNum(m[1])).filter(n => n && n > MIN_PLAUSIBLE_TOTAL);
        if (withCurrency.length) total = Math.max(...withCurrency);
    }

    head.total = total;
    head.currency = /\$|USD/.test(plain) ? 'USD' : (/грн|UAH/iu.test(plain) ? 'UAH' : null);

    /* --- Ключове обладнання: те, що потім бронюється на складі --- */
    const pick = (key) => items.find(i => i.category === key) || null;
    head.equipment = {
        panel: pick('panel'),
        inverter: pick('inverter'),
        battery: pick('battery'),
    };

    // Ціна за кВт — головний показник для порівняння пропозицій між собою
    head.pricePerKw = (total && head.capacityKw)
        ? Math.round((total / head.capacityKw) * 10) / 10 : null;

    /* --- Звірка --- */
    const itemsSum = items.reduce((s, i) => s + (i.sum || 0), 0);
    const check = {
        itemsSum,
        total,
        diff: total != null ? Math.round((total - itemsSum) * 100) / 100 : null,
        ok: total != null && Math.abs(total - itemsSum) < 1,
    };

    return { head, items, check };
}
