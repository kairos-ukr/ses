import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaFileExcel, FaArrowDown, FaArrowUp, FaExchangeAlt, 
    FaTrash, FaLock, FaUnlock, FaFileAlt, FaCheck, FaExclamationTriangle, 
    FaTimes, FaInfoCircle, FaHistory, FaCalendarAlt
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

// --- ДОПОМІЖНІ КОМПОНЕНТИ ---
const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }
    }, [isVisible, onClose]);
    const styles = { success: 'bg-emerald-600', error: 'bg-red-600' };
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 right-4 z-[100]">
                    <div className={`${styles[type] || 'bg-blue-600'} text-white rounded-xl shadow-2xl p-4 flex items-center space-x-3`}>
                        {type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
                        <span className="font-bold text-sm">{message}</span>
                        <button onClick={onClose} className="ml-4 text-white/80 hover:text-white"><FaTimes /></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

// Конфігурація типів операцій
const OP_CONFIG = {
    'purchase': { label: 'Прихід', icon: FaArrowDown, color: 'text-emerald-700 bg-emerald-100 border-emerald-200', sign: '+', signColor: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    'issue': { label: 'Видача', icon: FaArrowUp, color: 'text-amber-700 bg-amber-100 border-amber-200', sign: '-', signColor: 'text-amber-700 bg-amber-50 border-amber-200' },
    'return': { label: 'Повернення', icon: FaArrowDown, color: 'text-teal-700 bg-teal-100 border-teal-200', sign: '+', signColor: 'text-teal-700 bg-teal-50 border-teal-200' },
    'transfer': { label: 'Переміщення', icon: FaExchangeAlt, color: 'text-indigo-700 bg-indigo-100 border-indigo-200', sign: '=', signColor: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
    'writeoff': { label: 'Списання', icon: FaTrash, color: 'text-rose-700 bg-rose-100 border-rose-200', sign: '-', signColor: 'text-rose-700 bg-rose-50 border-rose-200' },
    'reserve': { label: 'Резерв', icon: FaLock, color: 'text-purple-700 bg-purple-100 border-purple-200', sign: '0', signColor: 'text-purple-700 bg-purple-50 border-purple-200' },
    'unreserve': { label: 'Зняття рез.', icon: FaUnlock, color: 'text-slate-600 bg-slate-200 border-slate-300', sign: '0', signColor: 'text-slate-600 bg-slate-100 border-slate-200' },
};

// Приймаємо externalSearch від батьківського компонента (InventoryWorkspace)
export default function StockMovementsPage({ externalSearch = '' }) {
    const { loading: authLoading } = useAuth();
    
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [dicts, setDicts] = useState({ nom: {}, emp: {}, wh: {}, inst: {}, sup: {}, po: {} });
    
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // Фільтри (пошук тепер зовнішній)
    const [typeFilter, setTypeFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    
    // Пагінація
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: movData, error: movErr } = await supabase
                .from('stock_movements')
                .select('*')
                .order('operation_date', { ascending: false })
                .limit(1500); 
            if (movErr) throw movErr;

            const [nomRes, catRes, empRes, whRes, instRes, supRes, poRes, poItemsRes, resRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(code, name)'),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('employees').select('id, name'),
                supabase.from('warehouses').select('id, name'),
                supabase.from('installations').select('custom_id, name'),
                supabase.from('suppliers').select('id, name'),
                supabase.from('purchase_orders').select('id, order_number, supplier_id'),
                supabase.from('purchase_order_items').select('id, purchase_order_id'),
                supabase.from('reservations').select('id, installation_custom_id')
            ]);

            const d = { nom: {}, emp: {}, wh: {}, inst: {}, sup: {}, po: {}, poItem: {}, res: {} };
            
            (empRes.data || []).forEach(e => d.emp[e.id] = e.name);
            (whRes.data || []).forEach(w => d.wh[w.id] = w.name);
            (instRes.data || []).forEach(i => d.inst[i.custom_id] = i.name);
            (supRes.data || []).forEach(s => d.sup[s.id] = s.name);
            (poRes.data || []).forEach(p => d.po[p.id] = p);
            (poItemsRes.data || []).forEach(pi => d.poItem[pi.id] = pi);
            (resRes.data || []).forEach(r => d.res[r.id] = r);

            const cats = catRes.data || [];
            (nomRes.data || []).forEach(item => {
                let path = [];
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } 
                    else break;
                }
                d.nom[item.id] = {
                    fullName: `${path.join(' ')} ${item.name}`.trim(),
                    sku: item.sku,
                    unitCode: item.unit?.code || item.unit?.name || 'шт'
                };
            });

            setDicts(d);
            setMovements(movData || []);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

    // --- ФОРМУВАННЯ ДАНИХ ДЛЯ РЯДКА ---
    const buildRowData = (mov) => {
        const conf = OP_CONFIG[mov.operation_type] || { label: 'Інше', icon: FaInfoCircle, color: 'text-slate-500 bg-slate-100', sign: '', signColor: 'bg-slate-100 text-slate-600' };
        const nom = dicts.nom[mov.nomenclature_id] || { fullName: 'Невідомий товар', unitCode: 'шт', sku: '' };
        const empName = dicts.emp[mov.performed_by || mov.created_by] || 'Система';

        let from = '---';
        let to = '---';
        let docStr = mov.reference_document || '';

        if (mov.operation_type === 'purchase') {
            if (mov.purchase_order_item_id) {
                const poItem = dicts.poItem[mov.purchase_order_item_id];
                if (poItem) {
                    const po = dicts.po[poItem.purchase_order_id];
                    from = po ? `Постачальник "${dicts.sup[po.supplier_id] || '?'}"` : 'Постачальник';
                    if (!docStr && po) docStr = po.order_number;
                }
            } else {
                from = 'Ручний прихід';
            }
            to = dicts.wh[mov.warehouse_to_id] || 'Склад';
        } else if (mov.operation_type === 'issue') {
            from = dicts.wh[mov.warehouse_from_id] || 'Склад';
            to = `Об'єкт #${mov.installation_custom_id}`;
        } else if (mov.operation_type === 'return') {
            from = `Об'єкт #${mov.installation_custom_id}`;
            to = dicts.wh[mov.warehouse_to_id] || 'Склад';
        } else if (mov.operation_type === 'transfer') {
            from = dicts.wh[mov.warehouse_from_id] || 'Склад';
            to = dicts.wh[mov.warehouse_to_id] || 'Склад';
        } else if (mov.operation_type === 'writeoff') {
            from = dicts.wh[mov.warehouse_from_id] || 'Склад';
            to = 'Списано (Втрата)';
        } else if (mov.operation_type === 'reserve' || mov.operation_type === 'unreserve') {
            const resInstId = mov.reservation_id ? dicts.res[mov.reservation_id]?.installation_custom_id : null;
            const objName = resInstId ? `Об'єкт #${resInstId}` : 'Об\'єкт';
            if (mov.operation_type === 'reserve') {
                from = dicts.wh[mov.warehouse_from_id] || 'Склад';
                to = `Резерв під ${objName}`;
            } else {
                from = `Резерв під ${objName}`;
                to = dicts.wh[mov.warehouse_from_id] || 'Склад';
            }
        }

        const routeStr = `${from} → ${to}`;
        if (!docStr) docStr = 'Без документу';

        return { conf, nom, empName, routeStr, docStr };
    };

    // --- ФІЛЬТРАЦІЯ ТА ПАГІНАЦІЯ ---
    const processedMovements = movements.map(m => ({ ...m, ...buildRowData(m) }));

    const filteredMovements = processedMovements.filter(m => {
        // Фільтр за зовнішнім текстом (з батьківського компонента)
        const term = externalSearch.toLowerCase();
        const matchesSearch = 
            m.nom.fullName.toLowerCase().includes(term) || 
            (m.nom.sku && m.nom.sku.toLowerCase().includes(term)) ||
            m.docStr.toLowerCase().includes(term) ||
            m.routeStr.toLowerCase().includes(term) ||
            m.empName.toLowerCase().includes(term);
            
        // Фільтр за типом
        const matchesType = typeFilter === 'all' || m.operation_type === typeFilter;

        // Фільтр за датами
        const opDate = new Date(m.operation_date || m.created_at);
        const matchesDateFrom = !dateFrom || opDate >= new Date(dateFrom);
        const matchesDateTo = !dateTo || opDate <= new Date(dateTo + 'T23:59:59.999Z');

        return matchesSearch && matchesType && matchesDateFrom && matchesDateTo;
    });

    const totalPages = Math.ceil(filteredMovements.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredMovements.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Скидання пагінації при зміні будь-якого фільтра
    useEffect(() => { setCurrentPage(1); }, [externalSearch, typeFilter, dateFrom, dateTo]);

    // --- ЕКСПОРТ В EXCEL ---
    const handleExportExcel = () => {
        const dataToExport = filteredMovements.map(m => {
            const d = new Date(m.operation_date || m.created_at);
            return {
                'Дата': d.toLocaleDateString('uk-UA'),
                'Час': d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
                'Операція': m.conf.label,
                'Назва товару': m.nom.fullName,
                'SKU': m.nom.sku || '',
                'Кількість': `${m.conf.sign !== '0' ? m.conf.sign : ''}${parseFloat(m.quantity)}`,
                'Од. вим.': m.nom.unitCode,
                'Документ': m.docStr,
                'Маршрут (Звідки -> Куди)': m.routeStr,
                'Відповідальний': m.empName,
                'Коментар': m.notes || ''
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Рух_Товарів");
        XLSX.writeFile(workbook, `Рух_Товарів_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500">Завантаження...</div>;

    return (
        <div className="flex flex-col h-full w-full">
            <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

            {/* --- ФІЛЬТРИ ТА ЕКСПОРТ --- */}
            <div className="flex flex-col xl:flex-row gap-4 mb-4 bg-white p-4 rounded-[16px] border border-slate-200 shadow-sm flex-none">
                
                <div className="flex-1 flex flex-col sm:flex-row gap-4 items-center">
                    {/* Фільтр по датах */}
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-2.5 rounded-xl border border-transparent focus-within:bg-white focus-within:border-indigo-300 transition-colors w-full sm:w-auto">
                        <FaCalendarAlt className="text-slate-400 flex-shrink-0" />
                        <div className="flex items-center gap-2">
                            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer" title="Початкова дата" />
                            <span className="text-slate-400 font-bold">-</span>
                            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer" title="Кінцева дата" />
                        </div>
                    </div>
                    
                    {/* Тип операції (таби-фільтри) */}
                    <div className="flex bg-slate-50 rounded-xl p-1.5 overflow-x-auto hide-scrollbar w-full sm:w-auto">
                        <button onClick={() => setTypeFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${typeFilter === 'all' ? 'bg-[#0F172A] text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>Всі</button>
                        <button onClick={() => setTypeFilter('purchase')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${typeFilter === 'purchase' ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>Приходи</button>
                        <button onClick={() => setTypeFilter('issue')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${typeFilter === 'issue' ? 'bg-amber-100 text-amber-800 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>Видачі</button>
                        <button onClick={() => setTypeFilter('transfer')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${typeFilter === 'transfer' ? 'bg-indigo-100 text-indigo-800 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>Переміщення</button>
                    </div>
                </div>

                <button onClick={handleExportExcel} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold hover:bg-emerald-100 transition-colors flex-shrink-0 shadow-sm w-full xl:w-auto">
                    <FaFileExcel size={16} /> Експортувати в Excel
                </button>
            </div>

            {/* --- ТАБЛИЦЯ --- */}
            <div className="bg-white rounded-[16px] shadow-sm border border-slate-200 flex-1 flex flex-col mb-4 overflow-hidden min-h-0">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                        <FaHistory className="text-6xl text-slate-200 mb-4" />
                        <h3 className="text-lg font-bold text-slate-600">Немає записів</h3>
                        <p className="text-slate-400 text-sm mt-1">Спробуйте змінити критерії пошуку чи фільтрації.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto flex-1 custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                    <th className="px-5 py-4 w-28">Дата</th>
                                    <th className="px-4 py-4 min-w-[250px]">Операція / Товар</th>
                                    <th className="px-4 py-4 w-28 text-center">Кількість</th>
                                    <th className="px-4 py-4 min-w-[200px]">Документ / Маршрут</th>
                                    <th className="px-5 py-4 w-40 text-right">Відповідальний</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedItems.map(m => {
                                    const d = new Date(m.operation_date || m.created_at);
                                    const OpIcon = m.conf.icon;

                                    return (
                                        <tr key={m.id} className="hover:bg-slate-50/70 transition-colors group">
                                            {/* Дата і Час */}
                                            <td className="px-5 py-4 w-28 whitespace-nowrap align-middle border-r border-slate-50">
                                                <div className="font-bold text-slate-800 text-[13px]">{d.toLocaleDateString('uk-UA')}</div>
                                                <div className="text-[11px] text-slate-400 font-medium mt-1">{d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                                            </td>
                                            
                                            {/* Операція + Товар */}
                                            <td className="px-4 py-4 align-middle">
                                                <div className="flex items-start gap-3">
                                                    <div className={`mt-0.5 flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${m.conf.color}`}>
                                                        <OpIcon size={10} /> {m.conf.label}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-900 text-sm leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2 pr-4">{m.nom.fullName}</div>
                                                        {m.nom.sku && <div className="text-[10px] text-slate-400 font-mono mt-1.5 tracking-widest uppercase bg-slate-100 px-1.5 py-0.5 rounded w-fit">SKU: {m.nom.sku}</div>}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Кількість */}
                                            <td className="px-4 py-4 w-28 text-center align-middle border-x border-slate-50">
                                                <div className={`inline-block px-3 py-1.5 rounded-lg border shadow-sm ${m.conf.signColor}`}>
                                                    <span className="font-black text-[15px]">
                                                        {m.conf.sign !== '0' && m.conf.sign}{parseFloat(m.quantity)}
                                                    </span>
                                                    <span className="text-[11px] font-bold uppercase ml-1.5 opacity-80">{m.nom.unitCode}</span>
                                                </div>
                                            </td>

                                            {/* Документ та Маршрут */}
                                            <td className="px-4 py-4 align-middle">
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center flex-shrink-0">
                                                            <FaFileAlt className="text-slate-400 text-xs"/>
                                                        </div>
                                                        <span className="font-bold text-slate-700 text-xs uppercase tracking-wide truncate" title={m.docStr}>{m.docStr}</span>
                                                    </div>
                                                    <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5 line-clamp-2" title={m.routeStr}>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0 inline-block"></span>
                                                        <span className="leading-tight">{m.routeStr}</span>
                                                    </div>
                                                </div>
                                                {m.notes && <div className="text-[10px] text-slate-400 italic mt-2 p-1.5 bg-slate-50 rounded border border-slate-100 line-clamp-1" title={m.notes}><span className="font-bold">Комент:</span> {m.notes}</div>}
                                            </td>

                                            {/* Відповідальний */}
                                            <td className="px-5 py-4 w-40 text-right align-middle border-l border-slate-50">
                                                <div className="inline-flex items-center justify-end gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 w-full">
                                                    <div className="w-5 h-5 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                                                        {m.empName.charAt(0)}
                                                    </div>
                                                    <span className="font-bold text-slate-600 text-xs truncate" title={m.empName}>{m.empName}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* --- ПАГІНАЦІЯ (Рівно 10 позицій) --- */}
            {filteredMovements.length > 0 && (
                <div className="flex justify-between items-center bg-white px-5 py-3.5 rounded-[16px] border border-slate-200 shadow-sm flex-none">
                    <span className="text-sm text-slate-500 font-medium">
                        Показано <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, filteredMovements.length)}</span> із <span className="font-bold text-slate-800">{filteredMovements.length}</span>
                    </span>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                            disabled={currentPage === 1} 
                            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-600 transition-colors shadow-sm"
                        >
                            Попередня
                        </button>
                        <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 text-sm font-bold text-slate-700 shadow-inner">
                            {currentPage} / {totalPages || 1}
                        </div>
                        <button 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                            disabled={currentPage === totalPages || totalPages === 0} 
                            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-slate-600 transition-colors shadow-sm"
                        >
                            Наступна
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}