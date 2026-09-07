// =====================================================================
//  Обладнання: чого треба зараз по всіх об'єктах
//
//  Сторінка забезпечення дивиться від об'єкта: «чи можна виїжджати».
//  Цей зріз дивиться від позиції: «скільки панелей Longi нам треба
//  купити цього місяця і на які об'єкти вони підуть». Це різні
//  питання, і закупівлі потрібне саме друге.
//
//  ДВА ШАРИ ПОТРЕБИ, І ЇХ ВАЖЛИВО НЕ ЗМІШУВАТИ:
//    затверджено — з підтверджених специфікацій. Реальний борг складу
//                  перед об'єктом, під нього вже можна резервувати.
//    з КП        — обладнання з чинних комерційних пропозицій, які ще
//                  не довели до комплектації. Це ще не зобов'язання
//                  складу, але це вже продано клієнту, і закупівля має
//                  це бачити, а не дізнаватись за тиждень до монтажу.
//
//  Комплектів (конструкція, захист, заземлення) тут немає навмисно:
//  один рядок КП — це десятки позицій складу, замовити «конструкцію»
//  не можна. Вони з'являться, коли з'явиться комплектація.
// =====================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FaSearch, FaBoxes, FaChevronDown, FaFileInvoiceDollar, FaExclamationTriangle,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import {
    T, Chip, Card, Bar, EmptyState, Skeleton, useToast, humanError, num,
} from '../ui';

/* Основне обладнання — те, за чим стежать окремо і що має довгий строк
   постачання. Метизи й профіль теж потрібні, але їх дивляться від
   об'єкта, а не з цього екрана. Список — корені категорій довідника. */
const KEY_ROOTS = ['Інвертор', 'Сонячні панелі', 'АКБ', 'БМС'];

const FILTERS = [
    { value: 'key', label: 'Основне' },
    { value: 'deficit', label: 'Бракує' },
    { value: 'offer', label: 'З КП' },
    { value: 'all', label: 'Всі позиції' },
];

const MATCH_TONE = { memory: 'ok', exact: 'ok', manual: 'ok', fuzzy: 'warn' };

export default function EquipmentDemand({ onOpenObject }) {
    const toast = useToast();

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('key');
    const [openId, setOpenId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [instRes, needsRes, offerRes, offerStateRes, stockRes, nomRes, catRes] = await Promise.all([
                supabase.from('installations')
                    .select('custom_id, name, status')
                    .in('status', ['planning', 'in_progress', 'pending', 'on_hold']),
                supabase.from('v_object_material_needs').select('*'),
                supabase.from('v_object_offer_equipment').select('*'),
                supabase.from('v_object_offer_need').select('installation_custom_id, need_status'),
                supabase.from('v_warehouse_stock_available').select('nomenclature_id, quantity_available'),
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(code)'),
                supabase.from('categories').select('id, name, parent_id'),
            ]);
            if (instRes.error) throw instRes.error;

            const active = new Map((instRes.data || []).map(i => [i.custom_id, i]));

            // Які категорії вважаємо основним обладнанням
            const cats = catRes.data || [];
            const keyCats = new Set();
            KEY_ROOTS.forEach(rootName => {
                const root = cats.find(c => c.name === rootName);
                if (!root) return;
                keyCats.add(root.id);
                let before;
                do {
                    before = keyCats.size;
                    cats.forEach(c => { if (c.parent_id && keyCats.has(c.parent_id)) keyCats.add(c.id); });
                } while (keyCats.size > before);
            });

            const nomIndex = new Map((nomRes.data || []).map(n => [n.id, n]));

            // Скільки вільного лежить по всіх складах разом
            const available = new Map();
            (stockRes.data || []).forEach(s => {
                available.set(s.nomenclature_id,
                    (available.get(s.nomenclature_id) || 0) + (parseFloat(s.quantity_available) || 0));
            });

            // Статус потреби з КП по кожному об'єкту: якщо вона вже
            // затверджена або витіснена комплектацією, її позиції вже
            // враховані в v_object_material_needs — другий раз не рахуємо
            const offerState = new Map(
                (offerStateRes.data || []).map(r => [r.installation_custom_id, r.need_status]));

            const byNom = new Map();
            const ensure = (nomId, fallbackName, unit) => {
                if (!byNom.has(nomId)) {
                    const nom = nomIndex.get(nomId);
                    byNom.set(nomId, {
                        nomenclature_id: nomId,
                        // Назва з довідника надійніша за назву з документа
                        name: nom?.name || fallbackName || `#${nomId}`,
                        sku: nom?.sku || null,
                        unit: nom?.unit?.code || unit || '',
                        isKey: nom ? keyCats.has(nom.category_id) : false,
                        confirmed: 0,
                        planned: 0,
                        available: available.get(nomId) || 0,
                        objects: [],
                    });
                }
                return byNom.get(nomId);
            };

            // Шар 1 — затверджена потреба
            (needsRes.data || []).forEach(n => {
                const inst = active.get(n.installation_custom_id);
                if (!inst) return;
                const left = parseFloat(n.outstanding_need) || 0;
                if (left <= 0) return;
                const r = ensure(n.nomenclature_id, n.nomenclature_name, '');
                r.confirmed += left;
                r.objects.push({
                    custom_id: inst.custom_id, name: inst.name,
                    quantity: left, source: 'spec',
                });
            });

            // Шар 2 — обладнання з чинних КП, ще не заведене в комплектацію
            (offerRes.data || []).forEach(o => {
                const inst = active.get(o.installation_custom_id);
                if (!inst || !o.nomenclature_id) return;
                const st = offerState.get(o.installation_custom_id);
                if (st === 'confirmed' || st === 'superseded') return;

                const qty = parseFloat(o.quantity) || 0;
                if (qty <= 0) return;

                const r = ensure(o.nomenclature_id, o.nomenclature_name, o.unit_code || o.unit);
                r.planned += qty;
                r.objects.push({
                    custom_id: inst.custom_id, name: inst.name,
                    quantity: qty, source: 'offer',
                    offerName: o.offer_name, match: o.match_source,
                });
            });

            const list = [...byNom.values()].map(r => {
                const demand = r.confirmed + r.planned;
                return { ...r, demand, deficit: Math.max(0, demand - r.available) };
            });

            // Спершу те, чого бракує найбільше — саме воно тримає об'єкти
            list.sort((a, b) => b.deficit - a.deficit || b.demand - a.demand);
            setRows(list);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const matchFilter = (r, f) => {
        if (f === 'key') return r.isKey;
        if (f === 'deficit') return r.deficit > 0;
        if (f === 'offer') return r.planned > 0;
        return true;
    };

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return rows.filter(r => {
            if (!matchFilter(r, filter)) return false;
            if (!term) return true;
            return r.name.toLowerCase().includes(term) || (r.sku || '').toLowerCase().includes(term);
        });
    }, [rows, filter, search]);

    const totals = useMemo(() => {
        const c = {};
        FILTERS.forEach(f => { c[f.value] = rows.filter(r => matchFilter(r, f.value)).length; });
        return c;
    }, [rows]);

    return (
        <>
            <Card pad="p-2.5" className="space-y-2.5">
                <div className="relative">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                    <input className={`${T.input} pl-8`} value={search}
                        placeholder="Назва позиції або SKU…"
                        onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                    {FILTERS.map(f => (
                        <button key={f.value} onClick={() => setFilter(f.value)}
                            className={`px-2.5 h-8 rounded-lg text-[11.5px] font-bold whitespace-nowrap border transition-colors flex-shrink-0
                                ${filter === f.value
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                            {f.label}
                            <span className={`ml-1 tabular-nums ${filter === f.value ? 'opacity-70' : 'text-slate-400'}`}>
                                {totals[f.value] || 0}
                            </span>
                        </button>
                    ))}
                </div>
                <p className="text-[11.5px] text-slate-500 leading-snug">
                    «Основне» — інвертори, панелі, АКБ і БМС: те, за чим стежать окремо і що
                    довго їде. «З КП» — обладнання, вже продане клієнту, але ще не доведене до
                    комплектації. Метизи, профіль та інша дрібнота — у вкладці «Всі позиції».
                </p>
            </Card>

            <div className={`${T.card} overflow-hidden`}>
                {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
                    <EmptyState icon={FaBoxes} title="Позицій не знайдено"
                        hint="Змініть фільтр або пошуковий запит." />
                ) : (
                    <div className="divide-y divide-slate-100">
                        {filtered.map(r => {
                            const isOpen = openId === r.nomenclature_id;
                            const covered = Math.min(r.available, r.demand);
                            return (
                                <div key={r.nomenclature_id}>
                                    <button
                                        onClick={() => setOpenId(isOpen ? null : r.nomenclature_id)}
                                        className="w-full text-left px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100 transition-colors">
                                        <div className="flex items-start gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[13px] font-bold text-slate-900 leading-snug">
                                                    {r.name}
                                                </div>
                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                    {r.sku && <span className={T.mono}>{r.sku}</span>}
                                                    {r.confirmed > 0 && (
                                                        <Chip tone="accent">затверджено {num(r.confirmed)}</Chip>
                                                    )}
                                                    {r.planned > 0 && (
                                                        <Chip tone="warn" icon={FaFileInvoiceDollar}>
                                                            з КП {num(r.planned)}
                                                        </Chip>
                                                    )}
                                                    <Chip tone={r.deficit > 0 ? 'danger' : 'ok'}>
                                                        {r.deficit > 0 ? `бракує ${num(r.deficit)}` : 'вистачає'}
                                                    </Chip>
                                                    <span className="text-[11px] text-slate-400">
                                                        об'єктів {r.objects.length}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="text-right w-24 flex-shrink-0">
                                                <div className="text-[15px] font-black tabular-nums text-slate-900">
                                                    {num(r.demand)}
                                                    <span className="text-[9px] font-bold text-slate-400 ml-1">{r.unit}</span>
                                                </div>
                                                <div className="text-[10px] text-slate-400 tabular-nums">
                                                    вільно {num(r.available)}
                                                </div>
                                                <Bar className="mt-1" segments={[
                                                    { pct: r.demand ? (covered / r.demand) * 100 : 100, tone: 'ok' },
                                                    { pct: r.demand ? (r.deficit / r.demand) * 100 : 0, tone: 'danger' },
                                                ]} />
                                            </div>
                                            <FaChevronDown
                                                size={10}
                                                className={`text-slate-400 mt-1.5 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                        </div>
                                    </button>

                                    {isOpen && (
                                        <div className="px-3 pb-3 bg-slate-50/60">
                                            <div className={`${T.label} mb-1.5`}>На які об'єкти</div>
                                            <div className="flex flex-col gap-1">
                                                {r.objects
                                                    .slice()
                                                    .sort((a, b) => b.quantity - a.quantity)
                                                    .map((o, i) => (
                                                        <div key={`${o.custom_id}-${o.source}-${i}`}
                                                            className={`${T.cardFlat} px-2.5 py-2 flex items-start gap-2`}>
                                                            <div className="min-w-0 flex-1">
                                                                <button
                                                                    onClick={() => onOpenObject?.(o.custom_id)}
                                                                    className="text-[12.5px] font-bold text-indigo-600 hover:text-indigo-800 text-left">
                                                                    СЕС-{o.custom_id} · {o.name}
                                                                </button>
                                                                {o.source === 'offer' && (
                                                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                        <Chip tone="warn" icon={FaFileInvoiceDollar}>з КП</Chip>
                                                                        {o.match && o.match !== 'manual' && (
                                                                            <Chip tone={MATCH_TONE[o.match] || 'neutral'}>
                                                                                {o.match === 'fuzzy' ? 'за схожістю' : 'точний збіг'}
                                                                            </Chip>
                                                                        )}
                                                                        {o.offerName && (
                                                                            <span className="text-[11px] text-slate-500 truncate">
                                                                                {o.offerName}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="text-[13px] font-black tabular-nums text-slate-900 flex-shrink-0">
                                                                {num(o.quantity)}
                                                                <span className="text-[9px] font-bold text-slate-400 ml-1">{r.unit}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                            </div>

                                            {r.planned > 0 && (
                                                <div className="flex items-start gap-1.5 mt-2 text-[11px] text-amber-700">
                                                    <FaExclamationTriangle className="mt-0.5 flex-shrink-0" size={10} />
                                                    <span>
                                                        Позиції «з КП» у потребу ще не зайшли — зазвичай тому, що об'єкт
                                                        уже має затверджену комплектацію, або жодна позиція КП не впізналась
                                                        складом. Резервувати під них не можна; розібратись — у вкладці «КП»
                                                        картки об'єкта.
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
