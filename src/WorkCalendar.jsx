import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCalendarAlt, FaSearch, FaPlus, FaTrash, FaUserPlus, 
  FaMapMarkerAlt, FaCheck, FaTimes, FaSave, FaBriefcase, 
  FaExclamationTriangle, FaArrowLeft, FaArrowRight, FaPen, FaTasks, FaUser,
  FaBed, FaChevronLeft, FaEye, FaPencilAlt, FaRegCalendarAlt
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
// --- HELPER FUNCTIONS ---

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
    return adjustedDate.toISOString().split("T")[0];
};

const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
};

const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
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

const SearchableSelect = ({ options, value, onChange, placeholder, icon: Icon, disabledItems = [], error }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");

    const filteredOptions = useMemo(() => {
        const searchLower = search.toLowerCase();
        return options.filter(opt => 
            !disabledItems.includes(opt.value) && (
                opt.label.toLowerCase().includes(searchLower) || 
                (opt.subLabel && opt.subLabel.toLowerCase().includes(searchLower))
            )
        );
    }, [options, search, disabledItems]);

    const selectedOption = options.find(o => o.value === value);

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between bg-white border rounded-xl px-4 py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50 transition-all ${error ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 hover:border-gray-400'}`}
            >
                <span className="flex items-center gap-2 truncate">
                    {Icon && <Icon className={`flex-shrink-0 ${error ? 'text-red-500' : 'text-indigo-500'}`}/>}
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
                            transition={{ duration: 0.15 }}
                            // FIX: Z-Index підвищено до 100
                            className="absolute z-[100] w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto"
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
            {error && <p className="text-red-500 text-xs mt-1 ml-1">{error}</p>}
        </div>
    );
};

const AbsentEmployeesList = ({ employees }) => {
    if (!employees || employees.length === 0) return null;
    return (
        <div className="mt-6 pt-4 border-t border-gray-200">
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FaBed/> Вихідні сьогодні ({employees.length})
            </h4>
            <div className="space-y-2">
                {employees.map(emp => (
                    <div key={emp.id} className="flex justify-between items-center text-sm p-2 bg-red-50 rounded-lg text-red-700 border border-red-100">
                        <span>{emp.name}</span>
                        <span className="text-xs font-bold px-2 py-0.5 bg-white rounded-md border border-red-200">
                            {emp.status === 'OFF' ? 'Вихідний' : emp.status === 'VACATION' ? 'Відпустка' : 'Лікарняний'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const SchedulePreview = ({ schedule, employees, installations, isPreviewMode, onEdit, onSave, onCancel, isSaving, absentEmployees }) => {
    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="p-4 border-b flex items-center justify-between bg-white rounded-t-2xl shadow-sm z-20">
                <h3 className="font-bold text-lg text-gray-800">
                    {isPreviewMode ? "Попередній перегляд" : "План робіт"}
                </h3>
                <button onClick={onCancel} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-800"><FaTimes/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {schedule.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                        <FaCalendarAlt className="mx-auto text-4xl mb-3 opacity-20"/>
                        <p>Немає запланованих робіт</p>
                    </div>
                ) : (
                    schedule.map((item) => {
                        const isCustom = item.installationId === 'custom';
                        const instName = isCustom 
                            ? (item.notes || "Кастомне завдання") 
                            : (item.installationId 
                                ? (installations.find(i => i.custom_id?.toString() === item.installationId?.toString())?.name || `Об'єкт #${item.installationId}`)
                                : "Не обрано");
                        
                        const displayId = !isCustom && item.installationId ? `#${item.installationId}` : "";

                        return (
                            <div key={item.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                                <div className="flex items-start gap-3 mb-3 border-b border-gray-100 pb-3">
                                    <div className={`p-2 rounded-lg ${isCustom ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                                        {isCustom ? <FaTasks/> : <FaBriefcase/>}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-gray-800 text-sm">
                                            {instName} <span className="text-gray-400 font-normal ml-1">{displayId}</span>
                                        </h4>
                                        {isCustom && <span className="text-xs text-amber-500 font-medium">Ручне завдання</span>}
                                    </div>
                                </div>
                                
                                {item.notes && !isCustom && (
                                    <div className="mb-3 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg italic">
                                        "{item.notes}"
                                    </div>
                                )}

                                <div className="space-y-2">
                                    {item.workers.length === 0 && <p className="text-xs text-red-400 italic">Працівників не призначено</p>}
                                    {item.workers.map(wId => {
                                        const emp = employees.find(e => e.custom_id === wId);
                                        return (
                                            <div key={wId} className="flex items-center gap-3 text-sm">
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                                    {emp?.name?.charAt(0)}
                                                </div>
                                                <span className="text-gray-700 font-medium">{emp?.name}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}
                <AbsentEmployeesList employees={absentEmployees} />
            </div>

            <div className="p-4 border-t bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] space-y-3">
                {isPreviewMode ? (
                    <>
                        <button 
                            onClick={onSave} 
                            disabled={isSaving}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            {isSaving ? "Збереження..." : <><FaSave/> Зберегти зміни</>}
                        </button>
                        <button onClick={onEdit} className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">
                            Повернутись до редагування
                        </button>
                    </>
                ) : (
                    <button 
                        onClick={onEdit} 
                        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <FaPencilAlt/> Редагувати план
                    </button>
                )}
            </div>
        </div>
    );
};

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function WorkCalendar() {
    const isDesktop = useIsDesktop();
    const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));
    const [assignmentsByDate, setAssignmentsByDate] = useState({});
    
    // States for Modal
    const [editingDate, setEditingDate] = useState(null); 
    const [dayAssignments, setDayAssignments] = useState([]);
    const [modalMode, setModalMode] = useState('view');
    const [validationErrors, setValidationErrors] = useState({});
    
    const [installations, setInstallations] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [timeOffMap, setTimeOffMap] = useState({}); 
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // 1. СТВОРЮЄМО REF ДЛЯ СЬОГОДНІШНЬОГО ДНЯ
    const todayRef = useRef(null);

    // Реф для інпуту дати
    const dateInputRef = useRef(null);

    // Клік по хедеру для відкриття календаря
    const triggerDatePicker = () => {
        try {
            if (dateInputRef.current) {
                if (dateInputRef.current.showPicker) {
                    dateInputRef.current.showPicker();
                } else {
                    dateInputRef.current.focus();
                    dateInputRef.current.click();
                }
            }
        } catch (e) {
            console.error("Error opening date picker:", e);
        }
    };

    const handleJumpToDate = (e) => {
        const date = new Date(e.target.value);
        if (!isNaN(date)) {
            setCurrentWeekStart(getStartOfWeek(date));
        }
    };

    const loadWeekData = useCallback(async () => {
        setLoading(true);
        const startDateStr = formatDateToYYYYMMDD(currentWeekStart);
        const endDateStr = formatDateToYYYYMMDD(addDays(currentWeekStart, 6));

        try {
            const { data: instData } = await supabase
                .from('installations')
                .select('custom_id, name, status')
                .neq('status', 'completed')
                .neq('status', 'cancelled')
                .order('created_at', { ascending: false });

            const { data: empData } = await supabase
                .from('employees')
                .select('custom_id, name, department, position')
                .order('name');

            const { data: attendanceData } = await supabase
                .from('attendance')
                .select('employee_custom_id, work_date, status')
                .gte('work_date', startDateStr)
                .lte('work_date', endDateStr)
                .in('status', ['OFF', 'VACATION', 'SICK_LEAVE']);

            const { data: workData } = await supabase
                .from('installation_workers')
                .select('installation_custom_id, employee_custom_id, work_date, notes')
                .gte('work_date', startDateStr)
                .lte('work_date', endDateStr);

            setInstallations(instData || []);
            setEmployees(empData || []);

            const offMap = {};
            attendanceData?.forEach(item => {
                if (!offMap[item.work_date]) offMap[item.work_date] = {};
                offMap[item.work_date][item.employee_custom_id] = item.status;
            });
            setTimeOffMap(offMap);

            const scheduleMap = {};
            if (workData) {
                workData.forEach(item => {
                    const date = item.work_date;
                    if (!scheduleMap[date]) scheduleMap[date] = [];
                    
                    const instId = item.installation_custom_id || 'custom_' + item.notes;
                    let existingGroup = scheduleMap[date].find(g => g._groupKey === instId);
                    
                    if (!existingGroup) {
                        existingGroup = {
                            id: Date.now() + Math.random(),
                            _groupKey: instId,
                            installationId: item.installation_custom_id || 'custom',
                            notes: item.notes,
                            workers: []
                        };
                        scheduleMap[date].push(existingGroup);
                    }
                    if (item.employee_custom_id) {
                        existingGroup.workers.push(item.employee_custom_id);
                    }
                });
            }
            setAssignmentsByDate(scheduleMap);

        } catch (error) {
            console.error("Помилка:", error);
        } finally {
            setLoading(false);
        }
    }, [currentWeekStart]);

    useEffect(() => {
        loadWeekData();
    }, [loadWeekData]);

    // FIX: АВТОМАТИЧНИЙ СКРОЛ ДО "СЬОГОДНІ" - залежить від loading
    useEffect(() => {
        if (!loading && todayRef.current) {
            todayRef.current.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center', 
                inline: 'center' 
            });
        }
    }, [loading, currentWeekStart]);

    const openDayEditor = (date) => {
        const dateStr = formatDateToYYYYMMDD(date);
        const existingData = assignmentsByDate[dateStr] ? JSON.parse(JSON.stringify(assignmentsByDate[dateStr])) : [];
        setDayAssignments(existingData);
        setEditingDate(date);
        setValidationErrors({});
        
        if (existingData.length === 0) {
            setDayAssignments([{ id: Date.now(), installationId: null, workers: [], notes: "" }]);
            setModalMode('edit');
        } else {
            setModalMode('view');
        }
    };

    const closeDayEditor = () => {
        setEditingDate(null);
        setDayAssignments([]);
        setModalMode('view');
        setValidationErrors({});
    };

    const getAbsentEmployees = () => {
        if (!editingDate) return [];
        const dateStr = formatDateToYYYYMMDD(editingDate);
        const dayOffs = timeOffMap[dateStr] || {};
        return employees
            .filter(emp => dayOffs.hasOwnProperty(emp.custom_id))
            .map(emp => ({ ...emp, status: dayOffs[emp.custom_id] }));
    };

    const getAvailableEmployees = (currentAssignmentIndex) => {
        const assignedElsewhere = new Set();
        const assignedInCurrent = new Set();

        dayAssignments.forEach((assign, idx) => {
            if (idx !== currentAssignmentIndex) {
                assign.workers.forEach(wId => assignedElsewhere.add(wId));
            } else {
                assign.workers.forEach(wId => assignedInCurrent.add(wId));
            }
        });

        const dateStr = formatDateToYYYYMMDD(editingDate);
        const dayOffs = timeOffMap[dateStr] || {};

        return employees.filter(emp => {
            const deps = emp.department || [];
            const pos = (emp.position || "").toLowerCase();
            if (deps.includes('Проектування') || pos.includes('проектант')) return false;
            if (deps.includes('Офіс') && !deps.some(d => ['Монтаж', 'Водій'].includes(d))) return false;
            if (dayOffs.hasOwnProperty(emp.custom_id)) return false;
            if (assignedElsewhere.has(emp.custom_id)) return false;
            if (assignedInCurrent.has(emp.custom_id)) return false; 
            return true;
        }).map(emp => ({
            value: emp.custom_id,
            label: emp.name,
            subLabel: `${emp.position || ''} #${emp.custom_id}`
        }));
    };

    const addCard = () => setDayAssignments([...dayAssignments, { id: Date.now(), installationId: null, workers: [], notes: "" }]);
    
    const removeCard = (idx) => {
        const newAssignments = dayAssignments.filter((_, i) => i !== idx);
        setDayAssignments(newAssignments);
        setValidationErrors({});
    };

    const updateCard = (idx, field, val) => {
        const newData = [...dayAssignments];
        newData[idx][field] = val;
        if (field === 'installationId' && val === 'custom') newData[idx].notes = "";
        setDayAssignments(newData);
        if (validationErrors[idx] && validationErrors[idx][field]) {
            setValidationErrors(prev => ({ ...prev, [idx]: { ...prev[idx], [field]: null } }));
        }
    };

    const addWorker = (idx, wId) => {
        const newData = [...dayAssignments];
        if (!newData[idx].workers.includes(wId)) newData[idx].workers.push(wId);
        setDayAssignments(newData);
        if (validationErrors[idx]?.workers) {
             setValidationErrors(prev => ({ ...prev, [idx]: { ...prev[idx], workers: null } }));
        }
    };

    const removeWorker = (idx, wId) => {
        const newData = [...dayAssignments];
        newData[idx].workers = newData[idx].workers.filter(id => id !== wId);
        setDayAssignments(newData);
    };

    const handleSwitchToPreview = () => {
        const errors = {};
        let hasError = false;

        dayAssignments.forEach((assign, idx) => {
            if (!assign.installationId) {
                if (!errors[idx]) errors[idx] = {};
                errors[idx].installationId = "Оберіть об'єкт або завдання";
                hasError = true;
            }
            if (assign.installationId === 'custom' && !assign.notes.trim()) {
                if (!errors[idx]) errors[idx] = {};
                errors[idx].notes = "Введіть назву завдання";
                hasError = true;
            }
            if (assign.installationId && assign.workers.length === 0) {
                if (!errors[idx]) errors[idx] = {};
                errors[idx].workers = "Додайте працівників";
                hasError = true;
            }
        });

        if (hasError) {
            setValidationErrors(errors);
            return;
        }
        setModalMode('preview');
    };

    const handleSaveDay = async () => {
        setSaving(true);
        const dateStr = formatDateToYYYYMMDD(editingDate);
        const records = [];

        for (const assign of dayAssignments) {
            if (!assign.installationId) continue;
            if (assign.installationId === 'custom' && !assign.notes.trim()) continue;
            
            if (assign.workers.length > 0) {
                assign.workers.forEach(wId => {
                    records.push({
                        work_date: dateStr,
                        installation_custom_id: assign.installationId === 'custom' ? null : assign.installationId,
                        employee_custom_id: wId,
                        notes: assign.notes,
                        work_hours: 8
                    });
                });
            }
        }

        try {
            await supabase.from('installation_workers').delete().eq('work_date', dateStr);
            if (records.length > 0) {
                const { error } = await supabase.from('installation_workers').insert(records);
                if (error) throw error;
            }
            await loadWeekData();
            closeDayEditor();
        } catch (e) {
            alert("Помилка: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const installationOptions = useMemo(() => {
        const base = installations.map(inst => ({
            value: inst.custom_id,
            label: `${inst.name} (#${inst.custom_id})`,
            subLabel: `ID: ${inst.custom_id}`
        }));
        return [{ value: 'custom', label: '⚡ Інше / Створити вручну', subLabel: 'Для робіт поза базою' }, ...base];
    }, [installations]);

    const weekDays = useMemo(() => {
        return Array.from({ length: 7 }).map((_, i) => addDays(currentWeekStart, i));
    }, [currentWeekStart]);

    const absentEmployees = getAbsentEmployees();

    return (
        <div className="min-h-screen bg-slate-100 pb-20">
            {/* Header with Programmatic Date Picker */}
            <div className="bg-white sticky top-0 z-30 shadow-sm border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <button onClick={() => setCurrentWeekStart(d => addDays(d, -7))} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><FaArrowLeft/></button>
                    
                    <div className="flex-1 flex justify-center">
                        <div 
                            onClick={triggerDatePicker}
                            className="relative group cursor-pointer px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            <input 
                                ref={dateInputRef}
                                type="date" 
                                onChange={handleJumpToDate}
                                className="absolute top-0 left-0 w-0 h-0 opacity-0" 
                            />
                            
                            <div className="text-center">
                                <h2 className="text-lg font-bold text-gray-800 flex items-center justify-center gap-2 group-hover:text-indigo-600 transition-colors">
                                    <FaRegCalendarAlt className="text-indigo-500"/>
                                    <span className="whitespace-nowrap">
                                        {weekDays[0].toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })} — {weekDays[6].toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
                                    </span>
                                </h2>
                                <p className="text-xs text-gray-500 font-medium">{weekDays[0].getFullYear()}</p>
                            </div>
                        </div>
                    </div>

                    <button onClick={() => setCurrentWeekStart(d => addDays(d, 7))} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><FaArrowRight/></button>
                </div>
            </div>

            {/* Grid */}
            <div className="max-w-7xl mx-auto p-2 sm:p-4 overflow-x-auto">
                <div className="grid grid-cols-1 md:grid-cols-7 gap-3 min-w-[300px]">
                    {/* FIX: SKELETON LOADING */}
                    {loading ? (
                         Array.from({ length: 7 }).map((_, i) => (
                            <div key={i} className="min-h-[120px] bg-white rounded-xl border border-gray-100 p-3 flex flex-col gap-2 animate-pulse">
                                <div className="flex justify-between items-center pb-2 border-b border-gray-50">
                                    <div className="h-4 w-10 bg-gray-200 rounded"></div>
                                    <div className="h-4 w-6 bg-gray-200 rounded-full"></div>
                                </div>
                                <div className="space-y-2 mt-2">
                                    <div className="h-6 w-full bg-gray-100 rounded-lg"></div>
                                    <div className="h-6 w-3/4 bg-gray-100 rounded-lg"></div>
                                </div>
                            </div>
                         ))
                    ) : (
                        weekDays.map(date => {
                            const dateStr = formatDateToYYYYMMDD(date);
                            const isToday = dateStr === formatDateToYYYYMMDD(new Date());
                            const dayTasks = assignmentsByDate[dateStr] || [];
                            const dayOffsCount = Object.keys(timeOffMap[dateStr] || {}).length;

                            return (
                                <div 
                                    key={dateStr} 
                                    ref={isToday ? todayRef : null} 
                                    onClick={() => openDayEditor(date)}
                                    className={`
                                        min-h-[120px] bg-white rounded-xl border p-3 flex flex-col gap-2 cursor-pointer transition-all active:scale-[0.98] hover:shadow-md
                                        ${isToday ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-indigo-300'}
                                    `}
                                >
                                    <div className="flex justify-between items-center pb-2 border-b border-gray-50">
                                        <span className={`text-sm font-bold ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                                            {date.toLocaleDateString('uk-UA', { weekday: 'short' }).toUpperCase()}
                                        </span>
                                        <span className={`text-xs px-2 py-0.5 rounded-full ${isToday ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                                            {date.getDate()}
                                        </span>
                                    </div>

                                    <div className="flex-1 space-y-1.5 overflow-hidden">
                                        {dayTasks.length > 0 ? (
                                            dayTasks.map((task, i) => {
                                                const isCustom = task.installationId === 'custom';
                                                const instName = isCustom 
                                                    ? (task.notes || 'Без назви') 
                                                    : (task.installationId 
                                                        ? (installations.find(inst => inst.custom_id?.toString() === task.installationId?.toString())?.name || `Об'єкт #${task.installationId}`)
                                                        : "Завантаження...");
                                                
                                                return (
                                                    <div key={i} className={`text-xs px-2 py-1.5 rounded-lg truncate font-medium flex items-center gap-1.5 ${isCustom ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                                                        {isCustom ? <FaTasks size={10}/> : <FaBriefcase size={10}/>}
                                                        <span className="truncate">{instName}</span>
                                                        <span className="opacity-60 ml-auto text-[10px]">{task.workers.length}</span>
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div className="h-full flex items-center justify-center text-gray-300 text-xs">
                                                <FaPlus/>
                                            </div>
                                        )}
                                    </div>

                                    {dayOffsCount > 0 && (
                                        <div className="mt-auto pt-2 text-[10px] text-red-400 font-medium flex items-center gap-1">
                                            <FaExclamationTriangle size={10}/> {dayOffsCount} відсутні
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Modal / Drawer */}
            <AnimatePresence>
                {editingDate && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/30 flex justify-center items-end md:justify-end md:items-start"
                        onClick={closeDayEditor}
                    >
                        <motion.div 
                            initial={isDesktop ? { x: "100%" } : { y: "100%" }}
                            animate={isDesktop ? { x: 0 } : { y: 0 }}
                            exit={isDesktop ? { x: "100%" } : { y: "100%" }}
                            transition={{ type: "tween", ease: "easeOut", duration: 0.25 }}
                            className="bg-white w-full h-full md:w-[600px] shadow-2xl flex flex-col md:rounded-l-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            {(modalMode === 'view' || modalMode === 'preview') && (
                                <SchedulePreview 
                                    schedule={dayAssignments} 
                                    employees={employees} 
                                    installations={installations} 
                                    isPreviewMode={modalMode === 'preview'}
                                    onEdit={() => setModalMode('edit')}
                                    onSave={handleSaveDay}
                                    onCancel={closeDayEditor}
                                    isSaving={saving}
                                    absentEmployees={absentEmployees}
                                />
                            )}

                            {modalMode === 'edit' && (
                                <>
                                    <div className="p-4 border-b flex items-center justify-between bg-white sticky top-0 z-20 md:rounded-tl-2xl">
                                        <button onClick={closeDayEditor} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full md:hidden">
                                            <FaChevronLeft size={20} />
                                        </button>
                                        <div className="text-center flex-1 md:text-left md:flex-none">
                                            <h3 className="font-bold text-lg text-gray-800">
                                                {editingDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                                            </h3>
                                            <p className="text-xs text-gray-500 uppercase tracking-wider">Редагування</p>
                                        </div>
                                        <button onClick={closeDayEditor} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-800 shadow-sm hidden md:block"><FaTimes/></button>
                                        <div className="w-10 md:hidden"></div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-4">
                                        {dayAssignments.map((assign, idx) => (
                                            <div key={assign.id} className={`bg-white p-4 rounded-xl shadow-sm border relative ${validationErrors[idx] ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200'}`}>
                                                <button onClick={() => removeCard(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 p-2"><FaTrash size={14}/></button>
                                                
                                                <div className="mb-3 pr-6">
                                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Завдання</label>
                                                    <SearchableSelect 
                                                        options={installationOptions}
                                                        value={assign.installationId}
                                                        onChange={(val) => updateCard(idx, 'installationId', val)}
                                                        placeholder="Оберіть об'єкт..."
                                                        icon={FaBriefcase}
                                                        disabledItems={dayAssignments.filter((_, i) => i !== idx).map(a => a.installationId)}
                                                        error={validationErrors[idx]?.installationId}
                                                    />
                                                </div>

                                                {assign.installationId === 'custom' && (
                                                    <div className="mb-3">
                                                        <label className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1 block flex items-center gap-1"><FaPen size={10}/> Назва завдання</label>
                                                        <input 
                                                            type="text" 
                                                            placeholder="Наприклад: Прибирання складу..." 
                                                            value={assign.notes}
                                                            onChange={(e) => updateCard(idx, 'notes', e.target.value)}
                                                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 outline-none ${validationErrors[idx]?.notes ? 'border-red-500 ring-red-100' : 'border-amber-200 bg-amber-50/50 focus:ring-amber-200'}`}
                                                            autoFocus
                                                        />
                                                        {validationErrors[idx]?.notes && <p className="text-red-500 text-xs mt-1">{validationErrors[idx].notes}</p>}
                                                    </div>
                                                )}

                                                {assign.installationId && (
                                                    <div>
                                                        <div className="flex flex-wrap gap-2 mb-2">
                                                            {assign.workers.map(wId => {
                                                                const emp = employees.find(e => e.custom_id === wId);
                                                                return (
                                                                    <span key={wId} className="inline-flex items-center gap-2 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium border border-indigo-100">
                                                                        <FaUser size={10}/> {emp?.name || wId}
                                                                        <button onClick={() => removeWorker(idx, wId)} className="text-indigo-300 hover:text-red-500"><FaTimes size={10}/></button>
                                                                    </span>
                                                                );
                                                            })}
                                                        </div>
                                                        <SearchableSelect 
                                                            options={getAvailableEmployees(idx)}
                                                            onChange={(val) => addWorker(idx, val)}
                                                            placeholder="Додати працівника..."
                                                            icon={FaUserPlus}
                                                            value={null}
                                                        />
                                                        {validationErrors[idx]?.workers && <p className="text-red-500 text-xs mt-1">{validationErrors[idx].workers}</p>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}

                                        <button onClick={addCard} className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 text-sm font-medium hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
                                            <FaPlus /> Додати ще завдання
                                        </button>

                                        <AbsentEmployeesList employees={absentEmployees} />
                                    </div>

                                    <div className="p-4 border-t bg-white sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] rounded-b-none md:rounded-b-2xl">
                                        <button 
                                            onClick={handleSwitchToPreview} 
                                            className="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 text-lg hover:bg-indigo-700"
                                        >
                                            <FaEye/> Попередній перегляд
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}