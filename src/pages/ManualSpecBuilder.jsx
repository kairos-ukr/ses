// =====================================================================
//  Комплектація вручну — план матеріалів на об'єкт.
//
//  Це саме ПЛАН: скільки чого потрібно. Факт (резерв і видача) живе
//  поруч довідково, і саме він не дає випадково зменшити план нижче
//  того, що вже фізично поїхало на об'єкт.
//
//  Збереження створює НОВУ версію специфікації, а попередню архівує.
//  Раніше це відбувалось мовчки; тепер перед збереженням видно, що
//  саме зміниться, і скільки буде версія.
// =====================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    FaPlus, FaTrash, FaClipboardList, FaLayerGroup, FaSearch,
    FaExclamationTriangle, FaMinus, FaBoxOpen, FaExchangeAlt, FaTimes,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { NomenclatureModal } from './NomenclatureModal';
import {
    T, TONE, Btn, IconBtn, Chip, Picker, Modal, EmptyState,
    Skeleton, useToast, useConfirm, humanError, num,
} from '../ui';

const newKey = () => Math.random().toString(36).slice(2, 10);

export default function ManualSpecBuilder({
    isOpen, onClose, onSuccess, installationId, taskId = null, title,
}) {
    const { employee } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();

    const [nomenclatures, setNomenclatures] = useState([]);
    const [cats, setCats] = useState([]);
    const [rows, setRows] = useState([]);              // { key, nomenclature_id, quantity }
    const [baseline, setBaseline] = useState(new Map()); // що було в чинній версії
    const [fact, setFact] = useState({});              // nomId → { reserved, issued }
    const [version, setVersion] = useState(1);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [search, setSearch] = useState('');
    const [quickAdd, setQuickAdd] = useState(null);    // { name }
    const [base, setBase] = useState(null);            // чинна специфікація, яку правимо
    const [replacingKey, setReplacingKey] = useState(null); // рядок, який зараз замінюємо — інлайн, без другої модалки

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const loadData = useCallback(async () => {
        setLoading(true);
        setReplacingKey(null);
        try {
            const [nomRes, catRes, needsRes, verRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('v_object_material_needs')
                    .select('nomenclature_id, reserved_quantity, issued_quantity')
                    .eq('installation_custom_id', installationId),
                supabase.from('specifications').select('version').eq('installation_custom_id', installationId),
            ]);

            const catList = catRes.data || [];
            setCats(catList);
            const catById = new Map(catList.map(c => [c.id, c]));

            setNomenclatures((nomRes.data || []).map(item => {
                const path = [];
                let rootName = '', id = item.category_id, guard = 0;
                while (id && guard++ < 20) {
                    const c = catById.get(id);
                    if (!c) break;
                    path.unshift(c.name);
                    rootName = c.name;
                    id = c.parent_id;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim(), rootCategoryName: rootName || 'Інше' };
            }).sort((a, b) => a.fullName.localeCompare(b.fullName, 'uk')));

            const f = {};
            (needsRes.data || []).forEach(n => {
                const cur = f[n.nomenclature_id] || { reserved: 0, issued: 0 };
                cur.reserved += parseFloat(n.reserved_quantity) || 0;
                cur.issued += parseFloat(n.issued_quantity) || 0;
                f[n.nomenclature_id] = cur;
            });
            setFact(f);

            const versions = (verRes.data || []).map(v => v.version);
            setVersion(versions.length ? Math.max(...versions) + 1 : 1);

            // Чинні специфікації об'єкта. Спершу шукаємо потрібного типу,
            // але якщо такої немає — беремо будь-яку, а не відкриваємось
            // порожніми. Інакше людина додає одну позицію й ненавмисно
            // замінює нею всю комплектацію.
            const { data: specs } = await supabase.from('specifications')
                .select('id, version, name, notes, items:specification_items(id, nomenclature_id, quantity)')
                .eq('installation_custom_id', installationId)
                .eq('status', 'confirmed')
                .order('version', { ascending: false });

            const list = specs || [];
            const exact = taskId ? list.find(s => s.notes === taskId) : null;
            const spec = exact || list[0] || null;

            setBase(spec ? {
                id: spec.id,
                version: spec.version,
                name: spec.name,
                notes: spec.notes,
                // Редагуємо специфікацію іншого типу — про це треба сказати вголос
                otherType: !!taskId && spec.notes !== taskId,
                itemIdByNom: new Map((spec.items || []).map(it => [it.nomenclature_id, it.id])),
            } : null);

            const items = spec?.items || [];
            setRows(items.map(it => ({
                key: newKey(), nomenclature_id: it.nomenclature_id, quantity: String(it.quantity),
            })));
            setBaseline(new Map(items.map(it => [it.nomenclature_id, parseFloat(it.quantity)])));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
    }, [installationId, taskId, toast]);

    useEffect(() => { if (isOpen && installationId) loadData(); }, [isOpen, installationId, loadData]);

    /* ---------------- РЯДКИ ---------------- */

    const nomById = useCallback(
        (id) => nomenclatures.find(n => n.id === id), [nomenclatures]
    );

    const addRow = (nomId) => {
        if (!nomId) return;
        setRows(r => r.some(x => x.nomenclature_id === nomId)
            ? r
            : [...r, { key: newKey(), nomenclature_id: nomId, quantity: '1' }]);
        setSearch('');
    };

    const removeRow = (key) => setRows(r => r.filter(x => x.key !== key));
    const setQty = (key, q) => setRows(r => r.map(x => x.key === key ? { ...x, quantity: q } : x));
    const bump = (key, d) => setRows(r => r.map(x => {
        if (x.key !== key) return x;
        const cur = parseFloat(x.quantity) || 0;
        return { ...x, quantity: String(Math.max(0, Math.round((cur + d) * 100) / 100)) };
    }));

    const addedIds = useMemo(() => new Set(rows.map(r => r.nomenclature_id)), [rows]);

    const addOptions = useMemo(() => nomenclatures
        .filter(n => !addedIds.has(n.id))
        .map(n => ({ id: n.id, label: `${n.fullName}${n.sku ? ` · ${n.sku}` : ''}` })),
        [nomenclatures, addedIds]);

    /* Пошук усередині вже доданих — коли позицій за сотню */
    const visibleRows = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return rows;
        return rows.filter(r => {
            const n = nomById(r.nomenclature_id);
            return (n?.fullName || '').toLowerCase().includes(term)
                || (n?.sku || '').toLowerCase().includes(term);
        });
    }, [rows, search, nomById]);

    const grouped = useMemo(() => {
        const map = new Map();
        visibleRows.forEach(row => {
            const g = nomById(row.nomenclature_id)?.rootCategoryName || 'Інше';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(row);
        });
        return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'uk'));
    }, [visibleRows, nomById]);

    /* ---------------- ЩО ЗМІНИТЬСЯ ---------------- */

    const diff = useMemo(() => {
        const added = [], changed = [], removed = [];
        const current = new Map();
        rows.forEach(r => {
            const q = parseFloat(r.quantity);
            if (r.nomenclature_id && q > 0) current.set(r.nomenclature_id, q);
        });

        current.forEach((q, id) => {
            if (!baseline.has(id)) added.push(id);
            else if (Math.abs(baseline.get(id) - q) > 0.0001) changed.push(id);
        });
        baseline.forEach((_, id) => { if (!current.has(id)) removed.push(id); });

        return { added, changed, removed, total: current.size, dirty: added.length + changed.length + removed.length };
    }, [rows, baseline]);

    /* Позиції, де план опустили нижче вже виданого — це заборонено по суті */
    const conflicts = useMemo(() => rows.filter(r => {
        const issued = fact[r.nomenclature_id]?.issued || 0;
        const plan = parseFloat(r.quantity) || 0;
        return issued > 0 && plan < issued;
    }), [rows, fact]);

    /* ---------------- ЗБЕРЕЖЕННЯ ----------------
       Два різні наміри, які раніше були одним:

       «Оновити чинну»  — правки лягають у ту саму специфікацію.
                          Додав одну позицію — додалась одна позиція.
       «Нова версія»    — чинна архівується, створюється наступна
                          з поточним списком. Для перегляду плану.
    */

    const validate = () => {
        const clean = rows.filter(r => r.nomenclature_id && parseFloat(r.quantity) > 0);
        if (!clean.length) { toast('Додайте хоча б одну позицію з кількістю', 'warning'); return null; }

        if (conflicts.length) {
            const first = nomById(conflicts[0].nomenclature_id);
            toast(`«${first?.fullName || 'Позиція'}»: план менший за вже видане. Спершу проведіть повернення.`, 'error');
            return null;
        }
        return clean;
    };

    const changeSummary = (clean) => [
        `Позицій у плані: ${clean.length}`,
        ...(diff.added.length ? [`Додається: ${diff.added.length}`] : []),
        ...(diff.changed.length ? [`Змінюється кількість: ${diff.changed.length}`] : []),
        ...(diff.removed.length ? [`Прибирається: ${diff.removed.length}`] : []),
    ];

    /** Правки в чинну специфікацію, без нової версії */
    const updateCurrent = async () => {
        const clean = validate();
        if (!clean) return;
        if (!base) return toast('Чинної специфікації немає — збережіть як нову', 'warning');
        if (!diff.dirty) return toast('Немає що зберігати — список не змінювався', 'info');

        const ok = await confirm({
            title: 'Оновити чинну специфікацію?',
            tone: 'accent', confirmLabel: `Оновити V.${base.version}`,
            message: base.name || title || 'Специфікація',
            details: [...changeSummary(clean), 'Версія не змінюється, історія не створюється.'],
        });
        if (!ok) return;

        setSaving(true);
        try {
            const current = new Map(clean.map(r => [r.nomenclature_id, parseFloat(r.quantity)]));

            // Прибрані
            const removedIds = [...base.itemIdByNom.entries()]
                .filter(([nomId]) => !current.has(nomId))
                .map(([, itemId]) => itemId);
            if (removedIds.length) {
                const { error } = await supabase.from('specification_items').delete().in('id', removedIds);
                if (error) throw error;
            }

            // Змінені
            for (const nomId of diff.changed) {
                const itemId = base.itemIdByNom.get(nomId);
                if (!itemId) continue;
                const { error } = await supabase.from('specification_items')
                    .update({ quantity: current.get(nomId), updated_at: new Date().toISOString() })
                    .eq('id', itemId);
                if (error) throw error;
            }

            // Нові
            const fresh = clean.filter(r => !base.itemIdByNom.has(r.nomenclature_id));
            if (fresh.length) {
                const { error } = await supabase.from('specification_items').insert(
                    fresh.map(r => ({
                        specification_id: base.id,
                        nomenclature_id: r.nomenclature_id,
                        quantity: parseFloat(r.quantity),
                        created_by: employee?.id,
                    }))
                );
                if (error) throw error;
            }

            toast(`Специфікацію оновлено · ${clean.length} позицій`);
            onSuccess?.();
            onClose();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setSaving(false); }
    };

    /** Нова версія: чинна архівується */
    const saveAsVersion = async () => {
        const clean = validate();
        if (!clean) return;

        const ok = await confirm({
            title: base ? 'Створити нову версію?' : 'Створити специфікацію?',
            tone: 'accent', confirmLabel: `Зберегти V.${version}`,
            message: title || 'Специфікація',
            details: [
                ...changeSummary(clean),
                base
                    ? `Чинна V.${base.version} стане архівною, нова буде V.${version}.`
                    : `Це буде перша версія об'єкта.`,
            ],
        });
        if (!ok) return;

        setSaving(true);
        try {
            // Версія наскрізна по ВСІХ специфікаціях об'єкта: у БД унікальність
            // по (installation, version) без урахування типу
            const { data: all } = await supabase.from('specifications')
                .select('version').eq('installation_custom_id', installationId);
            const next = all?.length ? Math.max(...all.map(s => s.version)) + 1 : 1;

            // Архівуємо саме ту специфікацію, яку правили
            if (base) {
                const { error } = await supabase.from('specifications')
                    .update({ status: 'archived' }).eq('id', base.id);
                if (error) throw error;
            }

            const { data: spec, error: hErr } = await supabase.from('specifications').insert([{
                installation_custom_id: installationId,
                version: next,
                status: 'confirmed',
                name: `${title || 'Специфікація'} V.${next} (вручну)`,
                notes: base?.notes ?? taskId,
                confirmed_at: new Date().toISOString(),
                created_by: employee?.id,
            }]).select().single();
            if (hErr) throw hErr;

            const { error: iErr } = await supabase.from('specification_items').insert(
                clean.map(r => ({
                    specification_id: spec.id,
                    nomenclature_id: r.nomenclature_id,
                    quantity: parseFloat(r.quantity),
                    created_by: employee?.id,
                }))
            );
            if (iErr) throw iErr;

            toast(`Збережено як версію ${next} · ${clean.length} позицій`);
            onSuccess?.();
            onClose();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setSaving(false); }
    };

    /* Нову позицію з довідника одразу кладемо в список */
    const onNomCreated = (saved) => {
        if (!saved) return;
        const catById = new Map(cats.map(c => [c.id, c]));
        const path = [];
        let rootName = '', id = saved.category_id, guard = 0;
        while (id && guard++ < 20) {
            const c = catById.get(id);
            if (!c) break;
            path.unshift(c.name);
            rootName = c.name;
            id = c.parent_id;
        }
        const processed = {
            ...saved,
            fullName: `${path.join(' ')} ${saved.name}`.trim(),
            rootCategoryName: rootName || 'Інше',
        };
        setNomenclatures(prev => [...prev.filter(n => n.id !== processed.id), processed]);
        addRow(processed.id);
        setQuickAdd(null);
    };

    /* ---------------- РЕНДЕР ---------------- */

    const rowState = (row) => {
        const id = row.nomenclature_id;
        const q = parseFloat(row.quantity) || 0;
        if (!baseline.has(id)) return { key: 'new', label: 'нова', tone: 'ok' };
        if (Math.abs(baseline.get(id) - q) > 0.0001) {
            return { key: 'changed', label: `було ${num(baseline.get(id))}`, tone: 'warn' };
        }
        return null;
    };

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={title || 'Комплектація вручну'}
                subtitle={`Об'єкт #${installationId} · план матеріалів`}
                size="lg"
                onSubmit={base ? updateCurrent : saveAsVersion}
                submitHint={base ? 'оновити чинну' : 'створити специфікацію'}
                toolbar={
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Picker
                                className="flex-1"
                                options={addOptions}
                                value=""
                                onChange={addRow}
                                onAddNew={(name) => setQuickAdd({ name })}
                                addLabel="Створити позицію"
                                placeholder="Додати позицію з довідника…"
                                icon={FaPlus}
                                searchPlaceholder="Назва або SKU…"
                                keepOpen
                            />
                        </div>

                        {rows.length > 6 && (
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                                <input className={`${T.input} pl-8 h-9`} value={search}
                                    placeholder="Знайти серед доданих…"
                                    onChange={e => setSearch(e.target.value)} />
                            </div>
                        )}

                        {/* Що саме ми зараз правимо — щоб не вийшло,
                            що одна додана позиція замінила всю комплектацію */}
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                            {loading ? null : base ? (
                                <span className="text-slate-500">
                                    Правимо <b className="text-slate-900">{base.name || `V.${base.version}`}</b>
                                    {' · '}<b className="text-slate-900 tabular-nums">{diff.total}</b> позицій
                                </span>
                            ) : (
                                <Chip tone="warn">чинної специфікації немає — буде перша</Chip>
                            )}
                            {diff.added.length > 0 && <Chip tone="ok">+{diff.added.length}</Chip>}
                            {diff.changed.length > 0 && <Chip tone="warn">{diff.changed.length} змінено</Chip>}
                            {diff.removed.length > 0 && <Chip tone="danger">−{diff.removed.length}</Chip>}
                            {diff.dirty === 0 && !loading && <span className="text-slate-400">без змін</span>}
                        </div>

                        {base?.otherType && (
                            <div className={`${TONE.warn.chip} border rounded-lg px-2.5 py-1.5 text-[11px] leading-snug`}>
                                Специфікації типу «{title}» немає. Відкрито чинну «{base.name || `V.${base.version}`}» —
                                правки підуть саме в неї.
                            </div>
                        )}
                    </div>
                }
                footer={<>
                    {conflicts.length > 0 && (
                        <span className="mr-auto text-[11.5px] font-bold text-rose-700">
                            {conflicts.length} поз. нижче виданого
                        </span>
                    )}
                    <Btn variant="outline" onClick={onClose}>Скасувати</Btn>
                    <Btn variant="soft" onClick={saveAsVersion} disabled={saving || loading || diff.total === 0}
                        title="Чинна стане архівною, створиться наступна версія">
                        {base ? `Нова версія V.${version}` : `Створити V.${version}`}
                    </Btn>
                    {base && (
                        <Btn variant="ok" onClick={updateCurrent} disabled={saving || loading || !diff.dirty}
                            title="Правки лягають у чинну специфікацію, версія не змінюється">
                            {saving ? 'Зберігаємо…' : 'Оновити чинну'}
                        </Btn>
                    )}
                </>}
            >
                {loading ? <Skeleton rows={6} /> : rows.length === 0 ? (
                    <EmptyState
                        icon={FaBoxOpen}
                        title="План порожній"
                        hint="Додайте позиції з довідника вгорі — почніть вводити назву або SKU."
                    />
                ) : visibleRows.length === 0 ? (
                    <EmptyState icon={FaSearch} title="Нічого не знайдено"
                        hint={`Серед доданих позицій немає «${search}».`}>
                        <Btn variant="soft" onClick={() => setSearch('')}>Скинути пошук</Btn>
                    </EmptyState>
                ) : (
                    <div className="space-y-3">
                        {grouped.map(([groupName, groupRows]) => (
                            <div key={groupName}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <FaLayerGroup className="text-slate-400" size={10} />
                                    <span className={T.label}>{groupName}</span>
                                    <span className="text-[10px] font-bold text-slate-400">{groupRows.length}</span>
                                    <span className="flex-1 h-px bg-slate-200 ml-1" />
                                </div>

                                <div className="space-y-1.5">
                                    {groupRows.map(row => {
                                        const nom = nomById(row.nomenclature_id);
                                        const f = fact[row.nomenclature_id] || { reserved: 0, issued: 0 };
                                        const plan = parseFloat(row.quantity) || 0;
                                        const below = f.issued > 0 && plan < f.issued;
                                        const st = rowState(row);

                                        const replacing = replacingKey === row.key;

                                        return (
                                            <div key={row.key}
                                                className={`${T.cardFlat} px-2.5 py-2 transition-colors
                                                    ${replacing ? 'border-indigo-300 bg-indigo-50/40' : below ? 'border-rose-300 bg-rose-50/40' : ''}`}>

                                                {replacing ? (
                                                    /* Заміна — прямо на місці рядка, без другого вікна поверх
                                                       першого: людина не втрачає з очей ані що саме змінюється,
                                                       ані решту списку. Список одразу розкритий — досить набирати. */
                                                    <div className="flex items-start gap-2">
                                                        <FaExchangeAlt className="text-indigo-500 mt-2.5 flex-shrink-0" size={12} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[11px] text-slate-500 mb-1 leading-snug">
                                                                Чим замінити «<b className="text-slate-700">{nom?.fullName}</b>»
                                                                {' '}— кількість <b className="text-slate-700 tabular-nums">{num(plan)} {nom?.unit?.name || 'шт'}</b> залишиться тією самою
                                                            </div>
                                                            <Picker
                                                                options={addOptions}
                                                                value=""
                                                                onChange={(newId) => {
                                                                    setRows(r => r.map(x => x.key === row.key
                                                                        ? { ...x, nomenclature_id: newId } : x));
                                                                    setReplacingKey(null);
                                                                    toast('Позицію замінено');
                                                                }}
                                                                onCancel={() => setReplacingKey(null)}
                                                                autoOpen
                                                                placeholder="Почніть вводити назву або SKU…"
                                                                icon={FaSearch}
                                                                searchPlaceholder="Назва або SKU…"
                                                            />
                                                            {(f.reserved > 0 || f.issued > 0) && (
                                                                <div className="text-[10.5px] text-amber-700 mt-1 leading-snug">
                                                                    Резерв і видача за старою позицією самі не зникнуть — за потреби проведіть повернення.
                                                                </div>
                                                            )}
                                                        </div>
                                                        <IconBtn variant="ghost" icon={FaTimes} label="Скасувати заміну"
                                                            onClick={() => setReplacingKey(null)} />
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-start gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-[12.5px] font-semibold text-slate-900 leading-snug">
                                                                    {nom?.fullName || 'Невідома позиція'}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                    {nom?.sku && <span className={T.mono}>{nom.sku}</span>}
                                                                    {st && <Chip tone={st.tone}>{st.label}</Chip>}
                                                                    {f.reserved > 0 && <Chip tone="accent">резерв {num(f.reserved)}</Chip>}
                                                                    {f.issued > 0 && <Chip tone="info">видано {num(f.issued)}</Chip>}
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                                <IconBtn variant="soft" icon={FaMinus} label="Менше"
                                                                    onClick={() => bump(row.key, -1)} />
                                                                <input
                                                                    type="number" min="0" step="any" inputMode="decimal"
                                                                    value={row.quantity}
                                                                    onChange={e => setQty(row.key, e.target.value)}
                                                                    className={`w-16 h-9 text-center rounded-lg border-2 text-[14px] font-black tabular-nums outline-none transition-colors
                                                                        ${below ? 'border-rose-400 bg-rose-50 text-rose-700'
                                                                            : 'border-slate-300 text-slate-900 focus:border-indigo-500'}`}
                                                                />
                                                                <IconBtn variant="soft" icon={FaPlus} label="Більше"
                                                                    onClick={() => bump(row.key, +1)} />
                                                                <span className="text-[10px] font-bold text-slate-400 w-7">
                                                                    {nom?.unit?.name || 'шт'}
                                                                </span>
                                                                <IconBtn variant="ghost" icon={FaExchangeAlt}
                                                                    label="Замінити на іншу позицію, зберігши кількість"
                                                                    onClick={() => setReplacingKey(row.key)} />
                                                                <IconBtn variant="ghost" icon={FaTrash} label="Прибрати"
                                                                    onClick={() => removeRow(row.key)} />
                                                            </div>
                                                        </div>

                                                        {below && (
                                                            <div className="text-[11px] font-bold text-rose-700 mt-1.5 flex items-center gap-1.5">
                                                                <FaExclamationTriangle size={10} />
                                                                План менший за видане ({num(f.issued)}). Спершу проведіть повернення.
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className={`${TONE.neutral.chip} border rounded-lg px-3 py-2 text-[11.5px] leading-relaxed`}>
                            <FaClipboardList className="inline mr-1.5" size={10} />
                            <b>Оновити чинну</b> — правки лягають у ту саму специфікацію,
                            версія не змінюється. <b>Нова версія</b> — чинна стає архівною,
                            а поточний список зберігається як V.{version}. Резерви й видачі
                            в обох випадках лишаються: вони прив'язані до об'єкта, а не до версії.
                        </div>
                    </div>
                )}
            </Modal>

            <NomenclatureModal
                isOpen={!!quickAdd}
                onClose={() => setQuickAdd(null)}
                onSuccess={onNomCreated}
                initialName={quickAdd?.name}
            />
        </>
    );
}
