import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaTimes, FaPlus, FaBolt, FaCheck, FaTrash, FaPencilAlt
} from "react-icons/fa";
import { supabase } from "./supabaseClient"; // Переконайся, що шлях правильний до файлу з Кроку 1

// Debounce Hook (можна винести в окремий файл hooks/useDebounce.js)
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

const ProjectEquipmentModal = ({ project, onClose, showToast, setConfirmModal }) => {
    const [equipmentList, setEquipmentList] = useState([]);
    const [allEquipment, setAllEquipment] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newEntry, setNewEntry] = useState({ equipment_id: '', quantity: 1, status: 'Заплановано', ttn_code: '', notes: '' });
    const [searchTerm, setSearchTerm] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const [editingItemId, setEditingItemId] = useState(null);
    const [editFormData, setEditFormData] = useState({ quantity: '', status: '', ttn_code: '', notes: '' });
    const [showEquipmentResults, setShowEquipmentResults] = useState(false);

    const fetchProjectEquipment = useCallback(async () => {
        if (!project?.custom_id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('project_procurement')
            .select('*, equipment:equipment(name, category)')
            .eq('installation_custom_id', project.custom_id)
            .order('created_at', { ascending: false });
            
        if (error) {
            showToast('Помилка завантаження обладнання', 'error');
        } else {
            setEquipmentList(data || []);
        }
        setLoading(false);
    }, [project, showToast]);

    useEffect(() => {
        fetchProjectEquipment();
        supabase.from('equipment').select('id, name, category').then(({ data }) => setAllEquipment(data || []));
    }, [fetchProjectEquipment]);
    
    const filteredAllEquipment = debouncedSearchTerm ? allEquipment.filter(e => e.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())) : [];

    const handleAddEquipment = async () => {
        if (!newEntry.equipment_id || newEntry.quantity <= 0) {
            showToast('Виберіть обладнання та вкажіть кількість', 'error');
            return;
        }
        setSubmitting(true);
        const { error } = await supabase.from('project_procurement').insert([{ ...newEntry, installation_custom_id: project.custom_id }]);
        if (error) showToast('Помилка додавання обладнання', 'error');
        else {
            showToast('Обладнання успішно додано', 'success');
            setNewEntry({ equipment_id: '', quantity: 1, status: 'Заплановано', ttn_code: '', notes: '' });
            setSearchTerm('');
            setShowAddForm(false);
            fetchProjectEquipment();
        }
        setSubmitting(false);
    };

    const handleCreateNewEquipment = async () => {
        if (!debouncedSearchTerm.trim()) return;
        setSubmitting(true);
        const { data, error } = await supabase.from('equipment').insert({ name: debouncedSearchTerm.trim(), category: 'Інше' }).select().single();
        if (error) showToast(`Помилка створення: ${error.message}`, 'error');
        else {
            showToast(`Обладнання "${data.name}" створено!`, 'success');
            setAllEquipment(prev => [...prev, data]);
            setNewEntry(prev => ({ ...prev, equipment_id: data.id }));
            setSearchTerm(data.name);
            setShowEquipmentResults(false);
        }
        setSubmitting(false);
    };

    const handleUpdateEquipment = async () => {
        setSubmitting(true);
        const { error } = await supabase.from('project_procurement').update({
            quantity: editFormData.quantity,
            status: editFormData.status,
            ttn_code: editFormData.ttn_code || null,
            notes: editFormData.notes || null
        }).eq('id', editingItemId);
        
        if (error) showToast('Помилка оновлення', 'error');
        else {
            showToast('Позицію оновлено', 'success');
            setEditingItemId(null);
            fetchProjectEquipment();
        }
        setSubmitting(false);
    };
    
    const handleStartEdit = (item) => {
        setEditingItemId(item.id);
        setEditFormData({
            quantity: item.quantity,
            status: item.status,
            ttn_code: item.ttn_code || '',
            notes: item.notes || ''
        });
    };

    const handleDeleteEquipment = (id, name) => {
        if (!setConfirmModal) {
             // Fallback якщо модалка підтвердження не передана
             if(window.confirm(`Видалити "${name}"?`)) {
                 supabase.from('project_procurement').delete().eq('id', id).then(({error}) => {
                     if(error) showToast('Помилка', 'error');
                     else { showToast('Видалено', 'success'); fetchProjectEquipment(); }
                 });
             }
             return;
        }

        setConfirmModal({
            isOpen: true,
            title: "Підтвердити видалення",
            message: `Ви впевнені, що хочете видалити "${name}" зі списку обладнання цього проекту?`,
            onConfirm: async () => {
                const { error } = await supabase.from('project_procurement').delete().eq('id', id);
                if (error) showToast('Помилка видалення', 'error');
                else {
                    showToast('Позицію видалено', 'success');
                    fetchProjectEquipment();
                }
            }
        });
    };
    
    if (!project) return null;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white/95 backdrop-blur-xl rounded-2xl w-full max-w-lg md:max-w-4xl max-h-[90vh] shadow-2xl flex flex-col border border-gray-200/50" onClick={e => e.stopPropagation()}>
                <div className="p-4 sm:p-6 border-b flex justify-between items-start">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Обладнання для проекту</h2>
                        <p className="text-sm sm:text-base text-gray-500">{project.name || `Проект #${project.custom_id}`}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FaTimes size={20}/></button>
                </div>
                <div className="p-4 sm:p-6 flex-grow overflow-y-auto">
                    <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-2 font-semibold text-indigo-600 mb-4 text-sm">
                        <FaPlus/> {showAddForm ? 'Сховати форму' : 'Додати обладнання'}
                    </button>
                    <AnimatePresence>
                        {showAddForm && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-slate-50">
                                    <div className="md:col-span-2 relative">
                                        <label className="text-sm font-medium text-gray-700">Пошук обладнання</label>
                                        <input 
                                            type="text" 
                                            placeholder="Почніть вводити назву..." 
                                            value={searchTerm} 
                                            onChange={e => { setSearchTerm(e.target.value); setShowEquipmentResults(true); }}
                                            onBlur={() => setTimeout(() => setShowEquipmentResults(false), 200)}
                                            className="w-full mt-1 border border-gray-300 rounded-xl px-4 py-2"
                                        />
                                        {showEquipmentResults && debouncedSearchTerm && (
                                            <div className="absolute z-10 w-full bg-white shadow-lg rounded-md mt-1 max-h-48 overflow-y-auto border">
                                                {filteredAllEquipment.length > 0 ? (
                                                    filteredAllEquipment.map(eq => (
                                                        <div key={eq.id} onMouseDown={() => { setNewEntry({...newEntry, equipment_id: eq.id }); setSearchTerm(eq.name); setShowEquipmentResults(false); }} className="p-2 hover:bg-slate-100 cursor-pointer">{eq.name}</div>
                                                    ))
                                                ) : (
                                                    <div className="p-2 text-center">
                                                        <p className="text-sm text-gray-500 mb-2">Нічого не знайдено.</p>
                                                        <button onMouseDown={handleCreateNewEquipment} disabled={submitting} className="w-full px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-200 disabled:opacity-50">
                                                            {submitting ? 'Створення...' : `Створити "${debouncedSearchTerm}"`}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div><label className="text-sm font-medium text-gray-700">Кількість</label><input type="number" value={newEntry.quantity} min="1" onChange={e => setNewEntry({...newEntry, quantity: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-xl px-4 py-2"/></div>
                                    <div><label className="text-sm font-medium text-gray-700">Статус</label><select value={newEntry.status} onChange={e => setNewEntry({...newEntry, status: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-xl px-4 py-2 bg-white"><option>Заплановано</option><option>Замовлено</option><option>Відправлено</option><option>На складі</option><option>Встановлено</option></select></div>
                                    <div><label className="text-sm font-medium text-gray-700">ТТН</label><input type="text" value={newEntry.ttn_code} onChange={e => setNewEntry({...newEntry, ttn_code: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-xl px-4 py-2"/></div>
                                    <div><label className="text-sm font-medium text-gray-700">Примітка</label><input type="text" value={newEntry.notes} onChange={e => setNewEntry({...newEntry, notes: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-xl px-4 py-2"/></div>
                                    <div className="md:col-span-2 flex justify-end">
                                        <button onClick={handleAddEquipment} disabled={submitting} className="px-5 py-2 bg-indigo-600 text-white rounded-lg font-semibold disabled:opacity-50 transition hover:bg-indigo-700">
                                            {submitting ? 'Додавання...' : 'Додати'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    {loading ? <div className="text-center py-8"><FaBolt className="animate-pulse text-3xl text-indigo-500 mx-auto"/></div> : equipmentList.length === 0 ? (<div className="text-center text-slate-500 py-10">Список обладнання порожній.</div>) : (
                        <div className="space-y-3">
                            {equipmentList.map(item => (
                                <div key={item.id} className="bg-slate-50 p-3 rounded-lg border flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                                    {editingItemId === item.id ? (
                                        <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">Кількість</label>
                                                <input type="number" value={editFormData.quantity} onChange={e => setEditFormData({...editFormData, quantity: e.target.value})} className="w-full border-gray-300 rounded-md px-2 py-1" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">Статус</label>
                                                <select value={editFormData.status} onChange={e => setEditFormData({...editFormData, status: e.target.value})} className="w-full border-gray-300 rounded-md px-2 py-1 bg-white">
                                                    <option>Заплановано</option><option>Замовлено</option><option>Відправлено</option><option>На складі</option><option>Встановлено</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">ТТН</label>
                                                <input type="text" value={editFormData.ttn_code} onChange={e => setEditFormData({...editFormData, ttn_code: e.target.value})} className="w-full border-gray-300 rounded-md px-2 py-1" />
                                            </div>
                                            <div>
                                                <label className="text-xs font-medium text-gray-600">Примітка</label>
                                                <input type="text" value={editFormData.notes} onChange={e => setEditFormData({...editFormData, notes: e.target.value})} className="w-full border-gray-300 rounded-md px-2 py-1" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex-grow">
                                            <p className="font-semibold text-gray-800">{item.equipment?.name || 'Невідомо'}</p>
                                            <p className="text-sm text-gray-500">
                                                Кількість: <span className="font-medium text-gray-700">{item.quantity}</span> | 
                                                Статус: <span className="font-medium text-gray-700">{item.status}</span>
                                            </p>
                                            {item.ttn_code && (
                                                <p className="text-xs text-gray-500 mt-1">ТТН: <span className="font-mono bg-slate-200 px-1 rounded">{item.ttn_code}</span></p>
                                            )}
                                            {item.notes && (
                                                <p className="text-xs text-gray-500 mt-1">Примітка: <span className="italic">{item.notes}</span></p>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex-shrink-0 flex items-center gap-2 self-end sm:self-center">
                                        {editingItemId === item.id ? (
                                            <>
                                                <button onClick={handleUpdateEquipment} disabled={submitting} className="p-2 text-green-600 hover:bg-green-100 rounded-md"><FaCheck/></button>
                                                <button onClick={() => setEditingItemId(null)} className="p-2 text-gray-600 hover:bg-gray-200 rounded-md"><FaTimes/></button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => handleStartEdit(item)} className="p-2 text-blue-500 hover:bg-blue-100 rounded-md"><FaPencilAlt/></button>
                                                <button onClick={() => handleDeleteEquipment(item.id, item.equipment?.name || 'Позиція')} className="p-2 text-red-500 hover:bg-red-100 rounded-md"><FaTrash/></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
};

export default ProjectEquipmentModal;