import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaSearch, FaPlus, FaTrash, FaPlane, FaBed, FaNotesMedical, 
  FaCalendarAlt, FaUser, FaCheck, FaChevronDown, FaChevronUp
} from "react-icons/fa";
import { createClient } from "@supabase/supabase-js";

// --- КОНФІГУРАЦІЯ ---
const supabaseUrl = "https://logxutaepqzmvgsvscle.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE";
const supabase = createClient(supabaseUrl, supabaseKey);

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
        return options.filter(opt => opt.label.toLowerCase().includes(search.toLowerCase()));
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
                    <span className="truncate">
                        {selectedOption ? selectedOption.label : <span className="text-gray-400">{placeholder}</span>}
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
                                        placeholder="Пошук..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div>
                                {filteredOptions.length > 0 ? (
                                    filteredOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => { onChange(opt.value); setIsOpen(false); setSearch(""); }}
                                            className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-0"
                                        >
                                            <div className="font-medium text-gray-800">{opt.label}</div>
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

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function TimeOffManager() {
    const isDesktop = useIsDesktop();
    
    // Стан гармошки (Відкрито/Закрито). На ПК завжди відкрито, на мобільному - закрито за замовчуванням.
    const [isFormOpen, setIsFormOpen] = useState(false);

    // Слідкуємо за зміною розміру екрану
    useEffect(() => {
        if (isDesktop) setIsFormOpen(true);
        else setIsFormOpen(false);
    }, [isDesktop]);

    const [employees, setEmployees] = useState([]);
    const [upcomingRecords, setUpcomingRecords] = useState([]); 
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Форма
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
        const twoWeeksLater = new Date();
        twoWeeksLater.setDate(today.getDate() + 14);

        const todayStr = formatDateToYYYYMMDD(today);
        const endStr = formatDateToYYYYMMDD(twoWeeksLater);

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

    const groupedRecords = useMemo(() => {
        const groups = {};
        upcomingRecords.forEach(rec => {
            if (!groups[rec.work_date]) groups[rec.work_date] = [];
            groups[rec.work_date].push(rec);
        });
        return groups;
    }, [upcomingRecords]);

    const handleAddRecord = async () => {
        if (!formData.employeeId) {
            alert("Оберіть працівника");
            return;
        }
        setIsSaving(true);

        const start = new Date(formData.startDate);
        const end = new Date(formData.endDate);
        
        if (end < start) {
            alert("Дата завершення не може бути раніше дати початку");
            setIsSaving(false);
            return;
        }

        const records = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            records.push({
                work_date: formatDateToYYYYMMDD(d),
                employee_custom_id: formData.employeeId,
                status: formData.type,
                notes: formData.notes
            });
        }

        try {
            const { error } = await supabase.from('attendance').upsert(records, { onConflict: 'employee_custom_id, work_date' });
            if (error) throw error;
            
            await loadData();
            setFormData(prev => ({ ...prev, employeeId: null, notes: '' }));
            
            // На мобільному закриваємо форму після успішного додавання
            if (!isDesktop) setIsFormOpen(false);
            
        } catch (e) {
            alert("Помилка: " + e.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Видалити запис?")) return;
        try {
            await supabase.from('attendance').delete().eq('id', id);
            await loadData();
        } catch (e) {
            alert("Помилка видалення");
        }
    };

    const employeeOptions = useMemo(() => employees.map(e => ({ value: e.custom_id, label: e.name })), [employees]);

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row h-screen overflow-hidden">
            
            {/* --- ЛІВА ПАНЕЛЬ (ГАРМОШКА НА МОБІЛЬНОМУ) --- */}
            <div className="bg-white border-b md:border-b-0 md:border-r border-gray-200 md:w-[400px] flex-shrink-0 z-20 shadow-md md:h-full transition-all">
                {/* Заголовок-кнопка для гармошки */}
                <div 
                    onClick={() => !isDesktop && setIsFormOpen(!isFormOpen)}
                    className="p-6 flex justify-between items-center cursor-pointer md:cursor-default"
                >
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <FaPlus className="text-indigo-600"/> Новий запис
                    </h2>
                    {/* Стрілочка тільки на мобільному */}
                    {!isDesktop && (
                        <div className="text-gray-400">
                            {isFormOpen ? <FaChevronUp/> : <FaChevronDown/>}
                        </div>
                    )}
                </div>

                {/* Вміст форми (Анімований) */}
                <AnimatePresence>
                    {isFormOpen && (
                        <motion.div
                            initial={isDesktop ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3, ease: "easeInOut" }}
                            className="overflow-hidden"
                        >
                            <div className="px-6 pb-6 space-y-4">
                                {/* 1. Працівник */}
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Працівник</label>
                                    <SearchableSelect 
                                        options={employeeOptions}
                                        value={formData.employeeId}
                                        onChange={(val) => setFormData({...formData, employeeId: val})}
                                        placeholder="Оберіть зі списку..."
                                        icon={FaUser}
                                    />
                                </div>

                                {/* 2. Тип */}
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

                                {/* 3. Дати */}
                                <div className="grid grid-cols-2 gap-3">
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

                                {/* 4. Нотатки */}
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
            <div className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-8">
                <div className="max-w-2xl mx-auto">
                    <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <FaCalendarAlt className="text-indigo-500"/> Графік відсутності
                        <span className="text-sm font-normal text-gray-400 ml-2 bg-white px-2 py-1 rounded-lg border">Найближчі 2 тижні</span>
                    </h2>

                    {loading ? (
                        <div className="space-y-4">
                            {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-2xl animate-pulse"/>)}
                        </div>
                    ) : upcomingRecords.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
                            <FaBed className="text-gray-300 text-5xl mx-auto mb-4"/>
                            <p className="text-gray-500 font-medium">Всі в строю!</p>
                            <p className="text-sm text-gray-400">На найближчий час запланованих відсутностей немає.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.keys(groupedRecords).map(dateStr => {
                                const records = groupedRecords[dateStr];
                                const label = getRelativeDateLabel(dateStr);
                                const isToday = label === "Сьогодні";

                                return (
                                    <div key={dateStr} className="relative">
                                        {/* Дата Заголовок */}
                                        <div className={`sticky top-0 z-10 py-2 mb-2 flex items-center gap-3 ${isToday ? 'text-indigo-600' : 'text-gray-500'}`}>
                                            <div className={`font-bold text-lg ${isToday ? 'bg-indigo-50 px-3 py-1 rounded-lg' : 'bg-slate-100/80 backdrop-blur px-3 py-1 rounded-lg'}`}>
                                                {label}
                                            </div>
                                            <div className="h-px bg-gray-200 flex-1"/>
                                            <div className="text-xs font-mono opacity-50">{dateStr}</div>
                                        </div>

                                        {/* Картки */}
                                        <div className="grid grid-cols-1 gap-3 pl-2 border-l-2 border-gray-100 ml-4">
                                            {records.map(rec => {
                                                const emp = employees.find(e => e.custom_id === rec.employee_custom_id);
                                                
                                                let config = { icon: FaBed, text: 'Вихідний', bg: 'bg-red-50', border: 'border-red-100', textCol: 'text-red-700' };
                                                if (rec.status === 'VACATION') config = { icon: FaPlane, text: 'Відпустка', bg: 'bg-blue-50', border: 'border-blue-100', textCol: 'text-blue-700' };
                                                if (rec.status === 'SICK_LEAVE') config = { icon: FaNotesMedical, text: 'Лікарняний', bg: 'bg-orange-50', border: 'border-orange-100', textCol: 'text-orange-700' };

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
                                                        
                                                        <button 
                                                            onClick={() => handleDelete(rec.id)}
                                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <FaTrash/>
                                                        </button>
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