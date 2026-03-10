import React, { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaHandshake, FaPlus,
  FaBolt, FaSearch, FaFilter, FaTools, 
  FaClock, FaCheckCircle, FaExclamationTriangle, FaPause, FaTimes,
  FaChevronLeft, FaChevronRight, FaCheck, FaInfoCircle, FaTrash, FaHardHat,
  FaUserTie, FaBuilding, FaPhoneAlt, FaListUl, FaMapMarkerAlt, FaDraftingCompass, FaFileInvoiceDollar,
  FaTruckLoading, FaBoxOpen, FaSolarPanel,FaFileSignature, FaBroadcastTower
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./Layout";
import { useAuth } from "./AuthProvider"; 

// --- CONSTANTS ---
const PROJECTS_PER_PAGE = 6;
const ALLOWED_COMPANIES = ['Кайрос', 'Розумне збереження енергії'];

const WORKFLOW_STAGES = [
    { value: 'tech_review', label: 'Заміри', icon: FaMapMarkerAlt, color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    { value: 'project', label: 'Проект', icon: FaDraftingCompass, color: 'bg-orange-50 text-orange-700 border-orange-200' },
    { value: 'proposal', label: 'КП', icon: FaFileInvoiceDollar, color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
    { value: 'equipment', label: 'Обладнання', icon: FaTruckLoading, color: 'bg-amber-50 text-amber-700 border-amber-200' },
    { value: 'complectation', label: 'Комплектація', icon: FaBoxOpen, color: 'bg-blue-50 text-blue-700 border-blue-200' },
    { value: 'installation', label: 'Монтаж', icon: FaSolarPanel, color: 'bg-blue-100 text-blue-800 border-blue-300' },
    { value: 'grid_connection', label: 'Мережа', icon: FaFileSignature, color: 'bg-purple-100 text-purple-800 border-purple-300' },
    { value: 'monitoring_setup', label: 'Запуск', icon: FaBroadcastTower, color: 'bg-cyan-50 text-cyan-800 border-cyan-300' },
];

const DETAILED_TASKS = {
  tech_review: [{ id: "tech_review", title: "Проведення замірів" }],
  project: [
    { id: "project_design", title: "3D візуалізація" }, 
    { id: "project_approval", title: "Затвердження дизайну" },
    { id: "tech_project", title: "Технічний проект" }
  ],
  proposal: [{ id: "commercial_proposal", title: "Комерційна пропозиція" }],
  equipment: [{ id: "equipment", title: "Закупівля обладнання" }],
  complectation: [
    { id: "complectation", title: "Матеріали" }, 
    { id: "comp_protection", title: "Ел. захист" } 
  ],
  installation: [
    { id: "inst_structure", title: "Конструкція" },
    { id: "inst_panels", title: "Панелі" },
    { id: "inst_cabling", title: "Траса DC" },
    { id: "inst_grounding", title: "Заземлення" },
    { id: "inst_inverter", title: "Інвертор" }
  ],
  grid_connection: [{ id: "grid_connection", title: "Заведення потужності" }],
  monitoring_setup: [{ id: "monitoring_setup", title: "Запуск станції" }]
};

const STATUS_CONFIG = {
  default: [
    { key: "todo", label: "Не почато", color: "bg-slate-50 text-slate-500 border-slate-200" }, 
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" }, 
    { key: "done", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  tech_project_group: [
    { key: "todo", label: "Не почато", color: "bg-slate-50 text-slate-500 border-slate-200" },
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "done", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  proposal: [
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В процесі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "created", label: "Зроблено", color: "bg-blue-50 text-blue-700 border-blue-200" }, 
    { key: "approved", label: "Погоджено", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  project: [
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В розробці", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "created", label: "Зроблено", color: "bg-blue-50 text-blue-700 border-blue-200" }, 
    { key: "approved", label: "Затверджено", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  equipment: [
    { key: "waiting", label: "Не почато", color: "bg-slate-50 text-slate-500 border-slate-200" }, 
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "ordered", label: "Замовлено", color: "bg-purple-50 text-purple-700 border-purple-200" },
    { key: "arrived", label: "Прибуло", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  tech_review: [
    { key: "waiting_client", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "done_on_site", label: "На виїзді", color: "bg-blue-50 text-blue-700 border-blue-200" }, 
    { key: "completed", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  installation: [
    { key: "waiting_start", label: "Очікуємо", color: "bg-slate-50 text-slate-500 border-slate-200" }, 
    { key: "started", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" }, 
    { key: "completed", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  project_selector: [
    { key: "selection_needed", label: "Треба обрати", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "selected", label: "Обрано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ]
};

const getMicroStageMeta = (stageGroupKey, statusKey, taskId) => {
    let config = STATUS_CONFIG.default;
    if (taskId === "project_approval") config = STATUS_CONFIG.project_selector;
    else if (taskId === "tech_project") config = STATUS_CONFIG.tech_project_group;
    else if (STATUS_CONFIG[stageGroupKey]) config = STATUS_CONFIG[stageGroupKey];
    else if (stageGroupKey === "installation") config = STATUS_CONFIG.installation;

    const item = config.find(i => i.key === statusKey);
    return item || { label: statusKey || "Не почато", color: "bg-slate-50 text-slate-500 border-slate-200" };
};

const STAGE_ALIASES = {
    'project_design': 'project',
    'commercial_proposal': 'proposal',
    'advance_payment': 'proposal', 
    'tech_measurements': 'tech_review',
    'mon_launch_station': 'monitoring_setup'
};

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
  const styles = { success: 'bg-teal-600 text-white', error: 'bg-red-600 text-white', info: 'bg-blue-600 text-white' };
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
export default function PartnershipPage() {
    const { role } = useAuth();
    const canDelete = role === 'admin' || role === 'super_admin' || role === 'office';

    const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('part_search') || "");
    const debouncedSearchTerm = useDebounce(searchTerm, 400);
    const [statusFilter, setStatusFilter] = useState(() => sessionStorage.getItem('part_status') || "active"); 
    const [companyFilter, setCompanyFilter] = useState(() => sessionStorage.getItem('part_company') || "all");
    const [onlyMyProjects, setOnlyMyProjects] = useState(() => sessionStorage.getItem('part_my') === 'true');
    const [currentPage, setCurrentPage] = useState(() => parseInt(sessionStorage.getItem('part_page')) || 1);

    useEffect(() => { sessionStorage.setItem('part_search', searchTerm); }, [searchTerm]);
    useEffect(() => { sessionStorage.setItem('part_status', statusFilter); }, [statusFilter]);
    useEffect(() => { sessionStorage.setItem('part_company', companyFilter); }, [companyFilter]);
    useEffect(() => { sessionStorage.setItem('part_my', onlyMyProjects); }, [onlyMyProjects]);
    useEffect(() => { sessionStorage.setItem('part_page', currentPage); }, [currentPage]);

    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [myEmployeeId, setMyEmployeeId] = useState(null); 

    const [showProjectForm, setShowProjectForm] = useState(false);
    const [editingProject, setEditingProject] = useState(null);
    
    const [showInlineClientForm, setShowInlineClientForm] = useState(false);
    const [inlineClient, setInlineClient] = useState({ name: '', company_name: '', phone: '' });

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const [clients, setClients] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [clientSearch, setClientSearch] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");

    const navigate = useNavigate();

    const initialFormData = {
        name: '', working_company: '', client_id: '', gps_link: '',
        mount_type: '', station_type: '', capacity_kw: '',
        responsible_emp_id: '', partner_manager: '',
        quant_phase: '', notes: '', creator_email: ''
    };

    const [formData, setFormData] = useState(initialFormData);
    const [formErrors, setFormErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [totalCount, setTotalCount] = useState(0);
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });

    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);
    const hideToast = useCallback(() => setToast(prev => ({ ...prev, isVisible: false })), []);

    const getStageConfig = (val) => {
        const normalizedKey = STAGE_ALIASES[val] || val;
        const config = WORKFLOW_STAGES.find(s => s.value === normalizedKey);
        return config || { label: val || 'Не визначено', color: 'bg-gray-50 text-gray-500 border border-gray-200' };
    };

    const getStatusInfo = (status) => ({
        'planning': { label: 'Планування', color: 'bg-blue-500' },
        'in_progress': { label: 'В роботі', color: 'bg-yellow-500' },
        'on_hold': { label: 'Призупинено', color: 'bg-orange-500' },
        'completed': { label: 'Завершено', color: 'bg-teal-500' },
        'cancelled': { label: 'Скасовано', color: 'bg-red-500' }
    }[status] || { label: 'Невідомо', color: 'bg-gray-500' });

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

    const loadProjects = useCallback(async () => {
        setLoading(true);
        try {
            const from = (currentPage - 1) * PROJECTS_PER_PAGE;
            const to = from + PROJECTS_PER_PAGE - 1;

            let query = supabase.from('installations')
                .select(`
                    *, 
                    client:clients(*), 
                    responsible_employee:employees!installations_responsible_emp_id_fkey(*), 
                    project_stages(stage_key, status),
                    workflow_events(stage_key, new_responsible, created_at)
                `, { count: 'exact' })
                .eq('is_subcontract', true); 

            if (onlyMyProjects && myEmployeeId) {
                query = query.eq('responsible_emp_id', myEmployeeId);
            }

            if (debouncedSearchTerm && debouncedSearchTerm.trim().length > 0) {
                const term = debouncedSearchTerm.trim();
                const isStrictNumber = /^\d+$/.test(term);
                if (isStrictNumber) {
                    query = query.or(`custom_id.eq.${term},client_id.eq.${term}`);
                } else {
                    query = query.or(`name.ilike.%${term}%,notes.ilike.%${term}%,working_company.ilike.%${term}%,partner_manager.ilike.%${term}%`);
                }
            } else {
                if (statusFilter === 'active') {
                    query = query.in('status', ['planning', 'in_progress', 'on_hold']);
                } else if (statusFilter !== 'all') {
                    query = query.eq('status', statusFilter);
                }
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
    }, [currentPage, statusFilter, companyFilter, debouncedSearchTerm, showToast, onlyMyProjects, myEmployeeId]);

    useEffect(() => { loadProjects(); }, [loadProjects]);
    
    const isFirstRender = React.useRef(true);
    useEffect(() => { 
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        setCurrentPage(1); 
    }, [debouncedSearchTerm, statusFilter, companyFilter, onlyMyProjects]);

    const handleDetailsClick = (project) => navigate(`/partner-project/${project.custom_id}`); 
    
    const handleAddProject = () => {
        setFormData(initialFormData);
        setEditingProject(null);
        setClientSearch('');
        setEmployeeSearch('');
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
        setShowProjectForm(true);
    };
    
    const handleEditProject = (project) => {
        setFormData({
            ...initialFormData,
            ...project,
            client_id: project.client_id,
            responsible_emp_id: project.responsible_emp_id,
            partner_manager: project.partner_manager || ''
        });
        setClientSearch(project.client ? `${project.client.company_name || project.client.name} (ID: ${project.client.custom_id})` : '');
        setEmployeeSearch(project.responsible_employee ? `${project.responsible_employee.name} (ID: ${project.responsible_employee.custom_id})` : '');
        setEditingProject(project);
        setShowProjectForm(true);
    };

    const handleCloseForm = () => {
        setShowProjectForm(false);
        setEditingProject(null);
        setFormData(initialFormData);
        setClientSearch('');
        setEmployeeSearch('');
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
    };
    
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
            message: `Видалити підряд "${projectName}"?`,
            onConfirm: async () => {
                const { error } = await supabase.from('installations').delete().eq('custom_id', projectId);
                if (!error) { showToast('Видалено', 'success'); loadProjects(); }
            }
        });
    }

    const handleSubmit = async () => {
        setFormErrors({});
        setSubmitting(true);
        try {
            let clientIdToUse = formData.client_id;
            if (!clientIdToUse) {
                const name = (inlineClient.name || '').trim();
                if (!name) {
                    setFormErrors({ client_id: 'Оберіть компанію-партнера або створіть нову через "+"' });
                    return;
                }

                const payload = {
                    name,
                    company_name: (inlineClient.company_name || '').trim() || null,
                    phone: (inlineClient.phone || '').trim() || null,
                };

                const { data: created, error: createErr } = await supabase
                    .from('clients')
                    .insert([payload])
                    .select('custom_id, name, company_name')
                    .single();

                if (createErr) throw createErr;
                clientIdToUse = created.custom_id;

                setClients(prev => {
                    const exists = prev.some(c => c.custom_id === created.custom_id);
                    return exists ? prev : [created, ...prev];
                });
                setClientSearch(`${created.company_name || created.name} (ID: ${created.custom_id})`);
            }

            const { client, responsible_employee, project_stages, workflow_events, workflow_stage, status, ...projectData } = formData;
            const sanitized = {
                ...projectData,
                client_id: clientIdToUse,
                is_subcontract: true 
            };
            
            if (!editingProject) {
                sanitized.status = 'planning';
                sanitized.workflow_stage = 'tech_review';
            }

            for (let key in sanitized) if (sanitized[key] === '') sanitized[key] = null;

            if (editingProject) {
                await supabase.from('installations').update(sanitized).eq('custom_id', editingProject.custom_id);
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) sanitized.creator_email = user.email;
                await supabase.from('installations').insert([sanitized]);
            }

            showToast('Збережено', 'success');
            handleCloseForm();
            loadProjects();
        } catch (e) {
            showToast(e.message || 'Помилка збереження', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredClients = clientSearch
        ? clients.filter(c => {
            const t = clientSearch.toLowerCase();
            return (c.name || '').toLowerCase().includes(t) || (c.company_name || '').toLowerCase().includes(t);
        })
        : [];
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
            <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800 bg-slate-50/50">
                <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
                <ConfirmationModal {...confirmModal} onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })} />
                
                {/* --- HEADER --- */}
                <div className="flex flex-col gap-4 flex-none">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center text-2xl shadow-sm border border-teal-200">
                                <FaHandshake />
                            </div>
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-800">Партнерство</h1>
                                <p className="text-slate-500 text-sm mt-1">Управління об'єктами по співпраці (Підряди)</p>
                            </div>
                        </div>
                        <button onClick={handleAddProject} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-xl font-bold shadow-lg hover:bg-teal-700 active:scale-95 transition-all w-full sm:w-auto">
                            <FaPlus/> <span>Додати об'єкт</span>
                        </button>
                    </div>

                    {/* SEARCH & FILTERS ROW */}
                    <div className="flex flex-col gap-3">
                        <div className="relative w-full">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input 
                                type="text" 
                                placeholder="Пошук (Назва, Партнер, Відповідальний)..." 
                                value={searchTerm} 
                                onChange={(e) => setSearchTerm(e.target.value)} 
                                className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 transition shadow-sm text-sm outline-none"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            {myEmployeeId ? (
                                <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center shadow-sm flex-1 sm:flex-none">
                                    <button onClick={() => setOnlyMyProjects(false)} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${!onlyMyProjects ? 'bg-teal-50 text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Всі</button>
                                    <button onClick={() => setOnlyMyProjects(true)} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${onlyMyProjects ? 'bg-teal-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
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
                                <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-4 shadow-sm">
                                    <div>
                                        <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">Статус робіт</span>
                                        <div className="flex flex-wrap gap-2">
                                            {[{ v: 'active', l: 'Активні' }, { v: 'all', l: 'Всі' }, { v: 'planning', l: 'План' }, { v: 'in_progress', l: 'Робота' }, { v: 'on_hold', l: 'Пауза' }, { v: 'completed', l: 'Фініш' }, { v: 'cancelled', l: 'Відміна' }].map((s) => (
                                                <button key={s.v} onClick={() => setStatusFilter(s.v)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${statusFilter === s.v ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">Компанія-виконавець (Наша)</span>
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
                            <FaHandshake className="mx-auto text-4xl text-slate-300 mb-3"/>
                            <h3 className="text-lg font-bold text-slate-600">Об'єктів партнерів не знайдено</h3>
                            <p className="text-slate-400 text-sm">Спробуйте змінити фільтри пошуку</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {projects.map((project) => {
                                const statusInfo = getStatusInfo(project.status);
                                
                                const currentMacroStageKey = project.workflow_stage || 'tech_review';
                                const currentMacroStageInfo = getStageConfig(currentMacroStageKey);
                                
                                const activeTasks = DETAILED_TASKS[currentMacroStageKey] || [];
                                const stagesFromDb = project.project_stages || [];

                                return (
                                    <motion.div
                                        key={project.custom_id}
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -10 }}
                                        className="bg-white border border-slate-200 rounded-2xl p-0 shadow-sm flex flex-col hover:shadow-md transition-all overflow-hidden"
                                    >
                                        {/* HEADER CARD */}
                                        <div className="bg-slate-50/50 border-b border-slate-100 p-5 pb-4">
                                            <div className="flex justify-between items-start gap-2 mb-2">
                                                <span className="text-xs font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-sm">#{project.custom_id}</span>
                                                <div title={statusInfo.label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold text-white shadow-sm ${statusInfo.color}`}>
                                                    <span>{statusInfo.label}</span>
                                                </div>
                                            </div>
                                            <h3 className="text-lg font-bold text-slate-800 leading-tight line-clamp-2" title={project.name}>{project.name || 'Обʼєкт без назви'}</h3>
                                            
                                            {/* B2B2C Рядок клієнта */}
                                            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5 font-medium truncate">
                                                <FaBuilding className="text-slate-400 shrink-0"/>
                                                <span className="truncate">
                                                    {project.client?.name ? `${project.client.name} • ` : ''}
                                                    {project.client?.contractor_company || project.client?.company_name || 'Компанія-партнер'}
                                                </span>
                                            </p>
                                        </div>

                                        <div className="p-5 flex-1 flex flex-col">
                                            {/* Наш відповідальний та Потужність */}
                                            <div className="flex items-center justify-between mb-4">
                                                <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-xl p-2 pr-4 flex-1 mr-3">
                                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                                        <FaHardHat size={16}/>
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Наш відповідальний</div>
                                                        <div className="text-sm font-bold text-slate-800 truncate" title={project.responsible_employee?.name}>
                                                            {project.responsible_employee?.name || 'Не призначено'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-xs font-bold text-slate-500 flex flex-col items-end shrink-0">
                                                    <span className="text-[9px] text-slate-400 uppercase tracking-wider">Потужність</span>
                                                    <span className="flex items-center gap-1 text-slate-700 mt-0.5">
                                                        <FaBolt className="text-amber-500" />
                                                        {project.capacity_kw ? `${project.capacity_kw} кВт` : 'N/A'}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* ДИНАМІЧНИЙ БЛОК: ЗАВДАННЯ ПОТОЧНОГО ЕТАПУ */}
                                            <div className="bg-slate-50/50 rounded-xl border border-slate-100 p-4 mt-auto">
                                                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                                                    <FaListUl className="text-indigo-400" /> 
                                                    Етап: <span className="text-indigo-600">{currentMacroStageInfo.label}</span>
                                                </h4>
                                                
                                                <div className="grid grid-cols-1 gap-2.5">
                                                    {activeTasks.length > 0 ? activeTasks.map(taskTemplate => {
                                                        const stageRecord = stagesFromDb.find(s => s.stage_key === taskTemplate.id);
                                                        
                                                        let currentStatus = stageRecord?.status;
                                                        if (!currentStatus) {
                                                            if (taskTemplate.id === "equipment" || taskTemplate.id === "project_design" || taskTemplate.id === "commercial_proposal") currentStatus = "waiting";
                                                            else currentStatus = "todo";
                                                        }
                                                        if (taskTemplate.id === "project_approval" && !stageRecord?.status) {
                                                            currentStatus = "selection_needed";
                                                        }

                                                        const meta = getMicroStageMeta(currentMacroStageKey, currentStatus, taskTemplate.id);
                                                        
                                                        const stageEvents = project.workflow_events?.filter(
                                                            event => event.stage_key === taskTemplate.id && event.new_responsible !== null
                                                        ) || [];
                                                        
                                                        stageEvents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                                                        
                                                        const latestResponsibleId = stageEvents.length > 0 ? stageEvents[0].new_responsible : null;
                                                        
                                                        const employee = latestResponsibleId 
                                                            ? employees.find(e => String(e.custom_id) === String(latestResponsibleId)) 
                                                            : null;

                                                        const empInitial = employee ? employee.name.charAt(0).toUpperCase() : '?';

                                                        return (
                                                            <div key={taskTemplate.id} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col gap-2.5 hover:border-teal-100 transition-colors">
                                                                <div className="flex justify-between items-start gap-2">
                                                                    <span className="font-bold text-slate-700 text-xs leading-tight flex-1">{taskTemplate.title}</span>
                                                                    <div className={`px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap shrink-0 ${meta.color}`}>
                                                                        {meta.label}
                                                                    </div>
                                                                </div>
                                                                <div className={`flex items-center gap-2 text-[10px] px-2 py-1.5 rounded-md w-full border ${employee ? 'bg-teal-50/50 border-teal-100 text-teal-800' : 'bg-slate-50 border-slate-100 text-slate-500'}`}>
                                                                    {employee ? (
                                                                        <>
                                                                            <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                                                                                {empInitial}
                                                                            </div>
                                                                            <span className="font-bold whitespace-normal leading-tight">{employee.name}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <FaUserTie className="text-slate-400 shrink-0" />
                                                                            <span className="italic font-medium">Виконавця не призначено</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : (
                                                        <div className="text-xs text-slate-400 text-center py-2 italic">Немає визначених завдань</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Футер картки */}
                                        <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-between items-center gap-3">
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => handleEditProject(project)} className="p-2.5 text-slate-400 hover:text-teal-600 hover:bg-white rounded-lg transition-colors shadow-sm border border-transparent hover:border-slate-200" title="Швидке редагування">
                                                    <FaTools size={14}/>
                                                </button>
                                                {canDelete && (
                                                    <button onClick={() => handleDelete(project.custom_id, project.name)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors shadow-sm border border-transparent hover:border-slate-200" title="Видалити">
                                                        <FaTrash size={14}/>
                                                    </button>
                                                )}
                                            </div>
                                            
                                            <button 
                                                onClick={() => handleDetailsClick(project)} 
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50 text-teal-700 rounded-lg text-xs font-bold transition-all shadow-sm"
                                            >
                                                Відкрити картку <FaChevronRight size={10}/>
                                            </button>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="relative pt-4 border-t border-slate-200">
                    <Pagination currentPage={currentPage} totalCount={totalCount} projectsPerPage={PROJECTS_PER_PAGE} onPageChange={setCurrentPage} />
                </div>

                {/* FORM MODAL */}
                <AnimatePresence>
                    {showProjectForm && (
                        <motion.div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseForm}>
                            <motion.div className="bg-white rounded-2xl p-4 sm:p-8 w-full max-w-lg md:max-w-4xl shadow-2xl my-8 max-h-[90vh] flex flex-col" initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 bg-teal-100 text-teal-600 rounded-xl flex items-center justify-center"><FaHandshake size={20}/></div>
                                    <h2 className="text-2xl font-bold text-slate-800">{editingProject ? 'Редагувати об\'єкт' : 'Додати об\'єкт від партнера'}</h2>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5 overflow-y-auto pr-2 flex-grow custom-scrollbar">
                                    
                                    {/* БЛОК ПАРТНЕРА */}
                                    <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-5 relative">
                                        <div className="absolute top-0 left-0 w-1 h-full bg-teal-500 rounded-l-xl"></div>
                                        <h4 className="text-sm font-bold text-slate-800 mb-4 uppercase tracking-wider flex items-center gap-2"><FaBuilding className="text-teal-500"/> Інформація про партнера</h4>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="relative">
                                                <div className="flex items-center justify-between mb-1">
                                                    <label className="block text-sm font-medium text-gray-700">Компанія-партнер <span className="text-red-500">*</span></label>
                                                    <button type="button" onClick={() => setShowInlineClientForm(v => !v)} className="text-xs font-bold text-teal-600 hover:text-teal-800 flex items-center gap-1">
                                                        <FaPlus /> Створити нову
                                                    </button>
                                                </div>

                                                <input
                                                    type="text"
                                                    value={clientSearch}
                                                    onChange={(e) => {
                                                        setClientSearch(e.target.value);
                                                        if (formData.client_id) handleInputChange('client_id', '');
                                                    }}
                                                    placeholder="Пошук партнера..."
                                                    className={`w-full border rounded-xl px-4 py-2.5 bg-white ${formErrors.client_id ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500'}`}
                                                />
                                                {formErrors.client_id && <div className="mt-1 text-xs font-bold text-red-600">{formErrors.client_id}</div>}
                                                
                                                {clientSearch && filteredClients.length > 0 && !formData.client_id && (
                                                    <div className="absolute z-20 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                                                        {filteredClients.map(client => (
                                                            <button key={client.custom_id} type="button" onClick={() => handleClientSelect(client)} className="w-full px-4 py-3 text-left hover:bg-teal-50 border-b last:border-b-0">
                                                                <div className="font-medium">{client.company_name || client.name}</div>
                                                                <div className="text-xs text-gray-500">ID: {client.custom_id}</div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Відповідальний від партнера</label>
                                                <div className="relative">
                                                    <FaPhoneAlt className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"/>
                                                    <input type="text" value={formData.partner_manager || ''} onChange={(e) => handleInputChange('partner_manager', e.target.value)} placeholder="Ім'я, телефон..." className="w-full border border-gray-300 rounded-xl pl-9 pr-4 py-2.5 bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500" />
                                                </div>
                                            </div>
                                        </div>

                                        {showInlineClientForm && !editingProject && (
                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 bg-white border border-teal-100 rounded-xl p-4 overflow-hidden shadow-inner">
                                                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                                                    <div className="text-sm font-bold text-teal-800">Нова компанія-партнер</div>
                                                    <button type="button" onClick={() => setShowInlineClientForm(false)} className="text-slate-400 hover:text-slate-600"><FaTimes /></button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="md:col-span-2">
                                                        <label className="block text-xs font-bold text-slate-500 mb-1">Назва компанії або ПІБ <span className="text-red-500">*</span></label>
                                                        <input type="text" value={inlineClient.name} onChange={(e) => setInlineClient(prev => ({ ...prev, name: e.target.value }))} placeholder="Напр. ТОВ 'ЕнергоБуд'" className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-slate-50" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-1">Юридична назва (опціонально)</label>
                                                        <input type="text" value={inlineClient.company_name} onChange={(e) => setInlineClient(prev => ({ ...prev, company_name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-slate-50" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-slate-500 mb-1">Телефон керівника</label>
                                                        <input type="tel" value={inlineClient.phone} onChange={(e) => setInlineClient(prev => ({ ...prev, phone: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 bg-slate-50" />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </div>

                                    {/* БЛОК ОБ'ЄКТА */}
                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Назва об'єкта</label><input type="text" value={formData.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} placeholder="Напр. СЕС 30кВт Стрий" className="w-full border border-gray-300 rounded-xl px-4 py-2.5" /></div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Наша компанія (Хто монтує)</label>
                                        <select value={formData.working_company || ''} onChange={(e) => handleInputChange('working_company', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white"><option value="">Виберіть...</option>{ALLOWED_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                    </div>
                                    <div className="relative">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Наш відповідальний</label>
                                        <input type="text" value={employeeSearch} onChange={(e) => {setEmployeeSearch(e.target.value); if(formData.responsible_emp_id) handleInputChange('responsible_emp_id', '');}} placeholder="Пошук..." className="w-full border border-gray-300 rounded-xl px-4 py-2.5" />
                                        {employeeSearch && filteredEmployees.length > 0 && !formData.responsible_emp_id && (
                                            <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                                                {filteredEmployees.map(emp => (
                                                    <button key={emp.custom_id} type="button" onClick={() => handleEmployeeSelect(emp)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b">
                                                        <div className="font-medium">{emp.name}</div>
                                                        <div className="text-xs text-gray-500">{emp.position || `ID: ${emp.custom_id}`}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">GPS Локація</label><input type="url" value={formData.gps_link || ''} onChange={(e) => handleInputChange('gps_link', e.target.value)} placeholder="https://maps.google.com/..." className="w-full border border-gray-300 rounded-xl px-4 py-2.5" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 mb-1">Потужність (кВт)</label><input type="number" step="0.1" min="0" value={formData.capacity_kw || ''} onChange={(e) => handleInputChange('capacity_kw', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5" /></div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Тип станції</label>
                                        <select value={formData.station_type || ''} onChange={(e) => handleInputChange('station_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white focus:ring-teal-500 focus:border-teal-500">
                                            <option value="">—</option>
                                            <option value="Мережева">Мережева</option>
                                            <option value="Гібрид">Гібрид</option>
                                            <option value="Мережева/Гібрид">Мережева/Гібрид</option>
                                            <option value="Автономна">Автономна</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Тип монтажу</label>
                                        <select value={formData.mount_type || ''} onChange={(e) => handleInputChange('mount_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white">
                                            <option value="">Виберіть...</option>
                                            <option value="Дахове кріплення (Скатний дах)">Дахове (Скатний дах)</option>
                                            <option value="Дахове кріплення (Плоский дах)">Дахове (Плоский дах)</option>
                                            <option value="Наземне кріплення">Наземне кріплення</option>
                                            <option value="Дах/Земля">Дах/Земля</option>
                                            <option value="АКБ + Інвертор">АКБ + Інвертор</option>
                                            <option value="Електромонтаж">Електромонтаж</option>
                                            <option value="Інше">Інше</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">К-сть фаз</label>
                                        <select value={formData.quant_phase || ''} onChange={(e) => handleInputChange('quant_phase', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 bg-white">
                                            <option value="">Виберіть...</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Додаткові примітки / Специфіка об'єкта</label><textarea rows="2" value={formData.notes || ''} onChange={(e) => handleInputChange('notes', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 resize-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"></textarea></div>
                                </div>
                                <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-6 flex-shrink-0">
                                    <button type="button" onClick={handleCloseForm} disabled={submitting} className="px-6 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-bold transition">Скасувати</button>
                                    <button type="button" onClick={handleSubmit} disabled={submitting} className="px-8 py-2.5 bg-teal-600 text-white rounded-xl font-bold transition hover:bg-teal-700 flex items-center shadow-lg hover:shadow-xl">
                                        {submitting ? 'Збереження...' : 'Зберегти об\'єкт'}
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