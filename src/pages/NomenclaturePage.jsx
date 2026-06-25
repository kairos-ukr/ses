import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaSearch, FaEdit, 
    FaBox, FaWrench, FaConciergeBell, FaCheck, FaExclamationTriangle, FaTimes, FaInfoCircle,
    FaChevronDown, FaMagic, FaMicrochip, FaBoxOpen
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import Layout from '../Layout';
import { useAuth } from '../AuthProvider';

// --- ДОПОМІЖНІ КОМПОНЕНТИ ---
const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(onClose, 4000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);
    
    const styles = { success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white' };
    const icons = { success: <FaCheck />, error: <FaExclamationTriangle /> };
    
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 right-4 z-[100] px-4 w-full sm:w-auto sm:px-0">
                    <div className={`${styles[type] || 'bg-blue-600'} rounded-xl shadow-2xl p-4 flex items-center justify-between border border-white/10`}>
                        <div className="flex items-center space-x-3">
                            {icons[type] || <FaInfoCircle className="text-white flex-shrink-0" />}
                            <span className="font-bold text-sm">{message}</span>
                        </div>
                        <button onClick={onClose} className="ml-4 text-white/80 hover:text-white transition-colors flex-shrink-0"><FaTimes /></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

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
    const displayValue = selectedOption ? selectedOption.label : '';
    const filteredOptions = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div 
                className={`w-full px-4 py-3 bg-white border rounded-xl flex justify-between items-center transition-shadow shadow-sm text-sm ${disabled ? 'bg-slate-50 cursor-not-allowed border-slate-200' : 'cursor-pointer border-slate-300 hover:border-indigo-300'}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <span className={`truncate pr-4 ${selectedOption ? 'text-slate-800 font-bold' : 'text-slate-400'}`}>
                    {selectedOption ? displayValue : placeholder}
                </span>
                <FaChevronDown className={`text-slate-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }}
                        className="absolute z-[80] w-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-60 flex flex-col overflow-hidden"
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

export default function NomenclaturePage() {
    const { employee, loading: authLoading } = useAuth();
    
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
    
    const [loading, setLoading] = useState(true);
    
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    
    const initialForm = {
        type: 'good', 
        category_id: '',
        name: '',
        technical_characteristics: '',
        brand: '',
        sku: '',
        unit_id: '',
        package_name: '', // Нове поле: Назва упаковки
        package_multiplier: '', // Нове поле: Множник (Кількість в упаковці)
        description: ''
    };
    const [formData, setFormData] = useState(initialForm);

    const [showUnitForm, setShowUnitForm] = useState(false);
    const [newUnit, setNewUnit] = useState({ name: '', code: '' });

    // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: catsData, error: catsError } = await supabase.from('categories').select('*').eq('is_active', true);
            if (catsError) throw catsError;
            setCategories(catsData || []);

            const { data: unitsData, error: unitsError } = await supabase.from('units').select('*').order('name', { ascending: true });
            if (unitsError) throw unitsError;
            setUnits(unitsData || []);

            const { data: nomData, error: nomError } = await supabase
                .from('nomenclature')
                .select(`*, unit:units(name, code), category:categories(name)`)
                .order('created_at', { ascending: false });
            if (nomError) throw nomError;
            setItems(nomData || []);

        } catch (error) {
            showToast(`Помилка: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (!authLoading) loadData();
    }, [authLoading, loadData]);

    const getCategoryFullName = (categoryId) => {
        let path = [];
        let currentId = categoryId;
        while (currentId) {
            const cat = categories.find(c => c.id === currentId);
            if (cat) {
                path.unshift(cat.name);
                currentId = cat.parent_id;
            } else break;
        }
        return path.join(' / ');
    };

    const categoryOptions = categories.map(c => ({ id: c.id, label: getCategoryFullName(c.id) })).sort((a, b) => a.label.localeCompare(b.label));
    const unitOptions = units.map(u => ({ id: u.id, label: `${u.name} (${u.code})` }));

    // --- ОБРОБНИКИ ДІЙ ---
    const handleAddClick = () => {
        setEditingId(null);
        setFormData(initialForm);
        setShowUnitForm(false);
        setShowModal(true);
    };

    const handleEditClick = (item) => {
        setEditingId(item.id);
        setFormData({
            type: item.type,
            category_id: item.category_id,
            name: item.name,
            technical_characteristics: item.technical_characteristics || '',
            brand: item.brand || '',
            sku: item.sku || '',
            unit_id: item.unit_id || '',
            package_name: item.package_name || '',
            package_multiplier: item.package_multiplier || '',
            description: item.description || ''
        });
        setShowUnitForm(false);
        setShowModal(true);
    };

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
            if (!formData.sku.trim()) return showToast('Артикул (SKU) обов\'язковий', 'error');
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

            if (editingId) {
                const { error } = await supabase.from('nomenclature').update(payload).eq('id', editingId);
                if (error) throw error;
                showToast('Позицію оновлено', 'success');
            } else {
                payload.created_by = employee?.id;
                const { error } = await supabase.from('nomenclature').insert([payload]);
                if (error) throw error;
                showToast('Позицію створено', 'success');
            }

            setShowModal(false);
            loadData();
        } catch (error) {
            if (error.code === '23505') showToast('Позиція з таким артикулом (SKU) вже існує', 'error');
            else showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- ФІЛЬТРАЦІЯ ТА ПАГІНАЦІЯ ---
    const filteredItems = items.filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
            item.name.toLowerCase().includes(term) || 
            (item.brand && item.brand.toLowerCase().includes(term)) ||
            (item.sku && item.sku.toLowerCase().includes(term));
            
        const matchesType = typeFilter === 'all' || item.type === typeFilter;
        return matchesSearch && matchesType;
    });

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); }, [searchTerm, typeFilter]);

    const getTypeInfo = (type) => ({
        'good': { label: 'Товар', icon: FaBox, color: 'text-blue-600 bg-blue-50 border-blue-200' },
        'tool': { label: 'Інструмент', icon: FaWrench, color: 'text-amber-600 bg-amber-50 border-amber-200' },
        'service': { label: 'Послуга', icon: FaConciergeBell, color: 'text-purple-600 bg-purple-50 border-purple-200' }
    }[type] || { label: 'Невідомо', icon: FaBox, color: 'text-slate-600 bg-slate-50 border-slate-200' });

    if (authLoading) return <div className="p-8 text-center text-slate-500">Завантаження...</div>;

    return (
        <Layout>
            <div className="p-4 sm:p-8 max-w-[1600px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">
                <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

                {/* HEADER */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8 flex-none">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Номенклатура</h1>
                        <p className="text-slate-500 text-sm mt-1">Довідник товарів, інструментів та послуг</p>
                    </div>
                    <button onClick={handleAddClick} className="flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all w-full sm:w-auto">
                        <FaPlus /> <span>Додати позицію</span>
                    </button>
                </div>

                {/* FILTERS */}
                <div className="flex flex-col md:flex-row gap-3 mb-6 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="relative flex-1">
                        <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input 
                            type="text" 
                            placeholder="Пошук за назвою, брендом або артикулом..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            className="w-full pl-11 pr-4 py-3 sm:py-2.5 bg-slate-50 border border-transparent rounded-xl focus:bg-white focus:border-indigo-300 transition shadow-sm text-sm outline-none"
                        />
                    </div>
                    <div className="flex bg-slate-50 rounded-xl p-1 overflow-x-auto hide-scrollbar border border-slate-100">
                        {[{v:'all', l:'Всі'}, {v:'good', l:'Товари'}, {v:'tool', l:'Інструменти'}, {v:'service', l:'Послуги'}].map(t => (
                            <button 
                                key={t.v} 
                                onClick={() => setTypeFilter(t.v)} 
                                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors flex-1 sm:flex-none ${typeFilter === t.v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                {t.l}
                            </button>
                        ))}
                    </div>
                </div>

                {/* TABLE */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col mb-4">
                    {loading ? (
                        <div className="p-8 flex justify-center"><div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div></div>
                    ) : paginatedItems.length === 0 ? (
                        <div className="text-center py-24 flex-1 flex flex-col items-center justify-center">
                            <FaBox className="text-6xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-600">Нічого не знайдено</h3>
                            <p className="text-slate-400 text-sm mt-1">Змініть критерії пошуку або додайте нову позицію.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[900px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                                        <th className="px-6 py-4 font-bold">Назва</th>
                                        <th className="px-6 py-4 font-bold">Бренд</th>
                                        <th className="px-6 py-4 font-bold">Категорія</th>
                                        <th className="px-6 py-4 font-bold">Тип</th>
                                        <th className="px-6 py-4 font-bold">Баз. од. / Упаковка</th>
                                        <th className="px-6 py-4 font-bold text-right">Дії</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {paginatedItems.map(item => {
                                        const typeInfo = getTypeInfo(item.type);
                                        const TypeIcon = typeInfo.icon;
                                        
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-800 text-sm leading-tight">{item.name}</div>
                                                    {item.technical_characteristics && (
                                                        <div className="text-[11px] font-bold text-indigo-600 mt-1 flex items-center gap-1 w-fit bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                                            <FaMicrochip className="text-indigo-400" />
                                                            {item.technical_characteristics}
                                                        </div>
                                                    )}
                                                    {item.sku && !item.sku.startsWith('SRV-') && <div className="text-[10px] text-slate-400 mt-1.5 font-mono uppercase tracking-widest">SKU: {item.sku}</div>}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-sm font-medium text-slate-600">{item.brand || '—'}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-xs font-bold text-slate-500 max-w-[250px] truncate bg-slate-50 inline-block px-2 py-1 rounded border border-slate-100" title={getCategoryFullName(item.category_id)}>
                                                        {getCategoryFullName(item.category_id)}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold border shadow-sm ${typeInfo.color}`}>
                                                        <TypeIcon size={10} />
                                                        <span>{typeInfo.label}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded w-fit border border-slate-200">
                                                        {item.unit?.name || '—'}
                                                    </div>
                                                    {/* ВІДОБРАЖЕННЯ ФАСУВАННЯ */}
                                                    {item.package_name && item.package_multiplier && (
                                                        <div className="text-[10px] text-indigo-600 font-bold mt-1.5 flex items-center gap-1">
                                                            <FaBoxOpen className="text-indigo-400"/>
                                                            1 {item.package_name} = {item.package_multiplier} {item.unit?.name}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => handleEditClick(item)} className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                                                        <FaEdit size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* ПАГІНАЦІЯ */}
                {totalPages > 1 && (
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 sm:px-6 sm:py-3 rounded-xl border border-slate-200 shadow-sm flex-none">
                        <span className="text-xs sm:text-sm text-slate-500 font-medium text-center">
                            Показано <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}</span> із <span className="font-bold text-slate-800">{filteredItems.length}</span>
                        </span>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2.5 sm:py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm flex-1 sm:flex-none text-center">Попередня</button>
                            <span className="text-sm font-bold text-slate-700 mx-2">{currentPage} / {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2.5 sm:py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm flex-1 sm:flex-none text-center">Наступна</button>
                        </div>
                    </div>
                )}

                {/* MODAL FORM */}
                <AnimatePresence>
                    {showModal && (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50" 
                        >
                            <motion.div 
                                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} 
                                className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[90vh] overflow-hidden" 
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center p-4 sm:p-6 bg-slate-50 border-b border-slate-100 flex-shrink-0">
                                    <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                                        <FaBox className="text-indigo-500"/>
                                        {editingId ? 'Редагувати позицію' : 'Нова позиція'}
                                    </h2>
                                    <button onClick={() => setShowModal(false)} className="p-2 bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors shadow-sm"><FaTimes size={16} /></button>
                                </div>

                                <div className="overflow-y-auto flex-1 p-4 sm:p-6 custom-scrollbar">
                                    <form id="nom-form" onSubmit={handleSubmit} className="space-y-6">
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                                            {/* ТИП */}
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Тип позиції <span className="text-red-500">*</span></label>
                                                <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                                                    {[
                                                        {v:'good', l:'Товар', icon: FaBox}, 
                                                        {v:'tool', l:'Інструмент', icon: FaWrench}, 
                                                        {v:'service', l:'Послуга', icon: FaConciergeBell}
                                                    ].map(t => (
                                                        <button 
                                                            key={t.v} type="button"
                                                            onClick={() => setFormData({...formData, type: t.v})}
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
                                                    onChange={(val) => setFormData({...formData, category_id: val})} 
                                                    placeholder="Оберіть категорію..." 
                                                />
                                            </div>

                                            {/* НАЗВА */}
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                                    {formData.type === 'service' ? 'Назва послуги' : formData.type === 'tool' ? 'Назва інструменту' : 'Товарна позиція (Модель)'} 
                                                    <span className="text-red-500"> *</span>
                                                </label>
                                                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Введіть назву..." className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-800" />
                                            </div>

                                            {/* ТІЛЬКИ ДЛЯ ТОВАРІВ ТА ІНСТРУМЕНТІВ */}
                                            {formData.type !== 'service' && (
                                                <>
                                                    {/* БРЕНД */}
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Бренд / Виробник</label>
                                                        <input type="text" value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} placeholder="Напр. Deye, Risen..." className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-700" />
                                                    </div>

                                                    {/* ХАРАКТЕРИСТИКА (ТІЛЬКИ ДЛЯ ТОВАРУ) */}
                                                    {formData.type === 'good' ? (
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                                                <FaMicrochip className="text-slate-400"/> Технічна характеристика
                                                            </label>
                                                            <input 
                                                                type="text" 
                                                                value={formData.technical_characteristics} 
                                                                onChange={e => setFormData({...formData, technical_characteristics: e.target.value})} 
                                                                placeholder="Напр. 10, 615, 5*6..." 
                                                                className="w-full px-4 py-3 bg-indigo-50/30 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-indigo-700 placeholder:text-slate-400 placeholder:font-normal" 
                                                            />
                                                        </div>
                                                    ) : (
                                                        <div className="hidden md:block"></div>
                                                    )}

                                                    {/* АРТИКУЛ (SKU) */}
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Артикул (SKU) <span className="text-red-500">*</span></label>
                                                        <div className="flex gap-2">
                                                            <input type="text" value={formData.sku} onChange={e => setFormData({...formData, sku: e.target.value})} placeholder="Введіть або згенеруйте" className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-mono uppercase" />
                                                            <button type="button" onClick={handleGenerateSKU} title="Згенерувати автоматично" className="px-4 py-3 bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 border border-slate-300 hover:border-indigo-300 rounded-xl transition-colors">
                                                                <FaMagic />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* БАЗОВА ОДИНИЦЯ ВИМІРУ */}
                                                    <div className="relative z-20">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Базова одиниця виміру <span className="text-red-500">*</span></label>
                                                            <button type="button" onClick={() => setShowUnitForm(!showUnitForm)} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded transition-colors">
                                                                {showUnitForm ? <FaTimes /> : <FaPlus />} {showUnitForm ? 'Сховати' : 'Додати нову'}
                                                            </button>
                                                        </div>
                                                        
                                                        {!showUnitForm ? (
                                                            <SearchableSelect 
                                                                options={unitOptions} 
                                                                value={formData.unit_id} 
                                                                onChange={(val) => setFormData({...formData, unit_id: val})} 
                                                                placeholder="Оберіть..." 
                                                            />
                                                        ) : (
                                                            <div className="flex flex-col gap-2 bg-indigo-50 p-3 rounded-xl border border-indigo-100 shadow-inner">
                                                                <div className="flex gap-2">
                                                                    <div className="flex-1">
                                                                        <input type="text" placeholder="Назва (Штука)" value={newUnit.name} onChange={e => setNewUnit({...newUnit, name: e.target.value})} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none font-bold" />
                                                                    </div>
                                                                    <div className="w-1/3">
                                                                        <input type="text" placeholder="Код (шт)" value={newUnit.code} onChange={e => setNewUnit({...newUnit, code: e.target.value})} className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm outline-none font-bold" />
                                                                    </div>
                                                                </div>
                                                                <button type="button" onClick={handleQuickAddUnit} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-700 transition-colors">
                                                                    Зберегти в довідник
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* ФАСУВАННЯ / УПАКОВКА (НОВИЙ БЛОК) */}
                                                    <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                                                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                                                            <FaBoxOpen className="inline mr-1 text-slate-400" /> Фасування / Кратність упаковки (Опціонально)
                                                        </label>
                                                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                                             <div className="flex-1 w-full relative z-10">
                                                                  <input 
                                                                    type="text" 
                                                                    placeholder="Назва упаковки (уп., банка, штанга)" 
                                                                    value={formData.package_name} 
                                                                    onChange={e => setFormData({...formData, package_name: e.target.value})} 
                                                                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-700" 
                                                                  />
                                                             </div>
                                                             <div className="font-black text-slate-400 hidden sm:block">=</div>
                                                             <div className="flex-1 w-full relative z-10">
                                                                  <input 
                                                                    type="number" 
                                                                    step="0.001" 
                                                                    min="0"
                                                                    placeholder="Кількість базових одиниць..." 
                                                                    value={formData.package_multiplier} 
                                                                    onChange={e => setFormData({...formData, package_multiplier: e.target.value})} 
                                                                    className="w-full pl-4 pr-16 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-indigo-700" 
                                                                  />
                                                                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">
                                                                      {unitOptions.find(u => u.id === formData.unit_id)?.label.split(' ')[0] || 'баз. од.'}
                                                                  </span>
                                                             </div>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">Наприклад: для наконечників оберіть вище базову одиницю "шт", а тут вкажіть "уп." = "100". Для профілю: базова "м", а тут "штанга" = "3". Всі розрахунки на складі будуть вестися в базових одиницях.</p>
                                                    </div>
                                                </>
                                            )}

                                            {/* ОПИС */}
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Опис / Примітки</label>
                                                <textarea rows="2" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm resize-none text-slate-700" placeholder="(Необов'язково)" />
                                            </div>
                                        </div>
                                    </form>
                                </div>

                                {/* ФІКСОВАНИЙ ПІДВАЛ З КНОПКАМИ */}
                                <div className="p-4 sm:p-5 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-slate-50">
                                    <button type="button" onClick={() => setShowModal(false)} className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm shadow-sm">
                                        Скасувати
                                    </button>
                                    <button form="nom-form" type="submit" disabled={isSubmitting} className="w-full sm:w-auto px-8 py-3 sm:py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2 text-sm">
                                        {isSubmitting ? 'Збереження...' : 'Зберегти позицію'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Layout>
    );
}