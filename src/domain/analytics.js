// =====================================================================
//  K-CORE · Аналітика в розрізах
//
//  Кожен об'єкт перетворюється на один «запис» з усім, що потрібно
//  аналітиці: до якої групи він належить у кожному розрізі
//  (відповідальний, область, тип станції…), чи створений / запущений /
//  втрачений у вибраному періоді, виручка, собівартість, прибуток, борг.
//  Далі будь-яку вибірку записів можна порахувати однією функцією stats —
//  тому аналітика однакова на кожному рівні: усі об'єкти → один
//  відповідальний → його об'єкти в одній області → окремий об'єкт.
// =====================================================================

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const NONE = '—';

/* Область: «Хмельницька », «Хмельницька обл», «хмельницька область» → «Хмельницька» */
const oblastKey = (v) => {
    const s = clean(v).replace(/\s*(обл\.?|область)$/i, '').trim();
    return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : NONE;
};

const STATION_ALIASES = { 'гібрид': 'Гібридна', 'гібридна': 'Гібридна', 'мережева': 'Мережева', 'автономна': 'Автономна', 'мережева + гібрид': 'Мережева + гібрид' };
const stationKey = (v) => {
    const s = clean(v);
    return s ? STATION_ALIASES[s.toLowerCase()] || s : NONE;
};

const POWER_BUCKETS = [
    { key: 'p0', label: 'до 10 кВт', max: 10 },
    { key: 'p10', label: '10–20 кВт', max: 20 },
    { key: 'p20', label: '20–30 кВт', max: 30 },
    { key: 'p30', label: '30–50 кВт', max: 50 },
    { key: 'p50', label: '50–100 кВт', max: 100 },
    { key: 'p100', label: 'понад 100 кВт', max: Infinity },
];
const powerKey = (v) => {
    const n = Number(v);
    if (!n) return NONE;
    return POWER_BUCKETS.find(b => n < b.max).key;
};

/* Розрізи. key — що пишеться в адресі; group(o) — ключ групи; label(key, ctx) — назва групи */
export const DIMENSIONS = [
    {
        key: 'manager', label: 'Відповідальні', one: 'Відповідальний',
        group: (o) => (o.responsible_emp_id != null ? String(o.responsible_emp_id) : NONE),
        name: (k, ctx) => (k === NONE ? 'Не призначено' : ctx.empName(k) || `#${k}`),
    },
    {
        key: 'oblast', label: 'Області', one: 'Область',
        group: (o) => oblastKey(o.client?.oblast),
        name: (k) => (k === NONE ? 'Не вказано' : k),
    },
    {
        key: 'station', label: 'Тип станції', one: 'Тип станції',
        group: (o) => stationKey(o.station_type),
        name: (k) => (k === NONE ? 'Не вказано' : k),
    },
    {
        key: 'power', label: 'Потужність', one: 'Потужність',
        group: (o) => powerKey(o.capacity_kw),
        name: (k) => (k === NONE ? 'Не вказано' : POWER_BUCKETS.find(b => b.key === k)?.label || k),
        order: (k) => (k === NONE ? 99 : POWER_BUCKETS.findIndex(b => b.key === k)),
    },
    {
        key: 'mount', label: 'Кріплення', one: 'Кріплення',
        group: (o) => clean(o.mount_type) || NONE,
        name: (k) => (k === NONE ? 'Не вказано' : k),
    },
    {
        key: 'company', label: 'Компанія', one: 'Компанія',
        group: (o) => clean(o.working_company) || NONE,
        name: (k) => (k === NONE ? 'Не вказано' : k),
    },
    {
        key: 'bank', label: 'Банк', one: 'Банк',
        group: (o) => (o.bank === 'Так' ? clean(o.bank_name) || 'bank?' : o.bank === 'Ні' ? 'none' : NONE),
        name: (k) => (k === NONE ? 'Не вказано' : k === 'none' ? 'Без банку' : k === 'bank?' ? 'Через банк (який — не вказано)' : k),
    },
];

export const getDimension = (key) => DIMENSIONS.find(d => d.key === key) || null;

const isLost = (o) => o.status === 'lost' || o.status === 'cancelled';

/**
 * Записи для аналітики.
 * objects   — installations з client(oblast, …)
 * launches  — Map(id → дата запуску)
 * profit    — Map(id → рядок v_object_profit)
 * debts     — Map(id → рядок v_receivables)
 * inPeriod  — (date) => bool
 */
export const buildRecords = ({ objects, launches, profit, debts, usdRate, inPeriod }) => objects.map(o => {
    const p = profit.get(o.custom_id);
    const launchedAt = launches.get(o.custom_id) || null;
    const lost = isLost(o);
    const revenue = Number(p?.revenue_uah) || 0;
    const cost = Number(p?.cost_uah) || 0;
    // Повна собівартість: є матеріали, і в усіх є ціна закупівлі, а в людей — ставка.
    // Інакше прибуток вийде завищеним, тож такі об'єкти в прибуток не йдуть.
    const complete = !!p && revenue > 0 && cost > 0 && Number(p.materials_items) > 0
        && !Number(p.materials_missing) && !Number(p.labour_missing);
    const missing = !p ? [] : [
        !Number(p.materials_items) && 'немає списаних матеріалів',
        Number(p.materials_missing) > 0 && `без ціни закупівлі: ${p.materials_missing} поз.`,
        Number(p.labour_missing) > 0 && 'немає ставки монтажника',
    ].filter(Boolean);
    const d = debts.get(o.custom_id);
    const debtUah = d ? (d.currency === 'UAH' ? Number(d.debt) : Number(d.debt) * usdRate) || 0 : 0;
    return {
        id: o.custom_id,
        o,
        groups: Object.fromEntries(DIMENSIONS.map(dim => [dim.key, dim.group(o)])),
        createdIn: inPeriod(o.created_at),
        launchedAt,
        launchedIn: !lost && !!launchedAt && inPeriod(launchedAt),
        lost,
        lostIn: lost && (o.lost_at ? inPeriod(o.lost_at) : inPeriod(o.created_at)),
        kw: Number(o.capacity_kw) || 0,
        revenue,
        cost,
        profit: complete ? revenue - cost : null,
        margin: complete && revenue > 0 ? ((revenue - cost) / revenue) * 100 : null,
        complete,
        missing,
        debt: debtUah,
        overdueDays: d && Number(d.overdue_amount) > 0 ? Number(d.days_overdue) || 0 : 0,
    };
});

/** Чи об'єкт стосується періоду: створений, запущений або втрачений у ньому */
export const touchedInPeriod = (r) => r.createdIn || r.launchedIn || r.lostIn;

/** Підсумки по вибірці. Гроші — у гривнях (як у базі), показ переводить у $ за потреби */
export const stats = (recs) => {
    let created = 0, launched = 0, launchedKw = 0, lost = 0, revenue = 0, profit = 0, completeN = 0, completeRevenue = 0, debt = 0, debtN = 0;
    recs.forEach(r => {
        if (r.createdIn) created += 1;
        if (r.lostIn) lost += 1;
        if (r.launchedIn) {
            launched += 1;
            launchedKw += r.kw;
            revenue += r.revenue;
            if (r.complete) { profit += r.profit; completeN += 1; completeRevenue += r.revenue; }
        }
        if (r.debt > 0.5) { debt += r.debt; debtN += 1; }
    });
    return {
        created, launched, launchedKw, lost, revenue, profit, completeN, debt, debtN,
        margin: completeRevenue > 0 ? (profit / completeRevenue) * 100 : null,
        // Скільки угод доходять до запуску серед тих, що вже вирішились
        winRate: launched + lost > 0 ? (launched / (launched + lost)) * 100 : null,
    };
};

/** Групи розрізу з підсумками, найбільші за виручкою — вгорі */
export const groupBy = (recs, dim, ctx) => {
    const map = new Map();
    recs.forEach(r => {
        const k = r.groups[dim.key];
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
    });
    return [...map.entries()]
        .map(([key, list]) => ({ key, name: dim.name(key, ctx), recs: list, s: stats(list) }))
        .filter(g => g.s.created || g.s.launched || g.s.lost || g.s.debt > 0.5);
};

/** Відбір за фільтрами з адреси: [{ dim, key }] */
export const applyFilters = (recs, filters) => recs.filter(r => filters.every(f => r.groups[f.dim] === f.key));
