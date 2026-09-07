import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaProjectDiagram, FaPlus,
  FaBolt, FaSearch, FaFilter, FaTools, FaMoneyBillWave,
  FaClock, FaCheckCircle, FaExclamationTriangle, FaPause,
  FaChevronLeft, FaChevronRight, FaTrash, FaHardHat,
  FaUserFriends, FaUserTie,
  FaUserEdit, FaExternalLinkAlt,
  FaMapMarkerAlt, FaDraftingCompass, FaFileInvoiceDollar, FaTruckLoading, FaSolarPanel, FaBroadcastTower, FaBoxOpen, FaFileSignature,
  FaInfoCircle, FaBoxes, FaTimes,
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./Layout";
import { useAuth } from "./AuthProvider";
import {
  T, Btn, IconBtn, Chip, Card, Field, Bar, EmptyState, Skeleton,
  Drawer, Picker, useToast, useConfirm, humanError, num,
} from "./ui";

// --- CONSTANTS ---
const PROJECTS_PER_PAGE = 6;
const ALLOWED_COMPANIES = ['Кайрос', 'Розумне збереження енергії'];

const WORKFLOW_STAGES = [
    { value: 'tech_review', label: 'Заміри', icon: FaMapMarkerAlt, tone: 'info' },
    { value: 'project', label: 'Проект', icon: FaDraftingCompass, tone: 'accent' },
    { value: 'proposal', label: 'КП', icon: FaFileInvoiceDollar, tone: 'warn' },
    { value: 'equipment', label: 'Обладнання', icon: FaTruckLoading, tone: 'neutral' },
    { value: 'complectation', label: 'Комплектація', icon: FaBoxOpen, tone: 'info' },
    { value: 'installation', label: 'Монтаж', icon: FaSolarPanel, tone: 'accent' },
    { value: 'grid_connection', label: 'Мережа', icon: FaFileSignature, tone: 'warn' },
    { value: 'monitoring_setup', label: 'Запуск', icon: FaBroadcastTower, tone: 'ok' },
];

const STAGE_ALIASES = {
    'project_design': 'project',
    'commercial_proposal': 'proposal',
    'advance_payment': 'proposal',
    'tech_measurements': 'tech_review',
    'mon_launch_station': 'monitoring_setup'
};

const STATUS_INFO = {
    planning: { label: 'Планування', tone: 'info', icon: FaClock },
    in_progress: { label: 'Виконується', tone: 'accent', icon: FaTools },
    on_hold: { label: 'Призупинено', tone: 'warn', icon: FaPause },
    completed: { label: 'Завершено', tone: 'ok', icon: FaCheckCircle },
    cancelled: { label: 'Скасовано', tone: 'danger', icon: FaExclamationTriangle },
};

const PAYMENT_INFO = {
    pending: { label: 'Очікує оплати', tone: 'warn' },
    partial: { label: 'Часткова оплата', tone: 'info' },
    paid: { label: 'Оплачено', tone: 'ok' },
    overdue: { label: 'Прострочено', tone: 'danger' },
};

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// --- MAIN PAGE ---
export default function ProjectsPage() {
    const { role } = useAuth();
    const canDelete = role === 'admin' || role === 'super_admin' || role === 'office';
    const toast = useToast();
    const confirm = useConfirm();

    const [projects, setProjects] = useState([]);
    const [readiness, setReadiness] = useState({});   // custom_id → % забезпечення (null, якщо специфікації немає)
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const debouncedSearchTerm = useDebounce(searchTerm, 400);

    const [statusFilter, setStatusFilter] = useState("active");
    const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
    const [companyFilter, setCompanyFilter] = useState("all");
    const [showFilters, setShowFilters] = useState(false);

    const [myEmployeeId, setMyEmployeeId] = useState(null);
    const [onlyMyProjects, setOnlyMyProjects] = useState(false);

    const [showProjectForm, setShowProjectForm] = useState(false);
    const [editingProject, setEditingProject] = useState(null);

    const [showInlineClientForm, setShowInlineClientForm] = useState(false);
    const [inlineClient, setInlineClient] = useState({ name: '', company_name: '', phone: '' });

    const [clients, setClients] = useState([]);
    const [employees, setEmployees] = useState([]);

    const initialFormData = {
        name: '', working_company: '', bank: '', client_id: '', gps_link: '',
        mount_type: '', station_type: '', capacity_kw: '',
        responsible_emp_id: '',
        total_cost: '', payment_status: 'pending', paid_amount: '',
        status: 'planning', workflow_stage: 'tech_review',
        quant_phase: '',
        notes: '', creator_email: ''
    };

    const [formData, setFormData] = useState(initialFormData);
    const [formErrors, setFormErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const [currentPage, setCurrentPage] = useState(() => {
        const saved = localStorage.getItem('projectsPage');
        return saved ? parseInt(saved, 10) : 1;
    });
    const [totalCount, setTotalCount] = useState(0);

    // --- Helpers ---
    const updatePaymentStatus = (totalCost, paidAmount) => {
        const cost = parseFloat(totalCost);
        const paid = parseFloat(paidAmount);
        if (!cost || cost <= 0) return 'pending';
        if (!paid || paid < 0) return 'pending';
        const percentage = (paid / cost) * 100;
        if (percentage >= 100) return 'paid';
        if (percentage > 0) return 'partial';
        return 'pending';
    };

    const getStageConfig = (val) => {
        const normalizedKey = STAGE_ALIASES[val] || val;
        return WORKFLOW_STAGES.find(s => s.value === normalizedKey)
            || { label: val || 'Не визначено', tone: 'neutral', icon: FaInfoCircle };
    };

    // --- IDENTIFY EMPLOYEE ---
    useEffect(() => {
        const identifyEmployee = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && user.email) {
                const { data: employee } = await supabase.from('employees').select('custom_id').eq('email', user.email).maybeSingle();
                if (employee) setMyEmployeeId(employee.custom_id);
            }
        };
        identifyEmployee();
    }, []);

    // --- LOAD DICTIONARIES ---
    useEffect(() => {
        const loadStaticData = async () => {
            try {
                const [clientsRes, employeesRes] = await Promise.all([
                    supabase.from('clients').select('custom_id, name, company_name').order('name'),
                    supabase.from('employees').select('custom_id, name, position, email').order('name')
                ]);
                setClients(clientsRes.data || []);
                setEmployees(employeesRes.data || []);
            } catch (error) {
                toast('Помилка завантаження довідників', 'error');
            }
        };
        loadStaticData();
    }, [toast]);

    // --- LOAD PROJECTS ---
    const loadProjects = useCallback(async () => {
        setLoading(true);
        try {
            const from = (currentPage - 1) * PROJECTS_PER_PAGE;
            const to = from + PROJECTS_PER_PAGE - 1;

            // Фільтруємо: відображаємо ТІЛЬКИ НЕ-підряди (is_subcontract = false або null)
            let query = supabase.from('installations')
                .select(`*, client:clients(*), responsible_employee:employees(*)`, { count: 'exact' })
                .or('is_subcontract.eq.false,is_subcontract.is.null');

            if (onlyMyProjects && myEmployeeId) {
                query = query.eq('responsible_emp_id', myEmployeeId);
            }

            if (debouncedSearchTerm && debouncedSearchTerm.trim().length > 0) {
                const term = debouncedSearchTerm.trim();
                const isStrictNumber = /^\d+$/.test(term);
                if (isStrictNumber) {
                    query = query.or(`custom_id.eq.${term},client_id.eq.${term}`);
                } else {
                    query = query.or(`name.ilike.%${term}%,notes.ilike.%${term}%,working_company.ilike.%${term}%`);
                }
            } else {
                if (statusFilter === 'active') {
                    query = query.in('status', ['planning', 'in_progress', 'on_hold']);
                } else if (statusFilter !== 'all') {
                    query = query.eq('status', statusFilter);
                }

                if (paymentStatusFilter !== 'all') query = query.eq('payment_status', paymentStatusFilter);
                if (companyFilter !== 'all') query = query.eq('working_company', companyFilter);
            }

            const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, to);

            if (error) throw error;
            setProjects(data || []);
            setTotalCount(count || 0);

            // Забезпечення по кожному об'єкту цієї сторінки — той самий розрахунок,
            // що й у "Забезпеченні об'єктів": частка покриття по кожній позиції специфікації.
            const ids = (data || []).map(p => p.custom_id);
            if (ids.length) {
                const { data: needs } = await supabase.from('v_object_material_needs')
                    .select('installation_custom_id, required_quantity, reserved_quantity, issued_quantity')
                    .in('installation_custom_id', ids);
                const byObj = new Map();
                (needs || []).forEach(n => {
                    const k = n.installation_custom_id;
                    if (!byObj.has(k)) byObj.set(k, []);
                    byObj.get(k).push(n);
                });
                const map = {};
                ids.forEach(id => {
                    const list = byObj.get(id) || [];
                    if (!list.length) { map[id] = null; return; }
                    let sum = 0;
                    list.forEach(n => {
                        const req = parseFloat(n.required_quantity) || 1;
                        const got = (parseFloat(n.reserved_quantity) || 0) + (parseFloat(n.issued_quantity) || 0);
                        sum += Math.min(100, (got / req) * 100);
                    });
                    map[id] = Math.round(sum / list.length);
                });
                setReadiness(map);
            } else {
                setReadiness({});
            }
        } catch (error) {
            toast(`Помилка: ${error.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [currentPage, statusFilter, paymentStatusFilter, companyFilter, debouncedSearchTerm, toast, onlyMyProjects, myEmployeeId]);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    useEffect(() => {
        localStorage.setItem('projectsPage', currentPage.toString());
    }, [currentPage]);

    // --- Скидання сторінки при зміні фільтрів ---
    const prevFilters = useRef({
        term: debouncedSearchTerm,
        status: statusFilter,
        payment: paymentStatusFilter,
        company: companyFilter,
        mine: onlyMyProjects
    });

    useEffect(() => {
        const p = prevFilters.current;
        const changed =
            p.term !== debouncedSearchTerm ||
            p.status !== statusFilter ||
            p.payment !== paymentStatusFilter ||
            p.company !== companyFilter ||
            p.mine !== onlyMyProjects;

        if (changed) {
            setCurrentPage(1);
            prevFilters.current = {
                term: debouncedSearchTerm,
                status: statusFilter,
                payment: paymentStatusFilter,
                company: companyFilter,
                mine: onlyMyProjects
            };
        }
    }, [debouncedSearchTerm, statusFilter, paymentStatusFilter, companyFilter, onlyMyProjects]);

    // --- Handlers ---
    const handleAddProject = () => {
        setFormData(initialFormData);
        setEditingProject(null);
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
        setShowProjectForm(true);
    };
    const handleEditProject = (project) => {
        setFormData({
            name: project.name || '', working_company: project.working_company || '', bank: project.bank || '',
            client_id: project.client_id || '', gps_link: project.gps_link || '',
            mount_type: project.mount_type || '', station_type: project.station_type || '',
            capacity_kw: project.capacity_kw ?? '', responsible_emp_id: project.responsible_emp_id || '',
            total_cost: project.total_cost ?? '', payment_status: project.payment_status || 'pending',
            paid_amount: project.paid_amount ?? '', status: project.status || 'planning',
            workflow_stage: project.workflow_stage || 'tech_review', quant_phase: project.quant_phase || '',
            notes: project.notes || '', creator_email: project.creator_email || '',
            custom_id: project.custom_id,
        });
        setEditingProject(project);
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
        setShowProjectForm(true);
    };
    const handleCloseForm = () => {
        setShowProjectForm(false);
        setEditingProject(null);
        setFormData(initialFormData);
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
    };
    const handleInputChange = (field, value) => { setFormData(prev => ({ ...prev, [field]: value })); };

    const handleDelete = async (projectId, projectName) => {
        if (!canDelete) {
            toast("У вас немає прав на видалення", "error");
            return;
        }
        const ok = await confirm({
            title: 'Видалити проект?',
            tone: 'danger', confirmLabel: 'Видалити',
            message: `«${projectName}»`,
            details: ['Дію не можна скасувати.'],
        });
        if (!ok) return;
        const { error } = await supabase.from('installations').delete().eq('custom_id', projectId);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Видалено', 'success');
        loadProjects();
    };

    const handleSubmit = async () => {
        setFormErrors({});
        setSubmitting(true);
        try {
            let clientIdToUse = formData.client_id;
            if (!clientIdToUse) {
                const name = (inlineClient.name || '').trim();
                if (!name) {
                    setFormErrors({ client_id: 'Оберіть клієнта або додайте нового' });
                    setSubmitting(false);
                    return;
                }

                const payload = {
                    name,
                    company_name: (inlineClient.company_name || '').trim() || null,
                    phone: (inlineClient.phone || '').trim() || null,
                };

                const { data: created, error: createErr } = await supabase
                    .from('clients')
                    .insert([payload])
                    .select('custom_id, name, company_name')
                    .single();

                if (createErr) throw createErr;
                clientIdToUse = created.custom_id;

                setClients(prev => {
                    const exists = prev.some(c => c.custom_id === created.custom_id);
                    return exists ? prev : [created, ...prev];
                });
            }

            const { client, responsible_employee, custom_id, ...projectData } = formData;
            const sanitized = {
                ...projectData,
                client_id: clientIdToUse,
                payment_status: updatePaymentStatus(projectData.total_cost, projectData.paid_amount),
            };
            for (let key in sanitized) if (sanitized[key] === '') sanitized[key] = null;

            if (editingProject) {
                const { error } = await supabase.from('installations').update(sanitized).eq('custom_id', editingProject.custom_id);
                if (error) throw error;
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) sanitized.creator_email = user.email;
                const { error } = await supabase.from('installations').insert([sanitized]);
                if (error) throw error;
            }

            toast('Збережено', 'success');
            handleCloseForm();
            loadProjects();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const clientOptions = clients.map(c => ({ id: c.custom_id, label: `${c.company_name || c.name} · ID ${c.custom_id}` }));
    const employeeOptions = employees.map(e => ({ id: e.custom_id, label: `${e.name} · ID ${e.custom_id}` }));

    const Pagination = ({ currentPage, totalCount, projectsPerPage, onPageChange }) => {
        const totalPages = Math.ceil(totalCount / projectsPerPage);
        const [inputValue, setInputValue] = useState('');

        if (totalPages <= 1) return null;

        const getPageNumbers = () => {
            const pages = [];
            if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                if (currentPage > 4) pages.push('...');
                const start = Math.max(2, currentPage - 2);
                const end = Math.min(totalPages - 1, currentPage + 2);
                for (let i = start; i <= end; i++) pages.push(i);
                if (currentPage < totalPages - 3) pages.push('...');
                pages.push(totalPages);
            }
            return pages;
        };

        const goToInput = () => {
            const num = parseInt(inputValue, 10);
            if (!isNaN(num) && num >= 1 && num <= totalPages) { onPageChange(num); setInputValue(''); }
        };

        const from = (currentPage - 1) * projectsPerPage + 1;
        const to = Math.min(currentPage * projectsPerPage, totalCount);

        return (
            <div className="flex flex-col items-center gap-3 py-2">
                <p className={T.dim}>
                    Показано <b className="text-slate-700">{from}–{to}</b> із <b className="text-slate-700">{totalCount}</b>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                    <IconBtn variant="outline" icon={FaChevronLeft} label="Попередня"
                        disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)} />
                    {getPageNumbers().map((page, idx) =>
                        page === '...'
                            ? <span key={`e-${idx}`} className="w-8 text-center text-slate-400 text-sm select-none">…</span>
                            : <button key={page} onClick={() => onPageChange(page)}
                                className={`w-8 h-8 flex items-center justify-center rounded-lg text-[12.5px] font-bold transition-all border
                                    ${currentPage === page ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`}>
                                {page}
                            </button>
                    )}
                    <IconBtn variant="outline" icon={FaChevronRight} label="Наступна"
                        disabled={currentPage === totalPages} onClick={() => onPageChange(currentPage + 1)} />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Перейти на:</span>
                    <input type="number" min="1" max={totalPages} value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && goToInput()}
                        placeholder="№" className={`${T.input} w-16 h-8 text-center`} />
                    <Btn size="sm" variant="soft" onClick={goToInput}>OK</Btn>
                </div>
            </div>
        );
    };

    /* ---------------- КАРТКА ОБ'ЄКТА ---------------- */

    const ProjectCard = ({ project }) => {
        const statusInfo = STATUS_INFO[project.status] || { label: project.status || 'Невідомо', tone: 'neutral', icon: FaInfoCircle };
        const paymentInfo = PAYMENT_INFO[project.payment_status] || { label: 'Невідомо', tone: 'neutral' };
        const stageInfo = getStageConfig(project.workflow_stage);
        const StatusIcon = statusInfo.icon;
        const StageIcon = stageInfo.icon || FaInfoCircle;
        const creator = employees.find(e => e.email === project.creator_email);

        const cost = parseFloat(project.total_cost) || 0;
        const paid = parseFloat(project.paid_amount) || 0;
        const debt = Math.max(0, cost - paid);
        const paidPct = cost > 0 ? Math.min(100, (paid / cost) * 100) : 0;

        const readinessPct = readiness[project.custom_id];

        return (
            <Card className="flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div>
                    <div className="flex justify-between items-start gap-3 mb-3">
                        <div className="pr-1 flex-1 min-w-0">
                            <h3 className="text-[14.5px] font-bold text-slate-800 leading-tight line-clamp-2" title={project.name}>
                                {project.name || project.client?.company_name || 'Без назви'}
                            </h3>
                            <span className={`${T.mono} mt-1 inline-block`}>СЕС-{project.custom_id}</span>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <Chip tone={statusInfo.tone} icon={StatusIcon}>{statusInfo.label}</Chip>
                            <Chip tone={stageInfo.tone} icon={StageIcon}>{stageInfo.label}</Chip>
                        </div>
                    </div>

                    <div className="space-y-2 mb-3">
                        <div className="flex items-center gap-2.5 text-[12.5px] text-slate-600">
                            <FaUserFriends className="text-slate-400 flex-shrink-0" size={13} />
                            <span className="font-medium truncate">{project.client?.name || 'Без клієнта'}</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-[12.5px] text-slate-600">
                            <FaBolt className="text-amber-500 flex-shrink-0" size={13} />
                            <span>Потужність: <b className="text-slate-800">{project.capacity_kw ? `${project.capacity_kw} кВт` : '—'}</b></span>
                        </div>
                        <div className="flex items-center gap-2.5 text-[12.5px] text-slate-600">
                            <FaHardHat className="text-indigo-500 flex-shrink-0" size={13} />
                            <span className="truncate">Відповідальний: <b className="text-slate-800">{project.responsible_employee?.name || 'Не призначено'}</b></span>
                        </div>
                        {creator && (
                            <div className="flex items-center gap-2.5 text-[11px] text-slate-400 pt-1.5 mt-1.5 border-t border-slate-100">
                                <FaUserEdit size={12} /><span>Додав: {creator.name}</span>
                            </div>
                        )}
                    </div>

                    {/* Фінанси */}
                    <div className={`${T.inset} px-2.5 py-2 mb-2 space-y-1.5`}>
                        <div className="flex items-center justify-between">
                            <span className={T.label}>Оплата</span>
                            <Chip tone={paymentInfo.tone}>{paymentInfo.label}</Chip>
                        </div>
                        {cost > 0 ? (
                            <>
                                <Bar segments={[{ pct: paidPct, tone: paymentInfo.tone === 'danger' ? 'danger' : 'ok' }]} />
                                <div className="flex items-center justify-between text-[11px] tabular-nums">
                                    <span className="text-slate-500">сплачено <b className="text-slate-800">${num(paid)}</b> з ${num(cost)}</span>
                                    {debt > 0 && <span className="font-bold text-rose-600">борг ${num(debt)}</span>}
                                </div>
                            </>
                        ) : <span className="text-[11px] text-slate-400">Вартість не вказана</span>}
                    </div>

                    {/* Забезпечення матеріалами */}
                    {readinessPct !== null && readinessPct !== undefined && (
                        <div className={`${T.inset} px-2.5 py-2 mb-1 space-y-1.5`}>
                            <div className="flex items-center justify-between">
                                <span className={`${T.label} inline-flex items-center gap-1.5`}><FaBoxes size={10} /> Забезпечення</span>
                                <span className="text-[11px] font-black tabular-nums text-slate-700">{readinessPct}%</span>
                            </div>
                            <Bar segments={[{ pct: readinessPct, tone: readinessPct >= 100 ? 'ok' : readinessPct >= 50 ? 'info' : 'warn' }]} />
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 mt-3 pt-3 flex justify-between items-center">
                    <Btn size="sm" variant="soft" icon={FaUserEdit} onClick={() => handleEditProject(project)}>
                        Редагувати
                    </Btn>
                    <div className="flex items-center gap-1">
                        <a href={`#/project/${project.custom_id}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[11px] font-bold border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors">
                            <FaExternalLinkAlt size={10} /> Деталі
                        </a>
                        {canDelete && (
                            <IconBtn variant="softDanger" icon={FaTrash} label="Видалити"
                                onClick={() => handleDelete(project.custom_id, project.name)} />
                        )}
                    </div>
                </div>
            </Card>
        );
    };

    return (
        <Layout>
            <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">

                {/* --- HEADER --- */}
                <div className="flex flex-col gap-3 flex-none">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Об'єкти</h1>
                            <p className="text-slate-500 text-[13px] mt-0.5">Управління об'єктами СЕС</p>
                        </div>
                        <Btn variant="accent" size="lg" icon={FaPlus} onClick={handleAddProject} className="w-full sm:w-auto">
                            Новий об'єкт
                        </Btn>
                    </div>

                    {/* SEARCH & FILTERS ROW */}
                    <div className="flex flex-col gap-2.5">
                        <div className="relative w-full">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                            <input
                                type="text"
                                placeholder="Пошук (назва або ID)…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`${T.input} h-12 pl-11 text-[14px] shadow-sm`}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-2.5">
                            {myEmployeeId ? (
                                <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center shadow-sm flex-1 sm:flex-none">
                                    <button onClick={() => setOnlyMyProjects(false)} className={`flex-1 sm:flex-none px-4 h-9 rounded-lg text-[12.5px] font-bold transition-all ${!onlyMyProjects ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}>Всі</button>
                                    <button onClick={() => setOnlyMyProjects(true)} className={`flex-1 sm:flex-none px-4 h-9 rounded-lg text-[12.5px] font-bold transition-all flex items-center justify-center gap-2 ${onlyMyProjects ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                                        <FaUserTie className={onlyMyProjects ? "text-white" : "text-slate-400"} size={12} />
                                        <span>Мої</span>
                                    </button>
                                </div>
                            ) : <div></div>}

                            <Btn variant={showFilters ? 'primary' : 'outline'} icon={FaFilter} onClick={() => setShowFilters(!showFilters)} className="flex-shrink-0">
                                Фільтри
                            </Btn>
                        </div>
                    </div>

                    <AnimatePresence>
                        {showFilters && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <Card className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <span className={T.label}>Статус</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {[{ v: 'active', l: 'Активні' }, { v: 'all', l: 'Всі' }, { v: 'planning', l: 'План' }, { v: 'in_progress', l: 'Робота' }, { v: 'on_hold', l: 'Пауза' }, { v: 'completed', l: 'Фініш' }, { v: 'cancelled', l: 'Відміна' }].map((s) => (
                                                <button key={s.v} onClick={() => setStatusFilter(s.v)} className={`px-2.5 h-7 rounded-lg text-[11px] font-bold transition-colors ${statusFilter === s.v ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className={T.label}>Оплата</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {[{ v: 'all', l: 'Всі' }, { v: 'pending', l: 'Очікує' }, { v: 'partial', l: 'Частково' }, { v: 'paid', l: 'Сплачено' }, { v: 'overdue', l: 'Борг' }].map((s) => (
                                                <button key={s.v} onClick={() => setPaymentStatusFilter(s.v)} className={`px-2.5 h-7 rounded-lg text-[11px] font-bold transition-colors ${paymentStatusFilter === s.v ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className={T.label}>Компанія</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {[{ v: 'all', l: 'Всі' }, ...ALLOWED_COMPANIES.map(c => ({v: c, l: c}))].map((c) => (
                                                <button key={c.v} onClick={() => setCompanyFilter(c.v)} className={`px-2.5 h-7 rounded-lg text-[11px] font-bold transition-colors ${companyFilter === c.v ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* --- GRID --- */}
                <div className="flex-1 min-h-[300px]">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} rows={6} />)}
                        </div>
                    ) : projects.length === 0 ? (
                        <Card>
                            <EmptyState icon={FaProjectDiagram} title="Об'єктів не знайдено" hint="Спробуйте змінити фільтри або пошуковий запит." />
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {projects.map((project) => <ProjectCard key={project.custom_id} project={project} />)}
                        </div>
                    )}
                </div>

                <div className="relative pt-2 border-t border-slate-200">
                    <Pagination currentPage={currentPage} totalCount={totalCount} projectsPerPage={PROJECTS_PER_PAGE} onPageChange={setCurrentPage} />
                </div>

                {/* --- ФОРМА: ВИСУВНА ПАНЕЛЬ --- */}
                <Drawer
                    isOpen={showProjectForm} onClose={handleCloseForm}
                    title={editingProject ? 'Редагувати об\'єкт' : 'Новий об\'єкт'}
                    subtitle={editingProject ? `СЕС-${editingProject.custom_id}` : "Заповніть основні дані — решту можна додати пізніше"}
                    size="lg"
                    onSubmit={() => { if (!submitting) handleSubmit(); }}
                    submitHint="зберегти"
                    footer={<>
                        <Btn variant="outline" onClick={handleCloseForm}>Скасувати</Btn>
                        <Btn variant="accent" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Збереження…' : 'Зберегти'}
                        </Btn>
                    </>}
                >
                    <div className="space-y-5">

                        {/* Клієнт */}
                        <div className="space-y-2">
                            <span className={T.label}>Клієнт <span className="text-rose-500">*</span></span>
                            <Picker
                                options={clientOptions}
                                value={formData.client_id}
                                onChange={(v) => { handleInputChange('client_id', v); setFormErrors(p => ({ ...p, client_id: '' })); }}
                                placeholder="Оберіть клієнта…"
                                searchPlaceholder="Пошук клієнта…"
                                icon={FaUserFriends}
                                onAddNew={(q) => { setInlineClient(c => ({ ...c, name: q })); setShowInlineClientForm(true); }}
                                addLabel="Створити клієнта"
                            />
                            {formErrors.client_id && <div className="text-[11px] font-bold text-rose-600">{formErrors.client_id}</div>}

                            {showInlineClientForm && !editingProject && (
                                <div className={`${T.inset} p-3 space-y-2.5`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-bold text-slate-700">Новий клієнт</span>
                                        <IconBtn variant="ghost" icon={FaTimes} label="Прибрати" onClick={() => setShowInlineClientForm(false)} />
                                    </div>
                                    <Field label="Ім'я / назва клієнта" required>
                                        <input className={T.input} value={inlineClient.name}
                                            placeholder="Напр. Петро Іванов або ТОВ «Ромашка»"
                                            onChange={(e) => setInlineClient(p => ({ ...p, name: e.target.value }))} />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <Field label="Компанія">
                                            <input className={T.input} value={inlineClient.company_name}
                                                placeholder="Необов'язково"
                                                onChange={(e) => setInlineClient(p => ({ ...p, company_name: e.target.value }))} />
                                        </Field>
                                        <Field label="Телефон">
                                            <input className={T.input} value={inlineClient.phone}
                                                placeholder="+380…"
                                                onChange={(e) => setInlineClient(p => ({ ...p, phone: e.target.value }))} />
                                        </Field>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Field label="Назва об'єкта">
                            <input className={T.input} value={formData.name || ''}
                                onChange={(e) => handleInputChange('name', e.target.value)} />
                        </Field>

                        {editingProject && (
                            <div className={`${T.inset} p-3 grid grid-cols-1 sm:grid-cols-2 gap-3`}>
                                <Field label="Статус виконання">
                                    <select className={T.select} value={formData.status || ''} onChange={(e) => handleInputChange('status', e.target.value)}>
                                        {Object.entries(STATUS_INFO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                    </select>
                                </Field>
                                <Field label="Етап">
                                    <select className={T.select} value={formData.workflow_stage || 'tech_review'} onChange={(e) => handleInputChange('workflow_stage', e.target.value)}>
                                        {WORKFLOW_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                </Field>
                            </div>
                        )}

                        {/* Параметри станції */}
                        <div className="space-y-2.5">
                            <span className={T.label}>Параметри станції</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Тип монтажу">
                                    <select className={T.select} value={formData.mount_type || ''} onChange={(e) => handleInputChange('mount_type', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        <option value="Дахове кріплення (Скатний дах)">Дахове кріплення (Скатний дах)</option>
                                        <option value="Дахове кріплення (Плоский дах)">Дахове кріплення (Плоский дах)</option>
                                        <option value="Наземне кріплення">Наземне кріплення</option>
                                        <option value="Трекерна система">Трекерна система</option>
                                        <option value="Дах/Земля">Дах/Земля</option>
                                        <option value="Електромонтаж">Електромонтаж</option>
                                        <option value="Інше">Інше</option>
                                    </select>
                                </Field>
                                <Field label="Тип станції">
                                    <select className={T.select} value={formData.station_type || ''} onChange={(e) => handleInputChange('station_type', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        <option value="Мережева">Мережева</option>
                                        <option value="Автономна">Автономна</option>
                                        <option value="Гібридна">Гібридна</option>
                                        <option value="Інвертор + АКБ">Інвертор + АКБ</option>
                                    </select>
                                </Field>
                                <Field label="Потужність (кВт)">
                                    <input type="number" step="0.1" min="0" className={T.input} value={formData.capacity_kw || ''}
                                        onChange={(e) => handleInputChange('capacity_kw', e.target.value)} />
                                </Field>
                                <Field label="К-сть фаз">
                                    <select className={T.select} value={formData.quant_phase || ''} onChange={(e) => handleInputChange('quant_phase', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                                    </select>
                                </Field>
                                <Field label="GPS-посилання" className="sm:col-span-2">
                                    <input type="url" className={T.input} value={formData.gps_link || ''}
                                        onChange={(e) => handleInputChange('gps_link', e.target.value)} />
                                </Field>
                            </div>
                        </div>

                        {/* Відповідальний і компанія */}
                        <div className="space-y-2.5">
                            <span className={T.label}>Відповідальний і компанія</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Відповідальний" className="sm:col-span-2">
                                    <Picker options={employeeOptions} value={formData.responsible_emp_id}
                                        onChange={(v) => handleInputChange('responsible_emp_id', v)}
                                        placeholder="Оберіть працівника…" searchPlaceholder="Пошук…" icon={FaHardHat} />
                                </Field>
                                <Field label="Компанія">
                                    <select className={T.select} value={formData.working_company || ''} onChange={(e) => handleInputChange('working_company', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        {ALLOWED_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                                <Field label="Через банк?">
                                    <select className={T.select} value={formData.bank || ''} onChange={(e) => handleInputChange('bank', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        <option value="Так">Так</option>
                                        <option value="Ні">Ні</option>
                                    </select>
                                </Field>
                            </div>
                        </div>

                        {/* Фінанси */}
                        <div className="space-y-2.5">
                            <span className={`${T.label} inline-flex items-center gap-1.5`}><FaMoneyBillWave size={10} /> Фінанси</span>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="Вартість (USD)">
                                    <input type="number" min="0" step="0.01" className={T.input} value={formData.total_cost || ''}
                                        onChange={(e) => handleInputChange('total_cost', e.target.value)} />
                                </Field>
                                <Field label="Сплачено (USD)">
                                    <input type="number" min="0" step="0.01" className={T.input} value={formData.paid_amount || ''}
                                        onChange={(e) => handleInputChange('paid_amount', e.target.value)} />
                                </Field>
                            </div>
                        </div>

                        <Field label="Примітки">
                            <textarea rows="3" className={`${T.input} h-auto py-2 resize-none`} value={formData.notes || ''}
                                onChange={(e) => handleInputChange('notes', e.target.value)} />
                        </Field>
                    </div>
                </Drawer>
            </div>
        </Layout>
    );
}
