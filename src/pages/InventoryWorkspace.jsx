import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaBox,
    FaSearch,
    FaPlus,
    FaToolbox,
    FaShoppingCart,
    FaExchangeAlt,
    FaWarehouse,
    FaClipboardList,
    FaArrowLeft
} from 'react-icons/fa';

import WarehousePage from './WarehousePage';
import ToolsPage from './ToolsPage';
import PurchasesPage from './PurchasesPage';
import StockMovementsPage from './StockMovementsPage';
import IssueOrdersPage from './warehouse/IssueOrdersPage';
import { hasIssueOrders } from '../utils/features';

// Розділи складського сервісу — власне бічне меню, окреме від CRM
const ALL_SECTIONS = [
    { id: 'stock', label: 'Залишки', icon: FaWarehouse, title: 'Залишки та номенклатура', action: 'Додати товар' },
    { id: 'issue', label: 'Видача', icon: FaClipboardList, title: 'Документи видачі', action: 'Новий документ' },
    { id: 'movements', label: 'Рух товарів', icon: FaExchangeAlt, title: 'Рух товарів', action: 'Видача / Продаж' },
    { id: 'purchases', label: 'Закупівлі', icon: FaShoppingCart, title: 'Закупівлі та постачання', action: 'Замовлення / Імпорт' },
    { id: 'tools', label: 'Інструмент', icon: FaToolbox, title: 'Інструмент та інвентар', action: 'Видати інвентар' },
];

export default function InventoryWorkspace() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('stock');
    const [globalSearch, setGlobalSearch] = useState('');

    // Розділ «Видача» з'являється після міграції issue_orders
    const [issueReady, setIssueReady] = useState(false);
    useEffect(() => { hasIssueOrders().then(setIssueReady); }, []);

    const SECTIONS = useMemo(
        () => ALL_SECTIONS.filter(s => s.id !== 'issue' || issueReady),
        [issueReady]
    );

    // Стейт-тригер головної кнопки дії. Інкрементується при кожному натисканні.
    const [actionTrigger, setActionTrigger] = useState(0);

    const current = SECTIONS.find(s => s.id === activeTab) || SECTIONS[0];

    const switchTab = (id) => {
        if (id === activeTab) return;
        setActiveTab(id);
        setGlobalSearch('');
    };

    return (
        <div className="flex h-[100dvh] w-full bg-slate-100 overflow-hidden text-slate-800">

            {/* --- БІЧНЕ МЕНЮ СКЛАДУ (DESKTOP) --- */}
            <aside className="hidden lg:flex flex-col w-60 bg-[#0F172A] text-white flex-shrink-0">
                <div className="p-5 flex items-center gap-3 border-b border-white/10 min-h-[72px]">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FaBox className="text-[#F59E0B] text-xl" />
                    </div>
                    <div>
                        <div className="font-black tracking-widest text-sm leading-tight">СКЛАД</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">K-Core</div>
                    </div>
                </div>

                <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
                    {SECTIONS.map(s => {
                        const isActive = activeTab === s.id;
                        return (
                            <button
                                key={s.id}
                                onClick={() => switchTab(s.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-colors ${isActive
                                    ? 'bg-[#F59E0B] text-slate-900 shadow-lg shadow-amber-950/40'
                                    : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                            >
                                <s.icon size={16} className={isActive ? 'text-slate-900' : 'text-slate-500'} />
                                {s.label}
                            </button>
                        );
                    })}
                </nav>

                <div className="p-3 border-t border-white/10">
                    <button
                        onClick={() => navigate('/my-workflow')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                        <FaArrowLeft size={14} className="text-slate-500" /> До CRM
                    </button>
                </div>
            </aside>

            {/* --- ОСНОВНА ЧАСТИНА --- */}
            <div className="flex-1 flex flex-col min-w-0 h-full">

                {/* Хедер: заголовок розділу + пошук + головна дія */}
                <header className="bg-white border-b border-slate-200 flex-shrink-0 z-30">
                    <div className="px-3 sm:px-5 py-3 flex items-center gap-2 sm:gap-3">
                        <button
                            onClick={() => navigate('/my-workflow')}
                            className="lg:hidden p-2.5 text-slate-500 bg-slate-50 rounded-xl border border-slate-100 flex-shrink-0"
                            title="Повернутись до CRM"
                        >
                            <FaArrowLeft size={15} />
                        </button>

                        <h1 className="text-sm sm:text-lg font-black text-[#0F172A] uppercase tracking-tight truncate flex-1 min-w-0">
                            {current.title}
                        </h1>

                        <div className="relative hidden md:block w-56 xl:w-80 flex-shrink-0">
                            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                            <input
                                type="text"
                                placeholder="Пошук..."
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                className="w-full pl-10 pr-4 h-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-sm font-medium text-slate-700"
                            />
                        </div>

                        <button
                            onClick={() => setActionTrigger(prev => prev + 1)}
                            className="flex items-center gap-2 px-3.5 sm:px-5 h-10 bg-[#0F172A] hover:bg-slate-800 text-white rounded-xl font-bold uppercase text-[11px] tracking-wider transition-colors shadow-md whitespace-nowrap flex-shrink-0"
                        >
                            <FaPlus size={11} />
                            <span className="hidden sm:inline">{current.action}</span>
                        </button>
                    </div>

                    {/* Пошук на мобільному — окремим рядком */}
                    <div className="px-3 pb-3 md:hidden">
                        <div className="relative">
                            <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
                            <input
                                type="text"
                                placeholder="Пошук..."
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                className="w-full pl-10 pr-4 h-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-sm font-medium text-slate-700"
                            />
                        </div>
                    </div>
                </header>

                {/* Контент розділу */}
                <main className="flex-1 min-h-0 p-2.5 sm:p-3 pb-24 lg:pb-3 flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className="flex-1 flex flex-col min-h-0"
                        >
                            {activeTab === 'stock' && <WarehousePage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                            {activeTab === 'issue' && <IssueOrdersPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                            {activeTab === 'movements' && <StockMovementsPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                            {activeTab === 'purchases' && <PurchasesPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                            {activeTab === 'tools' && <ToolsPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
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
                            onClick={() => switchTab(s.id)}
                            className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors"
                        >
                            <s.icon size={18} className={isActive ? 'text-[#F59E0B]' : 'text-slate-400'} />
                            <span className={`text-[10px] font-bold ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>{s.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
