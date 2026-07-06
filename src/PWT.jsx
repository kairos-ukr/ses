import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaCheck, FaCamera, FaClock, FaHistory, FaTimes,
  FaChevronRight, FaChevronDown, FaMapMarkerAlt, FaBoxOpen, FaSolarPanel,
  FaBroadcastTower, FaImage, FaExclamationTriangle,
  FaTools, FaTrash, FaPlus, FaSpinner, FaThumbtack, FaCheckCircle,
  FaUserTie, FaSearch, FaArrowRight, FaClipboardList,
  FaFileInvoiceDollar, FaDraftingCompass, FaTruckLoading, FaHandPointer,
  FaFileAlt, FaDownload, FaFilePdf, FaMagic
} from "react-icons/fa";
import { motion, AnimatePresence } from 'framer-motion';

import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";
import ManualSpecBuilder from "./pages/ManualSpecBuilder";

const WORKFLOW_UPLOADER_URL = "https://quiet-water-a1ad.kairosost38500.workers.dev";
const OCR_API_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev/parse-pdf';

// ==================================================================================
// 1. КОНФІГУРАЦІЯ
// ==================================================================================

const STAGE_GROUPS = [
  { key: "tech_review", label: "Заміри", icon: FaMapMarkerAlt },
  { key: "project", label: "Проект", icon: FaDraftingCompass },
  { key: "proposal", label: "КП", icon: FaFileInvoiceDollar },
  { key: "equipment", label: "Обладнання", icon: FaTruckLoading },
  { key: "complectation", label: "Комплектація", icon: FaBoxOpen },
  { key: "installation", label: "Монтаж", icon: FaSolarPanel },
  { key: "monitoring_setup", label: "Запуск", icon: FaBroadcastTower },
];

const DETAILED_TASKS = {
  tech_review: [{ id: "tech_review", title: "Проведення замірів" }],
  project: [
    { id: "project_design", title: "Розробка 3D візуалізації" }, 
    { id: "project_approval", title: "Вибір та затвердження варіанту" },
    { id: "tech_project", title: "Технічне креслення" }
  ],
  proposal: [{ id: "commercial_proposal", title: "Комерційна пропозиція" }],
  equipment: [{ id: "equipment", title: "Закупівля обладнання" }],
  complectation: [
    { id: "complectation", title: "Комплектація матеріалів" }, 
    { id: "comp_protection", title: "Комплектація ел. захисту" } 
  ],
  installation: [
    { id: "inst_structure", title: "Монтаж конструкції" },
    { id: "inst_panels", title: "Встановлення панелей" },
    { id: "inst_cabling", title: "Прокладання траси DC" },
    { id: "inst_grounding", title: "Заземлення" },
    { id: "inst_inverter", title: "Підключення інвертора" }
  ],
  monitoring_setup: [{ id: "monitoring_setup", title: "Запуск станції" }]
};

const AUTO_STATUS_MAP = {
  tech_review: "completed",
  project_design: "created",
  tech_project: "done",
  commercial_proposal: "created",
  complectation: "done",
  comp_protection: "done"
};

const STAGES_WITH_UPLOADS = new Set(["commercial_proposal", "tech_project", "complectation", "comp_protection"]);

const STATUS_CONFIG = {
  default: [
    { key: "todo", label: "Не почато", color: "bg-slate-50 text-slate-500 border-slate-200" }, 
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" }, 
    { key: "done", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  tech_project_group: [
    { key: "todo", label: "Не почато", color: "bg-slate-50 text-slate-500 border-slate-200" },
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "done", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  proposal: [
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В процесі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "created", label: "Зроблено", color: "bg-blue-50 text-blue-700 border-blue-200" }, 
    { key: "approved", label: "Погоджено", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  project: [
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В розробці", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "created", label: "Зроблено", color: "bg-blue-50 text-blue-700 border-blue-200" }, 
    { key: "approved", label: "Затверджено", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  equipment: [
    { key: "waiting", label: "Не розпочато", color: "bg-slate-50 text-slate-500 border-slate-200" }, 
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "ordered", label: "Замовлено", color: "bg-purple-50 text-purple-700 border-purple-200" },
    { key: "arrived", label: "Прибуло", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  tech_review: [
    { key: "waiting_client", label: "Очікуємо від клієнта", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "done_on_site", label: "Виконали на виїзді", color: "bg-blue-50 text-blue-700 border-blue-200" }, 
    { key: "completed", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  installation: [
    { key: "waiting_start", label: "Очікуємо старт", color: "bg-slate-50 text-slate-500 border-slate-200" }, 
    { key: "started", label: "Розпочато", color: "bg-indigo-50 text-indigo-700 border-indigo-200" }, 
    { key: "completed", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" }, 
  ],
  project_selector: [
    { key: "selection_needed", label: "Необхідно обрати", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "selected", label: "Обрано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ]
};

const ALL_STATUS_LABELS = {
  waiting: "Очікуємо", waiting_start: "Очікуємо старт", not_started: "Не розпочато",
  started: "В роботі", created: "Зроблено", arrived: "Прибуло", done_on_site: "Виконали на виїзді",
  completed: "Виконано", todo: "Не почато", in_progress: "В роботі", done: "Виконано",
  ordered: "Замовлено", approved: "Погоджено", waiting_client: "Очікуємо від клієнта",
  selection_needed: "Очікує вибору", selected: "Варіант обрано"
};

// ==================================================================================
// 2. HELPER FUNCTIONS
// ==================================================================================

const getStatusMeta = (stageGroupKey, statusKey, taskId = null) => {
  let config = STATUS_CONFIG.default;
  if (taskId === "tech_project") config = STATUS_CONFIG.tech_project_group;
  else if (STATUS_CONFIG[stageGroupKey]) config = STATUS_CONFIG[stageGroupKey];
  else if (stageGroupKey === "installation") config = STATUS_CONFIG.installation; 

  const item = config.find(i => i.key === statusKey);
  if (item) return item;
  return { label: ALL_STATUS_LABELS[statusKey] || statusKey, color: "bg-slate-100 text-slate-500 border-slate-200" };
};

const driveThumbUrl = (fileId, size = 400) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}-h${size}`;
const driveViewUrl = (fileId) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;
function isImageFile(file) { return (file?.type || "").startsWith("image/"); }
function toIntOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : null;
}

function getDocTypeLabel(stageKey) {
  switch (stageKey) {
    case "commercial_proposal": return "Комерційна пропозиція";
    case "tech_project": return "Технічне рішення";
    case "tech_review": return "Заміри";
    case "project_design": return "3D Візуалізація";
    case "complectation": return "Специфікація";
    case "comp_protection": return "Специфікація захисту";
    default: return "Файли етапу";
  }
}

async function uploadWorkflowFiles({ files, installationId, stageKey }) {
  if (!files || files.length === 0) return { links: [], fileIds: [] };
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("object_number", String(installationId));
  fd.append("doc_type", getDocTypeLabel(stageKey)); 
  if (stageKey) fd.append("stage_key", stageKey);

  const url = `${WORKFLOW_UPLOADER_URL}/workflow/upload`;
  const res = await fetch(url, { method: "POST", body: fd });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok || !data || data.status !== "success") throw new Error((data && (data.message || data.detail)) || `Upload error (${res.status})`);

  const filesArr = Array.isArray(data.files) ? data.files : [];
  return { links: filesArr.map(x => x?.webViewLink).filter(Boolean), fileIds: filesArr.map(x => x?.fileId).filter(Boolean) };
}

const formatUkShort = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

async function resolveActorName({ user, employee }) {
  if (employee?.name) return employee.name;
  if (user?.id) {
    const { data } = await supabase.from("employees").select("name").eq("user_id", user.id).maybeSingle();
    if (data?.name) return data.name;
  }
  return user?.email || "Невідомий";
}

const getEmployeeNameStr = (customId, employees) => {
  if (!customId) return null;
  const found = employees.find(e => String(e.custom_id) === String(customId));
  return found?.name || customId;
};

// ==================================================================================
// 3. UI КОМПОНЕНТИ ТА ВІДЖЕТИ
// ==================================================================================

const NomenclatureSelect = ({ options, value, onChange, placeholder, hasError }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.id === value);
    const filtered = options.filter(o => {
        const q = search.toLowerCase();
        return o.fullName.toLowerCase().includes(q) ||
               (o.sku && o.sku.toLowerCase().includes(q)) ||
               (o.brand && o.brand.toLowerCase().includes(q)) ||
               (o.model && o.model.toLowerCase().includes(q));
    });

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div 
                className={`w-full px-3 py-2 bg-white border rounded-lg flex justify-between items-center cursor-pointer text-sm transition-colors ${hasError ? 'border-red-400 bg-red-50/30' : 'border-slate-300 hover:border-indigo-400'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="truncate pr-2 flex-1 min-w-0">
                    {selectedOption ? (
                        <div className="flex flex-col leading-tight">
                            {selectedOption.categoryPath && (
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">{selectedOption.categoryPath}</span>
                            )}
                            <span className="font-bold text-slate-800">{selectedOption.name}</span>
                        </div>
                    ) : (
                        <span className={hasError ? "text-red-400 font-medium" : "text-slate-400"}>{placeholder}</span>
                    )}
                </div>
                <FaChevronDown className="text-slate-400 text-[10px] flex-shrink-0" />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute z-[100] w-[420px] right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50"><input autoFocus type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Пошук по назві, бренду, SKU..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                            {filtered.length > 0 ? filtered.map(o => (
                                <div key={o.id} className={`px-3 py-2.5 cursor-pointer text-sm rounded-lg mb-0.5 transition-colors ${o.id === value ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'}`} onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}>
                                    {o.categoryPath && (
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5 truncate">{o.categoryPath}</div>
                                    )}
                                    <div className="font-bold text-slate-800 leading-tight">{o.name}</div>
                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                        {o.brand && <span className="text-[10px] text-slate-500">{o.brand}</span>}
                                        {o.sku && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded inline-block">SKU: {o.sku}</span>}
                                    </div>
                                </div>
                            )) : <div className="px-4 py-4 text-sm text-slate-400 text-center">Нічого не знайдено</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

function SpecOcrMappingModal({ file, installationId, taskId, onClose, onSuccess, nomenclatures, employee }) {
    const [isParsing, setIsParsing] = useState(true);
    const [mappedItems, setMappedItems] = useState([]);
    const [error, setError] = useState(null);

    const autoMatchItem = useCallback((originalName) => {
        if (!originalName || !nomenclatures.length) return '';
        const lowerName = originalName.toLowerCase().trim();

        // 1. Exact SKU match (highest priority)
        const skuMatch = nomenclatures.find(n => n.sku && lowerName.includes(n.sku.toLowerCase()));
        if (skuMatch) return skuMatch.id;

        // 2. Exact full name match
        const exactMatch = nomenclatures.find(n => n.name.toLowerCase() === lowerName);
        if (exactMatch) return exactMatch.id;

        // 3. Tokenize the input: filter out short tokens and stopwords
        const stopwords = new Set(['шт', 'пк', 'м', 'мм', 'см', 'кг', 'вт', 'кВт', 'а', 'в', 'кв', 'ом', 'на', 'та', 'або', 'для', 'від', 'до', 'із', 'по', 'з', 'і', 'й', 'the', 'for', 'and', 'or', 'mm', 'cm', 'kg', 'kw', 'a', 'v', 'w'].map(s => s.toLowerCase()));
        const tokens = lowerName.split(/[\s,.\-\/\\()+:;]+/).filter(t => t.length > 2 && !stopwords.has(t));

        let bestMatch = null;
        let maxScore = 0;

        for (const nom of nomenclatures) {
            const nomSearchStr = [
                nom.name,
                nom.brand || '',
                nom.model || '',
                nom.categoryPath || '',
                nom.sku || ''
            ].join(' ').toLowerCase();

            let score = 0;
            let matchedTokens = 0;

            for (const token of tokens) {
                if (nomSearchStr.includes(token)) {
                    // Longer tokens = more specific match = higher weight
                    const weight = Math.min(token.length, 10);
                    score += weight;
                    matchedTokens++;
                }
            }

            // Bonus: brand match is very strong signal
            if (nom.brand && lowerName.includes(nom.brand.toLowerCase())) score += 15;
            // Bonus: model match
            if (nom.model && lowerName.includes(nom.model.toLowerCase())) score += 10;
            // Penalty: low token coverage
            const coverage = tokens.length > 0 ? matchedTokens / tokens.length : 0;
            if (coverage < 0.4) score = Math.floor(score * 0.5);

            if (score > maxScore) { maxScore = score; bestMatch = nom; }
        }

        // Only return a match if confidence is high enough
        return maxScore >= 8 && bestMatch ? bestMatch.id : '';
    }, [nomenclatures]);

    useEffect(() => {
        const parseFile = async () => {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const response = await fetch(OCR_API_URL, { method: 'POST', body: formData });
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || errData.error || 'Помилка OCR сервісу');
                }
                const data = await response.json();
                if (data.items && data.items.length > 0) {
                    const initialMapping = data.items.map(item => ({
                        id: Math.random().toString(36).substr(2, 9),
                        original_name: item.original_name + (item.technical_chars ? ` (${item.technical_chars})` : ''),
                        quantity: parseFloat(item.quantity) || 1,
                        unit: item.unit || 'шт',
                        nomenclature_id: autoMatchItem(item.original_name + (item.technical_chars ? ` ${item.technical_chars}` : ''))
                    }));
                    setMappedItems(initialMapping);
                } else {
                    setError('Не вдалося знайти таблицю специфікації у PDF файлі.');
                }
            } catch (err) {
                setError(err.message);
            } finally {
                setIsParsing(false);
            }
        };
        parseFile();
    }, [file, autoMatchItem]);

    const handleConfirm = async () => {
        const unmapped = mappedItems.filter(item => !item.nomenclature_id);
        if (unmapped.length > 0) return alert(`Залишилось ${unmapped.length} неідентифікованих позицій! Оберіть товар або видаліть рядок.`);
        if (mappedItems.length === 0) return alert('Специфікація порожня!');

        setIsParsing(true);
        try {
            // Only count/archive specs of the SAME task type (stored in notes)
            const { data: existing } = await supabase.from('specifications')
                .select('version')
                .eq('installation_custom_id', installationId)
                .eq('notes', taskId);
            const nextVersion = existing && existing.length > 0 ? Math.max(...existing.map(s => s.version)) + 1 : 1;

            if (existing && existing.length > 0) {
                await supabase.from('specifications').update({ status: 'archived' })
                    .eq('installation_custom_id', installationId)
                    .eq('notes', taskId);
            }

            const { data: newSpec, error: hErr } = await supabase.from('specifications').insert([{
                installation_custom_id: installationId, version: nextVersion, status: 'confirmed',
                name: `Специфікація V.${nextVersion} (${file.name})`,
                notes: taskId,
                confirmed_at: new Date().toISOString(), created_by: employee?.id
            }]).select().single();
            if (hErr) throw hErr;

            const itemsPayload = mappedItems.map(item => ({
                specification_id: newSpec.id, nomenclature_id: item.nomenclature_id,
                quantity: item.quantity, original_name: item.original_name, created_by: employee?.id
            }));
            const { error: iErr } = await supabase.from('specification_items').insert(itemsPayload);
            if (iErr) throw iErr;

            onSuccess();
        } catch (err) {
            alert(err.message);
            setIsParsing(false);
        }
    };

    return (
        <AnimatePresence>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[90]">
                <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl flex-shrink-0">
                        <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2"><FaMagic className="text-indigo-500"/> Оцифрування специфікації</h2>
                        <button onClick={onClose} disabled={isParsing} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm disabled:opacity-50"><FaTimes/></button>
                    </div>

                    {isParsing ? (
                        <div className="p-20 flex flex-col items-center justify-center text-indigo-600">
                            <FaSpinner className="animate-spin text-5xl mb-4" />
                            <p className="font-bold">Аналізуємо PDF файл та підбираємо товари...</p>
                        </div>
                    ) : error ? (
                        <div className="p-10 text-center flex flex-col items-center">
                            <FaExclamationTriangle className="text-red-500 text-4xl mb-3" />
                            <p className="text-slate-700 font-bold mb-4">{error}</p>
                            <button onClick={onClose} className="px-6 py-2 bg-slate-200 hover:bg-slate-300 rounded-xl font-bold text-sm">Повернутися</button>
                        </div>
                    ) : (
                        <>
                            <div className="bg-white px-5 py-3 flex items-center justify-between border-b border-slate-100 flex-shrink-0">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Позиції специфікації</span>
                                <div className="text-center px-4 py-1.5 bg-slate-50 rounded-xl border border-slate-200">
                                    <span className="text-xs font-bold text-slate-400 mr-2">Всього:</span>
                                    <span className="text-lg font-black text-slate-800">{mappedItems.length}</span>
                                </div>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-100 shadow-sm z-10">
                                        <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                                            <th className="px-4 py-3 font-bold border-b border-slate-200 w-1/3">Прочитано з PDF (Оригінал)</th>
                                            <th className="px-4 py-3 font-bold border-b border-slate-200 text-center w-24">К-сть</th>
                                            <th className="px-4 py-3 font-bold border-b border-slate-200 border-l border-slate-200 bg-indigo-50/50"><FaBoxOpen className="inline mr-1 text-indigo-400"/> Товар у базі (Склад)</th>
                                            <th className="px-4 py-3 font-bold border-b border-slate-200 text-center w-12">Дія</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200">
                                        {mappedItems.map((item, index) => {
                                            const hasError = !item.nomenclature_id;
                                            return (
                                                <tr key={item.id} className={`transition-colors ${hasError ? 'bg-red-50/30' : 'bg-white hover:bg-slate-50'}`}>
                                                    <td className="px-4 py-3 align-middle border-r border-dashed border-slate-200">
                                                        <input
                                                            type="text"
                                                            value={item.original_name}
                                                            onChange={e => { const newArr = [...mappedItems]; newArr[index].original_name = e.target.value; setMappedItems(newArr); }}
                                                            className="w-full text-sm font-medium text-slate-700 bg-transparent border-0 border-b border-dashed border-slate-200 focus:border-indigo-400 outline-none py-1 leading-tight"
                                                        />
                                                    </td>
                                                    <td className="px-2 py-4 align-middle border-r border-slate-200 text-center">
                                                        <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                                            <input type="number" min="0" step="0.01" value={item.quantity} onChange={e => { const newArr = [...mappedItems]; newArr[index].quantity = e.target.value; setMappedItems(newArr); }} className="w-12 text-center text-sm font-black text-indigo-700 bg-transparent outline-none"/>
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase">{item.unit}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 align-middle border-l-2 border-indigo-100">
                                                        <NomenclatureSelect options={nomenclatures} value={item.nomenclature_id} hasError={hasError} placeholder="Натисніть та оберіть товар" onChange={val => { const newArr = [...mappedItems]; newArr[index].nomenclature_id = val; setMappedItems(newArr); }}/>
                                                    </td>
                                                    <td className="px-4 py-4 align-middle text-center">
                                                        <button onClick={() => { const newArr = mappedItems.filter((_, i) => i !== index); setMappedItems(newArr); }} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><FaTrash size={16}/></button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <div className="p-5 border-t border-slate-100 flex justify-between items-center bg-white rounded-b-2xl flex-shrink-0">
                                <button type="button" onClick={() => setMappedItems([...mappedItems, { id: Math.random().toString(), original_name: 'Додано вручну', quantity: 1, unit: 'шт', nomenclature_id: '' }])} className="text-indigo-600 font-bold text-sm hover:underline">+ Додати пропущений рядок</button>
                                <div className="flex gap-3">
                                    <button onClick={onClose} className="px-6 py-3 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm">Скасувати</button>
                                    <button onClick={handleConfirm} disabled={mappedItems.length === 0} className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all text-sm flex items-center gap-2 disabled:opacity-50 active:scale-95">Затвердити специфікацію</button>
                                </div>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

function SpecificationSummaryWidget({ installationId, taskId, refreshTrigger, nomenclatures = [] }) {
    const [specData, setSpecData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSpec = async () => {
            if (!installationId) return;
            try {
                let query = supabase
                    .from('specifications')
                    .select(`
                        id, status, version, created_at, notes,
                        specification_items (
                            id, quantity, original_name,
                            nomenclature (id, name, brand, category_id)
                        )
                    `)
                    .eq('installation_custom_id', installationId)
                    .order('version', { ascending: false })
                    .limit(1);

                // Filter by task type so complectation and comp_protection are independent
                if (taskId) {
                    query = query.eq('notes', taskId);
                }

                const { data, error } = await query.maybeSingle();

                if (error && error.code !== 'PGRST116') throw error; 
                setSpecData(data || null);
            } catch (err) {
                console.error("Помилка завантаження специфікації:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSpec();
    }, [installationId, taskId, refreshTrigger]);

    const specTitle = taskId === 'comp_protection'
        ? 'Специфікація електрозахисту'
        : 'Специфікація матеріалів';
    const specEmptyHint = taskId === 'comp_protection'
        ? 'Оцифруйте специфікацію електрозахисту (автоматичні вимикачі, ПЗВ, щитки тощо).'
        : 'Натисніть "Оцифрувати PDF", щоб автоматично створити специфікацію та закрити це завдання.';

    if (loading) return <div className="h-32 flex items-center justify-center text-slate-400"><FaSpinner className="animate-spin text-2xl" /></div>;

    if (!specData || !specData.specification_items || specData.specification_items.length === 0) {
        return (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center w-full flex flex-col items-center justify-center">
                <FaClipboardList className="text-4xl text-slate-300 mb-3" />
                <h4 className="font-bold text-slate-600 text-sm mb-1">{specTitle} порожня</h4>
                <p className="text-xs text-slate-400 max-w-sm">{specEmptyHint}</p>
            </div>
        );
    }

    const items = specData.specification_items || [];
    const totalItems = items.length;

    return (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden w-full flex flex-col">
            <div className={`border-b p-4 flex justify-between items-center ${taskId === 'comp_protection' ? 'bg-amber-50/50 border-amber-100' : 'bg-indigo-50/50 border-indigo-100'}`}>
                <div>
                    <h4 className={`font-extrabold text-sm flex items-center gap-2 ${taskId === 'comp_protection' ? 'text-amber-900' : 'text-indigo-900'}`}>
                        <FaClipboardList className={taskId === 'comp_protection' ? 'text-amber-500' : 'text-indigo-500'} />
                        {specTitle}
                    </h4>
                    <div className={`text-[10px] font-bold mt-0.5 ${taskId === 'comp_protection' ? 'text-amber-500/70' : 'text-indigo-500/70'}`}>
                        ВЕРСІЯ {specData.version} • {new Date(specData.created_at).toLocaleDateString()}
                    </div>
                </div>
                <div className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border ${specData.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                    {specData.status === 'confirmed' ? 'Затверджено' : specData.status}
                </div>
            </div>
            <div className="p-5">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Всі завантажені позиції ({totalItems})</div>
                <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 border border-slate-100 rounded-xl p-3 bg-slate-50/30">
                    <div className="flex flex-col gap-1">
                        {items.map(item => {
                            const nomEntry = nomenclatures.find(n => n.id === item.nomenclature?.id);
                            const categoryPath = nomEntry?.categoryPath || null;
                            const displayName = item.nomenclature?.name || item.original_name || 'Невідома позиція';
                            return (
                                <div key={item.id} className="flex justify-between items-start text-xs py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors px-2 rounded gap-3">
                                    <div className="flex flex-col flex-1 min-w-0">
                                        {categoryPath && (
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate">{categoryPath}</span>
                                        )}
                                        <span className="font-medium text-slate-800 leading-tight">{displayName}</span>
                                        {item.nomenclature?.brand && (
                                            <span className="text-[10px] text-slate-400">{item.nomenclature.brand}</span>
                                        )}
                                    </div>
                                    <span className="font-bold text-slate-900 shrink-0 bg-white border border-slate-200 shadow-sm px-2.5 py-1 rounded whitespace-nowrap">{item.quantity} шт</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

function DesignVariantInline({ installationId }) {
  const [variants, setVariants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchVariants = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${WORKFLOW_UPLOADER_URL}/design/variants/${installationId}`);
      const data = await res.json();
      if (data && data.status === "success") { setVariants(data.items); setError(null); } 
      else setError("Не вдалося завантажити варіанти");
    } catch (e) { setError("Помилка з'єднання з сервером дизайну"); } 
    finally { setLoading(false); }
  }, [installationId]);

  useEffect(() => { if (installationId) fetchVariants(); }, [installationId, fetchVariants]);

  const handleSelect = async (variantId) => {
    try {
      setVariants(prev => prev.map(v => ({ ...v, is_selected: v.id === variantId })));
      await fetch(`${WORKFLOW_UPLOADER_URL}/design/select`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variant_id: variantId, installation_custom_id: installationId })
      });
    } catch (e) { alert("Помилка при збереженні."); fetchVariants(); }
  };

  if (loading) return <div className="p-10 text-center text-slate-400 flex flex-col items-center"><FaSpinner className="animate-spin text-2xl mb-2" /> Завантаження...</div>;
  if (error) return <div className="p-10 text-center text-red-500 font-bold">{error}</div>;
  if (variants.length === 0) return (
    <div className="text-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 m-4">
      <FaImage className="mx-auto text-3xl text-slate-300 mb-2" />
      <p className="text-slate-500 font-bold text-sm">Варіантів ще немає</p>
      <p className="text-xs text-slate-400 mt-1">Завантажте фото в завданні "Розробка 3D".</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50/50">
      {variants.map((v) => (
        <div key={v.id} onClick={() => handleSelect(v.id)} className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer group bg-white ${v.is_selected ? "border-emerald-500 shadow-md ring-1 ring-emerald-100" : "border-slate-200 hover:border-indigo-400"}`}>
          <div className="aspect-video bg-slate-100 relative border-b border-slate-50">
            <img src={driveViewUrl(v.google_file_id)} alt="Design" className="w-full h-full object-cover" />
            {v.is_selected && (
              <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center backdrop-blur-[1px]">
                <div className="bg-white text-emerald-600 px-3 py-1.5 rounded-full font-bold shadow-lg flex items-center gap-1.5 text-xs"><FaCheckCircle /> ЗАТВЕРДЖЕНО</div>
              </div>
            )}
          </div>
          <div className="p-3 flex justify-between items-center bg-white">
            <div className="flex flex-col overflow-hidden pr-2">
              <span className={`font-bold text-xs truncate ${v.is_selected ? "text-emerald-700" : "text-slate-700"}`}>{v.file_name}</span>
            </div>
            <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${v.is_selected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200"}`}>
              {v.is_selected && <FaCheck size={8} />}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskInlineEditor({ task, stageGroupKey, onAddUpdate, isLoading, employees, installationId, currentUserEmpId, nomenclatures }) {
  const [newComment, setNewComment] = useState("");
  
  let statusOptions = STATUS_CONFIG.default;
  if (task.id === "tech_project") statusOptions = STATUS_CONFIG.tech_project_group;
  else if (STATUS_CONFIG[stageGroupKey]) statusOptions = STATUS_CONFIG[stageGroupKey];
  else if (stageGroupKey === "installation") statusOptions = STATUS_CONFIG.installation;

  const initialStatus = statusOptions.find(s => s.key === task.status) ? task.status : statusOptions[0].key;
  const [newStatus, setNewStatus] = useState(initialStatus);
  const [assignedEmpId, setAssignedEmpId] = useState(task.responsibleId);
  const [selectedFiles, setSelectedFiles] = useState([]);
  
  const fileInputRef = useRef(null);
  const ocrFileInputRef = useRef(null);
  const [ocrFile, setOcrFile] = useState(null);
  const [showManualSpec, setShowManualSpec] = useState(false);
  const [manualSpecRefresh, setManualSpecRefresh] = useState(0);

  const canUploadAnyFile = STAGES_WITH_UPLOADS.has(task.id);
  const canUploadPhotos = !["equipment", "proposal"].includes(stageGroupKey) || canUploadAnyFile;
  const isComplectationTask = task.id === 'complectation' || task.id === 'comp_protection';

  useEffect(() => {
    if (selectedFiles.length > 0) {
      if (initialStatus === newStatus && AUTO_STATUS_MAP[task.id]) setNewStatus(AUTO_STATUS_MAP[task.id]);
      if (currentUserEmpId) setAssignedEmpId(currentUserEmpId);
    }
  }, [selectedFiles.length, initialStatus, newStatus, task.id, currentUserEmpId]);

  const hasChanges = newStatus !== task.status || newComment.trim().length > 0 || selectedFiles.length > 0 || String(assignedEmpId) !== String(task.responsibleId);

  const handleFileSelect = (e) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).map((file) => ({
        file, preview: isImageFile(file) ? URL.createObjectURL(file) : null, isImage: isImageFile(file)
      }));
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  const removePhoto = (index) => {
    setSelectedFiles((prev) => {
        const item = prev[index];
        if (item.preview) URL.revokeObjectURL(item.preview);
        return prev.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = () => {
    if (!hasChanges) return;
    onAddUpdate(task.id, {
      status: newStatus, comment: newComment, photos: [], rawFiles: selectedFiles.map(f => f.file), assigned_to: toIntOrNull(assignedEmpId)
    });
    setNewComment("");
    setSelectedFiles([]);
  };

  useEffect(() => { return () => selectedFiles.forEach(f => { if(f.preview) URL.revokeObjectURL(f.preview) }); }, [selectedFiles]);

  return (
    <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex flex-col gap-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Форма (Ліва колонка) */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FaClock /> Статус завдання</h4>
                <div className="flex flex-col gap-2">
                  {statusOptions.map((opt) => {
                    const isSelected = newStatus === opt.key;
                    return (
                      <button key={opt.key} onClick={() => setNewStatus(opt.key)} className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between border ${isSelected ? `${opt.color.replace("text-", "border-").split(" ")[0]} ${opt.color} ring-1 ring-inset ring-black/5 shadow-sm` : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`} type="button">
                        <span className="truncate">{opt.label}</span>
                        {isSelected && <FaCheck size={10}/>}
                      </button>
                    );
                  })}
                </div>
              </div>
              
              <div className="flex flex-col gap-4">
                  <EmployeeSelect label="Відповідальний" employees={employees} selectedId={assignedEmpId} onSelect={setAssignedEmpId} />
                  
                  {isComplectationTask ? (
                    <div className="h-full flex flex-col gap-2">
                        <button onClick={() => ocrFileInputRef.current?.click()} className="w-full flex-1 min-h-[70px] py-3 bg-white border-2 border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-400 rounded-xl text-sm font-bold shadow-sm transition-all flex flex-col items-center justify-center gap-2" type="button">
                            <div className="flex items-center gap-1.5"><FaMagic className="text-indigo-400 text-sm" /><FaFilePdf className="text-red-500 text-2xl" /></div>
                            <span>Завантажити специфікацію (PDF)</span>
                            <span className="text-[10px] font-medium text-slate-400">Оцифрування + збереження</span>
                        </button>
                        <button onClick={() => setShowManualSpec(true)} className="w-full py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2" type="button">
                            <FaPlus size={12}/> Внести вручну
                        </button>
                        <input
                            type="file"
                            accept=".pdf"
                            ref={ocrFileInputRef}
                            onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                    const f = e.target.files[0];
                                    // Add to selectedFiles so it gets saved as attachment too
                                    setSelectedFiles(prev => [...prev, { file: f, preview: null, isImage: false }]);
                                    setOcrFile(f);
                                }
                                e.target.value = '';
                            }}
                            className="hidden"
                        />
                    </div>
                  ) : (
                    canUploadPhotos && (
                        <button onClick={() => fileInputRef.current?.click()} className="w-full h-full min-h-[60px] py-3 bg-indigo-50/50 border-2 border-dashed border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300 rounded-xl text-sm font-bold shadow-sm transition-all flex flex-col items-center justify-center gap-2" type="button">
                            <FaCamera className="text-2xl opacity-70" />
                            <span>{canUploadAnyFile ? "Завантажити файли" : "Додати фотографії"}</span>
                        </button>
                    )
                  )}
              </div>
          </div>

          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Робочі нотатки / Коментар</div>
            <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Вкажіть важливі деталі по етапу..." className="w-full p-3 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] font-medium text-slate-700 shadow-sm" />
          </div>

          {canUploadPhotos && (
            <div>
              <input type="file" multiple accept={canUploadAnyFile ? "*/*" : "image/*"} ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
              {selectedFiles.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 mb-3 p-3 bg-white rounded-xl border border-slate-200 shadow-sm">
                  {selectedFiles.map((fileObj, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group">
                      {fileObj.isImage ? <img src={fileObj.preview} alt="preview" className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-1"><FaFileAlt size={24} className="mb-1 text-slate-300"/><span className="text-[8px] text-center leading-tight truncate w-full">{fileObj.file.name}</span></div>}
                      <button onClick={() => removePhoto(idx)} className="absolute top-1 right-1 bg-white/90 text-red-500 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition shadow-sm hover:bg-red-500 hover:text-white" type="button"><FaTrash size={10} /></button>
                    </div>
                  ))}
                  <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition bg-slate-50" type="button"><FaPlus size={20}/></button>
                </div>
              )}
            </div>
          )}

          <button onClick={handleSubmit} disabled={isLoading || !hasChanges} className={`w-full py-4 rounded-xl font-extrabold text-sm shadow-sm transition-all flex justify-center items-center gap-2 ${hasChanges ? "bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] shadow-slate-300" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`} type="button">
            {isLoading && <FaSpinner className="animate-spin" />} Зберегти зміни в системі
          </button>
        </div>

        {/* Права колонка: Історія */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col h-full min-h-[300px] max-h-[500px]">
           <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1.5"><FaHistory /> Історія виконання</h4>
           <div className="flex-1 overflow-y-auto custom-scrollbar pr-2">
              <HistoryTimeline logs={task.history} stageGroupKey={stageGroupKey} task={task} getEmployeeName={(id) => getEmployeeNameStr(id, employees)} />
           </div>
        </div>

      </div>

      {isComplectationTask && (
          <div className="w-full">
              <SpecificationSummaryWidget installationId={installationId} taskId={task.id} refreshTrigger={task.history.length + manualSpecRefresh} nomenclatures={nomenclatures} />
          </div>
      )}

      {showManualSpec && (
          <ManualSpecBuilder
              isOpen={showManualSpec}
              onClose={() => setShowManualSpec(false)}
              onSuccess={() => setManualSpecRefresh(v => v + 1)}
              installationId={installationId}
              taskId={task.id}
              title={task.id === 'comp_protection' ? 'Специфікація ел. захисту' : 'Комплектація матеріалів'}
          />
      )}

      {ocrFile && (
          <SpecOcrMappingModal
              file={ocrFile}
              installationId={installationId}
              taskId={task.id}
              nomenclatures={nomenclatures}
              onClose={() => setOcrFile(null)}
              onSuccess={() => {
                  setOcrFile(null);
                  const finalStatus = AUTO_STATUS_MAP[task.id] || "done";
                  setNewStatus(finalStatus);
                  if (currentUserEmpId) setAssignedEmpId(currentUserEmpId);

                  // PDF вже є в selectedFiles — передаємо їх разом зі статусом
                  onAddUpdate(task.id, {
                      status: finalStatus,
                      comment: "✅ Специфікацію успішно оцифровано, перевірено та затверджено.",
                      photos: [],
                      rawFiles: selectedFiles.map(f => f.file),
                      assigned_to: currentUserEmpId || assignedEmpId
                  });
                  setSelectedFiles([]);
              }}
          />
      )}
    </div>
  );
}

function TaskAccordionItem({ task, isExpanded, onToggle, stageGroupKey, onAddUpdate, isLoading, employees, installationId, currentUserEmpId, nomenclatures }) {
  const isDone = ["done", "launched", "approved", "selected", "completed", "done_on_site", "arrived", "created"].includes(task.status);
  let statusMeta;
  if (task.id === "project_approval") statusMeta = STATUS_CONFIG.project_selector.find(s => s.key === task.status) || STATUS_CONFIG.project_selector[0];
  else statusMeta = getStatusMeta(stageGroupKey, task.status, task.id);
  const assignedName = getEmployeeNameStr(task.responsibleId, employees);

  return (
    <div className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${isExpanded ? "border-indigo-300 shadow-lg shadow-indigo-100/50 my-5" : "border-slate-200 shadow-sm hover:border-indigo-200 mb-3 hover:shadow-md"}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-5 md:px-6 md:py-5 text-left focus:outline-none relative overflow-hidden group bg-white" type="button">
        {isDone && <FaCheckCircle className="absolute -right-8 -top-8 text-8xl text-emerald-500/5 pointer-events-none" />}
        <div className="flex-1 flex flex-col md:flex-row md:items-center gap-3 md:gap-8 relative z-10">
          <div className="flex-1">
            <h3 className={`font-extrabold text-lg md:text-xl transition-colors tracking-tight ${isExpanded ? "text-indigo-700" : (isDone ? "text-slate-600" : "text-slate-900")}`}>
              {task.title}
            </h3>
            <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${statusMeta.color}`}>
                  {statusMeta.label}
                </span>
                {assignedName && (
                  <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                    <FaUserTie className="text-slate-400"/> {assignedName}
                  </span>
                )}
                {task.history && task.history.length > 0 && !isExpanded && (
                  <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                    <FaHistory className="opacity-70"/> Оновлено: {task.history[0].date}
                  </span>
                )}
            </div>
          </div>
        </div>
        <div className={`shrink-0 ml-4 p-2.5 rounded-full transition-all duration-300 relative z-10 ${isExpanded ? "bg-indigo-600 text-white rotate-180 shadow-md shadow-indigo-200" : "bg-slate-50 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 border border-slate-100"}`}>
          <FaChevronDown size={14} />
        </div>
      </button>

      <div className="grid transition-[grid-template-rows] duration-300 ease-in-out" style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          {task.id === "project_approval" ? (
             <DesignVariantInline installationId={installationId} />
          ) : (
             <TaskInlineEditor task={task} stageGroupKey={stageGroupKey} onAddUpdate={onAddUpdate} isLoading={isLoading} employees={employees} installationId={installationId} currentUserEmpId={currentUserEmpId} nomenclatures={nomenclatures} />
          )}
        </div>
      </div>
    </div>
  );
}

function StageNavigatorStepper({ activeStage, onSelect }) {
  const scrollRef = useRef(null);
  const itemRefs = useRef({});

  useEffect(() => {
    const el = itemRefs.current[activeStage];
    if (el && scrollRef.current) {
        const container = scrollRef.current;
        const scrollLeft = el.offsetLeft - (container.offsetWidth / 2) + (el.offsetWidth / 2);
        container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [activeStage]);

  return (
    <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div ref={scrollRef} className="w-full overflow-x-auto no-scrollbar scroll-smooth">
          <div className="max-w-7xl mx-auto min-w-max px-4 sm:px-8 py-5 relative flex items-start sm:items-center justify-between gap-8">
            <div className="absolute top-[44px] left-[5%] right-[5%] h-[2px] bg-slate-100 -z-10 hidden sm:block"></div>
            {STAGE_GROUPS.map((s) => {
              const isActive = s.key === activeStage;
              const currentIndex = STAGE_GROUPS.findIndex(x => x.key === activeStage);
              const thisIndex = STAGE_GROUPS.findIndex(x => x.key === s.key);
              const isPassed = thisIndex < currentIndex;

              return (
                <button
                  key={s.key} ref={(el) => (itemRefs.current[s.key] = el)} onClick={() => onSelect(s.key)}
                  className="shrink-0 flex flex-col items-center gap-2 group focus:outline-none relative z-10 w-24"
                  type="button"
                >
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm border-[3px] bg-white ${isActive ? "border-indigo-600 text-indigo-600 scale-110 shadow-indigo-200/50" : (isPassed ? "border-emerald-500 text-emerald-500" : "border-slate-100 text-slate-300 group-hover:border-indigo-200 group-hover:text-indigo-400")}`}>
                     {isPassed && !isActive ? <FaCheck size={16} /> : <s.icon size={18} />}
                  </div>
                  <span className={`text-[11px] font-bold tracking-wide transition-colors text-center ${isActive ? "text-indigo-800" : (isPassed ? "text-slate-600" : "text-slate-400 group-hover:text-indigo-500")}`}>
                     {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
    </div>
  );
}

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 transform transition-all scale-100">
        <div className="flex items-center gap-3 text-indigo-600 mb-4"><FaThumbtack size={24} /><h3 className="text-lg font-bold text-slate-900">{title}</h3></div>
        <p className="text-slate-600 mb-6 text-sm leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 px-4 rounded-xl font-bold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition" type="button">Скасувати</button>
          <button onClick={onConfirm} className="flex-1 py-3 px-4 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-lg shadow-indigo-200" type="button">Підтвердити</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeSelect({ employees, selectedId, onSelect, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);
  const selectedEmployee = (employees || []).find(e => String(e.custom_id) === String(selectedId));
  const filteredEmployees = (employees || []).filter(e => {
    if (!searchTerm) return true;
    return (e.name || "").toLowerCase().includes(searchTerm.toLowerCase()) || String(e.custom_id).includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    function handleClickOutside(event) { if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false); }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-w-0 relative" ref={wrapperRef}>
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><FaUserTie /> {label}</div>
      <div className="relative" onClick={() => setIsOpen(true)}>
        <div className={`w-full flex items-center justify-between border rounded-xl px-4 py-3 text-sm bg-white cursor-text transition-all shadow-sm ${isOpen ? "ring-2 ring-indigo-500 border-indigo-500" : "border-slate-200 hover:border-indigo-300"}`}>
          {!isOpen && selectedEmployee ? (
            <span className="font-bold text-slate-800 truncate pr-2">{selectedEmployee.name}</span>
          ) : (
            <input type="text" className="w-full outline-none bg-transparent placeholder:text-slate-400 font-medium" placeholder={selectedEmployee ? selectedEmployee.name : "Введіть ім'я..."} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }} autoFocus={isOpen} />
          )}
          <div className="flex items-center gap-1 text-slate-400">
            {selectedEmployee && !isOpen && <button onClick={(e) => { e.stopPropagation(); onSelect(null); setSearchTerm(""); }} className="p-1 hover:text-red-500 hover:bg-red-50 rounded-full transition" type="button"><FaTimes /></button>}
            {!isOpen && <FaSearch className="text-xs" />}
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100">
          {filteredEmployees.length > 0 ? filteredEmployees.map(emp => (
            <button key={emp.id} onClick={() => { onSelect(emp.custom_id); setIsOpen(false); setSearchTerm(""); }} className={`w-full text-left px-4 py-3 text-sm flex justify-between items-center hover:bg-indigo-50 transition border-b border-slate-50 last:border-0 ${String(selectedId) === String(emp.custom_id) ? "bg-indigo-50/50 text-indigo-700" : "text-slate-700"}`} type="button">
              <span className="font-bold">{emp.name}</span>
            </button>
          )) : <div className="px-4 py-3 text-sm text-slate-400 text-center italic">Нікого не знайдено</div>}
        </div>
      )}
    </div>
  );
}

function PhotoViewerModal({ isOpen, onClose, fileIds, startIndex = 0 }) {
    const [idx, setIdx] = useState(startIndex);
    useEffect(() => { if (isOpen) setIdx(startIndex); }, [isOpen, startIndex]);
    if (!isOpen) return null;
  
    const currentId = fileIds[idx];
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col h-full max-h-[95vh]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="text-sm font-bold text-slate-500">Файл {idx + 1} з {fileIds.length}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 hover:bg-slate-100 disabled:opacity-50 transition" type="button">Назад</button>
              <button onClick={() => setIdx(Math.min(fileIds.length - 1, idx + 1))} disabled={idx === fileIds.length - 1} className="px-4 py-2 rounded-xl border border-slate-200 font-bold text-xs bg-slate-50 hover:bg-slate-100 disabled:opacity-50 transition" type="button">Далі</button>
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              <button onClick={onClose} className="p-2.5 bg-slate-100 hover:bg-red-50 hover:text-red-500 rounded-full transition" type="button"><FaTimes size={16}/></button>
            </div>
          </div>
          <div className="flex-1 bg-slate-100/50 relative flex items-center justify-center overflow-hidden p-4">
            <img src={driveViewUrl(currentId)} alt="Preview" className="max-h-full max-w-full object-contain drop-shadow-lg rounded-lg" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 -z-10">
               <FaFileAlt size={64} className="mb-4 text-slate-300 drop-shadow-sm"/>
               <span className="text-base font-bold text-slate-600">Попередній перегляд недоступний</span>
               <a href={driveViewUrl(currentId)} target="_blank" rel="noreferrer" className="mt-5 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-200 font-bold text-sm transition active:scale-95">Відкрити в Google Drive</a>
            </div>
          </div>
        </div>
      </div>
    );
}

function HistoryTimeline({ logs, stageGroupKey, task, getEmployeeName }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIds, setViewerIds] = useState([]);
  const [viewerStart, setViewerStart] = useState(0);

  const openViewer = (ids, index) => { setViewerIds(ids); setViewerStart(index); setViewerOpen(true); };
  if (!logs || logs.length === 0) return <div className="text-center text-slate-400 py-10 text-xs font-medium border-2 border-dashed border-slate-100 rounded-xl bg-slate-50">Історія порожня. Внесіть зміни, щоб почати.</div>;

  return (
    <>
      <div className="space-y-5 py-2">
        {logs.map((log) => {
          const hasStatusChange = log.old_status && log.new_status && log.old_status !== log.new_status;
          const oldMeta = hasStatusChange ? getStatusMeta(stageGroupKey, log.old_status, task.id) : null;
          const newMeta = hasStatusChange ? getStatusMeta(stageGroupKey, log.new_status, task.id) : null;
          const oldResp = log.old_responsible; const newResp = log.new_responsible;
          const hasRespInfo = oldResp != null || newResp != null;
          const respChanged = String(oldResp ?? "") !== String(newResp ?? "");
          const fileIds = Array.isArray(log.photo_file_ids) ? log.photo_file_ids.filter(Boolean) : [];
          const links = Array.isArray(log.photos) ? log.photos.filter(Boolean) : [];
          const attachments = [
            ...fileIds.map((id, i) => ({ fileId: id, link: links[i] || driveViewUrl(id), idx: i })),
            ...links.slice(fileIds.length).map((link, i) => ({ fileId: null, link, idx: fileIds.length + i }))
          ];

          return (
            <div key={log.id} className="flex gap-4 relative group">
              <div className="absolute left-[15px] top-8 bottom-[-24px] w-0.5 bg-slate-100 group-last:hidden" />
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 z-10 border-2 border-slate-200 mt-0.5 shadow-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase">{log.actor?.[0] || "U"}</span>
              </div>
              <div className="flex-1 bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:border-indigo-100 transition-colors">
                <div className="flex justify-between items-start mb-3">
                  <span className="font-bold text-sm text-slate-800">{log.actor || log.user || "Невідомий"}</span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">{log.date || formatUkShort(log.created_at)}</span>
                </div>
                {hasStatusChange && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2 py-1 rounded-md border ${oldMeta.color} opacity-60 line-through`}>{oldMeta.label}</span>
                    <FaArrowRight className="text-slate-300 text-[10px]" />
                    <span className={`px-2 py-1 rounded-md border ${newMeta.color} font-bold shadow-sm`}>{newMeta.label}</span>
                  </div>
                )}
                {hasRespInfo && (
                  <div className="mb-3 text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 flex items-center gap-2">
                     <FaUserTie className="text-slate-400"/>
                     <div className="flex-1">
                        {respChanged ? (
                          <><span className="line-through opacity-50 mr-2">{getEmployeeName(oldResp)}</span><FaArrowRight className="inline text-slate-300 text-[10px] mr-2" /><span className="font-bold text-slate-800">{getEmployeeName(newResp)}</span></>
                        ) : (<span className="font-bold text-slate-800">{getEmployeeName(newResp ?? oldResp)}</span>)}
                     </div>
                  </div>
                )}
                {log.comment && <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line bg-indigo-50/30 p-3 rounded-lg border border-indigo-50">{log.comment}</p>}
                {attachments.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {attachments.map((att) => {
                       if (att.fileId) {
                         return (
                            <div key={`att-${log.id}-${att.idx}`} className="flex items-center gap-1 group/file">
                              <button type="button" onClick={() => openViewer(fileIds, att.idx)} className="block w-14 h-14 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden hover:border-indigo-400 hover:shadow-md transition-all relative">
                                <img src={driveThumbUrl(att.fileId, 200)} alt="preview" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.querySelector('.fallback-icon').style.display = 'flex'; }} />
                                <div className="fallback-icon w-full h-full absolute inset-0 hidden items-center justify-center text-slate-400 bg-white"><FaFileAlt size={20} /></div>
                              </button>
                            </div>
                         );
                       }
                       return (<a key={`link-${log.id}-${att.idx}`} href={att.link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 shadow-sm transition"><FaDownload size={16}/></a>)
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <PhotoViewerModal isOpen={viewerOpen} onClose={() => setViewerOpen(false)} fileIds={viewerIds} startIndex={viewerStart} />
    </>
  );
}

// ==================================================================================
// 7. MAIN SCREEN 
// ==================================================================================

export default function FieldWorkflow({ project }) {
  const navigate = useNavigate();
  const { user, employee } = useAuth();

  const [activeStage, setActiveStage] = useState(project?.workflow_stage || "tech_review");
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [nomenclatures, setNomenclatures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: "", message: "", onConfirm: null });

  const installationId = project?.custom_id;
  const currentUserEmpId = employee?.custom_id || null;

  const loadDictionaries = useCallback(async () => {
    try {
      const [empRes, nomRes, catRes] = await Promise.all([
          supabase.from("employees").select("id, custom_id, name, position").order("custom_id", { ascending: true }).limit(300),
          supabase.from('nomenclature').select('id, name, sku, brand, model, category_id, unit:units(name)').eq('is_active', true),
          supabase.from('categories').select('*')
      ]);
      setEmployees(Array.isArray(empRes.data) ? empRes.data : []);

      const cats = catRes.data || [];
      const processedNom = (nomRes.data || []).map(item => {
          let path = [];
          let currentId = item.category_id;
          while (currentId) {
              const cat = cats.find(c => c.id === currentId);
              if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
          }
          const categoryPath = path.join(' › ');
          // fullName = "CategoryPath › Name" for display in the dropdown
          const fullName = categoryPath ? `${categoryPath} › ${item.name}` : item.name;
          return { ...item, fullName, categoryPath };
      });
      setNomenclatures(processedNom);
    } catch (e) { console.error(e); }
  }, []);

  const loadWorkflowData = useCallback(async () => {
    if (!installationId) return;
    setLoading(true);
    try {
      const [stagesResp, eventsResp] = await Promise.all([
        supabase.from("project_stages").select("stage_key, status, responsible_emp_custom_id").eq("installation_custom_id", installationId),
        supabase.from("workflow_events").select("*").eq("installation_custom_id", installationId).order("created_at", { ascending: false })
      ]);

      const stagesDict = (stagesResp.data || []).reduce((acc, item) => {
        acc[item.stage_key] = { status: item.status, responsibleId: toIntOrNull(item.responsible_emp_custom_id) };
        return acc;
      }, {});

      const formattedHistory = (eventsResp.data || []).map(ev => ({ ...ev, user: ev.actor || "Невідомий", date: formatUkShort(ev.created_at) }));

      const tasksTemplate = DETAILED_TASKS[activeStage] || [];
      const mappedTasks = tasksTemplate.map(templateTask => {
        const taskKey = templateTask.id;
        let stageInfo = stagesDict?.[taskKey] || {};
        let statusFromDB = stageInfo.status || "todo"; 
        if (!stageInfo.status) {
            if (taskKey === "equipment" || taskKey === "project_design" || taskKey === "commercial_proposal") statusFromDB = "waiting";
        }
        if (taskKey === "project_approval") statusFromDB = "selection_needed";

        const history = formattedHistory.filter(h => h.stage_key === taskKey);
        return { ...templateTask, status: statusFromDB, history, responsibleId: stageInfo.responsibleId || null };
      });

      setTasks(mappedTasks);
      
      if (mappedTasks.length === 1) {
          setExpandedTaskId(mappedTasks[0].id);
      } else {
          setExpandedTaskId(null); 
      }
    } catch (e) { console.error("Workflow Load Error:", e); } 
    finally { setLoading(false); }
  }, [installationId, activeStage]);

  useEffect(() => { loadDictionaries(); }, [loadDictionaries]);
  useEffect(() => { loadWorkflowData(); }, [loadWorkflowData]);

  const handleAddUpdate = async (taskId, updateData) => {
    if (!installationId || !user) return;
    setSaveLoading(true);
    try {
      let uploadedLinks = []; let uploadedFileIds = [];
      if (updateData?.rawFiles?.length) {
        const up = await uploadWorkflowFiles({ files: updateData.rawFiles, installationId, stageKey: taskId });
        uploadedLinks = up.links || []; uploadedFileIds = up.fileIds || [];
      }
      const photos = [...(Array.isArray(updateData.photos) ? updateData.photos : []), ...uploadedLinks];
      const photo_file_ids = [...(Array.isArray(updateData.photo_file_ids) ? updateData.photo_file_ids : []), ...uploadedFileIds];
      const actorName = await resolveActorName({ user, employee });

      const { error: rpcError } = await supabase.rpc("update_workflow_stage", {
        p_installation_id: installationId, p_stage_key: taskId, p_new_status: updateData.status, p_actor: actorName, p_comment: updateData.comment || "",
        p_photos: photos, p_photo_file_ids: photo_file_ids, p_new_responsible: toIntOrNull(updateData.assigned_to), p_set_as_global_stage: false
      });
      if (rpcError) throw rpcError;

      await loadWorkflowData();
    } catch (e) { alert(`Помилка: ${e?.message || "Помилка з'єднання"}`); } 
    finally { setSaveLoading(false); }
  };

  const handleSetCurrentStage = () => {
    const stageLabel = STAGE_GROUPS.find(s => s.key === activeStage)?.label;
    setConfirmModal({
      isOpen: true, title: "Оновити статус проекту?", message: `Встановити етап "${stageLabel}" як активний для всього об'єкту?`,
      onConfirm: async () => {
        try {
          if (!user) return;
          const actorName = await resolveActorName({ user, employee });
          const { error: rpcError } = await supabase.rpc("update_workflow_stage", {
            p_installation_id: installationId, p_stage_key: activeStage, p_new_status: "active", p_actor: actorName, p_comment: "", p_photos: [], p_photo_file_ids: [], p_new_responsible: null, p_set_as_global_stage: true
          });
          if (rpcError) throw rpcError;
          window.location.reload();
        } catch (e) { alert("Помилка"); } 
        finally { setConfirmModal(prev => ({ ...prev, isOpen: false })); }
      }
    });
  };

  const openMeasurementTool = () => { navigate(`/measurements/${installationId}`); };
  const sortedTasks = [...tasks];

  return (
    <div className="w-full h-full flex flex-col bg-slate-50/50">
      <StageNavigatorStepper activeStage={activeStage} onSelect={setActiveStage} />

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          
          <div className="mb-8 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex-1 flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 shadow-inner">
                  <FaThumbtack size={20} />
              </div>
              <div>
                  <h2 className="font-extrabold text-slate-800 text-base md:text-lg">Етап: {STAGE_GROUPS.find(s => s.key === activeStage)?.label}</h2>
                  {project?.workflow_stage !== activeStage ? (
                      <p className="text-xs font-medium text-slate-500 mt-1">Цей етап зараз не є активним для всього проекту.</p>
                  ) : (
                      <p className="text-xs text-emerald-600 font-bold flex items-center gap-1.5 mt-1"><FaCheckCircle/> Активний етап об'єкту</p>
                  )}
              </div>
            </div>
            
            <div className="flex gap-3 w-full sm:w-auto">
                {project?.workflow_stage !== activeStage && (
                  <button onClick={handleSetCurrentStage} className="flex-1 sm:flex-none text-sm font-bold text-white bg-slate-900 px-6 py-3.5 rounded-xl hover:bg-slate-800 transition shadow-lg shadow-slate-200 active:scale-95" type="button">
                    Зробити поточним
                  </button>
                )}
                {activeStage === "tech_review" && (
                  <button onClick={openMeasurementTool} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3.5 rounded-xl shadow-lg shadow-indigo-200 transition flex items-center justify-center gap-2 font-bold text-sm active:scale-95" type="button">
                    <FaTools className="text-indigo-200" /> Відкрити заміри
                  </button>
                )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-32 text-indigo-400"><FaSpinner className="animate-spin text-5xl" /></div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedTasks.map(task => (
                <TaskAccordionItem
                  key={task.id}
                  task={task}
                  isExpanded={expandedTaskId === task.id}
                  onToggle={() => setExpandedTaskId(prev => prev === task.id ? null : task.id)}
                  stageGroupKey={activeStage}
                  onAddUpdate={handleAddUpdate}
                  isLoading={saveLoading}
                  employees={employees}
                  nomenclatures={nomenclatures}
                  installationId={installationId}
                  currentUserEmpId={currentUserEmpId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} />
    </div>
  );
}