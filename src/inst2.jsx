import React, { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaProjectDiagram, FaPlus,
  FaBolt, FaSearch, FaFilter, FaTools, FaMoneyBillWave,
  FaClock, FaCheckCircle, FaExclamationTriangle, FaPause, FaTimes,
  FaChevronLeft, FaChevronRight, FaCheck, FaInfoCircle, FaTrash, FaHardHat,
  FaUserFriends, FaUserTie,
  FaUserEdit, FaFolderOpen, FaRulerCombined, FaFileContract, FaFileSignature, FaWallet,
  FaShoppingCart, FaBoxOpen, FaShieldAlt, FaPlay, FaFlagCheckered, FaCalculator, FaCamera, FaPlug, FaHourglassHalf,
  FaRegEye, FaTruck, FaFileImport, FaWifi
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./Layout";
import ObjectDocumentsModal from "./ObjectDocumentsModal";
import ProjectEquipmentModal from "./ProjectEquipmentModal"; 
import { useAuth } from "./AuthProvider"; 

// --- CONSTANTS ---
const PROJECTS_PER_PAGE = 6;
const ALLOWED_COMPANIES = ['Кайрос', 'Розумне збереження енергії'];

// ОНОВЛЕНИЙ СПИСОК ЕТАПІВ (9 штук, як в ProjectDetailsPage)
const WORKFLOW_STAGES = [
    { value: 'tech_review', label: 'Тех. Огляд (заміри)', icon: FaSearch, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { value: 'commercial_proposal', label: 'Комерційна пропозиція', icon: FaFileContract, color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
    { value: 'project_design', label: 'Проект', icon: FaRulerCombined, color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { value: 'advance_payment', label: 'Аванс', icon: FaWallet, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { value: 'equipment', label: 'Обладнання', icon: FaShoppingCart, color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { value: 'complectation', label: 'Комплектація', icon: FaBoxOpen, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'installation', label: 'Монтаж', icon: FaTools, color: 'bg-blue-100 text-blue-800 border-blue-300' },
    { value: 'grid_connection', label: 'Заведення потужності', icon: FaBolt, color: 'bg-purple-100 text-purple-800 border-purple-300' },
    { value: 'monitoring_setup', label: 'Запуск та моніторинг', icon: FaCheckCircle, color: 'bg-cyan-50 text-cyan-800 border-cyan-300' },
];

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// --- COMPONENTS ---

const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);
  const styles = { success: 'bg-green-600 text-white', error: 'bg-red-600 text-white', info: 'bg-blue-600 text-white' };
  const icons = { success: <FaCheck />, error: <FaExclamationTriangle />, info: <FaInfoCircle /> };
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div initial={{ opacity: 0, x: 300, scale: 0.8 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 300, scale: 0.8 }} className="fixed top-20 right-4 z-[100] max-w-[90vw]">
          <div className={`${styles[type] || styles.info} rounded-lg shadow-lg p-4 min-w-[280px] border border-white/10`}>
            <div className="flex items-center space-x-3">{icons[type] || icons.info}<span className="font-medium text-sm">{message}</span><button onClick={onClose} className="ml-auto text-white/80 hover:text-white transition-colors"><FaTimes className="text-sm" /></button></div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={onClose}>
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start gap-4">
                            <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100"><FaExclamationTriangle className="h-6 w-6 text-red-600" /></div>
                            <div className="mt-0 text-left"><h3 className="text-lg leading-6 font-bold text-gray-900">{title}</h3><div className="mt-2"><p className="text-sm text-gray-500">{message}</p></div></div>
                        </div>
                        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                            <button type="button" className="w-full inline-flex justify-center rounded-lg shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 sm:w-auto sm:text-sm" onClick={() => { onConfirm(); onClose(); }}>Підтвердити</button>
                            <button type="button" className="mt-3 w-full inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:mt-0 sm:w-auto sm:text-sm" onClick={onClose}>Скасувати</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// --- MAIN PAGE ---
export default function ProjectsPage() {
    const { role } = useAuth();
    const canDelete = role === 'admin' || role === 'super_admin' || role === 'office';

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearchTerm = useDebounce(searchTerm, 400);
    const [viewingProjectDocs, setViewingProjectDocs] = useState(null);
    
    const [statusFilter, setStatusFilter] = useState("active"); 
    const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
    const [companyFilter, setCompanyFilter] = useState("all");
    const [showFilters, setShowFilters] = useState(false);

    const [myEmployeeId, setMyEmployeeId] = useState(null); 
    const [onlyMyProjects, setOnlyMyProjects] = useState(false);

    const [showProjectForm, setShowProjectForm] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    const [viewingProjectEquipment, setViewingProjectEquipment] = useState(null);

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const [clients, setClients] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [clientSearch, setClientSearch] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");

    const navigate = useNavigate();

    // ОНОВЛЕНО: використовуємо workflow_stage замість current_stage
    const initialFormData = {
        name: '', working_company: '', bank: '', client_id: '', gps_link: '',
        latitude: '', longitude: '', mount_type: '', station_type: '',
        capacity_kw: '', responsible_emp_id: '', start_date: '', end_date: '',
        total_cost: '', payment_status: 'pending', paid_amount: '',
        status: 'planning', workflow_stage: 'tech_review', notes: '', creator_email: ''
    };

    const [formData, setFormData] = useState(initialFormData);
    const [formErrors, setFormErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);

    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });

    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);
    const hideToast = useCallback(() => setToast(prev => ({ ...prev, isVisible: false })), []);

    // --- Helpers ---
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

    const getStageConfig = (val) => {
        // Якщо значення не знайдено (наприклад старий етап), повертаємо дефолт
        return WORKFLOW_STAGES.find(s => s.value === val) || { label: val || 'Не визначено', color: 'bg-gray-50 text-gray-500 border border-gray-200', icon: FaInfoCircle };
    };

    const getStatusInfo = (status) => ({
        'planning': { label: 'Планування', color: 'bg-blue-500', icon: FaClock },
        'in_progress': { label: 'Виконується', color: 'bg-yellow-500', icon: FaTools },
        'on_hold': { label: 'Призупинено', color: 'bg-orange-500', icon: FaPause },
        'completed': { label: 'Завершено', color: 'bg-green-500', icon: FaCheckCircle },
        'cancelled': { label: 'Скасовано', color: 'bg-red-500', icon: FaExclamationTriangle }
    }[status] || { label: 'Невідомо', color: 'bg-gray-500', icon: FaInfoCircle });

    const getPaymentStatusInfo = (paymentStatus) => ({
        'pending': { label: 'Очікує оплати', color: 'text-orange-600 bg-orange-50 border-orange-100' },
        'partial': { label: 'Часткова оплата', color: 'text-blue-600 bg-blue-50 border-blue-100' },
        'paid': { label: 'Оплачено', color: 'text-green-600 bg-green-50 border-green-100' },
        'overdue': { label: 'Прострочено', color: 'text-red-600 bg-red-50 border-red-100' }
    }[paymentStatus] || { label: 'Невідомо', color: 'text-gray-600 bg-gray-50 border-gray-100' });

    // --- IDENTIFY EMPLOYEE ---
    useEffect(() => {
        const identifyEmployee = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && user.email) {
                const { data: employee } = await supabase.from('employees').select('custom_id').eq('email', user.email).maybeSingle();
                if (employee) setMyEmployeeId(employee.custom_id);
            }
        };
        identifyEmployee();
    }, []);

    // --- LOAD DICTIONARIES ---
    useEffect(() => {
        const loadStaticData = async () => {
            try {
                const [clientsRes, employeesRes] = await Promise.all([
                    supabase.from('clients').select('custom_id, name, company_name').order('name'),
                    supabase.from('employees').select('custom_id, name, position, email').order('name')
                ]);
                setClients(clientsRes.data || []);
                setEmployees(employeesRes.data || []);
            } catch (error) {
                showToast('Помилка завантаження довідників', 'error');
            }
        };
        loadStaticData();
    }, [showToast]);

    // --- LOAD PROJECTS ---
    const loadProjects = useCallback(async () => {
        setLoading(true);
        try {
            const from = (currentPage - 1) * PROJECTS_PER_PAGE;
            const to = from + PROJECTS_PER_PAGE - 1;

            let query = supabase.from('installations').select(`*, client:clients(*), responsible_employee:employees(*)`, { count: 'exact' });

            if (onlyMyProjects && myEmployeeId) {
                query = query.eq('responsible_emp_id', myEmployeeId);
            }

            if (debouncedSearchTerm && debouncedSearchTerm.trim().length > 0) {
                const term = debouncedSearchTerm.trim();
                const isStrictNumber = /^\d+$/.test(term);
                if (isStrictNumber) {
                    query = query.or(`custom_id.eq.${term},client_id.eq.${term}`);
                } else {
                    query = query.or(`name.ilike.%${term}%,notes.ilike.%${term}%,working_company.ilike.%${term}%`);
                }
            } else {
                if (statusFilter === 'active') {
                    query = query.in('status', ['planning', 'in_progress', 'on_hold']);
                } else if (statusFilter !== 'all') {
                    query = query.eq('status', statusFilter);
                }
                
                if (paymentStatusFilter !== 'all') query = query.eq('payment_status', paymentStatusFilter);
                if (companyFilter !== 'all') query = query.eq('working_company', companyFilter);
            }

            const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);

            if (error) throw error;
            setProjects(data || []);
            setTotalCount(count || 0);
        } catch (error) {
            showToast(`Помилка: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, paymentStatusFilter, companyFilter, debouncedSearchTerm, showToast, onlyMyProjects, myEmployeeId]);

    useEffect(() => { loadProjects(); }, [loadProjects]);
    useEffect(() => { setCurrentPage(1); }, [debouncedSearchTerm, statusFilter, paymentStatusFilter, companyFilter, onlyMyProjects]);

    // --- Handlers ---
    const handleDetailsClick = (project) => navigate(`/project/${project.custom_id}`); 
    const handleAddProject = () => { setFormData(initialFormData); setEditingProject(null); setShowProjectForm(true); };
    const handleCloseForm = () => { setShowProjectForm(false); setEditingProject(null); setFormData(initialFormData); };
    const handleInputChange = (field, value) => { setFormData(prev => ({ ...prev, [field]: value })); };
    const handleClientSelect = (client) => { setFormData(prev => ({ ...prev, client_id: client.custom_id })); setClientSearch(`${client.company_name || client.name} (ID: ${client.custom_id})`); };
    const handleEmployeeSelect = (employee) => { setFormData(prev => ({ ...prev, responsible_emp_id: employee.custom_id })); setEmployeeSearch(`${employee.name} (ID: ${employee.custom_id})`); };

    const handleDelete = (projectId, projectName) => {
        if (!canDelete) {
            showToast("У вас немає прав на видалення", "error");
            return;
        }

        setConfirmModal({
            isOpen: true,
            title: "Підтвердити видалення",
            message: `Видалити проект "${projectName}"?`,
            onConfirm: async () => {
                const { error } = await supabase.from('installations').delete().eq('custom_id', projectId);
                if (!error) { showToast('Видалено', 'success'); loadProjects(); }
            }
        });
    }

    const handleSubmit = async () => {
        if (!formData.client_id) { setFormErrors({client_id: 'Оберіть клієнта'}); return; }
        setSubmitting(true);
        try {
            const { client, responsible_employee, ...projectData } = formData;
            const sanitized = { ...projectData, payment_status: updatePaymentStatus(projectData.total_cost, projectData.paid_amount) };
            for(let key in sanitized) if(sanitized[key] === '') sanitized[key] = null;

            if (editingProject) {
                await supabase.from('installations').update(sanitized).eq('custom_id', editingProject.custom_id);
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if(user) sanitized.creator_email = user.email;
                await supabase.from('installations').insert([sanitized]);
            }
            showToast('Збережено', 'success');
            handleCloseForm();
            loadProjects();
        } catch (e) { showToast(e.message, 'error'); }
        finally { setSubmitting(false); }
    };

    const filteredClients = clientSearch ? clients.filter(c => c.name?.toLowerCase().includes(clientSearch.toLowerCase())) : [];
    const filteredEmployees = employeeSearch ? employees.filter(e => e.name?.toLowerCase().includes(employeeSearch.toLowerCase())) : [];

    const Pagination = ({ currentPage, totalCount, projectsPerPage, onPageChange }) => {
        const totalPages = Math.ceil(totalCount / projectsPerPage);
        if (totalPages <= 1) return null;
        return (
            <div className="flex items-center justify-center space-x-4 py-4">
                <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="p-2 disabled:opacity-50 bg-white rounded-md shadow-sm border border-gray-200"><FaChevronLeft /></button>
                <span className="font-medium text-gray-700">Сторінка {currentPage} з {totalPages}</span>
                <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="p-2 disabled:opacity-50 bg-white rounded-md shadow-sm border border-gray-200"><FaChevronRight /></button>
            </div>
        );
    };

    return (
        <Layout>
            <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">
                <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
                <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
                
                <AnimatePresence>
                    {viewingProjectEquipment && <ProjectEquipmentModal project={viewingProjectEquipment} onClose={() => setViewingProjectEquipment(null)} showToast={showToast} setConfirmModal={setConfirmModal} />}
                    {viewingProjectDocs && <ObjectDocumentsModal project={viewingProjectDocs} onClose={() => setViewingProjectDocs(null)} />}
                </AnimatePresence>

                {/* --- HEADER --- */}
                <div className="flex flex-col gap-4 flex-none">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Проекти</h1>
                            <p className="text-slate-500 text-sm mt-1">Управління об'єктами СЕС</p>
                        </div>
                        <button onClick={handleAddProject} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all w-full sm:w-auto">
                            <FaPlus/> <span>Новий проект</span>
                        </button>
                    </div>

                    {/* SEARCH & FILTERS ROW (OPTIMIZED FOR MOBILE) */}
                    <div className="flex flex-col gap-3">
                        {/* 1. ПОШУК (ВЕРХНІЙ РЯДОК) */}
                        <div className="relative w-full">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input 
                                type="text" 
                                placeholder="Пошук (Назва або ID)..." 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition shadow-sm text-sm outline-none"
                            />
                        </div>

                        {/* 2. НИЖНІЙ РЯДОК: ТУМБЛЕР ЗЛІВА, ФІЛЬТРИ СПРАВА */}
                        <div className="flex items-center justify-between gap-3">
                            
                            {/* ТУМБЛЕР (РОЗТЯГУЄТЬСЯ НА МОБІЛЬНОМУ) */}
                            {myEmployeeId ? (
                                <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center shadow-sm flex-1 sm:flex-none">
                                    <button onClick={() => setOnlyMyProjects(false)} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${!onlyMyProjects ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Всі</button>
                                    <button onClick={() => setOnlyMyProjects(true)} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${onlyMyProjects ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                                        <FaUserTie className={onlyMyProjects ? "text-white" : "text-slate-400"} />
                                        <span>Мої</span>
                                    </button>
                                </div>
                            ) : <div></div>}

                            <button 
                                onClick={() => setShowFilters(!showFilters)} 
                                className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition shadow-sm border ${showFilters ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                            >
                                <FaFilter/> <span>Фільтри</span>
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {showFilters && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
                                    <div>
                                        <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">Статус</span>
                                        <div className="flex flex-wrap gap-2">
                                            {[{ v: 'active', l: 'Активні' }, { v: 'all', l: 'Всі' }, { v: 'planning', l: 'План' }, { v: 'in_progress', l: 'Робота' }, { v: 'on_hold', l: 'Пауза' }, { v: 'completed', l: 'Фініш' }, { v: 'cancelled', l: 'Відміна' }].map((s) => (
                                                <button key={s.v} onClick={() => setStatusFilter(s.v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${statusFilter === s.v ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">Оплата</span>
                                        <div className="flex flex-wrap gap-2">
                                            {[{ v: 'all', l: 'Всі' }, { v: 'pending', l: 'Очікує' }, { v: 'partial', l: 'Частково' }, { v: 'paid', l: 'Сплачено' }, { v: 'overdue', l: 'Борг' }].map((s) => (
                                                <button key={s.v} onClick={() => setPaymentStatusFilter(s.v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${paymentStatusFilter === s.v ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">Компанія</span>
                                        <div className="flex flex-wrap gap-2">
                                            {[{ v: 'all', l: 'Всі' }, ...ALLOWED_COMPANIES.map(c => ({v: c, l: c}))].map((c) => (
                                                <button key={c.v} onClick={() => setCompanyFilter(c.v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${companyFilter === c.v ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* --- GRID --- */}
                <div className="flex-1 min-h-[300px]">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 bg-white rounded-xl animate-pulse shadow-sm border border-slate-100"></div>)}
                        </div>
                    ) : projects.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                            <FaProjectDiagram className="mx-auto text-4xl text-slate-300 mb-3"/>
                            <h3 className="text-lg font-bold text-slate-600">Проектів не знайдено</h3>
                            <p className="text-slate-400 text-sm">Спробуйте змінити фільтри</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {projects.map((project) => {
                                const statusInfo = getStatusInfo(project.status);
                                const paymentInfo = getPaymentStatusInfo(project.payment_status);
                                // ОНОВЛЕНО: беремо workflow_stage
                                const workflowInfo = getStageConfig(project.workflow_stage);
                                const StatusIcon = statusInfo.icon;
                                const WorkflowIcon = workflowInfo.icon || FaInfoCircle;
                                const creator = employees.find(e => e.email === project.creator_email);
                                const creatorName = creator ? creator.name : project.creator_email;

                                return (
                                    <motion.div
                                        key={project.custom_id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all hover:-translate-y-1"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start gap-3 mb-4">
                                                <div className="pr-1 flex-1 min-w-0">
                                                    {/* FIX: line-clamp-2 */}
                                                    <h3 className="text-lg font-bold text-slate-800 leading-tight line-clamp-2" title={project.name}>{project.name || project.client?.company_name || 'Без назви'}</h3>
                                                    <span className="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded mt-1 inline-block">#{project.custom_id}</span>
                                                </div>
                                                
                                                <div className="flex flex-col items-end gap-2 min-w-[140px] flex-shrink-0">
                                                    <div title={statusInfo.label} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm ${statusInfo.color}`}>
                                                        <StatusIcon className="text-[10px]"/><span>{statusInfo.label}</span>
                                                    </div>
                                                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${workflowInfo.color}`}>
                                                        <WorkflowIcon className="text-[10px]" /> 
                                                        <span className="truncate max-w-[130px]">{workflowInfo.label}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3 mb-6">
                                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                                    <div className="w-5 flex justify-center text-slate-400"><FaUserFriends size={16}/></div>
                                                    <span className="font-medium truncate">{project.client?.name || 'Без клієнта'}</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                                    <div className="w-5 flex justify-center text-amber-500"><FaBolt size={16}/></div>
                                                    <span>Потужність: <span className="font-bold text-slate-800">{project.capacity_kw ? `${project.capacity_kw} кВт` : 'N/A'}</span></span>
                                                </div>
                                                <div className="flex items-center gap-3 text-sm text-slate-600">
                                                    <div className="w-5 flex justify-center text-indigo-500"><FaHardHat size={16}/></div>
                                                    <span>Відповідальний: <span className="font-bold text-slate-800">{project.responsible_employee?.name || 'Не призначено'}</span></span>
                                                </div>
                                                
                                                {project.creator_email && (
                                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 pt-2 border-t border-slate-100">
                                                        <div className="w-5 flex justify-center"><FaUserEdit size={14}/></div>
                                                        <span>Додав: {creatorName}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="border-t border-slate-100 pt-4 flex justify-between items-center">
                                            <div className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${paymentInfo.color}`}>{paymentInfo.label}</div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => handleDetailsClick(project)} className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 hover:text-blue-600 transition-colors"><FaRegEye size={18}/></button>
                                                <button onClick={() => setViewingProjectEquipment(project)} className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><FaTruck/></button>
                                                <button onClick={() => setViewingProjectDocs(project)} className="w-9 h-9 flex items-center justify-center hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"><FaFolderOpen className="text-indigo-500" /></button>
                                                
                                                {/* 4. КНОПКА ВИДАЛЕННЯ З ОБМЕЖЕННЯМ */}
                                                {canDelete && (
                                                    <button onClick={() => handleDelete(project.custom_id, project.name)} className="w-9 h-9 flex items-center justify-center hover:bg-red-50 rounded-lg text-red-500 transition-colors">
                                                        <FaTrash/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* PAGINATION BOTTOM */}
                <div className="relative pt-4 border-t border-slate-200">
                    <Pagination currentPage={currentPage} totalCount={totalCount} projectsPerPage={PROJECTS_PER_PAGE} onPageChange={setCurrentPage} />
                </div>

                {/* FORM MODAL (UNCHANGED) */}
                <AnimatePresence>
                    {showProjectForm && (
                        <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseForm}>
                            <motion.div className="bg-white rounded-2xl p-4 sm:p-8 w-full max-w-lg md:max-w-4xl shadow-2xl border border-gray-200 my-8 max-h-[90vh] flex flex-col" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
                                <div className="mb-6"><h2 className="text-2xl sm:text-3xl font-bold text-slate-800">{editingProject ? 'Редагувати' : 'Новий проект'}</h2></div>
                                {/* ... Form content same as before ... */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto pr-2 flex-grow">
                                    <div className="md:col-span-2 relative">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Клієнт <span className="text-red-500">*</span></label>
                                        <input type="text" value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); if(formData.client_id) handleInputChange('client_id', ''); }} placeholder="Пошук..." className={`w-full border rounded-xl px-4 py-3 ${formErrors.client_id ? 'border-red-500' : 'border-gray-300'}`} />
                                        {clientSearch && filteredClients.length > 0 && !formData.client_id && (
                                            <div className="absolute z-20 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                                                {filteredClients.map(client => (
                                                    <button key={client.custom_id} type="button" onClick={() => handleClientSelect(client)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0">
                                                        <div className="font-medium">{client.company_name || client.name}</div>
                                                        <div className="text-xs text-gray-500">ID: {client.custom_id}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Назва</label><input type="text" value={formData.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                    
                                    <div className="md:col-span-2 bg-slate-50 p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
                                            <select value={formData.status || ''} onChange={(e) => handleInputChange('status', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white">
                                                <option value="planning">Планування</option>
                                                <option value="in_progress">Виконується</option>
                                                <option value="on_hold">Призупинено</option>
                                                <option value="completed">Завершено</option>
                                                <option value="cancelled">Скасовано</option>
                                            </select>
                                        </div>
                                        {/* ОНОВЛЕНО: SELECT ДЛЯ ЕТАПУ ЗБЕРІГАЄ В workflow_stage */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Етап</label>
                                            <select value={formData.workflow_stage || 'tech_review'} onChange={(e) => handleInputChange('workflow_stage', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white text-indigo-900 font-medium">
                                                {WORKFLOW_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Компанія</label><select value={formData.working_company || ''} onChange={(e) => handleInputChange('working_company', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="">Виберіть...</option>{ALLOWED_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Банк?</label><select value={formData.bank || ''} onChange={(e) => handleInputChange('bank', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="">Виберіть...</option><option value="Так">Так</option><option value="Ні">Ні</option></select></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">GPS</label><input type="url" value={formData.gps_link || ''} onChange={(e) => handleInputChange('gps_link', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Координати</label><div className="flex space-x-2"><input type="number" step="any" value={formData.latitude || ''} onChange={(e) => handleInputChange('latitude', e.target.value)} className="w-1/2 border border-gray-300 rounded-xl px-4 py-3" placeholder="Широта" /><input type="number" step="any" value={formData.longitude || ''} onChange={(e) => handleInputChange('longitude', e.target.value)} className="w-1/2 border border-gray-300 rounded-xl px-4 py-3" placeholder="Довгота" /></div></div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Тип монтажу</label>
                                        <select value={formData.mount_type || ''} onChange={(e) => handleInputChange('mount_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white">
                                            <option value="">Виберіть...</option>
                                            <option value="Дахове кріплення (Скатний дах)">Дахове кріплення (Скатний дах)</option>
                                            <option value="Дахове кріплення (Плоский дах)">Дахове кріплення (Плоский дах)</option>
                                            <option value="Наземне кріплення">Наземне кріплення</option>
                                            <option value="Трекерна система">Трекерна система</option>
                                            <option value="Дах/Земля">Дах/Земля</option>
                                            <option value="Електромонтаж">Електромонтаж</option>
                                            <option value="Інше">Інше</option>
                                        </select>
                                    </div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Тип станції</label><select value={formData.station_type || ''} onChange={(e) => handleInputChange('station_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white"><option value="">Виберіть...</option><option value="Мережева">Мережева</option><option value="Автономна">Автономна</option><option value="Гібридна">Гібридна</option></select></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Потужність (кВт)</label><input type="number" step="0.1" min="0" value={formData.capacity_kw || ''} onChange={(e) => handleInputChange('capacity_kw', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                    <div className="relative">
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Відповідальний</label>
                                        <input type="text" value={employeeSearch} onChange={(e) => {setEmployeeSearch(e.target.value); if(formData.responsible_emp_id) handleInputChange('responsible_emp_id', '');}} placeholder="Пошук..." className="w-full border border-gray-300 rounded-xl px-4 py-3" />
                                        {employeeSearch && filteredEmployees.length > 0 && !formData.responsible_emp_id && (
                                            <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                                                {filteredEmployees.map(emp => (
                                                    <button key={emp.custom_id} type="button" onClick={() => handleEmployeeSelect(emp)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b">
                                                        <div className="font-medium">{emp.name}</div>
                                                        <div className="text-xs text-gray-500">ID: {emp.custom_id}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Старт</label><input type="date" value={formData.start_date || ''} onChange={(e) => handleInputChange('start_date', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Фініш</label><input type="date" value={formData.end_date || ''} onChange={(e) => handleInputChange('end_date', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Вартість (USD)</label><input type="number" min="0" step="0.01" value={formData.total_cost || ''} onChange={(e) => handleInputChange('total_cost', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-2">Сплачено (USD)</label><input type="number" min="0" step="0.01" value={formData.paid_amount || ''} onChange={(e) => handleInputChange('paid_amount', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" /></div>
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label><textarea rows="3" value={formData.notes || ''} onChange={(e) => handleInputChange('notes', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 resize-none"></textarea></div>
                                </div>
                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6 flex-shrink-0">
                                    <button type="button" onClick={handleCloseForm} disabled={submitting} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition">Скасувати</button>
                                    <button type="button" onClick={handleSubmit} disabled={submitting} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium transition hover:bg-indigo-700 flex items-center space-x-2">
                                        {submitting ? <span>Збереження...</span> : <span>Зберегти</span>}
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