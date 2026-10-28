// =====================================================================
//  K-CORE · Аналітика власника (лише адміністратор)
//
//  Аналітика «порівнево»: на будь-якому рівні ті самі показники —
//  нові, запущені, втрачені, виручка, прибуток, маржа, борг.
//   • рівень 0 — уся компанія + розрізи (відповідальні, області, тип
//     станції, потужність, кріплення, компанія);
//   • клік по групі — та сама аналітика лише для неї, і її можна
//     розрізати далі (напр. відповідальний → область);
//   • клік по показнику чи стовпчику графіка — список об'єктів за ним
//     з виручкою, собівартістю і маржею кожного → картка об'єкта.
//  Увесь шлях — в адресі (?f=manager:17&f=oblast:Рівненська&show=profit),
//  тож «Назад» у браузері повертає на попередній рівень.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as ChartTip, CartesianGrid, Legend,
} from 'recharts';
import { FaSyncAlt, FaArrowRight, FaHistory, FaChevronRight, FaSortAmountDown, FaSortAmountUp } from 'react-icons/fa';

import Layout from './Layout';
import { supabase } from './supabaseClient';
import { T, Btn, Segmented, Tip, Skeleton, Chip, useToast, humanError, num } from './ui';
import { STAGE_GROUPS, normalizeGroupKey, getStageGroupLabel } from './domain/stages';
import { LOST_REASONS, formatMoney, getObjectStatus } from './domain/objects';
import { LEAD_SOURCES, getLeadSourceLabel } from './domain/leads';
import { median, stageTone, loadStageNorms } from './domain/pipeline';
import { DIMENSIONS, getDimension, buildRecords, stats, groupBy, applyFilters, touchedInPeriod } from './domain/analytics';
import { fetchAll } from './utils/fetchAll';
import { hasPaymentSchedule, hasLeads } from './utils/features';
import { useUsdRate } from './utils/settings';
import UsdRateEditor from './pages/UsdRateEditor';

const MONTHS_UA = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const monthKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (key) => { const [y, m] = key.split('-'); return `${MONTHS_UA[Number(m) - 1]} ${y.slice(2)}`; };

const lastMonths = (n) => {
    const out = [];
    const d = new Date();
    d.setDate(1);
    for (let i = n - 1; i >= 0; i -= 1) out.push(monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1)));
    return out;
};

const toneText = (tone) => (tone === 'danger' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-700' : 'text-slate-700');
const marginTone = (m) => (m == null ? 'text-slate-300' : m < 10 ? 'text-rose-600' : m < 20 ? 'text-amber-700' : 'text-emerald-700');

/* Які об'єкти показати в списку */
const SHOWS = [
    { key: 'all', label: 'Усі за період', test: touchedInPeriod, month: (r, m) => monthKey(r.o.created_at) === m || (r.launchedAt && monthKey(r.launchedAt) === m) },
    { key: 'created', label: 'Нові', test: (r) => r.createdIn, month: (r, m) => monthKey(r.o.created_at) === m },
    { key: 'launched', label: 'Запущені', test: (r) => r.launchedIn, month: (r, m) => monthKey(r.launchedAt) === m },
    { key: 'profit', label: 'Рентабельність', test: (r) => r.launchedIn, month: (r, m) => monthKey(r.launchedAt) === m },
    { key: 'lost', label: 'Втрачені', test: (r) => r.lostIn, month: (r, m) => monthKey(r.o.lost_at || r.o.created_at) === m },
    { key: 'debt', label: 'З боргом', test: (r) => r.debt > 0.5, month: () => true },
];
const getShow = (key) => SHOWS.find(s => s.key === key) || null;

const PREF_CUR = 'kcore.analytics.cur';
const readPref = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const writePref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* немає сховища */ } };

const Section = ({ title, hint, right, children, className = '', pad = 'p-4' }) => (
    <div className={`${T.card} ${className}`}>
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-1.5">{title}{hint && <Tip text={hint} width={300} />}</h2>
            {right}
        </div>
        <div className={pad}>{children}</div>
    </div>
);

/* Заголовок колонки, по якому можна сортувати */
const SortTh = ({ id, sort, onSort, children, className = '' }) => {
    const on = sort.by === id;
    const Icon = on && sort.dir === 'asc' ? FaSortAmountUp : FaSortAmountDown;
    return (
        <th className={`${T.th} ${className}`}>
            <button type="button" onClick={() => onSort(id)}
                className={`inline-flex items-center gap-1 uppercase tracking-wide ${on ? 'text-indigo-700' : 'hover:text-slate-800'}`}>
                {children}{on && <Icon size={9} />}
            </button>
        </th>
    );
};

const useSort = (initial) => {
    const [sort, setSort] = useState(initial);
    const onSort = (by) => setSort(s => (s.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: by === 'name' ? 'asc' : 'desc' }));
    return [sort, onSort, setSort];
};

const sortList = (list, sort, get) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
        const x = get(a, sort.by), y = get(b, sort.by);
        if (x == null && y == null) return 0;
        if (x == null) return 1;          // порожні — завжди внизу
        if (y == null) return -1;
        if (typeof x === 'string') return x.localeCompare(y, 'uk') * dir;
        return (x - y) * dir;
    });
};

export default function AnalyticsPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const topRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [cur, setCur] = useState(() => readPref(PREF_CUR, 'USD'));
    const settingsRate = useUsdRate();

    /* --- Стан з адреси --- */
    const period = [3, 6, 12, 24].includes(Number(params.get('p'))) ? Number(params.get('p')) : 6;
    const filters = useMemo(() => params.getAll('f').map(s => {
        const i = s.indexOf(':');
        return i > 0 ? { dim: s.slice(0, i), key: s.slice(i + 1) } : null;
    }).filter(f => f && getDimension(f.dim)), [params]);
    const show = getShow(params.get('show'));
    const month = params.get('m') || null;
    const freeDims = DIMENSIONS.filter(d => !filters.some(f => f.dim === d.key));
    const by = freeDims.find(d => d.key === params.get('by')) || freeDims[0] || null;
    const isDrill = filters.length > 0 || !!show;

    /** Перехід на інший рівень. Кожен — окремий крок історії, щоб «Назад» працював */
    const go = useCallback((next, { replace = false } = {}) => {
        const p = new URLSearchParams();
        if (period !== 6) p.set('p', String(period));
        (next.filters ?? filters).forEach(f => p.append('f', `${f.dim}:${f.key}`));
        const s = next.show === undefined ? show?.key : next.show;
        if (s) p.set('show', s);
        const m = next.month === undefined ? month : next.month;
        if (m && s) p.set('m', m);
        const b = next.by === undefined ? params.get('by') : next.by;
        if (b) p.set('by', b);
        if (next.period) { if (next.period !== 6) p.set('p', String(next.period)); else p.delete('p'); }
        setParams(p, { replace });
    }, [filters, show, month, period, params, setParams]);

    const level = `${filters.map(f => `${f.dim}:${f.key}`).join('|')}/${show?.key || ''}/${month || ''}`;
    useEffect(() => { topRef.current?.scrollIntoView({ block: 'start' }); }, [level]);

    /* --- Дані --- */
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [objects, launches, durations, profit, norms, employees, schedReady, leadsReady] = await Promise.all([
                fetchAll(() => supabase.from('installations')
                    .select('custom_id, name, created_at, status, workflow_stage, capacity_kw, lost_at, lost_stage, lost_reason, responsible_emp_id, station_type, mount_type, working_company, bank, bank_name, client:clients(name, company_name, populated_place, oblast)')
                    .or('is_subcontract.eq.false,is_subcontract.is.null').order('custom_id')),
                fetchAll(() => supabase.from('v_object_launch').select('installation_custom_id, launched_at').order('installation_custom_id')),
                fetchAll(() => supabase.from('v_stage_durations').select('stage_key, left_at, days').order('left_at')),
                fetchAll(() => supabase.from('v_object_profit')
                    .select('installation_custom_id, revenue_uah, cost_uah, profit_uah, margin_pct, materials_items, materials_missing, labour_missing, usd_rate')
                    .order('installation_custom_id')),
                loadStageNorms(),
                supabase.from('employees').select('custom_id, name').then(r => r.data || []),
                hasPaymentSchedule(),
                hasLeads(),
            ]);
            const [receivables, leads] = await Promise.all([
                schedReady ? fetchAll(() => supabase.from('v_receivables').select('*').order('installation_custom_id')) : [],
                leadsReady ? fetchAll(() => supabase.from('leads').select('created_at, source, status, converted_at').order('id')) : [],
            ]);
            setData({ objects, launches, durations, profit, norms, employees, receivables, leads, leadsReady });
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const ctx = useMemo(() => {
        const names = new Map((data?.employees || []).map(e => [String(e.custom_id), e.name]));
        return { empName: (k) => names.get(String(k)) };
    }, [data]);

    // Курс — той, за яким база рахувала прибуток, або з налаштувань; без курсу — лише гривні
    const usdRate = Number(data?.profit?.[0]?.usd_rate) || Number(settingsRate) || null;
    /** Гроші в аналітиці зберігаються в гривнях; показуємо у вибраній валюті */
    const money = useCallback((uah) => (cur === 'USD' && usdRate
        ? formatMoney(Math.round((Number(uah) || 0) / usdRate), 'USD')
        : formatMoney(Math.round(Number(uah) || 0), 'UAH')), [cur, usdRate]);
    const short = useCallback((uah) => {
        const v = cur === 'USD' && usdRate ? uah / usdRate : uah;
        return Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}к` : Math.round(v);
    }, [cur, usdRate]);

    /* --- Записи по об'єктах і вибірка поточного рівня --- */
    const base = useMemo(() => {
        if (!data) return null;
        const months = lastMonths(period);
        const from = new Date(`${months[0]}-01T00:00:00`);
        const prevFrom = new Date(from); prevFrom.setMonth(prevFrom.getMonth() - period);
        const inPeriod = (d) => !!d && new Date(d) >= from;
        const inPrev = (d) => !!d && new Date(d) >= prevFrom && new Date(d) < from;
        const recs = buildRecords({
            objects: data.objects,
            launches: new Map(data.launches.map(l => [l.installation_custom_id, l.launched_at])),
            profit: new Map(data.profit.map(p => [p.installation_custom_id, p])),
            debts: new Map(data.receivables.map(r => [r.installation_custom_id, r])),
            usdRate,
            inPeriod,
        });
        return { months, from, inPeriod, inPrev, recs };
    }, [data, period, usdRate]);

    const view = useMemo(() => {
        if (!base) return null;
        const scope = applyFilters(base.recs, filters);
        const s = stats(scope);
        const createdPrev = scope.filter(r => base.inPrev(r.o.created_at)).length;

        // По місяцях
        const idx = new Map(base.months.map((m, i) => [m, i]));
        const series = base.months.map(m => ({ key: m, label: monthLabel(m), created: 0, launched: 0, kw: 0, revenue: 0, revenueObjects: 0, profit: 0, completeObjects: 0 }));
        scope.forEach(r => {
            const ci = idx.get(monthKey(r.o.created_at));
            if (ci != null) series[ci].created += 1;
            if (!r.launchedIn) return;
            const li = idx.get(monthKey(r.launchedAt));
            if (li == null) return;
            const x = series[li];
            x.launched += 1; x.kw += r.kw;
            if (r.revenue > 0) { x.revenue += r.revenue; x.revenueObjects += 1; }
            if (r.complete) { x.profit += r.profit; x.completeObjects += 1; }
        });
        const chartSeries = series.map(x => ({
            ...x,
            revenueV: cur === 'USD' ? x.revenue / usdRate : x.revenue,
            profitV: cur === 'USD' ? x.profit / usdRate : x.profit,
        }));

        const groups = by ? groupBy(scope, by, ctx) : [];

        // Об'єкти поточного рівня
        let list = [];
        if (isDrill) {
            const sh = show || SHOWS[0];
            list = scope.filter(sh.test);
            if (month) list = list.filter(r => sh.month(r, month));
        }
        return { scope, s, createdPrev, series: chartSeries, groups, list };
    }, [base, filters, by, ctx, isDrill, show, month, cur, usdRate]);

    /* Розділи першого рівня (етапи, втрати, борги, джерела) — по всій компанії */
    const company = useMemo(() => {
        if (!data || !base) return null;
        const { inPeriod } = base;
        const lostList = data.objects.filter(o => o.status === 'lost' && inPeriod(o.lost_at));
        const lostByStage = STAGE_GROUPS.map(g => ({ key: g.key, label: g.label, n: lostList.filter(o => normalizeGroupKey(o.lost_stage) === g.key).length })).filter(x => x.n > 0);
        const lostByReason = LOST_REASONS.map(r => ({ key: r.key, label: r.label, n: lostList.filter(o => o.lost_reason === r.key).length }))
            .filter(x => x.n > 0).sort((x, y) => y.n - x.n);
        const durations = STAGE_GROUPS.map(g => {
            const list = data.durations.filter(d => normalizeGroupKey(d.stage_key) === g.key && inPeriod(d.left_at)).map(d => Number(d.days));
            const avg = list.length ? list.reduce((s, x) => s + x, 0) / list.length : null;
            return { key: g.key, label: g.label, n: list.length, med: median(list.map(x => Math.round(x))), avg, norm: data.norms[g.key] || null };
        });
        const inUsd = (r) => (r.currency === 'UAH' ? Number(r.debt) / usdRate : Number(r.debt));
        const topDebtors = data.receivables.slice().sort((x, y) => inUsd(y) - inUsd(x)).slice(0, 8);
        const leadsInPeriod = data.leads.filter(l => inPeriod(l.created_at));
        const sources = LEAD_SOURCES.map(s => {
            const list = leadsInPeriod.filter(l => l.source === s.key);
            return { key: s.key, label: s.label, n: list.length, converted: list.filter(l => l.status === 'converted').length };
        });
        const noSource = leadsInPeriod.filter(l => !l.source);
        if (noSource.length) sources.push({ key: 'none', label: getLeadSourceLabel(null), n: noSource.length, converted: noSource.filter(l => l.status === 'converted').length });
        return { lostList, lostByStage, lostByReason, durations, topDebtors, leadsInPeriod, sources: sources.filter(s => s.n > 0).sort((x, y) => y.n - x.n) };
    }, [data, base, usdRate]);

    const setCurrency = (v) => { setCur(v); writePref(PREF_CUR, v); };
    const groupName = (f) => getDimension(f.dim).name(f.key, ctx);

    /* --- Хлібні крихти: Аналітика › Відповідальний: Петро › Область: Рівненська › Запущені --- */
    const crumbs = [
        { label: 'Аналітика', onClick: isDrill ? () => go({ filters: [], show: null, month: null }) : null },
        ...filters.map((f, i) => ({
            label: `${groupName(f)}`, hint: getDimension(f.dim).one,
            onClick: i < filters.length - 1 || show ? () => go({ filters: filters.slice(0, i + 1), show: null, month: null }) : null,
        })),
        ...(show ? [{ label: `${show.label}${month ? ` · ${monthLabel(month)}` : ''}` }] : []),
    ];

    const kpis = view && [
        {
            key: 'created', label: 'Нові об\'єкти', value: view.s.created,
            sub: view.createdPrev ? `${view.s.created >= view.createdPrev ? '+' : ''}${view.s.created - view.createdPrev} до попереднього періоду` : 'за період',
        },
        { key: 'launched', label: 'Запущено', value: view.s.launched, sub: `${num(view.s.launchedKw, 1)} кВт` },
        {
            key: 'lost', label: 'Втрачено', value: view.s.lost, tone: view.s.lost ? 'warn' : null,
            sub: view.s.winRate != null ? `доходять до запуску ${Math.round(view.s.winRate)}%` : 'угоди ще не вирішились',
            hint: 'Втрачені й скасовані. «Доходять до запуску» — частка запущених серед тих, що вже вирішились (запущені + втрачені).',
        },
        { key: 'launched', label: 'Виручка запущених', value: money(view.s.revenue), sub: `${view.s.launched} об'єктів`, id: 'revenue' },
        {
            key: 'profit', label: 'Прибуток · маржа',
            value: view.s.completeN ? money(view.s.profit) : '—',
            sub: view.s.completeN ? `маржа ${num(view.s.margin, 1)}% · ${view.s.completeN} з ${view.s.launched} пораховано` : 'немає об\'єктів з повною собівартістю',
            hint: 'Лише запущені об\'єкти з повною собівартістю: є списані матеріали, у кожного є ціна закупівлі, у монтажників — ставка. Інакше прибуток завищений. Ціни — «Склад» → «Ціни закупівлі».',
        },
        { key: 'debt', label: 'Борг зараз', value: money(view.s.debt), sub: `${view.s.debtN} об'єктів`, tone: view.s.debt > 0.5 ? 'danger' : null },
    ];

    return (
        <Layout>
            <div ref={topRef} className="max-w-[1500px] mx-auto p-3 sm:p-6 space-y-4 text-slate-800 scroll-mt-4">
                {/* Шапка: шлях + період + валюта */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <div className="mr-auto min-w-0">
                        {isDrill ? (
                            <nav className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
                                {crumbs.map((c, i) => (
                                    <React.Fragment key={i}>
                                        {i > 0 && <FaChevronRight size={9} className="text-slate-300" />}
                                        {c.onClick ? (
                                            <button type="button" onClick={c.onClick} className="font-semibold text-indigo-600 hover:underline">
                                                {c.hint && <span className="text-slate-400 font-medium">{c.hint}: </span>}{c.label}
                                            </button>
                                        ) : (
                                            <span className="font-bold text-slate-900 text-[18px] sm:text-[20px] tracking-tight">
                                                {c.hint && <span className="text-slate-400 font-semibold text-[13px] mr-1">{c.hint}:</span>}{c.label}
                                            </span>
                                        )}
                                    </React.Fragment>
                                ))}
                            </nav>
                        ) : (
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Аналітика</h1>
                        )}
                    </div>
                    <Segmented value={period} onChange={(v) => go({ period: v }, { replace: true })}
                        options={[{ value: 3, label: '3 міс' }, { value: 6, label: '6 міс' }, { value: 12, label: '12 міс' }, { value: 24, label: '2 роки' }]} />
                    <Segmented value={cur} onChange={setCurrency} options={[{ value: 'USD', label: '$' }, { value: 'UAH', label: '₴' }]} />
                    <UsdRateEditor compact />
                    {!isDrill && <Btn icon={FaHistory} onClick={() => navigate('/admin/changes')}>Журнал змін</Btn>}
                    <Btn icon={FaSyncAlt} onClick={load} disabled={loading}><span className="hidden sm:inline">Оновити</span></Btn>
                </div>

                {loading || !view ? <div className={T.card}><Skeleton rows={10} /></div> : <>
                    {/* Показники — клік відкриває список об'єктів за ними */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
                        {kpis.map(k => {
                            const active = show?.key === k.key && !month && (k.id !== 'revenue');
                            return (
                                <div key={k.label} role="link" tabIndex={0}
                                    onClick={() => go({ show: k.key, month: null })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') go({ show: k.key, month: null }); }}
                                    className={`${T.card} p-3 sm:p-4 cursor-pointer transition-colors hover:border-indigo-300
                                        ${active ? 'border-indigo-400 ring-1 ring-indigo-200' : k.tone === 'warn' ? 'border-amber-200 bg-amber-50/40' : k.tone === 'danger' ? 'border-rose-200 bg-rose-50/30' : ''}`}>
                                    <div className="text-[12px] sm:text-[12.5px] font-semibold text-slate-500 flex items-center gap-1">{k.label}{k.hint && <Tip text={k.hint} width={300} />}</div>
                                    <div className="mt-1 text-[20px] sm:text-[24px] leading-tight font-bold tabular-nums text-slate-900 break-words">{k.value}</div>
                                    <div className="mt-1 text-[11.5px] sm:text-[12px] text-slate-500">{k.sub}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Графіки — клік по стовпчику показує об'єкти цього місяця */}
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <Section title="Нові й запущені об'єкти" hint="Нові — створені в місяці. Запущені — перейшли на етап «Запуск». Клік по стовпчику — список об'єктів цього місяця.">
                            <div className="h-56 sm:h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={view.series} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <ChartTip
                                            formatter={(v, name, p) => (name === 'Запущено' ? [`${v} · ${num(p.payload.kw, 1)} кВт`, name] : [v, name])}
                                            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12.5 }} />
                                        <Legend wrapperStyle={{ fontSize: 12.5 }} />
                                        <Bar dataKey="created" name="Нові" fill="#818cf8" radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer"
                                            onClick={(d) => d?.payload?.key && go({ show: 'created', month: d.payload.key })} />
                                        <Bar dataKey="launched" name="Запущено" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer"
                                            onClick={(d) => d?.payload?.key && go({ show: 'launched', month: d.payload.key })} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Section>

                        <Section title="Виручка і прибуток по місяцях запуску" hint="Виручка — усі об'єкти, запущені в місяці. Прибуток — лише ті з них, де собівартість порахована повністю. Клік по стовпчику — рентабельність кожного об'єкта цього місяця.">
                            <div className="h-56 sm:h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={view.series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false}
                                            tickFormatter={v => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}к` : Math.round(v))} />
                                        <ChartTip
                                            formatter={(v, name, p) => [name === 'Виручка'
                                                ? `${money(p.payload.revenue)} · ${p.payload.revenueObjects} об.`
                                                : `${money(p.payload.profit)} · ${p.payload.completeObjects} об. з повною собівартістю`, name]}
                                            contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12.5 }} />
                                        <Legend wrapperStyle={{ fontSize: 12.5 }} />
                                        <Bar dataKey="revenueV" name="Виручка" fill="#c7d2fe" radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer"
                                            onClick={(d) => d?.payload?.key && go({ show: 'profit', month: d.payload.key })} />
                                        <Bar dataKey="profitV" name="Прибуток" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} cursor="pointer"
                                            onClick={(d) => d?.payload?.key && go({ show: 'profit', month: d.payload.key })} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </Section>
                    </div>

                    {/* Список об'єктів поточного рівня */}
                    {isDrill && (
                        <ObjectsSection
                            list={view.list} show={show || SHOWS[0]} month={month} money={money} ctx={ctx}
                            onShow={(k) => go({ show: k, month: null })}
                            onClearMonth={() => go({ month: null })}
                            onOpen={(id) => navigate(`/project/${id}`)}
                        />
                    )}

                    {/* Розрізи — клік по групі веде рівнем нижче */}
                    {by && (
                        <SliceSection
                            dims={freeDims} by={by} groups={view.groups} money={money} short={short}
                            title={filters.length ? 'Розрізати далі' : 'Розрізи'}
                            onBy={(k) => go({ by: k }, { replace: true })}
                            onOpen={(g) => go({ filters: [...filters, { dim: by.key, key: g.key }], show: null, month: null, by: null })}
                        />
                    )}

                    {!isDrill && company && <>
                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                            <Section title="Скільки триває кожен етап" hint="Етапи, які об'єкти завершили в цьому періоді: медіана (половина швидше, половина довше) і середнє. Червоне — довше за норму.">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-slate-200">
                                            <th className={`${T.th} bg-transparent px-0`}>Етап</th>
                                            <th className={`${T.th} bg-transparent text-right`}>Медіана</th>
                                            <th className={`${T.th} bg-transparent text-right`}>Середнє</th>
                                            <th className={`${T.th} bg-transparent text-right pr-0`}>Норма</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {company.durations.map(d => (
                                            <tr key={d.key}>
                                                <td className="py-2 text-[13.5px] text-slate-700">{d.label}<span className="text-[11.5px] text-slate-400"> · {d.n}</span></td>
                                                <td className={`py-2 text-right text-[13.5px] font-bold tabular-nums ${toneText(stageTone(d.med, d.norm))}`}>{d.med != null ? `${d.med} дн` : '—'}</td>
                                                <td className="py-2 text-right text-[13px] tabular-nums text-slate-500">{d.avg != null ? `${num(d.avg, 1)} дн` : '—'}</td>
                                                <td className="py-2 text-right text-[13px] tabular-nums text-slate-400">{d.norm ? `${d.norm} дн` : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Section>

                            <Section title="Де губляться угоди" right={<span className="text-[12.5px] text-slate-400 tabular-nums">{company.lostList.length}</span>}>
                                {company.lostList.length === 0 ? (
                                    <p className="text-[13px] text-slate-400 text-center py-4">За цей період угод не втрачено</p>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <div className={T.label}>На якому етапі</div>
                                            {company.lostByStage.map(s => (
                                                <div key={s.key} className="grid grid-cols-[100px_1fr_28px] items-center gap-2 text-[13px]">
                                                    <span className="text-slate-600">{s.label}</span>
                                                    <span className="h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-rose-400 rounded-full" style={{ width: `${(s.n / company.lostList.length) * 100}%` }} /></span>
                                                    <span className="text-right font-bold tabular-nums">{s.n}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="space-y-2">
                                            <div className={T.label}>Чому</div>
                                            {company.lostByReason.map(r => (
                                                <div key={r.key} className="grid grid-cols-[100px_1fr_44px] items-center gap-2 text-[13px]">
                                                    <span className="text-slate-600">{r.label}</span>
                                                    <span className="h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-slate-400 rounded-full" style={{ width: `${(r.n / company.lostList.length) * 100}%` }} /></span>
                                                    <span className="text-right font-bold tabular-nums">{Math.round((r.n / company.lostList.length) * 100)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Section>

                            <Section title="Хто скільки винен" right={
                                <button type="button" onClick={() => navigate('/payments')} className="text-[12.5px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">
                                    Усі борги <FaArrowRight size={10} />
                                </button>
                            }>
                                {company.topDebtors.length === 0 ? (
                                    <p className="text-[13px] text-slate-400 text-center py-4">Боргів немає</p>
                                ) : (
                                    <ul className="divide-y divide-slate-100 -my-2">
                                        {company.topDebtors.map(r => (
                                            <li key={r.installation_custom_id} onClick={() => navigate(`/project/${r.installation_custom_id}`)}
                                                className="py-2 flex items-center gap-3 cursor-pointer hover:bg-slate-50 -mx-2 px-2 rounded-lg">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[13.5px] font-semibold text-slate-900 break-words">{r.name || r.client_name}</div>
                                                    <div className="text-[11.5px] text-slate-400">
                                                        СЕС-{r.installation_custom_id}{r.status === 'completed' ? ' · завершено' : ''}
                                                    </div>
                                                </div>
                                                <span className="text-[13.5px] font-bold tabular-nums text-rose-700 whitespace-nowrap">{formatMoney(r.debt, r.currency)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </Section>
                        </div>

                        <Section title="Звідки клієнти" hint="З лідів: скільки звернень дало кожне джерело і скільки з них стали об'єктами."
                            right={<button type="button" onClick={() => navigate('/leads?v=all')} className="text-[12.5px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">Ліди <FaArrowRight size={10} /></button>}>
                            {!data.leadsReady || company.leadsInPeriod.length === 0 ? (
                                <p className="text-[13px] text-slate-400 text-center py-3">
                                    Ще немає даних: тут з'являться джерела, щойно в «Лідах» почнуть записувати звернення.
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                                    {company.sources.map(s => (
                                        <div key={s.key} className="grid grid-cols-[130px_1fr_92px] items-center gap-2 text-[13px]">
                                            <span className="text-slate-600">{s.label}</span>
                                            <span className="h-2 rounded-full bg-slate-100 overflow-hidden"><span className="block h-full bg-indigo-400 rounded-full" style={{ width: `${(s.n / company.sources[0].n) * 100}%` }} /></span>
                                            <span className="text-right tabular-nums"><b>{s.n}</b><span className="text-slate-400"> · {s.converted} об.</span></span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </>}
                </>}
            </div>
        </Layout>
    );
}

/* =====================================================================
 *  РОЗРІЗИ — групи з показниками; клік веде рівнем нижче
 * ===================================================================== */

function SliceSection({ dims, by, groups, money, title, onBy, onOpen }) {
    const [sort, onSort] = useSort({ by: 'revenue', dir: 'desc' });
    const get = (g, k) => {
        if (k === 'name') return g.name;
        if (k === 'margin') return g.s.margin;
        if (k === 'profit') return g.s.completeN ? g.s.profit : null;
        if (k === 'winRate') return g.s.winRate;
        if (by.order && k === 'order') return by.order(g.key);
        return g.s[k];
    };
    // Потужність логічніше показувати по порядку, а не за виручкою
    const rows = sortList(groups, by.order && sort.by === 'revenue' && sort.dir === 'desc' ? { by: 'order', dir: 'asc' } : sort, get);
    const max = Math.max(1, ...groups.map(g => g.s.revenue));

    return (
        <Section title={title} pad="p-0"
            hint="Клік по рядку — уся аналітика лише для цієї групи, і її можна розрізати далі. Гроші — запущені в періоді; борг — поточний."
            right={
                <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 max-w-full">
                    {dims.map(d => (
                        <button key={d.key} type="button" onClick={() => onBy(d.key)}
                            className={`h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap border transition-colors
                                ${by.key === d.key ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {d.label}
                        </button>
                    ))}
                </div>
            }>
            {rows.length === 0 ? (
                <p className="text-[13px] text-slate-400 text-center py-6">За цей період немає об'єктів</p>
            ) : <>
                {/* Комп'ютер — таблиця */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <SortTh id="name" sort={sort} onSort={onSort} className="pl-4">{by.one}</SortTh>
                                <SortTh id="created" sort={sort} onSort={onSort} className="text-right">Нові</SortTh>
                                <SortTh id="launched" sort={sort} onSort={onSort} className="text-right">Запущено</SortTh>
                                <SortTh id="lost" sort={sort} onSort={onSort} className="text-right">Втрачено</SortTh>
                                <SortTh id="winRate" sort={sort} onSort={onSort} className="text-right">Доходять</SortTh>
                                <SortTh id="revenue" sort={sort} onSort={onSort} className="text-right">Виручка</SortTh>
                                <SortTh id="profit" sort={sort} onSort={onSort} className="text-right">Прибуток</SortTh>
                                <SortTh id="margin" sort={sort} onSort={onSort} className="text-right">Маржа</SortTh>
                                <SortTh id="debt" sort={sort} onSort={onSort} className="text-right pr-4">Борг</SortTh>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.map(g => (
                                <tr key={g.key} onClick={() => onOpen(g)} className="cursor-pointer hover:bg-indigo-50/40 group">
                                    <td className={`${T.td} pl-4`}>
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-900 group-hover:text-indigo-700">{g.name}</span>
                                            <FaChevronRight size={9} className="text-slate-300 group-hover:text-indigo-500" />
                                        </div>
                                        <span className="block mt-1 h-1 rounded-full bg-slate-100 max-w-[220px] overflow-hidden">
                                            <span className="block h-full bg-indigo-300 rounded-full" style={{ width: `${(g.s.revenue / max) * 100}%` }} />
                                        </span>
                                    </td>
                                    <td className={`${T.td} text-right tabular-nums`}>{g.s.created || <span className="text-slate-300">0</span>}</td>
                                    <td className={`${T.td} text-right tabular-nums`}>
                                        <b>{g.s.launched}</b>{g.s.launchedKw > 0 && <span className="text-slate-400 text-[12px]"> · {num(g.s.launchedKw, 0)} кВт</span>}
                                    </td>
                                    <td className={`${T.td} text-right tabular-nums ${g.s.lost ? 'text-amber-700 font-semibold' : 'text-slate-300'}`}>{g.s.lost}</td>
                                    <td className={`${T.td} text-right tabular-nums`}>{g.s.winRate != null ? `${Math.round(g.s.winRate)}%` : <span className="text-slate-300">—</span>}</td>
                                    <td className={`${T.td} text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap`}>{g.s.revenue > 0 ? money(g.s.revenue) : <span className="text-slate-300 font-normal">—</span>}</td>
                                    <td className={`${T.td} text-right tabular-nums whitespace-nowrap`}>
                                        {g.s.completeN ? <>{money(g.s.profit)}<span className="block text-[11px] text-slate-400">{g.s.completeN} з {g.s.launched}</span></> : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className={`${T.td} text-right tabular-nums font-bold ${marginTone(g.s.margin)}`}>{g.s.margin != null ? `${num(g.s.margin, 1)}%` : '—'}</td>
                                    <td className={`${T.td} text-right tabular-nums pr-4 whitespace-nowrap ${g.s.debt > 0.5 ? 'text-rose-700 font-semibold' : 'text-slate-300'}`}>{g.s.debt > 0.5 ? money(g.s.debt) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Телефон — картки, усе видно без обрізання */}
                <ul className="md:hidden divide-y divide-slate-100">
                    {rows.map(g => (
                        <li key={g.key} onClick={() => onOpen(g)} className="px-3 py-3 active:bg-indigo-50/50 cursor-pointer">
                            <div className="flex items-start justify-between gap-2">
                                <span className="font-bold text-[14px] text-slate-900 break-words">{g.name}</span>
                                <span className="text-[14px] font-bold tabular-nums text-slate-900 whitespace-nowrap">{g.s.revenue > 0 ? money(g.s.revenue) : ''}</span>
                            </div>
                            <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
                                {[
                                    ['Нові', g.s.created],
                                    ['Запущ.', g.s.launched],
                                    ['Втрач.', g.s.lost],
                                    ['Маржа', g.s.margin != null ? `${Math.round(g.s.margin)}%` : '—', marginTone(g.s.margin)],
                                ].map(([l, v, cls]) => (
                                    <div key={l} className="bg-slate-50 rounded-md py-1">
                                        <div className="text-[10.5px] text-slate-400">{l}</div>
                                        <div className={`text-[13px] font-bold tabular-nums ${cls || 'text-slate-800'}`}>{v}</div>
                                    </div>
                                ))}
                            </div>
                            {g.s.debt > 0.5 && <div className="mt-1.5 text-[12px] text-rose-700 font-semibold">Борг {money(g.s.debt)}</div>}
                        </li>
                    ))}
                </ul>
            </>}
        </Section>
    );
}

/* =====================================================================
 *  ОБ'ЄКТИ рівня — з рентабельністю кожного
 * ===================================================================== */

const PAGE = 50;

function ObjectsSection({ list, show, month, money, ctx, onShow, onClearMonth, onOpen }) {
    const defaultSort = show.key === 'debt' ? { by: 'debt', dir: 'desc' } : show.key === 'profit' ? { by: 'margin', dir: 'asc' } : { by: 'revenue', dir: 'desc' };
    const [sort, onSort, setSort] = useSort(defaultSort);
    const [limit, setLimit] = useState(PAGE);
    useEffect(() => { setSort(defaultSort); setLimit(PAGE); }, [show.key, month]); // eslint-disable-line react-hooks/exhaustive-deps

    const get = (r, k) => {
        switch (k) {
            case 'name': return r.o.name || r.o.client?.name || '';
            case 'stage': return r.o.workflow_stage || '';
            case 'manager': return ctx.empName(r.o.responsible_emp_id) || '';
            case 'kw': return r.kw || null;
            case 'revenue': return r.revenue || null;
            case 'cost': return r.cost || null;
            case 'profit': return r.profit;
            case 'margin': return r.margin;
            case 'debt': return r.debt > 0.5 ? r.debt : null;
            case 'date': return new Date(r.launchedAt || r.o.created_at).getTime();
            default: return null;
        }
    };
    const rows = sortList(list, sort, get);
    const sum = stats(list);
    const totalCost = list.reduce((s, r) => s + (r.complete ? r.cost : 0), 0);

    const statusOf = (r) => {
        if (r.lost) return <Chip tone="neutral">{getObjectStatus(r.o.status).label}</Chip>;
        if (r.o.status === 'completed') return <Chip tone="ok">Завершено</Chip>;
        if (r.o.status === 'on_hold') return <Chip tone="warn">Пауза · {getStageGroupLabel(r.o.workflow_stage)}</Chip>;
        return <Chip tone="accent">{getStageGroupLabel(r.o.workflow_stage)}</Chip>;
    };
    const profitCell = (r) => (r.complete
        ? <span className={r.profit < 0 ? 'text-rose-700' : 'text-slate-900'}>{money(r.profit)}</span>
        : r.revenue > 0 && r.missing.length
            ? <Tip text={`Собівартість неповна: ${r.missing.join('; ')}.`} width={280}><span className="text-[12px] text-amber-700 font-semibold border-b border-dotted border-amber-400 cursor-help">неповна</span></Tip>
            : <span className="text-slate-300">—</span>);

    return (
        <Section pad="p-0"
            title={<span className="inline-flex items-center gap-2">Об'єкти <span className="text-[13px] font-semibold text-slate-400 tabular-nums">{list.length}</span></span>}
            right={
                <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 max-w-full">
                    {SHOWS.map(s => (
                        <button key={s.key} type="button" onClick={() => onShow(s.key)}
                            className={`h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap border transition-colors
                                ${show.key === s.key ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
            }>
            {month && (
                <div className="px-4 py-2 border-b border-slate-100 bg-indigo-50/50 text-[12.5px] flex items-center gap-2">
                    <span className="text-slate-600">Лише {monthLabel(month)}</span>
                    <button type="button" onClick={onClearMonth} className="font-semibold text-indigo-600 hover:underline">увесь період</button>
                </div>
            )}
            {/* Підсумок списку */}
            {list.length > 0 && (
                <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-slate-500">
                    {sum.revenue > 0 && <span>Виручка <b className="text-slate-900 tabular-nums">{money(sum.revenue)}</b></span>}
                    {sum.completeN > 0 && <span>Собівартість <b className="text-slate-900 tabular-nums">{money(totalCost)}</b></span>}
                    {sum.completeN > 0 && <span>Прибуток <b className="text-slate-900 tabular-nums">{money(sum.profit)}</b> · маржа <b className={marginTone(sum.margin)}>{num(sum.margin, 1)}%</b>
                        <span className="text-slate-400"> ({sum.completeN} з {sum.launched} пораховано)</span></span>}
                    {sum.debt > 0.5 && <span>Борг <b className="text-rose-700 tabular-nums">{money(sum.debt)}</b></span>}
                </div>
            )}

            {rows.length === 0 ? (
                <p className="text-[13px] text-slate-400 text-center py-8">Немає об'єктів</p>
            ) : <>
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-200">
                                <SortTh id="name" sort={sort} onSort={onSort} className="pl-4">Об'єкт</SortTh>
                                <SortTh id="stage" sort={sort} onSort={onSort}>Етап</SortTh>
                                <SortTh id="manager" sort={sort} onSort={onSort}>Відповідальний</SortTh>
                                <SortTh id="kw" sort={sort} onSort={onSort} className="text-right">кВт</SortTh>
                                <SortTh id="revenue" sort={sort} onSort={onSort} className="text-right">Виручка</SortTh>
                                <SortTh id="cost" sort={sort} onSort={onSort} className="text-right">Собівартість</SortTh>
                                <SortTh id="profit" sort={sort} onSort={onSort} className="text-right">Прибуток</SortTh>
                                <SortTh id="margin" sort={sort} onSort={onSort} className="text-right">Маржа</SortTh>
                                <SortTh id="debt" sort={sort} onSort={onSort} className="text-right pr-4">Борг</SortTh>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rows.slice(0, limit).map(r => (
                                <tr key={r.id} onClick={() => onOpen(r.id)} className="cursor-pointer hover:bg-indigo-50/40 group">
                                    <td className={`${T.td} pl-4 max-w-[320px]`}>
                                        <div className="font-semibold text-slate-900 group-hover:text-indigo-700 leading-snug">
                                            <span className="font-mono text-[11.5px] text-slate-400 mr-1.5">СЕС-{r.id}</span>{r.o.name || r.o.client?.name}
                                        </div>
                                        <div className="text-[11.5px] text-slate-400">{[r.o.client?.populated_place, r.launchedAt && `запуск ${new Date(r.launchedAt).toLocaleDateString('uk-UA')}`].filter(Boolean).join(' · ')}</div>
                                    </td>
                                    <td className={T.td}>{statusOf(r)}</td>
                                    <td className={`${T.td} text-slate-600`}>{ctx.empName(r.o.responsible_emp_id) || <span className="text-slate-300">—</span>}</td>
                                    <td className={`${T.td} text-right tabular-nums`}>{r.kw ? num(r.kw, 1) : <span className="text-slate-300">—</span>}</td>
                                    <td className={`${T.td} text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap`}>{r.revenue > 0 ? money(r.revenue) : <span className="text-slate-300 font-normal">—</span>}</td>
                                    <td className={`${T.td} text-right tabular-nums whitespace-nowrap ${r.complete ? '' : 'text-slate-400'}`}>{r.cost > 0 ? money(r.cost) : <span className="text-slate-300">—</span>}</td>
                                    <td className={`${T.td} text-right tabular-nums whitespace-nowrap font-semibold`}>{profitCell(r)}</td>
                                    <td className={`${T.td} text-right tabular-nums font-bold ${marginTone(r.margin)}`}>{r.margin != null ? `${num(r.margin, 1)}%` : '—'}</td>
                                    <td className={`${T.td} text-right tabular-nums pr-4 whitespace-nowrap ${r.debt > 0.5 ? 'text-rose-700 font-semibold' : 'text-slate-300'}`}>
                                        {r.debt > 0.5 ? <>{money(r.debt)}{r.overdueDays > 0 && <span className="block text-[11px] font-normal">прострочено {r.overdueDays} дн</span>}</> : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Телефон і планшет — картки */}
                <ul className="lg:hidden divide-y divide-slate-100">
                    {rows.slice(0, limit).map(r => (
                        <li key={r.id} onClick={() => onOpen(r.id)} className="px-3 py-3 active:bg-indigo-50/50 cursor-pointer">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <div className="font-bold text-[14px] text-slate-900 leading-snug break-words">
                                        <span className="font-mono text-[11.5px] text-slate-400 mr-1">СЕС-{r.id}</span>{r.o.name || r.o.client?.name}
                                    </div>
                                    <div className="text-[12px] text-slate-500">{[ctx.empName(r.o.responsible_emp_id), r.kw ? `${num(r.kw, 1)} кВт` : null, r.o.client?.populated_place].filter(Boolean).join(' · ')}</div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <div className="text-[14px] font-bold tabular-nums text-slate-900 whitespace-nowrap">{r.revenue > 0 ? money(r.revenue) : '—'}</div>
                                    {r.margin != null && <div className={`text-[12.5px] font-bold tabular-nums ${marginTone(r.margin)}`}>{num(r.margin, 1)}%</div>}
                                </div>
                            </div>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12px]">
                                {statusOf(r)}
                                {r.complete && <span className="text-slate-500">прибуток <b className={r.profit < 0 ? 'text-rose-700' : 'text-slate-800'}>{money(r.profit)}</b></span>}
                                {!r.complete && r.revenue > 0 && r.missing.length > 0 && <span className="text-amber-700">собівартість неповна: {r.missing.join('; ')}</span>}
                                {r.debt > 0.5 && <span className="text-rose-700 font-semibold">борг {money(r.debt)}</span>}
                            </div>
                        </li>
                    ))}
                </ul>

                {rows.length > limit && (
                    <div className="p-3 border-t border-slate-100 text-center">
                        <Btn variant="soft" onClick={() => setLimit(l => l + PAGE)}>Показати ще {Math.min(PAGE, rows.length - limit)}</Btn>
                    </div>
                )}
            </>}
        </Section>
    );
}
