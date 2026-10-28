// =====================================================================
//  Каталог обладнання = складська номенклатура.
//
//  Окремих довідників обладнання більше немає (міграція
//  db/2026-10_single_equipment_catalog.sql): інвертори, панелі, АКБ,
//  БМС і логери — це позиції номенклатури у відповідних гілках
//  категорій. Тут — завантаження цих позицій для «Прайсу обладнання»
//  та «Обладнання на об'єктах».
// =====================================================================

import { supabase } from '../supabaseClient';

/** Гілки категорій, які вважаємо обладнанням (за назвою кореня) */
export const EQUIPMENT_GROUPS = [
    { key: 'inverter', label: 'Інвертори', root: 'Інвертор' },
    { key: 'battery', label: 'АКБ', root: 'АКБ' },
    { key: 'solar_panel', label: 'Панелі', root: 'Сонячні панелі' },
    { key: 'bms', label: 'БМС', root: 'БМС' },
    { key: 'logger', label: 'Логери', root: 'Логери' },
];

/** «Deye» + «SUN-6K…» → «Deye SUN-6K…»; без повтору, якщо бренд уже в назві */
export const equipmentLabel = (n) => {
    const name = (n?.name || '').trim();
    const brand = (n?.brand || '').trim();
    if (!brand || name.toLowerCase().startsWith(brand.toLowerCase())) return name;
    return `${brand} ${name}`;
};

/** Категорії з коренем і шляхом: { [id]: { rootName, path } } */
const indexCategories = (cats) => {
    const byId = new Map(cats.map(c => [c.id, c]));
    const out = {};
    cats.forEach(c => {
        const path = [];
        let cur = c;
        let guard = 0;
        while (cur && guard++ < 20) {
            path.unshift(cur.name);
            cur = cur.parent_id ? byId.get(cur.parent_id) : null;
        }
        out[c.id] = { rootName: path[0], path: path.join(' › ') };
    });
    return out;
};

const powerOf = (n) => {
    const s = n.specifications || {};
    if (s.power_kw != null && s.power_kw !== '') return Number(s.power_kw);
    return null;
};

/**
 * Активні позиції номенклатури в гілках обладнання.
 * withStock — додати залишок на всіх складах (на руках і доступно).
 */
export const loadEquipmentCatalog = async ({ withStock = false } = {}) => {
    const [cats, noms, stock] = await Promise.all([
        supabase.from('categories').select('id, parent_id, name'),
        supabase.from('nomenclature').select('*').eq('is_active', true).is('merged_into_id', null).order('name'),
        withStock
            ? supabase.from('v_warehouse_stock_available').select('nomenclature_id, quantity_on_hand, quantity_available')
            : Promise.resolve({ data: [] }),
    ]);
    if (cats.error) throw cats.error;
    if (noms.error) throw noms.error;
    if (stock.error) throw stock.error;

    const catIndex = indexCategories(cats.data || []);
    const groupByRoot = Object.fromEntries(EQUIPMENT_GROUPS.map(g => [g.root, g.key]));

    const stockBy = {};
    (stock.data || []).forEach(r => {
        const s = stockBy[r.nomenclature_id] || (stockBy[r.nomenclature_id] = { onHand: 0, available: 0 });
        s.onHand += Number(r.quantity_on_hand) || 0;
        s.available += Number(r.quantity_available) || 0;
    });

    return (noms.data || [])
        .map(n => {
            const cat = catIndex[n.category_id];
            const kind = cat ? groupByRoot[cat.rootName] : null;
            if (!kind) return null;
            return {
                ...n,
                label: equipmentLabel(n),
                kind,
                categoryPath: cat.path,
                power_kw: powerOf(n),
                phases: n.specifications?.phases || null,
                stock: stockBy[n.id] || { onHand: 0, available: 0 },
            };
        })
        .filter(Boolean);
};
