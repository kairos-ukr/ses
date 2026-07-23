import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaSearch, FaEdit, FaTrash, FaTimes, FaCheck, FaExclamationTriangle, 
    FaInfoCircle, FaFileInvoiceDollar, FaBoxOpen, FaRegCalendarAlt,
    FaChevronDown, FaBuilding, FaHardHat, FaChevronRight, 
    FaTruckLoading, FaFileExcel, FaBrain, FaMagic, FaMoneyBillAlt, FaUniversity, FaBox,
    FaPhoneAlt, FaUserTie, FaPowerOff, FaAddressBook
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import Layout from '../Layout';
import { useAuth } from '../AuthProvider';

const WORKFLOW_UPLOADER_URL = "https://quiet-water-a1ad.kairosost38500.workers.dev";
const EXCEL_API_URL = "http://localhost:8000/parse-excel";

// --- ДОПОМІЖНІ АЛГОРИТМИ ---
const findBestMatch = (supplierName, memory, noms) => {
    const cleanSupplier = String(supplierName).toLowerCase().trim();
    const memMatch = memory.find(m => String(m.supplier_item_name).toLowerCase().trim() === cleanSupplier);
    if (memMatch) return memMatch.nomenclature_id;
    const exactNom = noms.find(n => String(n.fullName).toLowerCase().trim() === cleanSupplier || String(n.name).toLowerCase().trim() === cleanSupplier);
    if (exactNom) return exactNom.id;
    const tokenize = (str) => String(str).toLowerCase().replace(/[()\[\]{}:;,.\/\\-]/g, ' ').split(/\s+/).filter(w => w.length > 2);
    const supplierTokens = tokenize(supplierName);
    if (supplierTokens.length === 0) return '';
    let bestMatch = '';
    let maxScore = 0;
    noms.forEach(nom => {
        const nomTokens = tokenize(nom.fullName);
        let score = 0;
        supplierTokens.forEach(sToken => { nomTokens.forEach(nToken => { if (nToken.includes(sToken) || sToken.includes(nToken)) score += 1; }); });
        if (nom.sku && cleanSupplier.includes(String(nom.sku).toLowerCase())) score += 5;
        const threshold = Math.min(supplierTokens.length, 2);
        if (score >= threshold && score > maxScore) { maxScore = score; bestMatch = nom.id; }
    });
    return bestMatch;
};

// --- TOAST ---
const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }
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

// --- ЗАВАНТАЖЕННЯ ФАЙЛУ ---
async function uploadInvoiceFile(file, objectId, invoiceNumber, invoiceDate) {
    const fd = new FormData();
    fd.append("files", file);
    fd.append("doc_type", "Рахунок постачальника");
    const folderName = objectId 
        ? String(objectId) 
        : `Склад_Рахунок_${invoiceNumber || 'БН'}_від_${invoiceDate || new Date().toISOString().split('T')[0]}`;
    fd.append("object_number", folderName);
    const res = await fetch(`${WORKFLOW_UPLOADER_URL}/workflow/upload`, { method: "POST", body: fd });
    let data;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data || data.status !== "success") throw new Error(data?.message || data?.detail || `Помилка завантаження файлу (${res.status})`);
    return data.files?.[0]?.fileId || null;
}

// --- SEARCHABLE SELECT З КНОПКОЮ ДОДАТИ ---
const SearchableSelectWithAdd = ({ options, value, onChange, onAddNew, placeholder, icon: Icon, noAdd = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.id === value);
    const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
    const exactMatch = options.some(o => o.label.toLowerCase() === search.trim().toLowerCase());

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div 
                className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl flex justify-between items-center cursor-pointer text-sm transition-colors hover:border-indigo-400 h-[42px]"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-2 truncate pr-2">
                    {Icon && <Icon className={selectedOption ? "text-indigo-500" : "text-slate-400"} />}
                    <span className={selectedOption ? 'text-slate-800 font-bold' : 'text-slate-400'}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <FaChevronDown className={`text-slate-400 text-xs flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }} className="absolute z-[90] w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-72">
                        <div className="p-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                            <input autoFocus type="text" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                            {filtered.length > 0 ? filtered.map(o => (
                                <div key={o.id} className={`px-3 py-2.5 cursor-pointer text-sm rounded-lg transition-colors mb-0.5 ${o.id === value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}>
                                    {o.label}
                                </div>
                            )) : <div className="px-4 py-4 text-sm text-slate-400 text-center border-dashed border-2 border-slate-100 rounded-lg m-1">Нічого не знайдено</div>}
                        </div>
                        {!noAdd && search.trim() !== '' && !exactMatch && (
                            <div className="p-2 border-t border-slate-100 bg-amber-50 flex-shrink-0">
                                <button type="button" onClick={() => { onAddNew(search.trim()); setIsOpen(false); setSearch(''); }} className="w-full py-2 bg-white border border-amber-200 text-amber-700 hover:bg-amber-600 hover:text-white hover:border-amber-600 rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2">
                                    <FaPlus /> Додати "{search.trim()}"
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// --- NOMENCLATURE SELECT ---
const NomenclatureSelect = ({ options, value, onChange, placeholder = "Оберіть товар..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.id === value);
    const filtered = options.filter(o => o.fullName.toLowerCase().includes(search.toLowerCase()) || (o.sku && o.sku.toLowerCase().includes(search.toLowerCase())));

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div 
                className={`w-full px-3 h-[38px] bg-white border rounded-lg flex justify-between items-center cursor-pointer text-sm transition-colors ${!selectedOption && placeholder.includes('Увага') ? 'border-red-400 bg-red-50' : 'border-slate-300 hover:border-indigo-400'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="truncate pr-2">
                    {selectedOption ? (
                        <span className="font-bold text-slate-800">{selectedOption.fullName}</span>
                    ) : (
                        <span className={placeholder.includes('Увага') ? 'text-red-500 font-bold' : 'text-slate-400'}>{placeholder}</span>
                    )}
                </div>
                <FaChevronDown className="text-slate-400 text-[10px] flex-shrink-0" />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute z-[999] w-[350px] right-0 sm:left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50"><input autoFocus type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Пошук по базі..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                            {filtered.length > 0 ? filtered.map(o => (
                                <div key={o.id} className={`px-3 py-2 cursor-pointer text-sm rounded-lg mb-0.5 transition-colors ${o.id === value ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'}`} onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}>
                                    <div className="font-bold text-slate-800 leading-tight">{o.fullName}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        {o.sku && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded">SKU: {o.sku}</span>}
                                        <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-1.5 rounded border border-indigo-100">{o.unit?.name || 'шт'}</span>
                                    </div>
                                </div>
                            )) : <div className="px-4 py-4 text-sm text-slate-400 text-center">Нічого не знайдено</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ============================================================
// ГОЛОВНИЙ КОМПОНЕНТ
// ============================================================
export default function PurchasesPage() {
    const { employee, loading: authLoading } = useAuth();

    // --- АКТИВНА ВКЛАДКА ---
    const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'suppliers'

    // --- ДАНІ ---
    const [orders, setOrders] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [systemMemory, setSystemMemory] = useState([]);
    const [employeesDict, setEmployeesDict] = useState({});

    // --- UI стейти ---
    const [loading, setLoading] = useState(true);
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [suppliersSearch, setSuppliersSearch] = useState('');
    const [suppliersStatusFilter, setSuppliersStatusFilter] = useState('active');
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // --- МОДАЛКИ ---
    const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false); // модалка постачальника
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- ФОРМИ ---
    const [editingOrderId, setEditingOrderId] = useState(null);
    const [orderForm, setOrderForm] = useState({
        supplier_id: '', installation_custom_id: '', status: 'draft',
        currency: 'UAH', expected_delivery_date: '', notes: '', items: [],
        payment_form: 'cash', invoice_number: '', invoice_date: ''
    });
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [paymentForm, setPaymentForm] = useState({ payment_type: 'bank_transfer', purpose: 'partial', amount: '', currency: 'UAH', exchange_rate: 1, notes: '' });
    const [receivingForm, setReceivingForm] = useState({ warehouse_id: '', items: [] });
    const [importData, setImportData] = useState([]);
    const [importSupplierId, setImportSupplierId] = useState('');
    const [importFile, setImportFile] = useState(null);
    const [importMeta, setImportMeta] = useState({ payment_form: 'cashless', invoice_number: '', invoice_date: '', installation_custom_id: '', status: 'sent' });
    const fileInputRef = useRef(null);

    // --- ФОРМА ПОСТАЧАЛЬНИКА ---
    const [editingSupplierId, setEditingSupplierId] = useState(null);
    const initialSupplierForm = { name: '', phone: '', contact_person: '', notes: '', is_active: true };
    const [supplierForm, setSupplierForm] = useState(initialSupplierForm);

    // --- ДОВІДНИКИ ---
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

    // ===== ЗАВАНТАЖЕННЯ ДАНИХ =====
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [supRes, instRes, nomRes, catRes, whRes, empRes, memRes] = await Promise.all([
                supabase.from('suppliers').select('id, name, phone, contact_person, notes, is_active, created_at').order('name'),
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
                .select(`*, supplier:suppliers(name), installation:installations(name), items:purchase_order_items(*, movements:stock_movements(quantity, operation_type)), payments:purchase_payments(*)`)
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

    // ===== ОБРАХУНКИ =====
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
    const getItemReceivedQty = (item) => (item.movements || []).filter(m => m.operation_type === 'purchase').reduce((sum, m) => sum + parseFloat(m.quantity), 0);

    // ===== ПОСТАЧАЛЬНИКИ: CRUD =====
    const openAddSupplier = (prefillName = '') => {
        setEditingSupplierId(null);
        setSupplierForm({ ...initialSupplierForm, name: prefillName });
        setIsSupplierModalOpen(true);
    };

    const openEditSupplier = (item) => {
        setEditingSupplierId(item.id);
        setSupplierForm({ name: item.name, phone: item.phone || '', contact_person: item.contact_person || '', notes: item.notes || '', is_active: item.is_active });
        setIsSupplierModalOpen(true);
    };

    const handleSaveSupplier = async (e) => {
        e.preventDefault();
        if (!supplierForm.name.trim()) return showToast('Введіть назву компанії/ФОПа', 'error');
        setIsSubmitting(true);
        try {
            const payload = {
                name: supplierForm.name.trim(),
                phone: supplierForm.phone.trim() || null,
                email: null,
                contact_person: supplierForm.contact_person.trim() || null,
                notes: supplierForm.notes.trim() || null,
                is_active: supplierForm.is_active,
                updated_by: employee?.id
            };
            if (editingSupplierId) {
                const { error } = await supabase.from('suppliers').update(payload).eq('id', editingSupplierId);
                if (error) throw error;
                showToast('Дані постачальника оновлено', 'success');
            } else {
                payload.created_by = employee?.id;
                const { data, error } = await supabase.from('suppliers').insert([payload]).select().single();
                if (error) throw error;
                showToast('Нового постачальника додано', 'success');
                // Якщо додавали через форму замовлення — відразу обираємо
                setOrderForm(prev => ({ ...prev, supplier_id: data.id }));
                setImportSupplierId(data.id);
            }
            setIsSupplierModalOpen(false);
            loadData();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Швидке додавання (тільки назва, з пошукового рядка)
    const handleQuickAddSupplier = async (name) => {
        // Відкриваємо нормальну модалку з пре-заповненим ім'ям
        openAddSupplier(name);
    };

    const handleToggleSupplierStatus = async (item) => {
        const confirmMsg = item.is_active
            ? `Деактивувати постачальника "${item.name}"?`
            : `Відновити постачальника "${item.name}"?`;
        if (!window.confirm(confirmMsg)) return;
        try {
            const { error } = await supabase.from('suppliers').update({ is_active: !item.is_active, updated_by: employee?.id }).eq('id', item.id);
            if (error) throw error;
            showToast('Статус постачальника оновлено', 'success');
            loadData();
        } catch (error) { showToast(error.message, 'error'); }
    };

    // ===== ЗАМОВЛЕННЯ: CRUD =====
    const openNewOrder = () => {
        setEditingOrderId(null);
        setOrderForm({ supplier_id: '', installation_custom_id: '', status: 'draft', currency: 'UAH', expected_delivery_date: '', notes: '', items: [], payment_form: 'cash', invoice_number: '', invoice_date: '' });
        setIsOrderModalOpen(true);
    };

    const openEditOrder = (order) => {
        setEditingOrderId(order.id);
        setOrderForm({
            supplier_id: order.supplier_id, installation_custom_id: order.installation_custom_id || '',
            status: order.status, currency: order.currency, expected_delivery_date: order.expected_delivery_date || '', notes: order.notes || '',
            payment_form: order.payment_form || 'cash', invoice_number: order.invoice_number || '', invoice_date: order.invoice_date || '',
            items: order.items.map(i => ({ nomenclature_id: i.nomenclature_id, quantity: i.quantity, unit_price: i.unit_price, supplier_item_name: i.supplier_item_name || '', is_package: false }))
        });
        setIsOrderModalOpen(true);
    };

    const saveOrderToDB = async (orderData, fileId = null) => {
        const headerPayload = {
            supplier_id: orderData.supplier_id, installation_custom_id: orderData.installation_custom_id || null,
            status: orderData.status, currency: orderData.currency, expected_delivery_date: orderData.expected_delivery_date || null,
            notes: orderData.notes || null, payment_form: orderData.payment_form,
            invoice_number: orderData.invoice_number || null, invoice_date: orderData.invoice_date || null, updated_by: employee?.id
        };
        if (fileId) headerPayload.invoice_file_id = fileId;

        let newPoId;
        if (editingOrderId) {
            await supabase.from('purchase_orders').update(headerPayload).eq('id', editingOrderId);
            await supabase.from('purchase_order_items').delete().eq('purchase_order_id', editingOrderId);
            newPoId = editingOrderId;
        } else {
            headerPayload.created_by = employee?.id;
            const { data: newPo } = await supabase.from('purchase_orders').insert([headerPayload]).select().single();
            newPoId = newPo.id;
        }

        const itemsPayload = orderData.items.map(i => {
            const nom = nomenclatures.find(n => n.id === i.nomenclature_id);
            let finalQty = parseInt(i.quantity, 10) || 0;
            let finalPrice = parseFloat(i.unit_price) || 0;
            if (i.is_package && nom && nom.package_multiplier) { finalQty = finalQty * parseInt(nom.package_multiplier, 10); finalPrice = finalPrice / parseInt(nom.package_multiplier, 10); }
            return { purchase_order_id: newPoId, nomenclature_id: i.nomenclature_id, quantity: finalQty, unit_price: finalPrice, supplier_item_name: i.supplier_item_name || null, created_by: employee?.id };
        });
        await supabase.from('purchase_order_items').insert(itemsPayload);

        const newMappings = [];
        for (const item of orderData.items) {
            if (item.supplier_item_name && item.nomenclature_id) {
                if (!systemMemory.some(m => String(m.supplier_item_name).toLowerCase().trim() === String(item.supplier_item_name).toLowerCase().trim())) {
                    newMappings.push({ supplier_item_name: item.supplier_item_name.trim(), nomenclature_id: item.nomenclature_id });
                }
            }
        }
        if (newMappings.length > 0) {
            await supabase.from('supplier_mappings').upsert(newMappings, { onConflict: 'supplier_item_name' });
            showToast(`Система запам'ятала ${newMappings.length} нових назв! 🧠`, 'success');
        }
    };

    const handleSaveOrder = async (e) => {
        e.preventDefault();
        if (!orderForm.supplier_id) return showToast('Оберіть постачальника', 'error');
        if (orderForm.items.length === 0) return showToast('Додайте хоча б один товар', 'error');
        if (orderForm.items.some(i => !i.nomenclature_id || parseInt(i.quantity, 10) <= 0 || parseFloat(i.unit_price) < 0)) return showToast('Перевірте коректність товарів', 'error');
        setIsSubmitting(true);
        try {
            await saveOrderToDB(orderForm);
            showToast('Закупівлю збережено', 'success');
            setIsOrderModalOpen(false);
            loadData();
        } catch (error) { showToast(error.message, 'error'); }
        finally { setIsSubmitting(false); }
    };

    // ===== EXCEL ІМПОРТ =====
    const handleExcelUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setImportFile(file);
        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const response = await fetch(EXCEL_API_URL, { method: 'POST', body: formData });
            if (!response.ok) { const errData = await response.json(); throw new Error(errData.detail || 'Помилка OCR сервісу'); }
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                const parsedItems = data.items.map(item => {
                    const matchedId = findBestMatch(item.name, systemMemory, nomenclatures);
                    return { id: Math.random().toString(), supplier_item_name: item.name, quantity: parseInt(item.quantity, 10) || 1, unit_price: parseFloat(item.price) || 0, nomenclature_id: matchedId, is_package: false };
                });
                setImportData(parsedItems);
                setImportMeta({ payment_form: 'cashless', invoice_number: '', invoice_date: '', installation_custom_id: '', status: 'sent' });
                setIsImportModalOpen(true);
                showToast(`Знайдено позицій: ${parsedItems.length}. Перевірте відповідність.`, 'success');
            } else { showToast('Не вдалося знайти таблицю товарів у файлі.', 'warning'); }
        } catch (error) { showToast(`Помилка: ${error.message}.`, 'error'); }
        finally { setIsSubmitting(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };

    const handleConfirmImport = async () => {
        if (!importSupplierId) return showToast('Оберіть постачальника', 'error');
        const unmapped = importData.filter(i => !i.nomenclature_id);
        if (unmapped.length > 0) return showToast(`Залишилось ${unmapped.length} нерозпізнаних позицій.`, 'error');
        setIsSubmitting(true);
        try {
            showToast('Завантаження файлу на диск...', 'success');
            const fileId = await uploadInvoiceFile(importFile, importMeta.installation_custom_id, importMeta.invoice_number, importMeta.invoice_date);
            showToast('Збереження замовлення...', 'success');
            const importedOrder = { supplier_id: importSupplierId, installation_custom_id: importMeta.installation_custom_id || null, status: importMeta.status, currency: 'UAH', payment_form: importMeta.payment_form, invoice_number: importMeta.invoice_number, invoice_date: importMeta.invoice_date, items: importData };
            await saveOrderToDB(importedOrder, fileId);
            showToast('Рахунок успішно імпортовано!', 'success');
            setIsImportModalOpen(false);
            setImportFile(null);
            loadData();
        } catch (error) { showToast(error.message, 'error'); }
        finally { setIsSubmitting(false); }
    };

    // ===== ПЛАТЕЖІ =====
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
            const payload = { purchase_order_id: selectedOrder.id, payment_type: paymentForm.payment_type, payment_purpose: paymentForm.purpose, amount: parseFloat(paymentForm.amount), currency: paymentForm.currency, exchange_rate: parseFloat(paymentForm.exchange_rate), notes: paymentForm.notes || null, created_by: employee?.id, is_active: true };
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
        if (!window.confirm(payment.is_active ? "Анулювати платіж?" : "Відновити платіж?")) return;
        try {
            const { error } = await supabase.from('purchase_payments').update({ is_active: !payment.is_active, updated_by: employee?.id }).eq('id', payment.id);
            if (error) throw error;
            showToast('Статус платежу змінено', 'success');
            loadData();
            const { data } = await supabase.from('purchase_orders').select(`*, payments:purchase_payments(*)`).eq('id', selectedOrder.id).single();
            if (data) setSelectedOrder(prev => ({ ...prev, payments: data.payments }));
        } catch (error) { showToast(error.message, 'error'); }
    };

    // ===== ПРИЙМАННЯ =====
    const openReceiving = (order) => {
        const itemsToReceive = order.items.map(item => {
            const rcvd = getItemReceivedQty(item);
            return { po_item_id: item.id, nomenclature_id: item.nomenclature_id, ordered: item.quantity, received_already: rcvd, receive_now: rcvd < item.quantity ? (item.quantity - rcvd) : 0 };
        }).filter(item => item.receive_now > 0);
        setSelectedOrder(order);
        setReceivingForm({ warehouse_id: '', items: itemsToReceive });
        setIsReceivingModalOpen(true);
    };

    const handleSaveReceiving = async (e) => {
        e.preventDefault();
        if (!receivingForm.warehouse_id) return showToast('Оберіть склад', 'error');
        setIsSubmitting(true);
        try {
            const movements = receivingForm.items.filter(i => parseInt(i.receive_now, 10) > 0).map(item => ({
                nomenclature_id: item.nomenclature_id, warehouse_id: receivingForm.warehouse_id,
                quantity: parseInt(item.receive_now, 10), operation_type: 'purchase',
                purchase_order_item_id: item.po_item_id, created_by: employee?.id
            }));
            if (movements.length > 0) { const { error } = await supabase.from('stock_movements').insert(movements); if (error) throw error; }
            let allFullyReceived = true;
            let someReceived = false;
            receivingForm.items.forEach(ri => {
                const orderItem = selectedOrder.items.find(i => i.id === ri.po_item_id);
                const receivingNow = parseInt(ri.receive_now, 10) || 0;
                const alreadyReceived = ri.received_already;
                const totalAfter = alreadyReceived + receivingNow;
                if (totalAfter > 0) someReceived = true;
                if (totalAfter < orderItem.quantity) allFullyReceived = false;
            });
            const newStatus = allFullyReceived ? 'received' : (someReceived ? 'partially_received' : selectedOrder.status);
            if (newStatus !== selectedOrder.status) { const { error: stErr } = await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', selectedOrder.id); if (stErr) throw stErr; }
            showToast('Товари успішно прийняті на склад', 'success');
            setIsReceivingModalOpen(false);
            loadData();
        } catch (error) { showToast(error.message, 'error'); }
        finally { setIsSubmitting(false); }
    };

    // ===== ФІЛЬТРАЦІЯ =====
    const filteredOrders = orders.filter(o => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = o.order_number.toLowerCase().includes(term) || (o.supplier?.name && o.supplier.name.toLowerCase().includes(term)) || (o.invoice_number && o.invoice_number.toLowerCase().includes(term));
        const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const filteredSuppliers = suppliers.filter(item => {
        const term = suppliersSearch.toLowerCase();
        const matchesSearch = item.name.toLowerCase().includes(term) || (item.contact_person && item.contact_person.toLowerCase().includes(term)) || (item.phone && item.phone.toLowerCase().includes(term));
        const matchesStatus = suppliersStatusFilter === 'all' ? true : suppliersStatusFilter === 'active' ? item.is_active : !item.is_active;
        return matchesSearch && matchesStatus;
    });

    const supplierOptions = suppliers.filter(s => s.is_active).map(s => ({ id: s.id, label: s.name }));
    const instOptions = installations.map(i => ({ id: i.custom_id, label: `[#${i.custom_id}] ${i.name}` }));

    if (authLoading) return <div className="p-8 text-center text-slate-500">Завантаження...</div>;

    return (
        <Layout>
            <div className="p-4 sm:p-8 max-w-[1600px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">
                <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

                {/* HEADER */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6 flex-none">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Закупівлі та Постачання</h1>
                        <p className="text-slate-500 text-sm mt-1">Оформлення замовлень, платежі, приймання та контрагенти</p>
                    </div>
                    {activeTab === 'orders' && (
                        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                            <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleExcelUpload} />
                            <button onClick={() => fileInputRef.current?.click()} disabled={isSubmitting} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold shadow-sm hover:bg-emerald-100 transition-colors disabled:opacity-50">
                                <FaFileExcel /> <span>Імпорт рахунку (Excel)</span>
                            </button>
                            <button onClick={openNewOrder} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                                <FaPlus /> <span>Створити вручну</span>
                            </button>
                        </div>
                    )}
                    {activeTab === 'suppliers' && (
                        <button onClick={() => openAddSupplier()} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all w-full sm:w-auto">
                            <FaPlus /> <span>Додати постачальника</span>
                        </button>
                    )}
                </div>

                {/* TABS */}
                <div className="flex gap-1 mb-6 bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
                    <button
                        onClick={() => setActiveTab('orders')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'orders' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                    >
                        <FaFileInvoiceDollar /> Замовлення
                    </button>
                    <button
                        onClick={() => setActiveTab('suppliers')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'suppliers' ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                    >
                        <FaAddressBook /> Постачальники
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-bold">{suppliers.filter(s => s.is_active).length}</span>
                    </button>
                </div>

                {/* ============ ВКЛАДКА: ЗАМОВЛЕННЯ ============ */}
                {activeTab === 'orders' && (
                    <>
                        {/* FILTERS */}
                        <div className="flex flex-col md:flex-row gap-3 mb-6">
                            <div className="relative flex-1">
                                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="Пошук за номером замовлення, рахунку або постачальником..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm shadow-sm transition-shadow" />
                            </div>
                            <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm overflow-x-auto hide-scrollbar">
                                <button onClick={() => setStatusFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${statusFilter === 'all' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>Всі</button>
                                {Object.entries(ORDER_STATUSES).map(([key, val]) => (
                                    <button key={key} onClick={() => setStatusFilter(key)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap ${statusFilter === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>{val.l}</button>
                                ))}
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
                            {loading ? (
                                <div className="p-8 flex justify-center"><div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div></div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="text-center py-24 flex flex-col items-center">
                                    <FaBoxOpen className="text-6xl text-slate-200 mb-4" />
                                    <h3 className="text-lg font-bold text-slate-600">Немає закупівель</h3>
                                    <p className="text-slate-400 text-sm mt-1">Змініть фільтри або створіть нове замовлення.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[1100px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
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

                                                return (
                                                    <React.Fragment key={order.id}>
                                                        <tr className={`hover:bg-slate-50/50 transition-colors ${isExpanded ? 'bg-indigo-50/30' : ''}`}>
                                                            <td className="px-4 py-4 text-center cursor-pointer" onClick={() => toggleRowExpansion(order.id)}>
                                                                <div className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors mx-auto">
                                                                    <FaChevronRight className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90 text-indigo-500' : ''}`} />
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-4 cursor-pointer" onClick={() => toggleRowExpansion(order.id)}>
                                                                <div className="font-bold text-slate-800 text-base">{order.order_number}</div>
                                                                {order.invoice_number ? (
                                                                    <div className="text-xs text-indigo-600 mt-1 font-bold">Рахунок: {order.invoice_number}</div>
                                                                ) : (
                                                                    <div className="text-xs text-slate-400 mt-1 flex items-center gap-1"><FaRegCalendarAlt />{new Date(order.order_date).toLocaleDateString('uk-UA')}</div>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="font-bold text-slate-700 flex items-center gap-2"><FaBuilding className="text-slate-300" />{order.supplier?.name}</div>
                                                                {order.installation && <div className="text-[11px] font-bold text-slate-500 mt-1.5 flex items-center gap-1"><FaHardHat /> Об'єкт: #{order.installation_custom_id}</div>}
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-col items-start gap-1.5">
                                                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold border uppercase tracking-wide ${statusObj.c}`}>{statusObj.l}</span>
                                                                    <span className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded ${order.payment_form === 'cash' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                                        {order.payment_form === 'cash' ? <FaMoneyBillAlt /> : <FaUniversity />} {order.payment_form === 'cash' ? 'Готівка' : 'Безготівка'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex justify-between text-sm mb-1.5">
                                                                    <span className="font-bold text-slate-800">{totalCost.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} {order.currency}</span>
                                                                    <span className={`font-bold ${progress >= 100 ? 'text-emerald-600' : 'text-slate-500'}`}>{totalPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })}</span>
                                                                </div>
                                                                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                                                                    <div className={`h-full ${progress >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }}></div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <div className="flex items-center justify-end gap-1">
                                                                    {order.invoice_file_id && (
                                                                        <a href={`https://drive.google.com/open?id=${order.invoice_file_id}`} target="_blank" rel="noreferrer" className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors mr-2" title="Відкрити рахунок">
                                                                            <FaFileExcel size={16} />
                                                                        </a>
                                                                    )}
                                                                    {canReceive && (
                                                                        <button onClick={() => openReceiving(order)} className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-transparent hover:border-emerald-200 mr-2" title="Прийняти товар на склад">
                                                                            <FaTruckLoading size={16} />
                                                                        </button>
                                                                    )}
                                                                    {canPay && (
                                                                        <button onClick={() => openPayments(order)} className="p-2.5 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100" title="Взаєморозрахунки">
                                                                            <FaFileInvoiceDollar size={16} />
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => openEditOrder(order)} className="p-2.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-100" title="Редагувати">
                                                                        <FaEdit size={16} />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>

                                                        {/* Розгорнутий рядок */}
                                                        <AnimatePresence>
                                                            {isExpanded && (
                                                                <tr>
                                                                    <td colSpan="6" className="p-0 border-b border-slate-200 bg-slate-50/80 shadow-inner">
                                                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                                                            <div className="p-6 pl-14">
                                                                                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">Детальна специфікація замовлення</h4>
                                                                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                                                    {order.items.map(item => {
                                                                                        const rcvd = getItemReceivedQty(item);
                                                                                        const rcvdProgress = item.quantity > 0 ? Math.min(100, Math.round((rcvd / item.quantity) * 100)) : 0;
                                                                                        const nom = nomenclatures.find(n => n.id === item.nomenclature_id);
                                                                                        return (
                                                                                            <div key={item.id} className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-sm hover:border-indigo-200 transition-colors">
                                                                                                <div className="font-bold text-slate-800 text-sm leading-tight mb-1">{nom?.fullName || 'Невідомий товар'}</div>
                                                                                                {item.supplier_item_name && <div className="text-[10px] text-slate-400 italic mb-2">Оригінал: {item.supplier_item_name}</div>}
                                                                                                <div className="flex justify-between items-center mb-3">
                                                                                                    <span className="text-[10px] text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">SKU: {nom?.sku || '---'}</span>
                                                                                                    <span className="font-bold text-indigo-700 text-xs">{parseFloat(item.unit_price).toLocaleString('uk-UA')} {order.currency} <span className="text-slate-400 font-normal">/ {nom?.unit?.name || 'од'}</span></span>
                                                                                                </div>
                                                                                                <div className="flex justify-between items-center text-[11px] mb-1.5 font-medium">
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
                    </>
                )}

                {/* ============ ВКЛАДКА: ПОСТАЧАЛЬНИКИ ============ */}
                {activeTab === 'suppliers' && (
                    <>
                        {/* FILTERS */}
                        <div className="flex flex-col md:flex-row gap-3 mb-6">
                            <div className="relative flex-1">
                                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder="Пошук за назвою чи контактами..." value={suppliersSearch} onChange={(e) => setSuppliersSearch(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm shadow-sm transition-shadow" />
                            </div>
                            <div className="flex bg-white rounded-xl border border-slate-200 p-1 shadow-sm overflow-x-auto hide-scrollbar">
                                {[{ v: 'active', l: 'Активні' }, { v: 'inactive', l: 'Приховані' }, { v: 'all', l: 'Всі' }].map(t => (
                                    <button key={t.v} onClick={() => setSuppliersStatusFilter(t.v)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${suppliersStatusFilter === t.v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>{t.l}</button>
                                ))}
                            </div>
                        </div>

                        {/* TABLE */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
                            {loading ? (
                                <div className="p-8 flex justify-center"><div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div></div>
                            ) : filteredSuppliers.length === 0 ? (
                                <div className="text-center py-24 flex-1 flex flex-col items-center justify-center">
                                    <FaBuilding className="text-6xl text-slate-200 mb-4" />
                                    <h3 className="text-lg font-bold text-slate-600">Нічого не знайдено</h3>
                                    <p className="text-slate-400 text-sm mt-1">Змініть критерії або додайте нового постачальника.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[900px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                                                <th className="px-6 py-4 font-bold">Компанія / ФОП</th>
                                                <th className="px-6 py-4 font-bold">Контактна особа</th>
                                                <th className="px-6 py-4 font-bold">Телефон</th>
                                                <th className="px-6 py-4 font-bold w-1/3">Примітки</th>
                                                <th className="px-6 py-4 font-bold text-right">Дії</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredSuppliers.map(item => (
                                                <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors group ${!item.is_active ? 'bg-slate-50/50' : ''}`}>
                                                    <td className="px-6 py-4">
                                                        <div className={`font-bold text-base flex items-center gap-2 ${!item.is_active ? 'text-slate-500' : 'text-slate-800'}`}>
                                                            <FaBuilding className={item.is_active ? "text-indigo-400" : "text-slate-300"} />
                                                            {item.name}
                                                        </div>
                                                        {!item.is_active && <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded uppercase font-bold mt-1.5 inline-block">Неактивний</span>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {item.contact_person ? (
                                                            <div className="flex items-center gap-2 text-sm text-slate-700">
                                                                <FaUserTie className="text-slate-400" />
                                                                <span className="font-medium">{item.contact_person}</span>
                                                            </div>
                                                        ) : <span className="text-slate-400 text-sm">—</span>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {item.phone ? (
                                                            <div className="flex items-center gap-2 text-sm text-slate-600">
                                                                <FaPhoneAlt className="text-slate-400 text-xs" />
                                                                <a href={`tel:${item.phone}`} className="hover:text-indigo-600 transition-colors">{item.phone}</a>
                                                            </div>
                                                        ) : <span className="text-slate-400 text-sm">—</span>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-xs text-slate-500 line-clamp-2 max-w-[350px]" title={item.notes}>{item.notes || '—'}</div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={() => openEditSupplier(item)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Редагувати">
                                                                <FaEdit size={16} />
                                                            </button>
                                                            <button onClick={() => handleToggleSupplierStatus(item)} className={`p-2 rounded-lg transition-colors ${item.is_active ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'}`} title={item.is_active ? "Деактивувати" : "Активувати"}>
                                                                <FaPowerOff size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* ============================================================ */}
                {/* МОДАЛКА 1: СТВОРЕННЯ / РЕДАГУВАННЯ ЗАМОВЛЕННЯ */}
                {/* ============================================================ */}
                <AnimatePresence>
                    {isOrderModalOpen && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-shrink-0 bg-slate-50 rounded-t-2xl">
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FaFileInvoiceDollar className="text-indigo-500" />{editingOrderId ? 'Редагування замовлення' : 'Створення закупівлі вручну'}</h2>
                                    <button onClick={() => setIsOrderModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors border border-slate-200"><FaTimes /></button>
                                </div>
                                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                                    <form id="order-form" onSubmit={handleSaveOrder} className="space-y-6">

                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-6">
                                            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
                                                {[{ v: 'cashless', l: 'Безготівкова', icon: FaUniversity }, { v: 'cash', l: 'Готівкова', icon: FaMoneyBillAlt }].map(t => (
                                                    <button key={t.v} type="button" onClick={() => setOrderForm({ ...orderForm, payment_form: t.v })} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${orderForm.payment_form === t.v ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'}`}>
                                                        <t.icon size={16} /> <span>{t.l}</span>
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-2">Статус:</label>
                                                <select value={orderForm.status} onChange={e => setOrderForm({ ...orderForm, status: e.target.value })} className="px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-indigo-700 outline-none">
                                                    {Object.entries(ORDER_STATUSES).map(([key, val]) => (<option key={key} value={key}>{val.l}</option>))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* ПОСТАЧАЛЬНИК + ОБ'ЄКТ */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 z-20 relative">
                                            <div className="z-30">
                                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Постачальник <span className="text-red-500">*</span></label>
                                                <SearchableSelectWithAdd
                                                    options={supplierOptions} value={orderForm.supplier_id} onChange={v => setOrderForm({ ...orderForm, supplier_id: v })}
                                                    onAddNew={handleQuickAddSupplier} placeholder="Оберіть або почніть вводити..." icon={FaBuilding}
                                                />
                                            </div>
                                            <div className="z-20">
                                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Об'єкт (Опціонально)</label>
                                                <SearchableSelectWithAdd
                                                    options={instOptions} value={orderForm.installation_custom_id} onChange={v => setOrderForm({ ...orderForm, installation_custom_id: v })}
                                                    onAddNew={() => { }} placeholder="На загальний склад" icon={FaHardHat} noAdd={true}
                                                />
                                            </div>
                                        </div>

                                        {/* ФІНАНСИ */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 z-10 relative bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Валюта</label>
                                                <select value={orderForm.currency} onChange={e => setOrderForm({ ...orderForm, currency: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm outline-none font-bold text-slate-800">
                                                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Номер рахунку/чеку</label>
                                                <input type="text" value={orderForm.invoice_number} onChange={e => setOrderForm({ ...orderForm, invoice_number: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm outline-none font-bold text-slate-800" placeholder="Напр. СФ-123" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Дата рахунку/чеку</label>
                                                <input type="date" value={orderForm.invoice_date} onChange={e => setOrderForm({ ...orderForm, invoice_date: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm outline-none font-bold text-slate-800" />
                                            </div>
                                        </div>

                                        {/* СПЕЦИФІКАЦІЯ */}
                                        <div className="pt-4 border-t border-slate-200">
                                            <div className="flex justify-between items-end mb-4">
                                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Специфікація товарів</h3>
                                            </div>
                                            <div className="space-y-3 pb-32">
                                                {orderForm.items.map((item, index) => {
                                                    const selectedNom = nomenclatures.find(n => n.id === item.nomenclature_id);
                                                    const hasPackage = selectedNom?.package_name && selectedNom?.package_multiplier;
                                                    const qtyLabel = item.is_package && hasPackage ? selectedNom.package_name : (selectedNom?.unit?.name || 'шт');
                                                    const priceLabel = item.is_package && hasPackage ? `за ${selectedNom.package_name}` : 'Ціна';
                                                    return (
                                                        <div key={index} className="flex flex-col gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                                            <div className="flex flex-wrap lg:flex-nowrap items-center gap-3">
                                                                <div className="flex-1 min-w-[250px] z-50">
                                                                    <NomenclatureSelect options={nomenclatures} value={item.nomenclature_id} onChange={val => { const newItems = [...orderForm.items]; newItems[index].nomenclature_id = val; newItems[index].is_package = false; setOrderForm({ ...orderForm, items: newItems }); }} />
                                                                </div>
                                                                <div className="flex items-center gap-2 bg-white px-3 h-[38px] border border-slate-300 rounded-lg">
                                                                    <input type="number" min="1" step="1" value={item.quantity} onChange={e => { const newItems = [...orderForm.items]; newItems[index].quantity = parseInt(e.target.value, 10) || ''; setOrderForm({ ...orderForm, items: newItems }); }} placeholder="К-сть" className="w-16 h-full text-sm text-center font-bold outline-none text-indigo-700" />
                                                                    <span className="text-xs font-bold text-slate-400 w-12 truncate" title={qtyLabel}>{qtyLabel}</span>
                                                                </div>
                                                                <div className="w-32 relative h-[38px]">
                                                                    <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => { const newItems = [...orderForm.items]; newItems[index].unit_price = e.target.value; setOrderForm({ ...orderForm, items: newItems }); }} placeholder={priceLabel} className="w-full h-full pl-3 pr-8 bg-white border border-slate-300 rounded-lg text-sm text-right outline-none focus:border-indigo-500 font-medium" />
                                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">{orderForm.currency}</span>
                                                                </div>
                                                                <div className="w-32 h-[38px] flex items-center justify-end font-bold text-slate-800 text-sm px-3 bg-slate-200/50 rounded-lg border border-slate-200">
                                                                    {((item.quantity || 0) * (item.unit_price || 0)).toLocaleString('uk-UA', { minimumFractionDigits: 2 })}
                                                                </div>
                                                                <button type="button" onClick={() => { const newItems = orderForm.items.filter((_, i) => i !== index); setOrderForm({ ...orderForm, items: newItems }); }} className="h-[38px] px-3 text-slate-400 hover:text-red-500 hover:bg-red-50 bg-white rounded-lg border border-slate-200 transition-colors"><FaTrash size={14} /></button>
                                                            </div>
                                                            {hasPackage && (
                                                                <div className="pl-2 flex items-center gap-2">
                                                                    <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 w-fit hover:bg-indigo-100 transition-colors">
                                                                        <input type="checkbox" checked={item.is_package || false} onChange={(e) => { const newItems = [...orderForm.items]; newItems[index].is_package = e.target.checked; setOrderForm({ ...orderForm, items: newItems }); }} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                                                        <FaBox /> Купувати в упаковках (1 {selectedNom.package_name} = {selectedNom.package_multiplier} {selectedNom.unit?.name})
                                                                    </label>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                <button type="button" onClick={() => setOrderForm({ ...orderForm, items: [...orderForm.items, { nomenclature_id: '', quantity: '', unit_price: '', is_package: false }] })} className="mt-4 px-4 py-2.5 bg-white hover:bg-indigo-50 text-indigo-600 font-bold rounded-xl text-sm transition-colors border border-dashed border-indigo-200 hover:border-indigo-400 flex items-center justify-center w-full gap-2 shadow-sm">
                                                    <FaPlus /> Додати позицію
                                                </button>
                                            </div>
                                        </div>
                                    </form>
                                </div>
                                <div className="p-5 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-slate-50 rounded-b-2xl">
                                    <button type="button" onClick={() => setIsOrderModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                    <button form="order-form" type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                                        {isSubmitting ? 'Збереження...' : <><FaCheck /> {editingOrderId ? 'Зберегти зміни' : 'Сформувати замовлення'}</>}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ============================================================ */}
                {/* МОДАЛКА 2: ІМПОРТ РАХУНКУ З EXCEL */}
                {/* ============================================================ */}
                <AnimatePresence>
                    {isImportModalOpen && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50 rounded-t-2xl flex-shrink-0">
                                    <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2"><FaFileExcel className="text-emerald-500" /> Імпорт рахунку з Excel</h2>
                                    <button onClick={() => { setIsImportModalOpen(false); setImportFile(null); }} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes /></button>
                                </div>
                                <div className="bg-white p-4 flex flex-col items-stretch gap-4 border-b border-slate-100 flex-shrink-0">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
                                            {[{ v: 'cashless', l: 'Безготівкова', icon: FaUniversity }, { v: 'cash', l: 'Готівкова', icon: FaMoneyBillAlt }].map(t => (
                                                <button key={t.v} type="button" onClick={() => setImportMeta({ ...importMeta, payment_form: t.v })} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${importMeta.payment_form === t.v ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'}`}>
                                                    <t.icon size={16} /> <span>{t.l}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200 w-fit">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-2">Статус:</label>
                                            <select value={importMeta.status} onChange={e => setImportMeta({ ...importMeta, status: e.target.value })} className="px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-indigo-700 outline-none">
                                                {Object.entries(ORDER_STATUSES).map(([key, val]) => (<option key={key} value={key}>{val.l}</option>))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="z-30 relative">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Постачальник <span className="text-red-500">*</span></label>
                                            <SearchableSelectWithAdd options={supplierOptions} value={importSupplierId} onChange={setImportSupplierId} onAddNew={handleQuickAddSupplier} placeholder="Оберіть..." icon={FaBuilding} />
                                        </div>
                                        <div className="z-20 relative">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Об'єкт (Опціонально)</label>
                                            <SearchableSelectWithAdd options={instOptions} value={importMeta.installation_custom_id} onChange={v => setImportMeta({ ...importMeta, installation_custom_id: v })} onAddNew={() => { }} placeholder="Загальний склад" icon={FaHardHat} noAdd={true} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Номер рахунку</label>
                                            <input type="text" value={importMeta.invoice_number} onChange={e => setImportMeta({ ...importMeta, invoice_number: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none h-[42px]" placeholder="№..." />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Дата рахунку</label>
                                            <input type="date" value={importMeta.invoice_date} onChange={e => setImportMeta({ ...importMeta, invoice_date: e.target.value })} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none h-[42px]" />
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50 p-2">
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm pb-32">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-100 border-b border-slate-200">
                                                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                                                    <th className="px-4 py-3 font-bold border-r border-slate-200 w-1/3">Назва (З рахунку)</th>
                                                    <th className="px-3 py-3 font-bold border-r border-slate-200 text-center w-28">К-сть</th>
                                                    <th className="px-3 py-3 font-bold border-r border-slate-200 text-center w-32">Ціна</th>
                                                    <th className="px-4 py-3 font-bold bg-emerald-50/50"><FaBoxOpen className="inline mr-1 text-emerald-500" /> Зв'язати з нашим товаром</th>
                                                    <th className="px-3 py-3 font-bold text-center w-12"><FaTrash /></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {importData.map((item, index) => {
                                                    const hasError = !item.nomenclature_id;
                                                    const selectedNom = nomenclatures.find(n => n.id === item.nomenclature_id);
                                                    const hasPackage = selectedNom?.package_name && selectedNom?.package_multiplier;
                                                    return (
                                                        <tr key={item.id} className={`transition-colors ${hasError ? 'bg-red-50/20 hover:bg-red-50/40' : 'bg-white hover:bg-slate-50'}`}>
                                                            <td className="px-4 py-3 align-middle border-r border-slate-100">
                                                                <div className="text-sm font-bold text-slate-700">{item.supplier_item_name}</div>
                                                            </td>
                                                            <td className="px-2 py-3 align-middle border-r border-slate-100 text-center">
                                                                <div className="flex flex-col items-center justify-center h-full gap-1.5">
                                                                    <input type="number" min="1" step="1" value={item.quantity} onChange={e => { const newArr = [...importData]; newArr[index].quantity = parseInt(e.target.value, 10) || ''; setImportData(newArr); }} className="w-16 h-[38px] text-center text-sm font-black text-indigo-700 bg-slate-100 px-2 rounded-lg outline-none border border-slate-200" />
                                                                    {hasPackage && (
                                                                        <label className="flex items-center justify-center gap-1 cursor-pointer text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 hover:bg-indigo-100 w-full">
                                                                            <input type="checkbox" checked={item.is_package || false} onChange={(e) => { const newArr = [...importData]; newArr[index].is_package = e.target.checked; setImportData(newArr); }} className="rounded text-indigo-600 w-3 h-3 m-0 p-0" />
                                                                            Це {selectedNom.package_name}
                                                                        </label>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-3 align-middle border-r border-slate-100 text-center">
                                                                <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => { const newArr = [...importData]; newArr[index].unit_price = e.target.value; setImportData(newArr); }} className="w-24 h-[38px] text-right text-sm font-black text-emerald-700 bg-slate-100 px-2 rounded-lg outline-none border border-slate-200" />
                                                            </td>
                                                            <td className="px-4 py-3 align-middle">
                                                                <NomenclatureSelect options={nomenclatures} value={item.nomenclature_id} placeholder="Оберіть наш товар..." onChange={val => { const newArr = [...importData]; newArr[index].nomenclature_id = val; newArr[index].is_package = false; setImportData(newArr); }} />
                                                                {hasError && <div className="text-[10px] text-red-500 font-bold mt-1">Обов'язково зв'яжіть товар!</div>}
                                                            </td>
                                                            <td className="px-2 py-3 align-middle text-center">
                                                                <button onClick={() => setImportData(importData.filter((_, i) => i !== index))} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><FaTrash size={16} /></button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="p-5 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 bg-slate-50 rounded-b-2xl">
                                    <button onClick={() => { setIsImportModalOpen(false); setImportFile(null); }} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 text-sm">Скасувати</button>
                                    <button onClick={handleConfirmImport} disabled={isSubmitting} className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                                        {isSubmitting ? 'Обробка...' : <><FaCheck /> Імпортувати</>}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ============================================================ */}
                {/* МОДАЛКА 3: ВЗАЄМОРОЗРАХУНКИ */}
                {/* ============================================================ */}
                <AnimatePresence>
                    {isPaymentModalOpen && selectedOrder && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FaFileInvoiceDollar className="text-indigo-500" /> Взаєморозрахунки</h2>
                                        <p className="text-sm text-slate-500 mt-1">Замовлення {selectedOrder.order_number}</p>
                                    </div>
                                    <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 bg-white hover:bg-slate-200 text-slate-400 rounded-full transition-colors"><FaTimes /></button>
                                </div>
                                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                                    <div className="grid grid-cols-3 gap-4 mb-6">
                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Загальна сума</div>
                                            <div className="text-xl font-black text-slate-800">{getOrderTotals(selectedOrder).totalCost.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} <span className="text-sm text-slate-500">{selectedOrder.currency}</span></div>
                                        </div>
                                        <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Оплачено</div>
                                            <div className="text-xl font-black text-emerald-700">{getOrderTotals(selectedOrder).totalPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} <span className="text-sm text-emerald-500">{selectedOrder.currency}</span></div>
                                        </div>
                                        <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                                            <div className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Борг</div>
                                            <div className="text-xl font-black text-red-700">{getOrderTotals(selectedOrder).debt.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} <span className="text-sm text-red-500">{selectedOrder.currency}</span></div>
                                        </div>
                                    </div>
                                    {getOrderTotals(selectedOrder).debt > 0 && (
                                        <form id="payment-form" onSubmit={handleSavePayment} className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm mb-6">
                                            <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Внести платіж</h3>
                                            <div className="grid grid-cols-2 gap-4 mb-4">
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Тип оплати</label>
                                                    <select value={paymentForm.payment_type} onChange={e => setPaymentForm({ ...paymentForm, payment_type: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none">
                                                        {Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Призначення</label>
                                                    <select value={paymentForm.purpose} onChange={e => setPaymentForm({ ...paymentForm, purpose: e.target.value })} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none">
                                                        {Object.entries(PAYMENT_PURPOSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Сума</label>
                                                    <input type="number" step="0.01" max={getOrderTotals(selectedOrder).debt} required value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="w-full px-4 py-2.5 bg-white border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 text-lg font-black text-indigo-700 outline-none" placeholder="0.00" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Валюта платежу</label>
                                                    <div className="flex gap-2">
                                                        <select value={paymentForm.currency} onChange={e => setPaymentForm({ ...paymentForm, currency: e.target.value })} className="w-1/2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none">
                                                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                                        </select>
                                                        {paymentForm.currency !== selectedOrder.currency && (
                                                            <input type="number" step="0.0001" value={paymentForm.exchange_rate} onChange={e => setPaymentForm({ ...paymentForm, exchange_rate: e.target.value })} className="w-1/2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm outline-none" title="Курс валюти" />
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
                                                {selectedOrder.payments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map(p => (
                                                    <div key={p.id} className={`flex justify-between items-center p-3 rounded-xl border ${p.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`font-bold ${p.is_active ? 'text-slate-800' : 'text-slate-500 line-through'}`}>{parseFloat(p.amount).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} {p.currency}</span>
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

                {/* ============================================================ */}
                {/* МОДАЛКА 4: ПРИЙМАННЯ НА СКЛАД */}
                {/* ============================================================ */}
                <AnimatePresence>
                    {isReceivingModalOpen && selectedOrder && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]" onClick={e => e.stopPropagation()}>
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50 flex-shrink-0">
                                    <div>
                                        <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2"><FaTruckLoading className="text-emerald-600" /> Приймання товару</h2>
                                        <p className="text-sm text-emerald-700 mt-1 font-medium">Замовлення {selectedOrder.order_number} від {selectedOrder.supplier?.name}</p>
                                    </div>
                                    <button onClick={() => setIsReceivingModalOpen(false)} className="p-2 bg-white hover:bg-slate-200 text-slate-400 rounded-full transition-colors"><FaTimes /></button>
                                </div>
                                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                                    <form id="receive-form" onSubmit={handleSaveReceiving}>
                                        <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                                            <label className="block text-sm font-bold text-slate-700 mb-2">Оберіть склад для отримання <span className="text-red-500">*</span></label>
                                            <select required value={receivingForm.warehouse_id} onChange={e => setReceivingForm({ ...receivingForm, warehouse_id: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800">
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
                                                                        <input type="number" min="0" step="1" max={item.ordered - item.received_already} required value={item.receive_now} onChange={e => { const newItems = [...receivingForm.items]; newItems[index].receive_now = e.target.value; setReceivingForm({ ...receivingForm, items: newItems }); }} className="w-24 text-center px-3 py-1.5 bg-white border-2 border-emerald-200 focus:border-emerald-500 rounded-lg text-lg font-black text-emerald-700 outline-none" />
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

                {/* ============================================================ */}
                {/* МОДАЛКА 5: ПОСТАЧАЛЬНИК (додавання / редагування) */}
                {/* ============================================================ */}
                <AnimatePresence>
                    {isSupplierModalOpen && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                        <FaBuilding className="text-indigo-500" />
                                        {editingSupplierId ? 'Редагувати постачальника' : 'Новий постачальник'}
                                    </h2>
                                    <button onClick={() => setIsSupplierModalOpen(false)} className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors"><FaTimes size={16} /></button>
                                </div>

                                <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
                                    <form id="supplier-form" onSubmit={handleSaveSupplier} className="space-y-5 pb-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Назва компанії / ФОП <span className="text-red-500">*</span></label>
                                            <input type="text" autoFocus value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} placeholder="Напр. ТОВ Вольтмаркет" className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm font-bold text-slate-800" />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Контактна особа</label>
                                                <div className="relative">
                                                    <FaUserTie className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input type="text" value={supplierForm.contact_person} onChange={e => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} placeholder="ПІБ менеджера" className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-slate-700 mb-1.5">Телефон</label>
                                                <div className="relative">
                                                    <FaPhoneAlt className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input type="tel" value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} placeholder="+380..." className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm" />
                                                </div>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Примітки / Реквізити</label>
                                            <textarea rows="3" value={supplierForm.notes} onChange={e => setSupplierForm({ ...supplierForm, notes: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow text-sm resize-none" placeholder="Адреса, реквізити, додаткова інформація..." />
                                        </div>
                                        {editingSupplierId && (
                                            <div className="flex items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                                <input type="checkbox" id="sup_is_active" checked={supplierForm.is_active} onChange={e => setSupplierForm({ ...supplierForm, is_active: e.target.checked })} className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer" />
                                                <label htmlFor="sup_is_active" className="text-sm font-medium text-slate-700 select-none cursor-pointer">Активний постачальник (відображається у виборі)</label>
                                            </div>
                                        )}
                                    </form>
                                </div>

                                <div className="pt-5 border-t border-slate-100 flex justify-end gap-3 flex-shrink-0 mt-4">
                                    <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors text-sm">Скасувати</button>
                                    <button form="supplier-form" type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2 text-sm">
                                        {isSubmitting ? 'Збереження...' : <><FaCheck /> Зберегти</>}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        </Layout>
    );
}