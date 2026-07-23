import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaTimes, FaFileInvoiceDollar, FaBuilding, FaHardHat, 
    FaFileExcel, FaUniversity, FaMoneyBillAlt, FaBoxOpen, FaTrash, FaBox, FaChevronDown 
} from 'react-icons/fa';
import { supabase } from '../supabaseClient'; // Перевірте шлях до вашого клієнта
import { NomenclatureModal } from './NomenclatureModal';
import { findBestNomenclatureMatch, normalizeName } from '../utils/nameMatching';

const WORKFLOW_UPLOADER_URL = "https://quiet-water-a1ad.kairosost38500.workers.dev";
// Оновлено URL на ваш Cloudflare Worker (якщо парсер знаходиться на головному маршруті, замініть на "https://quiet-water-a1ad.kairosost38500.workers.dev/")
const EXCEL_API_URL = "https://quiet-water-a1ad.kairosost38500.workers.dev/parse-excel";

const ORDER_STATUSES = {
    draft: { l: 'Чернетка' },
    sent: { l: 'Замовлено' },
    partially_received: { l: 'Отримано частково' },
    received: { l: 'Отримано повністю' },
    cancelled: { l: 'Скасовано' }
};

const CURRENCIES = ['UAH', 'USD', 'EUR'];

// --- ДОПОМІЖНІ КОМПОНЕНТИ ---
// (алгоритм співставлення назв винесено в utils/nameMatching.js — спільний з оцифруванням специфікацій)

async function uploadInvoiceFile(file, objectId, invoiceNumber, invoiceDate) {
    const fd = new FormData();
    fd.append("files", file);
    fd.append("doc_type", "Рахунок постачальника");
    const folderName = objectId ? String(objectId) : `Склад_Рахунок_${invoiceNumber || 'БН'}_від_${invoiceDate || new Date().toISOString().split('T')[0]}`;
    fd.append("object_number", folderName);
    
    const res = await fetch(`${WORKFLOW_UPLOADER_URL}/workflow/upload`, { method: "POST", body: fd });
    let data;
    try { data = await res.json(); } catch { data = null; }
    
    if (!res.ok || !data || data.status !== "success") {
        throw new Error(data?.message || data?.detail || `Помилка завантаження файлу (${res.status})`);
    }
    return data.files?.[0]?.fileId || null;
}

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
            <div className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl flex justify-between items-center cursor-pointer text-sm transition-colors hover:border-indigo-400 h-[42px]" onClick={() => setIsOpen(!isOpen)}>
                <div className="flex items-center gap-2 truncate pr-2">
                    {Icon && <Icon className={selectedOption ? "text-indigo-500" : "text-slate-400"} />}
                    <span className={selectedOption ? 'text-slate-800 font-bold' : 'text-slate-400'}>{selectedOption ? selectedOption.label : placeholder}</span>
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
                            <div className="p-2 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                                <button type="button" onClick={() => { onAddNew(search.trim()); setIsOpen(false); setSearch(''); }} className="w-full py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2">
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

const NomenclatureSelect = ({ options, value, onChange, placeholder = "Оберіть товар...", onCreateNew }) => {
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
            <div className={`w-full px-3 h-[38px] bg-white border rounded-lg flex justify-between items-center cursor-pointer text-sm transition-colors ${!selectedOption && placeholder.includes('Увага') ? 'border-red-400 bg-red-50' : 'border-slate-300 hover:border-indigo-400'}`} onClick={() => setIsOpen(!isOpen)}>
                <div className="truncate pr-2">
                    {selectedOption ? <span className="font-bold text-slate-800">{selectedOption.fullName}</span> : <span className={placeholder.includes('Увага') ? 'text-red-500 font-bold' : 'text-slate-400'}>{placeholder}</span>}
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
                        {onCreateNew && (
                            <div className="p-1.5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { onCreateNew(search.trim()); setIsOpen(false); setSearch(''); }}
                                    className="w-full py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <FaPlus size={10} /> {search.trim() ? `Створити «${search.trim()}»` : 'Створити нову позицію'}
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function PurchaseOrderModal({ isOpen, onClose, onSuccess, initialMode = 'manual', editOrder = null, importFile = null, dictionaries, employee, showToast, onAddSupplier }) {
    const { suppliers, installations, nomenclatures: baseNoms, categories = [], systemMemory } = dictionaries;
    const [mode, setMode] = useState(initialMode);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Позиції, створені "на льоту" через NomenclatureModal (ще відсутні у батьківському словнику)
    const [extraNoms, setExtraNoms] = useState([]);
    const nomenclatures = [...baseNoms.filter(b => !extraNoms.some(e => e.id === b.id)), ...extraNoms];

    // Швидке створення номенклатури: target вказує, який рядок заповнити після збереження
    const [quickAdd, setQuickAdd] = useState({ open: false, name: '', target: null }); // target: { mode: 'manual'|'import', index }

    // Після створення позиції: додаємо її в список і підставляємо в рядок, з якого викликали
    const handleQuickAddSuccess = (savedItem) => {
        if (!savedItem) return;
        let path = [];
        let currentId = savedItem.category_id;
        while (currentId) {
            const cat = categories.find(c => c.id === currentId);
            if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
        }
        const processed = { ...savedItem, fullName: `${path.join(' ')} ${savedItem.name}`.trim() };
        setExtraNoms(prev => [...prev.filter(n => n.id !== processed.id), processed]);

        const target = quickAdd.target;
        if (target?.mode === 'manual') {
            setOrderForm(prev => {
                const newItems = [...prev.items];
                if (newItems[target.index]) { newItems[target.index] = { ...newItems[target.index], nomenclature_id: processed.id, is_package: false }; }
                return { ...prev, items: newItems };
            });
        } else if (target?.mode === 'import') {
            setImportData(prev => {
                const newArr = [...prev];
                if (newArr[target.index]) { newArr[target.index] = { ...newArr[target.index], nomenclature_id: processed.id, is_package: false, auto: null }; }
                return newArr;
            });
        }
        setQuickAdd({ open: false, name: '', target: null });
    };

    // Manual Form State
    const [orderForm, setOrderForm] = useState({
        supplier_id: '', installation_custom_id: '', status: 'draft',
        currency: 'UAH', expected_delivery_date: '', notes: '', items: [],
        payment_form: 'cash', invoice_number: '', invoice_date: ''
    });

    // Import Form State
    const [importData, setImportData] = useState([]);
    const [importSupplierId, setImportSupplierId] = useState('');
    const [importMeta, setImportMeta] = useState({
        payment_form: 'cashless', invoice_number: '', invoice_date: '',
        installation_custom_id: '', status: 'sent'
    });

    // Initialize modal state
    useEffect(() => {
        if (!isOpen) return;
        setMode(initialMode);
        
        if (initialMode === 'manual') {
            if (editOrder) {
                setOrderForm({
                    supplier_id: editOrder.supplier_id, installation_custom_id: editOrder.installation_custom_id || '',
                    status: editOrder.status, currency: editOrder.currency, expected_delivery_date: editOrder.expected_delivery_date || '', notes: editOrder.notes || '',
                    payment_form: editOrder.payment_form || 'cash', invoice_number: editOrder.invoice_number || '', invoice_date: editOrder.invoice_date || '',
                    items: editOrder.items.map(i => ({
                        nomenclature_id: i.nomenclature_id, quantity: i.quantity,
                        unit_price: i.unit_price, supplier_item_name: i.supplier_item_name || '', is_package: false
                    }))
                });
            } else {
                setOrderForm({
                    supplier_id: '', installation_custom_id: '', status: 'draft',
                    currency: 'UAH', expected_delivery_date: '', notes: '', items: [],
                    payment_form: 'cash', invoice_number: '', invoice_date: ''
                });
            }
        }

        if (initialMode === 'import' && importFile) {
            processExcelFile(importFile);
        }
    }, [isOpen, initialMode, editOrder, importFile]);

    // Оновлена функція парсингу з підтримкою обробки помилок Worker'а
    const processExcelFile = async (file) => {
        setIsSubmitting(true);
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch(EXCEL_API_URL, { 
                method: 'POST', 
                body: formData 
            });
            
            if (!response.ok) {
                let errorMsg = 'Помилка сервісу парсингу';
                try {
                    const errData = await response.json();
                    // Підтримуємо формат FastAPI (detail) та стандартні формати Worker (error, message)
                    errorMsg = errData.detail || errData.error || errData.message || errorMsg;
                } catch (e) {
                    // Якщо Worker повернув не JSON (наприклад, 502 Bad Gateway)
                    errorMsg = `Помилка сервера: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMsg);
            }
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const parsedItems = data.items.map(item => {
                    // Нормалізоване співставлення: пам'ять -> точна назва -> SKU -> схожість
                    const match = findBestNomenclatureMatch(item.name, nomenclatures, systemMemory);
                    return {
                        id: Math.random().toString(),
                        supplier_item_name: item.name,
                        quantity: parseInt(item.quantity, 10) || 1,
                        unit_price: parseFloat(item.price) || 0,
                        nomenclature_id: match.id || '',
                        // auto: 'memory' (словник) | 'exact' (точна назва/SKU) | 'fuzzy' (схожість)
                        auto: match.id ? match.source : null,
                        is_package: false
                    };
                });
                setImportData(parsedItems);
                setImportMeta({ payment_form: 'cashless', invoice_number: '', invoice_date: '', installation_custom_id: '', status: 'sent' });
                showToast(`Знайдено позицій: ${parsedItems.length}. Перевірте відповідність.`, 'success');
            } else {
                showToast('Не вдалося знайти таблицю товарів у файлі.', 'warning');
                onClose();
            }
        } catch (error) {
            showToast(`Помилка: ${error.message}. Переконайтесь, що API парсера працює.`, 'error');
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    const saveOrderToDB = async (orderData, fileId = null) => {
        const headerPayload = {
            supplier_id: orderData.supplier_id, installation_custom_id: orderData.installation_custom_id || null,
            status: orderData.status, currency: orderData.currency, expected_delivery_date: orderData.expected_delivery_date || null,
            notes: orderData.notes || null, payment_form: orderData.payment_form,
            invoice_number: orderData.invoice_number || null, invoice_date: orderData.invoice_date || null,
            updated_by: employee?.id
        };

        if (fileId) headerPayload.invoice_file_id = fileId;

        let newPoId;
        if (editOrder && mode === 'manual') {
            await supabase.from('purchase_orders').update(headerPayload).eq('id', editOrder.id);
            await supabase.from('purchase_order_items').delete().eq('purchase_order_id', editOrder.id);
            newPoId = editOrder.id;
        } else {
            headerPayload.created_by = employee?.id;
            const { data: newPo } = await supabase.from('purchase_orders').insert([headerPayload]).select().single();
            newPoId = newPo.id;
        }

        const itemsPayload = orderData.items.map(i => {
            const nom = nomenclatures.find(n => n.id === i.nomenclature_id);
            let finalQty = parseInt(i.quantity, 10) || 0;
            let finalPrice = parseFloat(i.unit_price) || 0;
            if (i.is_package && nom && nom.package_multiplier) {
                finalQty = finalQty * parseInt(nom.package_multiplier, 10);
                finalPrice = finalPrice / parseInt(nom.package_multiplier, 10);
            }
            return {
                purchase_order_id: newPoId, nomenclature_id: i.nomenclature_id,
                quantity: finalQty, unit_price: finalPrice,
                supplier_item_name: i.supplier_item_name || null, created_by: employee?.id
            };
        });
        await supabase.from('purchase_order_items').insert(itemsPayload);

        // Оновлюємо словник співставлень: нові назви додаються, а виправлені прив'язки — перезаписуються
        const changedMappings = [];
        const seenNames = new Set();
        for (const item of orderData.items) {
            if (!item.supplier_item_name || !item.nomenclature_id) continue;
            const cleanName = normalizeName(item.supplier_item_name);
            if (!cleanName || seenNames.has(cleanName)) continue;
            seenNames.add(cleanName);
            const existing = systemMemory.find(m => normalizeName(m.supplier_item_name) === cleanName);
            if (!existing || existing.nomenclature_id !== item.nomenclature_id) {
                changedMappings.push({ supplier_item_name: item.supplier_item_name.trim(), nomenclature_id: item.nomenclature_id });
            }
        }
        if (changedMappings.length > 0) {
            await supabase.from('supplier_mappings').upsert(changedMappings, { onConflict: 'supplier_item_name' });
            showToast(`Система запам'ятала ${changedMappings.length} назв(и) від постачальників! 🧠`, 'success');
        }
    };

    const handleSaveManual = async (e) => {
        e.preventDefault();
        if (!orderForm.supplier_id) return showToast('Оберіть постачальника', 'error');
        if (orderForm.items.length === 0) return showToast('Додайте хоча б один товар', 'error');
        if (orderForm.items.some(i => !i.nomenclature_id || parseInt(i.quantity, 10) <= 0 || parseFloat(i.unit_price) < 0)) return showToast('Перевірте коректність товарів', 'error');

        setIsSubmitting(true);
        try {
            await saveOrderToDB(orderForm);
            showToast('Закупівлю збережено', 'success');
            onSuccess();
            onClose();
        } catch (error) { showToast(error.message, 'error'); }
        finally { setIsSubmitting(false); }
    };

    const handleConfirmImport = async () => {
        if (!importSupplierId) return showToast('Оберіть постачальника', 'error');
        const unmapped = importData.filter(i => !i.nomenclature_id);
        if (unmapped.length > 0) return showToast(`Залишилось ${unmapped.length} нерозпізнаних позицій. Вкажіть їх вручну або видаліть рядок.`, 'error');

        setIsSubmitting(true);
        try {
            showToast('Завантаження файлу на диск...', 'success');
            const fileId = await uploadInvoiceFile(importFile, importMeta.installation_custom_id, importMeta.invoice_number, importMeta.invoice_date);

            showToast('Збереження замовлення...', 'success');
            const importedOrder = {
                supplier_id: importSupplierId, installation_custom_id: importMeta.installation_custom_id || null,
                status: importMeta.status, currency: 'UAH', payment_form: importMeta.payment_form,
                invoice_number: importMeta.invoice_number, invoice_date: importMeta.invoice_date,
                items: importData
            };
            await saveOrderToDB(importedOrder, fileId);
            showToast('Рахунок успішно імпортовано та збережено!', 'success');
            onSuccess();
            onClose();
        } catch (error) { showToast(error.message, 'error'); }
        finally { setIsSubmitting(false); }
    };

    const supplierOptions = suppliers.map(s => ({ id: s.id, label: s.name }));
    const instOptions = installations.map(i => ({ id: i.custom_id, label: `[#${i.custom_id}] ${i.name}` }));

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                {mode === 'manual' ? (
                    // --- MANUAL MODE ---
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-shrink-0 bg-slate-50 rounded-t-2xl">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2"><FaFileInvoiceDollar className="text-indigo-500"/> {editOrder ? 'Редагування замовлення' : 'Створення закупівлі вручну'}</h2>
                            <button onClick={onClose} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors border border-slate-200"><FaTimes/></button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                            <form id="order-form" onSubmit={handleSaveManual} className="space-y-6">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-200 pb-6">
                                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
                                        {[ {v:'cashless', l:'Безготівкова', icon: FaUniversity}, {v:'cash', l:'Готівкова', icon: FaMoneyBillAlt} ].map(t => (
                                            <button key={t.v} type="button" onClick={() => setOrderForm({...orderForm, payment_form: t.v})} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${orderForm.payment_form === t.v ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'}`}>
                                                <t.icon size={16} /> <span>{t.l}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-2">Статус:</label>
                                        <select value={orderForm.status} onChange={e => setOrderForm({...orderForm, status: e.target.value})} className="px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-indigo-700 outline-none">
                                            {Object.entries(ORDER_STATUSES).map(([key, val]) => <option key={key} value={key}>{val.l}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 z-20 relative">
                                    <div className="z-30">
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Постачальник <span className="text-red-500">*</span></label>
                                        <SearchableSelectWithAdd options={supplierOptions} value={orderForm.supplier_id} onChange={v => setOrderForm({...orderForm, supplier_id: v})} onAddNew={(name) => { onAddSupplier(name).then(id => id && setOrderForm({...orderForm, supplier_id: id})); }} placeholder="Оберіть або почніть вводити..." icon={FaBuilding} />
                                    </div>
                                    <div className="z-20">
                                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Об'єкт (Опціонально)</label>
                                        <SearchableSelectWithAdd options={instOptions} value={orderForm.installation_custom_id} onChange={v => setOrderForm({...orderForm, installation_custom_id: v})} onAddNew={() => {}} placeholder="На загальний склад" icon={FaHardHat} noAdd={true} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 z-10 relative bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Валюта</label>
                                        <select value={orderForm.currency} onChange={e => setOrderForm({...orderForm, currency: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm outline-none font-bold text-slate-800">
                                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Номер рахунку/чеку</label>
                                        <input type="text" value={orderForm.invoice_number} onChange={e => setOrderForm({...orderForm, invoice_number: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm outline-none font-bold text-slate-800" placeholder="Напр. СФ-123" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Дата рахунку/чеку</label>
                                        <input type="date" value={orderForm.invoice_date} onChange={e => setOrderForm({...orderForm, invoice_date: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 text-sm outline-none font-bold text-slate-800" />
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-slate-200">
                                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4">Специфікація товарів</h3>
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
                                                            <NomenclatureSelect options={nomenclatures} value={item.nomenclature_id} onChange={val => { const newItems = [...orderForm.items]; newItems[index].nomenclature_id = val; newItems[index].is_package = false; setOrderForm({...orderForm, items: newItems}); }} onCreateNew={(name) => setQuickAdd({ open: true, name, target: { mode: 'manual', index } })} />
                                                        </div>
                                                        <div className="flex items-center gap-2 bg-white px-3 h-[38px] border border-slate-300 rounded-lg">
                                                            <input type="number" min="1" step="1" value={item.quantity} onChange={e => { const newItems = [...orderForm.items]; newItems[index].quantity = parseInt(e.target.value, 10) || ''; setOrderForm({...orderForm, items: newItems}); }} placeholder="К-сть" className="w-16 h-full text-sm text-center font-bold outline-none text-indigo-700"/>
                                                            <span className="text-xs font-bold text-slate-400 w-12 truncate" title={qtyLabel}>{qtyLabel}</span>
                                                        </div>
                                                        <div className="w-32 relative h-[38px]">
                                                            <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => { const newItems = [...orderForm.items]; newItems[index].unit_price = e.target.value; setOrderForm({...orderForm, items: newItems}); }} placeholder={priceLabel} className="w-full h-full pl-3 pr-8 bg-white border border-slate-300 rounded-lg text-sm text-right outline-none focus:border-indigo-500 font-medium" />
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold">{orderForm.currency}</span>
                                                        </div>
                                                        <div className="w-32 h-[38px] flex items-center justify-end font-bold text-slate-800 text-sm px-3 bg-slate-200/50 rounded-lg border border-slate-200">
                                                            {((item.quantity || 0) * (item.unit_price || 0)).toLocaleString('uk-UA', {minimumFractionDigits: 2})}
                                                        </div>
                                                        <button type="button" onClick={() => { const newItems = orderForm.items.filter((_, i) => i !== index); setOrderForm({...orderForm, items: newItems}); }} className="h-[38px] px-3 text-slate-400 hover:text-red-500 hover:bg-red-50 bg-white rounded-lg border border-slate-200 transition-colors"><FaTrash size={14} /></button>
                                                    </div>
                                                    {hasPackage && (
                                                        <div className="pl-2 flex items-center gap-2">
                                                            <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 w-fit hover:bg-indigo-100 transition-colors">
                                                                <input type="checkbox" checked={item.is_package || false} onChange={(e) => { const newItems = [...orderForm.items]; newItems[index].is_package = e.target.checked; setOrderForm({...orderForm, items: newItems}); }} className="rounded text-indigo-600 focus:ring-indigo-500" />
                                                                <FaBox /> Купувати в упаковках (1 {selectedNom.package_name} = {selectedNom.package_multiplier} {selectedNom.unit?.name})
                                                            </label>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                        <button type="button" onClick={() => setOrderForm({...orderForm, items: [...orderForm.items, { nomenclature_id: '', quantity: '', unit_price: '', is_package: false }]})} className="mt-4 px-4 py-2.5 bg-white hover:bg-indigo-50 text-indigo-600 font-bold rounded-xl text-sm transition-colors border border-dashed border-indigo-200 hover:border-indigo-400 flex items-center justify-center w-full gap-2 shadow-sm">
                                            <FaPlus /> Додати позицію
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex justify-between items-center bg-slate-50 rounded-b-2xl flex-shrink-0">
                            <div className="text-slate-500 text-sm font-bold uppercase tracking-wide">
                                Всього: <span className="text-2xl font-black text-indigo-900 ml-2">{orderForm.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0).toLocaleString('uk-UA', {minimumFractionDigits: 2})} {orderForm.currency}</span>
                            </div>
                            <div className="flex gap-3">
                                <button onClick={onClose} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                <button form="order-form" type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                                    {isSubmitting ? 'Збереження...' : 'Зберегти'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                ) : (
                    // --- IMPORT MODE ---
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-emerald-50 rounded-t-2xl flex-shrink-0">
                            <h2 className="text-xl font-bold text-emerald-900 flex items-center gap-2"><FaFileExcel className="text-emerald-500"/> Імпорт рахунку з Excel</h2>
                            <button onClick={onClose} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes/></button>
                        </div>
                        {isSubmitting && importData.length === 0 ? (
                            <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                                <div className="animate-pulse flex gap-2 mb-4"><div className="w-3 h-3 bg-emerald-400 rounded-full"></div><div className="w-3 h-3 bg-emerald-400 rounded-full"></div><div className="w-3 h-3 bg-emerald-400 rounded-full"></div></div>
                                Обробка файлу та розпізнавання товарів...
                            </div>
                        ) : (
                            <>
                                <div className="bg-white p-4 flex flex-col items-stretch gap-4 border-b border-slate-100 flex-shrink-0">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
                                        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 w-fit">
                                            {[ {v:'cashless', l:'Безготівкова', icon: FaUniversity}, {v:'cash', l:'Готівкова', icon: FaMoneyBillAlt} ].map(t => (
                                                <button key={t.v} type="button" onClick={() => setImportMeta({...importMeta, payment_form: t.v})} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${importMeta.payment_form === t.v ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50 border border-transparent'}`}>
                                                    <t.icon size={16} /> <span>{t.l}</span>
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-lg border border-slate-200 w-fit">
                                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-2">Імпортувати зі статусом:</label>
                                            <select value={importMeta.status} onChange={e => setImportMeta({...importMeta, status: e.target.value})} className="px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 text-sm font-bold text-indigo-700 outline-none">
                                                {Object.entries(ORDER_STATUSES).map(([key, val]) => <option key={key} value={key}>{val.l}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="z-30 relative">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Постачальник <span className="text-red-500">*</span></label>
                                            <SearchableSelectWithAdd options={supplierOptions} value={importSupplierId} onChange={setImportSupplierId} onAddNew={(name) => { onAddSupplier(name).then(id => id && setImportSupplierId(id)); }} placeholder="Оберіть..." icon={FaBuilding} />
                                        </div>
                                        <div className="z-20 relative">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Об'єкт (Опціонально)</label>
                                            <SearchableSelectWithAdd options={instOptions} value={importMeta.installation_custom_id} onChange={v => setImportMeta({...importMeta, installation_custom_id: v})} onAddNew={() => {}} placeholder="Загальний склад" icon={FaHardHat} noAdd={true} />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Номер рахунку</label>
                                            <input type="text" value={importMeta.invoice_number} onChange={e => setImportMeta({...importMeta, invoice_number: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none h-[42px]" placeholder="№..." />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Дата рахунку</label>
                                            <input type="date" value={importMeta.invoice_date} onChange={e => setImportMeta({...importMeta, invoice_date: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-400 text-sm font-bold text-slate-800 outline-none h-[42px]" />
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50 p-2">
                                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm pb-32">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-100 border-b border-slate-200 z-10">
                                                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                                                    <th className="px-4 py-3 font-bold border-r border-slate-200 w-1/3">Назва постачальника (З рахунку)</th>
                                                    <th className="px-3 py-3 font-bold border-r border-slate-200 text-center w-28">К-сть / Фасування</th>
                                                    <th className="px-3 py-3 font-bold border-r border-slate-200 text-center w-32">Ціна (за 1)</th>
                                                    <th className="px-4 py-3 font-bold bg-emerald-50/50"><FaBoxOpen className="inline mr-1 text-emerald-500"/> Зв'язати з нашим товаром</th>
                                                    <th className="px-3 py-3 font-bold text-center w-12"><FaTrash/></th>
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
                                                                {item.auto === 'memory' && item.nomenclature_id && <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">🧠 З пам'яті</span>}
                                                                {item.auto === 'exact' && item.nomenclature_id && <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">= Точна назва</span>}
                                                                {item.auto === 'fuzzy' && item.nomenclature_id && <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">≈ Схоже — перевірте</span>}
                                                            </td>
                                                            <td className="px-2 py-3 align-middle border-r border-slate-100 text-center">
                                                                <div className="flex flex-col items-center justify-center h-full gap-1.5">
                                                                    <input type="number" min="1" step="1" value={item.quantity} onChange={e => { const newArr = [...importData]; newArr[index].quantity = parseInt(e.target.value, 10) || ''; setImportData(newArr); }} className="w-16 h-[38px] text-center text-sm font-black text-indigo-700 bg-slate-100 px-2 rounded-lg outline-none border border-slate-200" />
                                                                    {hasPackage && (
                                                                        <label className="flex items-center justify-center gap-1 cursor-pointer text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 hover:bg-indigo-100 w-full">
                                                                            <input type="checkbox" checked={item.is_package || false} onChange={(e) => { const newArr = [...importData]; newArr[index].is_package = e.target.checked; setImportData(newArr); }} className="rounded text-indigo-600 w-3 h-3 m-0 p-0" /> Це {selectedNom.package_name}
                                                                        </label>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-2 py-3 align-middle border-r border-slate-100 text-center">
                                                                <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => { const newArr = [...importData]; newArr[index].unit_price = e.target.value; setImportData(newArr); }} className="w-24 h-[38px] text-right text-sm font-black text-emerald-700 bg-slate-100 px-2 rounded-lg outline-none border border-slate-200" />
                                                            </td>
                                                            <td className="px-4 py-3 align-middle">
                                                                <NomenclatureSelect options={nomenclatures} value={item.nomenclature_id} placeholder="Оберіть наш товар..." onChange={val => { const newArr = [...importData]; newArr[index].nomenclature_id = val; newArr[index].is_package = false; newArr[index].auto = null; setImportData(newArr); }} onCreateNew={(name) => setQuickAdd({ open: true, name: name || item.supplier_item_name, target: { mode: 'import', index } })} />
                                                                {hasError && <div className="text-[10px] text-red-500 font-bold mt-1">Обов'язково зв'яжіть товар!</div>}
                                                            </td>
                                                            <td className="px-2 py-3 align-middle text-center">
                                                                <button onClick={() => setImportData(importData.filter((_, i) => i !== index))} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><FaTrash size={16}/></button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div className="p-4 border-t border-slate-100 flex justify-between items-center flex-shrink-0 bg-slate-50 rounded-b-2xl">
                                    <div className="text-slate-500 text-sm font-bold uppercase tracking-wide">
                                        Всього: <span className="text-xl font-black text-emerald-700 ml-2">{importData.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unit_price || 0)), 0).toLocaleString('uk-UA', {minimumFractionDigits: 2})} UAH</span>
                                    </div>
                                    <div className="flex gap-3">
                                        <button onClick={onClose} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 text-sm">Скасувати</button>
                                        <button onClick={handleConfirmImport} disabled={isSubmitting || importData.length === 0} className="px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-md flex items-center gap-2 text-sm disabled:opacity-50">
                                            {isSubmitting ? 'Завантаження...' : 'Затвердити та Зберегти'}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </motion.div>

            {/* Швидке створення позиції номенклатури, якої ще немає в базі */}
            <NomenclatureModal
                isOpen={quickAdd.open}
                onClose={() => setQuickAdd({ open: false, name: '', target: null })}
                onSuccess={handleQuickAddSuccess}
                showToast={showToast}
                initialName={quickAdd.name}
            />
        </AnimatePresence>
    );
}