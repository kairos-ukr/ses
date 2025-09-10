import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
// --- ЗМІНА: Імпортуємо useNavigate для навігації ---
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as Fa from "react-icons/fa";
import { createClient } from "@supabase/supabase-js";

// --- Supabase Configuration --- //
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Helper Functions --- //
const getCategoryProps = (category) => ({
    'solar_panel': { icon: Fa.FaSolarPanel, name: 'Сонячна панель' },
    'battery': { icon: Fa.FaBatteryHalf, name: 'Акумулятор' },
    'inverter': { icon: Fa.FaMicrochip, name: 'Інвертор' },
    'logger': { icon: Fa.FaServer, name: 'Логер' }
}[category] || { icon: Fa.FaCog, name: 'Інше' });

// --- UI Components --- //

const Modal = ({ children, closeModal, size = "md" }) => {
    const sizeClasses = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[100]"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeModal}
            >
                <motion.div
                    className={`bg-white/95 backdrop-blur-xl rounded-2xl w-full ${sizeClasses[size]} shadow-2xl border border-gray-200/50 max-h-[90vh] flex flex-col`}
                    initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}
                >
                    {children}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

// --- ЗМІНА: Компонент обгорнуто в React.memo для оптимізації ---
const InputField = React.memo(React.forwardRef(({ icon, label, error, showPassword, onTogglePassword, ...props }, ref) => (
    <div>
        {label && <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>}
        <div className="relative">
            {icon && <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none z-10">{icon}</span>}
            <input
                ref={ref}
                {...props}
                className={`w-full border rounded-xl ${icon ? 'pl-12' : 'pl-4'} pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50/80 border-gray-200 ${props.disabled ? 'bg-gray-200 cursor-not-allowed text-gray-500' : 'hover:bg-gray-50'}`}
            />
            {props.type === 'password' && onTogglePassword && (
                <button type="button" onClick={onTogglePassword} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <Fa.FaEyeSlash /> : <Fa.FaEye />}
                </button>
            )}
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
)));

// --- ЗМІНА: Компонент обгорнуто в React.memo для оптимізації ---
const SelectField = React.memo(({ icon, label, children, error, ...props }) => (
    <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
        <div className="relative">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none z-10">{icon}</span>
            <select {...props} className={`w-full appearance-none border rounded-xl pl-12 pr-10 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 bg-gray-50/80 border-gray-200`}>
                {children}
            </select>
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none">
                <Fa.FaChevronDown className="text-gray-400" />
            </div>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
));


const SearchableSelect = ({ options, value, onChange, icon, label, placeholder = "Оберіть..." }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const selectRef = useRef(null);
    const inputRef = useRef(null);

    const selectedOption = useMemo(() => options.find(opt => opt.value === value), [options, value]);

    const filteredOptions = useMemo(() =>
        options.filter(opt =>
            opt.label.toLowerCase().includes(searchTerm.toLowerCase())
        ), [options, searchTerm]);

    const handleSelect = (optionValue) => {
        onChange({ target: { name: 'equipment_id', value: optionValue } });
        setIsOpen(false);
        setSearchTerm('');
    };
    
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (selectRef.current && !selectRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div>
            {label && <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>}
            <div className="relative" ref={selectRef}>
                <button type="button" onClick={() => setIsOpen(!isOpen)} className="w-full border rounded-xl pl-12 pr-10 py-3 text-sm text-left bg-gray-50/80 border-gray-200 flex items-center justify-between">
                    <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none z-10">{icon}</span>
                    <span className={selectedOption ? 'text-gray-800' : 'text-gray-500'}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    <Fa.FaChevronDown className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                
                <AnimatePresence>
                    {isOpen && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: -10 }}
                            className="absolute top-full mt-2 w-full bg-white border rounded-xl shadow-lg z-20 overflow-hidden"
                        >
                            <div className="p-2 border-b">
                                <InputField 
                                    ref={inputRef}
                                    icon={<Fa.FaSearch />} 
                                    placeholder="Пошук..." 
                                    value={searchTerm} 
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <ul className="max-h-60 overflow-y-auto">
                                {filteredOptions.length > 0 ? filteredOptions.map(opt => (
                                    <li 
                                        key={opt.value} 
                                        onClick={() => handleSelect(opt.value)} 
                                        className="px-4 py-2 hover:bg-indigo-50 cursor-pointer text-sm"
                                    >
                                        {opt.label}
                                    </li>
                                )) : <li className="px-4 py-2 text-sm text-gray-500">Не знайдено</li>}
                            </ul>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};


const Notification = ({ message, type, onDismiss }) => {
    if (!message) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }}
            className={`fixed top-5 right-5 z-[200] p-4 rounded-xl shadow-lg text-white max-w-sm ${type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}
        >
            <div className="flex items-center justify-between">
                <span>{message}</span>
                <button onClick={onDismiss} className="ml-4 font-bold">×</button>
            </div>
        </motion.div>
    );
};

// --- ЗМІНА: Новий компонент для підтвердження дій ---
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, children }) => {
    if (!isOpen) return null;
    return (
        <Modal closeModal={onClose} size="sm">
            <div className="p-6">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex-shrink-0 bg-red-100 rounded-full flex items-center justify-center">
                        <Fa.FaExclamationTriangle className="text-red-500 text-xl" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{title}</h3>
                    </div>
                </div>
                <p className="text-gray-600 mt-4">{children}</p>
            </div>
            <div className="flex justify-end gap-3 p-4 bg-gray-50/50 rounded-b-2xl border-t">
                <button onClick={onClose} className="py-2 px-5 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300">Скасувати</button>
                <button onClick={onConfirm} className="py-2 px-5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600">Видалити</button>
            </div>
        </Modal>
    );
};

// --- Main Page Component --- //
export default function EquipmentPage() {
    const navigate = useNavigate(); // --- ЗМІНА: Ініціалізація useNavigate ---
    const [activeTab, setActiveTab] = useState('installations');
    const [modal, setModal] = useState({ type: null, data: null });
    const [loading, setLoading] = useState(true);
    const [notification, setNotification] = useState({ message: null, type: 'success' });
    const [confirmDialog, setConfirmDialog] = useState({ isOpen: false }); // --- ЗМІНА: Стан для модального вікна підтвердження
    
    // Data State
    const [equipment, setEquipment] = useState([]);
    const [installedEquipment, setInstalledEquipment] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [employees, setEmployees] = useState([]);

    // UI State
    const [installationSearch, setInstallationSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 9;
    
    const showNotification = (message, type = 'success', duration = 4000) => {
        setNotification({ message, type });
        setTimeout(() => setNotification({ message: null, type: 'success' }), duration);
    };

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [equipmentRes, instsRes, installedRes, employeesRes] = await Promise.all([
                supabase.from('equipment').select('*').order('name'),
                supabase.from('installations').select('*, clients!inner(name)').order('created_at', { ascending: false }),
                supabase.from('installed_equipment').select('*, equipment:equipment_id(*), employees:employee_custom_id(name, phone)').order('created_at', { ascending: false }),
                supabase.from('employees').select('custom_id, name, phone').order('name')
            ]);

            if (equipmentRes.error) throw equipmentRes.error;
            if (instsRes.error) throw instsRes.error;
            if (installedRes.error) throw installedRes.error;
            if (employeesRes.error) throw employeesRes.error;

            setEquipment(equipmentRes.data);
            setInstallations(instsRes.data);
            setInstalledEquipment(installedRes.data);
            setEmployees(employeesRes.data);
        } catch (e) {
            showNotification(`Помилка завантаження даних: ${e.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const installationsWithEquipment = useMemo(() => {
        const installationMap = new Map();
        installations.forEach(inst => installationMap.set(inst.custom_id, { ...inst, equipment: [] }));
        installedEquipment.forEach(item => {
            if (installationMap.has(item.installation_custom_id)) {
                installationMap.get(item.installation_custom_id).equipment.push(item);
            }
        });
        return Array.from(installationMap.values());
    }, [installations, installedEquipment]);

    const filteredInstallations = useMemo(() =>
        installationsWithEquipment.filter(inst => {
            const clientName = inst.clients?.name || '';
            const objectName = inst.name || '';
            const searchTerm = installationSearch.toLowerCase();
            return clientName.toLowerCase().includes(searchTerm) || 
                   objectName.toLowerCase().includes(searchTerm) ||
                   inst.custom_id.toString().includes(searchTerm);
        }),
        [installationsWithEquipment, installationSearch]
    );
    
    const paginatedInstallations = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredInstallations.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredInstallations, currentPage]);

    const totalPages = Math.ceil(filteredInstallations.length / ITEMS_PER_PAGE);

    const handleCrudSubmit = async (promise, successMsg) => {
        setLoading(true);
        const { error } = await promise;
        if (error) {
            showNotification(`Помилка: ${error.message}`, 'error');
        } else {
            showNotification(successMsg);
            setModal({ type: null });
            await fetchData();
        }
        setLoading(false);
    };

    const handleTypeSubmit = (typeForm) => {
        const payload = { ...typeForm, power_kw: typeForm.power_kw ? parseFloat(typeForm.power_kw) : null };
        const promise = modal.data?.id
            ? supabase.from('equipment').update(payload).eq('id', modal.data.id)
            : supabase.from('equipment').insert([payload]);
        handleCrudSubmit(promise, modal.data?.id ? 'Тип оновлено!' : 'Тип додано!');
    };
    
    // --- ЗМІНА: Функція тепер відкриває модальне вікно підтвердження ---
    const deleteType = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: "Підтвердити видалення",
            message: "Видалити цей тип обладнання? Це може вплинути на існуючі записи.",
            onConfirm: () => {
                setConfirmDialog({ isOpen: false });
                handleCrudSubmit(supabase.from('equipment').delete().eq('id', id), 'Тип видалено.');
            }
        });
    };
    
    const handleAssignSubmit = (formData) => {
        const payload = { ...formData };
        payload.equipment_id = parseInt(payload.equipment_id, 10);
        payload.quantity = parseInt(payload.quantity, 10);
        payload.employee_custom_id = payload.employee_custom_id ? parseInt(payload.employee_custom_id, 10) : null;

        const promise = supabase.from('installed_equipment').insert([payload]);
        handleCrudSubmit(promise, 'Обладнання призначено!');
    };

    // --- ЗМІНА: Функція тепер відкриває модальне вікно підтвердження ---
    const removeEquipmentFromInstallation = (id) => {
        setConfirmDialog({
            isOpen: true,
            title: "Підтвердити видалення",
            message: "Ви впевнені, що хочете видалити це обладнання з об'єкту?",
            onConfirm: () => {
                setConfirmDialog({ isOpen: false });
                handleCrudSubmit(supabase.from('installed_equipment').delete().eq('id', id), 'Обладнання знято.');
            }
        });
    };
    
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-emerald-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            </div>
            
            <Notification message={notification.message} type={notification.type} onDismiss={() => setNotification({ message: null })} />

            {/* --- ЗМІНА: Додано рендер модального вікна підтвердження --- */}
            <ConfirmationModal
                isOpen={confirmDialog.isOpen}
                onClose={() => setConfirmDialog({ isOpen: false })}
                onConfirm={confirmDialog.onConfirm}
                title={confirmDialog.title}
            >
                {confirmDialog.message}
            </ConfirmationModal>

            <header className="relative bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
                <div className="px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center space-x-4">
                         {/* --- ЗМІНА: Тег 'a' замінено на 'button' з onClick --- */}
                         <button onClick={() => navigate(-1)} className="w-12 h-12 bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center shadow-sm hover:shadow-md transition-all">
                            <Fa.FaArrowLeft className="text-lg" />
                        </button>
                        <div className="flex items-center space-x-3">
                           <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg"><Fa.FaBolt className="text-white text-xl" /></div>
                            <div><h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">SES Tracker</h1><p className="text-sm text-gray-500">Управління обладнанням</p></div>
                        </div>
                    </div>
                    <div className="flex items-center space-x-2 bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-2 rounded-full"><div className="w-8 h-8 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-full flex items-center justify-center"><span className="text-white text-sm font-bold">A</span></div><span className="text-gray-700 font-medium">Admin</span></div>
                </div>
            </header>
            
            <main className="relative p-4 md:p-8">
                <div className="mb-8">
                    <div className="flex space-x-1 bg-white/60 backdrop-blur-xl p-1 rounded-xl shadow-lg border border-gray-200/50 w-full md:w-auto">
                        <button onClick={() => setActiveTab('installations')} className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all ${activeTab === 'installations' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md' : 'text-gray-600 hover:text-gray-800'}`}><Fa.FaBuilding /> <span>Об'єкти</span></button>
                        <button onClick={() => setActiveTab('catalog')} className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-medium transition-all ${activeTab === 'catalog' ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md' : 'text-gray-600 hover:text-gray-800'}`}><Fa.FaBook /> <span>Довідник</span></button>
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div key={activeTab} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                        {activeTab === 'installations' && (
                            <div>
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50">
                                    <h2 className="text-xl font-bold text-gray-800">Об'єкти та встановлене обладнання</h2>
                                    <InputField icon={<Fa.FaSearch />} type="text" placeholder="Пошук..." value={installationSearch} onChange={e => {setInstallationSearch(e.target.value); setCurrentPage(1);}} />
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
                                    {paginatedInstallations.map((inst, index) => (
                                        <motion.div key={inst.custom_id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50 flex flex-col justify-between">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900">{inst.name || 'Об\'єкт без назви'}</h3>
                                                <p className="text-gray-600">{inst.clients?.name}</p>
                                                <span className="text-sm text-gray-500 font-mono">ID: {inst.custom_id}</span>
                                                <div className="border-t my-4"></div>
                                                <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                                    {inst.equipment.length > 0 ? inst.equipment.map(item => {
                                                        const { icon: Icon } = getCategoryProps(item.equipment?.category);
                                                        return (
                                                            <div key={item.id} className="flex items-center justify-between text-sm p-2 rounded-lg bg-gray-50/70">
                                                                <div className="flex items-center gap-3"><Icon className="text-indigo-500 text-base"/> <div><span className="font-medium">{item.equipment?.name}</span><p className="text-xs text-gray-500 font-mono">{item.serial_number || 'S/N не вказано'}</p></div></div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-gray-600 mr-2">x{item.quantity}</span>
                                                                    <button onClick={() => setModal({ type: 'viewDetails', data: item })} className="text-sky-500 hover:text-sky-700"><Fa.FaEye /></button>
                                                                    <button onClick={() => removeEquipmentFromInstallation(item.id)} className="text-red-400 hover:text-red-600"><Fa.FaTrash /></button>
                                                                </div>
                                                            </div>
                                                        );
                                                    }) : <p className="text-sm text-gray-500 italic text-center py-4">Немає обладнання</p>}
                                                </div>
                                            </div>
                                            <button onClick={() => setModal({type: 'assign', data: inst})} className="mt-4 w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:shadow-lg font-semibold transition-shadow"><Fa.FaPlus/> Додати обладнання</button>
                                        </motion.div>
                                    ))}
                                </div>
                                {totalPages > 1 && (
                                    <div className="flex justify-center items-center gap-4 mt-8">
                                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-4 py-2 bg-white rounded-lg shadow border disabled:opacity-50 disabled:cursor-not-allowed"> <Fa.FaChevronLeft/> </button>
                                        <span className="font-medium text-gray-700">Сторінка {currentPage} з {totalPages}</span>
                                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-4 py-2 bg-white rounded-lg shadow border disabled:opacity-50 disabled:cursor-not-allowed"> <Fa.FaChevronRight/> </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'catalog' && (
                           <div>
                                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50">
                                    <h2 className="text-xl font-bold text-gray-800">Довідник типів обладнання</h2>
                                     <button onClick={() => setModal({type: 'addType', data: null})} className="flex items-center justify-center gap-2 py-3 px-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl"><Fa.FaPlus /> Додати тип</button>
                                </div>
                                <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 overflow-x-auto">
                                    <table className="w-full text-left min-w-[700px]">
                                        <thead className="bg-gray-50/70 border-b border-gray-200">
                                            <tr><th className="p-5 font-semibold text-gray-600 text-sm">Обладнання</th><th className="p-5 font-semibold text-gray-600 text-sm">Категорія</th><th className="p-5 font-semibold text-gray-600 text-sm">Потужність, кВт</th><th className="p-5 font-semibold text-gray-600 text-sm">Виробник</th><th className="p-5 font-semibold text-gray-600 text-sm text-right">Дії</th></tr>
                                        </thead>
                                        <tbody>
                                           {equipment.map((type) => {
                                                const { name: catName } = getCategoryProps(type.category);
                                                return (
                                                    <tr key={type.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/70">
                                                        <td className="p-5 font-semibold text-gray-800">{type.name}</td>
                                                        <td className="p-5"><span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-200 text-gray-700">{catName}</span></td>
                                                        <td className="p-5 text-gray-600">{type.power_kw || '—'}</td>
                                                        <td className="p-5 text-gray-600">{type.manufacturer || '—'}</td>
                                                        <td className="p-5 text-right"><div className="flex items-center justify-end gap-2"><button onClick={() => setModal({type: 'editType', data: type})} className="p-2 text-gray-600 hover:bg-gray-200 rounded-full"><Fa.FaEdit/></button><button onClick={() => deleteType(type.id)} className="p-2 text-red-500 hover:bg-red-100 rounded-full"><Fa.FaTrash/></button></div></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                           </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>
            
            <AnimatePresence>
                {modal.type && (
                    <>
                        {modal.type === 'assign' && 
                            <AssignEquipmentModal 
                                closeModal={() => setModal({ type: null })} 
                                installation={modal.data} 
                                onAssign={handleAssignSubmit} 
                                equipmentCatalog={equipment}
                                employees={employees}
                                showNotification={showNotification} 
                            />
                        }
                        {(modal.type === 'addType' || modal.type === 'editType') && 
                            <TypeFormModal 
                                closeModal={() => setModal({ type: null })}
                                onSubmit={handleTypeSubmit}
                                initialData={modal.data}
                                loading={loading}
                            />
                        }
                        {modal.type === 'viewDetails' && 
                             <EquipmentDetailsModal 
                                closeModal={() => setModal({ type: null })}
                                item={modal.data}
                            />
                        }
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

// --- Assign Equipment Modal Component --- //
function AssignEquipmentModal({ closeModal, installation, onAssign, equipmentCatalog, employees, showNotification }) {
    const [formData, setFormData] = useState({
        installation_custom_id: installation.custom_id,
        equipment_id: '',
        employee_custom_id: '',
        serial_number: '',
        login: '',
        password: '',
        quantity: 1,
    });
    const [showPassword, setShowPassword] = useState(false);
    
    const selectedEquipmentModel = useMemo(() => equipmentCatalog.find(e => e.id === formData.equipment_id), [formData.equipment_id, equipmentCatalog]);
    
    const equipmentOptions = useMemo(() => 
        equipmentCatalog.map(e => ({ value: e.id, label: e.name })),
        [equipmentCatalog]
    );

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!formData.equipment_id) {
            showNotification('Будь ласка, виберіть тип обладнання', 'error');
            return;
        }
        onAssign(formData);
    };

    return (
        <Modal closeModal={closeModal} size="lg">
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
                <div className="p-6 md:p-8">
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">Додати обладнання на об'єкт</h3>
                    <p className="text-indigo-600 font-medium">{installation.name} ({installation.clients?.name})</p>
                </div>
                
                <div className="flex-grow overflow-y-auto border-t border-b py-6 px-6 md:px-8 space-y-4">
                    <SearchableSelect
                        label="Модель обладнання"
                        icon={<Fa.FaCog />}
                        options={equipmentOptions}
                        value={formData.equipment_id}
                        onChange={handleChange}
                    />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputField name="serial_number" label="Серійний номер" icon={<Fa.FaTag/>} value={formData.serial_number} onChange={handleChange} />
                        <InputField name="quantity" label="Кількість" type="number" min="1" icon={<Fa.FaHashtag/>} value={formData.quantity} onChange={handleChange} required />
                    </div>

                    {(selectedEquipmentModel?.category === 'inverter' || selectedEquipmentModel?.category === 'logger') && (
                        <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 space-y-4">
                            <p className="font-semibold text-blue-800 text-sm">Облікові дані (опціонально)</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <InputField name="login" label="Логін" icon={<Fa.FaUserCircle/>} value={formData.login} onChange={handleChange} />
                                <InputField name="password" label="Пароль" icon={<Fa.FaKey/>} type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} showPassword={showPassword} onTogglePassword={() => setShowPassword(!showPassword)} />
                            </div>
                        </div>
                    )}

                    <SelectField name="employee_custom_id" label="Відповідальний працівник" icon={<Fa.FaUserTie />} value={formData.employee_custom_id} onChange={handleChange}>
                        <option value="">Не вказано</option>
                        {employees.map(e => <option key={e.custom_id} value={e.custom_id}>{e.name}</option>)}
                    </SelectField>
                </div>
                
                {/* --- ЗМІНА: Додано клас 'mt-auto' для притискання футера донизу --- */}
                <div className="flex justify-end gap-3 p-6 bg-gray-50/50 rounded-b-2xl mt-auto border-t">
                    <button type="button" onClick={closeModal} className="py-2 px-5 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300">Скасувати</button>
                    <button type="submit" className="py-2 px-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg">Додати на об'єкт</button>
                </div>
            </form>
        </Modal>
    );
}

// --- Type (Catalog) Form Modal --- //
function TypeFormModal({ closeModal, onSubmit, initialData, loading }) {
    const [formData, setFormData] = useState(
        initialData || { name: '', category: '', power_kw: '', manufacturer: '', notes: '' }
    );

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Modal closeModal={closeModal} size="lg">
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
                <div className="p-6 md:p-8"><h3 className="text-2xl font-bold text-gray-800">{initialData ? 'Редагувати тип' : 'Новий тип обладнання'}</h3></div>
                <div className="space-y-4 flex-grow overflow-y-auto px-6 md:px-8 py-6 border-t border-b">
                    <InputField name="name" label="Назва моделі" icon={<Fa.FaCog/>} value={formData.name} onChange={handleChange} required />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <SelectField name="category" label="Категорія" icon={<Fa.FaFilter/>} value={formData.category} onChange={handleChange} required>
                            <option value="">Оберіть...</option>
                            <option value="solar_panel">Сонячна панель</option>
                            <option value="battery">Акумулятор</option>
                            <option value="inverter">Інвертор</option>
                            <option value="logger">Логер</option>
                        </SelectField>
                        <InputField name="power_kw" label="Потужність (кВт)" icon={<Fa.FaBolt/>} type="number" step="0.01" min="0" value={formData.power_kw} onChange={handleChange} />
                    </div>
                    <InputField name="manufacturer" label="Виробник" icon={<Fa.FaBuilding/>} value={formData.manufacturer} onChange={handleChange} />
                </div>
                <div className="flex justify-end gap-3 p-6 mt-auto bg-gray-50/50 rounded-b-2xl">
                    <button type="button" onClick={closeModal} className="py-2 px-5 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300">Скасувати</button>
                    <button type="submit" disabled={loading} className="py-2 px-5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold hover:shadow-lg flex items-center gap-2">{loading ? 'Обробка...' : 'Зберегти'}</button>
                </div>
            </form>
        </Modal>
    );
}


// --- View Equipment Details Modal --- //
function EquipmentDetailsModal({ closeModal, item }) {
    const [showPassword, setShowPassword] = useState(false);
    const { equipment, employees } = item;
    const { name: catName } = getCategoryProps(equipment?.category);

    const DetailItem = ({ icon, label, value }) => (
        <div className="flex items-start">
            <div className="flex-shrink-0 w-8 text-center"><span className="text-gray-400">{icon}</span></div>
            <div className="ml-3">
                <p className="text-sm font-semibold text-gray-500">{label}</p>
                <p className="text-gray-800 font-medium break-words">{value || '—'}</p>
            </div>
        </div>
    );

    return (
        <Modal closeModal={closeModal} size="md">
            <div className="p-6 md:p-8 border-b border-gray-200">
                <h3 className="text-2xl font-bold text-gray-800 mb-1">{equipment?.name || 'Інформація про обладнання'}</h3>
                <p className="text-indigo-600 font-medium">{catName}</p>
            </div>
            
            <div className="overflow-y-auto px-6 md:px-8 py-6 space-y-5">
                <DetailItem icon={<Fa.FaTag />} label="Серійний номер" value={item.serial_number} />
                <DetailItem icon={<Fa.FaHashtag />} label="Кількість" value={item.quantity} />
                <DetailItem icon={<Fa.FaBuilding />} label="Виробник" value={equipment?.manufacturer} />
                <DetailItem icon={<Fa.FaBolt />} label="Потужність" value={equipment?.power_kw ? `${equipment.power_kw} кВт` : null} />
                
                { (item.login || item.password) &&
                    <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 space-y-4">
                        <p className="font-semibold text-blue-800 text-sm">Облікові дані</p>
                         <DetailItem icon={<Fa.FaUserCircle />} label="Логін" value={item.login} />
                         <div className="flex items-start">
                            <div className="flex-shrink-0 w-8 text-center"><span className="text-gray-400"><Fa.FaKey/></span></div>
                            <div className="ml-3">
                                <p className="text-sm font-semibold text-gray-500">Пароль</p>
                                <div className="flex items-center gap-3">
                                    <p className="text-gray-800 font-medium break-all">{showPassword ? item.password : '••••••••'}</p>
                                    <button onClick={() => setShowPassword(!showPassword)} className="text-gray-500 hover:text-gray-800">
                                        {showPassword ? <Fa.FaEyeSlash /> : <Fa.FaEye />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                }

                { employees &&
                    <div className="bg-green-50/70 p-4 rounded-xl border border-green-200 space-y-4">
                        <p className="font-semibold text-green-800 text-sm">Відповідальний</p>
                        <DetailItem icon={<Fa.FaUserTie />} label="Працівник" value={employees.name} />
                        <DetailItem icon={<Fa.FaPhone />} label="Телефон" value={employees.phone} />
                    </div>
                }
            </div>
            
            <div className="flex justify-end gap-3 p-6 bg-gray-50/50 rounded-b-2xl border-t border-gray-200 mt-auto">
                <button type="button" onClick={closeModal} className="py-2 px-5 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300">Закрити</button>
            </div>
        </Modal>
    );
}