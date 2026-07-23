import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaBox, FaWrench, FaConciergeBell, FaTimes,
    FaChevronDown, FaMagic, FaMicrochip, FaBoxOpen
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

// --- SearchableSelect (перенесено з NomenclaturePage) ---
const SearchableSelect = ({ options, value, onChange, placeholder, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.id === value);
    const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div 
                className={`w-full px-4 py-3 bg-white border rounded-xl flex justify-between items-center transition-shadow shadow-sm text-sm ${disabled ? 'bg-slate-50 cursor-not-allowed border-slate-200' : 'cursor-pointer border-slate-300 hover:border-indigo-300'}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className={`truncate pr-4 ${selectedOption ? 'text-slate-800 font-bold' : 'text-slate-400'}`}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <FaChevronDown className={`text-slate-400 text-xs transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }}
                        className="absolute z-[90] w-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 flex flex-col overflow-hidden"
                    >
                        <div className="p-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                            <input 
                                autoFocus
                                type="text"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors"
                                placeholder="Пошук..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1">
                            {filteredOptions.length > 0 ? filteredOptions.map(o => (
                                <div 
                                    key={o.id}
                                    className={`px-4 py-2.5 cursor-pointer text-sm transition-colors ${o.id === value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
                                    onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}
                                >
                                    {o.label}
                                </div>
                            )) : (
                                <div className="px-4 py-3 text-sm text-slate-400 text-center">Нічого не знайдено</div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// --- NomenclatureModal ---
// Props:
//   isOpen       — boolean, чи відкрита модалка
//   onClose      — fn, закрити без дій
//   onSuccess    — fn(savedItem), викликається після успішного збереження; отримує збережений запис (з unit)
//   showToast    — fn(message, type), показати повідомлення батьківського компонента
//   editingItem  — object | null, якщо передано — режим редагування
//   initialName  — string, предзаповнена назва при створенні (для швидкого додавання з інших модалок)
export function NomenclatureModal({ isOpen, onClose, onSuccess, showToast, editingItem = null, initialName = '' }) {
    const { employee } = useAuth();

    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showUnitForm, setShowUnitForm] = useState(false);
    const [newUnit, setNewUnit] = useState({ name: '', code: '' });

    const initialForm = {
        type: 'good',
        category_id: '',
        name: '',
        technical_characteristics: '',
        brand: '',
        sku: '',
        unit_id: '',
        package_name: '',
        package_multiplier: '',
        description: ''
    };
    const [formData, setFormData] = useState(initialForm);

    // Завантаження довідників (категорії, одиниці виміру)
    const loadReferenceData = useCallback(async () => {
        try {
            const [catsRes, unitsRes] = await Promise.all([
                supabase.from('categories').select('*').eq('is_active', true),
                supabase.from('units').select('*').order('name', { ascending: true })
            ]);
            if (catsRes.error) throw catsRes.error;
            if (unitsRes.error) throw unitsRes.error;
            setCategories(catsRes.data || []);
            setUnits(unitsRes.data || []);
        } catch (error) {
            showToast(`Помилка завантаження: ${error.message}`, 'error');
        }
    }, [showToast]);

    // При відкритті: завантажити довідники та заповнити форму
    useEffect(() => {
        if (!isOpen) return;
        loadReferenceData();
        if (editingItem) {
            setFormData({
                type: editingItem.type || 'good',
                category_id: editingItem.category_id || '',
                name: editingItem.name || '',
                technical_characteristics: editingItem.technical_characteristics || '',
                brand: editingItem.brand || '',
                sku: editingItem.sku || '',
                unit_id: editingItem.unit_id || '',
                package_name: editingItem.package_name || '',
                package_multiplier: editingItem.package_multiplier || '',
                description: editingItem.description || ''
            });
        } else {
            setFormData({ ...initialForm, name: initialName || '' });
        }
        setShowUnitForm(false);
        setNewUnit({ name: '', code: '' });
    }, [isOpen, editingItem, initialName]);

    const getCategoryFullName = useCallback((categoryId) => {
        let path = [];
        let currentId = categoryId;
        while (currentId) {
            const cat = categories.find(c => c.id === currentId);
            if (cat) { path.unshift(cat.name); currentId = cat.parent_id; }
            else break;
        }
        return path.join(' / ');
    }, [categories]);

    const categoryOptions = categories
        .map(c => ({ id: c.id, label: getCategoryFullName(c.id) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    const unitOptions = units.map(u => ({ id: u.id, label: `${u.name} (${u.code})` }));

    const handleGenerateSKU = () => {
        const prefix = formData.type === 'good' ? 'G-' : formData.type === 'tool' ? 'T-' : 'S-';
        const randomNum = Math.floor(100000 + Math.random() * 900000);
        setFormData(prev => ({ ...prev, sku: `${prefix}${randomNum}` }));
    };

    const handleQuickAddUnit = async () => {
        if (!newUnit.name.trim() || !newUnit.code.trim()) {
            return showToast('Введіть назву та код одиниці виміру', 'error');
        }
        try {
            const { data, error } = await supabase
                .from('units')
                .insert([{ name: newUnit.name.trim(), code: newUnit.code.trim(), created_by: employee?.id }])
                .select()
                .single();
            if (error) throw error;
            setUnits(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setFormData(prev => ({ ...prev, unit_id: data.id }));
            setShowUnitForm(false);
            setNewUnit({ name: '', code: '' });
            showToast('Одиницю виміру додано', 'success');
        } catch (error) {
            if (error.code === '23505') showToast('Такий код одиниці виміру вже існує', 'error');
            else showToast(error.message, 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.category_id) return showToast('Оберіть категорію', 'error');
        if (!formData.name.trim()) return showToast('Введіть назву позиції', 'error');
        if (formData.type !== 'service') {
            if (!formData.sku.trim()) return showToast("Артикул (SKU) обов'язковий", 'error');
            if (!formData.unit_id) return showToast('Оберіть базову одиницю виміру', 'error');
        }

        setIsSubmitting(true);
        try {
            let finalSku = formData.sku.trim();
            let finalUnitId = formData.unit_id;
            if (formData.type === 'service') {
                if (!finalSku) finalSku = `SRV-${Math.floor(100000 + Math.random() * 900000)}`;
                finalUnitId = null;
            }

            const payload = {
                type: formData.type,
                category_id: formData.category_id,
                unit_id: finalUnitId,
                name: formData.name.trim(),
                technical_characteristics: formData.type === 'good' ? (formData.technical_characteristics.trim() || null) : null,
                brand: formData.type !== 'service' ? (formData.brand.trim() || null) : null,
                sku: finalSku,
                package_name: formData.type !== 'service' && formData.package_name.trim() !== '' ? formData.package_name.trim() : null,
                package_multiplier: formData.type !== 'service' && formData.package_multiplier ? parseFloat(formData.package_multiplier) : null,
                description: formData.description.trim() || null,
                updated_by: employee?.id
            };

            let savedItem = null;
            if (editingItem) {
                const { data, error } = await supabase.from('nomenclature').update(payload).eq('id', editingItem.id).select('*, unit:units(name)').single();
                if (error) throw error;
                savedItem = data;
                showToast('Позицію оновлено', 'success');
            } else {
                payload.created_by = employee?.id;
                const { data, error } = await supabase.from('nomenclature').insert([payload]).select('*, unit:units(name)').single();
                if (error) throw error;
                savedItem = data;
                showToast('Позицію створено', 'success');
            }

            onClose();
            onSuccess(savedItem);
        } catch (error) {
            if (error.code === '23505') showToast('Позиція з таким артикулом (SKU) вже існує', 'error');
            else showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-[120]"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                        className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh] overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* HEADER */}
                        <div className="flex justify-between items-center p-4 sm:p-6 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                            <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                                <FaBox className="text-indigo-500" />
                                {editingItem ? 'Редагувати позицію' : 'Нова позиція номенклатури'}
                            </h2>
                            <button onClick={onClose} className="p-2 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors shadow-sm">
                                <FaTimes size={16} />
                            </button>
                        </div>

                        {/* BODY */}
                        <div className="overflow-y-auto flex-1 p-4 sm:p-6 custom-scrollbar">
                            <form id="nom-modal-form" onSubmit={handleSubmit} className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">

                                    {/* ТИП */}
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Тип позиції <span className="text-red-500">*</span></label>
                                        <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                                            {[
                                                { v: 'good', l: 'Товар', icon: FaBox },
                                                { v: 'tool', l: 'Інструмент', icon: FaWrench },
                                                { v: 'service', l: 'Послуга', icon: FaConciergeBell }
                                            ].map(t => (
                                                <button
                                                    key={t.v} type="button"
                                                    onClick={() => setFormData({ ...formData, type: t.v })}
                                                    className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 sm:py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${formData.type === t.v ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'}`}
                                                >
                                                    <t.icon size={14} className="hidden sm:block" /> <span>{t.l}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* КАТЕГОРІЯ */}
                                    <div className="md:col-span-2 relative z-30">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Категорія <span className="text-red-500">*</span></label>
                                        <SearchableSelect
                                            options={categoryOptions}
                                            value={formData.category_id}
                                            onChange={(val) => setFormData({ ...formData, category_id: val })}
                                            placeholder="Оберіть категорію..."
                                        />
                                    </div>

                                    {/* НАЗВА */}
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                            {formData.type === 'service' ? 'Назва послуги' : formData.type === 'tool' ? 'Назва інструменту' : 'Товарна позиція (Модель)'}
                                            <span className="text-red-500"> *</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Введіть назву..."
                                            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-800"
                                        />
                                    </div>

                                    {/* ТІЛЬКИ ДЛЯ ТОВАРІВ ТА ІНСТРУМЕНТІВ */}
                                    {formData.type !== 'service' && (
                                        <>
                                            {/* БРЕНД */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Бренд / Виробник</label>
                                                <input
                                                    type="text"
                                                    value={formData.brand}
                                                    onChange={e => setFormData({ ...formData, brand: e.target.value })}
                                                    placeholder="Напр. Deye, Risen..."
                                                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-700"
                                                />
                                            </div>

                                            {/* ТЕХНІЧНА ХАРАКТЕРИСТИКА (тільки для товару) */}
                                            {formData.type === 'good' ? (
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                                        <FaMicrochip className="text-slate-400" /> Технічна характеристика
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={formData.technical_characteristics}
                                                        onChange={e => setFormData({ ...formData, technical_characteristics: e.target.value })}
                                                        placeholder="Напр. 10, 615, 5*6..."
                                                        className="w-full px-4 py-3 bg-indigo-50/30 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-indigo-700 placeholder:text-slate-400 placeholder:font-normal"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="hidden md:block" />
                                            )}

                                            {/* АРТИКУЛ (SKU) */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Артикул (SKU) <span className="text-red-500">*</span></label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={formData.sku}
                                                        onChange={e => setFormData({ ...formData, sku: e.target.value })}
                                                        placeholder="Введіть або згенеруйте"
                                                        className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-mono uppercase"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleGenerateSKU}
                                                        title="Згенерувати автоматично"
                                                        className="px-4 py-3 bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-300 hover:border-indigo-300 rounded-xl transition-colors flex-shrink-0"
                                                    >
                                                        <FaMagic />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* БАЗОВА ОДИНИЦЯ ВИМІРУ */}
                                            <div className="relative z-20">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Базова одиниця виміру <span className="text-red-500">*</span></label>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowUnitForm(!showUnitForm)}
                                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded transition-colors"
                                                    >
                                                        {showUnitForm ? <FaTimes /> : <FaPlus />} {showUnitForm ? 'Сховати' : 'Додати нову'}
                                                    </button>
                                                </div>

                                                {!showUnitForm ? (
                                                    <SearchableSelect
                                                        options={unitOptions}
                                                        value={formData.unit_id}
                                                        onChange={(val) => setFormData({ ...formData, unit_id: val })}
                                                        placeholder="Оберіть..."
                                                    />
                                                ) : (
                                                    <div className="flex flex-col gap-2 bg-indigo-50 p-3 rounded-xl border border-indigo-100 shadow-inner">
                                                        <div className="flex gap-2">
                                                            <input
                                                                type="text"
                                                                placeholder="Назва (Штука)"
                                                                value={newUnit.name}
                                                                onChange={e => setNewUnit({ ...newUnit, name: e.target.value })}
                                                                className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none font-bold"
                                                            />
                                                            <input
                                                                type="text"
                                                                placeholder="Код (шт)"
                                                                value={newUnit.code}
                                                                onChange={e => setNewUnit({ ...newUnit, code: e.target.value })}
                                                                className="w-1/3 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none font-bold"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={handleQuickAddUnit}
                                                            className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors"
                                                        >
                                                            Зберегти в довідник
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* ФАСУВАННЯ / УПАКОВКА */}
                                            <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                                                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                                                    <FaBoxOpen className="inline mr-1 text-slate-400" /> Фасування / Кратність упаковки (Опціонально)
                                                </label>
                                                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                                    <div className="flex-1 w-full">
                                                        <input
                                                            type="text"
                                                            placeholder="Назва упаковки (уп., банка, штанга)"
                                                            value={formData.package_name}
                                                            onChange={e => setFormData({ ...formData, package_name: e.target.value })}
                                                            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-700"
                                                        />
                                                    </div>
                                                    <div className="font-black text-slate-400 hidden sm:block">=</div>
                                                    <div className="flex-1 w-full relative">
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            min="0"
                                                            placeholder="Кількість базових одиниць..."
                                                            value={formData.package_multiplier}
                                                            onChange={e => setFormData({ ...formData, package_multiplier: e.target.value })}
                                                            className="w-full pl-4 pr-16 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-indigo-700"
                                                        />
                                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">
                                                            {unitOptions.find(u => u.id === formData.unit_id)?.label.split(' ')[0] || 'баз. од.'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
                                                    Наприклад: для наконечників оберіть вище базову одиницю "шт", а тут вкажіть "уп." = "100". Для профілю: базова "м", а тут "штанга" = "3". Всі розрахунки на складі будуть вестися в базових одиницях.
                                                </p>
                                            </div>
                                        </>
                                    )}

                                    {/* ОПИС */}
                                    <div className="md:col-span-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Опис / Примітки</label>
                                        <textarea
                                            rows="2"
                                            value={formData.description}
                                            onChange={e => setFormData({ ...formData, description: e.target.value })}
                                            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm resize-none text-slate-700"
                                            placeholder="(Необов'язково)"
                                        />
                                    </div>
                                </div>
                            </form>
                        </div>

                        {/* FOOTER */}
                        <div className="p-4 sm:p-5 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-slate-50">
                            <button
                                type="button"
                                onClick={onClose}
                                className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm shadow-sm"
                            >
                                Скасувати
                            </button>
                            <button
                                form="nom-modal-form"
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full sm:w-auto px-8 py-3 sm:py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                            >
                                {isSubmitting ? 'Збереження...' : 'Зберегти позицію'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}