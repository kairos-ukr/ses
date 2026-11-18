// =====================================================================
//  K-CORE · Аналітика → «Звіти бригад»: як бригади звітують (раніше було в «Доступах»)
//
//  За період (7 / 30 / 90 днів): скільки було виїздів на об'єкти, на
//  скількох є звіт, скільки здали вчасно — того ж дня до години вечірнього
//  зведення з «Налаштувань» (типово 19:00).
//   • Бригади — за бригадиром виїзду: виїздів, звітів, вчасно, о котрій
//     зазвичай здають.
//   • Звіти — кожен: дата, об'єкт, хто подав і коли (пізно — позначено),
//     проблема чи гроші, скільки разів правили після подачі і хто
//     (журнал змін пише правки звітів з 04.11.2026).
//   • Без звіту — виїзди, де звіту так і немає; сьогоднішні до години
//     зведення — «ще чекаємо».
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClipboardCheck, FaSyncAlt, FaUsers, FaExclamationTriangle, FaMoneyBillWave, FaPen } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, Chip, Bar, Segmented, Skeleton, EmptyState, IconBtn, Tip, useToast, humanError } from '../ui';
import { fetchAll } from '../utils/fetchAll';
import { loadReportReminders } from '../utils/settings';

const PERIODS = [{ value: 7, label: '7 днів' }, { value: 30, label: '30 днів' }, { value: 90, label: '90 днів' }];
const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const kyivDay = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Europe/Kyiv' });
const kyivTime = (ts) => new Date(ts).toLocaleTimeString('uk-UA', { timeZone: 'Europe/Kyiv', hour: '2-digit', minute: '2-digit' });
const kyivMinutes = (ts) => { const [h, m] = kyivTime(ts).split(':').map(Number); return h * 60 + m; };
const minutesOf = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'short', day: '2-digit', month: '2-digit' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const median = (list) => { if (!list.length) return null; const s = [...list].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const Tile = ({ label, value, hint, tone = 'text-slate-900' }) => (
    <div className={`${T.card} px-3.5 py-3`}>
        <div className="text-[12px] font-semibold text-slate-500">{label}</div>
        <div className={`text-[22px] font-black tabular-nums leading-tight ${tone}`}>{value}</div>
        {hint && <div className="text-[12px] text-slate-500">{hint}</div>}
    </div>
);

export default function ReportsAnalytics() {
    const toast = useToast();
    const navigate = useNavigate();
    const [days, setDays] = useState(30);
    const [view, setView] = useState('reports');
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const to = isoDay();
            const from = plusDays(to, -(days - 1));
            const [rows, reps, emp, cfg] = await Promise.all([
                fetchAll(() => supabase.from('installation_workers')
                    .select('id, work_date, installation_custom_id, employee_custom_id')
                    .gte('work_date', from).lte('work_date', to).not('installation_custom_id', 'is', null)
                    .order('work_date').order('id')),
                fetchAll(() => supabase.from('installer_reports')
                    .select('id, installation_custom_id, work_date, author_id, submitted_at, day_status, money_amount, money_currency')
                    .gte('work_date', from).lte('work_date', to).not('submitted_at', 'is', null)
                    .order('work_date').order('id')),
                supabase.from('employees').select('id, custom_id, name, tier'),
                loadReportReminders(),
            ]);
            const objIds = [...new Set([...rows.map(r => r.installation_custom_id), ...reps.map(r => r.installation_custom_id)])];
            const repIds = reps.map(r => String(r.id));
            const [inst, ...logParts] = await Promise.all([
                objIds.length ? supabase.from('installations').select('custom_id, name, brigadier_emp_id').in('custom_id', objIds) : { data: [] },
                // Правки після подачі — з журналу змін, порціями
                ...Array.from({ length: Math.ceil(repIds.length / 150) }, (_, i) => supabase.from('change_log')
                    .select('record_key, action, actor_name, created_at')
                    .eq('table_name', 'installer_reports').eq('action', 'update')
                    .in('record_key', repIds.slice(i * 150, i * 150 + 150))),
            ]);
            setData({
                from, to, rows, reps, cfg,
                emp: emp.data || [],
                inst: inst.data || [],
                edits: logParts.flatMap(p => p.data || []),
            });
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [days, toast]);

    useEffect(() => { load(); }, [load]);

    const stats = useMemo(() => {
        if (!data) return null;
        const empByCid = new Map(data.emp.map(e => [Number(e.custom_id), e]));
        const empById = new Map(data.emp.map(e => [e.id, e]));
        const instName = new Map(data.inst.map(i => [i.custom_id, i.name]));
        // Бригадир, закріплений за об'єктом (installations.brigadier_emp_id — custom_id працівника)
        const instBrig = new Map(data.inst.map(i => [i.custom_id, i.brigadier_emp_id != null ? Number(i.brigadier_emp_id) : null]));
        const deadline = minutesOf(data.cfg.digest_time) ?? 19 * 60;
        const today = isoDay();
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

        // Виїзд = об'єкт у день. Першим у бригаді — закріплений бригадир, далі бригадири, далі решта
        const visits = new Map();
        data.rows.forEach(r => {
            const key = `${r.work_date}|${r.installation_custom_id}`;
            if (!visits.has(key)) visits.set(key, { key, date: r.work_date, obj: r.installation_custom_id, crew: [] });
            const p = empByCid.get(Number(r.employee_custom_id));
            if (p && !visits.get(key).crew.some(x => x.id === p.id)) visits.get(key).crew.push(p);
        });
        visits.forEach(v => {
            const fixed = instBrig.get(v.obj);
            const isFixed = (p) => Number(p.custom_id) === fixed;
            v.crew.sort((a, b) => Number(isFixed(b)) - Number(isFixed(a))
                || Number(b.tier === 1) - Number(a.tier === 1) || a.name.localeCompare(b.name, 'uk'));
            v.assigned = v.crew.find(isFixed) || null;
        });

        const editsOf = new Map();
        data.edits.forEach(e => editsOf.set(e.record_key, [...(editsOf.get(e.record_key) || []), e]));

        // Звіт: коли подано і чи вчасно
        const reports = data.reps.map(r => {
            const day = kyivDay(r.submitted_at);
            const when = day > r.work_date ? 'nextday' : day === r.work_date && kyivMinutes(r.submitted_at) > deadline ? 'late' : 'ontime';
            const edits = (editsOf.get(String(r.id)) || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
            return {
                ...r, when, edits,
                author: empById.get(r.author_id)?.name || 'невідомо',
                objName: instName.get(r.installation_custom_id) || `Об'єкт #${r.installation_custom_id}`,
            };
        }).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
        const reportOf = new Map();
        [...reports].reverse().forEach(r => { const k = `${r.work_date}|${r.installation_custom_id}`; if (!reportOf.has(k)) reportOf.set(k, r); });

        // Чий виїзд (бригадирів буває двоє): є звіт — того, хто подав; немає —
        // бригадира, закріпленого за об'єктом (якщо він їхав), інакше бригадира з бригади
        visits.forEach(v => {
            const r = reportOf.get(v.key);
            v.lead = (r && empById.get(r.author_id)) || v.assigned || v.crew.find(p => p.tier === 1) || v.crew[0] || null;
        });

        const all = [...visits.values()].sort((a, b) => b.date.localeCompare(a.date) || b.obj - a.obj);
        const missing = all.filter(v => !reportOf.has(v.key)).map(v => ({
            ...v, waiting: v.date === today && nowMin < deadline,
            objName: instName.get(v.obj) || `Об'єкт #${v.obj}`,
        }));
        const counted = all.filter(v => !(v.date === today && !reportOf.has(v.key) && nowMin < deadline));
        const withReport = counted.filter(v => reportOf.has(v.key));
        const onTime = withReport.filter(v => reportOf.get(v.key).when === 'ontime');

        // Бригади: за бригадиром виїзду
        const crews = new Map();
        counted.forEach(v => {
            const id = v.lead?.id ?? 'none';
            if (!crews.has(id)) crews.set(id, { id, name: v.lead?.name || 'без бригадира', visits: 0, reports: 0, onTime: 0, times: [], last: null });
            const c = crews.get(id);
            c.visits += 1;
            const r = reportOf.get(v.key);
            if (r) {
                c.reports += 1;
                if (r.when === 'ontime') c.onTime += 1;
                if (kyivDay(r.submitted_at) === r.work_date) c.times.push(kyivMinutes(r.submitted_at));
                if (!c.last || r.work_date > c.last) c.last = r.work_date;
            }
        });

        return {
            deadline,
            total: counted.length,
            withReport: withReport.length,
            onTime: onTime.length,
            missingCount: missing.filter(m => !m.waiting).length,
            waitingCount: missing.filter(m => m.waiting).length,
            crews: [...crews.values()].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name, 'uk')),
            reports, missing,
        };
    }, [data]);

    const WHEN = {
        late: <Chip tone="warn">пізно</Chip>,
        nextday: <Chip tone="danger">наступного дня</Chip>,
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[17px] font-bold text-slate-900 inline-flex items-center gap-2 mr-auto">
                    <FaClipboardCheck className="text-indigo-600" size={14} /> Звіти бригад
                    {stats && <Tip text={`Вчасно — того ж дня до ${hhmm(stats.deadline)} (година вечірнього зведення в «Налаштуваннях»). Виїзд — об'єкт у графіку в цей день.`} />}
                </h2>
                <Segmented value={days} onChange={setDays} options={PERIODS} />
                <IconBtn icon={FaSyncAlt} label="Оновити" onClick={load} />
            </div>

            {loading || !stats ? <div className={T.card}><Skeleton rows={6} /></div> : stats.total + stats.waitingCount === 0 ? (
                <div className={T.card}><EmptyState icon={FaClipboardCheck} title="За цей період виїздів на об'єкти не було" /></div>
            ) : <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <Tile label="Виїздів на об'єкти" value={stats.total} hint={stats.waitingCount ? `ще чекаємо сьогодні: ${stats.waitingCount}` : null} />
                    <Tile label="Зі звітом" value={`${pct(stats.withReport, stats.total)}%`} hint={`${stats.withReport} з ${stats.total}`}
                        tone={pct(stats.withReport, stats.total) >= 80 ? 'text-emerald-700' : 'text-amber-700'} />
                    <Tile label="Вчасно" value={stats.onTime} hint={stats.withReport ? `${pct(stats.onTime, stats.withReport)}% звітів` : null} />
                    <Tile label="Без звіту" value={stats.missingCount} tone={stats.missingCount ? 'text-rose-700' : 'text-slate-900'} />
                </div>

                <div className={`${T.card} overflow-hidden`}>
                    <div className="px-4 py-2.5 border-b border-slate-100 text-[13.5px] font-bold text-slate-900 flex items-center gap-2">
                        <FaUsers size={12} className="text-slate-400" /> Бригади
                        <Tip text="Виїзд зараховуємо тому, хто подав звіт. Якщо звіту немає — бригадиру, закріпленому за об'єктом (коли він їхав), інакше бригадиру з бригади." />
                    </div>
                    <ul className="divide-y divide-slate-100">
                        {stats.crews.map(c => (
                            <li key={c.id} className="px-4 py-2.5 grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-center">
                                <div className="min-w-0">
                                    <div className="text-[13.5px] font-semibold text-slate-900 break-words">{c.name}</div>
                                    <div className="text-[12px] text-slate-500 break-words">
                                        виїздів {c.visits} · звітів {c.reports} · вчасно {c.onTime}
                                        {c.times.length > 0 && ` · зазвичай о ${hhmm(median(c.times))}`}
                                        {c.last && ` · останній ${dayLabel(c.last)}`}
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between text-[12px] text-slate-500"><span>зі звітом</span><b className="tabular-nums text-slate-900">{pct(c.reports, c.visits)}%</b></div>
                                    <Bar className="mt-1" segments={[{ pct: pct(c.reports, c.visits), tone: pct(c.reports, c.visits) >= 80 ? 'ok' : pct(c.reports, c.visits) >= 40 ? 'warn' : 'danger' }]} />
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className={`${T.card} overflow-hidden`}>
                    <div className="px-4 py-2.5 border-b border-slate-100">
                        <Segmented value={view} onChange={setView} options={[
                            { value: 'reports', label: `Звіти · ${stats.reports.length}` },
                            { value: 'missing', label: `Без звіту · ${stats.missing.length}` },
                        ]} />
                    </div>
                    {view === 'reports' ? (
                        stats.reports.length === 0 ? <div className="px-4 py-6 text-center text-[13px] text-slate-400">Звітів за цей період немає</div> : (
                            <ul className="divide-y divide-slate-100">
                                {stats.reports.map(r => (
                                    <li key={r.id}>
                                        <button type="button" onClick={() => navigate(`/project/${r.installation_custom_id}?tab=reports&r=${r.id}`)}
                                            className="w-full text-left px-4 py-2.5 hover:bg-slate-50">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="text-[12px] font-semibold text-slate-500 w-[84px]">{dayLabel(r.work_date)}</span>
                                                <span className={T.mono}>СЕС-{r.installation_custom_id}</span>
                                                <span className="text-[13.5px] font-semibold text-slate-900 break-words min-w-0">{r.objName}</span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-600">
                                                <span>подав <b className="text-slate-800">{r.author}</b> · {kyivDay(r.submitted_at) === r.work_date ? 'о' : new Date(r.submitted_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Kyiv' }) + ' о'} {kyivTime(r.submitted_at)}</span>
                                                {WHEN[r.when]}
                                                {r.day_status && r.day_status !== 'ok' && <Chip tone="danger" icon={FaExclamationTriangle}>проблема</Chip>}
                                                {r.money_amount != null && <Chip tone="ok" icon={FaMoneyBillWave}>гроші</Chip>}
                                                {r.edits.length > 0 && (
                                                    <Chip tone="neutral" icon={FaPen}>
                                                        правили {r.edits.length} раз{r.edits.length > 1 ? 'и' : ''} · {r.edits[r.edits.length - 1].actor_name || '—'}
                                                    </Chip>
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )
                    ) : (
                        stats.missing.length === 0 ? <div className="px-4 py-6 text-center text-[13px] text-slate-400">Без звіту нічого — усі виїзди зі звітом</div> : (
                            <ul className="divide-y divide-slate-100">
                                {stats.missing.map(m => (
                                    <li key={m.key} className="px-4 py-2.5">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="text-[12px] font-semibold text-slate-500 w-[84px]">{dayLabel(m.date)}</span>
                                            <span className={T.mono}>СЕС-{m.obj}</span>
                                            <span className="text-[13.5px] font-semibold text-slate-900 break-words min-w-0">{m.objName}</span>
                                            {m.waiting ? <Chip tone="info">ще чекаємо</Chip> : <Chip tone="danger">звіту немає</Chip>}
                                        </div>
                                        <div className="mt-0.5 text-[12.5px] text-slate-600 break-words">
                                            {m.crew.map(p => (p === m.assigned ? `${p.name} (бригадир об'єкта)` : p.tier === 1 ? `${p.name} (бригадир)` : p.name)).join(', ') || 'бригада не вказана'}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )
                    )}
                </div>
            </>}
        </div>
    );
}
