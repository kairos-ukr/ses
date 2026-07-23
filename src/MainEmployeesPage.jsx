import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    FaUsers, FaCalendarAlt, FaUmbrellaBeach, FaUserTie, FaArrowLeft, FaRoute
} from "react-icons/fa";

import EmployeeList from "./EmployeeList";
import WorkCalendar from "./WorkCalendar";
import TimeOffManager from "./TimeOffManager";
import PlannedVisitsPage from "./PlannedVisitsPage";

// Розділи сервісу «Персонал» — власне меню, окреме від CRM (як у складу)
const SECTIONS = [
    { id: "team", label: "Команда", icon: FaUsers, title: "Команда та персонал" },
    { id: "planning", label: "Календар", icon: FaCalendarAlt, title: "Робочий календар" },
    { id: "visits", label: "Виїзди", icon: FaRoute, title: "Планування виїздів" },
    { id: "timeoff", label: "Вихідні", icon: FaUmbrellaBeach, title: "Вихідні та відпустки" },
];

export default function MainEmployeesPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState("team");

    const current = SECTIONS.find(s => s.id === activeTab) || SECTIONS[0];

    return (
        <div className="flex h-[100dvh] w-full bg-slate-100 overflow-hidden text-slate-800">

            {/* --- БІЧНЕ МЕНЮ ПЕРСОНАЛУ (DESKTOP) --- */}
            <aside className="hidden lg:flex flex-col w-60 bg-[#0F172A] text-white flex-shrink-0">
                <div className="p-5 flex items-center gap-3 border-b border-white/10 min-h-[72px]">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FaUserTie className="text-indigo-400 text-xl" />
                    </div>
                    <div>
                        <div className="font-black tracking-widest text-sm leading-tight">ПЕРСОНАЛ</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">K-Core</div>
                    </div>
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
                    {SECTIONS.map(s => {
                        const isActive = activeTab === s.id;
                        return (
                            <button
                                key={s.id}
                                onClick={() => setActiveTab(s.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${isActive
                                    ? "bg-indigo-500 text-white shadow-lg shadow-indigo-950/40"
                                    : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                            >
                                <s.icon size={16} className={isActive ? "text-white" : "text-slate-500"} />
                                {s.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-white/10">
                    <button
                        onClick={() => navigate("/my-workflow")}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                        <FaArrowLeft size={14} className="text-slate-500" /> До CRM
                    </button>
                </div>
            </aside>

            {/* --- ОСНОВНА ЧАСТИНА --- */}
            <div className="flex-1 flex flex-col min-w-0 h-full">

                {/* Хедер */}
                <header className="bg-white border-b border-slate-200 flex-shrink-0 z-30">
                    <div className="px-3 sm:px-5 py-3 flex items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => navigate("/my-workflow")}
                            className="lg:hidden p-2.5 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 flex-shrink-0"
                            title="Повернутись до CRM"
                        >
                            <FaArrowLeft size={15} />
                        </button>
                        <h1 className="text-sm sm:text-lg font-black text-[#0F172A] uppercase tracking-tight truncate flex-1 min-w-0">
                            {current.title}
                        </h1>
                    </div>
                </header>

                {/* Контент розділу */}
                <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-24 lg:pb-0">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="min-h-full"
                        >
                            {activeTab === "team" && <EmployeeList />}
                            {activeTab === "planning" && <WorkCalendar />}
                            {activeTab === "visits" && <PlannedVisitsPage embedded />}
                            {activeTab === "timeoff" && <TimeOffManager />}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* --- НИЖНЯ НАВІГАЦІЯ (MOBILE / TABLET) --- */}
            <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-40 pb-safe shadow-[0_-4px_16px_rgba(15,23,42,0.08)]">
                {SECTIONS.map(s => {
                    const isActive = activeTab === s.id;
                    return (
                        <button
                            key={s.id}
                            onClick={() => setActiveTab(s.id)}
                            className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
                        >
                            <s.icon size={18} className={isActive ? "text-indigo-500" : "text-slate-400"} />
                            <span className={`text-[10px] font-bold ${isActive ? "text-slate-900" : "text-slate-400"}`}>{s.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
