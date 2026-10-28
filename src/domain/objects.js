// =====================================================================
//  K-CORE · Статус об'єкта, причини втрати, оплата і валюта
//
//  Один список для «Об'єктів», картки об'єкта, клієнта й партнерства.
//  Статус оплати й «оплачено» рахує база з внесених платежів
//  (db/2026-10_money_currency_payments.sql) — інтерфейс їх лише показує.
// =====================================================================

import {
    FaClock, FaTools, FaPause, FaCheckCircle, FaExclamationTriangle, FaHeartBroken,
} from 'react-icons/fa';

/* ---------------------------------------------------------------------
 *  СТАТУС ОБ'ЄКТА
 *  active — об'єкт у роботі (фільтр «Активні», «Мої етапи», забезпечення).
 * ------------------------------------------------------------------- */

export const OBJECT_STATUSES = [
    { key: 'planning', label: 'Планування', short: 'План', tone: 'info', icon: FaClock, active: true },
    { key: 'in_progress', label: 'Виконується', short: 'Робота', tone: 'accent', icon: FaTools, active: true },
    { key: 'on_hold', label: 'Призупинено', short: 'Пауза', tone: 'warn', icon: FaPause, active: true },
    { key: 'completed', label: 'Завершено', short: 'Фініш', tone: 'ok', icon: FaCheckCircle },
    { key: 'lost', label: 'Втрачено', short: 'Втрачено', tone: 'neutral', icon: FaHeartBroken, needsReason: true },
    { key: 'cancelled', label: 'Скасовано', short: 'Відміна', tone: 'danger', icon: FaExclamationTriangle },
];

export const ACTIVE_OBJECT_STATUSES = OBJECT_STATUSES.filter(s => s.active).map(s => s.key);

export const getObjectStatus = (key) =>
    OBJECT_STATUSES.find(s => s.key === key)
    || { key, label: key || 'Невідомо', short: key || '—', tone: 'neutral', icon: FaClock };

export const isObjectActive = (key) => ACTIVE_OBJECT_STATUSES.includes(key);

/* ---------------------------------------------------------------------
 *  ЧОМУ УГОДА НЕ ВІДБУЛАСЬ
 *  «Втрачено» — клієнт так і не став клієнтом (ціна, конкурент…).
 *  «Скасовано» — уже домовились, але роботу скасували.
 * ------------------------------------------------------------------- */

export const LOST_REASONS = [
    { key: 'price', label: 'Ціна' },
    { key: 'competitor', label: 'Обрав конкурента' },
    { key: 'postponed', label: 'Відклав' },
    { key: 'no_contact', label: 'Не на зв’язку' },
    { key: 'other', label: 'Інше' },
];

export const getLostReasonLabel = (key) => LOST_REASONS.find(r => r.key === key)?.label || key || '—';

/* ---------------------------------------------------------------------
 *  КОМПАНІЯ, ВІД ЯКОЇ ЙДЕ УГОДА
 *  key — як записано в базі; short — коротко для фільтрів і карток.
 *  Нова компанія додається ТІЛЬКИ тут — і одразу з'являється у формах,
 *  фільтрах «Об'єктів», «Клієнтів», «Партнерства» та в аналітиці.
 * ------------------------------------------------------------------- */

export const COMPANIES = [
    { key: 'Кайрос', short: 'Кайрос', tone: 'accent' },
    { key: 'Розумне збереження енергії', short: 'РЗЕ', tone: 'ok' },
    { key: 'Острог Енерго', short: 'Острог Енерго', tone: 'warn' },
    { key: 'Енергологіка', short: 'Енергологіка', tone: 'info' },
];

export const COMPANY_NAMES = COMPANIES.map(c => c.key);

export const getCompany = (key) => COMPANIES.find(c => c.key === key) || (key ? { key, short: key, tone: 'neutral' } : null);

/* ---------------------------------------------------------------------
 *  НА ЯКІ ОБ'ЄКТИ МОЖНА ВИДАВАТИ, ПРОДАВАТИ, ЗАМОВЛЯТИ
 *  У роботі — як завжди. Завершені — теж: клієнт часто згодом
 *  докуповує АКБ чи панелі, і раніше заради цього об'єкт доводилось
 *  «відкривати» і знову закривати. Тепер це довидача: статус об'єкта
 *  не змінюється. Скасовані й втрачені — ні.
 * ------------------------------------------------------------------- */

export const SUPPLY_TARGET_STATUSES = ['planning', 'in_progress', 'pending', 'on_hold', 'completed'];

/** Варіанти для вибору об'єкта: спершу в роботі, далі завершені з позначкою «довидача» */
export const supplyTargetOptions = (list) => (list || [])
    .slice()
    .sort((a, b) => (a.status === 'completed') - (b.status === 'completed'))
    .map(i => ({
        id: i.custom_id,
        label: `#${i.custom_id} ${i.name || ''}${i.status === 'completed' ? ' · завершено, довидача' : ''}`,
        completed: i.status === 'completed',
    }));

/* ---------------------------------------------------------------------
 *  ТИП СТАНЦІЇ — один список для форми угоди й картки об'єкта
 * ------------------------------------------------------------------- */

export const STATION_TYPES = ['Мережева', 'Автономна', 'Гібридна', 'Мережева + гібрид', 'Інвертор + АКБ'];

/* ---------------------------------------------------------------------
 *  ВІДПОВІДАЛЬНИЙ ЗА УГОДУ — менеджер: офіс або керівник, з доступом.
 *  Монтажників у виборі відповідального не показуємо.
 * ------------------------------------------------------------------- */

export const isManager = (e) => !!e && ['office', 'super_admin', 'admin'].includes(e.role) && !e.access_blocked_at;

/** Варіанти для вибору відповідального; поточного лишаємо, навіть якщо він не менеджер */
export const managerOptions = (employees, currentId) => (employees || [])
    .filter(e => isManager(e) || String(e.custom_id) === String(currentId ?? ''))
    .map(e => ({ id: e.custom_id, label: e.name }));

/** Варіанти для бригадира об'єкта: монтажники (бригадири першими) */
export const brigadierOptions = (employees, currentId) => (employees || [])
    .filter(e => (e.role === 'installer' && !e.access_blocked_at && !e.hidden_from_list) || String(e.custom_id) === String(currentId ?? ''))
    .sort((a, b) => (Number(a.tier) === 1 ? 0 : 1) - (Number(b.tier) === 1 ? 0 : 1) || String(a.name).localeCompare(String(b.name), 'uk'))
    .map(e => ({ id: e.custom_id, label: `${e.name}${Number(e.tier) === 1 ? ' · бригадир' : ''}` }));

/* ---------------------------------------------------------------------
 *  ХТО БАЧИТЬ ГРОШІ
 *  Доступи → розділ «Гроші об'єктів»: «усі» — гроші всієї компанії
 *  (auth.financeAll), «свої» — лише об'єкти, де людина відповідальний
 *  менеджер. Розділ закритий — сум не видно зовсім.
 * ------------------------------------------------------------------- */

/** «Свій» об'єкт — людина на ньому менеджер або бригадир (Доступи → «лише свої») */
export const isOwnObject = (obj, customId) => customId != null && obj != null
    && (Number(obj.responsible_emp_id) === Number(customId) || Number(obj.brigadier_emp_id) === Number(customId));

/** auth — з useAuth(); obj — об'єкт з responsible_emp_id */
export const canSeeMoney = (auth, obj) => {
    if (auth?.can && !auth.can('money')) return false;
    return !!auth?.financeAll
        || (obj?.responsible_emp_id != null && auth?.employee?.custom_id != null
            && Number(obj.responsible_emp_id) === Number(auth.employee.custom_id));
};

/* ---------------------------------------------------------------------
 *  БАНК (коли угода «через банк»). Підказки у полі — можна вписати й інший.
 * ------------------------------------------------------------------- */

export const BANKS = [
    'Ощадбанк', 'ПриватБанк', 'Укргазбанк', 'Райффайзен Банк', 'ПУМБ', 'Сенс Банк',
    'А-Банк', 'Глобус', 'Кредобанк', 'ОТП Банк', 'Банк Львів', 'Креді Агріколь',
];

/* ---------------------------------------------------------------------
 *  ОПЛАТА
 * ------------------------------------------------------------------- */

export const PAYMENT_STATUSES = {
    pending: { label: 'Очікує оплати', short: 'Очікує', tone: 'warn' },
    partial: { label: 'Часткова оплата', short: 'Частково', tone: 'info' },
    paid: { label: 'Оплачено', short: 'Сплачено', tone: 'ok' },
    overdue: { label: 'Прострочено', short: 'Борг', tone: 'danger' },
};

export const getPaymentStatus = (key) => PAYMENT_STATUSES[key] || { label: 'Невідомо', short: '—', tone: 'neutral' };

/* ---------------------------------------------------------------------
 *  ВАЛЮТА
 * ------------------------------------------------------------------- */

export const CURRENCIES = [
    { key: 'USD', label: 'Долари', symbol: '$' },
    { key: 'UAH', label: 'Гривні', symbol: '₴' },
];

export const DEFAULT_CURRENCY = 'USD';

export const currencySymbol = (code) => CURRENCIES.find(c => c.key === code)?.symbol || '$';

/** 12 345.5 → «$12 345.50»; дробову частину показуємо лише якщо вона є. */
export const formatMoney = (amount, currency = DEFAULT_CURRENCY) => {
    const n = Number(amount) || 0;
    const hasCents = Math.round(n * 100) % 100 !== 0;
    const text = n.toLocaleString('uk-UA', {
        minimumFractionDigits: hasCents ? 2 : 0,
        maximumFractionDigits: 2,
    });
    return `${currencySymbol(currency)}${text}`;
};

/**
 * Скільки платіж зараховується в валюті об'єкта.
 * rate — гривень за 1 долар. Та сама формула, що й у базі (payment_history_prepare).
 */
export const paymentInObjectCurrency = (amount, paymentCurrency, objectCurrency, rate) => {
    const a = Number(amount) || 0;
    if (!paymentCurrency || paymentCurrency === objectCurrency) return a;
    const r = Number(rate) || 0;
    if (r <= 0) return null;
    if (paymentCurrency === 'UAH' && objectCurrency === 'USD') return Math.round((a / r) * 100) / 100;
    if (paymentCurrency === 'USD' && objectCurrency === 'UAH') return Math.round(a * r * 100) / 100;
    return null;
};
