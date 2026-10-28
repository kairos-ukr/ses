// =====================================================================
//  K-CORE · Нагадування забезпечення
//
//  Об'єкт сам каже, що з ним треба зробити, замість того щоб хтось
//  про це памʼятав. Поки що один сюжет — електрозахист:
//    protection_spec   — захист продано, а специфікації ще немає;
//    protection_supply — специфікацію затверджено, а матеріалу бракує.
//
//  Нагадування лише нагадують: заявок у закупівлю вони не створюють.
//  У кожного є відповідальний — саме йому писатиме Telegram-бот.
//
//  Правила живуть у базі (db/2026-09_stock_rules_and_alerts.sql,
//  db/2026-09_supply_alerts_bot_ready.sql). Тут — читання, підписи
//  й дії людини над нагадуванням.
// =====================================================================

import { supabase } from '../supabaseClient';

export const ALERT_KIND = {
    protection_spec: {
        title: 'Скласти специфікацію електрозахисту',
        action: 'Скласти',
    },
    protection_supply: {
        title: 'Забезпечити електрозахист',
        action: 'Відкрити',
    },
};

/** Що саме сталося — одним рядком під заголовком */
export const alertText = (a) => {
    const d = a.details || {};
    if (a.kind === 'protection_spec') {
        return d.from_offer
            ? 'У КП є електричний захист, а що саме купувати — ще не розписано'
            : 'Етап «Комплектація ел. захисту» в роботі, специфікації ще немає';
    }
    if (a.kind === 'protection_supply') {
        const parts = [`бракує ${d.missing ?? '?'} з ${d.positions ?? '?'} позицій`];
        if (d.reservable > 0) parts.push(`${d.reservable} є на складі — зарезервуйте`);
        return parts.join(' · ');
    }
    return '';
};

/** Термін: «прострочено 12.09» / «сьогодні» / «до 20.09» */
export const dueInfo = (dueDate) => {
    if (!dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${dueDate}T00:00:00`);
    const days = Math.round((due - today) / 86400000);
    const date = due.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
    if (days < 0) return { tone: 'danger', label: `прострочено ${date}` };
    if (days === 0) return { tone: 'warn', label: 'сьогодні' };
    if (days <= 3) return { tone: 'warn', label: `до ${date}` };
    return { tone: 'neutral', label: `до ${date}` };
};

const localDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Перерахувати й прочитати відкриті нагадування.
 * Помилку не піднімає: до міграції нагадувань просто немає.
 */
export async function loadSupplyAlerts({ refresh = true } = {}) {
    try {
        if (refresh) await supabase.rpc('refresh_supply_alerts', { p_create_requests: false });
        const { data, error } = await supabase.from('v_supply_alerts')
            .select('*')
            .order('due_date', { ascending: true, nullsFirst: false });
        return error ? [] : (data || []);
    } catch {
        return [];
    }
}

/** Працівники, яким можна доручити нагадування */
export async function loadAssignees() {
    const { data, error } = await supabase.from('employees')
        .select('*')
        .eq('hidden_from_list', false)
        .order('name');
    return error ? [] : (data || []);
}

/**
 * Доручити нагадування людині. Ручне призначення перерахунок більше не
 * перебиває; порожнє значення повертає автоматичний вибір.
 */
export async function assignAlert(id, employeeId) {
    const { error } = await supabase.from('supply_alerts')
        .update({
            assigned_to: employeeId || null,
            assigned_manually: !!employeeId,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);
    if (error) throw error;
}

export async function snoozeAlert(id, days = 3) {
    const until = new Date();
    until.setDate(until.getDate() + days);
    const { error } = await supabase.from('supply_alerts')
        .update({ snoozed_until: localDate(until), updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw error;
}

/** «Не потрібно» — більше не відкриється саме. */
export async function dismissAlert(id, employeeId, note = null) {
    const now = new Date().toISOString();
    const { error } = await supabase.from('supply_alerts')
        .update({
            status: 'dismissed',
            resolved_at: now,
            resolved_by: employeeId ?? null,
            resolution_note: note,
            updated_at: now,
        })
        .eq('id', id);
    if (error) throw error;
}
