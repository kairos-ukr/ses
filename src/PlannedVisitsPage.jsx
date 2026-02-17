import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCalendarAlt,
  FaPlus,
  FaTimes,
  FaSearch,
  FaExchangeAlt,
  FaCheckCircle,
  FaBan,
  FaUser,
  FaBolt,
  FaMapMarkerAlt,
  FaExternalLinkAlt,
  FaExclamationTriangle,
} from "react-icons/fa";
import Layout from "./Layout";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";

// --- CONSTANTS & UTILS ---

const DAY_WINDOW = 14;

const toISODate = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const formatDayMonth = (iso) => {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
};

const getDayName = (iso) => {
  const date = new Date(iso);
  return date.toLocaleDateString("uk-UA", { weekday: "long" });
};

// --- COMPONENTS ---

const StatusBadge = ({ status }) => {
  const map = {
    planned: { label: "Заплановано", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    done: { label: "Виконано", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    cancelled: { label: "Скасовано", cls: "bg-slate-100 text-slate-500 border-slate-200 line-through" },
    moved: { label: "Перенесено", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  };
  const cfg = map[status] || { label: status, cls: "bg-slate-50 text-slate-700 border-slate-200" };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
};

const ModalShell = ({ isOpen, onClose, title, subtitle, children }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h3 className="text-lg font-bold text-slate-900 leading-tight">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <FaTimes />
            </button>
          </div>
          <div className="p-5 overflow-y-auto">{children}</div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

const ConfirmationModal = ({ config, onClose }) => {
  if (!config) return null;
  const isDanger = config.type === "danger";

  return (
    <ModalShell isOpen={!!config} onClose={onClose} title={config.title}>
      <div className="flex flex-col items-center text-center space-y-4 pt-2">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isDanger ? "bg-rose-100 text-rose-600" : "bg-emerald-100 text-emerald-600"}`}>
          {isDanger ? <FaExclamationTriangle size={24} /> : <FaCheckCircle size={24} />}
        </div>
        <p className="text-slate-600 text-sm px-4">{config.text}</p>

        <div className="flex w-full gap-3 pt-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors"
          >
            Ні, назад
          </button>
          <button
            onClick={() => {
              config.onConfirm();
              onClose();
            }}
            className={`flex-1 py-3 rounded-xl text-white font-bold text-sm shadow-md transition-colors ${
              isDanger ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            Так, підтвердити
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

// --- MAIN PAGE ---

export default function PlannedVisitsPage() {
  const { user } = useAuth();
  const createdByEmail = user?.email || null;

  const todayISO = useMemo(() => toISODate(new Date()), []);
  const endISO = useMemo(() => toISODate(addDays(new Date(), DAY_WINDOW - 1)), []);

  // Data State
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((type, text) => {
    setToast({ type, text });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState(null);

  // Add Form
  const [addDate, setAddDate] = useState(todayISO);
  const [addReason, setAddReason] = useState("");
  const [addComment, setAddComment] = useState("");

  // Mode (installation/custom)
  const [addMode, setAddMode] = useState("installation"); // "installation" | "custom"
  const [customTitle, setCustomTitle] = useState("");

  // Search installations
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [options, setOptions] = useState([]);
  const [selectedInst, setSelectedInst] = useState(null);
  const programmaticQSet = useRef(false);

  // Employees selection (used for Add modal and Team modal)
  const [empQ, setEmpQ] = useState("");
  const [empSearching, setEmpSearching] = useState(false);
  const [empOptions, setEmpOptions] = useState([]);
  const [selectedEmployees, setSelectedEmployees] = useState([]); // [{id, custom_id, name, email}]

  // Team modal state
  const [teamTarget, setTeamTarget] = useState(null);
  const [teamQ, setTeamQ] = useState("");
  const [teamSearching, setTeamSearching] = useState(false);
  const [teamOptions, setTeamOptions] = useState([]);
  const [teamSelected, setTeamSelected] = useState([]); // same shape

  // Move Form
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveNewDate, setMoveNewDate] = useState(todayISO);
  const [moveReason, setMoveReason] = useState("перенесено");
  const [moveComment, setMoveComment] = useState("");
  const [saving, setSaving] = useState(false);

  // --- HELPERS: employee search (server-side) ---
  const searchEmployeesByName = useCallback(async (term) => {
    const s = term.trim();
    if (s.length < 2) return [];
    const { data, error } = await supabase
      .from("employees")
      .select("id, custom_id, name, email")
      .ilike("name", `%${s}%`)
      .order("name", { ascending: true })
      .limit(10);

    if (error) throw error;
    return data || [];
  }, []);

  // --- FETCHING ---
  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data: plansData, error: plansError } = await supabase
        .from("installation_visit_plan_with_employees")
        .select("*")
        .gte("planned_date", todayISO)
        .lte("planned_date", endISO)
        .in("status", ["planned"])
        .order("planned_date", { ascending: true });

      if (plansError) throw plansError;

      if (!plansData || plansData.length === 0) {
        setPlans([]);
        setLoading(false);
        return;
      }

      const installationIds = [
        ...new Set(plansData.map((p) => p.installation_custom_id).filter((x) => x !== null && x !== undefined)),
      ];

      let installationsMap = {};
      let clientIds = [];

      if (installationIds.length > 0) {
        const { data: instData, error: instError } = await supabase
          .from("installations")
          .select("custom_id, name, capacity_kw, priority, gps_link, client_id")
          .in("custom_id", installationIds);

        if (instError) throw instError;
        if (instData) {
          instData.forEach((i) => {
            installationsMap[i.custom_id] = i;
            if (i.client_id) clientIds.push(i.client_id);
          });
        }
      }

      let clientsMap = {};
      const uniqueClientIds = [...new Set(clientIds)];
      if (uniqueClientIds.length > 0) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("custom_id, populated_place")
          .in("custom_id", uniqueClientIds);

        if (clientData) {
          clientData.forEach((c) => {
            clientsMap[c.custom_id] = c.populated_place;
          });
        }
      }

      const emails = [...new Set(plansData.map((p) => p.created_by_email).filter(Boolean))];
      let employeesMapByEmail = {};
      if (emails.length > 0) {
        const { data: empData } = await supabase
          .from("employees")
          .select("name, email")
          .in("email", emails);

        if (empData) {
          empData.forEach((e) => {
            employeesMapByEmail[e.email] = e.name;
          });
        }
      }

      const mergedData = plansData.map((plan) => {
        const inst = plan.installation_custom_id != null ? installationsMap[plan.installation_custom_id] : null;
        const clientPlace = inst?.client_id ? clientsMap[inst.client_id] : null;

        return {
          ...plan,
          installations: inst
            ? {
                ...inst,
                client_populated_place: clientPlace,
              }
            : null,
          creator_name: employeesMapByEmail[plan.created_by_email] || plan.created_by_email,
          employees: Array.isArray(plan.employees) ? plan.employees : [],
        };
      });

      setPlans(mergedData);
    } catch (e) {
      console.error("Fetch Error:", e);
      notify("err", "Не вдалося завантажити план");
    } finally {
      setLoading(false);
    }
  }, [todayISO, endISO, notify]);

  useEffect(() => {
    fetchPlans();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [fetchPlans]);

  // --- SEARCH installations ---
  useEffect(() => {
    if (addMode !== "installation") return;

    if (programmaticQSet.current) {
      programmaticQSet.current = false;
      return;
    }
    const s = q.trim();
    if (s.length < 2) {
      setOptions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        let query = supabase
          .from("installations")
          .select("custom_id, name, capacity_kw, priority, gps_link, client_id")
          .limit(10);

        if (/^\d+$/.test(s)) {
          query = query.eq("custom_id", parseInt(s, 10));
        } else {
          query = query.ilike("name", `%${s}%`);
        }

        const { data, error } = await query;
        if (error) throw error;
        setOptions(data || []);
      } catch (e) {
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [q, addMode]);

  // --- SEARCH employees for ADD modal (server-side, by name) ---
  useEffect(() => {
    if (!isAddOpen) return;
    const s = empQ.trim();
    if (s.length < 2) {
      setEmpOptions([]);
      setEmpSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setEmpSearching(true);
      try {
        const data = await searchEmployeesByName(s);
        const selectedIds = new Set(selectedEmployees.map((x) => x.id));
        setEmpOptions((data || []).filter((x) => !selectedIds.has(x.id)));
      } catch (e) {
        setEmpOptions([]);
      } finally {
        setEmpSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [empQ, isAddOpen, searchEmployeesByName, selectedEmployees]);

  // --- SEARCH employees for TEAM modal (server-side, by name) ---
  useEffect(() => {
    if (!isTeamOpen) return;
    const s = teamQ.trim();
    if (s.length < 2) {
      setTeamOptions([]);
      setTeamSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setTeamSearching(true);
      try {
        const data = await searchEmployeesByName(s);
        const selectedIds = new Set(teamSelected.map((x) => x.id));
        setTeamOptions((data || []).filter((x) => !selectedIds.has(x.id)));
      } catch (e) {
        setTeamOptions([]);
      } finally {
        setTeamSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [teamQ, isTeamOpen, searchEmployeesByName, teamSelected]);

  const addEmployeeToSelection = (emp) => {
    if (!emp?.id) return;
    setSelectedEmployees((prev) => {
      if (prev.some((x) => x.id === emp.id)) return prev;
      return [...prev, emp];
    });
    setEmpQ("");
    setEmpOptions([]);
  };

  const removeEmployeeFromSelection = (id) => {
    setSelectedEmployees((prev) => prev.filter((x) => x.id !== id));
  };

  const addEmployeeToTeam = (emp) => {
    if (!emp?.id) return;
    setTeamSelected((prev) => {
      if (prev.some((x) => x.id === emp.id)) return prev;
      return [...prev, emp];
    });
    setTeamQ("");
    setTeamOptions([]);
  };

  const removeEmployeeFromTeam = (id) => {
    setTeamSelected((prev) => prev.filter((x) => x.id !== id));
  };

  // --- ACTIONS ---

  const handleCreate = async () => {
    if (!addDate) return notify("err", "Вкажіть дату");

    if (addMode === "installation") {
      if (!selectedInst?.custom_id) return notify("err", "Оберіть об'єкт зі списку");
    } else {
      if (!customTitle.trim()) return notify("err", "Вкажіть назву завдання");
    }

    setSaving(true);
    try {
      const payload =
        addMode === "installation"
          ? {
              installation_custom_id: selectedInst.custom_id,
              custom_task_title: null,
              planned_date: addDate,
              status: "planned",
              reason: addReason || null,
              comment: addComment || null,
              created_by_email: createdByEmail,
            }
          : {
              installation_custom_id: null,
              custom_task_title: customTitle.trim(),
              planned_date: addDate,
              status: "planned",
              reason: addReason || null,
              comment: addComment || null,
              created_by_email: createdByEmail,
            };

      const { data: inserted, error: insErr } = await supabase
        .from("installation_visit_plan")
        .insert(payload)
        .select("id")
        .single();

      if (insErr) throw insErr;
      const newPlanId = inserted?.id;
      if (!newPlanId) throw new Error("No inserted id returned");

      if (selectedEmployees.length > 0) {
        const rows = selectedEmployees.map((emp) => ({
          visit_plan_id: newPlanId,
          employee_id: emp.id,
          assigned_by_email: createdByEmail,
        }));

        const { error: teamErr } = await supabase
          .from("installation_visit_plan_employees")
          .insert(rows);

        if (teamErr) throw teamErr;
      }

      notify("ok", "Успішно заплановано");
      setIsAddOpen(false);
      fetchPlans();
    } catch (e) {
      console.error("Create error:", e);
      notify("err", "Помилка (можливо дубль або доступ)");
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async () => {
    if (!moveTarget || !moveNewDate) return;

    setSaving(true);
    try {
      const { error: updErr } = await supabase
        .from("installation_visit_plan")
        .update({
          status: "moved",
          updated_at: new Date().toISOString(),
          reason: moveReason || "перенесено",
        })
        .eq("id", moveTarget.id);

      if (updErr) throw updErr;

      const insertPayload =
        moveTarget.installation_custom_id != null
          ? {
              installation_custom_id: moveTarget.installation_custom_id,
              custom_task_title: null,
              planned_date: moveNewDate,
              status: "planned",
              reason: moveReason || null,
              comment:
                moveComment ||
                (moveTarget.comment ? `(з ${moveTarget.planned_date}) ${moveTarget.comment}` : null),
              created_by_email: createdByEmail,
            }
          : {
              installation_custom_id: null,
              custom_task_title: moveTarget.custom_task_title || "Завдання",
              planned_date: moveNewDate,
              status: "planned",
              reason: moveReason || null,
              comment:
                moveComment ||
                (moveTarget.comment ? `(з ${moveTarget.planned_date}) ${moveTarget.comment}` : null),
              created_by_email: createdByEmail,
            };

      const { data: newRow, error: newErr } = await supabase
        .from("installation_visit_plan")
        .insert(insertPayload)
        .select("id")
        .single();

      if (newErr) throw newErr;

      const newPlanId = newRow?.id;
      if (!newPlanId) throw new Error("No inserted id returned on move");

      // copy team to new plan
      const oldTeam = Array.isArray(moveTarget.employees) ? moveTarget.employees : [];
      const rows = oldTeam
        .filter((x) => x?.employee_id)
        .map((x) => ({
          visit_plan_id: newPlanId,
          employee_id: x.employee_id,
          assigned_by_email: createdByEmail,
        }));

      if (rows.length > 0) {
        const { error: teamErr } = await supabase
          .from("installation_visit_plan_employees")
          .insert(rows);

        if (teamErr) throw teamErr;
      }

      notify("ok", "Запис перенесено");
      setIsMoveOpen(false);
      fetchPlans();
    } catch (e) {
      console.error("Move error:", e);
      notify("err", "Помилка перенесення");
    } finally {
      setSaving(false);
    }
  };

  const requestStatusChange = (planId, newStatus) => {
    const isDone = newStatus === "done";
    setConfirmConfig({
      title: isDone ? "Підтвердження виконання" : "Скасування",
      text: isDone
        ? "Ви дійсно хочете позначити цей запис як виконаний?"
        : "Ви впевнені, що хочете скасувати цей запис? Цю дію не можна скасувати.",
      type: isDone ? "success" : "danger",
      onConfirm: async () => {
        try {
          const payload = { status: newStatus, updated_at: new Date().toISOString() };
          if (newStatus === "cancelled") payload.cancelled_at = new Date().toISOString();

          const { error } = await supabase
            .from("installation_visit_plan")
            .update(payload)
            .eq("id", planId);

          if (error) throw error;
          notify("ok", isDone ? "Виконано" : "Скасовано");
          fetchPlans();
        } catch (e) {
          notify("err", "Помилка оновлення");
        }
      },
    });
  };

  // --- TEAM MODAL ACTIONS ---
  const openTeamModal = (plan) => {
    const team = Array.isArray(plan.employees) ? plan.employees : [];
    const normalized = team
      .map((x) => ({
        id: x.employee_id, // employees view gives employee_id
        employee_id: x.employee_id,
        custom_id: x.custom_id,
        name: x.name,
        email: x.email,
      }))
      .filter((x) => x.id && x.name);

    setTeamTarget(plan);
    setTeamSelected(normalized);
    setTeamQ("");
    setTeamOptions([]);
    setIsTeamOpen(true);
  };

  const saveTeamForVisit = async () => {
    if (!teamTarget?.id) return;
    setSaving(true);
    try {
      // delete old
      const { error: delErr } = await supabase
        .from("installation_visit_plan_employees")
        .delete()
        .eq("visit_plan_id", teamTarget.id);

      if (delErr) throw delErr;

      // insert new
      const rows = teamSelected.map((emp) => ({
        visit_plan_id: teamTarget.id,
        employee_id: emp.id,
        assigned_by_email: createdByEmail,
      }));

      if (rows.length > 0) {
        const { error: insErr } = await supabase
          .from("installation_visit_plan_employees")
          .insert(rows);

        if (insErr) throw insErr;
      }

      notify("ok", "Команду оновлено");
      setIsTeamOpen(false);
      setTeamTarget(null);
      fetchPlans();
    } catch (e) {
      console.error("Save team error:", e);
      notify("err", "Помилка збереження команди");
    } finally {
      setSaving(false);
    }
  };

  // --- RENDER HELPERS ---

  const grouped = useMemo(() => {
    const map = new Map();
    for (const p of plans) {
      const d = p.planned_date;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(p);
    }
    const days = Array.from(map.keys()).sort();
    const priRank = (x) => ({ high: 0, medium: 1, low: 2 }[x || "medium"] ?? 1);

    return days.map((d) => {
      const arr = map.get(d) || [];
      arr.sort((a, b) => {
        const pa = priRank(a?.installations?.priority);
        const pb = priRank(b?.installations?.priority);
        if (pa !== pb) return pa - pb;

        const ida = a.installation_custom_id ?? 999999;
        const idb = b.installation_custom_id ?? 999999;
        return ida - idb;
      });
      return { date: d, items: arr };
    });
  }, [plans]);

  const openAddModal = () => {
    setAddDate(todayISO);
    setAddReason("");
    setAddComment("");

    setAddMode("installation");
    setCustomTitle("");

    setQ("");
    setSelectedInst(null);
    setOptions([]);
    setSearching(false);

    // employees for add
    setEmpQ("");
    setEmpOptions([]);
    setSelectedEmployees([]);

    setIsAddOpen(true);
  };

  const openMoveModal = (plan) => {
    setMoveTarget(plan);
    setMoveNewDate(plan.planned_date);
    setMoveReason("перенесено");
    setMoveComment(plan.comment || "");
    setIsMoveOpen(true);
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 pb-20">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Планування виїздів</h1>
            <p className="text-slate-500 text-sm mt-0.5">Графік на {DAY_WINDOW} днів</p>
          </div>
          <button
            onClick={openAddModal}
            className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white px-5 py-3 rounded-2xl font-bold shadow-lg shadow-slate-900/10 transition-all active:scale-95"
          >
            <FaPlus className="text-sm" />
            <span>Додати</span>
          </button>
        </div>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -20, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -20, x: "-50%" }}
              className={`fixed top-6 left-1/2 z-[110] px-5 py-3 rounded-2xl shadow-xl font-bold flex items-center gap-3 border backdrop-blur-md ${
                toast.type === "ok"
                  ? "bg-emerald-50/90 text-emerald-700 border-emerald-200"
                  : "bg-rose-50/90 text-rose-700 border-rose-200"
              }`}
            >
              {toast.type === "ok" ? <FaCheckCircle /> : <FaBan />}
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-10 h-10 border-4 border-slate-200 border-t-violet-600 rounded-full animate-spin mb-4" />
            <p className="text-sm font-medium">Завантаження...</p>
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-10 text-center">
            <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 text-xl">
              <FaCalendarAlt />
            </div>
            <h3 className="text-base font-bold text-slate-900">Немає планів</h3>
            <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
              На найближчі тижні нічого не заплановано. Створіть перший запис.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(({ date, items }) => (
              <div key={date}>
                <div className="sticky top-2 z-30 bg-slate-50/95 backdrop-blur-sm py-3 px-4 mb-3 border border-slate-200 rounded-2xl flex items-baseline gap-2.5 shadow-sm">
                  <span className="text-xl font-black text-slate-800">{formatDayMonth(date)}</span>
                  <span className="text-sm font-semibold text-slate-500 uppercase tracking-wide">{getDayName(date)}</span>
                  <span className="ml-auto text-xs font-bold bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md shadow-sm">
                    {items.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {items.map((p) => {
                    const inst = p.installations;
                    const isCustom = !inst?.custom_id && p.installation_custom_id == null;

                    const title = inst?.name || p.custom_task_title || "Завдання";
                    const creatorName = p.creator_name || "Невідомо";

                    const hasGPS = !!(inst?.gps_link && inst.gps_link.length > 5);
                    const locationText = hasGPS ? "GPS Навігація" : inst?.client_populated_place || "Локація не вказана";

                    const team = Array.isArray(p.employees) ? p.employees : [];
                    const teamNames = team.map((x) => x?.name).filter(Boolean);

                    return (
                      <div
                        key={p.id}
                        className="group bg-white rounded-2xl p-4 border border-slate-200 shadow-sm relative overflow-hidden"
                      >
                        <div
                          className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                            inst?.priority === "high"
                              ? "bg-rose-500"
                              : inst?.priority === "low"
                              ? "bg-slate-300"
                              : isCustom
                              ? "bg-violet-500"
                              : "bg-blue-500"
                          }`}
                        />

                        <div className="pl-3 flex flex-col h-full">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isCustom ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded">
                                  <FaExclamationTriangle className="text-[10px]" />
                                  Завдання
                                </span>
                              ) : (
                                <span className="text-xs font-black text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  #{inst?.custom_id || p.installation_custom_id}
                                </span>
                              )}

                              {inst?.capacity_kw && (
                                <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                                  <FaBolt className="text-[10px]" /> {inst.capacity_kw} кВт
                                </span>
                              )}
                            </div>
                            <StatusBadge status={p.status} />
                          </div>

                          <div className="mb-3">
                            {inst?.custom_id ? (
                              <Link
                                to={`/project/${inst.custom_id}`}
                                className="text-base font-extrabold text-slate-900 leading-tight mb-1 hover:text-violet-600 transition-colors block"
                              >
                                {title || "Об'єкт без назви"}
                              </Link>
                            ) : (
                              <h3 className="text-base font-extrabold text-slate-900 leading-tight mb-1">
                                {title}
                              </h3>
                            )}

                            {!isCustom && (
                              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                                <FaMapMarkerAlt className={hasGPS ? "text-violet-500" : "text-slate-400"} />
                                {hasGPS ? (
                                  <a
                                    href={inst.gps_link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-violet-700 font-bold hover:underline flex items-center gap-1"
                                  >
                                    {locationText} <FaExternalLinkAlt className="text-[9px]" />
                                  </a>
                                ) : (
                                  <span>{locationText}</span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="mt-auto pt-3 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <FaUser className="text-slate-400 text-[10px]" />
                              <span className="text-slate-900 font-medium">{creatorName}</span>
                            </div>

                            {teamNames.length > 0 && (
                              <div className="bg-slate-50 p-2 rounded-lg text-slate-700 border border-slate-100">
                                <span className="font-bold text-slate-900 block mb-0.5">Хто їде</span>
                                <span className="block">{teamNames.join(", ")}</span>
                              </div>
                            )}

                            {(p.reason || p.comment) && (
                              <div className="bg-slate-50 p-2 rounded-lg text-slate-700 border border-slate-100">
                                {p.reason && <span className="font-bold text-slate-900 block mb-0.5">{p.reason}</span>}
                                {p.comment && <span className="italic block">{p.comment}</span>}
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex items-stretch gap-2">
                            <button
                              onClick={() => requestStatusChange(p.id, "done")}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border border-emerald-100 text-emerald-700 py-2.5 rounded-xl text-xs font-bold transition-colors"
                            >
                              <FaCheckCircle /> Виконано
                            </button>

                            <button
                              onClick={() => openMoveModal(p)}
                              className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border border-amber-100 text-amber-800 py-2.5 rounded-xl text-xs font-bold transition-colors"
                            >
                              <FaExchangeAlt /> Перенести
                            </button>

                            {/* ✅ НОВЕ: кнопка Команда */}
                            <button
                              onClick={() => openTeamModal(p)}
                              className="w-10 flex items-center justify-center text-slate-500 hover:text-violet-700 hover:bg-violet-50 rounded-xl transition-all"
                              title="Команда"
                            >
                              <FaUser />
                            </button>

                            <button
                              onClick={() => requestStatusChange(p.id, "cancelled")}
                              className="w-10 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                              title="Скасувати"
                            >
                              <FaTimes />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- MODALS --- */}
        <ConfirmationModal config={confirmConfig} onClose={() => setConfirmConfig(null)} />

        {/* ADD PLAN MODAL */}
        <ModalShell
          isOpen={isAddOpen}
          onClose={() => setIsAddOpen(false)}
          title="Новий запис"
          subtitle={addMode === "installation" ? "Додайте об'єкт до графіку" : "Додайте власне завдання без об'єкта"}
        >
          <div className="space-y-4">
            {/* Mode switch */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAddMode("installation");
                  setCustomTitle("");
                  setQ("");
                  setSelectedInst(null);
                  setOptions([]);
                }}
                className={`py-3 rounded-xl font-bold text-sm border transition-colors ${
                  addMode === "installation"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Об&apos;єкт
              </button>

              <button
                type="button"
                onClick={() => {
                  setAddMode("custom");
                  setQ("");
                  setSelectedInst(null);
                  setOptions([]);
                }}
                className={`py-3 rounded-xl font-bold text-sm border transition-colors ${
                  addMode === "custom"
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                Власне завдання
              </button>
            </div>

            {addMode === "installation" ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Пошук об&apos;єкта</label>
                <div className="relative group">
                  <FaSearch className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-violet-500" />
                  <input
                    value={q}
                    onChange={(e) => {
                      setSelectedInst(null);
                      setQ(e.target.value);
                    }}
                    placeholder="Введіть назву або ID (4 цифри)..."
                    className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all text-sm font-medium"
                  />
                </div>

                <AnimatePresence>
                  {(searching || (q.length > 1 && options.length > 0)) && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-52 overflow-y-auto z-50"
                    >
                      {searching ? (
                        <div className="p-4 text-center text-xs text-slate-400">Пошук...</div>
                      ) : (
                        options.map((opt) => (
                          <button
                            key={opt.custom_id}
                            onClick={() => {
                              setSelectedInst(opt);
                              programmaticQSet.current = true;
                              setQ(`${opt.name} (ID: ${opt.custom_id})`);
                              setOptions([]);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-violet-50 border-b border-slate-50 last:border-0 transition-colors flex justify-between items-center group"
                          >
                            <div>
                              <div className="font-bold text-slate-800 text-sm group-hover:text-violet-700">{opt.name}</div>
                              <div className="text-[10px] text-slate-500">ID: {opt.custom_id}</div>
                            </div>
                            <div className="text-right">
                              {opt.capacity_kw && <div className="text-[10px] text-amber-600 font-bold">{opt.capacity_kw} кВт</div>}
                            </div>
                          </button>
                        ))
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Назва завдання</label>
                <input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="Напр: Забрати матеріал / Узгодження..."
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all text-sm font-medium"
                />
              </div>
            )}

            {/* ✅ Employees: only search field (no preloaded list) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Хто їде</label>

              {selectedEmployees.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {selectedEmployees.map((emp) => (
                    <span
                      key={emp.id}
                      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold"
                    >
                      {emp.name}
                      <button
                        type="button"
                        onClick={() => removeEmployeeFromSelection(emp.id)}
                        className="text-slate-500 hover:text-rose-600"
                        title="Прибрати"
                      >
                        <FaTimes />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative group">
                <FaSearch className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-violet-500" />
                <input
                  value={empQ}
                  onChange={(e) => setEmpQ(e.target.value)}
                  placeholder="Почніть вводити ім'я (мін. 2 символи)..."
                  className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all text-sm font-medium"
                />
              </div>

              <AnimatePresence>
                {(empSearching || empOptions.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-52 overflow-y-auto"
                  >
                    {empSearching ? (
                      <div className="p-4 text-center text-xs text-slate-400">Пошук...</div>
                    ) : empOptions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">Нічого не знайдено</div>
                    ) : (
                      empOptions.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => addEmployeeToSelection(emp)}
                          className="w-full text-left px-4 py-3 hover:bg-violet-50 border-b border-slate-50 last:border-0 transition-colors flex justify-between items-center group"
                        >
                          <div>
                            <div className="font-bold text-slate-800 text-sm group-hover:text-violet-700">{emp.name}</div>
                            {emp.email && <div className="text-[10px] text-slate-500">{emp.email}</div>}
                          </div>
                          <div className="text-right text-xs font-black text-violet-700">Додати</div>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Дата</label>
                <input
                  type="date"
                  value={addDate}
                  min={todayISO}
                  onChange={(e) => setAddDate(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none text-sm font-bold text-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Причина</label>
                <input
                  value={addReason}
                  onChange={(e) => setAddReason(e.target.value)}
                  placeholder="Монтаж / Огляд"
                  className="w-full px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Коментар</label>
              <textarea
                rows={2}
                value={addComment}
                onChange={(e) => setAddComment(e.target.value)}
                placeholder="Деталі..."
                className="w-full px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none text-sm"
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={saving}
              className="w-full py-3.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white rounded-xl font-bold text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50 mt-2"
            >
              {saving ? "Збереження..." : "Запланувати"}
            </button>
          </div>
        </ModalShell>

        {/* TEAM MODAL */}
        <ModalShell
          isOpen={isTeamOpen}
          onClose={() => {
            setIsTeamOpen(false);
            setTeamTarget(null);
          }}
          title="Команда виїзду"
          subtitle={teamTarget?.installations?.name || teamTarget?.custom_task_title || ""}
        >
          <div className="space-y-4">
            {teamSelected.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {teamSelected.map((emp) => (
                  <span
                    key={emp.id}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200 text-xs font-bold"
                  >
                    {emp.name}
                    <button
                      type="button"
                      onClick={() => removeEmployeeFromTeam(emp.id)}
                      className="text-slate-500 hover:text-rose-600"
                      title="Прибрати"
                    >
                      <FaTimes />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                Поки нікого не додано. Знайдіть працівника нижче і додайте.
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Пошук працівника</label>
              <div className="relative group">
                <FaSearch className="absolute left-3 top-3.5 text-slate-400 group-focus-within:text-violet-500" />
                <input
                  value={teamQ}
                  onChange={(e) => setTeamQ(e.target.value)}
                  placeholder="Почніть вводити ім'я (мін. 2 символи)..."
                  className="w-full pl-9 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:outline-none transition-all text-sm font-medium"
                />
              </div>

              <AnimatePresence>
                {(teamSearching || teamOptions.length > 0) && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 bg-white rounded-xl shadow-xl border border-slate-100 max-h-52 overflow-y-auto"
                  >
                    {teamSearching ? (
                      <div className="p-4 text-center text-xs text-slate-400">Пошук...</div>
                    ) : teamOptions.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">Нічого не знайдено</div>
                    ) : (
                      teamOptions.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => addEmployeeToTeam(emp)}
                          className="w-full text-left px-4 py-3 hover:bg-violet-50 border-b border-slate-50 last:border-0 transition-colors flex justify-between items-center group"
                        >
                          <div>
                            <div className="font-bold text-slate-800 text-sm group-hover:text-violet-700">{emp.name}</div>
                            {emp.email && <div className="text-[10px] text-slate-500">{emp.email}</div>}
                          </div>
                          <div className="text-right text-xs font-black text-violet-700">Додати</div>
                        </button>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setIsTeamOpen(false);
                  setTeamTarget(null);
                }}
                className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors text-sm"
              >
                Закрити
              </button>
              <button
                onClick={saveTeamForVisit}
                disabled={saving}
                className="flex-[2] py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors shadow-md text-sm disabled:opacity-60"
              >
                {saving ? "Збереження..." : "Зберегти"}
              </button>
            </div>
          </div>
        </ModalShell>

        {/* MOVE PLAN MODAL (без змін по UI) */}
        <ModalShell isOpen={isMoveOpen} onClose={() => setIsMoveOpen(false)} title="Перенесення">
          {moveTarget && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 items-center">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-600">
                  <FaExchangeAlt />
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm truncate max-w-[260px]">
                    {moveTarget.installations?.name || moveTarget.custom_task_title || `ID ${moveTarget.installation_custom_id}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Поточна дата: <span className="font-bold text-slate-700">{moveTarget.planned_date}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Нова дата</label>
                <input
                  type="date"
                  value={moveNewDate}
                  min={todayISO}
                  onChange={(e) => setMoveNewDate(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm font-bold text-slate-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Причина</label>
                <input
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">Коментар</label>
                <textarea
                  rows={2}
                  value={moveComment}
                  onChange={(e) => setMoveComment(e.target.value)}
                  className="w-full px-3 py-3 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none text-sm"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsMoveOpen(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors text-sm"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleMove}
                  disabled={saving}
                  className="flex-[2] py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors shadow-md text-sm disabled:opacity-60"
                >
                  {saving ? "Збереження..." : "Перенести"}
                </button>
              </div>
            </div>
          )}
        </ModalShell>
      </div>
    </Layout>
  );
}
