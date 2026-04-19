import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaArrowLeft, FaSave, FaEdit, FaUsers, FaMapMarkerAlt,
  FaBolt, FaCheckCircle, FaTimes, FaCheck,
  FaCommentDots, FaPhone, FaHandshake, FaFileAlt, FaTools, 
  FaExclamationTriangle, FaCalendarAlt, FaGlobe, FaChevronDown, FaChevronUp,
  FaClock, FaUserTie, FaHardHat
} from "react-icons/fa";

import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";

// Імпорт модалки та вкладок
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
    success: 'bg-teal-600 text-white',
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

export default function PartnerProjectDetailsPage() {
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
  
  const [additionalInfoList, setAdditionalInfoList] = useState([]);
  const [isInfoExpanded, setIsInfoExpanded] = useState(true); 

  const [currentUser, setCurrentUser] = useState(null);
  const [formData, setFormData] = useState({});
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  
  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });

  const showToast = useCallback((message, type = 'success') => 
    setToast({ isVisible: true, message, type }), []);
  const hideToast = useCallback(() => 
    setToast(prev => ({ ...prev, isVisible: false })), []);

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

  const loadProjectData = useCallback(async () => {
      setLoading(true);
      try {
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
          navigate('/partners');
          return;
        }
        
        setProject(projectData);
        setFormData(projectData);
        
        if (projectData.responsible_employee) {
          setEmployeeSearch(`${projectData.responsible_employee.name} (ID: ${projectData.responsible_employee.custom_id})`);
        }

        const { data: infoData } = await supabase
            .from('project_additional_info')
            .select('*')
            .eq('installation_custom_id', id)
            .order('created_at', { ascending: false });

        setAdditionalInfoList(infoData || []);
        
      } catch (error) {
        console.error(error);
        showToast(`Помилка завантаження: ${error.message}`, 'error');
        navigate('/partners');
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

  const refreshAdditionalInfo = async () => {
      const { data } = await supabase
            .from('project_additional_info')
            .select('*')
            .eq('installation_custom_id', id)
            .order('created_at', { ascending: false });
      setAdditionalInfoList(data || []);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData(project);
    setEmployeeSearch(project.responsible_employee ? `${project.responsible_employee.name} (ID: ${project.responsible_employee.custom_id})` : '');
  };

  const handleSave = async () => {
    if (!canEdit) { showToast('У вас немає прав на редагування', 'error'); return; }
    setSaving(true);
    try {
      const currentData = { ...formData };
      const updates = {};
      const ignoredKeys = ['client', 'responsible_employee', 'project_stages', 'id', 'created_at', 'updated_at', 'client_id', 'topic_updated']; 

      Object.keys(currentData).forEach(key => {
        if (ignoredKeys.includes(key)) return;
        if (String(project[key]) !== String(currentData[key])) {
          updates[key] = currentData[key];
        }
      });

      if (Object.keys(updates).length > 0) {
          updates.topic_updated = true; 
          updates.updated_at = new Date().toISOString();

          const { error } = await supabase.from('installations').update(updates).eq('custom_id', id);
          if (error) throw error;
      } else {
         showToast('Немає змін для збереження', 'info');
         setIsEditing(false);
         setSaving(false);
         return;
      }
      
      showToast('Зміни успішно збережено!', 'success');
      setIsEditing(false);
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

  const formatDate = (date) => date ? new Date(date).toLocaleDateString('uk-UA') : '—';
  const formatDateTime = (dateStr) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  let locationLink = project?.gps_link;
  if (!locationLink && project?.client?.oblast && project?.client?.populated_place) {
    const location = `${project.client.oblast}, ${project.client.populated_place}`;
    locationLink = `http://googleusercontent.com/maps.google.com/maps?q=${encodeURIComponent(location)}`;
  }

  const responsiblePhone = project?.responsible_employee?.phone || project?.responsible_employee?.contact_phone || '—';

  const getClientDisplayInfo = () => {
    if (!project?.client) return "Немає даних клієнта";
    const hasName = project.client.name?.trim().length > 0;
    const hasCompany = project.client.company_name?.trim().length > 0;
    
    if (hasName && hasCompany) return `${project.client.name} (${project.client.company_name})`;
    if (hasName) return project.client.name;
    if (hasCompany) return project.client.company_name;
    return "Компанія-партнер";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans text-gray-800">
      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />

      {/* HEADER: Змінено класи для вільної прокрутки */}
      <header className="bg-white border-b border-gray-200 shadow-sm relative z-30">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            
            {/* Title & Back & Partner Info */}
            <div className="flex items-start gap-4">
                <button 
                    onClick={() => {
                        if (window.history.state && window.history.state.idx > 0) navigate(-1);
                        else navigate('/partners');
                    }} 
                    className="p-2 mt-1 hover:bg-gray-100 rounded-full text-gray-500 transition shrink-0"
                >
                    <FaArrowLeft />
                </button>
               <div>
                  <div className="flex items-center gap-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.name ?? ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={`Об'єкт #${project.custom_id}`}
                        className="w-full max-w-[520px] bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-gray-900 font-bold text-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    ) : (
                      <h1 className="text-2xl font-bold text-gray-900">{project.name || `Об'єкт #${project.custom_id}`}</h1>
                    )}
                    <span className="text-sm font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">
                        #{project.custom_id}
                    </span>
                  </div>
                  
                  {/* РЯДОК З ПАРТНЕРОМ */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2 text-sm text-gray-600">
                     <span className="flex items-center gap-1.5 text-teal-700">
                        <FaHandshake className="text-teal-500" /> 
                        {project.client?.name ? `${project.client.name} • ` : ''}
                        {project.client?.contractor_company || project.client?.company_name || 'Співпраця'}
                     </span>
                     
                     <span className="text-gray-300">|</span>
                     
                     <span className="flex items-center gap-1.5">
                        <FaUserTie className="text-gray-400" /> Від партнера: {project.partner_manager || 'Не вказано'}
                     </span>
                     
                     {project.client?.phone && (
                         <>
                             <span className="text-gray-300">|</span>
                             <a href={`tel:${project.client.phone}`} className="flex items-center gap-1.5 hover:text-teal-600 transition font-medium">
                                <FaPhone className="text-gray-400" /> {project.client.phone}
                             </a>
                         </>
                     )}
                  </div>
               </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 shrink-0">
               <button 
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm flex items-center gap-2 transition shadow-sm"
                  onClick={() => setIsModalOpen(true)}
               >
                  <FaCommentDots className="text-teal-600"/> Додати інфо
               </button>
               
               {canEdit && (
                 isEditing ? (
                    <>
                      <button onClick={handleCancel} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm transition shadow-sm">
                        Скасувати
                      </button>
                      <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm transition">
                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <FaSave />}
                        Зберегти
                      </button>
                    </>
                 ) : (
                    <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-sm transition">
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
                        ${activeTab === tab ? 'text-teal-600 border-b-2 border-teal-600' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    {tab === 'general' && <FaBolt />}
                    {tab === 'documents' && <FaFileAlt />}
                    {tab === 'workflow' && <FaTools />}
                    {tab === 'general' ? 'Основна інфо' : tab === 'documents' ? 'Документи' : 'Хід роботи'}
                </button>
             ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6">
        
        {activeTab === 'general' && (
           <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT COLUMN: ЖУРНАЛ ПОДІЙ */}
              <div className="lg:col-span-4 flex flex-col">
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden max-h-[800px]">
                    <div 
                        onClick={() => setIsInfoExpanded(!isInfoExpanded)} 
                        className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition"
                    >
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <FaCommentDots className="text-teal-600"/> 
                            Журнал подій ({additionalInfoList.length})
                        </h3>
                        {isInfoExpanded ? <FaChevronUp className="text-gray-400 text-sm"/> : <FaChevronDown className="text-gray-400 text-sm"/>}
                    </div>
                    
                    <AnimatePresence>
                        {isInfoExpanded && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex-1 overflow-y-auto">
                                <div className="p-6 bg-white space-y-4">
                                    {additionalInfoList.length === 0 ? (
                                        <div className="text-center text-gray-400 text-sm italic py-4">
                                            Історія повідомлень порожня
                                        </div>
                                    ) : (
                                        additionalInfoList.map((info) => (
                                            <div key={info.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="font-bold text-gray-800 text-sm">
                                                        {info.author_name || 'Система'}
                                                    </span>
                                                    <span className="text-xs text-gray-500 font-medium bg-white px-2 py-0.5 rounded border border-gray-200">
                                                        {formatDateTime(info.created_at)}
                                                    </span>
                                                </div>
                                                
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mb-3">
                                                    {info.message_text}
                                                </p>
                                                
                                                <div className="flex justify-end pt-2 border-t border-gray-200/60">
                                                    {info.is_sent_to_telegram ? (
                                                        <span className="text-[11px] font-bold text-teal-600 flex items-center gap-1.5">
                                                            <FaCheckCircle className="text-sm"/> Надіслано в ТГ
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1.5">
                                                            <FaClock className="text-sm"/> Тільки в CRM
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
              </div>

              {/* RIGHT COLUMN: ДЕТАЛІ ОБ'ЄКТА */}
              <div className="lg:col-span-8">
                 <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                     <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50">
                        <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <FaTools className="text-gray-500"/> Деталі об'єкта
                        </h3>
                     </div>

                 <div className="p-6 space-y-8">
                    
                    {/* Block: Відповідальні */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Наш відповідальний</label>
                            {isEditing ? (
                                 <div className="relative">
                                      <input type="text" value={employeeSearch} onChange={e => { setEmployeeSearch(e.target.value); if (formData.responsible_emp_id) setFormData({...formData, responsible_emp_id: ''}); }} placeholder="Пошук працівника..." className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500" />
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
                                <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-600 font-bold">
                                        <FaHardHat />
                                    </div>
                                    <div>
                                        <p className="text-base font-bold text-gray-900 leading-tight">
                                            {project.responsible_employee?.name || 'Не призначено'}
                                        </p>
                                        {project.responsible_employee && (
                                            <a href={`tel:${responsiblePhone}`} className="text-sm text-teal-600 hover:underline flex items-center gap-1 mt-1 font-medium">
                                                <FaPhone className="text-xs" /> {responsiblePhone}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Зміна менеджера від партнера в режимі редагування */}
                        {isEditing && (
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Менеджер від партнера</label>
                                <div className="relative">
                                    <FaUserTie className="absolute left-3 top-3 text-gray-400 text-sm"/>
                                    <input 
                                        type="text" 
                                        value={formData.partner_manager || ''} 
                                        onChange={e => setFormData({...formData, partner_manager: e.target.value})} 
                                        placeholder="ПІБ, телефон..." 
                                        className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm focus:ring-teal-500 focus:border-teal-500 bg-white" 
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        {/* Status & Type */}
                        <div className="space-y-6">
                             <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Загальний статус</label>
                                {isEditing ? (
                                    <select value={formData.status || 'planning'} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-teal-500 focus:border-teal-500">
                                        {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold border
                                        ${project.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 
                                          project.status === 'in_progress' ? 'bg-teal-50 text-teal-700 border-teal-200' : 
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
                                    <select value={formData.station_type || ''} onChange={e => setFormData({...formData, station_type: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-teal-500 focus:border-teal-500">
                                        <option value="">—</option>
                                        <option value="Мережева">Мережева</option>
                                        <option value="Гібрид">Гібрид</option>
                                        <option value="Мережева/Гібрид">Мережева/Гібрид</option>
                                        <option value="Автономна">Автономна</option>
                                    </select>
                                ) : (
                                    <p className="text-base font-medium text-gray-900">{project.station_type || '—'}</p>
                                )}
                            </div>
                             <div>
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Тип монтажу</label>
                                 {isEditing ? (
                                    <select value={formData.mount_type || ''} onChange={e => setFormData({...formData, mount_type: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-teal-500 focus:border-teal-500">
                                        <option value="">—</option>
                                        <option value="Дахове кріплення (Скатний дах)">Дахове кріплення (Скатний дах)</option>
                                        <option value="Наземне кріплення">Наземне кріплення</option>
                                        <option value="Дахове кріплення (Плоский дах)">Дахове кріплення (Плоский дах)</option>
                                        <option value="Трекерна система">Трекерна система</option>
                                        <option value="Дах/Земля">Дах/Земля</option>
                                        <option value="АКБ + Інвертор">АКБ + Інвертор</option>
                                        <option value="Електромонтаж">Електромонтаж</option>
                                        <option value="Інше">Інше</option>
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
                                            <input type="number" step="0.1" value={formData.capacity_kw || ''} onChange={e => setFormData({...formData, capacity_kw: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm pr-8 focus:ring-teal-500 focus:border-teal-500" />
                                            <span className="absolute right-3 top-2 text-gray-500 text-sm">кВт</span>
                                        </div>
                                    ) : (
                                        <p className="text-base font-medium text-gray-900 flex items-center gap-1">
                                            <FaBolt className="text-amber-500"/> {project.capacity_kw ? `${project.capacity_kw} кВт` : '—'}
                                        </p>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Фази</label>
                                    {isEditing ? (
                                        <select value={formData.quant_phase || ''} onChange={e => setFormData({...formData, quant_phase: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-teal-500 focus:border-teal-500">
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
                                         <input type="date" value={formData.start_date || ''} onChange={e => setFormData({...formData, start_date: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-teal-500 focus:border-teal-500" />
                                     ) : (
                                         <p className="text-base font-medium text-gray-900">{formatDate(project.start_date)}</p>
                                     )}
                                </div>
                                <div className="flex-1">
                                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1 flex items-center gap-1"><FaCalendarAlt className="text-gray-400"/> Завершення</label>
                                     {isEditing ? (
                                         <input type="date" value={formData.end_date || ''} onChange={e => setFormData({...formData, end_date: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-teal-500 focus:border-teal-500" />
                                     ) : (
                                         <p className="text-base font-medium text-gray-900">{formatDate(project.end_date)}</p>
                                     )}
                                </div>
                            </div>

                             <div>
                                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1">Маршрут / GPS</label>
                                 {isEditing ? (
                                     <div className="relative">
                                        <input type="url" placeholder="GPS посилання..." value={formData.gps_link || ''} onChange={e => setFormData({...formData, gps_link: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm pl-8 focus:ring-teal-500 focus:border-teal-500" />
                                        <FaGlobe className="absolute left-3 top-2.5 text-gray-400" />
                                     </div>
                                 ) : (
                                     locationLink ? (
                                         <a href={locationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-md text-sm font-medium text-teal-700 hover:bg-gray-50 hover:border-gray-300 transition shadow-sm">
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
                            <textarea rows="3" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-y focus:ring-teal-500 focus:border-teal-500" placeholder="Введіть примітки..." />
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
                className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6"
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
            onUpdate={refreshAdditionalInfo} 
            showToast={showToast}
        />
      )}
    </div>
  );
}