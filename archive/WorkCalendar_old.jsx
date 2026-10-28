import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useToast, Segmented } from "./ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCalendarAlt, FaSearch, FaPlus, FaTrash, FaUserPlus, 
  FaCheck, FaTimes, FaSave, FaBriefcase, 
  FaArrowLeft, FaArrowRight, FaPen, FaTasks, FaUser,
  FaBed, FaChevronLeft, FaEye, FaPencilAlt, FaRegCalendarAlt, FaUserSlash, FaLock,
  FaRoute, FaHistory, FaShuttleVan
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider"; // 1. ІМПОРТ AUTH CONTEXT

// --- HELPER FUNCTIONS ---

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
    return adjustedDate.toISOString().split("T")[0];
};

const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sunday, 1 = Monday, ...
    // Робимо так, щоб тиждень починався з понеділка (якщо 0 (нд), то віднімаємо 6 днів)
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

const isDateInPast = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(date);
    target.setHours(0, 0, 0, 0);

    return target < today;
};

// Групування рядків installation_workers у картки завдань (об'єкт/кастом + працівники)
const groupWorkRows = (rows) => {
    const groups = [];
    (rows || []).forEach(item => {
        const groupKey = item.installation_custom_id || 'custom_' + item.notes;
        let existing = groups.find(g => g._groupKey === groupKey);
        if (!existing) {
            existing = {
                id: Date.now() + Math.random(),
                _groupKey: groupKey,
                installationId: item.installation_custom_id || 'custom',
                notes: item.notes,
                workers: []
            };
            groups.push(existing);
        }
        if (item.employee_custom_id) existing.workers.push(item.employee_custom_id);
        if (item.visit_plan_id) existing.sourceVisitPlanId = item.visit_plan_id;
    });
    return groups;
};

// --- КОМПОНЕНТИ ---

const SearchableSelect = ({ options, value, onChange, placeholder, icon: Icon, disabledItems = [], error, showInitialList = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const inputRef = useRef(null);
    const isDesktop = useIsDesktop();

    const filteredOptions = useMemo(() => {
        if (!search && !showInitialList) return [];

        const searchLower = search.toLowerCase();
        let count = 0;

        return options.filter(opt => {
            if (count > 50) return false;

            const isDisabled = disabledItems.includes(opt.value);
            const matches = !search ||
                            opt.label.toLowerCase().includes(searchLower) ||
                            (opt.subLabel && opt.subLabel.toLowerCase().includes(searchLower));

            if (!isDisabled && matches) {
                count++;
                return true;
            }
            return false;
        });
    }, [options, search, disabledItems, showInitialList]);

    const selectedOption = options.find(o => o.value === value);

    useEffect(() => {
        if (!isOpen) return;
        // На мобільному фокус одразу після старту анімації зсуву — так клавіатура
        // не смикає layout ще до того, як шторка стала на місце.
        const delay = isDesktop ? 0 : 120;
        const t = setTimeout(() => inputRef.current?.focus(), delay);
        return () => clearTimeout(t);
    }, [isOpen, isDesktop]);

    const selectOption = (val) => {
        onChange(val);
        setIsOpen(false);
        setSearch("");
    };

    const optionsList = (
        filteredOptions.length > 0 ? (
            filteredOptions.map(opt => (
                <button
                    key={opt.value}
                    onClick={() => selectOption(opt.value)}
                    className="w-full text-left px-4 py-3 text-sm hover:bg-indigo-50 active:bg-indigo-100 transition-colors border-b border-gray-50 last:border-0"
                >
                    <div className="font-medium text-gray-800">{opt.label}</div>
                    {opt.subLabel && <div className="text-[10px] text-gray-400">{opt.subLabel}</div>}
                </button>
            ))
        ) : (
            <div className="p-4 text-center text-xs text-gray-400 italic">
                {!search && !showInitialList ? "Введіть текст для пошуку..." : "Нічого не знайдено"}
            </div>
        )
    );

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(true)}
                className={`w-full flex items-center justify-between bg-white border rounded-xl px-4 py-3 text-sm font-medium text-gray-700 shadow-sm active:bg-gray-50 transition-all ${error ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-300 hover:border-gray-400'}`}
            >
                <span className="flex items-center gap-2 truncate">
                    {Icon && <Icon className={`flex-shrink-0 ${error ? 'text-red-500' : 'text-indigo-500'}`}/>}
                    <span className="truncate">
                        {selectedOption ? selectedOption.label : <span className="text-gray-400">{placeholder}</span>}
                    </span>
                </span>
            </button>

            {/* ДЕСКТОП: компактний список, прив'язаний до кнопки */}
            <AnimatePresence>
                {isOpen && isDesktop && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}/>
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute z-[100] w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
                        >
                            <div className="p-2 border-b border-gray-100 bg-gray-50">
                                <div className="relative">
                                    <FaSearch className="absolute left-3 top-2.5 text-gray-400 text-xs"/>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        className="w-full pl-8 pr-3 py-2 bg-white rounded-lg text-sm outline-none border border-gray-200 focus:border-indigo-300 transition-all"
                                        placeholder={showInitialList ? "Пошук..." : "Введіть для пошуку..."}
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="max-h-56 overflow-y-auto">
                                {optionsList}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* МОБІЛЬНИЙ: повноекранна шторка знизу — не залежить від того, де кнопка в скролі форми */}
            <AnimatePresence>
                {isOpen && !isDesktop && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[200] bg-black/30 flex items-end"
                        onClick={() => setIsOpen(false)}
                    >
                        <motion.div
                            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                            transition={{ type: "tween", ease: "easeOut", duration: 0.22 }}
                            className="bg-white w-full max-h-[80dvh] rounded-t-2xl shadow-2xl flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="p-3 border-b border-gray-100 flex items-center gap-2 flex-none">
                                <div className="relative flex-1">
                                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"/>
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        className="w-full pl-8 pr-3 py-2.5 bg-gray-50 rounded-lg text-sm outline-none border border-gray-200 focus:border-indigo-300 transition-all"
                                        placeholder={showInitialList ? "Пошук..." : "Введіть для пошуку..."}
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                <button onClick={() => setIsOpen(false)} className="p-2.5 bg-gray-100 rounded-full text-gray-500 flex-shrink-0">
                                    <FaTimes size={14}/>
                                </button>
                            </div>
                            <div className="overflow-y-auto flex-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                                {optionsList}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            {error && <p className="text-red-500 text-xs mt-1 ml-1">{error}</p>}
        </div>
    );
};

const QuickAbsenceAdder = ({ employees, date, onAdd }) => {
    const [selectedEmp, setSelectedEmp] = useState("");
    const [status, setStatus] = useState("OFF");

    const availableEmployees = employees.map(e => ({
        value: e.custom_id,
        label: e.name,
        subLabel: e.position
    }));

    const handleAdd = () => {
        if (!selectedEmp) return;
        onAdd(selectedEmp, status);
        setSelectedEmp("");
    };

    return (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4">
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <FaUserSlash/> Відмітити відсутність
            </h4>
            <div className="space-y-2">
                <SearchableSelect 
                    options={availableEmployees}
                    value={selectedEmp}
                    onChange={setSelectedEmp}
                    placeholder="Введіть ім'я працівника..."
                    icon={FaUser}
                />
                <div className="flex gap-2">
                    <select 
                        value={status} 
                        onChange={e => setStatus(e.target.value)}
                        className="flex-1 bg-white border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 outline-none"
                    >
                        <option value="OFF">Вихідний</option>
                        <option value="SICK_LEAVE">Лікарняний</option>
                        <option value="VACATION">Відпустка</option>
                    </select>
                    <button 
                        onClick={handleAdd}
                        disabled={!selectedEmp}
                        className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50"
                    >
                        <FaCheck/>
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- ПАНЕЛЬ ЗАПЛАНОВАНИХ ВИЇЗДІВ (підказки з розділу «Виїзди») ---
const VisitPlansPanel = ({ visits, installations, employees, schedule, onAddVisit, canEdit }) => {
    if (!visits || visits.length === 0) return null;
    return (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
            <h4 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                <FaRoute /> Заплановані виїзди на цей день ({visits.length})
            </h4>
            <div className="space-y-2">
                {visits.map(v => {
                    const instName = v.installationId
                        ? (installations.find(i => String(i.custom_id) === String(v.installationId))?.name || `Об'єкт #${v.installationId}`)
                        : (v.title || 'Завдання без об\'єкта');
                    const inSchedule = schedule.some(a => v.installationId
                        ? String(a.installationId) === String(v.installationId)
                        : (a.installationId === 'custom' && (a.notes || '') === (v.title || 'Виїзд за планом')));
                    return (
                        <div key={v.id} className="bg-white rounded-lg border border-emerald-100 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-bold text-slate-800 truncate">
                                        {instName} {v.installationId && <span className="text-slate-400 font-normal">#{v.installationId}</span>}
                                    </div>
                                    {v.workerCustomIds.length > 0 && (
                                        <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                                            У плані: <span className="font-medium text-slate-600">{v.workerCustomIds.map(w => employees.find(e => e.custom_id === w)?.name || w).join(', ')}</span>
                                        </div>
                                    )}
                                    {v.comment && <div className="text-[10px] text-slate-400 italic mt-0.5">«{v.comment}»</div>}
                                </div>
                                {inSchedule ? (
                                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg whitespace-nowrap">✔ У графіку</span>
                                ) : canEdit ? (
                                    <button
                                        onClick={() => onAddVisit(v)}
                                        title="Додати цей виїзд у графік разом із призначеними людьми"
                                        className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-sm transition-colors"
                                    >
                                        + У графік
                                    </button>
                                ) : (
                                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg whitespace-nowrap">Не в графіку</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const AbsentEmployeesList = ({ employees }) => {
    if (!employees || employees.length === 0) return null;
    return (
        <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <FaBed/> Вихідні сьогодні ({employees.length})
            </h4>
            <div className="space-y-2">
                {employees.map(emp => (
                    <div key={emp.id} className="flex justify-between items-center text-sm p-2 bg-white rounded-lg text-red-700 border border-red-100 shadow-sm">
                        <span className="font-medium">{emp.name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-red-50 rounded-md text-red-500 border border-red-100 uppercase">
                            {emp.status === 'OFF' ? 'Вихідний' : emp.status === 'VACATION' ? 'Відпустка' : 'Лікарняний'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- КОМПОНЕНТ ПЕРЕГЛЯДУ (З УРАХУВАННЯМ ПРАВ) ---
const SchedulePreview = ({ schedule, employees, installations, isPreviewMode, onEdit, onSave, onCancel, isSaving, absentEmployees, isPast, canManageSchedule, canEditPast, visits = [] }) => {
    return (
        <div className="flex flex-col flex-1 min-h-0 bg-slate-50">
            <div className="p-4 border-b flex items-center justify-between bg-white rounded-t-2xl shadow-sm z-20 flex-none">
                <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                    {isPreviewMode ? "Попередній перегляд" : "План робіт"}
                    {isPast && (
                        <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${canEditPast ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                            <FaLock size={10}/> Архів{canEditPast ? ' · редагування' : ''}
                        </span>
                    )}
                </h3>
                <button onClick={onCancel} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-800"><FaTimes/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <VisitPlansPanel
                    visits={visits}
                    installations={installations}
                    employees={employees}
                    schedule={schedule}
                    canEdit={false}
                />
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
                                                <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                                                    <FaUser size={11} />
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

            <div className="p-4 border-t bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] space-y-3 flex-none">
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
                    // КНОПКА РЕДАГУВАННЯ: ЯКЩО НЕ В МИНУЛОМУ, АБО СУПЕР АДМІН МОЖЕ ПРАВИТИ АРХІВ
                    (!isPast || canEditPast) && canManageSchedule ? (
                        <button
                            onClick={onEdit}
                            className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <FaPencilAlt/> {isPast ? 'Виправити архівний день' : 'Редагувати план'}
                        </button>
                    ) : (
                        <div className="text-center text-gray-400 text-sm py-2 flex items-center justify-center gap-2">
                            {isPast ? <><FaLock/> Редагування минулих періодів заборонено</> : <span className="italic">Тільки для перегляду</span>}
                        </div>
                    )
                )}
            </div>
        </div>
    );
};

const ABSENCE_LABEL = { OFF: 'Вихідний', VACATION: 'Відпустка', SICK_LEAVE: 'Лікарняний' };
const ABSENCE_SHORT = { OFF: 'вихідний', VACATION: 'відпустка', SICK_LEAVE: 'лікарняний' };

// --- ГОЛОВНИЙ КОМПОНЕНТ ---
export default function WorkCalendar() {
    const toast = useToast();
    // 2. ОТРИМУЄМО РОЛЬ
    const { role, user, employee: me } = useAuth();
    // 3. ВИЗНАЧАЄМО ПРАВО НА РЕДАГУВАННЯ (Admin або Office)
    const canManageSchedule = role === 'admin' || role === 'super_admin' || role === 'office';
    // Тільки супер адмін може редагувати вже минулі (архівні) дні — виправити задній числом
    const canEditPast = role === 'super_admin';

    const isDesktop = useIsDesktop();
    
    // 4. ЛОГІКА ПОЧАТКУ ТИЖНЯ (Якщо Нд -> показуємо наступний тиждень)
    const [currentWeekStart, setCurrentWeekStart] = useState(() => {
        const today = new Date();
        const day = today.getDay();
        if (day === 0) { // Якщо сьогодні неділя
             const nextMonday = addDays(today, 1);
             return getStartOfWeek(nextMonday);
        }
        return getStartOfWeek(today);
    });

    const [assignmentsByDate, setAssignmentsByDate] = useState({});
    
    // States for Modal
    const [editingDate, setEditingDate] = useState(null); 
    const [dayAssignments, setDayAssignments] = useState([]);
    const [modalMode, setModalMode] = useState('view');
    const [validationErrors, setValidationErrors] = useState({});
    
    const [isPastDate, setIsPastDate] = useState(false);

    const [installations, setInstallations] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [timeOffMap, setTimeOffMap] = useState({});
    const [visitsMap, setVisitsMap] = useState({}); // dateStr -> [{ id, installationId, title, workerCustomIds }]
    const [draftsMap, setDraftsMap] = useState({}); // dateStr -> { payload, updated_at, updated_by_email }
    const [tripsMap, setTripsMap] = useState({});   // dateStr -> ['Бус · 3 зуп.', …] — з «Транспорту»
    const [draftNotice, setDraftNotice] = useState(null); // чернетка, знайдена при відкритті дня — очікує рішення

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Вигляд: по днях (картки) або по людях (хто де працює)
    const [view, setView] = useState(() => { try { return localStorage.getItem('kcore.calendar.view') || 'days'; } catch { return 'days'; } });
    const [peopleFilter, setPeopleFilter] = useState('install'); // install | office | all
    const [peopleSearch, setPeopleSearch] = useState('');
    // Наживо: хто зараз у календарі й що редагує; автозбереження чернетки
    const [online, setOnline] = useState([]);        // [{ key, name, editing }]
    const [autoSave, setAutoSave] = useState(null);  // null | 'saving' | 'saved' | 'error'
    const [showDraft, setShowDraft] = useState(false);
    const presenceRef = useRef(null);
    const lastDraftJson = useRef('');

    // Легке сповіщення (копіювання дня, підказки)
    const [notice, setNotice] = useState(null);
    const showNotice = useCallback((msg) => {
        setNotice(msg);
        setTimeout(() => setNotice(null), 3500);
    }, []);

    const todayRef = useRef(null);
    const dateInputRef = useRef(null);

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

    // silent — тихе оновлення (зміни від інших): без мерехтіння «завантаження»
    const loadWeekData = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        const startDateStr = formatDateToYYYYMMDD(currentWeekStart);
        // Завантажуємо дані до суботи (6-й день від старту), бо неділю не показуємо
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
                .select('id, custom_id, name, email, department, position, hidden_from_list')
                .order('name');

            const { data: attendanceData } = await supabase
                .from('attendance')
                .select('employee_custom_id, work_date, status')
                .gte('work_date', startDateStr)
                .lte('work_date', endDateStr)
                .in('status', ['OFF', 'VACATION', 'SICK_LEAVE']);

            const { data: workData } = await supabase
                .from('installation_workers')
                .select('installation_custom_id, employee_custom_id, work_date, notes, visit_plan_id')
                .gte('work_date', startDateStr)
                .lte('work_date', endDateStr);

            // Заплановані виїзди на цей тиждень (з призначеними людьми)
            const { data: visitData } = await supabase
                .from('installation_visit_plan')
                .select('id, installation_custom_id, planned_date, status, custom_task_title, comment, assignees:installation_visit_plan_employees(employee_id)')
                .gte('planned_date', startDateStr)
                .lte('planned_date', endDateStr)
                .neq('status', 'cancelled');

            // Незбережені чернетки графіка на цей тиждень
            const { data: draftData } = await supabase
                .from('schedule_day_drafts')
                .select('work_date, payload, updated_at, updated_by_email')
                .gte('work_date', startDateStr)
                .lte('work_date', endDateStr);

            const dMap = {};
            (draftData || []).forEach(d => { dMap[d.work_date] = d; });
            setDraftsMap(dMap);

            // Поїздки тижня — коротко в картці дня
            const { data: tripData } = await supabase
                .from('trips')
                .select('trip_date, title, own_car_custom_id, vehicle:vehicles(name), stops:trip_stops(id)')
                .gte('trip_date', startDateStr)
                .lte('trip_date', endDateStr)
                .neq('status', 'cancelled');
            const tMap = {};
            (tripData || []).forEach(t => {
                if (!tMap[t.trip_date]) tMap[t.trip_date] = [];
                tMap[t.trip_date].push(`${t.title || t.vehicle?.name || (t.own_car_custom_id ? 'власне авто' : 'поїздка')} · ${t.stops?.length || 0} зуп.`);
            });
            setTripsMap(tMap);

            // Завершені об'єкти не входять у вибір, але в минулих тижнях їхні назви потрібні
            const known = new Set((instData || []).map(i => i.custom_id));
            const missing = [...new Set((workData || []).map(w => w.installation_custom_id).filter(id => id && !known.has(id)))];
            let extra = [];
            if (missing.length) {
                const { data: extraData } = await supabase.from('installations').select('custom_id, name, status').in('custom_id', missing);
                extra = extraData || [];
            }
            setInstallations([...(instData || []), ...extra]);
            setEmployees(empData || []);

            // Мапа виїздів по датах; людей конвертуємо employees.id -> custom_id (як у графіку)
            const empById = {};
            (empData || []).forEach(e => { empById[e.id] = e; });
            const vMap = {};
            (visitData || []).forEach(v => {
                const date = v.planned_date;
                if (!vMap[date]) vMap[date] = [];
                vMap[date].push({
                    id: v.id,
                    installationId: v.installation_custom_id,
                    title: v.custom_task_title || null,
                    comment: v.comment || null,
                    workerCustomIds: (v.assignees || [])
                        .map(a => empById[a.employee_id]?.custom_id)
                        .filter(Boolean)
                });
            });
            setVisitsMap(vMap);

            const offMap = {};
            attendanceData?.forEach(item => {
                if (!offMap[item.work_date]) offMap[item.work_date] = {};
                offMap[item.work_date][item.employee_custom_id] = item.status;
            });
            setTimeOffMap(offMap);

            const rowsByDate = {};
            (workData || []).forEach(item => {
                if (!rowsByDate[item.work_date]) rowsByDate[item.work_date] = [];
                rowsByDate[item.work_date].push(item);
            });
            const scheduleMap = {};
            Object.keys(rowsByDate).forEach(d => { scheduleMap[d] = groupWorkRows(rowsByDate[d]); });
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

    // НАЖИВО: зміна графіка, відсутності, виїзду чи чернетки — за секунду у всіх відкритих календарях
    const reloadRef = useRef(loadWeekData);
    useEffect(() => { reloadRef.current = loadWeekData; }, [loadWeekData]);
    useEffect(() => {
        let timer;
        const bump = () => { clearTimeout(timer); timer = setTimeout(() => reloadRef.current(true), 400); };
        const ch = supabase.channel('kcore-schedule-live');
        ['installation_workers', 'attendance', 'schedule_day_drafts', 'installation_visit_plan', 'installation_visit_plan_employees', 'trips', 'trip_stops']
            .forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
        ch.subscribe();
        return () => { clearTimeout(timer); supabase.removeChannel(ch); };
    }, []);

    // ХТО ЗАРАЗ У КАЛЕНДАРІ і який день редагує (присутність Supabase Realtime)
    const myName = me?.name || user?.email || 'Хтось';
    useEffect(() => {
        if (!user?.id) return undefined;
        const ch = supabase.channel('kcore-schedule-presence', { config: { presence: { key: user.id } } });
        ch.on('presence', { event: 'sync' }, () => {
            const state = ch.presenceState();
            setOnline(Object.entries(state).map(([key, metas]) => ({ key, ...(metas[metas.length - 1] || {}) })));
        });
        ch.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') { try { await ch.track({ name: myName, editing: null }); } catch { /* не критично */ } }
        });
        presenceRef.current = ch;
        return () => { presenceRef.current = null; supabase.removeChannel(ch); };
    }, [user?.id, myName]);

    // Кажемо іншим, який день зараз редагуємо
    const editingKey = editingDate && modalMode === 'edit' ? formatDateToYYYYMMDD(editingDate) : null;
    useEffect(() => {
        const ch = presenceRef.current;
        if (ch) ch.track({ name: myName, editing: editingKey }).catch(() => { /* ще не підключились */ });
    }, [editingKey, myName]);

    // АВТОЗБЕРЕЖЕННЯ ЧЕРНЕТКИ: поки редагуєте — інші менеджери бачать, як наповнюється день
    useEffect(() => {
        if (!editingDate || modalMode !== 'edit' || !canManageSchedule) return undefined;
        const json = JSON.stringify(dayAssignments);
        if (json === lastDraftJson.current) return undefined;
        if (!dayAssignments.some(a => a.installationId || a.workers.length > 0)) return undefined;
        const dateStr = formatDateToYYYYMMDD(editingDate);
        const t = setTimeout(async () => {
            lastDraftJson.current = json;
            setAutoSave('saving');
            const { error } = await supabase.from('schedule_day_drafts').upsert({
                work_date: dateStr,
                payload: dayAssignments,
                updated_by_email: user?.email || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'work_date' });
            setAutoSave(error ? 'error' : 'saved');
        }, 900);
        return () => clearTimeout(t);
    }, [dayAssignments, editingDate, modalMode, canManageSchedule, user?.email]);

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
        const isPast = isDateInPast(date);
        setIsPastDate(isPast);

        const dateStr = formatDateToYYYYMMDD(date);
        const existingData = assignmentsByDate[dateStr] ? JSON.parse(JSON.stringify(assignmentsByDate[dateStr])) : [];
        lastDraftJson.current = JSON.stringify(existingData);   // відкриття дня — ще не зміна
        setShowDraft(false);
        setAutoSave(null);
        setDayAssignments(existingData);
        setEditingDate(date);
        setValidationErrors({});
        setDraftNotice(draftsMap[dateStr] || null);

        // 5. ЛОГІКА ВІДКРИТТЯ МОДАЛКИ В ЗАЛЕЖНОСТІ ВІД ПРАВ
        if (!canManageSchedule) {
            // Монтажники завжди бачать 'view'
            setModalMode('view');
        } else if (isPast && !canEditPast) {
            // Минуле тільки для перегляду — крім супер адміна, який може виправити заднім числом
            setModalMode('view');
        } else if (existingData.length === 0) {
            // Якщо пусто і є права - зразу режим редагування
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
        setIsPastDate(false);
        setDraftNotice(null);
        setAutoSave(null);
        setShowDraft(false);
    };

    const applyDraft = () => {
        if (!draftNotice) return;
        setDayAssignments(JSON.parse(JSON.stringify(draftNotice.payload || [])));
        setModalMode('edit');
        setDraftNotice(null);
    };

    const discardDraft = async () => {
        if (!editingDate) return;
        const dateStr = formatDateToYYYYMMDD(editingDate);
        try {
            await supabase.from('schedule_day_drafts').delete().eq('work_date', dateStr);
            setDraftsMap(prev => {
                const next = { ...prev };
                delete next[dateStr];
                return next;
            });
        } catch (e) {
            console.error('Не вдалося видалити чернетку:', e);
        }
        setDraftNotice(null);
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
            if (emp.hidden_from_list) return false;
            if (dayOffs.hasOwnProperty(emp.custom_id)) return false;
            if (assignedElsewhere.has(emp.custom_id)) return false;
            if (assignedInCurrent.has(emp.custom_id)) return false;
            return true;
        }).map(emp => ({
            value: emp.custom_id,
            label: emp.name,
            subLabel: `${emp.position || ''}`
        }));
    };

    const addCard = () => setDayAssignments([...dayAssignments, { id: Date.now(), installationId: null, workers: [], notes: "" }]);

    // --- ВЗЯТИ ЗА ОСНОВУ ПОПЕРЕДНІЙ ДЕНЬ ---
    // Шукаємо назад (до 7 днів) останній день, де був план, і копіюємо його картки.
    const handleCopyPreviousDay = async () => {
        if (!editingDate) return;
        const targetDateStr = formatDateToYYYYMMDD(editingDate);
        const offs = timeOffMap[targetDateStr] || {};

        for (let i = 1; i <= 7; i++) {
            const d = addDays(editingDate, -i);
            const ds = formatDateToYYYYMMDD(d);

            let dayData = assignmentsByDate[ds];
            if (dayData === undefined) {
                const { data } = await supabase
                    .from('installation_workers')
                    .select('installation_custom_id, employee_custom_id, work_date, notes, visit_plan_id')
                    .eq('work_date', ds);
                dayData = groupWorkRows(data || []);
            }

            if (dayData && dayData.length > 0) {
                setDayAssignments(prev => {
                    const meaningful = prev.filter(a => a.installationId || a.workers.length > 0);
                    const existingIds = new Set(meaningful.map(a => String(a.installationId)));
                    const copied = dayData
                        .filter(g => g.installationId === 'custom' || !existingIds.has(String(g.installationId)))
                        .map(g => ({
                            id: Date.now() + Math.random(),
                            installationId: g.installationId,
                            notes: g.notes || "",
                            // відсутніх у цільовий день не копіюємо
                            workers: g.workers.filter(w => !offs.hasOwnProperty(w))
                        }));
                    return [...meaningful, ...copied];
                });
                showNotice(`Скопійовано план за ${d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' })} — внесіть правки`);
                return;
            }
        }
        showNotice('За попередні 7 днів не знайдено плану для копіювання');
    };

    // --- ДОДАТИ ЗАПЛАНОВАНИЙ ВИЇЗД У ГРАФІК ---
    const addVisitToSchedule = (visit) => {
        const targetDateStr = formatDateToYYYYMMDD(editingDate);
        const offs = timeOffMap[targetDateStr] || {};

        setDayAssignments(prev => {
            const meaningful = prev.filter(a => a.installationId || a.workers.length > 0);
            // працівники, вже зайняті в інших картках
            const busy = new Set();
            meaningful.forEach(a => a.workers.forEach(w => busy.add(w)));
            const availableWorkers = visit.workerCustomIds.filter(w => !offs.hasOwnProperty(w) && !busy.has(w));

            const isCustom = !visit.installationId;
            const existing = !isCustom && meaningful.find(a => String(a.installationId) === String(visit.installationId));
            if (existing) {
                // об'єкт вже в графіку — просто доукомплектовуємо людьми з плану і запам'ятовуємо джерело
                return meaningful.map(a => a === existing
                    ? { ...a, workers: [...a.workers, ...availableWorkers.filter(w => !a.workers.includes(w))], sourceVisitPlanId: a.sourceVisitPlanId || visit.id }
                    : a);
            }
            return [...meaningful, {
                id: Date.now() + Math.random(),
                installationId: isCustom ? 'custom' : visit.installationId,
                notes: isCustom ? (visit.title || 'Виїзд за планом') : (visit.comment || ""),
                workers: availableWorkers,
                sourceVisitPlanId: visit.id
            }];
        });
        showNotice('Виїзд додано в графік — перевірте склад людей');
    };
    
    const removeCard = (idx) => {
        const newAssignments = dayAssignments.filter((_, i) => i !== idx);
        setDayAssignments(newAssignments);
        setValidationErrors({});
    };

    const updateCard = (idx, field, val) => {
        const newData = [...dayAssignments];
        newData[idx][field] = val;
        if (field === 'installationId' && val === 'custom') {
             if (!newData[idx].notes) newData[idx].notes = ""; 
        }
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

    const handleQuickAbsence = async (empId, status) => {
        if (!editingDate) return;
        const dateStr = formatDateToYYYYMMDD(editingDate);
        try {
            const { error } = await supabase.from('attendance').upsert({
                employee_custom_id: empId,
                work_date: dateStr,
                status: status
            }, { onConflict: 'employee_custom_id, work_date' });

            if (error) throw error;
            
            setTimeOffMap(prev => ({
                ...prev,
                [dateStr]: { ...(prev[dateStr] || {}), [empId]: status }
            }));
            
            const newAssignments = dayAssignments.map(assign => ({
                ...assign,
                workers: assign.workers.filter(w => w !== empId)
            }));
            setDayAssignments(newAssignments);

        } catch (e) {
            toast("Помилка збереження відсутності: " + e.message, 'error');
        }
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
        if (isPastDate && !canEditPast) {
            toast("Неможливо зберегти зміни для минулої дати.", 'warning');
            return;
        }
        setSaving(true);
        const dateStr = formatDateToYYYYMMDD(editingDate);
        const records = [];

        for (const assign of dayAssignments) {
            if (!assign.installationId) continue;
            if (assign.installationId === 'custom' && !assign.notes.trim()) continue;

            if (assign.workers.length > 0) {
                assign.workers.forEach(wId => {
                    records.push({
                        installation_custom_id: assign.installationId === 'custom' ? null : assign.installationId,
                        employee_custom_id: wId,
                        notes: assign.notes,
                        work_hours: 8,
                        visit_plan_id: assign.sourceVisitPlanId || null
                    });
                });
            }
        }

        try {
            const { error } = await supabase.rpc('save_day_schedule', {
                p_work_date: dateStr,
                p_records: records
            });
            if (error) throw error;

            await supabase.from('schedule_day_drafts').delete().eq('work_date', dateStr);
            lastDraftJson.current = '';
            await loadWeekData(true);
            closeDayEditor();
        } catch (e) {
            toast("Помилка: " + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const saveDraft = async () => {
        if (!editingDate) return;
        const dateStr = formatDateToYYYYMMDD(editingDate);
        setSaving(true);
        try {
            const { error } = await supabase.from('schedule_day_drafts').upsert({
                work_date: dateStr,
                payload: dayAssignments,
                updated_by_email: user?.email || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'work_date' });
            if (error) throw error;

            setDraftsMap(prev => ({
                ...prev,
                [dateStr]: { work_date: dateStr, payload: dayAssignments, updated_at: new Date().toISOString(), updated_by_email: user?.email || null }
            }));
            showNotice('Чернетку збережено — повернетесь пізніше і продовжите');
        } catch (e) {
            toast("Помилка збереження чернетки: " + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const installationOptions = useMemo(() => {
        const base = installations.filter(i => i.status !== 'completed' && i.status !== 'cancelled').map(inst => ({
            value: inst.custom_id,
            label: `${inst.name} (#${inst.custom_id})`,
            subLabel: `ID: ${inst.custom_id}`
        }));
        return [{ value: 'custom', label: 'Інше / створити вручну', subLabel: 'Для робіт поза базою' }, ...base];
    }, [installations]);

    // 6. ГЕНЕРАЦІЯ ТІЛЬКИ 6 ДНІВ (ПН-СБ)
    const weekDays = useMemo(() => {
        return Array.from({ length: 6 }).map((_, i) => addDays(currentWeekStart, i));
    }, [currentWeekStart]);

    const absentEmployees = getAbsentEmployees();
    
    const employeesAvailableForAbsence = useMemo(() => {
        if(!editingDate) return [];
        const dateStr = formatDateToYYYYMMDD(editingDate);
        const dayOffs = timeOffMap[dateStr] || {};
        return employees.filter(e => !e.hidden_from_list && !dayOffs.hasOwnProperty(e.custom_id));
    }, [employees, timeOffMap, editingDate]);

    /* --- Для відображення --- */
    const setViewMode = (v) => { setView(v); try { localStorage.setItem('kcore.calendar.view', v); } catch { /* немає сховища */ } };
    const others = online.filter(p => p.key !== user?.id);
    const editorsOf = (ds) => others.filter(p => p.editing === ds);
    const shortDay = (ds) => new Date(`${ds}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric' });
    const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : '');
    const instName = (id) => installations.find(i => String(i.custom_id) === String(id))?.name || `Об'єкт #${id}`;
    const empName = (cid) => employees.find(e => e.custom_id === cid)?.name || `#${cid}`;
    const nameByEmail = (email) => employees.find(e => e.email && email && e.email.toLowerCase() === email.toLowerCase())?.name || email || 'хтось';

    // Хто де працює: день → { custom_id працівника → картка завдання }
    const workerDay = useMemo(() => {
        const map = {};
        Object.entries(assignmentsByDate).forEach(([ds, tasks]) => {
            map[ds] = {};
            tasks.forEach(t => t.workers.forEach(w => { map[ds][w] = t; }));
        });
        return map;
    }, [assignmentsByDate]);

    const peopleRows = useMemo(() => employees
        .filter(e => !e.hidden_from_list)
        .filter(e => {
            const dep = Array.isArray(e.department) ? e.department : [e.department].filter(Boolean);
            if (peopleFilter === 'install') return dep.includes('Монтаж') || dep.includes('Склад');
            if (peopleFilter === 'office') return dep.includes('Офіс') || dep.includes('Проектування');
            return true;
        })
        .filter(e => !peopleSearch.trim() || (e.name || '').toLowerCase().includes(peopleSearch.trim().toLowerCase())),
    [employees, peopleFilter, peopleSearch]);

    const todayStr = formatDateToYYYYMMDD(new Date());
    const freeToday = useMemo(() => {
        if (!weekDays.some(d => formatDateToYYYYMMDD(d) === todayStr)) return '—';
        return peopleRows.filter(e => !(timeOffMap[todayStr] || {})[e.custom_id] && !workerDay[todayStr]?.[e.custom_id]).length;
    }, [peopleRows, timeOffMap, workerDay, weekDays, todayStr]);

    // Відкритий день: чернетка, яку зараз хтось готує, і хто саме редагує
    const editingStr = editingDate ? formatDateToYYYYMMDD(editingDate) : null;
    const liveDraft = editingStr && canManageSchedule ? draftsMap[editingStr] : null;
    const editorsHere = editingStr ? editorsOf(editingStr) : [];

    return (
        <div className="min-h-full bg-slate-100 pb-20">
            {/* Легке сповіщення */}
            <AnimatePresence>
                {notice && (
                    <motion.div
                        initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
                        className="fixed top-16 left-1/2 -translate-x-1/2 z-[110] bg-slate-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl shadow-2xl max-w-[90vw] text-center"
                    >
                        {notice}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Шапка: тиждень, вигляд, хто зараз у календарі */}
            <div className="bg-white border-b border-slate-200 relative z-30">
                <div className="max-w-[1500px] mx-auto px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1">
                        <button onClick={() => setCurrentWeekStart(d => addDays(d, -7))} aria-label="Попередній тиждень"
                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"><FaArrowLeft size={13} /></button>
                        <button type="button" onClick={triggerDatePicker}
                            className="relative h-9 px-3 rounded-lg hover:bg-slate-50 text-[15px] font-bold text-slate-900 inline-flex items-center gap-2 whitespace-nowrap">
                            <input ref={dateInputRef} type="date" onChange={handleJumpToDate} className="absolute top-0 left-0 w-0 h-0 opacity-0" tabIndex={-1} />
                            <FaRegCalendarAlt className="text-indigo-500" size={14} />
                            {weekDays[0].toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })} — {weekDays[5].toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </button>
                        <button onClick={() => setCurrentWeekStart(d => addDays(d, 7))} aria-label="Наступний тиждень"
                            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600"><FaArrowRight size={13} /></button>
                        <button onClick={() => setCurrentWeekStart(getStartOfWeek(new Date()))}
                            className="h-9 px-3 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 ml-1">Цей тиждень</button>
                    </div>
                    <Segmented value={view} onChange={setViewMode} options={[{ value: 'days', label: 'По днях' }, { value: 'people', label: 'По людях' }]} />
                    {others.length > 0 && (
                        <div className="ml-auto flex flex-wrap items-center gap-1.5 text-[12px]">
                            <span className="inline-flex items-center gap-1.5 text-slate-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Зараз тут:</span>
                            {others.map(p => (
                                <span key={p.key} className={`h-6 px-2 rounded-full border inline-flex items-center gap-1 font-semibold ${p.editing ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                    {p.name}{p.editing && <span className="font-normal">· редагує {shortDay(p.editing)}</span>}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {view === 'days' ? (
                <div className="max-w-[1500px] mx-auto p-2 sm:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="min-h-[160px] bg-white rounded-xl border border-slate-100 p-3 flex flex-col gap-2 animate-pulse">
                                    <div className="h-4 w-16 bg-slate-200 rounded" />
                                    <div className="h-10 w-full bg-slate-100 rounded-lg mt-2" />
                                </div>
                            ))
                        ) : weekDays.map(date => {
                            const dateStr = formatDateToYYYYMMDD(date);
                            const isToday = dateStr === formatDateToYYYYMMDD(new Date());
                            const dayTasks = assignmentsByDate[dateStr] || [];
                            const offs = Object.entries(timeOffMap[dateStr] || {});
                            const cellIsPast = isDateInPast(date);
                            const draft = canManageSchedule ? draftsMap[dateStr] : null;
                            const draftTasks = (draft?.payload || []).filter(a => a.installationId || a.workers?.length);
                            const editors = editorsOf(dateStr);
                            const peopleCount = dayTasks.reduce((s, t) => s + t.workers.length, 0);

                            return (
                                <div key={dateStr} ref={isToday ? todayRef : null} onClick={() => openDayEditor(date)}
                                    className={`bg-white rounded-xl border flex flex-col min-h-[160px] cursor-pointer transition-shadow hover:shadow-md overflow-hidden
                                        ${isToday ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'} ${cellIsPast ? 'opacity-80' : ''}`}>
                                    <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between gap-2">
                                        <span className={`text-[13.5px] font-bold first-letter:uppercase ${isToday ? 'text-indigo-700' : 'text-slate-800'}`}>
                                            {date.toLocaleDateString('uk-UA', { weekday: 'long' })}
                                            <span className="ml-1.5 font-semibold text-slate-400">{date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}</span>
                                        </span>
                                        {peopleCount > 0 && <span className="text-[11.5px] font-semibold text-slate-400 tabular-nums whitespace-nowrap">{peopleCount} люд.</span>}
                                    </div>

                                    {editors.length > 0 && (
                                        <div className="px-3 py-1.5 bg-emerald-50 text-emerald-800 text-[11.5px] font-semibold flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {editors.map(e => e.name).join(', ')} редагує
                                        </div>
                                    )}

                                    <div className="p-2 space-y-1.5 flex-1">
                                        {dayTasks.map((task, i) => {
                                            const isCustom = task.installationId === 'custom';
                                            return (
                                                <div key={i} className={`rounded-lg px-2 py-1.5 ${isCustom ? 'bg-amber-50' : 'bg-indigo-50/70'}`}>
                                                    <div className={`text-[12px] font-semibold leading-snug break-words ${isCustom ? 'text-amber-800' : 'text-slate-800'}`}>
                                                        {isCustom ? (task.notes || 'Без назви') : instName(task.installationId)}
                                                    </div>
                                                    <div className="text-[11.5px] text-slate-500 leading-snug">{task.workers.map(empName).join(', ') || 'без людей'}</div>
                                                </div>
                                            );
                                        })}
                                        {dayTasks.length === 0 && draftTasks.length === 0 && canManageSchedule && (!cellIsPast || canEditPast) && (
                                            <div className="h-full min-h-[56px] flex items-center justify-center text-slate-300"><FaPlus /></div>
                                        )}

                                        {/* Чернетка, яку зараз готують — видно наживо */}
                                        {draftTasks.length > 0 && (
                                            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-2 py-1.5 space-y-1">
                                                <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1">
                                                    <FaSave size={9} /> Чернетка · {nameByEmail(draft.updated_by_email)} · {timeOf(draft.updated_at)}
                                                </div>
                                                {draftTasks.map((t, i) => (
                                                    <div key={i} className="text-[11.5px] leading-snug">
                                                        <span className="font-semibold text-slate-700">{t.installationId === 'custom' ? (t.notes || 'Без назви') : t.installationId ? instName(t.installationId) : 'обʼєкт не вибрано'}</span>
                                                        {t.workers?.length > 0 && <span className="text-slate-500"> — {t.workers.map(empName).join(', ')}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {(offs.length > 0 || visitsMap[dateStr]?.length > 0 || tripsMap[dateStr]?.length > 0) && (
                                        <div className="px-3 py-2 border-t border-slate-100 space-y-0.5 text-[11.5px]">
                                            {tripsMap[dateStr]?.length > 0 && (
                                                <a href={`#/employees?tab=transport&d=${dateStr}`} onClick={e => e.stopPropagation()}
                                                    className="text-indigo-700 font-semibold flex items-start gap-1 leading-snug hover:underline">
                                                    <FaShuttleVan size={10} className="mt-0.5 flex-shrink-0" /> <span className="break-words">{tripsMap[dateStr].join('; ')}</span>
                                                </a>
                                            )}
                                            {visitsMap[dateStr]?.length > 0 && (
                                                <div className="text-emerald-700 font-semibold flex items-center gap-1"><FaRoute size={10} /> {visitsMap[dateStr].length} виїзд(и) у плані</div>
                                            )}
                                            {offs.length > 0 && (
                                                <div className="text-rose-600 leading-snug"><FaUserSlash size={10} className="inline mr-1" />{offs.map(([cid, st]) => `${empName(Number(cid))} (${ABSENCE_SHORT[st] || st})`).join(', ')}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                /* ПО ЛЮДЯХ: рядок — людина, стовпчик — день; одразу видно, хто де і хто вільний */
                <div className="max-w-[1500px] mx-auto p-2 sm:p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Segmented value={peopleFilter} onChange={setPeopleFilter}
                            options={[{ value: 'install', label: 'Монтаж' }, { value: 'office', label: 'Офіс' }, { value: 'all', label: 'Усі' }]} />
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                            <input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="Пошук людини"
                                className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-indigo-400" />
                        </div>
                        <span className="text-[12px] text-slate-500 ml-auto">
                            Вільних сьогодні: <b className="text-slate-800">{freeToday}</b>
                        </span>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                    <th className="px-3 py-2 text-[11px] font-semibold text-slate-500 sticky left-0 bg-slate-50 z-10 w-[190px]">Працівник</th>
                                    {weekDays.map(d => {
                                        const ds = formatDateToYYYYMMDD(d);
                                        const today = ds === formatDateToYYYYMMDD(new Date());
                                        return (
                                            <th key={ds} className={`px-2 py-2 text-[11.5px] font-semibold first-letter:uppercase ${today ? 'text-indigo-700' : 'text-slate-500'}`}>
                                                {d.toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric' })}
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {peopleRows.map(emp => (
                                    <tr key={emp.custom_id} className="hover:bg-slate-50/60">
                                        <td className="px-3 py-2 sticky left-0 bg-white z-10">
                                            <div className="text-[13px] font-semibold text-slate-800 leading-tight">{emp.name}</div>
                                            {emp.position && <div className="text-[11px] text-slate-400 leading-tight">{emp.position}</div>}
                                        </td>
                                        {weekDays.map(d => {
                                            const ds = formatDateToYYYYMMDD(d);
                                            const off = (timeOffMap[ds] || {})[emp.custom_id];
                                            const task = workerDay[ds]?.[emp.custom_id];
                                            return (
                                                <td key={ds} className="px-1.5 py-1.5 align-top cursor-pointer" onClick={() => openDayEditor(d)}>
                                                    {off ? (
                                                        <span className="block rounded-md px-2 py-1 text-[11.5px] font-semibold bg-rose-50 text-rose-700">{ABSENCE_LABEL[off] || off}</span>
                                                    ) : task ? (
                                                        <span className={`block rounded-md px-2 py-1 text-[11.5px] font-semibold leading-snug break-words ${task.installationId === 'custom' ? 'bg-amber-50 text-amber-800' : 'bg-indigo-50 text-indigo-800'}`}>
                                                            {task.installationId === 'custom' ? (task.notes || 'Завдання') : instName(task.installationId)}
                                                        </span>
                                                    ) : (
                                                        <span className="block rounded-md px-2 py-1 text-[11.5px] text-slate-300">—</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {peopleRows.length === 0 && (
                                    <tr><td colSpan={7} className="px-3 py-8 text-center text-[13px] text-slate-400">Нікого не знайдено</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

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
                            className="bg-white w-full h-[100dvh] md:h-full md:w-[600px] shadow-2xl flex flex-col rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none"
                            onClick={e => e.stopPropagation()}
                        >
                            {modalMode === 'view' && liveDraft && (
                                <div className="flex-none px-4 py-2.5 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center gap-2 text-[12.5px] rounded-t-2xl md:rounded-tl-2xl md:rounded-tr-none">
                                    {editorsHere.length > 0
                                        ? <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                                        : <FaSave className="text-amber-500 flex-shrink-0" size={12} />}
                                    <span className="flex-1 min-w-0 text-amber-900">
                                        {editorsHere.length > 0
                                            ? <><b>{editorsHere.map(e => e.name).join(', ')}</b> зараз редагує цей день — чернетку видно наживо</>
                                            : <>Є чернетка: <b>{nameByEmail(liveDraft.updated_by_email)}</b>, {timeOf(liveDraft.updated_at)}</>}
                                    </span>
                                    <button type="button" onClick={() => setShowDraft(v => !v)} className="font-bold text-amber-800 underline underline-offset-2">
                                        {showDraft ? 'Показати збережене' : 'Показати чернетку'}
                                    </button>
                                </div>
                            )}
                            {(modalMode === 'view' || modalMode === 'preview') && (
                                <SchedulePreview 
                                    schedule={modalMode === 'view' && showDraft && liveDraft ? (liveDraft.payload || []) : dayAssignments} 
                                    employees={employees} 
                                    installations={installations} 
                                    isPreviewMode={modalMode === 'preview'}
                                    onEdit={() => setModalMode('edit')}
                                    onSave={handleSaveDay}
                                    onCancel={closeDayEditor}
                                    isSaving={saving}
                                    absentEmployees={absentEmployees}
                                    isPast={isPastDate}
                                    // ПЕРЕДАЄМО ПРАВА В КОМПОНЕНТ ПЕРЕГЛЯДУ
                                    canManageSchedule={canManageSchedule}
                                    canEditPast={canEditPast}
                                    visits={editingDate ? (visitsMap[formatDateToYYYYMMDD(editingDate)] || []) : []}
                                />
                            )}

                            {modalMode === 'edit' && canManageSchedule && (
                                <>
                                    <div className="p-4 border-b flex items-center justify-between bg-white z-20 rounded-t-2xl md:rounded-tl-2xl flex-none shadow-sm">
                                        <button onClick={closeDayEditor} className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full md:hidden">
                                            <FaChevronLeft size={20} />
                                        </button>
                                        <div className="text-center flex-1 md:text-left md:flex-none">
                                            <h3 className="font-bold text-lg text-gray-800">
                                                {editingDate.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })}
                                            </h3>
                                            <p className="text-[12px] text-gray-500">
                                                {autoSave === 'saving' ? 'Зберігаю чернетку…'
                                                    : autoSave === 'saved' ? 'Чернетку збережено — інші менеджери її бачать'
                                                        : autoSave === 'error' ? 'Чернетку не вдалося зберегти'
                                                            : 'Редагування · чернетка зберігається сама'}
                                            </p>
                                            {editorsHere.length > 0 && (
                                                <p className="text-[12px] font-semibold text-amber-700">Також редагує: {editorsHere.map(e => e.name).join(', ')}</p>
                                            )}
                                        </div>
                                        <button onClick={closeDayEditor} className="p-2 bg-gray-100 rounded-full text-gray-500 hover:text-gray-800 shadow-sm hidden md:block"><FaTimes/></button>
                                        <div className="w-10 md:hidden"></div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-6">
                                        {draftNotice && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
                                                <FaSave className="text-amber-500 mt-0.5 flex-shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-amber-800">Знайдено незбережену чернетку</p>
                                                    <p className="text-xs text-amber-700 mb-2">
                                                        Востаннє змінено {new Date(draftNotice.updated_at).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                        {draftNotice.updated_by_email ? ` — ${draftNotice.updated_by_email}` : ''}
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <button onClick={applyDraft} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition-colors">Відновити</button>
                                                        <button onClick={discardDraft} className="px-3 py-1.5 bg-white border border-amber-200 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 transition-colors">Відхилити</button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Швидкий старт: копія попереднього дня + заплановані виїзди */}
                                        <div className="space-y-3">
                                            <button
                                                onClick={handleCopyPreviousDay}
                                                className="w-full py-2.5 bg-white border border-indigo-200 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                                            >
                                                <FaHistory /> Взяти за основу попередній день
                                            </button>
                                            <VisitPlansPanel
                                                visits={editingDate ? (visitsMap[formatDateToYYYYMMDD(editingDate)] || []) : []}
                                                installations={installations}
                                                employees={employees}
                                                schedule={dayAssignments}
                                                onAddVisit={addVisitToSchedule}
                                                canEdit={true}
                                            />
                                        </div>

                                        {/* Секція завдань */}
                                        <div className="space-y-4">
                                            {dayAssignments.length === 0 && (
                                                <div className="text-center py-10 text-gray-400 bg-white rounded-xl border-2 border-dashed border-gray-200">
                                                    <FaBriefcase className="mx-auto text-3xl mb-2 opacity-30" />
                                                    <p className="text-sm font-bold text-gray-500">На цей день ще немає завдань</p>
                                                    <p className="text-xs mt-1 px-6">Натисніть "Додати ще завдання" нижче, щоб обрати об'єкт і призначити людей</p>
                                                </div>
                                            )}
                                            {dayAssignments.map((assign, idx) => (
                                                <div key={assign.id} className={`bg-white p-4 rounded-xl shadow-sm border relative ${validationErrors[idx] ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200'}`}>
                                                    <button onClick={() => removeCard(idx)} className="absolute top-2 right-2 text-gray-300 hover:text-red-500 p-2"><FaTrash size={14}/></button>
                                                    
                                                    <div className="mb-3 pr-6">
                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 block">Завдання #{idx + 1}</label>
                                                        <SearchableSelect 
                                                            options={installationOptions}
                                                            value={assign.installationId}
                                                            onChange={(val) => updateCard(idx, 'installationId', val)}
                                                            placeholder="Оберіть об'єкт..."
                                                            icon={FaBriefcase}
                                                            disabledItems={dayAssignments
                                                                .filter((_, i) => i !== idx)
                                                                .map(a => a.installationId)
                                                                .filter(id => id !== 'custom')
                                                            }
                                                            error={validationErrors[idx]?.installationId}
                                                            showInitialList={true} 
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

                                                    {assign.installationId && assign.installationId !== 'custom' && (
                                                        <div className="mb-3">
                                                            <input
                                                                type="text"
                                                                placeholder="Коментар до завдання (опц.) — що саме робимо..."
                                                                value={assign.notes || ''}
                                                                onChange={(e) => updateCard(idx, 'notes', e.target.value)}
                                                                className="w-full border border-gray-200 bg-gray-50/60 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:bg-white transition-colors"
                                                            />
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
                                        </div>

                                        {/* Секція відсутності */}
                                        <div className="border-t border-gray-200 pt-4">
                                            <QuickAbsenceAdder 
                                                employees={employeesAvailableForAbsence}
                                                date={editingDate}
                                                onAdd={handleQuickAbsence}
                                            />
                                            <AbsentEmployeesList employees={absentEmployees} />
                                        </div>
                                    </div>

                                    <div className="p-4 border-t bg-white sticky bottom-0 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] rounded-b-none md:rounded-b-2xl flex-none flex gap-2">
                                        <button
                                            onClick={saveDraft}
                                            disabled={saving}
                                            className="flex-shrink-0 py-3.5 px-3.5 bg-white border border-gray-200 text-gray-600 rounded-xl font-bold active:scale-95 transition-all flex items-center justify-center gap-1.5 hover:bg-gray-50 disabled:opacity-50 text-xs"
                                            title="Зберегти чернетку — можна продовжити пізніше"
                                        >
                                            <FaSave/> Чернетка
                                        </button>
                                        <button
                                            onClick={handleSwitchToPreview}
                                            className="flex-1 py-3.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 text-base hover:bg-indigo-700"
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