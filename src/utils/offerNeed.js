// =====================================================================
//  K-CORE · Потреба об'єкта з комерційної пропозиції
//
//  Той самий файл КП, що дає ціну, дає й перелік обладнання. Тут він
//  перетворюється на потребу складу: назви з документа співставляються
//  з номенклатурою, а результат лягає чернеткою специфікації.
//
//  ЧОМУ НЕ ВЕСЬ РЯДОК КП МОЖНА ПЕРЕНЕСТИ. Перевірка на реальних даних
//  показала межу дуже чітко:
//    · «Гібридний інвертор Deye SUN-10K-SG05LP3» — це конкретний товар,
//      він знаходиться в довіднику;
//    · «Конструкція кріплення, скатний дах» — це десятки позицій
//      (профіль, притиски, метизи, траверси). Один рядок КП ніяк не
//      перетворюється на один рядок складу, і вдавати протилежне
//      означало б засмітити забезпечення вигаданими позиціями;
//    · «Роботи», «Логістика» — узагалі не товар.
//  Тому потребою стає лише обладнання, а решта чесно лишається в КП
//  як гроші й чекає на комплектацію.
//
//  ЯК ШУКАЄМО. Двома прийомами, які разом дали 9 збігів із 10 там, де
//  пошук «в лоб» давав менше половини:
//    1. Прибираємо з назви родові слова («сонячна панель», «гібридний
//       інвертор») — вони є в кожному рядку КП, немає в довіднику, і
//       лише розмивають схожість.
//    2. Шукаємо в межах категорії довідника: панель — серед панелей,
//       інвертор — серед інверторів. Десять кандидатів замість двохсот
//       тридцяти дають і точність, і повноту.
// =====================================================================

import { supabase } from '../supabaseClient';
import { findBestNomenclatureMatch } from './nameMatching';

/** Чим рядок КП є для складу. */
export const NEED_ROLE = {
    panel: 'equipment',
    inverter: 'equipment',
    battery: 'equipment',
    dc_cable: 'equipment',
    ac_cable: 'equipment',
    mounting: 'bundle',
    protection: 'bundle',
    grounding: 'bundle',
    work: 'service',
    logistics: 'service',
};

export const needRoleOf = (categoryKey) => NEED_ROLE[categoryKey] || 'bundle';

export const NEED_ROLE_LABEL = {
    equipment: 'Обладнання',
    bundle: 'Комплект',
    service: 'Послуга',
};

/**
 * Категорія КП → корінь категорії довідника, у межах якого шукати.
 * Назви взяті з наявного дерева категорій; якщо котроїсь не знайдеться,
 * пошук просто піде по всьому довіднику, а не впаде.
 */
const NOM_ROOTS = {
    panel: ['Сонячні панелі'],
    inverter: ['Інвертор'],
    battery: ['АКБ'],
    dc_cable: ['Кабель', 'Провід'],
    ac_cable: ['Кабель', 'Провід'],
};

/* Родові слова, які є в назві кожного рядка КП і яких немає в довіднику.
   Кирилицю не можна обмежувати через \b — він знає лише латиницю. */
const GENERIC_WORDS = /(?<![\p{L}])(сонячн[\p{L}]*|гібридн[\p{L}]*|мережев[\p{L}]*|автономн[\p{L}]*|панел[\p{L}]*|інвертор[\p{L}]*|акумулятор[\p{L}]*|акб|кабел[\p{L}]*|провід|комплект[\p{L}]*|станц[\p{L}]*)(?![\p{L}])/giu;

const stripGeneric = (s) => (s || '').replace(GENERIC_WORDS, ' ').replace(/\s+/g, ' ').trim();

/**
 * Довідник для співставлення: номенклатура з шляхом категорії,
 * дерево категорій і пам'ять раніше зроблених співставлень.
 */
export async function loadMatchingContext() {
    const [nomRes, catRes, memRes] = await Promise.all([
        supabase.from('nomenclature')
            .select('id, name, sku, brand, model, technical_characteristics, category_id')
            .eq('is_active', true),
        supabase.from('categories').select('id, name, parent_id'),
        supabase.from('supplier_mappings').select('supplier_item_name, nomenclature_id'),
    ]);

    const categories = catRes.data || [];
    const pathOf = (id) => {
        const parts = [];
        let cur = id;
        while (cur) {
            const at = cur;
            const c = categories.find(x => x.id === at);
            if (!c) break;
            parts.unshift(c.name);
            cur = c.parent_id;
        }
        return parts.join(' › ');
    };

    const nomenclatures = (nomRes.data || []).map(n => {
        const categoryPath = pathOf(n.category_id);
        return { ...n, categoryPath, fullName: categoryPath ? `${categoryPath} › ${n.name}` : n.name };
    });

    /** Усі нащадки категорії за назвою кореня. */
    const subtree = (rootName) => {
        const root = categories.find(c => c.name === rootName);
        if (!root) return [];
        const ids = [root.id];
        // Дерево неглибоке, тому просто добираємо нащадків, поки набір росте
        let before;
        do {
            before = ids.length;
            categories.forEach(c => {
                if (c.parent_id && ids.includes(c.parent_id) && !ids.includes(c.id)) ids.push(c.id);
            });
        } while (ids.length > before);
        return ids;
    };

    const pools = {};
    Object.entries(NOM_ROOTS).forEach(([key, roots]) => {
        const ids = roots.flatMap(subtree);
        pools[key] = ids.length ? nomenclatures.filter(n => ids.includes(n.category_id)) : null;
    });

    return { nomenclatures, categories, memory: memRes.data || [], pools };
}

/**
 * Підбирає номенклатуру для одного рядка КП.
 * @returns {{nomenclature_id: (number|null), match_source: (string|null)}}
 */
export function matchOfferItem(item, ctx) {
    if (needRoleOf(item.category_key) !== 'equipment') {
        return { nomenclature_id: null, match_source: null };
    }

    const pool = ctx.pools[item.category_key] || ctx.nomenclatures;
    const raw = (item.model || item.name || '').trim();
    if (!raw) return { nomenclature_id: null, match_source: null };

    // Спершу без родових слів — так збігів помітно більше. Якщо після
    // чистки лишився огризок, пробуємо початковий рядок.
    const cleaned = stripGeneric(raw);
    for (const candidate of [cleaned.length >= 3 ? cleaned : null, raw].filter(Boolean)) {
        const m = findBestNomenclatureMatch(candidate, pool, ctx.memory);
        if (m.id) return { nomenclature_id: m.id, match_source: m.source };
    }
    return { nomenclature_id: null, match_source: null };
}

/**
 * Розставляє ролі й співставлення по позиціях КП і збирає з них
 * чернетку потреби об'єкта.
 *
 * Не кидає винятків: збій співставлення не має валити оцифровку —
 * КП уже збережена, а потребу можна зібрати пізніше кнопкою.
 *
 * @param {number} offerId
 * @param {object} [ctx] — готовий довідник, щоб не тягнути його двічі
 * @returns {Promise<{ok: boolean, equipment: number, mapped: number,
 *                    bundles: number, items: number, error: string|null}>}
 */
export async function syncOfferNeed(offerId, ctx = null) {
    const empty = {
        ok: false, equipment: 0, mapped: 0, bundles: 0, items: 0,
        confirmed: false, blockedByComplectation: false, error: null,
    };
    try {
        const { data: items, error } = await supabase
            .from('commercial_offer_items')
            .select('id, category_key, name, model, quantity, need_role, nomenclature_id, match_source')
            .eq('offer_id', offerId)
            .order('sort_order');
        if (error) throw error;
        if (!items || !items.length) return { ...empty, ok: true };

        const context = ctx || await loadMatchingContext();

        let equipment = 0, mapped = 0, bundles = 0;

        for (const item of items) {
            const role = needRoleOf(item.category_key);
            if (role === 'equipment') equipment += 1;
            if (role === 'bundle') bundles += 1;

            // Прив'язку, поставлену людиною, не перебиваємо ніколи
            const keepManual = item.match_source === 'manual' && item.nomenclature_id;
            const match = keepManual
                ? { nomenclature_id: item.nomenclature_id, match_source: 'manual' }
                : matchOfferItem({ ...item, category_key: item.category_key }, context);

            if (role === 'equipment' && match.nomenclature_id) mapped += 1;

            const changed = item.need_role !== role
                || item.nomenclature_id !== match.nomenclature_id
                || item.match_source !== match.match_source;
            if (!changed) continue;

            await supabase.from('commercial_offer_items').update({
                need_role: role,
                nomenclature_id: match.nomenclature_id,
                match_source: match.match_source,
                updated_at: new Date().toISOString(),
            }).eq('id', item.id);
        }

        const { data: res, error: rpcErr } = await supabase.rpc('sync_offer_need', { p_offer_id: offerId });
        if (rpcErr) throw rpcErr;

        return {
            ok: !!res?.ok,
            equipment,
            mapped,
            bundles,
            items: res?.items || 0,
            // Потреба затверджується сама; false тут означає, що об'єкт
            // уже має комплектацію і КП більше не потрібна
            confirmed: !!res?.confirmed,
            blockedByComplectation: !!res?.blocked_by_complectation,
            error: res?.ok ? null : (res?.reason || null),
        };
    } catch (e) {
        return { ...empty, error: e.message };
    }
}

/** Затвердити потребу — з цієї миті вона працює в забезпеченні об'єктів. */
export async function confirmOfferNeed(offerId, employeeId = null) {
    const { data, error } = await supabase.rpc('confirm_offer_need', {
        p_offer_id: offerId,
        p_employee_id: employeeId,
    });
    if (error) return { ok: false, reason: error.message };
    return data || { ok: false, reason: 'unknown' };
}

/** Стан потреби по об'єкту (v_object_offer_need). */
export async function loadOfferNeedState(installationId) {
    const { data } = await supabase
        .from('v_object_offer_need')
        .select('*')
        .eq('installation_custom_id', installationId)
        .maybeSingle();
    return data || null;
}

export const NEED_STATUS_LABEL = {
    none: { label: 'Немає', tone: 'neutral' },
    draft: { label: 'Чернетка', tone: 'warn' },
    confirmed: { label: 'У забезпеченні', tone: 'ok' },
    superseded: { label: 'Замінена комплектацією', tone: 'neutral' },
};

export const CONFIRM_REFUSAL = {
    complectation_exists: 'Комплектацію об\'єкта вже затверджено — потреба з КП більше не потрібна.',
    no_draft: 'Чернетки потреби немає. Спершу зберіть її з позицій КП.',
    empty: 'У потребі немає жодної співставленої позиції.',
    offer_not_current: 'Це архівна версія КП. Потребу формує лише поточна.',
};
