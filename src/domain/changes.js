// =====================================================================
//  K-CORE · Журнал змін: як показувати записи людською мовою
//  Записи пише база (db/2026-10_change_log.sql): changes = { поле: [було, стало] }.
// =====================================================================

import { getObjectStatus, getLostReasonLabel } from './objects';
import { getStageGroupLabel } from './stages';
import { getLeadStatus } from './leads';
import { ROLE_LABELS } from '../navigation';

export const TABLE_LABELS = {
    installations: 'Обʼєкти',
    payment_history: 'Платежі',
    payment_schedule: 'Графік платежів',
    clients: 'Клієнти',
    leads: 'Ліди',
    employees: 'Працівники',
    nomenclature: 'Ціни',
    stage_norms: 'Налаштування',
    app_settings: 'Налаштування',
    installer_reports: 'Звіти бригад',
};

// Звіт бригади: що зроблено й стан дня
const REPORT_STAGES = { inst_structure: 'Конструкція', inst_panels: 'Панелі', inst_cabling: 'Траса DC', inst_grounding: 'Заземлення', inst_inverter: 'Інвертор' };
const DAY_STATUS = { ok: 'усе гаразд', no_material: 'бракує матеріалу', weather: 'погода', client: 'питання з клієнтом', other: 'інше' };

const FIELDS = {
    installations: {
        name: 'назва', status: 'статус', workflow_stage: 'етап', responsible_emp_id: 'відповідальний',
        total_cost: 'вартість', currency: 'валюта', capacity_kw: 'потужність, кВт', station_type: 'тип станції',
        start_date: 'старт', end_date: 'фініш', lost_reason: 'причина втрати', client_id: 'клієнт', working_company: 'компанія',
        exchange_rate: 'курс угоди', no_cost: 'вартість не вноситься', activity_confirmed_at: 'робота йде',
    },
    payment_history: { amount: 'сума', currency: 'валюта', exchange_rate: 'курс', paid_at: 'дата', payment_method: 'спосіб' },
    payment_schedule: { title: 'назва', amount: 'сума', due_date: 'до дати' },
    clients: { name: 'імʼя', company_name: 'компанія', phone: 'телефон', populated_place: 'населений пункт', oblast: 'область' },
    leads: { status: 'стан', responsible_emp_id: 'хто веде', lost_reason: 'причина відмови', installation_custom_id: 'обʼєкт' },
    employees: {
        role: 'роль', tier: 'рівень', access_blocked_at: 'доступ', day_rate: 'ставка за день',
        user_id: 'акаунт входу', hidden_from_list: 'прихований у списку',
        password_link: 'пароль',   // пише supabase/functions/admin-password-link
    },
    nomenclature: { sale_price: 'ціна продажу', sale_currency: 'валюта продажу', cost_price: 'ціна закупівлі', cost_currency: 'валюта закупівлі' },
    stage_norms: { days: 'норма, днів' },
    app_settings: { value: 'значення' },
    installer_reports: {
        submitted_at: 'надіслано', work_date: 'за день', installation_custom_id: 'обʼєкт', crew: 'бригада',
        done_stages: 'зроблено', day_status: 'стан дня', comment: 'коментар', plan_tomorrow: 'план на завтра',
        need_tomorrow: 'потрібно на завтра', money_amount: 'гроші від клієнта', money_currency: 'валюта',
    },
};

const MONEY = ['total_cost', 'amount', 'sale_price', 'cost_price', 'day_rate', 'money_amount'];
const DATES = ['start_date', 'end_date', 'paid_at', 'due_date', 'work_date'];

const fmtNum = (v) => Number(v).toLocaleString('uk-UA', { maximumFractionDigits: 2 });

/** Значення поля людською мовою. ctx: { empName(customId), clientName(customId) } */
export const formatValue = (table, field, v, ctx = {}) => {
    if (v === null || v === undefined || v === '') return '—';
    if (field === 'status') return table === 'leads' ? getLeadStatus(v).label : getObjectStatus(v).label;
    if (field === 'workflow_stage') return getStageGroupLabel(v);
    if (field === 'responsible_emp_id') return ctx.empName?.(v) || `#${v}`;
    if (field === 'client_id') return ctx.clientName?.(v) || `#${v}`;
    if (field === 'lost_reason') return getLostReasonLabel(v);
    if (field === 'installation_custom_id') return `СЕС-${v}`;
    if (field === 'access_blocked_at') return 'заблоковано';
    if (field === 'user_id') return 'привʼязано';
    if (field === 'hidden_from_list' || field === 'no_cost') return v ? 'так' : 'ні';
    if (field === 'exchange_rate') return `${fmtNum(v)} грн/$`;
    if (field === 'role') return ROLE_LABELS[v] || v;
    if (field === 'submitted_at') return new Date(v).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (field === 'crew' && Array.isArray(v)) return v.map(c => ctx.empName?.(c) || `#${c}`).join(', ') || '—';
    if (field === 'done_stages' && typeof v === 'object') {
        return Object.entries(v).filter(([, s]) => s).map(([k, s]) => `${REPORT_STAGES[k] || k}${s === 'completed' ? ' ✓' : ' — в роботі'}`).join(', ') || '—';
    }
    if (field === 'day_status') return DAY_STATUS[v] || v;
    if (field === 'value' && typeof v === 'object') return v.rate != null ? String(v.rate) : v.time ? String(v.time) : JSON.stringify(v);
    if (MONEY.includes(field)) return fmtNum(v);
    if (DATES.includes(field)) return new Date(v).toLocaleDateString('uk-UA');
    return String(v);
};

/** Про що запис: «обʼєкт СЕС-3011», «курс долара», «Іван Петренко»… */
export const subjectOf = (e, ctx = {}) => {
    switch (e.table_name) {
        case 'installations': return `обʼєкт СЕС-${e.record_key}`;
        case 'payment_history': return `платіж по СЕС-${e.installation_custom_id}`;
        case 'payment_schedule': return `графік платежів СЕС-${e.installation_custom_id}`;
        case 'clients': return `клієнт ${ctx.clientName?.(e.record_key) || `#${e.record_key}`}`;
        case 'leads': return `лід #${e.record_key}`;
        case 'employees': return `працівник ${ctx.empName?.(e.record_key) || `#${e.record_key}`}`;
        case 'nomenclature': return `позиція ${ctx.nomName?.(e.record_key) || `#${e.record_key}`}`;
        case 'stage_norms': return `норма етапу «${getStageGroupLabel(e.record_key)}»`;
        case 'app_settings': return SETTING_LABELS[e.record_key] || e.record_key;
        case 'installer_reports': return `звіт бригади по СЕС-${e.installation_custom_id}`;
        default: return e.table_name;
    }
};

const VERB = { insert: 'додав', update: 'змінив', delete: 'видалив' };

const SETTING_LABELS = {
    usd_uah_rate: 'курс долара для прибутку',
    supply_automation: 'автоматику забезпечення',
    take_reminders: 'нагадування «Взяти з собою»',
    report_reminders: 'сповіщення про звіти бригад',
    telegram_bot: 'бота Telegram',
    day_switch: 'годину, з якої головний — завтрашній графік',
};

/**
 * { verb, subject, lines: ['вартість: 12 025 → 12 125', …] }
 * Для додавання показуємо лише нові значення, для видалення — старі.
 */
export const describeChange = (e, ctx = {}) => {
    const labels = FIELDS[e.table_name] || {};
    const lines = Object.entries(e.changes || {}).map(([field, pair]) => {
        const [from, to] = Array.isArray(pair) ? pair : [null, pair];
        const label = labels[field] || field;
        if (e.action === 'insert') return `${label}: ${formatValue(e.table_name, field, to, ctx)}`;
        if (e.action === 'delete') return `${label}: ${formatValue(e.table_name, field, from, ctx)}`;
        if (field === 'access_blocked_at') return to ? 'доступ заблоковано' : 'доступ відкрито';
        if (field === 'user_id') return to ? 'акаунт входу привʼязано' : 'акаунт входу відвʼязано';
        if (field === 'password_link') return 'створено посилання, щоб задати новий пароль';
        if (field === 'activity_confirmed_at') return 'позначено: робота йде';
        if (field === 'no_cost') return to ? 'вартість не вноситься (закрита угода чи підряд)' : 'вартість знову вноситься';
        return `${label}: ${formatValue(e.table_name, field, from, ctx)} → ${formatValue(e.table_name, field, to, ctx)}`;
    });
    return { verb: VERB[e.action] || e.action, subject: subjectOf(e, ctx), lines };
};
