// =====================================================================
//  Картка позиції номенклатури — створення та редагування.
//
//  Форма розкладена за важливістю: спершу те, без чого позиція не
//  існує (тип, категорія, назва), далі — необов'язкові уточнення.
//  Блоки фасування та поштучного обліку згорнуті в підрозділи, щоб
//  не лякати обсягом того, хто просто заводить чергову панель.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FaBox, FaWrench, FaConciergeBell, FaMagic, FaMicrochip,
    FaBoxOpen, FaLayerGroup, FaPlus, FaFolderOpen, FaBalanceScale,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { hasLotTracking } from '../utils/features';
import {
    T, Btn, IconBtn, Modal, Field, Picker, Segmented,
    useToast, humanError,
} from '../ui';

const TYPES = [
    { value: 'good', label: 'Товар', icon: FaBox },
    { value: 'tool', label: 'Інструмент', icon: FaWrench },
    { value: 'service', label: 'Послуга', icon: FaConciergeBell },
];

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
});

export function NomenclatureModal({ isOpen, onClose, onSuccess, editingItem, initialName }) {
    const { employee } = useAuth();
    const toast = useToast();

    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    const [form, setForm] = useState(emptyForm());
    const [busy, setBusy] = useState(false);

    const [lotReady, setLotReady] = useState(false);
    const [showPackaging, setShowPackaging] = useState(false);
    const [unitForm, setUnitForm] = useState(null);   // { name, code }

    const isService = form.type === 'service';

    /* ---------------- ДОВІДНИКИ ТА ЗАПОВНЕННЯ ---------------- */

    const loadRefs = useCallback(async () => {
        try {
            const [catsRes, unitsRes] = await Promise.all([
                supabase.from('categories').select('*').eq('is_active', true),
                supabase.from('units').select('*').order('name'),
            ]);
            if (catsRes.error) throw catsRes.error;
            if (unitsRes.error) throw unitsRes.error;
            setCategories(catsRes.data || []);
            setUnits(unitsRes.data || []);
        } catch (e) {
            toast(humanError(e), 'error');
        }
    }, [toast]);

    useEffect(() => {
        if (!isOpen) return;
        loadRefs();
        hasLotTracking().then(setLotReady);
        setUnitForm(null);

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
            });
            setShowPackaging(!!editingItem.package_name || editingItem.tracking_mode === 'lot');
        } else {
            setForm({ ...emptyForm(), name: initialName || '' });
            setShowPackaging(false);
        }
        // loadRefs стабільний; решта — навмисно лише на відкриття
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, editingItem, initialName]);

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

    const unitOptions = useMemo(
        () => units.map(u => ({ id: u.id, label: `${u.name} (${u.code})` })),
        [units]
    );

    const unitShort = useMemo(
        () => units.find(u => u.id === form.unit_id)?.name || 'баз. од.',
        [units, form.unit_id]
    );

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

    const submit = async () => {
        if (!form.category_id) return toast('Оберіть категорію', 'error');
        if (!form.name.trim()) return toast('Введіть назву позиції', 'error');
        if (!isService) {
            if (!form.sku.trim()) return toast('Артикул (SKU) обовʼязковий', 'error');
            if (!form.unit_id) return toast('Оберіть базову одиницю виміру', 'error');
        }
        if (form.tracking_mode === 'lot' && !form.lot_unit_name.trim()) {
            return toast('Вкажіть, як називати носій — бухта, барабан, рулон', 'error');
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

            const q = editingItem
                ? supabase.from('nomenclature').update(payload).eq('id', editingItem.id)
                : supabase.from('nomenclature').insert([{ ...payload, created_by: employee?.id }]);

            const { data, error } = await q.select('*, unit:units(name)').single();
            if (error) throw error;

            toast(editingItem ? 'Позицію оновлено' : 'Позицію створено');
            onClose();
            onSuccess?.(data);
        } catch (e) {
            toast(e.code === '23505' ? 'Позиція з таким артикулом (SKU) вже існує' : humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={editingItem ? 'Редагувати позицію' : 'Нова позиція номенклатури'}
            subtitle={editingItem?.sku ? `SKU ${editingItem.sku}` : 'Довідник товарів, інструменту та послуг'}
            size="lg"
            onSubmit={() => { if (!busy) submit(); }}
            submitHint={editingItem ? 'зберегти' : 'створити позицію'}
            footer={<>
                <Btn variant="outline" onClick={onClose}>Скасувати</Btn>
                <Btn variant="accent" onClick={submit} disabled={busy}>
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
                        <input className={T.input} value={form.name}
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
            </div>
        </Modal>
    );
}

export default NomenclatureModal;
