// =====================================================================
//  K-CORE · Картка «Графік» на офісному «Сьогодні»
//
//  Хто де працює сьогодні й завтра (з Календаря): об'єкт, люди, на чому
//  їдуть. Для завтра — чи графік уже надіслано. Натиснули — Календар
//  на цей день.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCalendarAlt, FaShuttleVan, FaCar, FaPaperPlane } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, Chip, Segmented, Skeleton } from '../ui';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shiftDay = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const nextWorkday = () => { const t = shiftDay(isoDay(), 1); return new Date(`${t}T12:00:00`).getDay() === 0 ? shiftDay(t, 1) : t; };
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : '');

export default function ScheduleCard() {
    const navigate = useNavigate();
    const today = isoDay();
    const [day, setDay] = useState(() => (new Date().getHours() >= 15 ? nextWorkday() : today));
    const [data, setData] = useState(null);

    const load = useCallback(async () => {
        const [w, t, p] = await Promise.all([
            supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, notes, employee:employees(name), installation:installations(name, client:clients(populated_place))').eq('work_date', day),
            supabase.from('trips').select('vehicle_id, own_car_custom_id, driver_custom_id, vehicle:vehicles(name), stops:trip_stops(installation_custom_id, place)').eq('trip_date', day).neq('status', 'cancelled'),
            supabase.from('schedule_publications').select('published_at, saved_at').eq('work_date', day).maybeSingle(),
        ]);
        const groups = new Map();
        (w.data || []).forEach(r => {
            const k = r.installation_custom_id ? `i${r.installation_custom_id}` : `c${r.notes}`;
            if (!groups.has(k)) groups.set(k, { key: k, inst: r.installation_custom_id, title: r.installation?.name || r.notes || 'Завдання', place: r.installation?.client?.populated_place, notes: r.installation_custom_id ? r.notes : null, people: [] });
            if (r.employee?.name) groups.get(k).people.push(r.employee.name);
        });
        const list = [...groups.values()].map(g => {
            const trip = (t.data || []).find(x => (x.stops || []).some(s => (g.inst ? s.installation_custom_id === g.inst : !s.installation_custom_id && s.place === g.title)));
            return { ...g, trip };
        });
        setData({ list, pub: p.data || null });
    }, [day]);

    useEffect(() => { setData(null); load(); }, [load]);
    useEffect(() => {
        let t;
        const ch = supabase.channel('today-schedule-card');
        ['installation_workers', 'trips', 'schedule_publications'].forEach(table =>
            ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => { clearTimeout(t); t = setTimeout(load, 600); }));
        ch.subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load]);

    const tomorrow = nextWorkday();
    const open = () => navigate(`/employees?tab=planning&d=${day}`);
    const pub = data?.pub;
    const sent = pub?.published_at && (!pub.saved_at || new Date(pub.saved_at) <= new Date(pub.published_at));
    const people = data ? data.list.reduce((s, g) => s + g.people.length, 0) : 0;

    return (
        <div className={T.card}>
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2 mr-auto">
                    <FaCalendarAlt size={12} className="text-indigo-500" /> Графік
                </h2>
                <Segmented value={day} onChange={setDay}
                    options={[{ value: today, label: 'Сьогодні' }, { value: tomorrow, label: tomorrow === shiftDay(today, 1) ? 'Завтра' : 'Понеділок' }]} />
            </div>
            {data === null ? <Skeleton rows={3} /> : (
                <>
                    {day !== today && (
                        <div className="px-4 pt-2.5">
                            {sent
                                ? <Chip tone="ok" icon={FaPaperPlane}>надіслано {timeOf(pub.published_at)}</Chip>
                                : pub?.published_at ? <Chip tone="warn">змінено після надсилання</Chip>
                                    : <Chip tone={data.list.length ? 'warn' : 'neutral'}>{data.list.length ? 'ще не надіслано' : 'ще не складено'}</Chip>}
                        </div>
                    )}
                    {data.list.length === 0 ? (
                        <div className="px-4 py-5 text-center text-[13px] text-slate-400">Графіка на цей день немає</div>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {data.list.map(g => (
                                <li key={g.key}>
                                    <button type="button" onClick={open} className="w-full text-left px-4 py-2.5 hover:bg-slate-50">
                                        <div className="text-[13.5px] font-semibold text-slate-900 break-words">
                                            {g.inst && <span className="font-mono text-[11px] text-slate-400 mr-1">СЕС-{g.inst}</span>}{g.title}
                                            {g.place && <span className="font-normal text-slate-500"> · {g.place}</span>}
                                        </div>
                                        <div className="text-[12px] text-slate-600 break-words">{g.people.join(', ') || 'без людей'}</div>
                                        {g.trip && (
                                            <div className="text-[12px] text-indigo-700 font-semibold inline-flex items-center gap-1.5">
                                                {g.trip.vehicle_id ? <FaShuttleVan size={10} /> : <FaCar size={10} />}
                                                {g.trip.vehicle?.name || 'власне авто'}
                                            </div>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span className="text-[12px] text-slate-400">{data.list.length} завд. · {people} люд.</span>
                        <button type="button" onClick={open} className="text-[12.5px] font-semibold text-indigo-600 hover:underline">
                            {day === today ? 'Відкрити в календарі' : sent ? 'Відкрити в календарі' : 'Скласти й надіслати'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
