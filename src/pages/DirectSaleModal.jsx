import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaTimes, FaShoppingCart, FaUserTie, FaBox,
    FaMoneyBillWave, FaFileAlt, FaInfoCircle,
    FaPlus, FaSearch, FaCheck, FaChevronDown, FaArrowUp, FaExclamationTriangle,
    FaHandshake, FaTrash, FaWarehouse
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

// --- Кастомний Select з пошуком ---
const SearchableSelect = ({ options, value, onChange, placeholder, disabled, icon: Icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-white focus-within:ring-2 focus-within:ring-blue-200 focus-within:bg-white'}`}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {Icon && <Icon className="text-slate-400 flex-shrink-0" />}
                    <span className={`truncate text-sm font-bold ${selectedOption ? 'text-slate-800' : 'text-slate-400'}`}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <FaChevronDown className={`text-slate-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                        <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                            <FaSearch className="text-slate-400 ml-2" />
                            <input type="text" autoFocus value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Пошук..." className="w-full bg-transparent border-none outline-none text-sm font-medium py-1" />
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            {filteredOptions.length === 0 ? (
                                <div className="p-4 text-center text-sm text-slate-400">Нічого не знайдено</div>
                            ) : (
                                filteredOptions.map(opt => (
                                    <div key={opt.value} onClick={() => { onChange(opt.value); setIsOpen(false); setSearchTerm(''); }}
                                        className={`p-3 hover:bg-blue-50 cursor-pointer border-l-2 transition-colors ${value === opt.value ? 'border-blue-500 bg-blue-50/50' : 'border-transparent'}`}>
                                        <div className="text-sm font-bold text-slate-800">{opt.label}</div>
                                        {opt.subLabel && <div className="text-[10px] text-slate-500 mt-0.5">{opt.subLabel}</div>}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// Конфіг типів операції
const KINDS = {
    issue:   { label: "Видача під об'єкт", icon: FaArrowUp, op: 'issue',            money: false },
    partner: { label: 'Передача партнеру', icon: FaHandshake, op: 'partner_transfer', money: false },
    sale:    { label: 'Продаж',            icon: FaShoppingCart, op: 'sale',        money: true  },
};
const ACCENT = {
    issue:   { head: 'bg-emerald-50', text: 'text-emerald-900', sub: 'text-emerald-700/70', chip: 'bg-emerald-100 text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20', tabOn: 'text-emerald-700' },
    partner: { head: 'bg-violet-50',  text: 'text-violet-900',  sub: 'text-violet-700/70',  chip: 'bg-violet-100 text-violet-600',  btn: 'bg-violet-600 hover:bg-violet-700 shadow-violet-600/20',  tabOn: 'text-violet-700' },
    sale:    { head: 'bg-blue-50',    text: 'text-blue-900',    sub: 'text-blue-700/70',    chip: 'bg-blue-100 text-blue-600',      btn: 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20',       tabOn: 'text-blue-700' },
};

export default function DirectSaleModal({ isOpen, onClose, onSuccess, showToast }) {
    const { employee } = useAuth();
    const safeShowToast = typeof showToast === 'function' ? showToast : (m) => console.warn('[DirectSaleModal]', m);

    const [dict, setDict] = useState({ nomenclatures: [], warehouses: [], clients: [], installations: [], stock: [] });
    const [objNeeds, setObjNeeds] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [isAddingClient, setIsAddingClient] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', phone: '', notes: '' });

    const newKey = () => Math.random().toString(36).slice(2, 10);
    const initialForm = {
        kind: 'issue',
        client_id: '',
        installation_custom_id: '',
        warehouse_from_id: '',
        currency: 'USD',
        exchange_rate: '41.5',
        reference_document: '',
        notes: ''
    };
    const [form, setForm] = useState(initialForm);
    const [lines, setLines] = useState([{ key: newKey(), nomenclature_id: '', sellMode: 'base', quantity: '', unit_price: '', error: '' }]);

    useEffect(() => {
        if (isOpen) {
            setForm(initialForm);
            setLines([{ key: newKey(), nomenclature_id: '', sellMode: 'base', quantity: '', unit_price: '', error: '' }]);
            setIsAddingClient(false);
            setNewClient({ name: '', phone: '', notes: '' });
            setObjNeeds([]);
            loadDict();
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const loadDict = async () => {
        setIsLoading(true);
        try {
            const [nomRes, catRes, whRes, clientsRes, instRes, stockRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, package_name, package_multiplier, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
                supabase.from('clients').select('id, custom_id, name, is_subcontract').order('name'),
                supabase.from('installations').select('custom_id, name').in('status', ['planning', 'in_progress', 'pending']),
                supabase.from('v_warehouse_stock_available').select('warehouse_id, nomenclature_id, quantity_on_hand, quantity_available')
            ]);
            const cats = catRes.data || [];
            const processedNom = (nomRes.data || []).map(item => {
                let path = []; let currentId = item.category_id;
                while (currentId) { const cat = cats.find(c => c.id === currentId); if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break; }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim(), unitName: item.unit?.name || 'шт' };
            });
            setDict({ nomenclatures: processedNom, warehouses: whRes.data || [], clients: clientsRes.data || [], installations: instRes.data || [], stock: stockRes.data || [] });
        } catch (error) {
            safeShowToast(`Помилка: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const load = async () => {
            if (!form.installation_custom_id) { setObjNeeds([]); return; }
            const { data } = await supabase.from('v_object_material_needs').select('*').eq('installation_custom_id', form.installation_custom_id);
            setObjNeeds(data || []);
        };
        load();
    }, [form.installation_custom_id]);

    const handleQuickAddClient = async () => {
        if (!newClient.name.trim()) return safeShowToast("Ім'я/Назва клієнта є обов'язковим", 'error');
        setIsSubmitting(true);
        try {
            const { data, error } = await supabase.from('clients').insert([{ name: newClient.name, phone: newClient.phone, notes: newClient.notes }]).select().single();
            if (error) throw error;
            setDict(prev => ({ ...prev, clients: [...prev.clients, data].sort((a, b) => a.name.localeCompare(b.name)) }));
            setForm(prev => ({ ...prev, client_id: data.id }));
            setIsAddingClient(false);
            safeShowToast('Клієнта додано!', 'success');
        } catch (error) {
            safeShowToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const kindCfg = KINDS[form.kind];
    const accent = ACCENT[form.kind];
    const isMoney = kindCfg.money;

    const nomById = (id) => dict.nomenclatures.find(n => n.id === parseInt(id));
    const getBal = (nomId) => {
        if (!nomId || !form.warehouse_from_id) return { onHand: 0, available: 0 };
        const b = dict.stock.find(x => x.nomenclature_id === parseInt(nomId) && x.warehouse_id === parseInt(form.warehouse_from_id));
        return { onHand: parseFloat(b?.quantity_on_hand || 0), available: parseFloat(b?.quantity_available || 0) };
    };
    const needByNom = (nomId) => objNeeds.find(n => String(n.nomenclature_id) === String(nomId));

    // Опції номенклатури для обраного складу (issue враховує фізичну наявність)
    const nomOptions = dict.nomenclatures
        .filter(nom => {
            if (!form.warehouse_from_id) return false;
            const bal = getBal(nom.id);
            return (form.kind === 'issue' ? bal.onHand : bal.available) > 0;
        })
        .map(nom => {
            const bal = getBal(nom.id);
            return { value: nom.id, label: nom.fullName, subLabel: `SKU: ${nom.sku || '---'} | ${form.kind === 'issue' ? 'На складі' : 'Вільно'}: ${form.kind === 'issue' ? bal.onHand : bal.available} ${nom.unitName}` };
        });

    // --- Рядки кошика ---
    const addLine = () => setLines(ls => [...ls, { key: newKey(), nomenclature_id: '', sellMode: 'base', quantity: '', unit_price: '', error: '' }]);
    const removeLine = (key) => setLines(ls => ls.length > 1 ? ls.filter(l => l.key !== key) : ls);
    const updateLine = (key, patch) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch, error: '' } : l));

    const lineQtyBase = (line) => {
        let q = parseFloat(line.quantity); if (isNaN(q)) return 0;
        const nom = nomById(line.nomenclature_id);
        if (line.sellMode === 'piece' && nom?.package_multiplier > 1) q = q / nom.package_multiplier;
        return q;
    };
    const linePriceBase = (line) => {
        let p = parseFloat(line.unit_price); if (isNaN(p)) return null;
        const nom = nomById(line.nomenclature_id);
        if (line.sellMode === 'piece' && nom?.package_multiplier > 1) p = p * nom.package_multiplier;
        return p;
    };

    // Підсумок по грошах (тільки sale)
    const grandTotal = isMoney ? lines.reduce((s, l) => {
        const q = parseFloat(l.quantity) || 0; const p = parseFloat(l.unit_price) || 0; return s + q * p;
    }, 0) : 0;
    const rate = parseFloat(form.exchange_rate) || 0;

    // Чи потрібна причина (перевищення плану / поза специфікацією) по будь-якому рядку
    const anyOverageOrOffSpec = form.installation_custom_id && lines.some(l => {
        if (!l.nomenclature_id || !(parseFloat(l.quantity) > 0)) return false;
        const need = needByNom(l.nomenclature_id);
        if (!need) return true; // поза специфікацією
        return lineQtyBase(l) > parseFloat(need.outstanding_need);
    });

    const validRecipient = () => {
        if (form.kind === 'issue') return !!form.installation_custom_id;
        if (form.kind === 'partner') return !!form.client_id;
        return !!form.client_id || !!form.installation_custom_id; // sale
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validRecipient()) {
            const msg = form.kind === 'issue' ? "Оберіть об'єкт для видачі" : form.kind === 'partner' ? 'Оберіть партнера' : "Оберіть клієнта або об'єкт";
            return safeShowToast(msg, 'error');
        }
        if (!form.warehouse_from_id) return safeShowToast('Оберіть склад списання', 'error');

        const valid = lines.filter(l => l.nomenclature_id && parseFloat(l.quantity) > 0);
        if (valid.length === 0) return safeShowToast('Додайте хоча б одну позицію з кількістю', 'error');
        if (isMoney && valid.some(l => !(parseFloat(l.unit_price) >= 0))) return safeShowToast('Вкажіть ціну для кожної позиції', 'error');
        if (anyOverageOrOffSpec && !form.notes.trim()) return safeShowToast('Перевищення/позапланові позиції — вкажіть причину в коментарі', 'warning');

        setIsSubmitting(true);
        let okCount = 0;
        const failed = [];
        const updatedLines = [...lines];

        try {
            for (const line of valid) {
                const qtyBase = lineQtyBase(line);
                let data, error;
                if (form.kind === 'issue') {
                    ({ data, error } = await supabase.rpc('issue_to_object', {
                        p_installation: parseInt(form.installation_custom_id),
                        p_warehouse: parseInt(form.warehouse_from_id),
                        p_nomenclature: parseInt(line.nomenclature_id),
                        p_qty: qtyBase,
                        p_reason: form.notes.trim() || null,
                        p_emp: employee?.id ?? null,
                    }));
                } else {
                    ({ data, error } = await supabase.rpc('sell_to_object', {
                        p_installation: form.installation_custom_id ? parseInt(form.installation_custom_id) : null,
                        p_warehouse: parseInt(form.warehouse_from_id),
                        p_nomenclature: parseInt(line.nomenclature_id),
                        p_qty: qtyBase,
                        p_op: kindCfg.op,
                        p_client: form.client_id ? parseInt(form.client_id) : null,
                        p_sale_price: isMoney ? linePriceBase(line) : null,
                        p_currency: isMoney ? form.currency : null,
                        p_exchange_rate: isMoney ? (parseFloat(form.exchange_rate) || 1) : 1,
                        p_reference: form.reference_document || null,
                        p_reason: form.notes.trim() || null,
                        p_emp: employee?.id ?? null,
                    }));
                }
                const idx = updatedLines.findIndex(l => l.key === line.key);
                if (error) { failed.push(line); if (idx >= 0) updatedLines[idx] = { ...updatedLines[idx], error: error.message }; }
                else if (data && data.ok === false) { failed.push(line); if (idx >= 0) updatedLines[idx] = { ...updatedLines[idx], error: data.message || 'Відхилено' }; }
                else { okCount++; }
            }

            if (okCount > 0) onSuccess();

            if (failed.length === 0) {
                safeShowToast(`Проведено позицій: ${okCount}`, 'success');
                onClose();
            } else {
                setLines(updatedLines);
                safeShowToast(`Проведено ${okCount}, з помилкою ${failed.length}. Перевірте позиції.`, 'error');
            }
        } catch (error) {
            safeShowToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const clientOptions = dict.clients.map(c => ({ value: c.id, label: `${c.name} ${c.is_subcontract ? '(Партнер)' : ''}`, subLabel: `ID: #${c.custom_id || c.id}` }));
    const instOptions = dict.installations.map(i => ({ value: i.custom_id, label: `Об'єкт #${i.custom_id}`, subLabel: i.name }));

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[80]">
                    <motion.div initial={{ scale: 0.98, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 30 }} className="bg-white rounded-t-[24px] sm:rounded-[24px] w-full sm:max-w-4xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[92vh] overflow-hidden" onClick={e => e.stopPropagation()}>

                        {/* HEADER + перемикач типу */}
                        <div className={`p-4 sm:p-6 border-b border-slate-100 flex-shrink-0 ${accent.head}`}>
                            <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                    <h2 className={`text-lg sm:text-2xl font-black flex items-center gap-3 ${accent.text}`}>
                                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent.chip}`}><kindCfg.icon /></div>
                                        <span className="truncate">{kindCfg.label}</span>
                                    </h2>
                                </div>
                                <button onClick={onClose} className="w-9 h-9 bg-white hover:bg-slate-100 text-slate-400 rounded-full flex items-center justify-center transition-colors shadow-sm flex-shrink-0"><FaTimes /></button>
                            </div>
                            <div className="flex gap-1.5 mt-4 bg-white/70 p-1.5 rounded-xl">
                                {Object.entries(KINDS).map(([k, cfg]) => (
                                    <button key={k} type="button" onClick={() => setForm(f => ({ ...f, kind: k }))} className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-1.5 ${form.kind === k ? `bg-white shadow-sm ${ACCENT[k].tabOn}` : 'text-slate-500 hover:bg-white/50'}`}>
                                        <cfg.icon size={12} /> <span className="hidden sm:inline">{cfg.label}</span><span className="sm:hidden">{k === 'issue' ? 'Видача' : k === 'partner' ? 'Партнер' : 'Продаж'}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* BODY */}
                        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 relative space-y-6">
                            {isLoading && (
                                <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center backdrop-blur-sm">
                                    <div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-blue-400 rounded-full"></div><div className="w-3 h-3 bg-blue-400 rounded-full"></div><div className="w-3 h-3 bg-blue-400 rounded-full"></div></div>
                                </div>
                            )}

                            {/* ОТРИМУВАЧ */}
                            <section>
                                <div className="flex justify-between items-end mb-3">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FaUserTie /> {form.kind === 'issue' ? "Об'єкт" : 'Отримувач'}</h3>
                                    {form.kind !== 'issue' && !isAddingClient && (
                                        <button type="button" onClick={() => setIsAddingClient(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1"><FaPlus size={10} /> Новий</button>
                                    )}
                                </div>

                                {isAddingClient && form.kind !== 'issue' ? (
                                    <div className="bg-blue-50/40 border border-blue-100 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <input autoFocus type="text" value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="ПІБ / Назва *" />
                                        <input type="text" value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="Телефон" />
                                        <input type="text" value={newClient.notes} onChange={e => setNewClient({ ...newClient, notes: e.target.value })} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="Коментар" />
                                        <div className="sm:col-span-3 flex justify-end gap-2">
                                            <button type="button" onClick={() => setIsAddingClient(false)} className="px-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-600">Скасувати</button>
                                            <button type="button" onClick={handleQuickAddClient} disabled={isSubmitting} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"><FaCheck /> Зберегти</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {form.kind !== 'issue' && (
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">{form.kind === 'partner' ? 'Партнер' : 'Клієнт / Партнер'} {form.kind === 'partner' && <span className="text-red-500">*</span>}</label>
                                                <SearchableSelect options={clientOptions} value={form.client_id} onChange={(val) => setForm({ ...form, client_id: val })} placeholder="Пошук (Ім'я або ID)..." />
                                            </div>
                                        )}
                                        <div className={form.kind === 'issue' ? 'md:col-span-2' : ''}>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Об'єкт {form.kind === 'issue' ? <span className="text-red-500">*</span> : '(опц.)'}</label>
                                            <SearchableSelect options={instOptions} value={form.installation_custom_id} onChange={(val) => setForm({ ...form, installation_custom_id: val })} placeholder="Пошук за номером об'єкта..." />
                                        </div>
                                    </div>
                                )}
                            </section>

                            {/* СКЛАД */}
                            <section>
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 border-t border-slate-100 pt-5"><FaWarehouse /> Склад списання <span className="text-red-500">*</span></h3>
                                <select required value={form.warehouse_from_id} onChange={e => setForm({ ...form, warehouse_from_id: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none text-sm font-bold text-slate-800 transition-colors">
                                    <option value="">Оберіть склад...</option>
                                    {dict.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </section>

                            {/* КОШИК ПОЗИЦІЙ */}
                            <section>
                                <div className="flex justify-between items-center mb-3 border-t border-slate-100 pt-5">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><FaBox /> Позиції ({lines.filter(l => l.nomenclature_id).length})</h3>
                                    <button type="button" onClick={addLine} disabled={!form.warehouse_from_id} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-40"><FaPlus size={10} /> Додати рядок</button>
                                </div>

                                {!form.warehouse_from_id ? (
                                    <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-sm text-slate-400 font-medium">Спершу оберіть склад</div>
                                ) : (
                                    <div className="space-y-3">
                                        {lines.map((line) => {
                                            const nom = nomById(line.nomenclature_id);
                                            const hasPkg = nom?.package_multiplier > 1;
                                            const bal = getBal(line.nomenclature_id);
                                            const need = needByNom(line.nomenclature_id);
                                            const qtyB = lineQtyBase(line);
                                            const over = need && qtyB > parseFloat(need.outstanding_need);
                                            const offSpec = form.installation_custom_id && line.nomenclature_id && !need;
                                            return (
                                                <div key={line.key} className={`bg-white border rounded-xl p-3 shadow-sm ${line.error ? 'border-red-300' : 'border-slate-200'}`}>
                                                    <div className="flex gap-2 items-start">
                                                        <div className="flex-1 min-w-0">
                                                            <SearchableSelect options={nomOptions} value={line.nomenclature_id} onChange={(val) => updateLine(line.key, { nomenclature_id: val, sellMode: 'base' })} placeholder="Оберіть товар..." />
                                                        </div>
                                                        <button type="button" onClick={() => removeLine(line.key)} className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0" title="Прибрати"><FaTrash size={14} /></button>
                                                    </div>

                                                    {line.nomenclature_id && (
                                                        <div className="mt-2.5 flex flex-wrap items-end gap-2 sm:gap-3">
                                                            {hasPkg && (
                                                                <div className="flex bg-slate-100 p-0.5 rounded-lg">
                                                                    <button type="button" onClick={() => updateLine(line.key, { sellMode: 'base' })} className={`px-2 py-1 rounded-md text-[10px] font-bold ${line.sellMode === 'base' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}>{nom.unitName}</button>
                                                                    <button type="button" onClick={() => updateLine(line.key, { sellMode: 'piece' })} className={`px-2 py-1 rounded-md text-[10px] font-bold ${line.sellMode === 'piece' ? 'bg-white shadow text-amber-700' : 'text-slate-500'}`}>{nom.package_name || 'шт'}</button>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">К-сть</label>
                                                                <input type="number" step="any" min="0" inputMode="decimal" value={line.quantity} onChange={e => updateLine(line.key, { quantity: e.target.value })} className="w-24 px-3 py-2 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-lg text-base font-black text-slate-800 outline-none" placeholder="0" />
                                                            </div>
                                                            {isMoney && (
                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-400 uppercase mb-0.5">Ціна/од ({form.currency})</label>
                                                                    <input type="number" step="any" min="0" value={line.unit_price} onChange={e => updateLine(line.key, { unit_price: e.target.value })} className="w-28 px-3 py-2 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-lg text-base font-black text-slate-800 outline-none" placeholder="0.00" />
                                                                </div>
                                                            )}
                                                            {isMoney && (parseFloat(line.quantity) > 0 && parseFloat(line.unit_price) > 0) && (
                                                                <div className="text-xs font-bold text-slate-500 pb-2">= {(parseFloat(line.quantity) * parseFloat(line.unit_price)).toLocaleString('uk-UA')} {form.currency}</div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* хінти: залишок / звірка / помилка */}
                                                    {line.nomenclature_id && (
                                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                                                            <span className="font-bold text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">{form.kind === 'issue' ? 'На складі' : 'Вільно'}: {form.kind === 'issue' ? bal.onHand : bal.available} {nom?.unitName}</span>
                                                            {need && <span className="font-bold text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded">дефіцит: {parseFloat(need.outstanding_need)}</span>}
                                                            {over && <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1"><FaExclamationTriangle size={9} /> понад план</span>}
                                                            {offSpec && <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1"><FaExclamationTriangle size={9} /> поза специфікацією</span>}
                                                            {line.error && <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">{line.error}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </section>

                            {/* ФІНАНСИ (тільки продаж) */}
                            {isMoney && (
                                <section className="border-t border-slate-100 pt-5">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><FaMoneyBillWave /> Фінанси</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Валюта</label>
                                            <select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value, exchange_rate: e.target.value === 'UAH' ? '1' : form.exchange_rate })} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold text-slate-800">
                                                <option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="UAH">UAH (₴)</option>
                                            </select>
                                        </div>
                                        {form.currency !== 'UAH' && (
                                            <div>
                                                <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Курс</label>
                                                <input type="number" step="any" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: e.target.value })} className="w-full px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-bold text-slate-800" />
                                            </div>
                                        )}
                                        <div className="col-span-2 sm:col-span-1 sm:col-start-4 text-right">
                                            <div className="text-[11px] font-bold text-slate-400 uppercase">Разом</div>
                                            <div className="text-lg font-black text-slate-800">{grandTotal.toLocaleString('uk-UA')} {form.currency}</div>
                                            {form.currency !== 'UAH' && rate > 0 && <div className="text-[11px] font-bold text-emerald-600">≈ {(grandTotal * rate).toLocaleString('uk-UA')} ₴</div>}
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* ДОКУМЕНТ + КОМЕНТАР */}
                            <section className="border-t border-slate-100 pt-5">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><FaFileAlt /> Документ і коментар</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {isMoney && (
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Документ (Акт / Накладна)</label>
                                            <input type="text" value={form.reference_document} onChange={e => setForm({ ...form, reference_document: e.target.value })} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm text-slate-800" placeholder="№..." />
                                        </div>
                                    )}
                                    <div className={isMoney ? '' : 'md:col-span-2'}>
                                        <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Коментар {anyOverageOrOffSpec && <span className="text-red-500">* причина</span>}</label>
                                        <input type="text" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={`w-full px-4 py-3 bg-slate-50 border rounded-xl outline-none text-sm text-slate-800 ${anyOverageOrOffSpec ? 'border-amber-300' : 'border-slate-200'}`} placeholder={anyOverageOrOffSpec ? 'Обов’язково: причина перевищення/поза планом...' : 'Опційно...'} />
                                    </div>
                                </div>
                                {anyOverageOrOffSpec && (
                                    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                                        <FaInfoCircle className="text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-amber-800 font-medium">Є позиції понад план або поза специфікацією об'єкта. Операцію буде проведено, але вкажіть причину.</p>
                                    </div>
                                )}
                            </section>
                        </div>

                        {/* FOOTER */}
                        <div className="p-4 sm:p-5 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-between sm:items-center gap-3 flex-shrink-0 bg-slate-50 rounded-b-[24px] pb-safe">
                            <div className="text-xs font-bold text-slate-500 text-center sm:text-left">
                                Позицій: <span className="text-slate-800">{lines.filter(l => l.nomenclature_id && parseFloat(l.quantity) > 0).length}</span>
                                {isMoney && grandTotal > 0 && <span className="ml-3">Разом: <span className="text-slate-800">{grandTotal.toLocaleString('uk-UA')} {form.currency}</span></span>}
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={onClose} className="flex-1 sm:flex-none px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                <button type="button" onClick={handleSubmit} disabled={isSubmitting || isLoading} className={`flex-1 sm:flex-none px-6 sm:px-8 py-3 text-white rounded-xl font-bold shadow-lg transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-70 ${accent.btn}`}>
                                    {isSubmitting ? 'Проведення...' : `Провести${form.kind === 'issue' ? ' видачу' : form.kind === 'partner' ? ' передачу' : ' продаж'}`}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
