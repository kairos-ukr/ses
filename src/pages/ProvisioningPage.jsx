// =====================================================================
//  K-CORE · «Забезпечення об'єктів»
//
//  Відповідає на одне питання: що ще треба об'єктам і що з цим зробити.
//   • Список об'єктів: скільки позицій забезпечено, що можна брати зі
//     складу, що в дорозі, чого бракує, заявки. Фільтри: в роботі /
//     завершені / усі, «Мої» (де я менеджер чи бригадир), стан
//     забезпечення, пошук, порядок. Вибір — в адресі (?st=&f=&mine=),
//     тож «Назад» і посилання повертають той самий список.
//   • Відкритий об'єкт — теж в адресі (?obj=): «назад» на телефоні
//     повертає до списку, оновлення сторінки його не закриває.
//   • Натиснули на об'єкт — його забезпечення (ObjectSupply): дії на
//     місці, без вікон поверх сторінки, і «все одразу».
//   • Завершені об'єкти теж тут: довидача й повернення залишків.
//   • «Зайве після зміни» — об'єкти, де специфікацію змінили, а за
//     старою версією вже видали чи зарезервували те, що тепер не потрібно.
//   • Нагадування (електрозахист) — лише якщо ввімкнено в «Автоматиці».
//   • «Обладнання» — зріз від позиції: чого купити і під які об'єкти.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
    FaSearch, FaHardHat, FaBoxOpen, FaClipboardList, FaShoppingCart, FaTruck, FaBoxes,
    FaShieldAlt, FaBell, FaClock, FaTimes, FaChevronDown, FaExternalLinkAlt, FaUserTie, FaTelegramPlane, FaCog, FaExchangeAlt,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import Layout from '../Layout';
import { useAuth } from '../AuthProvider';
import ManualSpecBuilder from './ManualSpecBuilder';
import EquipmentDemand from './EquipmentDemand';
import SupplyAutomation from './SupplyAutomation';
import ObjectSupply from './provisioning/ObjectSupply';
import { hasSupplyAlerts } from '../utils/features';
import { fetchAll } from '../utils/fetchAll';
import {
    ALERT_KIND, alertText, dueInfo, loadSupplyAlerts,
    loadAssignees, assignAlert, snoozeAlert, dismissAlert,
} from '../utils/supplyAlerts';
import { T, Btn, IconBtn, Chip, Card, Bar, EmptyState, Skeleton, useToast, useConfirm, humanError } from '../ui';
import { getStageGroupLabel } from '../domain/stages';
import { getObjectStatus } from '../domain/objects';

/* Що саме вносити вручну: звичайну комплектацію чи специфікацію захисту з нагадування */
const MANUAL_TASK = {
    complectation: { taskId: 'complectation', title: 'Комплектація матеріалів' },
    protection: { taskId: 'comp_protection', title: 'Специфікація електрозахисту' },
};

const ACTIVE = ['planning', 'in_progress', 'pending', 'on_hold'];
const SCOPES = [
    { key: 'active', label: 'В роботі', test: o => ACTIVE.includes(o.status) },
    { key: 'completed', label: 'Завершені', test: o => o.status === 'completed' },
    { key: 'all', label: 'Усі', test: () => true },
];
const STATES = [
    { key: 'any', label: 'Усі', test: () => true },
    { key: 'act', label: 'Можна брати', test: o => o.canAct > 0 },
    { key: 'missing', label: 'Бракує', test: o => o.missing > 0 },
    { key: 'waiting', label: 'В дорозі', test: o => o.waiting > 0 },
    { key: 'ready', label: 'Забезпечено', test: o => o.positions > 0 && o.covered === o.positions },
    { key: 'nospec', label: 'Без специфікації', test: o => o.positions === 0 },
    { key: 'leftover', label: 'Зайве після зміни', test: o => o.leftovers > 0 },
];
const SORTS = [
    { key: 'priority', label: 'Спершу ті, де є що робити' },
    { key: 'readiness', label: 'За забезпеченням' },
    { key: 'number', label: 'Новіші зверху' },
];

const chipBtn = (on) => `h-8 px-2.5 rounded-lg border text-[12px] font-semibold whitespace-nowrap transition-colors flex-shrink-0
    ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`;

export default function ProvisioningPage() {
    const { employee, loading: authLoading, can } = useAuth();
    // Доступи → «Забезпечення об'єктів»: резерв, видача, повернення, заявки, специфікації
    const canProv = can('provisioning', 'edit');
    const myId = employee?.custom_id ?? null;
    const toast = useToast();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const location = useLocation();
    const [params, setParams] = useSearchParams();

    const [installations, setInstallations] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    // objects — звичний зріз «що треба об'єкту»; equipment — від позиції: «чого купити і куди піде»
    const [mode, setMode] = useState('objects');
    const [reloadKey, setReloadKey] = useState(0);
    const [manualOpen, setManualOpen] = useState(false);
    const [manualTask, setManualTask] = useState(MANUAL_TASK.complectation);

    // Фільтри — в адресі
    const scope = SCOPES.some(s => s.key === params.get('st')) ? params.get('st') : 'active';
    const stateKey = STATES.some(s => s.key === params.get('f')) ? params.get('f') : 'any';
    const mineOnly = params.get('mine') === '1';
    const sort = SORTS.some(s => s.key === params.get('sort')) ? params.get('sort') : 'priority';
    const setParam = (key, value, def) => setParams(prev => {
        const p = new URLSearchParams(prev);
        if (value === def || value == null || value === false) p.delete(key); else p.set(key, value === true ? '1' : value);
        return p;
    }, { replace: true });

    // Відкритий об'єкт. Відкриття — новий крок в історії, тож «назад» повертає до списку
    const selectedId = Number(params.get('obj')) || null;
    const openObject = useCallback((id) => {
        setMode('objects');
        setParams(prev => { const p = new URLSearchParams(prev); p.set('obj', String(id)); return p; }, { state: { fromList: true } });
    }, [setParams]);
    const closeObject = () => {
        if (location.state?.fromList) navigate(-1);
        else setParam('obj', null);
    };

    /* ---------------- НАГАДУВАННЯ ---------------- */

    // Перераховуються щоразу, коли оновлюється список: після резерву чи
    // видачі нагадування може закритись саме.
    const [alertsTick, setAlertsTick] = useState(0);
    const [alerts, setAlerts] = useState([]);
    const [alertsOpen, setAlertsOpen] = useState(true);
    const [autoOpen, setAutoOpen] = useState(false);   // панель «Автоматика»
    const [alertBusy, setAlertBusy] = useState(null);
    const [assignees, setAssignees] = useState([]);
    const [snoozeDraft, setSnoozeDraft] = useState(null); // { id, days, to }
    const assigneesLoaded = useRef(false);

    useEffect(() => {
        if (!alertsTick) return undefined;
        let alive = true;
        (async () => {
            if (!(await hasSupplyAlerts())) return;
            const list = await loadSupplyAlerts();
            if (!alive) return;
            setAlerts(list);
            if (!assigneesLoaded.current && list.length && 'assigned_to' in list[0]) {
                assigneesLoaded.current = true;
                const people = await loadAssignees();
                if (alive) setAssignees(people);
            }
        })();
        return () => { alive = false; };
    }, [alertsTick]);

    const alertsByObject = useMemo(() => {
        const m = new Map();
        alerts.forEach(a => m.set(a.installation_custom_id, [...(m.get(a.installation_custom_id) || []), a]));
        return m;
    }, [alerts]);

    /* ---------------- СПИСОК ---------------- */

    const loadDashboard = useCallback(async () => {
        setAlertsTick(t => t + 1);
        try {
            const [instRes, needs, whRes, incRes, reqRes, stock, empRes, leftRes] = await Promise.all([
                supabase.from('installations')
                    .select('custom_id, name, status, workflow_stage, responsible_emp_id, brigadier_emp_id, client:clients(name, company_name, populated_place)')
                    .in('status', [...ACTIVE, 'completed', 'cancelled'])
                    .order('custom_id', { ascending: false }),
                fetchAll(() => supabase.from('v_object_material_needs')
                    .select('installation_custom_id, nomenclature_id, required_quantity, reserved_quantity, issued_quantity, outstanding_need')
                    .order('installation_custom_id').order('nomenclature_id')),
                supabase.from('warehouses').select('id, name, is_active').order('name'),
                supabase.from('v_object_incoming').select('installation_custom_id, nomenclature_id, incoming_quantity'),
                supabase.from('procurement_requests').select('installation_custom_id').in('status', ['requested', 'ordered']),
                fetchAll(() => supabase.from('v_warehouse_stock_available').select('nomenclature_id, warehouse_id, quantity_available').order('nomenclature_id').order('warehouse_id')),
                supabase.from('employees').select('custom_id, name'),
                // Зайве після зміни специфікації (до міграції представлення немає — тоді без цього)
                supabase.from('v_object_spec_leftovers').select('installation_custom_id'),
            ]);
            if (instRes.error) throw instRes.error;
            const leftCount = {};
            (leftRes.error ? [] : leftRes.data || []).forEach(r => { leftCount[r.installation_custom_id] = (leftCount[r.installation_custom_id] || 0) + 1; });

            setWarehouses(whRes.data || []);
            const activeWh = new Set((whRes.data || []).filter(w => w.is_active).map(w => w.id));
            const free = {};
            stock.forEach(s => {
                if (activeWh.size && !activeWh.has(s.warehouse_id)) return;
                free[s.nomenclature_id] = (free[s.nomenclature_id] || 0) + Math.max(0, parseFloat(s.quantity_available) || 0);
            });
            const inc = {};
            (incRes.data || []).forEach(r => { inc[`${r.installation_custom_id}:${r.nomenclature_id}`] = parseFloat(r.incoming_quantity) || 0; });
            const reqCount = {};
            (reqRes.data || []).forEach(r => { reqCount[r.installation_custom_id] = (reqCount[r.installation_custom_id] || 0) + 1; });
            const empName = new Map((empRes.data || []).map(e => [Number(e.custom_id), e.name]));

            const byObject = new Map();
            needs.forEach(n => byObject.set(n.installation_custom_id, [...(byObject.get(n.installation_custom_id) || []), n]));

            setInstallations((instRes.data || []).map(inst => {
                const list = byObject.get(inst.custom_id) || [];
                let covered = 0, canAct = 0, waiting = 0, missing = 0, sum = 0;
                list.forEach(n => {
                    const req = parseFloat(n.required_quantity) || 1;
                    const reserved = parseFloat(n.reserved_quantity) || 0;
                    const issued = parseFloat(n.issued_quantity) || 0;
                    const left = parseFloat(n.outstanding_need) || 0;
                    sum += Math.min(100, ((reserved + issued) / req) * 100);
                    if (left <= 0 && reserved <= 0) covered += 1;
                    else if (reserved > 0 || (left > 0 && (free[n.nomenclature_id] || 0) > 0)) canAct += 1;
                    else if ((inc[`${inst.custom_id}:${n.nomenclature_id}`] || 0) >= left) waiting += 1;
                    else missing += 1;
                });
                return {
                    ...inst,
                    positions: list.length, covered, canAct, waiting, missing,
                    readiness: list.length ? Math.round(sum / list.length) : null,
                    requests: reqCount[inst.custom_id] || 0,
                    leftovers: leftCount[inst.custom_id] || 0,
                    managerName: inst.responsible_emp_id != null ? empName.get(Number(inst.responsible_emp_id)) || null : null,
                    mine: myId != null && (Number(inst.responsible_emp_id) === Number(myId) || Number(inst.brigadier_emp_id) === Number(myId)),
                };
            }));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
    }, [toast, myId]);

    useEffect(() => { if (!authLoading) loadDashboard(); }, [authLoading, loadDashboard]);

    const selected = useMemo(() => installations.find(i => i.custom_id === selectedId) || null, [installations, selectedId]);

    /* ---------------- ДІЇ НАД НАГАДУВАННЯМИ ---------------- */

    const openAlertObject = (a) => {
        if (!installations.some(i => i.custom_id === a.installation_custom_id)) return navigate(`/project/${a.installation_custom_id}`);
        openObject(a.installation_custom_id);
        return null;
    };

    const startProtectionSpec = (a) => {
        if (!installations.some(i => i.custom_id === a.installation_custom_id)) return navigate(`/project/${a.installation_custom_id}`);
        openObject(a.installation_custom_id);
        setManualTask(MANUAL_TASK.protection);
        setManualOpen(true);
        return null;
    };

    /** Доручити нагадування іншій людині — бот писатиме вже їй */
    const reassign = async (a, employeeId) => {
        const id = employeeId ? Number(employeeId) : null;
        setAlertBusy(a.id);
        try {
            await assignAlert(a.id, id);
            const person = assignees.find(p => p.id === id);
            setAlerts(prev => prev.map(x => (x.id === a.id
                ? { ...x, assigned_to: id, assigned_manually: !!id, assignee_name: person?.name || null, assignee_has_telegram: !!person?.telegram_user_id }
                : x)));
            toast(id ? `Доручено: ${person?.name || 'працівник'}` : 'Відповідального визначатиме система', 'info');
            if (!id) setAlertsTick(t => t + 1);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setAlertBusy(null); }
    };

    const SNOOZE_DAYS = [{ d: 1, l: 'Завтра' }, { d: 3, l: 'Через 3 дні' }, { d: 7, l: 'Через тиждень' }];
    const openSnooze = (a) => setSnoozeDraft(s => (s?.id === a.id ? null : { id: a.id, days: 3, to: a.assigned_to ?? employee?.id ?? '' }));

    /** Сховати до вибраного дня; тоді бот нагадає саме вибраній людині */
    const saveSnooze = async (a) => {
        const d = snoozeDraft;
        setAlertBusy(a.id);
        try {
            const to = d.to ? Number(d.to) : null;
            if (String(to ?? '') !== String(a.assigned_to ?? '')) await assignAlert(a.id, to);
            await snoozeAlert(a.id, d.days);
            setAlerts(prev => prev.filter(x => x.id !== a.id));
            const who = to ? (assignees.find(p => p.id === to)?.name || 'вибраній людині') : 'відповідальному за етапом';
            const when = SNOOZE_DAYS.find(x => x.d === d.days)?.l.toLowerCase() || `через ${d.days} дн`;
            toast(`Нагадаємо ${when} — ${who}`, 'info');
            setSnoozeDraft(null);
        } catch (e) { toast(humanError(e), 'error'); }
        finally { setAlertBusy(null); }
    };

    const dismiss = async (a) => {
        const ok = await confirm({
            title: 'Нагадування не потрібне?', tone: 'danger', confirmLabel: 'Не потрібно',
            message: `${ALERT_KIND[a.kind]?.title || 'Нагадування'} · СЕС-${a.installation_custom_id} ${a.installation_name || ''}`,
            details: ['Наприклад, клієнт купує захист сам або його роблять поза системою.', 'Для цього обʼєкта таке нагадування більше не відкриється.'],
        });
        if (!ok) return;
        try {
            await dismissAlert(a.id, employee?.id);
            setAlerts(prev => prev.filter(x => x.id !== a.id));
            toast('Нагадування закрито');
        } catch (e) { toast(humanError(e), 'error'); }
    };

    /** inObject — усередині об'єкта: назву не повторюємо, дія — на місці */
    const renderAlert = (a, inObject = false) => {
        const kind = ALERT_KIND[a.kind] || { title: a.kind };
        const due = dueInfo(a.due_date);
        const busyHere = alertBusy === a.id;
        return (
            <div key={a.id} className="px-3 py-2.5 flex items-start gap-2.5 flex-wrap sm:flex-nowrap">
                <FaShieldAlt size={13} className={`flex-shrink-0 mt-0.5 ${a.is_overdue ? 'text-rose-500' : 'text-amber-500'}`} />
                <div className="min-w-0 flex-1 basis-[calc(100%-28px)] sm:basis-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[12.5px] font-bold text-slate-900">{kind.title}</span>
                        {due && <Chip tone={due.tone} icon={FaClock}>{due.label}</Chip>}
                    </div>
                    {!inObject && (
                        <div className="text-[12px] text-slate-700 mt-0.5 break-words">
                            <span className={T.mono}>СЕС-{a.installation_custom_id}</span>{' '}
                            <b className="font-semibold">{a.installation_name}</b>
                            <span className="text-slate-400"> · {a.company_name || a.client_name || 'клієнт не вказаний'}</span>
                        </div>
                    )}
                    <div className="text-[12px] text-slate-500 mt-0.5 leading-snug">{alertText(a)}</div>
                    {'assigned_to' in a && (
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <FaUserTie className="text-slate-400 flex-shrink-0" size={10} />
                            <select
                                className="h-7 max-w-[220px] px-2 bg-white border border-slate-200 rounded-md text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-400 cursor-pointer disabled:opacity-50"
                                value={a.assigned_to ?? ''} disabled={busyHere || !canProv} title="Кому доручено нагадування"
                                onChange={e => reassign(a, e.target.value)}>
                                <option value="">Автоматично — за етапом чи обʼєктом</option>
                                {a.assigned_to && !assignees.some(p => p.id === a.assigned_to) && (
                                    <option value={a.assigned_to}>{a.assignee_name || `Працівник #${a.assigned_to}`}</option>
                                )}
                                {assignees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {!a.assigned_to && <Chip tone="danger">не призначено</Chip>}
                            {a.assigned_to && a.assigned_manually && <Chip tone="neutral">вручну</Chip>}
                            {a.assigned_to && (a.assignee_has_telegram
                                ? <Chip tone="info" icon={FaTelegramPlane}>бот напише</Chip>
                                : <Chip tone="warn" icon={FaTelegramPlane}>без Telegram</Chip>)}
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-1 flex-shrink-0 w-full sm:w-auto ml-auto">
                    {a.kind === 'protection_spec' && canProv && (
                        <Btn size="sm" variant="accent" icon={FaClipboardList} onClick={() => startProtectionSpec(a)}>Скласти</Btn>
                    )}
                    {a.kind === 'protection_supply' && !inObject && (
                        <Btn size="sm" variant="outline" onClick={() => openAlertObject(a)}>Відкрити</Btn>
                    )}
                    <IconBtn variant="ghost" icon={FaExternalLinkAlt} label="Картка обʼєкта" onClick={() => navigate(`/project/${a.installation_custom_id}`)} />
                    {canProv && <IconBtn variant={snoozeDraft?.id === a.id ? 'soft' : 'ghost'} icon={FaClock} label="Нагадати пізніше" onClick={() => openSnooze(a)} />}
                    {canProv && <IconBtn variant="ghost" icon={FaTimes} label="Не потрібно" onClick={() => dismiss(a)} />}
                </div>
                {snoozeDraft?.id === a.id && (
                    <div className="basis-full sm:ml-6 mt-1 p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-semibold text-slate-500">Нагадати</span>
                        {SNOOZE_DAYS.map(x => (
                            <button key={x.d} type="button" onClick={() => setSnoozeDraft(s => ({ ...s, days: x.d }))}
                                className={`h-8 px-2.5 rounded-lg border text-[12px] font-semibold ${snoozeDraft.days === x.d ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                {x.l}
                            </button>
                        ))}
                        <span className="text-[12px] font-semibold text-slate-500 ml-1">кому</span>
                        <select className="h-8 max-w-[240px] px-2 bg-white border border-slate-200 rounded-lg text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-400"
                            value={snoozeDraft.to ?? ''} onChange={e => setSnoozeDraft(s => ({ ...s, to: e.target.value }))}>
                            <option value="">Відповідальному за етапом</option>
                            {employee?.id && <option value={employee.id}>Мені ({employee.name})</option>}
                            {assignees.filter(p => p.id !== employee?.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <span className="flex gap-1.5 ml-auto">
                            <Btn size="sm" variant="ghost" onClick={() => setSnoozeDraft(null)}>Скасувати</Btn>
                            <Btn size="sm" variant="accent" icon={FaClock} disabled={busyHere} onClick={() => saveSnooze(a)}>Відкласти</Btn>
                        </span>
                    </div>
                )}
            </div>
        );
    };

    /* ---------------- ФІЛЬТРИ ---------------- */

    const base = useMemo(() => {
        const term = search.trim().toLowerCase().replace(/^сес-?/, '');
        const sc = SCOPES.find(s => s.key === scope);
        return installations.filter(i => sc.test(i)
            && (!mineOnly || i.mine)
            && (!term || (i.name || '').toLowerCase().includes(term) || String(i.custom_id).includes(term)
                || (i.client?.name || '').toLowerCase().includes(term) || (i.client?.company_name || '').toLowerCase().includes(term)
                || (i.client?.populated_place || '').toLowerCase().includes(term)));
    }, [installations, scope, mineOnly, search]);

    const stateCounts = useMemo(() => Object.fromEntries(STATES.map(s => [s.key, base.filter(s.test).length])), [base]);
    const scopeCounts = useMemo(() => Object.fromEntries(SCOPES.map(s => [s.key, installations.filter(i => s.test(i) && (!mineOnly || i.mine)).length])), [installations, mineOnly]);

    const filtered = useMemo(() => {
        const st = STATES.find(s => s.key === stateKey);
        const list = base.filter(st.test);
        const rd = (o) => (o.readiness == null ? 101 : o.readiness);
        if (sort === 'number') return list.sort((a, b) => b.custom_id - a.custom_id);
        if (sort === 'readiness') return list.sort((a, b) => rd(a) - rd(b) || b.custom_id - a.custom_id);
        return list.sort((a, b) => (b.canAct > 0) - (a.canAct > 0) || (b.missing > 0) - (a.missing > 0) || rd(a) - rd(b) || b.custom_id - a.custom_id);
    }, [base, stateKey, sort]);

    if (authLoading) {
        return <Layout><div className="p-6 text-center text-slate-500 text-[13px]">Завантаження…</div></Layout>;
    }

    const overdueCount = alerts.filter(a => a.is_overdue).length;

    /* ---------------- РЕНДЕР ---------------- */

    const renderRow = (inst) => {
        const status = getObjectStatus(inst.status);
        const done = inst.positions > 0 && inst.covered === inst.positions;
        return (
            <li key={inst.custom_id}>
                <button type="button" onClick={() => openObject(inst.custom_id)}
                    className={`w-full text-left px-3 sm:px-4 py-3 grid gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_240px] md:items-center hover:bg-slate-50 active:bg-slate-100 transition-colors
                        ${inst.mine ? 'border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={T.mono}>СЕС-{inst.custom_id}</span>
                            <span className="text-[14px] font-bold text-slate-900 break-words">{inst.name}</span>
                            {inst.mine && <Chip tone="accent">мій</Chip>}
                            {!['planning', 'in_progress'].includes(inst.status) && <Chip tone={status.tone}>{status.label}</Chip>}
                        </div>
                        <div className="text-[12px] text-slate-500 mt-0.5 break-words">
                            {[inst.client?.company_name || inst.client?.name, inst.client?.populated_place, inst.workflow_stage && getStageGroupLabel(inst.workflow_stage), inst.managerName].filter(Boolean).join(' · ') || 'Клієнт не вказаний'}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {inst.positions === 0 && <Chip tone="neutral">без специфікації</Chip>}
                            {inst.canAct > 0 && <Chip tone="accent">{inst.canAct} можна брати</Chip>}
                            {inst.missing > 0 && <Chip tone="danger">{inst.missing} бракує</Chip>}
                            {inst.waiting > 0 && <Chip tone="info" icon={FaTruck}>{inst.waiting} в дорозі</Chip>}
                            {inst.requests > 0 && <Chip tone="warn" icon={FaShoppingCart}>{inst.requests} заявки</Chip>}
                            {inst.leftovers > 0 && <Chip tone="warn" icon={FaExchangeAlt}>зайве після зміни: {inst.leftovers}</Chip>}
                            {alertsByObject.has(inst.custom_id) && (
                                <Chip tone={alertsByObject.get(inst.custom_id).some(a => a.is_overdue) ? 'danger' : 'warn'} icon={FaShieldAlt}>захист</Chip>
                            )}
                        </div>
                    </div>
                    {inst.positions > 0 ? (
                        <div>
                            <div className="flex items-baseline justify-between text-[12px] text-slate-500">
                                <span>{done ? 'усе видано' : `готово ${inst.covered} з ${inst.positions}`}</span>
                                <b className="text-[16px] font-black tabular-nums text-slate-900">{inst.readiness}%</b>
                            </div>
                            <Bar className="mt-1" segments={[{ pct: inst.readiness, tone: inst.readiness >= 100 ? 'ok' : inst.missing > 0 ? 'danger' : 'info' }]} />
                        </div>
                    ) : <span className="hidden md:block text-[12px] text-slate-400 text-right">позицій ще немає</span>}
                </button>
            </li>
        );
    };

    return (
        <Layout>
            <div className="p-3 sm:p-5 max-w-[1200px] mx-auto flex flex-col gap-2.5">
                {selectedId && !selected && loading ? (
                    <div className={T.card}><Skeleton rows={6} /></div>
                ) : !selected ? (
                    <>
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="text-[19px] font-bold text-slate-900 flex items-center gap-2 mr-auto">
                                <FaBoxOpen className="text-indigo-600" size={16} /> Забезпечення об'єктів
                            </h1>
                            <span className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
                                {[{ key: 'objects', label: "Об'єкти", icon: FaHardHat }, { key: 'equipment', label: 'Обладнання', icon: FaBoxes }].map(m => (
                                    <button key={m.key} type="button" onClick={() => setMode(m.key)}
                                        className={`px-3 h-8 rounded-md text-[12.5px] font-bold inline-flex items-center gap-1.5 transition-colors ${mode === m.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
                                        <m.icon size={11} /> {m.label}
                                    </button>
                                ))}
                            </span>
                            <Btn size="sm" variant={autoOpen ? 'primary' : 'outline'} icon={FaCog} onClick={() => setAutoOpen(v => !v)}>Автоматика</Btn>
                        </div>

                        {/* Що система робить сама — лише якщо так налаштували вручну */}
                        {autoOpen && (
                            <Card pad="p-0" className="overflow-hidden">
                                <SupplyAutomation bare onChanged={() => setAlertsTick(t => t + 1)} />
                            </Card>
                        )}

                        {alerts.length > 0 && (
                            <Card pad="p-0" className="border-amber-200 overflow-hidden">
                                <button type="button" onClick={() => setAlertsOpen(v => !v)}
                                    className="w-full px-3 py-2 bg-amber-50 flex items-center gap-2 text-left">
                                    <FaBell className="text-amber-500 flex-shrink-0" size={12} />
                                    <span className="text-[12.5px] font-bold text-amber-900">Нагадування</span>
                                    <Chip tone="warn">{alerts.length}</Chip>
                                    {overdueCount > 0 && <Chip tone="danger">{overdueCount} прострочено</Chip>}
                                    <FaChevronDown size={11} className={`ml-auto text-amber-400 transition-transform ${alertsOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {alertsOpen && (
                                    <div className="divide-y divide-slate-100 border-t border-amber-100 sm:max-h-80 sm:overflow-y-auto">
                                        {alerts.map(a => renderAlert(a))}
                                    </div>
                                )}
                            </Card>
                        )}

                        {mode === 'equipment' ? (
                            <EquipmentDemand onOpenObject={(id) => { if (installations.some(i => i.custom_id === id)) openObject(id); }} />
                        ) : (
                            <>
                                <Card pad="p-2.5" className="space-y-2.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                            {SCOPES.map(s => (
                                                <button key={s.key} type="button" onClick={() => setParam('st', s.key, 'active')}
                                                    className={`px-3 h-8 rounded-md text-[12.5px] font-semibold whitespace-nowrap transition-colors ${scope === s.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                                    {s.label} <span className="tabular-nums text-slate-400">{scopeCounts[s.key]}</span>
                                                </button>
                                            ))}
                                        </span>
                                        <button type="button" onClick={() => setParam('mine', !mineOnly, false)} aria-pressed={mineOnly}
                                            className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold transition-colors ${mineOnly ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                            Мої
                                        </button>
                                        <div className="relative flex-1 min-w-[200px]">
                                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                            <input className={`${T.input} pl-8`} value={search} placeholder="Назва, номер, клієнт, місто…" onChange={e => setSearch(e.target.value)} />
                                        </div>
                                        <select className={`${T.select} !w-auto`} value={sort} onChange={e => setParam('sort', e.target.value, 'priority')} aria-label="Порядок">
                                            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                                        {STATES.map(f => (
                                            <button key={f.key} type="button" onClick={() => setParam('f', f.key, 'any')} className={chipBtn(stateKey === f.key)}>
                                                {f.label} <span className={`tabular-nums ${stateKey === f.key ? 'opacity-70' : 'text-slate-400'}`}>{stateCounts[f.key] || 0}</span>
                                            </button>
                                        ))}
                                    </div>
                                </Card>

                                <div className={`${T.card} overflow-hidden`}>
                                    {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
                                        <EmptyState icon={FaHardHat} title="Об'єктів не знайдено" hint="Змініть фільтр або пошуковий запит." />
                                    ) : (
                                        <ul className="divide-y divide-slate-100">{filtered.map(renderRow)}</ul>
                                    )}
                                </div>
                            </>
                        )}
                    </>
                ) : (
                    <ObjectSupply
                        key={selected.custom_id}
                        inst={selected}
                        warehouses={warehouses}
                        canProv={canProv}
                        reloadKey={reloadKey}
                        onBack={closeObject}
                        onChanged={loadDashboard}
                        onManual={(task) => { setManualTask(MANUAL_TASK[task] || MANUAL_TASK.complectation); setManualOpen(true); }}
                        alertsNode={alertsByObject.has(selected.custom_id) && (
                            <Card pad="p-0" className="border-amber-200 overflow-hidden">
                                <div className="divide-y divide-slate-100">
                                    {alertsByObject.get(selected.custom_id).map(a => renderAlert(a, true))}
                                </div>
                            </Card>
                        )}
                    />
                )}
            </div>

            {manualOpen && selected && (
                <ManualSpecBuilder
                    key={manualTask.taskId}
                    isOpen={manualOpen}
                    onClose={() => { setManualOpen(false); setManualTask(MANUAL_TASK.complectation); }}
                    onSuccess={() => { setReloadKey(k => k + 1); loadDashboard(); }}
                    installationId={selected.custom_id}
                    taskId={manualTask.taskId}
                    title={manualTask.title}
                    showToast={toast}
                />
            )}
        </Layout>
    );
}
