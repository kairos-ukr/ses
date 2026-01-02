import React, { useState, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FaUsers, FaCalendarAlt, FaUmbrellaBeach, 
  FaHome, FaUserFriends, FaIndustry, FaCreditCard, FaUserTie, 
  FaCog, FaTasks, FaFolderOpen, FaSignOutAlt, FaBars, FaTimes
} from "react-icons/fa";
import { useNavigate, useLocation } from 'react-router-dom';

// Імпорт твоїх робочих компонентів
import EmployeeList from "./EmployeeList";
import WorkCalendar from "./WorkCalendar";
import TimeOffManager from "./TimeOffManager";

// --- 1. SIDEBAR (K-Core Меню) ---
const Sidebar = memo(({ isOpen, onClose, onLogout }) => {
    const navigate = useNavigate();
    
    // Отримуємо поточний шлях, або жорстко задаємо '/employees' для демонстрації,
    // оскільки ми знаходимось саме в цьому компоненті.
    const currentPath = "/employees"; 

    const menuItems = [
      { id: 'home', label: 'Головна', icon: FaHome, path: '/home' },
      { id: 'clients', label: 'Клієнти', icon: FaUserFriends, path: '/clients' },
      { id: 'installations', label: "Об'єкти", icon: FaIndustry, path: '/installations' },
      { id: 'employees', label: 'Працівники', icon: FaUserTie, path: '/employees' }, // Активна
      { id: 'equipment', label: 'Обладнання', icon: FaCog, path: '/equipment' },
      { id: 'payments', label: 'Платежі', icon: FaCreditCard, path: '/payments' },
      { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks, path: '/tasks' },
      { id: 'documents', label: 'Документи', icon: FaFolderOpen, path: '/documents' },
    ];

    const handleNavigate = (path) => {
        navigate(path); // Розкоментуй, коли підключиш реальний роутинг
        console.log(`Navigating to: ${path}`);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Затемнення фону */}
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        onClick={onClose} 
                        className="fixed inset-0 bg-black/40 z-[100] backdrop-blur-sm"
                    />
                    
                    {/* Сама панель меню (Виїжджає ЗЛІВА) */}
                    <motion.aside 
                        initial={{ x: "-100%" }} 
                        animate={{ x: 0 }} 
                        exit={{ x: "-100%" }} 
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                        className="fixed inset-y-0 left-0 w-72 bg-white z-[101] shadow-2xl flex flex-col border-r border-gray-100"
                    >
                        {/* Header меню */}
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-white">
                            <h2 className="text-2xl font-extrabold text-indigo-600 tracking-tight">K-Core</h2>
                            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition">
                                <FaTimes size={20}/>
                            </button>
                        </div>

                        {/* Список посилань */}
                        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
                            {menuItems.map((item) => {
                                const isActive = item.path === currentPath;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleNavigate(item.path)}
                                        className={`
                                            w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 group font-medium text-sm
                                            ${isActive 
                                                ? "bg-indigo-50 text-indigo-700 shadow-sm ring-1 ring-indigo-100" // Активний стан
                                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent"}
                                        `}
                                    >
                                        <item.icon className={`text-lg transition-colors ${isActive ? "text-indigo-600" : "text-gray-400 group-hover:text-gray-600"}`} />
                                        <span>{item.label}</span>
                                    </button>
                                );
                            })}
                        </nav>

                        {/* Footer меню */}
                        <div className="p-4 border-t border-gray-100 bg-slate-50">
                            <button onClick={onLogout} className="w-full flex items-center space-x-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-all font-medium border border-transparent hover:border-red-100 text-sm">
                                <FaSignOutAlt />
                                <span>Вийти</span>
                            </button>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
});

// --- 2. ГОЛОВНА СТОРІНКА-ОБГОРТКА ---
export default function MainEmployeesPage() {
    // Активна вкладка (Огляд / Календар / Вихідні)
    const [activeTab, setActiveTab] = useState("team");
    // Меню
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Вкладки навігації
    const tabs = [
        { id: "team", label: "Огляд", icon: FaUsers },
        { id: "planning", label: "Календар", icon: FaCalendarAlt },
        { id: "timeoff", label: "Вихідні", icon: FaUmbrellaBeach },
    ];

    const handleLogout = () => {
        console.log("Logout clicked");
    };

    return (
        <div className="flex flex-col h-screen bg-slate-100 overflow-hidden font-sans text-slate-800">
            
            {/* ГЛОБАЛЬНЕ МЕНЮ */}
            <Sidebar 
                isOpen={isMenuOpen} 
                onClose={() => setIsMenuOpen(false)} 
                onLogout={handleLogout} 
            />

            {/* --- ШАПКА (HEADER) --- */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm flex-shrink-0">
                <div className="max-w-[1920px] mx-auto px-4 md:px-6 py-3">
                    
                    {/* FLEX CONTAINER:
                        Mobile: Column (Рядок 1: Меню+Заголовок, Рядок 2: Вкладки)
                        Desktop: Row (Все в один рядок: Заголовок - Вкладки - Меню)
                    */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-8">
                        
                        {/* 1. Блок Заголовка + Меню (для мобільного зліва) */}
                        <div className="flex items-center justify-between md:justify-start gap-4">
                            {/* Кнопка "Бургер" - ЗЛІВА (як просив) */}
                            <button 
                                onClick={() => setIsMenuOpen(true)} 
                                className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 hover:text-indigo-600 transition-all active:scale-95"
                                title="Меню"
                            >
                                <FaBars size={20}/>
                            </button>

                            {/* Заголовок */}
                            <div>
                                <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight leading-none">
                                    Управління командою
                                </h1>
                                <p className="text-xs text-gray-500 hidden md:block mt-1">
                                    Powering Your Business
                                </p>
                            </div>
                        </div>

                        {/* 2. Вкладки (TABS) */}
                        {/* flex-1: Займає вільний простір на ПК 
                           w-full: На мобільному на всю ширину
                        */}
                        <div className="bg-slate-100 p-1 rounded-xl flex w-full md:max-w-md lg:max-w-lg">
                            {tabs.map((tab) => {
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`
                                            flex-1 flex items-center justify-center space-x-2 py-2 px-2 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap relative
                                            ${isActive 
                                                ? "bg-white text-indigo-600 shadow-sm ring-1 ring-black/5 z-10" 
                                                : "text-gray-500 hover:text-gray-700 hover:bg-slate-200/50"}
                                        `}
                                    >
                                        <tab.icon className={isActive ? "text-indigo-600" : "text-gray-400"} />
                                        <span>{tab.label}</span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* 3. Пустий блок для балансу на ПК або додаткові дії (необов'язково) */}
                        <div className="hidden md:block w-10"></div> 
                    </div>
                </div>
            </header>

            {/* --- ОСНОВНИЙ КОНТЕНТ --- */}
            <main className="flex-1 relative w-full h-full bg-slate-50 overflow-hidden">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }} // Дуже швидка анімація
                        className="absolute inset-0 w-full h-full overflow-y-auto scroll-smooth"
                    >
                        {/* Контейнер для вмісту */}
                        <div className="min-h-full"> 
                            {activeTab === "team" && <EmployeeList />}
                            {activeTab === "planning" && <WorkCalendar />}
                            {activeTab === "timeoff" && <TimeOffManager />}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </main>

        </div>
    );
}