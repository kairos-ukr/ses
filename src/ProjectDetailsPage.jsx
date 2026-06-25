import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaArrowLeft, FaSave, FaEdit, FaUsers, FaMapMarkerAlt,
  FaBolt, FaCheckCircle, FaTimes, FaCheck,
  FaCommentDots, FaPhone, FaHandshake, FaFileAlt, FaTools, 
  FaExclamationTriangle, FaCalendarAlt, FaGlobe, FaChevronDown, FaChevronUp,
  FaClock, FaUniversity, FaSearch
} from "react-icons/fa";

import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";

// Імпорт компонентів
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
    success: 'bg-emerald-600 text-white',
    error: 'bg-red-600 text-white',
    info: 'bg-indigo-600 text-white',
  };
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          className="fixed top-6 left-1/2 z-[100] min-w-[300px]"
        >
          <div className={`${styles[type]} rounded-2xl shadow-2xl p-4 border border-white/10 flex items-center justify-between`}>
            <div className="flex items-center space-x-3">
              {type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
              <span className="font-bold text-sm">{message}</span>
            </div>
            <button onClick={onClose} className="ml-4 text-white/80 hover:text-white transition-colors">
              <FaTimes />
            </button>
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
        setFormData(projectData); // Тут зберігається і об'єкт, і вкладений client
        
        if (projectData.responsible_employee) {
          setEmployeeSearch(`${projectData.responsible_employee.name} (ID: ${projectData.responsible_employee.custom_id})`);
        }

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
      // 1. Оновлення даних Об'єкта (Installations)
      const instUpdates = {};
      const ignoredInstKeys = ['client', 'responsible_employee', 'project_stages', 'id', 'created_at', 'updated_at', 'client_id', 'topic_updated'];

      Object.keys(formData).forEach(key => {
        if (ignoredInstKeys.includes(key)) return;
        if (String(project[key] || '') !== String(formData[key] || '')) {
          instUpdates[key] = formData[key];
        }
      });

      let instUpdated = false;
      if (Object.keys(instUpdates).length > 0) {
          instUpdates.topic_updated = true;
          instUpdates.updated_at = new Date().toISOString();
          const { error } = await supabase.from('installations').update(instUpdates).eq('custom_id', id);
          if (error) throw error;
          instUpdated = true;
      }

      // 2. Оновлення даних Клієнта (Clients)
      const clientUpdates = {};
      const ignoredClientKeys = ['id', 'created_at', 'updated_at', 'custom_id'];
      
      if (formData.client) {
          Object.keys(formData.client).forEach(key => {
              if (ignoredClientKeys.includes(key)) return;
              if (String(project.client[key] || '') !== String(formData.client[key] || '')) {
                  clientUpdates[key] = formData.client[key];
              }
          });
      }

      let clientUpdated = false;
      if (Object.keys(clientUpdates).length > 0) {
          clientUpdates.updated_at = new Date().toISOString();
          const { error } = await supabase.from('clients').update(clientUpdates).eq('custom_id', project.client.custom_id);
          if (error) throw error;
          clientUpdated = true;
      }

      if (!instUpdated && !clientUpdated) {
         showToast('Немає змін для збереження', 'info');
         setIsEditing(false);
         setSaving(false);
         return;
      }
      
      showToast('Зміни успішно збережено!', 'success');
      setIsEditing(false);
      setProject({ 
          ...project, 
          ...instUpdates, 
          client: { ...project.client, ...clientUpdates },
          responsible_employee: employees.find(e => e.custom_id === (instUpdates.responsible_emp_id || project.responsible_emp_id)) || project.responsible_employee 
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
      return date.toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  
  let locationLink = project?.gps_link;
  if (!locationLink && project?.client?.oblast && project?.client?.populated_place) {
    const location = `${project.client.oblast}, ${project.client.populated_place}`;
    locationLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  }

  const responsiblePhone = project?.responsible_employee?.phone || project?.responsible_employee?.contact_phone || '—';

  // --- СТИЛІ ІНПУТІВ ДЛЯ РЕДАГУВАННЯ ---
  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all";
  const labelClass = "text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-800">
      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Title & Back */}
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => {
                        if (window.history.state && window.history.state.idx > 0) navigate(-1);
                        else navigate('/installations');
                    }} 
                    className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-full text-slate-500 transition-colors"
                >
                    <FaArrowLeft />
                </button>
               <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.name ?? ""}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder={`Об'єкт #${project.custom_id}`}
                        className="w-full max-w-[500px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 focus:bg-white"
                      />
                    ) : (
                      <span>{project.name || `Об'єкт #${project.custom_id}`}</span>
                    )}
                    <span className="text-sm font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        #{project.custom_id}
                    </span>
                  </h1>
                  <p className="text-sm font-medium text-slate-500 mt-1">
                    {project.client?.company_name || project.client?.name} • {project.client?.oblast}
                  </p>
               </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
               <button 
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors shadow-sm"
                  onClick={() => setIsModalOpen(true)}
               >
                  <FaCommentDots className="text-indigo-500"/> Додати запис
               </button>
               
               {canEdit && (
                 isEditing ? (
                    <>
                      <button onClick={handleCancel} className="px-5 py-2.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold text-sm transition-colors">
                        Скасувати
                      </button>
                      <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-emerald-200 transition-all active:scale-95 disabled:opacity-50">
                        {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <FaSave />}
                        Зберегти зміни
                      </button>
                    </>
                 ) : (
                    <button onClick={() => setIsEditing(true)} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-sm flex items-center gap-2 shadow-md shadow-slate-200 transition-all active:scale-95">
                       <FaEdit /> Редагувати
                    </button>
                 )
               )}
            </div>
          </div>

          {/* TABS NAVIGATION */}
          <div className="flex items-center gap-8 mt-6 border-b border-slate-100">
             {['general', 'documents', 'workflow'].map((tab) => (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-3 px-1 text-sm font-extrabold flex items-center gap-2 transition-all relative 
                        ${activeTab === tab ? 'text-indigo-600 border-b-[3px] border-indigo-600' : 'text-slate-400 hover:text-slate-700'}`}
                >
                    {tab === 'general' && <FaBolt />}
                    {tab === 'documents' && <FaFileAlt />}
                    {tab === 'workflow' && <FaTools />}
                    {tab === 'general' ? 'Основна інформація' : tab === 'documents' ? 'Документи' : 'Етапи та задачі'}
                </button>
             ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8">
        
        {activeTab === 'general' && (
           <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* LEFT COLUMN (Client & Additional Info) */}
              <div className="lg:col-span-4 space-y-6">
                 
                 {/* CLIENT CARD */}
                 <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                       <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                          <FaUsers className="text-indigo-500"/> Інформація клієнта
                       </h3>
                       {project.client?.is_subcontract && (
                         <span className="bg-orange-50 text-orange-600 text-[10px] px-2.5 py-1 rounded-lg font-bold border border-orange-200 flex items-center gap-1 uppercase tracking-wider">
                            <FaHandshake size={12}/> {project.client.contractor_company}
                         </span>
                       )}
                    </div>
                    
                    <div className="p-6 grid gap-y-5">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className={labelClass}>Контактна особа</label>
                                {isEditing ? (
                                    <input type="text" value={formData.client?.name || ''} onChange={e => setFormData({...formData, client: {...formData.client, name: e.target.value}})} className={inputClass} />
                                ) : (
                                    <p className="text-base font-bold text-slate-900">{project.client?.name}</p>
                                )}
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className={labelClass}>Компанія (ФОП)</label>
                                {isEditing ? (
                                    <input type="text" value={formData.client?.company_name || ''} onChange={e => setFormData({...formData, client: {...formData.client, company_name: e.target.value}})} className={inputClass} />
                                ) : (
                                    <p className="text-sm font-bold text-slate-800">{project.client?.company_name || '—'}</p>
                                )}
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className={labelClass}>Телефон</label>
                                {isEditing ? (
                                    <input type="tel" value={formData.client?.phone || ''} onChange={e => setFormData({...formData, client: {...formData.client, phone: e.target.value}})} className={inputClass} />
                                ) : (
                                    <a href={`tel:${project.client?.phone}`} className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-2 text-sm bg-indigo-50 w-fit px-3 py-1.5 rounded-lg border border-indigo-100 transition-colors">
                                       <FaPhone className="text-xs"/> {project.client?.phone || '—'}
                                    </a>
                                )}
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className={labelClass}>Область</label>
                                {isEditing ? (
                                    <input type="text" value={formData.client?.oblast || ''} onChange={e => setFormData({...formData, client: {...formData.client, oblast: e.target.value}})} className={inputClass} />
                                ) : (
                                    <p className="text-sm font-bold text-slate-800">{project.client?.oblast || '—'}</p>
                                )}
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className={labelClass}>Нас. пункт</label>
                                {isEditing ? (
                                    <input type="text" value={formData.client?.populated_place || ''} onChange={e => setFormData({...formData, client: {...formData.client, populated_place: e.target.value}})} className={inputClass} />
                                ) : (
                                    <p className="text-sm font-bold text-slate-800">{project.client?.populated_place || '—'}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Примітки клієнта</label>
                            {isEditing ? (
                                <textarea rows="3" value={formData.client?.notes || ''} onChange={e => setFormData({...formData, client: {...formData.client, notes: e.target.value}})} className={`${inputClass} resize-none`} placeholder="Додаткова інформація..."/>
                            ) : (
                                project.client?.notes ? (
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 whitespace-pre-wrap">
                                        {project.client.notes}
                                    </div>
                                ) : <p className="text-sm text-slate-400 italic">Немає приміток</p>
                            )}
                        </div>
                    </div>
                 </div>

                 {/* ADDITIONAL INFO BLOCK (HISTORY) */}
                 <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                    <div 
                        onClick={() => setIsInfoExpanded(!isInfoExpanded)} 
                        className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                        <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                            <FaCommentDots className="text-indigo-500"/> 
                            Робочі записи ({additionalInfoList.length})
                        </h3>
                        <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                            {isInfoExpanded ? <FaChevronUp size={12}/> : <FaChevronDown size={12}/>}
                        </div>
                    </div>
                    
                    <AnimatePresence>
                        {isInfoExpanded && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                                <div className="p-6 bg-white space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar">
                                    {additionalInfoList.length === 0 ? (
                                        <div className="text-center text-slate-400 text-sm font-medium py-8 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                                            Записів ще немає.
                                        </div>
                                    ) : (
                                        additionalInfoList.map((info) => (
                                            <div key={info.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors">
                                                <div className="flex justify-between items-start mb-2.5">
                                                    <span className="font-bold text-slate-800 text-sm">
                                                        {info.author_name || 'Система'}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-sm">
                                                        {formatDateTime(info.created_at)}
                                                    </span>
                                                </div>
                                                <p className="text-sm font-medium text-slate-600 whitespace-pre-wrap leading-relaxed mb-3">
                                                    {info.message_text}
                                                </p>
                                                <div className="flex justify-end pt-2 border-t border-slate-100">
                                                    {info.is_sent_to_telegram ? (
                                                        <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                                            <FaCheckCircle/> В Telegram
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                                            <FaClock/> Тільки в CRM
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

              {/* RIGHT COLUMN (Project Details) */}
              <div className="lg:col-span-8">
                 <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                     <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                        <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                            <FaTools className="text-indigo-500"/> Специфікація об'єкта
                        </h3>
                     </div>

                 <div className="p-6 md:p-8 space-y-8">
                    {/* Responsible Person */}
                    <div className="pb-6 border-b border-slate-100">
                        <label className={labelClass}>Відповідальний за проект (Менеджер)</label>
                        {isEditing ? (
                             <div className="relative max-w-md">
                                  <input type="text" value={employeeSearch} onChange={e => { setEmployeeSearch(e.target.value); if (formData.responsible_emp_id) setFormData({...formData, responsible_emp_id: ''}); }} placeholder="Пошук працівника..." className={inputClass} />
                                  <FaSearch className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                  {employeeSearch && filteredEmployeesMain.length > 0 && !formData.responsible_emp_id && (
                                    <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl mt-2 shadow-xl max-h-48 overflow-y-auto custom-scrollbar p-1">
                                      {filteredEmployeesMain.map(emp => (
                                        <button key={emp.custom_id} type="button" onClick={() => handleMainEmployeeSelect(emp)} className="w-full px-4 py-2.5 text-left hover:bg-indigo-50 rounded-lg text-sm font-bold text-slate-700 transition-colors mb-0.5">
                                            {emp.name} <span className="text-[10px] text-slate-400 ml-2 bg-white border px-1.5 py-0.5 rounded">#{emp.custom_id}</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                             </div>
                        ) : (
                            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 max-w-md shadow-sm">
                                <div className="w-12 h-12 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 font-black text-lg">
                                    {project.responsible_employee?.name ? project.responsible_employee.name.charAt(0) : '?'}
                                </div>
                                <div>
                                    <p className="text-base font-extrabold text-slate-900">
                                        {project.responsible_employee?.name || 'Не призначено'}
                                    </p>
                                    {project.responsible_employee && (
                                        <a href={`tel:${responsiblePhone}`} className="text-sm font-bold text-slate-500 hover:text-indigo-600 flex items-center gap-1.5 mt-1 transition-colors">
                                            <FaPhone className="text-xs" /> {responsiblePhone}
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                        {/* Status & Type */}
                        <div className="space-y-6">
                             <div>
                                <label className={labelClass}>Статус виконання</label>
                                {isEditing ? (
                                    <select value={formData.status || 'planning'} onChange={e => setFormData({...formData, status: e.target.value})} className={inputClass}>
                                        {Object.entries(PROJECT_STATUS_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-bold border shadow-sm
                                        ${project.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                          project.status === 'in_progress' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 
                                          project.status === 'on_hold' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                          'bg-slate-50 text-slate-700 border-slate-200'}`}>
                                        {project.status === 'completed' && <FaCheckCircle className="text-emerald-500"/>}
                                        {PROJECT_STATUS_LABELS[project.status] || project.status}
                                    </span>
                                )}
                            </div>
                             <div>
                                <label className={labelClass}>Клас станції</label>
                                {isEditing ? (
                                    <select value={formData.station_type || ''} onChange={e => setFormData({...formData, station_type: e.target.value})} className={inputClass}>
                                        <option value="">Не вказано</option>
                                        <option value="Мережева">Мережева (СЕС)</option>
                                        <option value="Автономна">Автономна (АЕС)</option>
                                        <option value="Гібридна">Гібридна (ГЕС)</option>
                                    </select>
                                ) : (
                                    <p className="text-base font-bold text-slate-900 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 inline-block">{project.station_type || '—'}</p>
                                )}
                            </div>
                             <div>
                                 <label className={labelClass}>Спосіб монтажу</label>
                                 {isEditing ? (
                                    <select value={formData.mount_type || ''} onChange={e => setFormData({...formData, mount_type: e.target.value})} className={inputClass}>
                                        <option value="">Не вказано</option>
                                        <option value="Дахове кріплення (Скатний дах)">Дах (Скатний)</option>
                                        <option value="Дахове кріплення (Плоский дах)">Дах (Плоский баласт)</option>
                                        <option value="Наземне кріплення">Наземна конструкція</option>
                                        <option value="Трекерна система">Трекер</option>
                                        <option value="Електромонтаж">Тільки електромонтаж</option>
                                    </select>
                                 ) : (
                                    <p className="text-base font-bold text-slate-900 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">{project.mount_type || '—'}</p>
                                 )}
                            </div>
                        </div>

                        {/* Specs & Dates */}
                        <div className="space-y-6">
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className={labelClass}>Потужність</label>
                                    {isEditing ? (
                                        <div className="relative">
                                            <input type="number" step="0.1" value={formData.capacity_kw || ''} onChange={e => setFormData({...formData, capacity_kw: e.target.value})} className={`${inputClass} pr-12`} />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">кВт</span>
                                        </div>
                                    ) : (
                                        <p className="text-base font-black text-slate-900 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center">{project.capacity_kw ? `${project.capacity_kw} кВт` : '—'}</p>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className={labelClass}>Мережа</label>
                                    {isEditing ? (
                                        <select value={formData.quant_phase || ''} onChange={e => setFormData({...formData, quant_phase: e.target.value})} className={inputClass}>
                                            <option value="">—</option>
                                            <option value="1">1 фаза</option>
                                            <option value="3">3 фази</option>
                                        </select>
                                    ) : (
                                        <p className="text-base font-black text-slate-900 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center">{project.quant_phase ? `${project.quant_phase}ф` : '—'}</p>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex gap-4">
                                 <div className="flex-1">
                                     <label className={`${labelClass} flex items-center gap-1.5`}><FaCalendarAlt className="text-indigo-400"/> Старт</label>
                                     {isEditing ? (
                                         <input type="date" value={formData.start_date || ''} onChange={e => setFormData({...formData, start_date: e.target.value})} className={inputClass} />
                                     ) : (
                                         <p className="text-sm font-bold text-slate-800 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center">{formatDate(project.start_date)}</p>
                                     )}
                                </div>
                                <div className="flex-1">
                                     <label className={`${labelClass} flex items-center gap-1.5`}><FaCalendarAlt className="text-emerald-400"/> Фініш</label>
                                     {isEditing ? (
                                         <input type="date" value={formData.end_date || ''} onChange={e => setFormData({...formData, end_date: e.target.value})} className={inputClass} />
                                     ) : (
                                         <p className="text-sm font-bold text-slate-800 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center">{formatDate(project.end_date)}</p>
                                     )}
                                </div>
                            </div>

                             <div>
                                 <label className={labelClass}>Локація об'єкта (GPS)</label>
                                 {isEditing ? (
                                     <div className="relative">
                                        <input type="url" placeholder="Вставте посилання з Google Maps..." value={formData.gps_link || ''} onChange={e => setFormData({...formData, gps_link: e.target.value})} className={`${inputClass} pl-10`} />
                                        <FaGlobe className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                     </div>
                                 ) : (
                                     locationLink ? (
                                         <a href={locationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 w-full justify-center px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-bold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-colors shadow-sm">
                                             <FaMapMarkerAlt className="text-red-500 text-lg"/> Відкрити на Google Maps
                                         </a>
                                     ) : <p className="text-sm font-bold text-slate-400 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 text-center">Немає посилання</p>
                                 )}
                            </div>
                        </div>
                    </div>

                    {/* Організаційні деталі (Банк та Примітки) */}
                    <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className={labelClass}>Банк / Реквізити</label>
                            {isEditing ? (
                                <input type="text" placeholder="Вкажіть назву банку..." value={formData.bank || ''} onChange={e => setFormData({...formData, bank: e.target.value})} className={inputClass} />
                            ) : (
                                <p className="text-base font-bold text-slate-800 flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-slate-200">
                                    <FaUniversity className="text-slate-400"/> {project.bank || 'Не вказано'}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className={labelClass}>Технічні примітки</label>
                            {isEditing ? (
                                <textarea rows="2" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className={`${inputClass} resize-y min-h-[50px]`} placeholder="Умови монтажу, складність тощо..." />
                            ) : (
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 whitespace-pre-wrap leading-relaxed">
                                    {project.notes || <span className="italic opacity-70">Відсутні</span>}
                                </div>
                            )}
                        </div>
                    </div>

                 </div>
                 </div>
              </div>
           </motion.div>
        )}

        {/* --- TAB: DOCUMENTS --- */}
        {activeTab === 'documents' && (
           <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
               <ProjectDocuments project={project} />
           </motion.div>
        )}

        {/* --- TAB: WORKFLOW --- */}
        {activeTab === 'workflow' && (
            <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="mt-2"
            >
              <ProjectWorkflow project={project} />
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