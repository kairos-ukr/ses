import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaArrowLeft, FaSave, FaEdit, FaUsers, FaMapMarkerAlt,
  FaBolt, FaTools, FaMoneyBillWave, 
  FaCheckCircle, FaClock, FaExclamationTriangle, FaTimes, FaCheck, FaComment,
  FaRulerCombined, FaFileContract, FaFileSignature, FaWallet,
  FaShoppingCart, FaBoxOpen, FaShieldAlt, FaPlay, FaFlagCheckered,
  FaCalculator, FaCamera, FaPlug, FaHourglassHalf, FaSearch,
  FaFolderOpen, FaStickyNote, FaHashtag, FaBan, FaHourglass, FaSpinner,
  FaPhone, FaCity, FaGlobe, FaChevronDown, FaChevronUp, FaHandshake, FaUserTie,
  FaFileImport, FaWifi, FaCheckDouble, FaStepForward, FaCommentDots, FaPaperPlane
} from "react-icons/fa";

import { supabase } from "./supabaseClient";
import ObjectDocumentsModal from "./ObjectDocumentsModal";
import ProjectEquipmentModal from "./ProjectEquipmentModal";
import RoofMeasurementModal from "./RoofMeasurementModal";
import AdditionalInfoModal from "./AdditionalInfoModal"; // Імпорт модального вікна
import { useAuth } from "./AuthProvider";

const ALLOWED_COMPANIES = ['Кайрос', 'Розумне збереження енергії'];

const PROJECT_STATUS_LABELS = {
  planning: 'Планування',
  in_progress: 'Виконується',
  on_hold: 'Призупинено',
  completed: 'Завершено',
  cancelled: 'Скасовано'
};

// ... (STAGE_CONFIG та WORKFLOW_ORDER залишаються без змін) ...
const STAGE_CONFIG = {
  tech_review: {
    label: 'Тех. Огляд (заміри)',
    icon: FaSearch,
    options: [
      { value: 'waiting_client', label: 'Очікуємо від клієнта', icon: FaClock, color: 'text-orange-500' },
      { value: 'done_on_site', label: 'Виконали на виїзді', icon: FaMapMarkerAlt, color: 'text-blue-500' },
      { value: 'completed', label: 'Виконано', icon: FaCheckCircle, color: 'text-green-600' }
    ]
  },
  commercial_proposal: {
    label: 'Комерційна пропозиція',
    icon: FaFileContract,
    options: [
      { value: 'waiting', label: 'Очікуємо', icon: FaHourglassHalf, color: 'text-gray-400' },
      { value: 'created', label: 'Зроблено', icon: FaFileSignature, color: 'text-blue-500' },
      { value: 'approved', label: 'Погоджено', icon: FaCheckDouble, color: 'text-green-600' }
    ]
  },
  project_design: {
    label: 'Проект',
    icon: FaRulerCombined,
    options: [
      { value: 'waiting', label: 'Очікуємо', icon: FaHourglassHalf, color: 'text-gray-400' },
      { value: 'created', label: 'Зроблено', icon: FaEdit, color: 'text-blue-500' },
      { value: 'approved', label: 'Погоджено', icon: FaCheckDouble, color: 'text-green-600' }
    ]
  },
  advance_payment: {
    label: 'Аванс',
    icon: FaWallet,
    options: [
      { value: 'waiting', label: 'Очікуємо', icon: FaHourglassHalf, color: 'text-gray-400' },
      { value: 'received', label: 'Отримано', icon: FaCheckCircle, color: 'text-green-600' },
      { value: 'skipped', label: 'Пропущено', icon: FaStepForward, color: 'text-orange-500' }
    ]
  },
  equipment: {
    label: 'Обладнання',
    icon: FaShoppingCart,
    options: [
      { value: 'waiting', label: 'Не розпочато', icon: FaHourglassHalf, color: 'text-gray-400' },
      { value: 'in_progress', label: 'В роботі', icon: FaSpinner, color: 'text-blue-500' },
      { value: 'ordered', label: 'Замовлено', icon: FaShoppingCart, color: 'text-blue-500' },
      { value: 'arrived', label: 'Прибуло', icon: FaBoxOpen, color: 'text-green-600' }
    ]
  },
  complectation: {
    label: 'Комплектація',
    icon: FaBoxOpen,
    options: [
      { value: 'not_started', label: 'Не розпочато', icon: FaHourglass, color: 'text-gray-400' },
      { value: 'in_progress', label: 'В роботі', icon: FaSpinner, color: 'text-blue-500' },
      { value: 'completed', label: 'Зкомплектовано', icon: FaCheckCircle, color: 'text-green-600' }
    ]
  },
  installation: {
    label: 'Монтаж',
    icon: FaTools,
    options: [
      { value: 'waiting_start', label: 'Очікуємо старт', icon: FaHourglassHalf, color: 'text-gray-400' },
      { value: 'started', label: 'Розпочато', icon: FaPlay, color: 'text-blue-500' },
      { value: 'completed', label: 'Виконано', icon: FaFlagCheckered, color: 'text-green-600' }
    ]
  },
  grid_connection: {
    label: 'Заведення потужності',
    icon: FaBolt,
    options: [
      { value: 'waiting', label: 'Очікуємо', icon: FaHourglassHalf, color: 'text-gray-400' },
      { value: 'docs_submitted', label: 'Документи подані', icon: FaFileImport, color: 'text-blue-500' },
      { value: 'completed', label: 'Виконано', icon: FaCheckCircle, color: 'text-green-600' }
    ]
  },
  monitoring_setup: {
    label: 'Запуск та моніторинг',
    icon: FaCheckCircle,
    options: [
      { value: 'waiting', label: 'Очікуємо', icon: FaHourglassHalf, color: 'text-gray-400' },
      { value: 'launched', label: 'Станція запущена', icon: FaCheckCircle, color: 'text-green-600' },
      { value: 'monitoring_needed', label: 'Потрібне налаштування моніторингу', icon: FaWifi, color: 'text-orange-500' },
      { value: 'completed', label: 'Виконано', icon: FaFlagCheckered, color: 'text-green-600' }
    ]
  }
};

const WORKFLOW_ORDER = [
  'tech_review', 'commercial_proposal', 'project_design', 'advance_payment', 
  'equipment', 'complectation', 'installation', 'grid_connection', 'monitoring_setup'
];

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

const CommentModal = ({ isOpen, onClose, stageLabel, comment, onSave }) => {
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
            <h3 className="text-xl font-bold text-gray-800 mb-4">Коментар до етапу: {stageLabel}</h3>
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

const isDifferent = (val1, val2) => {
  if (!val1 && !val2) return false;
  return String(val1) !== String(val2);
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, tier } = useAuth();
  const canEdit = role === 'admin' || role === 'super_admin' || role === 'office' || (role === 'installer' && tier === 1);

  const activeStageRef = useRef(null);
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // Accordion states
  const [isObjectInfoOpen, setIsObjectInfoOpen] = useState(false);
  const [isFinanceOpen, setIsFinanceOpen] = useState(false);
  const [isAdditionalInfoOpen, setIsAdditionalInfoOpen] = useState(false); // <--- Для історії повідомлень
  
  const [formData, setFormData] = useState({});
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [currentUser, setCurrentUser] = useState(null); // <--- Поточний юзер для модалки
  
  // === STAGE STATES ===
  const [stagesData, setStagesData] = useState({}); 
  const [stageSearchTerms, setStageSearchTerms] = useState({});
  const [activeSearchStage, setActiveSearchStage] = useState(null);

  const [currentStage, setCurrentStage] = useState('tech_review');
  const [commentModal, setCommentModal] = useState({ isOpen: false, stageValue: null });
  
  // === MODAL STATES ===
  const [viewingDocs, setViewingDocs] = useState(false);
  const [viewingEquipment, setViewingEquipment] = useState(false);
  const [isRoofModalOpen, setIsRoofModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false); // <--- Для модалки додаткової інфо
  
  const [additionalInfo, setAdditionalInfo] = useState([]); // <--- Список повідомлень

  const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
  
  const showToast = useCallback((message, type = 'success') => 
    setToast({ isVisible: true, message, type }), []);
  const hideToast = useCallback(() => 
    setToast(prev => ({ ...prev, isVisible: false })), []);

  // === AUTO-SCROLL ===
  useEffect(() => {
    if (activeStageRef.current && !loading) {
      setTimeout(() => {
        activeStageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [loading, currentStage, isEditing]);

  // === IDENTIFY CURRENT USER ===
  useEffect(() => {
    const identifyUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
            const { data: emp } = await supabase.from('employees').select('*').eq('email', user.email).maybeSingle();
            if (emp) setCurrentUser(emp);
            else setCurrentUser({ name: user.email }); // Fallback якщо не знайдено в employees
        }
    };
    identifyUser();
  }, []);

  // === LOAD PROJECT DATA ===
  useEffect(() => {
    const loadProject = async () => {
      setLoading(true);
      try {
        // 1. Основні дані
        const { data, error } = await supabase
          .from('installations')
          .select(`
            *,
            client:clients!installations_client_id_fkey (
              custom_id, name, company_name, phone, oblast, populated_place, notes, 
              object_type, is_subcontract, contractor_company
            ),
            responsible_employee:employees!installations_responsible_emp_id_fkey (*),
            project_stages (
              id, stage_key, status, comment, responsible_emp_custom_id, updated_at
            )
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
        setCurrentStage(data.workflow_stage || 'tech_review');
        
        if (data.project_stages && data.project_stages.length > 0) {
           const stagesMap = data.project_stages.reduce((acc, stage) => {
             acc[stage.stage_key] = stage;
             return acc;
           }, {});
           setStagesData(stagesMap);
        } else {
           setStagesData({}); 
        }
        
        if (data.responsible_employee) {
          setEmployeeSearch(`${data.responsible_employee.name} (ID: ${data.responsible_employee.custom_id})`);
        }

        // 2. Завантаження додаткової інформації (історія повідомлень)
        const { data: infoData } = await supabase
            .from('project_additional_info')
            .select('*')
            .eq('installation_custom_id', id)
            .order('created_at', { ascending: false });
        
        setAdditionalInfo(infoData || []);
        
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

  useEffect(() => {
    if (employees.length > 0 && Object.keys(stagesData).length > 0) {
        const newTerms = {};
        WORKFLOW_ORDER.forEach(key => {
            const sData = stagesData[key];
            if (sData && sData.responsible_emp_custom_id) {
                const emp = employees.find(e => e.custom_id === sData.responsible_emp_custom_id);
                if (emp) newTerms[key] = `${emp.name} (ID: ${emp.custom_id})`;
            }
        });
        setStageSearchTerms(prev => ({...prev, ...newTerms}));
    }
  }, [employees, stagesData]);

  // === HANDLE CANCEL ===
  const handleCancel = () => {
    setIsEditing(false);
    setFormData(project);
    setCurrentStage(project.workflow_stage || 'tech_review');
    if (project.project_stages) {
       const stagesMap = project.project_stages.reduce((acc, stage) => {
         acc[stage.stage_key] = stage;
         return acc;
       }, {});
       setStagesData(stagesMap);
    }
    setEmployeeSearch(project.responsible_employee ? `${project.responsible_employee.name} (ID: ${project.responsible_employee.custom_id})` : '');
  };

  const handleSave = async () => {
    if (!canEdit) {
      showToast('У вас немає прав на редагування', 'error');
      return;
    }

    setSaving(true);
    try {
      const currentData = {
        ...formData,
        payment_status: updatePaymentStatus(formData.total_cost, formData.paid_amount),
      };

      const updates = {};
      const ignoredKeys = ['client', 'responsible_employee', 'project_stages', 'id', 'created_at', 'updated_at', 'client_id', 'workflow_stage']; 

      Object.keys(currentData).forEach(key => {
        if (ignoredKeys.includes(key)) return;

        const oldValue = project[key];
        const newValue = currentData[key];
        
        if (isDifferent(oldValue, newValue)) {
          updates[key] = newValue;
        }
      });

      updates.payment_status = currentData.payment_status;
      updates.workflow_stage = currentStage;
      updates.updated_at = new Date().toISOString();
      updates.topic_updated = true;
      
      if (Object.keys(updates).length > 0) {
          const { error: mainError } = await supabase
            .from('installations')
            .update(updates)
            .eq('custom_id', id);
          if (mainError) throw mainError;
      }

      const stagesPayload = [];
      
      Object.values(stagesData).forEach(stage => {
          const statusValue = stage.status || STAGE_CONFIG[stage.stage_key]?.options[0].value || 'not_started';

          const payload = {
              installation_custom_id: parseInt(id),
              stage_key: stage.stage_key,
              status: statusValue, 
              comment: stage.comment,
              responsible_emp_custom_id: stage.responsible_emp_custom_id || null,
              updated_at: new Date().toISOString()
          };
          
          if (stage.id) {
              payload.id = stage.id;
          }
          
          stagesPayload.push(payload);
      });

      WORKFLOW_ORDER.forEach(key => {
          if (!stagesData[key]) {
              stagesPayload.push({
                  installation_custom_id: parseInt(id),
                  stage_key: key,
                  status: STAGE_CONFIG[key].options[0].value, 
                  comment: null,
                  responsible_emp_custom_id: null,
                  updated_at: new Date().toISOString()
              })
          }
      });

      if (stagesPayload.length > 0) {
          const { error: stagesError } = await supabase
            .from('project_stages')
            .upsert(stagesPayload, { onConflict: 'installation_custom_id, stage_key' });
            
          if (stagesError) throw stagesError;
      }
      
      showToast('Зміни успішно збережено!', 'success');
      setIsEditing(false);
      window.location.reload();
      
    } catch (error) {
        console.error(error);
        showToast(`Помилка збереження: ${error.message}`, 'error');
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

  const handleStageChange = (stageKey, field, value) => {
      setStagesData(prev => ({
          ...prev,
          [stageKey]: {
              ...prev[stageKey],
              stage_key: stageKey,
              [field]: value
          }
      }));
  };

  const handleWorkflowComment = (stageKey, comment) => {
      handleStageChange(stageKey, 'comment', comment);
  };

  const getFilteredEmployeesForStage = (query) => {
      if (!query) return [];
      const lowerQ = query.toLowerCase();
      return employees.filter(emp => 
        emp.name?.toLowerCase().includes(lowerQ) || 
        emp.custom_id.toString().includes(lowerQ)
      );
  };

  const handleStageEmployeeSelect = (stageKey, emp) => {
      handleStageChange(stageKey, 'responsible_emp_custom_id', emp.custom_id);
      setStageSearchTerms(prev => ({
          ...prev,
          [stageKey]: `${emp.name} (ID: ${emp.custom_id})`
      }));
      setActiveSearchStage(null); 
  };

  const filteredEmployeesMain = employeeSearch ? employees.filter(emp =>
    emp.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    emp.custom_id.toString().includes(employeeSearch)
  ) : [];

  const handleMainEmployeeSelect = (employee) => {
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
  const paymentPercentage = (project.total_cost > 0 && project.paid_amount > 0) ? Math.min((project.paid_amount / project.total_cost) * 100, 100) : 0;

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
      
      <RoofMeasurementModal 
        isOpen={isRoofModalOpen} 
        onClose={() => setIsRoofModalOpen(false)} 
        objectNumber={project?.custom_id}
      />

      {/* --- МОДАЛКА ДЛЯ ДОДАТКОВОЇ ІНФОРМАЦІЇ --- */}
      <AdditionalInfoModal 
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        project={project}
        currentUser={currentUser} 
        showToast={showToast}
      />

      {commentModal.isOpen && (
        <CommentModal
          isOpen={commentModal.isOpen}
          onClose={() => setCommentModal({ isOpen: false, stageValue: null })}
          stageLabel={STAGE_CONFIG[commentModal.stageValue]?.label}
          comment={stagesData[commentModal.stageValue]?.comment || ''}
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
              {/* --- КНОПКА ДОДАТКОВОЇ ІНФОРМАЦІЇ (біля Редагувати) --- */}
              <button 
                onClick={() => setIsInfoModalOpen(true)} 
                className="bg-white border border-gray-300 text-indigo-600 p-2.5 rounded-lg hover:bg-indigo-50 transition shadow-sm" 
                title="Надіслати інформацію в чат"
              >
                 <FaCommentDots className="text-lg" />
              </button>

              {canEdit && (
                isEditing ? (
                  <>
                    <button onClick={handleCancel} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium text-sm text-gray-700">
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
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm md:bg-white/95 md:backdrop-blur-xl md:shadow-xl md:rounded-2xl relative overflow-hidden">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><FaUsers className="text-indigo-600" /> Інформація про клієнта</h2>
              {project.client?.is_subcontract && (
                <div className="absolute top-4 right-4 bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs font-bold border border-orange-200 flex items-center gap-1 shadow-sm">
                   <FaHandshake /> Підряд: {project.client.contractor_company}
                </div>
              )}
              {/* ... Вміст інформації про клієнта без змін ... */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaHashtag className="text-xs" /> ID клієнта</label><p className="mt-1 font-semibold text-gray-800">#{project.client?.custom_id}</p></div>
                {project.client?.company_name && (<div><label className="text-sm font-medium text-gray-600">Компанія / ФОП</label><p className="mt-1 font-semibold text-gray-800">{project.client.company_name}</p></div>)}
                <div><label className="text-sm font-medium text-gray-600">Контактна особа</label><p className="mt-1 font-semibold text-gray-800">{project.client?.name}</p></div>
                <div><label className="text-sm font-medium text-gray-600">Тип об'єкта клієнта</label><p className="mt-1 font-semibold text-gray-800">{project.client?.object_type || 'Не вказано'}</p></div>
                <div><label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaPhone className="text-xs" /> Телефон</label><p className="mt-1 font-semibold text-gray-800">{project.client?.phone || 'Не вказано'}</p></div>
                <div className="md:col-span-2"><label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaCity className="text-xs" /> Адреса</label><p className="mt-1 font-semibold text-gray-800">{project.client?.oblast && project.client?.populated_place ? `${project.client.oblast}, ${project.client.populated_place}` : 'Не вказано'}</p></div>
                {project.client?.notes && (<div className="md:col-span-2"><label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaStickyNote className="text-xs" /> Примітки</label><p className="mt-1 text-gray-700 bg-slate-50 p-3 rounded-lg border border-slate-200 text-sm italic">{project.client.notes}</p></div>)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <button onClick={() => setViewingDocs(true)} className="flex items-center justify-center gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition group md:bg-white/95 md:backdrop-blur-xl md:shadow-lg">
                  <div className="p-3 bg-indigo-100 rounded-full group-hover:bg-indigo-200 transition"><FaFolderOpen className="text-indigo-600 text-xl" /></div><span className="font-semibold text-gray-800">Документи</span>
               </button>
               <button onClick={() => setViewingEquipment(true)} className="flex items-center justify-center gap-3 p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition group md:bg-white/95 md:backdrop-blur-xl md:shadow-lg">
                  <div className="p-3 bg-green-100 rounded-full group-hover:bg-green-200 transition"><FaBoxOpen className="text-green-600 text-xl" /></div><span className="font-semibold text-gray-800">Посилки</span>
               </button>
            </div>

            {/* Object Info Accordion */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden md:bg-white/95 md:backdrop-blur-xl md:shadow-xl md:rounded-2xl">
               <div onClick={() => setIsObjectInfoOpen(!isObjectInfoOpen)} className="p-6 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors select-none">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><FaBolt className="text-yellow-500" /> Інформація про об'єкт</h2>
                  {isObjectInfoOpen ? <FaChevronUp className="text-gray-400"/> : <FaChevronDown className="text-gray-400"/>}
               </div>
               <AnimatePresence>
                 {isObjectInfoOpen && (
                   <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 pb-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                        {/* ... Вміст форми без змін ... */}
                        <div className="md:col-span-2">
                          <label className="text-sm font-medium text-gray-600">Загальний статус</label>
                          {isEditing ? (
                             <select value={formData.status || 'planning'} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white font-medium text-indigo-900">
                                <option value="planning">Планування</option><option value="in_progress">Виконується</option><option value="on_hold">Призупинено</option><option value="completed">Завершено</option><option value="cancelled">Скасовано</option>
                             </select>
                          ) : (
                             <p className="mt-1 font-bold text-indigo-700 bg-indigo-50 inline-block px-3 py-1 rounded-lg">{PROJECT_STATUS_LABELS[project.status] || project.status || 'Не визначено'}</p>
                          )}
                        </div>
                        <div><label className="text-sm font-medium text-gray-600">Назва</label>{isEditing ? <input type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{project.name || 'Не вказано'}</p>}</div>
                        <div><label className="text-sm font-medium text-gray-600">Потужність (кВт)</label>{isEditing ? <input type="number" step="0.1" value={formData.capacity_kw || ''} onChange={e => setFormData({...formData, capacity_kw: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{project.capacity_kw ? `${project.capacity_kw} кВт` : 'Не вказано'}</p>}</div>
                        <div><label className="text-sm font-medium text-gray-600">Тип станції</label>{isEditing ? <select value={formData.station_type || ''} onChange={e => setFormData({...formData, station_type: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"><option value="">Виберіть...</option><option value="Мережева">Мережева</option><option value="Автономна">Автономна</option><option value="Гібридна">Гібридна</option></select> : <p className="mt-1 font-semibold text-gray-800">{project.station_type || 'Не вказано'}</p>}</div>
                        
                        <div>
                            <label className="text-sm font-medium text-gray-600">Кількість фаз</label>
                            {isEditing ? (
                                <select value={formData.quant_phase || ''} onChange={e => setFormData({...formData, quant_phase: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white">
                                    <option value="">Виберіть...</option>
                                    <option value="1">1 фаза</option>
                                    <option value="3">3 фази</option>
                                </select>
                            ) : (
                                <p className="mt-1 font-semibold text-gray-800">{project.quant_phase ? `${project.quant_phase} ${project.quant_phase === '1' ? 'фаза' : 'фази'}` : 'Не вказано'}</p>
                            )}
                        </div>

                        <div><label className="text-sm font-medium text-gray-600">Тип монтажу</label>{isEditing ? <select value={formData.mount_type || ''} onChange={e => setFormData({...formData, mount_type: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"><option value="">Виберіть...</option><option value="Дахове кріплення (Скатний дах)">Дахове кріплення (Скатний дах)</option><option value="Дахове кріплення (Плоский дах)">Дахове кріплення (Плоский дах)</option><option value="Наземне кріплення">Наземне кріплення</option><option value="Трекерна система">Трекерна система</option><option value="Дах/Земля">Дах/Земля</option><option value="Електромонтаж">Електромонтаж</option><option value="Інше">Інше</option></select> : <p className="mt-1 font-semibold text-gray-800">{project.mount_type || 'Не вказано'}</p>}</div>
                        
                        <div className="relative">
                          <label className="text-sm font-medium text-gray-600">Головний відповідальний</label>
                          {isEditing ? (
                            <>
                              <input type="text" value={employeeSearch} onChange={e => { setEmployeeSearch(e.target.value); if (formData.responsible_emp_id) setFormData({...formData, responsible_emp_id: ''}); }} placeholder="Пошук працівника..." className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" />
                              {employeeSearch && filteredEmployeesMain.length > 0 && !formData.responsible_emp_id && (
                                <div className="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
                                  {filteredEmployeesMain.map(emp => (
                                    <button key={emp.custom_id} type="button" onClick={() => handleMainEmployeeSelect(emp)} className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b">
                                        {emp.name} <span className="text-xs text-gray-500">(ID: {emp.custom_id})</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : <p className="mt-1 font-semibold text-gray-800">{project.responsible_employee?.name || 'Не призначено'} {project.responsible_employee?.custom_id && <span className="text-gray-500 ml-1 font-normal">(ID: {project.responsible_employee.custom_id})</span>}</p>}
                        </div>

                        <div className="md:col-span-2">
                           <label className="text-sm font-medium text-gray-600 flex items-center gap-1"><FaGlobe className="text-xs" /> Локація</label>
                           {isEditing ? (
                             <div className="mt-1">
                                 <input type="url" placeholder="GPS посилання" value={formData.gps_link || ''} onChange={e => setFormData({...formData, gps_link: e.target.value})} className="w-full border border-gray-300 rounded-lg px-3 py-2" />
                             </div>
                           ) : (
                             <div className="mt-1">
                               {locationLink ? <a href={locationLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 underline font-semibold"><FaMapMarkerAlt /> Переглянути на мапі</a> : <p className="font-semibold text-gray-800">Не вказано</p>}
                             </div>
                           )}
                        </div>

                        <div className="md:col-span-2 grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-sm font-medium text-gray-600">Дата початку</label>
                                {isEditing ? <input type="date" value={formData.start_date || ''} onChange={e => setFormData({...formData, start_date: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{formatDate(project.start_date)}</p>}
                            </div>
                            <div>
                                <label className="text-sm font-medium text-gray-600">Дата завершення</label>
                                {isEditing ? <input type="date" value={formData.end_date || ''} onChange={e => setFormData({...formData, end_date: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 font-semibold text-gray-800">{formatDate(project.end_date)}</p>}
                            </div>
                        </div>

                        <div><label className="text-sm font-medium text-gray-600">Виконуюча компанія</label>{isEditing ? <select value={formData.working_company || ''} onChange={e => setFormData({...formData, working_company: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"><option value="">Виберіть...</option>{ALLOWED_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}</select> : <p className="mt-1 font-semibold text-gray-800">{project.working_company || 'Не вказано'}</p>}</div>
                        <div><label className="text-sm font-medium text-gray-600">Банк</label>{isEditing ? <select value={formData.bank || ''} onChange={e => setFormData({...formData, bank: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"><option value="">Виберіть...</option><option value="Так">Так</option><option value="Ні">Ні</option></select> : <p className="mt-1 font-semibold text-gray-800">{project.bank || 'Не вказано'}</p>}</div>
                        <div><label className="text-sm font-medium text-gray-600">Пріоритет</label>{isEditing ? <select value={formData.priority || 'medium'} onChange={e => setFormData({...formData, priority: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 bg-white"><option value="low">Низький</option><option value="medium">Середній</option><option value="high">Високий</option></select> : <p className="mt-1 font-semibold text-gray-800">{project.priority === 'high' ? 'Високий' : project.priority === 'low' ? 'Низький' : 'Середній'}</p>}</div>
                        <div className="md:col-span-2"><label className="text-sm font-medium text-gray-600">Примітки</label>{isEditing ? <textarea rows="3" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2 resize-none" /> : <p className="mt-1 text-gray-800">{project.notes || 'Немає'}</p>}</div>
                      </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>

            {/* Finance Info */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm border border-green-100 overflow-hidden md:shadow-xl md:rounded-2xl">
               <div onClick={() => setIsFinanceOpen(!isFinanceOpen)} className="p-6 flex justify-between items-center cursor-pointer hover:bg-emerald-100/50 transition-colors select-none">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><FaMoneyBillWave className="text-green-600" /> Фінанси</h2>
                  {isFinanceOpen ? <FaChevronUp className="text-green-700"/> : <FaChevronDown className="text-green-700"/>}
               </div>
               <AnimatePresence>
                 {isFinanceOpen && (
                   <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 pb-6">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-green-200/50 pt-4">
                         <div><label className="text-sm font-medium text-gray-600">Загальна вартість</label>{isEditing ? <input type="number" step="0.01" value={formData.total_cost || ''} onChange={e => setFormData({...formData, total_cost: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 text-2xl font-bold text-gray-800">{formatCost(project.total_cost)}</p>}</div>
                         <div><label className="text-sm font-medium text-gray-600">Оплачено</label>{isEditing ? <input type="number" step="0.01" value={formData.paid_amount || ''} onChange={e => setFormData({...formData, paid_amount: e.target.value})} className="w-full mt-1 border border-gray-300 rounded-lg px-3 py-2" /> : <p className="mt-1 text-2xl font-bold text-green-600">{formatCost(project.paid_amount)}</p>}</div>
                         <div className="md:col-span-2">
                           <div className="flex justify-between mb-2"><label className="text-sm font-medium text-gray-600">Прогрес</label><span className="text-lg font-bold text-gray-800">{paymentPercentage.toFixed(1)}%</span></div>
                           <div className="w-full h-6 bg-gray-200 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-green-500 to-emerald-500 transition-all duration-500" style={{ width: `${paymentPercentage}%` }}></div></div>
                         </div>
                       </div>
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>

            {/* --- БЛОК ІСТОРІЇ ДОДАТКОВОЇ ІНФОРМАЦІЇ --- */}
            {additionalInfo.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden md:bg-white/95 md:backdrop-blur-xl md:shadow-xl md:rounded-2xl">
                    <div onClick={() => setIsAdditionalInfoOpen(!isAdditionalInfoOpen)} className="p-6 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors select-none">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <FaCommentDots className="text-indigo-500" /> Додаткова інформація ({additionalInfo.length})
                        </h2>
                        {isAdditionalInfoOpen ? <FaChevronUp className="text-gray-400"/> : <FaChevronDown className="text-gray-400"/>}
                    </div>
                    <AnimatePresence>
                        {isAdditionalInfoOpen && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 pb-6">
                                <div className="space-y-4 border-t pt-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                                    {additionalInfo.map((info) => (
                                        <div key={info.id} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="font-bold text-sm text-gray-700">{info.author_name || 'Невідомо'}</span>
                                                <span className="text-xs text-gray-400">{new Date(info.created_at).toLocaleString('uk-UA')}</span>
                                            </div>
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap">{info.message_text}</p>
                                            <div className="mt-2 flex justify-end">
                                                {info.is_sent_to_telegram ? (
                                                    <span className="text-[10px] text-green-600 flex items-center gap-1"><FaCheckCircle/> Надіслано в ТГ</span>
                                                ) : (
                                                    <span className="text-[10px] text-gray-400 flex items-center gap-1"><FaClock/> Очікує відправки</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}

          </div>

          {/* Right Column - Workflow */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm sticky top-24 max-h-[calc(100vh-120px)] overflow-hidden flex flex-col md:bg-white/95 md:backdrop-blur-xl md:shadow-xl md:rounded-2xl">
              <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2"><FaTools className="text-purple-600" /> Хід роботи</h2>
              
              <div className="mb-4">
                <label className="text-sm font-medium text-gray-600 mb-2 block">Поточний активний етап</label>
                <select 
                  value={currentStage} 
                  onChange={e => setCurrentStage(e.target.value)} 
                  disabled={!isEditing}
                  className={`w-full border-2 border-indigo-300 rounded-lg px-3 py-2 font-semibold text-indigo-900 transition ${!isEditing ? 'opacity-70 bg-gray-100 cursor-not-allowed' : 'bg-indigo-50'}`}
                >
                  {WORKFLOW_ORDER.map(key => (
                    <option key={key} value={key}>{STAGE_CONFIG[key].label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 overflow-y-auto pr-2 flex-grow custom-scrollbar pb-10">
                {/* ... Workflow items ... */}
                {WORKFLOW_ORDER.map((stageKey) => {
                  const stageConfig = STAGE_CONFIG[stageKey];
                  const StageIcon = stageConfig.icon;
                  const stageData = stagesData[stageKey] || {};
                  const statusKey = stageData.status;
                  const statusInfo = stageConfig.options.find(opt => opt.value === statusKey) || stageConfig.options[0];
                  const StatusIcon = statusInfo.icon;
                  const isCurrentStage = currentStage === stageKey;
                  const responsibleId = stageData.responsible_emp_custom_id;
                  const responsiblePerson = employees.find(e => e.custom_id === responsibleId);
                  const searchTerm = stageSearchTerms[stageKey] || '';
                  const filteredEmps = getFilteredEmployeesForStage(searchTerm);
                  const isSearching = activeSearchStage === stageKey;

                  const showDetails = isCurrentStage || isEditing || (statusKey && statusKey !== stageConfig.options[0].value) || stageData.comment || responsibleId || stageData.updatedAt;

                  return (
                    <div 
                      key={stageKey} 
                      ref={isCurrentStage ? activeStageRef : null}
                      className={`
                        relative p-3 rounded-xl border transition-all duration-500 w-full min-w-0
                        ${isCurrentStage 
                          ? 'border-2 border-indigo-600 bg-indigo-50 shadow-md z-10' 
                          : 'border-gray-200 bg-white hover:border-gray-300 opacity-90'
                        }
                      `}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`p-2 rounded-full flex-shrink-0 ${isCurrentStage ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                              <StageIcon className="text-lg" />
                          </div>
                          <div className="flex-1 min-w-0 pt-1">
                            <h3 className={`font-bold text-sm leading-tight truncate ${isCurrentStage ? 'text-indigo-900' : 'text-gray-800'}`}>
                              {stageConfig.label}
                            </h3>
                            {isCurrentStage && (
                                <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm animate-pulse">
                                    Поточний етап
                                </span>
                            )}
                          </div>
                        </div>
                        {!isEditing && <StatusIcon className={`${statusInfo.color} text-xl flex-shrink-0 mt-2`} />}
                      </div>
                      
                      {showDetails && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-3 space-y-3 overflow-visible border-t border-gray-200/60 pt-3">
                          
                          {stageKey === 'tech_review' && (isCurrentStage || isEditing) && (
                              <button
                                onClick={() => setIsRoofModalOpen(true)}
                                className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 py-2 rounded-lg transition-all font-bold text-xs group"
                              >
                                  <FaRulerCombined className="text-blue-600" />
                                  Провести заміри
                              </button>
                          )}

                          <div className="flex items-center gap-2">
                              {isEditing ? (
                                <>
                                  <span className="text-[10px] text-gray-500 uppercase font-bold w-16 flex-shrink-0">Статус:</span>
                                  <select
                                    value={statusKey || stageConfig.options[0].value}
                                    onChange={e => handleStageChange(stageKey, 'status', e.target.value)}
                                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:ring-2 focus:ring-indigo-500 outline-none w-full"
                                  >
                                    {stageConfig.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                  </select>
                                </>
                              ) : (
                                <div className="flex items-center gap-2 w-full">
                                   <StatusIcon className={`${statusInfo.color} text-sm`} />
                                   <span className={`text-xs font-semibold ${statusInfo.color}`}>{statusInfo.label}</span>
                                </div>
                              )}
                          </div>

                          {(isEditing || responsiblePerson) && (
                            <div className="flex items-center gap-2 relative">
                                {isEditing ? (
                                    <>
                                      <span className="text-[10px] text-gray-500 uppercase font-bold w-16 flex-shrink-0">Відпов.:</span>
                                      <div className="flex-1 relative min-w-0">
                                          <input 
                                              type="text"
                                              placeholder="Пошук..."
                                              value={stageSearchTerms[stageKey] || ''}
                                              onFocus={() => setActiveSearchStage(stageKey)}
                                              onChange={e => {
                                                  setStageSearchTerms({...stageSearchTerms, [stageKey]: e.target.value});
                                                  if (stageData.responsible_emp_custom_id) {
                                                      handleStageChange(stageKey, 'responsible_emp_custom_id', null);
                                                  }
                                              }}
                                              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                                          />
                                          {isSearching && filteredEmps.length > 0 && !stageData.responsible_emp_custom_id && (
                                              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-b-lg shadow-xl z-50 max-h-32 overflow-y-auto mt-1">
                                                  {filteredEmps.map(emp => (
                                                      <div 
                                                          key={emp.custom_id}
                                                          onClick={() => handleStageEmployeeSelect(stageKey, emp)}
                                                          className="px-3 py-2 hover:bg-indigo-50 cursor-pointer border-b last:border-0 text-xs text-gray-700"
                                                      >
                                                          {emp.name} <span className="text-gray-400 text-[10px]">(ID:{emp.custom_id})</span>
                                                      </div>
                                                  ))}
                                              </div>
                                          )}
                                          {isSearching && filteredEmps.length === 0 && stageSearchTerms[stageKey] && !stageData.responsible_emp_custom_id && (
                                              <div className="absolute top-full left-0 right-0 bg-white border p-2 text-xs text-gray-500 z-50 shadow-lg">Не знайдено</div>
                                          )}
                                      </div>
                                    </>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded border border-gray-100 w-full">
                                        <FaUserTie className="text-gray-400"/> 
                                        <span className="font-medium truncate">{responsiblePerson.name}</span>
                                    </div>
                                )}
                            </div>
                          )}
                          
                          {stageData.comment && (
                            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 text-xs text-gray-700">
                              <FaComment className="inline mr-1.5 text-blue-500 mb-0.5" />
                              <span className="italic">{stageData.comment}</span>
                            </div>
                          )}
                          
                          {isEditing && (
                            <button
                              onClick={() => setCommentModal({ isOpen: true, stageValue: stageKey })}
                              className="w-full text-xs py-1.5 px-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg flex items-center justify-center gap-1.5 transition shadow-sm text-gray-600 font-medium"
                            >
                              <FaComment /> {stageData.comment ? 'Редагувати' : 'Додати'} коментар
                            </button>
                          )}
                        </motion.div>
                      )}
                      
                      {stageData.updatedAt && (
                        <div className="flex justify-end mt-2">
                           <p className="text-[10px] text-gray-400 font-medium">
                             Оновлено: {new Date(stageData.updatedAt).toLocaleDateString('uk-UA')}
                           </p>
                        </div>
                      )}
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