import React, { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FaProjectDiagram, FaUserTie, FaTasks, FaBolt, FaClock, FaBars, FaTimes, FaUsers, FaBuilding, FaCog, FaCreditCard, 
  FaCheckCircle, FaUserCheck, FaUserSlash, FaFileInvoiceDollar, FaSignOutAlt, FaExclamationTriangle, FaFolderOpen
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

// Ініціалізація Supabase
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);


// --- Оптимізовані UI Компоненти ---

const StatCard = memo(({ icon: Icon, label, value, color, delay }) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }} 
    animate={{ opacity: 1, y: 0 }} 
    transition={{ delay }}
    className="bg-white/80 backdrop-blur-lg rounded-2xl p-6 shadow-lg border border-slate-200/50 hover:shadow-xl hover:bg-white transition-all duration-300 hover:-translate-y-1 cursor-pointer"
  >
    <div className={`w-12 h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-4 shadow-md`}>
      <Icon className="text-white text-xl" />
    </div>
    <div>
      <p className="text-3xl font-bold text-slate-800 mb-1">{value}</p>
      <p className="text-slate-600 font-medium">{label}</p>
    </div>
  </motion.div>
));

const SkeletonCard = memo(() => (
    <div className="bg-white/50 rounded-2xl p-6 shadow-md border border-slate-200/30 animate-pulse">
        <div className="w-12 h-12 bg-slate-200 rounded-xl mb-4"></div>
        <div>
            <div className="h-8 bg-slate-200 rounded w-3/4 mb-2"></div>
            <div className="h-5 bg-slate-200 rounded w-1/2"></div>
        </div>
    </div>
));

// ⭐️ КОМПОНЕНТ З ВИПРАВЛЕННЯМ ⭐️
const TaskItem = memo(({ task, delay }) => {
    const getStatusStyle = (status) => {
        switch (status) {
            case 'виконано': return 'bg-emerald-100 text-emerald-800';
            case 'нове': return 'bg-blue-100 text-blue-800';
            case 'в процесі': return 'bg-amber-100 text-amber-800';
            case 'прострочене': return 'bg-red-100 text-red-800';
            default: return 'bg-slate-100 text-slate-800';
        }
    };
    return (
        <motion.div 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }} 
            transition={{ delay }}
            className="flex items-center justify-between p-4 bg-slate-50/80 rounded-xl hover:bg-white hover:shadow-md transition-all duration-300 border border-slate-200/60"
        >
            <div className="flex-1">
                <p className="font-medium text-slate-800">{task.task_text}</p>
                {/* ВИПРАВЛЕНО: Тепер блок з дедлайном відображається тільки якщо `task.due_date` існує.
                  Якщо дедлайну немає, нічого не відображається.
                */}
                {task.due_date ? (
                    <p className="text-sm text-slate-500 mt-1">
                        Дедлайн: {new Date(task.due_date).toLocaleDateString('uk-UA')}
                    </p>
                ) : (
                    <p className="text-sm text-slate-400 mt-1 italic">Дедлайн не вказано</p>
                )}
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusStyle(task.status)} capitalize flex items-center gap-2`}>
                {task.status === 'прострочене' && <FaExclamationTriangle />}
                {task.status}
            </span>
        </motion.div>
    );
});

const Sidebar = memo(({ isOpen, onClose, onNavigate, onLogout }) => {
    const menuItems = [
      { id: 'clients', label: 'Клієнти', icon: FaUsers, path: '/clients' },
      { id: 'installations', label: "Об'єкти", icon: FaBuilding, path: '/installations' },
      { id: 'employees', label: 'Працівники', icon: FaUserTie, path: '/employees' },
      { id: 'equipment', label: 'Обладнання', icon: FaCog, path: '/equipment' },
      { id: 'payments', label: 'Платежі', icon: FaCreditCard, path: '/payments' },
      { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks, path: '/tasks' },
      { id: 'documents', label: 'Документи', icon: FaFolderOpen, path: '/documents' },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="fixed inset-0 bg-black/40 z-40"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                    />
                    <motion.div
                        className="fixed top-0 right-0 h-full w-72 bg-white/95 backdrop-blur-xl text-slate-800 z-50 shadow-2xl border-l border-slate-200/50 flex flex-col"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 180 }}
                    >
                        <div className="p-5 border-b border-slate-200/80 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800">Навігація</h2>
                            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-2 rounded-full transition-colors">
                                <FaTimes className="text-xl" />
                            </button>
                        </div>
                        <div className="flex-1 py-4 overflow-y-auto">
                            {menuItems.map((item, index) => (
                                <motion.button
                                    key={item.id}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 + index * 0.05 }}
                                    onClick={() => onNavigate(item.path)}
                                    className="w-full flex items-center space-x-4 px-6 py-3.5 text-left hover:bg-indigo-50 transition-all duration-200 group rounded-lg mx-2 my-1"
                                >
                                    <item.icon className="text-slate-500 group-hover:text-indigo-600 transition-colors text-lg" />
                                    <span className="font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{item.label}</span>
                                </motion.button>
                            ))}
                        </div>
                        <div className="p-4 border-t border-slate-200/80">
                            <button
                                onClick={onLogout}
                                className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 rounded-lg font-medium transition-all duration-200"
                            >
                                <FaSignOutAlt />
                                <span>Вийти з системи</span>
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
});

// --- Основний компонент сторінки ---
export default function HomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const [user, setUser] = useState(null); 
  const [stats, setStats] = useState({ project: [], employee: [] });
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const today = new Date();
      const todayISO = today.toISOString().split("T")[0];

      const [
        { data: { user: authUser } },
        { count: activeProjectsCount },
        installationsData,
        workersToday,
        { data: tasksData }
      ] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('installations').select('*', { count: 'exact', head: true }).in('status', ['planning', 'in_progress', 'on_hold']),
        supabase.from('installations').select('capacity_kw, total_cost, paid_amount').not('status', 'eq', 'cancelled'),
        supabase.from('installation_workers').select('employee_custom_id').eq('work_date', todayISO),
        supabase.from('microtasks').select('*').order('created_at', { ascending: false }).limit(5)
      ]);
      
      if (!authUser) {
        navigate("/");
        return;
      }

      const { data: profileData } = await supabase.from('user_site').select('first_name').eq('user_id', authUser.id).single();
      setUser(profileData);
      
      let totalCapacity = installationsData?.data?.reduce((sum, item) => sum + (item.capacity_kw || 0), 0) || 0;
      let totalDebt = installationsData?.data?.reduce((sum, item) => sum + ((item.total_cost || 0) - (item.paid_amount || 0)), 0) || 0;
      const workingNowCount = workersToday?.data ? new Set(workersToday.data.map(w => w.employee_custom_id)).size : 0;

      const processedTasks = tasksData.map(task => {
        const dueDate = new Date(task.due_date);
        const isOverdue = task.due_date && dueDate < today && task.status !== 'виконано' && task.status !== 'скасовано';
        return {
          ...task,
          status: isOverdue ? 'прострочене' : task.status,
        };
      });
      setRecentTasks(processedTasks);
      
      const { count: completedProjectsCount } = await supabase.from('installations').select('*', { count: 'exact', head: true }).eq('status', 'completed');
      const { count: offTodayCount } = await supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('work_date', todayISO).eq('status', 'OFF');

      setStats({
        project: [
          { icon: FaCheckCircle, label: "Активних проєктів", value: activeProjectsCount ?? 0, color: "from-emerald-400 to-teal-500" },
          { icon: FaProjectDiagram, label: "Завершених проєктів", value: completedProjectsCount ?? 0, color: "from-blue-400 to-indigo-500" },
          { icon: FaFileInvoiceDollar, label: "Загальна заборгованість", value: `$${totalDebt.toLocaleString('en-US')}`, color: "from-purple-400 to-pink-500" },
          { icon: FaBolt, label: "Загальна потужність", value: `${(totalCapacity / 1000).toFixed(1)} МВт`, color: "from-orange-400 to-red-500" },
        ],
        employee: [
          { icon: FaUserCheck, label: "В роботі зараз", value: workingNowCount, color: "from-green-400 to-emerald-500" },
          { icon: FaUserSlash, label: "Сьогодні вихідні", value: offTodayCount ?? 0, color: "from-amber-400 to-orange-500" },
        ]
      });
      
    } catch (error) {
      console.error("Помилка завантаження даних:", error);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };
  
  const handleNavigate = (page) => {
    navigate(page);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <Sidebar 
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
      />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="sticky top-0 bg-white/80 backdrop-blur-lg border-b border-slate-200/80 z-30">
          <div className="px-6 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                      <FaBolt className="text-white" />
                  </div>
                  <div>
                      <h1 className="text-xl font-bold text-slate-800" translate="no">SES Tracker</h1>
                      <p className="text-xs text-slate-500" translate="no">Professional Edition</p>
                  </div>
              </div>
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                <span>Меню</span>
                <FaBars />
              </button>
          </div>
        </header>

        <main className="relative p-6 sm:p-8 space-y-8 flex-1">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                <h2 className="text-3xl font-bold text-slate-800">
                    Ласкаво просимо, {user?.first_name}!
                </h2>
                <p className="text-slate-500 mt-1">Огляд ключових показників вашого бізнесу.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {loading 
                    ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
                    : stats.project.map((stat, i) => <StatCard key={i} {...stat} delay={i * 0.1} />)
                }
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <h3 className="text-xl font-bold text-slate-800">Працівники сьогодні</h3>
                    {loading
                        ? Array.from({ length: 2 }).map((_, i) => <SkeletonCard key={i} />)
                        : stats.employee.map((stat, i) => <StatCard key={i} {...stat} delay={0.4 + i * 0.1} />)
                    }
                </div>
                <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold text-slate-800">Останні мікрозадачі</h3>
                        <button onClick={() => navigate('/tasks')} className="text-indigo-600 hover:text-indigo-800 font-semibold transition-colors text-sm">
                            Переглянути всі
                        </button>
                    </div>
                    <div className="space-y-3">
                        {loading
                            ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-white/50 rounded-xl animate-pulse"></div>)
                            : recentTasks.length > 0
                                ? recentTasks.map((task, i) => <TaskItem key={task.id} task={task} delay={0.6 + i * 0.05} />)
                                : <p className="text-slate-500 p-4 text-center bg-slate-50 rounded-lg">Немає активних задач.</p>
                        }
                    </div>
                </div>
            </div>
        </main>
      </div>
    </div>
  );
}