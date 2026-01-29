import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaArrowLeft, FaSave, FaEdit, FaUsers, FaMapMarkerAlt,
  FaBolt, FaMoneyBillWave, FaCheckCircle, FaTimes, FaCheck,
  FaCommentDots, FaPhone, FaStickyNote, FaHandshake, FaFileAlt, FaTools, 
  FaExclamationTriangle, FaCalendarAlt, FaGlobe, FaChevronDown, FaChevronUp,
  FaClock
} from "react-icons/fa";

import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";

// Імпорт модалки
import AdditionalInfoModal from "./AdditionalInfoModal";
import ProjectDocuments from "./ProjectDocumentsPage";
import ProjectWorkflow from "./PWT"

const PROJECT_STATUS_LABELS = {
  planning: 'Планування',
  in_progress: 'Виконується',
  on_hold: 'Призупинено',
  completed: 'Завершено',
  cancelled: 'Скасовано'
};

const Toast = ({ message, type = 'success', isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const duration = 4000;
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const styles = {
    success: 'bg-green-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-blue-600 text-white',
  };
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          className="fixed top-4 right-4 z-[100] max-w-[90vw]"
        >
          <div className={`${styles[type]} rounded-lg shadow-lg p-4 min-w-[280px] border border-white/10`}>
            <div className="flex items-center space-x-3">
              {type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
              <span className="font-medium text-sm">{message}</span>
              <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
                <FaTimes />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, tier } = useAuth();
  const canEdit = role === 'admin' || role === 'super_admin' || role === 'office' || (role === 'installer' && tier === 1);

  // States
  const [activeTab, setActiveTab] = useState('general');
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Додано стейт для списку додаткової інформації
  const [additionalInfoList, setAdditionalInfoList] = useState([]);
  const [isInfoExpanded, setIsInfoExpanded] = useState(true); // Для згортання/розгортання блоку

  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  
  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });

  const showToast = useCallback((message, type = 'success') => 
    setToast({ isVisible: true, message, type }), []);
  const hideToast = useCallback(() => 
    setToast(prev => ({ ...prev, isVisible: false })), []);

  // === 1. IDENTIFY USER ===
  useEffect(() => {
    const identifyUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
            const { data: emp } = await supabase.from('employees').select('*').eq('email', user.email).maybeSingle();
            if (emp) setCurrentUser(emp);
            else setCurrentUser({ name: user.email });
        }
    };
    identifyUser();
  }, []);

  // === 2. LOAD DATA ===
  const loadProjectData = useCallback(async () => {
      setLoading(true);
      try {
        // 1. Завантаження основного проекту
        const { data: projectData, error: projectError } = await supabase
          .from('installations')
          .select(`
            *,
            client:clients!installations_client_id_fkey (
              custom_id, name, company_name, phone, oblast, populated_place, notes, 
              object_type, is_subcontract, contractor_company
            ),
            responsible_employee:employees!installations_responsible_emp_id_fkey (*)
          `)
          .eq('custom_id', id)
          .single();
          
        if (projectError) throw projectError;
        if (!projectData) {
          showToast('Проект не знайдено', 'error');
          navigate('/installations');
          return;
        }
        
        setProject(projectData);
        setFormData(projectData);
        
        if (projectData.responsible_employee) {
          setEmployeeSearch(`${projectData.responsible_employee.name} (ID: ${projectData.responsible_employee.custom_id})`);
        }

        // 2. Завантаження історії додаткової інформації (НОВА ЛОГІКА)
        const { data: infoData, error: infoError } = await supabase
            .from('project_additional_info')
            .select('*')
            .eq('installation_custom_id', id)
            .order('created_at', { ascending: false });

        if (infoError) console.error("Error loading additional info:", infoError);
        setAdditionalInfoList(infoData || []);
        
      } catch (error) {
        console.error(error);
        showToast(`Помилка завантаження: ${error.message}`, 'error');
        navigate('/installations');
      } finally {
        setLoading(false);
      }
  }, [id, navigate, showToast]);

  useEffect(() => {
    loadProjectData();
    
    const loadEmployees = async () => {
        const { data } = await supabase.from('employees').select('*').order('name');
        setEmployees(data || []);
    };
    loadEmployees();
  }, [loadProjectData]);

  // Функція оновлення списку після додавання коментаря (передається в модалку)
  const refreshAdditionalInfo = async () => {
      const { data } = await supabase
            .from('project_additional_info')
            .select('*')
            .eq('installation_custom_id', id)
            .order('created_at', { ascending: false });
      setAdditionalInfoList(data || []);
  };

  // Handlers
  const handleCancel = () => {
    setIsEditing(false);
    setFormData(project);
    setEmployeeSearch(project.responsible_employee ? `${project.responsible_employee.name} (ID: ${project.responsible_employee.custom_id})` : '');
  };

const handleSave = async () => {
    if (!canEdit) {
      showToast('У вас немає прав на редагування', 'error');
      return;
    }

    setSaving(true);
    try {
      const cost = parseFloat(formData.total_cost || 0);
      const paid = parseFloat(formData.paid_amount || 0);
      let payStatus = 'pending';
      if (cost > 0 && paid >= cost) payStatus = 'paid';
      else if (paid > 0) payStatus = 'partial';

      const currentData = { ...formData, payment_status: payStatus };
      const updates = {};
      const ignoredKeys = ['client', 'responsible_employee', 'project_stages', 'id', 'created_at', 'updated_at', 'client_id', 'topic_updated']; // Додаємо topic_updated сюди, щоб не порівнювати його зі старим значенням

      // Перевіряємо, що змінилось
      Object.keys(currentData).forEach(key => {
        if (ignoredKeys.includes(key)) return;
        const oldValue = project[key];
        const newValue = currentData[key];
        // Порівнюємо значення
        if (String(oldValue) !== String(newValue)) {
          updates[key] = newValue;
        }
      });

      // Примусово оновлюємо статус оплати та час
      updates.payment_status = payStatus;
      updates.updated_at = new Date().toISOString();
      
      // === ГОЛОВНА ЗМІНА ТУТ ===
      // Якщо є хоч якісь зміни, ставимо прапорець для бота
      if (Object.keys(updates).length > 0) {
          updates.topic_updated = true; // <--- Додаємо цей рядок

          const { error } = await supabase
            .from('installations')
            .update(updates)
            .eq('custom_id', id);
          if (error) throw error;
      } else {
         // Якщо змін не було, можна просто вийти або повідомити користувача
         showToast('Немає змін для збереження', 'info');
         setIsEditing(false);
         setSaving(false);
         return;
      }
      
      showToast('Зміни успішно збережено!', 'success');
      setIsEditing(false);
      // Оновлюємо локальний стейт
      setProject({ 
          ...project, 
          ...updates, 
          responsible_employee: employees.find(e => e.custom_id === updates.responsible_emp_id) || project.responsible_employee 
      });
      
    } catch (error) {
        console.error(error);
        showToast(`Помилка збереження: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployeesMain = employeeSearch ? employees.filter(emp =>
    emp.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    emp.custom_id.toString().includes(employeeSearch)
  ) : [];

  const handleMainEmployeeSelect = (employee) => {
    setFormData({ ...formData, responsible_emp_id: employee.custom_id });
    setEmployeeSearch(`${employee.name} (ID: ${employee.custom_id})`);
  };

  // Helpers
  const formatDate = (date) => date ? new Date(date).toLocaleDateString('uk-UA') : '—';
  const formatDateTime = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  const formatCost = (cost) => cost != null ? `$${Number(cost).toLocaleString('en-US')}` : '—';
  
  let locationLink = project?.gps_link;
  if (!locationLink && project?.client?.oblast && project?.client?.populated_place) {
    const location = `${project.client.oblast}, ${project.client.populated_place}`;
    locationLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  }

  const responsiblePhone = project?.responsible_employee?.phone || project?.responsible_employee?.contact_phone || '—';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-slate-100 pb-20 font-sans text-slate-800">
      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />

      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Title & Back */}
            <div className="flex items-center gap-4">
               <button onClick={() => navigate('/installations')} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition">
                 <FaArrowLeft />
               </button>
               <div>
                  <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                    {project.name || `Об'єкт #${project.custom_id}`}
                    <span className="text-sm font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        #{project.custom_id}
                    </span>
                  </h1>
                  <p className="text-sm text-slate-500 mt-1">
                    {project.client?.company_name || project.client?.name} • {project.client?.oblast}
                  </p>
               </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
               <button 
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm flex items-center gap-2 transition shadow-sm"
                  onClick={() => setIsModalOpen(true)}
               >
                  <FaCommentDots className="text-indigo-500"/> Написати коментар
               </button>
               
               {canEdit && (
                 isEditing ? (
                    <>
                      <button onClick={handleCancel} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm transition shadow-sm">
                        Скасувати
                      </button>
                      <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm transition">
                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <FaSave />}
                        Зберегти
                      </button>
                    </>
                 ) : (
                    <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm transition">
                       <FaEdit /> Редагувати
                    </button>
                 )
               )}
            </div>
          </div>

          {/* TABS NAVIGATION */}
          <div className="flex items-center gap-8 mt-6 border-b border-gray-200">
             {['general', 'documents', 'workflow'].map((tab) => (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 px-1 text-sm font-bold flex items-center gap-2 transition-colors relative 
                        ${activeTab === tab ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    {tab === 'general' && <FaBolt />}
                    {tab === 'documents' && <FaFileAlt />}
                    {tab === 'workflow' && <FaTools />}
                    {tab === 'general' ? 'Основна' : tab === 'documents' ? 'Документи' : 'Хід роботи'}
                </button>
             ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6">
        
        {activeTab === 'general' && (
           <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT COLUMN (Client, Finance, Additional Info) - Spans 4 columns on large screens */}
              <div className="lg:col-span-4 space-y-6">
                 
                 {/* CLIENT CARD */}
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
                       <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                          <FaUsers className="text-gray-500"/> Клієнт
                       </h3>
                       {project.client?.is_subcontract && (
                         <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded-full font-bold border border-orange-200 flex items-center gap-1">
                            <FaHandshake/> {project.client.contractor_company}
                         </span>
                       )}
                    </div>
                    
                    <div className="p-6 grid gap-y-5">
                        <div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Контактна особа</span>
                            <p className="text-base font-medium text-gray-900">{project.client?.name}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Компанія</span>
                            <p className="text-base font-medium text-gray-900">{project.client?.company_name || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Телефон</span>
                            <a href={`tel:${project.client?.phone}`} className="text-indigo-600 hover:underline font-medium flex items-center gap-2">
                               <FaPhone className="text-sm"/> {project.client?.phone || '—'}
                            </a>
                        </div>
                         <div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Адреса об'єкта</span>
                            <p className="text-gray-700 flex items-start gap-2">
                                <FaMapMarkerAlt className="text-gray-400 mt-1 shrink-0"/>
                                <span>{project.client?.oblast}, {project.client?.populated_place}</span>
                            </p>
                        </div>
                        {project.client?.notes && (
                            <div className="mt-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Примітки клієнта</span>
                                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm text-yellow-800 italic">
                                    {project.client.notes}
                                </div>
                            </div>
                        )}
                    </div>
                 </div>

                 {/* FINANCE CARD */}
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <FaMoneyBillWave className="text-gray-500"/> Фінанси
                        </h3>
                    </div>
                    
                    <div className="p-6">
                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Загальна вартість</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" value={formData.total_cost || ''} onChange={e => setFormData({...formData, total_cost: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                                ) : (
                                    <p className="text-lg font-bold text-gray-900">{formatCost(project.total_cost)}</p>
                                )}
                            </div>
                             <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Сплачено</label>
                                {isEditing ? (
                                    <input type="number" step="0.01" value={formData.paid_amount || ''} onChange={e => setFormData({...formData, paid_amount: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                                ) : (
                                    <p className="text-lg font-bold text-green-600">{formatCost(project.paid_amount)}</p>
                                )}
                            </div>
                        </div>
                        
                        <div>
                            <div className="flex justify-between mb-1 text-xs font-medium text-gray-500">
                                 <span>Прогрес оплати</span>
                                 <span>{((project.paid_amount || 0) / (project.total_cost || 1) * 100).toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                                <div 
                                    className="bg-green-500 h-2.5 rounded-full transition-all duration-500" 
                                    style={{ width: `${Math.min(((project.paid_amount || 0) / (project.total_cost || 1)) * 100, 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                 </div>

                 {/* --- ADDITIONAL INFO BLOCK (HISTORY) --- */}
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div 
                        onClick={() => setIsInfoExpanded(!isInfoExpanded)} 
                        className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition"
                    >
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <FaCommentDots className="text-indigo-600"/> 
                            Додаткова інформація ({additionalInfoList.length})
                        </h3>
                        {isInfoExpanded ? <FaChevronUp className="text-gray-400 text-sm"/> : <FaChevronDown className="text-gray-400 text-sm"/>}
                    </div>
                    
                    <AnimatePresence>
                        {isInfoExpanded && (
                            <motion.div 
                                initial={{ height: 0, opacity: 0 }} 
                                animate={{ height: "auto", opacity: 1 }} 
                                exit={{ height: 0, opacity: 0 }}
                            >
                                <div className="p-6 bg-white space-y-4 max-h-[500px] overflow-y-auto">
                                    {additionalInfoList.length === 0 ? (
                                        <div className="text-center text-gray-400 text-sm italic py-4">
                                            Історія повідомлень порожня
                                        </div>
                                    ) : (
                                        additionalInfoList.map((info) => (
                                            <div key={info.id} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-bold text-slate-800 text-sm">
                                                        {info.author_name || 'Невідомий користувач'}
                                                    </span>
                                                    <span className="text-xs text-gray-400 font-medium">
                                                        {formatDateTime(info.created_at)}
                                                    </span>
                                                </div>
                                                
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mb-3">
                                                    {info.message_text}
                                                </p>
                                                
                                                <div className="flex justify-end">
                                                    {info.is_sent_to_telegram ? (
                                                        <span className="text-[11px] font-bold text-green-600 flex items-center gap-1.5">
                                                            <FaCheckCircle className="text-sm"/> Надіслано в ТГ
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
                                                            <FaClock className="text-sm"/> Не надіслано
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                 </div>
                 {/* --- END ADDITIONAL INFO BLOCK --- */}

              </div>

              {/* RIGHT COLUMN */}
              <div className="lg:col-span-8">
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <FaBolt className="text-gray-500"/> Деталі об'єкта
                        </h3>
                     </div>

                 <div className="p-6 space-y-8">
                    {/* Responsible Person */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Відповідальний за проект</label>
                        {isEditing ? (
                             <div className="relative max-w-md">
                                  <input type="text" value={employeeSearch} onChange={e => { setEmployeeSearch(e.target.value); if (formData.responsible_emp_id) setFormData({...formData, responsible_emp_id: ''}); }} placeholder="Пошук працівника..." className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500" />
                                  <FaPhone className="absolute right-3 top-2.5 text-gray-400" />
                                  {employeeSearch && filteredEmployeesMain.length > 0 && !formData.responsible_emp_id && (
                                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md mt-1 shadow-lg max-h-48 overflow-y-auto">
                                      {filteredEmployeesMain.map(emp => (
                                        <button key={emp.custom_id} type="button" onClick={() => handleMainEmployeeSelect(emp)} className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b border-gray-100 text-sm text-gray-700">
                                            {emp.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                             </div>
                        ) : (
                            <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200 max-w-md">
                                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                                    {project.responsible_employee?.name ? project.responsible_employee.name.charAt(0) : '?'}
                                </div>
                                <div>
                                    <p className="text-base font-bold text-gray-900 leading-tight">
                                        {project.responsible_employee?.name || 'Не призначено'}
                                    </p>
                                    {project.responsible_employee && (
                                        <a href={`tel:${responsiblePhone}`} className="text-sm text-indigo-600 hover:underline flex items-center gap-1 mt-1 font-medium">
                                            <FaPhone className="text-xs" /> {responsiblePhone}
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {/* Status & Type */}
                        <div className="space-y-6">
                             <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Статус проекту</label>
                                {isEditing ? (
                                    <select value={formData.status || 'planning'} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-indigo-500 focus:border-indigo-500">
                                        {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border
                                        ${project.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 
                                          project.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : 
                                          project.status === 'on_hold' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                                          'bg-gray-50 text-gray-700 border-gray-200'}`}>
                                        {project.status === 'completed' && <FaCheckCircle className="text-xs"/>}
                                        {PROJECT_STATUS_LABELS[project.status] || project.status}
                                    </span>
                                )}
                            </div>
                             <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Тип станції</label>
                                {isEditing ? (
                                    <select value={formData.station_type || ''} onChange={e => setFormData({...formData, station_type: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
                                        <option value="">—</option>
                                        <option value="Мережева">Мережева</option>
                                        <option value="Автономна">Автономна</option>
                                        <option value="Гібридна">Гібридна</option>
                                    </select>
                                ) : (
                                    <p className="text-base font-medium text-gray-900">{project.station_type || '—'}</p>
                                )}
                            </div>
                             <div>
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Тип монтажу</label>
                                 {isEditing ? (
                                    <select value={formData.mount_type || ''} onChange={e => setFormData({...formData, mount_type: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
                                        <option value="">—</option>
                                        <option value="Дахове кріплення (Скатний дах)">Дахове кріплення (Скатний дах)</option>
                                        <option value="Наземне кріплення">Наземне кріплення</option>
                                        <option value="Дахове кріплення (Плоский дах)">Дахове кріплення (Плоский дах)</option>
                                        <option value="Трекерна система">Трекерна система</option>
                                        <option value="Електромонтаж">Електромонтаж</option>
                                    </select>
                                 ) : (
                                    <p className="text-base font-medium text-gray-900 truncate" title={project.mount_type}>{project.mount_type || '—'}</p>
                                 )}
                            </div>
                        </div>

                        {/* Technical Specs */}
                        <div className="space-y-6">
                            <div className="flex gap-6">
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Потужність</label>
                                    {isEditing ? (
                                        <div className="relative">
                                            <input type="number" step="0.1" value={formData.capacity_kw || ''} onChange={e => setFormData({...formData, capacity_kw: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm pr-8" />
                                            <span className="absolute right-3 top-2 text-gray-500 text-sm">кВт</span>
                                        </div>
                                    ) : (
                                        <p className="text-base font-medium text-gray-900">{project.capacity_kw ? `${project.capacity_kw} кВт` : '—'}</p>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Фази</label>
                                    {isEditing ? (
                                        <select value={formData.quant_phase || ''} onChange={e => setFormData({...formData, quant_phase: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white">
                                            <option value="">—</option>
                                            <option value="1">1 фаза</option>
                                            <option value="3">3 фази</option>
                                        </select>
                                    ) : (
                                        <p className="text-base font-medium text-gray-900">{project.quant_phase ? `${project.quant_phase}ф` : '—'}</p>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex gap-6">
                                 <div className="flex-1">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1"><FaCalendarAlt className="text-gray-400"/> Початок</label>
                                     {isEditing ? (
                                         <input type="date" value={formData.start_date || ''} onChange={e => setFormData({...formData, start_date: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                                     ) : (
                                         <p className="text-base font-medium text-gray-900">{formatDate(project.start_date)}</p>
                                     )}
                                </div>
                                <div className="flex-1">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1"><FaCalendarAlt className="text-gray-400"/> Завершення</label>
                                     {isEditing ? (
                                         <input type="date" value={formData.end_date || ''} onChange={e => setFormData({...formData, end_date: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                                     ) : (
                                         <p className="text-base font-medium text-gray-900">{formatDate(project.end_date)}</p>
                                     )}
                                </div>
                            </div>

                             <div>
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Маршрут до об'єкта</label>
                                 {isEditing ? (
                                     <div className="relative">
                                        <input type="url" placeholder="GPS посилання..." value={formData.gps_link || ''} onChange={e => setFormData({...formData, gps_link: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm pl-8" />
                                        <FaGlobe className="absolute left-3 top-2.5 text-gray-400" />
                                     </div>
                                 ) : (
                                     locationLink ? (
                                         <a href={locationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-md text-sm font-medium text-indigo-600 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm">
                                             <FaMapMarkerAlt className="text-red-500"/> Відкрити на Google Maps
                                         </a>
                                     ) : <span className="text-gray-400 text-sm">Не вказано</span>
                                 )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Технічні примітки</label>
                        {isEditing ? (
                            <textarea rows="3" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-y focus:ring-indigo-500 focus:border-indigo-500" placeholder="Введіть примітки..." />
                        ) : (
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-sm text-gray-700 whitespace-pre-wrap">
                                {project.notes || 'Примітки відсутні.'}
                            </div>
                        )}
                    </div>
                 </div>
                 </div>
              </div>
           </motion.div>
        )}

        {/* --- TAB: DOCUMENTS --- */}
        {activeTab === 'documents' && (
           <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
               <ProjectDocuments projectId={id} />
           </motion.div>
        )}

        {/* --- TAB: WORKFLOW --- */}
        {activeTab === 'workflow' && (
            <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6" // <-- прибирає відступи main, робить блок “впритул”
            >
              <ProjectWorkflow project={project}  />
            </motion.div>
        )}

      </main>

      {/* MODAL Component */}
      {project && (
        <AdditionalInfoModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            project={project}
            currentUser={currentUser}
            onUpdate={refreshAdditionalInfo} // Передаємо функцію оновлення
            showToast={showToast}
        />
      )}
    </div>
  );
}