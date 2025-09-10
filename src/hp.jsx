import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FaProjectDiagram, FaUserTie, FaTasks, FaBolt, FaClock, FaBars, FaTimes, FaUsers, FaBuilding, FaCog, FaCreditCard, 
  FaCheckCircle, FaUserCheck, FaUserSlash, FaFileInvoiceDollar 
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function HomePage() {
  const [formType, setFormType] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const [user, setUser] = useState(null); 
  const [projectStats, setProjectStats] = useState([]);
  const [employeeStats, setEmployeeStats] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      const today = new Date().toISOString().split("T")[0];

      // --- ЗМІНА: Логіка для отримання даних користувача за USER_ID ---
      const fetchUserData = async () => {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) { // Перевіряємо чи є авторизований користувач
          const { data: profileData, error } = await supabase
            .from('user_site')
            .select('first_name')
            .eq('user_id', authUser.id) // Пошук за user_id, а не за телефоном
            .single();

          if (error) {
            console.error("Помилка отримання профілю користувача:", error);
          }
          
          if (profileData) {
            setUser(profileData);
          }
        }
      };

      // 1. Статистика по проєктах (без змін)
      const { count: activeProjectsCount } = await supabase.from('installations').select('*', { count: 'exact', head: true }).in('status', ['planning', 'in_progress', 'on_hold']);
      const { count: completedProjectsCount } = await supabase.from('installations').select('*', { count: 'exact', head: true }).eq('status', 'completed');
      
      const { data: installationsData } = await supabase.from('installations').select('capacity_kw, total_cost, paid_amount').not('status', 'eq', 'cancelled');
      
      let totalCapacity = 0;
      let totalDebt = 0;
      if (installationsData) {
        totalCapacity = installationsData.reduce((sum, item) => sum + (item.capacity_kw || 0), 0);
        totalDebt = installationsData.reduce((sum, item) => sum + ((item.total_cost || 0) - (item.paid_amount || 0)), 0);
      }
      
      // --- ЗМІНА: Повністю нова логіка підрахунку працівників на основі installation_workers ---
      // 1. Отримуємо всі записи з installation_workers на сьогодні
      const { data: workersToday } = await supabase
        .from('installation_workers')
        .select('employee_custom_id')
        .eq('work_date', today);

      // 2. Рахуємо кількість унікальних ID працівників
      let workingNowCount = 0;
      if (workersToday) {
          const uniqueWorkerIds = new Set(workersToday.map(w => w.employee_custom_id));
          workingNowCount = uniqueWorkerIds.size;
      }

      const { count: totalEmployeesCount } = await supabase.from('employees').select('*', { count: 'exact', head: true });
      const { count: offTodayCount } = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('work_date', today).eq('status', 'OFF');

      // 3. Останні мікрозадачі (без змін)
      const { data: tasksData } = await supabase.from('microtasks').select('*').order('created_at', { ascending: false }).limit(10);

      await fetchUserData();

      setProjectStats([
        { icon: FaCheckCircle, label: "Активних проєктів", value: activeProjectsCount ?? "0", color: "from-emerald-400 to-teal-500" },
        { icon: FaProjectDiagram, label: "Завершених проєктів", value: completedProjectsCount ?? "0", color: "from-blue-400 to-indigo-500" },
        { icon: FaFileInvoiceDollar, label: "Загальна заборгованість", value: `${totalDebt.toLocaleString('uk-UA')} грн`, color: "from-purple-400 to-pink-500" },
        { icon: FaBolt, label: "Загальна потужність", value: `${(totalCapacity / 1000).toFixed(1)} МВт`, color: "from-orange-400 to-red-500" },
      ]);

      setEmployeeStats([
        { icon: FaUserCheck, label: "В роботі зараз", value: workingNowCount ?? "0", subtext: `з ${totalEmployeesCount ?? 0} працівників`, color: "from-green-400 to-emerald-500" },
        { icon: FaUserSlash, label: "Вихідних працівників", value: offTodayCount ?? "0", subtext: "відпочивають сьогодні", color: "from-amber-400 to-orange-500" },
      ]);
      
      if (tasksData) {
        setRecentTasks(tasksData);
      }

      setLoading(false);
    };

    fetchDashboardData();
  }, []);

  const handleLogout = () => {
    navigate("/");
  };

  const handleCloseForm = () => {
    setFormType(null);
  };

  const handleSidebarToggle = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const handleMenuClick = (page) => {
    navigate(page === 'employees' ? '/employ' : `/${page}`);
    setSidebarOpen(false);
  };

  const menuItems = [
    { id: 'clients', label: 'Клієнти', icon: FaUsers },
    { id: 'installations', label: "Об'єкти", icon: FaBuilding },
    { id: 'employees', label: 'Працівники', icon: FaUserTie },
    { id: 'equipment', label: 'Обладнання', icon: FaCog },
    { id: 'payments', label: 'Платежі', icon: FaCreditCard },
    { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case 'виконано': return 'bg-emerald-500';
      case 'нове': return 'bg-blue-500';
      case 'в процесі': return 'bg-amber-500';
      case 'скасовано': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-emerald-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      
       <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleSidebarToggle}
          />
        )}
      </AnimatePresence>

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
                  <button onClick={handleSidebarToggle} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <FaTimes className="text-xl" />
                  </button>
                </div>
              </div>
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

      <header className="relative bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
         <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <FaBolt className="text-white text-xl" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  SES Tracker
                </h1>
                <p className="text-sm text-gray-500">Professional Edition</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2 bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-2 rounded-full">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">
                    {user && user.first_name ? user.first_name.charAt(0) : 'A'}
                  </span>
                </div>
                <span className="text-gray-700 font-medium">
                  {user && user.first_name ? user.first_name : 'Admin'}
                </span>
              </div>
              <button
                onClick={handleSidebarToggle}
                className="w-12 h-12 bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white rounded-xl flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <FaBars className="text-lg" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative p-8 space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Ласкаво просимо, {user?.first_name}!
          </h2>
          <p className="text-gray-600">Керуйте своїми проєктами ефективно та професійно</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-lg flex items-center justify-center"><FaProjectDiagram className="text-white text-sm" /></div>
            <h3 className="text-2xl font-bold text-gray-800">Статистика по проєктах</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {projectStats.map((stat, index) => (
              <motion.div key={index} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.1 }} className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-500 ease-out hover:-translate-y-1 cursor-pointer">
                <div className="flex items-center justify-between mb-4"><div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}><stat.icon className="text-white text-xl" /></div></div>
                <div>
                  <p className="text-3xl font-bold text-gray-800 mb-1">{loading ? "..." : stat.value}</p>
                  <p className="text-gray-600 font-medium">{stat.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="mb-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center"><FaUserTie className="text-white text-sm" /></div>
            <h3 className="text-2xl font-bold text-gray-800">Статистика по працівниках</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {employeeStats.map((stat, index) => (
              <motion.div key={index} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 + index * 0.1 }} className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-500 ease-out hover:-translate-y-1 cursor-pointer">
                <div className="flex items-center justify-between mb-4"><div className={`w-12 h-12 bg-gradient-to-br ${stat.color} rounded-xl flex items-center justify-center shadow-lg`}><stat.icon className="text-white text-xl" /></div></div>
                <div>
                  <p className="text-3xl font-bold text-gray-800 mb-1">{loading ? "..." : stat.value}</p>
                  <p className="text-gray-800 font-medium mb-1">{stat.label}</p>
                  <p className="text-sm text-gray-500">{loading ? "..." : stat.subtext}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }} className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center"><FaClock className="text-white text-sm" /></div>
              <h3 className="text-xl font-bold text-gray-800">Останні мікрозадачі</h3>
            </div>
            <button onClick={() => navigate('/tasks')} className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
              Переглянути всі
            </button>
          </div>
          <div className="space-y-3">
            {recentTasks.map((task, index) => (
              <motion.div key={task.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.1 + index * 0.05 }} className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50/80 to-gray-100/80 rounded-xl hover:from-indigo-50 hover:to-blue-50 hover:shadow-md transition-all duration-300 ease-out border border-gray-200/60 hover:border-indigo-200 cursor-pointer">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="w-2 h-2 bg-gradient-to-r from-indigo-400 to-purple-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800 mb-1">{task.task_text}</p>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>Дедлайн: {new Date(task.due_date).toLocaleDateString('uk-UA')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`${getStatusColor(task.status)} text-white px-3 py-1 rounded-full text-sm font-medium shadow-sm capitalize`}>
                    {task.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </main>

       <AnimatePresence>
        {formType && (
            <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-white/95 backdrop-blur-xl rounded-2xl p-8 w-full max-w-md shadow-2xl border border-gray-200/50"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  {formType === "project" && "Додати новий проєкт"}
                  {formType === "task" && "Додати нову мікрозадачу"}
                  {formType === "employee" && "Додати нового працівника"}
                </h2>
                <p className="text-gray-600">Заповніть форму для створення нового запису</p>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Назва</label>
                  <input type="text" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200" placeholder="Введіть назву..."/>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Опис</label>
                  <textarea rows="4" className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 resize-none" placeholder="Введіть детальний опис..."></textarea>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button type="button" onClick={handleCloseForm} className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all duration-200">
                    Скасувати
                  </button>
                  <button type="button" onClick={handleCloseForm} className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                    Зберегти
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