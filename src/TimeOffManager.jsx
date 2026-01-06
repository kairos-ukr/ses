import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaSearch, FaPlus, FaTrash, FaPlane, FaBed, FaNotesMedical, 
  FaCalendarAlt, FaUser, FaCheck, FaChevronDown, FaChevronUp,
  FaTimes, FaExclamationTriangle, FaListUl, FaArrowsAltH, FaKeyboard, FaLock
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider"; // Підключення контексту

// --- HELPER FUNCTIONS ---

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
    return adjustedDate.toISOString().split("T")[0];
};

const getRelativeDateLabel = (dateStr) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const target = new Date(dateStr);
    
    const todayStr = formatDateToYYYYMMDD(today);
    const tomorrowStr = formatDateToYYYYMMDD(tomorrow);

    if (dateStr === todayStr) return "Сьогодні";
    if (dateStr === tomorrowStr) return "Завтра";
    
    return target.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
};

const useIsDesktop = () => {
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return isDesktop;
};

// --- КОМПОНЕНТИ ---

const SearchableSelect = ({ options, value, onChange, placeholder, icon: Icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");

    const filteredOptions = useMemo(() => {
        if (search.trim() === "") return []; 
        
        const s = search.toLowerCase();
        return options.filter(opt => 
            opt.label.toLowerCase().includes(s) || 
            String(opt.value).includes(s)
        );
    }, [options, search]);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between bg-white border border-gray-300 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50 transition-all"
            >
                <span className="flex items-center gap-2 truncate">
                    {Icon && <Icon className="text-indigo-500"/>}
                    <span className="truncate flex items-center gap-2">
                        {selectedOption ? (
                            <>
                                <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs font-mono">{selectedOption.value}</span>
                                {selectedOption.label}
                            </>
                        ) : (
                            <span className="text-gray-400">{placeholder}</span>
                        )}
                    </span>
                </span>
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}/>
                        <motion.div 
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 5 }}
                            className="absolute z-50 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
                        >
                            <div className="p-2 border-b border-gray-100 sticky top-0 bg-white z-10">
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-xs"/>
                                    <input 
                                        autoFocus
                                        type="text" 
                                        className="w-full pl-8 pr-3 py-2 bg-gray-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-100 transition-all"
                                        placeholder="Введіть ім'я або ID..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                {search === "" ? (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        <FaKeyboard className="mx-auto mb-2 text-2xl opacity-20"/>
                                        Почніть вводити ім'я або ID...
                                    </div>
                                ) : filteredOptions.length > 0 ? (
                                    filteredOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(""); }}
                                            className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0"
                                        >
                                            <div className="font-medium text-gray-800 flex items-center gap-3">
                                                <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded text-xs font-mono w-8 text-center">
                                                    {opt.value}
                                                </span>
                                                {opt.label}
                                            </div>
                                        </button>
                                    ))
                                ) : (
                                    <div className="p-4 text-center text-xs text-gray-400">Нічого не знайдено</div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

// --- MODAL DELETE COMPONENT ---
const DeleteConfirmModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;
    return (
        <AnimatePresence>
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                onClick={onClose}
            >
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
                >
                    <div className="p-6 text-center">
                        <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                            <FaExclamationTriangle />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800 mb-2">Видалити запис?</h3>
                        <p className="text-gray-500 text-sm">Цю дію неможливо скасувати. Ви впевнені, що хочете продовжити?</p>
                    </div>
                    <div className="flex border-t border-gray-100">
                        <button 
                            onClick={onClose}
                            className="flex-1 py-4 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            Скасувати
                        </button>
                        <div className="w-px bg-gray-100"></div>
                        <button 
                            onClick={onConfirm}
                            className="flex-1 py-4 text-sm font-bold text-red-600 hover:bg-red-50 transition-colors"
                        >
                            Так, видалити
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function TimeOffManager() {
    // 1. ОТРИМУЄМО ДАНІ ПРО КОРИСТУВАЧА
    const { role, employee } = useAuth();
    
    // Визначаємо права
    const isInstaller = role === 'installer';
    const isAdminOrOffice = role === 'admin' || role === 'super_admin' || role === 'office';
    const myCustomId = employee?.custom_id;

    const isDesktop = useIsDesktop();
    const [isFormOpen, setIsFormOpen] = useState(false);

    useEffect(() => {
        if (isDesktop) setIsFormOpen(true);
        else setIsFormOpen(false);
    }, [isDesktop]);

    const [employees, setEmployees] = useState([]);
    const [upcomingRecords, setUpcomingRecords] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [deleteModal, setDeleteModal] = useState({ show: false, id: null });

    // Стан форми
    const [mode, setMode] = useState('RANGE'); 
    const [manualDates, setManualDates] = useState([]);
    const [singleDateInput, setSingleDateInput] = useState(formatDateToYYYYMMDD(new Date())); 

    const [formData, setFormData] = useState({
        employeeId: null,
        type: 'OFF',
        startDate: formatDateToYYYYMMDD(new Date()),
        endDate: formatDateToYYYYMMDD(new Date()),
        notes: ''
    });

    const loadData = async () => {
        setLoading(true);
        const today = new Date();
        const limitDate = new Date();
        limitDate.setDate(today.getDate() + 10); // 10 днів

        const todayStr = formatDateToYYYYMMDD(today);
        const endStr = formatDateToYYYYMMDD(limitDate);

        try {
            const { data: empData } = await supabase.from('employees').select('custom_id, name').order('name');
            setEmployees(empData || []);

            const { data: attData } = await supabase
                .from('attendance')
                .select('*')
                .gte('work_date', todayStr) 
                .lte('work_date', endStr)   
                .order('work_date', { ascending: true });

            setUpcomingRecords(attData || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // 2. АВТОМАТИЧНИЙ ВИБІР ДЛЯ МОНТАЖНИКА
    useEffect(() => {
        if (isInstaller && myCustomId) {
            setFormData(prev => ({ ...prev, employeeId: myCustomId }));
        }
    }, [isInstaller, myCustomId]);

    const groupedRecords = useMemo(() => {
        const groups = {};
        upcomingRecords.forEach(rec => {
            if (!groups[rec.work_date]) groups[rec.work_date] = [];
            groups[rec.work_date].push(rec);
        });
        return groups;
    }, [upcomingRecords]);

    const addManualDate = () => {
        if (!singleDateInput) return;
        if (!manualDates.includes(singleDateInput)) {
            setManualDates([...manualDates, singleDateInput].sort());
        }
    };

    const removeManualDate = (dateToRemove) => {
        setManualDates(manualDates.filter(d => d !== dateToRemove));
    };

    const handleAddRecord = async () => {
        if (!formData.employeeId) {
            alert("Оберіть працівника");
            return;
        }
        
        let finalDates = [];

        if (mode === 'RANGE') {
            const start = new Date(formData.startDate);
            const end = new Date(formData.endDate);
            if (end < start) {
                alert("Дата завершення не може бути раніше дати початку");
                return;
            }
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                finalDates.push(formatDateToYYYYMMDD(d));
            }
        } else {
            if (manualDates.length === 0) {
                alert("Додайте хоча б одну дату");
                return;
            }
            finalDates = [...manualDates];
        }

        setIsSaving(true);
        const records = finalDates.map(dateStr => ({
            work_date: dateStr,
            employee_custom_id: formData.employeeId,
            status: formData.type,
            notes: formData.notes
        }));

        try {
            const { error } = await supabase.from('attendance').upsert(records, { onConflict: 'employee_custom_id, work_date' });
            if (error) throw error;
            
            await loadData();
            // Якщо монтажник - не скидаємо ID, інакше скидаємо
            setFormData(prev => ({ ...prev, employeeId: isInstaller ? myCustomId : null, notes: '' }));
            setManualDates([]); 
            
            if (!isDesktop) setIsFormOpen(false);
            
        } catch (e) {
            alert("Помилка: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteModal.id) return;
        try {
            await supabase.from('attendance').delete().eq('id', deleteModal.id);
            await loadData();
        } catch (e) {
            alert("Помилка видалення");
        } finally {
            setDeleteModal({ show: false, id: null });
        }
    };

    const requestDelete = (id) => {
        setDeleteModal({ show: true, id });
    };

    const handleListInteraction = () => {
        if (!isDesktop && isFormOpen) {
            setIsFormOpen(false);
        }
    };

    const employeeOptions = useMemo(() => employees.map(e => ({ value: e.custom_id, label: e.name })), [employees]);

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row h-screen overflow-hidden">
            
            <DeleteConfirmModal 
                isOpen={deleteModal.show} 
                onClose={() => setDeleteModal({ show: false, id: null })} 
                onConfirm={confirmDelete}
            />

            {/* --- ЛІВА ПАНЕЛЬ (ГАРМОШКА) --- */}
            <div className="bg-white border-b md:border-b-0 md:border-r border-gray-200 md:w-[400px] flex-shrink-0 z-20 shadow-md md:h-full transition-all overflow-y-auto custom-scrollbar relative">
                <div 
                    onClick={() => !isDesktop && setIsFormOpen(!isFormOpen)}
                    className="p-6 flex justify-between items-center cursor-pointer md:cursor-default sticky top-0 bg-white z-10 border-b border-gray-50"
                >
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <FaPlus className="text-indigo-600"/> Новий запис
                    </h2>
                    {!isDesktop && (
                        <div className="text-gray-400">
                            {isFormOpen ? <FaChevronUp/> : <FaChevronDown/>}
                        </div>
                    )}
                </div>

                <AnimatePresence>
                    {isFormOpen && (
                        <motion.div
                            initial={isDesktop ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="px-6 pb-6 space-y-5 pt-2">
                                
                                {/* 3. ВИБІР ПРАЦІВНИКА (РІЗНИЙ ДЛЯ РОЛЕЙ) */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Працівник</label>
                                    
                                    {isInstaller ? (
                                        // Блокований вигляд для монтажника (автовибір)
                                        <div className="w-full flex items-center justify-between bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-sm font-medium text-gray-500 cursor-not-allowed">
                                            <span className="flex items-center gap-2 truncate">
                                                <FaUser className="text-gray-400"/>
                                                <span className="truncate flex items-center gap-2">
                                                    {myCustomId ? (
                                                        <>
                                                            <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs font-mono">{myCustomId}</span>
                                                            {employees.find(e => e.custom_id === myCustomId)?.name || 'Я'}
                                                        </>
                                                    ) : 'Завантаження...'}
                                                </span>
                                            </span>
                                            <FaLock className="text-gray-400 text-xs"/>
                                        </div>
                                    ) : (
                                        // Пошуковий селект для Адміна/Офісу
                                        <SearchableSelect 
                                            options={employeeOptions}
                                            value={formData.employeeId}
                                            onChange={(val) => setFormData({...formData, employeeId: val})}
                                            placeholder="Оберіть зі списку..."
                                            icon={FaUser}
                                        />
                                    )}
                                </div>

                                {/* Тип */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Причина</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { id: 'OFF', label: 'Вихідний', icon: FaBed, color: 'red' },
                                            { id: 'VACATION', label: 'Відпустка', icon: FaPlane, color: 'blue' },
                                            { id: 'SICK_LEAVE', label: 'Лікарняний', icon: FaNotesMedical, color: 'orange' }
                                        ].map(type => (
                                            <button
                                                key={type.id}
                                                onClick={() => setFormData({...formData, type: type.id})}
                                                className={`
                                                    flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all
                                                    ${formData.type === type.id 
                                                        ? `bg-${type.color}-50 border-${type.color}-500 text-${type.color}-700` 
                                                        : 'bg-white border-gray-100 text-gray-400 hover:border-gray-300'}
                                                `}
                                            >
                                                <type.icon size={18} className="mb-1"/>
                                                <span className="text-[10px] font-bold uppercase">{type.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Режим дат */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Режим вибору дат</label>
                                    <div className="bg-gray-100 p-1 rounded-xl flex text-sm font-medium">
                                        <button 
                                            onClick={() => setMode('RANGE')}
                                            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'RANGE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}
                                        >
                                            <FaArrowsAltH/> Період
                                        </button>
                                        <button 
                                            onClick={() => setMode('DATES')}
                                            className={`flex-1 py-2 rounded-lg flex items-center justify-center gap-2 transition-all ${mode === 'DATES' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}
                                        >
                                            <FaListUl/> Окремі дати
                                        </button>
                                    </div>
                                </div>

                                {/* Дати */}
                                {mode === 'RANGE' ? (
                                    <div className="grid grid-cols-2 gap-3 animate-fadeIn">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">З дати</label>
                                            <input 
                                                type="date" 
                                                value={formData.startDate}
                                                onChange={(e) => setFormData({...formData, startDate: e.target.value, endDate: e.target.value > formData.endDate ? e.target.value : formData.endDate})}
                                                className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">По дату</label>
                                            <input 
                                                type="date" 
                                                value={formData.endDate}
                                                min={formData.startDate}
                                                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                                                className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 animate-fadeIn">
                                        <div>
                                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Додати дату до списку</label>
                                            <div className="flex gap-2">
                                                <input 
                                                    type="date" 
                                                    value={singleDateInput}
                                                    onChange={(e) => setSingleDateInput(e.target.value)}
                                                    className="flex-1 p-3 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                                                />
                                                <button 
                                                    onClick={addManualDate}
                                                    className="w-12 bg-gray-800 text-white rounded-xl flex items-center justify-center hover:bg-black transition-colors"
                                                >
                                                    <FaPlus/>
                                                </button>
                                            </div>
                                        </div>
                                        {manualDates.length > 0 && (
                                            <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                                                <div className="text-xs font-bold text-gray-400 mb-2 uppercase flex justify-between">
                                                    <span>Вибрані дати ({manualDates.length})</span>
                                                    <button onClick={() => setManualDates([])} className="text-red-400 hover:text-red-600">Очистити</button>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {manualDates.map(d => (
                                                        <div key={d} className="bg-white border border-gray-300 px-3 py-1.5 rounded-lg text-sm font-mono flex items-center gap-2 shadow-sm">
                                                            {d}
                                                            <button onClick={() => removeManualDate(d)} className="text-red-400 hover:text-red-600"><FaTimes size={10}/></button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Нотатки */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Коментар</label>
                                    <input 
                                        type="text" 
                                        value={formData.notes}
                                        onChange={(e) => setFormData({...formData, notes: e.target.value})}
                                        placeholder="Наприклад: Сімейні обставини"
                                        className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                </div>

                                <button 
                                    onClick={handleAddRecord}
                                    disabled={isSaving}
                                    className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    {isSaving ? "Обробка..." : <><FaCheck/> Зберегти</>}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* --- ПРАВА ПАНЕЛЬ: СПИСОК (Timeline) --- */}
            <div 
                className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-8"
                onScroll={handleListInteraction}
                onClick={handleListInteraction}
            >
                <div className="max-w-2xl mx-auto">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <FaCalendarAlt className="text-indigo-500"/> Графік відсутності
                        <span className="text-sm font-normal text-gray-400 ml-2 bg-white px-2 py-1 rounded-lg border">Найближчі 10 днів</span>
                    </h2>

                    {loading ? (
                        <div className="space-y-4">
                            {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse"/>)}
                        </div>
                    ) : upcomingRecords.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                            <FaBed className="text-gray-300 text-5xl mx-auto mb-4"/>
                            <p className="text-gray-500 font-medium">Всі в строю!</p>
                            <p className="text-sm text-gray-400">На найближчі 10 днів запланованих відсутностей немає.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.keys(groupedRecords).map(dateStr => {
                                const records = groupedRecords[dateStr];
                                const label = getRelativeDateLabel(dateStr);
                                const isToday = label === "Сьогодні";

                                return (
                                    <div key={dateStr} className="relative">
                                        <div className={`sticky top-0 z-10 py-2 mb-2 flex items-center gap-3 ${isToday ? 'text-indigo-600' : 'text-gray-500'}`}>
                                            <div className={`font-bold text-lg ${isToday ? 'bg-indigo-50 px-3 py-1 rounded-lg' : 'bg-slate-100/80 backdrop-blur px-3 py-1 rounded-lg'}`}>
                                                {label}
                                            </div>
                                            <div className="h-px bg-gray-200 flex-1"/>
                                            <div className="text-xs font-mono opacity-50">{dateStr}</div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-3 pl-2 border-l-2 border-gray-100 ml-4">
                                            {records.map(rec => {
                                                const emp = employees.find(e => e.custom_id === rec.employee_custom_id);
                                                
                                                let config = { icon: FaBed, text: 'Вихідний', bg: 'bg-red-50', border: 'border-red-100', textCol: 'text-red-700' };
                                                if (rec.status === 'VACATION') config = { icon: FaPlane, text: 'Відпустка', bg: 'bg-blue-50', border: 'border-blue-100', textCol: 'text-blue-700' };
                                                if (rec.status === 'SICK_LEAVE') config = { icon: FaNotesMedical, text: 'Лікарняний', bg: 'bg-orange-50', border: 'border-orange-100', textCol: 'text-orange-700' };

                                                // 4. ПРАВА НА ВИДАЛЕННЯ
                                                // Admin/Office - всі. Installer - тільки своє.
                                                const canDelete = isAdminOrOffice || (isInstaller && rec.employee_custom_id === myCustomId);

                                                return (
                                                    <motion.div 
                                                        key={rec.id}
                                                        layout
                                                        initial={{ opacity: 0, x: -10 }}
                                                        animate={{ opacity: 1, x: 0 }}
                                                        className={`bg-white p-4 rounded-xl border ${config.border} shadow-sm flex justify-between items-center group`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${config.bg} ${config.textCol}`}>
                                                                <config.icon/>
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-gray-800 text-sm md:text-base">{emp?.name || 'Невідомий'}</h4>
                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${config.bg} ${config.textCol}`}>
                                                                        {config.text}
                                                                    </span>
                                                                    {rec.notes && <span className="text-xs text-gray-400 italic truncate max-w-[150px]">{rec.notes}</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {canDelete && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); requestDelete(rec.id); }}
                                                                // 5. ВИДАЛЕННЯ: Іконка постійно видима (без opacity-0)
                                                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Видалити запис"
                                                            >
                                                                <FaTrash/>
                                                            </button>
                                                        )}
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}