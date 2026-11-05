// =====================================================================
//  K-CORE · «Взяти з собою» — що бригаді забрати на об'єкт
//
//  За затвердженими специфікаціями (обладнання з КП, комплектація
//  матеріалів, ел. захист) — що ще не видано на об'єкт. Рахує база
//  (v_object_take_list): скільки взяти, з якого складу, чого на складі
//  немає. Лише об'єкти в роботі на етапах від «Обладнання» до «Запуску».
//  Показують «Монтаж» (картка виїзду, «Матеріали»), Календар і склад
//  («На виїзди»); той самий список база дописує до сповіщення
//  «Графік на …», а бот нагадує зранку.
//  Після зміни версії специфікації сюди ж потрапляє «Повернути на склад»
//  (v_object_spec_leftovers): що вже на об'єкті, але більше не потрібне.
// =====================================================================

import { supabase } from '../supabaseClient';

// Ел. захист — першим: його найчастіше забувають
export const TAKE_KINDS = [
    { key: 'protection', title: 'Ел. захист', short: 'ел. захист' },
    { key: 'equipment', title: 'Обладнання', short: 'обладнання' },
    { key: 'materials', title: 'Матеріали', short: 'матеріали' },
];
const KIND_ORDER = Object.fromEntries(TAKE_KINDS.map((k, i) => [k.key, i]));

const num = (v) => Number(v) || 0;
export const takeQty = (v) => String(Math.round(num(v) * 100) / 100).replace('.', ',');

/**
 * Що взяти по кожному об'єкту.
 * Map(custom_id → [{ id, kind, name, unit, toTake, have, missing, where }])
 *   kind — protection / equipment / materials; 'return' — повернути на
 *          склад після зміни специфікації (toTake — скільки повернути);
 *   have — скільки є на складах (резерв під об'єкт + вільне);
 *   where — склад резерву, інакше склад, де вільного найбільше.
 */
export async function loadTakeLists(ids) {
    const list = [...new Set((ids || []).filter(Boolean).map(Number))];
    if (!list.length) return new Map();
    const [takeRes, backRes] = await Promise.all([
        supabase.from('v_object_take_list')
            .select('installation_custom_id, nomenclature_id, kind, name, unit, to_take, reserved, reserved_at, free, free_at, missing')
            .in('installation_custom_id', list),
        supabase.from('v_object_spec_leftovers')
            .select('installation_custom_id, nomenclature_id, name, unit, to_return')
            .in('installation_custom_id', list).eq('in_work', true).gt('to_return', 0),
    ]);
    const map = new Map();
    const push = (cid, row) => {
        if (!map.has(cid)) map.set(cid, []);
        map.get(cid).push(row);
    };
    // Якогось із представлень ще немає — просто без цієї частини
    (takeRes.error ? [] : takeRes.data || []).forEach(r => push(r.installation_custom_id, {
        id: r.nomenclature_id,
        kind: r.kind,
        name: r.name || '—',
        unit: r.unit || '',
        toTake: num(r.to_take),
        have: num(r.reserved) + num(r.free),
        missing: num(r.missing),
        where: r.reserved_at || (r.free_at ? r.free_at.split(',')[0].trim() : null),
    }));
    (backRes.error ? [] : backRes.data || []).forEach(r => push(r.installation_custom_id, {
        id: `back:${r.nomenclature_id}`,
        nomenclatureId: r.nomenclature_id,
        kind: 'return',
        name: r.name || '—',
        unit: r.unit || '',
        toTake: num(r.to_return),
        have: 0,
        missing: 0,
        where: null,
    }));
    map.forEach(rows => rows.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name, 'uk')));
    return map;
}

/** Для показу: що є на складі (взяти), чого немає і що повернути — кожне по групах */
export function splitTake(rows) {
    const all = rows || [];
    const back = all.filter(r => r.kind === 'return');
    const take = all.filter(r => r.kind !== 'return' && r.have > 0);
    const absent = all.filter(r => r.kind !== 'return' && r.have <= 0);
    const byKind = (list) => TAKE_KINDS.map(k => ({ ...k, rows: list.filter(r => r.kind === k.key) })).filter(g => g.rows.length);
    const warehouses = [...new Set(take.flatMap(r => (r.where || '').split(',').map(s => s.trim()).filter(Boolean)))];
    return { take, absent, back, takeGroups: byKind(take), absentGroups: byKind(absent), warehouses };
}

/** Коротко: «ел. захист 1 · матеріали 1 · немає на складі 9 · повернути 1» */
export function takeSummary(rows) {
    const { take, absent, back } = splitTake(rows);
    const parts = TAKE_KINDS
        .map(k => [k.short, take.filter(r => r.kind === k.key).length])
        .filter(([, c]) => c > 0)
        .map(([t, c]) => `${t} ${c}`);
    if (absent.length) parts.push(`немає на складі ${absent.length}`);
    if (back.length) parts.push(`повернути ${back.length}`);
    return parts.join(' · ');
}

export const takeLine = (r) => `${r.name} — ${takeQty(r.toTake)}${r.unit ? ` ${r.unit}` : ''}`;
