import React, { useState, useEffect, useCallback, useMemo, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaChevronDown, FaPlus, FaMinus, FaExchangeAlt,
    FaWarehouse, FaCheck, FaExclamationTriangle, FaTimes, FaFileExcel,
    FaMapMarkerAlt, FaHardHat, FaInfoCircle, FaEdit, FaBox, FaHistory,
    FaClipboardList, FaBoxes
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { NomenclatureModal } from './NomenclatureModal';
import ItemMovementHistoryModal from './ItemMovementHistoryModal';
import { printInventorySheet } from '../utils/inventorySheetPdf';

// --- Toast ---
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

// Числа з в'юхи приходять як numeric → рядки. Прибираємо «хвости» плаваючої крапки.
const round3 = (v) => Math.round((parseFloat(v) || 0) * 1000) / 1000;

// Позиція, якої немає в v_warehouse_stock_available (жодного руху) — це не помилка, а нулі.
const EMPTY_BALANCE = Object.freeze({ onHand: 0, reserved: 0, available: 0 });

// Excel забороняє : \ / ? * [ ] у назвах аркушів і обмежує їх 31 символом
const safeSheetName = (name, used) => {
    let base = (name || 'Склад').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 31) || 'Склад';
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) {
        const suffix = ` (${i})`;
        candidate = base.slice(0, 31 - suffix.length) + suffix;
        i += 1;
    }
    used.add(candidate);
    return candidate;
};

const fileDateStr = () => new Date().toISOString().slice(0, 10);

export default function WarehousePage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();

    // Дані
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [balances, setBalances] = useState([]);

    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // Фільтри та Пагінація
    const [warehouseFilter, setWarehouseFilter] = useState('all'); // 'all' | id складу
    const [stockMode, setStockMode] = useState('all');             // 'all' | 'instock'
    const [rootCategoryFilter, setRootCategoryFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    const [expandedRowId, setExpandedRowId] = useState(null);

    // Модалки — складські операції
    const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
    const [reserveDetails, setReserveDetails] = useState({ isOpen: false, loading: false, data: [], itemName: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isBuildingPdf, setIsBuildingPdf] = useState(false);

    // Модалка — номенклатура
    const [isNomenclatureModalOpen, setIsNomenclatureModalOpen] = useState(false);
    const [editingNomenclatureItem, setEditingNomenclatureItem] = useState(null);

    // Модалка — історія руху товару (по кліку на товар / на склад у розгорнутому рядку)
    const [historyTarget, setHistoryTarget] = useState(null); // { item, warehouseId }

    // Форми
    const [whForm, setWhForm] = useState({ id: null, name: '', address: '', is_active: true });
    const [adjustForm, setAdjustForm] = useState({
        operation: 'purchase', nomenclature_id: null, warehouse_from_id: '', warehouse_to_id: '', warehouse_name: '',
        quantity: '', reference_document: '', notes: ''
    });
    const [selectedItemName, setSelectedItemName] = useState('');

    // --- ВІДСТЕЖЕННЯ СИГНАЛУ З БАТЬКІВСЬКОЇ СТОРІНКИ ---
    const prevActionTrigger = useRef(externalActionTrigger);

    useEffect(() => {
        if (externalActionTrigger > prevActionTrigger.current) {
            openAddNomenclature();
        }
        prevActionTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [nomRes, catRes, whRes, balRes] = await Promise.all([
                supabase.from('nomenclature').select('*, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('*'),
                supabase.from('warehouses').select('*').order('name'),
                supabase.from('v_warehouse_stock_available').select('*')
            ]);

            setCategories(catRes.data || []);
            setWarehouses(whRes.data || []);
            setBalances(balRes.data || []);

            const cats = catRes.data || [];

            const buildFullName = (item) => {
                let path = [];
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); currentId = cat.parent_id; }
                    else break;
                }
                return `${path.join(' ')} ${item.name}`.trim();
            };

            const processedItems = (nomRes.data || []).map(item => ({
                ...item,
                fullName: buildFullName(item),
                rootCategoryId: (() => {
                    let currentId = item.category_id;
                    let rootId = currentId;
                    while (currentId) {
                        const cat = cats.find(c => c.id === currentId);
                        if (cat) { rootId = cat.id; currentId = cat.parent_id; } else break;
                    }
                    return rootId;
                })()
            }));

            setItems(processedItems.sort((a, b) => a.fullName.localeCompare(b.fullName)));
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

    const rootCategories = categories.filter(c => c.parent_id === null && c.is_active);
    const activeWarehouses = useMemo(() => warehouses.filter(w => w.is_active), [warehouses]);

    // --- ІНДЕКСИ ЗАЛИШКІВ ---
    // Замість пошуку .find() по всьому масиву на кожну клітинку — дві мапи, побудовані один раз.
    const balanceMap = useMemo(() => {
        const map = new Map();
        (balances || []).forEach(b => {
            map.set(`${b.nomenclature_id}:${b.warehouse_id}`, {
                onHand: round3(b.quantity_on_hand),
                reserved: round3(b.quantity_reserved),
                available: round3(b.quantity_available),
            });
        });
        return map;
    }, [balances]);

    const itemTotalsMap = useMemo(() => {
        const map = new Map();
        (balances || []).forEach(b => {
            const cur = map.get(b.nomenclature_id) || { onHand: 0, reserved: 0, available: 0 };
            cur.onHand += parseFloat(b.quantity_on_hand || 0);
            cur.reserved += parseFloat(b.quantity_reserved || 0);
            cur.available += parseFloat(b.quantity_available || 0);
            map.set(b.nomenclature_id, cur);
        });
        map.forEach((v, k) => map.set(k, { onHand: round3(v.onHand), reserved: round3(v.reserved), available: round3(v.available) }));
        return map;
    }, [balances]);

    const getItemTotals = useCallback(
        (nomenclatureId) => itemTotalsMap.get(nomenclatureId) || EMPTY_BALANCE,
        [itemTotalsMap]
    );

    const getWarehouseBalance = useCallback(
        (nomenclatureId, warehouseId) => balanceMap.get(`${nomenclatureId}:${warehouseId}`) || EMPTY_BALANCE,
        [balanceMap]
    );

    // --- ОБЛАСТЬ ПЕРЕГЛЯДУ: конкретний склад чи всі разом ---
    const isWhScoped = warehouseFilter !== 'all';
    const scopedWhId = isWhScoped ? Number(warehouseFilter) : null;
    const scopedWarehouse = isWhScoped ? warehouses.find(w => w.id === scopedWhId) : null;

    // Числа, які показуються в таблиці: по обраному складу або сумарно
    const getScopedBalance = useCallback(
        (itemId) => (isWhScoped ? getWarehouseBalance(itemId, scopedWhId) : getItemTotals(itemId)),
        [isWhScoped, scopedWhId, getWarehouseBalance, getItemTotals]
    );

    // Скільки ІНШИХ складів має цю позицію фізично
    const otherWarehousesWithStock = useCallback((itemId) => (
        activeWarehouses.filter(w => w.id !== scopedWhId && getWarehouseBalance(itemId, w.id).onHand > 0).length
    ), [activeWarehouses, scopedWhId, getWarehouseBalance]);

    const handleWarehouseChange = (value) => {
        setWarehouseFilter(value);
        // Обираючи конкретний склад, людина хоче побачити, ЩО там лежить,
        // а не весь довідник номенклатури. Перемикач лишається на екрані — його видно й можна змінити.
        setStockMode(value === 'all' ? 'all' : 'instock');
    };

    // --- ОБРОБНИК ДЕТАЛЕЙ РЕЗЕРВУ ---
    const handleReserveClick = async (e, item) => {
        e.stopPropagation();
        setReserveDetails({ isOpen: true, loading: true, data: [], itemName: item.fullName });
        try {
            let query = supabase
                .from('reservations')
                .select(`id, warehouse_id, reserved_quantity, released_quantity, notes, created_at, installation:installations(name)`)
                .eq('nomenclature_id', item.id)
                .eq('status', 'active');
            if (isWhScoped) query = query.eq('warehouse_id', scopedWhId);

            const { data, error } = await query;
            if (error) throw error;
            const activeReserves = (data || []).map(r => ({
                ...r,
                warehouse_name: warehouses.find(w => w.id === r.warehouse_id)?.name || '—',
                actual_reserved: parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity)
            })).filter(r => r.actual_reserved > 0);
            setReserveDetails(prev => ({ ...prev, loading: false, data: activeReserves }));
        } catch (error) {
            showToast(error.message, 'error');
            setReserveDetails(prev => ({ ...prev, loading: false }));
        }
    };

    // --- ФІЛЬТРАЦІЯ ТА ПАГІНАЦІЯ ---
    const filteredItems = useMemo(() => {
        const term = externalSearch.trim().toLowerCase();
        return items.filter(item => {
            const matchesSearch = !term
                || item.fullName.toLowerCase().includes(term)
                || (item.sku && item.sku.toLowerCase().includes(term));
            if (!matchesSearch) return false;

            const matchesCategory = rootCategoryFilter === '' || item.rootCategoryId === parseInt(rootCategoryFilter);
            if (!matchesCategory) return false;

            if (stockMode === 'instock') {
                const bal = getScopedBalance(item.id);
                if (bal.onHand === 0 && bal.reserved === 0) return false;
            }
            return true;
        });
    }, [items, externalSearch, rootCategoryFilter, stockMode, getScopedBalance]);

    const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
    const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // Скидання сторінки при зміні будь-якого фільтра
    useEffect(() => {
        setCurrentPage(1);
        setExpandedRowId(null);
    }, [externalSearch, rootCategoryFilter, warehouseFilter, stockMode]);

    // Текст, який описує, що саме потрапило у вивантаження — щоб роздрукований аркуш не брехав
    const scopeDescription = () => {
        const parts = [];
        parts.push(isWhScoped ? `склад «${scopedWarehouse?.name || scopedWhId}»` : 'усі склади');
        const cat = rootCategories.find(c => String(c.id) === String(rootCategoryFilter));
        if (cat) parts.push(`категорія «${cat.name}»`);
        if (externalSearch.trim()) parts.push(`пошук «${externalSearch.trim()}»`);
        parts.push(stockMode === 'instock' ? 'лише позиції із залишком' : 'усі позиції номенклатури');
        return parts.join('; ');
    };

    // --- ЕКСПОРТ 1: ЗАЛИШКИ ---
    const handleExportBalances = () => {
        if (filteredItems.length === 0) return showToast('Нічого експортувати: за цими фільтрами порожньо', 'error');

        const workbook = XLSX.utils.book_new();
        const used = new Set();

        if (isWhScoped) {
            // Один склад — один простий аркуш
            const rows = filteredItems.map(item => {
                const bal = getWarehouseBalance(item.id, scopedWhId);
                return {
                    'Найменування': item.fullName,
                    'SKU': item.sku || '',
                    'Од. вим.': item.unit?.name || 'шт',
                    'Фізично': bal.onHand,
                    'У резерві': bal.reserved,
                    'Вільно': bal.available,
                };
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{ wch: 52 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(workbook, ws, safeSheetName(scopedWarehouse?.name, used));
        } else {
            // Усі склади — зведення + розшифровка по складах
            const summaryRows = filteredItems.map(item => {
                const t = getItemTotals(item.id);
                return {
                    'Найменування': item.fullName,
                    'SKU': item.sku || '',
                    'Од. вим.': item.unit?.name || 'шт',
                    'Фізично (всього)': t.onHand,
                    'У резерві': t.reserved,
                    'Вільно': t.available,
                };
            });
            const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
            wsSummary['!cols'] = [{ wch: 52 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(workbook, wsSummary, safeSheetName('Зведено', used));

            const breakdown = [];
            filteredItems.forEach(item => {
                activeWarehouses.forEach(wh => {
                    const bal = getWarehouseBalance(item.id, wh.id);
                    if (bal.onHand === 0 && bal.reserved === 0) return;
                    breakdown.push({
                        'Склад': wh.name,
                        'Найменування': item.fullName,
                        'SKU': item.sku || '',
                        'Од. вим.': item.unit?.name || 'шт',
                        'Фізично': bal.onHand,
                        'У резерві': bal.reserved,
                        'Вільно': bal.available,
                    });
                });
            });
            const wsBreak = XLSX.utils.json_to_sheet(
                breakdown.length ? breakdown : [{ 'Склад': '—', 'Найменування': 'Немає залишків', 'SKU': '', 'Од. вим.': '', 'Фізично': 0, 'У резерві': 0, 'Вільно': 0 }]
            );
            wsBreak['!cols'] = [{ wch: 24 }, { wch: 52 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(workbook, wsBreak, safeSheetName('По складах', used));
        }

        const suffix = isWhScoped ? `_${(scopedWarehouse?.name || '').replace(/\s+/g, '_')}` : '';
        XLSX.writeFile(workbook, `Залишки${suffix}_${fileDateStr()}.xlsx`);
        showToast('Файл залишків сформовано', 'success');
    };

    // --- ЕКСПОРТ 2: ІНВЕНТАРИЗАЦІЙНА ВІДОМІСТЬ (PDF під друк) ---
    // Обліковий залишок заповнений, «Фактично» і «Розбіжність» — порожні,
    // їх заповнює комірник ручкою під час перерахунку.
    const handleExportInventory = async () => {
        const targets = isWhScoped
            ? (scopedWarehouse ? [scopedWarehouse] : [])
            : activeWarehouses;

        if (targets.length === 0) return showToast('Немає складів для інвентаризації', 'error');

        const sections = targets.map(wh => ({
            warehouse: { name: wh.name, address: wh.address },
            rows: filteredItems
                .map(item => ({ item, bal: getWarehouseBalance(item.id, wh.id) }))
                .filter(({ bal }) => stockMode === 'all' || bal.onHand !== 0 || bal.reserved !== 0)
                .map(({ item, bal }) => ({
                    sku: item.sku,
                    name: item.fullName,
                    unit: item.unit?.name || 'шт',
                    onHand: bal.onHand,
                })),
        })).filter(s => s.rows.length > 0);

        if (sections.length === 0) {
            return showToast('Нічого інвентаризувати: за цими фільтрами порожньо', 'error');
        }

        const totalRows = sections.reduce((sum, s) => sum + s.rows.length, 0);
        const suffix = isWhScoped ? `_${(scopedWarehouse?.name || '').replace(/\s+/g, '_')}` : '';

        setIsBuildingPdf(true);
        try {
            showToast(
                sections.length === 1
                    ? `Відомість на ${totalRows} позицій — оберіть «Зберегти як PDF»`
                    : `${sections.length} складів, ${totalRows} позицій — оберіть «Зберегти як PDF»`,
                'success'
            );
            await printInventorySheet({
                sections,
                scopeText: scopeDescription(),
                compiledBy: employee?.name,
                docTitle: `Інвентаризація${suffix}_${fileDateStr()}`,
            });
        } catch (err) {
            showToast(`Не вдалося сформувати документ: ${err.message}`, 'error');
        } finally {
            setIsBuildingPdf(false);
        }
    };

    // --- УПРАВЛІННЯ СКЛАДАМИ ---
    const handleSaveWarehouse = async (e) => {
        e.preventDefault();
        if (!whForm.name.trim()) return showToast('Введіть назву складу', 'error');
        setIsSubmitting(true);
        try {
            const payload = { name: whForm.name, address: whForm.address, is_active: whForm.is_active, updated_by: employee?.id };
            if (whForm.id) {
                await supabase.from('warehouses').update(payload).eq('id', whForm.id);
                showToast('Склад оновлено', 'success');
            } else {
                payload.created_by = employee?.id;
                await supabase.from('warehouses').insert([payload]);
                showToast('Склад створено', 'success');
            }
            setIsWarehouseModalOpen(false);
            loadData();
        } catch (err) { showToast(err.message, 'error'); } finally { setIsSubmitting(false); }
    };

    const openAdjustModal = (item, warehouseId, warehouseName, operation) => {
        setSelectedItemName(item.fullName);
        setAdjustForm({
            operation,
            nomenclature_id: item.id,
            warehouse_from_id: operation !== 'purchase' ? warehouseId : '',
            warehouse_to_id: operation !== 'writeoff' ? warehouseId : '',
            warehouse_name: warehouseName,
            quantity: '', reference_document: '', notes: ''
        });
        setIsAdjustModalOpen(true);
    };

    const handleSaveAdjustment = async (e) => {
        e.preventDefault();
        const qty = parseFloat(adjustForm.quantity);
        if (isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) return showToast('Вкажіть цілу додатну кількість', 'error');
        if (adjustForm.operation === 'writeoff' || adjustForm.operation === 'transfer') {
            const currentBal = getWarehouseBalance(adjustForm.nomenclature_id, adjustForm.warehouse_from_id).available;
            if (qty > currentBal) return showToast(`Недостатньо вільного залишку (доступно: ${currentBal})`, 'error');
        }
        if (adjustForm.operation === 'transfer' && String(adjustForm.warehouse_from_id) === String(adjustForm.warehouse_to_id)) {
            return showToast('Оберіть інший склад для переміщення', 'error');
        }

        setIsSubmitting(true);
        try {
            const payload = {
                operation_type: adjustForm.operation,
                nomenclature_id: adjustForm.nomenclature_id,
                quantity: qty,
                warehouse_from_id: adjustForm.operation !== 'purchase' ? adjustForm.warehouse_from_id : null,
                warehouse_to_id: adjustForm.operation !== 'writeoff' ? adjustForm.warehouse_to_id : null,
                reference_document: adjustForm.reference_document || null,
                notes: adjustForm.notes || null,
                performed_by: employee?.id, created_by: employee?.id
            };
            const { error } = await supabase.from('stock_movements').insert([payload]);
            if (error) throw error;
            showToast('Складську операцію проведено', 'success');
            setIsAdjustModalOpen(false);
            const { data } = await supabase.from('v_warehouse_stock_available').select('*');
            setBalances(data || []);
        } catch (err) { showToast(err.message, 'error'); } finally { setIsSubmitting(false); }
    };

    // --- ВІДКРИТИ МОДАЛКУ НОМЕНКЛАТУРИ ---
    const openAddNomenclature = () => {
        setEditingNomenclatureItem(null);
        setIsNomenclatureModalOpen(true);
    };

    const openEditNomenclature = (e, item) => {
        e.stopPropagation();
        setEditingNomenclatureItem(item);
        setIsNomenclatureModalOpen(true);
    };

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500">Завантаження...</div>;

    const unitOf = (item) => item.unit?.name || 'шт';

    return (
        <div className="flex flex-col h-full w-full">
            <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

            {/* --- ПАНЕЛЬ ФІЛЬТРІВ ТА КНОПОК --- */}
            <div className="bg-white p-4 rounded-[16px] border border-slate-200 shadow-sm flex-none mb-4">
                <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3">

                    {/* ЛІВА ЧАСТИНА: склад → категорія → режим показу */}
                    <div className="flex flex-col sm:flex-row gap-3 flex-1 min-w-0">
                        <div className="w-full sm:w-64 flex-shrink-0">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Склад</label>
                            <div className="relative">
                                <FaWarehouse className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={13} />
                                <select
                                    value={warehouseFilter}
                                    onChange={(e) => handleWarehouseChange(e.target.value)}
                                    className={`w-full pl-9 pr-4 py-2.5 border rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm font-bold shadow-sm cursor-pointer transition-colors ${
                                        isWhScoped
                                            ? 'bg-indigo-50 border-indigo-300 text-indigo-800'
                                            : 'bg-slate-50 border-slate-200 text-slate-700'
                                    }`}
                                >
                                    <option value="all">Усі склади (зведено)</option>
                                    {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    {warehouses.filter(w => !w.is_active).map(w => (
                                        <option key={w.id} value={w.id}>{w.name} — неактивний</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="w-full sm:w-56 flex-shrink-0">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Категорія</label>
                            <select
                                value={rootCategoryFilter}
                                onChange={(e) => setRootCategoryFilter(e.target.value)}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm font-bold text-slate-700 shadow-sm cursor-pointer transition-colors"
                            >
                                <option value="">Всі категорії</option>
                                {rootCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>

                        <div className="flex-shrink-0">
                            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Показувати</label>
                            <div className="inline-flex bg-slate-100 rounded-xl p-1 border border-slate-200">
                                <button
                                    type="button"
                                    onClick={() => setStockMode('instock')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${stockMode === 'instock' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Із залишком
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStockMode('all')}
                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${stockMode === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                >
                                    Усі позиції
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ПРАВА ЧАСТИНА: Склади / Експорт / Інвентаризація */}
                    <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 lg:pt-5">
                        <button
                            onClick={() => { setWhForm({ id: null, name: '', address: '', is_active: true }); setIsWarehouseModalOpen(true); }}
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold shadow-sm hover:bg-slate-900 transition-colors text-sm whitespace-nowrap"
                        >
                            <FaWarehouse size={13} /> <span>Довідник</span>
                        </button>
                        <button
                            onClick={handleExportBalances}
                            title="Вивантажити залишки в Excel"
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold hover:bg-emerald-100 transition-colors shadow-sm text-sm whitespace-nowrap"
                        >
                            <FaFileExcel size={13} /> Залишки
                        </button>
                        <button
                            onClick={handleExportInventory}
                            disabled={isBuildingPdf}
                            title="Відомість під друк: обліковий залишок заповнено, «Фактично» і «Розбіжність» порожні — для заповнення від руки. У діалозі друку оберіть «Зберегти як PDF»."
                            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl font-bold hover:bg-amber-100 disabled:opacity-60 disabled:cursor-wait transition-colors shadow-sm text-sm whitespace-nowrap"
                        >
                            <FaClipboardList size={13} /> {isBuildingPdf ? 'Готуємо…' : 'Інвентаризація (PDF)'}
                        </button>
                    </div>
                </div>

                {/* --- ЯКИЙ САМЕ СКЛАД ЗАРАЗ ВІДКРИТО --- */}
                {!loading && isWhScoped && (
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2.5 flex-wrap">
                        <FaMapMarkerAlt className="text-indigo-500" size={15} />
                        <div>
                            <div className="font-bold text-slate-900 text-sm leading-tight">{scopedWarehouse?.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {scopedWarehouse?.address || 'адресу не вказано'}
                            </div>
                        </div>
                        <button
                            onClick={() => handleWarehouseChange('all')}
                            className="ml-auto flex items-center gap-2 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-colors"
                        >
                            <FaTimes size={11} /> Показати всі склади
                        </button>
                    </div>
                )}
            </div>

            {/* --- ТАБЛИЦЯ --- */}
            <div className="bg-white rounded-[16px] shadow-sm border border-slate-200 flex-1 flex flex-col mb-4 overflow-hidden min-h-0">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="animate-pulse flex gap-2">
                            <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                            <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                            <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                        </div>
                    </div>
                ) : paginatedItems.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
                        <FaBoxes className="text-6xl text-slate-200 mb-4" />
                        <h3 className="text-lg font-bold text-slate-600">
                            {isWhScoped && stockMode === 'instock'
                                ? `На складі «${scopedWarehouse?.name}» порожньо`
                                : 'Порожньо'}
                        </h3>
                        <p className="text-slate-400 text-sm mt-1 mb-4 max-w-sm">
                            {isWhScoped && stockMode === 'instock'
                                ? 'Тут немає позицій із залишком за поточними фільтрами. Перемкніть на «Усі позиції», щоб побачити всю номенклатуру.'
                                : 'За цими фільтрами нічого не знайдено.'}
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {stockMode === 'instock' && (
                                <button
                                    onClick={() => setStockMode('all')}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors border border-slate-200"
                                >
                                    Показати всі позиції
                                </button>
                            )}
                            <button
                                onClick={openAddNomenclature}
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl font-bold text-sm hover:bg-indigo-100 transition-colors border border-indigo-100"
                            >
                                <FaPlus size={12} /> Додати позицію
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="px-6 py-4 w-1/2">
                                        Товар / Номенклатура
                                        {isWhScoped && (
                                            <span className="ml-2 normal-case tracking-normal text-indigo-600 font-bold">
                                                — показано по складу «{scopedWarehouse?.name}»
                                            </span>
                                        )}
                                    </th>
                                    <th className="px-6 py-4 text-center">Фізично</th>
                                    <th className="px-6 py-4 text-center">Резерв</th>
                                    <th className="px-6 py-4 text-center">Вільно</th>
                                    <th className="px-6 py-4 text-right">Дії</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paginatedItems.map(item => {
                                    const shown = getScopedBalance(item.id);
                                    const totals = getItemTotals(item.id);
                                    const isExpanded = expandedRowId === item.id;
                                    const hasReserve = shown.reserved > 0;
                                    const elsewhere = isWhScoped ? otherWarehousesWithStock(item.id) : 0;

                                    return (
                                        <React.Fragment key={item.id}>
                                            <tr className={`hover:bg-slate-50/50 transition-colors group ${isExpanded ? 'bg-indigo-50/20' : ''}`}>
                                                <td className="px-6 py-5 align-middle">
                                                    <button
                                                        type="button"
                                                        onClick={() => setHistoryTarget({ item, warehouseId: isWhScoped ? scopedWhId : null })}
                                                        title={isWhScoped
                                                            ? `Рух товару по складу «${scopedWarehouse?.name}»`
                                                            : 'Переглянути рух товару: куди і коли відвантажувався'}
                                                        className="text-left w-full"
                                                    >
                                                        <div className="font-bold text-slate-900 text-sm leading-tight max-w-2xl group-hover:text-indigo-700 hover:underline decoration-indigo-300 underline-offset-4 transition-colors flex items-start gap-2">
                                                            <FaHistory className="text-slate-300 group-hover:text-indigo-400 mt-0.5 flex-shrink-0" size={12} />
                                                            <span>{item.fullName}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1.5 ml-5 flex-wrap">
                                                            {item.sku && <span className="text-[10px] text-slate-500 uppercase font-mono tracking-widest bg-slate-100 px-1.5 py-0.5 rounded">SKU: {item.sku}</span>}
                                                            {isWhScoped && shown.onHand === 0 && totals.onHand > 0 && (
                                                                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 border border-sky-100 px-1.5 py-0.5 rounded">
                                                                    тут немає · всього {totals.onHand}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </button>
                                                </td>

                                                <td className="px-6 py-5 align-middle text-center">
                                                    <div className="font-black text-slate-900 text-lg">
                                                        {shown.onHand}
                                                        <span className="text-[10px] font-bold text-slate-400 ml-1 uppercase">{unitOf(item)}</span>
                                                    </div>
                                                    {isWhScoped && totals.onHand !== shown.onHand && (
                                                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">на всіх складах: {totals.onHand}</div>
                                                    )}
                                                </td>

                                                <td className="px-6 py-5 align-middle text-center">
                                                    <button
                                                        onClick={(e) => { if (hasReserve) handleReserveClick(e, item); }}
                                                        className={`font-black text-base px-3 py-1 rounded-lg transition-colors border shadow-sm ${hasReserve ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-100 cursor-pointer' : 'text-slate-400 bg-slate-50 border-slate-100 cursor-default'}`}
                                                        title={hasReserve ? 'Переглянути деталі резерву' : ''}
                                                    >
                                                        {shown.reserved}
                                                    </button>
                                                </td>

                                                <td className="px-6 py-5 align-middle text-center">
                                                    <div className={`font-black text-base px-3 py-1 rounded-lg shadow-sm border inline-block ${shown.available > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-rose-600 bg-rose-50 border-rose-100'}`}>
                                                        {shown.available}
                                                    </div>
                                                </td>

                                                <td className="px-6 py-5 align-middle text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={(e) => openEditNomenclature(e, item)}
                                                            title="Редагувати позицію номенклатури"
                                                            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-transparent hover:border-indigo-100"
                                                        >
                                                            <FaEdit size={16} />
                                                        </button>
                                                        <button
                                                            onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                                                            title={isWhScoped ? 'Показати залишки на всіх складах' : 'Розгорнути по складах'}
                                                            className={`flex items-center gap-2 px-4 py-2 border-2 rounded-xl font-bold text-xs transition-colors whitespace-nowrap ${isExpanded ? 'border-indigo-600 text-indigo-600 bg-indigo-50' : 'border-slate-800 text-slate-800 hover:bg-slate-50'}`}
                                                        >
                                                            {isWhScoped
                                                                ? (elsewhere > 0 ? `Ще на ${elsewhere}` : 'Інші склади')
                                                                : `${activeWarehouses.length} локації`}
                                                            <FaChevronDown className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Розгорнутий рядок (Картки складів) */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan="5" className="p-0 bg-slate-50/80 shadow-inner border-b border-slate-200">
                                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                                <div className="p-4 sm:p-6 sm:pl-10">
                                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                                        {activeWarehouses.map(wh => {
                                                                            const whBal = getWarehouseBalance(item.id, wh.id);
                                                                            const isCurrent = isWhScoped && wh.id === scopedWhId;
                                                                            return (
                                                                                <div
                                                                                    key={wh.id}
                                                                                    className={`bg-white border rounded-2xl p-4 flex flex-col sm:flex-row justify-between sm:items-center shadow-sm transition-colors gap-4 ${
                                                                                        isCurrent ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-200'
                                                                                    }`}
                                                                                >
                                                                                    <div>
                                                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                                                            <FaMapMarkerAlt className={isCurrent ? 'text-indigo-500 text-lg' : 'text-slate-400 text-lg'} />
                                                                                            <span className="font-bold text-slate-800 text-base">{wh.name}</span>
                                                                                            {isCurrent
                                                                                                ? <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded uppercase tracking-widest">Обраний</span>
                                                                                                : <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase tracking-widest ml-1">Склад</span>}
                                                                                        </div>
                                                                                        <div className="text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 inline-block">
                                                                                            Фізично: <span className="text-slate-800 mr-2">{whBal.onHand}</span>
                                                                                            Резерв: <span className="text-amber-600 mr-2">{whBal.reserved}</span>
                                                                                            Вільно: <span className={whBal.available > 0 ? "text-emerald-600" : "text-slate-800"}>{whBal.available}</span>
                                                                                        </div>
                                                                                    </div>
                                                                                    <div className="flex gap-2 justify-end">
                                                                                        <button
                                                                                            className="w-10 h-10 rounded-xl bg-white text-slate-500 flex items-center justify-center hover:bg-slate-100 hover:text-indigo-600 transition-colors border border-slate-200 shadow-sm"
                                                                                            onClick={() => setHistoryTarget({ item, warehouseId: wh.id })}
                                                                                            title={`Рух товару по складу «${wh.name}»`}
                                                                                        >
                                                                                            <FaHistory />
                                                                                        </button>
                                                                                        <button
                                                                                            className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors border border-emerald-100 shadow-sm"
                                                                                            onClick={() => openAdjustModal(item, wh.id, wh.name, 'purchase')}
                                                                                            title="Ручний прихід (Знайдено)"
                                                                                        >
                                                                                            <FaPlus />
                                                                                        </button>
                                                                                        <button
                                                                                            className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center hover:bg-slate-700 transition-colors shadow-sm"
                                                                                            onClick={() => openAdjustModal(item, wh.id, wh.name, 'writeoff')}
                                                                                            title="Списання (Втрата)"
                                                                                        >
                                                                                            <FaMinus />
                                                                                        </button>
                                                                                        <button
                                                                                            className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm"
                                                                                            onClick={() => openAdjustModal(item, wh.id, wh.name, 'transfer')}
                                                                                            title="Переміщення на інший склад"
                                                                                        >
                                                                                            <FaExchangeAlt />
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            </motion.div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </AnimatePresence>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* --- ПАГІНАЦІЯ --- */}
            {filteredItems.length > 0 && (
                <div className="flex justify-between items-center bg-white px-5 py-3.5 rounded-[16px] border border-slate-200 shadow-sm flex-none">
                    <span className="text-sm text-slate-500 font-medium">
                        Показано <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)}</span> із <span className="font-bold text-slate-800">{filteredItems.length}</span>
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

            {/* --- МОДАЛКА: ДЕТАЛІ РЕЗЕРВУ --- */}
            <AnimatePresence>
                {reserveDetails.isOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]" onClick={() => setReserveDetails({ isOpen: false, loading: false, data: [], itemName: '' })}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-amber-50 rounded-t-2xl">
                                <div>
                                    <h2 className="text-xl font-bold text-amber-900 flex items-center gap-2"><FaInfoCircle /> Деталі резервування</h2>
                                    <p className="text-sm text-amber-700 mt-1 font-medium">{reserveDetails.itemName}</p>
                                    {isWhScoped && <p className="text-xs text-amber-600 mt-1 font-bold">Тільки склад «{scopedWarehouse?.name}»</p>}
                                </div>
                                <button onClick={() => setReserveDetails({ isOpen: false, loading: false, data: [], itemName: '' })} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes /></button>
                            </div>
                            <div className="p-6 overflow-y-auto custom-scrollbar">
                                {reserveDetails.loading ? (
                                    <div className="flex justify-center py-10"><div className="animate-pulse text-amber-500 font-bold">Завантаження...</div></div>
                                ) : reserveDetails.data.length === 0 ? (
                                    <div className="text-center py-10 text-slate-400">Немає активних резервів для цієї позиції.</div>
                                ) : (
                                    <div className="space-y-3">
                                        {reserveDetails.data.map(res => (
                                            <div key={res.id} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex justify-between items-center hover:border-amber-200 transition-colors">
                                                <div>
                                                    <div className="font-bold text-slate-800 flex items-center gap-2">
                                                        <FaHardHat className="text-slate-400" />
                                                        {res.installation?.name || "Невідомий об'єкт"}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1.5 flex gap-2 flex-wrap items-center">
                                                        <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100">Дата: {new Date(res.created_at).toLocaleDateString('uk-UA')}</span>
                                                        <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100 flex items-center gap-1"><FaWarehouse size={9} className="text-slate-400" /> {res.warehouse_name}</span>
                                                        {res.notes && <span className="italic text-slate-400">{res.notes}</span>}
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Зарезервовано</div>
                                                    <div className="text-2xl font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-lg border border-amber-100 inline-block shadow-sm">{res.actual_reserved}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- МОДАЛКА: УПРАВЛІННЯ СКЛАДАМИ --- */}
            <AnimatePresence>
                {isWarehouseModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={() => setIsWarehouseModalOpen(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-800 rounded-t-2xl">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2"><FaWarehouse className="text-slate-400" /> Довідник складів</h2>
                                <button onClick={() => setIsWarehouseModalOpen(false)} className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-full transition-colors border border-slate-600"><FaTimes /></button>
                            </div>
                            <div className="p-6 flex flex-col md:flex-row gap-6">
                                <div className="w-full md:w-1/2">
                                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">{whForm.id ? 'Редагувати склад' : 'Додати новий склад'}</h3>
                                    <form onSubmit={handleSaveWarehouse} className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Назва складу <span className="text-red-500">*</span></label>
                                            <input type="text" required value={whForm.name} onChange={e => setWhForm({ ...whForm, name: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 transition-all" placeholder="Напр. Склад Бровари" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1">Адреса (Опц.)</label>
                                            <input type="text" value={whForm.address} onChange={e => setWhForm({ ...whForm, address: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-slate-700 transition-all" placeholder="Місто, Вулиця..." />
                                        </div>
                                        <div className="flex items-center gap-2 mt-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                            <input type="checkbox" id="wh_active" checked={whForm.is_active} onChange={e => setWhForm({ ...whForm, is_active: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded cursor-pointer" />
                                            <label htmlFor="wh_active" className="text-sm font-bold text-slate-700 cursor-pointer select-none">Активний склад</label>
                                        </div>
                                        <div className="flex gap-2 pt-2">
                                            {whForm.id && <button type="button" onClick={() => setWhForm({ id: null, name: '', address: '', is_active: true })} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 text-sm transition-colors">Скасувати</button>}
                                            <button type="submit" disabled={isSubmitting} className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors text-sm shadow-md disabled:opacity-50">{isSubmitting ? '...' : 'Зберегти'}</button>
                                        </div>
                                    </form>
                                </div>
                                <div className="w-full md:w-1/2 border-t md:border-t-0 md:border-l border-slate-100 md:pl-6 pt-6 md:pt-0">
                                    <h3 className="text-sm font-bold text-slate-500 uppercase mb-4">Існуючі склади</h3>
                                    <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                                        {warehouses.map(w => (
                                            <div key={w.id} className={`p-3.5 rounded-xl border flex justify-between items-center transition-colors hover:border-indigo-200 ${w.is_active ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                                <div>
                                                    <div className="font-bold text-sm text-slate-800">{w.name}</div>
                                                    {w.address && <div className="text-[10px] text-slate-500 mt-0.5">{w.address}</div>}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => { handleWarehouseChange(String(w.id)); setIsWarehouseModalOpen(false); }}
                                                        title="Переглянути залишки цього складу"
                                                        className="p-2 text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-emerald-50 rounded-lg transition-colors border border-slate-100 hover:border-emerald-100"
                                                    >
                                                        <FaBox size={13} />
                                                    </button>
                                                    <button onClick={() => setWhForm({ id: w.id, name: w.name, address: w.address || '', is_active: w.is_active })} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-100 hover:border-indigo-100"><FaEdit size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- МОДАЛКА: РУЧНА ОПЕРАЦІЯ --- */}
            <AnimatePresence>
                {isAdjustModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={() => setIsAdjustModalOpen(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className={`p-6 border-b border-slate-100 flex justify-between items-center rounded-t-2xl ${adjustForm.operation === 'purchase' ? 'bg-emerald-50' : adjustForm.operation === 'writeoff' ? 'bg-red-50' : 'bg-indigo-50'}`}>
                                <div>
                                    <h2 className={`text-xl font-bold flex items-center gap-2 ${adjustForm.operation === 'purchase' ? 'text-emerald-800' : adjustForm.operation === 'writeoff' ? 'text-red-800' : 'text-indigo-800'}`}>
                                        {adjustForm.operation === 'purchase' ? <><FaPlus /> Ручний Прихід</> : adjustForm.operation === 'writeoff' ? <><FaMinus /> Списання / Втрата</> : <><FaExchangeAlt /> Переміщення</>}
                                    </h2>
                                </div>
                                <button onClick={() => setIsAdjustModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes /></button>
                            </div>
                            <div className="p-6">
                                <form id="adjust-form" onSubmit={handleSaveAdjustment} className="space-y-5">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Обраний товар:</div>
                                        <div className="font-bold text-slate-800 text-sm leading-tight mb-3">{selectedItemName}</div>
                                        <div className="flex gap-2 text-xs font-bold text-slate-600">
                                            <span className="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm flex items-center gap-2">
                                                <FaWarehouse className="text-slate-400" />
                                                {adjustForm.operation === 'purchase' ? 'Прихід на:' : 'Зі складу:'} <span className="text-slate-800">{adjustForm.warehouse_name}</span>
                                            </span>
                                        </div>
                                    </div>
                                    {adjustForm.operation === 'transfer' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Склад (Куди переміщуємо) <span className="text-red-500">*</span></label>
                                            <select required value={adjustForm.warehouse_to_id} onChange={e => setAdjustForm({ ...adjustForm, warehouse_to_id: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 transition-colors">
                                                <option value="">Оберіть...</option>
                                                {warehouses.filter(w => w.is_active && String(w.id) !== String(adjustForm.warehouse_from_id)).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Кількість <span className="text-red-500">*</span></label>
                                        <input type="number" min="1" step="1" required autoFocus value={adjustForm.quantity} onChange={e => setAdjustForm({ ...adjustForm, quantity: e.target.value })} className={`w-full px-4 py-3 bg-white border-2 rounded-xl text-lg font-black outline-none transition-colors ${adjustForm.operation === 'purchase' ? 'border-emerald-200 focus:border-emerald-500 text-emerald-700' : adjustForm.operation === 'writeoff' ? 'border-red-200 focus:border-red-500 text-red-700' : 'border-indigo-200 focus:border-indigo-500 text-indigo-700'}`} placeholder="0" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Документ (Опц.)</label>
                                            <input type="text" value={adjustForm.reference_document} onChange={e => setAdjustForm({ ...adjustForm, reference_document: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" placeholder="№ Акту/Накладної" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Коментар</label>
                                            <input type="text" value={adjustForm.notes} onChange={e => setAdjustForm({ ...adjustForm, notes: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-colors" placeholder="Причина операції" />
                                        </div>
                                    </div>
                                </form>
                            </div>
                            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-slate-50 rounded-b-2xl">
                                <button type="button" onClick={() => setIsAdjustModalOpen(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                <button form="adjust-form" type="submit" disabled={isSubmitting} className={`px-6 py-2.5 text-white rounded-xl font-bold shadow-md transition-colors text-sm flex items-center gap-2 ${adjustForm.operation === 'purchase' ? 'bg-emerald-600 hover:bg-emerald-700' : adjustForm.operation === 'writeoff' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                    {isSubmitting ? 'Обробка...' : 'Підтвердити операцію'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- МОДАЛКА: НОМЕНКЛАТУРА (Додати / Редагувати позицію) --- */}
            <NomenclatureModal
                isOpen={isNomenclatureModalOpen}
                onClose={() => setIsNomenclatureModalOpen(false)}
                onSuccess={loadData}
                showToast={showToast}
                editingItem={editingNomenclatureItem}
            />

            {/* --- МОДАЛКА: РУХ ТОВАРУ (куди і коли пішов) --- */}
            <ItemMovementHistoryModal
                isOpen={!!historyTarget}
                onClose={() => setHistoryTarget(null)}
                item={historyTarget ? { ...historyTarget.item, unitName: historyTarget.item.unit?.name || 'шт' } : null}
                warehouseId={historyTarget?.warehouseId || null}
            />

        </div>
    );
}
