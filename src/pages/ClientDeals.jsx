// =====================================================================
//  K-CORE · Картка клієнта: гроші, резерв і продажі без об'єкта
//
//  Не кожна угода — станція з монтажем: клієнт може купити інвертор чи
//  акумулятор, а гроші — внести наперед. Тому тут, без створення
//  об'єкта:
//   • Гроші — усі платежі клієнта (і по його об'єктах, і напряму);
//     новий платіж — форма на місці (PaymentForm).
//   • Резерв обладнання — відкладений на складі товар під клієнта:
//     зарезервувати, продати з резерву, зняти резерв.
//   • Продажі — що клієнту вже продано зі складу; новий продаж —
//     «Продаж клієнту» з обраним клієнтом.
//  Гроші бачать «Фінанси компанії» і менеджери об'єктів цього клієнта.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaMoneyBillWave, FaBoxOpen, FaShoppingCart, FaPlus, FaCheck, FaTimes, FaWarehouse, FaBox } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, Picker, Field, Skeleton, useToast, humanError, num } from '../ui';
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, canSeeMoney } from '../domain/objects';
import PaymentForm, { methodLabel } from './PaymentForm';
import DirectSaleModal from './DirectSaleModal';
import { loadUsdRate } from '../utils/settings';

const fmtDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('uk-UA') : '');
const totals = (rows, cur = (p) => p.currency || DEFAULT_CURRENCY) => {
    const by = {};
    rows.forEach(p => { by[cur(p)] = (by[cur(p)] || 0) + (Number(p.amount) || 0); });
    const parts = CURRENCIES.filter(c => by[c.key]).map(c => formatMoney(by[c.key], c.key));
    return parts.length ? parts.join(' · ') : '—';
};

const Section = ({ icon: Icon, title, count, action, children }) => (
    <section className={`${T.card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
            <Icon className="text-indigo-500" size={13} />
            <h3 className="text-[14px] font-bold text-slate-800 mr-auto">{title}</h3>
            {count != null && <span className="text-[12px] text-slate-400 tabular-nums">{count}</span>}
            {action}
        </div>
        {children}
    </section>
);

/* ---------------- Гроші ---------------- */
function ClientPayments({ client, objects, onlyMine }) {
    const { employee, can } = useAuth();
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [adding, setAdding] = useState(false);
    const [limit, setLimit] = useState(10);

    const load = useCallback(async () => {
        const { data, error } = await supabase.from('payment_history')
            .select('id, installation_custom_id, amount, currency, exchange_rate, paid_at, payment_method, comment, installation:installations(custom_id, name, responsible_emp_id)')
            .eq('client_id', client.id).order('paid_at', { ascending: false }).order('id', { ascending: false });
        if (error) { toast(humanError(error), 'error'); setRows([]); return; }
        setRows((data || []).filter(onlyMine));
    }, [client.id, onlyMine, toast]);
    useEffect(() => { load(); }, [load]);

    return (
        <Section icon={FaMoneyBillWave} title="Гроші" count={rows ? rows.length : null}
            action={!adding && can('payments', 'add') && <Btn size="sm" variant="softOk" icon={FaPlus} onClick={() => setAdding(true)}>Платіж</Btn>}>
            {adding && (
                <div className="p-4 border-b border-emerald-100 bg-emerald-50/40">
                    <div className="text-[14px] font-bold text-slate-900 mb-2.5">Новий платіж · {client.company_name || client.name}</div>
                    <PaymentForm client={{ id: client.id, name: client.name }} objects={objects} employeeId={employee?.id}
                        onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
                </div>
            )}
            {rows === null ? <Skeleton rows={2} /> : rows.length === 0 ? (
                <div className="px-4 py-5 text-center text-[13px] text-slate-400">Платежів ще немає</div>
            ) : (
                <>
                    <div className="px-4 pt-2.5 text-[13px] text-slate-500">Усього: <b className="text-emerald-700 tabular-nums">{totals(rows)}</b></div>
                    <ul className="divide-y divide-slate-100">
                        {rows.slice(0, limit).map(p => (
                            <li key={p.id} className="px-4 py-2.5">
                                <div className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="text-[14px] font-bold text-emerald-700 tabular-nums">{formatMoney(Number(p.amount), p.currency || DEFAULT_CURRENCY)}</span>
                                    <span className="text-[12.5px] text-slate-500">{fmtDate(p.paid_at)}</span>
                                    {p.exchange_rate && <span className="text-[12px] text-slate-400">· курс {Number(p.exchange_rate)}</span>}
                                    <span className="text-[12px] text-slate-400">· {methodLabel(p.payment_method)}</span>
                                </div>
                                <div className="text-[12.5px] text-slate-600 break-words">
                                    {p.installation
                                        ? <a href={`#/project/${p.installation.custom_id}`} className="text-indigo-600 hover:underline">СЕС-{p.installation.custom_id} {p.installation.name}</a>
                                        : <span className="text-slate-500">без об'єкта</span>}
                                    {p.comment && <span className="text-slate-500"> · {p.comment}</span>}
                                </div>
                            </li>
                        ))}
                    </ul>
                    {rows.length > limit && (
                        <button type="button" onClick={() => setLimit(l => l + 20)} className="w-full py-2 border-t border-slate-100 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                            Показати ще {Math.min(20, rows.length - limit)}
                        </button>
                    )}
                </>
            )}
        </Section>
    );
}

/* ---------------- Резерв обладнання ---------------- */
function ReserveForm({ client, onDone, onCancel }) {
    const { employee } = useAuth();
    const toast = useToast();
    const [items, setItems] = useState([]);
    const [nom, setNom] = useState('');
    const [stock, setStock] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [wh, setWh] = useState('');
    const [qty, setQty] = useState('');
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        supabase.from('v_pick_nomenclature').select('id, name, unit, available').gt('available', 0).order('name')
            .then(({ data }) => setItems(data || []));
        supabase.from('warehouses').select('id, name').eq('is_active', true).then(({ data }) => setWarehouses(data || []));
    }, []);
    useEffect(() => {
        if (!nom) { setStock([]); setWh(''); return; }
        supabase.from('v_warehouse_stock_available').select('warehouse_id, quantity_available').eq('nomenclature_id', nom).gt('quantity_available', 0)
            .then(({ data }) => {
                const list = (data || []).sort((a, b) => b.quantity_available - a.quantity_available);
                setStock(list);
                setWh(list[0]?.warehouse_id ?? '');
            });
    }, [nom]);

    const item = items.find(i => String(i.id) === String(nom));
    const avail = stock.find(s => String(s.warehouse_id) === String(wh))?.quantity_available;
    const save = async () => {
        if (!nom || !wh || !(Number(qty) > 0)) { toast('Оберіть товар, склад і кількість', 'error'); return; }
        setBusy(true);
        const { data, error } = await supabase.rpc('reserve_for_client', {
            p_client: client.id, p_warehouse: Number(wh), p_nomenclature: Number(nom), p_qty: Number(qty), p_note: note, p_emp: employee?.id || null,
        });
        setBusy(false);
        if (error || !data?.ok) { toast(error ? humanError(error) : data.message, 'error'); return; }
        toast(`Зарезервовано: ${item?.name} · ${qty} ${item?.unit || 'шт'}`, 'success');
        onDone();
    };

    return (
        <div className="p-4 border-b border-indigo-100 bg-indigo-50/40 space-y-3">
            <Field label="Товар" required>
                <Picker options={items.map(i => ({ id: i.id, label: `${i.name} · вільно ${num(i.available)} ${i.unit || 'шт'}` }))} value={nom} onChange={setNom}
                    placeholder="Що відкласти для клієнта…" searchPlaceholder="Назва, бренд, модель…" icon={FaBox} />
            </Field>
            {nom && (
                <div className="flex flex-wrap gap-1.5">
                    {stock.length === 0 && <span className="text-[12.5px] text-rose-600">Вільного залишку немає</span>}
                    {stock.map(s => (
                        <button key={s.warehouse_id} type="button" onClick={() => setWh(s.warehouse_id)}
                            className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${String(wh) === String(s.warehouse_id) ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                            <FaWarehouse size={10} /> {warehouses.find(w => w.id === s.warehouse_id)?.name || 'Склад'} · {num(s.quantity_available)}
                        </button>
                    ))}
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[140px_minmax(0,1fr)] gap-3">
                <Field label={`Кількість${item?.unit ? `, ${item.unit}` : ''}`} required>
                    <input type="number" inputMode="decimal" min="0" step="any" className={`${T.input} h-11`} value={qty} onChange={e => setQty(e.target.value)} placeholder={avail != null ? `до ${num(avail)}` : ''} />
                </Field>
                <Field label="Примітка">
                    <input className={`${T.input} h-11`} value={note} onChange={e => setNote(e.target.value)} placeholder="До коли тримаємо, передоплата…" />
                </Field>
            </div>
            <div className="flex gap-2">
                <Btn variant="accent" icon={FaCheck} onClick={save} disabled={busy}>{busy ? 'Резервуємо…' : 'Зарезервувати'}</Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={busy}>Скасувати</Btn>
            </div>
        </div>
    );
}

function SellFromReserve({ r, client, onDone, onCancel }) {
    const { employee } = useAuth();
    const toast = useToast();
    const left = Number(r.reserved_quantity) - Number(r.released_quantity);
    const [f, setF] = useState({ qty: String(left), price: '', currency: 'USD', rate: '' });
    const [busy, setBusy] = useState(false);
    useEffect(() => { loadUsdRate().then(rt => { if (rt) setF(x => (x.rate === '' ? { ...x, rate: String(rt) } : x)); }); }, []);
    const save = async () => {
        if (!(Number(f.qty) > 0) || Number(f.qty) > left) { toast(`Кількість — від 0 до ${num(left)}`, 'error'); return; }
        if (!(Number(f.price) >= 0) || f.price === '') { toast('Вкажіть ціну за одиницю', 'error'); return; }
        if (f.currency !== 'UAH' && !(Number(String(f.rate).replace(',', '.')) > 0)) { toast('Вкажіть курс до гривні', 'error'); return; }
        setBusy(true);
        const { data, error } = await supabase.rpc('sell_to_object', {
            p_installation: null, p_warehouse: r.warehouse_id, p_nomenclature: r.nomenclature_id, p_qty: Number(f.qty),
            p_op: 'sale', p_client: client.id, p_sale_price: Number(f.price), p_currency: f.currency,
            p_exchange_rate: Number(f.rate) || 1, p_reference: null, p_reason: 'Продаж з резерву клієнта', p_emp: employee?.id || null,
        });
        setBusy(false);
        if (error || !data?.ok) { toast(error ? humanError(error) : data.message, 'error'); return; }
        toast(`Продано: ${r.nom?.name} · ${f.qty}`, 'success');
        onDone();
    };
    return (
        <div className="px-4 pb-3 pt-1 bg-emerald-50/40 space-y-2.5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Field label="Кількість"><input type="number" step="any" min="0" className={`${T.input} h-10`} value={f.qty} onChange={e => setF(x => ({ ...x, qty: e.target.value }))} /></Field>
                <Field label="Ціна за од."><input type="number" step="0.01" min="0" className={`${T.input} h-10`} value={f.price} onChange={e => setF(x => ({ ...x, price: e.target.value }))} /></Field>
                <Field label="Валюта">
                    <select className={`${T.select} h-10`} value={f.currency} onChange={e => setF(x => ({ ...x, currency: e.target.value }))}>
                        <option value="USD">$ дол.</option><option value="UAH">₴ грн</option>
                    </select>
                </Field>
                <Field label="Курс"><input type="number" step="0.01" min="0" className={`${T.input} h-10`} value={f.rate} onChange={e => setF(x => ({ ...x, rate: e.target.value }))} /></Field>
            </div>
            {Number(f.qty) > 0 && Number(f.price) > 0 && (
                <div className="text-[13px] text-emerald-800">Разом: <b className="tabular-nums">{formatMoney(Number(f.qty) * Number(f.price), f.currency)}</b></div>
            )}
            <div className="flex gap-2">
                <Btn size="sm" variant="ok" icon={FaCheck} onClick={save} disabled={busy}>{busy ? 'Проводимо…' : 'Продати'}</Btn>
                <Btn size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Скасувати</Btn>
            </div>
        </div>
    );
}

function ClientReserves({ client, onSold }) {
    const { employee, can } = useAuth();
    const canStock = can('stock', 'edit');   // резерв, продаж, зняття — «Склад: змінює»
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [adding, setAdding] = useState(false);
    const [sell, setSell] = useState(null);
    const [ask, setAsk] = useState(null);

    const load = useCallback(async () => {
        const { data, error } = await supabase.from('reservations')
            .select('id, warehouse_id, nomenclature_id, reserved_quantity, released_quantity, reserved_at, notes, nom:nomenclature(name, unit:units(name)), warehouse:warehouses(name)')
            .eq('client_id', client.id).is('installation_custom_id', null).eq('status', 'active')
            .order('reserved_at', { ascending: false });
        if (error) { toast(humanError(error), 'error'); setRows([]); return; }
        setRows((data || []).filter(r => Number(r.reserved_quantity) - Number(r.released_quantity) > 0));
    }, [client.id, toast]);
    useEffect(() => { load(); }, [load]);

    const release = async (r) => {
        const { data, error } = await supabase.rpc('release_reservation', { p_reservation_id: r.id, p_qty: null, p_emp: employee?.id || null });
        if (error || !data?.ok) { toast(error ? humanError(error) : data.message, 'error'); return; }
        toast('Резерв знято — товар знову вільний', 'info');
        setAsk(null); load();
    };

    return (
        <Section icon={FaBoxOpen} title="Резерв обладнання" count={rows ? rows.length : null}
            action={!adding && canStock && <Btn size="sm" variant="soft" icon={FaPlus} onClick={() => setAdding(true)}>Зарезервувати</Btn>}>
            {adding && <ReserveForm client={client} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
            {rows === null ? <Skeleton rows={2} /> : rows.length === 0 ? (
                <div className="px-4 py-5 text-center text-[13px] text-slate-400">Нічого не зарезервовано</div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {rows.map(r => {
                        const left = Number(r.reserved_quantity) - Number(r.released_quantity);
                        return (
                            <li key={r.id}>
                                <div className="px-4 py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1.5">
                                    <div className="min-w-0 flex-1 basis-[200px]">
                                        <div className="text-[13.5px] font-semibold text-slate-900 break-words">{r.nom?.name || `Товар #${r.nomenclature_id}`}</div>
                                        <div className="text-[12px] text-slate-500 break-words">
                                            {num(left)} {r.nom?.unit?.name || 'шт'} · {r.warehouse?.name || 'склад'} · з {fmtDate(r.reserved_at)}{r.notes ? ` · ${r.notes}` : ''}
                                        </div>
                                    </div>
                                    {ask === r.id ? (
                                        <span className="inline-flex items-center gap-1.5 ml-auto">
                                            <span className="text-[12.5px] font-semibold text-rose-700">Зняти резерв?</span>
                                            <Btn size="sm" variant="danger" onClick={() => release(r)}>Так</Btn>
                                            <Btn size="sm" variant="ghost" onClick={() => setAsk(null)}>Ні</Btn>
                                        </span>
                                    ) : canStock && (
                                        <span className="inline-flex items-center gap-1.5 ml-auto">
                                            <Btn size="sm" variant="softOk" icon={FaShoppingCart} onClick={() => setSell(s => (s === r.id ? null : r.id))}>Продати</Btn>
                                            <Btn size="sm" variant="ghost" icon={FaTimes} onClick={() => setAsk(r.id)}>Зняти</Btn>
                                        </span>
                                    )}
                                </div>
                                {sell === r.id && <SellFromReserve r={r} client={client} onCancel={() => setSell(null)} onDone={() => { setSell(null); load(); onSold?.(); }} />}
                            </li>
                        );
                    })}
                </ul>
            )}
        </Section>
    );
}

/* ---------------- Продажі ---------------- */
function ClientSales({ client, reloadKey }) {
    const { can } = useAuth();
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(false);
    const [limit, setLimit] = useState(10);
    const [bump, setBump] = useState(0);

    useEffect(() => {
        supabase.from('stock_movements')
            .select('id, quantity, sale_price, currency, operation_date, reference_document, installation_custom_id, nom:nomenclature(name, unit:units(name))')
            .eq('client_id', client.id).eq('operation_type', 'sale').order('operation_date', { ascending: false })
            .then(({ data }) => setRows(data || []));
    }, [client.id, reloadKey, bump]);

    const sum = useMemo(() => totals((rows || []).filter(r => r.sale_price != null).map(r => ({ amount: Number(r.sale_price) * Number(r.quantity), currency: r.currency || 'USD' }))), [rows]);

    return (
        <Section icon={FaShoppingCart} title="Продажі" count={rows ? rows.length : null}
            action={can('stock', 'add') && <Btn size="sm" variant="soft" icon={FaPlus} onClick={() => setOpen(true)}>Продаж</Btn>}>
            {rows === null ? <Skeleton rows={2} /> : rows.length === 0 ? (
                <div className="px-4 py-5 text-center text-[13px] text-slate-400">Продажів ще не було</div>
            ) : (
                <>
                    <div className="px-4 pt-2.5 text-[13px] text-slate-500">На суму: <b className="text-slate-800 tabular-nums">{sum}</b></div>
                    <ul className="divide-y divide-slate-100">
                        {rows.slice(0, limit).map(r => (
                            <li key={r.id} className="px-4 py-2.5 flex flex-wrap items-baseline gap-x-3">
                                <span className="text-[13.5px] font-semibold text-slate-900 break-words min-w-0 flex-1 basis-[200px]">{r.nom?.name || 'Товар'}</span>
                                <span className="text-[12.5px] text-slate-600 tabular-nums">{num(r.quantity)} {r.nom?.unit?.name || 'шт'}</span>
                                {r.sale_price != null && <span className="text-[12.5px] font-semibold text-slate-800 tabular-nums">{formatMoney(Number(r.sale_price) * Number(r.quantity), r.currency || 'USD')}</span>}
                                <span className="text-[12px] text-slate-400 w-full">{fmtDate(r.operation_date)}{r.reference_document ? ` · ${r.reference_document}` : ''}{r.installation_custom_id ? ` · СЕС-${r.installation_custom_id}` : ''}</span>
                            </li>
                        ))}
                    </ul>
                    {rows.length > limit && (
                        <button type="button" onClick={() => setLimit(l => l + 20)} className="w-full py-2 border-t border-slate-100 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                            Показати ще {Math.min(20, rows.length - limit)}
                        </button>
                    )}
                </>
            )}
            <DirectSaleModal isOpen={open} presetClientId={client.id} onClose={() => setOpen(false)} onSuccess={() => { setOpen(false); setBump(b => b + 1); }} />
        </Section>
    );
}

export default function ClientDeals({ client, objects }) {
    const auth = useAuth();
    const [salesKey, setSalesKey] = useState(0);
    // Гроші: «Фінанси компанії», менеджер хоч одного об'єкта клієнта, або клієнт без об'єктів
    const mineObj = objects.some(o => canSeeMoney(auth, o));
    const seeMoney = auth.can('money') && (auth.financeAll || mineObj || objects.length === 0);
    const onlyMine = useCallback((p) => auth.financeAll || !p.installation || canSeeMoney(auth, p.installation), [auth]);
    if (!auth.isOffice) return null;
    // Резерв і продаж зі складу — за доступом до «Складу»
    const seeStock = auth.can('stock');
    return (
        <div className="space-y-4">
            {seeMoney && <ClientPayments client={client} objects={objects.map(o => ({ ...o, client: { name: client.name, company_name: client.company_name } }))} onlyMine={onlyMine} />}
            {seeStock && <ClientReserves client={client} onSold={() => setSalesKey(k => k + 1)} />}
            {seeStock && <ClientSales client={client} reloadKey={salesKey} />}
            {!seeMoney && <Chip tone="neutral">Гроші цього клієнта бачать менеджери його об'єктів</Chip>}
        </div>
    );
}
