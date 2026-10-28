// =====================================================================
//  Картка позиції номенклатури — створення та редагування.
//
//  Форма розкладена за важливістю: спершу те, без чого позиція не
//  існує (тип, категорія, назва), далі — необов'язкові уточнення.
//  Блоки фасування та поштучного обліку згорнуті в підрозділи, щоб
//  не лякати обсягом того, хто просто заводить чергову панель.
//
//  ОДНА ПОЗИЦІЯ — ОДНА КАРТКА. Поки людина вводить назву, форма
//  звіряє її з довідником. Дослівний двійник (після нормалізації
//  «ПВ3 6мм» = «ПВ-3 6 мм») блокує створення, схожі показуються
//  підказкою. Якщо форму відкрили з документа (специфікація, рахунок),
//  наявну позицію можна взяти одним кліком замість того, щоб плодити
//  нову. Останнє слово — за базою: той самий ключ перевіряє тригер
//  nomenclature_reject_duplicate.
//
//  У режимі редагування позицію можна прибрати (видалити, а якщо є
//  історія — в архів) або влити в правильну, якщо це дубль.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FaBox, FaWrench, FaConciergeBell, FaMagic, FaMicrochip,
    FaBoxOpen, FaLayerGroup, FaPlus, FaFolderOpen, FaBalanceScale,
    FaExclamationTriangle, FaArchive, FaCompressArrowsAlt, FaChartLine, FaUndo,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { hasLotTracking, hasStockRules } from '../utils/features';
import { nameFingerprint, fingerprintSimilarity } from '../utils/nameMatching';
import {
    mergeNomenclature, retireNomenclature, restoreNomenclature, mergeBlocker,
} from '../utils/nomenclatureOps';
import {
    T, TONE, Btn, IconBtn, Modal, Field, Picker, Segmented,
    useToast, useConfirm, humanError,
} from '../ui';

const TYPES = [
    { value: 'good', label: 'Товар', icon: FaBox },
    { value: 'tool', label: 'Інструмент', icon: FaWrench },
    { value: 'service', label: 'Послуга', icon: FaConciergeBell },
];

/** З якої схожості назву варто показати як «можливо, та сама» */
const SIMILAR_HINT = 0.6;

const emptyForm = () => ({
    type: 'good',
    category_id: '',
    name: '',
    technical_characteristics: '',
    brand: '',
    sku: '',
    unit_id: '',
    package_name: '',
    package_multiplier: '',
    description: '',
    tracking_mode: 'bulk',
    lot_unit_name: '',
    lot_default_size: '',
    min_stock: '',
    target_stock: '',
});

const toNumOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

const fingerprintOf = (p) => nameFingerprint(`${p.name || ''} ${p.technical_characteristics || ''}`);

/**
 * onPickExisting(row) — якщо передано, біля знайденого двійника
 * з'являється «Використати її»: форма закривається й віддає наявну
 * позицію замість створення нової. Для форм, відкритих із документа.
 */
export function NomenclatureModal({ isOpen, onClose, onSuccess, onPickExisting, editingItem, initialName }) {
    const { employee } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();

    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    const [pool, setPool] = useState([]);              // увесь довідник — для пошуку двійників
    const [form, setForm] = useState(emptyForm());
    const [busy, setBusy] = useState(false);

    const [lotReady, setLotReady] = useState(false);
    const [rulesReady, setRulesReady] = useState(false);
    const [showPackaging, setShowPackaging] = useState(false);
    const [unitForm, setUnitForm] = useState(null);     // { name, code }
    const [merge, setMerge] = useState(null);           // { targetId } — інлайн-панель обʼєднання
    const mergeRef = useRef(null);

    const isService = form.type === 'service';

    /* ---------------- ДОВІДНИКИ ТА ЗАПОВНЕННЯ ---------------- */

    const loadRefs = useCallback(async () => {
        try {
            const [catsRes, unitsRes, poolRes] = await Promise.all([
                supabase.from('categories').select('*').eq('is_active', true),
                supabase.from('units').select('*').order('name'),
                supabase.from('nomenclature').select('*, unit:units(name)'),
            ]);
            if (catsRes.error) throw catsRes.error;
            if (unitsRes.error) throw unitsRes.error;
            setCategories(catsRes.data || []);
            setUnits(unitsRes.data || []);
            // Без довідника форма просто не підкаже про двійника — ламати її через це не варто
            setPool((poolRes.data || []).map(p => ({ ...p, fp: fingerprintOf(p) })));
        } catch (e) {
            toast(humanError(e), 'error');
        }
    }, [toast]);

    useEffect(() => {
        if (!isOpen) return;
        loadRefs();
        hasLotTracking().then(setLotReady);
        hasStockRules().then(setRulesReady);
        setUnitForm(null);
        setMerge(null);

        if (editingItem) {
            setForm({
                type: editingItem.type || 'good',
                category_id: editingItem.category_id || '',
                name: editingItem.name || '',
                technical_characteristics: editingItem.technical_characteristics || '',
                brand: editingItem.brand || '',
                sku: editingItem.sku || '',
                unit_id: editingItem.unit_id || '',
                package_name: editingItem.package_name || '',
                package_multiplier: editingItem.package_multiplier || '',
                description: editingItem.description || '',
                tracking_mode: editingItem.tracking_mode || 'bulk',
                lot_unit_name: editingItem.lot_unit_name || '',
                lot_default_size: editingItem.lot_default_size || '',
                min_stock: editingItem.min_stock ?? '',
                target_stock: editingItem.target_stock ?? '',
            });
            setShowPackaging(!!editingItem.package_name || editingItem.tracking_mode === 'lot');
        } else {
            setForm({ ...emptyForm(), name: initialName || '' });
            setShowPackaging(false);
        }
        // loadRefs стабільний; решта — навмисно лише на відкриття
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, editingItem, initialName]);

    // Панель обʼєднання з'являється внизу форми — підтягуємо її в поле зору
    useEffect(() => {
        if (merge) mergeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [merge]);

    /* ---------------- ОПЦІЇ ---------------- */

    const categoryOptions = useMemo(() => {
        const byId = new Map(categories.map(c => [c.id, c]));
        return categories.map(c => {
            const path = [];
            let id = c.id, guard = 0;
            while (id && guard++ < 20) {
                const cur = byId.get(id);
                if (!cur) break;
                path.unshift(cur.name);
                id = cur.parent_id;
            }
            return { id: c.id, label: path.join(' / ') };
        }).sort((a, b) => a.label.localeCompare(b.label, 'uk'));
    }, [categories]);

    const categoryLabel = useMemo(
        () => new Map(categoryOptions.map(c => [c.id, c.label])),
        [categoryOptions]
    );

    const unitOptions = useMemo(
        () => units.map(u => ({ id: u.id, label: `${u.name} (${u.code})` })),
        [units]
    );

    const unitShort = useMemo(
        () => units.find(u => u.id === form.unit_id)?.name || 'баз. од.',
        [units, form.unit_id]
    );

    const labelOf = (p) => [p.name, p.type === 'good' ? p.technical_characteristics : null]
        .filter(Boolean).join(' · ');

    /* ---------------- ДВІЙНИКИ ---------------- */

    // Характеристики зберігаються лише для товару — так само рахуємо й ключ
    const effectiveTech = form.type === 'good' ? form.technical_characteristics : '';
    const selfId = editingItem?.id ?? null;

    // У картці, що вже існує, двійника шукаємо лише коли змінили саме те,
    // що робить позицію «тією самою». Інакше одна зі старої пари дублікатів
    // не дала б навіть поправити опис.
    const identityChanged = !editingItem
        || form.name !== (editingItem.name || '')
        || effectiveTech !== (editingItem.type === 'good' ? (editingItem.technical_characteristics || '') : '')
        || form.type !== editingItem.type;

    const formFp = useMemo(
        () => nameFingerprint(`${form.name} ${effectiveTech}`),
        [form.name, effectiveTech]
    );

    const twin = useMemo(() => {
        if (!identityChanged || form.name.trim().length < 2 || !formFp.key) return null;
        const same = pool.filter(p => p.id !== selfId && p.type === form.type && p.fp.key === formFp.key);
        return same.find(p => p.is_active) || same[0] || null;
    }, [identityChanged, form.name, form.type, formFp, pool, selfId]);

    // Двійника раніше влили в іншу позицію — пропонуємо саме її
    const twinTarget = useMemo(() => (
        twin && !twin.is_active && twin.merged_into_id
            ? pool.find(p => p.id === twin.merged_into_id && p.is_active) || null
            : null
    ), [twin, pool]);

    const similar = useMemo(() => {
        if (!identityChanged || twin || form.name.trim().length < 3) return [];
        return pool
            .filter(p => p.is_active && p.id !== selfId && p.type === form.type)
            .map(p => ({ p, score: fingerprintSimilarity(formFp, p.fp) }))
            .filter(x => x.score >= SIMILAR_HINT)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(x => x.p);
    }, [identityChanged, twin, form.name, form.type, formFp, pool, selfId]);

    /* ---------------- ДІЇ ---------------- */

    const generateSku = () => {
        const prefix = form.type === 'good' ? 'G-' : form.type === 'tool' ? 'T-' : 'S-';
        setForm(f => ({ ...f, sku: `${prefix}${Math.floor(100000 + Math.random() * 900000)}` }));
    };

    const saveUnit = async () => {
        if (!unitForm.name.trim() || !unitForm.code.trim()) {
            return toast('Введіть назву та код одиниці виміру', 'error');
        }
        try {
            const { data, error } = await supabase.from('units')
                .insert([{ name: unitForm.name.trim(), code: unitForm.code.trim(), created_by: employee?.id }])
                .select().single();
            if (error) throw error;
            setUnits(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'uk')));
            setForm(f => ({ ...f, unit_id: data.id }));
            setUnitForm(null);
            toast('Одиницю виміру додано');
        } catch (e) {
            toast(e.code === '23505' ? 'Такий код одиниці вже існує' : humanError(e), 'error');
        }
    };

    const pick = (row) => {
        onClose();
        onPickExisting?.(row);
    };

    const restore = async (row) => {
        setBusy(true);
        try {
            const data = await restoreNomenclature(row.id, employee?.id);
            toast('Позицію повернуто з архіву');
            onClose();
            (onPickExisting || onSuccess)?.(data);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    const submit = async () => {
        if (twin?.is_active) return toast('Така позиція вже є в довіднику — скористайтесь наявною', 'error');
        if (!form.category_id) return toast('Оберіть категорію', 'error');
        if (!form.name.trim()) return toast('Введіть назву позиції', 'error');
        if (!isService) {
            if (!form.sku.trim()) return toast('Артикул (SKU) обовʼязковий', 'error');
            if (!form.unit_id) return toast('Оберіть базову одиницю виміру', 'error');
        }
        if (form.tracking_mode === 'lot' && !form.lot_unit_name.trim()) {
            return toast('Вкажіть, як називати носій — бухта, барабан, рулон', 'error');
        }

        const minStock = toNumOrNull(form.min_stock);
        const targetStock = toNumOrNull(form.target_stock);
        if (rulesReady && form.type === 'good' && minStock !== null && targetStock !== null && targetStock < minStock) {
            return toast('«Поповнювати до» не може бути меншим за мінімальний залишок', 'error');
        }

        setBusy(true);
        try {
            const payload = {
                type: form.type,
                category_id: form.category_id,
                unit_id: isService ? null : form.unit_id,
                name: form.name.trim(),
                technical_characteristics: form.type === 'good'
                    ? (form.technical_characteristics.trim() || null) : null,
                brand: !isService ? (form.brand.trim() || null) : null,
                sku: form.sku.trim() || `SRV-${Math.floor(100000 + Math.random() * 900000)}`,
                package_name: !isService && form.package_name.trim() ? form.package_name.trim() : null,
                package_multiplier: !isService && form.package_multiplier
                    ? parseFloat(form.package_multiplier) : null,
                description: form.description.trim() || null,
                updated_by: employee?.id,
            };

            // Поля носіїв надсилаємо, лише якщо міграція виконана —
            // інакше Postgres поверне «column does not exist»
            if (lotReady && !isService) {
                const isLot = form.tracking_mode === 'lot';
                payload.tracking_mode = isLot ? 'lot' : 'bulk';
                payload.lot_unit_name = isLot ? form.lot_unit_name.trim() : null;
                payload.lot_default_size = isLot && form.lot_default_size
                    ? parseFloat(form.lot_default_size) : null;
            }

            if (rulesReady) {
                const good = form.type === 'good';
                payload.min_stock = good ? minStock : null;
                payload.target_stock = good ? targetStock : null;
            }

            const q = editingItem
                ? supabase.from('nomenclature').update(payload).eq('id', editingItem.id)
                : supabase.from('nomenclature').insert([{ ...payload, created_by: employee?.id }]);

            const { data, error } = await q.select('*, unit:units(name)').single();
            if (error) throw error;

            toast(editingItem ? 'Позицію оновлено' : 'Позицію створено');
            onClose();
            onSuccess?.(data);
        } catch (e) {
            // Двійника знайшла база, а не форма (довідник міг змінитись,
            // поки вікно було відкрите) — оновлюємо, щоб підказка з'явилась
            if (e.code === 'P0001') loadRefs();
            toast(e.code === '23505' ? 'Позиція з таким артикулом (SKU) вже існує' : humanError(e), 'error');
        } finally { setBusy(false); }
    };

    const retire = async () => {
        const ok = await confirm({
            title: 'Прибрати позицію з довідника?',
            tone: 'danger',
            confirmLabel: 'Прибрати',
            message: labelOf(editingItem),
            details: [
                'Ніде не використовувалась — буде видалена повністю.',
                'Має історію (рухи, замовлення, специфікації) — піде в архів: зникне зі списків і пошуку, а історія лишиться. Повернути можна з архіву на складі.',
                'Якщо це дубль іншої позиції — краще «Обʼєднати»: тоді й історія, і залишок перейдуть у правильну.',
            ],
        });
        if (!ok) return;

        setBusy(true);
        try {
            const result = await retireNomenclature(editingItem, employee?.id);
            toast(result === 'deleted' ? 'Позицію видалено' : 'Позицію перенесено в архів');
            onClose();
            onSuccess?.();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- ОБʼЄДНАННЯ ---------------- */

    const mergeOptions = useMemo(() => {
        if (!editingItem || !merge) return [];
        const selfFp = fingerprintOf(editingItem);
        // Найсхожіші — зверху: дубль зазвичай поруч, а не на сотому рядку
        return pool
            .filter(p => p.is_active && p.id !== editingItem.id && p.type === editingItem.type)
            .map(p => ({ p, score: fingerprintSimilarity(selfFp, p.fp) }))
            .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, 'uk'))
            .map(({ p }) => ({
                id: p.id,
                label: [labelOf(p), p.sku, categoryLabel.get(p.category_id)].filter(Boolean).join(' · '),
            }));
    }, [editingItem, merge, pool, categoryLabel]);

    const mergeTarget = merge?.targetId
        ? pool.find(p => String(p.id) === String(merge.targetId)) || null
        : null;
    const mergeWhyNot = mergeBlocker(editingItem, mergeTarget);

    const runMerge = async () => {
        if (!mergeTarget || mergeWhyNot) return;
        const ok = await confirm({
            title: 'Обʼєднати позиції?',
            tone: 'accent',
            confirmLabel: 'Обʼєднати',
            message: 'Залишки, рухи, резерви, замовлення й специфікації переходять на позицію, що лишається. Автоматично це не скасовується.',
            details: [
                `Лишається: ${labelOf(mergeTarget)}${mergeTarget.sku ? ` (${mergeTarget.sku})` : ''}`,
                `Іде в архів: ${labelOf(editingItem)}${editingItem.sku ? ` (${editingItem.sku})` : ''}`,
            ],
        });
        if (!ok) return;

        setBusy(true);
        try {
            await mergeNomenclature(editingItem.id, mergeTarget.id, employee?.id);
            toast('Позиції обʼєднано');
            onClose();
            onSuccess?.();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- РЕНДЕР ---------------- */

    const shownTwin = twinTarget || twin;
    const canManage = !!editingItem && rulesReady;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editingItem ? 'Редагувати позицію' : 'Нова позиція номенклатури'}
            subtitle={editingItem?.sku ? `SKU ${editingItem.sku}` : 'Довідник товарів, інструменту та послуг'}
            size="lg"
            onSubmit={() => { if (!busy) submit(); }}
            submitHint={canManage ? undefined : editingItem ? 'зберегти' : 'створити позицію'}
            footer={<>
                {canManage && (
                    <div className="mr-auto flex items-center gap-1.5">
                        <Btn variant="softDanger" icon={FaArchive} disabled={busy} onClick={retire}
                            title="Видалити або перенести в архів">
                            <span className="hidden sm:inline">Прибрати</span>
                        </Btn>
                        <Btn variant={merge ? 'accent' : 'soft'} icon={FaCompressArrowsAlt} disabled={busy}
                            onClick={() => setMerge(m => (m ? null : { targetId: '' }))}
                            title="Це дубль — влити в іншу позицію">
                            <span className="hidden sm:inline">Обʼєднати</span>
                        </Btn>
                    </div>
                )}
                <Btn variant="outline" onClick={onClose}>Скасувати</Btn>
                <Btn variant="accent" onClick={submit} disabled={busy || !!twin?.is_active}
                    title={twin?.is_active ? 'Така позиція вже є в довіднику' : undefined}>
                    {busy ? 'Зберігаємо…' : editingItem ? 'Зберегти' : 'Створити позицію'}
                </Btn>
            </>}
        >
            <div className="space-y-4">

                {/* Тип позиції */}
                <div>
                    <span className={`${T.label} block mb-1.5`}>Тип позиції</span>
                    <Segmented
                        className="w-full"
                        value={form.type}
                        onChange={v => setForm(f => ({ ...f, type: v }))}
                        options={TYPES.map(t => ({ value: t.value, label: t.label }))}
                    />
                </div>

                {/* Основне */}
                <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Категорія" required className="sm:col-span-2">
                        <Picker
                            options={categoryOptions} value={form.category_id}
                            onChange={v => setForm(f => ({ ...f, category_id: v }))}
                            placeholder="Оберіть категорію…" icon={FaFolderOpen}
                            searchPlaceholder="Почніть вводити назву…"
                        />
                    </Field>

                    <Field
                        label={isService ? 'Назва послуги' : form.type === 'tool' ? 'Назва інструменту' : 'Назва (модель)'}
                        required className="sm:col-span-2"
                    >
                        <input className={`${T.input} ${twin?.is_active ? 'border-rose-400 bg-rose-50/40' : ''}`}
                            value={form.name}
                            placeholder={form.type === 'good' ? 'Напр. JAM72S30 550/MR' : 'Напр. Перфоратор Bosch GBH 2-26'}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    </Field>

                    {form.type === 'good' && (
                        <Field label="Технічні характеристики" className="sm:col-span-2"
                            hint="Потужність, переріз, розмір — те, чим позиція відрізняється від сусідньої">
                            <div className="relative">
                                <FaMicrochip className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
                                <input className={`${T.input} pl-9`} value={form.technical_characteristics}
                                    placeholder="Напр. 550 Вт, монокристал"
                                    onChange={e => setForm(f => ({ ...f, technical_characteristics: e.target.value }))} />
                            </div>
                        </Field>
                    )}

                    {/* Двійник: дослівно та сама позиція після нормалізації назви */}
                    {twin && (
                        <div className={`sm:col-span-2 border rounded-lg px-3 py-2.5 ${twin.is_active ? TONE.danger.chip : TONE.warn.chip}`}>
                            <div className="flex items-start gap-2.5">
                                <FaExclamationTriangle className="flex-shrink-0 mt-0.5" size={12} />
                                <div className="min-w-0 flex-1">
                                    <div className="text-[12px] font-bold leading-snug">
                                        {twin.is_active ? 'Така позиція вже є в довіднику'
                                            : twinTarget ? 'Таку позицію раніше обʼєднали з іншою'
                                                : 'Така позиція є в архіві'}
                                    </div>
                                    <div className="text-[12.5px] font-semibold text-slate-900 mt-0.5 break-words">
                                        {labelOf(shownTwin)}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                        {shownTwin.sku && <span className={T.mono}>{shownTwin.sku}</span>}
                                        {categoryLabel.get(shownTwin.category_id) && (
                                            <span className="text-[10.5px] text-slate-500">{categoryLabel.get(shownTwin.category_id)}</span>
                                        )}
                                    </div>
                                    <div className="text-[11px] text-slate-600 mt-1 leading-snug">
                                        {twin.is_active
                                            ? 'Друга картка розділила б залишок на два рядки. Скористайтесь наявною або уточніть назву.'
                                            : twinTarget
                                                ? 'Скористайтесь позицією, в яку її влили.'
                                                : 'Поверніть її з архіву замість нової — історія лишиться при ній.'}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1.5 flex-shrink-0">
                                    {twin.is_active && onPickExisting && (
                                        <Btn size="sm" variant="danger" onClick={() => pick(twin)}>Використати її</Btn>
                                    )}
                                    {twinTarget && onPickExisting && (
                                        <Btn size="sm" variant="accent" onClick={() => pick(twinTarget)}>Використати</Btn>
                                    )}
                                    {!twin.is_active && !twinTarget && rulesReady && (
                                        <Btn size="sm" variant="softWarn" icon={FaUndo} disabled={busy}
                                            onClick={() => restore(twin)}>
                                            Відновити
                                        </Btn>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Схожі: ті самі числа й майже ті самі слова — вирішує людина */}
                    {similar.length > 0 && (
                        <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                            <div className="text-[11px] font-bold text-amber-800 mb-1">
                                Схожі позиції — перевірте, чи це не та сама
                            </div>
                            <div className="divide-y divide-amber-100">
                                {similar.map(p => (
                                    <div key={p.id} className="flex items-center gap-2 py-1.5">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[12px] font-semibold text-slate-800 leading-snug break-words">{labelOf(p)}</div>
                                            {categoryLabel.get(p.category_id) && (
                                                <div className="text-[10.5px] text-slate-500 truncate">{categoryLabel.get(p.category_id)}</div>
                                            )}
                                        </div>
                                        {p.sku && <span className={`${T.mono} hidden sm:inline`}>{p.sku}</span>}
                                        {onPickExisting && (
                                            <Btn size="sm" variant="outline" onClick={() => pick(p)}>Це вона</Btn>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {!isService && (
                        <>
                            <Field label="Виробник / бренд">
                                <input className={T.input} value={form.brand} placeholder="Напр. JA Solar"
                                    onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} />
                            </Field>

                            <Field label="Артикул (SKU)" required>
                                <div className="flex gap-2">
                                    <input className={`${T.input} font-mono`} value={form.sku} placeholder="G-123456"
                                        onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} />
                                    <IconBtn variant="soft" icon={FaMagic} label="Згенерувати артикул" onClick={generateSku} />
                                </div>
                            </Field>

                            <Field label="Базова одиниця виміру" required className="sm:col-span-2"
                                hint="Усі складські розрахунки ведуться саме в ній">
                                <div className="flex gap-2">
                                    <Picker
                                        className="flex-1"
                                        options={unitOptions} value={form.unit_id}
                                        onChange={v => setForm(f => ({ ...f, unit_id: v }))}
                                        placeholder="Оберіть одиницю…" icon={FaBalanceScale}
                                    />
                                    <IconBtn variant="soft" icon={FaPlus} label="Додати одиницю виміру"
                                        onClick={() => setUnitForm({ name: '', code: '' })} />
                                </div>
                            </Field>

                            {unitForm && (
                                <div className={`${T.inset} p-3 sm:col-span-2 space-y-2.5`}>
                                    <div className={T.label}>Нова одиниця виміру</div>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <input className={T.input} placeholder="Назва — напр. метр"
                                            value={unitForm.name}
                                            onChange={e => setUnitForm(u => ({ ...u, name: e.target.value }))} />
                                        <input className={T.input} placeholder="Код — напр. м"
                                            value={unitForm.code}
                                            onChange={e => setUnitForm(u => ({ ...u, code: e.target.value }))} />
                                    </div>
                                    <div className="flex gap-2">
                                        <Btn variant="outline" className="flex-1" onClick={() => setUnitForm(null)}>Скасувати</Btn>
                                        <Btn variant="accent" className="flex-1" onClick={saveUnit}>Додати в довідник</Btn>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* ЯК ВЕДЕТЬСЯ ОБЛІК НА СКЛАДІ — на видноті, бо саме тут вмикається кабель */}
                {!isService && lotReady && (
                    <div className={`rounded-lg border-2 p-3 transition-colors
                        ${form.tracking_mode === 'lot'
                            ? 'border-indigo-300 bg-indigo-50/50'
                            : 'border-slate-200 bg-slate-50'}`}>
                        <div className={`${T.label} mb-2`}>Як вести облік на складі</div>

                        <div className="grid sm:grid-cols-2 gap-2">
                            {[
                                {
                                    v: 'bulk', title: 'Звичайний', icon: FaBox,
                                    hint: 'Просто кількість: 120 шт, 40 м',
                                },
                                {
                                    v: 'lot', title: 'Поштучно по носіях', icon: FaLayerGroup,
                                    hint: 'Кабель, трос, плівка: кожна бухта окремо',
                                },
                            ].map(opt => {
                                const active = form.tracking_mode === opt.v;
                                return (
                                    <button
                                        key={opt.v} type="button"
                                        onClick={() => setForm(f => ({
                                            ...f,
                                            tracking_mode: opt.v,
                                            lot_unit_name: opt.v === 'lot' && !f.lot_unit_name ? 'бухта' : f.lot_unit_name,
                                        }))}
                                        className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors
                                            ${active
                                                ? 'border-indigo-500 bg-white shadow-sm'
                                                : 'border-slate-200 bg-white hover:border-slate-400'}`}
                                    >
                                        <span className={`flex items-center gap-1.5 text-[12.5px] font-bold
                                            ${active ? 'text-indigo-700' : 'text-slate-700'}`}>
                                            <opt.icon size={11} />{opt.title}
                                        </span>
                                        <span className="block text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                                            {opt.hint}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {form.tracking_mode === 'lot' && (
                            <div className="mt-3 pt-3 border-t border-indigo-200 grid sm:grid-cols-2 gap-2.5">
                                <Field label="Як називати носій" required>
                                    <input className={T.input} placeholder="бухта / барабан / рулон"
                                        value={form.lot_unit_name}
                                        onChange={e => setForm(f => ({ ...f, lot_unit_name: e.target.value }))} />
                                </Field>
                                <Field label="Типовий розмір">
                                    <div className="relative">
                                        <input type="number" step="any" min="0"
                                            className={`${T.input} pr-14 font-bold text-indigo-700`}
                                            placeholder="500" value={form.lot_default_size}
                                            onChange={e => setForm(f => ({ ...f, lot_default_size: e.target.value }))} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none">
                                            {unitShort}
                                        </span>
                                    </div>
                                </Field>
                                <p className="sm:col-span-2 text-[10.5px] text-indigo-800/80 leading-relaxed">
                                    Після збереження розгорніть цю позицію в «Залишках» — там зʼявиться
                                    приймання партії: «20 бухт по 500 м» заводиться однією дією.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Контроль залишку: лише для товару — інструмент рахується поштучно в «Інструменті» */}
                {form.type === 'good' && rulesReady && (
                    <div className={`${T.inset} p-3`}>
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                            <FaChartLine className="text-slate-400 flex-shrink-0" size={11} />
                            <span className="text-[12.5px] font-bold text-slate-800">Контроль залишку</span>
                            <span className="text-[11px] text-slate-500">необовʼязково</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                            {[
                                { key: 'min_stock', label: 'Мінімальний залишок', placeholder: 'Напр. 20' },
                                { key: 'target_stock', label: 'Поповнювати до', placeholder: 'До мінімуму' },
                            ].map(f => (
                                <Field key={f.key} label={f.label}>
                                    <div className="relative">
                                        <input type="number" step="any" min="0" inputMode="decimal"
                                            className={`${T.input} pr-14 font-bold tabular-nums`}
                                            placeholder={f.placeholder} value={form[f.key]}
                                            onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none">
                                            {unitShort}
                                        </span>
                                    </div>
                                </Field>
                            ))}
                        </div>
                        <p className="text-[10.5px] text-slate-500 mt-1.5 leading-relaxed">
                            Коли вільного залишку (разом із тим, що вже їде на склад) стане менше мінімуму,
                            позиція підсвітиться в «Залишках» і зʼявиться в «Закупівлях» у блоці «Нижче мінімуму»
                            з кількістю до дозамовлення.
                        </p>
                    </div>
                )}

                {/* Фасування — рідше потрібне, тому згорнуте */}
                {!isService && (
                    <div className={`${T.inset} overflow-hidden`}>
                        <button
                            type="button"
                            onClick={() => setShowPackaging(v => !v)}
                            className="w-full px-3 py-2.5 flex items-center gap-2 text-left"
                        >
                            <FaBoxOpen className="text-slate-400 flex-shrink-0" size={12} />
                            <span className="text-[12.5px] font-bold text-slate-800">Кратність упаковки</span>
                            <span className="text-[11px] text-slate-500 hidden sm:inline">
                                {form.package_name
                                    ? `${form.package_name} = ${form.package_multiplier || '?'} ${unitShort}`
                                    : 'уп., банка, штанга — необовʼязково'}
                            </span>
                            <span className={`ml-auto text-slate-400 text-[11px] font-bold transition-transform ${showPackaging ? 'rotate-180' : ''}`}>▾</span>
                        </button>

                        {showPackaging && (
                            <div className="px-3 pb-3 border-t border-slate-200 pt-3">
                                <div className="flex items-center gap-2">
                                    <input className={T.input} placeholder="уп. / банка / штанга"
                                        value={form.package_name}
                                        onChange={e => setForm(f => ({ ...f, package_name: e.target.value }))} />
                                    <span className="text-slate-400 font-black flex-shrink-0">=</span>
                                    <div className="relative flex-1">
                                        <input type="number" step="any" min="0"
                                            className={`${T.input} pr-14 font-bold text-indigo-700`}
                                            placeholder="100" value={form.package_multiplier}
                                            onChange={e => setForm(f => ({ ...f, package_multiplier: e.target.value }))} />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase pointer-events-none">
                                            {unitShort}
                                        </span>
                                    </div>
                                </div>
                                <p className="text-[10.5px] text-slate-500 mt-1.5 leading-relaxed">
                                    Базова одиниця «шт», а тут «уп.» = «100». Або базова «м», а тут
                                    «штанга» = «3». На складі все рахується в базових одиницях.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <Field label="Опис / примітки">
                    <textarea rows="2" value={form.description}
                        placeholder="Необовʼязково"
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        className={`${T.input} h-auto py-2 resize-none leading-relaxed`} />
                </Field>

                {/* Обʼєднання — інлайн, без другого вікна поверх цього */}
                {canManage && merge && (
                    <div ref={mergeRef} className="rounded-lg border-2 border-indigo-300 bg-indigo-50/50 p-3 space-y-2.5">
                        <div className="flex items-center gap-1.5">
                            <FaCompressArrowsAlt className="text-indigo-500" size={11} />
                            <span className="text-[12.5px] font-bold text-indigo-900">Влити цю позицію в іншу</span>
                        </div>
                        <p className="text-[11.5px] text-slate-600 leading-relaxed">
                            Залишки, рухи, резерви, замовлення й специфікації перейдуть на обрану позицію.
                            Ця піде в архів, а її назва запамʼятається — документи з такою назвою надалі
                            розпізнаватимуться як обрана позиція.
                        </p>
                        <Picker
                            options={mergeOptions}
                            value={merge.targetId}
                            onChange={v => setMerge({ targetId: v })}
                            placeholder="Яка позиція лишається…"
                            icon={FaBox}
                            searchPlaceholder="Назва або SKU…"
                        />
                        {mergeWhyNot && (
                            <div className={`${TONE.danger.chip} border rounded-lg px-3 py-2 text-[11.5px] font-semibold leading-snug`}>
                                {mergeWhyNot}
                            </div>
                        )}
                        <div className="flex gap-2 justify-end">
                            <Btn variant="outline" onClick={() => setMerge(null)}>Скасувати</Btn>
                            <Btn variant="accent" icon={FaCompressArrowsAlt}
                                disabled={!mergeTarget || !!mergeWhyNot || busy}
                                onClick={runMerge}>
                                Обʼєднати
                            </Btn>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

export default NomenclatureModal;
