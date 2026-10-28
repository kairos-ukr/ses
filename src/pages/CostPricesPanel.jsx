// =====================================================================
//  Склад → «Ціни закупівлі» (Доступи → «Собівартість і прибуток»)
//
//  Прибуток з об'єкта рахується як «видане зі складу × ціна закупівлі».
//  Ціна підтягується сама із замовлень постачальникам, але старі
//  позиції її не мають — тут їх видно одним списком і можна заповнити.
//  Зверху ті, що найчастіше йшли на об'єкти: вони найбільше впливають
//  на прибуток.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCoins } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, Segmented, SearchInput, Skeleton, EmptyState, useToast, humanError, num } from '../ui';
import { fetchAll } from '../utils/fetchAll';
import { InlinePrice } from '../ObjectProfitPanel';
import { useAuth } from '../AuthProvider';

export default function CostPricesPanel({ externalSearch = '' }) {
    const toast = useToast();
    // Доступи → «Собівартість і прибуток»: змінювати ціни закупівлі
    const canEditProfit = useAuth().can('profit', 'edit');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('missing');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [noms, used] = await Promise.all([
                fetchAll(() => supabase.from('nomenclature')
                    .select('id, name, brand, sku, cost_price, cost_currency, cost_price_updated_at, unit:units(name)')
                    .eq('is_active', true).order('id')),
                fetchAll(() => supabase.from('v_object_materials_cost').select('nomenclature_id, installation_custom_id, qty').order('nomenclature_id')),
            ]);
            const usage = new Map();
            used.forEach(u => {
                const cur = usage.get(u.nomenclature_id) || { objects: 0, qty: 0 };
                cur.objects += 1;
                cur.qty += Number(u.qty) || 0;
                usage.set(u.nomenclature_id, cur);
            });
            setItems(noms.map(n => ({ ...n, objects: usage.get(n.id)?.objects || 0, used_qty: usage.get(n.id)?.qty || 0 })));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const saveCost = async (id, price, currency) => {
        const patch = { cost_price: price, cost_currency: currency, cost_price_updated_at: new Date().toISOString() };
        const { error } = await supabase.from('nomenclature').update(patch).eq('id', id);
        if (error) { toast(humanError(error), 'error'); return false; }
        setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
        return true;
    };

    const q = (search || externalSearch).trim().toLowerCase();
    const counts = useMemo(() => ({
        missing: items.filter(i => i.cost_price == null && i.objects > 0).length,
        used: items.filter(i => i.objects > 0).length,
        all: items.length,
    }), [items]);

    const visible = useMemo(() => items
        .filter(i => (filter === 'missing' ? i.cost_price == null && i.objects > 0 : filter === 'used' ? i.objects > 0 : true))
        .filter(i => !q || `${i.brand || ''} ${i.name} ${i.sku || ''}`.toLowerCase().includes(q))
        .sort((a, b) => b.objects - a.objects || a.name.localeCompare(b.name, 'uk')), [items, filter, q]);

    return (
        <div className="p-3 sm:p-5 space-y-3 max-w-[1200px] w-full mx-auto">
            <div className={`${T.card} p-2.5 flex flex-col sm:flex-row gap-2 sm:items-center`}>
                <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'missing', label: `Без ціни · ${counts.missing}` },
                        { value: 'used', label: `Ідуть на об'єкти · ${counts.used}` },
                        { value: 'all', label: `Усі · ${counts.all}` },
                    ]}
                />
                <SearchInput value={search} onChange={setSearch} placeholder="Назва, бренд, SKU…" className="sm:ml-auto sm:w-72" />
            </div>

            <div className={`${T.card} overflow-hidden`}>
                {loading ? <Skeleton rows={8} /> : visible.length === 0 ? (
                    <EmptyState icon={FaCoins} title={filter === 'missing' ? 'Усі позиції, що йдуть на об\'єкти, мають ціну' : 'Нічого не знайдено'} />
                ) : (
                    <>
                    {/* Телефон і планшет: картки, ціна видна й редагується одразу */}
                    <ul className="lg:hidden divide-y divide-slate-100">
                        {visible.slice(0, 300).map(i => (
                            <li key={i.id} className={`px-3 py-3 ${i.cost_price == null && i.objects > 0 ? 'bg-amber-50/30' : ''}`}>
                                <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">
                                    {i.brand && !i.name.startsWith(i.brand) ? `${i.brand} ` : ''}{i.name}
                                </div>
                                <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
                                    <span className="text-[12px] text-slate-500 tabular-nums">
                                        {i.objects ? `${i.objects} об. · ${num(i.used_qty)} ${i.unit?.name || ''}` : 'на об\'єкти не видавали'}
                                        {i.sku ? ` · SKU ${i.sku}` : ''}
                                    </span>
                                    <InlinePrice readOnly={!canEditProfit} value={i.cost_price} currency={i.cost_currency} withCurrency
                                        onSave={(v, c) => saveCost(i.id, v, c)} placeholder="вказати ціну" />
                                </div>
                            </li>
                        ))}
                    </ul>
                    <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className={T.th}>Позиція</th>
                                    <th className={`${T.th} text-right`}>На об'єктах</th>
                                    <th className={`${T.th} text-right`}>Ціна закупівлі</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visible.slice(0, 300).map(i => (
                                    <tr key={i.id} className={i.cost_price == null && i.objects > 0 ? 'bg-amber-50/30' : ''}>
                                        <td className={T.td}>
                                            <div className="font-semibold text-slate-900">{i.brand && !i.name.startsWith(i.brand) ? `${i.brand} ` : ''}{i.name}</div>
                                            {i.sku && <div className="text-[11.5px] text-slate-400">SKU {i.sku}</div>}
                                        </td>
                                        <td className={`${T.td} text-right tabular-nums whitespace-nowrap text-slate-600`}>
                                            {i.objects ? `${i.objects} об. · ${num(i.used_qty)} ${i.unit?.name || ''}` : '—'}
                                        </td>
                                        <td className={`${T.td} text-right whitespace-nowrap`}>
                                            <InlinePrice readOnly={!canEditProfit} value={i.cost_price} currency={i.cost_currency} withCurrency
                                                onSave={(v, c) => saveCost(i.id, v, c)} placeholder="вказати" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {visible.length > 300 && (
                        <p className="px-4 py-3 text-[12.5px] text-slate-400 text-center">Показано 300 з {visible.length} — уточніть пошук</p>
                    )}
                    </>
                )}
            </div>
        </div>
    );
}
