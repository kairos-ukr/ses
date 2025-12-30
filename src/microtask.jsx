import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTasks, FaPlus, FaCalendarAlt, FaTrash, FaEdit, 
  FaCheck, FaClock, FaTimes, FaBolt, FaSearch, 
  FaSortAmountDown, FaSortAmountUp, FaUsers, FaBuilding, 
  FaUserTie, FaCog, FaCreditCard, FaLink,
  FaSignOutAlt, FaHome, FaChevronDown, FaExclamationTriangle,
  FaUserEdit, FaUser, FaFilter, FaFolderOpen // Іконки
} from 'react-icons/fa';
import { supabase } from "./supabaseClient";

// --- КОМПОНЕНТИ ---

const StatusIcon = ({ status, className = '' }) => {
  const icons = {
    'нове': <FaPlus className={`text-amber-500 ${className}`} />,
    'в процесі': <FaClock className={`text-blue-500 ${className}`} />,
    'виконано': <FaCheck className={`text-emerald-500 ${className}`} />,
    'скасовано': <FaTimes className={`text-red-500 ${className}`} />,
  };
  return icons[status] || <FaTasks className={`text-zinc-500 ${className}`} />;
};

const StatusBadge = ({ status }) => {
  const colors = {
    'виконано': 'bg-emerald-100 text-emerald-800 border-emerald-200',
    'в процесі': 'bg-blue-100 text-blue-800 border-blue-200',
    'нове': 'bg-amber-100 text-amber-800 border-amber-200',
    'скасовано': 'bg-red-100 text-red-800 border-red-200',
    'default': 'bg-zinc-100 text-zinc-800 border-zinc-200'
  };
  return (<span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${colors[status] || colors.default}`}>{status}</span>);
};

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function MicrotasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  
  // Фільтри
  const [statusFilter, setStatusFilter] = useState('всі'); // Фільтр по статусу (нове, в процесі...)
  const [roleFilter, setRoleFilter] = useState('all'); // НОВИЙ ФІЛЬТР: 'all', 'created_by_me', 'assigned_to_me'
  
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Дані
  const [installations, setInstallations] = useState([]);
  const [employees, setEmployees] = useState([]);
  
  // Дані про поточного юзера
  const [currentUserEmail, setCurrentUserEmail] = useState(null);
  const [myCustomId, setMyCustomId] = useState(null);
  
  const [notification, setNotification] = useState(null);
  const [taskToDelete, setTaskToDelete] = useState(null);
  
  const navigate = useNavigate();

  // Блокування скролу
  useEffect(() => {
    if (isModalOpen || taskToDelete) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen, taskToDelete]);

  const showNotification = (message, type = 'success', duration = 5000) => {
    const id = Date.now();
    setNotification({ id, message, type });
    setTimeout(() => {
      setNotification(null);
    }, duration);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Отримуємо поточного користувача
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email;
      setCurrentUserEmail(userEmail);

      // 2. Завантажуємо дані
      const [tasksRes, installationsRes, employeesRes] = await Promise.all([
        supabase.from('microtasks').select('*, installations(id, name, custom_id)').order('created_at', { ascending: false }),
        supabase.from('installations').select('id, name, custom_id'),
        supabase.from('employees').select('id, custom_id, name, email, position')
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (installationsRes.error) throw installationsRes.error;
      if (employeesRes.error) throw employeesRes.error;

      // 3. Знаходимо Custom ID поточного користувача, якщо він є в базі працівників
      if (userEmail && employeesRes.data) {
          const myProfile = employeesRes.data.find(e => e.email === userEmail);
          if (myProfile) {
              setMyCustomId(myProfile.custom_id);
          }
      }
      
      const formattedTasks = tasksRes.data.map(task => ({
        ...task,
        installation: task.installations
      }));

      setTasks(formattedTasks || []);
      setInstallations(installationsRes.data || []);
      setEmployees(employeesRes.data || []);
    } catch (error) { 
        console.error('Помилка завантаження даних:', error); 
        showNotification(`Помилка завантаження: ${error.message}`, 'error');
    } finally { 
        setLoading(false); 
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // --- ЛОГІКА ФІЛЬТРАЦІЇ ---
  const filteredTasks = useMemo(() => {
    let result = [...tasks];

    // 1. Фільтр по РОЛІ (Всі / Я поставив / Мені призначено)
    if (roleFilter === 'created_by_me') {
        // Задачі, де creator_email співпадає з моїм
        result = result.filter(task => task.creator_email === currentUserEmail);
    } else if (roleFilter === 'assigned_to_me') {
        // Задачі, де assigned_to співпадає з моїм custom_id
        if (myCustomId) {
            result = result.filter(task => task.assigned_to === myCustomId);
        } else {
            // Якщо у мене немає custom_id, значить мені нічого не призначено
            result = []; 
        }
    }

    // 2. Фільтр по СТАТУСУ
    if (statusFilter !== 'всі') { 
        result = result.filter(task => task.status === statusFilter); 
    }

    // 3. ПОШУК
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(task => 
        task.task_text.toLowerCase().includes(lowerQuery) ||
        (task.custom_id && task.custom_id.toString().includes(lowerQuery)) ||
        (task.installation && (task.installation.name.toLowerCase().includes(lowerQuery) || task.installation.custom_id.toString().includes(lowerQuery)))
      );
    }

    // 4. СОРТУВАННЯ
    result.sort((a, b) => {
      let valA = a[sortBy] || ''; let valB = b[sortBy] || '';
      if (sortBy === 'created_at' || sortBy === 'due_date') { valA = new Date(valA); valB = new Date(valB); }
      return sortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });
    return result;
  }, [tasks, statusFilter, roleFilter, sortBy, sortOrder, searchQuery, currentUserEmail, myCustomId]);

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
      
      if (editingTask) {
        result = await supabase.from('microtasks').update(taskData).eq('custom_id', editingTask.custom_id).select('*, installations(id, name, custom_id)').single();
      } else {
        // Додаємо creator_email тільки при створенні
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) {
            taskData.creator_email = user.email;
        }
        result = await supabase.from('microtasks').insert(taskData).select('*, installations(id, name, custom_id)').single();
      }

      if (result.error) throw result.error;

      const updatedTask = {...result.data, installation: result.data.installations};
      
      setTasks(prev => editingTask ? prev.map(t => t.custom_id === editingTask.custom_id ? updatedTask : t) : [updatedTask, ...prev]);
      closeModal();
      showNotification(editingTask ? 'Задачу успішно оновлено!' : 'Задачу успішно створено!');
      
      // Якщо це нова задача, можна скинути фільтри, щоб побачити її
      if (!editingTask) {
          setStatusFilter('всі');
          setRoleFilter('all');
      }

    } catch (error) { 
      console.error('Помилка збереження задачі:', error); 
      showNotification(`Помилка: ${error.message}`, 'error');
    } finally { 
      setSubmitting(false); 
    }
  };

  const promptForDelete = (taskCustomId) => {
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
      console.error('Помилка видалення:', error);
      showNotification(`Помилка видалення: ${error.message}`, 'error');
    } finally {
      setTaskToDelete(null);
    }
  };

  const handleUpdateStatus = async (taskCustomId, newStatus) => {
    try {
      const { data, error } = await supabase.from('microtasks').update({ status: newStatus }).eq('custom_id', taskCustomId).select('*, installations(id, name, custom_id)').single();
      if (error) throw error;
      const updatedTask = {...data, installation: data.installations};
      setTasks(prev => prev.map(task => (task.custom_id === taskCustomId ? updatedTask : task)));
      showNotification('Статус задачі оновлено.');
    } catch (error) { 
        console.error('Помилка оновлення статусу:', error);
        showNotification(`Помилка: ${error.message}`, 'error');
    }
  };

  const openModalForEdit = (task) => { setEditingTask(task); setIsModalOpen(true); };
  const openModalForCreate = () => { setEditingTask(null); setIsModalOpen(true); };
  const closeModal = () => { setIsModalOpen(false); };

  const formatDateTime = (dateString) => { if (!dateString) return 'Не вказано'; return new Date(dateString).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
  const formatDate = (dateString) => { if (!dateString) return 'Не вказано'; return new Date(dateString).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }); };
  const isOverdue = (dueDate, status) => status !== 'виконано' && dueDate && new Date(dueDate).setHours(0,0,0,0) < new Date().setHours(0,0,0,0);
  const sortOptions = [ { value: 'created_at', label: 'За датою створення' }, { value: 'due_date', label: 'За дедлайном' }, { value: 'status', label: 'За статусом' } ];

  if (loading) return <LoadingScreen />;

  return (
    <div className="flex h-screen bg-zinc-50 font-sans">
      <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} navigate={navigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onAddTask={openModalForCreate} onToggleSidebar={() => setIsSidebarOpen(p => !p)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-100 p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            
            {/* --- ВЕРХНІ ФІЛЬТРИ (ТАБИ) --- */}
            <div className="flex space-x-2 mb-6 bg-white p-2 rounded-xl shadow-sm ring-1 ring-zinc-200 w-fit mx-auto sm:mx-0">
                <button 
                    onClick={() => setRoleFilter('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${roleFilter === 'all' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-600 hover:bg-zinc-100'}`}
                >
                    Всі задачі
                </button>
                <button 
                    onClick={() => setRoleFilter('created_by_me')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${roleFilter === 'created_by_me' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-600 hover:bg-zinc-100'}`}
                >
                    <FaUserEdit /> Я поставив
                </button>
                <button 
                    onClick={() => setRoleFilter('assigned_to_me')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${roleFilter === 'assigned_to_me' ? 'bg-indigo-600 text-white shadow-md' : 'text-zinc-600 hover:bg-zinc-100'}`}
                >
                    <FaUserTie /> Мені призначено
                </button>
            </div>

            <FilterCards tasks={tasks} filter={statusFilter} setFilter={setStatusFilter} />
            
            <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex flex-col sm:flex-row items-center gap-4 ring-1 ring-zinc-200">
              <div className="relative flex-grow w-full"><FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" /><input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Пошук за текстом, ID, об'єктом..." className="w-full pl-10 pr-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" /></div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-full sm:w-auto px-3 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition">
                  {sortOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                <button onClick={() => setSortOrder(p => (p === 'asc' ? 'desc' : 'asc'))} className="p-3 border border-zinc-300 rounded-lg hover:bg-zinc-100 transition">
                  {sortOrder === 'asc' ? <FaSortAmountUp className="text-zinc-600"/> : <FaSortAmountDown className="text-zinc-600"/>}
                </button>
              </div>
            </div>
            
            {filteredTasks.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl shadow-sm ring-1 ring-zinc-200">
                    <FaTasks className="text-zinc-300 text-6xl mx-auto mb-4" />
                    <p className="text-zinc-600 text-lg font-medium">Задач не знайдено</p>
                    {roleFilter !== 'all' && <p className="text-zinc-400 text-sm mt-1">Спробуйте змінити фільтр "Я поставив / Мені призначено"</p>}
                </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {filteredTasks.map(task => (
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
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </main>
      </div>
      
      <div className="sm:hidden fixed bottom-4 right-4 z-30">
        <button onClick={openModalForCreate} className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"><FaPlus size={24} /></button>
      </div>

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={closeModal} 
        onSubmit={handleFormSubmit} 
        task={editingTask} 
        installations={installations} 
        employees={employees} 
        submitting={submitting} 
      />
      <ConfirmationModal isOpen={!!taskToDelete} onClose={() => setTaskToDelete(null)} onConfirm={confirmDeleteTask} title="Підтвердити видалення" message="Ви впевнені, що хочете видалити цю задачу? Цю дію неможливо буде скасувати." />
      <AnimatePresence>{notification && <Notification key={notification.id} message={notification.message} type={notification.type} onClose={() => setNotification(null)} />}</AnimatePresence>
    </div>
  );
}

// --- ДОПОМІЖНІ КОМПОНЕНТИ ---

const LoadingScreen = () => (<div className="min-h-screen bg-zinc-50 flex items-center justify-center"><div className="text-center"><div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg mb-4 animate-pulse"><FaTasks className="text-white text-3xl" /></div><p className="text-zinc-600 font-medium">Завантаження задач...</p></div></div>);
const Header = ({ onAddTask, onToggleSidebar }) => (<header className="bg-white/80 backdrop-blur-lg border-b border-zinc-200 sticky top-0 z-20"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex justify-between items-center h-16"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md"><FaTasks className="text-white text-xl" /></div><h1 className="text-2xl font-bold text-zinc-900">Мікрозадачі</h1></div><div className="flex items-center gap-2"><button onClick={onAddTask} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition shadow"><FaPlus /><span>Нова задача</span></button><button onClick={onToggleSidebar} className="p-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg"><FaBolt className="text-zinc-700 text-xl" /></button></div></div></div></header>);
const Sidebar = ({ isSidebarOpen, setIsSidebarOpen, navigate }) => {
  const menuItems = [ { id: 'home', label: 'Головна', icon: FaHome, path: '/home' }, { id: 'clients', label: 'Клієнти', icon: FaUsers, path: '/clients' }, { id: 'installations', label: "Об'єкти", icon: FaBuilding, path: '/installations' }, { id: 'employees', label: 'Працівники', icon: FaUserTie, path: '/employees' }, { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks, path: '/tasks' }, { id: 'equipment', label: 'Обладнання', icon: FaCog, path: '/equipment' }, { id: 'payments', label: 'Платежі', icon: FaCreditCard, path: '/payments' }, { id: 'documents', label: 'Документи', icon: FaFolderOpen, path: '/documents' }, ];
  const handleNavigate = (path) => { navigate(path); setIsSidebarOpen(false); };
  const SidebarContent = () => (<div className="flex flex-col h-full bg-white text-zinc-700"><div className="p-5 border-b border-zinc-200 flex items-center gap-3"><div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg"><FaBolt className="text-white text-lg" /></div><h2 className="text-xl font-bold text-zinc-800">Меню</h2></div><nav className="flex-1 p-3 space-y-1">{menuItems.map((item) => { const isActive = window.location.pathname === item.path; return (<div key={item.id} onClick={() => !isActive && handleNavigate(item.path)} className={`w-full flex items-center gap-4 px-4 py-3 text-left rounded-lg transition-all ${isActive ? 'bg-indigo-100 text-indigo-700 cursor-default' : 'hover:bg-zinc-100 hover:text-zinc-800 cursor-pointer'}`}><item.icon className={isActive ? 'text-indigo-600' : 'text-zinc-500'} size={20} /><span className="font-semibold">{item.label}</span></div>) })}</nav><div className="p-4 border-t border-zinc-200"><button onClick={() => navigate("/")} className="w-full flex items-center justify-center gap-3 py-3 bg-zinc-100 hover:bg-red-50 hover:text-red-600 text-zinc-600 rounded-lg font-bold transition-all"><FaSignOutAlt /><span>Вийти</span></button></div></div>);
  return (<AnimatePresence>{isSidebarOpen && (<><motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSidebarOpen(false)} /><motion.div className="fixed top-0 right-0 w-72 h-full z-50 shadow-2xl" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}><SidebarContent /></motion.div></>)}</AnimatePresence>);
};
const FilterCards = ({ tasks, filter, setFilter }) => {
  const statuses = ['нове', 'в процесі', 'виконано', 'скасовано'];
  return (<div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6"><div onClick={() => setFilter('всі')} className={`p-4 bg-white rounded-xl shadow-sm ring-2 cursor-pointer transition-all ${filter === 'всі' ? 'ring-indigo-500 shadow-indigo-100' : 'ring-zinc-200 hover:ring-indigo-400'}`}><h4 className="font-bold text-zinc-800">Всі задачі</h4><p className="text-3xl font-bold text-zinc-900 mt-2">{tasks.length}</p></div>{statuses.map(status => { const count = tasks.filter(t => t.status === status).length; const colors = { 'нове': 'amber', 'в процесі': 'blue', 'виконано': 'emerald', 'скасовано': 'red' }; const color = colors[status]; return (<div key={status} onClick={() => setFilter(status)} className={`p-4 bg-white rounded-xl shadow-sm ring-2 cursor-pointer transition-all ${filter === status ? `ring-${color}-500 shadow-${color}-100` : 'ring-zinc-200 hover:ring-indigo-400'}`}><div className="flex justify-between items-start"><h4 className="font-bold text-zinc-800 capitalize">{status}</h4><StatusIcon status={status} /></div><p className={`text-3xl font-bold text-${color}-600 mt-2`}>{count}</p></div>); })}</div>);
};

// --- КАРТКА ЗАДАЧІ (ОНОВЛЕНА) ---
const TaskCard = ({ task, employees, onEdit, onDelete, onUpdateStatus, formatDateTime, formatDate, isOverdue }) => {
    // 1. Пошук АВТОРА (через email)
    const creator = employees.find(e => e.email === task.creator_email);
    const creatorName = creator ? creator.name : task.creator_email;

    // 2. Пошук ВИКОНАВЦЯ (через CUSTOM_ID)
    const assignee = employees.find(e => e.custom_id === task.assigned_to);
    const assigneeName = assignee ? assignee.name : null;

    return (
        <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} className="group bg-white rounded-xl shadow-sm hover:shadow-lg ring-1 ring-zinc-200 hover:ring-indigo-400 transition-all flex flex-col md:flex-row overflow-hidden">
            {/* Ліва частина: Статус і Текст */}
            <div className="p-4 flex-1">
                <div className="flex justify-between items-start mb-2">
                     <div className="flex items-center gap-2">
                        <span className="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs">#{task.custom_id}</span>
                        <StatusBadge status={task.status} />
                     </div>
                     <div className="flex md:hidden items-center gap-2">
                         {/* Мобільні кнопки дій */}
                        {task.status !== 'виконано' && <button onClick={() => onUpdateStatus(task.custom_id, 'виконано')} className="p-1.5 text-emerald-600 bg-emerald-50 rounded-lg"><FaCheck size={14}/></button>}
                        <button onClick={() => onEdit(task)} className="p-1.5 text-blue-600 bg-blue-50 rounded-lg"><FaEdit size={14}/></button>
                     </div>
                </div>
                
                <p className="font-semibold text-zinc-800 text-lg mb-3">{task.task_text}</p>
                
                {task.installation && (
                    <div className="mb-3 inline-flex items-center gap-1.5 text-sm text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                        <FaLink size={12}/><span>{task.installation.name} <span className="text-indigo-400">#{task.installation.custom_id}</span></span>
                    </div>
                )}

                {/* Блок дат (Створено / Дедлайн) */}
                <div className="flex flex-wrap gap-4 text-sm text-zinc-500 border-t border-zinc-100 pt-3">
                    <div className="flex items-center gap-1.5" title="Дата створення">
                        <FaClock className="text-zinc-400"/>
                        <span className="text-xs">Створено: <span className="font-medium text-zinc-700">{formatDateTime(task.created_at)}</span></span>
                    </div>
                    {task.due_date && (
                        <div className={`flex items-center gap-1.5 ${isOverdue(task.due_date, task.status) ? 'text-red-600 bg-red-50 px-2 py-0.5 rounded' : ''}`} title="Дедлайн виконання">
                            <FaCalendarAlt className={isOverdue(task.due_date, task.status) ? "text-red-500" : "text-zinc-400"}/>
                            <span className="text-xs">Дедлайн: <span className="font-medium text-zinc-700">{formatDate(task.due_date)}</span></span>
                        </div>
                    )}
                </div>
            </div>

            {/* Права частина: Люди (Автор / Виконавець) */}
            <div className="bg-zinc-50/80 p-4 border-t md:border-t-0 md:border-l border-zinc-200 w-full md:w-64 flex flex-col justify-center gap-3">
                {/* Автор */}
                <div className="flex items-start gap-2">
                    <div className="mt-0.5 p-1.5 bg-white rounded-full shadow-sm text-zinc-400"><FaUserEdit size={12}/></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">Поставив</p>
                        <p className="text-sm font-medium text-zinc-700">{creatorName || 'Невідомо'}</p>
                    </div>
                </div>
                
                {/* Виконавець */}
                <div className="flex items-start gap-2">
                    <div className={`mt-0.5 p-1.5 rounded-full shadow-sm ${assigneeName ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-zinc-300'}`}><FaUserTie size={12}/></div>
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">Виконавець</p>
                        <p className={`text-sm font-medium ${assigneeName ? 'text-indigo-700' : 'text-zinc-400 italic'}`}>{assigneeName || 'Не призначено'}</p>
                    </div>
                </div>

                {/* Десктопні кнопки (ховаються на мобільному) */}
                <div className="hidden md:flex items-center justify-end gap-2 mt-auto pt-2">
                    {task.status !== 'виконано' && (
                        <button onClick={() => onUpdateStatus(task.custom_id, 'виконано')} className="p-2 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors" title="Позначити виконаним"><FaCheck /></button>
                    )}
                    <button onClick={() => onEdit(task)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors" title="Редагувати"><FaEdit /></button>
                    <button onClick={() => onDelete(task.custom_id)} className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors" title="Видалити"><FaTrash /></button>
                </div>
            </div>
        </motion.div>
    );
};

const InstallationSelector = ({ installations, selectedId, onChange }) => { const [searchTerm, setSearchTerm] = useState(''); const [isOpen, setIsOpen] = useState(false); const selectedInstallationName = useMemo(() => installations.find(i => i.id === selectedId)?.name || 'Не вибрано', [selectedId, installations]); const filteredInstallations = useMemo(() => { if (!searchTerm) return installations; const lowerTerm = searchTerm.toLowerCase(); return installations.filter(inst => inst.name.toLowerCase().includes(lowerTerm) || inst.custom_id.toString().includes(lowerTerm)); }, [searchTerm, installations]); return (<div className="relative"><button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full border border-zinc-300 rounded-lg p-3 text-left bg-white flex justify-between items-center"><span>{selectedInstallationName}</span><FaChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button><AnimatePresence>{isOpen && (<motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-10 w-full mt-1 bg-white border border-zinc-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"><div className="p-2 sticky top-0 bg-white"><div className="relative"><FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" /><input type="text" placeholder="Пошук за назвою або ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-zinc-300 rounded-md" /></div></div><ul><li onClick={() => { onChange(''); setIsOpen(false); }} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer">Не вибрано</li>{filteredInstallations.map(inst => (<li key={inst.id} onClick={() => { onChange(inst.id); setIsOpen(false); }} className="px-4 py-2 hover:bg-indigo-50 cursor-pointer">{inst.name} <span className="text-zinc-500">(#{inst.custom_id})</span></li>))}</ul></motion.div>)}</AnimatePresence></div>); };

// Вибір працівника за CUSTOM_ID
const EmployeeSelector = ({ employees, selectedCustomId, onChange }) => {
    return (
        <div className="relative">
            <select
                value={selectedCustomId || ''}
                onChange={(e) => onChange(e.target.value ? parseInt(e.target.value) : '')}
                className="w-full border border-zinc-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 bg-white appearance-none"
            >
                <option value="">Не призначено (Вибрати виконавця)</option>
                {employees.map(emp => (
                    <option key={emp.id} value={emp.custom_id}>
                        {emp.name} (ID: {emp.custom_id}) {emp.position ? `- ${emp.position}` : ''}
                    </option>
                ))}
            </select>
            <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
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
  
  return (<AnimatePresence>{isOpen && (<motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-xl shadow-2xl relative my-8" initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} onClick={e => e.stopPropagation()}><div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-zinc-800">{task ? 'Редагувати задачу' : 'Створити задачу'}</h2><button onClick={onClose} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full"><FaTimes /></button></div><form onSubmit={handleSubmit} className="space-y-5">
      
      <div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Опис задачі <span className="text-red-500">*</span></label><textarea name="task_text" value={formData.task_text} onChange={handleChange} rows="4" required className="w-full border border-zinc-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" placeholder="Наприклад, замінити інвертор на об'єкті..."/></div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Прив'язати до об'єкта</label><InstallationSelector installations={installations} selectedId={formData.installation_id} onChange={handleInstallationChange}/></div>
          
          <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Виконавець</label>
              <EmployeeSelector employees={employees} selectedCustomId={formData.assigned_to} onChange={handleAssigneeChange} />
          </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5"><div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Дедлайн</label><input type="date" name="due_date" value={formData.due_date} onChange={handleChange} className="w-full border border-zinc-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500" /></div><div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Статус</label><select name="status" value={formData.status} onChange={handleChange} className="w-full border border-zinc-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 bg-white"><option value="нове">Нове</option><option value="в процесі">В процесі</option><option value="виконано">Виконано</option>{task && <option value="скасовано">Скасовано</option>}</select></div></div><div className="flex justify-end gap-3 pt-4"><button type="button" onClick={onClose} className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg font-semibold transition-all">Скасувати</button><button type="submit" disabled={submitting} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-all shadow disabled:opacity-60 disabled:cursor-not-allowed">{submitting ? 'Збереження...' : (task ? 'Оновити задачу' : 'Створити задачу')}</button></div></form></motion.div></motion.div>)}</AnimatePresence>);
};
const Notification = ({ message, type, onClose }) => { const isError = type === 'error'; return (<motion.div layout initial={{ opacity: 0, y: 50, scale: 0.3 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.5 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className={`fixed top-5 right-5 z-[100] flex items-center p-4 rounded-lg shadow-lg text-white ${isError ? 'bg-red-500' : 'bg-emerald-500'}`}><div className="text-xl">{isError ? <FaExclamationTriangle /> : <FaCheck />}</div><p className="ml-3 font-medium">{message}</p><button onClick={onClose} className="ml-4 p-1 rounded-full hover:bg-white/20"><FaTimes /></button></motion.div>); };
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => { return (<AnimatePresence>{isOpen && (<motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[90]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl relative" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }} onClick={e => e.stopPropagation()}><div className="flex items-start"><div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10"><FaExclamationTriangle className="h-6 w-6 text-red-600" aria-hidden="true" /></div><div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left"><h3 className="text-lg leading-6 font-medium text-zinc-900">{title}</h3><div className="mt-2"><p className="text-sm text-zinc-500">{message}</p></div></div></div><div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse"><button onClick={onConfirm} type="button" className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 sm:ml-3 sm:w-auto sm:text-sm">Видалити</button><button onClick={onClose} type="button" className="mt-3 w-full inline-flex justify-center rounded-md border border-zinc-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-zinc-700 hover:bg-zinc-50 sm:mt-0 sm:w-auto sm:text-sm">Скасувати</button></div></motion.div></motion.div>)}</AnimatePresence>); };