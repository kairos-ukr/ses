import React, { useState, useEffect, useCallback } from "react";
import { 
  FaSolarPanel, FaMoneyBillWave, FaExclamationCircle, 
  FaMapMarkerAlt, FaHardHat, FaCheckCircle, FaBolt, 
  FaUserClock, FaCommentDots, FaArrowRight, FaExternalLinkAlt,
  FaClipboardList, FaTools, FaTasks, FaCalendarDay
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient"; 
import Layout from "./components/Layout"; 
import logo from './rbplogo.png';

// --- ДОВІДНИК ЕТАПІВ ---
const WORKFLOW_STAGES = [
    { value: 'survey', label: 'Тех. огляд' },
    { value: 'waiting_project', label: 'Очікуємо проект' },
    { value: 'project_done', label: 'Проект готовий' },
    { value: 'project_approved', label: 'Проект погоджено' },
    { value: 'kp_done', label: 'КП готове' },
    { value: 'kp_approved', label: 'КП погоджено' },
    { value: 'advance_payment', label: 'Аванс' },
    { value: 'equipment_order', label: 'Замовлення обладнання' },
    { value: 'waiting_equipment', label: 'Очікуємо обладнання' },
    { value: 'materials_packing', label: 'Комплектація' },
    { value: 'protection_packing', label: 'Захист' },
    { value: 'installation_start', label: 'Старт монтажу' },
    { value: 'res_connection', label: 'Підключення РЕС' },
    { value: 'final_settlement', label: 'Розрахунок' },
    { value: 'final_report', label: 'Звіт' },
    { value: 'installation_finish', label: 'Фініш' },
];

// --- HELPERS ---

const getStageLabel = (stageVal) => {
    const stage = WORKFLOW_STAGES.find(s => s.value === stageVal);
    return stage ? stage.label : stageVal;
};

const getProjectProgress = (stageVal) => {
    if (!stageVal) return 0;
    const idx = WORKFLOW_STAGES.findIndex(s => s.value === stageVal);
    if (idx === -1) return 0;
    return Math.round(((idx + 1) / WORKFLOW_STAGES.length) * 100);
};

const formatMoney = (amount) => {
    return (amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
};

// --- COMPONENTS ---

const StatCard = ({ title, value, subValue, icon: Icon, color, isNegative }) => (
    <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-100 flex flex-col justify-between h-full relative overflow-hidden group hover:shadow-md transition-all">
        <div className={`absolute top-0 right-0 p-4 opacity-10 ${color} text-5xl group-hover:scale-110 transition-transform`}><Icon /></div>
        <div>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">{title}</p>
            <h3 className="text-xl sm:text-2xl font-extrabold text-slate-800">{value}</h3>
        </div>
        {subValue && (
            <div className={`mt-2 sm:mt-3 flex items-center gap-1 text-xs font-bold ${isNegative ? 'text-amber-500' : 'text-slate-400'}`}>
                {isNegative && <FaExclamationCircle/>}
                {subValue}
            </div>
        )}
    </div>
);

const TodayWorkRow = ({ item }) => {
    const navigate = useNavigate();
    
    // Ручне завдання
    if (!item.installation) {
        return (
            <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 p-2 rounded-lg bg-slate-50/50">
                <div className="flex flex-col items-center justify-center min-w-[3.5rem] h-10 rounded-lg bg-slate-200 border border-slate-300 text-slate-500 shrink-0">
                    <FaTools className="text-lg"/>
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-700 text-sm truncate">
                        {item.notes || 'Робота без опису'}
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Індивідуальне завдання</span>
                </div>
            </div>
        );
    }

    // Проект
    const project = item.installation;
    const progress = getProjectProgress(project.workflow_stage);
    const stageLabel = getStageLabel(project.workflow_stage);
    const location = project.client?.populated_place;

    const handleMapClick = (e) => {
        e.stopPropagation(); 
        let url = project.gps_link;
        if (!url && project.latitude && project.longitude) {
            url = `https://www.google.com/maps?q=${project.latitude},${project.longitude}`;
        }
        if (!url && location) {
            url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
        }
        if (url) window.open(url, '_blank');
        else alert("Геолокація не вказана");
    };

    return (
        <div 
            onClick={() => navigate(`/project/${project.custom_id}`)}
            className="group flex items-center gap-3 py-3 border-b border-slate-50 last:border-0 hover:bg-indigo-50/30 transition-all p-2 rounded-lg cursor-pointer active:bg-indigo-50"
        >
            <div className="flex flex-col items-center justify-center min-w-[3.5rem] h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 shrink-0 shadow-sm">
                <span className="font-extrabold text-sm leading-none">{Math.round(project.capacity_kw || 0)}</span>
                <span className="text-[9px] font-bold opacity-70 leading-none mt-0.5">кВт</span>
            </div>
            
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-1 gap-2">
                    <h4 className="font-bold text-slate-700 text-sm truncate group-hover:text-indigo-700 transition-colors">
                        {project.name || 'Без назви'} 
                    </h4>
                    <span className="shrink-0 text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        #{project.custom_id}
                    </span>
                </div>
                
                <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-600 w-6 text-right">{progress}%</span>
                </div>
                
                <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium">
                    <button 
                        onClick={handleMapClick}
                        className="flex items-center gap-1 hover:text-blue-600 hover:underline decoration-blue-300 truncate max-w-[55%]"
                    >
                        <FaMapMarkerAlt className="text-red-400 shrink-0"/> 
                        <span className="truncate">{location || 'Локація не вказана'}</span>
                        <FaExternalLinkAlt size={8} className="opacity-0 group-hover:opacity-50 ml-0.5"/>
                    </button>
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100 text-[9px] uppercase tracking-wide">
                        {stageLabel}
                    </span>
                </div>
            </div>
        </div>
    );
};

// Компонент для елемента "Увага" (Універсальний: для Проектів і Задач)
const AttentionItem = ({ item }) => {
    const navigate = useNavigate();
    const isTask = item.type === 'task';

    if (isTask) {
        // Рендер для Мікрозадачі
        const isOverdue = new Date(item.due_date) < new Date(new Date().setHours(0,0,0,0));
        return (
            <div 
                // Якщо є прив'язка до об'єкта - перекидаємо, інакше нікуди (або в задачі)
                onClick={() => item.installation_id && navigate(`/project/${item.installation_custom_id}`)}
                className={`p-3 rounded-xl border-l-4 flex gap-3 mb-2 transition-colors cursor-pointer
                    ${isOverdue ? 'border-red-500 bg-red-50 hover:bg-red-100' : 'border-orange-400 bg-orange-50 hover:bg-orange-100'}
                `}
            >
                <div className={`mt-1 shrink-0 ${isOverdue ? 'text-red-500' : 'text-orange-500'}`}>
                    <FaTasks />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-bold text-slate-800 line-clamp-2 leading-snug">{item.task_text}</p>
                    </div>
                    <div className="flex justify-between items-end mt-1">
                         {item.installation_name ? (
                            <span className="text-[10px] bg-white/60 px-1.5 py-0.5 rounded text-slate-600 truncate max-w-[60%] border border-black/5">
                                {item.installation_name}
                            </span>
                         ) : <span></span>}
                         
                         <span className={`text-[10px] font-bold flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                            <FaCalendarDay size={10}/> 
                            {isOverdue ? 'Термін сплив' : 'Сьогодні'}
                         </span>
                    </div>
                </div>
            </div>
        );
    }

    // Рендер для Проекту (Status/Workflow)
    return (
        <div 
            onClick={() => navigate(`/project/${item.custom_id}`)}
            className="p-3 rounded-xl border-l-4 border-amber-500 bg-amber-50/50 flex gap-3 mb-2 hover:bg-amber-50 transition-colors cursor-pointer"
        >
            <div className="mt-1 text-amber-500 shrink-0"><FaExclamationCircle /></div>
            <div className="min-w-0 flex-1">
                <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-bold text-slate-800 truncate">{item.name} <span className="text-slate-400 font-normal text-xs">#{item.custom_id}</span></p>
                </div>
                <p className="text-xs text-amber-700 font-bold mb-1">{item.attentionReason}</p>
                {item.attentionComment && (
                    <div className="text-xs text-slate-600 italic bg-white p-2 rounded border border-amber-100 flex gap-2 items-start">
                        <FaCommentDots className="mt-0.5 text-amber-300 shrink-0"/>
                        <span className="line-clamp-2">{item.attentionComment}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- MAIN PAGE ---

export default function HomePage() {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ incomeMonth: 0, totalDebt: 0, totalCapacity: 0, workersToday: 0, workersOff: 0 });
    
    const [todayWorkItems, setTodayWorkItems] = useState([]);
    const [attentionItems, setAttentionItems] = useState([]); // Тут тепер і проекти, і задачі
    
    const navigate = useNavigate();

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        const today = new Date();
        const todayISO = today.toISOString().split('T')[0];
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

        try {
            // 1. KPI Queries
            const paymentsReq = supabase.from('payment_history').select('amount').gte('paid_at', firstDayOfMonth);
            const installationsReq = supabase.from('installations').select('id, custom_id, name, status, total_cost, paid_amount, capacity_kw, workflow_stage, workflow_data').neq('status', 'cancelled');
            
            // 2. Work Today
            const workersTodayReq = supabase.from('installation_workers').select(`
                    id, notes, work_date, installation_custom_id,
                    installation:installations (
                        id, custom_id, name, status, capacity_kw, workflow_stage, 
                        gps_link, latitude, longitude,
                        client:clients(populated_place)
                    )
                `).eq('work_date', todayISO);

            // 3. Workers Off
            const offReq = supabase.from('attendance').select('id').eq('work_date', todayISO).in('status', ['OFF', 'VACATION', 'SICK_LEAVE']);

            // 4. MICROTASKS (Нове: Задачі на сьогодні або прострочені)
            const tasksReq = supabase
                .from('microtasks')
                .select(`
                    custom_id, task_text, due_date, status, installation_id, 
                    installation:installations(name, custom_id)
                `)
                .lte('due_date', todayISO) // Менше або дорівнює сьогодні
                .neq('status', 'виконано')
                .neq('status', 'скасовано');

            const [paymentsRes, instRes, workRes, offRes, tasksRes] = await Promise.all([
                paymentsReq, installationsReq, workersTodayReq, offReq, tasksReq
            ]);

            // --- Calculation Logic ---
            const incomeMonth = paymentsRes.data ? paymentsRes.data.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) : 0;
            const workersOff = offRes.data ? offRes.count || offRes.data.length : 0;

            let totalDebt = 0;
            let totalCapacity = 0;
            
            // Збираємо список уваги (Проекти)
            const attentionList = [];

            const allProjects = instRes.data || [];
            allProjects.forEach(inst => {
                const cost = parseFloat(inst.total_cost) || 0;
                const paid = parseFloat(inst.paid_amount) || 0;
                if (cost > paid) totalDebt += (cost - paid);
                totalCapacity += parseFloat(inst.capacity_kw) || 0;

                // Project Alerts
                let reason = null;
                let comment = null;
                if (inst.status === 'on_hold') {
                    reason = "Статус: ПРИЗУПИНЕНО";
                } else if (inst.workflow_stage && inst.workflow_stage.includes('waiting')) {
                    reason = `Застряг на етапі: ${getStageLabel(inst.workflow_stage)}`;
                }
                
                if (reason) {
                    if (inst.workflow_data) {
                        try {
                            const wd = typeof inst.workflow_data === 'string' ? JSON.parse(inst.workflow_data) : inst.workflow_data;
                            if (wd[inst.workflow_stage]?.comment) comment = wd[inst.workflow_stage].comment;
                        } catch (e) {}
                    }
                    attentionList.push({ type: 'project', ...inst, attentionReason: reason, attentionComment: comment });
                }
            });

            // Додаємо список уваги (Задачі)
            const tasks = tasksRes.data || [];
            tasks.forEach(task => {
                attentionList.push({
                    type: 'task',
                    id: task.custom_id,
                    task_text: task.task_text,
                    due_date: task.due_date,
                    installation_name: task.installation?.name,
                    installation_id: task.installation_id,
                    installation_custom_id: task.installation?.custom_id
                });
            });

            // Сортуємо: Спочатку задачі (бо це гаряче), потім проекти
            attentionList.sort((a, b) => {
                if (a.type === 'task' && b.type !== 'task') return -1;
                if (a.type !== 'task' && b.type === 'task') return 1;
                return 0;
            });

            // Work Items
            const rawWorkers = workRes.data || [];
            const uniqueWorkItems = [];
            const processedIds = new Set();
            rawWorkers.forEach(w => {
                if (w.installation && w.installation.custom_id) {
                    if (!processedIds.has(w.installation.custom_id)) {
                        processedIds.add(w.installation.custom_id);
                        uniqueWorkItems.push({ type: 'project', installation: w.installation, notes: w.notes });
                    }
                } else if (w.notes) {
                    uniqueWorkItems.push({ type: 'manual', installation: null, notes: w.notes });
                }
            });

            setStats({ incomeMonth, totalDebt, totalCapacity, workersToday: rawWorkers.length, workersOff });
            setTodayWorkItems(uniqueWorkItems);
            setAttentionItems(attentionList);

        } catch (error) {
            console.error("Dashboard Error:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);

    return (
        <Layout>
            {/* FIX: h-[100dvh] для мобільних браузерів
               FIX: pb-safe для відступу знизу на iPhone
            */}
            <div className="p-4 sm:p-8 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto pb-safe h-[100dvh] flex flex-col box-border">
                
                {/* Header */}
                <div className="flex-none flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                    <div className="flex items-center gap-3">
                        <img src={logo} alt="K-Core Logo" className="h-12 sm:h-12 w-auto" />
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
                                Огляд компанії
                            </h1>
                            <p className="text-slate-500 text-xs sm:text-sm">Оперативний стан на {new Date().toLocaleDateString('uk-UA')}</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 w-full sm:w-auto">
                        <button onClick={() => navigate('/installations')} className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 flex items-center gap-2">
                            <FaHardHat/> <span>Проекти</span>
                        </button>
                        <button onClick={() => navigate('/payments')} className="flex-1 sm:flex-none justify-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2">
                            <FaMoneyBillWave/> <span>Платежі</span>
                        </button>
                    </div>
                </div>

                {/* KPI Cards */}
                <div className="flex-none grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <StatCard title="Надходження" value={formatMoney(stats.incomeMonth)} icon={FaMoneyBillWave} color="text-emerald-500" />
                    <StatCard title="Дебіторка" value={formatMoney(stats.totalDebt)} icon={FaExclamationCircle} color="text-amber-500" isNegative={stats.totalDebt > 0} subValue={stats.totalDebt > 0 ? "Сума боргу" : "Чисто"} />
                    <StatCard title="Персонал" value={stats.workersToday} icon={FaUserClock} color="text-indigo-500" subValue={`${stats.workersOff} вихідні`} />
                    <StatCard title="Потужність" value={`${(stats.totalCapacity / 1000).toFixed(1)} МВт`} icon={FaBolt} color="text-blue-500" subValue={`${stats.totalCapacity.toFixed(0)} кВт`} />
                </div>

                {/* Main Content (Scrollable Area) */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0 pb-4">
                    
                    {/* LEFT: Виконується сьогодні (2/3) */}
                    <div className="lg:col-span-2 flex flex-col h-full min-h-[300px]">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden">
                            <div className="p-4 sm:p-5 border-b border-slate-50 flex justify-between items-center bg-emerald-50/30 flex-none">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                                    <FaClipboardList className="text-emerald-600"/> Виконується сьогодні
                                    <span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{todayWorkItems.length}</span>
                                </h3>
                                <button onClick={() => navigate('/installations')} className="text-xs font-bold text-emerald-600 hover:underline flex items-center gap-1">
                                    Всі об'єкти <FaArrowRight size={10}/>
                                </button>
                            </div>
                            
                            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                                {loading ? (
                                    <div className="space-y-4 animate-pulse">
                                        {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl"></div>)}
                                    </div>
                                ) : todayWorkItems.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {todayWorkItems.map((item, index) => (
                                            <TodayWorkRow key={index} item={item} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                                        <FaCheckCircle className="mb-2 text-3xl opacity-20 text-emerald-500"/>
                                        <p>Сьогодні роботи не заплановано</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: Attention (1/3) */}
                    <div className="flex flex-col h-full min-h-[300px]">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col h-full overflow-hidden">
                            <div className="p-4 sm:p-5 border-b border-slate-50 bg-red-50/30 flex-none">
                                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm sm:text-base">
                                    <FaExclamationCircle className="text-amber-500"/> Оперативна увага
                                    {attentionItems.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full animate-pulse">{attentionItems.length}</span>}
                                </h3>
                            </div>
                            
                            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                                {attentionItems.length > 0 ? (
                                    <div className="flex flex-col gap-2">
                                        {attentionItems.map((item, idx) => (
                                            <AttentionItem key={idx} item={item} />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                        <FaCheckCircle className="text-4xl mb-3 text-emerald-100"/>
                                        <p className="text-sm font-medium text-emerald-600">Все чисто!</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}