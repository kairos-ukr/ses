import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaSearch, FaPlus, FaEllipsisV, FaPhone, FaBirthdayCake,
  FaUserTie, FaHardHat, FaTruck, FaBuilding, FaUser, FaTimes,
  FaCheck, FaSave, FaStickyNote, FaCalendarDay, FaCalendarCheck, FaTags
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
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

const getInitials = (name) => {
    if (!name) return "??";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
};

const getDepartmentColor = (deps) => {
    if (!deps || deps.length === 0) return "bg-slate-500";
    if (deps.includes("Офіс")) return "bg-purple-600";
    if (deps.includes("Монтаж")) return "bg-blue-600";
    if (deps.includes("Водії")) return "bg-orange-500";
    if (deps.includes("Проектування")) return "bg-teal-600";
    return "bg-indigo-500";
};

// --- COMPONENTS ---

// 1. КАРТКА ПРАЦІВНИКА
const EmployeeCard = ({ employee, status, onClick }) => {
    const age = getAge(employee.date_birth);
    const initials = getInitials(employee.name);
    const badgeColor = getDepartmentColor(employee.department);
    const isAvailable = status !== 'OFF' && status !== 'VACATION' && status !== 'SICK_LEAVE';
    
    const departmentStr = employee.department && employee.department.length > 0 
        ? employee.department.join(", ") 
        : "";

    return (
        <motion.div 
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }} 
            onClick={() => onClick(employee)}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative overflow-visible flex items-center gap-4 active:scale-[0.98] transition-transform cursor-pointer group"
        >
            <div className="relative">
                <div className={`w-14 h-14 rounded-2xl ${badgeColor} flex items-center justify-center text-white font-bold text-xl shadow-sm flex-shrink-0`}>
                    {initials}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${isAvailable ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-gray-800 truncate text-base pr-6">
                        {employee.name} 
                        <span className="text-gray-400 font-normal ml-1 text-sm">#{employee.custom_id}</span>
                    </h3>
                </div>
                
                <div className="text-xs text-gray-500 font-medium truncate mb-1">
                    {employee.position || 'Посада не вказана'}
                    {departmentStr && <span className="text-gray-400 mx-1">•</span>}
                    <span className="text-indigo-500">{departmentStr}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {employee.phone && (
                        <a href={`tel:${employee.phone}`} onClick={e => e.stopPropagation()} className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-slate-200 transition-colors">
                            <FaPhone className="text-[10px]" /> {employee.phone}
                        </a>
                    )}
                    {age !== null && (
                        <span className="text-xs text-slate-500 flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                            <FaBirthdayCake className="text-pink-400 text-[10px]" /> {age} р.
                        </span>
                    )}
                </div>
            </div>

            <button 
                onClick={(e) => { e.stopPropagation(); onClick(employee); }}
                className="absolute top-4 right-4 p-2 -mr-2 -mt-2 text-gray-300 hover:text-gray-600 transition-colors"
            >
                <FaEllipsisV size={16} />
            </button>
        </motion.div>
    );
};

// 2. МОДАЛКА
const EmployeeModal = ({ isOpen, onClose, employee, onSave }) => {
    const [formData, setFormData] = useState({
        name: "", phone: "+380", position: "", department: [], skills: [], date_birth: "", notes: ""
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
                notes: employee.notes || ""
            });
        } else {
            setFormData({ name: "", phone: "+380", position: "", department: [], skills: [], date_birth: "", notes: "" });
        }
    }, [employee, isOpen]);

    const handleSave = async () => {
        if (!formData.name.trim()) return;
        setSaving(true);
        await onSave({ ...formData, id: employee?.id, custom_id: employee?.custom_id });
        setSaving(false);
        onClose();
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
    const [employees, setEmployees] = useState([]);
    const [timeOffEntries, setTimeOffEntries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [activeTab, setActiveTab] = useState("Всі");
    const [statsDate, setStatsDate] = useState(new Date()); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingEmployee, setEditingEmployee] = useState(null);

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
                notes: data.notes
            };

            if (data.id) {
                await supabase.from("employees").update(payload).eq("id", data.id);
            } else {
                await supabase.from("employees").insert([payload]);
            }
            fetchData();
        } catch (e) {
            alert("Помилка: " + e.message);
        }
    };

    const openAddModal = () => { setEditingEmployee(null); setIsModalOpen(true); };
    const openEditModal = (emp) => { setEditingEmployee(emp); setIsModalOpen(true); };

    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
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
    }, [employees, searchTerm, activeTab]);

    const stats = useMemo(() => {
        const targetDateStr = formatDateToYYYYMMDD(statsDate);
        
        // Фільтруємо людей, що відповідають поточній вкладці
        const relevantEmployees = employees.filter(emp => {
            if (activeTab === "Всі") return true;
            const empDeps = emp.department || [];
            if (activeTab === "Інше") return empDeps.length === 0;
            return empDeps.includes(activeTab);
        });

        const relevantIds = new Set(relevantEmployees.map(e => e.custom_id));
        const offList = timeOffEntries.filter(e => 
            e.work_date === targetDateStr && relevantIds.has(e.employee_custom_id)
        );
        
        const totalActive = relevantEmployees.length;
        const totalOff = offList.length;
        return { totalAvailable: Math.max(0, totalActive - totalOff), totalOff };
    }, [employees, timeOffEntries, statsDate, activeTab]);

    const toggleStatsDate = () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (formatDateToYYYYMMDD(statsDate) === formatDateToYYYYMMDD(today)) {
            setStatsDate(tomorrow);
        } else {
            setStatsDate(today);
        }
    };
    
    const isTodayStats = formatDateToYYYYMMDD(statsDate) === formatDateToYYYYMMDD(new Date());

    const getEmployeeStatus = (empId) => {
        const todayStr = formatDateToYYYYMMDD(new Date());
        const entry = timeOffEntries.find(e => e.employee_custom_id === empId && e.work_date === todayStr);
        return entry ? entry.status : 'ACTIVE';
    };

    // Оновлені таби без скролу
    const tabs = [
        { id: "Всі", icon: FaUser },
        { id: "Монтаж", icon: FaHardHat },
        { id: "Офіс", icon: FaUserTie },
        { id: "Інше", icon: FaBuilding },
    ];

    return (
        <div className="min-h-screen bg-slate-50 pb-24">
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/50 shadow-sm">
                <div className="px-4 pt-4 pb-2">
                    <div className="flex justify-between items-center mb-4">
                        <h1 className="text-2xl font-bold text-gray-800">Команда</h1>
                        
                        {/* Кнопка статистики */}
                        <button 
                            onClick={toggleStatsDate}
                            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all border active:scale-95 ${isTodayStats ? 'bg-indigo-50 border-indigo-200' : 'bg-orange-50 border-orange-200'}`}
                        >
                            <div className="text-left">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1">
                                    {isTodayStats ? <FaCalendarCheck/> : <FaCalendarDay/>} 
                                    {isTodayStats ? 'План на сьогодні' : 'План на завтра'}
                                </div>
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <span className="text-green-600">{stats.totalAvailable}</span>
                                    <span className="text-gray-300">/</span>
                                    <span className="text-red-500">{stats.totalOff}</span>
                                </div>
                            </div>
                        </button>
                    </div>

                    <div className="relative mb-2">
                        <FaSearch className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Пошук (ім'я, ID, посада)..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-100 border-none rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <FaTimes />
                            </button>
                        )}
                    </div>
                </div>

                {/* ВИПРАВЛЕНО: ТАБИ БЕЗ СКРОЛУ (FLEX-1) */}
                <div className="px-4 pb-2">
                    <div className="flex w-full bg-slate-100 p-1 rounded-xl">
                        {tabs.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-200
                                        ${isActive 
                                            ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' 
                                            : 'text-gray-500 hover:text-gray-700 hover:bg-slate-200/50'}
                                    `}
                                >
                                    <tab.icon className={isActive ? 'text-indigo-600' : 'text-gray-400'} size={14} />
                                    <span>{tab.id}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </header>

            <main className="p-4">
                {loading ? (
                    <div className="space-y-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-20 bg-white rounded-2xl animate-pulse shadow-sm" />
                        ))}
                    </div>
                ) : filteredEmployees.length === 0 ? (
                    <div className="text-center py-12">
                        <h3 className="text-lg font-medium text-gray-600">Нікого не знайдено</h3>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <AnimatePresence>
                            {filteredEmployees.map((emp) => (
                                <EmployeeCard 
                                    key={emp.id} 
                                    employee={emp} 
                                    status={getEmployeeStatus(emp.custom_id)}
                                    onClick={openEditModal} 
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </main>

            <button 
                onClick={openAddModal} 
                className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 text-white rounded-full shadow-2xl shadow-indigo-400/50 flex items-center justify-center hover:bg-indigo-700 active:scale-90 transition-all z-40"
            >
                <FaPlus size={24} />
            </button>

            <AnimatePresence>
                {isModalOpen && (
                    <EmployeeModal 
                        isOpen={isModalOpen} 
                        onClose={() => setIsModalOpen(false)} 
                        employee={editingEmployee}
                        onSave={handleSaveEmployee}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}