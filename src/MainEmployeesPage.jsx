import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FaUsers, FaCalendarAlt, FaUmbrellaBeach, FaUserTie 
} from "react-icons/fa";
import Layout from "./Layout";

// Імпорт твоїх робочих компонентів
import EmployeeList from "./EmployeeList";
import WorkCalendar from "./WorkCalendar";
import TimeOffManager from "./TimeOffManager";

export default function MainEmployeesPage() {
    // Активна вкладка (default: team)
    const [activeTab, setActiveTab] = useState("team");

    const tabs = [
        { id: "team", label: "Огляд", icon: FaUsers },
        { id: "planning", label: "Календар", icon: FaCalendarAlt },
        { id: "timeoff", label: "Вихідні", icon: FaUmbrellaBeach },
    ];

    return (
        <Layout>
            <div className="flex flex-col min-h-full bg-slate-50">
                
                {/* --- HEADER (Sticky) --- */}
                <div className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-sm">
                    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            
                            {/* Заголовок сторінки */}
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                                    <FaUserTie className="text-indigo-600"/> 
                                    Управління командою
                                </h1>
                                <p className="text-xs text-slate-500 mt-1 font-medium">
                                    Персонал, планування та облік часу
                                </p>
                            </div>

                            {/* Таби навігації */}
                            {/* FIX: Використовуємо GRID замість FLEX, щоб прибрати скрол і розділити ширину порівну */}
                            <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                                {tabs.map((tab) => {
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`
                                                flex items-center justify-center gap-2 px-2 md:px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200 whitespace-nowrap
                                                ${isActive 
                                                    ? "bg-white text-indigo-600 shadow-sm ring-1 ring-black/5" 
                                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}
                                            `}
                                        >
                                            <tab.icon className={isActive ? "text-indigo-600" : "text-slate-400"} />
                                            {/* На дуже малих екранах можна ховати текст, якщо треба, але grid має вмістити */}
                                            <span>{tab.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- CONTENT AREA --- */}
                <div className="flex-1 w-full max-w-[1600px] mx-auto">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="h-full"
                        >
                            {/* Рендеринг активного компонента */}
                            {activeTab === "team" && (
                                <div className="pb-safe">
                                    <EmployeeList />
                                </div>
                            )}
                            
                            {activeTab === "planning" && (
                                <div className="h-full">
                                    <WorkCalendar />
                                </div>
                            )}
                            
                            {activeTab === "timeoff" && (
                                <div className="h-full">
                                    <TimeOffManager />
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

            </div>
        </Layout>
    );
}