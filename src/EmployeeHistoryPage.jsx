import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    FaSearch, FaTimes, FaMapMarkerAlt,
    FaCheckCircle, FaRegClock, FaExternalLinkAlt, FaHistory, FaChevronLeft,
    FaBriefcase, FaClipboardList
} from "react-icons/fa";
import { supabase } from "./supabaseClient";

const formatDateToYYYYMMDD = (date) => {
    const d = new Date(date);
    const offset = d.getTimezoneOffset();
    const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
    return adjustedDate.toISOString().split("T")[0];
};

const STATUS_LABELS = {
    planned: "Заплановано",
    moved: "Перенесено",
    done: "Виконано",
    cancelled: "Скасовано"
};

const RANGE_PRESETS = [
    { id: "7", label: "7 днів" },
    { id: "30", label: "30 днів" },
    { id: "90", label: "90 днів" },
    { id: "all", label: "Весь час" },
    { id: "custom", label: "Свій період" }
];

const EARLIEST_DATE = "2000-01-01";

const SourceBadge = ({ source, status }) => {
    if (source === "actual") {
        return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                <FaCheckCircle size={9} /> Факт
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md whitespace-nowrap">
            <FaRegClock size={9} /> План{status ? ` · ${STATUS_LABELS[status] || status}` : ""}
        </span>
    );
};

const MONTH_LABEL = (iso) => {
    const d = new Date(iso);
    const label = d.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
};

export default function EmployeeHistoryPage() {
    const navigate = useNavigate();
    const [employees, setEmployees] = useState([]);
    const [empSearch, setEmpSearch] = useState("");
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [installationsMap, setInstallationsMap] = useState({});

    const [rangePreset, setRangePreset] = useState("30");
    const [customFrom, setCustomFrom] = useState(() => formatDateToYYYYMMDD(new Date(Date.now() - 29 * 86400000)));
    const [customTo, setCustomTo] = useState(() => formatDateToYYYYMMDD(new Date()));

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadedOnce, setLoadedOnce] = useState(false);

    useEffect(() => {
        const load = async () => {
            const [{ data: empData }, { data: instData }] = await Promise.all([
                supabase.from("employees").select("custom_id, name, position").order("name"),
                supabase.from("installations").select("custom_id, name")
            ]);
            setEmployees(empData || []);
            const iMap = {};
            (instData || []).forEach(i => { iMap[i.custom_id] = i.name; });
            setInstallationsMap(iMap);
        };
        load();
    }, []);

    const filteredEmployees = useMemo(() => {
        if (!empSearch.trim()) return employees;
        const q = empSearch.toLowerCase();
        return employees.filter(e =>
            e.name.toLowerCase().includes(q) ||
            (e.custom_id && e.custom_id.toString().includes(q))
        );
    }, [employees, empSearch]);

    const { dateFrom, dateTo } = useMemo(() => {
        const today = formatDateToYYYYMMDD(new Date());
        if (rangePreset === "custom") return { dateFrom: customFrom, dateTo: customTo };
        if (rangePreset === "all") return { dateFrom: EARLIEST_DATE, dateTo: today };
        const days = parseInt(rangePreset, 10);
        return { dateFrom: formatDateToYYYYMMDD(new Date(Date.now() - (days - 1) * 86400000)), dateTo: today };
    }, [rangePreset, customFrom, customTo]);

    const fetchHistory = useCallback(async () => {
        if (!selectedEmployee) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from("v_employee_work_history")
                .select("event_date, installation_custom_id, source, status, notes")
                .eq("employee_custom_id", selectedEmployee.custom_id)
                .gte("event_date", dateFrom)
                .lte("event_date", dateTo)
                .order("event_date", { ascending: false });
            if (error) throw error;
            setRows(data || []);
        } catch (e) {
            console.error("Помилка завантаження історії:", e);
            setRows([]);
        } finally {
            setLoading(false);
            setLoadedOnce(true);
        }
    }, [selectedEmployee, dateFrom, dateTo]);

    useEffect(() => { fetchHistory(); }, [fetchHistory]);

    const groupedRows = useMemo(() => {
        const groups = [];
        let currentKey = null;
        rows.forEach(r => {
            const key = r.event_date.slice(0, 7);
            if (key !== currentKey) {
                groups.push({ key, label: MONTH_LABEL(r.event_date), items: [] });
                currentKey = key;
            }
            groups[groups.length - 1].items.push(r);
        });
        return groups;
    }, [rows]);

    const stats = useMemo(() => {
        const objects = new Set(rows.filter(r => r.installation_custom_id).map(r => r.installation_custom_id));
        const actualCount = rows.filter(r => r.source === "actual").length;
        return { total: rows.length, objects: objects.size, actualCount };
    }, [rows]);

    const pickEmployee = (emp) => {
        setSelectedEmployee(emp);
        setRows([]);
        setLoadedOnce(false);
    };

    const changeEmployee = () => {
        setSelectedEmployee(null);
        setRows([]);
        setLoadedOnce(false);
        setEmpSearch("");
    };

    return (
        <div className="min-h-full bg-slate-50 pb-24">
            <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/50 shadow-sm px-4 py-3">
                {selectedEmployee ? (
                    <div className="flex items-center gap-2">
                        <button onClick={changeEmployee} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full flex-shrink-0">
                            <FaChevronLeft size={16} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <p className="font-bold text-gray-800 truncate">{selectedEmployee.name}</p>
                            <p className="text-xs text-gray-400 truncate">{selectedEmployee.position || `#${selectedEmployee.custom_id}`}</p>
                        </div>
                    </div>
                ) : (
                    <div className="relative">
                        <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Пошук працівника (ім'я, ID)..."
                            value={empSearch}
                            onChange={e => setEmpSearch(e.target.value)}
                            className="w-full bg-slate-100 border-none rounded-xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                        />
                        {empSearch && (
                            <button onClick={() => setEmpSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                <FaTimes />
                            </button>
                        )}
                    </div>
                )}
            </header>

            <main className="p-4">
                {!selectedEmployee ? (
                    <div className="space-y-1">
                        {filteredEmployees.map(emp => (
                            <button
                                key={emp.custom_id}
                                onClick={() => pickEmployee(emp)}
                                className="w-full text-left px-4 py-3 rounded-xl bg-white shadow-sm border border-gray-100 hover:border-indigo-200 flex items-center justify-between transition-colors active:scale-[0.99]"
                            >
                                <span className="text-sm font-bold text-gray-700">{emp.name}</span>
                                <span className="text-xs text-gray-400">{emp.position || `#${emp.custom_id}`}</span>
                            </button>
                        ))}
                        {filteredEmployees.length === 0 && (
                            <p className="text-xs text-gray-400 text-center py-8">Нікого не знайдено</p>
                        )}
                    </div>
                ) : (
                    <>
                        {/* Пресети діапазону дат */}
                        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar">
                            {RANGE_PRESETS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setRangePreset(p.id)}
                                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${rangePreset === p.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {rangePreset === "custom" && (
                            <div className="flex items-center gap-2 mt-2">
                                <input
                                    type="date"
                                    value={customFrom}
                                    max={customTo}
                                    onChange={e => setCustomFrom(e.target.value)}
                                    className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <span className="text-gray-300 text-xs">—</span>
                                <input
                                    type="date"
                                    value={customTo}
                                    min={customFrom}
                                    onChange={e => setCustomTo(e.target.value)}
                                    className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        )}

                        {/* Зведення */}
                        {!loading && loadedOnce && rows.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 mt-3">
                                <div className="bg-white rounded-xl p-2.5 border border-gray-100 text-center">
                                    <div className="text-lg font-black text-gray-800">{stats.total}</div>
                                    <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wide flex items-center justify-center gap-1"><FaClipboardList size={9}/> Записів</div>
                                </div>
                                <div className="bg-white rounded-xl p-2.5 border border-gray-100 text-center">
                                    <div className="text-lg font-black text-gray-800">{stats.objects}</div>
                                    <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wide flex items-center justify-center gap-1"><FaBriefcase size={9}/> Об'єктів</div>
                                </div>
                                <div className="bg-white rounded-xl p-2.5 border border-gray-100 text-center">
                                    <div className="text-lg font-black text-emerald-600">{stats.actualCount}</div>
                                    <div className="text-[9px] text-gray-400 uppercase font-bold tracking-wide flex items-center justify-center gap-1"><FaCheckCircle size={9}/> Факт</div>
                                </div>
                            </div>
                        )}

                        <div className="mt-4">
                            {loading ? (
                                <div className="space-y-2">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="h-16 bg-white rounded-xl animate-pulse shadow-sm" />
                                    ))}
                                </div>
                            ) : rows.length === 0 && loadedOnce ? (
                                <div className="text-center py-12 text-gray-400">
                                    <FaHistory size={24} className="mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">Немає записів за обраний період</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {groupedRows.map(group => (
                                        <div key={group.key}>
                                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 px-1">{group.label}</p>
                                            <div className="space-y-2">
                                                {group.items.map((r, i) => (
                                                    <div key={i} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex items-start gap-3">
                                                        <div className="text-center flex-shrink-0 w-10">
                                                            <div className="text-lg font-bold text-gray-700 leading-tight">
                                                                {new Date(r.event_date).getDate()}
                                                            </div>
                                                            <div className="text-[9px] text-gray-400 uppercase font-bold">
                                                                {new Date(r.event_date).toLocaleDateString('uk-UA', { weekday: 'short' })}
                                                            </div>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                <SourceBadge source={r.source} status={r.status} />
                                                            </div>
                                                            {r.installation_custom_id ? (
                                                                <button
                                                                    onClick={() => navigate(`/project/${r.installation_custom_id}`)}
                                                                    className="text-sm font-bold text-gray-800 hover:text-indigo-600 flex items-center gap-1.5 transition-colors text-left"
                                                                >
                                                                    <FaMapMarkerAlt className="text-gray-400 flex-shrink-0" size={12} />
                                                                    <span className="truncate">{installationsMap[r.installation_custom_id] || `Об'єкт #${r.installation_custom_id}`}</span>
                                                                    <FaExternalLinkAlt size={9} className="opacity-40 flex-shrink-0" />
                                                                </button>
                                                            ) : (
                                                                <span className="text-sm font-bold text-amber-700">{r.notes || "Завдання поза об'єктом"}</span>
                                                            )}
                                                            {r.installation_custom_id && r.notes && (
                                                                <p className="text-xs text-gray-500 mt-0.5 truncate">{r.notes}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
