import React, { useState, useEffect, useCallback } from "react";
// --- ЗМІНА: Імпортуємо useNavigate для навігації ---
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaProjectDiagram, FaMapMarkerAlt, FaCalendarAlt, FaUsers, FaEdit, FaPlus,
  FaArrowLeft, FaBolt, FaSearch, FaFilter, FaBuilding, FaTools, FaMoneyBillWave,
  FaClock, FaCheckCircle, FaExclamationTriangle, FaPause, FaSave, FaTimes,
  FaChevronLeft, FaChevronRight, FaCheck, FaInfoCircle, FaTrash, FaHardHat, FaUniversity
} from "react-icons/fa";
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

const PROJECTS_PER_PAGE = 6;
const ALLOWED_COMPANIES = ['Кайрос', 'Розумне збереження енергії'];

// Toast Component
const Toast = ({ message, type = 'success', isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-gradient-to-r from-green-500 to-green-600 text-white';
      case 'error':
        return 'bg-gradient-to-r from-red-500 to-red-600 text-white';
      case 'info':
        return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white';
      default:
        return 'bg-gradient-to-r from-gray-500 to-gray-600 text-white';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <FaCheck className="text-lg" />;
      case 'error':
        return <FaExclamationTriangle className="text-lg" />;
      case 'info':
        return <FaInfoCircle className="text-lg" />;
      default:
        return <FaInfoCircle className="text-lg" />;
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 300, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 300, scale: 0.8 }}
          className="fixed top-4 right-4 z-50"
        >
          <div className={`${getToastStyles()} rounded-xl shadow-2xl p-4 min-w-80 backdrop-blur-xl border border-white/20`}>
            <div className="flex items-center space-x-3">
              {getIcon()}
              <span className="font-medium text-sm">{message}</span>
              <button
                onClick={onClose}
                className="ml-auto text-white/80 hover:text-white transition-colors"
              >
                <FaTimes className="text-sm" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);

  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editingStatus, setEditingStatus] = useState({});
  const [clientSearch, setClientSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  
  // --- ЗМІНА: Ініціалізуємо хук useNavigate ---
  const navigate = useNavigate();

  const initialFormData = {
    name: '', working_company: '', bank: '', client_id: '', gps_link: '',
    latitude: '', longitude: '', mount_type: '', station_type: '',
    capacity_kw: '', responsible_emp_id: '', start_date: '', end_date: '',
    total_cost: '', payment_status: 'pending', paid_amount: '',
    status: 'planning', notes: ''
  };

  const [formData, setFormData] = useState(initialFormData);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });

  const showToast = (message, type = 'success') => setToast({ isVisible: true, message, type });
  const hideToast = () => setToast(prev => ({ ...prev, isVisible: false }));

  const updatePaymentStatus = (totalCost, paidAmount) => {
    if (!totalCost || totalCost <= 0) return 'pending';
    if (!paidAmount || paidAmount <= 0) return 'pending';
    const percentage = (paidAmount / totalCost) * 100;
    if (percentage >= 100) return 'paid';
    if (percentage > 0) return 'partial';
    return 'pending';
  };

  useEffect(() => {
    const loadStaticData = async () => {
      try {
        const [clientsRes, employeesRes] = await Promise.all([
          supabase.from('clients').select('custom_id, name, company_name').order('name'),
          supabase.from('employees').select('custom_id, name, position').order('name')
        ]);
        if (clientsRes.error) console.error('Error loading clients:', clientsRes.error);
        else setClients(clientsRes.data || []);
        if (employeesRes.error) console.error('Error loading employees:', employeesRes.error);
        else setEmployees(employeesRes.data || []);
      } catch (error) {
        console.error('Connection error:', error);
        showToast('Помилка підключення до бази даних', 'error');
      }
    };
    loadStaticData();
  }, []);
  
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const from = (currentPage - 1) * PROJECTS_PER_PAGE;
      const to = from + PROJECTS_PER_PAGE - 1;

      let query = supabase
        .from('installations')
        .select(`*, client:clients(*), responsible_employee:employees(*), installation_workers(employee:employees(*))`, { count: 'exact' });

      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (paymentStatusFilter !== 'all') query = query.eq('payment_status', paymentStatusFilter);
      if (companyFilter !== 'all') query = query.eq('working_company', companyFilter);

      if (searchTerm) {
        const numericSearchTerm = parseInt(searchTerm, 10);
        if (!isNaN(numericSearchTerm)) {
            query = query.eq('custom_id', numericSearchTerm);
        } else {
             query = query.or(`name.ilike.%${searchTerm}%,client.name.ilike.%${searchTerm}%,client.company_name.ilike.%${searchTerm}%`);
        }
      }

      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error loading projects:', error);
        showToast('Помилка завантаження проектів', 'error');
      } else {
        const updatedData = data?.map(project => ({...project})) || [];
        setProjects(updatedData);
        setTotalCount(count || 0);
      }
    } catch (error) {
      console.error('Connection error:', error);
      showToast('Помилка підключення', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentPage, statusFilter, paymentStatusFilter, companyFilter, searchTerm]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  
  useEffect(() => { setCurrentPage(1); }, [searchTerm, statusFilter, paymentStatusFilter, companyFilter]);

  const getStatusInfo = (status) => {
    const statusMap = {
      'planning': { label: 'Планування', color: 'bg-blue-500', icon: FaClock, substatus: 'Очікує початку' },
      'in_progress': { label: 'Виконується', color: 'bg-yellow-500', icon: FaTools, substatus: 'Активний монтаж' },
      'on_hold': { label: 'Призупинено', color: 'bg-orange-500', icon: FaPause, substatus: 'Очікує рішення' },
      'completed': { label: 'Завершено', color: 'bg-green-500', icon: FaCheckCircle, substatus: 'Здано в експлуатацію' },
      'cancelled': { label: 'Скасовано', color: 'bg-red-500', icon: FaExclamationTriangle, substatus: 'Припинено роботи' }
    };
    return statusMap[status] || statusMap['planning'];
  };

  const getPaymentStatusInfo = (paymentStatus) => {
    const paymentMap = {
      'pending': { label: 'Очікує оплати', color: 'text-orange-600 bg-orange-50', substatus: 'Рахунок відправлено' },
      'partial': { label: 'Часткова оплата', color: 'text-blue-600 bg-blue-50', substatus: 'Частина сплачена' },
      'paid': { label: 'Оплачено', color: 'text-green-600 bg-green-50', substatus: 'Повна оплата' },
      'overdue': { label: 'Прострочено', color: 'text-red-600 bg-red-50', substatus: 'Порушено терміни' }
    };
    return paymentMap[paymentStatus] || paymentMap['pending'];
  };

  const filteredClients = clients.filter(client => {
    if (!clientSearch) return true;
    const searchLower = clientSearch.toLowerCase();
    return (
      client.name?.toLowerCase().includes(searchLower) ||
      client.company_name?.toLowerCase().includes(searchLower) ||
      client.custom_id.toString().includes(searchLower)
    );
  });
  
  const filteredEmployees = employees.filter(emp => {
      if (!employeeSearch) return true;
      const searchLower = employeeSearch.toLowerCase();
      return emp.name?.toLowerCase().includes(searchLower);
  });

  // --- ЗМІНА: Функція кнопки "Назад" тепер повертає на попередню сторінку ---
  const handleBack = () => navigate(-1);

  const handleEditStatus = (projectId) => {
    const project = projects.find(p => p.custom_id === projectId);
    if (project) setEditingStatus({ ...editingStatus, [projectId]: { status: project.status } });
  };

  const handleCancelEdit = (projectId) => {
    const newEditingStatus = { ...editingStatus };
    delete newEditingStatus[projectId];
    setEditingStatus(newEditingStatus);
  };

  const handleSaveStatus = async (projectId) => {
    const updatedStatus = editingStatus[projectId];
    if (!updatedStatus) return;
    try {
      const { data, error } = await supabase.from('installations').update({ status: updatedStatus.status }).eq('custom_id', projectId).select().single();
      if (error) throw error;
      setProjects(prevProjects => prevProjects.map(p => p.custom_id === projectId ? data : p));
      handleCancelEdit(projectId);
      showToast('Статус успішно оновлено!', 'success');
    } catch (error) {
      console.error('Error saving status:', error);
      showToast(`Помилка: ${error.message}`, 'error');
    }
  };
  
  const handleStatusChange = (projectId, field, value) => {
    setEditingStatus(prev => ({ ...prev, [projectId]: { ...prev[projectId], [field]: value } }));
  };

  const handleDelete = async (projectId, projectName) => {
      if(window.confirm(`Ви впевнені, що хочете видалити проект "${projectName || `#${projectId}`}"? Цю дію неможливо скасувати.`)) {
          try {
              const { error } = await supabase.from('installations').delete().eq('custom_id', projectId);
              if (error) throw error;
              showToast('Проект успішно видалено', 'success');
              loadProjects();
          } catch(error) {
              console.error('Error deleting project:', error);
              showToast(`Помилка видалення: ${error.message}`, 'error');
          }
      }
  }
  
  const resetForm = () => {
    setFormData(initialFormData);
    setFormErrors({});
    setClientSearch("");
    setEmployeeSearch("");
  };

  const handleAddProject = () => {
    resetForm();
    setEditingProject(null);
    setShowProjectForm(true);
  };

  const handleOpenEditForm = (project) => {
    const client = clients.find(c => c.custom_id === project.client_id);
    const employee = employees.find(e => e.custom_id === project.responsible_emp_id);
    
    // BUG FIX: Destructure to remove nested objects before setting form data
    const { client: clientObj, responsible_employee, installation_workers, ...flatProjectData } = project;

    setClientSearch(client ? `${client.company_name || client.name} (#${client.custom_id})` : "");
    setEmployeeSearch(employee ? employee.name : "");
    
    setFormData({ ...initialFormData, ...flatProjectData });
    setEditingProject(project);
    setShowProjectForm(true);
  };

  const handleCloseForm = () => {
    setShowProjectForm(false);
    setEditingProject(null);
    resetForm();
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleClientSelect = (client) => {
    setFormData(prev => ({ ...prev, client_id: client.custom_id }));
    setClientSearch(`${client.company_name || client.name} (#${client.custom_id})`);
  };

  const handleEmployeeSelect = (employee) => {
      setFormData(prev => ({ ...prev, responsible_emp_id: employee.custom_id }));
      setEmployeeSearch(employee.name);
  };

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
        const projectData = Object.fromEntries(
            Object.entries(formData).map(([key, value]) => {
                if (value === '' || value === undefined) return [key, null];
                const numericFields = ['latitude', 'longitude', 'capacity_kw', 'total_cost', 'paid_amount'];
                const idFields = ['client_id', 'responsible_emp_id'];
                if (numericFields.includes(key)) return [key, parseFloat(value)];
                if (idFields.includes(key)) return [key, parseInt(value, 10)];
                return [key, value];
            })
        );
        
        // Remove helper objects that are not DB columns
        delete projectData.client;
        delete projectData.responsible_employee;
        delete projectData.installation_workers;

        projectData.payment_status = updatePaymentStatus(projectData.total_cost, projectData.paid_amount);
        
        let error;
        if (editingProject) {
            ({ error } = await supabase.from('installations').update(projectData).eq('custom_id', editingProject.custom_id));
        } else {
            ({ error } = await supabase.from('installations').insert([projectData]));
        }

        if (error) throw error;

        showToast(editingProject ? 'Проект успішно оновлено!' : 'Проект успішно створено!', 'success');
        handleCloseForm();
        loadProjects();
    } catch (error) {
      console.error('Error submitting form:', error);
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

      <header className="relative bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
               <button onClick={handleBack} className="w-10 h-10 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"><FaArrowLeft className="text-sm" /></button>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg"><FaProjectDiagram className="text-white text-lg" /></div>
                <div><h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Проекти</h1><p className="text-sm text-gray-500">Управління проектами СЕС</p></div>
              </div>
            </div>
            <button onClick={handleAddProject} className="flex items-center justify-center space-x-2 p-3 sm:px-4 sm:py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
              <FaPlus className="text-sm" />
              <span className="hidden sm:inline">Додати проект</span>
            </button>
          </div>
        </div>
      </header>
      
      <div className="relative px-6 pt-4"><Pagination currentPage={currentPage} totalCount={totalCount} projectsPerPage={PROJECTS_PER_PAGE} onPageChange={setCurrentPage} /></div>
      
      <div className="relative p-6 border-b border-gray-200/30">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex-1 w-full max-w-lg">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Пошук за назвою об'єкта, клієнта або №..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white/90 backdrop-blur-xl border border-gray-200/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 shadow-sm" />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm ${showFilters ? 'bg-indigo-500 text-white' : 'bg-white/90 text-gray-700 hover:bg-gray-50'}`}>
              <FaFilter className="text-sm" />
              <span>Фільтри</span>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 overflow-hidden">
              <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 shadow-sm space-y-4">
                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-sm font-medium text-gray-700">Статус проекту:</span>
                    {[{ value: 'all', label: 'Всі' }, { value: 'planning', label: 'Планування' }, { value: 'in_progress', label: 'Виконується' }, { value: 'on_hold', label: 'Призупинено' }, { value: 'completed', label: 'Завершено' },{ value: 'cancelled', label: 'Скасовано' }].map((status) => (
                      <button key={status.value} onClick={() => setStatusFilter(status.value)} className={`px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 ${statusFilter === status.value ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{status.label}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-sm font-medium text-gray-700">Статус оплати:</span>
                    {[{ value: 'all', label: 'Всі' }, { value: 'pending', label: 'Очікує' }, { value: 'partial', label: 'Часткова' }, { value: 'paid', label: 'Оплачено' }, { value: 'overdue', label: 'Прострочено' }].map((status) => (
                      <button key={status.value} onClick={() => setPaymentStatusFilter(status.value)} className={`px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 ${paymentStatusFilter === status.value ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{status.label}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-3 items-center">
                    <span className="text-sm font-medium text-gray-700">Компанія:</span>
                    {[{ value: 'all', label: 'Всі' }, ...ALLOWED_COMPANIES.map(c => ({value: c, label: c}))].map((company) => (
                      <button key={company.value} onClick={() => setCompanyFilter(company.value)} className={`px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 ${companyFilter === company.value ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{company.label}</button>
                    ))}
                  </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="relative p-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center mx-auto mb-4 animate-pulse">
              <FaBolt className="text-white text-2xl" />
            </div>
            <p className="text-gray-600 font-medium">Завантаження проектів...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <FaProjectDiagram className="text-white text-2xl" />
                </div>
                <h3 className="text-xl font-bold text-gray-600 mb-2">Проектів не знайдено</h3>
                <p className="text-gray-500">Спробуйте змінити параметри пошуку або фільтри</p>
              </div>
            ) : (
              projects.map((project, index) => {
                const statusInfo = getStatusInfo(project.status);
                const paymentInfo = getPaymentStatusInfo(project.payment_status);
                const StatusIcon = statusInfo.icon;
                const isEditing = editingStatus[project.custom_id];
                return (
                  <motion.div
                    key={project.custom_id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-500 ease-out hover:-translate-y-1"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
                      <div className="flex-1 space-y-4">
                        {/* --- ЗМІНА: Адаптивний блок для заголовка картки --- */}
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          {/* --- Ліва частина: Назва, ID, клієнт --- */}
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
                              <h3 className="text-xl font-bold text-gray-800">{project.name || project.client?.company_name || project.client?.name || 'Без назви'}</h3>
                              <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap">#{project.custom_id}</span>
                            </div>
                            <div className="flex items-center space-x-2 text-gray-600">
                              <FaBuilding className="text-sm" />
                              <span className="text-sm">{project.client?.name} {project.client?.company_name ? `(${project.client.company_name})` : ''}</span>
                            </div>
                          </div>
                          {/* --- Права частина: Статуси --- */}
                          <div className="flex sm:flex-col items-start sm:items-end gap-2 shrink-0">
                            <div className={`flex items-center space-x-2 ${paymentInfo.color} px-3 py-1 rounded-full border`}>
                              <FaMoneyBillWave className="text-sm" />
                              <span className="text-sm font-medium">{paymentInfo.label}</span>
                            </div>
                            {isEditing ? (
                              <select
                                value={isEditing.status}
                                onChange={(e) => handleStatusChange(project.custom_id, 'status', e.target.value)}
                                className="text-sm border border-gray-300 rounded-lg px-2 py-1"
                              >
                                <option value="planning">Планування</option>
                                <option value="in_progress">Виконується</option>
                                <option value="on_hold">Призупинено</option>
                                <option value="completed">Завершено</option>
                                <option value="cancelled">Скасовано</option>
                              </select>
                            ) : (
                              <div className={`flex items-center space-x-2 ${statusInfo.color} text-white px-3 py-2 rounded-full shadow-sm`}>
                                <StatusIcon className="text-sm" />
                                <span className="text-sm font-medium">{statusInfo.label}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* --- Кінець адаптивного блоку --- */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="flex items-center space-x-2">
                            <FaMapMarkerAlt className="text-indigo-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">Локація</p>
                              <p className="text-sm text-gray-600">{project.gps_link ? <a href={project.gps_link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 underline">Переглянути</a> : 'Не вказано'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <FaCalendarAlt className="text-blue-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">Терміни</p>
                              <p className="text-sm text-gray-600">{project.start_date ? new Date(project.start_date).toLocaleDateString('uk-UA') : 'Н/Д'} - {project.end_date ? new Date(project.end_date).toLocaleDateString('uk-UA') : 'Н/Д'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <FaBolt className="text-yellow-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">Потужність</p>
                              <p className="text-sm text-gray-600">{project.capacity_kw ? `${project.capacity_kw} кВт` : 'Не вказано'}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <FaMoneyBillWave className="text-green-500" />
                            <div>
                              <p className="text-sm font-medium text-gray-800">Вартість</p>
                              <p className="text-sm text-gray-600">{project.total_cost ? `${(project.paid_amount || 0).toLocaleString('uk-UA')} / ${project.total_cost.toLocaleString('uk-UA')} ₴` : 'Не вказано'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="border-t border-gray-200/80 pt-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                          <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
                            <div className="flex items-center space-x-2">
                              <FaUsers className="text-purple-500" />
                              <div>
                                <p className="text-sm font-medium text-gray-800">Відповідальний</p>
                                <p className="text-sm text-gray-600">{project.responsible_employee?.name || 'Не призначено'}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <FaHardHat className="text-gray-600" />
                              <div>
                                <p className="text-sm font-medium text-gray-800">Компанія</p>
                                <p className="text-sm text-gray-600">{project.working_company || 'Не вказано'}</p>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <FaUniversity className="text-blue-600" />
                              <div>
                                <p className="text-sm font-medium text-gray-800">Через банк</p>
                                <p className="text-sm text-gray-600">{project.bank || 'Не вказано'}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-start md:justify-end flex-wrap gap-2">
                            {isEditing ? (
                              <div className="flex items-center flex-wrap gap-2">
                                <button onClick={() => handleSaveStatus(project.custom_id)} className="flex items-center justify-center space-x-2 p-3 sm:px-3 sm:py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium shadow-lg hover:-translate-y-0.5 transition-all">
                                  <FaSave />
                                  <span className="hidden sm:inline">Зберегти</span>
                                </button>
                                <button onClick={() => handleCancelEdit(project.custom_id)} className="flex items-center justify-center space-x-2 p-3 sm:px-3 sm:py-2 bg-gradient-to-r from-gray-500 to-gray-600 text-white rounded-lg font-medium shadow-lg hover:-translate-y-0.5 transition-all">
                                  <FaTimes />
                                  <span className="hidden sm:inline">Скасувати</span>
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => handleEditStatus(project.custom_id)} className="flex items-center justify-center space-x-2 p-3 sm:px-4 sm:py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium shadow-lg hover:-translate-y-0.5 transition-all">
                                <FaEdit />
                                <span className="hidden sm:inline">Статус</span>
                              </button>
                            )}
                            <button onClick={() => handleOpenEditForm(project)} className="flex items-center justify-center space-x-2 p-3 sm:px-4 sm:py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg font-medium shadow-lg hover:-translate-y-0.5 transition-all">
                              <FaEdit />
                              <span className="hidden sm:inline">Редагувати</span>
                            </button>
                            <button onClick={() => handleDelete(project.custom_id, project.name)} className="flex items-center justify-center space-x-2 p-3 sm:px-4 sm:py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-lg hover:-translate-y-0.5 transition-all">
                              <FaTrash />
                              <span className="hidden sm:inline">Видалити</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>
        )}
        <Pagination currentPage={currentPage} totalCount={totalCount} projectsPerPage={PROJECTS_PER_PAGE} onPageChange={setCurrentPage} />
      </main>

      <AnimatePresence>
        {showProjectForm && (
            <motion.div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => { if (e.target === e.currentTarget) { handleCloseForm(); } }}>
                <motion.div className="bg-white/95 backdrop-blur-xl rounded-2xl p-8 w-full max-w-4xl shadow-2xl border border-gray-200/50 my-8 max-h-[90vh] overflow-y-auto" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
                    <div className="mb-6"><h2 className="text-3xl font-bold text-gray-800 mb-2">{editingProject ? 'Редагувати проект' : 'Додати новий проект'}</h2><p className="text-gray-600">{editingProject ? 'Оновіть інформацію про проект СЕС' : 'Заповніть інформацію про новий проект СЕС'}</p></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Клієнт <span className="text-red-500">*</span></label><div className="relative"><input type="text" value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); if(formData.client_id) handleInputChange('client_id', ''); }} placeholder="Пошук клієнта за іменем, компанією або ID..." className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 ${formErrors.client_id ? 'border-red-500' : 'border-gray-300'}`} />
                            {clientSearch && filteredClients.length > 0 && !formData.client_id && (<div className="absolute z-20 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">{filteredClients.map(client => (<button key={client.custom_id} type="button" onClick={() => handleClientSelect(client)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"><div className="font-medium text-gray-800">{client.company_name || client.name}</div><div className="text-sm text-gray-600">ID: {client.custom_id} {client.company_name && `(${client.name})`}</div></button>))}</div>)}
                        </div>{formErrors.client_id && (<p className="text-red-500 text-sm mt-1">{formErrors.client_id}</p>)}</div>

                        <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Назва об'єкта</label><input type="text" value={formData.name || ''} onChange={(e) => handleInputChange('name', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500" placeholder="Наприклад, СЕС 'Сонячна Долина'" /></div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Виконуюча компанія</label><select value={formData.working_company || ''} onChange={(e) => handleInputChange('working_company', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"><option value="">Виберіть компанію...</option>{ALLOWED_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Через банк?</label><select value={formData.bank || ''} onChange={(e) => handleInputChange('bank', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"><option value="">Виберіть...</option><option value="Так">Так</option><option value="Ні">Ні</option></select></div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">GPS посилання</label><input type="url" value={formData.gps_link || ''} onChange={(e) => handleInputChange('gps_link', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500" placeholder="https://maps.app.goo.gl/..." /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Координати</label><div className="flex space-x-2"><input type="number" step="0.000001" value={formData.latitude || ''} onChange={(e) => handleInputChange('latitude', e.target.value)} className={`w-1/2 border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 ${formErrors.latitude ? 'border-red-500' : 'border-gray-300'}`} placeholder="Широта" /><input type="number" step="0.000001" value={formData.longitude || ''} onChange={(e) => handleInputChange('longitude', e.target.value)} className={`w-1/2 border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 ${formErrors.longitude ? 'border-red-500' : 'border-gray-300'}`} placeholder="Довгота" /></div>{(formErrors.latitude || formErrors.longitude) && (<p className="text-red-500 text-sm mt-1">{formErrors.latitude || formErrors.longitude}</p>)}</div>

                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Тип монтажу</label><select value={formData.mount_type || ''} onChange={(e) => handleInputChange('mount_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"><option value="">Виберіть тип...</option><option value="Дахове кріплення">Дахове кріплення</option><option value="Наземне кріплення">Наземне кріплення</option><option value="Трекерна система">Трекерна система</option><option value="Інше">Інше</option></select></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Тип станції</label><select value={formData.station_type || ''} onChange={(e) => handleInputChange('station_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"><option value="">Виберіть тип...</option><option value="Мережева">Мережева</option><option value="Автономна">Автономна</option><option value="Гібридна">Гібридна</option></select></div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Потужність (кВт)</label><input type="number" step="0.1" min="0" value={formData.capacity_kw || ''} onChange={(e) => handleInputChange('capacity_kw', e.target.value)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 ${formErrors.capacity_kw ? 'border-red-500' : 'border-gray-300'}`} placeholder="15.5" />{formErrors.capacity_kw && (<p className="text-red-500 text-sm mt-1">{formErrors.capacity_kw}</p>)}</div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Відповідальний працівник</label><div className="relative"><input type="text" value={employeeSearch} onChange={(e) => {setEmployeeSearch(e.target.value); if(formData.responsible_emp_id) handleInputChange('responsible_emp_id', '');}} placeholder="Пошук працівника..." className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500" />
                            {employeeSearch && filteredEmployees.length > 0 && !formData.responsible_emp_id && (<div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">{filteredEmployees.map(emp => (<button key={emp.custom_id} type="button" onClick={() => handleEmployeeSelect(emp)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0">{emp.name} ({emp.position})</button>))}</div>)}
                        </div></div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Дата початку</label><input type="date" value={formData.start_date || ''} onChange={(e) => handleInputChange('start_date', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500" /></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Планова дата завершення</label><input type="date" value={formData.end_date || ''} onChange={(e) => handleInputChange('end_date', e.target.value)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 ${formErrors.end_date ? 'border-red-500' : 'border-gray-300'}`} />{formErrors.end_date && (<p className="text-red-500 text-sm mt-1">{formErrors.end_date}</p>)}</div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Загальна вартість (₴)</label><input type="number" min="0" step="0.01" value={formData.total_cost || ''} onChange={(e) => handleInputChange('total_cost', e.target.value)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 ${formErrors.total_cost ? 'border-red-500' : 'border-gray-300'}`} placeholder="300000" />{formErrors.total_cost && (<p className="text-red-500 text-sm mt-1">{formErrors.total_cost}</p>)}</div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Сума оплачена (₴)</label><input type="number" min="0" step="0.01" value={formData.paid_amount || ''} onChange={(e) => handleInputChange('paid_amount', e.target.value)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 ${formErrors.paid_amount ? 'border-red-500' : 'border-gray-300'}`} placeholder="150000" />{formErrors.paid_amount && (<p className="text-red-500 text-sm mt-1">{formErrors.paid_amount}</p>)}</div>
                        
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Статус проекту</label><select value={formData.status || ''} onChange={(e) => handleInputChange('status', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500"><option value="planning">Планування</option><option value="in_progress">Виконується</option><option value="on_hold">Призупинено</option><option value="completed">Завершено</option><option value="cancelled">Скасовано</option></select></div>
                        <div><label className="block text-sm font-medium text-gray-700 mb-2">Статус оплати (авто)</label><div className="w-full border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 text-gray-600">{getPaymentStatusInfo(updatePaymentStatus(formData.total_cost, formData.paid_amount)).label}</div></div>
                        
                        <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label><textarea rows="4" value={formData.notes || ''} onChange={(e) => handleInputChange('notes', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Додаткові примітки про проект..."></textarea></div>
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-8">
                        <button type="button" onClick={handleCloseForm} disabled={submitting} className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all duration-200 disabled:opacity-50">Скасувати</button>
                        <button type="button" onClick={handleSubmit} disabled={submitting} className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none flex items-center space-x-2">
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