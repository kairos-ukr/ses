import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaSearch, FaEdit, FaBuilding, FaPhoneAlt, 
    FaUserTie, FaCheck, FaExclamationTriangle, FaTimes, FaInfoCircle, FaPowerOff
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
    
    const styles = { success: 'bg-green-600 text-white', error: 'bg-red-600 text-white' };
    const icons = { success: <FaCheck />, error: <FaExclamationTriangle /> };
    
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 right-4 z-[100]">
                    <div className={`${styles[type] || 'bg-blue-600'} rounded-lg shadow-lg p-4 flex items-center space-x-3 border border-white/10`}>
                        {icons[type] || <FaInfoCircle className="text-white" />}
                        <span className="font-medium text-sm">{message}</span>
                        <button onClick={onClose} className="ml-4 text-white/80 hover:text-white transition-colors"><FaTimes /></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

// --- СТОРІНКА ПОСТАЧАЛЬНИКІВ ---
export default function SuppliersPage() {
    const { employee, loading: authLoading } = useAuth();
    
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('active'); // active, inactive, all
    
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // Стейт форми
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingId, setEditingId] = useState(null);
    
    const initialForm = {
        name: '',
        phone: '',
        contact_person: '',
        notes: '',
        is_active: true
    };
    const [formData, setFormData] = useState(initialForm);

    // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('suppliers')
                .select('*')
                .order('name', { ascending: true });
                
            if (error) throw error;
            setSuppliers(data || []);
        } catch (error) {
            showToast(`Помилка: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (!authLoading) loadData();
    }, [authLoading, loadData]);

    // --- ОБРОБНИКИ ДІЙ ---
    const handleAddClick = () => {
        setEditingId(null);
        setFormData(initialForm);
        setShowModal(true);
    };

    const handleEditClick = (item) => {
        setEditingId(item.id);
        setFormData({
            name: item.name,
            phone: item.phone || '',
            contact_person: item.contact_person || '',
            notes: item.notes || '',
            is_active: item.is_active
        });
        setShowModal(true);
    };

    const handleToggleStatus = async (item) => {
        const confirmMsg = item.is_active 
            ? `Ви дійсно хочете приховати (деактивувати) постачальника "${item.name}"?` 
            : `Зробити постачальника "${item.name}" знову активним?`;
            
        if (!window.confirm(confirmMsg)) return;

        try {
            const { error } = await supabase
                .from('suppliers')
                .update({ is_active: !item.is_active, updated_by: employee?.id })
                .eq('id', item.id);
                
            if (error) throw error;
            showToast(`Статус постачальника оновлено`, 'success');
            loadData();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Валідація
        if (!formData.name.trim()) return showToast('Введіть назву компанії/ФОПа', 'error');

        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                phone: formData.phone.trim() || null,
                email: null, // Жорстко передаємо null, щоб база ніколи не сварилася
                contact_person: formData.contact_person.trim() || null,
                notes: formData.notes.trim() || null,
                is_active: formData.is_active,
                updated_by: employee?.id
            };

            if (editingId) {
                const { error } = await supabase.from('suppliers').update(payload).eq('id', editingId);
                if (error) throw error;
                showToast('Дані постачальника оновлено', 'success');
            } else {
                payload.created_by = employee?.id;
                const { error } = await supabase.from('suppliers').insert([payload]);
                if (error) throw error;
                showToast('Нового постачальника додано', 'success');
            }

            setShowModal(false);
            loadData();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- ФІЛЬТРАЦІЯ ТА ВІДОБРАЖЕННЯ ---
    const filteredSuppliers = suppliers.filter(item => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = item.name.toLowerCase().includes(term) || 
                              (item.contact_person && item.contact_person.toLowerCase().includes(term)) ||
                              (item.phone && item.phone.toLowerCase().includes(term));
                              
        const matchesStatus = statusFilter === 'all' 
            ? true 
            : statusFilter === 'active' ? item.is_active : !item.is_active;
            
        return matchesSearch && matchesStatus;
    });

    if (authLoading) return <div className="p-8 text-center text-slate-500">Завантаження...</div>;

    return (
        <Layout>
            <div className="p-4 sm:p-8 max-w-[1400px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">
                <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

                {/* HEADER */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 flex-none">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Постачальники</h1>
                        <p className="text-slate-500 text-sm mt-1">Керування базою контрагентів для закупівель</p>
                    </div>
                    <button onClick={handleAddClick} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all w-full sm:w-auto">
                        <FaPlus /> <span>Додати постачальника</span>
                    </button>
                </div>

                {/* FILTERS */}
                <div className="flex flex-col md:flex-row gap-3 mb-6">
                    <div className="relative flex-1">
                        <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input 
                            type="text" 
                            placeholder="Пошук за назвою чи контактами..." 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition shadow-sm text-sm outline-none"
                        />
                    </div>
                    <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm overflow-x-auto hide-scrollbar">
                        {[
                            {v:'active', l:'Активні'}, 
                            {v:'inactive', l:'Приховані'}, 
                            {v:'all', l:'Всі'}
                        ].map(t => (
                            <button 
                                key={t.v} 
                                onClick={() => setStatusFilter(t.v)} 
                                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === t.v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                            >
                                {t.l}
                            </button>
                        ))}
                    </div>
                </div>

                {/* TABLE */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
                    {loading ? (
                        <div className="p-8 flex justify-center"><div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div></div>
                    ) : filteredSuppliers.length === 0 ? (
                        <div className="text-center py-24 flex-1 flex flex-col items-center justify-center">
                            <FaBuilding className="text-6xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-600">Нічого не знайдено</h3>
                            <p className="text-slate-400 text-sm mt-1">Змініть критерії пошуку або додайте нового постачальника.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse min-w-[900px]">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                                        <th className="px-6 py-4 font-bold">Компанія / ФОП</th>
                                        <th className="px-6 py-4 font-bold">Контактна особа</th>
                                        <th className="px-6 py-4 font-bold">Телефон</th>
                                        <th className="px-6 py-4 font-bold w-1/3">Примітки</th>
                                        <th className="px-6 py-4 font-bold text-right">Дії</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredSuppliers.map(item => (
                                        <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors group ${!item.is_active ? 'bg-slate-50/50' : ''}`}>
                                            <td className="px-6 py-4">
                                                <div className={`font-bold text-base flex items-center gap-2 ${!item.is_active ? 'text-slate-500' : 'text-slate-800'}`}>
                                                    <FaBuilding className={item.is_active ? "text-indigo-400" : "text-slate-300"} />
                                                    {item.name}
                                                </div>
                                                {!item.is_active && (
                                                    <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase font-bold mt-1.5 inline-block">
                                                        Неактивний
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {item.contact_person ? (
                                                    <div className="flex items-center gap-2 text-sm text-slate-700">
                                                        <FaUserTie className="text-slate-400" />
                                                        <span className="font-medium">{item.contact_person}</span>
                                                    </div>
                                                ) : <span className="text-slate-400 text-sm">—</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                {item.phone ? (
                                                    <div className="flex items-center gap-2 text-sm text-slate-600">
                                                        <FaPhoneAlt className="text-slate-400 text-xs" />
                                                        <a href={`tel:${item.phone}`} className="hover:text-indigo-600 transition-colors">{item.phone}</a>
                                                    </div>
                                                ) : <span className="text-slate-400 text-sm">—</span>}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs text-slate-500 line-clamp-2 max-w-[350px]" title={item.notes}>
                                                    {item.notes || '—'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button onClick={() => handleEditClick(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Редагувати">
                                                        <FaEdit size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleToggleStatus(item)} 
                                                        className={`p-2 rounded-lg transition-colors ${item.is_active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'}`} 
                                                        title={item.is_active ? "Деактивувати" : "Активувати"}
                                                    >
                                                        <FaPowerOff size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* MODAL FORM */}
                <AnimatePresence>
                    {showModal && (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                        >
                            <motion.div 
                                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} 
                                className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col" 
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                        <FaBuilding className="text-indigo-500" />
                                        {editingId ? 'Редагувати постачальника' : 'Новий постачальник'}
                                    </h2>
                                    <button onClick={() => setShowModal(false)} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"><FaTimes size={16} /></button>
                                </div>

                                <div className="overflow-y-auto flex-1 pr-2 custom-scrollbar">
                                    <form id="supplier-form" onSubmit={handleSubmit} className="space-y-5 pb-4">
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Назва компанії / ФОП <span className="text-red-500">*</span></label>
                                            <input type="text" autoFocus value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Напр. ТОВ Вольтмаркет" className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-800" />
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Контактна особа</label>
                                                <div className="relative">
                                                    <FaUserTie className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input type="text" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} placeholder="ПІБ менеджера" className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm" />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Телефон</label>
                                                <div className="relative">
                                                    <FaPhoneAlt className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input type="tel" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+380..." className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm" />
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Примітки / Реквізити</label>
                                            <textarea rows="3" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm resize-none" placeholder="Додаткова інформація (адреса, реквізити, email тощо)..." />
                                        </div>

                                        <div className="flex items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                            <input 
                                                type="checkbox" 
                                                id="is_active" 
                                                checked={formData.is_active} 
                                                onChange={e => setFormData({ ...formData, is_active: e.target.checked })} 
                                                className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                            />
                                            <label htmlFor="is_active" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                                                Активний постачальник (відображається в системі)
                                            </label>
                                        </div>

                                    </form>
                                </div>

                                <div className="pt-5 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 mt-4">
                                    <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-sm">
                                        Скасувати
                                    </button>
                                    <button form="supplier-form" type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2 text-sm">
                                        {isSubmitting ? 'Збереження...' : 'Зберегти'}
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