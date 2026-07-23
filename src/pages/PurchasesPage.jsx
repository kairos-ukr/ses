import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaSearch, FaEdit, FaTimes, FaCheck, FaExclamationTriangle, 
    FaInfoCircle, FaFileInvoiceDollar, FaBoxOpen, FaRegCalendarAlt,
    FaBuilding, FaHardHat, FaChevronRight, 
    FaTruckLoading, FaFileExcel, FaMoneyBillAlt, FaUniversity
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

// Імпортуємо зовнішній компонент модалки
import PurchaseOrderModal from './PurchaseOrderModal'; 

const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(onClose, 4000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);
    const styles = { success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white', warning: 'bg-amber-500 text-white' };
    const icons = { success: <FaCheck />, error: <FaExclamationTriangle />, warning: <FaExclamationTriangle /> };
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 right-4 z-[100] w-full sm:w-auto px-4 sm:px-0">
                    <div className={`${styles[type] || 'bg-blue-600'} rounded-xl shadow-2xl p-4 flex items-center justify-between border border-white/20`}>
                        <div className="flex items-center space-x-3">
                            {icons[type] || <FaInfoCircle className="text-white" />}
                            <span className="font-bold text-sm">{message}</span>
                        </div>
                        <button onClick={onClose} className="ml-4 text-white/80 hover:text-white transition-colors"><FaTimes /></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

export default function PurchasesPage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();
    
    const [orders, setOrders] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);
    const [categories, setCategories] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [systemMemory, setSystemMemory] = useState([]);
    const [employeesDict, setEmployeesDict] = useState({});
    
    const [loading, setLoading] = useState(true);
    const [expandedRowId, setExpandedRowId] = useState(null); 
    const [statusFilter, setStatusFilter] = useState('all');
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // Стейт для нової модалки PurchaseOrderModal
    const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
    const [purchaseModalMode, setPurchaseModalMode] = useState('manual'); 
    const [purchaseModalEditData, setPurchaseModalEditData] = useState(null);
    const [purchaseModalImportFile, setPurchaseModalImportFile] = useState(null);

    // Стейт для інших модалок
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [paymentForm, setPaymentForm] = useState({ payment_type: 'bank_transfer', purpose: 'partial', amount: '', currency: 'UAH', exchange_rate: 1, notes: '' });
    const [receivingForm, setReceivingForm] = useState({ warehouse_id: '', items: [] });
    const fileInputRef = useRef(null);

    const ORDER_STATUSES = {
        draft: { l: 'Чернетка', c: 'bg-slate-100 text-slate-600 border-slate-200' },
        sent: { l: 'Замовлено', c: 'bg-blue-100 text-blue-700 border-blue-200' },
        partially_received: { l: 'Отримано частково', c: 'bg-amber-100 text-amber-700 border-amber-200' },
        received: { l: 'Отримано повністю', c: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
        cancelled: { l: 'Скасовано', c: 'bg-red-100 text-red-700 border-red-200' }
    };
    const PAYMENT_TYPES = { bank_transfer: 'Банк. переказ', vat: 'З ПДВ', no_vat: 'Без ПДВ', fop: 'Рахунок ФОП', cash: 'Готівка' };
    const PAYMENT_PURPOSES = { advance: 'Аванс', partial: 'Часткова', post: 'Постоплата', realization: 'Реалізація' };
    const CURRENCIES = ['UAH', 'USD', 'EUR']; 
    
    const toggleRowExpansion = (id) => setExpandedRowId(prev => prev === id ? null : id);

    // --- СЛУХАЄМО СИГНАЛ З БАТЬКІВСЬКОЇ СТОРІНКИ ---
    // Використовуємо useRef, щоб модалка не відкривалась сама при перемиканні вкладок
    const prevActionTrigger = useRef(externalActionTrigger);
    
    useEffect(() => {
        if (externalActionTrigger > prevActionTrigger.current) {
            setPurchaseModalEditData(null);
            setPurchaseModalImportFile(null);
            setPurchaseModalMode('manual');
            setIsPurchaseModalOpen(true);
        }
        prevActionTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [supRes, instRes, nomRes, catRes, whRes, empRes, memRes] = await Promise.all([
                supabase.from('suppliers').select('id, name').order('name'),
                supabase.from('installations').select('custom_id, name, status').in('status', ['planning', 'in_progress', 'pending']),
                supabase.from('nomenclature').select('id, name, sku, category_id, type, package_name, package_multiplier, unit:units(name)').eq('is_active', true).order('name'),
                supabase.from('categories').select('*'),
                supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
                supabase.from('employees').select('id, name'),
                supabase.from('supplier_mappings').select('*') 
            ]);
            
            setSuppliers(supRes.data || []);
            setInstallations(instRes.data || []);
            setWarehouses(whRes.data || []);
            setSystemMemory(memRes.data || []);
            
            const empDict = {};
            (empRes.data || []).forEach(e => empDict[e.id] = e.name);
            setEmployeesDict(empDict);

            const cats = catRes.data || [];
            setCategories(cats);
            const processedNom = (nomRes.data || []).map(item => {
                let path = [];
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim() };
            });
            setNomenclatures(processedNom);

            const { data: ordersData, error } = await supabase
                .from('purchase_orders')
                .select(`
                    *,
                    supplier:suppliers(name),
                    installation:installations(name),
                    items:purchase_order_items(
                        *,
                        movements:stock_movements(quantity, operation_type)
                    ),
                    payments:purchase_payments(*)
                `)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setOrders(ordersData || []);
        } catch (error) {
            showToast(`Помилка: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

    const calculateEffectivePayment = (amount, pCurr, rate, oCurr) => {
        if (pCurr === oCurr) return parseFloat(amount);
        if (pCurr === 'UAH' && oCurr !== 'UAH') return parseFloat(amount) / parseFloat(rate);
        if (pCurr !== 'UAH' && oCurr === 'UAH') return parseFloat(amount) * parseFloat(rate);
        return parseFloat(amount);
    };

    const getOrderTotals = (order) => {
        const totalCost = (order.items || []).reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
        const activePayments = (order.payments || []).filter(p => p.is_active);
        const totalPaid = activePayments.reduce((sum, p) => sum + calculateEffectivePayment(p.amount, p.currency, p.exchange_rate, order.currency), 0);
        return { totalCost, totalPaid, debt: Math.max(0, totalCost - totalPaid) };
    };

    const getItemReceivedQty = (item) => {
        return (item.movements || []).filter(m => m.operation_type === 'purchase').reduce((sum, m) => sum + parseFloat(m.quantity), 0);
    };

    const handleQuickAddSupplier = async (name) => {
        try {
            const { data, error } = await supabase.from('suppliers').insert([{ name, created_by: employee?.id }]).select().single();
            if (error) throw error;
            setSuppliers(prev => [...prev, data].sort((a,b) => a.name.localeCompare(b.name)));
            showToast(`Постачальника "${name}" додано`, 'success');
            return data.id; 
        } catch (error) { 
            showToast(error.message, 'error'); 
            return null;
        }
    };

    const openEditOrder = (order) => {
        setPurchaseModalEditData(order);
        setPurchaseModalMode('manual');
        setIsPurchaseModalOpen(true);
    };

    const handleExcelUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setPurchaseModalImportFile(file);
        setPurchaseModalMode('import');
        setIsPurchaseModalOpen(true);
        
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const openPayments = (order) => { 
        setSelectedOrder(order); 
        setPaymentForm({ payment_type: 'bank_transfer', purpose: 'partial', amount: '', currency: order.currency, exchange_rate: 1, notes: '' }); 
        setIsPaymentModalOpen(true); 
    };
    
    const handleSavePayment = async (e) => {
        e.preventDefault();
        if (!paymentForm.amount || paymentForm.amount <= 0) return showToast('Сума має бути більшою за 0', 'error');

        setIsSubmitting(true);
        try {
            const payload = {
                purchase_order_id: selectedOrder.id, payment_type: paymentForm.payment_type, payment_purpose: paymentForm.purpose,
                amount: parseFloat(paymentForm.amount), currency: paymentForm.currency, exchange_rate: parseFloat(paymentForm.exchange_rate),
                notes: paymentForm.notes || null, created_by: employee?.id, is_active: true
            };
            const { error } = await supabase.from('purchase_payments').insert([payload]);
            if (error) throw error;

            showToast('Платіж успішно додано', 'success');
            setPaymentForm({ payment_type: 'bank_transfer', purpose: 'partial', amount: '', currency: selectedOrder.currency, exchange_rate: 1, notes: '' });
            loadData(); 
            const { data } = await supabase.from('purchase_orders').select(`*, payments:purchase_payments(*)`).eq('id', selectedOrder.id).single();
            if (data) setSelectedOrder(prev => ({ ...prev, payments: data.payments }));
        } catch (error) { showToast(error.message, 'error'); } 
        finally { setIsSubmitting(false); }
    };

    const handleTogglePaymentStatus = async (payment) => {
        if (!window.confirm(payment.is_active ? "Анулювати платіж? Він не враховуватиметься в балансі." : "Відновити платіж?")) return;
        try {
            const { error } = await supabase.from('purchase_payments').update({ is_active: !payment.is_active, updated_by: employee?.id }).eq('id', payment.id);
            if (error) throw error;
            showToast('Статус платежу змінено', 'success');
            loadData();
            const { data } = await supabase.from('purchase_orders').select(`*, payments:purchase_payments(*)`).eq('id', selectedOrder.id).single();
            if (data) setSelectedOrder(prev => ({ ...prev, payments: data.payments }));
        } catch (error) { showToast(error.message, 'error'); }
    };

    const openReceiving = (order) => {
        const itemsToReceive = order.items.map(item => {
            const rcvd = getItemReceivedQty(item);
            return {
                po_item_id: item.id, nomenclature_id: item.nomenclature_id,
                ordered: item.quantity, received_already: rcvd,
                receive_now: rcvd < item.quantity ? (item.quantity - rcvd) : 0 
            };
        }).filter(item => item.receive_now > 0); 

        setSelectedOrder(order);
        setReceivingForm({ warehouse_id: '', items: itemsToReceive });
        setIsReceivingModalOpen(true);
    };

    const handleSaveReceiving = async (e) => {
        e.preventDefault();
        if (!receivingForm.warehouse_id) return showToast('Оберіть склад призначення', 'error');
        
        const validItems = receivingForm.items.filter(i => parseInt(i.receive_now, 10) > 0);
        if (validItems.length === 0) return showToast('Вкажіть кількість для приймання (більше 0 цілих)', 'error');

        setIsSubmitting(true);
        try {
            const movementsPayload = validItems.map(item => ({
                operation_type: 'purchase',
                nomenclature_id: item.nomenclature_id,
                quantity: parseInt(item.receive_now, 10),
                warehouse_to_id: receivingForm.warehouse_id,
                purchase_order_item_id: item.po_item_id,
                created_by: employee?.id,
                performed_by: employee?.id
            }));

            const { error: moveErr } = await supabase.from('stock_movements').insert(movementsPayload);
            if (moveErr) throw moveErr;

            let allFullyReceived = true;
            let someReceived = false;

            selectedOrder.items.forEach(orderItem => {
                const alreadyReceived = getItemReceivedQty(orderItem);
                const receivingNowObj = validItems.find(vi => vi.po_item_id === orderItem.id);
                const receivingNow = receivingNowObj ? parseInt(receivingNowObj.receive_now, 10) : 0;
                
                const totalAfter = alreadyReceived + receivingNow;
                
                if (totalAfter > 0) someReceived = true;
                if (totalAfter < orderItem.quantity) allFullyReceived = false;
            });

            const newStatus = allFullyReceived ? 'received' : (someReceived ? 'partially_received' : selectedOrder.status);

            if (newStatus !== selectedOrder.status) {
                const { error: stErr } = await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', selectedOrder.id);
                if (stErr) throw stErr;
            }

            // --- АВТО-РЕЗЕРВ ПІД ОБ'ЄКТ (якщо PO прив'язане до об'єкта) ---
            let reservedCount = 0;
            if (selectedOrder.installation_custom_id) {
                try {
                    const instId = selectedOrder.installation_custom_id;
                    const { data: needs } = await supabase
                        .from('v_object_material_needs')
                        .select('nomenclature_id, outstanding_need')
                        .eq('installation_custom_id', instId);
                    const outstandingByNom = {};
                    (needs || []).forEach(n => {
                        outstandingByNom[n.nomenclature_id] = (outstandingByNom[n.nomenclature_id] || 0) + parseFloat(n.outstanding_need);
                    });
                    for (const item of validItems) {
                        const need = outstandingByNom[item.nomenclature_id] || 0;
                        const qty = Math.min(parseInt(item.receive_now, 10), need);
                        if (qty > 0) {
                            const { data: rr } = await supabase.rpc('reserve_for_object', {
                                p_installation: instId,
                                p_warehouse: parseInt(receivingForm.warehouse_id),
                                p_nomenclature: item.nomenclature_id,
                                p_spec_item: null,
                                p_qty: qty,
                                p_emp: employee?.id ?? null,
                            });
                            if (rr && rr.ok) reservedCount++;
                            outstandingByNom[item.nomenclature_id] = need - qty;
                        }
                    }
                } catch (rErr) {
                    console.warn('Авто-резерв під об\'єкт не вдався:', rErr.message);
                }
            }

            showToast(reservedCount > 0 ? `Прийнято на склад. Авто-резерв під об'єкт: ${reservedCount} поз.` : 'Товари успішно прийняті на склад', 'success');
            setIsReceivingModalOpen(false);
            loadData();
        } catch (error) { showToast(error.message, 'error'); }
        finally { setIsSubmitting(false); }
    };

    // Фільтрація з використанням externalSearch
    const filteredOrders = orders.filter(o => {
        const term = externalSearch.toLowerCase();
        const matchesSearch = o.order_number.toLowerCase().includes(term) || (o.supplier?.name && o.supplier.name.toLowerCase().includes(term)) || (o.invoice_number && o.invoice_number.toLowerCase().includes(term));
        const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500">Завантаження...</div>;

    return (
        <div className="flex flex-col h-full w-full">
            <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

            {/* --- ПАНЕЛЬ ФІЛЬТРІВ ТА КНОПОК --- */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-3 rounded-[16px] border border-slate-200 shadow-sm mb-4 flex-none w-full">
                
                {/* ЛІВА ЧАСТИНА: Фільтри статусів */}
                <div className="flex-1 w-full xl:w-auto overflow-x-auto hide-scrollbar">
                    <div className="flex bg-slate-50 rounded-xl p-1.5 w-fit border border-slate-100">
                        <button onClick={() => setStatusFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'all' ? 'bg-[#0F172A] text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>Всі</button>
                        {Object.entries(ORDER_STATUSES).map(([key, val]) => (
                            <button key={key} onClick={() => setStatusFilter(key)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === key ? 'bg-indigo-100 text-indigo-800 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>{val.l}</button>
                        ))}
                    </div>
                </div>

                {/* ПРАВА ЧАСТИНА: Кнопки дій */}
                <div className="flex gap-3 w-full sm:w-fit flex-none">
                    <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleExcelUpload} />
                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold shadow-sm hover:bg-emerald-100 transition-colors text-sm">
                        <FaFileExcel size={16} /> <span className="hidden sm:inline">Імпорт рахунку (Excel)</span>
                    </button>
                    {/* Кнопка "Вручну" дублює головну кнопку, але залишаємо для зручності */}
                    <button onClick={() => { setPurchaseModalEditData(null); setPurchaseModalImportFile(null); setPurchaseModalMode('manual'); setIsPurchaseModalOpen(true); }} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-colors text-sm">
                        <FaPlus size={14} /> <span>Вручну</span>
                    </button>
                </div>
            </div>

            {/* ТАБЛИЦЯ */}
            <div className="bg-white rounded-[16px] shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col min-h-0">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center"><div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div></div>
                ) : filteredOrders.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                        <FaBoxOpen className="text-6xl text-slate-200 mb-4" />
                        <h3 className="text-lg font-bold text-slate-600">Немає закупівель</h3>
                        <p className="text-slate-400 text-sm mt-1">Змініть фільтри або створіть нове замовлення.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse min-w-[1100px]">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="px-4 py-4 w-10"></th>
                                    <th className="px-2 py-4 font-bold">Замовлення / Рахунок</th>
                                    <th className="px-6 py-4 font-bold">Постачальник</th>
                                    <th className="px-6 py-4 font-bold">Статус / Форма</th>
                                    <th className="px-6 py-4 font-bold w-1/5">Фінанси</th>
                                    <th className="px-6 py-4 font-bold text-right">Дії</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredOrders.map(order => {
                                    const { totalCost, totalPaid } = getOrderTotals(order);
                                    const progress = totalCost > 0 ? Math.min(100, Math.round((totalPaid / totalCost) * 100)) : 0;
                                    const statusObj = ORDER_STATUSES[order.status];
                                    const isExpanded = expandedRowId === order.id;
                                    const canReceive = order.status === 'sent' || order.status === 'partially_received';
                                    const canPay = order.status !== 'draft' && order.status !== 'cancelled';

                                    // Отримуємо красиву назву об'єкта
                                    const instName = order.installation_custom_id ? installations.find(i=>i.custom_id === order.installation_custom_id)?.name : null;
                                    const instLabel = instName ? `${instName} (Об'єкт #${order.installation_custom_id})` : `Об'єкт #${order.installation_custom_id}`;

                                    return (
                                        <React.Fragment key={order.id}>
                                            <tr className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                                                <td className="px-4 py-4 text-center cursor-pointer" onClick={() => toggleRowExpansion(order.id)}>
                                                    <div className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors mx-auto">
                                                        <FaChevronRight className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90 text-indigo-500' : ''}`} />
                                                    </div>
                                                </td>
                                                <td className="px-2 py-4 cursor-pointer" onClick={() => toggleRowExpansion(order.id)}>
                                                    <div className="font-bold text-slate-800 text-sm">{order.order_number}</div>
                                                    {order.invoice_number ? (
                                                        <div className="text-[11px] text-indigo-600 mt-1 font-bold">Рах: {order.invoice_number}</div>
                                                    ) : (
                                                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1"><FaRegCalendarAlt/> {new Date(order.order_date).toLocaleDateString('uk-UA')}</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-700 text-sm flex items-center gap-2"><FaBuilding className="text-slate-300"/> {order.supplier?.name}</div>
                                                    {order.installation_custom_id && (
                                                        <div className="text-[10px] font-bold text-slate-500 mt-1 flex items-center gap-1">
                                                            <FaHardHat className="flex-shrink-0"/> {instLabel}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase tracking-wide ${statusObj.c}`}>{statusObj.l}</span>
                                                        <span className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded ${order.payment_form === 'cash' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                            {order.payment_form === 'cash' ? <FaMoneyBillAlt/> : <FaUniversity/>} {order.payment_form === 'cash' ? 'Готівка' : 'Безготівка'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-between text-[13px] mb-1.5">
                                                        <span className="font-bold text-slate-800">{totalCost.toLocaleString('uk-UA', {minimumFractionDigits: 2})} {order.currency}</span>
                                                        <span className={`font-bold ${progress >= 100 ? 'text-emerald-600' : 'text-slate-500'}`}>{totalPaid.toLocaleString('uk-UA', {minimumFractionDigits: 2})}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                                                        <div className={`h-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {order.invoice_file_id && (
                                                            <a href={`https://drive.google.com/open?id=${order.invoice_file_id}`} target="_blank" rel="noreferrer" className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors mr-1" title="Відкрити рахунок">
                                                                <FaFileExcel size={16}/>
                                                            </a>
                                                        )}
                                                        {canReceive && (
                                                            <button onClick={() => openReceiving(order)} className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-transparent hover:border-emerald-200 mr-1" title="Прийняти товар на склад">
                                                                <FaTruckLoading size={16}/>
                                                            </button>
                                                        )}
                                                        {canPay && (
                                                            <button onClick={() => openPayments(order)} className="p-2 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100" title="Взаєморозрахунки (Платежі)">
                                                                <FaFileInvoiceDollar size={16} />
                                                            </button>
                                                        )}
                                                        <button onClick={() => openEditOrder(order)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-100" title="Редагувати">
                                                            <FaEdit size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            {/* Розгорнутий рядок (Специфікація) */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan="6" className="p-0 border-b border-slate-200 bg-slate-50/80 shadow-inner">
                                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                                <div className="p-6 pl-14">
                                                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Детальна специфікація замовлення</h4>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                                        {order.items.map(item => {
                                                                            const rcvd = getItemReceivedQty(item);
                                                                            const rcvdProgress = item.quantity > 0 ? Math.min(100, Math.round((rcvd / item.quantity) * 100)) : 0;
                                                                            const nom = nomenclatures.find(n => n.id === item.nomenclature_id);
                                                                            
                                                                            return (
                                                                                <div key={item.id} className="bg-white border border-slate-200 p-3 rounded-xl shadow-sm hover:border-indigo-200 transition-colors">
                                                                                    <div className="font-bold text-slate-800 text-sm leading-tight mb-1">{nom?.fullName || 'Невідомий товар'}</div>
                                                                                    {item.supplier_item_name && <div className="text-[10px] text-slate-400 italic mb-2">Оригінал: {item.supplier_item_name}</div>}
                                                                                    <div className="flex justify-between items-center mb-3">
                                                                                        <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">SKU: {nom?.sku || '---'}</span>
                                                                                        <span className="font-bold text-indigo-700 text-xs">{parseFloat(item.unit_price).toLocaleString('uk-UA')} {order.currency} <span className="text-slate-400 font-normal">/ {nom?.unit?.name || 'од'}</span></span>
                                                                                    </div>
                                                                                    
                                                                                    <div className="flex justify-between items-center text-[10px] mb-1 font-medium">
                                                                                        <span className="text-slate-500">На складі: <b className={rcvd >= item.quantity ? 'text-emerald-600' : 'text-amber-600'}>{rcvd}</b> з {item.quantity}</span>
                                                                                    </div>
                                                                                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                                                                        <div className={`h-full ${rcvd >= item.quantity ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${rcvdProgress}%` }}></div>
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

            {/* Модалка Створення Замовлення / Імпорту */}
            <PurchaseOrderModal
                isOpen={isPurchaseModalOpen}
                onClose={() => {
                    setIsPurchaseModalOpen(false);
                    setPurchaseModalImportFile(null);
                    setPurchaseModalEditData(null);
                }}
                onSuccess={loadData}
                initialMode={purchaseModalMode}
                editOrder={purchaseModalEditData}
                importFile={purchaseModalImportFile}
                dictionaries={{ suppliers, installations, nomenclatures, categories, systemMemory }}
                employee={employee}
                showToast={showToast}
                onAddSupplier={handleQuickAddSupplier}
            />

            {/* --- СТАРІ МОДАЛКИ (ОПЛАТА ТА ПРИЙМАННЯ НА СКЛАД) ЗАЛИШАЮТЬСЯ БЕЗ ЗМІН --- */}
            <AnimatePresence>
                {isPaymentModalOpen && selectedOrder && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FaFileInvoiceDollar className="text-indigo-500"/> Взаєморозрахунки</h2>
                                    <p className="text-sm text-slate-500 mt-1">Замовлення {selectedOrder.order_number}</p>
                                </div>
                                <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 bg-white hover:bg-slate-200 text-slate-400 rounded-full transition-colors"><FaTimes/></button>
                            </div>
                            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Загальна сума</div>
                                        <div className="text-xl font-black text-slate-800">{getOrderTotals(selectedOrder).totalCost.toLocaleString('uk-UA', {minimumFractionDigits: 2})} <span className="text-sm text-slate-500">{selectedOrder.currency}</span></div>
                                    </div>
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                                        <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Оплачено</div>
                                        <div className="text-xl font-black text-emerald-700">{getOrderTotals(selectedOrder).totalPaid.toLocaleString('uk-UA', {minimumFractionDigits: 2})} <span className="text-sm text-emerald-500">{selectedOrder.currency}</span></div>
                                    </div>
                                    <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                                        <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Борг</div>
                                        <div className="text-xl font-black text-red-700">{getOrderTotals(selectedOrder).debt.toLocaleString('uk-UA', {minimumFractionDigits: 2})} <span className="text-sm text-red-500">{selectedOrder.currency}</span></div>
                                    </div>
                                </div>
                                
                                {getOrderTotals(selectedOrder).debt > 0 && (
                                    <form id="payment-form" onSubmit={handleSavePayment} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm mb-6">
                                        <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Внести платіж</h3>
                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Тип оплати</label>
                                                <select value={paymentForm.payment_type} onChange={e => setPaymentForm({...paymentForm, payment_type: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none">
                                                    {Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Призначення</label>
                                                <select value={paymentForm.purpose} onChange={e => setPaymentForm({...paymentForm, purpose: e.target.value})} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none">
                                                    {Object.entries(PAYMENT_PURPOSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Сума</label>
                                                <input type="number" step="0.01" max={getOrderTotals(selectedOrder).debt} required value={paymentForm.amount} onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-lg font-black text-indigo-700 outline-none" placeholder="0.00" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Валюта платежу</label>
                                                <div className="flex gap-2">
                                                    <select value={paymentForm.currency} onChange={e => setPaymentForm({...paymentForm, currency: e.target.value})} className="w-1/2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none">
                                                        {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                    {paymentForm.currency !== selectedOrder.currency && (
                                                        <input type="number" step="0.0001" value={paymentForm.exchange_rate} onChange={e => setPaymentForm({...paymentForm, exchange_rate: e.target.value})} className="w-1/2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm outline-none" title="Курс валюти" />
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-md hover:bg-indigo-700 transition-colors disabled:opacity-50">
                                            {isSubmitting ? 'Обробка...' : 'Підтвердити оплату'}
                                        </button>
                                    </form>
                                )}

                                <div>
                                    <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider mb-3">Історія платежів</h3>
                                    {!selectedOrder.payments || selectedOrder.payments.length === 0 ? (
                                        <div className="text-center p-6 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">Платежів ще не було</div>
                                    ) : (
                                        <div className="space-y-2">
                                            {selectedOrder.payments.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).map(p => (
                                                <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl border ${p.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`font-bold ${p.is_active ? 'text-slate-800' : 'text-slate-500 line-through'}`}>{parseFloat(p.amount).toLocaleString('uk-UA', {minimumFractionDigits: 2})} {p.currency}</span>
                                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{PAYMENT_TYPES[p.payment_type]}</span>
                                                        </div>
                                                        <div className="text-xs text-slate-400 mt-1">{new Date(p.created_at).toLocaleString('uk-UA')} • {employeesDict[p.created_by] || 'Система'}</div>
                                                    </div>
                                                    <button onClick={() => handleTogglePaymentStatus(p)} className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${p.is_active ? 'text-red-600 border-red-200 hover:bg-red-50' : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50'}`}>
                                                        {p.is_active ? 'Анулювати' : 'Відновити'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isReceivingModalOpen && selectedOrder && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50 flex-shrink-0">
                                <div>
                                    <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2"><FaTruckLoading className="text-emerald-600"/> Приймання товару</h2>
                                    <p className="text-sm text-emerald-700 mt-1 font-medium">Замовлення {selectedOrder.order_number} від {selectedOrder.supplier?.name}</p>
                                </div>
                                <button onClick={() => setIsReceivingModalOpen(false)} className="p-2 bg-white hover:bg-slate-200 text-slate-400 rounded-full transition-colors"><FaTimes/></button>
                            </div>
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                                <form id="receive-form" onSubmit={handleSaveReceiving}>
                                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <label className="block text-sm font-bold text-slate-700 mb-2">Оберіть склад для отримання <span className="text-red-500">*</span></label>
                                        <select required value={receivingForm.warehouse_id} onChange={e => setReceivingForm({...receivingForm, warehouse_id: e.target.value})} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800">
                                            <option value="">Не обрано...</option>
                                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                                                    <th className="px-4 py-3 font-bold">Товар</th>
                                                    <th className="px-4 py-3 font-bold text-center">Замовлено</th>
                                                    <th className="px-4 py-3 font-bold text-center">Отримано</th>
                                                    <th className="px-4 py-3 font-bold text-center bg-emerald-50/50">Прийняти зараз</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {receivingForm.items.length === 0 ? (
                                                    <tr><td colSpan="4" className="px-4 py-8 text-center text-slate-400 font-medium">Всі товари з цього замовлення вже прийняті.</td></tr>
                                                ) : (
                                                    receivingForm.items.map((item, index) => {
                                                        const nom = nomenclatures.find(n => n.id === item.nomenclature_id);
                                                        return (
                                                            <tr key={item.po_item_id} className="hover:bg-slate-50 transition-colors">
                                                                <td className="px-4 py-3">
                                                                    <div className="font-bold text-slate-800 text-sm">{nom?.fullName || 'Невідомий товар'}</div>
                                                                    {nom?.sku && <div className="text-[10px] font-mono text-slate-400 mt-0.5">SKU: {nom.sku}</div>}
                                                                </td>
                                                                <td className="px-4 py-3 text-center font-bold text-slate-600">{item.ordered} <span className="text-[10px] font-normal">{nom?.unit?.name}</span></td>
                                                                <td className="px-4 py-3 text-center font-bold text-indigo-600">{item.received_already} <span className="text-[10px] font-normal">{nom?.unit?.name}</span></td>
                                                                <td className="px-4 py-3 text-center bg-emerald-50/20">
                                                                    <input 
                                                                        type="number" min="0" step="1" max={item.ordered - item.received_already} required
                                                                        value={item.receive_now} 
                                                                        onChange={e => { const newItems = [...receivingForm.items]; newItems[index].receive_now = e.target.value; setReceivingForm({...receivingForm, items: newItems}); }}
                                                                        className="w-24 text-center px-3 py-1.5 bg-white border-2 border-emerald-200 focus:border-emerald-500 rounded-lg text-lg font-black text-emerald-700 outline-none"
                                                                    />
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </form>
                            </div>
                            <div className="p-6 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-slate-50 rounded-b-2xl">
                                <button type="button" onClick={() => setIsReceivingModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                {receivingForm.items.length > 0 && (
                                    <button form="receive-form" type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 shadow-md transition-colors text-sm flex items-center gap-2">
                                        {isSubmitting ? 'Обробка...' : 'Підтвердити приймання'}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}