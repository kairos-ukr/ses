// =====================================================================
//  K-CORE · «Працівники → Виплати» (окреме право «Виплати працівникам»)
//
//  Три вкладки:
//   • Дні до оплати — по кожному монтажнику: з якого дня ще не оплачено
//     (після останнього «оплачено по …»), скільки днів на об'єктах, з них
//     у відрядженні, ставка за день, добові, разом. «Оплачено по …» —
//     позначили, і ці дні вже не рахуються вдруге (pay_periods).
//     У кого ставки за день немає (на окладі) — дні й добові все одно
//     видно й позначаються.
//   • Заявки за км — що люди самі подали на оплату за км на своєму авто
//     (у «Монтажі» → Я → Пробіг → «Подати на оплату»): «Оплачено» або
//     «Відхилити» (тоді км знову можна виправити й подати). Нижче — хто
//     скільки накопичив і ще не подав.
//   • Пальне — повернути: заправки за свої гроші з чеками від водіїв.
//  Зверху — добові (₴ за день відрядження) і ставка за км на своєму авто.
//  db/2026-11_payroll.sql
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheck, FaTimes, FaChevronDown, FaWallet, FaCar, FaGasPump, FaSuitcase, FaUndo } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, Segmented, Skeleton, Tip, EmptyState, useToast, humanError } from '../ui';
import { PhotoThumbs } from '../ui/MediaViewer';
import { inSchedule } from '../domain/access';
import { fetchAll } from '../utils/fetchAll';
import { getSetting, saveSetting } from '../utils/settings';
import { uah, numOf, vehicleTitle } from './fleet/fleetData';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const shiftDay = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const fmt = (s) => (s ? parseDay(String(s).slice(0, 10)).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '—');
const fmtY = (s) => (s ? parseDay(String(s).slice(0, 10)).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
const kmTxt = (n) => `${(Math.round(Number(n || 0) * 10) / 10).toLocaleString('uk-UA')} км`;

export default function PayrollPage() {
    const auth = useAuth();
    const toast = useToast();
    const canEdit = auth.can('payroll', 'edit') || auth.can('payroll', 'add');
    const canDelete = auth.can('payroll', 'delete');
    const me = auth.employee;
    const [tab, setTab] = useState('days');
    const [cfg, setCfg] = useState({ perDiem: '', kmRate: '' });
    const [counts, setCounts] = useState({ km: 0, fuel: 0 });
    const setKmCount = useCallback((n) => setCounts(c => ({ ...c, km: n })), []);
    const setFuelCount = useCallback((n) => setCounts(c => ({ ...c, fuel: n })), []);

    useEffect(() => {
        Promise.all([getSetting('per_diem', { fresh: true }), getSetting('km_rate', { fresh: true })])
            .then(([p, k]) => setCfg({ perDiem: p?.amount != null ? String(p.amount) : '', kmRate: k?.rate != null ? String(k.rate) : '' }))
            .catch(() => {});
    }, []);

    const saveCfg = async (key, field, value) => {
        const n = numOf(value);
        try {
            await saveSetting(key, value === '' ? null : { [field]: n }, me?.id);
            toast(key === 'per_diem' ? `Добові: ${uah(n)} за день` : `Своє авто: ${n.toLocaleString('uk-UA')} ₴ за км`, 'success');
        } catch (e) { toast(humanError(e), 'error'); }
    };

    return (
        <div className="p-3 sm:p-5 max-w-[1200px] mx-auto pb-24 lg:pb-8 space-y-3">
            <div className={`${T.card} px-3.5 py-3 flex flex-wrap items-end gap-3`}>
                <label className="block">
                    <span className={`${T.label} inline-flex items-center gap-1`}><FaSuitcase size={10} /> Добові, ₴ за день відрядження</span>
                    <input inputMode="decimal" disabled={!canEdit} value={cfg.perDiem} onChange={e => setCfg(c => ({ ...c, perDiem: e.target.value.replace(/[^\d.,]/g, '') }))}
                        onBlur={e => saveCfg('per_diem', 'amount', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        placeholder="напр. 300" className={`${T.input} h-10 mt-1 w-40 tabular-nums`} />
                </label>
                <label className="block">
                    <span className={`${T.label} inline-flex items-center gap-1`}><FaCar size={10} /> Своє авто, ₴ за км</span>
                    <input inputMode="decimal" disabled={!canEdit} value={cfg.kmRate} onChange={e => setCfg(c => ({ ...c, kmRate: e.target.value.replace(/[^\d.,]/g, '') }))}
                        onBlur={e => saveCfg('km_rate', 'rate', e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        placeholder="напр. 5" className={`${T.input} h-10 mt-1 w-40 tabular-nums`} />
                </label>
                <Tip width={300} text="Ставка за км підставляється в заявку в момент, коли людина її подає. Добові — за кожен день відрядження (позначка «Відрядження» на об'єкті в Календарі)." />
            </div>

            <Segmented value={tab} onChange={setTab} options={[
                { value: 'days', label: 'Дні до оплати' },
                { value: 'km', label: `Заявки за км${counts.km ? ` · ${counts.km}` : ''}` },
                { value: 'fuel', label: `Пальне — повернути${counts.fuel ? ` · ${counts.fuel}` : ''}` },
            ]} />

            {tab === 'days' && <DaysTab perDiem={numOf(cfg.perDiem)} me={me} canEdit={canEdit} canDelete={canDelete} />}
            {tab === 'km' && <KmTab me={me} canEdit={canEdit} onCount={setKmCount} />}
            {tab === 'fuel' && <FuelTab me={me} canEdit={canEdit} onCount={setFuelCount} />}
            {/* Лічильники вкладок — щоб видно було й з інших вкладок */}
            <Counter onCount={setCounts} />
        </div>
    );
}

/* Скільки чекає: заявок за км і заправок за свої гроші */
function Counter({ onCount }) {
    useEffect(() => {
        Promise.all([
            supabase.from('payout_requests').select('id', { count: 'exact', head: true }).eq('status', 'submitted'),
            supabase.from('vehicle_expenses').select('id', { count: 'exact', head: true }).eq('paid_by', 'own').is('reimbursed_at', null),
        ]).then(([a, b]) => onCount({ km: a.count || 0, fuel: b.count || 0 })).catch(() => {});
    }, [onCount]);
    return null;
}

/* ---------------------------------------------------------------------
 *  Дні до оплати
 * ------------------------------------------------------------------- */
function DaysTab({ perDiem, me, canEdit, canDelete }) {
    const toast = useToast();
    const today = isoDay();
    const [data, setData] = useState(null);
    const [open, setOpen] = useState(null);       // людина, в якої розгорнуто
    const [marking, setMarking] = useState(null); // { id, from, to }

    const load = useCallback(async () => {
        const [e, p] = await Promise.all([
            supabase.from('employees').select('id, custom_id, name, role, tier, in_schedule, day_rate, employment_type, hidden_from_list, access_blocked_at').order('name'),
            supabase.from('pay_periods').select('*').order('period_to', { ascending: false }).limit(1000),
        ]);
        const people = (e.data || []).filter(x => !x.access_blocked_at && inSchedule(x) && !x.hidden_from_list);
        const lastTo = new Map();
        (p.data || []).forEach(r => { if (!lastTo.has(r.employee_id)) lastTo.set(r.employee_id, r.period_to); });
        const monthStart = `${today.slice(0, 7)}-01`;
        const fromOf = (x) => (lastTo.get(x.id) ? shiftDay(lastTo.get(x.id), 1) : monthStart);
        const minFrom = people.reduce((m, x) => (fromOf(x) < m ? fromOf(x) : m), monthStart);
        const [w, a] = await Promise.all([
            fetchAll(() => supabase.from('installation_workers').select('employee_custom_id, work_date, business_trip')
                .gte('work_date', minFrom).lte('work_date', today).not('employee_custom_id', 'is', null).order('id')),
            fetchAll(() => supabase.from('attendance').select('employee_custom_id, work_date, status')
                .gte('work_date', minFrom).lte('work_date', today).in('status', ['OFF', 'VACATION', 'SICK_LEAVE']).order('id')),
        ]);
        setData({ people, periods: p.data || [], work: w, absent: a, fromOf });
    }, [today]);

    useEffect(() => { load(); }, [load]);

    // Дні людини за період: на об'єктах (без відсутніх), з них відрядження
    const daysOf = useCallback((x, from, to) => {
        if (!data) return { days: 0, trips: 0 };
        const off = new Set(data.absent.filter(r => r.employee_custom_id === x.custom_id).map(r => r.work_date));
        const rows = data.work.filter(r => r.employee_custom_id === x.custom_id && r.work_date >= from && r.work_date <= to && !off.has(r.work_date));
        return { days: new Set(rows.map(r => r.work_date)).size, trips: new Set(rows.filter(r => r.business_trip).map(r => r.work_date)).size };
    }, [data]);

    const rows = useMemo(() => (data ? data.people.map(x => {
        const from = data.fromOf(x);
        const { days, trips } = from <= today ? daysOf(x, from, today) : { days: 0, trips: 0 };
        const rate = Number(x.day_rate) || 0;
        return { x, from, days, trips, rate, total: days * rate + trips * perDiem };
    }) : []), [data, daysOf, today, perDiem]);

    const setRate = async (x, value) => {
        const n = value === '' ? null : numOf(value);
        if ((Number(x.day_rate) || null) === n) return;
        const { error } = await supabase.from('employees').update({ day_rate: n }).eq('id', x.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`${x.name}: ставка ${n ? uah(n) : 'не задана'}`, 'success');
        load();
    };

    const markPaid = async (r) => {
        const { from, to } = marking;
        if (!to || to < from) { toast('Дата «по» — не раніше, ніж «з»', 'error'); return; }
        const { days, trips } = daysOf(r.x, from, to);
        const { error } = await supabase.from('pay_periods').insert({
            employee_id: r.x.id, period_from: from, period_to: to, work_days: days, trip_days: trips,
            day_rate: r.rate || null, per_diem: perDiem || null,
            amount: r.rate || perDiem ? days * r.rate + trips * perDiem : null, paid_by: me?.id || null,
        });
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`${r.x.name}: оплачено по ${fmt(to)}`, 'success');
        setMarking(null);
        load();
    };

    const undo = async (p) => {
        const { error } = await supabase.from('pay_periods').delete().eq('id', p.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Позначку прибрано — ці дні знову до оплати');
        load();
    };

    if (!data) return <div className={T.card}><Skeleton rows={8} /></div>;
    const sum = rows.reduce((s, r) => s + r.total, 0);

    return (
        <section className={`${T.card} overflow-hidden`}>
            <div className="px-3.5 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2 text-[13px] text-slate-600">
                <span className="mr-auto">До оплати разом: <b className="text-slate-900 tabular-nums">{uah(sum)}</b></span>
                <Tip width={300} text="Дні — з графіка: кожен день, коли людина стояла на об'єкті (крім відпустки й лікарняного). Рахуються з дня після останнього «оплачено по…», а якщо ще не позначали — з 1-го числа місяця." />
            </div>
            <ul className="divide-y divide-slate-100">
                {rows.map(r => {
                    const isOpen = open === r.x.id;
                    const hist = data.periods.filter(p => p.employee_id === r.x.id).slice(0, 6);
                    const mk = marking?.id === r.x.id ? marking : null;
                    return (
                        <li key={r.x.id}>
                            <div className="px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                <button type="button" onClick={() => setOpen(isOpen ? null : r.x.id)} aria-expanded={isOpen} className="min-w-0 flex-1 basis-[200px] text-left">
                                    <span className="block text-[13.5px] font-semibold text-slate-900 break-words">
                                        {r.x.name}{r.x.employment_type === 'temporary' && <span className="text-[11.5px] font-normal text-slate-400"> · тимчасовий</span>}
                                    </span>
                                    <span className="block text-[12px] text-slate-500">
                                        не оплачено з {fmt(r.from)} · <b className="text-slate-700">{r.days}</b> дн.{r.trips ? <> · відрядження <b className="text-amber-700">{r.trips}</b></> : null}
                                    </span>
                                </button>
                                <label className="flex items-center gap-1 text-[12px] text-slate-500">
                                    <input inputMode="decimal" disabled={!canEdit} defaultValue={r.rate || ''} key={`${r.x.id}-${r.rate}`}
                                        onBlur={e => setRate(r.x, e.target.value.replace(/[^\d.,]/g, ''))} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                        placeholder="ставка" aria-label={`Ставка за день: ${r.x.name}`}
                                        className={`${T.input} h-9 w-24 tabular-nums`} /> ₴/день
                                </label>
                                <b className="text-[14px] text-slate-900 tabular-nums w-24 text-right">{r.rate || (r.trips && perDiem) ? uah(r.total) : '—'}</b>
                                {canEdit && !mk && (
                                    <Btn size="sm" variant="soft" icon={FaCheck} onClick={() => setMarking({ id: r.x.id, from: r.from, to: today })}>Оплачено по…</Btn>
                                )}
                                <FaChevronDown size={10} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </div>
                            {mk && (() => {
                                const c = daysOf(r.x, mk.from, mk.to);
                                return (
                                    <div className="mx-3.5 mb-2.5 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5 flex flex-wrap items-end gap-2">
                                        <label className="block"><span className={T.label}>з</span>
                                            <input type="date" value={mk.from} max={mk.to} onChange={e => setMarking(m => ({ ...m, from: e.target.value }))} className={`${T.input} h-9 mt-0.5`} /></label>
                                        <label className="block"><span className={T.label}>по</span>
                                            <input type="date" value={mk.to} min={mk.from} max={today} onChange={e => setMarking(m => ({ ...m, to: e.target.value }))} className={`${T.input} h-9 mt-0.5`} /></label>
                                        <span className="text-[12.5px] text-slate-700 pb-2">
                                            {c.days} дн.{c.trips ? `, відрядження ${c.trips}` : ''} · <b>{r.rate || perDiem ? uah(c.days * r.rate + c.trips * perDiem) : 'без суми'}</b>
                                        </span>
                                        <span className="flex gap-1.5 ml-auto">
                                            <Btn size="sm" variant="accent" icon={FaCheck} onClick={() => markPaid(r)}>Позначити оплаченим</Btn>
                                            <Btn size="sm" variant="ghost" onClick={() => setMarking(null)}>Скасувати</Btn>
                                        </span>
                                    </div>
                                );
                            })()}
                            {isOpen && (
                                <div className="px-3.5 pb-2.5 bg-slate-50/70 border-t border-slate-100">
                                    {hist.length === 0 ? <div className="py-2 text-[12.5px] text-slate-400">Ще не позначали оплачених днів</div> : (
                                        <ul className="divide-y divide-slate-100">
                                            {hist.map((p, i) => (
                                                <li key={p.id} className="py-1.5 flex flex-wrap items-center gap-x-3 text-[12.5px]">
                                                    <span className="text-slate-700">{fmtY(p.period_from)} — {fmtY(p.period_to)}</span>
                                                    <span className="text-slate-500">{p.work_days} дн.{p.trip_days ? `, відр. ${p.trip_days}` : ''}</span>
                                                    <b className="ml-auto tabular-nums">{p.amount != null ? uah(p.amount) : '—'}</b>
                                                    <span className="text-slate-400">оплачено {fmt(p.paid_at)}</span>
                                                    {canDelete && i === 0 && (
                                                        <button type="button" onClick={() => undo(p)} className="text-[12px] font-semibold text-rose-600 hover:underline inline-flex items-center gap-1"><FaUndo size={9} /> скасувати</button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/* ---------------------------------------------------------------------
 *  Заявки за км на своєму авто
 * ------------------------------------------------------------------- */
const REQ_STATUS = { submitted: { l: 'чекає', tone: 'warn' }, paid: { l: 'оплачено', tone: 'ok' }, rejected: { l: 'відхилено', tone: 'neutral' } };

function KmTab({ me, canEdit, onCount }) {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [rejecting, setRejecting] = useState(null);   // { id, note }
    const [showDone, setShowDone] = useState(false);

    const load = useCallback(async () => {
        const [r, m] = await Promise.all([
            supabase.from('payout_requests').select('*, employee:employees(name)').order('submitted_at', { ascending: false }).limit(200),
            supabase.from('car_mileage').select('employee_id, work_km, log_date, employee:employees(name)').is('vehicle_id', null).is('request_id', null).gt('work_km', 0),
        ]);
        const pend = new Map();
        (m.data || []).forEach(x => {
            const p = pend.get(x.employee_id) || { name: x.employee?.name, km: 0, days: 0, from: x.log_date };
            p.km += Number(x.work_km) || 0; p.days += 1; if (x.log_date < p.from) p.from = x.log_date;
            pend.set(x.employee_id, p);
        });
        const list = r.data || [];
        onCount(list.filter(x => x.status === 'submitted').length);
        setData({ list, pending: [...pend.values()].sort((a, b) => b.km - a.km) });
    }, [onCount]);

    useEffect(() => { load(); }, [load]);

    const decide = async (req, status, note = null) => {
        const { error } = await supabase.from('payout_requests')
            .update({ status, decided_at: new Date().toISOString(), decided_by: me?.id || null, decision_note: note || null }).eq('id', req.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(status === 'paid' ? `${req.employee?.name}: оплачено ${uah(req.amount)}` : 'Заявку відхилено — км знову можна виправити й подати', status === 'paid' ? 'success' : 'info');
        setRejecting(null);
        load();
    };

    if (!data) return <div className={T.card}><Skeleton rows={6} /></div>;
    const waiting = data.list.filter(x => x.status === 'submitted');
    const done = data.list.filter(x => x.status !== 'submitted');

    const Row = ({ x }) => (
        <li className="px-3.5 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="min-w-0 flex-1 basis-[200px]">
                <div className="text-[13.5px] font-semibold text-slate-900 break-words">{x.employee?.name || '—'}</div>
                <div className="text-[12px] text-slate-500">
                    {fmt(x.period_from)} — {fmt(x.period_to)} · {kmTxt(x.km)} × {x.rate != null ? `${Number(x.rate).toLocaleString('uk-UA')} ₴` : 'ставки немає'} · подано {fmt(x.submitted_at)}
                    {x.note ? ` · ${x.note}` : ''}{x.decision_note ? ` · ${x.decision_note}` : ''}
                </div>
            </div>
            <b className="text-[14px] tabular-nums text-slate-900">{uah(x.amount)}</b>
            <Chip tone={REQ_STATUS[x.status]?.tone}>{REQ_STATUS[x.status]?.l}</Chip>
            {canEdit && x.status === 'submitted' && rejecting?.id !== x.id && (
                <span className="flex gap-1.5">
                    <Btn size="sm" variant="accent" icon={FaCheck} onClick={() => decide(x, 'paid')}>Оплачено</Btn>
                    <Btn size="sm" variant="ghost" icon={FaTimes} onClick={() => setRejecting({ id: x.id, note: '' })}>Відхилити</Btn>
                </span>
            )}
            {rejecting?.id === x.id && (
                <span className="w-full flex flex-wrap gap-1.5">
                    <input autoFocus value={rejecting.note} onChange={e => setRejecting(r => ({ ...r, note: e.target.value }))} placeholder="Чому (людина побачить)"
                        className={`${T.input} h-9 flex-1 min-w-[180px]`} />
                    <Btn size="sm" variant="danger" onClick={() => decide(x, 'rejected', rejecting.note.trim())}>Відхилити</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setRejecting(null)}>Скасувати</Btn>
                </span>
            )}
        </li>
    );

    return (<>
        <section className={`${T.card} overflow-hidden`}>
            <div className="px-3.5 py-2.5 border-b border-slate-100 text-[14px] font-bold text-slate-900 inline-flex items-center gap-2 w-full">
                <FaCar size={12} className="text-indigo-500" /> Подали на оплату
            </div>
            {waiting.length === 0 ? <EmptyState icon={FaWallet} title="Нових заявок немає" hint="Людина сама подає км на оплату в «Монтажі»: Я → Пробіг → «Подати на оплату»." /> : (
                <ul className="divide-y divide-slate-100">{waiting.map(x => <Row key={x.id} x={x} />)}</ul>
            )}
            {done.length > 0 && (
                <button type="button" onClick={() => setShowDone(v => !v)} className="w-full py-2 border-t border-slate-100 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                    {showDone ? 'Сховати оплачені й відхилені' : `Оплачені й відхилені · ${done.length}`}
                </button>
            )}
            {showDone && <ul className="divide-y divide-slate-100 border-t border-slate-100">{done.map(x => <Row key={x.id} x={x} />)}</ul>}
        </section>

        {data.pending.length > 0 && (
            <section className={`${T.card} overflow-hidden`}>
                <div className="px-3.5 py-2.5 border-b border-slate-100 text-[13.5px] font-bold text-slate-700">Накопичили, ще не подали</div>
                <ul className="divide-y divide-slate-100">
                    {data.pending.map((p, i) => (
                        <li key={i} className="px-3.5 py-2 flex items-center gap-3 text-[13px]">
                            <span className="min-w-0 flex-1 break-words font-semibold text-slate-800">{p.name}</span>
                            <span className="text-slate-500">з {fmt(p.from)} · {p.days} дн.</span>
                            <b className="tabular-nums">{kmTxt(p.km)}</b>
                        </li>
                    ))}
                </ul>
            </section>
        )}
    </>);
}

/* ---------------------------------------------------------------------
 *  Пальне за свої гроші — повернути
 * ------------------------------------------------------------------- */
function FuelTab({ me, canEdit, onCount }) {
    const toast = useToast();
    const [rows, setRows] = useState(null);
    const [showDone, setShowDone] = useState(false);

    const load = useCallback(async () => {
        const { data } = await supabase.from('vehicle_expenses')
            .select('id, expense_date, amount, liters, receipt_urls, receipt_fids, reimbursed_at, employee:employees!vehicle_expenses_employee_id_fkey(name), vehicle:vehicles(name, plate)')
            .eq('paid_by', 'own').order('expense_date', { ascending: false }).limit(200);
        const list = data || [];
        onCount(list.filter(x => !x.reimbursed_at).length);
        setRows(list);
    }, [onCount]);

    useEffect(() => { load(); }, [load]);

    const setDone = async (x, done) => {
        const { error } = await supabase.from('vehicle_expenses')
            .update({ reimbursed_at: done ? new Date().toISOString() : null, reimbursed_by: done ? me?.id || null : null }).eq('id', x.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(done ? `${x.employee?.name}: повернуто ${uah(x.amount)}` : 'Знову до повернення', done ? 'success' : 'info');
        load();
    };

    if (!rows) return <div className={T.card}><Skeleton rows={5} /></div>;
    const waiting = rows.filter(x => !x.reimbursed_at);
    const done = rows.filter(x => x.reimbursed_at);
    const sum = waiting.reduce((s, x) => s + Number(x.amount || 0), 0);

    const Row = ({ x }) => (
        <li className="px-3.5 py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1.5">
            <div className="min-w-0 flex-1 basis-[200px]">
                <div className="text-[13.5px] font-semibold text-slate-900 break-words">{x.employee?.name || '—'}</div>
                <div className="text-[12px] text-slate-500 break-words">{fmt(x.expense_date)} · {vehicleTitle(x.vehicle)}{x.liters ? ` · ${Number(x.liters).toLocaleString('uk-UA')} л` : ''}</div>
                {x.receipt_urls?.length > 0 && <PhotoThumbs photos={x.receipt_urls} fileIds={x.receipt_fids} className="mt-1.5 grid grid-cols-6 sm:grid-cols-10 gap-1.5" size={160} />}
            </div>
            <b className="text-[14px] tabular-nums text-slate-900">{uah(x.amount)}</b>
            {canEdit && (x.reimbursed_at
                ? <Btn size="sm" variant="ghost" icon={FaUndo} onClick={() => setDone(x, false)}>Повернуто {fmt(x.reimbursed_at)}</Btn>
                : <Btn size="sm" variant="accent" icon={FaCheck} onClick={() => setDone(x, true)}>Повернуто</Btn>)}
        </li>
    );

    return (
        <section className={`${T.card} overflow-hidden`}>
            <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center gap-2 text-[14px] font-bold text-slate-900">
                <FaGasPump size={12} className="text-indigo-500" /> Заправлялись за свої
                <span className="ml-auto text-[13px] font-normal text-slate-600">до повернення: <b className="text-slate-900 tabular-nums">{uah(sum)}</b></span>
            </div>
            {waiting.length === 0 ? <EmptyState icon={FaGasPump} title="Усе повернуто" /> : <ul className="divide-y divide-slate-100">{waiting.map(x => <Row key={x.id} x={x} />)}</ul>}
            {done.length > 0 && (
                <button type="button" onClick={() => setShowDone(v => !v)} className="w-full py-2 border-t border-slate-100 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                    {showDone ? 'Сховати повернуті' : `Повернуті · ${done.length}`}
                </button>
            )}
            {showDone && <ul className="divide-y divide-slate-100 border-t border-slate-100">{done.map(x => <Row key={x.id} x={x} />)}</ul>}
        </section>
    );
}
