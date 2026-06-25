import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaPlus, FaWrench, FaHardHat, FaWarehouse, 
    FaExchangeAlt, FaArrowUp, FaArrowDown, FaHistory, FaCheck, 
    FaExclamationTriangle, FaTimes, FaInfoCircle, FaHashtag, 
    FaHeartBroken, FaQuestionCircle, FaChevronDown
} from 'react-icons/fa';
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

// Кастомний селект з пошуком
const SearchableSelect = ({ options, value, onChange, placeholder, icon: Icon, disabled = false }) => {
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

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div 
                className={`w-full px-4 py-3 border rounded-xl flex justify-between items-center text-sm transition-colors ${disabled ? 'bg-slate-50 border-slate-200 cursor-not-allowed text-slate-400' : 'bg-white border-slate-300 cursor-pointer hover:border-indigo-400'}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
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
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }} className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-60">
                        <div className="p-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                            <input autoFocus type="text" placeholder="Пошук..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                            {filtered.length > 0 ? filtered.map(o => (
                                <div key={o.id} className={`px-3 py-2.5 cursor-pointer text-sm rounded-lg transition-colors mb-0.5 ${o.id === value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}>
                                    {o.label}
                                </div>
                            )) : <div className="px-4 py-4 text-sm text-slate-400 text-center">Нічого не знайдено</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// Селект з пошуком ТА швидким додаванням
const SearchableSelectWithAdd = ({ options, value, onChange, onAddNew, placeholder, icon: Icon }) => {
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
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl flex justify-between items-center cursor-pointer text-sm transition-colors hover:border-indigo-400"
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
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 5 }} transition={{ duration: 0.15 }} className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-72">
                        <div className="p-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                            <input autoFocus type="text" placeholder="Пошук об'єкта..." value={search} onChange={e => setSearch(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                            {filtered.length > 0 ? filtered.map(o => (
                                <div key={o.id} className={`px-3 py-2.5 cursor-pointer text-sm rounded-lg transition-colors mb-0.5 ${o.id === value ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`} onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}>
                                    {o.label}
                                </div>
                            )) : <div className="px-4 py-4 text-sm text-slate-400 text-center border-dashed border-2 border-slate-100 rounded-lg m-1">Нічого не знайдено</div>}
                        </div>
                        {search.trim() !== '' && !exactMatch && (
                            <div className="p-2 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                                <button type="button" onClick={() => { onAddNew(search.trim()); setIsOpen(false); setSearch(''); }} className="w-full py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2">
                                    <FaPlus /> Додати як віртуальний об'єкт
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// --- КОНФІГИ СТАТУСІВ ---
const TOOL_STATUSES = {
    'in_stock': { label: 'На складі', color: 'text-emerald-700 bg-emerald-100 border-emerald-200', icon: FaWarehouse },
    'issued': { label: 'Видано', color: 'text-blue-700 bg-blue-100 border-blue-200', icon: FaHardHat },
    'under_repair': { label: 'В ремонті', color: 'text-amber-700 bg-amber-100 border-amber-200', icon: FaWrench },
    'written_off': { label: 'Списано', color: 'text-rose-700 bg-rose-100 border-rose-200', icon: FaHeartBroken },
    'lost': { label: 'Втрачено', color: 'text-slate-600 bg-slate-200 border-slate-300', icon: FaQuestionCircle }
};

const MOVEMENT_TYPES = {
    'issue': { label: 'Видача', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: FaArrowUp },
    'return': { label: 'Повернення', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: FaArrowDown },
    'transfer': { label: 'Переміщення', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', icon: FaExchangeAlt },
    'writeoff': { label: 'Списання/Втрата', color: 'text-rose-700 bg-rose-50 border-rose-200', icon: FaHeartBroken }
};

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function ToolsPage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();
    
    const [activeTab, setActiveTab] = useState('inventory');
    
    // Дані
    const [tools, setTools] = useState([]);
    const [movements, setMovements] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);
    const [categories, setCategories] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [employeesDict, setEmployeesDict] = useState({});
    
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isActionModalOpen, setIsActionModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [addForm, setAddForm] = useState({ nomenclature_id: '', inventory_number: '', serial_number: '', warehouse_id: '', notes: '' });
    const [selectedTool, setSelectedTool] = useState(null);
    const [actionForm, setActionForm] = useState({ type: '', installation_id: '', warehouse_id: '', notes: '', expected_date: '' });

    // Відстежуємо сигнал створення з батьківського компонента (ВИПРАВЛЕНО!)
    const prevActionTrigger = useRef(externalActionTrigger);
    
    useEffect(() => {
        if (externalActionTrigger > prevActionTrigger.current) {
            setAddForm({ nomenclature_id: '', inventory_number: '', serial_number: '', warehouse_id: '', notes: '' });
            setIsAddModalOpen(true);
        }
        prevActionTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    // --- ЗАВАНТАЖЕННЯ ДАНИХ ---
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [toolRes, movRes, nomRes, catRes, whRes, instRes, empRes] = await Promise.all([
                supabase.from('tools').select('*').order('created_at', { ascending: false }),
                supabase.from('tool_movements').select('*').order('movement_date', { ascending: false }).limit(500),
                supabase.from('nomenclature').select('id, name, sku, category_id').eq('type', 'tool').eq('is_active', true).order('name'),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
                supabase.from('installations').select('custom_id, name, status'),
                supabase.from('employees').select('id, name')
            ]);

            setCategories(catRes.data || []);
            setWarehouses(whRes.data || []);
            setInstallations(instRes.data || []);
            
            const cats = catRes.data || [];
            
            const processedNom = (nomRes.data || []).map(item => {
                let path = [];
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } 
                    else break;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim() };
            });
            setNomenclatures(processedNom);

            const processedTools = (toolRes.data || []).map(t => {
                const nom = processedNom.find(n => n.id === t.nomenclature_id);
                return { ...t, nomenclature: nom };
            });
            setTools(processedTools);
            setMovements(movRes.data || []);

            const empDict = {};
            (empRes.data || []).forEach(e => empDict[e.id] = e.name);
            setEmployeesDict(empDict);

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

    // --- ОБРОБНИКИ СТВОРЕННЯ ІНСТРУМЕНТУ ---
    const handleGenerateInvNumber = () => {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        setAddForm(prev => ({ ...prev, inventory_number: `INV-${randomNum}` }));
    };

    const handleSaveTool = async (e) => {
        e.preventDefault();
        if (!addForm.nomenclature_id || !addForm.inventory_number || !addForm.warehouse_id) {
            return showToast('Заповніть всі обов\'язкові поля', 'error');
        }
        setIsSubmitting(true);
        try {
            const payload = {
                nomenclature_id: addForm.nomenclature_id,
                inventory_number: addForm.inventory_number,
                serial_number: addForm.serial_number || null,
                status: 'in_stock',
                current_warehouse_id: addForm.warehouse_id,
                notes: addForm.notes || null,
                created_by: employee?.id
            };
            const { error } = await supabase.from('tools').insert([payload]);
            if (error) throw error;
            
            showToast('Інструмент успішно додано в інвентар', 'success');
            setIsAddModalOpen(false);
            loadData();
        } catch (error) {
            if (error.code === '23505') showToast('Інструмент з таким інвентарним або серійним номером вже існує', 'error');
            else showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleQuickAddInstallation = async (name) => {
        try {
            const payload = {
                name: name,
                status: 'in_progress', 
                notes: 'Віртуальний об\'єкт для нестандартних переміщень інструменту'
            };
            const { data, error } = await supabase.from('installations').insert([payload]).select().single();
            if (error) throw error;
            
            setInstallations(prev => [...prev, data]);
            setActionForm(prev => ({...prev, installation_id: data.custom_id}));
            showToast(`Віртуальний об'єкт "${name}" створено`, 'success');
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    const openActionModal = (tool, type) => {
        setSelectedTool(tool);
        setActionForm({ 
            type,
            installation_id: tool.current_installation_custom_id || '', 
            warehouse_id: tool.current_warehouse_id || '', 
            notes: tool.notes || '', 
            expected_date: '' 
        });
        setIsActionModalOpen(true);
    };

    const handleExecuteAction = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        
        try {
            const tId = selectedTool.id;
            const empId = employee?.id;
            let toolUpdate = {};
            let moveInsert = null;

            if (actionForm.type === 'issue') {
                if (!actionForm.installation_id) throw new Error("Оберіть об'єкт для видачі");
                toolUpdate = { status: 'issued', current_warehouse_id: null, current_installation_custom_id: actionForm.installation_id, notes: actionForm.notes || null };
                moveInsert = { tool_id: tId, movement_type: 'issue', warehouse_from_id: selectedTool.current_warehouse_id, installation_custom_id: actionForm.installation_id, expected_return_date: actionForm.expected_date || null, notes: actionForm.notes || null, performed_by: empId };
            } 
            else if (actionForm.type === 'return') {
                if (!actionForm.warehouse_id) throw new Error("Оберіть склад для повернення");
                toolUpdate = { status: 'in_stock', current_warehouse_id: actionForm.warehouse_id, current_installation_custom_id: null, notes: actionForm.notes || null };
                moveInsert = { tool_id: tId, movement_type: 'return', warehouse_to_id: actionForm.warehouse_id, installation_custom_id: selectedTool.current_installation_custom_id, notes: actionForm.notes || null, performed_by: empId };
            }
            else if (actionForm.type === 'transfer') {
                if (!actionForm.warehouse_id || actionForm.warehouse_id === selectedTool.current_warehouse_id) throw new Error("Оберіть інший склад");
                toolUpdate = { current_warehouse_id: actionForm.warehouse_id, notes: actionForm.notes || null };
                moveInsert = { tool_id: tId, movement_type: 'transfer', warehouse_from_id: selectedTool.current_warehouse_id, warehouse_to_id: actionForm.warehouse_id, notes: actionForm.notes || null, performed_by: empId };
            }
            else if (['repair', 'writeoff', 'lost'].includes(actionForm.type)) {
                const newStatus = actionForm.type === 'repair' ? 'under_repair' : actionForm.type === 'writeoff' ? 'written_off' : 'lost';
                toolUpdate = { status: newStatus, current_warehouse_id: null, current_installation_custom_id: null, notes: actionForm.notes || null };
                if (actionForm.type === 'writeoff' || actionForm.type === 'lost') {
                    moveInsert = { tool_id: tId, movement_type: 'writeoff', warehouse_from_id: selectedTool.current_warehouse_id, installation_custom_id: selectedTool.current_installation_custom_id, notes: actionForm.notes || null, performed_by: empId };
                }
            }

            toolUpdate.updated_by = empId;
            const { error: tErr } = await supabase.from('tools').update(toolUpdate).eq('id', tId);
            if (tErr) throw tErr;

            if (moveInsert) {
                moveInsert.created_by = empId;
                const { error: mErr } = await supabase.from('tool_movements').insert([moveInsert]);
                if (mErr) throw mErr;
            }

            showToast('Операцію успішно виконано', 'success');
            setIsActionModalOpen(false);
            loadData();

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };


    // --- ФІЛЬТРАЦІЯ ТА ОПЦІЇ ---
    const nomOptions = nomenclatures.map(n => ({ id: n.id, label: `${n.fullName} (SKU: ${n.sku || '---'})` }));
    const whOptions = warehouses.map(w => ({ id: w.id, label: w.name }));
    
    // В селект для видачі пропонуємо тільки активні об'єкти
    const instOptions = installations
        .filter(i => ['planning', 'in_progress', 'pending'].includes(i.status))
        .map(i => ({ id: i.custom_id, label: `[#${i.custom_id}] ${i.name}` }));

    // Фільтрація по externalSearch
    const filteredTools = tools.filter(t => {
        const term = externalSearch.toLowerCase();
        const matchesSearch = t.inventory_number.toLowerCase().includes(term) || (t.nomenclature?.fullName || '').toLowerCase().includes(term);
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500">Завантаження...</div>;

    return (
        <div className="flex flex-col h-full w-full">
            <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

            {/* --- ОБ'ЄДНАНА ПАНЕЛЬ ФІЛЬТРІВ ТА ВКЛАДОК --- */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-3 rounded-[16px] border border-slate-200 shadow-sm mb-4 flex-none w-full">
                
                {/* ЛІВА ЧАСТИНА: Фільтри (залежать від вкладки) */}
                <div className="flex-1 w-full xl:w-auto overflow-x-auto hide-scrollbar">
                    {activeTab === 'inventory' ? (
                        <div className="flex bg-slate-50 rounded-xl p-1.5 w-fit border border-slate-100">
                            <button onClick={() => setStatusFilter('all')} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === 'all' ? 'bg-[#0F172A] text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>Всі</button>
                            {Object.entries(TOOL_STATUSES).map(([k,v]) => (
                                <button key={k} onClick={() => setStatusFilter(k)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors ${statusFilter === k ? 'bg-indigo-100 text-indigo-800 shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'}`}>{v.label}</button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-slate-500 text-sm font-bold px-4 py-2 uppercase tracking-wide">
                            Історія переміщень інструменту
                        </div>
                    )}
                </div>

                {/* ПРАВА ЧАСТИНА: Внутрішні таби */}
                <div className="flex bg-slate-50 p-1.5 rounded-xl w-full sm:w-fit shadow-inner border border-slate-100 flex-none">
                    <button onClick={() => setActiveTab('inventory')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'inventory' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
                        <FaWrench/> Інвентар
                    </button>
                    <button onClick={() => setActiveTab('movements')} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'movements' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}>
                        <FaHistory/> Журнал рухів
                    </button>
                </div>
            </div>

            {/* --- ВМІСТ: ІНВЕНТАР --- */}
            {activeTab === 'inventory' && (
                <div className="bg-white rounded-[16px] shadow-sm border border-slate-200 flex-1 flex flex-col mb-4 overflow-hidden min-h-0">
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center"><div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div></div>
                    ) : filteredTools.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center py-12">
                            <FaWrench className="text-6xl text-slate-200 mb-4" />
                            <h3 className="text-lg font-bold text-slate-600">Інструментів не знайдено</h3>
                            <p className="text-slate-400 text-sm mt-1">Змініть пошуковий запит або додайте новий інструмент.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
                            <table className="w-full text-left border-collapse min-w-[1000px]">
                                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                    <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                        <th className="px-6 py-4">Інструмент</th>
                                        <th className="px-6 py-4">Статус</th>
                                        <th className="px-6 py-4 w-1/3">Поточна Локація</th>
                                        <th className="px-6 py-4 text-right">Дії</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredTools.map(t => {
                                        const sObj = TOOL_STATUSES[t.status];
                                        const SIcon = sObj.icon;
                                        const whName = t.current_warehouse_id ? warehouses.find(w=>w.id === t.current_warehouse_id)?.name : null;
                                        const instName = t.current_installation_custom_id ? installations.find(i=>i.custom_id === t.current_installation_custom_id)?.name : null;

                                        return (
                                            <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-900 text-sm leading-tight max-w-sm">{t.nomenclature?.fullName || 'Невідомий товар'}</div>
                                                    <div className="flex items-center gap-3 mt-2">
                                                        <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1"><FaHashtag className="text-slate-400"/> {t.inventory_number}</span>
                                                        {t.serial_number && <span className="text-[10px] text-slate-400 uppercase tracking-widest">SN: {t.serial_number}</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${sObj.color}`}>
                                                        <SIcon size={10} /> {sObj.label}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2">
                                                        {t.status === 'in_stock' && whName && (
                                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-emerald-50 w-fit px-3 py-1.5 rounded-lg border border-emerald-100"><FaWarehouse className="text-emerald-500"/> Склад: {whName}</div>
                                                        )}
                                                        {t.status === 'issued' && t.current_installation_custom_id && (
                                                            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-blue-50 w-fit px-3 py-1.5 rounded-lg border border-blue-100">
                                                                <FaHardHat className="text-blue-500 flex-shrink-0"/> 
                                                                Об'єкт: #{t.current_installation_custom_id} {instName ? `— ${instName}` : ''}
                                                            </div>
                                                        )}
                                                        {['under_repair', 'written_off', 'lost'].includes(t.status) && (
                                                            <div className="text-xs font-bold text-slate-400">Локація не визначена (Статус: {sObj.label})</div>
                                                        )}
                                                        {t.notes && (
                                                            <div className="text-[11px] text-slate-500 font-medium italic flex items-start gap-1">
                                                                <FaInfoCircle className="mt-0.5 flex-shrink-0 text-slate-400"/> 
                                                                <span className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100 line-clamp-2">{t.notes}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {t.status === 'in_stock' && (
                                                            <>
                                                                <button onClick={() => openActionModal(t, 'issue')} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"><FaArrowUp/> Видати</button>
                                                                <button onClick={() => openActionModal(t, 'transfer')} className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100" title="Перемістити на інший склад"><FaExchangeAlt/></button>
                                                            </>
                                                        )}
                                                        {t.status === 'issued' && (
                                                            <button onClick={() => openActionModal(t, 'return')} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"><FaArrowDown/> Повернути</button>
                                                        )}
                                                        {t.status === 'under_repair' && (
                                                            <button onClick={() => openActionModal(t, 'return')} className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"><FaCheck/> Ремонт завершено</button>
                                                        )}
                                                        
                                                        {(t.status === 'in_stock' || t.status === 'issued') && (
                                                            <div className="h-6 w-px bg-slate-200 mx-1"></div> 
                                                        )}
                                                        {(t.status === 'in_stock' || t.status === 'issued') && (
                                                            <>
                                                                <button onClick={() => openActionModal(t, 'repair')} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-100" title="Відправити в ремонт"><FaWrench/></button>
                                                                <button onClick={() => openActionModal(t, 'writeoff')} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-100" title="Списати / Втрачено"><FaHeartBroken/></button>
                                                            </>
                                                        )}
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
            )}

            {/* --- ВМІСТ: ІСТОРІЯ РУХІВ --- */}
            {activeTab === 'movements' && (
                <div className="bg-white rounded-[16px] shadow-sm border border-slate-200 flex-1 flex flex-col mb-4 overflow-hidden min-h-0">
                     <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                    <th className="px-6 py-4">Дата / Час</th>
                                    <th className="px-6 py-4">Інструмент</th>
                                    <th className="px-6 py-4">Операція</th>
                                    <th className="px-6 py-4">Маршрут / Локація</th>
                                    <th className="px-6 py-4 text-right">Виконав</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {movements.length === 0 ? (
                                    <tr><td colSpan="5" className="text-center py-12 text-slate-400">Історія порожня</td></tr>
                                ) : movements.map(m => {
                                    const d = new Date(m.movement_date);
                                    const tool = tools.find(t => t.id === m.tool_id);
                                    const opConf = MOVEMENT_TYPES[m.movement_type] || { label: 'Інше', color: 'bg-slate-100 text-slate-600 border-slate-200', icon: FaInfoCircle };
                                    const OpIcon = opConf.icon;
                                    
                                    // Формування назви об'єкта для історії з бази
                                    const instName = m.installation_custom_id ? installations.find(i=>i.custom_id === m.installation_custom_id)?.name : null;
                                    const instLabel = m.installation_custom_id ? `Об'єкт #${m.installation_custom_id} ${instName ? `(${instName})` : ''}` : '';

                                    let routeStr = '';
                                    if (m.movement_type === 'issue') routeStr = `${warehouses.find(w=>w.id===m.warehouse_from_id)?.name || 'Склад'} → ${instLabel}`;
                                    else if (m.movement_type === 'return') routeStr = `${instLabel} → ${warehouses.find(w=>w.id===m.warehouse_to_id)?.name || 'Склад'}`;
                                    else if (m.movement_type === 'transfer') routeStr = `${warehouses.find(w=>w.id===m.warehouse_from_id)?.name || 'Склад'} → ${warehouses.find(w=>w.id===m.warehouse_to_id)?.name || 'Склад'}`;
                                    else routeStr = 'Списання / Втрата';

                                    return (
                                        <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                                            <td className="px-6 py-4 w-32 align-top border-r border-slate-50">
                                                <div className="font-bold text-slate-800 text-[13px]">{d.toLocaleDateString('uk-UA')}</div>
                                                <div className="text-[11px] text-slate-400 font-medium mt-1">{d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</div>
                                            </td>
                                            <td className="px-6 py-4 min-w-[250px] align-top">
                                                <div className="font-bold text-slate-800 text-sm leading-tight line-clamp-2 max-w-sm">{tool?.nomenclature?.fullName || 'Невідомо'}</div>
                                                <div className="text-[11px] font-mono text-slate-500 mt-1 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded w-fit">INV: {tool?.inventory_number}</div>
                                            </td>
                                            <td className="px-6 py-4 align-top">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border shadow-sm ${opConf.color}`}>
                                                    <OpIcon size={10} /> {opConf.label}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 align-top">
                                                <div className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 inline-block rounded-lg border border-slate-100">{routeStr}</div>
                                                {m.notes && <div className="text-[10px] text-slate-500 italic mt-2 p-1.5 bg-slate-50 rounded border border-slate-100 line-clamp-2"><span className="font-bold">Деталі:</span> {m.notes}</div>}
                                            </td>
                                            <td className="px-6 py-4 text-right align-top border-l border-slate-50">
                                                <div className="inline-flex items-center justify-end gap-2 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 w-full">
                                                    <span className="font-bold text-slate-600 text-xs truncate" title={employeesDict[m.performed_by] || 'Система'}>{employeesDict[m.performed_by] || 'Система'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- МОДАЛКА: СТВОРЕННЯ ІНСТРУМЕНТУ --- */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl">
                                <div>
                                    <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2"><FaPlus/> Зареєструвати новий інструмент</h2>
                                </div>
                                <button onClick={() => setIsAddModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes/></button>
                            </div>
                            <div className="p-6">
                                <form id="add-tool-form" onSubmit={handleSaveTool} className="space-y-5">
                                    <div className="z-20 relative">
                                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Модель (з довідника номенклатури) <span className="text-red-500">*</span></label>
                                        <SearchableSelect 
                                            options={nomOptions} value={addForm.nomenclature_id} 
                                            onChange={v => setAddForm({...addForm, nomenclature_id: v})}
                                            placeholder="Оберіть інструмент..." icon={FaWrench}
                                        />
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Інвентарний номер <span className="text-red-500">*</span></label>
                                            <div className="flex gap-2">
                                                <input required type="text" value={addForm.inventory_number} onChange={e => setAddForm({...addForm, inventory_number: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 font-mono uppercase" placeholder="INV-0001" />
                                                <button type="button" onClick={handleGenerateInvNumber} className="px-3 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 font-bold text-xs transition-colors" title="Згенерувати">AUTO</button>
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Серійний номер (Опц.)</label>
                                            <input type="text" value={addForm.serial_number} onChange={e => setAddForm({...addForm, serial_number: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="SN..." />
                                        </div>
                                    </div>

                                    <div className="z-10 relative">
                                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Початковий склад <span className="text-red-500">*</span></label>
                                        <SearchableSelect 
                                            options={whOptions} value={addForm.warehouse_id} 
                                            onChange={v => setAddForm({...addForm, warehouse_id: v})}
                                            placeholder="Де зараз лежить?" icon={FaWarehouse}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Стан / Комплектація (Опц.)</label>
                                        <textarea rows="2" value={addForm.notes} onChange={e => setAddForm({...addForm, notes: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Новий в коробці, без акумулятора і т.д."></textarea>
                                    </div>
                                </form>
                            </div>
                            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                <button form="add-tool-form" type="submit" disabled={isSubmitting} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-colors text-sm">
                                    {isSubmitting ? 'Обробка...' : 'Зареєструвати'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* --- МОДАЛКА: ДІЯ (ВИДАЧА / ПОВЕРНЕННЯ / РЕМОНТ) --- */}
            <AnimatePresence>
                {isActionModalOpen && selectedTool && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className={`p-6 border-b border-slate-100 flex justify-between items-center rounded-t-2xl ${actionForm.type === 'issue' ? 'bg-blue-50' : actionForm.type === 'return' ? 'bg-emerald-50' : actionForm.type === 'repair' || actionForm.type === 'writeoff' ? 'bg-rose-50' : 'bg-indigo-50'}`}>
                                <div>
                                    <h2 className={`text-xl font-bold flex items-center gap-2 ${actionForm.type === 'issue' ? 'text-blue-800' : actionForm.type === 'return' ? 'text-emerald-800' : actionForm.type === 'repair' || actionForm.type === 'writeoff' ? 'text-rose-800' : 'text-indigo-800'}`}>
                                        {actionForm.type === 'issue' ? <><FaArrowUp/> Видача на об'єкт</> : actionForm.type === 'return' ? <><FaArrowDown/> Повернення на склад</> : actionForm.type === 'transfer' ? <><FaExchangeAlt/> Переміщення</> : <><FaWrench/> Зміна стану</>}
                                    </h2>
                                </div>
                                <button onClick={() => setIsActionModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes/></button>
                            </div>
                            <div className="p-6">
                                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mb-5">
                                    <div className="font-bold text-slate-800 text-sm leading-tight">{selectedTool.nomenclature?.fullName}</div>
                                    <div className="text-[11px] font-mono text-slate-500 mt-1.5 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded w-fit">INV: {selectedTool.inventory_number}</div>
                                </div>

                                <form id="action-tool-form" onSubmit={handleExecuteAction} className="space-y-4">
                                    
                                    {actionForm.type === 'issue' && (
                                        <>
                                            <div className="z-30 relative">
                                                <label className="block text-xs font-bold text-slate-600 mb-1.5 flex justify-between">
                                                    <span>Об'єкт / Локація <span className="text-red-500">*</span></span>
                                                </label>
                                                <SearchableSelectWithAdd 
                                                    options={instOptions} 
                                                    value={actionForm.installation_id} 
                                                    onChange={v => setActionForm({...actionForm, installation_id: v})} 
                                                    onAddNew={handleQuickAddInstallation}
                                                    placeholder="Оберіть об'єкт..." 
                                                    icon={FaHardHat} 
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-600 mb-1.5">Очікувана дата повернення (Опц.)</label>
                                                <input type="date" value={actionForm.expected_date} onChange={e => setActionForm({...actionForm, expected_date: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
                                            </div>
                                        </>
                                    )}

                                    {(actionForm.type === 'return' || actionForm.type === 'transfer') && (
                                        <div className="z-30 relative">
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Склад <span className="text-red-500">*</span></label>
                                            <SearchableSelect options={whOptions} value={actionForm.warehouse_id} onChange={v => setActionForm({...actionForm, warehouse_id: v})} placeholder="На який склад?" icon={FaWarehouse} />
                                        </div>
                                    )}

                                    {actionForm.type === 'writeoff' && (
                                        <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2 mb-2">
                                            <FaExclamationTriangle size={16}/> Увага: Інструмент буде повністю списано або позначено як втрачений.
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 mb-1.5">Деталі / Стан / Коментар</label>
                                        <textarea rows="2" value={actionForm.notes} onChange={e => setActionForm({...actionForm, notes: e.target.value})} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder={actionForm.type === 'issue' ? "Напр: В багажнику у Василя" : "Напр: Зламався патрон, повернуто без кабелю..."}></textarea>
                                    </div>
                                </form>
                            </div>
                            <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                                <button type="button" onClick={() => setIsActionModalOpen(false)} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                <button form="action-tool-form" type="submit" disabled={isSubmitting} className={`px-6 py-2.5 text-white rounded-xl font-bold shadow-md transition-colors text-sm ${actionForm.type === 'issue' ? 'bg-blue-600 hover:bg-blue-700' : actionForm.type === 'return' ? 'bg-emerald-600 hover:bg-emerald-700' : actionForm.type === 'repair' || actionForm.type === 'writeoff' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                                    {isSubmitting ? 'Обробка...' : 'Підтвердити'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
}