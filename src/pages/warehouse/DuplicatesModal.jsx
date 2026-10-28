// =====================================================================
//  Дублікати номенклатури.
//
//  Два кошики:
//    · «Однакові» — назви, що після нормалізації збігаються дослівно
//      («ПВ3 6мм» і «ПВ-3 6 мм»). Майже завжди це одна позиція, тому
//      всі, крім головної, одразу позначені до обʼєднання.
//    · «Схожі» — ті самі числа й майже ті самі слова. Тут вирішує
//      людина: нічого не позначено заздалегідь, а пару, яка дублем не
//      є, можна прибрати зі списку.
//
//  Головною за замовчуванням стає позиція з найбільшим залишком —
//  вона вже «жива» на складі, і на ній найменше змін.
// =====================================================================

import React, { useState, useMemo, useEffect } from 'react';
import { FaCompressArrowsAlt, FaCheckCircle, FaEyeSlash } from 'react-icons/fa';
import { useAuth } from '../../AuthProvider';
import { nameFingerprint, fingerprintSimilarity } from '../../utils/nameMatching';
import { mergeNomenclature, mergeBlocker } from '../../utils/nomenclatureOps';
import {
    T, Btn, Chip, Modal, Segmented, EmptyState, Tip, useToast, useConfirm, humanError, num,
} from '../../ui';

/** Від якої схожості пара потрапляє в «Схожі» */
const SIMILAR = 0.7;

const IGNORE_KEY = 'kcore.duplicates.ignored';
const readIgnored = () => {
    try { return new Set(JSON.parse(localStorage.getItem(IGNORE_KEY) || '[]')); } catch { return new Set(); }
};
const writeIgnored = (set) => {
    try { localStorage.setItem(IGNORE_KEY, JSON.stringify([...set])); } catch { /* приватне вікно */ }
};
const groupSignature = (items) => items.map(i => i.id).sort((a, b) => a - b).join('-');

/** Коротко на чипі; повне пояснення — у підказці */
const blockerLabel = (source, target) => {
    if (source.type !== target.type) return 'інший тип';
    if (String(source.unit_id ?? '') !== String(target.unit_id ?? '')) return 'інша одиниця';
    return 'інший облік';
};

export default function DuplicatesModal({ isOpen, onClose, items = [], totalsOf, onChanged }) {
    const { employee } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();

    const [tab, setTab] = useState('exact');
    const [ignored, setIgnored] = useState(readIgnored);
    const [merged, setMerged] = useState(() => new Set());   // уже влиті — ховаємо одразу
    const [choice, setChoice] = useState({});                // groupId → { main, picked: [] }
    const [busyGroup, setBusyGroup] = useState(null);

    useEffect(() => { if (isOpen) setChoice({}); }, [isOpen]);

    const onHandOf = (id) => totalsOf?.(id)?.onHand || 0;

    const groups = useMemo(() => {
        if (!isOpen) return { exact: [], similar: [] };

        const live = items
            .filter(i => !merged.has(i.id))
            .map(i => ({ ...i, fp: nameFingerprint(`${i.name} ${i.technical_characteristics || ''}`) }));

        // Однакові: той самий ключ у межах типу
        const byKey = new Map();
        live.forEach(i => {
            if (!i.fp.key) return;
            const k = `${i.type}|${i.fp.key}`;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(i);
        });
        const exact = [...byKey.entries()]
            .filter(([, list]) => list.length > 1)
            .map(([k, list]) => ({ id: `e:${k}`, items: list }));

        // Схожі: зʼєднуємо пари в групи в межах типу й кореневої категорії.
        // Порівнювати панель із кабелем немає сенсу, а так пар у рази менше.
        const inExact = new Set(exact.flatMap(g => g.items.map(i => i.id)));
        const buckets = new Map();
        live.forEach(i => {
            if (inExact.has(i.id) || !i.fp.key) return;
            const b = `${i.type}|${i.rootCategoryId ?? ''}`;
            if (!buckets.has(b)) buckets.set(b, []);
            buckets.get(b).push(i);
        });

        const parent = new Map();
        const find = (x) => {
            while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
            return x;
        };
        const byId = new Map();
        buckets.forEach(list => {
            list.forEach(i => { parent.set(i.id, i.id); byId.set(i.id, i); });
            for (let a = 0; a < list.length; a++) {
                for (let b = a + 1; b < list.length; b++) {
                    if (fingerprintSimilarity(list[a].fp, list[b].fp) >= SIMILAR) {
                        parent.set(find(list[a].id), find(list[b].id));
                    }
                }
            }
        });
        const clusters = new Map();
        parent.forEach((_, id) => {
            const root = find(id);
            if (!clusters.has(root)) clusters.set(root, []);
            clusters.get(root).push(byId.get(id));
        });
        const similar = [...clusters.values()]
            .filter(list => list.length > 1)
            .map(list => ({ id: `s:${groupSignature(list)}`, items: list }))
            .filter(g => !ignored.has(groupSignature(g.items)));

        const bySize = (a, b) => b.items.length - a.items.length;
        return { exact: exact.sort(bySize), similar: similar.sort(bySize) };
    }, [isOpen, items, merged, ignored]);

    const list = groups[tab];

    /** Головна за замовчуванням: більший залишок → є SKU → старша */
    const defaultMain = (g) => [...g.items].sort((a, b) =>
        onHandOf(b.id) - onHandOf(a.id)
        || (b.sku ? 1 : 0) - (a.sku ? 1 : 0)
        || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    )[0].id;

    const stateOf = (g) => {
        const saved = choice[g.id];
        const main = saved?.main ?? defaultMain(g);
        const mainItem = g.items.find(i => i.id === main) || g.items[0];
        const mergeable = g.items.filter(i => i.id !== main && !mergeBlocker(i, mainItem));
        const picked = saved?.picked ?? (tab === 'exact' ? mergeable.map(i => i.id) : []);
        return { main, mainItem, picked: picked.filter(id => mergeable.some(i => i.id === id)) };
    };

    const setMain = (g, id) => setChoice(c => ({ ...c, [g.id]: { main: id, picked: undefined } }));
    const togglePick = (g, id) => {
        const s = stateOf(g);
        const next = s.picked.includes(id) ? s.picked.filter(x => x !== id) : [...s.picked, id];
        setChoice(c => ({ ...c, [g.id]: { main: s.main, picked: next } }));
    };

    const ignoreGroup = (g) => {
        const next = new Set(ignored);
        next.add(groupSignature(g.items));
        setIgnored(next);
        writeIgnored(next);
    };

    const mergeGroup = async (g) => {
        const { mainItem, picked } = stateOf(g);
        const sources = g.items.filter(i => picked.includes(i.id));
        if (!sources.length) return;

        const ok = await confirm({
            title: `Обʼєднати ${sources.length + 1} позиції в одну?`,
            tone: 'accent',
            confirmLabel: 'Обʼєднати',
            message: 'Залишки, рухи, резерви, замовлення й специфікації переходять на головну позицію. Решта йде в архів.',
            details: [
                `Лишається: ${mainItem.fullName}${mainItem.sku ? ` (${mainItem.sku})` : ''}`,
                ...sources.map(s => `Вливається: ${s.fullName}${s.sku ? ` (${s.sku})` : ''} — ${num(onHandOf(s.id))} ${s.unit?.name || 'шт'}`),
            ],
        });
        if (!ok) return;

        setBusyGroup(g.id);
        const done = [];
        try {
            for (const s of sources) {
                await mergeNomenclature(s.id, mainItem.id, employee?.id);
                done.push(s.id);
            }
            toast(`Обʼєднано: ${done.length}`);
        } catch (e) {
            toast(`${done.length ? `Обʼєднано ${done.length}, далі — помилка: ` : ''}${humanError(e)}`, 'error');
        } finally {
            if (done.length) {
                setMerged(prev => new Set([...prev, ...done]));
                onChanged?.();
            }
            setBusyGroup(null);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Дублікати номенклатури"
            subtitle="Один товар — одна позиція: залишок не розпорошується по кількох рядках"
            size="lg"
            toolbar={
                <div className="flex items-center gap-2 flex-wrap">
                    <Segmented
                        value={tab}
                        onChange={setTab}
                        options={[
                            { value: 'exact', label: `Однакові · ${groups.exact.length}` },
                            { value: 'similar', label: `Схожі · ${groups.similar.length}` },
                        ]}
                    />
                    <Tip text={tab === 'exact'
                        ? 'Назви збігаються після нормалізації — майже напевно те саме.'
                        : 'Ті самі числа й майже ті самі слова. Перевірте перед обʼєднанням.'} />
                </div>
            }
        >
            {list.length === 0 ? (
                <EmptyState
                    icon={FaCheckCircle}
                    title={tab === 'exact' ? 'Однакових позицій немає' : 'Схожих позицій не знайдено'}
                    hint={tab === 'exact' && groups.similar.length
                        ? 'Загляньте в «Схожі» — там можуть бути дублі з різним написанням.'
                        : 'Довідник чистий.'}
                />
            ) : (
                <div className="space-y-2.5">
                    {list.map(g => {
                        const { main, mainItem, picked } = stateOf(g);
                        const busy = busyGroup === g.id;
                        return (
                            <div key={g.id} className={`${T.cardFlat} overflow-hidden`}>
                                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                                    <Chip tone={tab === 'exact' ? 'danger' : 'warn'}>{g.items.length} позиції</Chip>
                                    <Tip text="Кружечком позначте позицію, яка лишається. Галочкою — ті, що в неї вливаються разом з історією." />
                                    {tab === 'similar' && (
                                        <Btn size="sm" variant="ghost" icon={FaEyeSlash} className="ml-auto"
                                            onClick={() => ignoreGroup(g)} title="Сховати цю групу на цьому пристрої">
                                            Не дублікати
                                        </Btn>
                                    )}
                                </div>

                                <div className="divide-y divide-slate-100">
                                    {g.items.map(i => {
                                        const isMain = i.id === main;
                                        const blocker = isMain ? null : mergeBlocker(i, mainItem);
                                        return (
                                            <div key={i.id}
                                                className={`px-3 py-2 flex items-center gap-2.5 ${isMain ? 'bg-emerald-50/50' : ''}`}>
                                                <input type="radio" name={g.id} checked={isMain}
                                                    onChange={() => setMain(g, i.id)}
                                                    title="Лишити цю позицію"
                                                    className="w-4 h-4 accent-emerald-600 flex-shrink-0 cursor-pointer" />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[12.5px] font-semibold text-slate-900 leading-snug break-words">
                                                        {i.fullName}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                        {i.sku && <span className={T.mono}>{i.sku}</span>}
                                                        <span className="text-[10.5px] text-slate-400">{i.unit?.name || 'шт'}</span>
                                                        {isMain && <Chip tone="ok">лишається</Chip>}
                                                        {blocker && <Chip tone="danger">{blockerLabel(i, mainItem)}</Chip>}
                                                    </div>
                                                </div>
                                                <span className="text-[13px] font-black tabular-nums text-slate-900 flex-shrink-0">
                                                    {num(onHandOf(i.id))}
                                                    <span className="text-[9px] text-slate-400 ml-0.5">{i.unit?.name || 'шт'}</span>
                                                </span>
                                                {!isMain && (
                                                    <label className={`flex items-center gap-1 text-[11px] font-bold flex-shrink-0
                                                        ${blocker ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 cursor-pointer'}`}
                                                        title={blocker || 'Влити в головну'}>
                                                        <input type="checkbox" disabled={!!blocker}
                                                            checked={picked.includes(i.id)}
                                                            onChange={() => togglePick(g, i.id)}
                                                            className="w-4 h-4 accent-indigo-600" />
                                                        влити
                                                    </label>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="px-3 py-2 border-t border-slate-200 flex items-center justify-end">
                                    <Btn size="sm" variant="accent" icon={FaCompressArrowsAlt}
                                        disabled={!picked.length || !!busyGroup}
                                        onClick={() => mergeGroup(g)}>
                                        {busy ? 'Обʼєднуємо…' : `Обʼєднати ${picked.length || ''}`}
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
