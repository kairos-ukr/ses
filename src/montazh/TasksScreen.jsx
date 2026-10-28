// =====================================================================
//  K-CORE · Монтаж · «Задачі»
//
//  Ті самі мікрозадачі, що в CRM і в Telegram:
//   • «Мені» — доручене мені; галочка = виконано;
//   • «Від мене» — що я доручив офісу, і чи вже зроблено.
//  «Нова задача» — тут же, без окремого вікна: що зробити, кому з офісу,
//  по якому об'єкту, на коли. Бот, як завжди, опублікує її в чаті задач,
//  а людина отримає повідомлення в дзвіночок.
//  Задача на групу «Менеджери» / «Офіс» з'явиться на етапі 3.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaPlus, FaPaperPlane, FaSearch, FaTimes } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { Linkify, useToast, humanError } from '../ui';
import {
    useMontazh, useFresh, isoDay, shiftDay, relDay, TASK_FIELDS, OPEN_TASK, plainText, officePeople, loadObjects, objectTitle,
} from './data';
import { Screen, Card, Label, Pill, Big, Empty, Loading, Check, Segment } from './kit';

export default function TasksScreen() {
    const { who, people, canWrite, refreshBadges } = useMontazh();
    const toast = useToast();
    const [mode, setMode] = useState('mine');
    const [loading, setLoading] = useState(true);
    const [mine, setMine] = useState([]);
    const [fromMe, setFromMe] = useState([]);
    const [creating, setCreating] = useState(false);

    const fresh = useFresh();
    const load = useCallback(async () => {
        if (who?.custom_id == null) return;
        const ok = fresh();
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
        const [a, b, c] = await Promise.all([
            supabase.from('microtasks').select(TASK_FIELDS).eq('assigned_to', who.custom_id).in('status', OPEN_TASK)
                .order('due_date', { ascending: true, nullsFirst: false }),
            supabase.from('microtasks').select(TASK_FIELDS).eq('assigned_to', who.custom_id).eq('status', 'виконано')
                .gte('data_complete', weekAgo).order('data_complete', { ascending: false }).limit(10),
            who.email
                ? supabase.from('microtasks').select(TASK_FIELDS).ilike('creator_email', who.email)
                    .order('created_at', { ascending: false }).limit(30)
                : Promise.resolve({ data: [] }),
        ]);
        if (!ok()) return;
        setMine([...(a.data || []), ...(b.data || [])]);
        setFromMe((c.data || []).filter(t => t.status !== 'скасовано'));
        setLoading(false);
    }, [who?.custom_id, who?.email, fresh]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    const toggle = async (t) => {
        const done = t.status === 'виконано';
        const patch = done ? { status: 'нове', data_complete: null } : { status: 'виконано', data_complete: new Date().toISOString() };
        setMine(list => list.map(x => (x.custom_id === t.custom_id ? { ...x, ...patch } : x)));
        const { error } = await supabase.from('microtasks').update(patch).eq('custom_id', t.custom_id);
        if (error) { toast(humanError(error), 'error'); load(); return; }
        if (!done) toast('Задачу виконано', 'success');
        refreshBadges();
    };

    const openMine = mine.filter(t => OPEN_TASK.includes(t.status));
    const doneMine = mine.filter(t => t.status === 'виконано');
    const list = mode === 'mine' ? openMine : fromMe;

    return (
        <Screen title="Задачі" sub="мої й ті, що я доручив"
            bottom={canWrite && !creating ? <Big tone="main" icon={FaPlus} onClick={() => setCreating(true)}>Нова задача</Big> : null}>
            {creating && <NewTask onClose={() => setCreating(false)} onCreated={() => { setCreating(false); setMode('from'); load(); }} />}

            <Segment value={mode} onChange={setMode} items={[
                { value: 'mine', label: `Мені · ${openMine.length}` },
                { value: 'from', label: `Від мене · ${fromMe.filter(t => OPEN_TASK.includes(t.status)).length}` },
            ]} />

            {loading ? <Loading /> : (<>
                {list.length === 0 ? (
                    <Card><Empty>{mode === 'mine' ? 'Відкритих задач немає' : 'Ви ще нікому не доручали задач'}</Empty></Card>
                ) : list.map(t => (
                    <TaskCard key={t.custom_id} t={t} people={people} mine={mode === 'mine'} canWrite={canWrite} onToggle={() => toggle(t)} />
                ))}

                {mode === 'mine' && doneMine.length > 0 && (<>
                    <div className="px-1 pt-1 text-[12.5px] font-bold uppercase tracking-wide text-slate-500">Виконано за тиждень</div>
                    {doneMine.map(t => (
                        <TaskCard key={t.custom_id} t={t} people={people} mine canWrite={canWrite} onToggle={() => toggle(t)} />
                    ))}
                </>)}
            </>)}

        </Screen>
    );
}

function TaskCard({ t, people, mine, canWrite, onToggle }) {
    const done = t.status === 'виконано';
    const today = isoDay();
    const overdue = !done && t.due_date && t.due_date < today;
    const creator = [...people.values()].find(p => p.email && t.creator_email && p.email.toLowerCase() === t.creator_email.toLowerCase());
    const assignee = t.assigned_to != null ? people.get(t.assigned_to) : null;
    const meta = [
        t.installation?.name,
        mine ? (creator ? `від ${creator.name}` : null) : (assignee ? `кому: ${assignee.name}` : null),
    ].filter(Boolean).join(' · ');

    return (
        <Card className={overdue ? '!border-rose-300' : ''}>
            <div className="flex items-start gap-3">
                {mine ? <Check on={done} label={done ? 'Повернути в роботу' : 'Виконано'} onClick={onToggle} disabled={!canWrite} /> : null}
                <div className="min-w-0 flex-1">
                    <div className={`text-[15.5px] font-semibold break-words whitespace-pre-line ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}><Linkify>{plainText(t.task_text)}</Linkify></div>
                    {meta && <div className="text-[13px] text-slate-500 mt-0.5 break-words">{meta}</div>}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {!mine && <Pill tone={done ? 'ok' : t.status === 'в процесі' ? 'warn' : 'neutral'}>{done ? 'зроблено' : t.status === 'в процесі' ? 'в роботі' : 'нова'}</Pill>}
                        {t.due_date && !done && <Pill tone={overdue ? 'bad' : 'neutral'}>до {relDay(t.due_date).toLowerCase()}</Pill>}
                        {done && t.data_complete && <span className="text-[12.5px] text-slate-400">виконано {relDay(isoDay(new Date(t.data_complete))).toLowerCase()}</span>}
                    </div>
                </div>
            </div>
        </Card>
    );
}

const DUE = [
    { value: 'today', label: 'Сьогодні' },
    { value: 'tomorrow', label: 'Завтра' },
    { value: 'none', label: 'Без строку' },
];

/* Нова задача — картка вгорі списку */
function NewTask({ onClose, onCreated }) {
    const { who, people } = useMontazh();
    const toast = useToast();
    const [text, setText] = useState('');
    const [to, setTo] = useState(null);
    const [q, setQ] = useState('');
    const [objId, setObjId] = useState('');
    const [due, setDue] = useState('none');
    const [myObjects, setMyObjects] = useState([]);
    const [busy, setBusy] = useState(false);

    // Об'єкти, де я в графіку зараз або нещодавно
    useEffect(() => {
        (async () => {
            const t = isoDay();
            const { data } = await supabase.from('installation_workers').select('installation_custom_id, work_date')
                .eq('employee_custom_id', who.custom_id).gte('work_date', shiftDay(t, -30)).lte('work_date', shiftDay(t, 14))
                .not('installation_custom_id', 'is', null);
            const map = await loadObjects((data || []).map(r => r.installation_custom_id));
            setMyObjects([...map.values()]);
        })();
    }, [who.custom_id]);

    const office = useMemo(() => officePeople(people), [people]);
    const found = useMemo(() => {
        const s = q.trim().toLowerCase();
        return s ? office.filter(p => p.name.toLowerCase().includes(s)) : office;
    }, [q, office]);

    const send = async () => {
        if (!text.trim() || !to) return;
        setBusy(true);
        const obj = myObjects.find(o => String(o.custom_id) === String(objId));
        const today = isoDay();
        const { error } = await supabase.from('microtasks').insert({
            task_text: text.trim(),
            status: 'нове',
            assigned_to: to.custom_id,
            installation_id: obj?.id || null,
            due_date: due === 'today' ? today : due === 'tomorrow' ? shiftDay(today, 1) : null,
            creator_email: who.email || null,
        });
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`Задачу надіслано: ${to.name}`, 'success');
        onCreated();
    };

    return (
        <Card hero>
            <div className="flex items-center justify-between mb-2">
                <span className="text-[17px] font-bold">Нова задача</span>
                <button type="button" onClick={onClose} aria-label="Закрити" className="w-11 h-11 -m-2 flex items-center justify-center text-slate-500"><FaTimes size={15} /></button>
            </div>

            <Label>Що треба зробити</Label>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} autoFocus
                placeholder="Наприклад: сусід клієнта хоче КП на 10 кВт, тел. …"
                className="w-full rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 py-2.5 text-[15px] resize-y" />

            <div className="mt-3"><Label>Кому</Label></div>
            {to ? (
                <div className="flex items-center gap-2 rounded-xl border-2 border-slate-900 px-3 h-12">
                    <span className="flex-1 min-w-0 font-bold text-[15px] truncate">{to.name}</span>
                    <button type="button" onClick={() => setTo(null)} className="text-[13.5px] font-semibold text-slate-500 h-11 px-1">змінити</button>
                </div>
            ) : (
                <div className="rounded-xl border-2 border-slate-300">
                    <label className="flex items-center gap-2 px-3 h-11 border-b border-slate-200">
                        <FaSearch size={12} className="text-slate-400" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук людини" className="flex-1 min-w-0 outline-none text-[15px] bg-transparent" />
                    </label>
                    <div className="max-h-[220px] overflow-y-auto">
                        {found.map(p => (
                            <button key={p.custom_id} type="button" onClick={() => setTo(p)}
                                className="w-full text-left px-3 min-h-[44px] py-2 border-t border-slate-100 first:border-t-0 text-[15px]">
                                {p.name}{p.position ? <span className="text-slate-400 text-[13px]"> · {p.position}</span> : null}
                            </button>
                        ))}
                        {found.length === 0 && <Empty>Нікого не знайдено</Empty>}
                    </div>
                </div>
            )}

            {myObjects.length > 0 && (<>
                <div className="mt-3"><Label>Об'єкт</Label></div>
                <select value={objId} onChange={e => setObjId(e.target.value)}
                    className="w-full h-12 rounded-xl border-2 border-slate-300 bg-white px-3 text-[15px]">
                    <option value="">Без об'єкта</option>
                    {myObjects.map(o => <option key={o.custom_id} value={o.custom_id}>{objectTitle(o)}</option>)}
                </select>
            </>)}

            <div className="mt-3"><Label>Коли</Label></div>
            <Segment value={due} onChange={setDue} items={DUE} />

            <Big tone="main" className="mt-3" icon={FaPaperPlane} onClick={send} disabled={busy || !text.trim() || !to}>
                {busy ? 'Надсилаю…' : 'Надіслати'}
            </Big>
        </Card>
    );
}
