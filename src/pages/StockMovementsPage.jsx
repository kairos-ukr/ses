// =====================================================================
//  Рух товарів.
//
//  Журнал складських операцій. Типово показує останні 30 днів від
//  сьогодні — журнал росте вічно, і тягнути його весь немає сенсу.
//
//  Довідники навмисно НЕ вантажимо цілком: назви товарів, постачальників
//  і резервів приїжджають разом із поточною сторінкою журналу одним
//  запитом. Повний перелік номенклатури підвантажується лише тоді,
//  коли людина справді почала шукати по назві товару.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FaFileExcel, FaArrowDown, FaArrowUp, FaExchangeAlt,
    FaTrash, FaLock, FaUnlock, FaInfoCircle, FaHistory,
    FaShoppingCart, FaHandshake, FaEdit, FaFileInvoice, FaUndo,
    FaSlidersH, FaTimes, FaHardHat, FaUserTie,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

import DirectSaleModal from './DirectSaleModal';
import DeliveryNoteModal from './DeliveryNoteModal';
import ItemMovementHistoryModal from './ItemMovementHistoryModal';
import {
    T, Btn, IconBtn, Card, Field, Picker, EmptyState, Skeleton,
    Pagination, Modal, useToast, humanError, num, useIsMobile, useAutoFocus,
} from '../ui';

const OP = {
    purchase: { label: 'Прихід', icon: FaArrowDown, tone: 'ok', sign: '+' },
    issue: { label: 'Видача', icon: FaArrowUp, tone: 'warn', sign: '−' },
    return: { label: 'Повернення', icon: FaUndo, tone: 'ok', sign: '+' },
    transfer: { label: 'Переміщення', icon: FaExchangeAlt, tone: 'accent', sign: '=' },
    writeoff: { label: 'Списання', icon: FaTrash, tone: 'danger', sign: '−' },
    reserve: { label: 'Резерв', icon: FaLock, tone: 'warn', sign: '' },
    unreserve: { label: 'Зняття рез.', icon: FaUnlock, tone: 'neutral', sign: '' },
    sale: { label: 'Продаж', icon: FaShoppingCart, tone: 'info', sign: '−' },
    partner_transfer: { label: 'Передача', icon: FaHandshake, tone: 'accent', sign: '−' },
};
const FALLBACK_OP = { label: 'Інше', icon: FaInfoCircle, tone: 'neutral', sign: '' };

const DISPATCH_TYPES = ['issue', 'sale', 'partner_transfer'];
const ITEMS_PER_PAGE = 30;

const CHIP_TONE = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    accent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    info: 'bg-sky-50 text-sky-700 border-sky-200',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
};

/* Періоди — рухомі вікна від сьогодні, а не календарні місяці.
   «30 днів» означає саме останні 30 днів, а не «з першого числа». */
const PERIODS = [
    { value: 'd7', label: '7 днів' },
    { value: 'd30', label: '30 днів' },
    { value: 'd90', label: '3 місяці' },
    { value: 'month', label: 'Обраний місяць' },
    { value: 'custom', label: 'Свій період' },
    { value: 'all', label: 'Весь час' },
];

const startOfDayIso = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.toISOString();
};

/** Межі періоду для запиту. Повертає { from, to } у вигляді ISO або null. */
const periodRange = (period, monthValue, customFrom, customTo) => {
    const now = new Date();
    if (period === 'all') return { from: null, to: null };

    if (period === 'custom') {
        return {
            from: customFrom ? startOfDayIso(customFrom) : null,
            to: customTo ? `${customTo}T23:59:59.999` : null,
        };
    }

    if (period === 'month') {
        if (!monthValue) return { from: null, to: null };
        const [y, m] = monthValue.split('-').map(Number);
        const first = new Date(y, m - 1, 1);
        const next = new Date(y, m, 1);
        return { from: first.toISOString(), to: new Date(next.getTime() - 1).toISOString() };
    }

    const days = { d7: 7, d30: 30, d90: 90 }[period] || 30;
    return { from: startOfDayIso(new Date(now.getTime() - days * 86400000)), to: null };
};

const thisMonthValue = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default function StockMovementsPage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();
    const toast = useToast();
    const isMobile = useIsMobile();
    const autoFocus = useAutoFocus();

    const [movements, setMovements] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [returnedBySource, setReturnedBySource] = useState({});
    const [loading, setLoading] = useState(true);
    const [dictsReady, setDictsReady] = useState(false);

    // Довідники, які справді малі: категорії, працівники, склади, об'єкти, клієнти
    const [dicts, setDicts] = useState({ cat: new Map(), emp: {}, wh: {}, inst: {}, clients: {} });

    // Повний перелік номенклатури підвантажуємо ліниво — лише для пошуку по назві
    const [nomIndex, setNomIndex] = useState(null);

    const [editModal, setEditModal] = useState(null);
    const [editForm, setEditForm] = useState({ reference_document: '', notes: '', operation_date: '', sale_price: '', currency: 'USD', exchange_rate: '' });
    const [returnModal, setReturnModal] = useState(null);
    const [returnForm, setReturnForm] = useState({ quantity: '', reason: '' });
    const [busy, setBusy] = useState(false);
    const [isSaleOpen, setIsSaleOpen] = useState(false);
    const [noteDoc, setNoteDoc] = useState(null);
    const [noteLoadingId, setNoteLoadingId] = useState(null);
    const [historyItem, setHistoryItem] = useState(null);
    const [sheetMov, setSheetMov] = useState(null);

    // Фільтри
    const [typeFilter, setTypeFilter] = useState('all');
    const [period, setPeriod] = useState('d30');
    const [monthValue, setMonthValue] = useState(thisMonthValue());
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [instFilter, setInstFilter] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(externalSearch), 400);
        return () => clearTimeout(t);
    }, [externalSearch]);

    const prevTrigger = useRef(externalActionTrigger);
    useEffect(() => {
        if (externalActionTrigger > prevTrigger.current) setIsSaleOpen(true);
        prevTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    /* ---------------- ЛЕГКІ ДОВІДНИКИ ---------------- */

    const loadDicts = useCallback(async () => {
        try {
            const [catRes, empRes, whRes, instRes, clientsRes] = await Promise.all([
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('employees').select('id, name'),
                supabase.from('warehouses').select('id, name'),
                supabase.from('installations').select('custom_id, name'),
                supabase.from('clients').select('id, custom_id, name, phone'),
            ]);

            const d = { cat: new Map(), emp: {}, wh: {}, inst: {}, clients: {} };
            (catRes.data || []).forEach(c => d.cat.set(c.id, c));
            (empRes.data || []).forEach(e => d.emp[e.id] = e.name);
            (whRes.data || []).forEach(w => d.wh[w.id] = w.name);
            (instRes.data || []).forEach(i => d.inst[i.custom_id] = i.name);
            (clientsRes.data || []).forEach(c => d.clients[c.id] = {
                name: c.name, customId: c.custom_id ?? c.id, phone: c.phone || null,
            });

            setDicts(d);
            setDictsReady(true);
        } catch (e) {
            toast(humanError(e), 'error');
        }
    }, [toast]);

    useEffect(() => { if (!authLoading) loadDicts(); }, [authLoading, loadDicts]);

    // Перелік номенклатури тягнемо лише коли почали шукати — і лише один раз
    useEffect(() => {
        if (!debouncedSearch.trim() || nomIndex) return;
        let alive = true;
        supabase.from('nomenclature').select('id, name, sku').then(({ data }) => {
            if (alive) setNomIndex(data || []);
        });
        return () => { alive = false; };
    }, [debouncedSearch, nomIndex]);

    /* ---------------- ЗАПИТ ЖУРНАЛУ ---------------- */

    // Усе, що потрібно для показу рядка, приїжджає разом із ним.
    // Раніше для цього вантажились цілі purchase_order_items і reservations.
    const SELECT = `
        *,
        nomenclature:nomenclature(id, name, sku, category_id, unit:units(code, name)),
        po_item:purchase_order_items(id, purchase_order:purchase_orders(order_number, supplier:suppliers(name))),
        reservation:reservations(installation_custom_id)
    `;

    const applyFilters = useCallback((query) => {
        if (typeFilter !== 'all') query = query.eq('operation_type', typeFilter);

        const { from, to } = periodRange(period, monthValue, customFrom, customTo);
        if (from) query = query.gte('operation_date', from);
        if (to) query = query.lte('operation_date', to);

        if (clientFilter) query = query.eq('client_id', parseInt(clientFilter));
        if (instFilter) query = query.eq('installation_custom_id', parseInt(instFilter));

        const term = debouncedSearch.trim().toLowerCase();
        if (term) {
            const safe = term.replace(/[,()"'\\%]/g, ' ').trim();
            const or = [];
            if (safe) { or.push(`reference_document.ilike.%${safe}%`); or.push(`notes.ilike.%${safe}%`); }
            if (nomIndex) {
                const ids = nomIndex
                    .filter(n => n.name.toLowerCase().includes(term)
                        || (n.sku && String(n.sku).toLowerCase().includes(term)))
                    .map(n => n.id).slice(0, 300);
                if (ids.length) or.push(`nomenclature_id.in.(${ids.join(',')})`);
            }
            query = or.length ? query.or(or.join(',')) : query.eq('id', -1);
        }
        return query;
    }, [typeFilter, period, monthValue, customFrom, customTo, clientFilter, instFilter, debouncedSearch, nomIndex]);

    const loadMovements = useCallback(async () => {
        if (!dictsReady) return;
        setLoading(true);
        try {
            let q = supabase.from('stock_movements').select(SELECT, { count: 'exact' });
            q = applyFilters(q)
                .order('operation_date', { ascending: false })
                .range((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE - 1);

            const { data, count, error } = await q;
            if (error) throw error;
            setMovements(data || []);
            setTotalCount(count || 0);

            // Скільки вже повернено — тільки по операціях цієї сторінки
            const ids = (data || []).map(m => m.id);
            if (ids.length) {
                const { data: rets } = await supabase.from('stock_movements')
                    .select('source_movement_id, quantity').in('source_movement_id', ids);
                const map = {};
                (rets || []).forEach(r => {
                    map[r.source_movement_id] = (map[r.source_movement_id] || 0) + parseFloat(r.quantity);
                });
                setReturnedBySource(map);
            } else setReturnedBySource({});
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dictsReady, currentPage, applyFilters, toast]);

    useEffect(() => { loadMovements(); }, [loadMovements]);

    useEffect(() => { setCurrentPage(1); },
        [debouncedSearch, typeFilter, period, monthValue, customFrom, customTo, clientFilter, instFilter]);

    /* ---------------- РОЗБІР РЯДКА ---------------- */

    const catPath = useCallback((categoryId) => {
        const path = [];
        let id = categoryId, guard = 0;
        while (id && guard++ < 20) {
            const c = dicts.cat.get(id);
            if (!c) break;
            path.unshift(c.name);
            id = c.parent_id;
        }
        return path.join(' ');
    }, [dicts.cat]);

    const instLabel = useCallback((customId) => {
        if (!customId) return null;
        const name = dicts.inst[customId];
        return name ? `«${name}» #${customId}` : `#${customId}`;
    }, [dicts.inst]);

    const clientLabel = useCallback((clientId) => {
        if (!clientId) return null;
        const c = dicts.clients[clientId];
        return c ? `${c.name} (ID ${c.customId})` : `#${clientId}`;
    }, [dicts.clients]);

    const buildRow = useCallback((mov) => {
        const conf = OP[mov.operation_type] || FALLBACK_OP;
        const n = mov.nomenclature;
        const nom = n
            ? {
                id: n.id, sku: n.sku,
                fullName: `${catPath(n.category_id)} ${n.name}`.trim(),
                unitCode: n.unit?.code || n.unit?.name || 'шт',
            }
            : { id: mov.nomenclature_id, fullName: 'Невідомий товар', unitCode: 'шт', sku: '' };

        const empName = dicts.emp[mov.performed_by || mov.created_by] || 'Система';
        let from = '—', to = '—';
        let doc = mov.reference_document || '';

        switch (mov.operation_type) {
            case 'purchase': {
                const po = mov.po_item?.purchase_order;
                if (po) {
                    from = `Постачальник «${po.supplier?.name || '?'}»`;
                    if (!doc) doc = po.order_number;
                } else from = 'Ручний прихід';
                to = dicts.wh[mov.warehouse_to_id] || 'Склад';
                break;
            }
            case 'issue':
                from = dicts.wh[mov.warehouse_from_id] || 'Склад';
                to = instLabel(mov.installation_custom_id) || '—';
                break;
            case 'return':
                from = instLabel(mov.installation_custom_id) || '—';
                to = dicts.wh[mov.warehouse_to_id] || 'Склад';
                break;
            case 'transfer':
                from = dicts.wh[mov.warehouse_from_id] || 'Склад';
                to = dicts.wh[mov.warehouse_to_id] || 'Склад';
                break;
            case 'writeoff':
                from = dicts.wh[mov.warehouse_from_id] || 'Склад';
                to = 'Списано';
                break;
            case 'reserve':
            case 'unreserve': {
                const obj = instLabel(mov.reservation?.installation_custom_id) || '—';
                if (mov.operation_type === 'reserve') {
                    from = dicts.wh[mov.warehouse_from_id] || 'Склад';
                    to = `Резерв під ${obj}`;
                } else {
                    from = `Резерв під ${obj}`;
                    to = dicts.wh[mov.warehouse_from_id] || 'Склад';
                }
                break;
            }
            case 'sale':
            case 'partner_transfer': {
                from = dicts.wh[mov.warehouse_from_id] || 'Склад';
                const cl = clientLabel(mov.client_id);
                const inst = instLabel(mov.installation_custom_id);
                to = cl && inst ? `${cl} · ${inst}` : cl || inst || 'Відвантаження';
                break;
            }
            default: break;
        }

        return { conf, nom, empName, from, to, doc: doc || 'Без документа' };
    }, [dicts, catPath, instLabel, clientLabel]);

    const rows = useMemo(() => movements.map(m => ({ ...m, ...buildRow(m) })), [movements, buildRow]);
    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    const returnableQty = useCallback((mov) => {
        if (!DISPATCH_TYPES.includes(mov.operation_type)) return 0;
        return Math.max(0, parseFloat(mov.quantity) - (returnedBySource[mov.id] || 0));
    }, [returnedBySource]);

    /* ---------------- ОПЦІЇ ФІЛЬТРІВ ---------------- */

    const clientOptions = useMemo(() => [
        { id: '', label: 'Усі контрагенти' },
        ...Object.entries(dicts.clients)
            .map(([id, c]) => ({ id, label: c.name }))
            .sort((a, b) => a.label.localeCompare(b.label, 'uk')),
    ], [dicts.clients]);

    const instOptions = useMemo(() => [
        { id: '', label: "Усі об'єкти" },
        ...Object.entries(dicts.inst)
            .map(([id, name]) => ({ id, label: `#${id} ${name}` }))
            .sort((a, b) => a.label.localeCompare(b.label, 'uk')),
    ], [dicts.inst]);

    const activeFilters = (typeFilter !== 'all' ? 1 : 0) + (period !== 'd30' ? 1 : 0)
        + (clientFilter ? 1 : 0) + (instFilter ? 1 : 0);

    const resetFilters = () => {
        setTypeFilter('all'); setPeriod('d30'); setMonthValue(thisMonthValue());
        setCustomFrom(''); setCustomTo(''); setClientFilter(''); setInstFilter('');
    };

    const periodHint = useMemo(() => {
        const { from, to } = periodRange(period, monthValue, customFrom, customTo);
        if (!from && !to) return 'за весь час';
        const f = from ? new Date(from).toLocaleDateString('uk-UA') : '…';
        const t = to ? new Date(to).toLocaleDateString('uk-UA') : 'сьогодні';
        return `${f} — ${t}`;
    }, [period, monthValue, customFrom, customTo]);

    /* ---------------- ЕКСПОРТ ---------------- */

    const exportExcel = async () => {
        try {
            let q = supabase.from('stock_movements').select(SELECT);
            q = applyFilters(q).order('operation_date', { ascending: false }).limit(3000);
            const { data, error } = await q;
            if (error) throw error;
            if (!data?.length) return toast('За цими фільтрами записів немає', 'error');

            const out = data.map(raw => {
                const m = { ...raw, ...buildRow(raw) };
                const d = new Date(m.operation_date || m.created_at);
                return {
                    'Дата': d.toLocaleDateString('uk-UA'),
                    'Час': d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
                    'Операція': m.conf.label,
                    'Назва товару': m.nom.fullName,
                    'SKU': m.nom.sku || '',
                    'Кількість': `${m.conf.sign}${num(m.quantity)}`,
                    'Од. вим.': m.nom.unitCode,
                    'Ціна': m.sale_price ? `${num(m.sale_price)} ${m.currency}` : '',
                    'Документ': m.doc,
                    'Звідки': m.from,
                    'Куди': m.to,
                    'Відповідальний': m.empName,
                    'Коментар': m.notes || '',
                };
            });

            const ws = XLSX.utils.json_to_sheet(out);
            ws['!cols'] = [{ wch: 11 }, { wch: 7 }, { wch: 14 }, { wch: 46 }, { wch: 14 },
            { wch: 11 }, { wch: 9 }, { wch: 14 }, { wch: 18 }, { wch: 26 }, { wch: 30 }, { wch: 18 }, { wch: 28 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Рух товарів');
            XLSX.writeFile(wb, `Рух_товарів_${new Date().toISOString().slice(0, 10)}.xlsx`);
            toast(`Вивантажено ${out.length} записів (${periodHint})`);
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    /* ---------------- ВИДАТКОВА НАКЛАДНА ---------------- */

    const openNote = async (mov) => {
        const ref = (mov.reference_document || '').trim();
        if (!ref) return toast('У цієї операції немає номера документа', 'error');

        setNoteLoadingId(mov.id);
        try {
            const { data, error } = await supabase.from('stock_movements')
                .select(`*, nomenclature:nomenclature(id, name, sku, category_id, unit:units(code, name))`)
                .eq('reference_document', ref).in('operation_type', DISPATCH_TYPES)
                .order('id', { ascending: true });
            if (error) throw error;

            const list = data?.length ? data : [mov];
            const first = list[0];
            const client = dicts.clients[first.client_id];
            const instName = dicts.inst[first.installation_custom_id];
            const priced = list.find(r => r.sale_price != null);
            const earliest = list.reduce((min, r) => {
                const d = r.operation_date || r.created_at;
                return (!min || d < min) ? d : min;
            }, null);

            setNoteDoc({
                number: ref, date: earliest, kind: first.operation_type,
                buyerName: client ? client.name : (instName ? `Об’єкт «${instName}»` : '—'),
                buyerPhone: client?.phone || null,
                buyerId: client ? client.customId : null,
                objectLabel: instLabel(first.installation_custom_id),
                warehouseName: dicts.wh[first.warehouse_from_id] || null,
                responsibleName: dicts.emp[first.performed_by || first.created_by] || null,
                currency: priced?.currency || null,
                exchangeRate: priced?.exchange_rate ? parseFloat(priced.exchange_rate) : null,
                notes: first.notes || null,
                items: list.map(r => {
                    const n = r.nomenclature;
                    return {
                        name: n ? `${catPath(n.category_id)} ${n.name}`.trim() : 'Товар',
                        sku: n?.sku || '',
                        unit: n?.unit?.code || n?.unit?.name || 'шт',
                        qty: parseFloat(r.quantity),
                        price: r.sale_price != null ? parseFloat(r.sale_price) : null,
                    };
                }),
            });
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setNoteLoadingId(null); }
    };

    /* ---------------- РЕДАГУВАННЯ ТА ПОВЕРНЕННЯ ---------------- */

    const toLocalInput = (iso) => {
        if (!iso) return '';
        const d = new Date(iso);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };

    const openEdit = (mov) => {
        setEditForm({
            reference_document: mov.reference_document || '',
            notes: mov.notes || '',
            operation_date: toLocalInput(mov.operation_date || mov.created_at),
            sale_price: mov.sale_price ?? '',
            currency: mov.currency || 'USD',
            exchange_rate: mov.exchange_rate ?? '',
        });
        setEditModal(mov);
    };

    const saveEdit = async () => {
        const mov = editModal;
        setBusy(true);
        try {
            const payload = {
                reference_document: editForm.reference_document.trim() || null,
                notes: editForm.notes.trim() || null,
                updated_by: employee?.id ?? null,
                updated_at: new Date().toISOString(),
            };
            if (editForm.operation_date) payload.operation_date = new Date(editForm.operation_date).toISOString();
            if (['sale', 'partner_transfer'].includes(mov.operation_type)) {
                payload.sale_price = editForm.sale_price === '' ? null : parseFloat(editForm.sale_price);
                payload.currency = editForm.currency;
                payload.exchange_rate = editForm.exchange_rate === '' ? null : parseFloat(editForm.exchange_rate);
            }
            const { error } = await supabase.from('stock_movements').update(payload).eq('id', mov.id);
            if (error) throw error;
            toast('Запис оновлено');
            setEditModal(null);
            loadMovements();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    const openReturn = (mov) => {
        const max = returnableQty(mov);
        setReturnForm({ quantity: String(max), reason: '' });
        setReturnModal({ mov, maxQty: max });
    };

    const doReturn = async () => {
        const { mov, maxQty } = returnModal;
        const qty = parseFloat(returnForm.quantity);
        if (!qty || qty <= 0) return toast('Введіть кількість більшу за 0', 'error');
        if (qty > maxQty) return toast(`Можна повернути не більше ${num(maxQty)}`, 'error');

        setBusy(true);
        try {
            const { data, error } = await supabase.rpc('return_movement', {
                p_source_movement_id: mov.id, p_qty: qty,
                p_reason: returnForm.reason.trim() || null, p_emp: employee?.id ?? null,
            });
            if (error) throw error;
            if (data?.ok === false) throw new Error(data.message || 'Повернення відхилено');
            toast(`Повернено ${num(qty)} ${mov.nom?.unitCode || ''}`);
            setReturnModal(null);
            loadMovements();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- ЧАСТИНИ ІНТЕРФЕЙСУ ---------------- */

    const OpChip = ({ conf }) => (
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${CHIP_TONE[conf.tone]}`}>
            <conf.icon size={9} />{conf.label}
        </span>
    );

    const Qty = ({ m, big }) => (
        <span className={`font-black tabular-nums ${big ? 'text-[15px]' : 'text-[13px]'} ${
            m.conf.sign === '+' ? 'text-emerald-700'
                : m.conf.sign === '−' ? 'text-rose-700' : 'text-slate-700'}`}>
            {m.conf.sign}{num(m.quantity)}
            <span className="text-[9px] font-bold text-slate-400 ml-0.5">{m.nom.unitCode}</span>
        </span>
    );

    const RowActions = ({ m, size = 'icon' }) => {
        const canReturn = returnableQty(m) > 0;
        const canNote = DISPATCH_TYPES.includes(m.operation_type) && !!m.reference_document;

        if (size === 'full') return (
            <div className="grid grid-cols-2 gap-2">
                <Btn variant="outline" icon={FaHistory}
                    onClick={() => { setHistoryItem({ id: m.nom.id, fullName: m.nom.fullName, unitName: m.nom.unitCode }); setSheetMov(null); }}>
                    Історія товару
                </Btn>
                <Btn variant="outline" icon={FaEdit} onClick={() => { openEdit(m); setSheetMov(null); }}>Редагувати</Btn>
                {canReturn && (
                    <Btn variant="softOk" icon={FaUndo} onClick={() => { openReturn(m); setSheetMov(null); }}>Повернути</Btn>
                )}
                {canNote && (
                    <Btn variant="soft" icon={FaFileInvoice} disabled={noteLoadingId === m.id}
                        onClick={() => { openNote(m); setSheetMov(null); }}>Накладна</Btn>
                )}
            </div>
        );

        return (
            <div className="flex items-center justify-end gap-0.5">
                {canReturn && <IconBtn variant="ghost" icon={FaUndo} label="Повернути" onClick={() => openReturn(m)} />}
                {canNote && <IconBtn variant="ghost" icon={FaFileInvoice} label="Видаткова накладна"
                    disabled={noteLoadingId === m.id} onClick={() => openNote(m)} />}
                <IconBtn variant="ghost" icon={FaEdit} label="Редагувати документ і коментар" onClick={() => openEdit(m)} />
            </div>
        );
    };

    /** Період + контрагент + об'єкт. Один блок для десктопа і для телефона. */
    const PeriodAndTargets = ({ stacked }) => (
        <>
            <div className={stacked ? 'space-y-2.5' : 'flex items-center gap-2'}>
                <select
                    value={period} onChange={e => setPeriod(e.target.value)}
                    className={`${T.select} ${stacked ? '' : 'w-40'} ${period !== 'd30' ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : ''}`}
                >
                    {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>

                {period === 'month' && (
                    <input
                        type="month" value={monthValue} onChange={e => setMonthValue(e.target.value)}
                        className={`${T.input} ${stacked ? '' : 'w-40'}`}
                    />
                )}

                {period === 'custom' && (
                    <div className={stacked ? 'grid grid-cols-2 gap-2' : 'flex items-center gap-2'}>
                        <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                            className={`${T.input} ${stacked ? '' : 'w-36'}`} />
                        <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                            className={`${T.input} ${stacked ? '' : 'w-36'}`} />
                    </div>
                )}

                <Picker
                    className={stacked ? '' : 'w-48'}
                    options={clientOptions} value={clientFilter}
                    onChange={v => setClientFilter(v)}
                    placeholder="Усі контрагенти" icon={FaUserTie}
                    searchPlaceholder="Почніть вводити назву…"
                />

                <Picker
                    className={stacked ? '' : 'w-48'}
                    options={instOptions} value={instFilter}
                    onChange={v => setInstFilter(v)}
                    placeholder="Усі об'єкти" icon={FaHardHat}
                    searchPlaceholder="Назва або номер…"
                />
            </div>
        </>
    );

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500 text-[13px]">Завантаження…</div>;

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <div className="flex flex-col h-full w-full gap-2.5">

            {/* ---------- ФІЛЬТРИ ---------- */}
            <Card pad="p-2.5" className="flex-none">
                <div className="flex items-center gap-2">
                    <select
                        value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                        className={`${T.select} flex-1 md:flex-none md:w-40 ${typeFilter !== 'all' ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : ''}`}
                    >
                        <option value="all">Всі операції</option>
                        {Object.entries(OP).map(([key, o]) => <option key={key} value={key}>{o.label}</option>)}
                    </select>

                    <Btn
                        variant={filtersOpen || activeFilters > 0 ? 'primary' : 'outline'}
                        icon={FaSlidersH} onClick={() => setFiltersOpen(v => !v)}
                        className="md:hidden flex-shrink-0"
                    >
                        {activeFilters > 0 ? String(activeFilters) : ''}
                    </Btn>

                    <div className="hidden md:flex items-center gap-2 flex-1">
                        <PeriodAndTargets />
                        {activeFilters > 0 && <Btn variant="softDanger" icon={FaTimes} onClick={resetFilters}>Скинути</Btn>}
                        <Btn variant="softOk" icon={FaFileExcel} className="ml-auto" onClick={exportExcel}>Excel</Btn>
                    </div>
                </div>

                {filtersOpen && (
                    <div className="md:hidden mt-2.5 pt-2.5 border-t border-slate-100 space-y-2.5">
                        <PeriodAndTargets stacked />
                        <div className="flex gap-2">
                            {activeFilters > 0 && (
                                <Btn variant="softDanger" icon={FaTimes} className="flex-1" onClick={resetFilters}>Скинути</Btn>
                            )}
                            <Btn variant="softOk" icon={FaFileExcel} className="flex-1" onClick={exportExcel}>Excel</Btn>
                        </div>
                    </div>
                )}

                {/* Явно кажемо, який діапазон зараз показано — щоб «нічого немає»
                    не сприймалось як втрата даних */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                    <span>Показано <b className="text-slate-800">{periodHint}</b></span>
                    {!loading && <span className="text-slate-300">·</span>}
                    {!loading && <span><b className="text-slate-800 tabular-nums">{totalCount}</b> записів</span>}
                    {period !== 'all' && (
                        <button onClick={() => setPeriod('all')}
                            className="ml-auto font-bold text-slate-500 hover:text-slate-900 transition-colors">
                            показати за весь час
                        </button>
                    )}
                </div>
            </Card>

            {/* ---------- ЖУРНАЛ ---------- */}
            <div className={`${T.card} flex-1 flex flex-col overflow-hidden min-h-0`}>
                {loading ? <Skeleton rows={10} /> : rows.length === 0 ? (
                    <EmptyState
                        icon={FaHistory}
                        title="Записів немає"
                        hint={`За період ${periodHint} операцій не знайдено. Розширте період або скиньте фільтри.`}
                    >
                        {period !== 'all' && <Btn variant="soft" onClick={() => setPeriod('all')}>Весь час</Btn>}
                        {activeFilters > 0 && <Btn variant="outline" onClick={resetFilters}>Скинути фільтри</Btn>}
                    </EmptyState>
                ) : isMobile ? (
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {rows.map(m => {
                            const d = new Date(m.operation_date || m.created_at);
                            return (
                                <button key={m.id} onClick={() => setSheetMov(m)}
                                    className="w-full text-left px-3 py-2.5 active:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-2 mb-1">
                                        <OpChip conf={m.conf} />
                                        <span className="text-[10.5px] text-slate-400 tabular-nums">
                                            {d.toLocaleDateString('uk-UA')} {d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        <span className="ml-auto"><Qty m={m} big /></span>
                                    </div>
                                    <div className="text-[13px] font-bold text-slate-900 leading-snug mb-1">{m.nom.fullName}</div>
                                    <div className="text-[11px] text-slate-500 leading-snug">
                                        {m.from} <span className="text-slate-300 mx-0.5">→</span> {m.to}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full border-collapse min-w-[980px]">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-slate-200">
                                    <th className={`${T.th} text-left w-24`}>Дата</th>
                                    <th className={`${T.th} text-left w-32`}>Операція</th>
                                    <th className={`${T.th} text-left`}>Товар</th>
                                    <th className={`${T.th} text-right w-24`}>К-сть</th>
                                    <th className={`${T.th} text-left w-[30%]`}>Маршрут</th>
                                    <th className={`${T.th} text-left w-32`}>Хто</th>
                                    <th className={`${T.th} text-right w-28`}></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map(m => {
                                    const d = new Date(m.operation_date || m.created_at);
                                    const returnable = returnableQty(m);
                                    const partly = DISPATCH_TYPES.includes(m.operation_type)
                                        && returnable > 0 && returnable < parseFloat(m.quantity);
                                    return (
                                        <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                                            <td className={`${T.td} whitespace-nowrap`}>
                                                <div className="font-semibold text-slate-800 tabular-nums">{d.toLocaleDateString('uk-UA')}</div>
                                                <div className="text-[10.5px] text-slate-400 tabular-nums">
                                                    {d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td className={T.td}><OpChip conf={m.conf} /></td>
                                            <td className={T.td}>
                                                <button
                                                    onClick={() => setHistoryItem({ id: m.nom.id, fullName: m.nom.fullName, unitName: m.nom.unitCode })}
                                                    className="text-left font-semibold text-slate-900 hover:text-indigo-700 hover:underline decoration-indigo-300 underline-offset-2"
                                                >
                                                    {m.nom.fullName}
                                                </button>
                                                {m.nom.sku && <span className={`${T.mono} ml-2`}>{m.nom.sku}</span>}
                                            </td>
                                            <td className={`${T.td} text-right whitespace-nowrap`}>
                                                <Qty m={m} />
                                                {partly && <div className="text-[9.5px] font-bold text-teal-600">повернено частково</div>}
                                            </td>
                                            <td className={T.td}>
                                                <div className="text-[12px] text-slate-700 leading-snug">
                                                    {m.from} <span className="text-slate-300">→</span> <b className="text-slate-900">{m.to}</b>
                                                </div>
                                                <div className="text-[10.5px] text-slate-400 truncate">
                                                    {m.doc}{m.notes ? ` · ${m.notes}` : ''}
                                                </div>
                                            </td>
                                            <td className={`${T.td} text-[12px] text-slate-500 truncate`}>{m.empName}</td>
                                            <td className={T.td}><RowActions m={m} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {!loading && totalCount > 0 && (
                <Pagination
                    page={currentPage} pages={totalPages} total={totalCount}
                    from={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                    to={Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}
                    onPage={setCurrentPage}
                />
            )}

            {/* ---------- ШУХЛЯДА ОПЕРАЦІЇ (телефон) ---------- */}
            <Modal
                isOpen={!!sheetMov} onClose={() => setSheetMov(null)}
                title={sheetMov?.nom.fullName || ''}
                subtitle={sheetMov ? `${sheetMov.conf.label} · ${new Date(sheetMov.operation_date || sheetMov.created_at).toLocaleString('uk-UA')}` : ''}
                size="sm"
            >
                {sheetMov && (
                    <div className="space-y-3">
                        <div className={`${T.inset} px-3 py-2.5 space-y-1.5`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11.5px] text-slate-500">Кількість</span>
                                <Qty m={sheetMov} big />
                            </div>
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-[11.5px] text-slate-500 flex-shrink-0">Маршрут</span>
                                <span className="text-[12px] text-slate-800 text-right">{sheetMov.from} → {sheetMov.to}</span>
                            </div>
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-[11.5px] text-slate-500 flex-shrink-0">Документ</span>
                                <span className="text-[12px] text-slate-800 text-right">{sheetMov.doc}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-[11.5px] text-slate-500">Провів</span>
                                <span className="text-[12px] text-slate-800">{sheetMov.empName}</span>
                            </div>
                            {sheetMov.notes && (
                                <div className="pt-1.5 border-t border-slate-200 text-[12px] text-slate-600 italic">{sheetMov.notes}</div>
                            )}
                        </div>
                        <RowActions m={sheetMov} size="full" />
                    </div>
                )}
            </Modal>

            {/* ---------- РЕДАГУВАННЯ ---------- */}
            <Modal
                isOpen={!!editModal} onClose={() => setEditModal(null)}
                title="Редагувати запис"
                subtitle={editModal ? `${editModal.conf.label} · ${editModal.nom.fullName}` : ''}
                size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setEditModal(null)}>Скасувати</Btn>
                    <Btn variant="accent" onClick={saveEdit} disabled={busy}>{busy ? 'Зберігаємо…' : 'Зберегти'}</Btn>
                </>}
            >
                {editModal && (
                    <div className="space-y-3">
                        <p className="text-[11.5px] text-slate-500 leading-relaxed">
                            Кількість і склади змінити не можна — для цього проведіть повернення
                            або нову операцію. Тут правляться лише документ, дата й коментар.
                        </p>
                        <Field label="Дата та час операції">
                            <input type="datetime-local" className={T.input} value={editForm.operation_date}
                                onChange={e => setEditForm(f => ({ ...f, operation_date: e.target.value }))} />
                        </Field>
                        <Field label="Документ">
                            <input className={T.input} placeholder="№ накладної" value={editForm.reference_document}
                                onChange={e => setEditForm(f => ({ ...f, reference_document: e.target.value }))} />
                        </Field>
                        {['sale', 'partner_transfer'].includes(editModal.operation_type) && (
                            <div className="grid grid-cols-3 gap-2">
                                <Field label="Ціна">
                                    <input type="number" step="any" className={T.input} value={editForm.sale_price}
                                        onChange={e => setEditForm(f => ({ ...f, sale_price: e.target.value }))} />
                                </Field>
                                <Field label="Валюта">
                                    <select className={T.select} value={editForm.currency}
                                        onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}>
                                        {['UAH', 'USD', 'EUR'].map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                                <Field label="Курс">
                                    <input type="number" step="any" className={T.input} value={editForm.exchange_rate}
                                        onChange={e => setEditForm(f => ({ ...f, exchange_rate: e.target.value }))} />
                                </Field>
                            </div>
                        )}
                        <Field label="Коментар">
                            <input className={T.input} value={editForm.notes}
                                onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                        </Field>
                    </div>
                )}
            </Modal>

            {/* ---------- ПОВЕРНЕННЯ ---------- */}
            <Modal
                isOpen={!!returnModal} onClose={() => setReturnModal(null)}
                title="Повернення на склад" subtitle={returnModal?.mov.nom.fullName}
                tone="ok" size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setReturnModal(null)}>Скасувати</Btn>
                    <Btn variant="ok" onClick={doReturn} disabled={busy}>{busy ? 'Проводимо…' : 'Повернути'}</Btn>
                </>}
            >
                {returnModal && (
                    <div className="space-y-3">
                        <div className={`${T.inset} px-3 py-2.5 text-[12.5px] text-slate-700 leading-relaxed`}>
                            Товар повернеться на склад <b>«{returnModal.mov.from}»</b>.
                            Доступно до повернення: <b className="text-emerald-700">
                                {num(returnModal.maxQty)} {returnModal.mov.nom.unitCode}</b>.
                        </div>
                        <Field label={`Кількість, ${returnModal.mov.nom.unitCode}`} required>
                            <input type="number" step="any" min="0" max={returnModal.maxQty} autoFocus={autoFocus}
                                className={`${T.input} text-lg font-black tabular-nums`}
                                value={returnForm.quantity}
                                onChange={e => setReturnForm(f => ({ ...f, quantity: e.target.value }))} />
                        </Field>
                        <Field label="Причина повернення">
                            <input className={T.input} placeholder="Напр. лишок після монтажу"
                                value={returnForm.reason}
                                onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))} />
                        </Field>
                    </div>
                )}
            </Modal>

            <DirectSaleModal
                isOpen={isSaleOpen} onClose={() => setIsSaleOpen(false)}
                onSuccess={() => { setIsSaleOpen(false); loadMovements(); }}
                showToast={toast}
            />

            <DeliveryNoteModal isOpen={!!noteDoc} doc={noteDoc} onClose={() => setNoteDoc(null)} />

            <ItemMovementHistoryModal
                isOpen={!!historyItem} onClose={() => setHistoryItem(null)}
                item={historyItem} warehouseId={null}
            />
        </div>
    );
}
