import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as Fa from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./Layout";

// --- Helpers --- //
const getCategoryProps = (category) => ({
    'solar_panel': { icon: Fa.FaSolarPanel, name: 'Сонячна панель', color: 'text-amber-600 bg-amber-50', border: 'border-amber-200' },
    'battery': { icon: Fa.FaBatteryHalf, name: 'Акумулятор', color: 'text-emerald-600 bg-emerald-50', border: 'border-emerald-200' },
    'inverter': { icon: Fa.FaMicrochip, name: 'Інвертор', color: 'text-blue-600 bg-blue-50', border: 'border-blue-200' },
    'logger': { icon: Fa.FaServer, name: 'Логер', color: 'text-purple-600 bg-purple-50', border: 'border-purple-200' }
}[category] || { icon: Fa.FaCog, name: 'Інше', color: 'text-slate-600 bg-slate-50', border: 'border-slate-200' });

// --- UI Components --- //

const Modal = memo(({ children, closeModal, size = "md" }) => {
    const sizeClasses = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
    return (
        <AnimatePresence>
            <motion.div
                // ОПТИМІЗАЦІЯ: Прибрано backdrop-blur для плавності на Android
                className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 sm:p-6"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal}
            >
                <motion.div
                    // ОПТИМІЗАЦІЯ: Прибрано складні ефекти, залишено чистий білий фон
                    className={`bg-white rounded-2xl w-full ${sizeClasses[size]} shadow-xl flex flex-col max-h-[90dvh] overflow-hidden`}
                    initial={{ scale: 0.95, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 10 }} 
                    transition={{ duration: 0.2 }} // Швидша анімація
                    onClick={(e) => e.stopPropagation()}
                >
                    {children}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
});

const InputField = memo(({ icon, label, error, showPassword, onTogglePassword, ...props }) => (
    <div>
        {label && <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">{label}</label>}
        <div className="relative">
            {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">{icon}</span>}
            <input
                {...props}
                // text-base для запобігання зуму на iPhone
                className={`w-full border rounded-xl ${icon ? 'pl-12' : 'pl-4'} pr-4 py-3.5 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white border-slate-200 ${props.disabled ? 'bg-slate-50 text-slate-400' : ''} ${error ? 'border-red-500 focus:ring-red-200' : ''}`}
            />
            {props.type === 'password' && onTogglePassword && (
                <button type="button" onClick={onTogglePassword} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-2">
                    {showPassword ? <Fa.FaEyeSlash size={18}/> : <Fa.FaEye size={18}/>}
                </button>
            )}
        </div>
        {error && <p className="text-red-500 text-xs mt-1 font-bold ml-1">{error}</p>}
    </div>
));

const TextAreaField = memo(({ label, error, ...props }) => (
    <div>
        {label && <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">{label}</label>}
        <textarea
            {...props}
            className={`w-full border rounded-xl p-4 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white border-slate-200 resize-none ${error ? 'border-red-500 focus:ring-red-200' : ''}`}
        />
        {error && <p className="text-red-500 text-xs mt-1 font-bold ml-1">{error}</p>}
    </div>
));

const SelectField = memo(({ icon, label, children, error, ...props }) => (
    <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">{label}</label>
        <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">{icon}</span>
            <select {...props} className="w-full appearance-none border rounded-xl pl-12 pr-10 py-3.5 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white border-slate-200">
                {children}
            </select>
            <Fa.FaChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />
        </div>
        {error && <p className="text-red-500 text-xs mt-1 ml-1">{error}</p>}
    </div>
));

const SearchableSelect = memo(({ options, value, onChange, icon, label, placeholder = "Оберіть...", disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    const selectedOption = options.find(opt => opt.value === value);
    const filteredOptions = options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()));

    const handleSelect = (val) => {
        onChange({ target: { name: 'equipment_id', value: val } });
        setIsOpen(false);
        setSearchTerm('');
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} className={disabled ? "opacity-50 pointer-events-none" : ""}>
            {label && <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">{label}</label>}
            <div className="relative">
                <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full border border-slate-200 rounded-xl pl-12 pr-10 py-3.5 text-base sm:text-sm text-left bg-white flex items-center justify-between focus:ring-2 focus:ring-indigo-500 outline-none">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">{icon}</span>
                    <span className={`truncate ${selectedOption ? 'text-slate-800' : 'text-slate-500'}`}>{selectedOption ? selectedOption.label : placeholder}</span>
                    <Fa.FaChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''} text-slate-400 flex-shrink-0`} />
                </button>
                
                <AnimatePresence>
                    {isOpen && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-20 top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                            <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                                <input type="text" autoFocus placeholder="Пошук..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-base sm:text-sm outline-none focus:border-indigo-500"/>
                            </div>
                            <ul>
                                {filteredOptions.length > 0 ? filteredOptions.map(opt => (
                                    <li key={opt.value} onClick={() => handleSelect(opt.value)} className="px-4 py-3 hover:bg-indigo-50 cursor-pointer text-sm text-slate-700 border-b border-slate-50 last:border-0">{opt.label}</li>
                                )) : <li className="px-4 py-3 text-sm text-slate-400 text-center">Не знайдено</li>}
                            </ul>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
});

// --- Serial Number Tag Input ---
const SerialNumberInput = ({ serials, onChange, max }) => {
    const [inputVal, setInputVal] = useState('');

    const addSerial = () => {
        if (!inputVal.trim()) return;
        // Валідація прибрана - додаємо скільки хочемо, або обмежуємо, якщо треба. 
        // Але ви просили забрати блокування. Залишимо ліміт UI, щоб не додавати більше ніж quantity,
        // але зберегти можна і менше.
        if (serials.length >= max) return; 
        const newSerials = [...serials, inputVal.trim()];
        onChange(newSerials);
        setInputVal('');
    };

    const removeSerial = (index) => {
        const newSerials = serials.filter((_, i) => i !== index);
        onChange(newSerials);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSerial();
        }
    };

    return (
        <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">
                Серійні номери ({serials.length} / {max})
            </label>
            <div className="border border-slate-200 rounded-xl bg-white p-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
                <div className="flex flex-wrap gap-2 mb-2">
                    {serials.map((sn, idx) => (
                        <span key={idx} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-indigo-100">
                            {sn}
                            <button type="button" onClick={() => removeSerial(idx)} className="text-indigo-400 hover:text-indigo-900"><Fa.FaTimes size={10}/></button>
                        </span>
                    ))}
                </div>
                {serials.length < max && (
                    <div className="flex items-center gap-2">
                        <Fa.FaTag className="text-slate-400 ml-2" />
                        <input 
                            type="text" 
                            value={inputVal}
                            onChange={(e) => setInputVal(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Введіть S/N і натисніть +"
                            className="flex-1 text-base sm:text-sm outline-none py-1 text-slate-700 placeholder:text-slate-400"
                        />
                        <button 
                            type="button" 
                            onClick={addSerial}
                            disabled={!inputVal.trim()}
                            className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-50"
                        >
                            <Fa.FaPlus size={12}/>
                        </button>
                    </div>
                )}
            </div>
            {/* Інформаційне повідомлення замість помилки */}
            {serials.length < max && <p className="text-[10px] text-amber-500 mt-1 ml-1 font-medium">Ще можна додати {max - serials.length} шт. (не обов'язково)</p>}
        </div>
    );
};

// --- Оновлений NotificationSystem (Toast) ---
const NotificationSystem = ({ notification, onDismiss }) => {
    useEffect(() => {
        if (notification.message) {
            const timer = setTimeout(onDismiss, 4000);
            return () => clearTimeout(timer);
        }
    }, [notification, onDismiss]);

    return (
        <AnimatePresence>
            {notification.message && (
                <motion.div 
                    initial={{ opacity: 0, y: -50, scale: 0.9 }} 
                    animate={{ opacity: 1, y: 0, scale: 1 }} 
                    exit={{ opacity: 0, y: -50, scale: 0.9 }} 
                    className={`
                        fixed z-[200] flex items-center gap-3 p-4 rounded-xl shadow-2xl text-white font-medium
                        top-4 left-4 right-4  /* Мобільний: зверху, на всю ширину */
                        sm:left-auto sm:right-6 sm:w-auto sm:min-w-[300px] /* ПК: справа зверху */
                        ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}
                    `}
                >
                    <div className="flex-shrink-0 text-xl">
                        {notification.type === 'error' ? <Fa.FaTimesCircle /> : <Fa.FaCheckCircle />}
                    </div>
                    <p className="text-sm flex-1">{notification.message}</p>
                    <button onClick={onDismiss} className="opacity-80 hover:opacity-100 p-1"><Fa.FaTimes /></button>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;
    return (
        <Modal closeModal={onClose} size="sm">
            <div className="p-6 text-center">
                <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4"><Fa.FaExclamationTriangle className="text-red-500 text-xl" /></div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm mb-6">{children}</p>
                <div className="flex justify-center gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200">Скасувати</button>
                    <button onClick={onConfirm} className="px-5 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600">Видалити</button>
                </div>
            </div>
        </Modal>
    );
};

// --- Main Page --- //
export default function EquipmentPage() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('installations');
    const [modal, setModal] = useState({ type: null, data: null });
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState({ message: null, type: 'success' });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false });
    
    // Filters for Catalog
    const [catalogCategoryFilter, setCatalogCategoryFilter] = useState('all');

    const [equipment, setEquipment] = useState([]);
    const [installedEquipment, setInstalledEquipment] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [employees, setEmployees] = useState([]);

    const [installationSearch, setInstallationSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 9;
    
    const showNotification = useCallback((message, type = 'success') => setNotification({ message, type }), []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [eqRes, instRes, instEqRes, empRes] = await Promise.all([
                supabase.from('equipment').select('*').order('name'),
                supabase.from('installations').select('*, clients!inner(name)').order('created_at', { ascending: false }),
                supabase.from('installed_equipment').select('*, equipment:equipment_id(*), employees:employee_custom_id(name, phone)').order('created_at', { ascending: false }),
                supabase.from('employees').select('custom_id, name, phone').order('name')
            ]);
            
            if (eqRes.error) throw eqRes.error;
            if (instRes.error) throw instRes.error;
            if (instEqRes.error) throw instEqRes.error;
            if (empRes.error) throw empRes.error;

            setEquipment(eqRes.data);
            setInstallations(instRes.data);
            setInstalledEquipment(instEqRes.data);
            setEmployees(empRes.data);
        } catch (e) {
            showNotification(e.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showNotification]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const installationsWithEquipment = useMemo(() => {
        const map = new Map(installations.map(inst => [inst.custom_id, { ...inst, equipment: [] }]));
        installedEquipment.forEach(item => {
            if (map.has(item.installation_custom_id)) map.get(item.installation_custom_id).equipment.push(item);
        });
        return Array.from(map.values());
    }, [installations, installedEquipment]);

    const filteredInstallations = useMemo(() => {
        const term = installationSearch.toLowerCase();
        return installationsWithEquipment.filter(inst => 
            inst.name?.toLowerCase().includes(term) || 
            inst.clients?.name?.toLowerCase().includes(term) || 
            inst.custom_id.toString().includes(term)
        );
    }, [installationsWithEquipment, installationSearch]);
    
    const filteredCatalog = useMemo(() => {
        let res = equipment;
        if (catalogCategoryFilter !== 'all') {
            res = res.filter(e => e.category === catalogCategoryFilter);
        }
        return res;
    }, [equipment, catalogCategoryFilter]);

    const paginatedInstallations = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredInstallations.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredInstallations, currentPage]);

    const handleCrud = async (promise, msg) => {
        setLoading(true);
        const { error } = await promise;
        if (error) showNotification(error.message, 'error');
        else { showNotification(msg); setModal({ type: null }); fetchData(); }
        setLoading(false);
    };

    const handleTypeSubmit = (data) => {
        const payload = { ...data, power_kw: data.power_kw ? parseFloat(data.power_kw) : null };
        const req = modal.data?.id ? supabase.from('equipment').update(payload).eq('id', modal.data.id) : supabase.from('equipment').insert([payload]);
        handleCrud(req, modal.data?.id ? 'Оновлено' : 'Створено');
    };

    const deleteType = (id) => {
        setConfirmDialog({
            isOpen: true, title: "Видалити тип?", message: "Це вплине на всі записи.",
            onConfirm: () => { setConfirmDialog({ isOpen: false }); handleCrud(supabase.from('equipment').delete().eq('id', id), 'Видалено'); }
        });
    };

    const handleAssign = (data) => {
        const payload = { ...data, equipment_id: parseInt(data.equipment_id), quantity: parseInt(data.quantity) };
        handleCrud(supabase.from('installed_equipment').insert([payload]), 'Додано на об\'єкт');
    };

    const handleUpdateDetails = (data) => {
        const { id, ...payload } = data;
        payload.employee_custom_id = payload.employee_custom_id ? parseInt(payload.employee_custom_id) : null;
        
        if (payload.serial_number && Array.isArray(payload.serial_number)) {
             payload.serial_number = JSON.stringify(payload.serial_number);
        }

        handleCrud(supabase.from('installed_equipment').update(payload).eq('id', id), 'Оновлено');
    };

    const removeEquipment = (id) => {
        setConfirmDialog({
            isOpen: true, title: "Зняти обладнання?", message: "Ви впевнені?",
            onConfirm: () => { setConfirmDialog({ isOpen: false }); handleCrud(supabase.from('installed_equipment').delete().eq('id', id), 'Знято'); }
        });
    };

    return (
        <Layout>
            <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto pb-safe min-h-[calc(100dvh-80px)] flex flex-col">
                <NotificationSystem notification={notification} onDismiss={() => setNotification({ message: null })} />
                <ConfirmationModal {...confirmDialog} onClose={() => setConfirmDialog({ isOpen: false })} />

                {/* HEADER */}
                <div className="flex flex-col gap-4 flex-none">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                                <Fa.FaBolt className="text-indigo-600"/> Обладнання
                            </h1>
                            <p className="text-slate-500 text-sm mt-1">Облік та розподіл по об'єктах</p>
                        </div>
                        
                        {/* TABS */}
                        <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                            <button onClick={() => setActiveTab('installations')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'installations' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Об'єкти</button>
                            <button onClick={() => setActiveTab('catalog')} className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'catalog' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Довідник</button>
                        </div>
                    </div>

                    {/* SEARCH & FILTERS */}
                    {activeTab === 'installations' && (
                        <div className="relative">
                            <Fa.FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input type="text" placeholder="Пошук об'єкта..." value={installationSearch} onChange={e => {setInstallationSearch(e.target.value); setCurrentPage(1);}} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-base sm:text-sm shadow-sm"/>
                        </div>
                    )}
                    {activeTab === 'catalog' && (
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex bg-white border border-slate-200 p-1 rounded-xl overflow-x-auto no-scrollbar flex-1">
                                {[{id: 'all', l: 'Всі'}, {id: 'inverter', l: 'Інвертори'}, {id: 'battery', l: 'АКБ'}, {id: 'solar_panel', l: 'Панелі'}, {id: 'logger', l: 'Логери'}].map(cat => (
                                    <button key={cat.id} onClick={() => setCatalogCategoryFilter(cat.id)} className={`px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${catalogCategoryFilter === cat.id ? 'bg-slate-800 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}>{cat.l}</button>
                                ))}
                            </div>
                            <button onClick={() => setModal({type: 'addType', data: null})} className="w-full sm:w-auto self-end flex items-center justify-center gap-2 py-2.5 px-5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all text-sm">
                                <Fa.FaPlus /> <span>Додати</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* CONTENT */}
                <div className="flex-1">
                    <AnimatePresence mode="wait">
                        {activeTab === 'installations' ? (
                            <motion.div key="installations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                                {loading ? <div className="col-span-full text-center py-20 text-slate-400">Завантаження...</div> : 
                                paginatedInstallations.length === 0 ? <div className="col-span-full text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">Нічого не знайдено</div> :
                                paginatedInstallations.map((inst) => (
                                    <div key={inst.custom_id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="font-bold text-lg text-slate-800 line-clamp-1">{inst.name || 'Без назви'}</h3>
                                                <p className="text-xs text-slate-500 font-medium">{inst.clients?.name}</p>
                                            </div>
                                            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded">#{inst.custom_id}</span>
                                        </div>
                                        
                                        <div className="flex-1 space-y-2 mb-4 overflow-y-auto max-h-60 pr-1 custom-scrollbar">
                                            {inst.equipment.length > 0 ? inst.equipment.map(item => {
                                                const { icon: Icon, color } = getCategoryProps(item.equipment?.category);
                                                // Helper to check if S/N is JSON array or string
                                                let serialDisplay = 'S/N ---';
                                                try {
                                                    const parsed = JSON.parse(item.serial_number);
                                                    if (Array.isArray(parsed) && parsed.length > 0) serialDisplay = `${parsed[0]}...`;
                                                    else if (item.serial_number) serialDisplay = item.serial_number;
                                                } catch(e) {
                                                    if(item.serial_number) serialDisplay = item.serial_number.substring(0,10) + '...';
                                                }

                                                return (
                                                    <div key={item.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${color}`}><Icon /></div>
                                                            <div>
                                                                <p className="text-sm font-bold text-slate-700">{item.equipment?.name}</p>
                                                                <p className="text-[10px] text-slate-400 font-mono">
                                                                    {item.equipment?.category === 'solar_panel' ? 'Панель' : serialDisplay}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs font-bold text-slate-600 mr-2">x{item.quantity}</span>
                                                            <button onClick={() => setModal({ type: 'viewDetails', data: item })} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg"><Fa.FaEye/></button>
                                                            <button onClick={() => setModal({ type: 'editDetails', data: item })} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg"><Fa.FaPencilAlt/></button>
                                                            <button onClick={() => removeEquipment(item.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Fa.FaTrash/></button>
                                                        </div>
                                                    </div>
                                                );
                                            }) : <p className="text-sm text-slate-400 italic text-center py-4">Обладнання відсутнє</p>}
                                        </div>
                                        
                                        <button onClick={() => setModal({type: 'assign', data: inst})} className="w-full py-2.5 border-2 border-dashed border-indigo-200 text-indigo-600 rounded-xl font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"><Fa.FaPlus/> Додати</button>
                                    </div>
                                ))}
                            </motion.div>
                        ) : (
                            <motion.div key="catalog" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                                {/* DESKTOP TABLE */}
                                <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Назва</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Категорія</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Потужність</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">Виробник</th>
                                                    <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Дії</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {filteredCatalog.map((type) => {
                                                    const { name: catName, color } = getCategoryProps(type.category);
                                                    return (
                                                        <tr key={type.id} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="p-4 text-sm font-bold text-slate-700">{type.name}</td>
                                                            <td className="p-4"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${color}`}>{catName}</span></td>
                                                            <td className="p-4 text-sm text-slate-600">{type.power_kw ? `${type.power_kw} кВт` : '—'}</td>
                                                            <td className="p-4 text-sm text-slate-600">{type.manufacturer || '—'}</td>
                                                            <td className="p-4 text-right">
                                                                <button onClick={() => setModal({type: 'editType', data: type})} className="p-2 text-slate-400 hover:text-indigo-600"><Fa.FaEdit/></button>
                                                                <button onClick={() => deleteType(type.id)} className="p-2 text-slate-400 hover:text-red-600"><Fa.FaTrash/></button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* MOBILE CARDS */}
                                <div className="md:hidden space-y-3">
                                    {filteredCatalog.map((type) => {
                                        const { name: catName, color, icon: Icon } = getCategoryProps(type.category);
                                        return (
                                            <div key={type.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`p-2.5 rounded-lg ${color}`}><Icon /></div>
                                                        <div>
                                                            <h4 className="font-bold text-slate-800 text-sm">{type.name}</h4>
                                                            <span className="text-xs text-slate-500 font-medium">{catName}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => setModal({type: 'editType', data: type})} className="p-2 text-slate-400 hover:text-indigo-600 bg-slate-50 rounded-lg"><Fa.FaEdit/></button>
                                                        <button onClick={() => deleteType(type.id)} className="p-2 text-slate-400 hover:text-red-600 bg-slate-50 rounded-lg"><Fa.FaTrash/></button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between text-xs pt-2 border-t border-slate-100 text-slate-500">
                                                    <span>{type.manufacturer || 'Виробник не вказаний'}</span>
                                                    <span>{type.power_kw ? `${type.power_kw} кВт` : ''}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* MODALS */}
                <AnimatePresence>
                    {modal.type === 'assign' && <AssignEquipmentModal closeModal={() => setModal({ type: null })} installation={modal.data} onAssign={handleAssign} equipmentCatalog={equipment} showNotification={showNotification} />}
                    {(modal.type === 'addType' || modal.type === 'editType') && <TypeFormModal closeModal={() => setModal({ type: null })} onSubmit={handleTypeSubmit} initialData={modal.data} loading={loading} />}
                    {modal.type === 'viewDetails' && <EquipmentDetailsModal closeModal={() => setModal({ type: null })} item={modal.data} />}
                    {modal.type === 'editDetails' && <EditDetailsModal closeModal={() => setModal({ type: null })} onSubmit={handleUpdateDetails} initialData={modal.data} employees={employees} loading={loading} />}
                </AnimatePresence>
            </div>
        </Layout>
    );
}

// --- SUB-COMPONENTS ---

function AssignEquipmentModal({ closeModal, installation, onAssign, equipmentCatalog, showNotification }) {
    const [formData, setFormData] = useState({ installation_custom_id: installation.custom_id, equipment_id: '', serial_number: '', quantity: 1 });
    
    // Category Filter in Assign Modal
    const [categoryFilter, setCategoryFilter] = useState('');
    
    const categories = [
        {id: 'solar_panel', l: 'Панелі'}, {id: 'inverter', l: 'Інвертори'}, {id: 'battery', l: 'АКБ'}, {id: 'logger', l: 'Логери'}, {id: 'other', l: 'Інше'}
    ];

    const options = useMemo(() => {
        let filtered = equipmentCatalog;
        if(categoryFilter) {
            filtered = filtered.filter(e => e.category === categoryFilter);
        }
        return filtered.map(e => ({ value: e.id, label: e.name }));
    }, [equipmentCatalog, categoryFilter]);
    
    const handleSubmit = (e) => { e.preventDefault(); if(!formData.equipment_id) return showNotification('Оберіть тип', 'error'); onAssign(formData); };
    
    return (
        <Modal closeModal={closeModal} size="md">
            <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                <div className="flex-none p-6 border-b border-slate-100"><h3 className="text-xl font-bold text-slate-800">Додати на об'єкт</h3><p className="text-sm text-indigo-600">{installation.name}</p></div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    
                    {/* Category Filter */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Фільтр категорій</label>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setCategoryFilter('')} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${!categoryFilter ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>Всі</button>
                            {categories.map(cat => (
                                <button key={cat.id} type="button" onClick={() => setCategoryFilter(cat.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${categoryFilter === cat.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{cat.l}</button>
                            ))}
                        </div>
                    </div>

                    <SearchableSelect label="Модель обладнання" icon={<Fa.FaBoxOpen/>} options={options} value={formData.equipment_id} onChange={(e) => setFormData({...formData, equipment_id: e.target.value})} placeholder={categoryFilter ? "Оберіть зі списку..." : "Спочатку оберіть категорію або шукайте..."} />
                    
                    <div className="grid grid-cols-2 gap-4">
                        <InputField label="Кількість" type="number" min="1" icon={<Fa.FaHashtag/>} value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} />
                    </div>
                    <p className="text-xs text-slate-400 italic">Деталі (S/N, логіни) додаються через редагування.</p>
                </div>
                <div className="flex-none p-6 flex justify-end gap-3 bg-slate-50 border-t border-slate-100 pb-safe">
                    <button type="button" onClick={closeModal} className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600">Скасувати</button>
                    <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold shadow-lg">Додати</button>
                </div>
            </form>
        </Modal>
    );
}

function TypeFormModal({ closeModal, onSubmit, initialData, loading }) {
    const [formData, setFormData] = useState(initialData || { name: '', category: '', power_kw: '', manufacturer: '' });
    return (
        <Modal closeModal={closeModal} size="md">
            <form onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }} className="flex flex-col h-full overflow-hidden">
                <div className="flex-none p-6 border-b border-slate-100"><h3 className="text-xl font-bold text-slate-800">{initialData ? 'Редагувати тип' : 'Новий тип'}</h3></div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <InputField label="Назва" icon={<Fa.FaTag/>} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                    <SelectField label="Категорія" icon={<Fa.FaFilter/>} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                        <option value="">Оберіть...</option><option value="solar_panel">Панель</option><option value="inverter">Інвертор</option><option value="battery">АКБ</option><option value="logger">Логер</option>
                    </SelectField>
                    <div className="grid grid-cols-2 gap-4">
                        <InputField label="Потужність (кВт)" type="number" step="0.01" icon={<Fa.FaBolt/>} value={formData.power_kw} onChange={e => setFormData({...formData, power_kw: e.target.value})} />
                        <InputField label="Виробник" icon={<Fa.FaBuilding/>} value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})} />
                    </div>
                </div>
                <div className="flex-none p-6 flex justify-end gap-3 bg-slate-50 border-t border-slate-100 pb-safe">
                    <button type="button" onClick={closeModal} className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600">Скасувати</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold shadow-lg">Зберегти</button>
                </div>
            </form>
        </Modal>
    );
}

function EquipmentDetailsModal({ closeModal, item }) {
    const [showPass, setShowPass] = useState(false);
    
    // Parse serials just in case
    let serialDisplay = '---';
    try {
        const parsed = JSON.parse(item.serial_number);
        if (Array.isArray(parsed)) serialDisplay = parsed.join(', ');
        else serialDisplay = item.serial_number || '---';
    } catch(e) {
        serialDisplay = item.serial_number || '---';
    }

    return (
        <Modal closeModal={closeModal} size="sm">
            <div className="flex flex-col h-full overflow-hidden">
                <div className="flex-none p-6 border-b border-slate-100"><h3 className="text-lg font-bold text-slate-800">{item.equipment?.name}</h3></div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {item.equipment?.category !== 'solar_panel' && (
                        <div className="flex flex-col border-b pb-4 gap-2">
                            <span className="text-slate-500 text-sm">Серійні номери</span>
                            <div className="flex flex-wrap gap-2">
                                {serialDisplay.split(', ').map((sn, i) => (
                                    <span key={i} className="bg-slate-100 text-slate-700 px-2 py-1 rounded text-xs font-mono border border-slate-200">{sn}</span>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {item.equipment?.category !== 'solar_panel' && item.equipment?.category !== 'battery' && (item.login || item.password) && (
                        <div className="bg-slate-50 p-3 rounded-lg space-y-2 border border-slate-100">
                            <div className="flex justify-between text-sm"><span className="text-slate-500">Логін</span><span className="font-bold">{item.login}</span></div>
                            <div className="flex justify-between text-sm items-center"><span className="text-slate-500">Пароль</span><div className="flex gap-2 items-center"><span className="font-mono">{showPass ? item.password : '••••••'}</span><button onClick={() => setShowPass(!showPass)} className="text-slate-400"><Fa.FaEye/></button></div></div>
                        </div>
                    )}
                    {/* Fixed alignment for Responsible */}
                    <div className="flex justify-between items-start pt-2 gap-4">
                        <span className="text-slate-500 text-sm whitespace-nowrap">Відповідальний</span>
                        <span className="font-bold text-indigo-600 text-right">{item.employees?.name || '---'}</span>
                    </div>
                </div>
                <div className="flex-none p-4 bg-slate-50 text-right pb-safe"><button onClick={closeModal} className="px-4 py-2 bg-white border border-slate-200 rounded-lg font-bold text-slate-600">Закрити</button></div>
            </div>
        </Modal>
    );
}

// --- EDIT DETAILS MODAL WITH VALIDATION (NON-BLOCKING) ---
function EditDetailsModal({ closeModal, onSubmit, initialData, employees, loading }) {
    let initialSerials = [];
    try {
        const parsed = JSON.parse(initialData.serial_number);
        if (Array.isArray(parsed)) initialSerials = parsed;
        else if (initialData.serial_number) initialSerials = [initialData.serial_number];
    } catch(e) {
        if(initialData.serial_number) initialSerials = [initialData.serial_number];
    }

    const [formData, setFormData] = useState({ 
        id: initialData.id, 
        login: initialData.login || '', 
        password: initialData.password || '', 
        employee_custom_id: initialData.employee_custom_id || '',
    });
    
    // Serial Numbers State (Tags)
    const [serials, setSerials] = useState(initialSerials);

    const [showPassword, setShowPassword] = useState(false);
    
    const equipment = initialData.equipment;
    const category = equipment?.category;
    const qty = initialData.quantity || 1;

    const isPanel = category === 'solar_panel';
    const isBattery = category === 'battery';
    const isSmart = category === 'inverter' || category === 'logger'; 

    const handleChange = useCallback((e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    }, []);

    const handleSubmit = useCallback((e) => {
        e.preventDefault();
        // Validation removed as requested - saving whatever serials are there
        const payload = { ...formData, serial_number: JSON.stringify(serials) };
        onSubmit(payload);
    }, [formData, onSubmit, serials]);

    return (
        <Modal closeModal={closeModal} size="lg">
            <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">
                <div className="flex-none p-6 md:p-8 border-b border-slate-100">
                    <h3 className="text-xl font-bold text-slate-800 mb-1">Редагувати деталі</h3>
                    <div className="flex items-center gap-2 text-sm text-indigo-600 font-medium">
                        <span className="bg-indigo-50 px-2 py-0.5 rounded">{equipment?.name}</span>
                        <span className="text-slate-400">x{qty} шт.</span>
                    </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                    
                    {/* --- SERIAL NUMBERS (TAG INPUT) --- */}
                    {!isPanel && (
                        <SerialNumberInput serials={serials} onChange={setSerials} max={qty} />
                    )}

                    {/* --- LOGIN / PASS (Only for Inverter/Logger) --- */}
                    {isSmart && (
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
                            <p className="font-bold text-blue-800 text-xs uppercase tracking-wider">Облікові дані</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField name="login" label="Логін" icon={<Fa.FaUserCircle/>} value={formData.login} onChange={handleChange} />
                                <InputField name="password" label="Пароль" icon={<Fa.FaKey/>} type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} showPassword={showPassword} onTogglePassword={() => setShowPassword(!showPassword)} />
                            </div>
                        </div>
                    )}

                    {/* --- RESPONSIBLE EMPLOYEE --- */}
                    <SelectField name="employee_custom_id" label="Відповідальний працівник" icon={<Fa.FaUserTie />} value={formData.employee_custom_id} onChange={handleChange}>
                        <option value="">Не вказано</option>
                        {employees.map(e => <option key={e.custom_id} value={e.custom_id}>{e.name}</option>)}
                    </SelectField>
                </div>
                
                <div className="flex-none flex justify-end gap-3 p-6 bg-slate-50/50 rounded-b-2xl border-t border-slate-100 pb-safe">
                    <button type="button" onClick={closeModal} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition">Скасувати</button>
                    <button 
                        type="submit" 
                        disabled={loading} 
                        className="px-5 py-2.5 rounded-xl font-bold shadow-lg transition flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-xl"
                    >
                        {loading ? 'Збереження...' : 'Зберегти'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}