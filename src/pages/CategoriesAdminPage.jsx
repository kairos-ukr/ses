import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaEdit, FaTrash, FaChevronRight, FaChevronDown, 
    FaFolderOpen, FaFolder, FaCheck, FaExclamationTriangle, FaTimes, FaInfoCircle, FaUndo
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

// Системне модальне вікно для підтвердження видалення
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-4">
                            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                                <FaExclamationTriangle className="h-6 w-6 text-red-600" />
                            </div>
                            <div className="mt-0 text-left">
                                <h3 className="text-lg leading-6 font-bold text-slate-900">{title}</h3>
                                <div className="mt-2">
                                    <p className="text-sm text-slate-500">{message}</p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex flex-row-reverse gap-3">
                            <button type="button" className="w-full inline-flex justify-center rounded-xl shadow-sm px-5 py-2.5 bg-red-600 text-sm font-bold text-white hover:bg-red-700 transition-colors sm:w-auto" onClick={() => { onConfirm(); onClose(); }}>
                                Підтвердити
                            </button>
                            <button type="button" className="w-full inline-flex justify-center rounded-xl border border-slate-300 shadow-sm px-5 py-2.5 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors sm:w-auto" onClick={onClose}>
                                Скасувати
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// --- РЕКУРСИВНИЙ КОМПОНЕНТ ДЛЯ ДЕРЕВА КАТЕГОРІЙ ---
const CategoryNode = ({ category, level, onAddChild, onEdit, onDelete, onRestore, expandedIds, toggleNode }) => {
    const isExpanded = expandedIds.includes(category.id);
    const hasChildren = category.children && category.children.length > 0;

    return (
        <div className="w-full">
            <div 
                className={`group flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${!category.is_active ? 'bg-slate-50/50' : ''}`}
                style={{ paddingLeft: `${level * 24 + 12}px` }}
            >
                <div className={`flex items-center gap-3 ${!category.is_active ? 'opacity-60' : ''}`}>
                    <button 
                        onClick={() => toggleNode(category.id)} 
                        className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${hasChildren ? 'text-slate-500 hover:bg-slate-200' : 'text-transparent cursor-default'}`}
                        disabled={!hasChildren}
                    >
                        {hasChildren ? (isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />) : <span className="w-2 h-2 rounded-full bg-slate-300"></span>}
                    </button>
                    
                    <div className={!category.is_active ? "text-slate-400" : "text-indigo-500"}>
                        {isExpanded ? <FaFolderOpen size={18} /> : <FaFolder size={18} />}
                    </div>
                    
                    <span className="font-medium text-slate-700">{category.name}</span>
                    
                    {!category.is_active && (
                        <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase font-bold ml-2 shadow-sm">
                            Приховано
                        </span>
                    )}
                </div>

                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    <button onClick={() => onAddChild(category)} title="Додати підкатегорію" className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                        <FaPlus size={14} />
                    </button>
                    <button onClick={() => onEdit(category)} title="Редагувати" className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors">
                        <FaEdit size={14} />
                    </button>
                    
                    {category.is_active ? (
                        <button onClick={() => onDelete(category)} title="Приховати (Деактивувати)" className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <FaTrash size={14} />
                        </button>
                    ) : (
                        <button onClick={() => onRestore(category)} title="Відновити (Зробити активною)" className="w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                            <FaUndo size={14} />
                        </button>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {isExpanded && hasChildren && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-l-2 border-slate-100 ml-6">
                        {category.children.map(child => (
                            <CategoryNode 
                                key={child.id} 
                                category={child} 
                                level={level + 1} 
                                onAddChild={onAddChild} 
                                onEdit={onEdit} 
                                onDelete={onDelete}
                                onRestore={onRestore}
                                expandedIds={expandedIds}
                                toggleNode={toggleNode}
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// --- ОСНОВНА СТОРІНКА ---
export default function CategoriesAdminPage() {
    const { isAdmin, loading: authLoading } = useAuth();
    
    const [categories, setCategories] = useState([]);
    const [expandedIds, setExpandedIds] = useState([]); // Стейт для збереження розгорнутих папок
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState({ id: null, parent_id: null, name: '', is_active: true, sort_order: 0 });
    const [parentNameContext, setParentNameContext] = useState('');
    
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    const toggleNode = useCallback((id) => {
        setExpandedIds(prev => 
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    }, []);

    // 1. Завантаження даних
    const loadCategories = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('categories')
                .select('*')
                .order('sort_order', { ascending: true })
                .order('name', { ascending: true });

            if (error) throw error;

            // Будуємо дерево категорій на льоту (Включаючи приховані)
            const buildTree = (items) => {
                const map = {};
                const roots = [];

                items.forEach(item => {
                    map[item.id] = { ...item, children: [] };
                });

                items.forEach(item => {
                    if (item.parent_id && map[item.parent_id]) {
                        map[item.parent_id].children.push(map[item.id]);
                    } else if (!item.parent_id) {
                        roots.push(map[item.id]);
                    }
                });
                return roots;
            };

            setCategories(buildTree(data || []));
        } catch (error) {
            showToast(`Помилка завантаження: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (!authLoading && isAdmin) {
            loadCategories();
        }
    }, [authLoading, isAdmin, loadCategories]);

    if (authLoading) return <div className="p-8 text-center text-slate-500">Завантаження...</div>;
    if (!isAdmin) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-full min-h-[calc(100vh-100px)]">
                    <div className="text-center p-8 bg-red-50 rounded-2xl border border-red-100 max-w-md shadow-sm">
                        <FaExclamationTriangle className="text-red-500 text-5xl mx-auto mb-4" />
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">Доступ заборонено</h2>
                        <p className="text-slate-600 text-sm">Ця сторінка доступна лише для керівництва.</p>
                    </div>
                </div>
            </Layout>
        );
    }

    // 2. Обробники дій
    const handleAddRoot = () => {
        setFormData({ id: null, parent_id: null, name: '', is_active: true, sort_order: 0 });
        setParentNameContext('Коренева категорія (верхній рівень)');
        setShowModal(true);
    };

    const handleAddChild = (parent) => {
        setFormData({ id: null, parent_id: parent.id, name: '', is_active: true, sort_order: 0 });
        setParentNameContext(parent.name);
        
        // Автоматично розгортаємо батьківську папку
        if (!expandedIds.includes(parent.id)) {
            setExpandedIds(prev => [...prev, parent.id]);
        }
        
        setShowModal(true);
    };

    const handleEdit = (category) => {
        setFormData({ id: category.id, parent_id: category.parent_id, name: category.name, is_active: category.is_active, sort_order: category.sort_order });
        setParentNameContext(category.parent_id ? 'Редагування підкатегорії' : 'Редагування кореневої категорії');
        setShowModal(true);
    };

    // Обробник видалення (Деактивація) із кастомним модальним вікном
    const handleDelete = (category) => {
        setConfirmModal({
            isOpen: true,
            title: "Приховати категорію",
            message: `Ви впевнені, що хочете приховати категорію "${category.name}"? Вона не буде доступна для вибору при створенні нової номенклатури.`,
            onConfirm: async () => {
                try {
                    const { error } = await supabase.from('categories').update({ is_active: false }).eq('id', category.id);
                    if (error) throw error;
                    showToast('Категорію приховано', 'success');
                    loadCategories();
                } catch (error) {
                    showToast(error.message, 'error');
                }
            }
        });
    };

    // Обробник відновлення
    const handleRestore = async (category) => {
        try {
            const { error } = await supabase.from('categories').update({ is_active: true }).eq('id', category.id);
            if (error) throw error;
            showToast('Категорію успішно відновлено', 'success');
            loadCategories();
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) return showToast('Введіть назву категорії', 'error');
        
        setIsSubmitting(true);
        try {
            const payload = {
                name: formData.name.trim(),
                parent_id: formData.parent_id,
                is_active: formData.is_active, 
                sort_order: formData.sort_order
            };

            if (formData.id) {
                // Оновлення
                const { error } = await supabase.from('categories').update(payload).eq('id', formData.id);
                if (error) throw error;
                showToast('Категорію оновлено', 'success');
            } else {
                // Створення
                const { error } = await supabase.from('categories').insert([payload]);
                if (error) throw error;
                showToast('Категорію створено', 'success');
            }
            
            setShowModal(false);
            loadCategories(); // Оновлюємо дані, стейт розгорнутих папок зберігається!
        } catch (error) {
            if (error.code === '23505') {
                showToast('Категорія з такою назвою вже існує на цьому рівні', 'error');
            } else {
                showToast(error.message, 'error');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout>
            <div className="p-4 sm:p-8 max-w-[1200px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">
                <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />
                
                {/* Кастомне модальне вікно для підтверджень */}
                <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} />

                {/* --- HEADER --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8 flex-none">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Довідник категорій</h1>
                        <p className="text-slate-500 text-sm mt-1">Управління номенклатурними групами складу</p>
                    </div>
                    <button onClick={handleAddRoot} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all w-full sm:w-auto">
                        <FaPlus /> <span>Створити розділ</span>
                    </button>
                </div>

                {/* --- TREE CONTAINER --- */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-2 sm:p-6 flex-1 mb-6">
                    {loading ? (
                        <div className="animate-pulse space-y-4">
                            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-50 rounded-xl w-full border border-slate-100"></div>)}
                        </div>
                    ) : categories.length === 0 ? (
                        <div className="text-center py-24 border border-dashed border-slate-300 rounded-xl">
                            <FaFolderOpen className="mx-auto text-5xl text-slate-300 mb-4" />
                            <h3 className="text-lg font-bold text-slate-600">Дерево категорій порожнє</h3>
                            <p className="text-slate-400 text-sm mb-6">Створіть перший кореневий розділ, щоб почати наповнення</p>
                            <button onClick={handleAddRoot} className="text-indigo-600 font-bold hover:text-indigo-700 transition-colors">Створити першу категорію</button>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {categories.map(rootCat => (
                                <CategoryNode 
                                    key={rootCat.id} 
                                    category={rootCat} 
                                    level={0} 
                                    onAddChild={handleAddChild} 
                                    onEdit={handleEdit} 
                                    onDelete={handleDelete}
                                    onRestore={handleRestore}
                                    expandedIds={expandedIds}
                                    toggleNode={toggleNode}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* --- MODAL FORM --- */}
                <AnimatePresence>
                    {showModal && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowModal(false)}>
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                                <div className="mb-6 flex justify-between items-center">
                                    <h2 className="text-xl font-bold text-slate-800">{formData.id ? 'Редагувати' : 'Нова категорія'}</h2>
                                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-full transition-colors"><FaTimes size={16} /></button>
                                </div>

                                <form onSubmit={handleSubmit} className="space-y-5">
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                                        <p className="text-xs text-slate-500 font-bold uppercase mb-1">Батьківський рівень:</p>
                                        <p className="text-sm font-medium text-slate-800 flex items-center gap-2">
                                            <FaFolder className="text-indigo-400" /> {parentNameContext}
                                        </p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Назва категорії <span className="text-red-500">*</span></label>
                                        <input 
                                            type="text" 
                                            autoFocus
                                            value={formData.name} 
                                            onChange={e => setFormData({ ...formData, name: e.target.value })} 
                                            className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow shadow-sm text-sm font-medium text-slate-800" 
                                            placeholder="Наприклад: Інвертори мережеві"
                                        />
                                    </div>

                                    <div className="flex items-center gap-3 pt-2 pl-1">
                                        <input 
                                            type="checkbox" 
                                            id="is_active" 
                                            checked={formData.is_active} 
                                            onChange={e => setFormData({ ...formData, is_active: e.target.checked })} 
                                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <label htmlFor="is_active" className="text-sm font-medium text-slate-700 select-none cursor-pointer">
                                            Категорія активна
                                        </label>
                                    </div>

                                    <div className="pt-6 border-t border-slate-100 flex justify-end gap-3 mt-2">
                                        <button type="button" onClick={() => setShowModal(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-sm">
                                            Скасувати
                                        </button>
                                        <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2 text-sm">
                                            {isSubmitting ? 'Збереження...' : 'Зберегти'}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Layout>
    );
}