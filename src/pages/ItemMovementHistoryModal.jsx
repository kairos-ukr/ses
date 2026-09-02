// =====================================================================
//  Рух товару — історія операцій по одній позиції.
//
//  Два погляди на ті самі дані:
//   «Куди пішов» — згруповано за призначенням: об'єкт, клієнт, склад.
//                  Відповідає на питання «де наші панелі».
//   «Хронологія» — просто стрічка операцій за часом.
//
//  Шапка з фільтрами й підсумками липка: гортаючи довгий список,
//  не втрачаєш з очей, за який період дивишся.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FaHistory, FaArrowDown, FaArrowUp, FaExchangeAlt, FaTrash,
    FaLock, FaUnlock, FaShoppingCart, FaHandshake, FaInfoCircle, FaHardHat,
    FaChevronDown, FaFileAlt, FaWarehouse, FaUserTie, FaSlidersH, FaTimes,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import {
    T, Btn, Chip, Segmented, Bar, Modal, EmptyState, Skeleton,
    humanError, num,
} from '../ui';

const OP = {
    purchase: { label: 'Прихід', icon: FaArrowDown, tone: 'ok', sign: '+' },
    issue: { label: 'Видача', icon: FaArrowUp, tone: 'warn', sign: '−' },
    return: { label: 'Повернення', icon: FaArrowDown, tone: 'ok', sign: '+' },
    transfer: { label: 'Переміщення', icon: FaExchangeAlt, tone: 'accent', sign: '=' },
    writeoff: { label: 'Списання', icon: FaTrash, tone: 'danger', sign: '−' },
    reserve: { label: 'Резерв', icon: FaLock, tone: 'warn', sign: '' },
    unreserve: { label: 'Зняття рез.', icon: FaUnlock, tone: 'neutral', sign: '' },
    sale: { label: 'Продаж', icon: FaShoppingCart, tone: 'info', sign: '−' },
    partner_transfer: { label: 'Передача', icon: FaHandshake, tone: 'accent', sign: '−' },
};
const FALLBACK = { label: 'Інше', icon: FaInfoCircle, tone: 'neutral', sign: '' };

const OUT_TYPES = ['issue', 'sale', 'partner_transfer'];
const IN_TYPES = ['purchase', 'return'];

const PERIODS = [
    { value: 'week', label: 'Тиждень' },
    { value: 'month', label: 'Місяць' },
    { value: 'quarter', label: '3 міс' },
    { value: 'all', label: 'Весь час' },
];

const DEST_ICON = { object: FaHardHat, client: FaHandshake, warehouse: FaWarehouse, writeoff: FaTrash };
const MAX_ROWS = 500;

const fmtDate = (iso) => new Date(iso).toLocaleDateString('uk-UA');
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

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

    const [period, setPeriod] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [filtersOpen, setFiltersOpen] = useState(false);

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const load = useCallback(async () => {
        if (!item?.id) return;
        setLoading(true);
        setError(null);
        try {
            let q = supabase.from('stock_movements').select('*').eq('nomenclature_id', item.id);

            if (warehouseId) q = q.or(`warehouse_from_id.eq.${warehouseId},warehouse_to_id.eq.${warehouseId}`);
            if (typeFilter !== 'all') q = q.eq('operation_type', typeFilter);

            // Свій діапазон має пріоритет над швидкими кнопками
            if (dateFrom || dateTo) {
                if (dateFrom) q = q.gte('operation_date', dateFrom);
                if (dateTo) q = q.lte('operation_date', dateTo + 'T23:59:59.999');
            } else {
                const start = periodStart(period);
                if (start) q = q.gte('operation_date', start);
            }

            q = q.order('operation_date', { ascending: false }).limit(MAX_ROWS);

            const [movRes, whRes, instRes, clRes, empRes] = await Promise.all([
                q,
                supabase.from('warehouses').select('id, name'),
                supabase.from('installations').select('custom_id, name'),
                supabase.from('clients').select('id, custom_id, name'),
                supabase.from('employees').select('id, name'),
            ]);
            if (movRes.error) throw movRes.error;

            const d = { wh: {}, inst: {}, clients: {}, emp: {} };
            (whRes.data || []).forEach(w => { d.wh[w.id] = w.name; });
            (instRes.data || []).forEach(i => { d.inst[i.custom_id] = i.name; });
            (clRes.data || []).forEach(c => { d.clients[c.id] = { name: c.name, customId: c.custom_id ?? c.id }; });
            (empRes.data || []).forEach(e => { d.emp[e.id] = e.name; });

            setDicts(d);
            setMovements(movRes.data || []);
        } catch (e) {
            setError(humanError(e));
        } finally {
            setLoading(false);
        }
    }, [item?.id, warehouseId, period, dateFrom, dateTo, typeFilter]);

    useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

    useEffect(() => {
        if (!isOpen) return;
        setTab('objects');
        setExpandedKey(null);
        setFiltersOpen(false);
    }, [isOpen, item?.id]);

    /* ---------------- ПІДПИСИ ---------------- */

    const instLabel = useCallback((id) => {
        if (!id) return null;
        const n = dicts.inst[id];
        return n ? `«${n}» #${id}` : `Об'єкт #${id}`;
    }, [dicts.inst]);

    const clientLabel = useCallback((id) => {
        if (!id) return null;
        const c = dicts.clients[id];
        return c ? `${c.name} (ID ${c.customId})` : `Клієнт #${id}`;
    }, [dicts.clients]);

    const empLabel = (m) => dicts.emp[m.performed_by || m.created_by] || 'Система';
    const whFrom = useCallback((m) => dicts.wh[m.warehouse_from_id] || null, [dicts.wh]);
    const whTo = useCallback((m) => dicts.wh[m.warehouse_to_id] || null, [dicts.wh]);

    const routeOf = (m) => {
        const from = whFrom(m), to = whTo(m);
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
                const p = [clientLabel(m.client_id), instLabel(m.installation_custom_id)].filter(Boolean);
                return `${from || 'Склад'} → ${p.length ? p.join(' · ') : 'Відвантаження'}`;
            }
            default: return `${from || '—'} → ${to || '—'}`;
        }
    };

    /* ---------------- ПІДСУМКИ ТА ГРУПИ ---------------- */

    const totals = useMemo(() => {
        let inQ = 0, outQ = 0, offQ = 0;
        for (const m of movements) {
            const q = parseFloat(m.quantity || 0);
            if (IN_TYPES.includes(m.operation_type)) inQ += q;
            else if (OUT_TYPES.includes(m.operation_type)) outQ += q;
            else if (m.operation_type === 'writeoff') offQ += q;
        }
        return { in: inQ, out: outQ, off: offQ, net: inQ - outQ - offQ };
    }, [movements]);

    const groups = useMemo(() => {
        const list = [], index = {};
        const destinationOf = (m) => {
            if (m.installation_custom_id) {
                return { key: `inst:${m.installation_custom_id}`, label: instLabel(m.installation_custom_id), type: 'object' };
            }
            if (m.client_id && ['sale', 'partner_transfer'].includes(m.operation_type)) {
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

        for (const m of movements) {
            const dest = destinationOf(m);
            if (!dest) continue;
            const isOut = OUT_TYPES.includes(m.operation_type)
                || m.operation_type === 'writeoff' || m.operation_type === 'transfer';
            const isBack = m.operation_type === 'return';
            if (!isOut && !isBack) continue;

            if (index[dest.key] === undefined) {
                index[dest.key] = list.length;
                list.push({ ...dest, out: 0, back: 0, lastDate: null, warehouses: new Set(), rows: [] });
            }
            const g = list[index[dest.key]];
            const qty = parseFloat(m.quantity || 0);
            if (isOut) g.out += qty; else g.back += qty;
            const date = m.operation_date || m.created_at;
            if (!g.lastDate || date > g.lastDate) g.lastDate = date;
            const wh = isBack ? whTo(m) : whFrom(m);
            if (wh) g.warehouses.add(wh);
            g.rows.push(m);
        }
        list.forEach(g => { g.net = g.out - g.back; });
        list.sort((a, b) => b.net - a.net);
        return list;
    }, [movements, instLabel, clientLabel, dicts.wh, whFrom, whTo]);

    const maxNet = groups.length ? Math.max(...groups.map(g => g.net)) : 0;

    const unit = item?.unitName || 'шт';
    const isCustomRange = !!(dateFrom || dateTo);
    const hasExtraFilters = isCustomRange || typeFilter !== 'all';

    const resetAll = () => {
        setDateFrom(''); setDateTo(''); setTypeFilter('all'); setPeriod('all');
    };

    /* ---------------- ЧАСТИНИ ---------------- */

    const OpChip = ({ type }) => {
        const c = OP[type] || FALLBACK;
        return <Chip tone={c.tone} icon={c.icon}>{c.label}</Chip>;
    };

    /** Один запис операції — компактний рядок, однаковий у групі й хронології */
    const OperationRow = ({ m, showRoute }) => {
        const c = OP[m.operation_type] || FALLBACK;
        const date = m.operation_date || m.created_at;
        const wh = m.operation_type === 'return' ? whTo(m) : whFrom(m);
        return (
            <div className={`${T.cardFlat} px-2.5 py-2`}>
                <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            <OpChip type={m.operation_type} />
                            <span className="text-[11px] font-semibold text-slate-700 tabular-nums">{fmtDate(date)}</span>
                            <span className="text-[10px] text-slate-400 tabular-nums">{fmtTime(date)}</span>
                        </div>
                        {showRoute && (
                            <div className="text-[12px] text-slate-600 mt-1 leading-snug">{routeOf(m)}</div>
                        )}
                        <div className="text-[10.5px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                            {!showRoute && wh && (
                                <span className="inline-flex items-center gap-1"><FaWarehouse size={8} />{wh}</span>
                            )}
                            <span className="inline-flex items-center gap-1"><FaUserTie size={8} />{empLabel(m)}</span>
                            {m.reference_document && (
                                <span className="inline-flex items-center gap-1"><FaFileAlt size={8} />{m.reference_document}</span>
                            )}
                        </div>
                        {m.notes && <div className="text-[10.5px] text-slate-400 italic mt-0.5">{m.notes}</div>}
                    </div>
                    <div className={`text-[14px] font-black tabular-nums whitespace-nowrap flex-shrink-0
                        ${c.sign === '+' ? 'text-emerald-700' : c.sign === '−' ? 'text-rose-700' : 'text-slate-700'}`}>
                        {c.sign}{num(m.quantity)}
                        <span className="text-[9px] font-bold text-slate-400 ml-0.5">{unit}</span>
                    </div>
                </div>
            </div>
        );
    };

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <Modal
            isOpen={isOpen && !!item}
            onClose={onClose}
            title="Рух товару"
            subtitle={item?.fullName}
            size="lg"
            footer={<Btn variant="outline" onClick={onClose}>Закрити</Btn>}
            /* Фільтри, підсумки й вкладки — у нерухомій смузі модалки.
               Прокручується лише список, і накладатись нема чому. */
            toolbar={<div className="space-y-2">

                {/* Мітки позиції */}
                {(item?.sku || warehouseId) && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {item?.sku && <span className={T.mono}>SKU {item.sku}</span>}
                        {warehouseId && (
                            <Chip tone="accent" icon={FaWarehouse}>
                                {dicts.wh[warehouseId] || 'обраний склад'}
                            </Chip>
                        )}
                    </div>
                )}

                {/* Період + фільтри */}
                <div className="flex items-center gap-2">
                    <Segmented
                        className="flex-1 sm:flex-none"
                        value={isCustomRange ? '' : period}
                        onChange={(v) => { setPeriod(v); setDateFrom(''); setDateTo(''); }}
                        options={PERIODS}
                    />
                    <Btn
                        variant={filtersOpen || hasExtraFilters ? 'primary' : 'outline'}
                        icon={FaSlidersH}
                        onClick={() => setFiltersOpen(v => !v)}
                        className="flex-shrink-0"
                    >
                        <span className="hidden sm:inline">Ще</span>
                    </Btn>
                    {hasExtraFilters && (
                        <Btn variant="softDanger" icon={FaTimes} onClick={resetAll} className="flex-shrink-0">
                            <span className="hidden sm:inline">Скинути</span>
                        </Btn>
                    )}
                </div>

                {filtersOpen && (
                    <div className="grid sm:grid-cols-3 gap-2 pt-0.5">
                        <input type="date" className={T.input} value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)} />
                        <input type="date" className={T.input} value={dateTo}
                            onChange={e => setDateTo(e.target.value)} />
                        <select className={T.select} value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value)}>
                            <option value="all">Всі операції</option>
                            {Object.entries(OP).map(([k, o]) => <option key={k} value={k}>{o.label}</option>)}
                        </select>
                    </div>
                )}

                {/* Підсумки — один щільний рядок замість трьох великих плиток */}
                <div className={`${T.inset} px-3 py-2 flex items-center justify-between gap-3 flex-wrap`}>
                    <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Надійшло</span>
                        <b className="text-[14px] font-black tabular-nums text-emerald-700">{num(totals.in)}</b>
                    </span>
                    <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Відвантажено</span>
                        <b className="text-[14px] font-black tabular-nums text-amber-700">{num(totals.out)}</b>
                    </span>
                    <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Списано</span>
                        <b className={`text-[14px] font-black tabular-nums ${totals.off > 0 ? 'text-rose-700' : 'text-slate-400'}`}>
                            {num(totals.off)}
                        </b>
                    </span>
                    <span className="inline-flex items-baseline gap-1.5 sm:ml-auto">
                        <span className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Різниця</span>
                        <b className={`text-[14px] font-black tabular-nums ${totals.net >= 0 ? 'text-slate-900' : 'text-rose-700'}`}>
                            {totals.net > 0 ? '+' : ''}{num(totals.net)}
                        </b>
                        <span className="text-[9px] font-bold text-slate-400">{unit}</span>
                    </span>
                </div>

                <Segmented
                    className="w-full"
                    value={tab}
                    onChange={setTab}
                    options={[
                        { value: 'objects', label: `Куди пішов · ${groups.length}` },
                        { value: 'timeline', label: `Хронологія · ${movements.length}` },
                    ]}
                />
            </div>}
        >
            {/* --- СПИСОК: єдине, що прокручується --- */}
            {loading ? <Skeleton rows={6} />
                : error ? (
                    <EmptyState icon={FaInfoCircle} title="Не вдалося завантажити" hint={error}>
                        <Btn variant="accent" onClick={load}>Спробувати ще раз</Btn>
                    </EmptyState>
                ) : movements.length === 0 ? (
                    <EmptyState
                        icon={FaHistory}
                        title="Операцій немає"
                        hint="За обраним періодом і фільтрами рухів не знайдено."
                    >
                        {(period !== 'all' || hasExtraFilters) && (
                            <Btn variant="soft" onClick={resetAll}>Показати за весь час</Btn>
                        )}
                    </EmptyState>
                ) : tab === 'objects' ? (
                    groups.length === 0 ? (
                        <EmptyState
                            icon={FaHardHat}
                            title="Нікуди не відвантажувався"
                            hint="За цей період були тільки надходження. Подивіться вкладку «Хронологія»."
                        />
                    ) : (
                        <div className="space-y-1.5">
                            {groups.map(g => {
                                const open = expandedKey === g.key;
                                const Icon = DEST_ICON[g.type] || FaInfoCircle;
                                const whList = Array.from(g.warehouses);
                                return (
                                    <div key={g.key} className={`${T.cardFlat} overflow-hidden ${open ? 'ring-2 ring-indigo-100 border-indigo-300' : ''}`}>
                                        <button
                                            type="button"
                                            onClick={() => setExpandedKey(open ? null : g.key)}
                                            className="w-full px-2.5 py-2 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                                        >
                                            <div className="flex items-start gap-2">
                                                <Icon className="text-slate-400 mt-0.5 flex-shrink-0" size={12} />
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[12.5px] font-bold text-slate-900 leading-snug">{g.label}</div>
                                                    <div className="text-[10.5px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2">
                                                        {whList.length > 0 && <span>зі складу <b className="text-slate-600">{whList.join(', ')}</b></span>}
                                                        <span>операцій {g.rows.length}</span>
                                                        <span>{fmtDate(g.lastDate)}</span>
                                                        {g.back > 0 && <span className="text-teal-600 font-bold">повернуто {num(g.back)}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <span className="text-[15px] font-black tabular-nums text-slate-900">
                                                        {num(g.net)}
                                                        <span className="text-[9px] font-bold text-slate-400 ml-0.5">{unit}</span>
                                                    </span>
                                                    <FaChevronDown
                                                        size={10}
                                                        className={`text-slate-300 transition-transform ${open ? 'rotate-180' : ''}`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Частка цього призначення — видно, куди пішла основна маса */}
                                            {maxNet > 0 && g.net > 0 && (
                                                <Bar
                                                    className="mt-1.5"
                                                    segments={[{ pct: (g.net / maxNet) * 100, tone: g.type === 'writeoff' ? 'danger' : 'accent' }]}
                                                />
                                            )}
                                        </button>

                                        {open && (
                                            <div className="px-2.5 pb-2.5 pt-0.5 space-y-1.5 bg-slate-50 border-t border-slate-200">
                                                {g.rows.map(m => <OperationRow key={m.id} m={m} />)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )
                ) : (
                    <div className="space-y-1.5">
                        {movements.map(m => <OperationRow key={m.id} m={m} showRoute />)}
                    </div>
                )}

            {movements.length >= MAX_ROWS && (
                <div className="mt-3 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                    <FaInfoCircle className="mt-0.5 flex-shrink-0" size={11} />
                    <span>Показано перші {MAX_ROWS} операцій. Звузьте період, щоб побачити повну картину.</span>
                </div>
            )}
        </Modal>
    );
}
