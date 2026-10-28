// =====================================================================
//  K-CORE · «Автопарк» → Пробіг
//
//  Що працівники внесли в «Монтажі» (Я → Пробіг): по кожному авто за
//  місяць — км по роботі, скільки днів і хто їздив.
//  Натиснули на авто — під ним записи по днях. Зміни приходять наживо.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaRoad, FaChevronLeft, FaChevronRight, FaChevronDown, FaCar, FaShuttleVan } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, IconBtn, Skeleton } from '../ui';

const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthStart = (ym) => `${ym}-01`;
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return isoDay(new Date(y, m, 0, 12)); };
const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1, 12); return isoDay(d).slice(0, 7); };
const monthTitle = (ym) => new Date(`${ym}-01T12:00:00`).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
const fmtDay = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
const km = (v) => `${Number(v || 0).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} км`;

export default function MileagePanel() {
    const [ym, setYm] = useState(() => isoDay(new Date()).slice(0, 7));
    const [rows, setRows] = useState(null);
    const [open, setOpen] = useState(null);

    const load = useCallback(async () => {
        const { data } = await supabase.from('car_mileage')
            .select('id, employee_id, vehicle_id, log_date, work_km, note, employee:employees(name), vehicle:vehicles(name, plate)')
            .gte('log_date', monthStart(ym)).lte('log_date', monthEnd(ym))
            .order('log_date', { ascending: false });
        setRows(data || []);
    }, [ym]);

    useEffect(() => { setRows(null); setOpen(null); load(); }, [load]);
    useEffect(() => {
        let t;
        const ch = supabase.channel('mileage-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'car_mileage' }, () => { clearTimeout(t); t = setTimeout(load, 500); })
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load]);

    // Групи: авто компанії — по авто; своє авто — по людині
    const groups = useMemo(() => {
        const m = new Map();
        (rows || []).forEach(r => {
            const key = r.vehicle_id ? `v${r.vehicle_id}` : `p${r.employee_id}`;
            if (!m.has(key)) {
                m.set(key, {
                    key, company: !!r.vehicle_id,
                    title: r.vehicle_id ? [r.vehicle?.name, r.vehicle?.plate].filter(Boolean).join(' · ') : `${r.employee?.name || 'Працівник'} — своє авто`,
                    rows: [], people: new Set(),
                });
            }
            const g = m.get(key);
            g.rows.push(r);
            if (r.employee?.name) g.people.add(r.employee.name);
        });
        return [...m.values()].map(g => ({
            ...g,
            total: g.rows.reduce((s, r) => s + (Number(r.work_km) || 0), 0),
            days: new Set(g.rows.map(r => r.log_date)).size,
        })).sort((a, b) => b.total - a.total);
    }, [rows]);

    const total = groups.reduce((s, g) => s + g.total, 0);
    const current = isoDay(new Date()).slice(0, 7);

    return (
        <div className={`${T.card} overflow-hidden lg:col-span-2`}>
            <div className="px-3.5 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2 mr-auto"><FaRoad size={13} className="text-indigo-500" /> Пробіг</h3>
                <IconBtn variant="outline" icon={FaChevronLeft} label="Попередній місяць" onClick={() => setYm(m => shiftMonth(m, -1))} />
                <span className="text-[13px] font-semibold text-slate-700 first-letter:uppercase min-w-[120px] text-center">{monthTitle(ym)}</span>
                <IconBtn variant="outline" icon={FaChevronRight} label="Наступний місяць" disabled={ym >= current} onClick={() => setYm(m => shiftMonth(m, 1))} />
            </div>
            {rows === null ? <Skeleton rows={3} /> : groups.length === 0 ? (
                <div className="px-3.5 py-6 text-center text-[13px] text-slate-400">За цей місяць пробіг не вносили</div>
            ) : (
                <>
                    <div className="px-3.5 pt-2.5 text-[13px] text-slate-500">Усього по роботі: <b className="text-slate-900 tabular-nums">{km(total)}</b></div>
                    <ul className="divide-y divide-slate-100">
                        {groups.map(g => {
                            const isOpen = open === g.key;
                            return (
                                <li key={g.key}>
                                    <button type="button" onClick={() => setOpen(o => (o === g.key ? null : g.key))} aria-expanded={isOpen}
                                        className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                        {g.company ? <FaShuttleVan size={13} className="mt-1 text-indigo-500 flex-shrink-0" /> : <FaCar size={13} className="mt-1 text-emerald-600 flex-shrink-0" />}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13.5px] font-semibold text-slate-900 break-words">{g.title}</div>
                                            <div className="text-[12px] text-slate-500 break-words">
                                                {g.days} дн.{g.company && g.people.size ? ` · ${[...g.people].join(', ')}` : ''}
                                            </div>
                                        </div>
                                        <b className="text-[14px] text-slate-900 tabular-nums whitespace-nowrap">{km(g.total)}</b>
                                        <FaChevronDown size={10} className={`mt-1.5 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                    {isOpen && (
                                        <ul className="bg-slate-50/70 border-t border-slate-100 divide-y divide-slate-100">
                                            {g.rows.map(r => (
                                                <li key={r.id} className="px-3.5 pl-10 py-2 flex flex-wrap items-baseline gap-x-3 text-[12.5px]">
                                                    <span className="text-slate-700 first-letter:uppercase min-w-[120px]">{fmtDay(r.log_date)}</span>
                                                    {g.company && <span className="text-slate-500">{r.employee?.name}</span>}
                                                    <b className="ml-auto text-slate-900 tabular-nums">{r.work_km != null ? km(r.work_km) : '—'}</b>
                                                    {r.note && <span className="w-full text-slate-500 break-words">{r.note}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
        </div>
    );
}
