// =====================================================================
//  K-CORE · Монтаж · «Графік»
//
//  Мій тиждень з графіка робіт (наживо — офіс змінює, тут одразу видно).
//  Натиснути на день → тут же, без окремого вікна:
//   • відкрити об'єкт цього дня;
//   • поставити вихідний / відпустку / лікарняний — сам, без погодження.
//     Якщо в цей день людина вже в графіку, керівник отримує повідомлення
//     (тригер у базі), а рядок графіка лишається — заміну ставить офіс;
//   • скасувати свій вихідний;
//   • сьогодні без графіка — «Я сьогодні працюю на…» додає день у графік.
//  Нижче — історія виїздів: з неї й рахуються відпрацьовані дні.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronLeft, FaChevronRight, FaArrowRight, FaExclamationTriangle, FaSearch, FaHistory } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useToast, humanError } from '../ui';
import {
    useMontazh, useFresh, isoDay, shiftDay, weekStartOf, fmtDay, weekdayShort, dayNum, monthName, OFF_KEYS, OFF_LABEL, OFF_WHAT, SELF_SET_NOTE,
    loadObjects, groupVisits, visitTitle, objectTitle,
} from './data';
import { Screen, Card, Label, Pill, Big, Line, Empty, Loading } from './kit';

const HISTORY_DAYS = 90;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function ScheduleScreen() {
    const { who, people, canWrite } = useMontazh();
    const navigate = useNavigate();
    const toast = useToast();
    const today = isoDay();

    // Тиждень з понеділка по неділю; стрілками — попередній і наступні
    const [week, setWeek] = useState(0);
    const start = shiftDay(weekStartOf(today), week * 7);
    const days = useMemo(() => Array.from({ length: 7 }, (_, i) => shiftDay(start, i)), [start]);
    const end = days[6];

    const [loading, setLoading] = useState(true);
    const [visits, setVisits] = useState([]);
    const [crew, setCrew] = useState([]);
    const [offs, setOffs] = useState(new Map());     // дата → рядок attendance
    const [objects, setObjects] = useState(new Map());
    const [openDay, setOpenDay] = useState(null);
    const [busy, setBusy] = useState(false);

    const fresh = useFresh();
    const load = useCallback(async () => {
        if (who?.custom_id == null) return;
        const ok = fresh();
        const [mine, all, off] = await Promise.all([
            supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, work_date, notes')
                .eq('employee_custom_id', who.custom_id).gte('work_date', start).lte('work_date', end),
            supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, work_date, notes')
                .gte('work_date', start).lte('work_date', end),
            supabase.from('attendance').select('id, work_date, status, notes')
                .eq('employee_custom_id', who.custom_id).gte('work_date', start).lte('work_date', end).in('status', OFF_KEYS),
        ]);
        const my = groupVisits(mine.data);
        const objMap = await loadObjects(my.map(v => v.installationId));
        if (!ok()) return;
        setVisits(my);
        setCrew(groupVisits(all.data));
        setOffs(new Map((off.data || []).map(o => [o.work_date, o])));
        setObjects(objMap);
        setLoading(false);
    }, [who?.custom_id, start, end, fresh]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    useEffect(() => {
        let t;
        const bump = () => { clearTimeout(t); t = setTimeout(load, 500); };
        const ch = supabase.channel(`m-schedule-${who?.custom_id}`);
        ['installation_workers', 'attendance'].forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
        ch.subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load, who?.custom_id]);

    const crewOf = (v) => (crew.find(c => c.key === v.key)?.workerIds || [])
        .filter(id => id !== who.custom_id).map(id => people.get(id)?.name).filter(Boolean);

    const setOff = async (date, status) => {
        setBusy(true);
        const { error } = await supabase.from('attendance').upsert({
            employee_custom_id: who.custom_id, work_date: date, status, notes: SELF_SET_NOTE,
            source: null,   // бот повідомить у гілку графіка, як про вихідні з сайту
        }, { onConflict: 'employee_custom_id, work_date' });
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        const busyThatDay = visits.some(v => v.date === date);
        const done = `${cap(OFF_WHAT[status])} поставлено`;
        toast(busyThatDay ? `${done}. Офіс отримав повідомлення про заміну` : done, 'success');
        setOpenDay(null);
        load();
    };

    const cancelOff = async (row) => {
        setBusy(true);
        const { error } = await supabase.from('attendance').delete().eq('id', row.id);
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`${cap(OFF_WHAT[row.status])} скасовано`, 'success');
        setOpenDay(null);
        load();
    };

    const dm = { day: 'numeric', month: 'long' };
    const range = start.slice(0, 7) === end.slice(0, 7)
        ? `${dayNum(start)}–${fmtDay(end, dm)}`
        : `${fmtDay(start, dm)} – ${fmtDay(end, dm)}`;
    const weekLabel = week === 0 ? 'Цей тиждень' : week === 1 ? 'Наступний тиждень' : week === -1 ? 'Минулий тиждень' : null;

    return (
        <Screen title="Мій графік" sub={[weekLabel, range].filter(Boolean).join(' · ')}
            right={(
                <div className="flex gap-1.5 flex-shrink-0">
                    <button type="button" onClick={() => { setWeek(w => w - 1); setOpenDay(null); }} aria-label="Попередній тиждень" disabled={week <= -8}
                        className="w-11 h-11 rounded-xl border-2 border-slate-300 bg-white flex items-center justify-center disabled:opacity-30"><FaChevronLeft size={14} /></button>
                    <button type="button" onClick={() => { setWeek(w => w + 1); setOpenDay(null); }} aria-label="Наступний тиждень" disabled={week >= 4}
                        className="w-11 h-11 rounded-xl border-2 border-slate-300 bg-white flex items-center justify-center disabled:opacity-30"><FaChevronRight size={14} /></button>
                </div>
            )}>
            {loading ? <Loading /> : (
                <Card className="!py-1">
                    {days.map((d, i) => {
                        const dv = visits.filter(v => v.date === d);
                        const off = offs.get(d);
                        const isToday = d === today;
                        const past = d < today;
                        const isOpen = openDay === d;
                        return (
                            <div key={d} className={i ? 'border-t border-slate-100' : ''}>
                                <button type="button" onClick={() => setOpenDay(isOpen ? null : d)} aria-expanded={isOpen}
                                    className="w-full text-left grid grid-cols-[50px_minmax(0,1fr)] gap-3 py-2.5 items-center min-h-[60px]">
                                    <span className={`rounded-xl py-1 text-center leading-tight ${isToday ? 'bg-slate-900 text-white' : off ? 'bg-rose-50 text-rose-700' : past ? 'text-slate-400' : 'text-slate-900'}`}>
                                        <span className="block text-[12px] font-semibold">{weekdayShort(d)}</span>
                                        <span className="block text-[18px] font-bold tabular-nums">{dayNum(d)}</span>
                                    </span>
                                    <span className="min-w-0">
                                        {off && <Pill tone="bad" className="mb-1">{OFF_LABEL[off.status].toLowerCase()}</Pill>}
                                        {dv.map(v => (
                                            <span key={v.key} className={`block ${past ? 'text-slate-500' : ''}`}>
                                                <b className={`block text-[15px] break-words ${off ? 'line-through decoration-rose-400' : ''}`}>{visitTitle(v, objects)}</b>
                                                {crewOf(v).length > 0 && <span className="block text-[13px] text-slate-500 break-words">з {crewOf(v).join(', ')}</span>}
                                            </span>
                                        ))}
                                        {!off && !dv.length && <span className="text-[14px] text-slate-400">{past ? '—' : 'ще не заплановано'}</span>}
                                    </span>
                                </button>

                                {isOpen && (
                                    <DayPanel date={d} visits={dv} off={off} objects={objects} past={past} isToday={isToday}
                                        canWrite={canWrite} busy={busy} onSetOff={setOff} onCancelOff={cancelOff}
                                        onOpenObject={(id) => navigate(`/m/object/${id}`)} onAdded={() => { setOpenDay(null); load(); }} />
                                )}
                            </div>
                        );
                    })}
                </Card>
            )}

            <History />
        </Screen>
    );
}

/* Що можна зробити з днем — розкривається під ним */
function DayPanel({ date, visits, off, objects, past, isToday, canWrite, busy, onSetOff, onCancelOff, onOpenObject, onAdded }) {
    const [picking, setPicking] = useState(false);
    const withObject = visits.filter(v => v.installationId);
    return (
        <div className="pb-3 flex flex-col gap-2">
            {withObject.map(v => (
                <Big key={v.key} small tone="dark" after={FaArrowRight} onClick={() => onOpenObject(v.installationId)}>
                    {withObject.length > 1 ? objectTitle(objects.get(v.installationId)) : "Відкрити об'єкт"}
                </Big>
            ))}

            {!past && canWrite && (off ? (
                <Big small tone="danger" disabled={busy} onClick={() => onCancelOff(off)}>Скасувати {OFF_WHAT[off.status]}</Big>
            ) : (<>
                {visits.length > 0 && (
                    <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[13.5px] text-amber-900">
                        <FaExclamationTriangle size={13} className="mt-0.5 flex-shrink-0" />
                        <span>Ви в графіку цього дня. Якщо поставите вихідний, офіс отримає повідомлення, щоб знайти заміну.</span>
                    </div>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                    {['OFF', 'VACATION', 'SICK_LEAVE'].map(s => (
                        <Big key={s} small tone="soft" disabled={busy} onClick={() => onSetOff(date, s)} className="!px-1 !text-[14px]">{OFF_LABEL[s]}</Big>
                    ))}
                </div>
            </>))}

            {isToday && canWrite && !off && visits.length === 0 && (
                picking
                    ? <ObjectPicker date={date} onDone={onAdded} onCancel={() => setPicking(false)} />
                    : <Big small onClick={() => setPicking(true)}>Я сьогодні працюю на об'єкті…</Big>
            )}

            {past && !withObject.length && <div className="text-[13.5px] text-slate-500">Минулий день — змінює лише офіс.</div>}
        </div>
    );
}

/* Вибір об'єкта для «Я сьогодні працюю на…» */
function ObjectPicker({ date, onDone, onCancel }) {
    const { who } = useMontazh();
    const toast = useToast();
    const [q, setQ] = useState('');
    const [list, setList] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        supabase.from('installations').select('custom_id, name, client:clients(name, populated_place, oblast)')
            .in('status', ['in_progress', 'planning']).order('custom_id', { ascending: false }).limit(400)
            .then(({ data }) => setList(data || []));
    }, []);

    const found = useMemo(() => {
        const s = q.trim().toLowerCase();
        const all = list || [];
        if (!s) return all.slice(0, 8);
        return all.filter(o => `${objectTitle(o)} ${o.name || ''} ${o.custom_id}`.toLowerCase().includes(s)).slice(0, 12);
    }, [q, list]);

    const pick = async (o) => {
        setBusy(true);
        const { error } = await supabase.from('installation_workers').insert({
            installation_custom_id: o.custom_id, employee_custom_id: who.custom_id, work_date: date,
        });
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('День додано в графік — офіс бачить', 'success');
        onDone();
    };

    return (
        <div className="rounded-xl border-2 border-slate-900 bg-white p-2">
            <label className="flex items-center gap-2 px-2 h-11 rounded-lg border-2 border-slate-300 focus-within:border-slate-900">
                <FaSearch size={13} className="text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Місто, клієнт або номер" autoFocus
                    className="flex-1 min-w-0 outline-none text-[15px] bg-transparent" />
            </label>
            {list === null ? <Empty>Завантаження…</Empty> : found.length === 0 ? <Empty>Нічого не знайдено</Empty> : (
                <div className="mt-1">
                    {found.map((o, i) => (
                        <Line key={o.custom_id} first={i === 0} onClick={busy ? undefined : () => pick(o)}
                            right={<span className="text-[12.5px] text-slate-400">СЕС-{o.custom_id}</span>}>
                            {objectTitle(o)}
                        </Line>
                    ))}
                </div>
            )}
            <Big small tone="soft" className="mt-1" onClick={onCancel}>Скасувати</Big>
        </div>
    );
}

/* Історія виїздів за 3 місяці, по місяцях */
function History() {
    const { who } = useMontazh();
    const navigate = useNavigate();
    const [rows, setRows] = useState(null);
    const [objects, setObjects] = useState(new Map());
    const [offs, setOffs] = useState(new Set());
    const [limit, setLimit] = useState(12);

    useEffect(() => {
        let alive = true;
        (async () => {
            const today = isoDay();
            const from = shiftDay(today, -HISTORY_DAYS);
            const [w, a] = await Promise.all([
                supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, work_date, notes')
                    .eq('employee_custom_id', who.custom_id).gte('work_date', from).lt('work_date', today),
                supabase.from('attendance').select('work_date').eq('employee_custom_id', who.custom_id)
                    .gte('work_date', from).lt('work_date', today).in('status', OFF_KEYS),
            ]);
            const v = groupVisits(w.data).reverse();
            const objMap = await loadObjects(v.map(x => x.installationId));
            if (!alive) return;
            setObjects(objMap);
            setOffs(new Set((a.data || []).map(x => x.work_date)));
            setRows(v);
        })();
        return () => { alive = false; };
    }, [who.custom_id]);

    if (rows === null) return null;

    const months = [];
    rows.slice(0, limit).forEach(v => {
        const m = v.date.slice(0, 7);
        if (!months.length || months[months.length - 1].m !== m) months.push({ m, list: [] });
        months[months.length - 1].list.push(v);
    });
    const workedIn = (m) => new Set(rows.filter(v => v.date.startsWith(m) && !offs.has(v.date)).map(v => v.date)).size;

    return (
        <Card>
            <Label icon={FaHistory}>Історія виїздів</Label>
            {rows.length === 0 ? <Empty>За останні 3 місяці виїздів у графіку немає</Empty> : (<>
                {months.map(({ m, list }) => (
                    <div key={m} className="mb-1">
                        <div className="flex items-center justify-between pt-2 pb-1">
                            <span className="text-[13.5px] font-bold text-slate-900 first-letter:uppercase">{monthName(`${m}-15`)}</span>
                            <span className="text-[12.5px] text-slate-500">відпрацьовано днів: <b className="text-slate-900">{workedIn(m)}</b></span>
                        </div>
                        {list.map((v, i) => (
                            <Line key={v.key} first={i === 0}
                                onClick={v.installationId ? () => navigate(`/m/object/${v.installationId}`) : undefined}
                                right={offs.has(v.date) ? <Pill tone="bad">вихідний</Pill> : null}>
                                <span className="text-slate-500 tabular-nums">{fmtDay(v.date, { weekday: 'short', day: 'numeric' })}</span>
                                {' · '}<span className="text-slate-900 font-semibold">{visitTitle(v, objects)}</span>
                            </Line>
                        ))}
                    </div>
                ))}
                {rows.length > limit && <Big small tone="soft" className="mt-1" onClick={() => setLimit(l => l + 20)}>Показати ще · {rows.length - limit}</Big>}
            </>)}
        </Card>
    );
}
