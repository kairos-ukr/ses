// =====================================================================
//  K-CORE · «Графік» на офісному «Сьогодні»
//
//  Хто де працює сьогодні або завтра — картками на всю ширину:
//  об'єкт, люди, на чому їдуть і хто за кермом. Сьогодні — ще й чи
//  здала бригада звіт (о котрій, гроші, проблема); завтра — чи графік
//  уже надіслано. Знизу — хто вільний і хто відсутній.
//  Об'єкти, де я менеджер чи бригадир (або я сам у бригаді), виділені.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaCalendarAlt, FaShuttleVan, FaCar, FaPaperPlane, FaArrowRight, FaMoneyBillWave,
    FaExclamationTriangle, FaUserSlash, FaUserCheck, FaSuitcase,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Chip, Segmented, Skeleton } from '../ui';
import { canSeeMoney } from '../domain/objects';
import { inSchedule } from '../domain/access';
import { useEvening } from '../utils/settings';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shiftDay = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const nextWorkday = () => { const t = shiftDay(isoDay(), 1); return new Date(`${t}T12:00:00`).getDay() === 0 ? shiftDay(t, 1) : t; };
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : '');
const trips = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'виїзд';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'виїзди';
    return 'виїздів';
};
const ABSENT = ['OFF', 'VACATION', 'SICK_LEAVE'];
const ABSENT_LABEL = { OFF: 'вихідний', VACATION: 'відпустка', SICK_LEAVE: 'лікарняний' };

export default function TodaySchedule() {
    const navigate = useNavigate();
    const auth = useAuth();
    const myId = auth.employee?.custom_id ?? null;
    const today = isoDay();
    const tomorrow = nextWorkday();
    // До години перемикання (Налаштування, за замовчуванням 19:00) головний —
    // сьогоднішній графік, потім завтрашній. Сторінка перемикається сама,
    // поки людина не обрала день вручну; опівночі вибір скидається.
    const { evening } = useEvening();
    const [picked, setPicked] = useState(null);
    const auto = evening ? tomorrow : today;
    const day = picked === today || picked === tomorrow ? picked : auto;
    const setDay = (v) => setPicked(v === auto ? null : v);
    const [data, setData] = useState(null);

    const load = useCallback(async () => {
        const isToday = day === isoDay();
        const [w, t, p, r, a, e] = await Promise.all([
            supabase.from('installation_workers')
                .select('installation_custom_id, employee_custom_id, notes, business_trip, installation:installations(custom_id, name, responsible_emp_id, brigadier_emp_id, client:clients(name, populated_place))')
                .eq('work_date', day),
            supabase.from('trips').select('vehicle_id, own_car_custom_id, driver_custom_id, vehicle:vehicles(name, plate), stops:trip_stops(installation_custom_id, place)')
                .eq('trip_date', day).neq('status', 'cancelled'),
            supabase.from('schedule_publications').select('published_at, saved_at').eq('work_date', day).maybeSingle(),
            isToday
                ? supabase.from('installer_reports').select('installation_custom_id, submitted_at, money_amount, money_payment_id, day_status').eq('work_date', day)
                : Promise.resolve({ data: [] }),
            supabase.from('attendance').select('employee_custom_id, status').eq('work_date', day).in('status', ABSENT),
            supabase.from('employees').select('custom_id, name, role, tier, department, hidden_from_list, access_blocked_at, in_schedule'),
        ]);
        const emps = e.data || [];
        const nameOf = (cid) => emps.find(x => Number(x.custom_id) === Number(cid))?.name || null;

        const groups = new Map();
        (w.data || []).forEach(row => {
            const key = row.installation_custom_id ? `i${row.installation_custom_id}` : `c${(row.notes || '').trim()}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    key, inst: row.installation_custom_id, obj: row.installation || null,
                    title: row.installation?.name || row.notes || 'Завдання',
                    place: row.installation?.client?.populated_place || null,
                    notes: row.installation_custom_id ? (row.notes || null) : null,
                    people: [],
                    away: false,
                });
            }
            if (row.business_trip) groups.get(key).away = true;
            groups.get(key).people.push(Number(row.employee_custom_id));
        });

        const list = [...groups.values()].map(g => {
            const trip = (t.data || []).find(x => (x.stops || []).some(s => (g.inst ? s.installation_custom_id === g.inst : !s.installation_custom_id && s.place === g.title)));
            const rep = g.inst ? (r.data || []).find(x => x.installation_custom_id === g.inst) || null : null;
            const mine = myId != null && (g.people.includes(Number(myId))
                || Number(g.obj?.responsible_emp_id) === Number(myId) || Number(g.obj?.brigadier_emp_id) === Number(myId));
            return {
                ...g, trip, rep, mine,
                names: g.people.map(nameOf).filter(Boolean),
                transport: trip ? (trip.vehicle_id ? [trip.vehicle?.name, trip.vehicle?.plate].filter(Boolean).join(' · ') : `своє авто: ${nameOf(trip.own_car_custom_id) || '—'}`) : null,
                driver: trip?.driver_custom_id != null ? nameOf(trip.driver_custom_id) : null,
            };
        }).sort((x, y) => Number(y.away) - Number(x.away) || Number(y.mine) - Number(x.mine) || x.title.localeCompare(y.title, 'uk'));

        const busy = new Set(list.flatMap(g => g.people));
        const off = (a.data || []).map(x => ({ cid: Number(x.employee_custom_id), status: x.status }));
        const offSet = new Set(off.map(x => x.cid));
        const installers = emps.filter(x => !x.hidden_from_list && !x.access_blocked_at && inSchedule(x));
        const free = installers.filter(x => !busy.has(Number(x.custom_id)) && !offSet.has(Number(x.custom_id))).map(x => x.name);

        setData({
            list, pub: p.data || null, free,
            // Сьогодні або графік уже надіслано: хто не в графіку — вихідний
            autoOff: isToday || !!p.data?.published_at,
            off: off.map(x => ({ name: nameOf(x.cid), status: x.status })).filter(x => x.name),
            people: busy.size,
            cars: new Set((t.data || []).map(x => (x.vehicle_id ? `v${x.vehicle_id}` : `o${x.own_car_custom_id}`))).size,
        });
    }, [day, myId]);

    useEffect(() => { setData(null); load(); }, [load]);
    useEffect(() => {
        let tm;
        const ch = supabase.channel(`today-schedule-${day}`);
        ['installation_workers', 'trips', 'schedule_publications', 'installer_reports', 'attendance'].forEach(table =>
            ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => { clearTimeout(tm); tm = setTimeout(load, 600); }));
        ch.subscribe();
        return () => { clearTimeout(tm); supabase.removeChannel(ch); };
    }, [load, day]);

    const isToday = day === today;
    const openCalendar = () => navigate(`/employees?tab=planning&d=${day}`);
    const pub = data?.pub;
    const sent = pub?.published_at && (!pub.saved_at || new Date(pub.saved_at) <= new Date(pub.published_at));
    const late = (() => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() >= 15 * 60 + 30; })();
    const reported = useMemo(() => (data?.list || []).filter(g => g.rep?.submitted_at).length, [data]);
    const withObject = useMemo(() => (data?.list || []).filter(g => g.inst).length, [data]);

    const reportChip = (g) => {
        if (!g.inst) return null;
        if (g.rep?.submitted_at) return <Chip tone="ok">звіт {timeOf(g.rep.submitted_at)}</Chip>;
        return <Chip tone={late ? 'danger' : 'neutral'}>{late ? 'звіту немає' : 'звіт чекаємо'}</Chip>;
    };

    return (
        <section className={`${T.card} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaCalendarAlt size={12} className="text-indigo-500" /> Графік
                </h2>
                <Segmented value={day} onChange={setDay}
                    options={[{ value: today, label: 'Сьогодні' }, { value: tomorrow, label: tomorrow === shiftDay(today, 1) ? 'Завтра' : 'Понеділок' }]} />
                {data && (
                    <span className="text-[12.5px] text-slate-500">
                        {data.list.length} {trips(data.list.length)} · {data.people} люд.{data.cars ? ` · ${data.cars} авто` : ''}
                    </span>
                )}
                {data && !isToday && (sent
                    ? <Chip tone="ok" icon={FaPaperPlane}>надіслано {timeOf(pub.published_at)}</Chip>
                    : pub?.published_at ? <Chip tone="warn">змінено після надсилання</Chip>
                        : <Chip tone={data.list.length ? 'warn' : 'neutral'}>{data.list.length ? 'ще не надіслано' : 'ще не складено'}</Chip>)}
                {data && isToday && withObject > 0 && (
                    <Chip tone={reported === withObject ? 'ok' : late ? 'danger' : 'neutral'}>звітів {reported} з {withObject}</Chip>
                )}
                <button type="button" onClick={openCalendar}
                    className="ml-auto text-[12.5px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1.5">
                    {!isToday && !sent ? 'Скласти й надіслати' : 'Календар'} <FaArrowRight size={9} />
                </button>
            </div>

            {data === null ? <Skeleton rows={3} /> : data.list.length === 0 ? (
                <div className="px-4 py-6 text-center text-[13px] text-slate-400">
                    {isToday ? 'На сьогодні графіка немає' : 'Графік на цей день ще не складено'}
                </div>
            ) : (
                <div className="p-3 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5">
                    {data.list.map(g => (
                        <button key={g.key} type="button"
                            onClick={() => (isToday && g.inst ? navigate(`/project/${g.inst}?tab=reports`) : g.inst ? navigate(`/project/${g.inst}`) : openCalendar())}
                            className={`text-left rounded-xl border p-3 space-y-1.5 transition-colors hover:border-indigo-300
                                ${g.mine ? 'border-indigo-300 bg-indigo-50/50 ring-1 ring-indigo-100' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[14px] font-bold text-slate-900 leading-snug break-words">
                                        {g.inst && <span className="font-mono text-[11px] font-semibold text-slate-400 mr-1">СЕС-{g.inst}</span>}
                                        {g.title}
                                    </div>
                                    {(g.place || g.notes) && (
                                        <div className="text-[12px] text-slate-500 break-words">{[g.place, g.notes].filter(Boolean).join(' · ')}</div>
                                    )}
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                    {g.away && <Chip tone="warn" icon={FaSuitcase}>відрядження</Chip>}
                                    {g.mine && <Chip tone="accent">мій</Chip>}
                                    {isToday && reportChip(g)}
                                </div>
                            </div>
                            <div className="text-[12.5px] text-slate-700 break-words">{g.names.join(', ') || 'без людей'}</div>
                            {(g.transport || (isToday && g.rep)) && (
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                                    {g.transport && (
                                        <span className="font-semibold text-indigo-700 inline-flex items-center gap-1.5 break-words">
                                            {g.trip?.vehicle_id ? <FaShuttleVan size={10} /> : <FaCar size={10} />}
                                            {g.transport}{g.driver && g.trip?.vehicle_id ? ` · водій ${g.driver}` : ''}
                                        </span>
                                    )}
                                    {isToday && g.rep?.money_amount != null && !g.rep.money_payment_id && canSeeMoney(auth, g.obj) && (
                                        <span className="font-semibold text-indigo-700 inline-flex items-center gap-1"><FaMoneyBillWave size={11} /> гроші не внесено</span>
                                    )}
                                    {isToday && g.rep?.day_status && g.rep.day_status !== 'ok' && (
                                        <span className="font-semibold text-rose-600 inline-flex items-center gap-1"><FaExclamationTriangle size={10} /> проблема на об'єкті</span>
                                    )}
                                </div>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {data && (data.free.length > 0 || data.off.length > 0) && (
                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
                    <div className="flex items-start gap-2 min-w-0">
                        <FaUserCheck size={11} className="mt-1 text-emerald-600 flex-shrink-0" />
                        <span className="min-w-0 break-words text-slate-600">
                            <b className="text-slate-800">{data.autoOff ? 'Не в графіку — вихідний' : 'Вільні монтажники'}: {data.free.length}</b>
                            {data.free.length > 0 && ` — ${data.free.join(', ')}`}
                        </span>
                    </div>
                    <div className="flex items-start gap-2 min-w-0">
                        <FaUserSlash size={11} className="mt-1 text-rose-500 flex-shrink-0" />
                        <span className="min-w-0 break-words text-slate-600">
                            <b className="text-slate-800">Відсутні: {data.off.length}</b>
                            {data.off.length > 0 && ` — ${data.off.map(x => `${x.name} (${ABSENT_LABEL[x.status]})`).join(', ')}`}
                        </span>
                    </div>
                </div>
            )}
        </section>
    );
}
