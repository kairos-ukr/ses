// =====================================================================
//  K-CORE · «Сьогодні» — робочий стіл офісу
//
//  Відповідає на одне питання: що горить і що мені з цим зробити.
//   • Зверху чотири числа: активні об'єкти, без руху, дебіторка, задачі.
//   • «Потребує уваги» — кожен рядок має причину, вік і одну дію.
//     «Мої» — де я відповідальний, «Команда» — усі.
//   • Праворуч виїзди на сьогодні (або найближчі) і воронка коротко.
//  Правила «без руху» й «дебіторки» — ті самі, що у воронці
//  (src/domain/pipeline.js).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaPhone, FaArrowRight, FaBoxes, FaTasks, FaSyncAlt, FaColumns,
} from 'react-icons/fa';

import Layout from './Layout';
import BrigadeReportsCard from './pages/BrigadeReportsCard';
import MyStagesCard from './pages/MyStagesCard';
import ScheduleCard from './pages/ScheduleCard';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { T, Btn, Chip, Tip, Skeleton, EmptyState, Person, useToast, humanError } from './ui';
import { STAGE_GROUPS, normalizeGroupKey, getStageGroupLabel } from './domain/stages';
import { isObjectActive, formatMoney, DEFAULT_CURRENCY, canSeeMoney } from './domain/objects';
import {
    STALE_DAYS, LONG_DAYS, median, stageIndex, costOf, paidOf, debtOf, isReceivable,
    loadActivity, loadStageNorms, stageTone, kw, daysSince,
} from './domain/pipeline';
import { fetchAll } from './utils/fetchAll';
import { hasPaymentSchedule, hasLeads } from './utils/features';

const PRE_DEAL = ['tech_review', 'project', 'proposal'];
const RANK = { crit: 3, warn: 2, info: 1 };
const DOT = { crit: 'bg-rose-500', warn: 'bg-amber-500', info: 'bg-sky-500' };
const LIST_LIMIT = 12;

const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const fmtShort = (d) => (d ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '');
const objTitle = (o) => o.name || o.client?.company_name || o.client?.name || `Об'єкт #${o.custom_id}`;

const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
};

/** Суми в різних валютах окремо, основна валюта першою: [«$48 200», «₴120 000»] */
const moneyByCurrency = (map) => {
    const parts = Object.entries(map)
        .filter(([, v]) => v > 0)
        .sort(([a], [b]) => (a === DEFAULT_CURRENCY ? -1 : b === DEFAULT_CURRENCY ? 1 : 0))
        .map(([c, v]) => formatMoney(Math.round(v), c));
    return parts.length ? parts : [formatMoney(0)];
};

/* ---------------------------------------------------------------------
 *  ПРИЧИНИ «ПОТРЕБУЄ УВАГИ»
 * ------------------------------------------------------------------- */

function buildAttention({ objects, activity, alerts, tasks, empName, norms, leads, canSee = () => true }) {
    const byObj = new Map();
    const add = (o, r) => {
        if (!byObj.has(o.custom_id)) byObj.set(o.custom_id, { o, reasons: [] });
        byObj.get(o.custom_id).reasons.push(r);
    };
    const objById = new Map(objects.map(o => [o.custom_id, o]));

    objects.forEach(o => {
        const act = activity[o.custom_id];
        const stage = normalizeGroupKey(o.workflow_stage);
        const cur = o.currency || DEFAULT_CURRENCY;
        const idle = act?.idleDays ?? null;

        // Гроші — лише тим, хто бачить фінанси цього об'єкта
        const money = canSee(o);
        if (money && o.status === 'completed' && isReceivable(o)) {
            add(o, {
                sev: 'crit', age: idle,
                why: `Об'єкт завершено, борг ${formatMoney(debtOf(o), cur)}`,
                detail: paidOf(o) > 0 ? `сплачено ${formatMoney(paidOf(o), cur)} з ${formatMoney(costOf(o), cur)}` : 'оплат ще не було',
                action: 'open',
            });
        }
        if (!isObjectActive(o.status) || o.status === 'on_hold') return;

        // Монтаж іде, а грошей не було
        if (money && costOf(o) > 0 && paidOf(o) === 0 && stageIndex(stage) >= stageIndex('installation')) {
            add(o, { sev: 'warn', age: act?.stageDays ?? null, why: 'Монтаж іде, а оплат не було', detail: `вартість ${formatMoney(costOf(o), cur)}`, action: 'open' });
        }
        if (money && costOf(o) <= 0 && stageIndex(stage) >= stageIndex('equipment')) {
            add(o, { sev: 'warn', age: null, why: 'Немає вартості угоди', detail: `етап «${getStageGroupLabel(stage)}»`, action: 'open' });
        }

        // Довше за норму етапу
        const norm = norms[stage];
        const stageDays = act?.stageDays ?? null;
        if (norm && stageDays != null && stageDays > norm) {
            add(o, {
                sev: stageDays > norm * 2 ? 'crit' : 'warn', age: stageDays,
                why: `Етап «${getStageGroupLabel(stage)}» довше норми`,
                detail: `${stageDays} дн при нормі ${norm}`,
                action: PRE_DEAL.includes(stage) && o.client?.phone ? 'call' : 'open',
            });
        }

        // Без руху
        if (idle != null && idle > STALE_DAYS) {
            const label = getStageGroupLabel(stage);
            add(o, {
                sev: idle > LONG_DAYS ? 'crit' : 'warn', age: idle,
                why: stage === 'proposal' ? 'КП без руху — чекаємо рішення клієнта' : `Без руху на етапі «${label}»`,
                detail: `остання дія ${fmtShort(act.lastActivityAt)} · на етапі ${act.stageDays} дн`,
                action: PRE_DEAL.includes(stage) && o.client?.phone ? 'call' : 'open',
            });
        }
    });

    // Електрозахист: немає специфікації або бракує позицій
    alerts.forEach(a => {
        const o = objById.get(a.installation_custom_id);
        if (!o || !isObjectActive(o.status)) return;
        const late = a.due_date ? daysSince(a.due_date) : null;
        if (a.kind === 'protection_supply') {
            const d = a.details || {};
            add(o, {
                sev: late && late > 0 ? 'warn' : 'info', age: late,
                why: 'Бракує електрозахисту',
                detail: d.positions ? `немає ${d.missing ?? '?'} з ${d.positions} позицій` : 'не всі позиції є',
                action: 'supply',
            });
        } else if (a.kind === 'protection_spec') {
            add(o, { sev: 'info', age: late, why: 'Немає специфікації електрозахисту', detail: a.due_date ? `потрібна до ${fmtShort(a.due_date)}` : '', action: 'supply' });
        }
    });

    const rows = [...byObj.values()].map(({ o, reasons }) => {
        const sorted = reasons.slice().sort((a, b) => RANK[b.sev] - RANK[a.sev] || (b.age ?? 0) - (a.age ?? 0));
        return { key: `o-${o.custom_id}`, o, top: sorted[0], more: sorted.slice(1), ownerId: o.responsible_emp_id };
    });

    // Прострочені задачі
    const today = todayISO();
    tasks.filter(t => t.due_date && t.due_date < today).forEach(t => {
        const o = t.installation_id ? objById.get(t.installation_id) : null;
        rows.push({
            key: `t-${t.custom_id}`, o, task: t,
            top: { sev: 'warn', age: daysSince(t.due_date), why: 'Прострочена задача', detail: t.task_text, action: 'tasks' },
            more: [], ownerId: t.assigned_to, ownerName: empName(t.assigned_to),
        });
    });

    // Ліди: сьогодні треба зв'язатись або контакт прострочено
    leads.filter(l => l.next_action_at && l.next_action_at <= today).forEach(l => {
        const late = daysSince(l.next_action_at);
        const free = l.responsible_emp_id == null;
        rows.push({
            key: `l-${l.id}`, o: null, lead: l,
            top: {
                sev: late > 2 || (free && late) ? 'crit' : 'warn', age: late || null,
                why: free ? (l.source === 'site' ? 'Заявка з сайту — ще ніхто не взяв' : 'Лід ще ніхто не взяв')
                    : late ? 'Прострочено контакт з лідом' : `Зв'язатись з лідом сьогодні`,
                detail: [l.request, l.capacity_kw ? `${Number(l.capacity_kw)} кВт` : null].filter(Boolean).join(' · ') || 'новий лід',
                action: l.phone ? 'callLead' : 'leads',
            },
            more: [], ownerId: l.responsible_emp_id, ownerName: empName(l.responsible_emp_id),
        });
    });

    return rows.sort((a, b) => RANK[b.top.sev] - RANK[a.top.sev] || (b.top.age ?? 0) - (a.top.age ?? 0));
}

/* =====================================================================
 *  СТОРІНКА
 * ===================================================================== */

export default function TodayPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const auth = useAuth();
    const { employee, financeAll } = auth;
    const myId = employee?.custom_id ?? null;
    // Гроші: усі — лише тим, хто бачить фінанси компанії; іншим — їхні об'єкти
    const canSee = useCallback((o) => canSeeMoney(auth, o), [auth]);

    const [loading, setLoading] = useState(true);
    const [objects, setObjects] = useState([]);
    const [activity, setActivity] = useState({});
    const [alerts, setAlerts] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [receivables, setReceivables] = useState([]);
    const [norms, setNorms] = useState({});              // норма днів на етап
    const [leads, setLeads] = useState([]);              // ліди, з якими сьогодні треба зв'язатись
    const [scope, setScope] = useState(null);     // 'mine' | 'team'; null — вибрати самому
    const [showAll, setShowAll] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [objs, act, , al, tk, em] = await Promise.all([
                fetchAll(() => supabase.from('installations')
                    .select('custom_id, name, status, workflow_stage, capacity_kw, total_cost, paid_amount, currency, responsible_emp_id, created_at, client:clients(name, company_name, phone, populated_place)')
                    .or('is_subcontract.eq.false,is_subcontract.is.null')
                    .in('status', ['planning', 'in_progress', 'on_hold', 'completed'])
                    .order('custom_id')),
                loadActivity(),
                loadStageNorms().then(setNorms),
                // Через перегляд: вимкнені в «Забезпечення → Автоматика» нагадування сюди не потрапляють
                supabase.from('v_supply_alerts').select('installation_custom_id, kind, due_date, details'),
                supabase.from('microtasks').select('custom_id, due_date, task_text, installation_id, assigned_to').eq('status', 'нове'),
                supabase.from('employees').select('custom_id, name'),
            ]);
            const rec = await hasPaymentSchedule()
                ? await fetchAll(() => supabase.from('v_receivables')
                    .select('installation_custom_id, currency, debt')
                    .order('installation_custom_id'))
                : [];
            setReceivables(rec);
            if (await hasLeads()) {
                const { data: due } = await supabase.from('leads')
                    .select('id, contact_name, phone, place, request, capacity_kw, next_action_at, responsible_emp_id, source')
                    .in('status', ['new', 'contacted', 'measure'])
                    .lte('next_action_at', todayISO());
                setLeads(due || []);
            }
            setObjects(objs);
            setActivity(act);
            setAlerts(al.data || []);
            setTasks(tk.data || []);
            setEmployees(em.data || []);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const empById = useMemo(() => new Map(employees.map(e => [e.custom_id, e.name])), [employees]);
    const empName = useCallback((id) => (id != null ? empById.get(Number(id)) || null : null), [empById]);

    const active = useMemo(() => objects.filter(o => isObjectActive(o.status)), [objects]);

    /* --- Показники --- */
    const kpi = useMemo(() => {
        const monthAgo = Date.now() - 30 * 86400000;
        const stale = active.filter(o => o.status !== 'on_hold' && (activity[o.custom_id]?.idleDays ?? 0) > STALE_DAYS);
        const receivable = objects.filter(o => canSee(o) && isReceivable(o));
        const debtSum = {};
        receivable.forEach(o => { const c = o.currency || DEFAULT_CURRENCY; debtSum[c] = (debtSum[c] || 0) + debtOf(o); });
        const today = todayISO();
        const overdue = tasks.filter(t => t.due_date && t.due_date < today).length;
        return {
            active: active.length,
            fresh: active.filter(o => new Date(o.created_at).getTime() > monthAgo).length,
            stale: stale.length,
            stalePct: active.length ? Math.round((stale.length / active.length) * 100) : 0,
            debt: moneyByCurrency(debtSum),
            debtNeverPaid: receivable.filter(o => o.status === 'completed' && paidOf(o) === 0).length,
            debtCount: receivable.length,
            tasks: tasks.length,
            overdue,
        };
    }, [active, objects, activity, tasks, canSee]);

    /* --- Потребує уваги --- */
    const attention = useMemo(
        () => buildAttention({ objects, activity, alerts, tasks, empName, norms, leads, canSee }),
        [objects, activity, alerts, tasks, empName, norms, leads, canSee]
    );
    // «Мої» — ще й вільні ліди: поки ніхто не взяв, вони спільні для всіх, хто веде ліди
    const takesLeads = !!auth.can?.('leads', 'edit');
    const mine = useMemo(() => attention.filter(r => myId != null
        && (Number(r.ownerId) === myId || (takesLeads && r.lead && r.ownerId == null))), [attention, myId, takesLeads]);
    const effScope = scope || (mine.length ? 'mine' : 'team');
    const list = effScope === 'mine' ? mine : attention;

    /* --- Воронка зараз --- */
    const funnel = useMemo(() => STAGE_GROUPS.map(g => {
        const items = active.filter(o => normalizeGroupKey(o.workflow_stage) === g.key && o.status !== 'on_hold');
        return { g, count: items.length, med: median(items.map(o => activity[o.custom_id]?.stageDays ?? null)), norm: norms[g.key] || null };
    }), [active, activity, norms]);
    const funnelMax = Math.max(1, ...funnel.map(f => f.count));

    const dateLine = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

    /* --- Дія рядка --- */
    const renderAction = (r) => {
        const { action } = r.top;
        if (action === 'callLead') {
            return (
                <a href={`tel:${r.lead.phone}`} onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                    <FaPhone size={10} /> Подзвонити
                </a>
            );
        }
        if (action === 'leads') {
            return <Btn size="sm" icon={FaArrowRight} onClick={(e) => { e.stopPropagation(); navigate('/leads?v=due'); }}>Ліди</Btn>;
        }
        if (action === 'call' && r.o?.client?.phone) {
            return (
                <a href={`tel:${r.o.client.phone}`} onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-slate-300 bg-white text-[11.5px] font-bold text-slate-700 hover:bg-slate-50 whitespace-nowrap">
                    <FaPhone size={10} /> Подзвонити
                </a>
            );
        }
        if (action === 'supply') {
            return <Btn size="sm" icon={FaBoxes} onClick={(e) => { e.stopPropagation(); navigate(`/provisioning?obj=${r.o.custom_id}`); }}>Забезпечення</Btn>;
        }
        if (action === 'tasks') {
            return <Btn size="sm" icon={FaTasks} onClick={(e) => { e.stopPropagation(); navigate('/tasks?tab=team'); }}>Задачі</Btn>;
        }
        return <Btn size="sm" icon={FaArrowRight} onClick={(e) => { e.stopPropagation(); navigate(`/project/${r.o.custom_id}`); }}>Відкрити</Btn>;
    };

    const kpiCard = ({ label, value, sub, tone, to, hint }) => (
        // div, а не button: усередині може бути кнопка підказки (i)
        <div
            key={label}
            role={to ? 'link' : undefined}
            tabIndex={to ? 0 : undefined}
            onClick={() => to && navigate(to)}
            onKeyDown={(e) => { if (to && e.key === 'Enter') navigate(to); }}
            className={`text-left ${T.card} p-4 transition-shadow ${to ? 'hover:shadow-md cursor-pointer' : 'cursor-default'}
                ${tone === 'danger' ? 'border-rose-200 bg-rose-50/40' : ''}`}
        >
            <div className={`text-[12.5px] font-semibold flex items-center gap-1 ${tone === 'danger' ? 'text-rose-700' : 'text-slate-500'}`}>
                {label}{hint && <Tip text={hint} width={300} />}
            </div>
            <div className={`mt-1 text-[21px] sm:text-[26px] leading-none font-bold tabular-nums whitespace-nowrap ${tone === 'danger' ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
            {sub && <div className="mt-1.5 text-[12.5px] text-slate-500 line-clamp-2">{sub}</div>}
        </div>
    );

    return (
        <Layout>
            <div className="max-w-[1500px] mx-auto p-3 sm:p-6 space-y-4 text-slate-800">

                {/* Заголовок */}
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Сьогодні</h1>
                        <p className="text-[13.5px] text-slate-500 mt-0.5 first-letter:uppercase">
                            {dateLine}{!loading && ` · ${attention.length} ${plural(attention.length, 'справа потребує', 'справи потребують', 'справ потребують')} уваги`}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Btn icon={FaSyncAlt} onClick={load} disabled={loading}>Оновити</Btn>
                        <Btn variant="accent" icon={FaColumns} onClick={() => navigate('/installations')}>Воронка</Btn>
                    </div>
                </div>

                {/* Показники */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${T.card} h-[104px] animate-pulse`} />) : <>
                        {kpiCard({ label: "Активні об'єкти", value: kpi.active, sub: kpi.fresh ? `+${kpi.fresh} нових за 30 днів` : 'нових за 30 днів немає', to: '/installations' })}
                        {kpiCard({ label: `Без руху понад ${STALE_DAYS} днів`, value: kpi.stale, sub: `${kpi.stalePct}% активних`, tone: kpi.stale ? 'danger' : undefined, to: '/installations?view=table&v=stale' })}
                        {kpiCard({
                            label: financeAll ? 'Дебіторка' : 'Дебіторка по моїх угодах',
                            value: kpi.debt[0],
                            sub: [
                                ...kpi.debt.slice(1).map(s => `+ ${s}`),
                                `${kpi.debtCount} ${plural(kpi.debtCount, "об'єкт", "об'єкти", "об'єктів")}`,
                            ].join(' · '),
                            hint: kpi.debtNeverPaid ? `Рахується з внесених платежів. У ${kpi.debtNeverPaid} завершених об'єктів платежів у програмі немає взагалі — якщо гроші отримані, внесіть платіж у картці об'єкта.` : null,
                            to: receivables.length ? '/payments' : '/installations?view=table&v=debt',
                        })}
                        {kpiCard({ label: 'Відкриті задачі', value: kpi.tasks, sub: kpi.overdue ? `${kpi.overdue} прострочено` : 'прострочених немає', to: '/tasks?tab=team' })}
                    </>}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">

                    {/* Потребує уваги */}
                    <div className={T.card}>
                        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-[15px] font-bold text-slate-900 whitespace-nowrap">Потребує уваги</h2>
                            <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                {[{ k: 'mine', l: `Мої · ${mine.length}` }, { k: 'team', l: `Команда · ${attention.length}` }].map(o => (
                                    <button key={o.k} type="button" onClick={() => { setScope(o.k); setShowAll(false); }}
                                        className={`px-3 h-8 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition-colors ${effScope === o.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                        {o.l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {loading ? <Skeleton rows={6} /> : list.length === 0 ? (
                            <EmptyState title="Нічого не горить" hint={effScope === 'mine' ? 'По ваших об\'єктах усе рухається. Гляньте вкладку «Команда».' : 'Усі об\'єкти рухаються.'} />
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {(showAll ? list : list.slice(0, LIST_LIMIT)).map(r => {
                                    const owner = r.ownerName || empName(r.ownerId);
                                    const tone = r.top.sev === 'crit' ? 'danger' : r.top.sev === 'warn' ? 'warn' : 'neutral';
                                    const clickable = !!r.o || !!r.lead;
                                    return (
                                        <li key={r.key}
                                            onClick={() => (r.o ? navigate(`/project/${r.o.custom_id}`) : r.lead ? navigate(`/leads?lead=${r.lead.id}`) : null)}
                                            className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${clickable ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                                            <div className="flex items-start gap-3 min-w-0 sm:w-[30%] flex-shrink-0">
                                                <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${DOT[r.top.sev]}`} />
                                                <div className="min-w-0">
                                                    {r.o ? <>
                                                        <div className="text-[13.5px] font-semibold text-slate-900 sm:truncate">{objTitle(r.o)}</div>
                                                        <div className="text-[12px] text-slate-500 sm:truncate">
                                                            СЕС-{r.o.custom_id}{kw(r.o.capacity_kw) ? ` · ${kw(r.o.capacity_kw)}` : ''}{r.o.client?.populated_place ? ` · ${r.o.client.populated_place}` : ''}
                                                        </div>
                                                    </> : r.lead ? <>
                                                        <div className="text-[13.5px] font-semibold text-slate-900 sm:truncate">{r.lead.contact_name}</div>
                                                        <div className="text-[12px] text-slate-500 sm:truncate">Лід{r.lead.phone ? ` · ${r.lead.phone}` : ''}{r.lead.place ? ` · ${r.lead.place}` : ''}</div>
                                                    </> : (
                                                        <div className="text-[13.5px] font-semibold text-slate-900">Задача #{r.task?.custom_id}</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="min-w-0 flex-1 pl-5 sm:pl-0">
                                                <div className="text-[13.5px] font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                                                    {r.top.why}
                                                    {r.more.length > 0 && (
                                                        <Tip text={r.more.map(m => m.why).join(' · ')}>
                                                            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5">+{r.more.length}</span>
                                                        </Tip>
                                                    )}
                                                </div>
                                                {r.top.detail && <div className="text-[12px] text-slate-500 sm:truncate">{r.top.detail}</div>}
                                            </div>
                                            <div className="flex items-center gap-2 pl-5 sm:pl-0 flex-shrink-0">
                                                {r.top.age != null && <Chip tone={tone}>{r.top.age} дн</Chip>}
                                                {owner && <Person name={owner} />}
                                                {renderAction(r)}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {!loading && list.length > LIST_LIMIT && (
                            <div className="p-3 border-t border-slate-100 text-center">
                                <Btn variant="soft" onClick={() => setShowAll(v => !v)}>
                                    {showAll ? 'Згорнути' : `Показати всі ${list.length}`}
                                </Btn>
                            </div>
                        )}
                    </div>

                    <div className="space-y-4">
                        {/* Етапи, де я відповідальний */}
                        <MyStagesCard />

                        {/* Звіти бригад з додатка «Монтаж» */}
                        <BrigadeReportsCard />

                        {/* Графік сьогодні й на завтра (з Календаря) */}
                        <ScheduleCard />

                        {/* Воронка зараз */}
                        <div className={T.card}>
                            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                                <h2 className="text-[15px] font-bold text-slate-900">Воронка зараз</h2>
                                <Tip text="Скільки активних об'єктів на кожному етапі і медіана днів на етапі: половина стоїть менше, половина — більше. Червоним — більше за норму етапу.">
                                    <span className="text-[12px] text-slate-400">об'єкти · днів / норма</span>
                                </Tip>
                            </div>
                            <div className="p-4 space-y-2.5">
                                {funnel.map(f => {
                                    const tone = stageTone(f.med, f.norm);
                                    return (
                                        <button key={f.g.key} type="button"
                                            onClick={() => navigate('/installations')}
                                            className="w-full grid grid-cols-[96px_1fr_32px_72px] items-center gap-2 text-left group">
                                            <span className="text-[13px] text-slate-600 group-hover:text-slate-900 truncate">{f.g.label}</span>
                                            <span className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                <span className="block h-full rounded-full bg-indigo-400" style={{ width: `${(f.count / funnelMax) * 100}%` }} />
                                            </span>
                                            <span className="text-[13px] font-bold text-slate-900 tabular-nums text-right">{f.count}</span>
                                            <span className={`text-[12px] tabular-nums text-right ${tone === 'danger' ? 'text-rose-600 font-semibold' : tone === 'warn' ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>
                                                {f.med != null ? `${f.med} дн` : '—'}{f.norm ? <span className="text-slate-400 font-normal"> / {f.norm}</span> : null}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
