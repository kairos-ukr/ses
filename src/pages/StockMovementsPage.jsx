import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaFileExcel, FaArrowDown, FaArrowUp, FaExchangeAlt,
    FaTrash, FaLock, FaUnlock, FaFileAlt, FaCheck, FaExclamationTriangle,
    FaTimes, FaInfoCircle, FaHistory, FaCalendarAlt, FaShoppingCart, FaHandshake, FaEdit
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

// Імпорт модалки (створимо в наступному кроці)
import DirectSaleModal from './DirectSaleModal';

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
    'sale': { label: 'Продаж', icon: FaShoppingCart, color: 'text-blue-700 bg-blue-100 border-blue-200', sign: '-', signColor: 'text-blue-700 bg-blue-50 border-blue-200' },
    'partner_transfer': { label: 'Передача', icon: FaHandshake, color: 'text-violet-700 bg-violet-100 border-violet-200', sign: '-', signColor: 'text-violet-700 bg-violet-50 border-violet-200' },
};

// Приймаємо externalSearch та externalActionTrigger від батьківського компонента (InventoryWorkspace)
export default function StockMovementsPage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();

    const [movements, setMovements] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [returnedBySource, setReturnedBySource] = useState({});
    const [loading, setLoading] = useState(true);
    const [dictsReady, setDictsReady] = useState(false);

    // Редагування інфо-полів руху
    const [editModal, setEditModal] = useState({ isOpen: false, mov: null });
    const [editForm, setEditForm] = useState({ reference_document: '', notes: '', operation_date: '', sale_price: '', currency: 'USD', exchange_rate: '' });
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Повернення операції
    const [returnModal, setReturnModal] = useState({ isOpen: false, mov: null, maxQty: 0 });
    const [returnForm, setReturnForm] = useState({ quantity: '', reason: '' });
    const [isReturning, setIsReturning] = useState(false);
    
    const [dicts, setDicts] = useState({ nom: {}, emp: {}, wh: {}, inst: {}, sup: {}, po: {}, clients: {} });
    
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // Стейт для модалки продажів
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);

    // Фільтри
    const [typeFilter, setTypeFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [clientFilter, setClientFilter] = useState('');   // контрагент (клієнт/партнер)
    const [instFilter, setInstFilter] = useState('');       // об'єкт
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Пагінація (серверна)
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // Дебаунс пошуку, щоб не смикати базу на кожне натискання клавіші
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(externalSearch), 400);
        return () => clearTimeout(t);
    }, [externalSearch]);

    // --- ВІДСТЕЖЕННЯ СИГНАЛУ НА ВІДКРИТТЯ МОДАЛКИ ПРОДАЖУ ---
    const prevActionTrigger = useRef(externalActionTrigger);
    
    useEffect(() => {
        if (externalActionTrigger > prevActionTrigger.current) {
            setIsSaleModalOpen(true);
        }
        prevActionTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    // --- ЗАВАНТАЖЕННЯ ДОВІДНИКІВ (один раз) ---
    const loadDicts = useCallback(async () => {
        try {
            const [nomRes, catRes, empRes, whRes, instRes, supRes, poRes, poItemsRes, resRes, clientsRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(code, name)'),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('employees').select('id, name'),
                supabase.from('warehouses').select('id, name'),
                supabase.from('installations').select('custom_id, name'),
                supabase.from('suppliers').select('id, name'),
                supabase.from('purchase_orders').select('id, order_number, supplier_id'),
                supabase.from('purchase_order_items').select('id, purchase_order_id'),
                supabase.from('reservations').select('id, installation_custom_id'),
                supabase.from('clients').select('id, custom_id, name')
            ]);

            const d = { nom: {}, emp: {}, wh: {}, inst: {}, sup: {}, po: {}, poItem: {}, res: {}, clients: {} };
            
            (empRes.data || []).forEach(e => d.emp[e.id] = e.name);
            (whRes.data || []).forEach(w => d.wh[w.id] = w.name);
            (instRes.data || []).forEach(i => d.inst[i.custom_id] = i.name);
            (supRes.data || []).forEach(s => d.sup[s.id] = s.name);
            (poRes.data || []).forEach(p => d.po[p.id] = p);
            (poItemsRes.data || []).forEach(pi => d.poItem[pi.id] = pi);
            (resRes.data || []).forEach(r => d.res[r.id] = r);
            (clientsRes.data || []).forEach(c => d.clients[c.id] = { name: c.name, customId: c.custom_id ?? c.id });

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
            setDictsReady(true);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }, [showToast]);

    useEffect(() => { if (!authLoading) loadDicts(); }, [authLoading, loadDicts]);

    // --- СЕРВЕРНІ ФІЛЬТРИ (спільні для сторінки та експорту) ---
    const applyFilters = useCallback((query) => {
        if (typeFilter !== 'all') query = query.eq('operation_type', typeFilter);
        if (dateFrom) query = query.gte('operation_date', dateFrom);
        if (dateTo) query = query.lte('operation_date', dateTo + 'T23:59:59.999');
        if (clientFilter) query = query.eq('client_id', parseInt(clientFilter));
        if (instFilter) query = query.eq('installation_custom_id', parseInt(instFilter));

        const term = debouncedSearch.trim().toLowerCase();
        if (term) {
            // Пошук по товару робимо через довідник номенклатури (він у пам'яті), по документу/коментарю — через ilike
            const nomIds = Object.entries(dicts.nom)
                .filter(([, n]) => n.fullName.toLowerCase().includes(term) || (n.sku && String(n.sku).toLowerCase().includes(term)))
                .map(([id]) => id)
                .slice(0, 300);
            const safe = term.replace(/[,()"'\\%]/g, ' ').trim();
            const orParts = [];
            if (safe) {
                orParts.push(`reference_document.ilike.%${safe}%`);
                orParts.push(`notes.ilike.%${safe}%`);
            }
            if (nomIds.length) orParts.push(`nomenclature_id.in.(${nomIds.join(',')})`);
            if (orParts.length) query = query.or(orParts.join(','));
            else query = query.eq('id', -1); // нічого не знайдено
        }
        return query;
    }, [typeFilter, dateFrom, dateTo, clientFilter, instFilter, debouncedSearch, dicts.nom]);

    // --- ЗАВАНТАЖЕННЯ СТОРІНКИ РУХІВ (по 10 записів з бази) ---
    const loadMovements = useCallback(async () => {
        if (!dictsReady) return;
        setLoading(true);
        try {
            let query = supabase.from('stock_movements').select('*', { count: 'exact' });
            query = applyFilters(query);
            query = query.order('operation_date', { ascending: false })
                .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);
            const { data, count, error } = await query;
            if (error) throw error;
            setMovements(data || []);
            setTotalCount(count || 0);

            // Скільки вже повернено по операціях цієї сторінки
            const ids = (data || []).map(m => m.id);
            if (ids.length > 0) {
                const { data: rets } = await supabase.from('stock_movements')
                    .select('source_movement_id, quantity')
                    .in('source_movement_id', ids);
                const map = {};
                (rets || []).forEach(r => { map[r.source_movement_id] = (map[r.source_movement_id] || 0) + parseFloat(r.quantity); });
                setReturnedBySource(map);
            } else {
                setReturnedBySource({});
            }
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [dictsReady, currentPage, applyFilters, showToast]);

    useEffect(() => { loadMovements(); }, [loadMovements]);

    // --- ФОРМАТУВАННЯ МІТОК ОБ'ЄКТА / КЛІЄНТА (назва + ID, без службових слів) ---
    const getInstallationLabel = (customId) => {
        if (!customId) return null;
        const name = dicts.inst[customId];
        return name ? `«${name}» #${customId}` : `#${customId}`;
    };

    const getClientLabel = (clientId) => {
        if (!clientId) return null;
        const client = dicts.clients[clientId];
        if (!client) return `#${clientId}`;
        return `${client.name} (ID ${client.customId})`;
    };

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
            to = getInstallationLabel(mov.installation_custom_id) || '—';
        } else if (mov.operation_type === 'return') {
            from = getInstallationLabel(mov.installation_custom_id) || '—';
            to = dicts.wh[mov.warehouse_to_id] || 'Склад';
        } else if (mov.operation_type === 'transfer') {
            from = dicts.wh[mov.warehouse_from_id] || 'Склад';
            to = dicts.wh[mov.warehouse_to_id] || 'Склад';
        } else if (mov.operation_type === 'writeoff') {
            from = dicts.wh[mov.warehouse_from_id] || 'Склад';
            to = 'Списано (Втрата)';
        } else if (mov.operation_type === 'reserve' || mov.operation_type === 'unreserve') {
            const resInstId = mov.reservation_id ? dicts.res[mov.reservation_id]?.installation_custom_id : null;
            const objName = getInstallationLabel(resInstId) || '—';
            if (mov.operation_type === 'reserve') {
                from = dicts.wh[mov.warehouse_from_id] || 'Склад';
                to = `Резерв під ${objName}`;
            } else {
                from = `Резерв під ${objName}`;
                to = dicts.wh[mov.warehouse_from_id] || 'Склад';
            }
        } else if (mov.operation_type === 'sale' || mov.operation_type === 'partner_transfer') {
            from = dicts.wh[mov.warehouse_from_id] || 'Склад';
            const clientLabel = getClientLabel(mov.client_id);
            const instLabel = getInstallationLabel(mov.installation_custom_id);

            if (clientLabel && instLabel) to = `${clientLabel} · ${instLabel}`;
            else if (clientLabel) to = clientLabel;
            else if (instLabel) to = instLabel;
            else to = 'Продаж / Відвантаження';
        }

        const routeStr = `${from} → ${to}`;
        if (!docStr) docStr = 'Без документу';

        return { conf, nom, empName, routeStr, docStr };
    };

    // --- ДАНІ ПОТОЧНОЇ СТОРІНКИ (фільтрація і пагінація — на сервері) ---
    const paginatedItems = movements.map(m => ({ ...m, ...buildRowData(m) }));
    const DISPATCH_TYPES = ['issue', 'sale', 'partner_transfer'];
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    // Скидання сторінки при зміні будь-якого фільтра
    useEffect(() => { setCurrentPage(1); }, [debouncedSearch, typeFilter, dateFrom, dateTo, clientFilter, instFilter]);

    // Опції для фільтрів контрагента та об'єкта
    const clientOptions = Object.entries(dicts.clients)
        .map(([id, c]) => ({ id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    const instOptions = Object.entries(dicts.inst)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

    // --- ЕКСПОРТ В EXCEL (тягне з бази всі записи за поточними фільтрами) ---
    const handleExportExcel = async () => {
        try {
            let query = supabase.from('stock_movements').select('*');
            query = applyFilters(query);
            query = query.order('operation_date', { ascending: false }).limit(3000);
            const { data, error } = await query;
            if (error) throw error;

            const dataToExport = (data || []).map(raw => {
                const m = { ...raw, ...buildRowData(raw) };
                const d = new Date(m.operation_date || m.created_at);
                return {
                    'Дата': d.toLocaleDateString('uk-UA'),
                    'Час': d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
                    'Операція': m.conf.label,
                    'Назва товару': m.nom.fullName,
                    'SKU': m.nom.sku || '',
                    'Кількість': `${m.conf.sign !== '0' ? m.conf.sign : ''}${parseFloat(m.quantity)}`,
                    'Од. вим.': m.nom.unitCode,
                    'Ціна (якщо продаж)': m.sale_price ? `${parseFloat(m.sale_price)} ${m.currency}` : '',
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
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    // --- РЕДАГУВАННЯ ІНФО-ПОЛІВ РУХУ ---
    const toLocalInput = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 16);
    };

    const openEdit = (mov) => {
        setEditForm({
            reference_document: mov.reference_document || '',
            notes: mov.notes || '',
            operation_date: toLocalInput(mov.operation_date || mov.created_at),
            sale_price: mov.sale_price ?? '',
            currency: mov.currency || 'USD',
            exchange_rate: mov.exchange_rate ?? '',
        });
        setEditModal({ isOpen: true, mov });
    };

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        const mov = editModal.mov;
        if (!mov) return;
        setIsSavingEdit(true);
        try {
            const payload = {
                reference_document: editForm.reference_document.trim() || null,
                notes: editForm.notes.trim() || null,
                updated_by: employee?.id ?? null,
                updated_at: new Date().toISOString(),
            };
            if (editForm.operation_date) payload.operation_date = new Date(editForm.operation_date).toISOString();
            const isSale = mov.operation_type === 'sale' || mov.operation_type === 'partner_transfer';
            if (isSale) {
                payload.sale_price = editForm.sale_price === '' ? null : parseFloat(editForm.sale_price);
                payload.currency = editForm.currency;
                payload.exchange_rate = editForm.exchange_rate === '' ? null : parseFloat(editForm.exchange_rate);
            }
            const { error } = await supabase.from('stock_movements').update(payload).eq('id', mov.id);
            if (error) throw error;
            showToast('Запис оновлено', 'success');
            setEditModal({ isOpen: false, mov: null });
            loadMovements();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSavingEdit(false);
        }
    };

    // --- ПОВЕРНЕННЯ ОПЕРАЦІЇ ---
    const openReturn = (mov, maxQty) => {
        setReturnForm({ quantity: maxQty, reason: '' });
        setReturnModal({ isOpen: true, mov, maxQty });
    };

    const handleReturn = async (e) => {
        e.preventDefault();
        const mov = returnModal.mov;
        if (!mov) return;
        const qty = parseFloat(returnForm.quantity);
        if (!qty || qty <= 0) return showToast('Введіть кількість більше 0', 'error');
        if (qty > returnModal.maxQty) return showToast(`Можна повернути не більше ${returnModal.maxQty}`, 'error');
        setIsReturning(true);
        try {
            const { data, error } = await supabase.rpc('return_movement', {
                p_source_movement_id: mov.id,
                p_qty: qty,
                p_reason: returnForm.reason.trim() || null,
                p_emp: employee?.id ?? null,
            });
            if (error) throw error;
            if (data && data.ok === false) return showToast(data.message || 'Повернення відхилено', 'error');
            showToast(`Повернення проведено (${qty} ${mov.nom?.unitCode || ''})`, 'success');
            setReturnModal({ isOpen: false, mov: null, maxQty: 0 });
            loadMovements();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsReturning(false);
        }
    };

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500">Завантаження...</div>;

    return (
        <div className="flex flex-col h-full w-full">
            <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

            {/* --- ФІЛЬТРИ ТА ЕКСПОРТ (компактний тулбар, переноситься на вузьких екранах) --- */}
            <div className="flex flex-wrap items-center gap-2 mb-4 bg-white p-3 rounded-[16px] border border-slate-200 shadow-sm flex-none">
                {/* Тип операції */}
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    className={`h-10 px-3 rounded-xl border text-[13px] font-bold outline-none cursor-pointer transition-colors flex-1 sm:flex-none sm:w-auto min-w-[130px] ${typeFilter !== 'all' ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                    title="Тип операції"
                >
                    <option value="all">Всі операції</option>
                    <option value="purchase">Приходи</option>
                    <option value="issue">Видачі</option>
                    <option value="sale">Продажі</option>
                    <option value="partner_transfer">Передачі</option>
                    <option value="return">Повернення</option>
                    <option value="transfer">Переміщення</option>
                    <option value="writeoff">Списання</option>
                    <option value="reserve">Резерви</option>
                    <option value="unreserve">Зняття резерву</option>
                </select>

                {/* Період */}
                <div className={`h-10 flex items-center gap-1.5 px-3 rounded-xl border transition-colors flex-1 sm:flex-none ${(dateFrom || dateTo) ? 'bg-indigo-50 border-indigo-300' : 'bg-slate-50 border-slate-200'}`}>
                    <FaCalendarAlt className="text-slate-400 text-xs flex-shrink-0" />
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-[105px]" title="Початкова дата" />
                    <span className="text-slate-300 font-bold">–</span>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer w-[105px]" title="Кінцева дата" />
                </div>

                {/* Контрагент (кому продали / передали) */}
                <select
                    value={clientFilter}
                    onChange={e => setClientFilter(e.target.value)}
                    className={`h-10 px-3 rounded-xl border text-[13px] font-bold outline-none cursor-pointer transition-colors flex-1 min-w-[140px] sm:max-w-[190px] ${clientFilter ? 'bg-violet-50 border-violet-300 text-violet-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                    title="Фільтр за контрагентом (продажі та передачі)"
                >
                    <option value="">Контрагент: всі</option>
                    {clientOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>

                {/* Об'єкт */}
                <select
                    value={instFilter}
                    onChange={e => setInstFilter(e.target.value)}
                    className={`h-10 px-3 rounded-xl border text-[13px] font-bold outline-none cursor-pointer transition-colors flex-1 min-w-[140px] sm:max-w-[190px] ${instFilter ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                    title="Фільтр за об'єктом"
                >
                    <option value="">Об'єкт: всі</option>
                    {instOptions.map(i => <option key={i.id} value={i.id}>#{i.id} {i.name}</option>)}
                </select>

                {/* Скинути фільтри */}
                {(typeFilter !== 'all' || dateFrom || dateTo || clientFilter || instFilter) && (
                    <button
                        onClick={() => { setTypeFilter('all'); setDateFrom(''); setDateTo(''); setClientFilter(''); setInstFilter(''); }}
                        className="h-10 px-3 rounded-xl text-xs font-bold text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 transition-colors flex items-center gap-1.5"
                        title="Скинути всі фільтри"
                    >
                        <FaTimes size={11} /> Скинути
                    </button>
                )}

                {/* Експорт */}
                <button
                    onClick={handleExportExcel}
                    className="h-10 w-10 ml-auto flex items-center justify-center bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors flex-shrink-0 shadow-sm"
                    title="Експортувати в Excel (за поточними фільтрами)"
                >
                    <FaFileExcel size={16} />
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
                                                <div className={`inline-flex flex-col items-center justify-center px-3 py-1.5 rounded-lg border shadow-sm ${m.conf.signColor}`}>
                                                    <div>
                                                        <span className="font-black text-[15px]">
                                                            {m.conf.sign !== '0' && m.conf.sign}{parseFloat(m.quantity)}
                                                        </span>
                                                        <span className="text-[11px] font-bold uppercase ml-1.5 opacity-80">{m.nom.unitCode}</span>
                                                    </div>
                                                    {(m.operation_type === 'sale' || m.operation_type === 'partner_transfer') && m.sale_price && (
                                                        <div className="text-[10px] font-bold opacity-75 mt-0.5">
                                                            {parseFloat(m.sale_price).toLocaleString('uk-UA')} {m.currency}
                                                        </div>
                                                    )}
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

                                            {/* Відповідальний + редагування */}
                                            <td className="px-5 py-4 w-40 text-right align-middle border-l border-slate-50">
                                                <div className="flex flex-col items-end gap-1.5">
                                                    <div className="inline-flex items-center justify-end gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 w-full">
                                                        <div className="w-5 h-5 rounded-full bg-[#0F172A] text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                                                            {m.empName.charAt(0)}
                                                        </div>
                                                        <span className="font-bold text-slate-600 text-xs truncate" title={m.empName}>{m.empName}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => openEdit(m)} className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 rounded hover:bg-indigo-50 transition-colors" title="Редагувати інфо запису">
                                                            <FaEdit size={10}/> Ред.
                                                        </button>
                                                        {DISPATCH_TYPES.includes(m.operation_type) && (parseFloat(m.quantity) - (returnedBySource[m.id] || 0)) > 0 && (
                                                            <button onClick={() => openReturn(m, parseFloat(m.quantity) - (returnedBySource[m.id] || 0))} className="text-[10px] font-bold text-teal-600 hover:text-white hover:bg-teal-600 flex items-center gap-1 px-2 py-1 rounded bg-teal-50 border border-teal-100 transition-colors" title="Повернути цю операцію">
                                                                <FaArrowDown size={10}/> Повернути
                                                            </button>
                                                        )}
                                                    </div>
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

            {/* --- ПАГІНАЦІЯ --- */}
            {totalCount > 0 && (
                <div className="flex justify-between items-center bg-white px-5 py-3.5 rounded-[16px] border border-slate-200 shadow-sm flex-none">
                    <span className="text-sm text-slate-500 font-medium">
                        Показано <span className="font-bold text-slate-800">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span className="font-bold text-slate-800">{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}</span> із <span className="font-bold text-slate-800">{totalCount}</span>
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

            {
            <DirectSaleModal
                isOpen={isSaleModalOpen}
                onClose={() => setIsSaleModalOpen(false)}
                onSuccess={loadMovements}
                showToast={showToast}
            />
            }

            {/* --- МОДАЛКА: РЕДАГУВАННЯ ІНФО ЗАПИСУ --- */}
            <AnimatePresence>
                {editModal.isOpen && editModal.mov && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[85]">
                        <motion.div initial={{ scale: 0.98, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 30 }} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FaEdit className="text-indigo-500"/> Редагування запису</h2>
                                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{editModal.mov.conf?.label} • {editModal.mov.nom?.fullName}</p>
                                </div>
                                <button onClick={() => setEditModal({ isOpen: false, mov: null })} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm flex-shrink-0"><FaTimes/></button>
                            </div>

                            <form id="edit-mov-form" onSubmit={handleSaveEdit} className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
                                    <FaInfoCircle className="mt-0.5 shrink-0"/>
                                    <p>Редагуються лише <b>інформаційні</b> поля. Кількість, тип, склад і номенклатура не змінюються (щоб не порушити баланси). Для виправлення к-сті зробіть повернення/сторно.</p>
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Документ (Акт / Накладна)</label>
                                    <input type="text" value={editForm.reference_document} onChange={e => setEditForm(f => ({ ...f, reference_document: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm text-slate-800 transition-colors" placeholder="№..." />
                                </div>

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Дата операції</label>
                                    <input type="datetime-local" value={editForm.operation_date} onChange={e => setEditForm(f => ({ ...f, operation_date: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm text-slate-800 transition-colors" />
                                </div>

                                {(editModal.mov.operation_type === 'sale' || editModal.mov.operation_type === 'partner_transfer') && (
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Ціна за од.</label>
                                            <input type="number" step="any" value={editForm.sale_price} onChange={e => setEditForm(f => ({ ...f, sale_price: e.target.value }))} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm font-bold text-slate-800 transition-colors" placeholder="0.00" />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Валюта</label>
                                            <select value={editForm.currency} onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))} className="w-full px-2 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm font-bold text-slate-800 transition-colors">
                                                <option value="USD">USD</option>
                                                <option value="EUR">EUR</option>
                                                <option value="UAH">UAH</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Курс</label>
                                            <input type="number" step="any" value={editForm.exchange_rate} onChange={e => setEditForm(f => ({ ...f, exchange_rate: e.target.value }))} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm font-bold text-slate-800 transition-colors" placeholder="1.0" />
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Коментар</label>
                                    <textarea rows="2" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-200 outline-none text-sm text-slate-800 transition-colors resize-none" placeholder="Примітки..." />
                                </div>
                            </form>

                            <div className="p-4 sm:p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0 pb-safe">
                                <button type="button" onClick={() => setEditModal({ isOpen: false, mov: null })} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                <button form="edit-mov-form" type="submit" disabled={isSavingEdit} className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                                    {isSavingEdit ? 'Збереження...' : 'Зберегти зміни'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- МОДАЛКА: ПОВЕРНЕННЯ ОПЕРАЦІЇ --- */}
            <AnimatePresence>
                {returnModal.isOpen && returnModal.mov && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[85]">
                        <motion.div initial={{ scale: 0.98, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 30 }} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl flex flex-col max-h-[95vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-teal-50 flex-shrink-0">
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-teal-900 flex items-center gap-2"><FaArrowDown className="text-teal-500"/> Повернення операції</h2>
                                    <p className="text-[11px] text-teal-700/70 mt-0.5 truncate">{returnModal.mov.conf?.label} • {returnModal.mov.nom?.fullName}</p>
                                </div>
                                <button onClick={() => setReturnModal({ isOpen: false, mov: null, maxQty: 0 })} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm flex-shrink-0"><FaTimes/></button>
                            </div>

                            <form id="return-mov-form" onSubmit={handleReturn} className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[12px] text-slate-600 flex items-start gap-2">
                                    <FaInfoCircle className="text-teal-500 mt-0.5 shrink-0"/>
                                    <p>Товар повернеться на склад <b>«{returnModal.mov.routeStr?.split(' → ')[0] || '—'}»</b>. Доступно до повернення: <b className="text-teal-700">{returnModal.maxQty} {returnModal.mov.nom?.unitCode}</b>.</p>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Кількість до повернення</label>
                                    <div className="flex items-center gap-3">
                                        <input type="number" step="any" min="0" max={returnModal.maxQty} required autoFocus value={returnForm.quantity} onChange={e => setReturnForm(f => ({ ...f, quantity: e.target.value }))} className="w-32 px-4 py-3 bg-white border-2 border-teal-200 focus:border-teal-500 rounded-xl text-xl font-black text-teal-700 text-center outline-none transition-colors" />
                                        <span className="text-sm font-bold text-slate-400 uppercase">{returnModal.mov.nom?.unitCode}</span>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Причина (напр. переплутали товар)</label>
                                    <input type="text" value={returnForm.reason} onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-teal-200 outline-none text-sm text-slate-800 transition-colors" placeholder="Опційно..." />
                                </div>
                            </form>

                            <div className="p-4 sm:p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0 pb-safe">
                                <button type="button" onClick={() => setReturnModal({ isOpen: false, mov: null, maxQty: 0 })} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                <button form="return-mov-form" type="submit" disabled={isReturning} className="px-8 py-2.5 bg-teal-600 text-white rounded-xl font-bold shadow-md hover:bg-teal-700 transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                                    {isReturning ? 'Обробка...' : 'Підтвердити повернення'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}