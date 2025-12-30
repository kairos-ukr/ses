import React, { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaProjectDiagram, FaMapMarkerAlt, FaCalendarAlt, FaUsers, FaEdit, FaPlus,
  FaBolt, FaSearch, FaFilter, FaBuilding, FaTools, FaMoneyBillWave,
  FaClock, FaCheckCircle, FaExclamationTriangle, FaPause, FaSave, FaTimes,
  FaChevronLeft, FaChevronRight, FaCheck, FaInfoCircle, FaTrash, FaHardHat, FaUniversity,
  FaEllipsisV, FaTruck, FaTasks, FaClipboardList, FaHome, FaUserFriends, FaUserTie, FaPencilAlt,
  FaUserEdit, FaFolderOpen // <-- Додано нову іконку
} from "react-icons/fa";
import { createClient } from '@supabase/supabase-js';
import ObjectDocumentsModal from "./components/ObjectDocumentsModal";

// Supabase client
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

const PROJECTS_PER_PAGE = 6;
const ALLOWED_COMPANIES = ['Кайрос', 'Розумне збереження енергії'];

// Debounce Hook
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};


// --- HELPER COMPONENTS ---

// Toast Component
const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const styles = {
    success: 'bg-gradient-to-r from-green-500 to-green-600 text-white',
    error: 'bg-gradient-to-r from-red-500 to-red-600 text-white',
    info: 'bg-gradient-to-r from-blue-500 to-blue-600 text-white',
  };
  const icons = { success: <FaCheck />, error: <FaExclamationTriangle />, info: <FaInfoCircle /> };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 300, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 300, scale: 0.8 }}
          className="fixed top-4 right-4 z-[100]"
        >
          <div className={`${styles[type] || styles.info} rounded-xl shadow-2xl p-4 min-w-80 backdrop-blur-xl border border-white/20`}>
            <div className="flex items-center space-x-3">
              {icons[type] || icons.info}
              <span className="font-medium text-sm">{message}</span>
              <button onClick={onClose} className="ml-auto text-white/80 hover:text-white transition-colors">
                <FaTimes className="text-sm" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

// Confirmation Modal Component
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: -20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, y: 20, opacity: 0 }}
                        className="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-4">
                            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                                <FaExclamationTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
                            </div>
                            <div className="mt-0 text-left">
                                <h3 className="text-lg leading-6 font-bold text-gray-900">{title}</h3>
                                <div className="mt-2">
                                    <p className="text-sm text-gray-500">{message}</p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                            <button
                                type="button"
                                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none sm:ml-3 sm:w-auto sm:text-sm"
                                onClick={() => { onConfirm(); onClose(); }}
                            >
                                Підтвердити
                            </button>
                            <button
                                type="button"
                                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:w-auto sm:text-sm"
                                onClick={onClose}
                            >
                                Скасувати
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// Project Equipment Modal
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
        setLoading(true);
        const { data, error } = await supabase.from('project_procurement').select('*, equipment:equipment(name, category)').eq('installation_custom_id', project.custom_id).order('created_at', { ascending: false });
        if (error) showToast('Помилка завантаження обладнання', 'error');
        else setEquipmentList(data || []);
        setLoading(false);
    }, [project.custom_id, showToast]);

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


// Project Details Modal
const ProjectInfoModal = ({ project, onClose }) => {
    if (!project) return null;
    const { client, responsible_employee } = project;
    const formatDate = (date) => date ? new Date(date).toLocaleDateString('uk-UA') : 'Не вказано';
    const formatCost = (cost) => cost != null ? `$${Number(cost).toLocaleString('en-US')}` : 'Не вказано';
    const DetailItem = ({ icon: Icon, label, children }) => (
        <div className="flex items-start gap-3 p-3 bg-slate-50/70 rounded-lg">
            <Icon className="text-indigo-500 mt-1 flex-shrink-0"/>
            <div>
                <p className="text-sm text-gray-500">{label}</p>
                <div className="font-semibold text-gray-800 break-words">{children || 'Немає'}</div>
            </div>
        </div>
    );
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white/95 backdrop-blur-xl rounded-2xl w-full max-w-lg md:max-w-3xl max-h-[90vh] shadow-2xl flex flex-col border border-gray-200/50" onClick={e => e.stopPropagation()}>
                <div className="p-4 sm:p-6 border-b flex justify-between items-start">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">{project.name || `Проект #${project.custom_id}`}</h2>
                        <p className="text-sm sm:text-base text-gray-500">{client?.company_name || client?.name}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FaTimes size={20}/></button>
                </div>
                <div className="p-4 sm:p-6 flex-grow overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
                    <DetailItem icon={FaUsers} label="Клієнт">{client?.name}</DetailItem>
                    <DetailItem icon={FaHardHat} label="Відповідальний">{responsible_employee?.name}</DetailItem>
                    <DetailItem icon={FaMapMarkerAlt} label="Локація">
                        {project.gps_link ? <a href={project.gps_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">Переглянути на карті</a> : 'Не вказано'}
                        <p className="text-xs font-normal text-gray-500">{project.latitude && `(${project.latitude}, ${project.longitude})`}</p>
                    </DetailItem>
                    <DetailItem icon={FaCalendarAlt} label="Терміни">{`${formatDate(project.start_date)} - ${formatDate(project.end_date)}`}</DetailItem>
                    <DetailItem icon={FaBolt} label="Потужність">{project.capacity_kw ? `${project.capacity_kw} кВт` : 'Не вказано'}</DetailItem>
                    <DetailItem icon={FaTools} label="Тип монтажу / станції">{`${project.mount_type || 'N/A'} / ${project.station_type || 'N/A'}`}</DetailItem>
                    <DetailItem icon={FaMoneyBillWave} label="Загальна вартість">{formatCost(project.total_cost)}</DetailItem>
                    <DetailItem icon={FaCheckCircle} label="Оплачено">{formatCost(project.paid_amount)}</DetailItem>
                    <DetailItem icon={FaBuilding} label="Виконуюча компанія">{project.working_company}</DetailItem>
                    <DetailItem icon={FaUniversity} label="Через банк">{project.bank}</DetailItem>
                    <div className="md:col-span-2"><DetailItem icon={FaInfoCircle} label="Примітки">{project.notes}</DetailItem></div>
                </div>
            </motion.div>
        </motion.div>
    );
};


// --- MAIN COMPONENT ---
export default function ProjectsPage() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearchTerm = useDebounce(searchTerm, 400);
    const [viewingProjectDocs, setViewingProjectDocs] = useState(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
    const [companyFilter, setCompanyFilter] = useState("all");
    const [showFilters, setShowFilters] = useState(false);

    // --- НОВІ СТАНИ ДЛЯ ФІЛЬТРАЦІЇ ПО ВІДПОВІДАЛЬНОМУ ---
    const [myEmployeeId, setMyEmployeeId] = useState(null); 
    const [onlyMyProjects, setOnlyMyProjects] = useState(false);
    // ---------------------------------------------------

    const [showProjectForm, setShowProjectForm] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [viewingProjectInfo, setViewingProjectInfo] = useState(null);
    const [viewingProjectEquipment, setViewingProjectEquipment] = useState(null);

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const [clients, setClients] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [clientSearch, setClientSearch] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const navigate = useNavigate();

    const initialFormData = {
        name: '', working_company: '', bank: '', client_id: '', gps_link: '',
        latitude: '', longitude: '', mount_type: '', station_type: '',
        capacity_kw: '', responsible_emp_id: '', start_date: '', end_date: '',
        total_cost: '', payment_status: 'pending', paid_amount: '',
        status: 'planning', notes: '', creator_email: '' // Додали для форми (хоч редагувати не будемо)
    };

    const [formData, setFormData] = useState(initialFormData);
    const [formErrors, setFormErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });

    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);
    const hideToast = useCallback(() => setToast(prev => ({ ...prev, isVisible: false })), []);

    const updatePaymentStatus = (totalCost, paidAmount) => {
        const cost = parseFloat(totalCost);
        const paid = parseFloat(paidAmount);
        if (!cost || cost <= 0) return 'pending';
        if (!paid || paid < 0) return 'pending';
        const percentage = (paid / cost) * 100;
        if (percentage >= 100) return 'paid';
        if (percentage > 0) return 'partial';
        return 'pending';
    };

    // --- EFFECT: ВИЗНАЧЕННЯ ПОТОЧНОГО ПРАЦІВНИКА ЗА EMAIL ---
    useEffect(() => {
        const identifyEmployee = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && user.email) {
                // Шукаємо працівника в базі employees за емейлом
                const { data: employee } = await supabase
                    .from('employees')
                    .select('custom_id')
                    .eq('email', user.email)
                    .maybeSingle();

                if (employee) {
                    setMyEmployeeId(employee.custom_id);
                }
            }
        };
        identifyEmployee();
    }, []);
    // --------------------------------------------------------

    useEffect(() => {
        const loadStaticData = async () => {
            try {
                const [clientsRes, employeesRes] = await Promise.all([
                    supabase.from('clients').select('custom_id, name, company_name').order('name'),
                    supabase.from('employees').select('custom_id, name, position, email').order('name') // Додав email у вибірку
                ]);
                if (clientsRes.error) throw clientsRes.error;
                setClients(clientsRes.data || []);
                if (employeesRes.error) throw employeesRes.error;
                setEmployees(employeesRes.data || []);
            } catch (error) {
                showToast('Помилка завантаження довідників', 'error');
            }
        };
        loadStaticData();
    }, [showToast]);

    const loadProjects = useCallback(async () => {
        setLoading(true);
        try {
            const from = (currentPage - 1) * PROJECTS_PER_PAGE;
            const to = from + PROJECTS_PER_PAGE - 1;

            let query = supabase.from('installations').select(`*, client:clients(*), responsible_employee:employees(*)`, { count: 'exact' });

            // --- ЛОГІКА ФІЛЬТРУ "МОЇ ОБ'ЄКТИ" ---
            if (onlyMyProjects && myEmployeeId) {
                query = query.eq('responsible_emp_id', myEmployeeId);
            }
            // ------------------------------------

            if (statusFilter !== 'all') query = query.eq('status', statusFilter);
            if (paymentStatusFilter !== 'all') query = query.eq('payment_status', paymentStatusFilter);
            if (companyFilter !== 'all') query = query.eq('working_company', companyFilter);

            if (debouncedSearchTerm) {
                const numericSearch = parseInt(debouncedSearchTerm, 10);
                if (!isNaN(numericSearch)) {
                    query = query.eq('custom_id', numericSearch);
                } else {
                    query = query.or(`name.ilike.%${debouncedSearchTerm}%,client.name.ilike.%${debouncedSearchTerm}%,client.company_name.ilike.%${debouncedSearchTerm}%`);
                }
            }

            const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);

            if (error) throw error;
            setProjects(data || []);
            setTotalCount(count || 0);
        } catch (error) {
            showToast(`Помилка завантаження проектів: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, paymentStatusFilter, companyFilter, debouncedSearchTerm, showToast, onlyMyProjects, myEmployeeId]);

    useEffect(() => { loadProjects(); }, [loadProjects]);
    
    // Скидання сторінки при зміні фільтрів
    useEffect(() => { setCurrentPage(1); }, [debouncedSearchTerm, statusFilter, paymentStatusFilter, companyFilter, onlyMyProjects]);

    const getStatusInfo = (status) => ({
        'planning': { label: 'Планування', color: 'bg-blue-500', icon: FaClock },
        'in_progress': { label: 'Виконується', color: 'bg-yellow-500', icon: FaTools },
        'on_hold': { label: 'Призупинено', color: 'bg-orange-500', icon: FaPause },
        'completed': { label: 'Завершено', color: 'bg-green-500', icon: FaCheckCircle },
        'cancelled': { label: 'Скасовано', color: 'bg-red-500', icon: FaExclamationTriangle }
    }[status] || { label: 'Невідомо', color: 'bg-gray-500', icon: FaInfoCircle });

    const getPaymentStatusInfo = (paymentStatus) => ({
        'pending': { label: 'Очікує оплати', color: 'text-orange-600 bg-orange-50' },
        'partial': { label: 'Часткова оплата', color: 'text-blue-600 bg-blue-50' },
        'paid': { label: 'Оплачено', color: 'text-green-600 bg-green-50' },
        'overdue': { label: 'Прострочено', color: 'text-red-600 bg-red-50' }
    }[paymentStatus] || { label: 'Невідомо', color: 'text-gray-600 bg-gray-50' });

    const filteredClients = clientSearch ? clients.filter(client => (
        client.name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
        client.company_name?.toLowerCase().includes(clientSearch.toLowerCase()) ||
        client.custom_id.toString().includes(clientSearch)
    )) : [];

    const filteredEmployees = employeeSearch ? employees.filter(emp =>
        emp.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        emp.custom_id.toString().includes(employeeSearch)
    ) : [];

    const handleDelete = (projectId, projectName) => {
        setConfirmModal({
            isOpen: true,
            title: "Підтвердити видалення",
            message: `Ви впевнені, що хочете видалити проект "${projectName || `#${projectId}`}"? Цю дію неможливо скасувати.`,
            onConfirm: async () => {
                try {
                    const { error } = await supabase.from('installations').delete().eq('custom_id', projectId);
                    if (error) throw error;
                    showToast('Проект успішно видалено', 'success');
                    loadProjects();
                } catch(error) {
                    showToast(`Помилка видалення: ${error.message}`, 'error');
                }
            }
        });
    }

    const resetForm = () => { setFormData(initialFormData); setFormErrors({}); setClientSearch(""); setEmployeeSearch(""); };
    const handleAddProject = () => { resetForm(); setEditingProject(null); setShowProjectForm(true); };
    const handleCloseForm = () => { setShowProjectForm(false); setEditingProject(null); resetForm(); };

    const handleOpenEditForm = (project) => {
        const client = clients.find(c => c.custom_id === project.client_id);
        const employee = employees.find(e => e.custom_id === project.responsible_emp_id);
        setClientSearch(client ? `${client.company_name || client.name} (#${client.custom_id})` : "");
        setEmployeeSearch(employee ? `${employee.name} (#${employee.custom_id})` : "");
        setFormData({ ...initialFormData, ...project });
        setEditingProject(project);
        setShowProjectForm(true);
    };

    const handleInputChange = (field, value) => { setFormData(prev => ({ ...prev, [field]: value })); if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: '' })); };
    const handleClientSelect = (client) => { setFormData(prev => ({ ...prev, client_id: client.custom_id })); setClientSearch(`${client.company_name || client.name} (#${client.custom_id})`); };
    const handleEmployeeSelect = (employee) => { setFormData(prev => ({ ...prev, responsible_emp_id: employee.custom_id })); setEmployeeSearch(`${employee.name} (#${employee.custom_id})`); };

    const validateForm = () => {
        const errors = {};
        if (!formData.client_id) errors.client_id = 'Виберіть клієнта';
        if (formData.start_date && formData.end_date && new Date(formData.start_date) > new Date(formData.end_date)) errors.end_date = 'Дата завершення не може бути раніше дати початку';
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;
        setSubmitting(true);
        try {
            const { client, responsible_employee, ...projectData } = formData;
            
            // Convert empty strings in ALL fields to null to prevent db errors
            const sanitizedData = { ...projectData };
            for (const key in sanitizedData) {
                if (sanitizedData[key] === '' || sanitizedData[key] === undefined) {
                    sanitizedData[key] = null;
                }
            }

            sanitizedData.payment_status = updatePaymentStatus(sanitizedData.total_cost, sanitizedData.paid_amount);

            let result;
            if (editingProject) {
                result = await supabase.from('installations').update(sanitizedData).eq('custom_id', editingProject.custom_id);
            } else {
                // --- АВТОМАТИЧНЕ ДОДАВАННЯ "ХТО ДОДАВ" (CREATOR) ---
                const { data: { user } } = await supabase.auth.getUser();
                if (user && user.email) {
                    sanitizedData.creator_email = user.email;
                }
                // ---------------------------------------------------
                result = await supabase.from('installations').insert([sanitizedData]);
            }
            if (result.error) throw result.error;

            showToast(editingProject ? 'Проект успішно оновлено!' : 'Проект успішно створено!', 'success');
            handleCloseForm();
            loadProjects();
        } catch (error) {
            showToast(`Помилка: ${error.message}`, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const Pagination = ({ currentPage, totalCount, projectsPerPage, onPageChange }) => {
        const totalPages = Math.ceil(totalCount / projectsPerPage);
        if (totalPages <= 1) return null;
        return (
            <div className="flex items-center justify-center space-x-4 mt-8">
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="p-2 disabled:opacity-50 disabled:cursor-not-allowed bg-white rounded-md shadow-md hover:bg-gray-100 transition"><FaChevronLeft /></button>
                <span className="font-medium text-gray-700">Сторінка {currentPage} з {totalPages}</span>
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 disabled:opacity-50 disabled:cursor-not-allowed bg-white rounded-md shadow-md hover:bg-gray-100 transition"><FaChevronRight /></button>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
            <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
            <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
            
            <AnimatePresence>
                {viewingProjectInfo && <ProjectInfoModal project={viewingProjectInfo} onClose={() => setViewingProjectInfo(null)} />}
                {viewingProjectEquipment && <ProjectEquipmentModal project={viewingProjectEquipment} onClose={() => setViewingProjectEquipment(null)} showToast={showToast} setConfirmModal={setConfirmModal} />}
                {viewingProjectDocs && (<ObjectDocumentsModal project={viewingProjectDocs} onClose={() => setViewingProjectDocs(null)} />)}
            </AnimatePresence>

            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
                <div className="px-4 sm:px-6 py-4">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg"><FaProjectDiagram className="text-white text-lg" /></div>
                            <div><h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Проекти</h1><p className="text-sm text-gray-500">Управління проектами СЕС</p></div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4">
                            <button onClick={handleAddProject} className="flex items-center justify-center space-x-2 p-3 sm:px-4 sm:py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                                <FaPlus className="text-sm" /><span className="hidden sm:inline">Додати проект</span>
                            </button>
                            <div className="relative">
                                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center hover:bg-slate-200 transition-colors">
                                    <FaEllipsisV />
                                </button>
                                <AnimatePresence>
                                    {isMenuOpen && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: -10, scale: 0.95 }} 
                                            animate={{ opacity: 1, y: 0, scale: 1 }} 
                                            exit={{ opacity: 0, y: -10, scale: 0.95 }} 
                                            className="absolute top-12 right-0 bg-white shadow-2xl rounded-lg w-56 border border-slate-200/80 p-2 z-50"
                                            onClick={() => setIsMenuOpen(false)}
                                        >
                                            {[
                                                { path: '/home', label: 'Головна', icon: FaHome },
                                                { path: '/clients', label: 'Клієнти', icon: FaUserFriends },
                                                { path: '/employees', label: 'Працівники', icon: FaUserTie },
                                                { path: '/equipment', label: 'Обладнання', icon: FaTools },
                                                { path: '/payments', label: 'Платежі', icon: FaMoneyBillWave },
                                                { path: '/tasks', label: 'Задачі', icon: FaTasks },
                                                { id: 'documents', label: 'Документи', icon: FaFolderOpen, path: '/documents' },
                                            ].map(item => (
                                                <button key={item.path} onClick={() => navigate(item.path)} className="flex items-center gap-3 w-full px-4 py-2 hover:bg-slate-100 text-slate-700 rounded-md text-sm font-medium text-left">
                                                    <item.icon /> {item.label}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>
            </header>
            
            <div className="relative px-4 sm:px-6 pt-4"><Pagination currentPage={currentPage} totalCount={totalCount} projectsPerPage={PROJECTS_PER_PAGE} onPageChange={setCurrentPage} /></div>
            
            <div className="relative p-4 sm:p-6 border-b border-gray-200/30">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex-1 w-full max-w-lg flex gap-2">
                        <div className="relative flex-grow">
                            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="Пошук за назвою, клієнтом або ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white/90 backdrop-blur-xl border border-gray-200/50 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm" />
                        </div>
                        {/* --- ПЕРЕМИКАЧ МОЇ/ВСІ (показуємо, якщо знайшли працівника) --- */}
                        {myEmployeeId && (
                            <div className="bg-white/90 backdrop-blur-xl p-1 rounded-xl border border-gray-200/50 flex items-center shadow-sm flex-shrink-0">
                                <button
                                    onClick={() => setOnlyMyProjects(false)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                        !onlyMyProjects 
                                        ? 'bg-indigo-100 text-indigo-700 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    Всі
                                </button>
                                <button
                                    onClick={() => setOnlyMyProjects(true)}
                                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
                                        onlyMyProjects 
                                        ? 'bg-indigo-500 text-white shadow-md' 
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    <FaUserTie className={onlyMyProjects ? "text-white" : "text-gray-400"} />
                                    <span className="hidden sm:inline">Мої</span>
                                </button>
                            </div>
                        )}
                        {/* ------------------------------------------------------------- */}
                    </div>
                    <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all shadow-sm ${showFilters ? 'bg-indigo-500 text-white' : 'bg-white/90 text-gray-700 hover:bg-gray-50'}`}>
                        <FaFilter className="text-sm" /><span>Фільтри</span>
                    </button>
                </div>
                <AnimatePresence>
                    {showFilters && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 overflow-hidden">
                            <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-sm font-medium text-gray-700 w-full md:w-auto">Статус проекту:</span>
                                    {[{ v: 'all', l: 'Всі' }, { v: 'planning', l: 'Планування' }, { v: 'in_progress', l: 'Виконується' }, { v: 'on_hold', l: 'Призупинено' }, { v: 'completed', l: 'Завершено' },{ v: 'cancelled', l: 'Скасовано' }].map((s) => (
                                        <button key={s.v} onClick={() => setStatusFilter(s.v)} className={`px-3 py-1 rounded-full text-xs font-medium ${statusFilter === s.v ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s.l}</button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-sm font-medium text-gray-700 w-full md:w-auto">Статус оплати:</span>
                                    {[{ v: 'all', l: 'Всі' }, { v: 'pending', l: 'Очікує' }, { v: 'partial', l: 'Часткова' }, { v: 'paid', l: 'Оплачено' }, { v: 'overdue', l: 'Прострочено' }].map((s) => (
                                        <button key={s.v} onClick={() => setPaymentStatusFilter(s.v)} className={`px-3 py-1 rounded-full text-xs font-medium ${paymentStatusFilter === s.v ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s.l}</button>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-sm font-medium text-gray-700 w-full md:w-auto">Компанія:</span>
                                    {[{ v: 'all', l: 'Всі' }, ...ALLOWED_COMPANIES.map(c => ({v: c, l: c}))].map((c) => (
                                        <button key={c.v} onClick={() => setCompanyFilter(c.v)} className={`px-3 py-1 rounded-full text-xs font-medium ${companyFilter === c.v ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{c.l}</button>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <main className="relative p-4 sm:p-6">
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 bg-white/50 rounded-2xl animate-pulse shadow-xl"></div>)}
                    </div>
                ) : projects.length === 0 ? (
                    <div className="text-center py-16"><div className="w-16 h-16 bg-gray-300 rounded-xl flex items-center justify-center mx-auto mb-4"><FaProjectDiagram className="text-white text-3xl" /></div><h3 className="text-xl font-bold text-gray-600">Проектів не знайдено</h3><p className="text-gray-500">Спробуйте змінити параметри пошуку або фільтри</p></div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project) => {
                            const statusInfo = getStatusInfo(project.status);
                            const paymentInfo = getPaymentStatusInfo(project.payment_status);
                            const StatusIcon = statusInfo.icon;
                            
                            // --- ВИЗНАЧЕННЯ АВТОРА ПРОЕКТУ ---
                            // Знаходимо співробітника, чий email співпадає з creator_email
                            const creator = employees.find(e => e.email === project.creator_email);
                            const creatorName = creator ? creator.name : project.creator_email;
                            // ---------------------------------

                            return (
                                <motion.div
                                    key={project.custom_id}
                                    layout
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="bg-white/90 backdrop-blur-xl rounded-2xl p-5 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex justify-between items-start gap-3 mb-2">
                                            <h3 className="text-lg font-bold text-gray-800 leading-tight">{project.name || project.client?.company_name || 'Без назви'} <span className="text-sm text-gray-500 font-medium">#{project.custom_id}</span></h3>
                                            <div title={statusInfo.label} className={`flex items-center space-x-2 ${statusInfo.color} text-white px-2 py-1 rounded-full shadow-sm text-xs`}>
                                                <StatusIcon/><span className="hidden sm:inline">{statusInfo.label}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 mb-4 flex items-center gap-2"><FaUserFriends className="text-gray-500"/>{project.client?.name}</p>
                                        <div className="space-y-2 text-sm mb-4">
                                            <div className="flex items-center gap-2"><FaBolt className="text-yellow-500"/><p>Потужність: <span className="font-semibold">{project.capacity_kw ? `${project.capacity_kw} кВт` : 'N/A'}</span></p></div>
                                            <div className="flex items-center gap-2"><FaHardHat className="text-purple-500"/><p>Відповідальний: <span className="font-semibold">{project.responsible_employee?.name || 'Не призначено'}</span></p></div>
                                            
                                            {/* --- ВІДОБРАЖЕННЯ, ХТО ДОДАВ --- */}
                                            {project.creator_email && (
                                                <div className="flex items-center gap-2 text-gray-500 text-xs mt-2 pt-2 border-t border-gray-100">
                                                    <FaUserEdit className="text-gray-400"/>
                                                    <p>Додав: <span className="font-medium text-gray-600">{creatorName}</span></p>
                                                </div>
                                            )}
                                            {/* ------------------------------- */}
                                        </div>
                                    </div>
                                    <div className="border-t border-gray-200/80 pt-4 flex justify-between items-center">
                                        <div className={`text-xs font-bold px-2 py-1 rounded-md ${paymentInfo.color}`}>{paymentInfo.label}</div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => setViewingProjectInfo(project)} title="Деталі проекту" className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><FaInfoCircle/></button>
                                            <button onClick={() => setViewingProjectEquipment(project)} title="Обладнання" className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><FaTruck/></button>
                                            <button onClick={() => setViewingProjectDocs(project)} title="Документи" className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><FaFolderOpen className="text-indigo-500" /></button>
                                            <button onClick={() => handleOpenEditForm(project)} title="Редагувати" className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><FaEdit/></button>
                                            <button onClick={() => handleDelete(project.custom_id, project.name)} title="Видалити" className="w-9 h-9 flex items-center justify-center hover:bg-red-100 rounded-lg text-red-500 transition-colors"><FaTrash/></button>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
                <Pagination currentPage={currentPage} totalCount={totalCount} projectsPerPage={PROJECTS_PER_PAGE} onPageChange={setCurrentPage} />
            </main>

            <AnimatePresence>
                {showProjectForm && (
                    <motion.div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseForm}>
                        <motion.div className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 sm:p-8 w-full max-w-lg md:max-w-4xl shadow-2xl border border-gray-200/50 my-8 max-h-[90vh] flex flex-col" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
                            <div className="mb-6"><h2 className="text-2xl sm:text-3xl font-bold text-gray-800">{editingProject ? 'Редагувати проект' : 'Новий проект'}</h2><p className="text-gray-600">Заповніть інформацію про проект СЕС</p></div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto pr-2 flex-grow">
                                <div className="md:col-span-2 relative">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Клієнт <span className="text-red-500">*</span></label>
                                    <input type="text" value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); if(formData.client_id) handleInputChange('client_id', ''); }} placeholder="Пошук клієнта за іменем, компанією або ID..." className={`w-full border rounded-xl px-4 py-3 transition ${formErrors.client_id ? 'border-red-500' : 'border-gray-300'}`} />
                                    {clientSearch && filteredClients.length > 0 && !formData.client_id && (
                                        <div className="absolute z-20 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                                            {filteredClients.map(client => (
                                                <button key={client.custom_id} type="button" onClick={() => handleClientSelect(client)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0">
                                                    <div className="font-medium">{client.company_name || client.name}</div>
                                                    <div className="text-sm text-gray-600">ID: {client.custom_id}</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {formErrors.client_id && (<p className="text-red-500 text-sm mt-1">{formErrors.client_id}</p>)}
                                </div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Назва об'єкта</label><input type="text" value={formData.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="СЕС 'Сонячна Долина'" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Виконуюча компанія</label><select value={formData.working_company || ''} onChange={(e) => handleInputChange('working_company', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="">Виберіть...</option>{ALLOWED_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Через банк?</label><select value={formData.bank || ''} onChange={(e) => handleInputChange('bank', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="">Виберіть...</option><option value="Так">Так</option><option value="Ні">Ні</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">GPS посилання</label><input type="url" value={formData.gps_link || ''} onChange={(e) => handleInputChange('gps_link', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Координати</label><div className="flex space-x-2"><input type="number" step="any" value={formData.latitude || ''} onChange={(e) => handleInputChange('latitude', e.target.value)} className="w-1/2 border border-gray-300 rounded-xl px-4 py-3" placeholder="Широта" /><input type="number" step="any" value={formData.longitude || ''} onChange={(e) => handleInputChange('longitude', e.target.value)} className="w-1/2 border border-gray-300 rounded-xl px-4 py-3" placeholder="Довгота" /></div></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Тип монтажу</label><select value={formData.mount_type || ''} onChange={(e) => handleInputChange('mount_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="">Виберіть...</option><option value="Дахове кріплення">Дахове кріплення</option><option value="Наземне кріплення">Наземне кріплення</option><option value="Трекерна система">Трекерна система</option><option value="Інше">Інше</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Тип станції</label><select value={formData.station_type || ''} onChange={(e) => handleInputChange('station_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="">Виберіть...</option><option value="Мережева">Мережева</option><option value="Автономна">Автономна</option><option value="Гібридна">Гібридна</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Потужність (кВт)</label><input type="number" step="0.1" min="0" value={formData.capacity_kw || ''} onChange={(e) => handleInputChange('capacity_kw', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                <div className="relative">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Відповідальний</label>
                                    <input type="text" value={employeeSearch} onChange={(e) => {setEmployeeSearch(e.target.value); if(formData.responsible_emp_id) handleInputChange('responsible_emp_id', '');}} placeholder="Пошук за іменем або ID..." className="w-full border border-gray-300 rounded-xl px-4 py-3" />
                                    {employeeSearch && filteredEmployees.length > 0 && !formData.responsible_emp_id && (
                                        <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                                            {filteredEmployees.map(emp => (
                                                <button key={emp.custom_id} type="button" onClick={() => handleEmployeeSelect(emp)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b">
                                                    {emp.name} <span className="text-gray-500">(ID: {emp.custom_id})</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Дата початку</label><input type="date" value={formData.start_date || ''} onChange={(e) => handleInputChange('start_date', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Дата завершення</label><input type="date" value={formData.end_date || ''} onChange={(e) => handleInputChange('end_date', e.target.value)} className={`w-full border rounded-xl px-4 py-3 ${formErrors.end_date ? 'border-red-500' : 'border-gray-300'}`} />{formErrors.end_date && (<p className="text-red-500 text-sm mt-1">{formErrors.end_date}</p>)}</div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Загальна вартість (USD)</label><input type="number" min="0" step="0.01" value={formData.total_cost || ''} onChange={(e) => handleInputChange('total_cost', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Сума оплачена (USD)</label><input type="number" min="0" step="0.01" value={formData.paid_amount || ''} onChange={(e) => handleInputChange('paid_amount', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Статус проекту</label><select value={formData.status || ''} onChange={(e) => handleInputChange('status', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="planning">Планування</option><option value="in_progress">Виконується</option><option value="on_hold">Призупинено</option><option value="completed">Завершено</option><option value="cancelled">Скасовано</option></select></div>
                                <div><label className="block text-sm font-medium text-gray-700 mb-2">Статус оплати (авто)</label><div className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 text-gray-600">{getPaymentStatusInfo(updatePaymentStatus(formData.total_cost, formData.paid_amount)).label}</div></div>
                                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label><textarea rows="3" value={formData.notes || ''} onChange={(e) => handleInputChange('notes', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 resize-none"></textarea></div>
                            </div>
                            <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6 flex-shrink-0">
                                <button type="button" onClick={handleCloseForm} disabled={submitting} className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition disabled:opacity-50">Скасувати</button>
                                <button type="button" onClick={handleSubmit} disabled={submitting} className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none flex items-center space-x-2">
                                    {submitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Збереження...</span></>) : (editingProject ? <><FaSave/><span>Зберегти зміни</span></> : <><FaPlus/><span>Створити проект</span></>)}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}