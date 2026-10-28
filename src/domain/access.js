// =====================================================================
//  K-CORE · Рівневі доступи
//
//  Кожна людина має шаблон доступу (Директор, Офіс, Менеджер продажів…),
//  а за потреби — особисті відхилення від нього по окремих розділах.
//  «Без обмежень» відкриває все.
//
//  По кожному розділу окремо: бачить / додає / змінює / видаляє, а де це
//  має сенс — «свої або всі» (свої — де людина відповідальна).
//
//  Шаблони живуть у базі (access_templates) і редагуються в «Доступах»;
//  тут — опис розділів і запасні шаблони на випадок, якщо таблиці ще
//  немає. Роль (Адміністратор / Офіс / Монтажник) лишається і вирішує,
//  куди людина потрапляє: монтажник — лише в «Монтаж».
//
//  Захист поки в самій програмі (меню, сторінки, кнопки); правила в
//  базі — окремим етапом.
// =====================================================================

export const ACTIONS = [
    { key: 'view', label: 'Бачить' },
    { key: 'add', label: 'Додає' },
    { key: 'edit', label: 'Змінює' },
    { key: 'delete', label: 'Видаляє' },
];

const ALL4 = ['view', 'add', 'edit', 'delete'];

/** acts — які дії мають сенс у розділі; scope — чи є вибір «свої / усі» */
export const SECTIONS = [
    { key: 'today', group: 'Головне', label: 'Сьогодні', acts: ['view'], hint: 'офісна головна: що потребує уваги, показники' },
    { key: 'tasks', group: 'Головне', label: 'Доручення команди', acts: ALL4, hint: 'свої задачі й етапи є в кожного; тут — бачити чужі, доручати, змінювати й видаляти' },

    { key: 'leads', group: 'Продажі', label: 'Ліди', acts: ALL4, scope: true },
    { key: 'clients', group: 'Продажі', label: 'Клієнти', acts: ALL4 },
    { key: 'offers', group: 'Продажі', label: 'Комерційні пропозиції', acts: ALL4, hint: 'КП в картці об\'єкта та її оцифрування' },

    { key: 'objects', group: "Об'єкти", label: "Об'єкти", acts: ALL4, scope: true, hint: 'картка, етапи, документи, звіти бригад; свої — де людина менеджер або бригадир' },
    { key: 'money', group: 'Гроші', label: "Гроші об'єктів", acts: ['view'], scope: true, hint: 'вартість, оплати й борг; свої — де людина відповідальний менеджер' },
    { key: 'payments', group: 'Гроші', label: 'Платежі й борги', acts: ALL4, hint: 'сторінка «Фінанси»' },
    { key: 'profit', group: 'Гроші', label: 'Собівартість і прибуток', acts: ['view', 'edit'], hint: 'прибуток об\'єктів і ціни закупівлі' },
    { key: 'analytics', group: 'Гроші', label: 'Аналітика', acts: ['view'] },

    { key: 'provisioning', group: 'Склад', label: "Забезпечення об'єктів", acts: ALL4 },
    { key: 'stock', group: 'Склад', label: 'Склад', acts: ALL4, hint: 'залишки, видача, рух товарів, інструмент' },
    { key: 'purchases', group: 'Склад', label: 'Закупівлі', acts: ALL4 },
    { key: 'price', group: 'Склад', label: 'Прайс обладнання', acts: ['view', 'edit'], hint: 'ціни продажу' },

    { key: 'team', group: 'Люди', label: 'Команда', acts: ALL4 },
    { key: 'schedule', group: 'Люди', label: 'Графік робіт', acts: ['view', 'edit'] },
    { key: 'fleet', group: 'Люди', label: 'Автопарк і пробіг', acts: ALL4 },
    { key: 'timeoff', group: 'Люди', label: 'Вихідні й відпустки', acts: ALL4, hint: 'свої вихідні кожен ставить сам' },

    { key: 'documents', group: 'Інше', label: 'Документи', acts: ALL4 },
    { key: 'partners', group: 'Інше', label: 'Партнерство', acts: ALL4 },

    { key: 'settings', group: 'Керування', label: 'Налаштування', acts: ['view', 'edit'], hint: 'норми етапів, курс долара, автоматика, категорії складу' },
    { key: 'access', group: 'Керування', label: 'Доступи', acts: ['view', 'edit'], hint: 'люди, шаблони, нові реєстрації, журнал змін' },
];

export const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

/* ---------------- Запасні шаблони (так само засіяні в базі) ---------------- */

const full = { view: true, add: true, edit: true, delete: true, all: true };
const v = { view: true, all: true };
const vae = { view: true, add: true, edit: true, all: true };
const ve = { view: true, edit: true, all: true };
const own = { view: true, all: false };
const fill = (map) => Object.fromEntries(Object.entries(map).map(([k, p]) => [k, { ...p }]));

const ADMIN_PERMS = fill({
    today: v, tasks: full, leads: full, clients: full, objects: full, money: own, payments: full,
    provisioning: full, stock: full, purchases: full, price: ve, team: full, schedule: ve, fleet: full,
    timeoff: full, documents: full, partners: full, settings: ve, access: ve,
});

export const BUILTIN_TEMPLATES = [
    { key: 'director', name: 'Директор', app: 'crm', perms: fill(Object.fromEntries(SECTIONS.map(s => [s.key, full]))) },
    { key: 'admin', name: 'Адміністратор', app: 'crm', perms: ADMIN_PERMS },
    {
        key: 'office', name: 'Офіс', app: 'crm', perms: fill({
            today: v, tasks: full, leads: full, clients: full, objects: full, money: own, payments: full,
            provisioning: full, stock: full, purchases: full, price: ve, team: full, schedule: ve, fleet: full,
            timeoff: full, documents: full, partners: full,
        }),
    },
    {
        key: 'sales', name: 'Менеджер продажів', app: 'crm', perms: fill({
            today: v, tasks: vae, leads: full, clients: full, offers: full, objects: vae, money: own,
            payments: { view: true, add: true }, provisioning: v, stock: v, price: v, team: v, schedule: v,
            timeoff: v, documents: vae, partners: v,
        }),
    },
    {
        key: 'designer', name: 'Проєктант', app: 'crm', perms: fill({
            today: v, tasks: vae, clients: v, offers: v, objects: { view: true, edit: true, all: true },
            provisioning: vae, stock: v, purchases: v, price: v, team: v, schedule: v, timeoff: v,
            documents: vae, partners: v,
        }),
    },
    {
        key: 'procurement', name: 'Закупівлі', app: 'crm', perms: fill({
            today: v, tasks: vae, clients: v, objects: v, provisioning: full, stock: full, purchases: full,
            price: v, team: v, schedule: v, fleet: v, timeoff: v, documents: vae, partners: v,
        }),
    },
    {
        key: 'accountant', name: 'Бухгалтер', app: 'crm', perms: fill({
            today: v, tasks: vae, clients: v, objects: v, money: v, payments: full, team: v, timeoff: v,
            documents: vae,
        }),
    },
    {
        key: 'marketing', name: 'Маркетинг', app: 'crm', perms: fill({
            today: v, tasks: vae, leads: full, clients: v, documents: v,
        }),
    },
    {
        key: 'storekeeper', name: 'Комірник', app: 'crm', perms: fill({
            tasks: vae, provisioning: v, stock: vae, purchases: vae, timeoff: v, documents: v,
        }),
    },
    { key: 'brigadier', name: 'Бригадир', app: 'montazh', perms: {} },
    { key: 'installer', name: 'Монтажник', app: 'montazh', perms: {} },
];

/** Шаблон за замовчуванням — за роллю, поки людині не вибрали інший */
export const defaultTemplateKey = (emp) => {
    if (!emp) return null;
    if (emp.role === 'super_admin') return 'admin';
    if (emp.role === 'installer') return Number(emp.tier) === 1 ? 'brigadier' : 'installer';
    return 'office';
};

/** Права розділу: тільки дозволені дії; без «Бачить» решта не діє */
const clean = (sec, p) => {
    if (!p || !p.view) return null;
    const out = { view: true, all: sec.scope ? !!p.all : true };
    sec.acts.forEach(a => { if (a !== 'view' && p[a]) out[a] = true; });
    return out;
};

/** Підсумкові права людини: шаблон + особисті відхилення, або все */
export function effectivePerms({ template, overrides, unrestricted }) {
    const out = {};
    SECTIONS.forEach(sec => {
        if (unrestricted) { out[sec.key] = { ...full }; return; }
        const raw = overrides && Object.prototype.hasOwnProperty.call(overrides, sec.key) ? overrides[sec.key] : template?.perms?.[sec.key];
        const p = clean(sec, raw);
        if (p) out[sec.key] = p;
    });
    return out;
}

/** can('objects', 'edit') — чи можна; all('money') — чи по всій компанії */
export const makeCan = (perms) => (section, action = 'view') => !!perms?.[section]?.view && !!perms[section][action];
export const makeAll = (perms) => (section) => !!perms?.[section]?.view && !!perms[section].all;

/** Чи відрізняється розділ людини від шаблону */
export const sameSection = (a, b, sec) => {
    const x = clean(sec, a) || {};
    const y = clean(sec, b) || {};
    return ['view', 'add', 'edit', 'delete', 'all'].every(k => !!x[k] === !!y[k]);
};

/** Перша сторінка, яку людина може відкрити в CRM */
export const FIRST_PAGE = [
    ['today', '/today'], ['objects', '/installations'], ['leads', '/leads'], ['clients', '/clients'],
    ['provisioning', '/provisioning'], ['stock', '/inventory'], ['payments', '/payments'],
    ['schedule', '/employees?tab=planning'], ['team', '/employees'], ['documents', '/documents'],
    ['partners', '/partners'], ['analytics', '/analytics'],
];
