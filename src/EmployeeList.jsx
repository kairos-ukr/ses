import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ui";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaSearch, FaPlus, FaPhone, FaBirthdayCake, FaUserTie, FaHardHat, FaUser, FaTimes,
  FaSave, FaTags, FaEyeSlash, FaEye, FaUserClock, FaTelegramPlane, FaBell, FaThLarge, FaList, FaCar, FaShuttleVan,
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import { hasTelegramIds, hasNotificationSubscriptions, hasLeadTaking } from "./utils/features";

// Що бот надсилає людині особисто понад її власні задачі й нагадування
const NOTIFY_TOPICS = [
  { key: "low_stock", label: "Низькі залишки на складі", hint: "Коли позиція опускається нижче мінімуму, і ранкове зведення о 9:00" },
  { key: "system", label: "Системні повідомлення", hint: "Оцифровка специфікацій, помилки бота, підключення людей до бота" },
  // Після міграції db/2026-10_site_leads.sql; приходить ще й у дзвіночок і пушем
  { key: "site_leads", label: "Нові заявки з сайту", hint: "Щойно клієнт залишив заявку на сайті: ім'я, телефон і що хоче", siteLeads: true },
];
const NO_TOPICS = [];
// --- HELPER FUNCTIONS ---

const getAge = (dateString) => {
  if (!dateString) return null;
  const today = new Date();
  const birthDate = new Date(dateString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
    return adjustedDate.toISOString().split("T")[0];
};

// --- COMPONENTS ---

const DEPT_ACCENT = (deps) => {
    if (!deps || deps.length === 0) return "border-l-slate-300";
    if (deps.includes("Офіс")) return "border-l-violet-500";
    if (deps.includes("Монтаж")) return "border-l-indigo-500";
    if (deps.includes("Водії")) return "border-l-orange-500";
    if (deps.includes("Проектування")) return "border-l-teal-500";
    return "border-l-sky-500";
};

const ABSENCE = { OFF: "Вихідний", VACATION: "Відпустка", SICK_LEAVE: "Лікарняний" };

/** Своє авто / в ремонті і сьогоднішня поїздка — з розділу «Транспорт» */
const CarBadges = ({ car, trip, km }) => (
    <>
        {km > 0 && <span className="h-7 px-2 rounded-lg bg-slate-100 text-slate-700 inline-flex items-center gap-1 font-semibold text-[12px] tabular-nums"><FaCar size={10} className="text-slate-400" /> {Math.round(km).toLocaleString('uk-UA')} км за місяць</span>}
        {car?.status === 'own' && <span className="h-7 px-2 rounded-lg bg-emerald-50 text-emerald-700 inline-flex items-center gap-1 font-semibold text-[12px]"><FaCar size={10} /> своє авто</span>}
        {car?.status === 'repair' && (
            <span className="h-7 px-2 rounded-lg bg-amber-50 text-amber-800 inline-flex items-center gap-1 font-semibold text-[12px]">
                <FaCar size={10} /> авто в ремонті{car.until ? ` до ${new Date(car.until).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}` : ''}
            </span>
        )}
        {trip && <span className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 inline-flex items-start gap-1 font-semibold text-[12px] leading-snug break-words"><FaShuttleVan size={10} className="mt-0.5 flex-shrink-0" /> {trip}</span>}
    </>
);

/** Де людина сьогодні: відсутня / на об'єкті / вільна */
const TodayBadge = ({ today }) => {
    if (today?.absence) return <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-rose-50 text-rose-700 border border-rose-100 text-[11.5px] font-semibold">{ABSENCE[today.absence] || today.absence}</span>;
    if (today?.work) return <span className="inline-flex items-start gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-100 text-[11.5px] font-semibold leading-snug break-words"><FaHardHat size={10} className="mt-0.5 flex-shrink-0" /> {today.work}</span>;
    return <span className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 text-[11.5px] font-semibold">Вільний сьогодні</span>;
};

// 1. КАРТКА ПРАЦІВНИКА — повне ім'я, без скорочень до літер
const EmployeeCard = ({ employee, today, hasTelegram, car, trip, km, onClick }) => {
    const age = getAge(employee.date_birth);
    const isTemporary = employee.employment_type === 'temporary';
    const isHidden = !!employee.hidden_from_list;
    const deps = employee.department || [];

    return (
        <div
            onClick={() => onClick(employee)}
            className={`bg-white rounded-xl border border-l-4 ${DEPT_ACCENT(deps)} p-3.5 cursor-pointer transition-shadow hover:shadow-md flex flex-col gap-2 ${isHidden ? 'border-dashed opacity-70' : 'border-slate-200'}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-[15px] font-bold text-slate-900 leading-snug break-words">{employee.name}</div>
                    <div className="text-[12.5px] text-slate-500 leading-snug">
                        {employee.position || 'Посада не вказана'}
                        {deps.length > 0 && <span className="text-slate-400"> · {deps.join(', ')}</span>}
                    </div>
                </div>
                <span className="text-[11px] text-slate-400 font-mono flex-shrink-0">#{employee.custom_id}</span>
            </div>

            <TodayBadge today={today} />

            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                {employee.phone && (
                    <a href={`tel:${employee.phone}`} onClick={e => e.stopPropagation()}
                        className="h-7 px-2 rounded-lg bg-slate-100 text-slate-700 font-semibold inline-flex items-center gap-1.5 hover:bg-slate-200">
                        <FaPhone size={9} /> {employee.phone}
                    </a>
                )}
                {hasTelegram && <span className="h-7 px-2 rounded-lg bg-sky-50 text-sky-700 inline-flex items-center gap-1 font-semibold"><FaTelegramPlane size={10} /> бот</span>}
                {age !== null && <span className="h-7 px-2 rounded-lg bg-slate-50 text-slate-500 inline-flex items-center gap-1"><FaBirthdayCake size={10} className="text-pink-400" /> {age} р.</span>}
                {isTemporary && <span className="h-7 px-2 rounded-lg bg-amber-50 text-amber-700 inline-flex items-center gap-1 font-semibold"><FaUserClock size={10} /> тимчасовий</span>}
                {isHidden && <span className="h-7 px-2 rounded-lg bg-slate-100 text-slate-500 inline-flex items-center gap-1 font-semibold"><FaEyeSlash size={10} /> прихований</span>}
                <CarBadges car={car} trip={trip} km={km} />
            </div>
        </div>
    );
};

// 2. МОДАЛКА
const EmployeeModal = ({ isOpen, onClose, employee, onSave, telegramReady = false, subscriptionsReady = false, siteLeadsReady = false, subscriptions = NO_TOPICS }) => {
    const [formData, setFormData] = useState({
        name: "", phone: "+380", position: "", department: [], skills: [], date_birth: "", notes: "",
        employment_type: "staff", hidden_from_list: false, telegram_user_id: ""
    });
    const [skillInput, setSkillInput] = useState("");
    const [saving, setSaving] = useState(false);

    const DEPARTMENT_OPTIONS = ["Монтаж", "Офіс", "Водії", "Проектування", "Склад"];

    useEffect(() => {
        if (employee) {
            setFormData({
                name: employee.name || "",
                phone: employee.phone || "+380",
                position: employee.position || "",
                department: employee.department || [],
                skills: employee.skills || [],
                date_birth: employee.date_birth || "",
                notes: employee.notes || "",
                employment_type: employee.employment_type || "staff",
                hidden_from_list: !!employee.hidden_from_list,
                telegram_user_id: employee.telegram_user_id ? String(employee.telegram_user_id) : "",
                subscriptions: [...subscriptions]
            });
        } else {
            setFormData({
                name: "", phone: "+380", position: "", department: [], skills: [], date_birth: "", notes: "",
                employment_type: "staff", hidden_from_list: false, telegram_user_id: "", subscriptions: []
            });
        }
    }, [employee, isOpen, subscriptions]);

    const toggleSubscription = (topic) => {
        setFormData(prev => {
            const current = prev.subscriptions || [];
            return {
                ...prev,
                subscriptions: current.includes(topic) ? current.filter(t => t !== topic) : [...current, topic]
            };
        });
    };

    const setEmploymentType = (type) => {
        setFormData(prev => ({
            ...prev,
            employment_type: type,
            // Тимчасових за замовчуванням ховаємо зі списку команди, але дозволяємо передумати нижче
            hidden_from_list: type === "temporary" ? true : prev.hidden_from_list
        }));
    };

    // Telegram ID — лише цифри; порожньо — бот цій людині не пише
    const telegramInvalid = telegramReady && formData.telegram_user_id.trim() !== ""
        && !/^\d{5,15}$/.test(formData.telegram_user_id.trim());

    const handleSave = async () => {
        if (!formData.name.trim() || telegramInvalid) return;
        setSaving(true);
        const ok = await onSave({ ...formData, id: employee?.id, custom_id: employee?.custom_id });
        setSaving(false);
        // Не вдалося зберегти — форму не закриваємо, щоб не втратити введене
        if (ok !== false) onClose();
    };

    const toggleDepartment = (dep) => {
        setFormData(prev => {
            const exists = prev.department.includes(dep);
            return { ...prev, department: exists ? prev.department.filter(d => d !== dep) : [...prev.department, dep] };
        });
    };

    const addSkill = () => {
        if (skillInput.trim() && !formData.skills.includes(skillInput.trim())) {
            setFormData(prev => ({ ...prev, skills: [...prev.skills, skillInput.trim()] }));
            setSkillInput("");
        }
    };

    const removeSkill = (skillToRemove) => {
        setFormData(prev => ({ ...prev, skills: prev.skills.filter(s => s !== skillToRemove) }));
    };

    const handleSkillKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addSkill();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-6" onClick={onClose}>
            <motion.div 
                initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "tween", ease: "easeOut", duration: 0.25 }}
                className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-white rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800">
                            {employee ? "Редагування" : "Новий працівник"}
                        </h2>
                        {employee && <p className="text-xs text-gray-400">#{employee.custom_id}</p>}
                    </div>
                    <button onClick={onClose} className="p-2 bg-gray-50 rounded-full hover:bg-gray-100 transition">
                        <FaTimes className="text-gray-500" />
                    </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-6">
                    {/* Основне */}
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-700 block">ПІБ *</label>
                        <div className="relative">
                            <FaUser className="absolute top-3.5 left-3 text-gray-400" />
                            <input 
                                type="text" 
                                value={formData.name} 
                                onChange={e => setFormData({...formData, name: e.target.value})} 
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all"
                                placeholder="Іван Іванов"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 block">Телефон</label>
                            <input 
                                type="tel" 
                                value={formData.phone} 
                                onChange={e => setFormData({...formData, phone: e.target.value})} 
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 block">Дата народження</label>
                            <input 
                                type="date" 
                                value={formData.date_birth} 
                                onChange={e => setFormData({...formData, date_birth: e.target.value})} 
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none"
                            />
                        </div>
                    </div>

                    {telegramReady && (
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <FaTelegramPlane className="text-sky-500" /> Telegram ID
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={formData.telegram_user_id}
                                onChange={e => setFormData({ ...formData, telegram_user_id: e.target.value.replace(/\D/g, "") })}
                                className={`w-full px-4 py-3 rounded-xl border outline-none transition-all ${telegramInvalid ? "border-rose-400 bg-rose-50" : "border-gray-200 focus:border-indigo-500"}`}
                                placeholder="Напр. 123456789"
                            />
                            <p className={`text-[11px] ${telegramInvalid ? "text-rose-600" : "text-gray-400"}`}>
                                {telegramInvalid
                                    ? "Telegram ID — від 5 до 15 цифр"
                                    : "Найпростіше: людина відкриває бота, натискає Start і ділиться номером — ID підставиться сам. Вручну — число, а не @нік."}
                            </p>

                            {subscriptionsReady && (
                                <div className="pt-2 space-y-2">
                                    <div className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
                                        <FaBell className="text-sky-500" /> Також надсилати особисто
                                    </div>
                                    {NOTIFY_TOPICS.filter(topic => !topic.siteLeads || siteLeadsReady).map(topic => (
                                        <label key={topic.key} className="flex items-start gap-2.5 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={(formData.subscriptions || []).includes(topic.key)}
                                                onChange={() => toggleSubscription(topic.key)}
                                                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-xs text-gray-700 leading-snug">
                                                <b>{topic.label}</b>
                                                <span className="block text-[11px] text-gray-400">{topic.hint}</span>
                                            </span>
                                        </label>
                                    ))}
                                    {!formData.telegram_user_id && (formData.subscriptions || []).length > 0 && (
                                        <p className="text-[11px] text-amber-600">Без Telegram ID ці повідомлення не дійдуть.</p>
                                    )}
                                    <p className="text-[11px] text-gray-400">
                                        Власні задачі, призначення на етапи й нагадування забезпечення людина отримує завжди.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Робота */}
                    <div className="p-4 bg-slate-50 rounded-xl space-y-5 border border-slate-100">
                        
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Посада</label>
                            <div className="relative">
                                <FaUserTie className="absolute top-3.5 left-3 text-gray-400" />
                                <input 
                                    type="text" 
                                    value={formData.position} 
                                    onChange={e => setFormData({...formData, position: e.target.value})} 
                                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none bg-white"
                                    placeholder="Напр. Головний інженер"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Відділ</label>
                            <div className="flex flex-wrap gap-2">
                                {DEPARTMENT_OPTIONS.map(dep => {
                                    const isActive = formData.department.includes(dep);
                                    return (
                                        <button
                                            key={dep}
                                            onClick={() => toggleDepartment(dep)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                                        >
                                            {dep}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Тип працівника */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">Тип працівника</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEmploymentType("staff")}
                                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${formData.employment_type === "staff" ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300'}`}
                                >
                                    Штатний
                                </button>
                                <button
                                    onClick={() => setEmploymentType("temporary")}
                                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all flex items-center justify-center gap-1.5 ${formData.employment_type === "temporary" ? 'bg-amber-500 text-white border-amber-500 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:border-amber-300'}`}
                                >
                                    <FaUserClock className="text-[11px]" /> Тимчасовий
                                </button>
                            </div>
                            <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={formData.hidden_from_list}
                                    onChange={e => setFormData(prev => ({ ...prev, hidden_from_list: e.target.checked }))}
                                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-xs text-gray-600 flex items-center gap-1.5">
                                    <FaEyeSlash className="text-gray-400" /> Приховати зі списку команди
                                </span>
                            </label>
                            <p className="text-[11px] text-gray-400 pl-6 -mt-1">
                                Не впливає на графік і виїзди — там працівник лишається доступним
                            </p>
                        </div>

                        {/* Навички */}
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700 flex items-center gap-2"><FaTags className="text-indigo-500"/> Навички</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={skillInput} 
                                    onChange={e => setSkillInput(e.target.value)}
                                    onKeyDown={handleSkillKeyDown}
                                    className="flex-1 px-4 py-2 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none bg-white text-sm"
                                    placeholder="Введіть та натисніть +"
                                />
                                <button onClick={addSkill} className="bg-indigo-600 text-white px-4 rounded-xl text-sm font-bold hover:bg-indigo-700 transition">
                                    <FaPlus />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-2">
                                {formData.skills.map((skill, idx) => (
                                    <span key={idx} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-sm font-medium flex items-center gap-2">
                                        {skill}
                                        <button onClick={() => removeSkill(skill)} className="text-indigo-400 hover:text-indigo-900"><FaTimes size={12}/></button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Нотатки */}
                    <div className="pt-2">
                        <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Додаткові нотатки</label>
                        <textarea 
                            rows="2" 
                            value={formData.notes} 
                            onChange={e => setFormData({...formData, notes: e.target.value})} 
                            className="w-full p-3 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none resize-none text-sm bg-gray-50 focus:bg-white transition-colors"
                            placeholder="Інформація..."
                        />
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 flex gap-3 bg-white">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition">Скасувати</button>
                    <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition flex items-center justify-center gap-2">
                        {saving ? "Збереження..." : <><FaSave /> Зберегти</>}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

// 3. ГОЛОВНА СТОРІНКА СПИСКУ ПРАЦІВНИКІВ
export default function EmployeeList() {
    const toast = useToast();
    const [employees, setEmployees] = useState([]);
    const [timeOffEntries, setTimeOffEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("Всі");
    const [showHidden, setShowHidden] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);
    const [view, setView] = useState(() => { try { return localStorage.getItem('kcore.team.view') || 'cards'; } catch { return 'cards'; } });
    const [todayWork, setTodayWork] = useState(() => new Map()); // custom_id → де працює сьогодні
    const [cars, setCars] = useState(() => new Map());           // employees.id → { status, until }
    const [monthKm, setMonthKm] = useState(() => new Map());     // employees.id → км по роботі за місяць
    const [todayTrips, setTodayTrips] = useState(() => new Map()); // custom_id → «водій · Бус» / «у поїздці»
    // Поле Telegram ID з'являється після міграції supply_alerts_bot_ready
    const [telegramReady, setTelegramReady] = useState(false);
    // Що людина отримує від бота особисто — після міграції bot_personal_notifications
    const [subsReady, setSubsReady] = useState(false);
    const [subscriptionRows, setSubscriptionRows] = useState([]);
    // «Нові заявки з сайту» — після міграції site_leads
    const [siteLeadsReady, setSiteLeadsReady] = useState(false);

    useEffect(() => { hasTelegramIds().then(setTelegramReady); }, []);
    useEffect(() => { hasNotificationSubscriptions().then(setSubsReady); }, []);
    useEffect(() => { hasLeadTaking().then(setSiteLeadsReady); }, []);

    useEffect(() => {
        if (!subsReady) return;
        supabase.from("notification_subscriptions").select("employee_id, topic")
            .then(({ data, error }) => { if (!error) setSubscriptionRows(data || []); });
    }, [subsReady]);

    const subscriptionsByEmployee = useMemo(() => {
        const map = new Map();
        subscriptionRows.forEach(row => {
            if (!map.has(row.employee_id)) map.set(row.employee_id, []);
            map.get(row.employee_id).push(row.topic);
        });
        return map;
    }, [subscriptionRows]);

    const fetchData = async () => {
        try {
            const { data: empData } = await supabase.from("employees").select("*").order("name");
            const today = new Date();
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            
            const { data: timeOffData } = await supabase
                .from("attendance")
                .select("*")
                .gte("work_date", formatDateToYYYYMMDD(today))
                .lte("work_date", formatDateToYYYYMMDD(nextMonth));

            setEmployees(empData || []);
            setTimeOffEntries(timeOffData || []);

            // Хто де сьогодні за графіком
            const { data: workToday } = await supabase.from('installation_workers')
                .select('employee_custom_id, installation_custom_id, notes').eq('work_date', formatDateToYYYYMMDD(today));
            const ids = [...new Set((workToday || []).map(w => w.installation_custom_id).filter(Boolean))];
            const { data: insts } = ids.length ? await supabase.from('installations').select('custom_id, name').in('custom_id', ids) : { data: [] };
            const nameOf = new Map((insts || []).map(i => [i.custom_id, i.name]));
            setTodayWork(new Map((workToday || []).map(w => [w.employee_custom_id, w.installation_custom_id ? (nameOf.get(w.installation_custom_id) || `Об'єкт #${w.installation_custom_id}`) : (w.notes || 'Завдання')])));

            // Транспорт: власні авто й сьогоднішні поїздки («Працівники → Транспорт»)
            const monthFrom = `${formatDateToYYYYMMDD(today).slice(0, 7)}-01`;
            const [carRes, tripRes, kmRes] = await Promise.all([
                supabase.from('employee_cars').select('employee_id, status, until'),
                supabase.from('trips').select('driver_custom_id, crew, own_car_custom_id, vehicle:vehicles(name), stops:trip_stops(id)')
                    .eq('trip_date', formatDateToYYYYMMDD(today)).neq('status', 'cancelled'),
                supabase.from('car_mileage').select('employee_id, work_km').gte('log_date', monthFrom),
            ]);
            setCars(new Map((carRes.data || []).map(c => [c.employee_id, c])));
            const kmMap = new Map();
            (kmRes.data || []).forEach(r => kmMap.set(r.employee_id, (kmMap.get(r.employee_id) || 0) + (Number(r.work_km) || 0)));
            setMonthKm(kmMap);
            const tripMap = new Map();
            (tripRes.data || []).forEach(t => {
                const what = `${t.vehicle?.name || (t.own_car_custom_id ? 'власне авто' : 'поїздка')} · ${t.stops?.length || 0} зуп.`;
                if (t.driver_custom_id != null) tripMap.set(Number(t.driver_custom_id), `за кермом: ${what}`);
                (t.crew || []).forEach(c => { if (!tripMap.has(Number(c))) tripMap.set(Number(c), `у поїздці: ${what}`); });
            });
            setTodayTrips(tripMap);
        } catch (error) {
            console.error("Error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleSaveEmployee = async (data) => {
        try {
            const payload = {
                name: data.name,
                phone: data.phone,
                position: data.position,
                department: data.department,
                skills: data.skills,
                date_birth: data.date_birth || null,
                notes: data.notes,
                employment_type: data.employment_type || "staff",
                hidden_from_list: !!data.hidden_from_list
            };
            // Поле надсилаємо лише після міграції — інакше «column does not exist»
            if (telegramReady) {
                const tg = (data.telegram_user_id || "").trim();
                payload.telegram_user_id = tg ? Number(tg) : null;
            }

            const { data: saved, error } = data.id
                ? await supabase.from("employees").update(payload).eq("id", data.id).select("id").single()
                : await supabase.from("employees").insert([payload]).select("id").single();
            if (error) {
                toast(error.code === "23505" && /telegram/i.test(error.message || "")
                    ? "Цей Telegram ID уже вказано в іншого працівника."
                    : "Помилка: " + error.message, 'error');
                return false;
            }

            // Сповіщення живуть в окремій таблиці: новому працівнику — лише коли вже є його id
            const employeeId = saved?.id ?? data.id;
            if (subsReady && employeeId) {
                const wanted = data.subscriptions || [];
                const keep = wanted.length ? `(${wanted.map(t => `"${t}"`).join(",")})` : '("")';
                const { error: delError } = await supabase.from("notification_subscriptions")
                    .delete().eq("employee_id", employeeId).not("topic", "in", keep);
                const { error: addError } = wanted.length
                    ? await supabase.from("notification_subscriptions")
                        .upsert(wanted.map(topic => ({ employee_id: employeeId, topic })),
                            { onConflict: "employee_id,topic", ignoreDuplicates: true })
                    : { error: null };

                if (delError || addError) {
                    toast("Працівника збережено, але не вдалося оновити сповіщення: " + (delError || addError).message, 'error');
                } else {
                    setSubscriptionRows(prev => [
                        ...prev.filter(r => r.employee_id !== employeeId),
                        ...wanted.map(topic => ({ employee_id: employeeId, topic })),
                    ]);
                }
            }

            fetchData();
            return true;
        } catch (e) {
            toast("Помилка: " + e.message, 'error');
            return false;
        }
    };

    // Доступи → «Команда»: додавати й змінювати працівників
    const { can } = useAuth();
    const canAddEmp = can('team', 'add');
    const openAddModal = () => { if (!canAddEmp) return; setEditingEmployee(null); setIsModalOpen(true); };
    const openEditModal = (emp) => { if (!can('team', 'edit')) return; setEditingEmployee(emp); setIsModalOpen(true); };

    const hiddenCount = useMemo(
        () => employees.filter(emp => emp.hidden_from_list).length,
        [employees]
    );

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            if (!showHidden && emp.hidden_from_list) return false;

            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
                emp.name.toLowerCase().includes(searchLower) ||
                (emp.phone && emp.phone.includes(searchLower)) ||
                (emp.position && emp.position.toLowerCase().includes(searchLower)) ||
                (emp.custom_id && emp.custom_id.toString().includes(searchLower));

            if (!matchesSearch) return false;

            if (activeTab === "Всі") return true;
            const empDeps = emp.department || [];
            if (activeTab === "Інше") return empDeps.length === 0;
            return empDeps.includes(activeTab);
        });
    }, [employees, searchTerm, activeTab, showHidden]);


    const getEmployeeStatus = (empId) => {
        const todayStr = formatDateToYYYYMMDD(new Date());
        const entry = timeOffEntries.find(e => e.employee_custom_id === empId && e.work_date === todayStr);
        return entry ? entry.status : 'ACTIVE';
    };

    // Де кожен сьогодні: відсутній / на якому об'єкті
    const todayOf = (emp) => {
        const st = getEmployeeStatus(emp.custom_id);
        if (st !== 'ACTIVE') return { absence: st };
        const w = todayWork.get(emp.custom_id);
        return w ? { work: w } : {};
    };

    const deptCount = (id) => employees.filter(emp => (showHidden || !emp.hidden_from_list) && (
        id === "Всі" ? true : id === "Інше" ? !(emp.department || []).length : (emp.department || []).includes(id)
    )).length;

    const tabs = [
        { id: "Всі", label: "Усі" },
        { id: "Монтаж", label: "Монтаж" },
        { id: "Офіс", label: "Офіс" },
        { id: "Інше", label: "Інше" },
    ];

    const setViewMode = (v) => { setView(v); try { localStorage.setItem('kcore.team.view', v); } catch { /* немає сховища */ } };

    // Підсумок дня по видимих людях
    const summary = useMemo(() => {
        const list = employees.filter(e => !e.hidden_from_list);
        let atWork = 0, absent = 0, free = 0;
        list.forEach(e => {
            const t = todayOf(e);
            if (t.absence) absent += 1; else if (t.work) atWork += 1; else free += 1;
        });
        return { atWork, absent, free };
    }, [employees, timeOffEntries, todayWork]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="min-h-full bg-slate-50 pb-24 lg:pb-8">
            <div className="max-w-[1500px] mx-auto p-3 sm:p-5 space-y-3">
                {/* Заголовок і підсумок дня */}
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight mr-auto">Команда</h1>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                        <span className="h-8 px-3 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-800 font-semibold inline-flex items-center gap-1.5"><FaHardHat size={11} /> на об'єктах {summary.atWork}</span>
                        <span className="h-8 px-3 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-800 font-semibold inline-flex items-center">вільні {summary.free}</span>
                        <span className="h-8 px-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 font-semibold inline-flex items-center">відсутні {summary.absent}</span>
                    </div>
                    {canAddEmp && <button onClick={openAddModal}
                        className="hidden sm:inline-flex h-9 px-3.5 rounded-lg bg-indigo-600 text-white text-[13px] font-bold items-center gap-2 hover:bg-indigo-700">
                        <FaPlus size={11} /> Додати
                    </button>}
                </div>

                {/* Панель: відділ, пошук, вигляд */}
                <div className="bg-white rounded-xl border border-slate-200 p-2 flex flex-wrap items-center gap-2">
                    <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        {tabs.map(tab => (
                            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                                className={`h-8 px-3 rounded-md text-[12.5px] font-bold inline-flex items-center gap-1.5 ${activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                                {tab.label}<span className="text-[11px] font-semibold text-slate-400 tabular-nums">{deptCount(tab.id)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1 min-w-[180px]">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                        <input type="text" placeholder="Ім'я, телефон, посада або ID" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-9 pl-8 pr-8 rounded-lg border border-slate-200 bg-white text-[13px] outline-none focus:border-indigo-400" />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm("")} aria-label="Очистити" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700"><FaTimes size={11} /></button>
                        )}
                    </div>
                    {hiddenCount > 0 && (
                        <button onClick={() => setShowHidden(v => !v)}
                            className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${showHidden ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                            {showHidden ? <FaEye size={11} /> : <FaEyeSlash size={11} />} Приховані {hiddenCount}
                        </button>
                    )}
                    <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button type="button" onClick={() => setViewMode('cards')} aria-label="Картками"
                            className={`w-8 h-8 rounded-md flex items-center justify-center ${view === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><FaThLarge size={12} /></button>
                        <button type="button" onClick={() => setViewMode('table')} aria-label="Таблицею"
                            className={`w-8 h-8 rounded-md flex items-center justify-center ${view === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><FaList size={12} /></button>
                    </div>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-36 bg-white rounded-xl border border-slate-200 animate-pulse" />)}
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-[14px] text-slate-500">Нікого не знайдено</div>
                ) : view === 'cards' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                        {filteredEmployees.map(emp => (
                            <EmployeeCard key={emp.id} employee={emp} today={todayOf(emp)} hasTelegram={!!emp.telegram_user_id}
                                car={cars.get(emp.id)} trip={todayTrips.get(Number(emp.custom_id))} km={monthKm.get(emp.id)} onClick={openEditModal} />
                        ))}
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
                        <table className="w-full min-w-[820px] text-left">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                                    <th className="px-3 py-2">Працівник</th>
                                    <th className="px-3 py-2">Відділ</th>
                                    <th className="px-3 py-2">Телефон</th>
                                    <th className="px-3 py-2">Сьогодні</th>
                                    <th className="px-3 py-2">Бот</th>
                                    <th className="px-3 py-2">Оформлення</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredEmployees.map(emp => (
                                    <tr key={emp.id} onClick={() => openEditModal(emp)} className={`cursor-pointer hover:bg-indigo-50/40 ${emp.hidden_from_list ? 'opacity-60' : ''}`}>
                                        <td className="px-3 py-2">
                                            <div className="text-[13.5px] font-semibold text-slate-900">{emp.name} <span className="text-[11px] font-mono text-slate-400">#{emp.custom_id}</span></div>
                                            <div className="text-[12px] text-slate-500">{emp.position || '—'}</div>
                                        </td>
                                        <td className="px-3 py-2 text-[12.5px] text-slate-600">{(emp.department || []).join(', ') || '—'}</td>
                                        <td className="px-3 py-2 text-[12.5px] whitespace-nowrap">
                                            {emp.phone ? <a href={`tel:${emp.phone}`} onClick={e => e.stopPropagation()} className="text-indigo-600 font-semibold hover:underline">{emp.phone}</a> : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-3 py-2 max-w-[260px]">
                                            <div className="flex flex-wrap gap-1"><TodayBadge today={todayOf(emp)} /><CarBadges car={cars.get(emp.id)} trip={todayTrips.get(Number(emp.custom_id))} km={monthKm.get(emp.id)} /></div>
                                        </td>
                                        <td className="px-3 py-2">{emp.telegram_user_id ? <FaTelegramPlane className="text-sky-500" /> : <span className="text-slate-300">—</span>}</td>
                                        <td className="px-3 py-2 text-[12.5px] text-slate-600">{emp.employment_type === 'temporary' ? 'тимчасовий' : 'штат'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {canAddEmp && (
                <button
                    onClick={openAddModal}
                    aria-label="Додати працівника"
                    className="sm:hidden fixed bottom-20 right-4 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-all z-40"
                >
                    <FaPlus size={22} />
                </button>
            )}

            <AnimatePresence>
                {isModalOpen && (
                    <EmployeeModal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        employee={editingEmployee}
                        onSave={handleSaveEmployee}
                        telegramReady={telegramReady}
                        subscriptionsReady={subsReady}
                        siteLeadsReady={siteLeadsReady}
                        subscriptions={subscriptionsByEmployee.get(editingEmployee?.id) || NO_TOPICS}
                    />
                )}
            </AnimatePresence>
        </div>
    );

}