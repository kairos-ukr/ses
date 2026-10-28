// =====================================================================
//  K-CORE · «Працівники → Календар» — графік робіт
//
//  Графік складають на день наперед, тому типово відкривається завтра.
//  Зверху — тиждень смужкою: у кожному дні скільки завдань і людей і чи
//  графік уже надіслано. Під нею — складання обраного дня прямо на
//  сторінці (DayPlanner): об'єкти, люди, транспорт, відсутні,
//  «Зберегти й надіслати».
//  «По людях» — тиждень таблицею: хто де працює і хто вільний.
//  Наживо: зміни інших за секунду; видно, хто зараз складає який день.
// =====================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaArrowLeft, FaArrowRight, FaSearch, FaPaperPlane, FaPen } from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { Segmented, Chip } from './ui';
import DayPlanner from './pages/DayPlanner';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const shiftDay = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const mondayOf = (s) => { const d = parseDay(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDay(d); };

/** Наступний робочий день: графік складають на завтра (після суботи — на понеділок) */
const nextWorkday = () => {
    const t = shiftDay(isoDay(), 1);
    return parseDay(t).getDay() === 0 ? shiftDay(t, 1) : t;
};

const ABSENCE_LABEL = { OFF: 'Вихідний', VACATION: 'Відпустка', SICK_LEAVE: 'Лікарняний' };

export default function WorkCalendar() {
    const { can, unrestricted, role, user, employee: me } = useAuth();
    // Доступи → «Графік робіт»: змінювати; минулі дні — адміністратор або «без обмежень»
    const canManage = can('schedule', 'edit');
    const canEditPast = canManage && (role === 'super_admin' || unrestricted);
    const [params, setParams] = useSearchParams();

    const today = isoDay();
    const selected = /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') || '') ? params.get('d') : nextWorkday();
    const weekStart = mondayOf(selected);
    const setSelected = (d) => setParams(prev => { const p = new URLSearchParams(prev); p.set('d', d); return p; }, { replace: true });

    const [view, setView] = useState(() => { try { return localStorage.getItem('kcore.calendar.view') || 'days'; } catch { return 'days'; } });
    const setViewMode = (v) => { setView(v); try { localStorage.setItem('kcore.calendar.view', v); } catch { /* немає сховища */ } };

    const [week, setWeek] = useState(null);       // { work, off, pubs, drafts }
    const [employees, setEmployees] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [peopleFilter, setPeopleFilter] = useState('install');
    const [peopleSearch, setPeopleSearch] = useState('');
    const [online, setOnline] = useState([]);

    const days = useMemo(() => {
        const list = Array.from({ length: 6 }, (_, i) => shiftDay(weekStart, i));
        if (!list.includes(selected)) list.push(selected);   // неділя — лише якщо її обрали
        return list;
    }, [weekStart, selected]);

    /* ---- Тиждень ---- */
    const loadWeek = useCallback(async () => {
        const end = shiftDay(weekStart, 6);
        const [w, a, p, d] = await Promise.all([
            supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, work_date, notes').gte('work_date', weekStart).lte('work_date', end),
            supabase.from('attendance').select('employee_custom_id, work_date, status').gte('work_date', weekStart).lte('work_date', end).in('status', Object.keys(ABSENCE_LABEL)),
            supabase.from('schedule_publications').select('*').gte('work_date', weekStart).lte('work_date', end),
            supabase.from('schedule_day_drafts').select('work_date, updated_at, updated_by_email').gte('work_date', weekStart).lte('work_date', end),
        ]);
        setWeek({ work: w.data || [], off: a.data || [], pubs: p.data || [], drafts: d.data || [] });
    }, [weekStart]);

    useEffect(() => { loadWeek(); }, [loadWeek]);
    useEffect(() => {
        Promise.all([
            supabase.from('employees').select('id, custom_id, name, email, department, position, hidden_from_list').order('name'),
            supabase.from('installations').select('custom_id, name'),
        ]).then(([e, i]) => { setEmployees(e.data || []); setInstallations(i.data || []); });
    }, []);

    const reloadRef = useRef(loadWeek);
    useEffect(() => { reloadRef.current = loadWeek; }, [loadWeek]);
    useEffect(() => {
        let timer;
        const bump = () => { clearTimeout(timer); timer = setTimeout(() => reloadRef.current(), 500); };
        const ch = supabase.channel('kcore-week-live');
        ['installation_workers', 'attendance', 'schedule_publications', 'schedule_day_drafts'].forEach(table =>
            ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
        ch.subscribe();
        return () => { clearTimeout(timer); supabase.removeChannel(ch); };
    }, []);

    /* ---- Хто зараз у календарі й який день складає ---- */
    const myName = me?.name || user?.email || 'Хтось';
    const presenceRef = useRef(null);
    useEffect(() => {
        if (!user?.id) return undefined;
        const ch = supabase.channel('kcore-schedule-presence', { config: { presence: { key: user.id } } });
        ch.on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState();
            setOnline(Object.entries(state).map(([key, metas]) => ({ key, ...(metas[metas.length - 1] || {}) })));
        });
        ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') { try { await ch.track({ name: myName, editing: null }); } catch { /* не критично */ } }
        });
        presenceRef.current = ch;
        return () => { presenceRef.current = null; supabase.removeChannel(ch); };
    }, [user?.id, myName]);
    const editingKey = canManage && view === 'days' ? selected : null;
    useEffect(() => {
        presenceRef.current?.track({ name: myName, editing: editingKey }).catch(() => { /* ще не підключились */ });
    }, [editingKey, myName]);
    const others = online.filter(p => p.key !== user?.id);
    const shortDay = (ds) => parseDay(ds).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric' });

    /* ---- Підсумок дня для смужки ---- */
    const summary = useMemo(() => {
        const out = {};
        (week?.work || []).forEach(r => {
            const s = out[r.work_date] || (out[r.work_date] = { tasks: new Set(), people: new Set() });
            s.tasks.add(r.installation_custom_id || `c:${r.notes}`);
            if (r.employee_custom_id != null) s.people.add(r.employee_custom_id);
        });
        return out;
    }, [week]);
    const stateOf = (ds) => {
        const pub = week?.pubs.find(p => p.work_date === ds);
        const draft = week?.drafts.find(p => p.work_date === ds);
        if (pub?.published_at && (!pub.saved_at || new Date(pub.saved_at) <= new Date(pub.published_at))) return { tone: 'ok', label: 'надіслано', icon: FaPaperPlane };
        if (pub?.published_at) return { tone: 'warn', label: 'змінено', icon: FaPen };
        if (draft) return { tone: 'warn', label: 'чернетка', icon: FaPen };
        return null;
    };

    /* ---- По людях ---- */
    const workerDay = useMemo(() => {
        const map = {};
        (week?.work || []).forEach(r => {
            if (r.employee_custom_id == null) return;
            (map[r.work_date] || (map[r.work_date] = {}))[r.employee_custom_id] = r;
        });
        return map;
    }, [week]);
    const offDay = useMemo(() => {
        const map = {};
        (week?.off || []).forEach(a => { (map[a.work_date] || (map[a.work_date] = {}))[a.employee_custom_id] = a.status; });
        return map;
    }, [week]);
    const instName = (id) => installations.find(i => String(i.custom_id) === String(id))?.name || `Об'єкт #${id}`;
    const peopleRows = useMemo(() => employees
        .filter(e => !e.hidden_from_list)
        .filter(e => {
            const dep = Array.isArray(e.department) ? e.department : [e.department].filter(Boolean);
            if (peopleFilter === 'install') return dep.includes('Монтаж') || dep.includes('Склад');
            if (peopleFilter === 'office') return dep.includes('Офіс') || dep.includes('Проектування');
            return true;
        })
        .filter(e => !peopleSearch.trim() || (e.name || '').toLowerCase().includes(peopleSearch.trim().toLowerCase())),
    [employees, peopleFilter, peopleSearch]);

    const relLabel = (ds) => (ds === today ? 'сьогодні' : ds === shiftDay(today, 1) ? 'завтра' : null);

    return (
        <div className="min-h-full bg-slate-100 pb-24">
            {/* Шапка: тиждень, вигляд, хто зараз у календарі */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-[1500px] mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setSelected(shiftDay(weekStart, -7))} aria-label="Попередній тиждень"
                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"><FaArrowLeft size={13} /></button>
                        <input type="date" value={selected} onChange={e => e.target.value && setSelected(e.target.value)} aria-label="Обрати дату"
                            className="h-9 px-2 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-800" />
                        <button type="button" onClick={() => setSelected(shiftDay(weekStart, 7))} aria-label="Наступний тиждень"
                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"><FaArrowRight size={13} /></button>
                        {selected !== nextWorkday() && (
                            <button type="button" onClick={() => setSelected(nextWorkday())}
                                className="h-9 px-3 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 ml-1">Завтра</button>
                        )}
                    </div>
                    <Segmented value={view} onChange={setViewMode} options={[{ value: 'days', label: 'По днях' }, { value: 'people', label: 'По людях' }]} />
                    {others.length > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[12px]">
                            <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Зараз тут:</span>
                            {others.map(p => (
                                <span key={p.key} className={`h-6 px-2 rounded-full border inline-flex items-center gap-1 font-semibold ${p.editing ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                    {p.name}{p.editing && <span className="font-normal">· складає {shortDay(p.editing)}</span>}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {view === 'days' ? (
                <div className="max-w-[1500px] mx-auto p-2 sm:p-4 space-y-3">
                    {/* Тиждень смужкою */}
                    <div className={`grid gap-1.5 ${days.length > 6 ? 'grid-cols-7' : 'grid-cols-3 sm:grid-cols-6'}`}>
                        {days.map(ds => {
                            const on = ds === selected;
                            const s = summary[ds];
                            const st = stateOf(ds);
                            const rel = relLabel(ds);
                            const offN = Object.keys(offDay[ds] || {}).length;
                            return (
                                <button key={ds} type="button" onClick={() => setSelected(ds)}
                                    className={`rounded-xl border px-2.5 py-2 text-left transition-colors
                                        ${on ? 'bg-indigo-600 border-indigo-600 text-white' : ds < today ? 'bg-white/60 border-slate-200 text-slate-500' : 'bg-white border-slate-200 text-slate-800 hover:border-indigo-300'}`}>
                                    <div className="text-[12.5px] font-bold first-letter:uppercase whitespace-nowrap">
                                        {parseDay(ds).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric' })}
                                        {rel && <span className={`ml-1 font-semibold ${on ? 'text-indigo-200' : 'text-indigo-600'}`}>· {rel}</span>}
                                    </div>
                                    <div className={`text-[12px] tabular-nums ${on ? 'text-indigo-100' : 'text-slate-500'}`}>
                                        {s ? `${s.tasks.size} завд. · ${s.people.size} люд.` : '—'}{offN ? ` · ${offN} відс.` : ''}
                                    </div>
                                    {st && (
                                        <div className={`text-[11.5px] font-semibold inline-flex items-center gap-1 ${on ? 'text-white' : st.tone === 'ok' ? 'text-emerald-700' : 'text-amber-700'}`}>
                                            <st.icon size={9} /> {st.label}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex flex-wrap items-baseline gap-2 px-1">
                        <h2 className="text-[19px] font-bold text-slate-900 first-letter:uppercase">
                            {parseDay(selected).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </h2>
                        {relLabel(selected) && <Chip tone="accent">{relLabel(selected)}</Chip>}
                    </div>

                    <DayPlanner key={selected} date={selected} me={me} canManage={canManage} canEditPast={canEditPast} onSaved={loadWeek} />
                </div>
            ) : (
                /* ПО ЛЮДЯХ: рядок — людина, стовпчик — день */
                <div className="max-w-[1500px] mx-auto p-2 sm:p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented value={peopleFilter} onChange={setPeopleFilter}
                            options={[{ value: 'install', label: 'Монтаж' }, { value: 'office', label: 'Офіс' }, { value: 'all', label: 'Усі' }]} />
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                            <input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="Пошук людини"
                                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-indigo-400" />
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 w-[190px]">Працівник</th>
                                    {days.map(ds => (
                                        <th key={ds} className={`px-2 py-2 text-[11.5px] font-semibold first-letter:uppercase ${ds === today ? 'text-indigo-700' : 'text-slate-500'}`}>
                                            {shortDay(ds)}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {peopleRows.map(emp => (
                                    <tr key={emp.custom_id} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-2 sticky left-0 bg-white z-10">
                                            <div className="text-[13px] font-semibold text-slate-800 leading-tight">{emp.name}</div>
                                            {emp.position && <div className="text-[11px] text-slate-400 leading-tight">{emp.position}</div>}
                                        </td>
                                        {days.map(ds => {
                                            const off = (offDay[ds] || {})[emp.custom_id];
                                            const task = workerDay[ds]?.[emp.custom_id];
                                            return (
                                                <td key={ds} className="px-1.5 py-1.5 align-top cursor-pointer" onClick={() => { setSelected(ds); setViewMode('days'); }}>
                                                    {off ? (
                                                        <span className="block rounded-md px-2 py-1 text-[11.5px] font-semibold bg-rose-50 text-rose-700">{ABSENCE_LABEL[off] || off}</span>
                                                    ) : task ? (
                                                        <span className={`block rounded-md px-2 py-1 text-[11.5px] font-semibold leading-snug break-words ${task.installation_custom_id ? 'bg-indigo-50 text-indigo-800' : 'bg-amber-50 text-amber-800'}`}>
                                                            {task.installation_custom_id ? instName(task.installation_custom_id) : (task.notes || 'Завдання')}
                                                        </span>
                                                    ) : (
                                                        <span className="block rounded-md px-2 py-1 text-[11.5px] text-slate-300">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {peopleRows.length === 0 && (
                                    <tr><td colSpan={days.length + 1} className="px-3 py-8 text-center text-[13px] text-slate-400">Нікого не знайдено</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
