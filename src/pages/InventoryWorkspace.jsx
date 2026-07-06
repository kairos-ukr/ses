import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaBox, 
    FaSearch, 
    FaPlus, 
    FaListUl, 
    FaToolbox, 
    FaShoppingCart, 
    FaExchangeAlt 
} from 'react-icons/fa';

import Layout from '../Layout';

import WarehousePage from './WarehousePage';
import ToolsPage from './ToolsPage';
import PurchasesPage from './PurchasesPage';
import StockMovementsPage from './StockMovementsPage';

export default function InventoryWorkspace() {
    const [activeTab, setActiveTab] = useState('warehouse');
    const [globalSearch, setGlobalSearch] = useState('');
    
    // Стейт-тригер для кнопки дій. Змінюється щоразу, коли натискають кнопку.
    const [actionTrigger, setActionTrigger] = useState(0);

    const TABS = [
        { id: 'warehouse', label: 'Склад', icon: FaListUl },
        { id: 'tools', label: 'Інвентар', icon: FaToolbox },
        { id: 'purchases', label: 'Закупівлі (PO)', icon: FaShoppingCart },
        { id: 'movements', label: 'Рух товарів', icon: FaExchangeAlt },
    ];

    const getTabConfig = () => {
        switch (activeTab) {
            case 'warehouse':
                return { title: 'СКЛАД ТА НОМЕНКЛАТУРА', actionText: 'ДОДАТИ ТОВАР' };
            case 'tools':
                return { title: 'ІНВЕНТАР ТА ІНСТРУМЕНТ', actionText: 'ВИДАТИ ІНВЕНТАР' };
            case 'purchases':
                return { 
                    title: 'ЗАКУПІВЛІ ТА ПОСТАЧАННЯ', 
                    actionText: 'СТВОРИТИ/ІМПОРТ ЗАМОВЛЕННЯ',
                };
            case 'movements':
                return { title: 'ІСТОРІЯ РУХУ ТОВАРІВ', actionText: 'ВИДАЧА / ПРОДАЖ' };
            default:
                return { title: 'СКЛАД', actionText: 'ДОДАТИ' };
        }
    };

    const currentConfig = getTabConfig();

    // Обробник натискання головної кнопки (інкрементує тригер)
    const handleMainAction = () => {
        setActionTrigger(prev => prev + 1);
    };

    return (
        <Layout>
            <div className="p-4 sm:p-8 max-w-[1600px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">
                <div className="bg-white rounded-[20px] shadow-sm border border-slate-200 p-5 mb-6 flex-shrink-0">
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-[#0F172A] rounded-xl flex items-center justify-center shadow-md">
                                <FaBox className="text-[#F59E0B] text-2xl" />
                            </div>
                            <h1 className="text-xl sm:text-2xl font-black text-[#0F172A] uppercase tracking-tight">
                                {currentConfig.title}
                            </h1>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                            <div className="relative w-full sm:w-[300px]">
                                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="Пошук..." 
                                    value={globalSearch}
                                    onChange={(e) => setGlobalSearch(e.target.value)}
                                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-sm font-medium text-slate-700 h-[46px]"
                                />
                            </div>
                            <button 
                                onClick={handleMainAction}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-[#0F172A] hover:bg-slate-800 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-lg shadow-slate-800/20 h-[46px] whitespace-nowrap"
                            >
                                <FaPlus size={12} />
                                {currentConfig.actionText}
                            </button>
                        </div>
                    </div>

                    <div className="bg-slate-100/80 p-1.5 rounded-[14px] flex overflow-x-auto hide-scrollbar">
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        flex-1 min-w-[160px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all duration-200
                                        ${isActive 
                                            ? 'bg-white text-[#0F172A] shadow-sm border border-slate-200/50' 
                                            : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 border border-transparent'
                                        }
                                    `}
                                >
                                    <Icon size={14} className={isActive ? 'text-[#0F172A]' : 'text-slate-400'} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="flex-1 flex flex-col h-full"
                        >
                            {/* Передаємо externalActionTrigger у сторінки, щоб вони реагували на клік */}
                            {activeTab === 'warehouse' && <WarehousePage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                            {activeTab === 'tools' && <ToolsPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                            {activeTab === 'purchases' && <PurchasesPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                            {activeTab === 'movements' && <StockMovementsPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </Layout>
    );
}