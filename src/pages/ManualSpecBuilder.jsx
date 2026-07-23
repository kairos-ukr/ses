import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaTimes, FaPlus, FaTrash, FaChevronDown, FaClipboardList,
    FaSpinner, FaLayerGroup, FaCheck, FaSearch, FaExclamationTriangle,
    FaMinus, FaBoxOpen
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { NomenclatureModal } from './NomenclatureModal';

// --- Пошуковий пікер для ДОДАВАННЯ позиції (показує лише ще не додані) ---
const AddPicker = ({ options, onPick, onCreateNew }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filtered = options.filter(o =>
        o.fullName.toLowerCase().includes(search.toLowerCase()) || (o.sku && o.sku.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-xl flex justify-between items-center cursor-pointer text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors"
                onClick={() => setIsOpen(o => !o)}
            >
                <span className="flex items-center gap-2"><FaPlus size={12}/> Додати позицію з бази</span>
                <FaChevronDown className={`text-white/80 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute z-[95] w-full left-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-72 flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
                            <FaSearch className="text-slate-400 ml-1.5" />
                            <input autoFocus type="text" className="w-full px-2 py-2 bg-transparent text-sm outline-none" placeholder="Пошук по назві або SKU..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                            {filtered.length > 0 ? filtered.slice(0, 60).map(o => (
                                <div key={o.id} className="px-3 py-2.5 cursor-pointer text-sm rounded-lg mb-0.5 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-colors" onClick={() => { onPick(o.id); setSearch(''); }}>
                                    <div className="font-bold text-slate-800 leading-tight">{o.fullName}</div>
                                    <div className="flex items-center gap-2 mt-1">
                                        {o.rootCategoryName && <span className="text-[10px] text-indigo-500 uppercase font-bold tracking-wider bg-indigo-50 px-1.5 rounded">{o.rootCategoryName}</span>}
                                        {o.sku && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded">SKU: {o.sku}</span>}
                                    </div>
                                </div>
                            )) : <div className="px-4 py-6 text-sm text-slate-400 text-center">Нічого не знайдено (або все вже додано)</div>}
                        </div>
                        {onCreateNew && (
                            <div className="p-2 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={() => { onCreateNew(search.trim()); setIsOpen(false); setSearch(''); }}
                                    className="w-full py-2.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-sm font-bold transition-colors flex items-center justify-center gap-2"
                                >
                                    <FaPlus size={11} /> {search.trim() ? `Створити нову позицію «${search.trim()}»` : 'Створити нову позицію'}
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

/**
 * Ручне внесення / редагування комплектації (специфікації).
 * Показує ПЛАН (кількість, що редагується) vs ФАКТ (резерв / видано з v_object_material_needs).
 *
 * props: isOpen, onClose, onSuccess, installationId (required),
 *        taskId (specifications.notes namespace), title, showToast
 */
export default function ManualSpecBuilder({ isOpen, onClose, onSuccess, installationId, taskId = null, title, showToast }) {
    const { employee } = useAuth();
    const notify = typeof showToast === 'function' ? showToast : (m, t) => { if (t === 'error') alert(m); else console.warn('[ManualSpecBuilder]', m); };

    const [nomenclatures, setNomenclatures] = useState([]);
    const [cats, setCats] = useState([]);
    const [rows, setRows] = useState([]);          // { key, nomenclature_id, quantity }
    const [factByNom, setFactByNom] = useState({}); // nomId -> { reserved, issued }
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Швидке створення номенклатури прямо з пікера
    const [quickAdd, setQuickAdd] = useState({ open: false, name: '' });

    const newKey = () => Math.random().toString(36).slice(2, 10);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [nomRes, catRes, needsRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('v_object_material_needs').select('nomenclature_id, reserved_quantity, issued_quantity').eq('installation_custom_id', installationId)
            ]);
            const cats = catRes.data || [];
            setCats(cats);
            const processedNom = (nomRes.data || []).map(item => {
                let path = [];
                let rootName = '';
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); rootName = cat.name; currentId = cat.parent_id; } else break;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim(), rootCategoryName: rootName };
            });
            setNomenclatures(processedNom);

            // Факт (резерв/видано) по номенклатурі
            const fact = {};
            (needsRes.data || []).forEach(n => {
                const cur = fact[n.nomenclature_id] || { reserved: 0, issued: 0 };
                cur.reserved += parseFloat(n.reserved_quantity) || 0;
                cur.issued += parseFloat(n.issued_quantity) || 0;
                fact[n.nomenclature_id] = cur;
            });
            setFactByNom(fact);

            // Стартові рядки з активної специфікації цього типу
            let specQuery = supabase.from('specifications')
                .select('id, version, status, notes, items:specification_items(nomenclature_id, quantity)')
                .eq('installation_custom_id', installationId)
                .eq('status', 'confirmed')
                .order('version', { ascending: false })
                .limit(1);
            if (taskId) specQuery = specQuery.eq('notes', taskId);
            const { data: specData } = await specQuery.maybeSingle();

            if (specData?.items?.length) {
                setRows(specData.items.map(it => ({ key: newKey(), nomenclature_id: it.nomenclature_id, quantity: it.quantity })));
            } else {
                setRows([]);
            }
        } catch (err) {
            notify(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [installationId, taskId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { if (isOpen && installationId) loadData(); }, [isOpen, installationId, loadData]);

    const nomById = (id) => nomenclatures.find(n => n.id === id);

    const addRow = (nomId) => {
        setRows(r => {
            if (r.some(x => x.nomenclature_id === nomId)) return r; // без дублів
            return [...r, { key: newKey(), nomenclature_id: nomId, quantity: 1 }];
        });
    };
    const removeRow = (key) => setRows(r => r.filter(x => x.key !== key));
    const setQty = (key, q) => setRows(r => r.map(x => x.key === key ? { ...x, quantity: q } : x));
    const bumpQty = (key, delta) => setRows(r => r.map(x => {
        if (x.key !== key) return x;
        const cur = parseFloat(x.quantity) || 0;
        return { ...x, quantity: Math.max(0, +(cur + delta).toFixed(2)) };
    }));

    const addedIds = new Set(rows.map(r => r.nomenclature_id));
    const availableToAdd = nomenclatures.filter(n => !addedIds.has(n.id));

    // Нову позицію, створену через NomenclatureModal, одразу додаємо в список і в специфікацію
    const handleQuickAddSuccess = (savedItem) => {
        if (!savedItem) return;
        let path = [];
        let rootName = '';
        let currentId = savedItem.category_id;
        while (currentId) {
            const cat = cats.find(c => c.id === currentId);
            if (cat) { path.unshift(cat.name); rootName = cat.name; currentId = cat.parent_id; } else break;
        }
        const processed = { ...savedItem, fullName: `${path.join(' ')} ${savedItem.name}`.trim(), rootCategoryName: rootName };
        setNomenclatures(prev => [...prev.filter(n => n.id !== processed.id), processed]);
        addRow(processed.id);
    };

    // Групування за кореневою категорією
    const grouped = (() => {
        const map = new Map();
        rows.forEach(row => {
            const nom = nomById(row.nomenclature_id);
            const g = nom?.rootCategoryName || 'Інше';
            if (!map.has(g)) map.set(g, []);
            map.get(g).push(row);
        });
        return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    })();

    const totalValid = rows.filter(r => r.nomenclature_id && parseFloat(r.quantity) > 0).length;

    const handleSave = async () => {
        const clean = rows.filter(r => r.nomenclature_id && parseFloat(r.quantity) > 0);
        if (clean.length === 0) return notify('Додайте хоча б одну позицію з кількістю', 'warning');

        setSaving(true);
        try {
            // Версія наскрізна по ВСІХ специфікаціях об'єкта (у БД унікальний ключ installation+version,
            // без типу) — інакше "матеріали" і "ел. захист" конфліктують за version=1
            const { data: existingAll } = await supabase.from('specifications')
                .select('version')
                .eq('installation_custom_id', installationId);
            const nextVersion = existingAll && existingAll.length > 0 ? Math.max(...existingAll.map(s => s.version)) + 1 : 1;

            // Архівуємо лише специфікації ЦЬОГО типу (notes = taskId)
            let archQuery = supabase.from('specifications').update({ status: 'archived' }).eq('installation_custom_id', installationId);
            if (taskId) archQuery = archQuery.eq('notes', taskId);
            const { error: archErr } = await archQuery;
            if (archErr) throw archErr;

            const { data: newSpec, error: hErr } = await supabase.from('specifications').insert([{
                installation_custom_id: installationId,
                version: nextVersion,
                status: 'confirmed',
                name: `${title || 'Специфікація'} V.${nextVersion} (вручну)`,
                notes: taskId,
                confirmed_at: new Date().toISOString(),
                created_by: employee?.id
            }]).select().single();
            if (hErr) throw hErr;

            const itemsPayload = clean.map(r => ({
                specification_id: newSpec.id,
                nomenclature_id: r.nomenclature_id,
                quantity: parseFloat(r.quantity),
                created_by: employee?.id
            }));
            const { error: iErr } = await supabase.from('specification_items').insert(itemsPayload);
            if (iErr) throw iErr;

            notify('Комплектацію збережено!', 'success');
            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            notify(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* Клік по фону НЕ закриває модалку (лише X / Скасувати / успіх) */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[90]">
                <motion.div initial={{ scale: 0.98, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 30 }} className="bg-white w-full sm:max-w-3xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[92vh] rounded-t-2xl sm:rounded-2xl overflow-hidden">

                    {/* HEADER */}
                    <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50 flex-shrink-0">
                        <div className="min-w-0">
                            <h2 className="text-lg sm:text-xl font-bold text-indigo-900 flex items-center gap-2 truncate"><FaClipboardList className="text-indigo-500 flex-shrink-0" /> <span className="truncate">{title || 'Комплектація'}</span></h2>
                            <p className="text-[11px] sm:text-xs text-indigo-700/70 mt-0.5 font-medium">Об'єкт #{installationId} • План vs факт • редагування</p>
                        </div>
                        <button onClick={onClose} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm flex-shrink-0 ml-2"><FaTimes /></button>
                    </div>

                    {/* ADD BAR (sticky) */}
                    <div className="p-4 sm:p-5 pb-3 border-b border-slate-100 flex-shrink-0 bg-white">
                        <AddPicker options={availableToAdd} onPick={addRow} onCreateNew={(name) => setQuickAdd({ open: true, name })} />
                        <div className="flex items-center gap-3 mt-2.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider flex-wrap">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span> План (редагується)</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span> Резерв</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span> Видано</span>
                        </div>
                    </div>

                    {/* BODY */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 p-3 sm:p-5">
                        {loading ? (
                            <div className="flex justify-center py-16"><FaSpinner className="animate-spin text-3xl text-indigo-500" /></div>
                        ) : rows.length === 0 ? (
                            <div className="text-center py-14 flex flex-col items-center">
                                <FaBoxOpen className="text-5xl text-slate-200 mb-3" />
                                <h3 className="font-bold text-slate-500 text-sm">Позицій ще немає</h3>
                                <p className="text-xs text-slate-400 mt-1 max-w-xs">Натисніть «Додати позицію з бази» вгорі, щоб зібрати комплектацію.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {grouped.map(([groupName, groupRows]) => (
                                    <div key={groupName} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                        <div className="px-3 sm:px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2">
                                            <FaLayerGroup className="text-slate-400 text-xs" />
                                            <span className="text-[11px] font-black text-slate-600 uppercase tracking-widest truncate">{groupName}</span>
                                            <span className="text-[10px] text-slate-400 font-bold ml-auto">{groupRows.length}</span>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {groupRows.map(row => {
                                                const nom = nomById(row.nomenclature_id);
                                                const fact = factByNom[row.nomenclature_id] || { reserved: 0, issued: 0 };
                                                const plan = parseFloat(row.quantity) || 0;
                                                const belowIssued = fact.issued > 0 && plan < fact.issued;
                                                return (
                                                    <div key={row.key} className="p-3 sm:p-4">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="font-bold text-slate-800 text-sm leading-snug">{nom?.fullName || 'Невідома позиція'}</div>
                                                                {nom?.sku && <div className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-wider uppercase">SKU: {nom.sku}</div>}
                                                                {/* ФАКТ chips */}
                                                                {(fact.reserved > 0 || fact.issued > 0) && (
                                                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                                        {fact.reserved > 0 && <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">резерв: {fact.reserved}</span>}
                                                                        {fact.issued > 0 && <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded">видано: {fact.issued}</span>}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button onClick={() => removeRow(row.key)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0" title="Видалити"><FaTrash size={14} /></button>
                                                        </div>
                                                        {/* PLAN qty stepper */}
                                                        <div className="flex items-center gap-2 mt-2.5">
                                                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wider w-10">План</span>
                                                            <button type="button" onClick={() => bumpQty(row.key, -1)} className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors flex-shrink-0"><FaMinus size={11}/></button>
                                                            <input
                                                                type="number" min="0" step="any" inputMode="decimal"
                                                                value={row.quantity}
                                                                onChange={e => setQty(row.key, e.target.value)}
                                                                className={`w-20 h-9 text-center text-base font-black rounded-lg border-2 outline-none transition-colors ${belowIssued ? 'text-red-600 border-red-300 bg-red-50' : 'text-indigo-700 border-indigo-200 focus:border-indigo-500'}`}
                                                            />
                                                            <button type="button" onClick={() => bumpQty(row.key, +1)} className="w-9 h-9 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors flex-shrink-0"><FaPlus size={11}/></button>
                                                            <span className="text-xs font-bold text-slate-400 uppercase ml-0.5">{nom?.unit?.name || 'шт'}</span>
                                                        </div>
                                                        {belowIssued && (
                                                            <div className="text-[10px] text-red-600 font-bold mt-1.5 flex items-center gap-1"><FaExclamationTriangle size={10}/> План менший за вже видане ({fact.issued})</div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* FOOTER (sticky) */}
                    <div className="p-4 sm:p-5 border-t border-slate-100 flex items-center justify-between gap-3 bg-white flex-shrink-0 pb-safe">
                        <div className="text-xs font-bold text-slate-500 whitespace-nowrap">Позицій: <span className="text-slate-800">{totalValid}</span></div>
                        <div className="flex gap-2 sm:gap-3">
                            <button onClick={onClose} className="px-4 sm:px-6 py-3 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm">Скасувати</button>
                            <button onClick={handleSave} disabled={saving || loading || totalValid === 0} className="px-5 sm:px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all text-sm flex items-center gap-2 disabled:opacity-50 active:scale-95 whitespace-nowrap">
                                {saving ? <><FaSpinner className="animate-spin" /> Збереження...</> : <><FaCheck /> Затвердити</>}
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            {/* Швидке створення позиції номенклатури, якої немає в базі */}
            <NomenclatureModal
                isOpen={quickAdd.open}
                onClose={() => setQuickAdd({ open: false, name: '' })}
                onSuccess={handleQuickAddSuccess}
                showToast={notify}
                initialName={quickAdd.name}
            />
        </AnimatePresence>
    );
}
