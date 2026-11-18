// =====================================================================
//  K-CORE · «Працівники → Історія» — де працювала людина
//
//  Лише ті, хто в графіку монтажу (монтажники й бригадири; офіс — якщо
//  в картці ввімкнено «У графіку монтажу»). Ліворуч — люди з кількістю
//  днів на об'єктах і відряджень за період; праворуч — дні обраної
//  людини: об'єкт, з ким працювала, відрядження, чи здано звіт.
//  Зверху — підсумок періоду: виїзди, об'єкти, відрядження, вихідні
//  (дні без графіка пн–сб рахуються самі), відпустка й лікарняний.
//  Людина й період — в адресі (?p=…&r=…), тож посиланням можна
//  поділитися. На телефоні — спершу список, потім дні людини.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    FaChevronLeft, FaChevronRight, FaHistory, FaMapMarkerAlt, FaSuitcase, FaCheck, FaUsers, FaHardHat,
} from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { T, Chip, Segmented, Skeleton, EmptyState, SearchInput } from './ui';
import { inSchedule } from './domain/access';
import { fetchAll } from './utils/fetchAll';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const shiftDay = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const monthStart = (s, back = 0) => { const d = parseDay(s); return isoDay(new Date(d.getFullYear(), d.getMonth() - back, 1, 12)); };
const monthEnd = (s) => { const d = parseDay(s); return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };
const monthTitle = (s) => { const t = parseDay(s).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const daysWord = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'день';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'дні';
    return 'днів';
};

const ABSENCE = { OFF: 'вихідний', VACATION: 'відпустка', SICK_LEAVE: 'лікарняний' };

const RANGES = [
    { value: 'month', label: 'Цей місяць' },
    { value: 'prev', label: 'Минулий' },
    { value: 'q', label: '3 місяці' },
];

/** Межі періоду: від — до (включно) */
const rangeOf = (r, today) => {
    if (r === 'prev') { const from = monthStart(today, 1); return { from, to: monthEnd(from) }; }
    if (r === 'q') return { from: monthStart(today, 2), to: monthEnd(today) };
    return { from: monthStart(today), to: monthEnd(today) };
};

export default function EmployeeHistoryPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const today = isoDay();
    const range = RANGES.some(r => r.value === params.get('r')) ? params.get('r') : 'month';
    const { from, to } = rangeOf(range, today);
    const pickedId = params.get('p') ? Number(params.get('p')) : null;
    const setParam = (k, v) => setParams(prev => {
        const p = new URLSearchParams(prev);
        if (v == null || v === '') p.delete(k); else p.set(k, String(v));
        return p;
    }, { replace: true });

    const [people, setPeople] = useState(null);
    const [team, setTeam] = useState(null);     // рядки графіка всієї команди за період
    const [q, setQ] = useState('');

    useEffect(() => {
        supabase.from('employees').select('id, custom_id, name, position, role, tier, in_schedule, hidden_from_list, access_blocked_at')
            .order('name').then(({ data }) => setPeople(data || []));
    }, []);

    useEffect(() => {
        let alive = true;
        setTeam(null);
        fetchAll(() => supabase.from('installation_workers').select('employee_custom_id, work_date, business_trip')
            .gte('work_date', from).lte('work_date', to).not('employee_custom_id', 'is', null).order('id'))
            .then(rows => { if (alive) setTeam(rows); })
            .catch(() => { if (alive) setTeam([]); });
        return () => { alive = false; };
    }, [from, to]);

    // Скільки днів на об'єктах (до сьогодні) і відряджень — для списку людей
    const counts = useMemo(() => {
        const m = new Map();
        (team || []).forEach(r => {
            if (r.work_date > today) return;
            const c = m.get(r.employee_custom_id) || { days: new Set(), trips: new Set() };
            c.days.add(r.work_date);
            if (r.business_trip) c.trips.add(r.work_date);
            m.set(r.employee_custom_id, c);
        });
        return m;
    }, [team, today]);

    // У списку — лише ті, хто в графіку монтажу; прихований (тимчасовий) — якщо працював у цьому періоді
    const list = useMemo(() => (people || [])
        .filter(e => !e.access_blocked_at && inSchedule(e) && (!e.hidden_from_list || counts.has(e.custom_id)))
        .filter(e => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase())),
    [people, counts, q]);

    const picked = (people || []).find(e => e.custom_id === pickedId) || null;

    return (
        <div className="min-h-full bg-slate-100 pb-24">
            <div className="max-w-[1300px] mx-auto p-2 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[17px] font-bold text-slate-900 mr-auto inline-flex items-center gap-2">
                        <FaHistory size={13} className="text-indigo-500" />
                        {range === 'q' ? `${monthTitle(from)} — ${monthTitle(to)}` : monthTitle(from)}
                    </h2>
                    <Segmented value={range} onChange={(v) => setParam('r', v === 'month' ? null : v)} options={RANGES} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[330px_minmax(0,1fr)] gap-3 items-start">
                    {/* Люди — на телефоні ховаються, коли людину обрано */}
                    <section className={`${T.card} overflow-hidden ${picked ? 'hidden lg:block' : ''}`}>
                        <div className="p-2.5 border-b border-slate-100">
                            <SearchInput value={q} onChange={setQ} placeholder="Пошук людини" />
                        </div>
                        {people === null || team === null ? <Skeleton rows={8} /> : list.length === 0 ? (
                            <div className="px-4 py-8 text-center text-[13px] text-slate-400">Нікого не знайдено</div>
                        ) : (
                            <ul className="divide-y divide-slate-100 max-h-none lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
                                {list.map(e => {
                                    const c = counts.get(e.custom_id);
                                    const on = e.custom_id === pickedId;
                                    return (
                                        <li key={e.custom_id}>
                                            <button type="button" onClick={() => setParam('p', e.custom_id)} aria-current={on ? 'true' : undefined}
                                                className={`w-full text-left px-3.5 py-2.5 flex items-center gap-2 min-h-[52px] ${on ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                                                <span className="min-w-0 flex-1">
                                                    <span className={`block text-[13.5px] font-semibold break-words ${on ? 'text-indigo-800' : 'text-slate-800'}`}>{e.name}</span>
                                                    <span className="block text-[11.5px] text-slate-400 break-words">
                                                        {[Number(e.tier) === 1 && e.role === 'installer' ? 'бригадир' : null, e.role !== 'installer' ? (e.position || 'офіс') : null].filter(Boolean).join(' · ') || ' '}
                                                    </span>
                                                </span>
                                                <span className="flex-shrink-0 text-right">
                                                    <span className="block text-[13px] font-bold tabular-nums text-slate-800">{c ? c.days.size : 0}</span>
                                                    {c?.trips.size > 0 && <span className="block text-[11px] font-semibold text-amber-700 tabular-nums">відр. {c.trips.size}</span>}
                                                </span>
                                                <FaChevronRight size={10} className="text-slate-300 flex-shrink-0 lg:hidden" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    {/* Дні обраної людини */}
                    <div className={`min-w-0 ${picked ? '' : 'hidden lg:block'}`}>
                        {picked ? (
                            <PersonHistory key={`${picked.custom_id}-${from}`} person={picked} from={from} to={to} today={today}
                                onBack={() => setParam('p', null)} onOpen={(id) => navigate(`/project/${id}`)} />
                        ) : (
                            <div className={T.card}>
                                <EmptyState icon={FaUsers} title="Оберіть людину" hint="Ліворуч — скільки днів кожен працював на об'єктах за період." />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Одна людина: підсумок періоду і дні по місяцях
 * ------------------------------------------------------------------- */
function PersonHistory({ person, from, to, today, onBack, onOpen }) {
    const cid = person.custom_id;
    const [data, setData] = useState(null);

    const load = useCallback(async () => {
        const [w, a, r] = await Promise.all([
            supabase.from('installation_workers')
                .select('installation_custom_id, work_date, notes, business_trip, installation:installations(custom_id, name, client:clients(populated_place))')
                .eq('employee_custom_id', cid).gte('work_date', from).lte('work_date', to).order('work_date', { ascending: false }),
            supabase.from('attendance').select('work_date, status').eq('employee_custom_id', cid)
                .gte('work_date', from).lte('work_date', to).in('status', Object.keys(ABSENCE)),
            supabase.from('installer_reports').select('installation_custom_id, work_date, submitted_at, author_id')
                .contains('crew', [cid]).gte('work_date', from).lte('work_date', to).not('submitted_at', 'is', null),
        ]);
        const rows = w.data || [];
        // З ким працювала: інші люди на тих самих об'єктах у ті самі дні
        const ids = [...new Set(rows.map(x => x.installation_custom_id).filter(Boolean))];
        const { data: mates } = ids.length
            ? await supabase.from('installation_workers').select('installation_custom_id, work_date, employee:employees(custom_id, name)')
                .in('installation_custom_id', ids).gte('work_date', from).lte('work_date', to).neq('employee_custom_id', cid)
            : { data: [] };
        setData({ rows, absent: a.data || [], reports: r.data || [], mates: mates || [] });
    }, [cid, from, to]);

    useEffect(() => { load(); }, [load]);

    const view = useMemo(() => {
        if (!data) return null;
        const absent = new Map(data.absent.map(x => [x.work_date, x.status]));
        const reported = new Set(data.reports.map(x => `${x.installation_custom_id}|${x.work_date}`));
        const mates = new Map();
        data.mates.forEach(m => {
            const k = `${m.installation_custom_id}|${m.work_date}`;
            if (!mates.has(k)) mates.set(k, []);
            if (m.employee?.name) mates.get(k).push(m.employee.name);
        });
        const work = data.rows.filter(x => !absent.has(x.work_date));
        const workDays = new Set(work.map(x => x.work_date));
        const past = (d) => d <= today;

        // Вихідні: дні пн–сб до сьогодні без графіка й без відпустки — сам собою вихідний
        let autoOff = 0;
        const end = to < today ? to : today;
        for (let d = from; d <= end; d = shiftDay(d, 1)) {
            if (parseDay(d).getDay() !== 0 && !workDays.has(d) && !absent.has(d)) autoOff += 1;
        }
        const leave = [...absent.entries()].filter(([, s]) => s !== 'OFF');

        // Стрічка: робочі дні й відсутності, по місяцях
        const items = [
            ...work.map(x => {
                const k = `${x.installation_custom_id}|${x.work_date}`;
                return {
                    kind: 'work', date: x.work_date, id: x.installation_custom_id,
                    title: x.installation?.name || x.notes || 'Завдання', place: x.installation?.client?.populated_place || null,
                    notes: x.installation_custom_id ? x.notes : null, trip: !!x.business_trip,
                    mates: [...new Set(mates.get(k) || [])], report: x.installation_custom_id ? reported.has(k) : null,
                };
            }),
            ...[...absent.entries()].map(([date, status]) => ({ kind: 'absent', date, status })),
        ].sort((x, y) => y.date.localeCompare(x.date));
        const months = [];
        items.forEach(it => {
            const key = it.date.slice(0, 7);
            if (!months.length || months[months.length - 1].key !== key) months.push({ key, title: monthTitle(it.date), items: [] });
            months[months.length - 1].items.push(it);
        });

        return {
            days: [...workDays].filter(past).length,
            planned: [...workDays].filter(d => !past(d)).length,
            objects: new Set(work.filter(x => x.installation_custom_id && past(x.work_date)).map(x => x.installation_custom_id)).size,
            trips: new Set(work.filter(x => x.business_trip && past(x.work_date)).map(x => x.work_date)).size,
            off: autoOff + [...absent.values()].filter(s => s === 'OFF').length,
            leave: leave.length,
            noReport: items.filter(it => it.kind === 'work' && it.report === false && it.date < today).length,
            months,
        };
    }, [data, from, to, today]);

    return (
        <div className="space-y-3">
            <section className={`${T.card} p-3.5`}>
                <div className="flex items-start gap-2">
                    <button type="button" onClick={onBack} aria-label="До списку людей"
                        className="lg:hidden w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 flex-shrink-0">
                        <FaChevronLeft size={13} />
                    </button>
                    <div className="min-w-0 flex-1">
                        <div className="text-[16px] font-bold text-slate-900 break-words">{person.name}</div>
                        <div className="text-[12px] text-slate-500 break-words">
                            {[Number(person.tier) === 1 && person.role === 'installer' ? 'бригадир' : null, person.position].filter(Boolean).join(' · ') || 'монтажник'}
                        </div>
                    </div>
                </div>
                {view === null ? <div className="mt-3 h-16 rounded-lg bg-slate-100 animate-pulse" /> : (
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <Stat value={view.days} label={`${daysWord(view.days)} на об'єктах`} strong />
                        <Stat value={view.objects} label={{ 'день': "об'єкт", 'дні': "об'єкти", 'днів': "об'єктів" }[daysWord(view.objects)]} />
                        <Stat value={view.trips} label={`${daysWord(view.trips)} відрядження`} tone="warn" />
                        <Stat value={view.off} label="вихідних" tone="muted" />
                        <Stat value={view.leave} label="відпустка / лікарняний" tone="muted" />
                    </div>
                )}
                {view && (view.planned > 0 || view.noReport > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {view.planned > 0 && <Chip tone="info">ще заплановано: {view.planned}</Chip>}
                        {view.noReport > 0 && <Chip tone="warn">днів без звіту бригади: {view.noReport}</Chip>}
                    </div>
                )}
            </section>

            {view === null ? <div className={T.card}><Skeleton rows={6} /></div> : view.months.length === 0 ? (
                <div className={T.card}><EmptyState icon={FaHardHat} title="За цей період виїздів немає" /></div>
            ) : view.months.map(m => (
                <section key={m.key} className={`${T.card} overflow-hidden`}>
                    <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50/70 text-[12px] font-bold uppercase tracking-wide text-slate-500">{m.title}</div>
                    <ul className="divide-y divide-slate-100">
                        {m.items.map((it, i) => <DayRow key={`${it.date}-${i}`} it={it} today={today} onOpen={onOpen} />)}
                    </ul>
                </section>
            ))}
        </div>
    );
}

const STAT_TONE = { warn: 'text-amber-700', muted: 'text-slate-500' };
const Stat = ({ value, label, tone, strong }) => (
    <div className={`rounded-lg px-2.5 py-2 ${strong ? 'bg-indigo-50' : 'bg-slate-50'}`}>
        <div className={`text-[22px] font-bold leading-none tabular-nums ${strong ? 'text-indigo-800' : STAT_TONE[tone] || 'text-slate-800'}`}>{value}</div>
        <div className="text-[11.5px] text-slate-500 mt-1 leading-tight">{label}</div>
    </div>
);

function DayRow({ it, today, onOpen }) {
    const d = parseDay(it.date);
    const dateBox = (
        <div className={`w-11 flex-shrink-0 text-center rounded-lg py-1 ${it.date === today ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
            <div className="text-[16px] font-bold leading-tight tabular-nums">{d.getDate()}</div>
            <div className={`text-[10.5px] font-semibold uppercase ${it.date === today ? 'text-indigo-100' : 'text-slate-400'}`}>{d.toLocaleDateString('uk-UA', { weekday: 'short' })}</div>
        </div>
    );
    if (it.kind === 'absent') {
        return (
            <li className="px-3.5 py-2.5 flex items-center gap-3">
                {dateBox}
                <Chip tone={it.status === 'OFF' ? 'neutral' : 'danger'}>{ABSENCE[it.status] || it.status}</Chip>
            </li>
        );
    }
    const future = it.date > today;
    return (
        <li className="px-3.5 py-2.5 flex items-start gap-3">
            {dateBox}
            <div className="min-w-0 flex-1">
                {it.id ? (
                    <button type="button" onClick={() => onOpen(it.id)} className="text-left text-[14px] font-semibold text-slate-900 hover:text-indigo-700 break-words">
                        <span className="font-mono text-[11px] text-slate-400 mr-1">СЕС-{it.id}</span>{it.title}
                    </button>
                ) : (
                    <div className="text-[14px] font-semibold text-amber-800 break-words">{it.title}</div>
                )}
                {(it.place || it.notes) && (
                    <div className="text-[12px] text-slate-500 break-words inline-flex items-start gap-1">
                        {it.place && <FaMapMarkerAlt size={9} className="mt-1 flex-shrink-0" />}{[it.place, it.notes].filter(Boolean).join(' · ')}
                    </div>
                )}
                {it.mates.length > 0 && <div className="text-[12px] text-slate-600 break-words">з {it.mates.join(', ')}</div>}
                {(it.trip || future || it.report != null) && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {it.trip && <Chip tone="warn" icon={FaSuitcase}>відрядження</Chip>}
                        {future ? <Chip tone="info">заплановано</Chip>
                            : it.report === true ? <Chip tone="ok" icon={FaCheck}>звіт є</Chip>
                                : it.report === false && it.date < today ? <Chip tone="neutral">без звіту</Chip> : null}
                    </div>
                )}
            </div>
        </li>
    );
}
