import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaTimes, FaHistory, FaArrowDown, FaArrowUp, FaExchangeAlt, FaTrash,
    FaLock, FaUnlock, FaShoppingCart, FaHandshake, FaInfoCircle, FaHardHat,
    FaChevronDown, FaFileAlt, FaWarehouse, FaCalendarAlt, FaUserTie
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';

const OP_CONFIG = {
    purchase: { label: 'Прихід', icon: FaArrowDown, color: 'text-emerald-700 bg-emerald-100 border-emerald-200', sign: '+' },
    issue: { label: 'Видача', icon: FaArrowUp, color: 'text-amber-700 bg-amber-100 border-amber-200', sign: '-' },
    return: { label: 'Повернення', icon: FaArrowDown, color: 'text-teal-700 bg-teal-100 border-teal-200', sign: '+' },
    transfer: { label: 'Переміщення', icon: FaExchangeAlt, color: 'text-indigo-700 bg-indigo-100 border-indigo-200', sign: '=' },
    writeoff: { label: 'Списання', icon: FaTrash, color: 'text-rose-700 bg-rose-100 border-rose-200', sign: '-' },
    reserve: { label: 'Резерв', icon: FaLock, color: 'text-purple-700 bg-purple-100 border-purple-200', sign: '0' },
    unreserve: { label: 'Зняття рез.', icon: FaUnlock, color: 'text-slate-600 bg-slate-200 border-slate-300', sign: '0' },
    sale: { label: 'Продаж', icon: FaShoppingCart, color: 'text-blue-700 bg-blue-100 border-blue-200', sign: '-' },
    partner_transfer: { label: 'Передача', icon: FaHandshake, color: 'text-violet-700 bg-violet-100 border-violet-200', sign: '-' },
};

const OUT_TYPES = ['issue', 'sale', 'partner_transfer'];
const IN_TYPES = ['purchase', 'return'];

const PERIODS = [
    { id: 'week', label: 'Тиждень' },
    { id: 'month', label: 'Місяць' },
    { id: 'quarter', label: '3 місяці' },
    { id: 'all', label: 'Весь час' },
];

const MAX_ROWS = 500;

const fmtQty = (n) => {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : String(parseFloat(v.toFixed(3)));
};
const fmtDate = (iso) => new Date(iso).toLocaleDateString('uk-UA');
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

// Початок періоду відносно сьогодні
const periodStart = (period) => {
    if (period === 'all') return null;
    const d = new Date();
    if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    else if (period === 'quarter') d.setMonth(d.getMonth() - 3);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
};

export default function ItemMovementHistoryModal({ isOpen, onClose, item, warehouseId = null }) {
    const [loading, setLoading] = useState(false);
    const [movements, setMovements] = useState([]);
    const [dicts, setDicts] = useState({ wh: {}, inst: {}, clients: {}, emp: {} });
    const [tab, setTab] = useState('objects');
    const [expandedKey, setExpandedKey] = useState(null);
    const [error, setError] = useState(null);

    // Фільтри
    const [period, setPeriod] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    const load = useCallback(async () => {
        if (!item?.id) return;
        setLoading(true);
        setError(null);
        try {
            let movQuery = supabase
                .from('stock_movements')
                .select('*')
                .eq('nomenclature_id', item.id);

            if (warehouseId) {
                movQuery = movQuery.or(`warehouse_from_id.eq.${warehouseId},warehouse_to_id.eq.${warehouseId}`);
            }
            if (typeFilter !== 'all') movQuery = movQuery.eq('operation_type', typeFilter);

            // Довільний період має пріоритет над швидкими кнопками
            if (dateFrom || dateTo) {
                if (dateFrom) movQuery = movQuery.gte('operation_date', dateFrom);
                if (dateTo) movQuery = movQuery.lte('operation_date', dateTo + 'T23:59:59.999');
            } else {
                const start = periodStart(period);
                if (start) movQuery = movQuery.gte('operation_date', start);
            }

            movQuery = movQuery.order('operation_date', { ascending: false }).limit(MAX_ROWS);

            const [movRes, whRes, instRes, clientsRes, empRes] = await Promise.all([
                movQuery,
                supabase.from('warehouses').select('id, name'),
                supabase.from('installations').select('custom_id, name'),
                supabase.from('clients').select('id, custom_id, name'),
                supabase.from('employees').select('id, name'),
            ]);
            if (movRes.error) throw movRes.error;

            const d = { wh: {}, inst: {}, clients: {}, emp: {} };
            (whRes.data || []).forEach(w => { d.wh[w.id] = w.name; });
            (instRes.data || []).forEach(i => { d.inst[i.custom_id] = i.name; });
            (clientsRes.data || []).forEach(c => { d.clients[c.id] = { name: c.name, customId: c.custom_id ?? c.id }; });
            (empRes.data || []).forEach(e => { d.emp[e.id] = e.name; });

            setDicts(d);
            setMovements(movRes.data || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [item?.id, warehouseId, period, dateFrom, dateTo, typeFilter]);

    useEffect(() => {
        if (isOpen) load();
    }, [isOpen, load]);

    // Скидання стану при відкритті іншого товару
    useEffect(() => {
        if (isOpen) {
            setTab('objects');
            setExpandedKey(null);
        }
    }, [isOpen, item?.id]);

    const instLabel = (customId) => {
        if (!customId) return null;
        const name = dicts.inst[customId];
        return name ? `«${name}» #${customId}` : `Об’єкт #${customId}`;
    };
    const clientLabel = (clientId) => {
        if (!clientId) return null;
        const c = dicts.clients[clientId];
        return c ? `${c.name} (ID ${c.customId})` : `Клієнт #${clientId}`;
    };
    const empLabel = (m) => dicts.emp[m.performed_by || m.created_by] || 'Система';
    const whFrom = (m) => dicts.wh[m.warehouse_from_id] || null;
    const whTo = (m) => dicts.wh[m.warehouse_to_id] || null;

    // Куди пішов / звідки прийшов товар у конкретній операції
    const routeOf = (m) => {
        const from = whFrom(m);
        const to = whTo(m);
        switch (m.operation_type) {
            case 'purchase': return `Постачальник → ${to || 'Склад'}`;
            case 'return': return `${instLabel(m.installation_custom_id) || 'Повернення'} → ${to || 'Склад'}`;
            case 'transfer': return `${from || 'Склад'} → ${to || 'Склад'}`;
            case 'writeoff': return `${from || 'Склад'} → Списано`;
            case 'issue': return `${from || 'Склад'} → ${instLabel(m.installation_custom_id) || '—'}`;
            case 'reserve': return `${from || 'Склад'} → Резерв`;
            case 'unreserve': return `Резерв → ${from || 'Склад'}`;
            case 'sale':
            case 'partner_transfer': {
                const parts = [clientLabel(m.client_id), instLabel(m.installation_custom_id)].filter(Boolean);
                return `${from || 'Склад'} → ${parts.length ? parts.join(' · ') : 'Відвантаження'}`;
            }
            default: return `${from || '—'} → ${to || '—'}`;
        }
    };

    // Ключ призначення для групування: об’єкт, клієнт, склад або списання
    const destinationOf = (m) => {
        if (m.installation_custom_id) {
            return { key: `inst:${m.installation_custom_id}`, label: instLabel(m.installation_custom_id), type: 'object' };
        }
        if (m.client_id && (m.operation_type === 'sale' || m.operation_type === 'partner_transfer')) {
            return { key: `client:${m.client_id}`, label: clientLabel(m.client_id), type: 'client' };
        }
        if (m.operation_type === 'transfer') {
            return { key: `wh:${m.warehouse_to_id}`, label: dicts.wh[m.warehouse_to_id] || 'Інший склад', type: 'warehouse' };
        }
        if (m.operation_type === 'writeoff') {
            return { key: 'writeoff', label: 'Списання / втрата', type: 'writeoff' };
        }
        return null;
    };

    // Підсумки за обраний період
    const totalIn = movements.filter(m => IN_TYPES.includes(m.operation_type)).reduce((s, m) => s + parseFloat(m.quantity || 0), 0);
    const totalOut = movements.filter(m => OUT_TYPES.includes(m.operation_type)).reduce((s, m) => s + parseFloat(m.quantity || 0), 0);
    const totalWriteoff = movements.filter(m => m.operation_type === 'writeoff').reduce((s, m) => s + parseFloat(m.quantity || 0), 0);

    // Групування «куди пішов товар»
    const groups = [];
    const groupIndex = {};
    movements.forEach(m => {
        const dest = destinationOf(m);
        if (!dest) return;
        const isOut = OUT_TYPES.includes(m.operation_type) || m.operation_type === 'writeoff' || m.operation_type === 'transfer';
        const isBack = m.operation_type === 'return';
        if (!isOut && !isBack) return;

        if (groupIndex[dest.key] === undefined) {
            groupIndex[dest.key] = groups.length;
            groups.push({ ...dest, out: 0, back: 0, lastDate: null, warehouses: new Set(), rows: [] });
        }
        const g = groups[groupIndex[dest.key]];
        const qty = parseFloat(m.quantity || 0);
        if (isOut) g.out += qty; else g.back += qty;
        const date = m.operation_date || m.created_at;
        if (!g.lastDate || date > g.lastDate) g.lastDate = date;
        const wh = isBack ? whTo(m) : whFrom(m);
        if (wh) g.warehouses.add(wh);
        g.rows.push(m);
    });
    groups.sort((a, b) => (b.out - b.back) - (a.out - a.back));

    const unit = item?.unitName || 'шт';
    const isCustomRange = !!(dateFrom || dateTo);
    const resetRange = () => { setDateFrom(''); setDateTo(''); };

    return (
        <AnimatePresence>
            {isOpen && item && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[88]" onClick={onClose}>
                    <motion.div initial={{ scale: 0.98, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 30 }} className="bg-white rounded-t-[24px] sm:rounded-[24px] w-full sm:max-w-4xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[92vh] overflow-hidden" onClick={e => e.stopPropagation()}>

                        {/* HEADER */}
                        <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                            <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-lg font-black text-slate-800 flex items-center gap-2">
                                        <FaHistory className="text-indigo-500 flex-shrink-0" /> Рух товару
                                    </h2>
                                    <p className="text-xs sm:text-sm font-bold text-slate-600 mt-1 line-clamp-2">{item.fullName}</p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {item.sku && <span className="text-[10px] font-mono uppercase tracking-widest bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">SKU: {item.sku}</span>}
                                        {warehouseId && <span className="text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded flex items-center gap-1"><FaWarehouse size={9} /> {dicts.wh[warehouseId] || 'Обраний склад'}</span>}
                                    </div>
                                </div>
                                <button onClick={onClose} className="w-9 h-9 bg-white hover:bg-slate-100 text-slate-400 rounded-full flex items-center justify-center transition-colors shadow-sm flex-shrink-0"><FaTimes /></button>
                            </div>

                            {/* ФІЛЬТРИ */}
                            <div className="flex flex-wrap items-center gap-2 mt-3.5">
                                <div className="flex bg-white p-1 rounded-xl border border-slate-200">
                                    {PERIODS.map(p => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => { setPeriod(p.id); resetRange(); }}
                                            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${!isCustomRange && period === p.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>

                                <div className={`h-9 flex items-center gap-1.5 px-2.5 rounded-xl border transition-colors ${isCustomRange ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200'}`}>
                                    <FaCalendarAlt className="text-slate-400 text-xs flex-shrink-0" />
                                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer w-[100px]" title="Початкова дата" />
                                    <span className="text-slate-300 font-bold">–</span>
                                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-[11px] font-bold text-slate-700 outline-none cursor-pointer w-[100px]" title="Кінцева дата" />
                                </div>

                                <select
                                    value={typeFilter}
                                    onChange={e => setTypeFilter(e.target.value)}
                                    className={`h-9 px-2.5 rounded-xl border text-[11px] font-bold outline-none cursor-pointer transition-colors ${typeFilter !== 'all' ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : 'bg-white border-slate-200 text-slate-600'}`}
                                    title="Тип операції"
                                >
                                    <option value="all">Всі операції</option>
                                    <option value="issue">Видачі</option>
                                    <option value="sale">Продажі</option>
                                    <option value="partner_transfer">Передачі</option>
                                    <option value="purchase">Приходи</option>
                                    <option value="return">Повернення</option>
                                    <option value="transfer">Переміщення</option>
                                    <option value="writeoff">Списання</option>
                                </select>

                                {(isCustomRange || typeFilter !== 'all') && (
                                    <button
                                        type="button"
                                        onClick={() => { resetRange(); setTypeFilter('all'); setPeriod('all'); }}
                                        className="h-9 px-2.5 rounded-xl text-[11px] font-bold text-red-600 bg-red-50 border border-red-100 hover:bg-red-100 transition-colors flex items-center gap-1.5"
                                    >
                                        <FaTimes size={10} /> Скинути
                                    </button>
                                )}
                            </div>

                            {/* Підсумки за обраний період */}
                            <div className="grid grid-cols-3 gap-2 mt-3">
                                <div className="bg-white border border-emerald-100 rounded-xl px-3 py-2">
                                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Надійшло</div>
                                    <div className="font-black text-emerald-600 text-base">{fmtQty(totalIn)} <span className="text-[10px] text-slate-400 uppercase">{unit}</span></div>
                                </div>
                                <div className="bg-white border border-amber-100 rounded-xl px-3 py-2">
                                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Відвантажено</div>
                                    <div className="font-black text-amber-600 text-base">{fmtQty(totalOut)} <span className="text-[10px] text-slate-400 uppercase">{unit}</span></div>
                                </div>
                                <div className="bg-white border border-rose-100 rounded-xl px-3 py-2">
                                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Списано</div>
                                    <div className="font-black text-rose-600 text-base">{fmtQty(totalWriteoff)} <span className="text-[10px] text-slate-400 uppercase">{unit}</span></div>
                                </div>
                            </div>

                            {/* Вкладки */}
                            <div className="flex gap-1.5 mt-3 bg-white p-1.5 rounded-xl border border-slate-100">
                                <button type="button" onClick={() => setTab('objects')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${tab === 'objects' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                                    <FaHardHat size={12} /> Куди пішов ({groups.length})
                                </button>
                                <button type="button" onClick={() => setTab('timeline')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${tab === 'timeline' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                                    <FaHistory size={12} /> Хронологія ({movements.length})
                                </button>
                            </div>
                        </div>

                        {/* BODY */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-5">
                            {loading ? (
                                <div className="py-16 flex justify-center">
                                    <div className="animate-pulse flex gap-2"><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div><div className="w-3 h-3 bg-indigo-400 rounded-full"></div></div>
                                </div>
                            ) : error ? (
                                <div className="py-12 text-center text-sm font-bold text-red-600">{error}</div>
                            ) : movements.length === 0 ? (
                                <div className="py-16 flex flex-col items-center text-center">
                                    <FaHistory className="text-5xl text-slate-200 mb-3" />
                                    <h3 className="font-bold text-slate-600">Немає операцій</h3>
                                    <p className="text-slate-400 text-sm mt-1">За обраним періодом і фільтрами рухів не знайдено.</p>
                                </div>
                            ) : tab === 'objects' ? (
                                groups.length === 0 ? (
                                    <div className="py-12 text-center text-sm text-slate-400 font-medium">За цей період товар нікуди не відвантажувався.</div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {groups.map(g => {
                                            const isOpenGroup = expandedKey === g.key;
                                            const net = g.out - g.back;
                                            const whList = Array.from(g.warehouses);
                                            return (
                                                <div key={g.key} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                                    <button type="button" onClick={() => setExpandedKey(isOpenGroup ? null : g.key)} className="w-full p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors text-left">
                                                        <div className="min-w-0">
                                                            <div className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                                                {g.type === 'object' ? <FaHardHat className="text-slate-400 flex-shrink-0" /> : g.type === 'client' ? <FaHandshake className="text-slate-400 flex-shrink-0" /> : g.type === 'warehouse' ? <FaWarehouse className="text-slate-400 flex-shrink-0" /> : <FaTrash className="text-slate-400 flex-shrink-0" />}
                                                                <span className="truncate">{g.label}</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-500 font-medium mt-1 ml-6">
                                                                {whList.length > 0 && <span>зі складу: <b className="text-slate-600">{whList.join(', ')}</b> • </span>}
                                                                операцій: {g.rows.length} • остання: {fmtDate(g.lastDate)}
                                                                {g.back > 0 && <span className="text-teal-600 font-bold"> • повернуто {fmtQty(g.back)}</span>}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <div className="text-right">
                                                                <div className="font-black text-slate-900 text-base">{fmtQty(net)} <span className="text-[10px] text-slate-400 uppercase">{unit}</span></div>
                                                            </div>
                                                            <FaChevronDown className={`text-slate-300 text-xs transition-transform ${isOpenGroup ? 'rotate-180' : ''}`} />
                                                        </div>
                                                    </button>

                                                    <AnimatePresence>
                                                        {isOpenGroup && (
                                                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-slate-100 bg-slate-50/70">
                                                                <div className="p-3 space-y-2">
                                                                    {g.rows.map(m => {
                                                                        const conf = OP_CONFIG[m.operation_type] || { label: 'Інше', icon: FaInfoCircle, color: 'text-slate-500 bg-slate-100 border-slate-200', sign: '' };
                                                                        const Icon = conf.icon;
                                                                        const date = m.operation_date || m.created_at;
                                                                        const wh = m.operation_type === 'return' ? whTo(m) : whFrom(m);
                                                                        return (
                                                                            <div key={m.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
                                                                                <div className="min-w-0">
                                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${conf.color}`}><Icon size={9} /> {conf.label}</span>
                                                                                        <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">{fmtDate(date)}</span>
                                                                                        <span className="text-[10px] text-slate-400">{fmtTime(date)}</span>
                                                                                    </div>
                                                                                    <div className="text-[11px] text-slate-500 font-medium mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                                        {wh && <span className="flex items-center gap-1"><FaWarehouse size={9} className="text-slate-400" /> {wh}</span>}
                                                                                        <span className="flex items-center gap-1"><FaUserTie size={9} className="text-slate-400" /> {empLabel(m)}</span>
                                                                                        {m.reference_document && <span className="flex items-center gap-1"><FaFileAlt size={9} className="text-slate-400" /> {m.reference_document}</span>}
                                                                                    </div>
                                                                                </div>
                                                                                <div className="font-black text-slate-800 text-sm whitespace-nowrap">{conf.sign !== '0' && conf.sign}{fmtQty(m.quantity)}</div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )
                            ) : (
                                <div className="space-y-2">
                                    {movements.map(m => {
                                        const conf = OP_CONFIG[m.operation_type] || { label: 'Інше', icon: FaInfoCircle, color: 'text-slate-500 bg-slate-100 border-slate-200', sign: '' };
                                        const Icon = conf.icon;
                                        const date = m.operation_date || m.created_at;
                                        return (
                                            <div key={m.id} className="border border-slate-200 rounded-xl p-3 bg-white shadow-sm">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${conf.color}`}><Icon size={9} /> {conf.label}</span>
                                                            <span className="text-[11px] font-bold text-slate-700">{fmtDate(date)}</span>
                                                            <span className="text-[10px] text-slate-400">{fmtTime(date)}</span>
                                                        </div>
                                                        <div className="text-xs font-medium text-slate-600 mt-1.5">{routeOf(m)}</div>
                                                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                            {m.reference_document && <span className="text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded flex items-center gap-1"><FaFileAlt size={8} /> {m.reference_document}</span>}
                                                            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1"><FaUserTie size={8} /> {empLabel(m)}</span>
                                                        </div>
                                                        {m.notes && <div className="text-[10px] text-slate-400 italic mt-1.5">{m.notes}</div>}
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <div className="font-black text-slate-900 text-base whitespace-nowrap">{conf.sign !== '0' && conf.sign}{fmtQty(m.quantity)} <span className="text-[10px] text-slate-400 uppercase">{unit}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {movements.length >= MAX_ROWS && (
                                <div className="mt-4 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                                    <FaInfoCircle className="mt-0.5 shrink-0" />
                                    <span>Показано перші {MAX_ROWS} операцій. Звузьте період, щоб побачити повну картину.</span>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end flex-shrink-0 pb-safe">
                            <button type="button" onClick={onClose} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Закрити</button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
