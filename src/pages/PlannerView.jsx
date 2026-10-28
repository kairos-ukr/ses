// =====================================================================
//  K-CORE · «Мій день» — особистий планер на сторінці «Задачі»
//
//  • Особисті нагадування: що зробити, на який день, о котрій нагадати.
//    Бачить лише автор і ті, з ким він поділився. У вибраний час бот
//    надсилає нагадування особисто + у дзвіночок CRM.
//  • Мої доручення — командні задачі, доручені мені, в тому ж списку.
//  • «Можна взяти собі» — вільні доручення без виконавця: одна кнопка.
//  Усе оновлюється наживо: поділились зі мною — з'являється одразу.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FaPlus, FaBell, FaUserFriends, FaTrash, FaCheck, FaHandPaper, FaLink, FaTimes, FaUndo, FaPen,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, Skeleton, Linkify, useToast, useIsTouch, humanError } from '../ui';
import DealReviewCard from './DealReviewCard';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const TASK_ACTIVE = ['нове', 'в процесі'];

const dayLabel = (s) => {
    if (!s) return '';
    const today = ymd(new Date());
    if (s === today) return 'сьогодні';
    if (s === ymd(addDays(new Date(), 1))) return 'завтра';
    if (s === ymd(addDays(new Date(), -1))) return 'вчора';
    return new Date(`${s}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
};
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : '');

/** Дата + час (локальні) → ISO; без часу — null */
const toRemindAt = (date, time) => (date && time ? new Date(`${date}T${time}:00`).toISOString() : null);

/** Поле вводу підлаштовує висоту під текст */
const growArea = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };

export default function PlannerView({ onOpenTask }) {
    const { employee: me, can } = useAuth();
    const isOffice = can('objects');   // «Мої угоди на перегляд» — тим, кому відкриті об'єкти
    const toast = useToast();
    const isTouch = useIsTouch();   // на телефоні Enter — новий рядок, додає кнопка
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState([]);       // мої + поділені зі мною, невиконані
    const [doneToday, setDoneToday] = useState([]);
    const [myTasks, setMyTasks] = useState([]);   // доручення мені
    const [freeTasks, setFreeTasks] = useState([]); // без виконавця
    const [people, setPeople] = useState([]);
    const [editing, setEditing] = useState(null); // id нагадування, яке редагують на місці

    // Швидке додавання
    const [text, setText] = useState('');
    const [date, setDate] = useState(() => ymd(new Date()));
    const [time, setTime] = useState('');
    const [share, setShare] = useState([]);
    const [showShare, setShowShare] = useState(false);
    const inputRef = useRef(null);

    const load = useCallback(async () => {
        if (!me?.id) return;
        try {
            const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
            const [mine, done, assigned, free, emps] = await Promise.all([
                supabase.from('personal_reminders').select('*')
                    .or(`owner_id.eq.${me.id},shared_with.cs.{${me.id}}`).is('done_at', null)
                    .order('plan_date', { ascending: true, nullsFirst: false }).order('remind_at', { ascending: true }),
                supabase.from('personal_reminders').select('*')
                    .or(`owner_id.eq.${me.id},shared_with.cs.{${me.id}}`).gte('done_at', startToday.toISOString())
                    .order('done_at', { ascending: false }).limit(30),
                me.custom_id
                    ? supabase.from('microtasks').select('custom_id, task_text, due_date, status, installation_id, creator_email, installations(name, custom_id)')
                        .eq('assigned_to', me.custom_id).in('status', TASK_ACTIVE)
                    : Promise.resolve({ data: [] }),
                supabase.from('microtasks').select('custom_id, task_text, due_date, status, installation_id, creator_email, installations(name, custom_id)')
                    .is('assigned_to', null).in('status', TASK_ACTIVE).order('created_at', { ascending: false }).limit(30),
                supabase.from('employees').select('id, custom_id, name, email, hidden_from_list, access_blocked_at').order('name'),
            ]);
            const err = mine.error || done.error || assigned.error || free.error;
            if (err) throw err;
            setItems(mine.data || []);
            setDoneToday(done.data || []);
            setMyTasks(assigned.data || []);
            setFreeTasks(free.data || []);
            setPeople((emps.data || []).filter(e => !e.hidden_from_list && !e.access_blocked_at));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [me?.id, me?.custom_id, toast]);

    useEffect(() => { load(); }, [load]);

    // Наживо: поділились нагадуванням, хтось узяв вільну задачу
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; }, [load]);
    useEffect(() => {
        let t;
        const bump = () => { clearTimeout(t); t = setTimeout(() => loadRef.current(), 400); };
        const ch = supabase.channel('kcore-planner')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_reminders' }, bump)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'microtasks' }, bump)
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, []);

    // Щохвилини перемальовуємо — щоб «час!» з'являвся вчасно
    const [, setTick] = useState(0);
    useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 60 * 1000); return () => clearInterval(i); }, []);

    const nameOf = useCallback((id) => people.find(p => p.id === id)?.name || 'колега', [people]);
    const creatorName = useCallback((email) => people.find(p => p.email && email && p.email.toLowerCase() === email.toLowerCase())?.name, [people]);

    /* --- Дії з нагадуваннями --- */
    const add = async (e) => {
        e?.preventDefault();
        const t = text.trim();
        if (!t || !me?.id) return;
        const row = { owner_id: me.id, text: t, plan_date: date || null, remind_at: toRemindAt(date, time), shared_with: share };
        setText('');
        if (inputRef.current) inputRef.current.style.height = '';
        const { error } = await supabase.from('personal_reminders').insert(row);
        if (error) { toast(humanError(error), 'error'); setText(t); return; }
        setTime(''); setShare([]); setShowShare(false);
        inputRef.current?.focus();
        load();
    };

    const patch = async (id, p) => {
        setItems(prev => prev.map(x => (x.id === id ? { ...x, ...p } : x)));
        const { error } = await supabase.from('personal_reminders').update(p).eq('id', id);
        if (error) toast(humanError(error), 'error');
        load();
    };
    const complete = (r) => patch(r.id, { done_at: new Date().toISOString() });
    const reopen = (r) => patch(r.id, { done_at: null });
    const remove = async (r) => {
        setItems(prev => prev.filter(x => x.id !== r.id));
        const { error } = await supabase.from('personal_reminders').delete().eq('id', r.id);
        if (error) { toast(humanError(error), 'error'); load(); }
    };

    /* --- Доручення --- */
    const takeTask = async (task) => {
        if (!me?.custom_id) return;
        const { error } = await supabase.from('microtasks').update({ assigned_to: me.custom_id, status: 'в процесі' }).eq('custom_id', task.custom_id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Задачу взято — вона у вашому дні', 'success');
        load();
    };
    const finishTask = async (task) => {
        const { error } = await supabase.from('microtasks').update({ status: 'виконано', data_complete: new Date().toISOString() }).eq('custom_id', task.custom_id);
        if (error) { toast(humanError(error), 'error'); return; }
        load();
    };

    /* --- Розкладка по днях --- */
    const groups = useMemo(() => {
        const today = ymd(new Date());
        const tomorrow = ymd(addDays(new Date(), 1));
        const g = { overdue: [], today: [], tomorrow: [], later: [], nodate: [] };
        const place = (key, entry) => g[key].push(entry);
        const bucket = (day) => (!day ? 'nodate' : day < today ? 'overdue' : day === today ? 'today' : day === tomorrow ? 'tomorrow' : 'later');
        items.forEach(r => place(bucket(r.plan_date || (r.remind_at ? ymd(new Date(r.remind_at)) : null)), { kind: 'rem', r }));
        myTasks.forEach(t => place(bucket(t.due_date), { kind: 'task', t }));
        // У дні — спочатку ті, що з часом, за часом
        Object.values(g).forEach(list => list.sort((a, b) => {
            const ta = a.kind === 'rem' && a.r.remind_at ? new Date(a.r.remind_at).getTime() : Infinity;
            const tb = b.kind === 'rem' && b.r.remind_at ? new Date(b.r.remind_at).getTime() : Infinity;
            return ta - tb;
        }));
        return g;
    }, [items, myTasks]);

    const SECTIONS = [
        { key: 'overdue', label: 'Прострочено', tone: 'text-rose-700' },
        { key: 'today', label: 'Сьогодні', tone: 'text-slate-900' },
        { key: 'tomorrow', label: 'Завтра', tone: 'text-slate-900' },
        { key: 'later', label: 'Далі', tone: 'text-slate-900' },
        { key: 'nodate', label: 'Без дати', tone: 'text-slate-500' },
    ];

    const quickDates = [
        { v: ymd(new Date()), l: 'Сьогодні' },
        { v: ymd(addDays(new Date(), 1)), l: 'Завтра' },
        { v: '', l: 'Без дати' },
    ];

    if (loading) return <div className={T.card}><Skeleton rows={8} /></div>;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
            <div className="space-y-3 min-w-0">
                {/* Швидко додати */}
                <form onSubmit={add} className={`${T.card} p-3 space-y-2.5`}>
                    {/* Поле росте разом з текстом; Enter — додати, Shift+Enter — новий рядок */}
                    <textarea ref={inputRef} value={text} rows={3}
                        onChange={e => { setText(e.target.value); growArea(e.target); }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.nativeEvent.isComposing) add(e); }}
                        placeholder="Що треба зробити? Наприклад: передзвонити клієнту по КП. Посилання теж можна вставити"
                        className={`${T.input} h-auto min-h-[84px] max-h-[320px] py-2.5 resize-none text-[14px] leading-relaxed`} />
                    <div className="flex flex-wrap items-center gap-1.5">
                        {quickDates.map(q => (
                            <button key={q.l} type="button" onClick={() => setDate(q.v)}
                                className={`h-8 px-2.5 rounded-lg border text-[12.5px] font-semibold ${date === q.v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                {q.l}
                            </button>
                        ))}
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="Інший день"
                            className="h-8 px-2 rounded-lg border border-slate-200 text-[12.5px] text-slate-600 bg-white" />
                        <span className="inline-flex items-center gap-1.5 ml-1">
                            <FaBell size={11} className={time ? 'text-amber-500' : 'text-slate-400'} />
                            <input type="time" value={time} onChange={e => setTime(e.target.value)} disabled={!date} aria-label="Коли нагадати"
                                className="h-8 px-2 rounded-lg border border-slate-200 text-[12.5px] text-slate-600 bg-white disabled:opacity-40" />
                        </span>
                        <button type="button" onClick={() => setShowShare(v => !v)}
                            className={`h-8 px-2.5 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${share.length ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            <FaUserFriends size={11} /> {share.length ? `Поділитися: ${share.length}` : 'Тільки я'}
                        </button>
                        <Btn type="submit" variant="accent" icon={FaPlus} disabled={!text.trim()} className="ml-auto">Додати</Btn>
                    </div>
                    {showShare && (
                        <SharePicker people={people.filter(p => p.id !== me?.id)} value={share} onChange={setShare} />
                    )}
                </form>

                {/* Розклад */}
                {SECTIONS.map(s => {
                    const list = groups[s.key];
                    if (!list.length && s.key !== 'today') return null;
                    return (
                        <div key={s.key} className={T.card}>
                            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                                <h3 className={`text-[14px] font-bold ${s.tone}`}>{s.label}</h3>
                                <span className="text-[12px] text-slate-400 tabular-nums">{list.length}</span>
                            </div>
                            {list.length === 0 ? (
                                <p className="px-4 py-5 text-[13px] text-slate-400 text-center">На сьогодні нічого — додайте нагадування вище</p>
                            ) : (
                                <ul className="divide-y divide-slate-100">
                                    {list.map(entry => (entry.kind === 'rem' ? (
                                        <ReminderRow key={`r${entry.r.id}`} r={entry.r} me={me} nameOf={nameOf}
                                            editing={editing === entry.r.id} onEdit={() => setEditing(entry.r.id)} onCloseEdit={() => setEditing(null)}
                                            people={people} onComplete={complete} onRemove={remove} onPatch={patch} />
                                    ) : (
                                        <li key={`t${entry.t.custom_id}`} className="px-4 py-2.5 flex items-start gap-3">
                                            <button type="button" onClick={() => finishTask(entry.t)} aria-label="Виконано"
                                                className="mt-0.5 w-6 h-6 rounded-full border-2 border-indigo-300 hover:bg-indigo-50 flex items-center justify-center text-indigo-500 flex-shrink-0">
                                                <FaCheck size={9} className="opacity-0 hover:opacity-100" />
                                            </button>
                                            <div role="button" tabIndex={0} onClick={() => onOpenTask?.(entry.t)}
                                                onKeyDown={e => { if (e.key === 'Enter') onOpenTask?.(entry.t); }}
                                                className="min-w-0 flex-1 text-left cursor-pointer">
                                                <div className="text-[13.5px] font-semibold text-slate-800 leading-snug break-words whitespace-pre-wrap"><Linkify>{entry.t.task_text}</Linkify></div>
                                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
                                                    <Chip tone="accent">Доручення #{entry.t.custom_id}</Chip>
                                                    {creatorName(entry.t.creator_email) && <span>від {creatorName(entry.t.creator_email)}</span>}
                                                    {entry.t.due_date && <span>до {dayLabel(entry.t.due_date)}</span>}
                                                    {entry.t.installations && <span className="inline-flex items-center gap-1"><FaLink size={9} /> {entry.t.installations.name}</span>}
                                                </div>
                                            </div>
                                        </li>
                                    )))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Права колонка: можна взяти, готово сьогодні */}
            <aside className="space-y-3">
                {isOffice && <DealReviewCard />}
                <div className={T.card}>
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-[14px] font-bold text-slate-900 inline-flex items-center gap-2"><FaHandPaper size={12} className="text-amber-500" /> Можна взяти собі</h3>
                        <span className="text-[12px] text-slate-400 tabular-nums">{freeTasks.length}</span>
                    </div>
                    {freeTasks.length === 0 ? (
                        <p className="px-4 py-5 text-[13px] text-slate-400 text-center">Вільних доручень немає</p>
                    ) : (
                        <ul className="divide-y divide-slate-100">
                            {freeTasks.map(t => (
                                <li key={t.custom_id} className="px-4 py-2.5">
                                    <div className="text-[13px] font-semibold text-slate-800 leading-snug break-words whitespace-pre-wrap"><Linkify>{t.task_text}</Linkify></div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="text-[11.5px] text-slate-500 flex-1 min-w-0">
                                            {[creatorName(t.creator_email) && `від ${creatorName(t.creator_email)}`, t.due_date && `до ${dayLabel(t.due_date)}`, t.installations?.name].filter(Boolean).join(' · ')}
                                        </span>
                                        {me?.custom_id && <Btn size="sm" variant="softWarn" onClick={() => takeTask(t)}>Взяти</Btn>}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {doneToday.length > 0 && (
                    <div className={T.card}>
                        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-[14px] font-bold text-emerald-700 inline-flex items-center gap-2"><FaCheck size={11} /> Готово сьогодні</h3>
                            <span className="text-[12px] text-slate-400 tabular-nums">{doneToday.length}</span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                            {doneToday.map(r => (
                                <li key={r.id} className="px-4 py-2 flex items-center gap-2">
                                    <span className="text-[13px] text-slate-400 line-through flex-1 min-w-0 break-words"><Linkify>{r.text}</Linkify></span>
                                    {r.owner_id === me?.id && (
                                        <button type="button" onClick={() => reopen(r)} aria-label="Повернути" title="Повернути в план"
                                            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-50"><FaUndo size={10} /></button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </aside>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Рядок нагадування; редагування — тут же, без окремого вікна
 * ------------------------------------------------------------------- */

function ReminderRow({ r, me, nameOf, editing, onEdit, onCloseEdit, people, onComplete, onRemove, onPatch }) {
    const mine = r.owner_id === me?.id;
    const due = r.remind_at && new Date(r.remind_at) <= new Date();
    const [draft, setDraft] = useState(null);

    useEffect(() => {
        if (editing) {
            const at = r.remind_at ? new Date(r.remind_at) : null;
            setDraft({ text: r.text, note: r.note || '', date: r.plan_date || (at ? ymd(at) : ''), time: at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : '', share: r.shared_with || [] });
        }
    }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

    const save = () => {
        if (!draft.text.trim()) return;
        onPatch(r.id, { text: draft.text.trim(), note: draft.note.trim() || null, plan_date: draft.date || null, remind_at: toRemindAt(draft.date, draft.time), shared_with: draft.share });
        onCloseEdit();
    };

    return (
        <li className={`px-4 py-2.5 ${due ? 'bg-amber-50/60' : ''}`}>
            <div className="flex items-start gap-3">
                <button type="button" onClick={() => onComplete(r)} aria-label="Виконано"
                    className="group mt-0.5 w-6 h-6 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <FaCheck size={9} className="text-emerald-600 opacity-0 group-hover:opacity-100" />
                </button>
                <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-slate-800 leading-snug break-words whitespace-pre-wrap"><Linkify>{r.text}</Linkify></div>
                    {r.note && <div className="text-[12.5px] text-slate-500 whitespace-pre-wrap break-words"><Linkify>{r.note}</Linkify></div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                        {r.remind_at && (
                            <span className={`inline-flex items-center gap-1 h-5 px-1.5 rounded font-semibold ${due ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                                <FaBell size={9} /> {due ? 'час!' : ''} {timeOf(r.remind_at)}{r.plan_date && r.plan_date !== ymd(new Date()) ? ` · ${dayLabel(r.plan_date)}` : ''}
                            </span>
                        )}
                        {!mine && <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded bg-sky-50 text-sky-800 font-semibold"><FaUserFriends size={9} /> від {nameOf(r.owner_id)}</span>}
                        {mine && (r.shared_with || []).length > 0 && (
                            <span className="inline-flex items-center gap-1 text-sky-700"><FaUserFriends size={9} /> бачать: {(r.shared_with || []).map(nameOf).join(', ')}</span>
                        )}
                    </div>
                </div>
                {mine && !editing && (
                    <span className="flex items-center flex-shrink-0">
                        <button type="button" onClick={onEdit} aria-label="Змінити" className="w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-50"><FaPen size={10} /></button>
                        <button type="button" onClick={() => onRemove(r)} aria-label="Видалити" className="w-8 h-8 rounded-md flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50"><FaTrash size={10} /></button>
                    </span>
                )}
            </div>

            {editing && draft && (
                <div className="mt-2 ml-9 p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <textarea rows={2} value={draft.text} onChange={e => { setDraft(d => ({ ...d, text: e.target.value })); growArea(e.target); }}
                        ref={growArea} className={`${T.input} h-auto py-2 resize-none text-[14px]`} />
                    <textarea rows={2} value={draft.note} onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} placeholder="Деталі (необов'язково)" className={`${T.input} h-auto py-2 resize-none`} />
                    <div className="flex flex-wrap items-center gap-1.5">
                        <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))} className="h-8 px-2 rounded-lg border border-slate-200 text-[12.5px] bg-white" />
                        <input type="time" value={draft.time} disabled={!draft.date} onChange={e => setDraft(d => ({ ...d, time: e.target.value }))} className="h-8 px-2 rounded-lg border border-slate-200 text-[12.5px] bg-white disabled:opacity-40" />
                        {draft.date && <button type="button" onClick={() => setDraft(d => ({ ...d, date: '', time: '' }))} className="h-8 px-2 text-[12px] text-slate-500 hover:text-slate-800">без дати</button>}
                    </div>
                    <SharePicker people={people.filter(p => p.id !== me?.id)} value={draft.share} onChange={(v) => setDraft(d => ({ ...d, share: v }))} />
                    <div className="flex justify-end gap-1.5">
                        <Btn size="sm" variant="ghost" icon={FaTimes} onClick={onCloseEdit}>Скасувати</Btn>
                        <Btn size="sm" variant="accent" icon={FaCheck} onClick={save}>Зберегти</Btn>
                    </div>
                </div>
            )}
        </li>
    );
}

/** Кому показати: позначаємо людей, решта не бачить */
function SharePicker({ people, value, onChange }) {
    const [q, setQ] = useState('');
    const list = people.filter(p => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
    const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-2 space-y-2">
            <div className="flex items-center gap-2">
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Кому показати — пошук" className="flex-1 h-8 px-2.5 rounded-md border border-slate-200 text-[12.5px] outline-none focus:border-indigo-400" />
                {value.length > 0 && <button type="button" onClick={() => onChange([])} className="text-[12px] font-semibold text-slate-500 hover:text-slate-800">тільки я</button>}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                {list.map(p => (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)}
                        className={`h-7 px-2.5 rounded-full border text-[12px] font-semibold ${value.includes(p.id) ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {p.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
