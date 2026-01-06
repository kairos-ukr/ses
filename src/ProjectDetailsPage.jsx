import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaArrowLeft, FaSave, FaEdit, FaUsers, FaMapMarkerAlt,
  FaBolt, FaTools, FaMoneyBillWave, FaInfoCircle,
  FaCheckCircle, FaClock, FaExclamationTriangle, FaTimes, FaCheck, FaComment,
  FaRulerCombined, FaFileContract, FaFileSignature, FaWallet,
  FaShoppingCart, FaBoxOpen, FaShieldAlt, FaPlay, FaFlagCheckered,
  FaCalculator, FaCamera, FaPlug, FaHourglassHalf, FaSearch,
  FaFolderOpen, FaStickyNote, FaHashtag, FaBan, FaHourglass, FaSpinner,
  FaPhone, FaCity, FaGlobe, FaChevronDown, FaChevronUp, FaHandshake
} from "react-icons/fa";

import { supabase } from "./supabaseClient";
// Імпорти
import ObjectDocumentsModal from "./ObjectDocumentsModal";
import ProjectEquipmentModal from "./ProjectEquipmentModal";
import { useAuth } from "./AuthProvider"; // 1. ІМПОРТУЄМО AUTH CONTEXT



const ALLOWED_COMPANIES = ['Кайрос', 'Розумне збереження енергії'];

// Project Statuses Translation
const PROJECT_STATUS_LABELS = {
  planning: 'Планування',
  in_progress: 'Виконується',
  on_hold: 'Призупинено',
  completed: 'Завершено',
  cancelled: 'Скасовано'
};

// Workflow Stages
const WORKFLOW_STAGES = [
  { value: 'survey', label: 'Тех. огляд (заміри)', icon: FaSearch },
  { value: 'waiting_project', label: 'Очікуємо проект', icon: FaClock },
  { value: 'project_done', label: 'Проект зроблено', icon: FaRulerCombined },
  { value: 'project_approved', label: 'Проект погоджено', icon: FaCheckCircle },
  { value: 'kp_done', label: 'КП зроблено', icon: FaFileContract },
  { value: 'kp_approved', label: 'КП погоджено', icon: FaFileSignature },
  { value: 'advance_payment', label: 'Аванс', icon: FaWallet },
  { value: 'equipment_order', label: 'Замовлення обладнання', icon: FaShoppingCart },
  { value: 'waiting_equipment', label: 'Очікуємо обладнання', icon: FaHourglassHalf },
  { value: 'materials_packing', label: 'Комплектація матеріалів', icon: FaBoxOpen },
  { value: 'protection_packing', label: 'Компл. ел.захисту', icon: FaShieldAlt },
  { value: 'installation_start', label: 'Старт монтажу', icon: FaPlay },
  { value: 'res_connection', label: 'Очікуємо підключення РЕС', icon: FaPlug },
  { value: 'final_settlement', label: 'Розрахунок', icon: FaCalculator },
  { value: 'final_report', label: 'Фотозвіт та залишки', icon: FaCamera },
  { value: 'installation_finish', label: 'Монтаж завершено', icon: FaFlagCheckered },
];

const STAGE_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Не розпочато', icon: FaHourglass, color: 'text-gray-400' },
  { value: 'in_progress', label: 'В роботі', icon: FaSpinner, color: 'text-blue-500' },
  { value: 'completed', label: 'Виконано', icon: FaCheckCircle, color: 'text-green-500' },
  { value: 'skipped', label: 'Пропущено', icon: FaExclamationTriangle, color: 'text-orange-500' },
  { value: 'failed', label: 'Не виконали', icon: FaBan, color: 'text-red-500' },
];

// --- Helper: Toast Component ---
const Toast = ({ message, type = 'success', isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const duration = message.includes('УВАГА') ? 6000 : 4000;
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose, message]);

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

// --- Helper: Comment Modal ---
const CommentModal = ({ isOpen, onClose, stage, comment, onSave }) => {
  const [text, setText] = useState(comment || '');

  useEffect(() => {
    setText(comment || '');
  }, [comment]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-none md:backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-xl w-full max-w-lg shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4">Коментар до етапу: {stage?.label}</h3>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows="6"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 resize-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Введіть коментар..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={onClose} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-gray-700">
                Скасувати
              </button>
              <button onClick={() => { onSave(text); onClose(); }} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium">
                Зберегти
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Helper: Порівняння значень для часткового оновлення ---
const isDifferent = (val1, val2) => {
  if (!val1 && !val2) return false;
  return String(val1) !== String(val2);
};

// === MAIN COMPONENT ===
export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // 2. ОТРИМУЄМО РОЛЬ I TIER
  const { role, tier } = useAuth();

  // 3. ВИЗНАЧАЄМО ПРАВА НА РЕДАГУВАННЯ
  // Редагувати можуть: Адміни, Офіс, або Монтажники з Tier 1 (Бригадири)
  const canEdit = role === 'admin' || role === 'super_admin' || role === 'office' || (role === 'installer' && tier === 1);

  const activeStageRef = useRef(null);

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  const [isObjectInfoOpen, setIsObjectInfoOpen] = useState(false);
  const [isFinanceOpen, setIsFinanceOpen] = useState(false);
  
  const [formData, setFormData] = useState({});
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  
  const [workflowData, setWorkflowData] = useState({});
  const [currentStage, setCurrentStage] = useState('survey');
  const [commentModal, setCommentModal] = useState({ isOpen: false, stageValue: null });
  
  const [viewingDocs, setViewingDocs] = useState(false);
  const [viewingEquipment, setViewingEquipment] = useState(false);
  
  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
  
  const showToast = useCallback((message, type = 'success') => 
    setToast({ isVisible: true, message, type }), []);
  const hideToast = useCallback(() => 
    setToast(prev => ({ ...prev, isVisible: false })), []);

  useEffect(() => {
    if (activeStageRef.current && !loading) {
      activeStageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading, currentStage]);

  useEffect(() => {
    const loadProject = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
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
          
        if (error) throw error;
        if (!data) {
          showToast('Проект не знайдено', 'error');
          navigate('/installations');
          return;
        }
        
        setProject(data);
        setFormData(data); 
        setCurrentStage(data.workflow_stage || 'survey');
        
        const workflow = data.workflow_data ? (typeof data.workflow_data === 'string' ? JSON.parse(data.workflow_data) : data.workflow_data) : {};
        setWorkflowData(workflow);
        
        if (data.responsible_employee) {
          setEmployeeSearch(`${data.responsible_employee.name} (ID: ${data.responsible_employee.custom_id})`);
        }
        
      } catch (error) {
        console.error(error);
        showToast(`Помилка завантаження: ${error.message}`, 'error');
        navigate('/installations');
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [id, navigate, showToast]);

  useEffect(() => {
    const loadRefData = async () => {
      const [clientsRes, employeesRes] = await Promise.all([
        supabase.from('clients').select('custom_id, name, company_name, phone, oblast, populated_place, notes').order('name'),
        supabase.from('employees').select('custom_id, name, position').order('name')
      ]);
      setClients(clientsRes.data || []);
      setEmployees(employeesRes.data || []);
    };
    loadRefData();
  }, []);

  const handleSave = async () => {
    // Додатковий захист перед збереженням
    if (!canEdit) {
      showToast('У вас немає прав на редагування', 'error');
      return;
    }

    setSaving(true);
    try {
      const currentData = {
        ...formData,
        workflow_data: workflowData,
        workflow_stage: currentStage,
        payment_status: updatePaymentStatus(formData.total_cost, formData.paid_amount),
      };

      const updates = {};
      const ignoredKeys = ['client', 'responsible_employee', 'id', 'created_at', 'updated_at', 'client_id'];

      Object.keys(currentData).forEach(key => {
        if (ignoredKeys.includes(key)) return;

        const oldValue = project[key];
        const newValue = currentData[key];

        if (key === 'workflow_data') {
          if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            updates[key] = newValue;
          }
        } 
        else if (isDifferent(oldValue, newValue)) {
          updates[key] = newValue;
        }
      });

      if (Object.keys(updates).length === 0) {
        showToast('Немає змін для збереження', 'info');
        setIsEditing(false);
        setSaving(false);
        return;
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('installations')
        .update(updates)
        .eq('custom_id', id)
        .eq('updated_at', project.updated_at) 
        .select(`
            *,
            client:clients!installations_client_id_fkey (*),
            responsible_employee:employees!installations_responsible_emp_id_fkey (*)
        `);
        
      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('VERSION_CONFLICT');
      }
      
      showToast('Зміни успішно збережено!', 'success');
      setIsEditing(false);
      
      const updatedProject = data[0];
      setProject(updatedProject);
      setFormData(updatedProject);

      if (updatedProject.workflow_data) {
         setWorkflowData(typeof updatedProject.workflow_data === 'string' 
            ? JSON.parse(updatedProject.workflow_data) 
            : updatedProject.workflow_data
         );
      }
      
    } catch (error) {
      if (error.message === 'VERSION_CONFLICT') {
        showToast('УВАГА! Дані застаріли. Хтось інший змінив цей проект. Сторінка оновиться для отримання актуальних даних.', 'error');
        setTimeout(() => {
           window.location.reload(); 
        }, 3000);
      } else {
        showToast(`Помилка збереження: ${error.message}`, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

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

  const handleWorkflowStatusChange = (stageValue, status) => {
    setWorkflowData(prev => ({
      ...prev,
      [stageValue]: {
        ...prev[stageValue],
        status: status,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const handleWorkflowComment = (stageValue, comment) => {
    setWorkflowData(prev => ({
      ...prev,
      [stageValue]: {
        ...prev[stageValue],
        comment: comment,
        updatedAt: new Date().toISOString()
      }
    }));
  };

  const filteredEmployees = employeeSearch ? employees.filter(emp =>
    emp.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    emp.custom_id.toString().includes(employeeSearch)
  ) : [];

  const handleEmployeeSelect = (employee) => {
    setFormData({ ...formData, responsible_emp_id: employee.custom_id });
    setEmployeeSearch(`${employee.name} (ID: ${employee.custom_id})`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Завантаження...</p>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const formatDate = (date) => date ? new Date(date).toLocaleDateString('uk-UA') : 'Не вказано';
  const formatCost = (cost) => cost != null ? `$${Number(cost).toLocaleString('en-US')}` : 'Не вказано';
  
  const paymentPercentage = (project.total_cost > 0 && project.paid_amount > 0) 
    ? Math.min((project.paid_amount / project.total_cost) * 100, 100) 
    : 0;

  let locationLink = project.gps_link;
  if (!locationLink && project.client?.oblast && project.client?.populated_place) {
    const location = `${project.client.oblast}, ${project.client.populated_place}`;
    locationLink = `http://maps.google.com/?q=${encodeURIComponent(location)}`;
  }

  return (
    <div className="min-h-screen bg-slate-100 md:bg-gradient-to-br md:from-slate-50 md:via-blue-50 md:to-indigo-100 pb-20">
      <Toast message={toast.message} type={toast.type} isVisible={toast.isVisible} onClose={hideToast} />
      
      {viewingDocs && <ObjectDocumentsModal project={project} onClose={() => setViewingDocs(false)} />}
      {viewingEquipment && <ProjectEquipmentModal project={project} onClose={() => setViewingEquipment(false)} showToast={showToast} />}

      {commentModal.isOpen && (
        <CommentModal
          isOpen={commentModal.isOpen}
          onClose={() => setCommentModal({ isOpen: false, stageValue: null })}
          stage={WORKFLOW_STAGES.find(s => s.value === commentModal.stageValue)}
          comment={workflowData[commentModal.stageValue]?.comment || ''}
          onSave={(comment) => handleWorkflowComment(commentModal.stageValue, comment)}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200/80 shadow-sm md:bg-white/95 md:backdrop-blur-xl md:shadow-lg">
        <div className="px-3 sm:px-6 py-4">
          <div className="flex justify-between items-center gap-2">
            <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
              <button onClick={() => navigate('/installations')} className="p-2 hover:bg-gray-100 rounded-lg transition flex-shrink-0">
                <FaArrowLeft className="text-gray-600" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-800 truncate">
                  {project.name || `Проект #${project.custom_id}`}
                </h1>
                <p className="text-xs sm:text-sm text-gray-500 truncate">
                   #{project.custom_id} | {project.client?.company_name || project.client?.name}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* 4. КНОПКИ РЕДАГУВАННЯ ТІЛЬКИ ДЛЯ ALLOWED ROLES */}
              {canEdit && (
                isEditing ? (
                  <>
                    <button onClick={() => { setIsEditing(false); setFormData(project); }} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-sm text-gray-700">
                      <span className="hidden sm:inline">Скасувати</span><FaTimes className="sm:hidden"/>
                    </button>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50 text-sm">
                      {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <FaSave />}
                      <span className="hidden sm:inline">{saving ? 'Збереження...' : 'Зберегти'}</span>
                    </button>
                  </>
                ) : (
                  <button onClick={() => { setIsEditing(true); setIsObjectInfoOpen(true); setIsFinanceOpen(true); }} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm">
                    <FaEdit /> <span className="hidden sm:inline">Редагувати</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-3 sm:p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Client Info Card */}
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm md:bg-white/95 md:backdrop-blur-xl md:shadow-xl md:rounded-2xl relative overflow-hidden">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><FaUsers className="text-indigo-600" /> Інформація про клієнта</h2>
              
              {project.client?.is_subcontract && (
                <div className="absolute top-4 right-4 bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold border border-orange-200 flex items-center gap-1 shadow-sm">
                   <FaHandshake /> Підряд: {project.client.contractor_company}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaHashtag className="text-xs" /> ID клієнта</label><p className="mt-1 font-semibold text-gray-800">#{project.client?.custom_id}</p></div>
                
                {project.client?.company_name && (
                   <div><label className="text-sm font-medium text-gray-600">Компанія / ФОП</label><p className="mt-1 font-semibold text-gray-800">{project.client.company_name}</p></div>
                )}
                
                <div><label className="text-sm font-medium text-gray-600">Контактна особа</label><p className="mt-1 font-semibold text-gray-800">{project.client?.name}</p></div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">Тип об'єкта клієнта</label>
                  <p className="mt-1 font-semibold text-gray-800">{project.client?.object_type || 'Не вказано'}</p>
                </div>

                <div><label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaPhone className="text-xs" /> Телефон</label><p className="mt-1 font-semibold text-gray-800">{project.client?.phone || 'Не вказано'}</p></div>
                
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaCity className="text-xs" /> Адреса</label>
                  <p className="mt-1 font-semibold text-gray-800">
                    {project.client?.oblast && project.client?.populated_place 
                      ? `${project.client.oblast}, ${project.client.populated_place}`
                      : 'Не вказано'}
                  </p>
                </div>
                {project.client?.notes && (
                  <div className="md:col-span-2"><label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaStickyNote className="text-xs" /> Примітки</label><p className="mt-1 text-gray-700 bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm italic">{project.client.notes}</p></div>
                )}
              </div>
            </div>

            {/* Buttons (Parcels & Documents) */}
            <div className="grid grid-cols-2 gap-4">
               <button onClick={() => setViewingDocs(true)} className="flex items-center justify-center gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition group md:bg-white/95 md:backdrop-blur-xl md:shadow-lg">
                  <div className="p-3 bg-indigo-100 rounded-full group-hover:bg-indigo-200 transition"><FaFolderOpen className="text-indigo-600 text-xl" /></div>
                  <span className="font-semibold text-gray-800">Документи</span>
               </button>
               <button onClick={() => setViewingEquipment(true)} className="flex items-center justify-center gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition group md:bg-white/95 md:backdrop-blur-xl md:shadow-lg">
                  <div className="p-3 bg-green-100 rounded-full group-hover:bg-green-200 transition"><FaBoxOpen className="text-green-600 text-xl" /></div>
                  <span className="font-semibold text-gray-800">Посилки</span>
               </button>
            </div>

            {/* Object Info (Accordion) */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden md:bg-white/95 md:backdrop-blur-xl md:shadow-xl md:rounded-2xl">
               <div 
                 onClick={() => setIsObjectInfoOpen(!isObjectInfoOpen)}
                 className="p-6 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors select-none"
               >
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <FaBolt className="text-yellow-500" /> Інформація про об'єкт
                  </h2>
                  {isObjectInfoOpen ? <FaChevronUp className="text-gray-400"/> : <FaChevronDown className="text-gray-400"/>}
               </div>

               <AnimatePresence>
                 {isObjectInfoOpen && (
                   <motion.div 
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: "auto", opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     className="px-6 pb-6"
                   >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                        
                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-600">Загальний статус</label>
                          {isEditing ? (
                             <select value={formData.status || 'planning'} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium text-indigo-900">
                                <option value="planning">Планування</option>
                                <option value="in_progress">Виконується</option>
                                <option value="on_hold">Призупинено</option>
                                <option value="completed">Завершено</option>
                                <option value="cancelled">Скасовано</option>
                             </select>
                          ) : (
                             <p className="mt-1 font-bold text-indigo-700 bg-indigo-50 inline-block px-3 py-1 rounded-lg">
                               {PROJECT_STATUS_LABELS[project.status] || project.status || 'Не визначено'}
                             </p>
                          )}
                        </div>

                        <div><label className="text-sm font-medium text-gray-600">Назва об'єкта</label>{isEditing ? <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{project.name || 'Не вказано'}</p>}</div>
                        <div><label className="text-sm font-medium text-gray-600">Потужність (кВт)</label>{isEditing ? <input type="number" step="0.1" value={formData.capacity_kw || ''} onChange={e => setFormData({...formData, capacity_kw: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{project.capacity_kw ? `${project.capacity_kw} кВт` : 'Не вказано'}</p>}</div>
                        
                        <div>
                           <label className="text-sm font-medium text-gray-600">Тип монтажу</label>
                           {isEditing ? (
                             <select value={formData.mount_type || ''} onChange={e => setFormData({...formData, mount_type: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                                <option value="">Виберіть...</option>
                                <option value="Дахове кріплення (Скатний дах)">Дахове кріплення (Скатний дах)</option>
                                <option value="Дахове кріплення (Плоский дах)">Дахове кріплення (Плоский дах)</option>
                                <option value="Наземне кріплення">Наземне кріплення</option>
                                <option value="Трекерна система">Трекерна система</option>
                                <option value="Дах/Земля">Дах/Земля</option>
                                <option value="Електромонтаж">Електромонтаж</option>
                                <option value="Інше">Інше</option>
                             </select>
                           ) : <p className="mt-1 font-semibold text-gray-800">{project.mount_type || 'Не вказано'}</p>}
                        </div>
                        
                        <div>
                           <label className="text-sm font-medium text-gray-600">Тип станції</label>
                           {isEditing ? (
                             <select value={formData.station_type || ''} onChange={e => setFormData({...formData, station_type: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                                <option value="">Виберіть...</option><option value="Мережева">Мережева</option><option value="Автономна">Автономна</option><option value="Гібридна">Гібридна</option>
                             </select>
                           ) : <p className="mt-1 font-semibold text-gray-800">{project.station_type || 'Не вказано'}</p>}
                        </div>
                        
                        <div className="relative">
                          <label className="text-sm font-medium text-gray-600">Відповідальний</label>
                          {isEditing ? (
                            <>
                              <input type="text" value={employeeSearch} onChange={e => { setEmployeeSearch(e.target.value); if (formData.responsible_emp_id) setFormData({...formData, responsible_emp_id: ''}); }} placeholder="Пошук працівника..." className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" />
                              {employeeSearch && filteredEmployees.length > 0 && !formData.responsible_emp_id && (
                                <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
                                  {filteredEmployees.map(emp => (
                                    <button key={emp.custom_id} type="button" onClick={() => handleEmployeeSelect(emp)} className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b">
                                        {emp.name} <span className="text-xs text-gray-500">(ID: {emp.custom_id})</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                             <p className="mt-1 font-semibold text-gray-800">
                               {project.responsible_employee?.name || 'Не призначено'} 
                               {project.responsible_employee?.custom_id && <span className="text-gray-500 ml-1 font-normal">(ID: {project.responsible_employee.custom_id})</span>}
                             </p>
                          )}
                        </div>

                        <div>
                           <label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaGlobe className="text-xs" /> Локація</label>
                           {isEditing ? (
                              <div className="space-y-2 mt-1">
                                 <input type="url" placeholder="GPS посилання" value={formData.gps_link || ''} onChange={e => setFormData({...formData, gps_link: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                              </div>
                           ) : (
                              <div className="mt-1">
                                {locationLink ? <a href={locationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 underline font-semibold"><FaMapMarkerAlt /> Переглянути на мапі</a> : <p className="font-semibold text-gray-800">Не вказано</p>}
                              </div>
                           )}
                        </div>

                        <div><label className="text-sm font-medium text-gray-600">Дата початку</label>{isEditing ? <input type="date" value={formData.start_date || ''} onChange={e => setFormData({...formData, start_date: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{formatDate(project.start_date)}</p>}</div>
                        <div><label className="text-sm font-medium text-gray-600">Дата завершення</label>{isEditing ? <input type="date" value={formData.end_date || ''} onChange={e => setFormData({...formData, end_date: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{formatDate(project.end_date)}</p>}</div>
                        
                        <div>
                          <label className="text-sm font-medium text-gray-600">Виконуюча компанія</label>
                          {isEditing ? (
                             <select value={formData.working_company || ''} onChange={e => setFormData({...formData, working_company: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                                <option value="">Виберіть...</option>{ALLOWED_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                             </select>
                          ) : <p className="mt-1 font-semibold text-gray-800">{project.working_company || 'Не вказано'}</p>}
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-600">Банк</label>
                          {isEditing ? (
                             <select value={formData.bank || ''} onChange={e => setFormData({...formData, bank: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                                <option value="">Виберіть...</option><option value="Так">Так</option><option value="Ні">Ні</option>
                             </select>
                          ) : <p className="mt-1 font-semibold text-gray-800">{project.bank || 'Не вказано'}</p>}
                        </div>

                        <div>
                          <label className="text-sm font-medium text-gray-600">Пріоритет</label>
                          {isEditing ? (
                             <select value={formData.priority || 'medium'} onChange={e => setFormData({...formData, priority: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                                <option value="low">Низький</option><option value="medium">Середній</option><option value="high">Високий</option>
                             </select>
                          ) : <p className="mt-1 font-semibold text-gray-800">{project.priority === 'high' ? 'Високий' : project.priority === 'low' ? 'Низький' : 'Середній'}</p>}
                        </div>

                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-600">Примітки</label>
                          {isEditing ? <textarea rows="3" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 resize-none" /> : <p className="mt-1 text-gray-800">{project.notes || 'Немає'}</p>}
                        </div>
                      </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>

            {/* Financial Info (Accordion) */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm border border-green-100 overflow-hidden md:shadow-xl md:rounded-2xl">
               <div 
                 onClick={() => setIsFinanceOpen(!isFinanceOpen)}
                 className="p-6 flex justify-between items-center cursor-pointer hover:bg-emerald-100/50 transition-colors select-none"
               >
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <FaMoneyBillWave className="text-green-600" /> Фінанси
                  </h2>
                  {isFinanceOpen ? <FaChevronUp className="text-green-700"/> : <FaChevronDown className="text-green-700"/>}
               </div>

               <AnimatePresence>
                 {isFinanceOpen && (
                   <motion.div 
                     initial={{ height: 0, opacity: 0 }}
                     animate={{ height: "auto", opacity: 1 }}
                     exit={{ height: 0, opacity: 0 }}
                     className="px-6 pb-6"
                   >
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-green-200/50 pt-4">
                         <div><label className="text-sm font-medium text-gray-600">Загальна вартість</label>{isEditing ? <input type="number" step="0.01" value={formData.total_cost || ''} onChange={e => setFormData({...formData, total_cost: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 text-2xl font-bold text-gray-800">{formatCost(project.total_cost)}</p>}</div>
                         <div><label className="text-sm font-medium text-gray-600">Оплачено</label>{isEditing ? <input type="number" step="0.01" value={formData.paid_amount || ''} onChange={e => setFormData({...formData, paid_amount: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 text-2xl font-bold text-green-600">{formatCost(project.paid_amount)}</p>}</div>
                         <div className="md:col-span-2">
                            <div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-600">Прогрес</label><span className="text-lg font-bold text-gray-800">{paymentPercentage.toFixed(1)}%</span></div>
                            <div className="w-full h-6 bg-gray-200 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500" style={{ width: `${paymentPercentage}%` }}></div></div>
                            {project.total_cost > 0 && project.paid_amount < project.total_cost && <p className="text-sm text-gray-600 mt-2">Залишок: <span className="font-bold text-orange-600">${(project.total_cost - project.paid_amount).toLocaleString('en-US')}</span></p>}
                         </div>
                       </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>

          </div>

          {/* Right Column - Workflow */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm sticky top-24 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col md:bg-white/95 md:backdrop-blur-xl md:shadow-xl md:rounded-2xl">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><FaTools className="text-purple-600" /> Хід роботи</h2>
              
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-600 mb-2 block">Поточний етап</label>
                <select 
                  value={currentStage} 
                  onChange={e => setCurrentStage(e.target.value)} 
                  disabled={!isEditing}
                  className={`w-full border-2 border-indigo-300 rounded-lg px-3 py-2 font-semibold text-indigo-900 transition ${!isEditing ? 'opacity-70 bg-gray-100 cursor-not-allowed' : 'bg-indigo-50'}`}
                >
                  {WORKFLOW_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="space-y-2 overflow-y-auto pr-2 flex-grow">
                {WORKFLOW_STAGES.map((stage) => {
                  const StageIcon = stage.icon;
                  const stageData = workflowData[stage.value] || {};
                  const status = stageData.status || 'not_started';
                  const statusInfo = STAGE_STATUS_OPTIONS.find(s => s.value === status) || STAGE_STATUS_OPTIONS[0];
                  const StatusIcon = statusInfo.icon;
                  const isCurrentStage = currentStage === stage.value;
                  
                  return (
                    <div 
                      key={stage.value} 
                      ref={isCurrentStage ? activeStageRef : null}
                      className={`
                        relative p-3 rounded-lg border-l-4 transition-all duration-300
                        ${isCurrentStage 
                          ? 'border-l-indigo-500 bg-indigo-50 shadow-md transform scale-[1.02]' 
                          : 'border-l-gray-300 bg-white hover:bg-gray-50 opacity-80 border border-gray-100'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <StageIcon className={`mt-1 ${isCurrentStage ? 'text-indigo-600' : 'text-gray-400'}`} />
                          <div className="flex-1 min-w-0">
                            <h3 className={`font-semibold text-sm leading-tight ${isCurrentStage ? 'text-indigo-900' : 'text-gray-800'}`}>
                              {stage.label}
                            </h3>
                            {isCurrentStage && <span className="inline-block mt-1 px-2 py-0.5 bg-indigo-600 text-white text-xs rounded-full shadow-sm animate-pulse">Активний етап</span>}
                          </div>
                        </div>
                        <StatusIcon className={`${statusInfo.color} text-lg flex-shrink-0`} />
                      </div>
                      
                      {(isCurrentStage || stageData.status || stageData.comment) && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-2 space-y-2 overflow-hidden">
                          <select
                            value={status}
                            onChange={e => handleWorkflowStatusChange(stage.value, e.target.value)}
                            disabled={!isEditing}
                            className={`w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white ${!isEditing ? 'opacity-70 bg-gray-50 cursor-not-allowed' : ''}`}
                          >
                            {STAGE_STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                          
                          {stageData.comment && (
                            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-gray-700 italic">
                              <FaComment className="inline mr-1 text-blue-500" />
                              {stageData.comment}
                            </div>
                          )}
                          
                          {isEditing && (
                            <button
                              onClick={() => setCommentModal({ isOpen: true, stageValue: stage.value })}
                              className="w-full text-xs py-1 px-2 bg-white border border-gray-200 hover:bg-gray-50 rounded flex items-center justify-center gap-1 transition shadow-sm text-gray-600"
                            >
                              <FaComment /> {stageData.comment ? 'Редагувати' : 'Додати'} коментар
                            </button>
                          )}
                        </motion.div>
                      )}
                      
                      {stageData.updatedAt && <p className="text-[10px] text-gray-400 mt-2 text-right">Оновлено: {new Date(stageData.updatedAt).toLocaleDateString()}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}