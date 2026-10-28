// =====================================================================
//  Дублікати клієнтів.
//
//  Два кошики:
//    · «Телефон» — однакові останні 9 цифр номера. Сильний сигнал, але
//      буває, що на один номер записано кількох людей (агент, родина),
//      тож до злиття заздалегідь позначені лише ті, в кого збігається
//      хоча б одне слово в імені.
//    · «Ім'я» — однакове повне ім'я (два слова й більше) або однакове
//      ім'я в тому самому населеному пункті. Тут нічого не позначено:
//      «Олександр» і «Олександр» — найчастіше різні люди.
//
//  Головним за замовчуванням стає клієнт з найбільшою кількістю
//  об'єктів — на ньому найменше змін. Злиття робить база
//  (merge_clients): об'єкти, склад і Telegram-тема переходять на
//  головного, дубліката видаляє, а його копію зберігає в журналі.
// =====================================================================

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { FaCompressArrowsAlt, FaCheckCircle, FaEyeSlash, FaPhone, FaMapMarkerAlt } from 'react-icons/fa';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import {
    T, Btn, Chip, Modal, Segmented, EmptyState, Skeleton, Tip, useToast, useConfirm, humanError,
} from './ui';

const IGNORE_KEY = 'kcore.clientDuplicates.ignored';
const readIgnored = () => {
    try { return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]')); } catch { return new Set(); }
};
const writeIgnored = (set) => {
    try { localStorage.setItem(IGNORE_KEY, JSON.stringify([...set])); } catch { /* приватне вікно */ }
};

const digits = (p) => String(p || '').replace(/\D/g, '');
const phoneKey = (p) => { const d = digits(p); return d.length >= 9 ? d.slice(-9) : null; };
const normName = (s) => String(s || '').toLowerCase()
    .replace(/['’`ʼ"«»().,]/g, ' ').replace(/\s+/g, ' ').trim();
const nameWords = (s) => normName(s).split(' ').filter(w => w.length >= 3);
const shareWord = (a, b) => { const wa = new Set(nameWords(a)); return nameWords(b).some(w => wa.has(w)); };
const signature = (items) => items.map(i => i.custom_id).sort((a, b) => a - b).join('-');

const TAB_TIPS = {
    phone: 'Однакові останні 9 цифр номера. Буває, що на один номер записано кількох людей, тому заздалегідь позначені лише ті, в кого збігається ім\'я.',
    name: 'Однакове повне ім\'я або однакове ім\'я в тому самому населеному пункті. Нічого не позначено: перевірте, чи це справді та сама людина.',
};

export default function ClientDuplicatesModal({ isOpen, onClose, onChanged }) {
    const { employee } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();

    const [clients, setClients] = useState([]);
    const [objCount, setObjCount] = useState({});
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState('phone');
    const [ignored, setIgnored] = useState(readIgnored);
    const [merged, setMerged] = useState(() => new Set());
    const [choice, setChoice] = useState({});          // groupId → { main, picked }
    const [busyGroup, setBusyGroup] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cl, inst] = await Promise.all([
                supabase.from('clients')
                    .select('id, custom_id, name, company_name, phone, oblast, populated_place, created_at')
                    .order('created_at', { ascending: true }),
                supabase.from('installations').select('client_id'),
            ]);
            if (cl.error) throw cl.error;
            if (inst.error) throw inst.error;
            const counts = {};
            (inst.data || []).forEach(r => { counts[r.client_id] = (counts[r.client_id] || 0) + 1; });
            setClients(cl.data || []);
            setObjCount(counts);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (!isOpen) return;
        setChoice({});
        setMerged(new Set());
        load();
    }, [isOpen, load]);

    const groups = useMemo(() => {
        const live = clients.filter(c => !merged.has(c.custom_id));

        const byPhone = new Map();
        live.forEach(c => {
            const k = phoneKey(c.phone);
            if (!k) return;
            if (!byPhone.has(k)) byPhone.set(k, []);
            byPhone.get(k).push(c);
        });
        const phone = [...byPhone.entries()]
            .filter(([, list]) => list.length > 1)
            .map(([k, list]) => ({ id: `p:${k}`, items: list }));

        // Пари, які вже разом у «Телефоні», в «Імені» не дублюємо
        const phonePairs = new Set();
        phone.forEach(g => g.items.forEach(a => g.items.forEach(b => phonePairs.add(`${a.custom_id}|${b.custom_id}`))));

        const byName = new Map();
        live.forEach(c => {
            const n = normName(c.name);
            if (!n) return;
            const multiWord = n.split(' ').length >= 2;
            const place = normName(c.populated_place);
            if (!multiWord && !place) return;
            const k = multiWord ? n : `${n}@${place}`;
            if (!byName.has(k)) byName.set(k, []);
            byName.get(k).push(c);
        });
        const name = [...byName.entries()]
            .filter(([, list]) => list.length > 1)
            .filter(([, list]) => list.some((a, i) => list.some((b, j) => i !== j && !phonePairs.has(`${a.custom_id}|${b.custom_id}`))))
            .map(([k, list]) => ({ id: `n:${k}`, items: list }));

        const visible = (g) => !ignored.has(signature(g.items));
        const bySize = (a, b) => b.items.length - a.items.length;
        return { phone: phone.filter(visible).sort(bySize), name: name.filter(visible).sort(bySize) };
    }, [clients, merged, ignored]);

    const list = groups[tab];

    /** Головний за замовчуванням: більше об'єктів → є телефон → старший запис */
    const defaultMain = (g) => [...g.items].sort((a, b) =>
        (objCount[b.custom_id] || 0) - (objCount[a.custom_id] || 0)
        || (b.phone ? 1 : 0) - (a.phone ? 1 : 0)
        || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    )[0].custom_id;

    const stateOf = (g) => {
        const saved = choice[g.id];
        const main = saved?.main ?? defaultMain(g);
        const mainItem = g.items.find(i => i.custom_id === main) || g.items[0];
        const others = g.items.filter(i => i.custom_id !== main);
        const picked = saved?.picked
            ?? (tab === 'phone' ? others.filter(i => shareWord(i.name, mainItem.name)).map(i => i.custom_id) : []);
        return { main, mainItem, picked: picked.filter(id => others.some(i => i.custom_id === id)) };
    };

    const setMain = (g, id) => setChoice(c => ({ ...c, [g.id]: { main: id, picked: undefined } }));
    const togglePick = (g, id) => {
        const s = stateOf(g);
        const next = s.picked.includes(id) ? s.picked.filter(x => x !== id) : [...s.picked, id];
        setChoice(c => ({ ...c, [g.id]: { main: s.main, picked: next } }));
    };

    const ignoreGroup = (g) => {
        const next = new Set(ignored);
        next.add(signature(g.items));
        setIgnored(next);
        writeIgnored(next);
    };

    const label = (c) => c.company_name ? `${c.name} (${c.company_name})` : c.name;

    const mergeGroup = async (g) => {
        const { mainItem, picked } = stateOf(g);
        const sources = g.items.filter(i => picked.includes(i.custom_id));
        if (!sources.length) return;

        const ok = await confirm({
            title: `Об'єднати ${sources.length + 1} записи в одного клієнта?`,
            tone: 'accent',
            confirmLabel: 'Об\'єднати',
            message: 'Об\'єкти, складські документи й Telegram-тема переходять на клієнта, який лишається. Інший телефон та інше написання імені допишуться в примітки.',
            details: [
                `Лишається: ${label(mainItem)} · ID ${mainItem.custom_id}`,
                ...sources.map(s => `Вливається: ${label(s)} · ID ${s.custom_id} — об'єктів: ${objCount[s.custom_id] || 0}`),
            ],
        });
        if (!ok) return;

        setBusyGroup(g.id);
        const done = [];
        try {
            for (const s of sources) {
                const { error } = await supabase.rpc('merge_clients', {
                    p_source: s.custom_id, p_target: mainItem.custom_id, p_emp: employee?.id || null,
                });
                if (error) throw error;
                done.push(s.custom_id);
            }
            toast(`Об'єднано: ${done.length}`);
        } catch (e) {
            toast(`${done.length ? `Об'єднано ${done.length}, далі — помилка: ` : ''}${humanError(e)}`, 'error');
        } finally {
            if (done.length) {
                setMerged(prev => new Set([...prev, ...done]));
                setObjCount(prev => {
                    const next = { ...prev };
                    done.forEach(id => { next[mainItem.custom_id] = (next[mainItem.custom_id] || 0) + (next[id] || 0); delete next[id]; });
                    return next;
                });
                onChanged?.();
            }
            setBusyGroup(null);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Дублікати клієнтів"
            subtitle="Один клієнт — одна картка з усіма його об'єктами"
            size="lg"
            toolbar={
                <div className="flex items-center gap-2 flex-wrap">
                    <Segmented
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'phone', label: `Телефон · ${groups.phone.length}` },
                            { value: 'name', label: `Ім'я · ${groups.name.length}` },
                        ]}
                    />
                    <Tip width={320} text={TAB_TIPS[tab]} />
                </div>
            }
        >
            {loading ? (
                <Skeleton rows={6} />
            ) : list.length === 0 ? (
                <EmptyState
                    icon={FaCheckCircle}
                    title={tab === 'phone' ? 'Однакових телефонів немає' : 'Однакових імен немає'}
                />
            ) : (
                <div className="space-y-2.5">
                    {list.map(g => {
                        const { main, picked } = stateOf(g);
                        const busy = busyGroup === g.id;
                        return (
                            <div key={g.id} className={`${T.cardFlat} overflow-hidden`}>
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                                    <Chip tone={tab === 'phone' ? 'warn' : 'neutral'}>{g.items.length} записи</Chip>
                                    <Tip text="Кружечком позначте клієнта, який лишається. Галочкою — тих, хто в нього вливається." />
                                    <Btn size="sm" variant="ghost" icon={FaEyeSlash} className="ml-auto"
                                        onClick={() => ignoreGroup(g)} title="Сховати цю групу на цьому пристрої">
                                        Не дублікати
                                    </Btn>
                                </div>

                                <div className="divide-y divide-slate-100">
                                    {g.items.map(c => {
                                        const isMain = c.custom_id === main;
                                        const objects = objCount[c.custom_id] || 0;
                                        const place = [c.populated_place, c.oblast].filter(Boolean).join(', ');
                                        return (
                                            <div key={c.custom_id}
                                                className={`px-3 py-2.5 flex items-center gap-2.5 ${isMain ? 'bg-emerald-50/50' : ''}`}>
                                                <input type="radio" name={g.id} checked={isMain}
                                                    onChange={() => setMain(g, c.custom_id)}
                                                    title="Лишити цього клієнта"
                                                    className="w-4 h-4 accent-emerald-600 flex-shrink-0 cursor-pointer" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[13px] font-semibold text-slate-900 leading-snug break-words">
                                                        {c.name}
                                                        {c.company_name && <span className="font-normal text-slate-500"> · {c.company_name}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-x-3 gap-y-0.5 mt-0.5 flex-wrap text-[11.5px] text-slate-500">
                                                        <span className={T.mono}>ID {c.custom_id}</span>
                                                        <span className="font-semibold text-slate-700">об'єктів: {objects}</span>
                                                        {c.phone && <span className="inline-flex items-center gap-1"><FaPhone size={9} />{c.phone}</span>}
                                                        {place && <span className="inline-flex items-center gap-1"><FaMapMarkerAlt size={9} />{place}</span>}
                                                        {isMain && <Chip tone="ok">лишається</Chip>}
                                                    </div>
                                                </div>
                                                {!isMain && (
                                                    <label className="flex items-center gap-1 text-[11px] font-bold flex-shrink-0 text-slate-600 cursor-pointer"
                                                        title="Влити в того, хто лишається">
                                                        <input type="checkbox"
                                                            checked={picked.includes(c.custom_id)}
                                                            onChange={() => togglePick(g, c.custom_id)}
                                                            className="w-4 h-4 accent-indigo-600" />
                                                        влити
                                                    </label>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="px-3 py-2 border-t border-slate-200 flex justify-end">
                                    <Btn size="sm" variant="accent" icon={FaCompressArrowsAlt}
                                        disabled={!picked.length || !!busyGroup}
                                        onClick={() => mergeGroup(g)}>
                                        {busy ? 'Об\'єднуємо…' : `Об'єднати ${picked.length || ''}`}
                                    </Btn>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}
