// =====================================================================
//  K-CORE · «Сьогодні» — робочий стіл офісу
//
//  Відповідає на одне питання: що горить і що мені з цим зробити.
//   • Зверху короткі числа: активні об'єкти, дебіторка, задачі, без руху.
//   • «Графік» на всю ширину: хто де працює сьогодні чи завтра, звіти.
//   • «Потребує уваги» — кожен рядок має причину, вік і одну дію.
//     «Мої» — де я відповідальний, «Команда» — усі; мої виділені.
//   • Що саме показувати, кожен вибирає сам («Що показувати»): які
//     нагадування про гроші, поріг «без руху», задачі, ліди. Окремий
//     рядок можна сховати на тиждень, місяць або назавжди. Вибір
//     зберігається в профілі (employees.ui_prefs) — однаково на всіх
//     пристроях.
//  Норми етапів прибрано (02.11.2026): «Сьогодні» не рахує «довше норми».
//  «Без руху» — з кнопкою «Робота йде» (05.11): позначили — об'єкт активний,
//  зникає зі списку; «Вартість не вноситься» — «Немає вартості» не нагадує.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaPhone, FaArrowRight, FaBoxes, FaTasks, FaSyncAlt, FaSlidersH, FaEyeSlash, FaEye, FaUndo, FaCheck,
} from 'react-icons/fa';

import Layout from './Layout';
import MyStagesCard from './pages/MyStagesCard';
import TodaySchedule from './pages/TodaySchedule';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { T, Btn, IconBtn, Chip, Tip, Skeleton, EmptyState, Person, useToast, humanError } from './ui';
import { normalizeGroupKey, getStageGroupLabel } from './domain/stages';
import { isObjectActive, formatMoney, DEFAULT_CURRENCY, canSeeMoney } from './domain/objects';
import { stageIndex, costOf, paidOf, debtOf, isReceivable, loadActivity, kw, daysSince, confirmActivity } from './domain/pipeline';
import { fetchAll } from './utils/fetchAll';
import { hasPaymentSchedule, hasLeads } from './utils/features';
import { useUiPrefs } from './utils/prefs';

const PRE_DEAL = ['tech_review', 'project', 'proposal'];
const RANK = { crit: 3, warn: 2, info: 1 };
const DOT = { crit: 'bg-rose-500', warn: 'bg-amber-500', info: 'bg-sky-500' };
const LIST_LIMIT = 12;

/* Що показувати — стандартно все; поріг «без руху» — місяць */
const TODAY_DEFAULTS = {
    show: { moneyDone: true, moneyNoPay: true, moneyNoCost: true, stale: true, tasks: true, leads: true, supply: true },
    staleDays: 30,
    hidden: {},        // ключ рядка → 'YYYY-MM-DD' (до цього дня включно) або 'always'
};
const STALE_OPTIONS = [14, 30, 60];
const MONEY_KINDS = [
    { key: 'moneyDone', label: 'Завершено, не доплачено' },
    { key: 'moneyNoPay', label: 'Монтаж іде, а оплат не було' },
    { key: 'moneyNoCost', label: 'Немає вартості угоди' },
];
const OTHER_KINDS = [
    { key: 'tasks', label: 'Прострочені задачі' },
    { key: 'leads', label: 'Ліди на сьогодні' },
    { key: 'supply', label: 'Забезпечення (електрозахист)' },
];

const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const plusDays = (n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
// Дата без року, якщо цього року; інакше з роком — щоб «03.11» торішнє не плутали з завтрашнім
const fmtShort = (d) => {
    if (!d) return '';
    const x = new Date(d);
    return x.toLocaleDateString('uk-UA', x.getFullYear() === new Date().getFullYear()
        ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit', year: '2-digit' });
};
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

/** Рядок сховано вручну і строк ще не минув */
const isHidden = (hidden, key) => {
    const v = hidden?.[key];
    return v === 'always' || (!!v && v >= todayISO());
};

/* ---------------------------------------------------------------------
 *  ПРИЧИНИ «ПОТРЕБУЄ УВАГИ»
 *  Кожна причина має вид (kind) — за ним людина вмикає й вимикає її
 *  у «Що показувати».
 * ------------------------------------------------------------------- */

function buildAttention({ objects, activity, alerts, tasks, empName, leads, show, staleDays, canSee = () => true }) {
    const byObj = new Map();
    const add = (o, r) => {
        if (show[r.kind] === false) return;
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
                kind: 'moneyDone', sev: 'crit', age: idle,
                why: `Об'єкт завершено, борг ${formatMoney(debtOf(o), cur)}`,
                detail: paidOf(o) > 0 ? `сплачено ${formatMoney(paidOf(o), cur)} з ${formatMoney(costOf(o), cur)}` : 'оплат ще не було',
                action: 'open',
            });
        }
        if (!isObjectActive(o.status) || o.status === 'on_hold') return;

        if (money && costOf(o) > 0 && paidOf(o) === 0 && stageIndex(stage) >= stageIndex('installation')) {
            add(o, { kind: 'moneyNoPay', sev: 'warn', age: act?.stageDays ?? null, why: 'Монтаж іде, а оплат не було', detail: `вартість ${formatMoney(costOf(o), cur)}`, action: 'open' });
        }
        // «Вартість не вноситься» (закрита угода, підряд) — не нагадуємо
        if (money && !o.no_cost && costOf(o) <= 0 && stageIndex(stage) >= stageIndex('equipment')) {
            add(o, { kind: 'moneyNoCost', sev: 'warn', age: null, why: 'Немає вартості угоди', detail: `етап «${getStageGroupLabel(stage)}»`, action: 'open' });
        }

        // Без руху довше за вибраний поріг
        if (idle != null && idle > staleDays) {
            add(o, {
                kind: 'stale', sev: idle > staleDays * 2 ? 'crit' : 'warn', age: idle,
                why: stage === 'proposal' ? 'КП без руху — чекаємо рішення клієнта' : `Без руху на етапі «${getStageGroupLabel(stage)}»`,
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
                kind: 'supply', sev: late && late > 0 ? 'warn' : 'info', age: late,
                why: 'Бракує електрозахисту',
                detail: d.positions ? `немає ${d.missing ?? '?'} з ${d.positions} позицій` : 'не всі позиції є',
                action: 'supply',
            });
        } else if (a.kind === 'protection_spec') {
            add(o, { kind: 'supply', sev: 'info', age: late, why: 'Немає специфікації електрозахисту', detail: a.due_date ? `потрібна до ${fmtShort(a.due_date)}` : '', action: 'supply' });
        }
    });

    const rows = [...byObj.values()].map(({ o, reasons }) => {
        const sorted = reasons.slice().sort((a, b) => RANK[b.sev] - RANK[a.sev] || (b.age ?? 0) - (a.age ?? 0));
        return { key: `o-${o.custom_id}`, o, top: sorted[0], more: sorted.slice(1), ownerId: o.responsible_emp_id };
    });

    const today = todayISO();
    if (show.tasks !== false) {
        tasks.filter(t => t.due_date && t.due_date < today).forEach(t => {
            const o = t.installation_id ? objById.get(t.installation_id) : null;
            rows.push({
                key: `t-${t.custom_id}`, o, task: t,
                top: { kind: 'tasks', sev: 'warn', age: daysSince(t.due_date), why: 'Прострочена задача', detail: t.task_text, action: 'tasks' },
                more: [], ownerId: t.assigned_to, ownerName: empName(t.assigned_to),
            });
        });
    }

    // Ліди: сьогодні треба зв'язатись або контакт прострочено
    if (show.leads !== false) {
        leads.filter(l => l.next_action_at && l.next_action_at <= today).forEach(l => {
            const late = daysSince(l.next_action_at);
            const free = l.responsible_emp_id == null;
            rows.push({
                key: `l-${l.id}`, o: null, lead: l,
                top: {
                    kind: 'leads', sev: late > 2 || (free && late) ? 'crit' : 'warn', age: late || null,
                    why: free ? (l.source === 'site' ? 'Заявка з сайту — ще ніхто не взяв' : 'Лід ще ніхто не взяв')
                        : late ? 'Прострочено контакт з лідом' : `Зв'язатись з лідом сьогодні`,
                    detail: [l.request, l.capacity_kw ? `${Number(l.capacity_kw)} кВт` : null].filter(Boolean).join(' · ') || 'новий лід',
                    action: l.phone ? 'callLead' : 'leads',
                },
                more: [], ownerId: l.responsible_emp_id, ownerName: empName(l.responsible_emp_id),
            });
        });
    }

    return rows.sort((a, b) => RANK[b.top.sev] - RANK[a.top.sev] || (b.top.age ?? 0) - (a.top.age ?? 0));
}

/* ---------------------------------------------------------------------
 *  «Що показувати» — на місці, під заголовком
 * ------------------------------------------------------------------- */

const toggleCls = (on) => `h-9 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors
    ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`;

function PrefsPanel({ prefs, onChange, seeMoney, hiddenCount, onClose }) {
    const setShow = (key) => onChange({ ...prefs, show: { ...prefs.show, [key]: !prefs.show[key] } });
    const staleValue = prefs.show.stale === false ? 'off' : prefs.staleDays;
    const setStale = (v) => onChange(v === 'off'
        ? { ...prefs, show: { ...prefs.show, stale: false } }
        : { ...prefs, staleDays: v, show: { ...prefs.show, stale: true } });

    return (
        <div className={`${T.card} p-4 space-y-3.5`}>
            <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 mr-auto">Що показувати в «Потребує уваги»</h2>
                <Btn size="sm" variant="ghost" onClick={onClose}>Готово</Btn>
            </div>
            {seeMoney && (
                <div className="space-y-1.5">
                    <div className="text-[12.5px] font-semibold text-slate-500">Гроші</div>
                    <div className="flex flex-wrap gap-1.5">
                        {MONEY_KINDS.map(k => (
                            <button key={k.key} type="button" aria-pressed={!!prefs.show[k.key]} onClick={() => setShow(k.key)} className={toggleCls(!!prefs.show[k.key])}>
                                {k.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="space-y-1.5">
                <div className="text-[12.5px] font-semibold text-slate-500">Без руху довше за</div>
                <div className="flex flex-wrap gap-1.5">
                    {STALE_OPTIONS.map(d => (
                        <button key={d} type="button" aria-pressed={staleValue === d} onClick={() => setStale(d)} className={toggleCls(staleValue === d)}>
                            {d} днів
                        </button>
                    ))}
                    <button type="button" aria-pressed={staleValue === 'off'} onClick={() => setStale('off')} className={toggleCls(staleValue === 'off')}>
                        Не показувати
                    </button>
                </div>
            </div>
            <div className="space-y-1.5">
                <div className="text-[12.5px] font-semibold text-slate-500">Інше</div>
                <div className="flex flex-wrap gap-1.5">
                    {OTHER_KINDS.map(k => (
                        <button key={k.key} type="button" aria-pressed={!!prefs.show[k.key]} onClick={() => setShow(k.key)} className={toggleCls(!!prefs.show[k.key])}>
                            {k.label}
                        </button>
                    ))}
                </div>
            </div>
            {hiddenCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-[12.5px] text-slate-500">
                    <FaEyeSlash size={11} /> Сховано вручну: {hiddenCount}
                    <Btn size="sm" variant="soft" icon={FaUndo} onClick={() => onChange({ ...prefs, hidden: {} })}>Показати всі знову</Btn>
                </div>
            )}
        </div>
    );
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
    const seeMoney = !!auth.can?.('money');

    const [prefs, savePrefs] = useUiPrefs('today', TODAY_DEFAULTS);
    const [prefsOpen, setPrefsOpen] = useState(false);

    const [loading, setLoading] = useState(true);
    const [objects, setObjects] = useState([]);
    const [activity, setActivity] = useState({});
    const [alerts, setAlerts] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [receivables, setReceivables] = useState([]);
    const [leads, setLeads] = useState([]);              // ліди, з якими сьогодні треба зв'язатись
    const [scope, setScope] = useState(null);     // 'mine' | 'team'; null — вибрати самому
    const [showAll, setShowAll] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    const [hiding, setHiding] = useState(null);   // ключ рядка, який зараз ховають

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [objs, act, al, tk, em] = await Promise.all([
                fetchAll(() => supabase.from('installations')
                    .select('custom_id, name, status, workflow_stage, capacity_kw, total_cost, paid_amount, currency, no_cost, responsible_emp_id, brigadier_emp_id, created_at, client:clients(name, company_name, phone, populated_place)')
                    .or('is_subcontract.eq.false,is_subcontract.is.null')
                    .in('status', ['planning', 'in_progress', 'on_hold', 'completed'])
                    .order('custom_id')),
                loadActivity(),
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
    const staleDays = prefs.staleDays || 30;

    /* --- Показники --- */
    const kpi = useMemo(() => {
        const monthAgo = Date.now() - 30 * 86400000;
        const stale = active.filter(o => o.status !== 'on_hold' && (activity[o.custom_id]?.idleDays ?? 0) > staleDays);
        const receivable = objects.filter(o => canSee(o) && isReceivable(o));
        const debtSum = {};
        receivable.forEach(o => { const c = o.currency || DEFAULT_CURRENCY; debtSum[c] = (debtSum[c] || 0) + debtOf(o); });
        const today = todayISO();
        return {
            active: active.length,
            fresh: active.filter(o => new Date(o.created_at).getTime() > monthAgo).length,
            stale: stale.length,
            debt: moneyByCurrency(debtSum),
            debtCount: receivable.length,
            tasks: tasks.length,
            overdue: tasks.filter(t => t.due_date && t.due_date < today).length,
        };
    }, [active, objects, activity, tasks, canSee, staleDays]);

    /* --- Потребує уваги --- */
    const attentionAll = useMemo(
        () => buildAttention({ objects, activity, alerts, tasks, empName, leads, canSee, show: prefs.show, staleDays }),
        [objects, activity, alerts, tasks, empName, leads, canSee, prefs.show, staleDays]
    );
    const hiddenRows = useMemo(() => attentionAll.filter(r => isHidden(prefs.hidden, r.key)), [attentionAll, prefs.hidden]);
    const attention = useMemo(() => attentionAll.filter(r => !isHidden(prefs.hidden, r.key)), [attentionAll, prefs.hidden]);

    /** Мій рядок: я менеджер чи бригадир об'єкта, мені доручено задачу, мій лід */
    const isMine = useCallback((r) => {
        if (myId == null) return false;
        if (r.o && (Number(r.o.responsible_emp_id) === myId || Number(r.o.brigadier_emp_id) === myId)) return true;
        return Number(r.ownerId) === myId;
    }, [myId]);

    // «Мої» — ще й вільні ліди: поки ніхто не взяв, вони спільні для всіх, хто веде ліди
    const takesLeads = !!auth.can?.('leads', 'edit');
    const mine = useMemo(() => attention.filter(r => isMine(r) || (takesLeads && r.lead && r.ownerId == null)), [attention, isMine, takesLeads]);
    const effScope = scope || (mine.length ? 'mine' : 'team');
    const list = showHidden ? hiddenRows : effScope === 'mine' ? mine : attention;

    /* --- Сховати / повернути рядок --- */
    const hideRow = (key, until) => {
        const today = todayISO();
        // Прибираємо прострочені позначки, щоб профіль не ріс без кінця
        const hidden = Object.fromEntries(Object.entries(prefs.hidden || {}).filter(([, v]) => v === 'always' || v >= today));
        hidden[key] = until;
        savePrefs({ ...prefs, hidden });
        setHiding(null);
        toast(until === 'always' ? 'Сховано назавжди — повернути можна в «Що показувати»' : `Сховано до ${fmtShort(until)}`, 'info');
    };
    const unhideRow = (key) => {
        const hidden = { ...(prefs.hidden || {}) };
        delete hidden[key];
        savePrefs({ ...prefs, hidden });
        if (hiddenRows.length <= 1) setShowHidden(false);
    };

    const dateLine = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

    /* --- «Робота йде»: об'єкт активний — прибрати з «Без руху» --- */
    const canConfirm = !!auth.can?.('objects', 'edit');
    const isStaleRow = (r) => !!r.o && (r.top.kind === 'stale' || r.more.some(m => m.kind === 'stale'));
    const workGoes = async (o) => {
        try {
            await confirmActivity(o.custom_id, auth.employee?.id);
            const now = new Date().toISOString();
            setActivity(a => ({ ...a, [o.custom_id]: { ...(a[o.custom_id] || {}), lastActivityAt: now, idleDays: 0 } }));
            toast(`${objTitle(o)}: робота йде — прибрано з «Без руху»`, 'success');
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

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

    const stat = ({ label, value, sub, tone, to, hint }) => (
        <div
            key={label}
            role={to ? 'link' : undefined}
            tabIndex={to ? 0 : undefined}
            onClick={() => to && navigate(to)}
            onKeyDown={(e) => { if (to && e.key === 'Enter') navigate(to); }}
            className={`${T.card} px-3.5 py-2.5 min-w-0 ${to ? 'hover:shadow-md cursor-pointer' : ''} ${tone === 'danger' ? 'border-rose-200 bg-rose-50/40' : ''}`}
        >
            <div className={`text-[12px] font-semibold flex items-center gap-1 ${tone === 'danger' ? 'text-rose-700' : 'text-slate-500'}`}>
                <span className="truncate">{label}</span>{hint && <Tip text={hint} width={300} />}
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
                <span className={`text-[20px] leading-tight font-bold tabular-nums ${tone === 'danger' ? 'text-rose-700' : 'text-slate-900'}`}>{value}</span>
                {sub && <span className="text-[12px] text-slate-500 min-w-0 break-words">{sub}</span>}
            </div>
        </div>
    );

    const stats = [
        stat({ label: "Активні об'єкти", value: kpi.active, sub: kpi.fresh ? `+${kpi.fresh} за 30 днів` : null, to: '/installations' }),
        seeMoney && stat({
            label: financeAll ? 'Дебіторка' : 'Дебіторка по моїх',
            value: kpi.debt[0],
            sub: [...kpi.debt.slice(1).map(s => `+ ${s}`), `${kpi.debtCount} ${plural(kpi.debtCount, "об'єкт", "об'єкти", "об'єктів")}`].join(' · '),
            to: receivables.length ? '/payments' : '/installations?view=table&v=debt',
        }),
        stat({ label: 'Відкриті задачі', value: kpi.tasks, sub: kpi.overdue ? `${kpi.overdue} прострочено` : null, tone: kpi.overdue ? 'danger' : undefined, to: '/tasks?tab=team' }),
        prefs.show.stale !== false && stat({ label: `Без руху понад ${staleDays} дн`, value: kpi.stale, to: '/installations?view=table&v=stale' }),
    ].filter(Boolean);

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
                        <Btn icon={FaSlidersH} variant={prefsOpen ? 'primary' : 'outline'} onClick={() => setPrefsOpen(v => !v)}>Що показувати</Btn>
                        <IconBtn variant="outline" icon={FaSyncAlt} label="Оновити" onClick={load} disabled={loading} />
                    </div>
                </div>

                {prefsOpen && (
                    <PrefsPanel prefs={prefs} onChange={savePrefs} seeMoney={seeMoney}
                        hiddenCount={Object.keys(prefs.hidden || {}).filter(k => isHidden(prefs.hidden, k)).length}
                        onClose={() => setPrefsOpen(false)} />
                )}

                {/* Короткі числа */}
                <div className={`grid grid-cols-2 gap-2.5 ${stats.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
                    {loading ? Array.from({ length: stats.length }).map((_, i) => <div key={i} className={`${T.card} h-[66px] animate-pulse`} />) : stats}
                </div>

                {/* Графік: хто де працює */}
                <TodaySchedule />

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">

                    {/* Потребує уваги */}
                    <div className={T.card}>
                        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                            <h2 className="text-[15px] font-bold text-slate-900 whitespace-nowrap">
                                {showHidden ? 'Сховані вручну' : 'Потребує уваги'}
                            </h2>
                            {!showHidden && (
                                <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                    {[{ k: 'mine', l: `Мої · ${mine.length}` }, { k: 'team', l: `Команда · ${attention.length}` }].map(o => (
                                        <button key={o.k} type="button" onClick={() => { setScope(o.k); setShowAll(false); }}
                                            className={`px-3 h-8 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition-colors ${effScope === o.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                            {o.l}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {loading ? <Skeleton rows={6} /> : list.length === 0 ? (
                            <EmptyState title="Нічого не горить" hint={effScope === 'mine' ? 'По ваших об\'єктах усе рухається. Гляньте вкладку «Команда».' : 'Усі об\'єкти рухаються.'} />
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {(showAll || showHidden ? list : list.slice(0, LIST_LIMIT)).map(r => {
                                    const owner = r.ownerName || empName(r.ownerId);
                                    const tone = r.top.sev === 'crit' ? 'danger' : r.top.sev === 'warn' ? 'warn' : 'neutral';
                                    const clickable = !!r.o || !!r.lead;
                                    const my = isMine(r);
                                    return (
                                        <li key={r.key} className={`${my ? 'border-l-4 border-l-indigo-500 bg-indigo-50/30' : 'border-l-4 border-l-transparent'} ${showHidden ? 'opacity-70' : ''}`}>
                                            <div
                                                onClick={() => (r.o ? navigate(`/project/${r.o.custom_id}`) : r.lead ? navigate(`/leads?lead=${r.lead.id}`) : null)}
                                                className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${clickable ? 'cursor-pointer hover:bg-slate-50/80' : ''}`}>
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
                                                        {my && <Chip tone="accent">мій</Chip>}
                                                        {r.more.length > 0 && (
                                                            <Tip text={r.more.map(m => m.why).join(' · ')}>
                                                                <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded px-1.5">+{r.more.length}</span>
                                                            </Tip>
                                                        )}
                                                    </div>
                                                    {r.top.detail && <div className="text-[12px] text-slate-500 sm:truncate">{r.top.detail}</div>}
                                                </div>
                                                <div className="flex items-center gap-1.5 pl-5 sm:pl-0 flex-shrink-0 flex-wrap" onClick={e => e.stopPropagation()}>
                                                    {r.top.age != null && <Chip tone={tone}>{r.top.age} дн</Chip>}
                                                    {owner && !my && <Person name={owner} />}
                                                    {showHidden ? (
                                                        <Btn size="sm" variant="soft" icon={FaEye} onClick={() => unhideRow(r.key)}>Показувати</Btn>
                                                    ) : <>
                                                        {canConfirm && isStaleRow(r) && (
                                                            <Btn size="sm" variant="softOk" icon={FaCheck} onClick={() => workGoes(r.o)}>Робота йде</Btn>
                                                        )}
                                                        {renderAction(r)}
                                                        <IconBtn icon={FaEyeSlash} label="Сховати з «Сьогодні»" variant={hiding === r.key ? 'soft' : 'ghost'}
                                                            onClick={() => setHiding(h => (h === r.key ? null : r.key))} />
                                                    </>}
                                                </div>
                                            </div>
                                            {hiding === r.key && (
                                                <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-1.5 sm:pl-9">
                                                    <span className="text-[12.5px] font-semibold text-slate-500 mr-1">Сховати</span>
                                                    <Btn size="sm" variant="outline" onClick={() => hideRow(r.key, plusDays(7))}>на тиждень</Btn>
                                                    <Btn size="sm" variant="outline" onClick={() => hideRow(r.key, plusDays(30))}>на місяць</Btn>
                                                    <Btn size="sm" variant="outline" onClick={() => hideRow(r.key, 'always')}>назавжди</Btn>
                                                    <Btn size="sm" variant="ghost" onClick={() => setHiding(null)}>Скасувати</Btn>
                                                </div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {!loading && (list.length > LIST_LIMIT || hiddenRows.length > 0 || showHidden) && (
                            <div className="p-3 border-t border-slate-100 flex flex-wrap items-center justify-center gap-2">
                                {!showHidden && list.length > LIST_LIMIT && (
                                    <Btn variant="soft" onClick={() => setShowAll(v => !v)}>
                                        {showAll ? 'Згорнути' : `Показати всі ${list.length}`}
                                    </Btn>
                                )}
                                {(hiddenRows.length > 0 || showHidden) && (
                                    <Btn variant="ghost" icon={showHidden ? FaUndo : FaEyeSlash} onClick={() => setShowHidden(v => !v)}>
                                        {showHidden ? 'Назад до списку' : `Сховані вручну · ${hiddenRows.length}`}
                                    </Btn>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Етапи, де я відповідальний */}
                    <MyStagesCard />
                </div>
            </div>
        </Layout>
    );
}
