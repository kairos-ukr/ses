// =====================================================================
//  K-CORE · «Задачі» → «Нотатник»
//
//  Особисті нотатки: текст будь-якої довжини (посилання клікаються), за
//  бажанням — нагадування на день і час: бот надсилає його в Telegram і
//  в дзвіночок (той самий механізм, що й у «Мій день»). Бачить лише
//  автор; можна показати вибраним людям — вони бачать нотатку з
//  позначкою «від …» і теж отримують нагадування. Закріплені — вгорі.
//  Писати й змінювати — тут же, без окремих вікон.
//  Дані — personal_reminders з is_note (db/2026-11_notebook.sql).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FaPlus, FaBell, FaUserFriends, FaLock, FaThumbtack, FaPen, FaTrash, FaTimes, FaCheck, FaSearch, FaStickyNote,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, Tip, Skeleton, EmptyState, Linkify, useToast, useConfirm, useIsTouch, humanError } from '../ui';
import { SharePicker } from './PlannerView';

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toRemindAt = (date, time) => (date && time ? new Date(`${date}T${time}:00`).toISOString() : null);
const growArea = (el) => { if (!el) return; el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; };

/** «сьогодні о 09:00», «завтра о 18:30», «пт, 7 лист. о 10:00» */
const whenText = (iso) => {
    const d = new Date(iso);
    const day = ymd(d);
    const today = ymd(new Date());
    const tomorrow = ymd(new Date(Date.now() + 86400000));
    const label = day === today ? 'сьогодні' : day === tomorrow ? 'завтра'
        : d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${label} о ${hm(d)}`;
};
const changedText = (iso) => {
    const d = new Date(iso);
    return ymd(d) === ymd(new Date()) ? `о ${hm(d)}` : d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
};

export default function NotebookView() {
    const { employee: me } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const [loading, setLoading] = useState(true);
    const [notes, setNotes] = useState([]);
    const [people, setPeople] = useState([]);
    const [q, setQ] = useState('');
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formKey, setFormKey] = useState(0);   // нова порожня форма після збереження

    const load = useCallback(async () => {
        if (!me?.id) return;
        try {
            const [n, e] = await Promise.all([
                supabase.from('personal_reminders').select('*').eq('is_note', true)
                    .or(`owner_id.eq.${me.id},shared_with.cs.{${me.id}}`)
                    .order('pinned', { ascending: false }).order('updated_at', { ascending: false }),
                supabase.from('employees').select('id, name, hidden_from_list, access_blocked_at').order('name'),
            ]);
            if (n.error) throw n.error;
            setNotes(n.data || []);
            setPeople((e.data || []).filter(p => !p.hidden_from_list && !p.access_blocked_at));
        } catch (err) {
            toast(humanError(err), 'error');
        } finally {
            setLoading(false);
        }
    }, [me?.id, toast]);

    useEffect(() => { load(); }, [load]);

    // Наживо: колега поділився нотаткою, змінив її чи бот уже нагадав
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; }, [load]);
    useEffect(() => {
        let t;
        const ch = supabase.channel('kcore-notebook')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'personal_reminders' }, () => {
                clearTimeout(t); t = setTimeout(() => loadRef.current(), 400);
            })
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, []);

    const nameOf = useCallback((id) => people.find(p => p.id === id)?.name || 'колега', [people]);
    const others = useMemo(() => people.filter(p => p.id !== me?.id), [people, me?.id]);

    const create = async (row) => {
        setSaving(true);
        const { error } = await supabase.from('personal_reminders').insert({ ...row, owner_id: me.id, is_note: true });
        setSaving(false);
        if (error) { toast(humanError(error), 'error'); return false; }
        toast(row.remind_at ? `Нотатку збережено · нагадаю ${whenText(row.remind_at)}` : 'Нотатку збережено', 'success');
        setFormKey(k => k + 1);
        load();
        return true;
    };

    const patch = async (id, p, message) => {
        setNotes(list => list.map(n => (n.id === id ? { ...n, ...p } : n)));
        const { error } = await supabase.from('personal_reminders').update(p).eq('id', id);
        if (error) toast(humanError(error), 'error');
        else if (message) toast(message, 'success');
        load();
    };

    const remove = async (n) => {
        const ok = await confirm({ title: 'Видалити нотатку?', message: 'Повернути її вже не вийде.', confirmLabel: 'Видалити' });
        if (!ok) return;
        setNotes(list => list.filter(x => x.id !== n.id));
        const { error } = await supabase.from('personal_reminders').delete().eq('id', n.id);
        if (error) { toast(humanError(error), 'error'); load(); }
    };

    const shown = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? notes.filter(n => String(n.text || '').toLowerCase().includes(s)) : notes;
    }, [notes, q]);

    if (loading) return <div className={T.card}><Skeleton rows={6} /></div>;

    return (
        <div className="space-y-3">
            <div className={`${T.card} p-3 space-y-2.5`}>
                <div className="flex items-center gap-2">
                    <h2 className="text-[14px] font-bold text-slate-900 inline-flex items-center gap-2">
                        <FaStickyNote size={12} className="text-amber-500" /> Нова нотатка
                    </h2>
                    <Tip text="Нотатки бачите лише ви. Можна показати вибраним людям — вони побачать нотатку з позначкою «від вас» і теж отримають нагадування. Нагадування бот надсилає в Telegram і в дзвіночок у вибраний час." />
                </div>
                <NoteForm key={formKey} people={others} saving={saving} submitLabel="Зберегти" icon={FaPlus}
                    onSave={create} />
            </div>

            {notes.length > 4 && (
                <div className="relative">
                    <FaSearch size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук у нотатках"
                        className={`${T.input} !pl-8`} aria-label="Пошук у нотатках" />
                </div>
            )}

            {notes.length === 0 ? (
                <div className={T.card}><EmptyState icon={FaStickyNote} title="Нотаток ще немає" /></div>
            ) : shown.length === 0 ? (
                <div className={`${T.card} px-4 py-6 text-center text-[13px] text-slate-400`}>Нічого не знайдено</div>
            ) : (
                <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                    {shown.map(n => (
                        <NoteCard key={n.id} n={n} mine={n.owner_id === me?.id} nameOf={nameOf} people={others}
                            editing={editing === n.id} onEdit={() => setEditing(n.id)} onCloseEdit={() => setEditing(null)}
                            onPatch={patch} onRemove={remove} />
                    ))}
                </ul>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Форма нотатки: нова і зміна наявної — та сама
 * ------------------------------------------------------------------- */
function NoteForm({ initial, people, saving, submitLabel, icon, onSave, onCancel }) {
    const isTouch = useIsTouch();
    const at = initial?.remind_at ? new Date(initial.remind_at) : null;
    const [text, setText] = useState(initial?.text || '');
    const [remind, setRemind] = useState(!!at);
    const [date, setDate] = useState(at ? ymd(at) : ymd(new Date()));
    const [time, setTime] = useState(at ? hm(at) : '');
    const [share, setShare] = useState(initial?.shared_with || []);
    const [showShare, setShowShare] = useState(false);
    const [error, setError] = useState('');
    const area = useRef(null);

    useEffect(() => { growArea(area.current); }, []);

    const submit = async (e) => {
        e?.preventDefault();
        const t = text.trim();
        if (!t || saving) return;
        let remindAt = null;
        if (remind) {
            if (!time) { setError('Оберіть, о котрій нагадати'); return; }
            remindAt = toRemindAt(date || ymd(new Date()), time);
            const unchanged = initial?.remind_at && new Date(initial.remind_at).getTime() === new Date(remindAt).getTime();
            if (!unchanged && new Date(remindAt) <= new Date()) { setError('Цей час уже минув — оберіть пізніший'); return; }
        }
        setError('');
        await onSave({ text: t, remind_at: remindAt, plan_date: null, shared_with: share });
    };

    return (
        <form onSubmit={submit} className="space-y-2">
            <textarea ref={area} value={text} rows={3}
                onChange={e => { setText(e.target.value); growArea(e.target); }}
                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isTouch) submit(e); }}
                placeholder="Що записати? Думка, домовленість, номер, посилання…"
                className={`${T.input} h-auto min-h-[84px] max-h-[480px] py-2.5 resize-none text-[14px] leading-relaxed`} />

            <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => { setRemind(r => !r); setError(''); }} aria-pressed={remind}
                    className={`h-8 px-2.5 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${remind ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <FaBell size={11} /> {remind ? 'Нагадати' : 'Без нагадування'}
                </button>
                {remind && (<>
                    <input type="date" value={date} min={ymd(new Date())} onChange={e => setDate(e.target.value)} aria-label="День нагадування"
                        className="h-8 px-2 rounded-lg border border-slate-200 text-[12.5px] text-slate-700 bg-white" />
                    <input type="time" value={time} onChange={e => { setTime(e.target.value); setError(''); }} aria-label="О котрій нагадати"
                        className="h-8 px-2 rounded-lg border border-slate-200 text-[12.5px] text-slate-700 bg-white" />
                </>)}
                <button type="button" onClick={() => setShowShare(v => !v)} aria-expanded={showShare}
                    className={`h-8 px-2.5 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${share.length ? 'bg-sky-50 border-sky-200 text-sky-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {share.length ? <><FaUserFriends size={11} /> Бачать ще: {share.length}</> : <><FaLock size={10} /> Лише я</>}
                </button>
                <span className="flex-1" />
                {onCancel && <Btn size="sm" variant="ghost" icon={FaTimes} onClick={onCancel}>Скасувати</Btn>}
                <Btn type="submit" size="sm" variant="accent" icon={icon || FaCheck} disabled={!text.trim() || saving}>{submitLabel}</Btn>
            </div>
            {error && <p className="text-[12.5px] font-semibold text-rose-700" role="alert">{error}</p>}
            {showShare && <SharePicker people={people} value={share} onChange={setShare} />}
        </form>
    );
}

/* ---------------------------------------------------------------------
 *  Картка нотатки; змінювати — тут же
 * ------------------------------------------------------------------- */
function NoteCard({ n, mine, nameOf, people, editing, onEdit, onCloseEdit, onPatch, onRemove }) {
    const shared = n.shared_with || [];
    const iconBtn = 'w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-50 flex-shrink-0';

    if (editing && mine) {
        return (
            <li className={`${T.card} p-3 border-indigo-200`}>
                <NoteForm initial={n} people={people} submitLabel="Зберегти" onCancel={onCloseEdit}
                    onSave={async (row) => { await onPatch(n.id, row, 'Нотатку змінено'); onCloseEdit(); }} />
            </li>
        );
    }

    return (
        <li className={`${T.card} p-3.5 ${n.pinned ? '!border-amber-300 bg-amber-50/40' : ''}`}>
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 text-[14px] text-slate-800 whitespace-pre-wrap break-words leading-relaxed"><Linkify>{n.text}</Linkify></div>
                {mine && (
                    <span className="flex items-center -mr-1.5 -mt-1">
                        <button type="button" onClick={() => onPatch(n.id, { pinned: !n.pinned }, n.pinned ? 'Відкріплено' : 'Закріплено вгорі')}
                            aria-label={n.pinned ? 'Відкріпити' : 'Закріпити вгорі'} title={n.pinned ? 'Відкріпити' : 'Закріпити вгорі'}
                            className={`${iconBtn} ${n.pinned ? '!text-amber-600' : 'hover:text-amber-600'}`}><FaThumbtack size={11} /></button>
                        <button type="button" onClick={onEdit} aria-label="Змінити" title="Змінити" className={`${iconBtn} hover:text-indigo-600`}><FaPen size={10} /></button>
                        <button type="button" onClick={() => onRemove(n)} aria-label="Видалити" title="Видалити" className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`}><FaTrash size={10} /></button>
                    </span>
                )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px]">
                {n.remind_at && (
                    <Chip tone={n.reminded_at ? 'neutral' : 'warn'} icon={FaBell}>
                        {n.reminded_at ? `нагадано ${whenText(n.remind_at)}` : `нагадаю ${whenText(n.remind_at)}`}
                    </Chip>
                )}
                {!mine ? (
                    <Chip tone="info" icon={FaUserFriends}>від {nameOf(n.owner_id)}</Chip>
                ) : shared.length ? (
                    <Chip tone="info" icon={FaUserFriends}>бачать: {shared.map(nameOf).join(', ')}</Chip>
                ) : (
                    <Chip icon={FaLock}>лише я</Chip>
                )}
                <span className="ml-auto text-slate-400 whitespace-nowrap">{changedText(n.updated_at || n.created_at)}</span>
            </div>
        </li>
    );
}
