// =====================================================================
//  Прайс обладнання.
//
//  Раніше це був окремий довідник (таблиця equipments) зі своїми
//  назвами й ручним статусом «в наявності». Тепер це вигляд на
//  складську номенклатуру: ті самі моделі, що на складі й в
//  обладнанні об'єктів, наявність — з реальних залишків, а тут
//  ведеться лише ціна продажу (nomenclature.sale_price).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaPlus, FaPen, FaCheck, FaTimes, FaBoxes } from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import {
    T, Btn, IconBtn, Chip, SearchInput, Segmented, EmptyState, Skeleton, Tip, useToast, humanError, num,
} from './ui';
import { NomenclatureModal } from './pages/NomenclatureModal';
import { EQUIPMENT_GROUPS, loadEquipmentCatalog } from './utils/equipmentCatalog';
import { CURRENCIES, formatMoney } from './domain/objects';

export default function EquipmentBase() {
    const toast = useToast();
    // Змінювати ціни продажу — Доступи → «Прайс обладнання»
    const isOffice = useAuth().can('price', 'edit');

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [group, setGroup] = useState('all');
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState(null);          // { id, price, currency }
    const [saving, setSaving] = useState(false);
    const [modal, setModal] = useState({ open: false, item: null });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setItems(await loadEquipmentCatalog({ withStock: true }));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const counts = useMemo(() => {
        const c = { all: items.length };
        items.forEach(i => { c[i.kind] = (c[i.kind] || 0) + 1; });
        return c;
    }, [items]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items
            .filter(i => group === 'all' || i.kind === group)
            .filter(i => !q || `${i.label} ${i.sku || ''} ${i.categoryPath}`.toLowerCase().includes(q));
    }, [items, group, search]);

    const startEdit = (i) => setEditing({ id: i.id, price: i.sale_price ?? '', currency: i.sale_currency || 'USD' });

    const savePrice = async () => {
        const raw = String(editing.price).trim();
        const price = raw === '' ? null : Number(raw);
        if (price != null && (!Number.isFinite(price) || price < 0)) {
            toast('Вкажіть ціну числом', 'error');
            return;
        }
        setSaving(true);
        const patch = { sale_price: price, sale_currency: editing.currency, sale_price_updated_at: new Date().toISOString() };
        const { error } = await supabase.from('nomenclature').update(patch).eq('id', editing.id);
        setSaving(false);
        if (error) { toast(humanError(error), 'error'); return; }
        setItems(prev => prev.map(i => i.id === editing.id ? { ...i, ...patch } : i));
        setEditing(null);
        toast('Ціну збережено');
    };

    // Залишок: вільно / усього на складах
    const stockCell = (i) => (i.stock.onHand > 0 ? (
        <span className="font-semibold text-slate-900 tabular-nums">
            {num(i.stock.available)}
            {i.stock.available !== i.stock.onHand && (
                <span className="font-normal text-slate-400"> / {num(i.stock.onHand)}</span>
            )}
        </span>
    ) : <Chip tone="neutral">немає</Chip>);

    // Ціна продажу: кнопка, а під час редагування — поле, валюта і «зберегти»
    const priceCell = (i, isEditing) => (isEditing ? (
        <div className="flex items-center justify-end gap-1.5">
            <input
                autoFocus type="number" min="0" step="0.01"
                className={`${T.input} h-9 w-28 text-right tabular-nums`}
                value={editing.price}
                onChange={e => setEditing(ed => ({ ...ed, price: e.target.value }))}
                onKeyDown={e => {
                    if (e.key === 'Enter') savePrice();
                    if (e.key === 'Escape') setEditing(null);
                }}
            />
            <select
                className={`${T.select} h-9 w-16 px-2`}
                value={editing.currency}
                onChange={e => setEditing(ed => ({ ...ed, currency: e.target.value }))}
            >
                {CURRENCIES.map(c => <option key={c.key} value={c.key}>{c.symbol}</option>)}
            </select>
            <IconBtn variant="ok" icon={FaCheck} label="Зберегти" onClick={savePrice} disabled={saving} />
            <IconBtn variant="ghost" icon={FaTimes} label="Скасувати" onClick={() => setEditing(null)} />
        </div>
    ) : (
        <button
            type="button"
            disabled={!isOffice}
            onClick={() => startEdit(i)}
            className={`text-[14px] font-bold tabular-nums ${i.sale_price != null ? 'text-emerald-700' : 'text-slate-400'} ${isOffice ? 'hover:underline' : 'cursor-default'}`}
        >
            {i.sale_price != null ? formatMoney(i.sale_price, i.sale_currency) : 'ціну не вказано'}
        </button>
    ));

    const specLine = (i) => [
        i.power_kw ? `${num(i.power_kw)} кВт` : null,
        i.phases || null,
        i.technical_characteristics || null,
    ].filter(Boolean).join(' · ');

    return (
        <>
            <div className="p-3 sm:p-5 space-y-4 max-w-[1400px] w-full mx-auto pb-safe">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-[13px] text-slate-500">
                        Ціни продажу моделей обладнання
                        <Tip width={300} text="Ті самі моделі, що на складі й в обладнанні об'єктів. Наявність — з реальних залишків складу, тут ведеться лише ціна продажу." />
                    </div>
                    {isOffice && (
                        <Btn variant="accent" icon={FaPlus} onClick={() => setModal({ open: true, item: null })}>
                            Нова модель
                        </Btn>
                    )}
                </div>

                <div className={`${T.card} p-2.5 space-y-2.5`}>
                    <SearchInput value={search} onChange={setSearch} placeholder="Модель, бренд або SKU…" />
                    <div className="overflow-x-auto">
                        <Segmented
                            value={group}
                            onChange={setGroup}
                            options={[
                                { value: 'all', label: `Усе · ${counts.all || 0}` },
                                ...EQUIPMENT_GROUPS.map(g => ({ value: g.key, label: `${g.label} · ${counts[g.key] || 0}` })),
                            ]}
                        />
                    </div>
                </div>

                <div className={`${T.card} overflow-hidden`}>
                    {loading ? <Skeleton rows={8} /> : visible.length === 0 ? (
                        <EmptyState icon={FaBoxes} title="Нічого не знайдено" />
                    ) : (
                        <>
                            {/* Телефон і планшет: картки — модель, характеристики, залишок і ціна видно одразу */}
                            <ul className="lg:hidden divide-y divide-slate-100">
                                {visible.map(i => {
                                    const isEditing = editing?.id === i.id;
                                    return (
                                        <li key={i.id} className="px-3 py-3">
                                            <div className="flex items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">{i.label}</div>
                                                    <div className="text-[12px] text-slate-400">{i.categoryPath}</div>
                                                    {specLine(i) && <div className="text-[12.5px] text-slate-600 mt-0.5">{specLine(i)}</div>}
                                                </div>
                                                {isOffice && !isEditing && (
                                                    <IconBtn icon={FaPen} label="Картка моделі" onClick={() => setModal({ open: true, item: i })} />
                                                )}
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                                                <span className="text-[12.5px] text-slate-500 inline-flex items-center gap-1.5">
                                                    На складі {stockCell(i)}
                                                </span>
                                                {priceCell(i, isEditing)}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="hidden lg:block overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className={T.th}>Модель</th>
                                            <th className={T.th}>Характеристики</th>
                                            <th className={`${T.th} text-right`}>На складі</th>
                                            <th className={`${T.th} text-right`}>Ціна продажу</th>
                                            <th className={T.th} />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {visible.map(i => {
                                            const isEditing = editing?.id === i.id;
                                            return (
                                                <tr key={i.id} className="hover:bg-slate-50/60">
                                                    <td className={T.td}>
                                                        <div className="font-semibold text-slate-900">{i.label}</div>
                                                        <div className="text-[11.5px] text-slate-400">{i.categoryPath}</div>
                                                    </td>
                                                    <td className={`${T.td} text-slate-600`}>{specLine(i) || '—'}</td>
                                                    <td className={`${T.td} text-right tabular-nums`}>{stockCell(i)}</td>
                                                    <td className={`${T.td} text-right`}>{priceCell(i, isEditing)}</td>
                                                    <td className={`${T.td} text-right w-10`}>
                                                        {isOffice && !isEditing && (
                                                            <IconBtn icon={FaPen} label="Картка моделі" onClick={() => setModal({ open: true, item: i })} />
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {modal.open && (
                <NomenclatureModal
                    isOpen={modal.open}
                    editingItem={modal.item}
                    onClose={() => setModal({ open: false, item: null })}
                    onSuccess={() => { setModal({ open: false, item: null }); load(); }}
                    onPickExisting={() => { setModal({ open: false, item: null }); load(); }}
                />
            )}
        </>
    );
}
