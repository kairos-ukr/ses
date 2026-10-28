import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaSearch, FaPlus, FaWarehouse } from 'react-icons/fa';

import { useAuth } from '../AuthProvider';
import { WorkspaceShell } from '../ui/shell';
import { INVENTORY_SECTIONS, sectionsFor } from '../navigation';
import WarehousePage from './WarehousePage';
import ToolsPage from './ToolsPage';
import PurchasesPage from './PurchasesPage';
import StockMovementsPage from './StockMovementsPage';
import IssueOrdersPage from './warehouse/IssueOrdersPage';
import CategoriesAdminPage from './CategoriesAdminPage';
import EquipmentBase from '../EquipmentBase';
import CostPricesPanel from './CostPricesPanel';
import { hasIssueOrders } from '../utils/features';

// Склад — окремий робочий простір зі своїм меню (як окрема програма),
// у тій самій стилістиці, що й CRM. Відкритий розділ — в адресі
// (?tab=…), тож на нього можна дати посилання, а пошук Ctrl+K
// відкриває товар через ?q=…

// Розділи, що працюють із пошуком і головною кнопкою в шапці
const WITH_TOOLBAR = ['stock', 'issue', 'movements', 'purchases', 'tools'];

const SearchBox = ({ value, onChange, className = '' }) => (
    <div className={`relative ${className}`}>
        <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" />
        <input
            type="text"
            placeholder="Пошук у розділі…"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full pl-10 pr-4 h-10 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 outline-none transition-all text-sm text-slate-700"
        />
    </div>
);

export default function InventoryWorkspace() {
    const auth = useAuth();
    const [params, setParams] = useSearchParams();
    const [globalSearch, setGlobalSearch] = useState(() => params.get('q') || '');

    // Розділ «Видача» з'являється після міграції issue_orders
    const [issueReady, setIssueReady] = useState(false);
    useEffect(() => { hasIssueOrders().then(setIssueReady); }, []);

    const sections = useMemo(
        () => sectionsFor(INVENTORY_SECTIONS, auth).filter(s => s.id !== 'issue' || issueReady),
        [auth, issueReady]
    );

    // Відкритий розділ з адреси, інакше перший доступний людині
    const activeTab = sections.some(s => s.id === params.get('tab')) ? params.get('tab') : (sections[0]?.id || 'stock');
    const current = sections.find(s => s.id === activeTab) || sections[0];
    const toolbar = WITH_TOOLBAR.includes(activeTab);

    // Перехід з пошуку Ctrl+K на іншу позицію, коли склад уже відкритий
    useEffect(() => {
        const q = params.get('q');
        if (q !== null) setGlobalSearch(q);
    }, [params]);

    // Стейт-тригер головної кнопки дії. Інкрементується при кожному натисканні.
    const [actionTrigger, setActionTrigger] = useState(0);

    const switchTab = (id, extra = {}) => {
        setParams({ tab: id, ...extra }, { replace: true });
        setGlobalSearch('');
    };

    return (
        <WorkspaceShell
            title="Склад"
            icon={FaWarehouse}
            sections={sections}
            active={activeTab}
            onSelect={switchTab}
            // На ПК таблиці гортаються всередині себе; на телефоні — уся сторінка, щоб у
            // альбомній орієнтації список не стискався до кількох рядків
            mainClass={toolbar ? 'flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-2.5 sm:p-3 pb-24 short:pb-14 lg:pb-3 flex flex-col' : undefined}
            bodyClass={toolbar ? 'flex flex-col lg:flex-1 lg:min-h-0' : undefined}
            actions={toolbar && (
                <>
                    <SearchBox value={globalSearch} onChange={setGlobalSearch} className="hidden md:block w-56 xl:w-80 flex-shrink-0" />
                    {current && auth.can(current.section, 'add') && <button
                        onClick={() => setActionTrigger(prev => prev + 1)}
                        className="flex items-center gap-2 px-3.5 sm:px-4 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-[13px] transition-colors whitespace-nowrap flex-shrink-0 shadow-sm"
                        title={current.action}
                    >
                        <FaPlus size={11} />
                        <span className="hidden sm:inline">{current.action}</span>
                    </button>}
                </>
            )}
            below={toolbar && (
                <div className="pb-2.5 md:hidden">
                    <SearchBox value={globalSearch} onChange={setGlobalSearch} />
                </div>
            )}
        >
            {activeTab === 'stock' && <WarehousePage externalSearch={globalSearch} externalActionTrigger={actionTrigger} initialStockMode={params.get('stock')} />}
            {activeTab === 'issue' && <IssueOrdersPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
            {activeTab === 'movements' && <StockMovementsPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
            {activeTab === 'purchases' && <PurchasesPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
            {activeTab === 'tools' && <ToolsPage externalSearch={globalSearch} externalActionTrigger={actionTrigger} />}
            {activeTab === 'price' && <EquipmentBase />}
            {activeTab === 'categories' && <CategoriesAdminPage />}
            {activeTab === 'costs' && <CostPricesPanel />}
        </WorkspaceShell>
    );
}
