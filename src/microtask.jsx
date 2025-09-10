import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FaTasks, 
  FaPlus, 
  FaFilter, 
  FaCalendarAlt, 
  FaTrash, 
  FaEdit, 
  FaCheck, 
  FaClock, 
  FaExclamationTriangle,
  FaBars,
  FaTimes,
  FaBolt,
  FaArrowLeft,
  FaSearch,
  FaSortAmountDown,
  FaSortAmountUp,
  FaUsers,
  FaBuilding,
  FaUserTie,
  FaCog,
  FaCreditCard
} from 'react-icons/fa';
import { supabase } from "./supabaseClient";

export default function MicrotasksPage() {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [filter, setFilter] = useState('всі');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [newTask, setNewTask] = useState({
    task_text: '',
    due_date: '',
    status: 'нове'
  });

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    applyFiltersAndSort();
  }, [tasks, filter, sortBy, sortOrder, searchQuery]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('microtasks')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Помилка завантаження задач:', error);
      alert('Помилка завантаження задач: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...tasks];

    // Фільтрація по статусу
    if (filter !== 'всі') {
      filtered = filtered.filter(task => task.status === filter);
    }

    // Пошук
    if (searchQuery) {
      filtered = filtered.filter(task => 
        task.task_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.id.includes(searchQuery)
      );
    }

    // Сортування
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (sortBy === 'created_at' || sortBy === 'due_date') {
        aValue = new Date(aValue || 0);
        bValue = new Date(bValue || 0);
      }
      
      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredTasks(filtered);
  };

  const handleAddTask = async () => {
    if (!newTask.task_text.trim()) return;
    
    setSubmitting(true);
    try {
      const taskData = {
        task_text: newTask.task_text,
        status: newTask.status,
        due_date: newTask.due_date || null
      };

      const { data, error } = await supabase
        .from('microtasks')
        .insert([taskData])
        .select();
      
      if (error) throw error;
      
      if (data && data[0]) {
        setTasks(prev => [data[0], ...prev]);
      }
      
      setNewTask({ task_text: '', due_date: '', status: 'нове' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Помилка додавання задачі:', error);
      alert('Помилка додавання задачі: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTask = async (taskId, updates) => {
    try {
      const { error } = await supabase
        .from('microtasks')
        .update(updates)
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, ...updates } : task
      ));
    } catch (error) {
      console.error('Помилка оновлення задачі:', error);
      alert('Помилка оновлення задачі: ' + error.message);
    }
  };

  const handleUpdateStatus = async (taskId, newStatus) => {
    await handleUpdateTask(taskId, { status: newStatus });
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Ви впевнені, що хочете видалити цю задачу?')) return;
    
    try {
      const { error } = await supabase
        .from('microtasks')
        .delete()
        .eq('id', taskId);
      
      if (error) throw error;
      
      setTasks(prev => prev.filter(task => task.id !== taskId));
    } catch (error) {
      console.error('Помилка видалення задачі:', error);
      alert('Помилка видалення задачі: ' + error.message);
    }
  };

  const handleEditTask = async () => {
    if (!editingTask.task_text.trim()) return;
    
    setSubmitting(true);
    try {
      const updates = {
        task_text: editingTask.task_text,
        due_date: editingTask.due_date || null,
        status: editingTask.status
      };

      const { error } = await supabase
        .from('microtasks')
        .update(updates)
        .eq('id', editingTask.id);
      
      if (error) throw error;
      
      setTasks(prev => prev.map(task => 
        task.id === editingTask.id ? { ...task, ...updates } : task
      ));
      setEditingTask(null);
    } catch (error) {
      console.error('Помилка оновлення задачі:', error);
      alert('Помилка оновлення задачі: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'виконано': return 'bg-emerald-500';
      case 'в процесі': return 'bg-blue-500';
      case 'нове': return 'bg-amber-500';
      case 'скасовано': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusTextColor = (status) => {
    switch (status) {
      case 'виконано': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
      case 'в процесі': return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'нове': return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'скасовано': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const isOverdue = (dueDate) => {
    return dueDate && new Date(dueDate) < new Date();
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const statusOptions = ['всі', 'нове', 'в процесі', 'виконано', 'скасовано'];

  const menuItems = [
    { id: 'clients', label: 'Клієнти', icon: FaUsers },
    { id: 'installations', label: "Об'єкти", icon: FaBuilding },
    { id: 'employees', label: 'Працівники', icon: FaUserTie },
    { id: 'equipment', label: 'Обладнання', icon: FaCog },
    { id: 'payments', label: 'Платежі', icon: FaCreditCard },
    { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks },
  ];

  const handleMenuClick = (page) => {
    if (page === 'installations') {
      window.location.href = '/installations';
    } 
    if (page === 'clients') {
      window.location.href = '/clients';
    }
    if (page === 'employees') {
      window.location.href = '/employ';
    }
    else {
      window.location.href = `/${page}`;
    }
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    window.location.href = "/";
    console.log("Logout - redirect to login page");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-emerald-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed top-0 right-0 w-64 h-full bg-white/95 backdrop-blur-xl text-gray-800 z-50 shadow-2xl border-l border-gray-200/50"
            initial={{ x: 256 }}
            animate={{ x: 0 }}
            exit={{ x: 256 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
            <div className="flex flex-col h-full">
              {/* Sidebar Header */}
              <div className="p-6 border-b border-gray-200/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                      <FaBolt className="text-white text-lg" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">SES Admin</h2>
                      <p className="text-gray-500 text-sm">Панель управління</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <FaTimes className="text-xl" />
                  </button>
                </div>
              </div>

              {/* Menu Items */}
              <div className="flex-1 py-4">
                {menuItems.map((item, index) => (
                  <motion.button
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onClick={() => handleMenuClick(item.id)}
                    className="w-full flex items-center space-x-3 px-6 py-4 text-left hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200 group rounded-lg mx-2"
                  >
                    <item.icon className="text-indigo-500 group-hover:text-indigo-600 transition-colors" />
                    <span className="font-medium text-gray-700 group-hover:text-gray-800 transition-colors">{item.label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Sidebar Footer */}
              <div className="p-6 border-t border-gray-200/50">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Вийти
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="relative bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2 sm:space-x-4">
              <button
                onClick={() => window.history.back()}
                className="w-10 h-10 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <FaArrowLeft className="text-sm" />
              </button>
              
              <div className="flex items-center space-x-2 sm:space-x-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <FaTasks className="text-white text-lg sm:text-xl" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Мікрозадачі
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500">Управління завданнями</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <FaPlus className="text-sm" />
                <span className="hidden sm:inline">Додати</span>
              </button>
              
              <button
                onClick={() => setSidebarOpen(true)}
                className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <FaBars className="text-lg" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Filters Section */}
      <div className="relative bg-white/70 backdrop-blur-xl border-b border-gray-200/50 px-4 sm:px-6 py-4">
        <div className="flex flex-col space-y-4">
          {/* Search */}
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Пошук по тексту або ID..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Filters Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
            {/* Status Filter */}
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-3 py-1 text-sm rounded-lg border transition-all ${
                    filter === status
                      ? 'bg-indigo-500 text-white border-indigo-500'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-300'
                  }`}
                >
                  {status === 'всі' ? 'Всі' : status}
                </button>
              ))}
            </div>

            {/* Sort Options */}
            <div className="flex items-center space-x-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="created_at">За датою</option>
                <option value="due_date">За дедлайном</option>
                <option value="status">За статусом</option>
                <option value="task_text">За алфавітом</option>
              </select>
              
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="p-2 border border-gray-300 rounded-lg hover:border-indigo-300 transition-colors"
              >
                {sortOrder === 'asc' ? <FaSortAmountUp /> : <FaSortAmountDown />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative p-4 sm:p-8">
        {/* Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8"
        >
          {statusOptions.slice(1).map((status, index) => {
            const count = tasks.filter(task => task.status === status).length;
            return (
              <div
                key={status}
                className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-500 ease-out hover:-translate-y-1 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 ${getStatusColor(status)} rounded-xl flex items-center justify-center shadow-lg`}>
                    <FaTasks className="text-white text-lg sm:text-xl" />
                  </div>
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">{count}</p>
                  <p className="text-sm sm:text-base text-gray-600 font-medium capitalize">{status}</p>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Tasks List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50"
        >
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center">
                <FaTasks className="text-white text-xs sm:text-sm" />
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-800">
                Список задач ({filteredTasks.length})
              </h3>
            </div>
            
            {filter !== 'всі' && (
              <div className="flex items-center space-x-2">
                <span className="text-xs sm:text-sm text-gray-500">Фільтр:</span>
                <span className={`px-2 py-1 rounded-full text-xs border ${getStatusTextColor(filter)}`}>
                  {filter}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-8 sm:py-12">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Завантаження задач...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <FaTasks className="text-gray-400 text-4xl sm:text-6xl mx-auto mb-4" />
              <p className="text-gray-500 text-base sm:text-lg">Задач не знайдено</p>
              <p className="text-gray-400 text-sm sm:text-base">Спробуйте змінити фільтри або додайте нову задачу</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group p-3 sm:p-4 bg-gradient-to-r from-gray-50/80 to-gray-100/80 rounded-xl hover:from-indigo-50 hover:to-blue-50 hover:shadow-md transition-all duration-300 ease-out border border-gray-200/60 hover:border-indigo-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start space-x-3 sm:space-x-4">
                        <div className="flex flex-col items-center space-y-1 sm:space-y-2 flex-shrink-0">
                          <div className="w-2 h-2 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full"></div>
                          <span className="text-xs font-mono text-gray-500">{task.id}</span>
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-3 mb-2">
                            <h4 className="font-semibold text-gray-800 group-hover:text-indigo-800 transition-colors break-words">
                              {task.task_text}
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              <span className={`px-2 py-1 rounded-full text-xs border ${getStatusTextColor(task.status)} flex-shrink-0`}>
                                {task.status}
                              </span>
                              {isOverdue(task.due_date) && task.status !== 'виконано' && (
                                <span className="flex items-center text-red-600 text-xs flex-shrink-0">
                                  <FaExclamationTriangle className="mr-1" />
                                  Прострочено
                                </span>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-4 text-xs sm:text-sm text-gray-500">
                            <span className="flex items-center">
                              <FaClock className="mr-1 flex-shrink-0" />
                              <span className="truncate">Створено: {formatDate(task.created_at)}</span>
                            </span>
                            {task.due_date && (
                              <span className={`flex items-center ${isOverdue(task.due_date) && task.status !== 'виконано' ? 'text-red-600' : ''}`}>
                                <FaCalendarAlt className="mr-1 flex-shrink-0" />
                                <span className="truncate">Дедлайн: {formatDate(task.due_date)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-1 sm:space-x-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
                      {task.status !== 'виконано' && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'виконано')}
                          className="p-1.5 sm:p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Позначити як виконано"
                        >
                          <FaCheck className="text-xs sm:text-sm" />
                        </button>
                      )}
                      
                      {task.status === 'виконано' && (
                        <button
                          onClick={() => handleUpdateStatus(task.id, 'в процесі')}
                          className="p-1.5 sm:p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Повернути в процес"
                        >
                          <FaClock className="text-xs sm:text-sm" />
                        </button>
                      )}
                      
                      <button
                        onClick={() => setEditingTask(task)}
                        className="p-1.5 sm:p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Редагувати"
                      >
                        <FaEdit className="text-xs sm:text-sm" />
                      </button>
                      
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-1.5 sm:p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Видалити"
                      >
                        <FaTrash className="text-xs sm:text-sm" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>

      {/* Add Task Modal */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-gray-200/50"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Додати нову задачу</h2>
                <p className="text-gray-600 text-sm sm:text-base">Заповніть форму для створення нової мікрозадачі</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Опис задачі</label>
                  <textarea
                    value={newTask.task_text}
                    onChange={(e) => setNewTask(prev => ({...prev, task_text: e.target.value}))}
                    rows="3"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 resize-none text-sm sm:text-base"
                    placeholder="Введіть детальний опис задачі..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Дедлайн (опціонально)</label>
                  <input
                    type="datetime-local"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask(prev => ({...prev, due_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
                  <select
                    value={newTask.status}
                    onChange={(e) => setNewTask(prev => ({...prev, status: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  >
                    <option value="нове">Нове</option>
                    <option value="в процесі">В процесі</option>
                    <option value="виконано">Виконано</option>
                  </select>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setShowAddForm(false)}
                    disabled={submitting}
                    className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 text-sm sm:text-base"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={handleAddTask}
                    disabled={!newTask.task_text.trim() || submitting}
                    className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm sm:text-base"
                  >
                    {submitting ? 'Додавання...' : 'Зберегти'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Task Modal */}
      <AnimatePresence>
        {editingTask && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-gray-200/50"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <div className="mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">Редагувати задачу</h2>
                <p className="text-gray-600 text-sm sm:text-base">ID: {editingTask.id}</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Опис задачі</label>
                  <textarea
                    value={editingTask.task_text}
                    onChange={(e) => setEditingTask(prev => ({...prev, task_text: e.target.value}))}
                    rows="3"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 resize-none text-sm sm:text-base"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Дедлайн</label>
                  <input
                    type="datetime-local"
                    value={editingTask.due_date ? new Date(editingTask.due_date).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setEditingTask(prev => ({...prev, due_date: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
                  <select
                    value={editingTask.status}
                    onChange={(e) => setEditingTask(prev => ({...prev, status: e.target.value}))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base"
                  >
                    <option value="нове">Нове</option>
                    <option value="в процесі">В процесі</option>
                    <option value="виконано">Виконано</option>
                    <option value="скасовано">Скасовано</option>
                  </select>
                </div>
                
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setEditingTask(null)}
                    disabled={submitting}
                    className="px-4 sm:px-6 py-2 sm:py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 text-sm sm:text-base"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={handleEditTask}
                    disabled={!editingTask.task_text.trim() || submitting}
                    className="px-4 sm:px-6 py-2 sm:py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-sm sm:text-base"
                  >
                    {submitting ? 'Оновлення...' : 'Оновити'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}