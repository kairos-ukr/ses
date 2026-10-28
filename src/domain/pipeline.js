// =====================================================================
//  K-CORE · Рух об'єктів: скільки стоїть на етапі, чи є рух, дебіторка
//
//  Одні правила для воронки «Об'єкти», «Сьогодні» і картки об'єкта.
//  Дати беремо з перегляду v_object_activity (db/2026-10_object_activity_view.sql):
//   • stage_entered_at — коли об'єкт перейшов на поточний етап;
//   • last_activity_at — остання дія (етап, підетап, платіж, коментар, КП).
// =====================================================================

import { supabase } from '../supabaseClient';
import { fetchAll } from '../utils/fetchAll';
import { STAGE_GROUPS, normalizeGroupKey } from './stages';

/* Пороги: до 14 днів — нормально, 15–30 — варто глянути, понад 30 — горить */
export const STALE_DAYS = 14;
export const LONG_DAYS = 30;

const DAY = 86400000;

/** Скільки повних днів минуло від дати (null, якщо дати немає) */
export const daysSince = (ts) => {
    if (!ts) return null;
    const t = new Date(ts).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / DAY));
};

/** Колір «віку»: сірий / жовтий / червоний */
export const ageTone = (days) => {
    if (days == null) return 'neutral';
    if (days > LONG_DAYS) return 'danger';
    if (days > STALE_DAYS) return 'warn';
    return 'neutral';
};

/** «41 дн» */
export const daysLabel = (days) => (days == null ? '—' : `${days} дн`);

/* ---------------------------------------------------------------------
 *  НОРМА ДНІВ НА ЕТАП (db/2026-10_stage_norms.sql)
 *  Якщо норму задано — колір за нею: до 70% норми спокійно, далі
 *  жовтий, понад норму червоний. Без норми — загальні 14/30 днів.
 * ------------------------------------------------------------------- */

export const stageTone = (days, norm) => {
    if (days == null) return 'neutral';
    if (!norm) return ageTone(days);
    if (days > norm) return 'danger';
    if (days >= Math.ceil(norm * 0.7)) return 'warn';
    return 'neutral';
};

const timesWord = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'раз';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'рази';
    return 'разів';
};

/** «норма 7 дн, перевищено в 6 разів» / «норма 7 дн, перевищено на 3 дн» / «норма 7 дн» */
export const normText = (days, norm) => {
    if (!norm) return null;
    if (days == null || days <= norm) return `норма ${norm} дн`;
    const times = Math.floor(days / norm);
    return times >= 2
        ? `норма ${norm} дн, перевищено в ${times} ${timesWord(times)}`
        : `норма ${norm} дн, перевищено на ${days - norm} дн`;
};

/** Норми з бази: { stage_key: days }. Без таблиці — порожньо. */
export async function loadStageNorms() {
    try {
        const { data, error } = await supabase.from('stage_norms').select('stage_key, days');
        if (error) return {};
        return Object.fromEntries((data || []).map(r => [r.stage_key, r.days]));
    } catch {
        return {};
    }
}

export const median = (list) => {
    const a = list.filter(v => v != null).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

/** Порядковий номер макроетапу (для «далі ніж КП» тощо) */
export const stageIndex = (key) => STAGE_GROUPS.findIndex(g => g.key === normalizeGroupKey(key));

/* ---------------------------------------------------------------------
 *  ГРОШІ ОБ'ЄКТА
 * ------------------------------------------------------------------- */

export const costOf = (o) => Number(o?.total_cost) || 0;
export const paidOf = (o) => Number(o?.paid_amount) || 0;
export const debtOf = (o) => Math.max(0, costOf(o) - paidOf(o));

/**
 * Дебіторка — гроші, які клієнт уже винен, а не просто сума КП:
 * об'єкт не втрачений, є вартість і недоплата, і клієнт уже погодився
 * (почав платити, дійшли до обладнання або об'єкт завершено).
 */
export const isReceivable = (o) => {
    if (!o || o.status === 'lost' || o.status === 'cancelled') return false;
    if (costOf(o) <= 0 || debtOf(o) <= 0.009) return false;
    return o.status === 'completed' || paidOf(o) > 0 || stageIndex(o.workflow_stage) >= stageIndex('equipment');
};

/* ---------------------------------------------------------------------
 *  ЗАВАНТАЖЕННЯ
 * ------------------------------------------------------------------- */

/**
 * Дати руху по об'єктах: { [custom_id]: { stageDays, idleDays, stageEnteredAt, lastActivityAt } }.
 * Якщо перегляду ще немає в базі — порожньо (екрани просто не показують дні).
 */
export async function loadActivity() {
    try {
        const rows = await fetchAll(() => supabase
            .from('v_object_activity')
            .select('installation_custom_id, stage_entered_at, last_activity_at')
            .order('installation_custom_id'));
        const map = {};
        rows.forEach(r => {
            map[r.installation_custom_id] = {
                stageEnteredAt: r.stage_entered_at,
                lastActivityAt: r.last_activity_at,
                stageDays: daysSince(r.stage_entered_at),
                idleDays: daysSince(r.last_activity_at),
            };
        });
        return map;
    } catch {
        return {};
    }
}

/**
 * Забезпечення матеріалами, % по кожному об'єкту — той самий розрахунок,
 * що й у «Забезпеченні об'єктів»: середня частка покриття позицій
 * специфікації. null — специфікації немає.
 */
export async function loadReadiness(ids) {
    if (!ids.length) return {};
    const rows = [];
    for (let i = 0; i < ids.length; i += 150) {
        const chunk = ids.slice(i, i + 150);
        // eslint-disable-next-line no-await-in-loop
        rows.push(...await fetchAll(() => supabase
            .from('v_object_material_needs')
            .select('installation_custom_id, required_quantity, reserved_quantity, issued_quantity')
            .in('installation_custom_id', chunk)));
    }
    const byObj = new Map();
    rows.forEach(n => {
        if (!byObj.has(n.installation_custom_id)) byObj.set(n.installation_custom_id, []);
        byObj.get(n.installation_custom_id).push(n);
    });
    const map = {};
    ids.forEach(id => {
        const list = byObj.get(id) || [];
        if (!list.length) { map[id] = null; return; }
        let sum = 0;
        list.forEach(n => {
            const req = parseFloat(n.required_quantity) || 1;
            const got = (parseFloat(n.reserved_quantity) || 0) + (parseFloat(n.issued_quantity) || 0);
            sum += Math.min(100, (got / req) * 100);
        });
        map[id] = Math.round(sum / list.length);
    });
    return map;
}

/* ---------------------------------------------------------------------
 *  ДРІБНИЦІ ДЛЯ ВІДОБРАЖЕННЯ
 * ------------------------------------------------------------------- */

const STATION_SHORT = {
    'Мережева': 'Мережева',
    'Гібридна': 'Гібрид',
    'Автономна': 'Автономна',
    'Інвертор + АКБ': 'Інвертор + АКБ',
    'Мережева + гібрид': 'Мережева + гібрид',
};
export const stationShort = (type) => (type ? STATION_SHORT[type] || type : null);

export const initials = (name) => (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export const kw = (v) => {
    const n = Number(v);
    if (!n) return null;
    return `${n.toLocaleString('uk-UA', { maximumFractionDigits: 1 })} кВт`;
};
