// =====================================================================
//  K-CORE · Автопарк → «Витрати на авто» (окреме право fleet_costs)
//
//  По кожному авто компанії за місяць: км (з одометра), пальне (₴, л,
//  л/100 км), ТО й ремонти — запчастини й робота окремо, усього, ₴ за
//  км, днів у роботі, хто водив, останнє ТО. Натиснули на авто — під
//  ним записи місяця з чеками, тут же «+ ТО / ремонт» і «+ Пальне»,
//  зміна й видалення — на місці, без вікон поверх.
//  Видно лише тим, кому дали право «Витрати на авто» (Доступи), і в CRM,
//  і в «Монтажі» (Я → Автопарк). Водії вносять пальне з чеком самі.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FaChevronLeft, FaChevronRight, FaChevronDown, FaPlus, FaTimes, FaCheck, FaPen, FaTrash, FaTools, FaGasPump, FaCamera,
} from 'react-icons/fa';

import { supabase } from '../../supabaseClient';
import { T, Btn, IconBtn, Chip, Skeleton, Tip, useToast, humanError } from '../../ui';
import { PhotoThumbs } from '../../ui/MediaViewer';
import {
    EXPENSE_KINDS, PAID_BY, PAID_BY_LABEL, loadFleetMonth, uploadReceipts, lastOdometer, vehicleTitle,
    uah, kmText, numOf, shiftMonth, monthTitle, monthBounds,
} from './fleetData';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtDate = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
const fmtL = (n) => `${(Math.round(Number(n) * 10) / 10).toLocaleString('uk-UA')} л`;
const chip = (on) => `h-9 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors ${on
    ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`;

/** me — хто вносить ({ id, name }); can — { add, edit, delete } */
export default function VehicleCosts({ me, can, className = '' }) {
    const [ym, setYm] = useState(() => isoDay().slice(0, 7));
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(null);
    const { from, to } = monthBounds(ym);
    const current = isoDay().slice(0, 7);

    const load = useCallback(async () => {
        try { setRows(await loadFleetMonth(from, to)); } catch { setRows([]); }
    }, [from, to]);

    useEffect(() => { setRows(null); load(); }, [load]);
    useEffect(() => {
        let t;
        const bump = () => { clearTimeout(t); t = setTimeout(load, 600); };
        const ch = supabase.channel('fleet-costs-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_expenses' }, bump)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'car_mileage' }, bump)
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load]);

    const sum = useMemo(() => (rows || []).reduce((s, r) => ({
        total: s.total + r.total, fuel: s.fuel + r.fuelSum, parts: s.parts + r.parts, labor: s.labor + r.labor + r.other,
        km: s.km + (r.km || 0), liters: s.liters + r.liters,
    }), { total: 0, fuel: 0, parts: 0, labor: 0, km: 0, liters: 0 }), [rows]);

    const list = (rows || []).filter(r => r.v.status !== 'inactive' || r.total > 0 || r.km);

    return (
        <section className={`${T.card} overflow-hidden ${className}`}>
            <div className="px-3.5 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2 mr-auto">
                    <FaTools size={12} className="text-indigo-500" /> Витрати на авто
                    <Tip width={290} text="Км — з одометра, який водії вносять щодня в «Монтажі». Пальне — з чеками від водіїв. ТО й ремонти вносить той, кому дали право «Витрати на авто»: запчастини й робота окремо." />
                </h3>
                <IconBtn variant="outline" icon={FaChevronLeft} label="Попередній місяць" onClick={() => setYm(m => shiftMonth(m, -1))} />
                <span className="text-[13px] font-semibold text-slate-700 min-w-[120px] text-center">{monthTitle(ym)}</span>
                <IconBtn variant="outline" icon={FaChevronRight} label="Наступний місяць" disabled={ym >= current} onClick={() => setYm(m => shiftMonth(m, 1))} />
            </div>

            {rows === null ? <Skeleton rows={4} /> : (<>
                <div className="px-3.5 py-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 border-b border-slate-100">
                    <Num label="усього за місяць" value={uah(sum.total)} strong />
                    <Num label={`пальне${sum.liters ? ` · ${fmtL(sum.liters)}` : ''}`} value={uah(sum.fuel)} />
                    <Num label="запчастини" value={uah(sum.parts)} />
                    <Num label="робота (ТО, ремонт)" value={uah(sum.labor)} />
                </div>
                {list.length === 0 ? <div className="px-3.5 py-6 text-center text-[13px] text-slate-400">Авто компанії ще не додані</div> : (
                    <ul className="divide-y divide-slate-100">
                        {list.map(r => (
                            <VehicleRow key={r.v.id} r={r} open={open === r.v.id} onToggle={() => setOpen(o => (o === r.v.id ? null : r.v.id))}
                                me={me} can={can} onChanged={load} />
                        ))}
                    </ul>
                )}
            </>)}
        </section>
    );
}

const Num = ({ label, value, strong }) => (
    <div className={`rounded-lg px-2.5 py-2 ${strong ? 'bg-indigo-50' : 'bg-slate-50'}`}>
        <div className={`text-[17px] font-bold leading-tight tabular-nums ${strong ? 'text-indigo-800' : 'text-slate-800'}`}>{value}</div>
        <div className="text-[11.5px] text-slate-500 leading-tight mt-0.5">{label}</div>
    </div>
);

function VehicleRow({ r, open, onToggle, me, can, onChanged }) {
    const [adding, setAdding] = useState(null);   // 'service' | 'fuel' | null
    const [editing, setEditing] = useState(null); // id запису
    const v = r.v;

    const facts = [
        r.km != null ? kmText(r.km) : 'км — немає показників',
        r.days ? `${r.days} дн. у роботі` : null,
        r.drivers.length ? r.drivers.join(', ') : null,
    ].filter(Boolean).join(' · ');

    return (
        <li>
            <button type="button" onClick={onToggle} aria-expanded={open}
                className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 ${open ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-slate-900 break-words">
                        {vehicleTitle(v)}
                        {v.status === 'repair' && <Chip tone="warn" className="ml-1.5 align-middle">у ремонті</Chip>}
                    </div>
                    <div className="text-[12px] text-slate-500 break-words">{facts}</div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {r.fuelSum > 0 && <Chip tone="info" icon={FaGasPump}>{uah(r.fuelSum)}{r.liters ? ` · ${fmtL(r.liters)}` : ''}{r.per100 ? ` · ${(Math.round(r.per100 * 10) / 10).toLocaleString('uk-UA')} л/100` : ''}</Chip>}
                        {(r.parts > 0 || r.labor > 0) && <Chip tone="accent" icon={FaTools}>запч. {uah(r.parts)} · робота {uah(r.labor)}</Chip>}
                        {r.perKm != null && r.total > 0 && <Chip>≈ {(Math.round(r.perKm * 10) / 10).toLocaleString('uk-UA')} ₴/км</Chip>}
                        {r.odometer != null && <Chip>одометр {kmText(r.odometer)}</Chip>}
                        {r.lastSvc && <Chip tone="neutral">ост. ТО {fmtDate(r.lastSvc.expense_date)}{r.lastSvc.odometer ? `, ${kmText(r.lastSvc.odometer)}` : ''}</Chip>}
                    </div>
                </div>
                <b className="text-[15px] text-slate-900 tabular-nums whitespace-nowrap">{uah(r.total)}</b>
                <FaChevronDown size={10} className={`mt-1.5 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="px-3.5 pb-3 pt-1 bg-slate-50/70 border-t border-slate-100 space-y-2.5">
                    {can.add && !adding && (
                        <div className="flex flex-wrap gap-2 pt-1.5">
                            <Btn size="sm" variant="soft" icon={FaTools} onClick={() => { setAdding('service'); setEditing(null); }}>+ ТО / ремонт</Btn>
                            <Btn size="sm" variant="soft" icon={FaGasPump} onClick={() => { setAdding('fuel'); setEditing(null); }}>+ Пальне</Btn>
                        </div>
                    )}
                    {adding && (
                        <ExpenseForm vehicle={v} kind={adding} me={me}
                            onCancel={() => setAdding(null)} onSaved={() => { setAdding(null); onChanged(); }} />
                    )}

                    {r.rows.length === 0 && !adding ? (
                        <div className="text-[13px] text-slate-400 py-1.5">За цей місяць витрат не вносили</div>
                    ) : (
                        <ul className="space-y-2">
                            {r.rows.map(x => (editing === x.id ? (
                                <li key={x.id}>
                                    <ExpenseForm vehicle={v} row={x} me={me} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
                                </li>
                            ) : (
                                <ExpenseItem key={x.id} x={x} can={can} onEdit={() => { setEditing(x.id); setAdding(null); }} onChanged={onChanged} />
                            )))}
                        </ul>
                    )}

                    {r.reads.length > 0 && (
                        <details className="text-[12.5px] text-slate-600">
                            <summary className="cursor-pointer font-semibold text-slate-500 py-1">Показники одометра за місяць · {r.reads.length}</summary>
                            <ul className="mt-1 divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                                {r.reads.map((m, i) => (
                                    <li key={i} className="px-3 py-1.5 flex justify-between gap-3">
                                        <span>{fmtDate(m.log_date)} · {m.employee?.name || '—'}</span>
                                        <b className="tabular-nums">{kmText(m.odometer)}</b>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </div>
            )}
        </li>
    );
}

function ExpenseItem({ x, can, onEdit, onChanged }) {
    const toast = useToast();
    const [ask, setAsk] = useState(false);
    const k = EXPENSE_KINDS[x.kind] || EXPENSE_KINDS.other;
    const items = Array.isArray(x.items) ? x.items : [];

    const remove = async () => {
        const { error } = await supabase.from('vehicle_expenses').delete().eq('id', x.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Запис прибрано');
        onChanged();
    };

    return (
        <li className="bg-white rounded-lg border border-slate-200 p-2.5">
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold text-slate-500 tabular-nums">{fmtDate(x.expense_date)}</span>
                        <Chip tone={k.tone}>{k.label}</Chip>
                        {x.title && <span className="text-[13.5px] font-semibold text-slate-900 break-words">{x.title}</span>}
                    </div>
                    <div className="text-[12px] text-slate-500 mt-0.5 break-words">
                        {[x.odometer ? kmText(x.odometer) : null, x.liters ? fmtL(x.liters) : null, PAID_BY_LABEL[x.paid_by], x.employee?.name, x.note].filter(Boolean).join(' · ')}
                    </div>
                    {items.length > 0 && (
                        <ul className="mt-1.5 text-[12.5px] text-slate-700 space-y-0.5">
                            {items.map((it, i) => (
                                <li key={i} className="flex justify-between gap-3">
                                    <span className="min-w-0 break-words"><span className={`text-[11px] font-bold mr-1 ${it.kind === 'part' ? 'text-indigo-600' : 'text-amber-700'}`}>{it.kind === 'part' ? 'запч.' : 'робота'}</span>{it.name}</span>
                                    <span className="tabular-nums whitespace-nowrap">{uah(it.cost)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="text-right flex-shrink-0">
                    <b className="text-[14.5px] tabular-nums text-slate-900 whitespace-nowrap">{uah(x.amount)}</b>
                    {x.paid_by === 'own' && <div><Chip tone="warn">повернути</Chip></div>}
                </div>
            </div>
            {x.receipt_urls?.length > 0 && (
                <PhotoThumbs photos={x.receipt_urls} fileIds={x.receipt_fids} className="mt-2 grid grid-cols-5 sm:grid-cols-8 gap-1.5" size={200} />
            )}
            {(can.edit || can.delete) && (
                <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                    {ask ? (<>
                        <span className="text-[12.5px] text-rose-700 font-semibold">Прибрати запис?</span>
                        <Btn size="sm" variant="danger" onClick={remove}>Так</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setAsk(false)}>Ні</Btn>
                    </>) : (<>
                        {can.edit && <Btn size="sm" variant="ghost" icon={FaPen} onClick={onEdit}>Змінити</Btn>}
                        {can.delete && <Btn size="sm" variant="ghost" icon={FaTrash} onClick={() => setAsk(true)}>Прибрати</Btn>}
                    </>)}
                </div>
            )}
        </li>
    );
}

/* ТО, ремонт, пальне чи інше — додати або змінити, на місці */
function ExpenseForm({ vehicle, row = null, kind: startKind = 'service', me, onCancel, onSaved }) {
    const toast = useToast();
    const [kind, setKind] = useState(row?.kind || startKind);
    const [date, setDate] = useState(row?.expense_date || isoDay());
    const [odo, setOdo] = useState(row?.odometer != null ? String(row.odometer) : '');
    const [title, setTitle] = useState(row?.title || '');
    const [items, setItems] = useState(() => (Array.isArray(row?.items) && row.items.length
        ? row.items.map(i => ({ name: i.name || '', kind: i.kind === 'part' ? 'part' : 'work', cost: i.cost != null ? String(i.cost) : '' }))
        : [{ name: '', kind: 'part', cost: '' }, { name: '', kind: 'work', cost: '' }]));
    const [amount, setAmount] = useState(row?.kind === 'fuel' && row?.amount ? String(Number(row.amount)) : '');
    const [liters, setLiters] = useState(row?.liters ? String(Number(row.liters)) : '');
    const [paidBy, setPaidBy] = useState(row?.paid_by || 'company_card');
    const [note, setNote] = useState(row?.note || '');
    const [kept, setKept] = useState(() => (row?.receipt_urls || []).map((u, i) => ({ url: u, fid: row.receipt_fids?.[i] || '' })));
    const [files, setFiles] = useState([]);     // [{ id, file, url }]
    const [last, setLast] = useState(null);
    const [busy, setBusy] = useState('');
    const isFuel = kind === 'fuel';

    useEffect(() => { lastOdometer(vehicle.id, date).then(setLast).catch(() => setLast(null)); }, [vehicle.id, date]);
    useEffect(() => () => files.forEach(f => URL.revokeObjectURL(f.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

    const parts = items.filter(i => i.kind === 'part').reduce((s, i) => s + numOf(i.cost), 0);
    const labor = items.filter(i => i.kind !== 'part').reduce((s, i) => s + numOf(i.cost), 0);
    const setItem = (idx, p) => setItems(list => list.map((it, j) => (j === idx ? { ...it, ...p } : it)));

    const save = async () => {
        const goodItems = items.filter(i => i.name.trim() || numOf(i.cost) > 0)
            .map(i => ({ name: i.name.trim() || (i.kind === 'part' ? 'Запчастини' : 'Робота'), kind: i.kind, cost: numOf(i.cost) }));
        if (isFuel && !(numOf(amount) > 0)) { toast('Вкажіть суму заправки', 'error'); return; }
        if (!isFuel && !goodItems.some(i => i.cost > 0)) { toast('Вкажіть хоча б одну позицію з ціною', 'error'); return; }
        if (!isFuel && !title.trim()) { toast('Напишіть коротко, що робили', 'error'); return; }
        try {
            let uploaded = [];
            if (files.length) {
                setBusy('Завантажую чеки…');
                uploaded = await uploadReceipts({ files: files.map(f => f.file), vehicle, by: me?.name, docType: isFuel ? 'Чек пального' : 'ТО і ремонт авто' });
            }
            setBusy('Зберігаю…');
            const receipts = [...kept, ...uploaded];
            const payload = {
                vehicle_id: vehicle.id, kind, expense_date: date,
                odometer: numOf(odo) > 0 ? Math.round(numOf(odo)) : null,
                title: isFuel ? null : title.trim(), items: isFuel ? [] : goodItems,
                amount: isFuel ? numOf(amount) : 0, liters: isFuel && numOf(liters) > 0 ? numOf(liters) : null,
                paid_by: paidBy, note: note.trim() || null,
                receipt_urls: receipts.map(r => r.url), receipt_fids: receipts.map(r => r.fid || ''),
            };
            const { error } = row
                ? await supabase.from('vehicle_expenses').update(payload).eq('id', row.id)
                : await supabase.from('vehicle_expenses').insert({ ...payload, employee_id: me?.id || null, created_by: me?.id || null });
            if (error) throw error;
            toast(row ? 'Запис оновлено' : `${EXPENSE_KINDS[kind].label}: збережено`, 'success');
            onSaved();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy('');
        }
    };

    const tooLow = last && numOf(odo) > 0 && numOf(odo) < last.value && !row;

    return (
        <div className="bg-white rounded-lg border border-indigo-200 ring-2 ring-indigo-50 p-3 space-y-2.5"
            onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
            <div className="flex flex-wrap gap-1.5">
                {Object.entries(EXPENSE_KINDS).map(([k, x]) => (
                    <button key={k} type="button" onClick={() => setKind(k)} className={chip(kind === k)}>{x.label}</button>
                ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
                <label className="block min-w-0">
                    <span className={T.label}>Дата</span>
                    <input type="date" className={`${T.input} h-10 mt-1`} value={date} max={isoDay()} onChange={e => setDate(e.target.value)} />
                </label>
                <label className="block min-w-0">
                    <span className={T.label}>Одометр, км</span>
                    <input inputMode="numeric" className={`${T.input} h-10 mt-1 tabular-nums ${tooLow ? 'border-rose-400' : ''}`} value={odo}
                        onChange={e => setOdo(e.target.value.replace(/[^\d]/g, ''))} placeholder={last ? String(last.value) : ''} />
                    {last && <span className={`block text-[11.5px] mt-0.5 ${tooLow ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>останній: {kmText(last.value)}, {fmtDate(last.date)}</span>}
                </label>
            </div>

            {isFuel ? (
                <div className="grid grid-cols-2 gap-2">
                    <label className="block min-w-0">
                        <span className={T.label}>Сума, ₴</span>
                        <input inputMode="decimal" className={`${T.input} h-10 mt-1 tabular-nums`} value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} autoFocus />
                    </label>
                    <label className="block min-w-0">
                        <span className={T.label}>Літри</span>
                        <input inputMode="decimal" className={`${T.input} h-10 mt-1 tabular-nums`} value={liters} onChange={e => setLiters(e.target.value.replace(/[^\d.,]/g, ''))} />
                    </label>
                </div>
            ) : (<>
                <label className="block">
                    <span className={T.label}>Що робили</span>
                    <input className={`${T.input} h-10 mt-1`} value={title} onChange={e => setTitle(e.target.value)} placeholder="Напр. заміна шин, ТО-2, гальмівні колодки" autoFocus={!row} />
                </label>
                <div>
                    <span className={T.label}>Позиції — запчастини й робота окремо</span>
                    <div className="mt-1 space-y-1.5">
                        {items.map((it, i) => (
                            <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-1.5 ${i ? 'pt-1.5 border-t border-slate-100 sm:border-0 sm:pt-0' : ''}`}>
                                <div className="flex items-center gap-1.5">
                                    <span className="inline-flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0">
                                        {[['part', 'Запчастини'], ['work', 'Робота']].map(([k, l]) => (
                                            <button key={k} type="button" onClick={() => setItem(i, { kind: k })}
                                                className={`h-9 px-2.5 text-[12px] font-semibold ${it.kind === k ? (k === 'part' ? 'bg-indigo-600 text-white' : 'bg-amber-500 text-white') : 'bg-white text-slate-500'}`}>{l}</button>
                                        ))}
                                    </span>
                                    <span className="ml-auto sm:hidden">
                                        <IconBtn icon={FaTimes} label="Прибрати позицію" onClick={() => setItems(list => list.filter((_, j) => j !== i))} />
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    <input className={`${T.input} h-9 flex-1 min-w-0`} value={it.name} onChange={e => setItem(i, { name: e.target.value })}
                                        placeholder={it.kind === 'part' ? 'Шини 4 шт, масло, фільтр…' : 'Шиномонтаж, заміна масла…'} />
                                    <input inputMode="decimal" className={`${T.input} h-9 !w-24 flex-shrink-0 tabular-nums`} value={it.cost} onChange={e => setItem(i, { cost: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="₴" aria-label="Ціна" />
                                    <span className="hidden sm:inline-flex">
                                        <IconBtn icon={FaTimes} label="Прибрати позицію" onClick={() => setItems(list => list.filter((_, j) => j !== i))} />
                                    </span>
                                </div>
                            </div>
                        ))}
                        <div className="flex flex-wrap items-center gap-2">
                            <Btn size="sm" variant="ghost" icon={FaPlus} onClick={() => setItems(list => [...list, { name: '', kind: 'part', cost: '' }])}>Позиція</Btn>
                            <span className="ml-auto text-[12.5px] text-slate-600 tabular-nums">
                                запч. <b>{uah(parts)}</b> · робота <b>{uah(labor)}</b> · усього <b className="text-slate-900">{uah(parts + labor)}</b>
                            </span>
                        </div>
                    </div>
                </div>
            </>)}

            <div>
                <span className={T.label}>Хто платив</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {PAID_BY.map(p => <button key={p.value} type="button" onClick={() => setPaidBy(p.value)} className={chip(paidBy === p.value)}>{p.label}</button>)}
                </div>
            </div>

            <div>
                <span className={T.label}>Чеки, фото</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {kept.map((r, i) => (
                        <span key={`k${i}`} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                            {r.fid && <img src={`https://drive.google.com/thumbnail?id=${encodeURIComponent(r.fid)}&sz=w160-h160`} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                            <button type="button" onClick={() => setKept(list => list.filter((_, j) => j !== i))} aria-label="Прибрати чек"
                                className="absolute top-0.5 right-0.5 w-6 h-6 rounded-md bg-slate-900/80 text-white flex items-center justify-center"><FaTimes size={9} /></button>
                        </span>
                    ))}
                    {files.map(f => (
                        <span key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                            {f.file.type?.startsWith('image/')
                                ? <img src={f.url} alt="" className="w-full h-full object-cover" />
                                : <span className="text-[11px] font-bold text-slate-500">PDF</span>}
                            <button type="button" onClick={() => setFiles(list => { URL.revokeObjectURL(f.url); return list.filter(x => x.id !== f.id); })} aria-label="Прибрати фото"
                                className="absolute top-0.5 right-0.5 w-6 h-6 rounded-md bg-slate-900/80 text-white flex items-center justify-center"><FaTimes size={9} /></button>
                        </span>
                    ))}
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-500 cursor-pointer hover:border-indigo-300">
                        <FaCamera size={14} />
                        <span className="text-[10.5px] font-semibold mt-0.5">Додати</span>
                        <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={e => {
                            const list = [...(e.target.files || [])];
                            setFiles(x => [...x, ...list.map(file => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file, url: URL.createObjectURL(file) }))]);
                            e.target.value = '';
                        }} />
                    </label>
                </div>
            </div>

            <input className={`${T.input} h-10`} value={note} onChange={e => setNote(e.target.value)} placeholder="Примітка: де робили, гарантія…" />

            <div className="flex flex-wrap gap-2">
                <Btn variant="accent" icon={FaCheck} onClick={save} disabled={!!busy}>{busy || (row ? 'Зберегти' : 'Додати')}</Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={!!busy}>Скасувати</Btn>
            </div>
        </div>
    );
}
