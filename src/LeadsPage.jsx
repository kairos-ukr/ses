// =====================================================================
//  K-CORE · Ліди — облік з першого дзвінка (етап 4, п.15)
//
//  Звернення живе тут, поки не стане об'єктом: хто, звідки дізнався,
//  що хоче, хто веде і коли наступний контакт. «Створити об'єкт» одним
//  кроком знаходить клієнта за телефоном (або створює нового) і заводить
//  об'єкт на етапі «Заміри» (функція бази convert_lead).
//
//  Заявки з сайту приходять самі (db/2026-10_site_leads.sql) без
//  відповідального: їх бачать усі, хто має «Ліди», і будь-хто може
//  «Взяти в роботу» — хто перший, того й лід. Фото й документи ліда —
//  на Google Диску (LeadFiles), при «Створити об'єкт» переходять в об'єкт.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaPlus, FaPhone, FaArrowRight, FaFunnelDollar, FaHardHat, FaExternalLinkAlt, FaUserCheck } from 'react-icons/fa';

import Layout from './Layout';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import {
    T, Btn, Chip, Field, Tip, Drawer, Picker, SearchInput, Skeleton, EmptyState, Person,
    useToast, useConfirm, humanError,
} from './ui';
import {
    LEAD_STATUSES, ACTIVE_LEAD_STATUSES, getLeadStatus, isLeadActive, isLeadFree, leadAdLabel, LEAD_SOURCES, getLeadSourceLabel, phoneKey,
} from './domain/leads';
import { getLostReasonLabel } from './domain/objects';
import { daysSince } from './domain/pipeline';
import { fetchAll } from './utils/fetchAll';
import { hasLeadTaking } from './utils/features';
import { WORKFLOW_UPLOADER_URL } from './utils/workflowUpload';
import LostReasonPicker from './LostReasonPicker';
import LeadFiles from './LeadFiles';

const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const fmt = (d) => (d ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '');
const fmtTime = (d) => (d ? new Date(d).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

const VIEWS = [
    { key: 'active', label: 'Активні', test: l => isLeadActive(l.status) },
    { key: 'free', label: 'Вільні', test: isLeadFree },
    { key: 'due', label: 'Зв\'язатись', test: l => isLeadActive(l.status) && l.next_action_at && l.next_action_at <= addDays(0) },
    { key: 'new', label: 'Нові', test: l => l.status === 'new' },
    { key: 'contacted', label: 'Зв\'язались', test: l => l.status === 'contacted' },
    { key: 'measure', label: 'Заміри', test: l => l.status === 'measure' },
    { key: 'converted', label: 'Стали об\'єктами', test: l => l.status === 'converted' },
    { key: 'lost', label: 'Відмови', test: l => l.status === 'lost' },
    { key: 'all', label: 'Усі', test: () => true },
];

const STATIONS = ['Мережева', 'Гібридна', 'Автономна', 'Інвертор + АКБ'];

const emptyLead = (me) => ({
    contact_name: '', phone: '', place: '', source: '', request: '', capacity_kw: '', station_type: '',
    status: 'new', first_contact_at: addDays(0), next_action_at: addDays(1),
    responsible_emp_id: me ?? '', notes: '', lost_reason: '', lost_comment: '',
});

/** Коли наступний контакт: «сьогодні», «прострочено 3 дн», «18.10» */
const nextLabel = (d) => {
    if (!d) return null;
    const today = addDays(0);
    if (d === today) return { text: 'сьогодні', tone: 'warn' };
    if (d < today) return { text: `прострочено ${daysSince(d)} дн`, tone: 'danger' };
    if (d === addDays(1)) return { text: 'завтра', tone: 'neutral' };
    return { text: fmt(d), tone: 'neutral' };
};

export default function LeadsPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const { employee, user, can, canAll } = useAuth();
    const me = employee?.custom_id ?? null;
    // Доступи → «Ліди»: «лише свої» — де людина відповідальна
    const leadsAll = canAll('leads');
    const canAddLead = can('leads', 'add');
    const canEditLead = can('leads', 'edit');
    const [params, setParams] = useSearchParams();
    const view = VIEWS.some(v => v.key === params.get('v')) ? params.get('v') : 'active';

    const [leads, setLeads] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [onlyMine, setOnlyMine] = useState(false);

    const [form, setForm] = useState(null);       // відкрита картка ліда (новий або наявний)
    const [lostOpen, setLostOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [takingId, setTakingId] = useState(null);
    const [hasTaking, setHasTaking] = useState(false);
    const canTake = canEditLead && me != null;

    useEffect(() => { hasLeadTaking().then(setHasTaking); }, []);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [rows, em, cl] = await Promise.all([
                fetchAll(() => supabase.from('leads').select('*').order('created_at', { ascending: false })),
                supabase.from('employees').select('custom_id, name').order('name'),
                fetchAll(() => supabase.from('clients').select('custom_id, name, phone').order('custom_id')),
            ]);
            setLeads(rows);
            setEmployees(em.data || []);
            setClients(cl);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const empName = useCallback((id) => employees.find(e => e.custom_id === Number(id))?.name || null, [employees]);

    const searched = useMemo(() => {
        const q = search.trim().toLowerCase();
        const qPhone = phoneKey(search) || search.replace(/\D/g, '');
        // Вільні (ще ніхто не веде) бачать усі — щоб хтось їх узяв
        return leads.filter(l => ((!onlyMine && (leadsAll || l.responsible_emp_id == null)) || l.responsible_emp_id === me) && (!q
            || [l.contact_name, l.place, l.request, l.notes].some(v => (v || '').toLowerCase().includes(q))
            || (qPhone.length >= 4 && (l.phone || '').replace(/\D/g, '').includes(qPhone))));
    }, [leads, search, onlyMine, me, leadsAll]);

    const visible = useMemo(() => {
        const v = VIEWS.find(x => x.key === view) || VIEWS[0];
        return searched.filter(v.test).sort((a, b) => {
            // Спершу ті, з ким треба зв'язатись раніше; без дати — у кінці
            const an = a.next_action_at || '9999', bn = b.next_action_at || '9999';
            if (isLeadActive(a.status) && an !== bn) return an < bn ? -1 : 1;
            return new Date(b.created_at) - new Date(a.created_at);
        });
    }, [searched, view]);

    /* --- Показники --- */
    const kpi = useMemo(() => {
        const monthAgo = Date.now() - 30 * 86400000;
        const recent = leads.filter(l => new Date(l.created_at).getTime() > monthAgo);
        const closed = recent.filter(l => l.status === 'converted' || l.status === 'lost');
        const converted = recent.filter(l => l.status === 'converted').length;
        return {
            active: leads.filter(l => isLeadActive(l.status)).length,
            free: leads.filter(isLeadFree).length,
            due: leads.filter(VIEWS.find(v => v.key === 'due').test).length,
            month: recent.length,
            converted,
            rate: closed.length ? Math.round((converted / closed.length) * 100) : null,
        };
    }, [leads]);

    /* --- Картка ліда --- */
    const openNew = () => { setForm(emptyLead(me)); setLostOpen(false); };
    const openLead = (l) => {
        setForm({
            ...emptyLead(me), ...l,
            capacity_kw: l.capacity_kw ?? '', responsible_emp_id: l.responsible_emp_id ?? '',
            next_action_at: l.next_action_at || '', source: l.source || '', station_type: l.station_type || '',
        });
        setLostOpen(l.status === 'lost');
    };
    const setF = (patch) => setForm(f => ({ ...f, ...patch }));

    // Такий телефон уже є серед клієнтів чи лідів
    const dupes = useMemo(() => {
        const key = phoneKey(form?.phone);
        if (!key) return null;
        const c = clients.find(x => phoneKey(x.phone) === key);
        const l = leads.find(x => x.id !== form.id && phoneKey(x.phone) === key);
        return (c || l) ? { client: c, lead: l } : null;
    }, [form?.phone, form?.id, clients, leads]);

    // Хто і коли взяв у роботу: призначили людину (або іншу) — з цієї миті; зняли — лід знову вільний
    const takingOf = (f, resp) => {
        if (!hasTaking) return {};
        if (resp == null) return { taken_at: null, taken_by: null };
        const before = f.id ? leads.find(x => x.id === f.id) : null;
        return (before?.responsible_emp_id ?? null) !== resp || !f.taken_at
            ? { taken_at: new Date().toISOString(), taken_by: resp } : {};
    };

    const payloadOf = (f) => ({
        ...takingOf(f, f.responsible_emp_id === '' ? null : Number(f.responsible_emp_id)),
        contact_name: f.contact_name.trim(),
        phone: (f.phone || '').trim() || null,
        place: (f.place || '').trim() || null,
        source: f.source || null,
        request: (f.request || '').trim() || null,
        capacity_kw: f.capacity_kw === '' ? null : Number(f.capacity_kw),
        station_type: f.station_type || null,
        status: f.status,
        first_contact_at: f.first_contact_at || addDays(0),
        next_action_at: f.next_action_at || null,
        responsible_emp_id: f.responsible_emp_id === '' ? null : Number(f.responsible_emp_id),
        notes: (f.notes || '').trim() || null,
        lost_reason: f.status === 'lost' ? f.lost_reason : null,
        lost_comment: f.status === 'lost' ? ((f.lost_comment || '').trim() || null) : null,
        lost_at: f.status === 'lost' ? (f.lost_at || new Date().toISOString()) : null,
    });

    const save = async (f = form) => {
        if (!f.contact_name.trim()) { toast('Вкажіть, хто звернувся', 'error'); return null; }
        if (f.status === 'lost' && !f.lost_reason) { toast('Оберіть причину відмови', 'error'); return null; }
        setSaving(true);
        try {
            const payload = payloadOf(f);
            const { data, error } = f.id
                ? await supabase.from('leads').update(payload).eq('id', f.id).select().single()
                : await supabase.from('leads').insert({ ...payload, created_by: employee?.id || null }).select().single();
            if (error) throw error;
            setLeads(prev => (f.id ? prev.map(l => (l.id === data.id ? data : l)) : [data, ...prev]));
            return data;
        } catch (e) {
            toast(humanError(e), 'error');
            return null;
        } finally {
            setSaving(false);
        }
    };

    const saveAndClose = async () => {
        const saved = await save();
        if (saved) { toast(form.id ? 'Лід збережено' : 'Лід додано'); setForm(null); }
    };

    const convert = async () => {
        const ok = await confirm({
            title: 'Створити об\'єкт?',
            message: `«${form.contact_name}» стане клієнтом, і для нього з'явиться об'єкт на етапі «Заміри».${dupes?.client ? ` Телефон уже є в клієнта «${dupes.client.name}» — об'єкт буде в нього.` : ''}`,
            confirmLabel: 'Створити',
        });
        if (!ok) return;
        // Вільний лід, з якого роблять об'єкт, бере той, хто робить
        const saved = await save(form.responsible_emp_id === '' && me != null ? { ...form, responsible_emp_id: me } : form);
        if (!saved) return;
        setSaving(true);
        const { data: instId, error } = await supabase.rpc('convert_lead', {
            p_lead_id: saved.id, p_client_id: null, p_creator_email: user?.email || null,
        });
        setSaving(false);
        if (error) { toast(humanError(error), 'error'); return; }
        // Сервер документів одразу переносить папку ліда (фото, документи) в папку об'єкта
        fetch(`${WORKFLOW_UPLOADER_URL}/documents/${instId}`).catch(() => { });
        setForm(null);
        toast(`Створено об'єкт СЕС-${instId}`, 'success', { label: 'Відкрити', onClick: () => navigate(`/project/${instId}`) });
        load();
    };

    /* --- Взяти в роботу: хто перший — того й лід --- */
    const take = async (l) => {
        if (!canTake) return;
        setTakingId(l.id);
        try {
            const patch = { responsible_emp_id: me, ...(hasTaking ? { taken_at: new Date().toISOString(), taken_by: me } : {}) };
            const { data, error } = await supabase.from('leads').update(patch)
                .eq('id', l.id).is('responsible_emp_id', null).select();
            if (error) throw error;
            let row = data?.[0];
            if (!row) {
                const { data: fresh } = await supabase.from('leads').select('*').eq('id', l.id).maybeSingle();
                row = fresh;
                toast(fresh?.responsible_emp_id ? `Цей лід уже в роботі: ${empName(fresh.responsible_emp_id) || 'інший працівник'}` : 'Лід не знайдено — оновіть сторінку', 'warning');
            } else {
                toast('Лід у вас у роботі');
            }
            if (!row) return;
            setLeads(prev => prev.map(x => (x.id === row.id ? row : x)));
            setForm(f => (f?.id === row.id
                ? { ...f, responsible_emp_id: row.responsible_emp_id ?? '', taken_at: row.taken_at, taken_by: row.taken_by }
                : f));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setTakingId(null);
        }
    };

    // Посилання зі сповіщення: /leads?lead=12 — одразу відкрити цей лід
    const leadParam = params.get('lead');
    useEffect(() => {
        if (!leadParam || loading) return;
        const l = leads.find(x => String(x.id) === leadParam);
        if (l) openLead(l);
        setParams(p => { const n = new URLSearchParams(p); n.delete('lead'); return n; }, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leadParam, loading]);

    const savedLead = form?.id ? leads.find(x => x.id === form.id) : null;

    const switchView = (key) => setParams(key === 'active' ? {} : { v: key }, { replace: true });

    return (
        <Layout>
            <div className="max-w-[1400px] mx-auto p-3 sm:p-6 space-y-4 text-slate-800">

                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight mr-auto">Ліди</h1>
                    <SearchInput value={search} onChange={setSearch} placeholder="Ім'я, телефон, місто…" className="w-full sm:w-64 order-last sm:order-none" />
                    {canAddLead && <Btn variant="accent" icon={FaPlus} onClick={openNew}>Новий лід</Btn>}
                </div>

                {/* Показники */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                        kpi.free
                            ? { label: 'Активні ліди', value: kpi.active, sub: `${kpi.free} ще ніхто не взяв`, tone: 'warn', to: 'free' }
                            : { label: 'Активні ліди', value: kpi.active, sub: 'нові, зв\'язались, заміри', to: 'active' },
                        { label: 'Зв\'язатись сьогодні', value: kpi.due, sub: 'з простроченими', tone: kpi.due ? 'warn' : null, to: 'due' },
                        { label: 'Нових за 30 днів', value: kpi.month, sub: `${kpi.converted} стали об'єктами`, to: 'all' },
                        {
                            label: 'Конверсія за 30 днів', value: kpi.rate == null ? '—' : `${kpi.rate}%`, sub: 'з закритих: об\'єкт чи відмова',
                            hint: 'Скільки лідів за останні 30 днів стали об\'єктами серед тих, по яких уже є результат (об\'єкт або відмова).',
                        },
                    ].map(k => (
                        <div key={k.label}
                            role={k.to ? 'link' : undefined} tabIndex={k.to ? 0 : undefined}
                            onClick={() => k.to && switchView(k.to)}
                            onKeyDown={e => { if (k.to && e.key === 'Enter') switchView(k.to); }}
                            className={`${T.card} p-4 ${k.to ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} ${k.tone === 'warn' ? 'border-amber-200 bg-amber-50/40' : ''}`}>
                            <div className="text-[12.5px] font-semibold text-slate-500 flex items-center gap-1">{k.label}{k.hint && <Tip text={k.hint} width={300} />}</div>
                            <div className={`mt-1 text-[26px] leading-none font-bold tabular-nums ${k.tone === 'warn' ? 'text-amber-700' : 'text-slate-900'}`}>{loading ? '…' : k.value}</div>
                            <div className="mt-1.5 text-[12.5px] text-slate-500">{k.sub}</div>
                        </div>
                    ))}
                </div>

                {/* Вигляди */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {VIEWS.map(v => {
                        const on = v.key === view;
                        const n = searched.filter(v.test).length;
                        return (
                            <button key={v.key} type="button" onClick={() => switchView(v.key)}
                                className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] font-semibold transition-colors
                                    ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                {v.label}<span className={`tabular-nums text-[11.5px] ${on ? 'text-indigo-200' : 'text-slate-400'}`}>{loading ? '' : n}</span>
                            </button>
                        );
                    })}
                    {me != null && (
                        <button type="button" onClick={() => setOnlyMine(v => !v)}
                            className={`flex-shrink-0 ml-1 h-8 px-3 rounded-full border text-[12.5px] font-semibold ${onlyMine ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                            Лише мої
                        </button>
                    )}
                </div>

                {/* Список */}
                <div className={`${T.card} overflow-hidden`}>
                    {loading ? <Skeleton rows={6} /> : visible.length === 0 ? (
                        <EmptyState icon={FaFunnelDollar} title={leads.length ? 'За цим виглядом лідів немає' : 'Лідів ще немає'}
                            hint={leads.length ? null : 'Додавайте кожне звернення: так буде видно, звідки приходять клієнти і скільки їх губиться до замірів.'}>
                            {!leads.length && canAddLead && <Btn variant="accent" icon={FaPlus} onClick={openNew}>Новий лід</Btn>}
                        </EmptyState>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {visible.map(l => {
                                const st = getLeadStatus(l.status);
                                const nx = isLeadActive(l.status) ? nextLabel(l.next_action_at) : null;
                                const owner = empName(l.responsible_emp_id);
                                const age = daysSince(l.first_contact_at);
                                return (
                                    <li key={l.id} onClick={() => openLead(l)}
                                        className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_auto] gap-x-4 gap-y-1.5 items-center cursor-pointer hover:bg-slate-50">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[14px] font-semibold text-slate-900 sm:truncate">{l.contact_name}</span>
                                                <Chip tone={st.tone}>{st.label}</Chip>
                                            </div>
                                            <div className="text-[12.5px] text-slate-500 sm:truncate">
                                                {[l.phone, l.place, getLeadSourceLabel(l.source)].filter(Boolean).join(' · ')}
                                            </div>
                                        </div>
                                        <div className="min-w-0 text-[12.5px]">
                                            <div className="text-slate-700 truncate">
                                                {[l.capacity_kw ? `${Number(l.capacity_kw)} кВт` : null, l.station_type, l.request].filter(Boolean).join(' · ') || <span className="text-slate-400">що хоче — не записано</span>}
                                            </div>
                                            <div className="text-slate-400">
                                                {l.status === 'lost' ? `Відмова: ${getLostReasonLabel(l.lost_reason)}`
                                                    : l.status === 'converted' ? `Об'єкт СЕС-${l.installation_custom_id} · ${fmt(l.converted_at)}`
                                                        : `перший контакт ${age === 0 ? 'сьогодні' : `${age} дн тому`}`}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 md:justify-end" onClick={e => e.stopPropagation()}>
                                            {nx && <Chip tone={nx.tone}>{nx.text}</Chip>}
                                            {owner && <Person name={owner} />}
                                            {isLeadFree(l) && (canTake ? (
                                                <Btn size="sm" variant="accent" icon={FaUserCheck} disabled={takingId === l.id} onClick={() => take(l)}>
                                                    {takingId === l.id ? 'Беру…' : 'Взяти в роботу'}
                                                </Btn>
                                            ) : <Chip tone="warn">ніхто не взяв</Chip>)}
                                            {l.phone && (
                                                <a href={`tel:${l.phone}`} title={`Подзвонити: ${l.phone}`} aria-label="Подзвонити"
                                                    className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-50">
                                                    <FaPhone size={12} />
                                                </a>
                                            )}
                                            {l.status === 'converted' && l.installation_custom_id ? (
                                                <Btn size="sm" icon={FaArrowRight} onClick={() => navigate(`/project/${l.installation_custom_id}`)}>Об'єкт</Btn>
                                            ) : null}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* Картка ліда */}
            <Drawer
                isOpen={!!form}
                onClose={() => setForm(null)}
                title={form?.id ? form.contact_name || 'Лід' : 'Новий лід'}
                subtitle={form?.id ? `Перший контакт ${fmt(form.first_contact_at)} · ${getLeadSourceLabel(form.source)}` : null}
                size="md"
                onSubmit={() => { if (!saving && (form?.id ? canEditLead : canAddLead)) saveAndClose(); }}
                submitHint="зберегти"
                footer={form && <>
                    {form.id && isLeadActive(form.status) && canEditLead && can('objects', 'add') && (
                        <Btn variant="ok" icon={FaHardHat} onClick={convert} disabled={saving}>Створити об'єкт</Btn>
                    )}
                    <Btn variant="outline" onClick={() => setForm(null)}>{(form.id ? canEditLead : canAddLead) ? 'Скасувати' : 'Закрити'}</Btn>
                    {(form.id ? canEditLead : canAddLead) && (
                        <Btn variant="accent" onClick={saveAndClose} disabled={saving}>{saving ? 'Збереження…' : 'Зберегти'}</Btn>
                    )}
                </>}
            >
                {form && (
                    <div className="space-y-4">
                        {form.status === 'converted' && form.installation_custom_id && (
                            <a href={`#/project/${form.installation_custom_id}`}
                                className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[13.5px] font-semibold text-emerald-800">
                                Став об'єктом СЕС-{form.installation_custom_id} <FaExternalLinkAlt size={11} />
                            </a>
                        )}

                        {isLeadFree(savedLead) && (
                            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                                <span className="text-[13.5px] font-semibold text-amber-900">Лід ще ніхто не взяв</span>
                                {canTake && (
                                    <Btn size="sm" variant="accent" icon={FaUserCheck} disabled={takingId === form.id} onClick={() => take(form)}>
                                        {takingId === form.id ? 'Беру…' : 'Взяти в роботу'}
                                    </Btn>
                                )}
                            </div>
                        )}

                        {form.source === 'site' && form.site_info && (
                            <div className="text-[12.5px] text-slate-500">
                                {[
                                    `Заявка з сайту ${fmtTime(form.site_info.received_at || form.created_at)}`,
                                    leadAdLabel(form) ? `реклама: ${leadAdLabel(form)}` : null,
                                    form.site_info.repeats ? `повторних: ${form.site_info.repeats}` : null,
                                ].filter(Boolean).join(' · ')}
                            </div>
                        )}

                        {form.status !== 'converted' && (
                            <div>
                                <span className={`${T.label} block mb-1.5`}>Стан</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {LEAD_STATUSES.filter(s => ACTIVE_LEAD_STATUSES.includes(s.key)).map(s => (
                                        <button key={s.key} type="button" onClick={() => { setF({ status: s.key }); setLostOpen(false); }}
                                            className={`px-3 h-9 rounded-lg text-[13px] font-semibold border transition-colors
                                                ${form.status === s.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}>
                                            {s.label}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => { setF({ status: 'lost' }); setLostOpen(true); }}
                                        className={`px-3 h-9 rounded-lg text-[13px] font-semibold border transition-colors
                                            ${form.status === 'lost' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'}`}>
                                        Відмова…
                                    </button>
                                </div>
                                {lostOpen && form.status === 'lost' && (
                                    <div className={`${T.inset} p-3 mt-2`}>
                                        <LostReasonPicker
                                            reason={form.lost_reason || ''}
                                            comment={form.lost_comment || ''}
                                            onChange={({ reason, comment }) => setF({ lost_reason: reason, lost_comment: comment })}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <Field label="Хто звернувся" required>
                            <input className={T.input} value={form.contact_name} onChange={e => setF({ contact_name: e.target.value })} placeholder="Ім'я або компанія" />
                        </Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Телефон">
                                <input type="tel" className={T.input} value={form.phone || ''} onChange={e => setF({ phone: e.target.value })} placeholder="+380…" />
                            </Field>
                            <Field label="Населений пункт">
                                <input className={T.input} value={form.place || ''} onChange={e => setF({ place: e.target.value })} />
                            </Field>
                        </div>
                        {dupes && (
                            <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900">
                                Такий телефон уже є:
                                {dupes.client && <> клієнт <a className="font-semibold underline" href={`#/clients/${dupes.client.custom_id}`}>{dupes.client.name}</a></>}
                                {dupes.client && dupes.lead && ','}
                                {dupes.lead && <> лід «{dupes.lead.contact_name}» ({getLeadStatus(dupes.lead.status).label.toLowerCase()})</>}
                            </div>
                        )}

                        <div>
                            <span className={`${T.label} block mb-1.5`}>Звідки дізнався</span>
                            <div className="flex flex-wrap gap-1.5">
                                {LEAD_SOURCES.map(s => (
                                    <button key={s.key} type="button" onClick={() => setF({ source: form.source === s.key ? '' : s.key })}
                                        className={`px-2.5 h-8 rounded-lg text-[12.5px] font-semibold border transition-colors
                                            ${form.source === s.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Field label="Що хоче">
                            <textarea rows="2" className={`${T.input} h-auto py-2 resize-y`} value={form.request || ''} onChange={e => setF({ request: e.target.value })}
                                placeholder="Напр. станція на дах приватного будинку, резерв на випадок відключень" />
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Потужність, кВт">
                                <input type="number" min="0" step="0.1" className={T.input} value={form.capacity_kw} onChange={e => setF({ capacity_kw: e.target.value })} />
                            </Field>
                            <Field label="Тип станції">
                                <select className={T.select} value={form.station_type || ''} onChange={e => setF({ station_type: e.target.value })}>
                                    <option value="">Ще невідомо</option>
                                    {STATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Field label="Хто веде">
                                <Picker options={employees.map(e => ({ id: e.custom_id, label: e.name }))} value={form.responsible_emp_id}
                                    onChange={v => setF({ responsible_emp_id: v })} placeholder="Ніхто — лід вільний" searchPlaceholder="Пошук…" />
                                {form.taken_at && Number(form.responsible_emp_id) === Number(savedLead?.responsible_emp_id) && (
                                    <div className="mt-1 text-[11.5px] text-slate-500">У роботі з {fmtTime(form.taken_at)}</div>
                                )}
                            </Field>
                            <Field label="Перший контакт">
                                <input type="date" className={T.input} value={form.first_contact_at || ''} onChange={e => setF({ first_contact_at: e.target.value })} />
                            </Field>
                        </div>

                        {isLeadActive(form.status) && (
                            <div>
                                <span className={`${T.label} block mb-1.5`}>Наступний контакт</span>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {[{ l: 'Сьогодні', d: 0 }, { l: 'Завтра', d: 1 }, { l: 'Через 3 дні', d: 3 }, { l: 'Через тиждень', d: 7 }].map(o => (
                                        <button key={o.l} type="button" onClick={() => setF({ next_action_at: addDays(o.d) })}
                                            className={`px-2.5 h-8 rounded-lg text-[12.5px] font-semibold border transition-colors
                                                ${form.next_action_at === addDays(o.d) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                            {o.l}
                                        </button>
                                    ))}
                                    <input type="date" className={`${T.input} w-auto h-8`} value={form.next_action_at || ''} onChange={e => setF({ next_action_at: e.target.value })} />
                                </div>
                            </div>
                        )}

                        <Field label="Нотатки">
                            <textarea rows="3" className={`${T.input} h-auto py-2 resize-y`} value={form.notes || ''} onChange={e => setF({ notes: e.target.value })} />
                        </Field>

                        {form.id && form.status !== 'converted' && (
                            <LeadFiles leadId={form.id} canEdit={canEditLead} uploadedBy={employee?.name} />
                        )}
                    </div>
                )}
            </Drawer>
        </Layout>
    );
}
