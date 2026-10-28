// =====================================================================
//  K-CORE · Обʼєднання, архів і відновлення позицій номенклатури
//
//  Уся логіка — у базі (db/2026-09_stock_rules_and_alerts.sql, блок D):
//  лише там можна атомарно переписати рухи, резерви й специфікації.
//  Тут — виклик і відмови людською мовою.
// =====================================================================

import { supabase } from '../supabaseClient';
import { num } from '../ui';

export const MERGE_REFUSAL = {
    same: 'Не можна обʼєднати позицію саму з собою.',
    not_found: 'Позицію не знайдено — можливо, її вже обʼєднали. Оновіть сторінку.',
    target_archived: 'Позиція, яка має лишитись, в архіві. Спершу відновіть її.',
    already_merged: 'Цю позицію вже обʼєднано з іншою.',
    type_mismatch: 'Товар не можна обʼєднати з інструментом чи послугою.',
    unit_mismatch: 'Різні одиниці виміру — кількості не можна просто скласти. Вирівняйте одиницю в одній із позицій.',
    tracking_mismatch: 'Одна позиція ведеться по носіях (бухтах), інша — звичайною кількістю. Спершу вирівняйте спосіб обліку.',
    not_authenticated: 'Сесія завершилась — перезайдіть у систему.',
};

/** Чому ці дві позиції не можна обʼєднати. null — можна. */
export const mergeBlocker = (source, target) => {
    if (!source || !target) return null;
    if (source.type !== target.type) return MERGE_REFUSAL.type_mismatch;
    if (String(source.unit_id ?? '') !== String(target.unit_id ?? '')) return MERGE_REFUSAL.unit_mismatch;
    if ((source.tracking_mode || 'bulk') !== (target.tracking_mode || 'bulk')) return MERGE_REFUSAL.tracking_mismatch;
    return null;
};

/** Влити source у target. Кидає Error із поясненням, якщо база відмовила. */
export async function mergeNomenclature(sourceId, targetId, employeeId) {
    const { data, error } = await supabase.rpc('merge_nomenclature', {
        p_source: sourceId,
        p_target: targetId,
        p_emp: employeeId ?? null,
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(MERGE_REFUSAL[data?.reason] || 'Не вдалося обʼєднати позиції');
    return data;
}

/**
 * Прибрати позицію: без історії — видалити, з історією — в архів.
 * @returns {Promise<'deleted'|'archived'>}
 */
export async function retireNomenclature(item, employeeId, reason = null) {
    const { data, error } = await supabase.rpc('nomenclature_retire', {
        p_id: item.id,
        p_emp: employeeId ?? null,
        p_reason: reason,
    });
    if (error) throw error;
    if (data?.ok) return data.result;

    const unit = item.unit?.name || 'шт';
    switch (data?.reason) {
        case 'has_stock':
            throw new Error(
                `На складах ще ${num(data.on_hand)} ${unit}` +
                (Number(data.reserved) > 0 ? `, у резерві ${num(data.reserved)}` : '') +
                '. Спершу спишіть або перемістіть залишок — або обʼєднайте позицію з правильною, тоді залишок перейде туди.'
            );
        case 'in_need':
            throw new Error(
                `Позиція потрібна діючим обʼєктам (${num(data.need)} ${unit}). ` +
                'Замініть її в специфікаціях або обʼєднайте з правильною позицією.'
            );
        case 'not_found':
            throw new Error('Позицію не знайдено — оновіть сторінку.');
        case 'not_authenticated':
            throw new Error(MERGE_REFUSAL.not_authenticated);
        default:
            throw new Error('Не вдалося прибрати позицію');
    }
}

/** Повернути позицію з архіву. Якщо за цей час завели двійника — база відмовить. */
export async function restoreNomenclature(id, employeeId) {
    const { data, error } = await supabase.from('nomenclature')
        .update({
            is_active: true,
            archived_at: null,
            archived_by: null,
            archive_reason: null,
            merged_into_id: null,
            updated_by: employeeId ?? null,
        })
        .eq('id', id)
        .select('*, unit:units(name)')
        .single();
    if (error) throw error;
    return data;
}
