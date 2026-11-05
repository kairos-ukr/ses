// =====================================================================
//  K-CORE · Склад → позиція → «Резерв»: за ким і за чим
//
//  Активні резерви позиції: під який об'єкт (з посиланням на картку) чи
//  за яким клієнтом (просто відкладено під клієнта, без об'єкта),
//  скільки, на якому складі, з якого дня, хто поставив і примітка.
//  Однаково на телефоні й на комп'ютері — тут же, без окремого вікна.
//  Тут же (доступ «Склад: змінює»):
//   • «Зарезервувати» — клієнту (без об'єкта) або під об'єкт;
//   • «Продати» — клієнту з його резерву (як у картці клієнта);
//   • «Зняти» — резерв знімається, товар знову вільний.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaLock, FaHardHat, FaUserTie, FaPlus, FaCheck, FaTimes, FaShoppingCart, FaWarehouse } from 'react-icons/fa';

import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthProvider';
import { T, Btn, Picker, Field, Segmented, Skeleton, useToast, humanError, num } from '../../ui';
import { isObjectActive } from '../../domain/objects';
import { SellFromReserve } from '../ClientDeals';

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '');
const clientName = (c) => (c ? c.company_name || c.name || 'Клієнт' : 'Клієнт');

/** Хто/що тримає резерв — одним рядком (і для списку на складі) */
export const reserveTarget = (r) => (r.installation
    ? `СЕС-${r.installation.custom_id} ${r.installation.name || ''}`.trim()
    : r.client ? `Клієнт: ${clientName(r.client)}` : 'Невідомо');

/**
 * item     — позиція складу ({ id, fullName, unit })
 * stock    — вільний залишок позиції по складах: [{ id, name, available }]
 * scopedId — показувати лише резерви цього складу (обраний у фільтрі)
 */
export default function ItemReserves({ item, stock = [], scopedId = null, canStock, onChanged }) {
    const { employee } = useAuth();
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [adding, setAdding] = useState(false);
    const [ask, setAsk] = useState(null);     // id резерву, який питаємо «зняти?»
    const [sell, setSell] = useState(null);   // id резерву клієнта, який продаємо
    const unit = item.unit?.name || 'шт';

    const load = useCallback(async () => {
        let q = supabase.from('reservations')
            .select(`id, warehouse_id, nomenclature_id, reserved_quantity, released_quantity, reserved_at, created_at, notes,
                installation:installations(custom_id, name, client:clients(name, company_name, populated_place)),
                client:clients(id, custom_id, name, company_name, phone),
                warehouse:warehouses(name),
                author:employees!reservations_created_by_fkey(name)`)
            .eq('nomenclature_id', item.id).eq('status', 'active')
            .order('reserved_at', { ascending: false });
        if (scopedId) q = q.eq('warehouse_id', scopedId);
        const { data, error } = await q;
        if (error) { toast(humanError(error), 'error'); setRows([]); return; }
        setRows((data || [])
            .map(r => ({ ...r, nom: { name: item.fullName, unit: { name: unit } }, left: Number(r.reserved_quantity) - Number(r.released_quantity) }))
            .filter(r => r.left > 0));
    }, [item.id, item.fullName, unit, scopedId, toast]);

    useEffect(() => { load(); }, [load]);

    const changed = () => { load(); onChanged?.(); };

    const release = async (r) => {
        const { data, error } = await supabase.rpc('release_reservation', { p_reservation_id: r.id, p_qty: null, p_emp: employee?.id || null });
        if (error || !data?.ok) { toast(error ? humanError(error) : data.message, 'error'); return; }
        toast('Резерв знято — товар знову вільний', 'info');
        setAsk(null);
        changed();
    };

    const free = stock.filter(s => s.available > 0);
    const total = (rows || []).reduce((s, r) => s + r.left, 0);

    return (
        <div className={`${T.cardFlat} overflow-hidden`}>
            <div className="px-3 py-2 border-b border-slate-100 bg-amber-50/50 flex items-center gap-2">
                <FaLock size={11} className="text-amber-600 flex-shrink-0" />
                <span className="text-[12.5px] font-bold text-slate-800 mr-auto">
                    Резерв{rows && rows.length > 0 ? ` · ${num(total)} ${unit}` : ''}
                </span>
                {canStock && !adding && free.length > 0 && (
                    <Btn size="sm" variant="soft" icon={FaPlus} onClick={() => setAdding(true)}>Зарезервувати</Btn>
                )}
            </div>

            {adding && (
                <ReserveForm item={item} unit={unit} free={free} scopedId={scopedId}
                    onCancel={() => setAdding(false)} onDone={() => { setAdding(false); changed(); }} />
            )}

            {rows === null ? <div className="p-2"><Skeleton rows={2} /></div> : rows.length === 0 ? (
                <div className="px-3 py-3 text-[12.5px] text-slate-400">Нічого не зарезервовано</div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {rows.map(r => {
                        const isClient = !r.installation && !!r.client;
                        return (
                            <li key={r.id}>
                                <div className="px-3 py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1.5">
                                    <span className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isClient ? 'bg-sky-50 text-sky-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                        {isClient ? <FaUserTie size={11} /> : <FaHardHat size={11} />}
                                    </span>
                                    <div className="min-w-0 flex-1 basis-[180px]">
                                        {r.installation ? (
                                            <a href={`#/project/${r.installation.custom_id}`} className="text-[13px] font-bold text-slate-900 hover:text-indigo-700 hover:underline break-words">
                                                <span className="font-mono text-[11px] text-slate-400 mr-1">СЕС-{r.installation.custom_id}</span>{r.installation.name || "Об'єкт"}
                                            </a>
                                        ) : r.client ? (
                                            <a href={`#/clients/${r.client.custom_id}`} className="text-[13px] font-bold text-slate-900 hover:text-indigo-700 hover:underline break-words">
                                                Клієнт: {clientName(r.client)}
                                            </a>
                                        ) : <span className="text-[13px] font-bold text-slate-900">Невідомо</span>}
                                        <div className="text-[11.5px] text-slate-500 break-words">
                                            {[
                                                r.installation?.client ? clientName(r.installation.client) : null,
                                                r.warehouse?.name,
                                                `з ${fmtDate(r.reserved_at || r.created_at)}`,
                                                r.author?.name ? `поставив ${r.author.name}` : null,
                                                r.notes,
                                            ].filter(Boolean).join(' · ')}
                                        </div>
                                    </div>
                                    <span className="text-[15px] font-black tabular-nums text-amber-700 flex-shrink-0">
                                        {num(r.left)} <span className="text-[10px] font-bold text-slate-400">{unit}</span>
                                    </span>
                                    {canStock && (
                                        <div className="w-full flex flex-wrap items-center justify-end gap-1.5">
                                            {ask === r.id ? (<>
                                                <span className="text-[12.5px] font-semibold text-rose-700 mr-auto">Зняти резерв?</span>
                                                <Btn size="sm" variant="danger" onClick={() => release(r)}>Так, зняти</Btn>
                                                <Btn size="sm" variant="ghost" onClick={() => setAsk(null)}>Ні</Btn>
                                            </>) : (<>
                                                {isClient && (
                                                    <Btn size="sm" variant={sell === r.id ? 'ok' : 'softOk'} icon={FaShoppingCart}
                                                        onClick={() => setSell(s => (s === r.id ? null : r.id))}>Продати</Btn>
                                                )}
                                                <Btn size="sm" variant="ghost" icon={FaTimes} onClick={() => { setAsk(r.id); setSell(null); }}>Зняти</Btn>
                                            </>)}
                                        </div>
                                    )}
                                </div>
                                {sell === r.id && isClient && (
                                    <SellFromReserve r={r} client={r.client} onCancel={() => setSell(null)}
                                        onDone={() => { setSell(null); changed(); }} />
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Зарезервувати: клієнту (без об'єкта) або під об'єкт
 * ------------------------------------------------------------------- */
function ReserveForm({ item, unit, free, scopedId, onDone, onCancel }) {
    const { employee } = useAuth();
    const toast = useToast();
    const [target, setTarget] = useState('client');
    const [clients, setClients] = useState(null);
    const [objects, setObjects] = useState(null);
    const [who, setWho] = useState('');
    const [wh, setWh] = useState(() => (free.find(s => s.id === scopedId) || [...free].sort((a, b) => b.available - a.available)[0])?.id ?? '');
    const [qty, setQty] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (target === 'client' && clients === null) {
            supabase.from('clients').select('id, name, company_name, phone, populated_place').order('name')
                .then(({ data }) => setClients(data || []));
        }
        if (target === 'object' && objects === null) {
            supabase.from('installations').select('custom_id, name, status, client:clients(name, company_name)')
                .order('custom_id', { ascending: false })
                .then(({ data }) => setObjects((data || []).filter(o => isObjectActive(o.status))));
        }
    }, [target, clients, objects]);

    const options = useMemo(() => (target === 'client'
        ? (clients || []).map(c => ({ id: c.id, label: [c.company_name || c.name, c.company_name ? c.name : null, c.phone, c.populated_place].filter(Boolean).join(' · ') }))
        : (objects || []).map(o => ({ id: o.custom_id, label: [`СЕС-${o.custom_id}`, o.name, o.client?.company_name || o.client?.name].filter(Boolean).join(' · ') }))
    ), [target, clients, objects]);

    const avail = free.find(s => String(s.id) === String(wh))?.available ?? 0;

    const save = async () => {
        if (who === '' || who == null) { toast(target === 'client' ? 'Оберіть клієнта' : "Оберіть об'єкт", 'error'); return; }
        const n = Number(String(qty).replace(',', '.'));
        if (!wh || !(n > 0)) { toast('Оберіть склад і кількість', 'error'); return; }
        if (n > avail) { toast(`Вільно лише ${num(avail)} ${unit}`, 'error'); return; }
        setBusy(true);
        const { data, error } = target === 'client'
            ? await supabase.rpc('reserve_for_client', {
                p_client: Number(who), p_warehouse: Number(wh), p_nomenclature: item.id, p_qty: n, p_note: note, p_emp: employee?.id || null,
            })
            : await supabase.rpc('reserve_for_object', {
                p_installation: Number(who), p_warehouse: Number(wh), p_nomenclature: item.id, p_spec_item: null, p_qty: n, p_emp: employee?.id || null,
            });
        setBusy(false);
        if (error || !data?.ok) { toast(error ? humanError(error) : data.message, 'error'); return; }
        const label = options.find(o => String(o.id) === String(who))?.label?.split(' · ').slice(0, 2).join(' · ');
        toast(`Зарезервовано ${num(n)} ${unit}${label ? ` · ${label}` : ''}`, 'success');
        onDone();
    };

    return (
        <div className="px-3 py-3 border-b border-indigo-100 bg-indigo-50/40 space-y-2.5">
            <Segmented value={target} onChange={(v) => { setTarget(v); setWho(''); }}
                options={[{ value: 'client', label: 'Клієнту' }, { value: 'object', label: "Під об'єкт" }]} />
            <Field label={target === 'client' ? 'Клієнт' : "Об'єкт"} required>
                <Picker options={options} value={who} onChange={setWho}
                    placeholder={(target === 'client' ? clients : objects) === null ? 'Завантаження…' : target === 'client' ? "Ім'я, компанія або телефон…" : 'Номер, назва або клієнт…'}
                    searchPlaceholder={target === 'client' ? 'Пошук клієнта…' : "Пошук об'єкта…"}
                    icon={target === 'client' ? FaUserTie : FaHardHat} />
            </Field>
            {free.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                    {free.map(s => (
                        <button key={s.id} type="button" onClick={() => setWh(s.id)}
                            className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${String(wh) === String(s.id) ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <FaWarehouse size={10} /> {s.name} · {num(s.available)}
                        </button>
                    ))}
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-2.5">
                <Field label={`Кількість, ${unit}`} required>
                    <input type="number" inputMode="decimal" min="0" step="any" className={`${T.input} h-10`} value={qty}
                        onChange={e => setQty(e.target.value)} placeholder={`до ${num(avail)}`} />
                </Field>
                {target === 'client' && (
                    <Field label="Примітка">
                        <input className={`${T.input} h-10`} value={note} onChange={e => setNote(e.target.value)} placeholder="До коли тримаємо, передоплата…" />
                    </Field>
                )}
            </div>
            <div className="flex flex-wrap gap-2">
                <Btn variant="accent" icon={FaCheck} onClick={save} disabled={busy}>{busy ? 'Резервуємо…' : 'Зарезервувати'}</Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={busy}>Скасувати</Btn>
            </div>
        </div>
    );
}
