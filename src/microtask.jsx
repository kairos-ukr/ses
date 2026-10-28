// =====================================================================
//  K-CORE · «Задачі»
//
//  Три вкладки (відкривається «Етапи»):
//   • Етапи      — етапи об'єктів, де людина відповідальна (StagesView;
//                  колишня сторінка «Мої етапи»);
//   • Мій день   — особистий планер (PlannerView); доручення мені — теж тут;
//   • Доручення  — задачі команди: хто кому що доручив.
//
//  Доручення створюються й редагуються прямо в списку — без вікон поверх
//  сторінки. Щойно змінений рядок коротко підсвічується, тож видно, що
//  зміну прийнято; зміни інших людей приходять самі (живе оновлення).
//  Вкладка і відкрите доручення — в адресі (?tab=team&edit=…).
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    FaTasks, FaPlus, FaCalendarAlt, FaTrash, FaEdit, FaCheck, FaTimes, FaFire, FaLink,
    FaSortAmountDown, FaSortAmountUp, FaHardHat, FaUserTie,
} from 'react-icons/fa';

import { supabase } from './supabaseClient';
import Layout from './Layout';
import { useAuth } from './AuthProvider';
import { T, Btn, IconBtn, Chip, Picker, Segmented, SearchInput, Skeleton, EmptyState, Linkify, useToast, useAutoFocus, humanError } from './ui';
import PlannerView from './pages/PlannerView';
import StagesView from './pages/StagesView';

const STATUSES = [
    { key: 'нове', label: 'Нове', tone: 'warn' },
    { key: 'в процесі', label: 'В роботі', tone: 'accent' },
    { key: 'виконано', label: 'Виконано', tone: 'ok' },
    { key: 'скасовано', label: 'Скасовано', tone: 'neutral' },
];
const statusOf = (key) => STATUSES.find(s => s.key === key) || { key, label: key || '—', tone: 'neutral' };
const isOpen = (t) => t.status !== 'виконано' && t.status !== 'скасовано';

const FILTERS = [
    { id: 'open', label: 'Відкриті' },
    { id: 'нове', label: 'Нові' },
    { id: 'в процесі', label: 'В роботі' },
    { id: 'overdue', label: 'Горять', icon: FaFire },
    { id: 'виконано', label: 'Готово' },
    { id: 'скасовано', label: 'Скасовано' },
    { id: 'all', label: 'Усі' },
];

const SORTS = [
    { value: 'created_at', label: 'Нові зверху' },
    { value: 'due_date', label: 'За строком' },
    { value: 'status', label: 'За статусом' },
];

const TASK_SELECT = '*, installations(id, name, custom_id)';
const FLASH_MS = 2600;

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const todayStart = () => new Date().setHours(0, 0, 0, 0);
const isOverdue = (t) => isOpen(t) && t.due_date && new Date(t.due_date).setHours(0, 0, 0, 0) < todayStart();
const sameId = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const fmtDateTime = (s) => {
    if (!s) return '';
    let safe = s;
    if (!safe.includes('Z') && !safe.match(/[+-]\d{2}:\d{2}$/)) safe = `${safe.replace(' ', 'T')}Z`;
    return new Date(safe).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const dueText = (d) => {
    if (!d) return '';
    if (d === isoDay()) return 'сьогодні';
    if (d === addDays(1)) return 'завтра';
    return fmtDate(d);
};

/* ---------------------------------------------------------------------
 *  Форма доручення — та сама для нового й для редагування, на місці
 * ------------------------------------------------------------------- */
function TaskEditor({ initial, isNew, objectOptions, peopleOptions, onSave, onCancel }) {
    const autoFocus = useAutoFocus();
    const [f, setF] = useState(() => ({
        task_text: initial?.task_text || '',
        installation_id: initial?.installation_id ?? '',
        assigned_to: initial?.assigned_to ?? '',
        due_date: initial?.due_date ? String(initial.due_date).slice(0, 10) : '',
        status: initial?.status || 'нове',
    }));
    const [saving, setSaving] = useState(false);
    const set = (patch) => setF(p => ({ ...p, ...patch }));
    const can = f.task_text.trim().length > 0 && !saving;

    const save = async () => {
        if (!can) return;
        setSaving(true);
        const ok = await onSave(f);
        setSaving(false);
        if (ok && isNew) setF(p => ({ ...p, task_text: '', due_date: '' }));
    };

    const QUICK = [{ v: isoDay(), l: 'Сьогодні' }, { v: addDays(1), l: 'Завтра' }, { v: addDays(7), l: 'За тиждень' }];

    return (
        <div className={`${isNew ? `${T.card} p-3` : 'px-3 py-3 bg-indigo-50/40'} space-y-2.5`}
            onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }}>
            <textarea
                autoFocus={autoFocus}
                rows={f.task_text.length > 80 ? 5 : 3}
                value={f.task_text}
                onChange={e => set({ task_text: e.target.value })}
                placeholder="Що треба зробити?"
                className={`${T.input} h-auto py-2 resize-y text-[14px]`}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Picker options={objectOptions} value={f.installation_id} onChange={v => set({ installation_id: v })}
                    placeholder="Об'єкт (необов'язково)" searchPlaceholder="Номер, назва, місто…" icon={FaHardHat} />
                <Picker options={peopleOptions} value={f.assigned_to} onChange={v => set({ assigned_to: v })}
                    placeholder="Кому доручити" searchPlaceholder="Пошук людини…" icon={FaUserTie} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <span className={`${T.label} mr-0.5`}>Строк</span>
                {QUICK.map(q => (
                    <button key={q.l} type="button" onClick={() => set({ due_date: f.due_date === q.v ? '' : q.v })}
                        className={`h-8 px-2.5 rounded-lg border text-[12px] font-semibold ${f.due_date === q.v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {q.l}
                    </button>
                ))}
                <input type="date" value={f.due_date} onChange={e => set({ due_date: e.target.value })}
                    className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-[12.5px] text-slate-700" aria-label="Дата строку" />
                {f.due_date && (
                    <button type="button" onClick={() => set({ due_date: '' })} className="h-8 px-2 rounded-lg text-[12px] font-semibold text-slate-500 hover:bg-slate-100">без строку</button>
                )}
            </div>
            {!isNew && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`${T.label} mr-0.5`}>Статус</span>
                    {STATUSES.map(s => (
                        <button key={s.key} type="button" onClick={() => set({ status: s.key })}
                            className={`h-8 px-2.5 rounded-lg border text-[12px] font-semibold ${f.status === s.key ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {s.label}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <Btn variant="accent" icon={isNew ? FaPlus : FaCheck} onClick={save} disabled={!can}>
                    {saving ? 'Зберігаємо…' : isNew ? 'Додати доручення' : 'Зберегти'}
                </Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={saving}>{isNew ? 'Згорнути' : 'Скасувати'}</Btn>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Рядок доручення
 * ------------------------------------------------------------------- */
function TaskRow({ task, nameByEmail, nameById, showObject, canManage, canDelete, flash, onEdit, onComplete, onDelete }) {
    const [askDelete, setAskDelete] = useState(false);
    const st = statusOf(task.status);
    const overdue = isOverdue(task);
    const done = task.status === 'виконано';
    const creator = nameByEmail(task.creator_email) || task.creator_email || 'невідомо';
    const assignee = task.assigned_to != null ? nameById(task.assigned_to) : null;

    return (
        <li className={`px-3 py-2.5 flex items-start gap-3 transition-colors duration-700 ${flash ? 'bg-amber-50' : ''}`}>
            {canManage && isOpen(task) ? (
                <button type="button" onClick={() => onComplete(task)} aria-label="Позначити виконаним" title="Виконано"
                    className="group mt-0.5 w-7 h-7 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <FaCheck size={10} className="text-emerald-600 opacity-0 group-hover:opacity-100" />
                </button>
            ) : (
                <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {done ? <FaCheck size={10} /> : <FaTimes size={10} />}
                </span>
            )}

            <div className="min-w-0 flex-1">
                <p className={`text-[14px] font-semibold leading-snug break-words whitespace-pre-wrap ${done ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}><Linkify>{task.task_text}</Linkify></p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-slate-500">
                    {task.status !== 'нове' && <Chip tone={st.tone}>{st.label}</Chip>}
                    {overdue && <Chip tone="danger" icon={FaFire}>прострочено</Chip>}
                    <span>від <b className="text-slate-700">{creator}</b></span>
                    <span>для <b className={assignee ? 'text-indigo-700' : 'text-slate-400 font-medium'}>{assignee || 'не призначено'}</b></span>
                    {task.due_date && (
                        <span className={overdue ? 'text-rose-700 font-semibold' : ''}><FaCalendarAlt size={9} className="inline mr-1 -mt-0.5" />до {dueText(task.due_date)}</span>
                    )}
                    {showObject && task.installation && (
                        <a href={`#/project/${task.installation.custom_id}`} className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-1 break-words">
                            <FaLink size={9} /> СЕС-{task.installation.custom_id} {task.installation.name}
                        </a>
                    )}
                    <span className="text-slate-400">#{String(task.custom_id).trim()} · {fmtDateTime(task.created_at)}</span>
                    {done && task.data_complete && <span className="text-emerald-700">виконано {fmtDateTime(task.data_complete)}</span>}
                </div>
            </div>

            {askDelete ? (
                <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[12px] font-semibold text-rose-700 mr-1">Видалити?</span>
                    <Btn size="sm" variant="danger" onClick={() => { setAskDelete(false); onDelete(task); }}>Так</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => setAskDelete(false)}>Ні</Btn>
                </div>
            ) : (
                <div className="flex items-center flex-shrink-0">
                    {canManage && <IconBtn icon={FaEdit} label="Редагувати" onClick={() => onEdit(task)} />}
                    {canDelete && <IconBtn variant="ghost" icon={FaTrash} label="Видалити" className="hover:!text-rose-600" onClick={() => setAskDelete(true)} />}
                </div>
            )}
        </li>
    );
}

/* ---------------------------------------------------------------------
 *  Вкладка «Доручення»
 * ------------------------------------------------------------------- */
function TeamTasks({ editId, onEditDone }) {
    const { can, user, employee } = useAuth();
    const toast = useToast();
    // Доступи → «Доручення команди»: бачити чужі, доручати, змінювати чужі, видаляти
    const seeAll = can('tasks');
    const canAssign = can('tasks', 'add');
    const isAdminOrOffice = can('tasks', 'edit');
    const canDeleteTasks = can('tasks', 'delete');
    const myEmail = user?.email;
    const myCustomId = employee?.custom_id;

    const [tasks, setTasks] = useState(null);
    const [installations, setInstallations] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [filter, setFilter] = useState('open');
    const [who, setWho] = useState('all');
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState('created_at');
    const [sortDir, setSortDir] = useState('desc');
    const [grouping, setGrouping] = useState(() => { try { return localStorage.getItem('kcore.tasks.group') || 'list'; } catch { return 'list'; } });
    const [composing, setComposing] = useState(false);
    const [editing, setEditing] = useState(null);
    const [flash, setFlash] = useState({});
    const composerRef = useRef(null);

    const pulse = useCallback((id) => {
        const k = String(id).trim();
        setFlash(f => ({ ...f, [k]: true }));
        setTimeout(() => setFlash(f => { const n = { ...f }; delete n[k]; return n; }), FLASH_MS);
    }, []);

    const load = useCallback(async () => {
        const [t, i, e] = await Promise.all([
            supabase.from('microtasks').select(TASK_SELECT).order('created_at', { ascending: false }),
            supabase.from('installations').select('id, custom_id, name, status, client:clients(name, populated_place)').order('custom_id', { ascending: false }),
            supabase.from('employees').select('id, custom_id, name, email, access_blocked_at, hidden_from_list').order('name'),
        ]);
        if (t.error) { toast(humanError(t.error), 'error'); setTasks([]); return; }
        setTasks((t.data || []).map(x => ({ ...x, installation: x.installations })));
        setInstallations(i.data || []);
        setEmployees(e.data || []);
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    // Зміни інших людей приходять самі — рядок коротко підсвічується
    useEffect(() => {
        let timer = null;
        const ch = supabase.channel('tasks-team')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'microtasks' }, (p) => {
                if (p.new?.custom_id) pulse(p.new.custom_id);
                clearTimeout(timer); timer = setTimeout(() => load(), 500);
            })
            .subscribe();
        return () => { clearTimeout(timer); supabase.removeChannel(ch); };
    }, [load, pulse]);

    // Відкрили доручення з «Мого дня» — одразу його редагування
    useEffect(() => {
        if (!editId || !tasks) return;
        const t = tasks.find(x => sameId(x.custom_id, editId));
        if (t) {
            setEditing(String(t.custom_id).trim());
            setFilter('all');
            setTimeout(() => document.getElementById(`task-${String(t.custom_id).trim()}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
        }
        onEditDone?.();
    }, [editId, tasks, onEditDone]);

    const nameById = useCallback((cid) => employees.find(e => Number(e.custom_id) === Number(cid))?.name || null, [employees]);
    const nameByEmail = useCallback((em) => employees.find(e => e.email && e.email === em)?.name || null, [employees]);

    const objectOptions = useMemo(() => installations
        .slice()
        .sort((a, b) => Number(['completed', 'cancelled', 'lost'].includes(a.status)) - Number(['completed', 'cancelled', 'lost'].includes(b.status)) || b.custom_id - a.custom_id)
        .map(o => ({ id: o.id, label: [`СЕС-${o.custom_id}`, o.name || o.client?.name, o.client?.populated_place].filter(Boolean).join(' · ') })), [installations]);
    const peopleOptions = useMemo(() => employees
        .filter(e => !e.access_blocked_at && !e.hidden_from_list)
        .map(e => ({ id: e.custom_id, label: e.name })), [employees]);

    const canManageTask = useCallback((t) => isAdminOrOffice || t.creator_email === myEmail || Number(t.assigned_to) === Number(myCustomId),
        [isAdminOrOffice, myEmail, myCustomId]);

    const byWho = useMemo(() => (tasks || []).filter(t => {
        const fromMe = t.creator_email === myEmail;
        const toMe = myCustomId != null && Number(t.assigned_to) === Number(myCustomId);
        if (!seeAll && !fromMe && !toMe) return false;   // чужі доручення закриті
        if (who === 'from_me') return fromMe;
        if (who === 'to_me') return toMe;
        return true;
    }), [tasks, who, myEmail, myCustomId, seeAll]);

    const countOf = (id) => byWho.filter(t => (id === 'all' ? true : id === 'open' ? isOpen(t) : id === 'overdue' ? isOverdue(t) : t.status === id)).length;

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase().replace(/^сес-?/, '');
        const list = byWho.filter(t => {
            if (filter === 'open' && !isOpen(t)) return false;
            if (filter === 'overdue' && !isOverdue(t)) return false;
            if (!['all', 'open', 'overdue'].includes(filter) && t.status !== filter) return false;
            if (!q) return true;
            return [t.task_text, t.custom_id, t.installation?.name, t.installation?.custom_id, nameById(t.assigned_to), nameByEmail(t.creator_email)]
                .some(v => v != null && String(v).toLowerCase().includes(q));
        });
        const dir = sortDir === 'asc' ? 1 : -1;
        return list.sort((a, b) => {
            let x = a[sortBy] || '', y = b[sortBy] || '';
            if (sortBy === 'due_date') { x = a.due_date || '9999'; y = b.due_date || '9999'; }
            if (sortBy === 'status') { x = STATUSES.findIndex(s => s.key === a.status); y = STATUSES.findIndex(s => s.key === b.status); }
            return x > y ? dir : x < y ? -dir : 0;
        });
    }, [byWho, filter, search, sortBy, sortDir, nameById, nameByEmail]);

    const groups = useMemo(() => {
        if (grouping !== 'object') return [{ key: 'all', items: shown }];
        const m = new Map();
        shown.forEach(t => {
            const k = t.installation?.custom_id ?? 'none';
            if (!m.has(k)) m.set(k, { key: String(k), obj: t.installation || null, items: [] });
            m.get(k).items.push(t);
        });
        return [...m.values()].sort((a, b) => (a.obj ? 0 : 1) - (b.obj ? 0 : 1)
            || b.items.filter(isOpen).length - a.items.filter(isOpen).length
            || (b.obj?.custom_id || 0) - (a.obj?.custom_id || 0));
    }, [shown, grouping]);

    /* ---- Дії ---- */

    const payloadOf = (f) => ({
        task_text: f.task_text.trim(),
        due_date: f.due_date || null,
        installation_id: f.installation_id === '' ? null : f.installation_id,
        assigned_to: f.assigned_to === '' ? null : f.assigned_to,
    });

    const create = async (f) => {
        const { data: a } = await supabase.auth.getUser();
        if (!a?.user?.email) { toast('Сесія застаріла — оновіть сторінку', 'error'); return false; }
        const { data, error } = await supabase.from('microtasks')
            .insert({ ...payloadOf(f), status: 'нове', creator_email: a.user.email })
            .select(TASK_SELECT).single();
        if (error) { toast(humanError(error), 'error'); return false; }
        setTasks(prev => [{ ...data, installation: data.installations }, ...(prev || [])]);
        if (filter !== 'open' && filter !== 'нове' && filter !== 'all') setFilter('open');
        pulse(data.custom_id);
        toast(f.assigned_to ? `Доручено: ${nameById(f.assigned_to)}` : 'Доручення додано');
        return true;
    };

    const update = async (task, f) => {
        const patch = { ...payloadOf(f), status: f.status };
        if (f.status !== task.status) {
            if (f.status === 'виконано') patch.data_complete = new Date().toISOString();
            else if (f.status === 'нове' || f.status === 'в процесі') patch.data_complete = null;
        }
        const { data, error } = await supabase.from('microtasks').update(patch).eq('custom_id', task.custom_id).select(TASK_SELECT).single();
        if (error) { toast(humanError(error), 'error'); return false; }
        setTasks(prev => prev.map(t => (sameId(t.custom_id, task.custom_id) ? { ...data, installation: data.installations } : t)));
        setEditing(null);
        pulse(task.custom_id);
        toast('Доручення оновлено');
        return true;
    };

    const setStatus = async (task, status, message, undo = true) => {
        const patch = { status, data_complete: status === 'виконано' ? new Date().toISOString() : null };
        const { data, error } = await supabase.from('microtasks').update(patch).eq('custom_id', task.custom_id).select(TASK_SELECT).single();
        if (error) { toast(humanError(error), 'error'); return; }
        setTasks(prev => prev.map(t => (sameId(t.custom_id, task.custom_id) ? { ...data, installation: data.installations } : t)));
        pulse(task.custom_id);
        toast(message, 'success', undo ? { label: 'Повернути', onClick: () => setStatus(task, task.status, 'Повернуто', false) } : undefined);
    };

    const remove = async (task) => {
        const { error } = await supabase.from('microtasks').delete().eq('custom_id', task.custom_id);
        if (error) { toast(humanError(error), 'error'); return; }
        setTasks(prev => prev.filter(t => !sameId(t.custom_id, task.custom_id)));
        toast('Доручення видалено', 'info');
    };

    const openComposer = () => {
        setComposing(true);
        setTimeout(() => composerRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 30);
    };

    const changeGrouping = (g) => { setGrouping(g); try { localStorage.setItem('kcore.tasks.group', g); } catch { /* немає сховища */ } };

    const renderRow = (t, showObject) => {
        const id = String(t.custom_id).trim();
        if (editing === id) {
            return (
                <li key={id} id={`task-${id}`}>
                    <TaskEditor initial={t} objectOptions={objectOptions} peopleOptions={peopleOptions}
                        onSave={(f) => update(t, f)} onCancel={() => setEditing(null)} />
                </li>
            );
        }
        return (
            <TaskRow key={id} task={t} nameById={nameById} nameByEmail={nameByEmail} showObject={showObject}
                canManage={canManageTask(t)} canDelete={canDeleteTasks} flash={!!flash[id]}
                onEdit={() => setEditing(id)}
                onComplete={(x) => setStatus(x, 'виконано', 'Виконано')}
                onDelete={remove} />
        );
    };

    return (
        <div className="space-y-3">
            {/* Нове доручення — тут же, над списком */}
            <div ref={composerRef} className="scroll-mt-3">
                {!canAssign ? null : composing ? (
                    <TaskEditor isNew objectOptions={objectOptions} peopleOptions={peopleOptions} onSave={create} onCancel={() => setComposing(false)} />
                ) : (
                    <button type="button" onClick={openComposer}
                        className="w-full h-12 px-4 rounded-xl border border-dashed border-slate-300 bg-white text-left text-[14px] font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-700 inline-flex items-center gap-2.5">
                        <FaPlus size={11} /> Нове доручення…
                    </button>
                )}
            </div>

            <div className={`${T.card} p-2.5 space-y-2.5`}>
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented value={who} onChange={setWho}
                        options={[{ value: 'all', label: 'Усі' }, { value: 'from_me', label: 'Від мене' }, { value: 'to_me', label: 'Для мене' }]} />
                    <SearchInput value={search} onChange={setSearch} placeholder="Текст, номер, об'єкт, людина…" className="flex-1 min-w-[180px]" />
                    <div className="flex items-center gap-1.5">
                        <select value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Порядок"
                            className="h-9 pl-2.5 pr-7 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700">
                            {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        <IconBtn variant="outline" icon={sortDir === 'asc' ? FaSortAmountUp : FaSortAmountDown} label="Напрямок сортування"
                            onClick={() => setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))} />
                    </div>
                    <Segmented value={grouping} onChange={changeGrouping}
                        options={[{ value: 'list', label: 'Списком' }, { value: 'object', label: "По об'єктах" }]} />
                </div>
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
                    {FILTERS.map(c => {
                        const on = filter === c.id;
                        const n = tasks ? countOf(c.id) : '';
                        return (
                            <button key={c.id} type="button" onClick={() => setFilter(c.id)}
                                className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors
                                    ${on ? (c.id === 'overdue' ? 'bg-rose-600 border-rose-600 text-white' : 'bg-indigo-600 border-indigo-600 text-white') : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                {c.icon && <c.icon size={10} />}{c.label}
                                <span className={`tabular-nums text-[11.5px] ${on ? 'opacity-80' : 'text-slate-400'}`}>{n}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {tasks === null ? (
                <div className={T.card}><Skeleton rows={6} /></div>
            ) : shown.length === 0 ? (
                <div className={T.card}>
                    <EmptyState icon={FaTasks} title={search ? 'Нічого не знайдено' : 'Доручень немає'} hint={search ? 'Спробуйте інший запит або фільтр.' : 'Додайте перше доручення вище.'} />
                </div>
            ) : groups.map(g => (
                <section key={g.key} className={`${T.card} overflow-hidden`}>
                    {grouping === 'object' && (
                        <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-start gap-2">
                            <FaHardHat size={12} className="mt-1 text-slate-400 flex-shrink-0" />
                            {g.obj ? (
                                <a href={`#/project/${g.obj.custom_id}`} className="min-w-0 flex-1 text-[14px] font-bold text-slate-900 hover:text-indigo-700 break-words">
                                    <span className="font-mono text-[11.5px] text-slate-400 mr-1.5">СЕС-{g.obj.custom_id}</span>{g.obj.name || `Об'єкт #${g.obj.custom_id}`}
                                </a>
                            ) : <span className="flex-1 text-[14px] font-bold text-slate-500">Без об'єкта</span>}
                            <span className="mt-0.5 text-[12px] font-semibold text-slate-400 tabular-nums">{g.items.length}</span>
                        </div>
                    )}
                    <ul className="divide-y divide-slate-100">
                        {g.items.map(t => renderRow(t, grouping !== 'object'))}
                    </ul>
                </section>
            ))}

            {/* Телефон: кнопка завжди під рукою */}
            {!composing && canAssign && (
                <button type="button" onClick={openComposer} aria-label="Нове доручення"
                    className="sm:hidden fixed bottom-20 right-4 z-40 w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg">
                    <FaPlus size={20} />
                </button>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Сторінка
 * ------------------------------------------------------------------- */
const TABS = [
    { value: 'stages', label: 'Етапи' },
    { value: 'day', label: 'Мій день' },
    { value: 'team', label: 'Доручення' },
];

export default function MicrotasksPage() {
    const [params, setParams] = useSearchParams();
    const tab = TABS.some(t => t.value === params.get('tab')) ? params.get('tab') : 'stages';
    const editId = params.get('edit');

    const setTab = (t) => setParams(t === 'stages' ? {} : { tab: t }, { replace: true });
    const clearEdit = useCallback(() => setParams(prev => {
        const p = new URLSearchParams(prev);
        p.delete('edit');
        return p;
    }, { replace: true }), [setParams]);

    return (
        <Layout>
            <div className="p-3 sm:p-6 space-y-3 max-w-[1500px] mx-auto pb-24 lg:pb-8">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight mr-auto">Задачі та етапи</h1>
                    <Segmented value={tab} onChange={setTab} options={TABS} />
                </div>

                {tab === 'day' && (
                    <PlannerView onOpenTask={(t) => setParams({ tab: 'team', edit: String(t.custom_id).trim() }, { replace: true })} />
                )}
                {tab === 'team' && <TeamTasks editId={editId} onEditDone={clearEdit} />}
                {tab === 'stages' && <StagesView />}
            </div>
        </Layout>
    );
}

