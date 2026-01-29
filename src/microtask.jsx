import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTasks, FaPlus, FaCalendarAlt, FaTrash, FaEdit, 
  FaCheck, FaClock, FaTimes, FaSearch, 
  FaSortAmountDown, FaSortAmountUp, 
  FaUserTie, FaLink,
  FaChevronDown, FaExclamationTriangle,
  FaUserEdit, FaFire 
} from 'react-icons/fa';
import { supabase } from "./supabaseClient";
import Layout from "./Layout";
import { useAuth } from "./AuthProvider";

// --- КОМПОНЕНТИ UI ---

const StatusIcon = ({ status, className = '' }) => {
  const icons = {
    'нове': <FaPlus className={`text-amber-500 ${className}`} />,
    'в процесі': <FaClock className={`text-blue-500 ${className}`} />,
    'виконано': <FaCheck className={`text-emerald-500 ${className}`} />,
    'скасовано': <FaTimes className={`text-slate-400 ${className}`} />,
    'прострочено': <FaFire className={`text-red-500 ${className}`} />,
  };
  return icons[status] || <FaTasks className={`text-slate-500 ${className}`} />;
};

const StatusBadge = ({ status }) => {
  const colors = {
    'виконано': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'в процесі': 'bg-blue-100 text-blue-800 border-blue-200',
    'нове': 'bg-amber-100 text-amber-800 border-amber-200',
    'скасовано': 'bg-slate-100 text-slate-600 border-slate-200',
    'default': 'bg-slate-100 text-slate-800 border-slate-200'
  };
  return (<span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${colors[status] || colors.default}`}>{status}</span>);
};

// --- ДОПОМІЖНІ КОМПОНЕНТИ ---

const LoadingScreen = () => (
    <div className="flex-1 flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-sm mb-4 animate-pulse mx-auto border border-indigo-100">
                <FaTasks className="text-3xl" />
            </div>
            <p className="text-slate-500 font-medium">Завантаження задач...</p>
        </div>
    </div>
);

const FilterCards = ({ tasks, filter, setFilter }) => {
  const categories = [
      { id: 'всі', label: 'Всі', color: 'indigo', icon: FaTasks },
      { id: 'нове', label: 'Нові', color: 'amber', icon: FaPlus },
      { id: 'в процесі', label: 'В роботі', color: 'blue', icon: FaClock },
      { id: 'прострочено', label: 'Горять', color: 'red', icon: FaFire },
      { id: 'виконано', label: 'Готово', color: 'emerald', icon: FaCheck },
      { id: 'скасовано', label: 'Скасовано', color: 'slate', icon: FaTimes },
  ];

  const getCount = (catId) => {
      if (catId === 'всі') return tasks.length;
      if (catId === 'прострочено') {
          const today = new Date().setHours(0,0,0,0);
          return tasks.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== 'виконано' && t.status !== 'скасовано').length;
      }
      return tasks.filter(t => t.status === catId).length;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {categories.map(cat => {
            const count = getCount(cat.id);
            const isActive = filter === cat.id;
            
            const colorStyles = {
                indigo:  isActive ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-l-indigo-500 hover:bg-indigo-50/50',
                amber:   isActive ? 'bg-amber-50 border-amber-500 text-amber-700' : 'border-l-amber-500 hover:bg-amber-50/50',
                blue:    isActive ? 'bg-blue-50 border-blue-500 text-blue-700' : 'border-l-blue-500 hover:bg-blue-50/50',
                red:     isActive ? 'bg-red-50 border-red-500 text-red-700' : 'border-l-red-500 hover:bg-red-50/50',
                emerald: isActive ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'border-l-emerald-500 hover:bg-emerald-50/50',
                slate:   isActive ? 'bg-slate-100 border-slate-500 text-slate-700' : 'border-l-slate-400 hover:bg-slate-50',
            };

            const baseStyle = colorStyles[cat.color];

            return (
                <div 
                    key={cat.id} 
                    onClick={() => setFilter(cat.id)} 
                    className={`
                        relative overflow-hidden cursor-pointer rounded-xl p-3 sm:p-4 border shadow-sm transition-all duration-200 active:scale-95
                        bg-white border-slate-100 border-l-4 ${baseStyle}
                        ${isActive ? 'shadow-md ring-1 ring-black/5' : ''}
                    `}
                >
                    <cat.icon className={`absolute -right-2 -bottom-2 text-4xl opacity-10 ${isActive ? 'scale-110' : 'scale-100'}`} />
                    <div className="relative z-10">
                        <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">{cat.label}</p>
                        <p className="text-2xl font-extrabold">{count}</p>
                    </div>
                </div>
            );
        })}
    </div>
  );
};

// 2. ОНОВЛЕНИЙ TASK CARD З ВІДОБРАЖЕННЯМ ДАТИ ВИКОНАННЯ
const TaskCard = ({ task, employees, onEdit, onDelete, onUpdateStatus, formatDateTime, formatDate, isOverdue, canEdit, canDelete, canComplete }) => {
    const creator = employees.find(e => e.email === task.creator_email);
    const creatorName = creator ? creator.name : task.creator_email;
    const assignee = employees.find(e => e.custom_id === task.assigned_to);
    const assigneeName = assignee ? assignee.name : null;

    return (
        <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="group bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all flex flex-col md:flex-row overflow-hidden">
            <div className="p-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                     <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded text-xs border border-slate-200">#{task.custom_id}</span>
                        <StatusBadge status={task.status} />
                     </div>
                     
                     {/* --- МОБІЛЬНІ КНОПКИ --- */}
                     <div className="flex md:hidden items-center gap-2">
                        {task.status !== 'виконано' && canComplete && (
                            <button onClick={() => onUpdateStatus(task.custom_id, 'виконано')} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg"><FaCheck size={14}/></button>
                        )}
                        {canEdit && (
                            <button onClick={() => onEdit(task)} className="p-2 text-blue-600 bg-blue-50 rounded-lg"><FaEdit size={14}/></button>
                        )}
                     </div>
                </div>
                
                <p className="font-bold text-slate-800 text-lg mb-3 leading-snug">{task.task_text}</p>
                
                {task.installation && (
                    <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100">
                        <FaLink size={10}/><span>{task.installation.name} <span className="opacity-70">#{task.installation.custom_id}</span></span>
                    </div>
                )}

                <div className="flex flex-wrap gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3 mt-1">
                    <div className="flex items-center gap-1.5">
                        <FaClock className="text-slate-400"/>
                        <span>Створено: <span className="font-medium text-slate-700">{formatDateTime(task.created_at)}</span></span>
                    </div>
                    {task.due_date && (
                        <div className={`flex items-center gap-1.5 ${isOverdue(task.due_date, task.status) ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded font-bold' : ''}`}>
                            {isOverdue(task.due_date, task.status) ? <FaFire className="text-red-500"/> : <FaCalendarAlt className="text-slate-400"/>}
                            <span>Дедлайн: <span className="font-medium text-slate-700">{formatDate(task.due_date)}</span></span>
                        </div>
                    )}
                    
                    {/* НОВЕ: ВІДОБРАЖЕННЯ ДАТИ ВИКОНАННЯ */}
                    {task.data_complete && task.status === 'виконано' && (
                        <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                            <FaCheck className="text-emerald-500"/>
                            <span>Виконано: <span className="font-medium text-emerald-700">{formatDateTime(task.data_complete)}</span></span>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-slate-50/50 p-4 border-t md:border-t-0 md:border-l border-slate-200 w-full md:w-64 flex flex-col justify-center gap-3">
                <div className="flex items-start gap-2">
                    <div className="mt-0.5 p-1.5 bg-white rounded-full shadow-sm text-slate-400 border border-slate-100"><FaUserEdit size={10}/></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Від кого</p>
                        <p className="text-xs font-bold text-slate-700">{creatorName || 'Невідомо'}</p>
                    </div>
                </div>
                
                <div className="flex items-start gap-2">
                    <div className={`mt-0.5 p-1.5 rounded-full shadow-sm border ${assigneeName ? 'bg-indigo-100 text-indigo-600 border-indigo-200' : 'bg-white text-slate-300 border-slate-100'}`}><FaUserTie size={10}/></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Для кого</p>
                        <p className={`text-xs font-bold ${assigneeName ? 'text-indigo-700' : 'text-slate-400 italic'}`}>{assigneeName || 'Не призначено'}</p>
                    </div>
                </div>

                {/* --- ДЕСКТОПНІ КНОПКИ --- */}
                <div className="hidden md:flex items-center justify-end gap-2 mt-auto pt-2">
                    {task.status !== 'виконано' && canComplete && (
                        <button onClick={() => onUpdateStatus(task.custom_id, 'виконано')} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-transparent hover:border-emerald-200" title="Виконано"><FaCheck /></button>
                    )}
                    {canEdit && (
                        <button onClick={() => onEdit(task)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors border border-transparent hover:border-blue-200" title="Редагувати"><FaEdit /></button>
                    )}
                    {canDelete && (
                        <button onClick={() => onDelete(task.custom_id)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors border border-transparent hover:border-red-200" title="Видалити"><FaTrash /></button>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

const InstallationSelector = ({ installations, selectedId, onChange }) => { 
    const [searchTerm, setSearchTerm] = useState(''); 
    const [isOpen, setIsOpen] = useState(false); 
    const selectedInstallationName = useMemo(() => installations.find(i => i.id === selectedId)?.name || 'Не вибрано', [selectedId, installations]); 
    const filteredInstallations = useMemo(() => { 
        if (!searchTerm) return installations; 
        const lowerTerm = searchTerm.toLowerCase(); 
        return installations.filter(inst => inst.name.toLowerCase().includes(lowerTerm) || inst.custom_id.toString().includes(lowerTerm)); 
    }, [searchTerm, installations]); 
    
    return (
        <div className="relative">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full border border-slate-300 rounded-xl p-3 text-left bg-white flex justify-between items-center text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <span className={!selectedId ? "text-slate-500" : ""}>{selectedInstallationName}</span>
                <FaChevronDown className={`transition-transform text-slate-400 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="Пошук..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
                            </div>
                        </div>
                        <ul>
                            <li onClick={() => { onChange(''); setIsOpen(false); }} className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-500 italic">Не вибрано</li>
                            {filteredInstallations.map(inst => (
                                <li key={inst.id} onClick={() => { onChange(inst.id); setIsOpen(false); }} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm border-b border-slate-50 last:border-0">
                                    {inst.name} <span className="text-slate-400 text-xs">(#{inst.custom_id})</span>
                                </li>
                            ))}
                            {filteredInstallations.length === 0 && <li className="px-4 py-3 text-sm text-slate-400 text-center">Нічого не знайдено</li>}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    ); 
};

const EmployeeSelector = ({ employees, selectedCustomId, onChange }) => {
    const [searchTerm, setSearchTerm] = useState(''); 
    const [isOpen, setIsOpen] = useState(false);
    
    const selectedEmployee = useMemo(() => employees.find(e => e.custom_id === selectedCustomId), [selectedCustomId, employees]);
    const selectedEmployeeName = selectedEmployee ? selectedEmployee.name : 'Не призначено';

    const filteredEmployees = useMemo(() => { 
        if (!searchTerm) return employees; 
        const lowerTerm = searchTerm.toLowerCase(); 
        return employees.filter(emp => emp.name.toLowerCase().includes(lowerTerm) || emp.custom_id.toString().includes(lowerTerm)); 
    }, [searchTerm, employees]);

    return (
        <div className="relative">
            <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full border border-slate-300 rounded-xl p-3 text-left bg-white flex justify-between items-center text-sm outline-none focus:ring-2 focus:ring-indigo-500">
                <span className={!selectedCustomId ? "text-slate-500" : ""}>{selectedEmployeeName}</span>
                <FaChevronDown className={`transition-transform text-slate-400 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="Ім'я або ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" autoFocus />
                            </div>
                        </div>
                        <ul>
                            <li onClick={() => { onChange(''); setIsOpen(false); }} className="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm text-slate-500 italic">Не призначено</li>
                            {filteredEmployees.map(emp => (
                                <li key={emp.id} onClick={() => { onChange(emp.custom_id); setIsOpen(false); }} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm border-b border-slate-50 last:border-0">
                                    {emp.name} <span className="text-slate-400 text-xs">(ID: {emp.custom_id})</span>
                                </li>
                            ))}
                            {filteredEmployees.length === 0 && <li className="px-4 py-3 text-sm text-slate-400 text-center">Нічого не знайдено</li>}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

const formatDateForInput = (date) => { if (!date) return ''; const d = new Date(date); const localDate = new Date(d.getTime() + d.getTimezoneOffset() * 60000); return localDate.toISOString().split('T')[0]; };

const TaskModal = ({ isOpen, onClose, onSubmit, task, installations, employees, submitting }) => {
  const [formData, setFormData] = useState({ task_text: '', due_date: '', status: 'нове', installation_id: '', assigned_to: '' });
  
  useEffect(() => { 
      if (isOpen) { 
          if (task) { 
              setFormData({ 
                  task_text: task.task_text || '', 
                  due_date: task.due_date ? formatDateForInput(task.due_date) : '', 
                  status: task.status || 'нове', 
                  installation_id: task.installation_id || '',
                  assigned_to: task.assigned_to || '' 
              }); 
          } else { 
              setFormData({ task_text: '', due_date: '', status: 'нове', installation_id: '', assigned_to: '' }); 
          } 
      } 
  }, [task, isOpen]);
  
  const handleChange = (e) => { const { name, value } = e.target; setFormData(p => ({ ...p, [name]: value })); };
  const handleInstallationChange = (id) => setFormData(p => ({ ...p, installation_id: id }));
  const handleAssigneeChange = (customId) => setFormData(p => ({ ...p, assigned_to: customId })); 

  const handleSubmit = (e) => { e.preventDefault(); if (formData.task_text.trim()) { onSubmit(formData); } };
  
  return (<AnimatePresence>{isOpen && (<motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-xl shadow-2xl relative my-8" initial={{ scale: 0.95, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, y: 20, opacity: 0 }} onClick={e => e.stopPropagation()}><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-slate-800">{task ? 'Редагувати задачу' : 'Створити задачу'}</h2><button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><FaTimes /></button></div><form onSubmit={handleSubmit} className="space-y-5">
      
      <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Опис задачі <span className="text-red-500">*</span></label><textarea name="task_text" value={formData.task_text} onChange={handleChange} rows="4" required className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" placeholder="Що треба зробити?"/></div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Прив'язати до об'єкта</label><InstallationSelector installations={installations} selectedId={formData.installation_id} onChange={handleInstallationChange}/></div>
          <div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Виконавець</label><EmployeeSelector employees={employees} selectedCustomId={formData.assigned_to} onChange={handleAssigneeChange} /></div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5"><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Дедлайн</label><input type="date" name="due_date" value={formData.due_date} onChange={handleChange} className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none" /></div><div><label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Статус</label><select name="status" value={formData.status} onChange={handleChange} className="w-full border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 bg-white outline-none"><option value="нове">Нове</option><option value="в процесі">В процесі</option><option value="виконано">Виконано</option>{task && <option value="скасовано">Скасовано</option>}</select></div></div><div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-4"><button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-all">Скасувати</button><button type="submit" disabled={submitting} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-60">{submitting ? 'Збереження...' : (task ? 'Оновити' : 'Створити')}</button></div></form></motion.div></motion.div>)}</AnimatePresence>);
};

const Notification = ({ message, type, onClose }) => { const isError = type === 'error'; return (<motion.div layout initial={{ opacity: 0, y: 50, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.9 }} className={`fixed top-20 right-5 z-[100] flex items-center p-4 rounded-xl shadow-xl text-white ${isError ? 'bg-red-500' : 'bg-emerald-500'}`}><div className="text-xl">{isError ? <FaExclamationTriangle /> : <FaCheck />}</div><p className="ml-3 font-bold text-sm">{message}</p><button onClick={onClose} className="ml-4 p-1 rounded-full hover:bg-white/20"><FaTimes /></button></motion.div>); };
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => { return (<AnimatePresence>{isOpen && (<motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[90]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl relative" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}><div className="flex items-start gap-4"><div className="flex-shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-red-100 text-red-600"><FaExclamationTriangle /></div><div><h3 className="text-lg font-bold text-slate-800">{title}</h3><p className="text-sm text-slate-500 mt-1">{message}</p></div></div><div className="mt-6 flex flex-row-reverse gap-3"><button onClick={onConfirm} type="button" className="w-full inline-flex justify-center rounded-xl px-4 py-2 bg-red-600 text-sm font-bold text-white hover:bg-red-700 shadow-lg">Видалити</button><button onClick={onClose} type="button" className="w-full inline-flex justify-center rounded-xl border border-slate-200 px-4 py-2 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50">Скасувати</button></div></motion.div></motion.div>)}</AnimatePresence>); };

// --- ГОЛОВНИЙ КОМПОНЕНТ ---

export default function MicrotasksPage() {
  const { role, user, employee } = useAuth();
  
  const isAdminOrOffice = role === 'admin' || role === 'super_admin' || role === 'office';
  const myEmail = user?.email;
  const myCustomId = employee?.custom_id;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  
  // 1. ЗМІНЕНО ДЕФОЛТНИЙ ФІЛЬТР НА 'нове'
  const [statusFilter, setStatusFilter] = useState('нове');
  const [roleFilter, setRoleFilter] = useState('all');
  
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  const [installations, setInstallations] = useState([]);
  const [employees, setEmployees] = useState([]);
  
  const [notification, setNotification] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  
  const navigate = useNavigate();

  const showNotification = (message, type = 'success', duration = 5000) => {
    const id = Date.now();
    setNotification({ id, message, type });
    setTimeout(() => { setNotification(null); }, duration);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, installationsRes, employeesRes] = await Promise.all([
        supabase.from('microtasks').select('*, installations(id, name, custom_id)').order('created_at', { ascending: false }),
        supabase.from('installations').select('id, name, custom_id'),
        supabase.from('employees').select('id, custom_id, name, email, position')
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (installationsRes.error) throw installationsRes.error;
      if (employeesRes.error) throw employeesRes.error;
      
      const formattedTasks = tasksRes.data.map(task => ({
        ...task,
        installation: task.installations
      }));

      setTasks(formattedTasks || []);
      setInstallations(installationsRes.data || []);
      setEmployees(employeesRes.data || []);
    } catch (error) { 
        showNotification(`Помилка завантаження: ${error.message}`, 'error');
    } finally { 
        setLoading(false); 
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    if (statusFilter === 'прострочено') {
        const today = new Date().setHours(0,0,0,0);
        result = result.filter(t => t.due_date && new Date(t.due_date) < today && t.status !== 'виконано' && t.status !== 'скасовано');
    } else if (statusFilter !== 'всі') { 
        result = result.filter(task => task.status === statusFilter); 
    }

    if (roleFilter === 'created_by_me') {
        result = result.filter(task => task.creator_email === myEmail);
    } else if (roleFilter === 'assigned_to_me') {
        if (myCustomId) {
            result = result.filter(task => task.assigned_to === myCustomId);
        } else {
            result = []; 
        }
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(task => 
        task.task_text.toLowerCase().includes(lowerQuery) ||
        (task.custom_id && task.custom_id.toString().includes(lowerQuery)) ||
        (task.installation && (task.installation.name.toLowerCase().includes(lowerQuery) || task.installation.custom_id.toString().includes(lowerQuery)))
      );
    }

    result.sort((a, b) => {
      let valA = a[sortBy] || ''; let valB = b[sortBy] || '';
      if (sortBy === 'created_at' || sortBy === 'due_date') { valA = new Date(valA); valB = new Date(valB); }
      return sortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
    return result;
  }, [tasks, statusFilter, roleFilter, sortBy, sortOrder, searchQuery, myEmail, myCustomId]);

  const handleFormSubmit = async (formData) => {
    setSubmitting(true);
    try {
      let result;
      const taskData = { 
        task_text: formData.task_text, 
        status: formData.status, 
        due_date: formData.due_date || null, 
        installation_id: formData.installation_id || null,
        assigned_to: formData.assigned_to || null 
      };

      // Якщо при редагуванні або створенні одразу ставимо статус "Виконано", записуємо дату
      if (formData.status === 'виконано') {
          taskData.data_complete = new Date().toISOString();
      }
      
      if (editingTask) {
        result = await supabase.from('microtasks').update(taskData).eq('custom_id', editingTask.custom_id).select('*, installations(id, name, custom_id)').single();
      } else {
        if (myEmail) { taskData.creator_email = myEmail; }
        result = await supabase.from('microtasks').insert(taskData).select('*, installations(id, name, custom_id)').single();
      }

      if (result.error) throw result.error;

      const updatedTask = {...result.data, installation: result.data.installations};
      setTasks(prev => editingTask ? prev.map(t => t.custom_id === editingTask.custom_id ? updatedTask : t) : [updatedTask, ...prev]);
      closeModal();
      showNotification(editingTask ? 'Задачу успішно оновлено!' : 'Задачу успішно створено!');
      
      // Якщо це нове завдання, скидаємо фільтр на всі, щоб побачити його (опціонально, але тут залишаю як було)
      if (!editingTask) { 
        // setStatusFilter('всі'); // Можна розкоментувати, якщо хочеш перекидати на "Всі" після створення
        // setRoleFilter('all'); 
      }

    } catch (error) { 
      showNotification(`Помилка: ${error.message}`, 'error');
    } finally { 
      setSubmitting(false); 
    }
  };

  const promptForDelete = (taskCustomId) => { 
      if (!isAdminOrOffice) {
          showNotification('У вас немає прав на видалення задач', 'error');
          return;
      }
      setTaskToDelete(taskCustomId); 
  };

  const confirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      const { error } = await supabase.from('microtasks').delete().eq('custom_id', taskToDelete);
      if (error) throw error;
      setTasks(prev => prev.filter(task => task.custom_id !== taskToDelete));
      showNotification('Задачу успішно видалено.');
    } catch (error) { 
      showNotification(`Помилка видалення: ${error.message}`, 'error');
    } finally {
      setTaskToDelete(null);
    }
  };

  const handleUpdateStatus = async (taskCustomId, newStatus) => {
    try {
      // 3. ДОДАНО ЛОГІКУ: Якщо статус "Виконано", ставимо поточну дату. Інакше - обнуляємо (або залишаємо як є, але краще обнулити, якщо передумали).
      const updates = { status: newStatus };
      
      if (newStatus === 'виконано') {
          updates.data_complete = new Date().toISOString();
      } else if (newStatus === 'нове' || newStatus === 'в процесі') {
          // Якщо повертаємо в роботу - прибираємо дату виконання
          updates.data_complete = null;
      }

      const { data, error } = await supabase.from('microtasks').update(updates).eq('custom_id', taskCustomId).select('*, installations(id, name, custom_id)').single();
      if (error) throw error;
      const updatedTask = {...data, installation: data.installations};
      setTasks(prev => prev.map(task => (task.custom_id === taskCustomId ? updatedTask : task)));
      showNotification('Статус задачі оновлено.');
    } catch (error) { 
        showNotification(`Помилка: ${error.message}`, 'error');
    }
  };

  const openModalForEdit = (task) => { 
      const isCreator = task.creator_email === myEmail;
      const isAssignee = task.assigned_to === myCustomId;
      const canEdit = isAdminOrOffice || isCreator || isAssignee;

      if (!canEdit) {
          showNotification('У вас немає прав на редагування цієї задачі', 'error');
          return;
      }

      setEditingTask(task); 
      setIsModalOpen(true); 
  };

  const openModalForCreate = () => { setEditingTask(null); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); };

  const formatDateTime = (dateString) => { if (!dateString) return 'Не вказано'; return new Date(dateString).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const formatDate = (dateString) => { if (!dateString) return 'Не вказано'; return new Date(dateString).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const isOverdue = (dueDate, status) => status !== 'виконано' && dueDate && new Date(dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);
  const sortOptions = [ { value: 'created_at', label: 'За датою створення' }, { value: 'due_date', label: 'За дедлайном' }, { value: 'status', label: 'За статусом' } ];

  return (
    <Layout>
      <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto pb-safe min-h-[calc(100dvh-80px)] flex flex-col">
        
        {/* --- HEADER --- */}
        <div className="flex flex-col gap-4 flex-none">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Мікрозадачі</h1>
                    <p className="text-slate-500 text-sm mt-1">Швидкі доручення та нотатки</p>
                </div>
                <button onClick={openModalForCreate} className="hidden sm:flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all w-full sm:w-auto">
                    <FaPlus/> <span>Нова задача</span>
                </button>
            </div>

            {/* FILTERS & SEARCH */}
            <div className="flex flex-col gap-3">
                <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-fit">
                    <button onClick={() => setRoleFilter('all')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all ${roleFilter === 'all' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Всі</button>
                    <button onClick={() => setRoleFilter('created_by_me')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${roleFilter === 'created_by_me' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><FaUserEdit className="text-xs"/> Від мене</button>
                    <button onClick={() => setRoleFilter('assigned_to_me')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${roleFilter === 'assigned_to_me' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><FaUserTie className="text-xs"/> Для мене</button>
                </div>

                <FilterCards tasks={tasks} filter={statusFilter} setFilter={setStatusFilter} />

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-grow">
                        <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Пошук..." className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition shadow-sm text-sm outline-none" />
                    </div>
                    <div className="flex gap-2">
                        <div className="relative flex-grow sm:flex-grow-0">
                            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full sm:w-auto pl-4 pr-8 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm appearance-none font-bold text-slate-700">
                                {sortOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                            </select>
                            <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12}/>
                        </div>
                        <button onClick={() => setSortOrder(p => (p === 'asc' ? 'desc' : 'asc'))} className="p-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm">
                            {sortOrder === 'asc' ? <FaSortAmountUp className="text-slate-600"/> : <FaSortAmountDown className="text-slate-600"/>}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        {/* --- CONTENT --- */}
        <div className="flex-1">
            {loading ? <LoadingScreen /> : 
             filteredTasks.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <FaTasks className="text-slate-300 text-5xl mx-auto mb-4" />
                    <p className="text-slate-500 font-bold">Задач не знайдено</p>
                    {roleFilter !== 'all' && <p className="text-slate-400 text-xs mt-1">Змініть фільтр ролей</p>}
                </div>
             ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filteredTasks.map(task => {
                    const isCreator = task.creator_email === myEmail;
                    const isAssignee = task.assigned_to === myCustomId;
                    const canManage = isAdminOrOffice || isCreator || isAssignee;
                    const canDelete = isAdminOrOffice;

                    return (
                        <TaskCard 
                            key={task.custom_id} 
                            task={task} 
                            employees={employees} 
                            onEdit={openModalForEdit} 
                            onDelete={promptForDelete} 
                            onUpdateStatus={handleUpdateStatus} 
                            formatDateTime={formatDateTime} 
                            formatDate={formatDate} 
                            isOverdue={isOverdue}
                            canEdit={canManage}
                            canComplete={canManage}
                            canDelete={canDelete}
                        />
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
        </div>

        <div className="sm:hidden fixed bottom-6 right-6 z-40">
            <button onClick={openModalForCreate} className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-400 active:scale-90 transition-transform">
                <FaPlus size={24} />
            </button>
        </div>

        <TaskModal isOpen={isModalOpen} onClose={closeModal} onSubmit={handleFormSubmit} task={editingTask} installations={installations} employees={employees} submitting={submitting} />
        <ConfirmationModal isOpen={!!taskToDelete} onClose={() => setTaskToDelete(null)} onConfirm={confirmDeleteTask} title="Підтвердити видалення" message="Видалити цю задачу безповоротно?" />
        <AnimatePresence>{notification && <Notification key={notification.id} message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}</AnimatePresence>
      </div>
    </Layout>
  );
}