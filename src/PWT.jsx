import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  FaCheck, FaCamera, FaHistory, FaTimes,
  FaChevronRight, FaChevronDown, FaBoxOpen,
  FaImage, FaExclamationTriangle,
  FaTrash, FaPlus, FaSpinner, FaThumbtack, FaCheckCircle,
  FaUserTie, FaSearch, FaArrowRight, FaClipboardList,
  FaFileAlt, FaDownload, FaFilePdf, FaMagic
} from "react-icons/fa";
import { motion, AnimatePresence } from 'framer-motion';

import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";
import ManualSpecBuilder from "./pages/ManualSpecBuilder";
import { NomenclatureModal } from "./pages/NomenclatureModal";
import { findBestNomenclatureMatch, normalizeName } from "./utils/nameMatching";
import { ingestOfferInBackground } from "./utils/commercialOffer";
import { T, Btn, IconBtn, Chip, Modal, Linkify, useToast, humanError } from "./ui";
import {
  STAGE_GROUPS, tasksOfGroup, normalizeGroupKey, normalizeTaskStatus, taskStatusMeta,
  taskStatusOptions, taskDefaultStatus, isTaskDone, taskHasUploads, taskAutoDoneStatus,
} from "./domain/stages";

const WORKFLOW_UPLOADER_URL = "https://quiet-water-a1ad.kairosost38500.workers.dev";
const OCR_API_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev/parse-pdf';

// ==================================================================================
// 1. КОНФІГУРАЦІЯ — етапи й статуси беремо зі спільного списку (src/domain/stages.js)
// ==================================================================================

const tasksForStage = (groupKey) => tasksOfGroup(groupKey).map(t => ({ id: t.key, title: t.title }));

// ==================================================================================
// 2. HELPER FUNCTIONS
// ==================================================================================

const getStatusMeta = (taskId, statusKey) => taskStatusMeta(taskId, statusKey);

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

async function uploadWorkflowFiles({ files, installationId, stageKey, uploadedBy }) {
  if (!files || files.length === 0) return { links: [], fileIds: [] };
  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("object_number", String(installationId));
  fd.append("doc_type", getDocTypeLabel(stageKey));
  if (stageKey) fd.append("stage_key", stageKey);
  if (uploadedBy) fd.append("uploaded_by", uploadedBy);

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

const NomenclatureSelect = ({ options, value, onChange, placeholder, hasError, onCreateNew }) => {
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
                        {onCreateNew && (
                            <div className="p-1.5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { onCreateNew(search.trim()); setIsOpen(false); setSearch(''); }}
                                    className="w-full py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                                >
                                    <FaPlus size={10} /> {search.trim() ? `Створити «${search.trim()}»` : 'Створити нову позицію'}
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

function SpecOcrMappingModal({ file, installationId, taskId, onClose, onSuccess, nomenclatures, categories = [], employee }) {
    const toast = useToast();
    const [isParsing, setIsParsing] = useState(true);
    const [mappedItems, setMappedItems] = useState([]);
    const [error, setError] = useState(null);

    // Пам'ять співставлень (supplier_mappings): "назва з документа" -> номенклатура
    const [memory, setMemory] = useState([]);
    // Свіжий список номенклатури — тягнеться з бази при відкритті модалки,
    // щоб щойно додані позиції (з іншого екрана) одразу брали участь у співставленні
    const [baseNoms, setBaseNoms] = useState(nomenclatures);
    // Позиції, створені "на льоту" в цій модалці
    const [extraNoms, setExtraNoms] = useState([]);
    const [quickAdd, setQuickAdd] = useState({ open: false, name: '', rowIndex: null });

    const allNoms = [...baseNoms.filter(n => !extraNoms.some(e => e.id === n.id)), ...extraNoms];

    const notify = (m, t) => toast(m, t || 'success');

    const handleQuickAddSuccess = (savedItem) => {
        if (!savedItem) return;
        let path = [];
        let currentId = savedItem.category_id;
        while (currentId) {
            const cat = categories.find(c => c.id === currentId);
            if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
        }
        const categoryPath = path.join(' › ');
        const processed = { ...savedItem, categoryPath, fullName: categoryPath ? `${categoryPath} › ${savedItem.name}` : savedItem.name };
        setExtraNoms(prev => [...prev.filter(n => n.id !== processed.id), processed]);
        setMappedItems(prev => {
            const idx = quickAdd.rowIndex;
            if (idx === null || !prev[idx]) return prev;
            const newArr = [...prev];
            newArr[idx] = { ...newArr[idx], nomenclature_id: processed.id, auto: null };
            return newArr;
        });
        setQuickAdd({ open: false, name: '', rowIndex: null });
    };

    useEffect(() => {
        const parseFile = async () => {
            // Свіжі дані для співставлення: словник пам'яті + актуальна номенклатура з бази
            // (пропси можуть бути застарілими, якщо позицію щойно додали з іншого екрана)
            let memRows = [];
            let freshNoms = nomenclatures;
            try {
                const [memRes, nomRes, catRes] = await Promise.all([
                    supabase.from('supplier_mappings').select('*'),
                    supabase.from('nomenclature').select('id, name, sku, brand, model, technical_characteristics, category_id, unit:units(name)').eq('is_active', true),
                    supabase.from('categories').select('id, name, parent_id')
                ]);
                memRows = memRes.data || [];
                if (nomRes.data) {
                    const cats = catRes.data || [];
                    freshNoms = nomRes.data.map(item => {
                        let path = [];
                        let currentId = item.category_id;
                        while (currentId) {
                            const cat = cats.find(c => c.id === currentId);
                            if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
                        }
                        const categoryPath = path.join(' › ');
                        return { ...item, categoryPath, fullName: categoryPath ? `${categoryPath} › ${item.name}` : item.name };
                    });
                    setBaseNoms(freshNoms);
                }
            } catch { /* якщо не вийшло — працюємо на пропсах */ }
            setMemory(memRows);

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
                    const initialMapping = data.items.map(item => {
                        const rawName = item.original_name + (item.technical_chars ? ` ${item.technical_chars}` : '');
                        const displayName = item.original_name + (item.technical_chars ? ` (${item.technical_chars})` : '');
                        // Нормалізоване співставлення: пам'ять -> точна назва -> SKU -> схожість
                        const match = findBestNomenclatureMatch(rawName, freshNoms, memRows);
                        return {
                            id: Math.random().toString(36).substr(2, 9),
                            original_name: displayName,
                            quantity: parseFloat(item.quantity) || 1,
                            unit: item.unit || 'шт',
                            nomenclature_id: match.id || '',
                            // auto: 'memory' (словник) | 'exact' (точна назва/SKU) | 'fuzzy' (схожість)
                            auto: match.id ? match.source : null
                        };
                    });
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
    }, [file]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleConfirm = async () => {
        const unmapped = mappedItems.filter(item => !item.nomenclature_id);
        if (unmapped.length > 0) return toast(`Залишилось ${unmapped.length} неідентифікованих позицій! Оберіть товар або видаліть рядок.`, 'warning');
        if (mappedItems.length === 0) return toast('Специфікація порожня!', 'warning');

        setIsParsing(true);
        try {
            // Версія наскрізна по ВСІХ специфікаціях об'єкта (у БД унікальний ключ installation+version,
            // без типу) — інакше "матеріали" і "ел. захист" конфліктують за version=1
            const { data: existingAll } = await supabase.from('specifications')
                .select('version')
                .eq('installation_custom_id', installationId);
            const nextVersion = existingAll && existingAll.length > 0 ? Math.max(...existingAll.map(s => s.version)) + 1 : 1;

            // Архівуємо лише специфікації ЦЬОГО типу (notes = taskId)
            await supabase.from('specifications').update({ status: 'archived' })
                .eq('installation_custom_id', installationId)
                .eq('notes', taskId);

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

            // Запам'ятовуємо співставлення "назва з документа -> наш товар":
            // нові назви додаються, виправлені прив'язки — перезаписуються
            const changedMappings = [];
            const seenNames = new Set();
            for (const item of mappedItems) {
                if (!item.original_name || !item.nomenclature_id) continue;
                const cleanName = normalizeName(item.original_name);
                if (!cleanName || seenNames.has(cleanName)) continue;
                seenNames.add(cleanName);
                const existing = memory.find(m => normalizeName(m.supplier_item_name) === cleanName);
                if (!existing || existing.nomenclature_id !== item.nomenclature_id) {
                    changedMappings.push({ supplier_item_name: item.original_name.trim(), nomenclature_id: item.nomenclature_id });
                }
            }
            if (changedMappings.length > 0) {
                await supabase.from('supplier_mappings').upsert(changedMappings, { onConflict: 'supplier_item_name' });
            }

            onSuccess();
        } catch (err) {
            toast(err.message, 'error');
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
                                <span className="text-[11px] font-semibold text-slate-400">Позиції специфікації</span>
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
                                                        {item.auto === 'memory' && item.nomenclature_id && <span className="inline-block mt-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">з пам'яті</span>}
                                                        {item.auto === 'exact' && item.nomenclature_id && <span className="inline-block mt-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">= Точна назва</span>}
                                                        {item.auto === 'fuzzy' && item.nomenclature_id && <span className="inline-block mt-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">≈ Схоже — перевірте</span>}
                                                    </td>
                                                    <td className="px-2 py-4 align-middle border-r border-slate-200 text-center">
                                                        <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                                            <input type="number" min="0" step="0.01" value={item.quantity} onChange={e => { const newArr = [...mappedItems]; newArr[index].quantity = e.target.value; setMappedItems(newArr); }} className="w-12 text-center text-sm font-black text-indigo-700 bg-transparent outline-none"/>
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase">{item.unit}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 align-middle border-l-2 border-indigo-100">
                                                        <NomenclatureSelect options={allNoms} value={item.nomenclature_id} hasError={hasError} placeholder="Натисніть та оберіть товар" onChange={val => { const newArr = [...mappedItems]; newArr[index].nomenclature_id = val; newArr[index].auto = null; setMappedItems(newArr); }} onCreateNew={(name) => setQuickAdd({ open: true, name: name || item.original_name, rowIndex: index })}/>
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

            {/* Швидке створення позиції номенклатури, якої немає в базі */}
            <NomenclatureModal
                isOpen={quickAdd.open}
                onClose={() => setQuickAdd({ open: false, name: '', rowIndex: null })}
                onSuccess={handleQuickAddSuccess}
                onPickExisting={handleQuickAddSuccess}
                showToast={notify}
                initialName={quickAdd.name}
            />
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
            {/* Компактне резюме без переліку позицій — повний список живе в «Забезпеченні об'єктів» */}
            <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs font-bold text-slate-500">
                    Завантажено позицій: <span className="text-slate-800 text-base font-black ml-1">{totalItems}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-medium">Повний перелік і забезпечення — у розділі «Забезпечення об'єктів»</div>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  ВИБІР ТА ЗАТВЕРДЖЕННЯ ВАРІАНТУ 3D
 *  Варіанти — це всі файли, завантажені в «Розробку 3D візуалізації».
 *  Раніше їх записував у project_design_variants сервер завантаження,
 *  але з червня 2026 він перестав, і вибір показував «Варіантів ще немає».
 *  Тепер варіанти беремо прямо з історії «Розробки 3D», а в таблицю
 *  пишемо лише той, що затвердили (бот надсилає його в гілку Telegram).
 * ------------------------------------------------------------------- */

const variantThumb = (fileId) => `${WORKFLOW_UPLOADER_URL}/thumb/${encodeURIComponent(fileId)}?size=640`;
const driveOpenUrl = (fileId) => `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;

function DesignVariantInline({ installationId, onApproved }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);       // уже записані варіанти (і затверджений)
  const [events, setEvents] = useState([]);   // завантаження в «Розробку 3D»
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState({});

  const load = useCallback(async () => {
    const [v, ev] = await Promise.all([
      supabase.from('project_design_variants').select('*').eq('installation_custom_id', installationId).order('created_at'),
      supabase.from('workflow_events').select('id, created_at, actor, photos, photo_file_ids')
        .eq('installation_custom_id', installationId).eq('stage_key', 'project_design').order('created_at'),
    ]);
    setRows(v.data || []);
    setEvents(ev.data || []);
    setLoading(false);
  }, [installationId]);

  useEffect(() => { if (installationId) load(); }, [installationId, load]);

  const variants = useMemo(() => {
    const seen = new Set();
    const list = [];
    rows.forEach(r => {
      if (!r.google_file_id || seen.has(r.google_file_id)) return;
      seen.add(r.google_file_id);
      list.push({ key: `v${r.id}`, fileId: r.google_file_id, name: r.file_name, at: r.created_at, row: r, link: r.public_url });
    });
    events.forEach(ev => (ev.photo_file_ids || []).forEach((fid, i) => {
      if (!fid || seen.has(fid)) return;
      seen.add(fid);
      list.push({ key: `e${ev.id}-${i}`, fileId: fid, name: null, at: ev.created_at, by: ev.actor, row: null, link: (ev.photos || [])[i] || null });
    }));
    list.sort((a, b) => new Date(a.at) - new Date(b.at));
    return list.map((v, i) => ({ ...v, label: `Варіант ${i + 1}` }));
  }, [rows, events]);

  const approve = async (v) => {
    if (v.row?.is_selected || busy) return;
    setBusy(v.key);
    try {
      // Затверджений — лише один
      const { error: e1 } = await supabase.from('project_design_variants')
        .update({ is_selected: false }).eq('installation_custom_id', installationId).eq('is_selected', true);
      if (e1) throw e1;
      // telegram_sent = false — бот надішле затверджений варіант у гілку об'єкта
      const patch = { is_selected: true, telegram_sent: false };
      const { error: e2 } = v.row
        ? await supabase.from('project_design_variants').update(patch).eq('id', v.row.id)
        : await supabase.from('project_design_variants').insert({
            installation_custom_id: installationId, google_file_id: v.fileId,
            file_name: v.name || v.label, public_url: v.link || driveOpenUrl(v.fileId), ...patch,
          });
      if (e2) throw e2;
      await load();
      onApproved?.(v.label);
    } catch (e) {
      toast(humanError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="py-8 text-center text-slate-400"><FaSpinner className="animate-spin inline text-xl" /></div>;
  if (variants.length === 0) return (
    <div className="text-center py-8 px-4 border border-dashed border-slate-200 rounded-xl bg-white">
      <FaImage className="mx-auto text-2xl text-slate-300 mb-2" />
      <p className="text-slate-600 font-semibold text-[13.5px]">Варіантів ще немає</p>
      <p className="text-[12.5px] text-slate-400 mt-0.5">Вони з'являться тут, щойно в «Розробку 3D візуалізації» завантажать файли.</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {variants.map((v) => {
        const on = !!v.row?.is_selected;
        return (
          <div key={v.key} className={`rounded-xl overflow-hidden border-2 bg-white transition-colors ${on ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-indigo-300'}`}>
            <button type="button" onClick={() => approve(v)} className="block w-full aspect-video bg-slate-100 relative">
              {!failed[v.key] ? (
                <img src={variantThumb(v.fileId)} alt={v.label} loading="lazy" decoding="async" className="w-full h-full object-cover"
                  onError={() => setFailed(f => ({ ...f, [v.key]: true }))} />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center text-slate-300"><FaImage size={28} /></span>
              )}
              {on && (
                <span className="absolute top-2 left-2 bg-emerald-600 text-white px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 text-[11.5px] shadow">
                  <FaCheckCircle size={11} /> Затверджено
                </span>
              )}
              {busy === v.key && <span className="absolute inset-0 bg-white/60 flex items-center justify-center"><FaSpinner className="animate-spin text-indigo-500 text-xl" /></span>}
            </button>
            <div className="px-3 py-2.5 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className={`text-[13.5px] font-bold ${on ? 'text-emerald-700' : 'text-slate-800'}`}>{v.label}</div>
                <div className="text-[11.5px] text-slate-400">{formatUkShort(v.at)}{v.by ? ` · ${v.by}` : ''}</div>
              </div>
              <a href={v.link || driveOpenUrl(v.fileId)} target="_blank" rel="noreferrer" aria-label="Відкрити повністю" title="Відкрити повністю"
                className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-50">
                <FaDownload size={11} />
              </a>
              {!on && (
                <Btn size="sm" variant="softOk" icon={FaCheck} onClick={() => approve(v)} disabled={!!busy}>Затвердити</Btn>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskInlineEditor({ task, stageGroupKey, onAddUpdate, isLoading, employees, installationId, currentUserEmpId, nomenclatures, categories }) {
  const [newComment, setNewComment] = useState("");

  const statusOptions = taskStatusOptions(task.id);

  const initialStatus = statusOptions.find(s => s.key === task.status) ? task.status : statusOptions[0].key;
  const [newStatus, setNewStatus] = useState(initialStatus);
  const [assignedEmpId, setAssignedEmpId] = useState(task.responsibleId);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const fileInputRef = useRef(null);
  const ocrFileInputRef = useRef(null);
  const [ocrFile, setOcrFile] = useState(null);
  const [showManualSpec, setShowManualSpec] = useState(false);
  const [manualSpecRefresh, setManualSpecRefresh] = useState(0);

  const canUploadAnyFile = taskHasUploads(task.id);
  const canUploadPhotos = !["equipment", "proposal"].includes(stageGroupKey) || canUploadAnyFile;
  const isComplectationTask = task.id === 'complectation' || task.id === 'comp_protection';

  useEffect(() => {
    if (selectedFiles.length > 0) {
      if (initialStatus === newStatus && taskAutoDoneStatus(task.id)) setNewStatus(taskAutoDoneStatus(task.id));
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
    e.target.value = '';
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
    <div className="border-t border-slate-100 bg-slate-50/50 p-3 sm:p-4">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] gap-4">
        {/* Що змінюємо */}
        <div className="space-y-3 min-w-0">
          <div>
            <div className={`${T.label} mb-1.5`}>Статус</div>
            <div className="flex flex-wrap gap-1.5">
              {statusOptions.map((opt) => {
                const isSelected = newStatus === opt.key;
                return (
                  <button key={opt.key} type="button" onClick={() => setNewStatus(opt.key)}
                    className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-colors
                      ${isSelected ? `${opt.color} ring-1 ring-inset ring-black/5` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {isSelected && <FaCheck size={10} />}{opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <EmployeeSelect label="Відповідальний" employees={employees} selectedId={assignedEmpId} onSelect={setAssignedEmpId} />

          {isComplectationTask && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button onClick={() => ocrFileInputRef.current?.click()} type="button"
                className="h-11 px-3 rounded-lg border border-dashed border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 text-[13px] font-bold inline-flex items-center justify-center gap-2">
                <FaFilePdf className="text-rose-500" /> Специфікація з PDF <FaMagic size={10} className="text-indigo-400" />
              </button>
              <button onClick={() => setShowManualSpec(true)} type="button"
                className="h-11 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[13px] font-bold inline-flex items-center justify-center gap-2">
                <FaPlus size={11} /> Внести вручну
              </button>
              <input
                type="file"
                accept=".pdf"
                ref={ocrFileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    const f = e.target.files[0];
                    // PDF зберігається і як вкладення етапу
                    setSelectedFiles(prev => [...prev, { file: f, preview: null, isImage: false }]);
                    setOcrFile(f);
                  }
                  e.target.value = '';
                }}
                className="hidden"
              />
            </div>
          )}

          <div>
            <div className={`${T.label} mb-1.5`}>Коментар</div>
            <textarea rows={3} value={newComment} onChange={(e) => setNewComment(e.target.value)}
              placeholder="Що зроблено, що важливо знати…"
              className={`${T.input} h-auto py-2 resize-y`} />
          </div>

          {canUploadPhotos && (
            <div>
              <input type="file" multiple accept={canUploadAnyFile ? "*/*" : "image/*"} ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
              <div className="flex flex-wrap gap-2">
                {selectedFiles.map((fileObj, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 bg-white">
                    {fileObj.isImage
                      ? <img src={fileObj.preview} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-1"><FaFileAlt size={18} /><span className="mt-0.5 text-[9px] leading-tight text-center break-all line-clamp-2">{fileObj.file.name}</span></div>}
                    <button onClick={() => removePhoto(idx)} type="button" aria-label="Прибрати файл"
                      className="absolute top-0.5 right-0.5 w-6 h-6 rounded-full bg-white/95 text-rose-600 flex items-center justify-center shadow-sm hover:bg-rose-600 hover:text-white">
                      <FaTimes size={10} />
                    </button>
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()} type="button"
                  className="h-16 px-4 rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-600 text-[13px] font-semibold inline-flex items-center gap-2">
                  <FaCamera size={14} /> {canUploadAnyFile ? 'Додати файли' : 'Додати фото'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            {hasChanges && !isLoading && <span className="text-[12px] text-amber-700 mr-auto">є незбережені зміни</span>}
            <Btn variant="accent" icon={isLoading ? undefined : FaCheck} onClick={handleSubmit} disabled={isLoading || !hasChanges}>
              {isLoading ? 'Зберігаю…' : 'Зберегти'}
            </Btn>
          </div>
        </div>

        {/* Що вже було */}
        <div className="min-w-0">
          <div className={`${T.label} mb-1.5 flex items-center gap-1.5`}><FaHistory size={10} /> Історія · {task.history.length}</div>
          <div className="lg:max-h-[460px] lg:overflow-y-auto custom-scrollbar lg:pr-1">
            <HistoryTimeline logs={task.history} stageGroupKey={stageGroupKey} task={task} getEmployeeName={(id) => getEmployeeNameStr(id, employees)} />
          </div>
        </div>
      </div>

      {isComplectationTask && (
          <div className="mt-4">
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
              categories={categories}
              onClose={() => setOcrFile(null)}
              onSuccess={() => {
                  setOcrFile(null);
                  const finalStatus = taskAutoDoneStatus(task.id) || "done";
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

/** Скільки файлів прикріплено в історії підетапу */
const countFiles = (history) => (history || []).reduce((s, h) => {
  const ids = Array.isArray(h.photo_file_ids) ? h.photo_file_ids.filter(Boolean).length : 0;
  const links = Array.isArray(h.photos) ? h.photos.filter(Boolean).length : 0;
  return s + Math.max(ids, links);
}, 0);

/** Підетап: згорнутий — усе головне одним рядком, розгорнутий — форма й історія */
function TaskAccordionItem({ task, isExpanded, onToggle, stageGroupKey, onAddUpdate, isLoading, employees, installationId, currentUserEmpId, nomenclatures, categories }) {
  const isDone = isTaskDone(task.id, task.status);
  const statusMeta = getStatusMeta(task.id, task.status);
  const assignedName = getEmployeeNameStr(task.responsibleId, employees);
  const last = task.history?.[0];
  const files = countFiles(task.history);
  const started = !isDone && statusMeta.tone !== 'neutral';

  return (
    <div className={`${T.card} overflow-hidden transition-shadow ${isExpanded ? 'border-indigo-300 ring-1 ring-indigo-100 shadow-sm' : 'hover:border-slate-300'}`}>
      <button onClick={onToggle} className="w-full px-3 sm:px-4 py-3 flex items-start gap-3 text-left hover:bg-slate-50/60 focus:outline-none" type="button" aria-expanded={isExpanded}>
        <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
          ${isDone ? 'bg-emerald-500 text-white' : started ? 'border-2 border-indigo-400 bg-white' : 'border-2 border-slate-300 bg-white'}`}>
          {isDone ? <FaCheck size={11} /> : started && <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`text-[15px] font-bold leading-snug ${isDone ? 'text-slate-600' : 'text-slate-900'}`}>{task.title}</span>
            <Chip tone={statusMeta.tone}>{statusMeta.label}</Chip>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-slate-500">
            <span className={`inline-flex items-center gap-1.5 ${assignedName ? 'text-slate-700 font-semibold' : ''}`}><FaUserTie size={10} className="text-slate-400" /> {assignedName || 'не призначено'}</span>
            {last && <span className="inline-flex items-center gap-1.5"><FaHistory size={10} className="text-slate-400" /> {last.date} · {last.actor || last.user}</span>}
            {files > 0 && <span className="inline-flex items-center gap-1.5"><FaImage size={10} className="text-slate-400" /> {files}</span>}
          </div>
          {!isExpanded && last?.comment && <p className="mt-1 text-[12.5px] text-slate-600 line-clamp-2 whitespace-pre-line">{last.comment}</p>}
        </div>
        <FaChevronDown size={12} className={`mt-2 flex-shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180 text-indigo-500' : ''}`} />
      </button>

      {isExpanded && (task.id === "project_approval" ? (
        <div className="border-t border-slate-100 bg-slate-50/50 p-3 sm:p-4 space-y-3">
          <DesignVariantInline
            installationId={installationId}
            onApproved={(label) => onAddUpdate(task.id, { status: 'selected', comment: `Затверджено: ${label}`, photos: [], rawFiles: [], assigned_to: toIntOrNull(task.responsibleId || currentUserEmpId) })}
          />
          {task.history.length > 0 && (
            <div>
              <div className={`${T.label} mb-1.5 flex items-center gap-1.5`}><FaHistory size={10} /> Історія · {task.history.length}</div>
              <HistoryTimeline logs={task.history} stageGroupKey={stageGroupKey} task={task} getEmployeeName={(id) => getEmployeeNameStr(id, employees)} />
            </div>
          )}
        </div>
      ) : (
        <TaskInlineEditor task={task} stageGroupKey={stageGroupKey} onAddUpdate={onAddUpdate} isLoading={isLoading} employees={employees} installationId={installationId} currentUserEmpId={currentUserEmpId} nomenclatures={nomenclatures} categories={categories} />
      ))}
    </div>
  );
}

/** Етапи об'єкта: на комп'ютері — список зліва, на телефоні — смуга, що гортається */
function StageRail({ activeStage, projectStage, progress, onSelect }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    const box = scrollRef.current;
    const el = box?.querySelector('[data-active]');
    if (box && el && box.scrollWidth > box.clientWidth) box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
  }, [activeStage]);

  const meta = (g) => {
    const p = progress[g.key] || { done: 0, total: 0 };
    return { p, complete: p.total > 0 && p.done === p.total, current: g.key === projectStage, active: g.key === activeStage };
  };

  return (
    <>
      <div ref={scrollRef} className="lg:hidden -mx-3 px-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 min-w-max pb-1">
          {STAGE_GROUPS.map(g => {
            const { p, complete, current, active } = meta(g);
            return (
              <button key={g.key} type="button" data-active={active || undefined} onClick={() => onSelect(g.key)}
                className={`h-10 px-3 rounded-lg border text-[13px] font-semibold inline-flex items-center gap-2 whitespace-nowrap
                  ${active ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
                {complete ? <FaCheckCircle size={12} className={active ? 'text-white' : 'text-emerald-500'} /> : current ? <span className={`w-2 h-2 rounded-full ${active ? 'bg-white' : 'bg-indigo-500'}`} /> : null}
                {g.label}
                <span className={`text-[11.5px] tabular-nums ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{p.done}/{p.total}</span>
              </button>
            );
          })}
        </div>
      </div>

      <nav className={`hidden lg:block ${T.card} p-1.5 lg:sticky lg:top-3`}>
        {STAGE_GROUPS.map(g => {
          const { p, complete, current, active } = meta(g);
          return (
            <button key={g.key} type="button" onClick={() => onSelect(g.key)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold
                ${complete ? 'bg-emerald-500 text-white' : current ? 'border-2 border-indigo-500 text-indigo-600 bg-white' : 'border border-slate-200 text-slate-400 bg-white'}`}>
                {complete ? <FaCheck size={10} /> : <g.icon size={11} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13.5px] leading-tight ${active ? 'font-bold text-indigo-800' : 'font-semibold text-slate-700'}`}>{g.label}</span>
                <span className={`block text-[11.5px] tabular-nums ${current ? 'text-indigo-600 font-semibold' : 'text-slate-400'}`}>
                  {current ? 'поточний · ' : ''}{p.done}/{p.total}
                </span>
              </span>
              {active && <FaChevronRight size={10} className="text-indigo-400" />}
            </button>
          );
        })}
      </nav>
    </>
  );
}

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
  return (
    <Modal
      isOpen={isOpen} onClose={onClose} title={title} tone="accent" size="sm"
      onSubmit={onConfirm} submitHint="підтвердити"
      footer={<>
        <Btn variant="outline" onClick={onClose}>Скасувати</Btn>
        <Btn variant="accent" icon={FaThumbtack} onClick={onConfirm}>Підтвердити</Btn>
      </>}
    >
      <p className="text-slate-600 text-sm leading-relaxed">{message}</p>
    </Modal>
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
      <div className={`${T.label} mb-1.5`}>{label}</div>
      <div className="relative" onClick={() => setIsOpen(true)}>
        <div className={`w-full min-h-[40px] flex items-center justify-between gap-2 border rounded-lg px-3 py-2 text-[13.5px] bg-white cursor-text transition-all ${isOpen ? "ring-2 ring-indigo-500 border-indigo-500" : "border-slate-200 hover:border-indigo-300"}`}>
          {!isOpen && selectedEmployee ? (
            <span className="font-semibold text-slate-800 inline-flex items-center gap-2 min-w-0 break-words"><FaUserTie size={11} className="text-slate-400 flex-shrink-0" />{selectedEmployee.name}</span>
          ) : (
            <input type="text" className="w-full outline-none bg-transparent placeholder:text-slate-400" placeholder={selectedEmployee ? selectedEmployee.name : "Почніть вводити ім'я…"} value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }} autoFocus={isOpen} />
          )}
          <div className="flex items-center gap-1 text-slate-400 flex-shrink-0">
            {selectedEmployee && !isOpen && <button onClick={(e) => { e.stopPropagation(); onSelect(null); setSearchTerm(""); }} className="w-7 h-7 flex items-center justify-center hover:text-rose-600 hover:bg-rose-50 rounded-full transition" type="button" aria-label="Прибрати відповідального"><FaTimes size={11} /></button>}
            {!isOpen && <FaSearch size={11} />}
          </div>
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar">
          {filteredEmployees.length > 0 ? filteredEmployees.map(emp => (
            <button key={emp.id} onClick={() => { onSelect(emp.custom_id); setIsOpen(false); setSearchTerm(""); }} className={`w-full text-left px-3 py-2.5 text-[13.5px] flex justify-between items-center hover:bg-indigo-50 transition border-b border-slate-50 last:border-0 ${String(selectedId) === String(emp.custom_id) ? "bg-indigo-50/60 text-indigo-700 font-semibold" : "text-slate-700"}`} type="button">
              <span>{emp.name}</span>
              {emp.position && <span className="text-[11.5px] text-slate-400 ml-2">{emp.position}</span>}
            </button>
          )) : <div className="px-3 py-3 text-[13px] text-slate-400 text-center">Нікого не знайдено</div>}
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
              <Btn size="sm" variant="soft" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>Назад</Btn>
              <Btn size="sm" variant="soft" onClick={() => setIdx(Math.min(fileIds.length - 1, idx + 1))} disabled={idx === fileIds.length - 1}>Далі</Btn>
              <div className="w-px h-6 bg-slate-200 mx-2"></div>
              <IconBtn variant="softDanger" icon={FaTimes} label="Закрити" onClick={onClose} />
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
  if (!logs || logs.length === 0) return <div className="text-center text-slate-400 py-8 text-[12.5px] border border-dashed border-slate-200 rounded-xl bg-white">Ще нічого не вносили</div>;

  return (
    <>
      <ul className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {logs.map((log) => {
          const hasStatusChange = log.old_status && log.new_status && log.old_status !== log.new_status;
          const oldMeta = hasStatusChange ? getStatusMeta(task.id, log.old_status) : null;
          const newMeta = hasStatusChange ? getStatusMeta(task.id, log.new_status) : null;
          const oldResp = log.old_responsible; const newResp = log.new_responsible;
          const respChanged = (oldResp != null || newResp != null) && String(oldResp ?? "") !== String(newResp ?? "");
          const fileIds = Array.isArray(log.photo_file_ids) ? log.photo_file_ids.filter(Boolean) : [];
          const links = Array.isArray(log.photos) ? log.photos.filter(Boolean) : [];
          const attachments = [
            ...fileIds.map((id, i) => ({ fileId: id, link: links[i] || driveViewUrl(id), idx: i })),
            ...links.slice(fileIds.length).map((link, i) => ({ fileId: null, link, idx: fileIds.length + i }))
          ];
          const who = log.actor || log.user || "Невідомий";

          return (
            <li key={log.id} className="px-3 py-2.5 flex gap-2.5">
              <span className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                <FaUserTie size={11} />
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-bold text-slate-800 break-words">{who}</span>
                  <span className="text-[11.5px] text-slate-400 tabular-nums whitespace-nowrap">{log.date || formatUkShort(log.created_at)}</span>
                </div>
                {hasStatusChange && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="opacity-60"><Chip tone={oldMeta.tone}>{oldMeta.label}</Chip></span>
                    <FaArrowRight className="text-slate-300" size={9} />
                    <Chip tone={newMeta.tone}>{newMeta.label}</Chip>
                  </div>
                )}
                {respChanged && (
                  <div className="text-[12.5px] text-slate-600 flex flex-wrap items-center gap-1.5">
                    <FaUserTie size={10} className="text-slate-400" />
                    {oldResp != null && <><span className="line-through opacity-60">{getEmployeeName(oldResp)}</span><FaArrowRight size={9} className="text-slate-300" /></>}
                    <span className="font-semibold text-slate-800">{newResp != null ? getEmployeeName(newResp) : 'не призначено'}</span>
                  </div>
                )}
                {log.comment && <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-line break-words">{log.comment === 'Changed active stage' ? 'Зробив цей етап поточним' : <Linkify>{log.comment}</Linkify>}</p>}
                {attachments.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {attachments.map((att) => (att.fileId ? (
                      <button key={`att-${log.id}-${att.idx}`} type="button" onClick={() => openViewer(fileIds, att.idx)}
                        className="w-14 h-14 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden hover:border-indigo-400 transition-colors relative">
                        <img src={driveThumbUrl(att.fileId, 160)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.querySelector('.fallback-icon').style.display = 'flex'; }} />
                        <span className="fallback-icon w-full h-full absolute inset-0 hidden items-center justify-center text-slate-400 bg-white"><FaFileAlt size={18} /></span>
                      </button>
                    ) : (
                      <a key={`link-${log.id}-${att.idx}`} href={att.link} target="_blank" rel="noreferrer"
                        className="inline-flex items-center justify-center w-14 h-14 rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition">
                        <FaDownload size={14} />
                      </a>
                    )))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <PhotoViewerModal isOpen={viewerOpen} onClose={() => setViewerOpen(false)} fileIds={viewerIds} startIndex={viewerStart} />
    </>
  );
}

// ==================================================================================
// 7. ГОЛОВНИЙ ЕКРАН ВКЛАДКИ «ЕТАПИ»
//    Усі підетапи й історію вантажимо одним разом — перемикання між
//    етапами миттєве, а зліва видно прогрес кожного етапу.
// ==================================================================================

export default function FieldWorkflow({ project }) {
  const { user, employee } = useAuth();
  const showToast = useToast();

  // Старі назви етапу (commercial_proposal, installation_finish…) зводимо до макроетапу.
  // Якщо етап поза робочим процесом (напр. «Мережа»), відкриваємо «Монтаж».
  const projectStage = normalizeGroupKey(project?.workflow_stage || "tech_review");
  const [activeStage, setActiveStage] = useState(
    STAGE_GROUPS.some(g => g.key === projectStage) ? projectStage : "installation"
  );
  const [stagesDict, setStagesDict] = useState({});
  const [history, setHistory] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [nomenclatures, setNomenclatures] = useState([]);
  const [categoriesDict, setCategoriesDict] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);

  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: "", message: "", onConfirm: null });

  const installationId = project?.custom_id;
  const currentUserEmpId = employee?.custom_id || null;

  const loadDictionaries = useCallback(async () => {
    try {
      const [empRes, nomRes, catRes] = await Promise.all([
          supabase.from("employees").select("id, custom_id, name, position").order("name", { ascending: true }).limit(300),
          supabase.from('nomenclature').select('id, name, sku, brand, model, category_id, unit:units(name)').eq('is_active', true),
          supabase.from('categories').select('*')
      ]);
      setEmployees(Array.isArray(empRes.data) ? empRes.data : []);

      const cats = catRes.data || [];
      setCategoriesDict(cats);
      const processedNom = (nomRes.data || []).map(item => {
          let path = [];
          let currentId = item.category_id;
          while (currentId) {
              const cat = cats.find(c => c.id === currentId);
              if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
          }
          const categoryPath = path.join(' › ');
          const fullName = categoryPath ? `${categoryPath} › ${item.name}` : item.name;
          return { ...item, fullName, categoryPath };
      });
      setNomenclatures(processedNom);
    } catch (e) { console.error(e); }
  }, []);

  const loadWorkflowData = useCallback(async () => {
    if (!installationId) return;
    try {
      const [stagesResp, eventsResp] = await Promise.all([
        supabase.from("project_stages").select("stage_key, status, responsible_emp_custom_id").eq("installation_custom_id", installationId),
        supabase.from("workflow_events").select("*").eq("installation_custom_id", installationId).order("created_at", { ascending: false })
      ]);
      setStagesDict((stagesResp.data || []).reduce((acc, item) => {
        acc[item.stage_key] = { status: item.status, responsibleId: toIntOrNull(item.responsible_emp_custom_id) };
        return acc;
      }, {}));
      setHistory((eventsResp.data || []).map(ev => ({ ...ev, user: ev.actor || "Невідомий", date: formatUkShort(ev.created_at) })));
    } catch (e) { console.error("Workflow Load Error:", e); }
    finally { setLoading(false); }
  }, [installationId]);

  useEffect(() => { loadDictionaries(); }, [loadDictionaries]);
  useEffect(() => { loadWorkflowData(); }, [loadWorkflowData]);

  // Статус підетапу: старі написання («done» замість «completed» тощо) — до єдиного вигляду
  const statusOf = useCallback((taskKey) => {
    const s = stagesDict?.[taskKey]?.status;
    return s ? normalizeTaskStatus(taskKey, s) : taskDefaultStatus(taskKey);
  }, [stagesDict]);

  const tasks = useMemo(() => tasksForStage(activeStage).map(t => ({
    ...t,
    status: statusOf(t.id),
    history: history.filter(h => h.stage_key === t.id),
    responsibleId: stagesDict?.[t.id]?.responsibleId || null,
  })), [activeStage, statusOf, history, stagesDict]);

  const progress = useMemo(() => Object.fromEntries(STAGE_GROUPS.map(g => {
    const list = tasksOfGroup(g.key);
    return [g.key, { done: list.filter(t => isTaskDone(t.key, statusOf(t.key))).length, total: list.length }];
  })), [statusOf]);

  // Етап з одним підетапом — одразу розгорнутий
  useEffect(() => {
    const list = tasksForStage(activeStage);
    setExpandedTaskId(list.length === 1 ? list[0].id : null);
  }, [activeStage]);

  const handleAddUpdate = async (taskId, updateData) => {
    if (!installationId || !user) return;
    setSaveLoading(true);
    try {
      let uploadedLinks = []; let uploadedFileIds = [];
      if (updateData?.rawFiles?.length) {
        const up = await uploadWorkflowFiles({ files: updateData.rawFiles, installationId, stageKey: taskId, uploadedBy: employee?.name });
        uploadedLinks = up.links || []; uploadedFileIds = up.fileIds || [];

        // КП оцифровується сама, у фоні. Менеджера не тримаємо і нічого
        // в нього не питаємо: розбирати результат — робота директора.
        if (taskId === "commercial_proposal") {
          ingestOfferInBackground({
            files: updateData.rawFiles,
            installationId,
            employeeId: employee?.id || null,
            driveFiles: uploadedFileIds.map((fileId, i) => ({ fileId, webViewLink: uploadedLinks[i] })),
            notify: showToast,
          });
        }
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
      showToast('Збережено', 'success');
    } catch (e) { showToast(`Помилка: ${e?.message || "Помилка з'єднання"}`, 'error'); }
    finally { setSaveLoading(false); }
  };

  const handleSetCurrentStage = () => {
    const stageLabel = STAGE_GROUPS.find(s => s.key === activeStage)?.label;
    setConfirmModal({
      isOpen: true, title: "Змінити поточний етап?", message: `Об'єкт перейде на етап «${stageLabel}».`,
      onConfirm: async () => {
        try {
          if (!user) return;
          const actorName = await resolveActorName({ user, employee });
          const { error: rpcError } = await supabase.rpc("update_workflow_stage", {
            p_installation_id: installationId, p_stage_key: activeStage, p_new_status: "active", p_actor: actorName, p_comment: "", p_photos: [], p_photo_file_ids: [], p_new_responsible: null, p_set_as_global_stage: true
          });
          if (rpcError) throw rpcError;
          window.location.reload();
        } catch (e) { showToast("Помилка", 'error'); }
        finally { setConfirmModal(prev => ({ ...prev, isOpen: false })); }
      }
    });
  };

  const group = STAGE_GROUPS.find(s => s.key === activeStage);
  const p = progress[activeStage] || { done: 0, total: 0 };
  const isCurrent = projectStage === activeStage;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-3 lg:gap-4 items-start">
      <StageRail activeStage={activeStage} projectStage={projectStage} progress={progress} onSelect={setActiveStage} />

      <div className="space-y-3 min-w-0">
        <div className={`${T.card} p-3 sm:p-4 flex flex-wrap items-center gap-3`}>
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCurrent ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
            {group && <group.icon size={16} />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold text-slate-900 leading-tight">{group?.label}</h2>
            <div className="text-[12.5px] text-slate-500 tabular-nums">
              виконано {p.done} з {p.total}{isCurrent ? <span className="text-indigo-600 font-semibold"> · поточний етап об'єкта</span> : ''}
            </div>
          </div>
          {!isCurrent && (
            <Btn variant="outline" icon={FaThumbtack} onClick={handleSetCurrentStage}>Зробити поточним</Btn>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-indigo-400"><FaSpinner className="animate-spin text-3xl" /></div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
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
                categories={categoriesDict}
                installationId={installationId}
                currentUserEmpId={currentUserEmpId}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmationModal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))} onConfirm={confirmModal.onConfirm} title={confirmModal.title} message={confirmModal.message} />
    </div>
  );
}
