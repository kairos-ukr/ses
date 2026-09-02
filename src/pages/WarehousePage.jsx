// =====================================================================
//  Залишки складу.
//
//  Десктоп — щільна таблиця: рядок 40px замість 76px, тож на екран
//  влазить не 8 позицій, а понад 20. Колонка «Склади» показує розклад
//  по локаціях одразу в рядку — не треба нічого розгортати, щоб
//  зрозуміти, де саме лежить товар.
//
//  Телефон — список карток: знайшов позицію, тапнув, побачив усе
//  і зробив дію. Деталі відкриваються шухлядою знизу, під палець.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FaChevronDown, FaPlus, FaMinus, FaExchangeAlt, FaWarehouse, FaTimes,
    FaFileExcel, FaMapMarkerAlt, FaHardHat, FaEdit, FaBox, FaHistory,
    FaClipboardList, FaBoxes, FaLayerGroup, FaSlidersH, FaLock,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { NomenclatureModal } from './NomenclatureModal';
import ItemMovementHistoryModal from './ItemMovementHistoryModal';
import LotsPanel from './warehouse/LotsPanel';
import { printInventorySheet } from '../utils/inventorySheetPdf';
import {
    T, Btn, IconBtn, Chip, Card, Field, Segmented, EmptyState,
    Skeleton, Pagination, Modal, Metric, useToast, useConfirm,
    humanError, num, useIsMobile, useAutoFocus,
} from '../ui';

const EMPTY_BALANCE = Object.freeze({ onHand: 0, reserved: 0, available: 0 });
const round3 = (v) => Math.round((parseFloat(v) || 0) * 1000) / 1000;
const fileDateStr = () => new Date().toISOString().slice(0, 10);

const safeSheetName = (name, used) => {
    const base = (name || 'Склад').replace(/[\\/?*[\]:]/g, '-').trim().slice(0, 31) || 'Склад';
    let candidate = base, i = 2;
    while (used.has(candidate)) {
        const suffix = ` (${i})`;
        candidate = base.slice(0, 31 - suffix.length) + suffix;
        i += 1;
    }
    used.add(candidate);
    return candidate;
};

const ITEMS_PER_PAGE = 25;

export default function WarehousePage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const isMobile = useIsMobile();
    const autoFocus = useAutoFocus();   // на сенсорі клавіатура не вискакує сама

    // Дані
    const [items, setItems] = useState([]);
    const [categories, setCategories] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [balances, setBalances] = useState([]);
    const [loading, setLoading] = useState(true);

    // Фільтри
    const [warehouseFilter, setWarehouseFilter] = useState('all');
    const [stockMode, setStockMode] = useState('all');       // all | instock
    const [rootCategoryFilter, setRootCategoryFilter] = useState('');
    const [filtersOpen, setFiltersOpen] = useState(false);   // на телефоні фільтри згорнуті
    const [currentPage, setCurrentPage] = useState(1);

    // Розкриття
    const [expandedId, setExpandedId] = useState(null);      // десктоп: рядок
    const [sheetItem, setSheetItem] = useState(null);        // телефон: шухляда

    // Модалки
    const [whModal, setWhModal] = useState(false);
    const [whForm, setWhForm] = useState({ id: null, name: '', address: '', is_active: true });
    const [adjust, setAdjust] = useState(null);              // { op, item, whId, whName, qty, doc, note }
    const [reserveInfo, setReserveInfo] = useState(null);    // { item, loading, rows }
    const [nomModal, setNomModal] = useState({ open: false, item: null });
    const [history, setHistory] = useState(null);
    const [busy, setBusy] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [nomRes, catRes, whRes, balRes] = await Promise.all([
                supabase.from('nomenclature').select('*, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('*'),
                supabase.from('warehouses').select('*').order('name'),
                supabase.from('v_warehouse_stock_available').select('*'),
            ]);
            if (nomRes.error) throw nomRes.error;

            const cats = catRes.data || [];
            setCategories(cats);
            setWarehouses(whRes.data || []);
            setBalances(balRes.data || []);

            // Повний шлях категорії та її корінь — рахуємо один раз тут,
            // а не в кожному рендері
            const catById = new Map(cats.map(c => [c.id, c]));
            const walk = (startId) => {
                const path = [];
                let id = startId, root = startId, guard = 0;
                while (id && guard++ < 20) {
                    const c = catById.get(id);
                    if (!c) break;
                    path.unshift(c.name);
                    root = c.id;
                    id = c.parent_id;
                }
                return { path, root };
            };

            const processed = (nomRes.data || []).map(item => {
                const { path, root } = walk(item.category_id);
                return {
                    ...item,
                    fullName: `${path.join(' ')} ${item.name}`.trim(),
                    rootCategoryId: root,
                    isLot: item.tracking_mode === 'lot',
                };
            });

            setItems(processed.sort((a, b) => a.fullName.localeCompare(b.fullName, 'uk')));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

    const refreshBalances = useCallback(async () => {
        const { data } = await supabase.from('v_warehouse_stock_available').select('*');
        setBalances(data || []);
    }, []);

    // Сигнал «додати позицію» з оболонки складу
    const prevTrigger = useRef(externalActionTrigger);
    useEffect(() => {
        if (externalActionTrigger > prevTrigger.current) setNomModal({ open: true, item: null });
        prevTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    /* ---------------- ІНДЕКСИ ЗАЛИШКІВ ---------------- */

    const balanceMap = useMemo(() => {
        const m = new Map();
        (balances || []).forEach(b => m.set(`${b.nomenclature_id}:${b.warehouse_id}`, {
            onHand: round3(b.quantity_on_hand),
            reserved: round3(b.quantity_reserved),
            available: round3(b.quantity_available),
        }));
        return m;
    }, [balances]);

    const totalsMap = useMemo(() => {
        const m = new Map();
        (balances || []).forEach(b => {
            const cur = m.get(b.nomenclature_id) || { onHand: 0, reserved: 0, available: 0 };
            cur.onHand += parseFloat(b.quantity_on_hand || 0);
            cur.reserved += parseFloat(b.quantity_reserved || 0);
            cur.available += parseFloat(b.quantity_available || 0);
            m.set(b.nomenclature_id, cur);
        });
        m.forEach((v, k) => m.set(k, {
            onHand: round3(v.onHand), reserved: round3(v.reserved), available: round3(v.available),
        }));
        return m;
    }, [balances]);

    const totalsOf = useCallback(id => totalsMap.get(id) || EMPTY_BALANCE, [totalsMap]);
    const atWarehouse = useCallback((id, whId) => balanceMap.get(`${id}:${whId}`) || EMPTY_BALANCE, [balanceMap]);

    const activeWarehouses = useMemo(() => warehouses.filter(w => w.is_active), [warehouses]);
    const rootCategories = useMemo(
        () => categories.filter(c => c.parent_id === null && c.is_active),
        [categories]
    );

    const isScoped = warehouseFilter !== 'all';
    const scopedId = isScoped ? Number(warehouseFilter) : null;
    const scopedWh = isScoped ? warehouses.find(w => w.id === scopedId) : null;

    const shownBalance = useCallback(
        id => (isScoped ? atWarehouse(id, scopedId) : totalsOf(id)),
        [isScoped, scopedId, atWarehouse, totalsOf]
    );

    /** Розклад по складах — те, заради чого не треба нічого розгортати */
    const spread = useCallback((id) => activeWarehouses
        .map(w => ({ wh: w, bal: atWarehouse(id, w.id) }))
        .filter(x => x.bal.onHand !== 0 || x.bal.reserved !== 0),
        [activeWarehouses, atWarehouse]);

    /* ---------------- ФІЛЬТРАЦІЯ ---------------- */

    const filtered = useMemo(() => {
        const term = externalSearch.trim().toLowerCase();
        return items.filter(item => {
            if (term && !item.fullName.toLowerCase().includes(term)
                && !(item.sku && item.sku.toLowerCase().includes(term))) return false;
            if (rootCategoryFilter && item.rootCategoryId !== parseInt(rootCategoryFilter)) return false;
            if (stockMode === 'instock') {
                const b = shownBalance(item.id);
                if (b.onHand === 0 && b.reserved === 0) return false;
            }
            return true;
        });
    }, [items, externalSearch, rootCategoryFilter, stockMode, shownBalance]);

    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    const paged = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    useEffect(() => { setCurrentPage(1); setExpandedId(null); },
        [externalSearch, rootCategoryFilter, warehouseFilter, stockMode]);

    const pickWarehouse = (value) => {
        setWarehouseFilter(value);
        // Обрали конкретний склад — показуємо, що там лежить, а не весь довідник.
        // Перемикач лишається видимим, його можна повернути.
        setStockMode(value === 'all' ? 'all' : 'instock');
    };

    const activeFilterCount = (isScoped ? 1 : 0) + (rootCategoryFilter ? 1 : 0) + (stockMode === 'instock' ? 1 : 0);

    /* ---------------- ЕКСПОРТ ---------------- */

    const scopeText = () => {
        const parts = [isScoped ? `склад «${scopedWh?.name || scopedId}»` : 'усі склади'];
        const cat = rootCategories.find(c => String(c.id) === String(rootCategoryFilter));
        if (cat) parts.push(`категорія «${cat.name}»`);
        if (externalSearch.trim()) parts.push(`пошук «${externalSearch.trim()}»`);
        parts.push(stockMode === 'instock' ? 'лише позиції із залишком' : 'усі позиції номенклатури');
        return parts.join('; ');
    };

    const exportBalances = () => {
        if (!filtered.length) return toast('За цими фільтрами порожньо', 'error');
        const wb = XLSX.utils.book_new();
        const used = new Set();

        if (isScoped) {
            const rows = filtered.map(item => {
                const b = atWarehouse(item.id, scopedId);
                return {
                    'Найменування': item.fullName, 'SKU': item.sku || '',
                    'Од. вим.': item.unit?.name || 'шт',
                    'Фізично': b.onHand, 'У резерві': b.reserved, 'Вільно': b.available,
                };
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{ wch: 52 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(wb, ws, safeSheetName(scopedWh?.name, used));
        } else {
            const summary = filtered.map(item => {
                const t = totalsOf(item.id);
                return {
                    'Найменування': item.fullName, 'SKU': item.sku || '',
                    'Од. вим.': item.unit?.name || 'шт',
                    'Фізично (всього)': t.onHand, 'У резерві': t.reserved, 'Вільно': t.available,
                };
            });
            const wsS = XLSX.utils.json_to_sheet(summary);
            wsS['!cols'] = [{ wch: 52 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(wb, wsS, safeSheetName('Зведено', used));

            const rows = [];
            filtered.forEach(item => activeWarehouses.forEach(w => {
                const b = atWarehouse(item.id, w.id);
                if (b.onHand === 0 && b.reserved === 0) return;
                rows.push({
                    'Склад': w.name, 'Найменування': item.fullName, 'SKU': item.sku || '',
                    'Од. вим.': item.unit?.name || 'шт',
                    'Фізично': b.onHand, 'У резерві': b.reserved, 'Вільно': b.available,
                });
            }));
            const wsB = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Склад': '—', 'Найменування': 'Немає залишків' }]);
            wsB['!cols'] = [{ wch: 24 }, { wch: 52 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
            XLSX.utils.book_append_sheet(wb, wsB, safeSheetName('По складах', used));
        }

        const suffix = isScoped ? `_${(scopedWh?.name || '').replace(/\s+/g, '_')}` : '';
        XLSX.writeFile(wb, `Залишки${suffix}_${fileDateStr()}.xlsx`);
        toast('Файл залишків сформовано');
    };

    const exportInventory = async () => {
        const targets = isScoped ? (scopedWh ? [scopedWh] : []) : activeWarehouses;
        if (!targets.length) return toast('Немає складів для інвентаризації', 'error');

        const sections = targets.map(w => ({
            warehouse: { name: w.name, address: w.address },
            rows: filtered
                .map(item => ({ item, bal: atWarehouse(item.id, w.id) }))
                .filter(({ bal }) => stockMode === 'all' || bal.onHand !== 0 || bal.reserved !== 0)
                .map(({ item, bal }) => ({
                    sku: item.sku, name: item.fullName,
                    unit: item.unit?.name || 'шт', onHand: bal.onHand,
                })),
        })).filter(s => s.rows.length);

        if (!sections.length) return toast('За цими фільтрами порожньо', 'error');

        const total = sections.reduce((s, x) => s + x.rows.length, 0);
        const suffix = isScoped ? `_${(scopedWh?.name || '').replace(/\s+/g, '_')}` : '';

        setPdfBusy(true);
        try {
            toast(`${total} позицій — у діалозі оберіть «Зберегти як PDF»`, 'info');
            await printInventorySheet({
                sections, scopeText: scopeText(), compiledBy: employee?.name,
                docTitle: `Інвентаризація${suffix}_${fileDateStr()}`,
            });
        } catch (e) {
            toast(`Не вдалося сформувати документ: ${humanError(e)}`, 'error');
        } finally { setPdfBusy(false); }
    };

    /* ---------------- ОПЕРАЦІЇ ---------------- */

    const openAdjust = (item, wh, op) => setAdjust({
        op, item, whId: wh.id, whName: wh.name,
        qty: '', toId: '', doc: '', note: '',
    });

    const submitAdjust = async () => {
        const qty = parseFloat(adjust.qty);
        if (!qty || qty <= 0) return toast('Вкажіть кількість більшу за 0', 'error');
        if (adjust.op === 'transfer' && !adjust.toId) return toast('Оберіть склад призначення', 'error');

        if (adjust.op !== 'purchase') {
            const avail = atWarehouse(adjust.item.id, adjust.whId).available;
            if (qty > avail) return toast(`Вільно лише ${num(avail)} — більше не списати`, 'error');
        }
        if (adjust.op === 'writeoff' && !adjust.note.trim()) {
            return toast('Списання без причини не проводимо', 'error');
        }

        const unit = adjust.item.unit?.name || 'шт';
        const targetName = warehouses.find(w => String(w.id) === String(adjust.toId))?.name;
        const ok = await confirm({
            title: { purchase: 'Провести прихід?', writeoff: 'Списати?', transfer: 'Перемістити?' }[adjust.op],
            tone: adjust.op === 'writeoff' ? 'danger' : 'accent',
            confirmLabel: { purchase: 'Провести', writeoff: 'Списати', transfer: 'Перемістити' }[adjust.op],
            message: adjust.item.fullName,
            details: [
                `${num(qty)} ${unit}`,
                adjust.op === 'transfer'
                    ? `${adjust.whName} → ${targetName}`
                    : `${adjust.op === 'purchase' ? 'на склад' : 'зі складу'} ${adjust.whName}`,
                ...(adjust.note.trim() ? [`Причина: ${adjust.note.trim()}`] : []),
            ],
        });
        if (!ok) return;

        setBusy(true);
        try {
            const { error } = await supabase.from('stock_movements').insert([{
                operation_type: adjust.op,
                nomenclature_id: adjust.item.id,
                quantity: qty,
                warehouse_from_id: adjust.op !== 'purchase' ? adjust.whId : null,
                warehouse_to_id: adjust.op === 'transfer' ? Number(adjust.toId)
                    : adjust.op === 'purchase' ? adjust.whId : null,
                reference_document: adjust.doc.trim() || null,
                notes: adjust.note.trim() || null,
                performed_by: employee?.id, created_by: employee?.id,
            }]);
            if (error) throw error;
            toast('Операцію проведено');
            setAdjust(null);
            await refreshBalances();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    const openReserves = async (item) => {
        setReserveInfo({ item, loading: true, rows: [] });
        try {
            let q = supabase.from('reservations')
                .select('id, warehouse_id, reserved_quantity, released_quantity, notes, created_at, installation:installations(name)')
                .eq('nomenclature_id', item.id).eq('status', 'active');
            if (isScoped) q = q.eq('warehouse_id', scopedId);
            const { data, error } = await q;
            if (error) throw error;
            const rows = (data || [])
                .map(r => ({
                    ...r,
                    whName: warehouses.find(w => w.id === r.warehouse_id)?.name || '—',
                    qty: parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity),
                }))
                .filter(r => r.qty > 0);
            setReserveInfo(prev => ({ ...prev, loading: false, rows }));
        } catch (e) {
            toast(humanError(e), 'error');
            setReserveInfo(null);
        }
    };

    const saveWarehouse = async (e) => {
        e.preventDefault();
        if (!whForm.name.trim()) return toast('Введіть назву складу', 'error');
        setBusy(true);
        try {
            const payload = {
                name: whForm.name.trim(), address: whForm.address.trim() || null,
                is_active: whForm.is_active, updated_by: employee?.id,
            };
            const { error } = whForm.id
                ? await supabase.from('warehouses').update(payload).eq('id', whForm.id)
                : await supabase.from('warehouses').insert([{ ...payload, created_by: employee?.id }]);
            if (error) throw error;
            toast(whForm.id ? 'Склад оновлено' : 'Склад створено');
            setWhForm({ id: null, name: '', address: '', is_active: true });
            await loadData();
        } catch (e2) {
            toast(humanError(e2), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- ЧАСТИНИ ІНТЕРФЕЙСУ ---------------- */

    const unitOf = (item) => item.unit?.name || 'шт';

    /** Розклад по складах у рядку таблиці — компактні бейджі */
    const SpreadBadges = ({ item, max = 3 }) => {
        const list = spread(item.id);
        if (!list.length) return <span className="text-[11px] text-slate-300">—</span>;
        const shown = list.slice(0, max);
        return (
            <span className="inline-flex items-center gap-1 flex-wrap">
                {shown.map(({ wh, bal }) => (
                    <span
                        key={wh.id}
                        title={`${wh.name}: фізично ${num(bal.onHand)}, резерв ${num(bal.reserved)}`}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap
                            ${isScoped && wh.id === scopedId
                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                : 'bg-slate-50 border-slate-200 text-slate-600'}`}
                    >
                        {wh.name}
                        <b className="tabular-nums text-slate-900">{num(bal.onHand)}</b>
                        {bal.reserved > 0 && <span className="text-amber-600 tabular-nums">·{num(bal.reserved)}</span>}
                    </span>
                ))}
                {list.length > max && (
                    <span className="text-[10px] font-bold text-slate-400">+{list.length - max}</span>
                )}
            </span>
        );
    };

    /** Дії над позицією на конкретному складі */
    const WarehouseActions = ({ item, wh }) => (
        <div className="flex items-center gap-1">
            <IconBtn variant="ghost" icon={FaHistory} label={`Рух по складу «${wh.name}»`}
                onClick={() => setHistory({ item, warehouseId: wh.id })} />
            <IconBtn variant="softOk" icon={FaPlus} label="Ручний прихід"
                onClick={() => openAdjust(item, wh, 'purchase')} />
            <IconBtn variant="softDanger" icon={FaMinus} label="Списання"
                onClick={() => openAdjust(item, wh, 'writeoff')} />
            {activeWarehouses.length > 1 && (
                <IconBtn variant="soft" icon={FaExchangeAlt} label="Переміщення"
                    onClick={() => openAdjust(item, wh, 'transfer')} />
            )}
        </div>
    );

    /** Деталі позиції: розклад по складах + носії. Один блок для десктопа й телефона. */
    const ItemDetails = ({ item }) => {
        const list = isScoped
            ? activeWarehouses.filter(w => w.id === scopedId)
            : activeWarehouses;

        return (
            <div className="space-y-2">
                {list.map(wh => {
                    const bal = atWarehouse(item.id, wh.id);
                    return (
                        <div key={wh.id} className={`${T.cardFlat} px-3 py-2.5`}>
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                <FaMapMarkerAlt className="text-slate-400" size={11} />
                                <span className="text-[12.5px] font-bold text-slate-800">{wh.name}</span>
                                {isScoped && wh.id === scopedId && <Chip tone="accent">обраний</Chip>}
                                <div className="ml-auto flex items-center gap-3">
                                    <Metric label="Фізично" value={num(bal.onHand)} />
                                    <Metric label="Резерв" value={num(bal.reserved)} tone={bal.reserved > 0 ? 'warn' : 'neutral'} />
                                    <Metric label="Вільно" value={num(bal.available)} tone={bal.available > 0 ? 'ok' : 'danger'} />
                                </div>
                            </div>

                            <div className="flex items-center justify-end">
                                <WarehouseActions item={item} wh={wh} />
                            </div>

                            {item.isLot && (
                                <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                                    <LotsPanel
                                        item={item}
                                        warehouseId={wh.id}
                                        warehouses={warehouses}
                                        onChanged={refreshBalances}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500 text-[13px]">Завантаження…</div>;

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <div className="flex flex-col h-full w-full gap-2.5">

            {/* ---------- ФІЛЬТРИ ---------- */}
            <Card pad="p-2.5" className="flex-none">
                {/* Один рядок: селекти зліва фіксованої ширини, дії — притиснуті вправо.
                    Без flex-1 на селектах, інакше склад роздувається на пів екрана,
                    а категорія стискається до «Кабе…» */}
                <div className="flex items-center gap-2">
                    <select
                        value={warehouseFilter}
                        onChange={e => pickWarehouse(e.target.value)}
                        className={`${T.select} flex-1 md:flex-none md:w-56 min-w-0 ${isScoped ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : ''}`}
                    >
                        <option value="all">Усі склади (зведено)</option>
                        {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        {warehouses.filter(w => !w.is_active).map(w =>
                            <option key={w.id} value={w.id}>{w.name} — неактивний</option>)}
                    </select>

                    <select
                        value={rootCategoryFilter}
                        onChange={e => setRootCategoryFilter(e.target.value)}
                        className={`${T.select} hidden md:block md:w-48 flex-none ${rootCategoryFilter ? 'bg-indigo-50 border-indigo-300 text-indigo-800' : ''}`}
                    >
                        <option value="">Всі категорії</option>
                        {rootCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>

                    <Segmented
                        className="hidden md:inline-flex flex-none"
                        value={stockMode}
                        onChange={setStockMode}
                        options={[
                            { value: 'instock', label: 'Із залишком' },
                            { value: 'all', label: 'Усі позиції' },
                        ]}
                    />

                    <Btn
                        variant={filtersOpen || activeFilterCount > 1 ? 'primary' : 'outline'}
                        icon={FaSlidersH}
                        onClick={() => setFiltersOpen(v => !v)}
                        className="md:hidden flex-none"
                    >
                        {activeFilterCount > 1 ? activeFilterCount - 1 : ''}
                    </Btn>

                    {/* Дії. На вузькому десктопі згортаються в іконки, щоб не тиснути фільтри */}
                    <div className="hidden md:flex items-center gap-1.5 ml-auto flex-none">
                        <Btn variant="outline" icon={FaWarehouse} onClick={() => setWhModal(true)}>
                            <span className="hidden xl:inline">Склади</span>
                        </Btn>
                        <Btn variant="softOk" icon={FaFileExcel} onClick={exportBalances}>
                            <span className="hidden xl:inline">Excel</span>
                        </Btn>
                        <Btn variant="softWarn" icon={FaClipboardList} onClick={exportInventory} disabled={pdfBusy}>
                            <span className="hidden lg:inline">{pdfBusy ? 'Готуємо…' : 'Інвентаризація'}</span>
                        </Btn>
                    </div>
                </div>

                {/* Телефон: розгорнуті фільтри */}
                {filtersOpen && (
                    <div className="md:hidden mt-2.5 pt-2.5 border-t border-slate-100 space-y-2.5">
                        <select
                            value={rootCategoryFilter}
                            onChange={e => setRootCategoryFilter(e.target.value)}
                            className={T.select}
                        >
                            <option value="">Всі категорії</option>
                            {rootCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <Segmented
                            className="w-full"
                            value={stockMode}
                            onChange={setStockMode}
                            options={[
                                { value: 'instock', label: 'Із залишком' },
                                { value: 'all', label: 'Усі позиції' },
                            ]}
                        />
                        <div className="grid grid-cols-3 gap-1.5">
                            <Btn variant="outline" icon={FaWarehouse} onClick={() => setWhModal(true)}>Склади</Btn>
                            <Btn variant="softOk" icon={FaFileExcel} onClick={exportBalances}>Excel</Btn>
                            <Btn variant="softWarn" icon={FaClipboardList} onClick={exportInventory} disabled={pdfBusy}>
                                Відомість
                            </Btn>
                        </div>
                    </div>
                )}

                {isScoped && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-2">
                        <FaMapMarkerAlt className="text-indigo-500 flex-shrink-0" size={11} />
                        <span className="text-[12px] font-bold text-slate-800 truncate">{scopedWh?.name}</span>
                        {scopedWh?.address && <span className="text-[11px] text-slate-400 truncate hidden sm:inline">{scopedWh.address}</span>}
                        <button
                            onClick={() => pickWarehouse('all')}
                            className="ml-auto text-[11px] font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 flex-shrink-0"
                        >
                            <FaTimes size={9} /> усі склади
                        </button>
                    </div>
                )}
            </Card>

            {/* ---------- СПИСОК ---------- */}
            <div className={`${T.card} flex-1 flex flex-col overflow-hidden min-h-0`}>
                {loading ? <Skeleton rows={8} /> : paged.length === 0 ? (
                    <EmptyState
                        icon={FaBoxes}
                        title={isScoped && stockMode === 'instock'
                            ? `На складі «${scopedWh?.name}» порожньо`
                            : 'Нічого не знайдено'}
                        hint={isScoped && stockMode === 'instock'
                            ? 'Тут немає позицій із залишком за поточними фільтрами.'
                            : 'Спробуйте змінити фільтри або пошуковий запит.'}
                    >
                        {stockMode === 'instock' && (
                            <Btn variant="soft" onClick={() => setStockMode('all')}>Показати всі позиції</Btn>
                        )}
                        <Btn variant="accent" icon={FaPlus} onClick={() => setNomModal({ open: true, item: null })}>
                            Додати позицію
                        </Btn>
                    </EmptyState>
                ) : isMobile ? (
                    /* ---------- ТЕЛЕФОН: КАРТКИ ---------- */
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {paged.map(item => {
                            const b = shownBalance(item.id);
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setSheetItem(item)}
                                    className="w-full text-left px-3 py-2.5 active:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-start gap-2 mb-1.5">
                                        <span className="text-[13px] font-bold text-slate-900 leading-snug flex-1">
                                            {item.fullName}
                                        </span>
                                        <span className="text-[15px] font-black tabular-nums text-slate-900 flex-shrink-0">
                                            {num(b.onHand)}
                                            <span className="text-[9px] font-bold text-slate-400 ml-0.5">{unitOf(item)}</span>
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {item.isLot && <Chip tone="info" icon={FaLayerGroup}>{item.lot_unit_name || 'бухти'}</Chip>}
                                        {b.reserved > 0 && <Chip tone="warn" icon={FaLock}>резерв {num(b.reserved)}</Chip>}
                                        <Chip tone={b.available > 0 ? 'ok' : 'danger'}>вільно {num(b.available)}</Chip>
                                        {!isScoped && <SpreadBadges item={item} max={2} />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    /* ---------- ДЕСКТОП: ЩІЛЬНА ТАБЛИЦЯ ---------- */
                    <div className="flex-1 overflow-auto custom-scrollbar">
                        <table className="w-full border-collapse min-w-[880px]">
                            <thead className="sticky top-0 z-10">
                                <tr className="border-b border-slate-200">
                                    <th className={`${T.th} text-left`}>Товар</th>
                                    <th className={`${T.th} text-left w-[26%]`}>
                                        {isScoped ? `На складі «${scopedWh?.name}»` : 'Розклад по складах'}
                                    </th>
                                    <th className={`${T.th} text-right w-20`}>Фізично</th>
                                    <th className={`${T.th} text-right w-20`}>Резерв</th>
                                    <th className={`${T.th} text-right w-20`}>Вільно</th>
                                    <th className={`${T.th} text-right w-24`}></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {paged.map(item => {
                                    const b = shownBalance(item.id);
                                    const t = totalsOf(item.id);
                                    const open = expandedId === item.id;
                                    return (
                                        <React.Fragment key={item.id}>
                                            <tr className={`hover:bg-slate-50 transition-colors ${open ? 'bg-indigo-50/40' : ''}`}>
                                                <td className={T.td}>
                                                    <button
                                                        onClick={() => setHistory({ item, warehouseId: isScoped ? scopedId : null })}
                                                        title="Історія руху товару"
                                                        className="text-left group"
                                                    >
                                                        <span className="font-semibold text-slate-900 group-hover:text-indigo-700 group-hover:underline decoration-indigo-300 underline-offset-2">
                                                            {item.fullName}
                                                        </span>
                                                    </button>
                                                    <span className="inline-flex items-center gap-1.5 ml-2 align-middle">
                                                        {item.sku && <span className={T.mono}>{item.sku}</span>}
                                                        {item.isLot && <Chip tone="info" icon={FaLayerGroup}>{item.lot_unit_name || 'бухти'}</Chip>}
                                                    </span>
                                                </td>

                                                <td className={T.td}><SpreadBadges item={item} /></td>

                                                <td className={`${T.td} text-right`}>
                                                    <span className={T.num}>{num(b.onHand)}</span>
                                                    <span className="text-[9px] text-slate-400 ml-0.5">{unitOf(item)}</span>
                                                    {isScoped && t.onHand !== b.onHand && (
                                                        <div className="text-[9.5px] text-slate-400 tabular-nums">усього {num(t.onHand)}</div>
                                                    )}
                                                </td>

                                                <td className={`${T.td} text-right`}>
                                                    {b.reserved > 0 ? (
                                                        <button onClick={() => openReserves(item)}
                                                            className="font-black tabular-nums text-amber-700 hover:underline decoration-amber-400 underline-offset-2">
                                                            {num(b.reserved)}
                                                        </button>
                                                    ) : <span className="text-slate-300">—</span>}
                                                </td>

                                                <td className={`${T.td} text-right`}>
                                                    <span className={`font-black tabular-nums ${b.available > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                        {num(b.available)}
                                                    </span>
                                                </td>

                                                <td className={`${T.td} text-right whitespace-nowrap`}>
                                                    <IconBtn variant="ghost" icon={FaEdit} label="Редагувати позицію"
                                                        onClick={() => setNomModal({ open: true, item })} />
                                                    {item.isLot ? (
                                                        <Btn
                                                            size="sm"
                                                            variant={open ? 'accent' : 'outline'}
                                                            icon={FaLayerGroup}
                                                            className="ml-1"
                                                            onClick={() => setExpandedId(open ? null : item.id)}
                                                        >
                                                            {item.lot_unit_name === 'бухта' ? 'Бухти' : 'Носії'}
                                                        </Btn>
                                                    ) : (
                                                        <IconBtn
                                                            variant={open ? 'accent' : 'outline'}
                                                            icon={FaChevronDown}
                                                            label={open ? 'Згорнути' : 'Розгорнути: склади та операції'}
                                                            className={`ml-1 ${open ? 'rotate-180' : ''} transition-transform`}
                                                            onClick={() => setExpandedId(open ? null : item.id)}
                                                        />
                                                    )}
                                                </td>
                                            </tr>

                                            {open && (
                                                <tr>
                                                    <td colSpan={6} className="p-0 bg-slate-50 border-b border-slate-200">
                                                        <div className="p-2.5"><ItemDetails item={item} /></div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {!loading && filtered.length > 0 && (
                <Pagination
                    page={currentPage} pages={totalPages} total={filtered.length}
                    from={(currentPage - 1) * ITEMS_PER_PAGE + 1}
                    to={Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                    onPage={setCurrentPage}
                />
            )}

            {/* ---------- ШУХЛЯДА ПОЗИЦІЇ (телефон) ---------- */}
            <Modal
                isOpen={!!sheetItem}
                onClose={() => setSheetItem(null)}
                title={sheetItem?.fullName || ''}
                subtitle={sheetItem?.sku ? `SKU ${sheetItem.sku}` : undefined}
                size="md"
                footer={<>
                    <Btn variant="outline" icon={FaHistory}
                        onClick={() => { setHistory({ item: sheetItem, warehouseId: isScoped ? scopedId : null }); setSheetItem(null); }}>
                        Історія
                    </Btn>
                    <Btn variant="soft" icon={FaEdit}
                        onClick={() => { setNomModal({ open: true, item: sheetItem }); setSheetItem(null); }}>
                        Редагувати
                    </Btn>
                </>}
            >
                {sheetItem && <ItemDetails item={sheetItem} />}
            </Modal>

            {/* ---------- РУЧНА ОПЕРАЦІЯ ---------- */}
            <Modal
                isOpen={!!adjust}
                onClose={() => setAdjust(null)}
                title={{ purchase: 'Ручний прихід', writeoff: 'Списання', transfer: 'Переміщення' }[adjust?.op] || ''}
                subtitle={adjust?.item.fullName}
                tone={adjust?.op === 'purchase' ? 'ok' : adjust?.op === 'writeoff' ? 'danger' : 'accent'}
                size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setAdjust(null)}>Скасувати</Btn>
                    <Btn
                        variant={adjust?.op === 'purchase' ? 'ok' : adjust?.op === 'writeoff' ? 'danger' : 'accent'}
                        onClick={submitAdjust} disabled={busy}
                    >
                        {busy ? 'Проводимо…' : 'Провести'}
                    </Btn>
                </>}
            >
                {adjust && (
                    <div className="space-y-3">
                        <div className={`${T.inset} px-3 py-2 flex items-center gap-2 text-[12.5px]`}>
                            <FaWarehouse className="text-slate-400" size={12} />
                            <span className="text-slate-500">{adjust.op === 'purchase' ? 'Прихід на' : 'Зі складу'}</span>
                            <b className="text-slate-900">{adjust.whName}</b>
                            <span className="ml-auto text-slate-500">
                                вільно <b className="text-slate-900 tabular-nums">
                                    {num(atWarehouse(adjust.item.id, adjust.whId).available)}
                                </b>
                            </span>
                        </div>

                        {adjust.op === 'transfer' && (
                            <Field label="Куди переміщуємо" required>
                                <select className={T.select} value={adjust.toId}
                                    onChange={e => setAdjust({ ...adjust, toId: e.target.value })}>
                                    <option value="">Оберіть склад…</option>
                                    {activeWarehouses.filter(w => w.id !== adjust.whId)
                                        .map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </Field>
                        )}

                        <Field label={`Кількість, ${unitOf(adjust.item)}`} required>
                            <input type="number" min="0" step="any" inputMode="decimal" autoFocus={autoFocus}
                                className={`${T.input} text-lg font-black tabular-nums`} placeholder="0"
                                value={adjust.qty}
                                onChange={e => setAdjust({ ...adjust, qty: e.target.value })} />
                        </Field>

                        <div className="grid grid-cols-2 gap-2.5">
                            <Field label="Документ">
                                <input className={T.input} placeholder="№ акту"
                                    value={adjust.doc}
                                    onChange={e => setAdjust({ ...adjust, doc: e.target.value })} />
                            </Field>
                            <Field label={adjust.op === 'writeoff' ? 'Причина' : 'Коментар'}
                                required={adjust.op === 'writeoff'}>
                                <input className={T.input} placeholder={adjust.op === 'writeoff' ? 'Обов’язково' : 'Необов’язково'}
                                    value={adjust.note}
                                    onChange={e => setAdjust({ ...adjust, note: e.target.value })} />
                            </Field>
                        </div>
                    </div>
                )}
            </Modal>

            {/* ---------- ДЕТАЛІ РЕЗЕРВУ ---------- */}
            <Modal
                isOpen={!!reserveInfo}
                onClose={() => setReserveInfo(null)}
                title="Під які об'єкти зарезервовано"
                subtitle={reserveInfo?.item.fullName}
                tone="warn"
                size="md"
            >
                {reserveInfo?.loading ? <Skeleton rows={3} /> : !reserveInfo?.rows.length ? (
                    <p className="text-[13px] text-slate-500 text-center py-6">Активних резервів немає.</p>
                ) : (
                    <div className="space-y-1.5">
                        {reserveInfo?.rows.map(r => (
                            <div key={r.id} className={`${T.cardFlat} px-3 py-2 flex items-center gap-3`}>
                                <FaHardHat className="text-slate-400 flex-shrink-0" size={12} />
                                <div className="min-w-0 flex-1">
                                    <div className="text-[12.5px] font-bold text-slate-900 truncate">
                                        {r.installation?.name || "Невідомий об'єкт"}
                                    </div>
                                    <div className="text-[10.5px] text-slate-400">
                                        {r.whName} · {new Date(r.created_at).toLocaleDateString('uk-UA')}
                                    </div>
                                </div>
                                <span className="text-[15px] font-black tabular-nums text-amber-600 flex-shrink-0">{num(r.qty)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>

            {/* ---------- ДОВІДНИК СКЛАДІВ ---------- */}
            <Modal
                isOpen={whModal}
                onClose={() => { setWhModal(false); setWhForm({ id: null, name: '', address: '', is_active: true }); }}
                title="Довідник складів"
                size="lg"
            >
                <div className="grid md:grid-cols-2 gap-5">
                    <form onSubmit={saveWarehouse} className="space-y-3">
                        <div className={T.label}>{whForm.id ? 'Редагувати склад' : 'Новий склад'}</div>
                        <Field label="Назва" required>
                            <input className={T.input} required value={whForm.name}
                                onChange={e => setWhForm({ ...whForm, name: e.target.value })}
                                placeholder="Напр. Склад Острог" />
                        </Field>
                        <Field label="Адреса">
                            <input className={T.input} value={whForm.address}
                                onChange={e => setWhForm({ ...whForm, address: e.target.value })}
                                placeholder="Місто, вулиця…" />
                        </Field>
                        <label className={`${T.inset} px-3 py-2.5 flex items-center gap-2 cursor-pointer`}>
                            <input type="checkbox" checked={whForm.is_active}
                                onChange={e => setWhForm({ ...whForm, is_active: e.target.checked })}
                                className="w-4 h-4 rounded text-indigo-600" />
                            <span className="text-[12.5px] font-bold text-slate-700">Активний склад</span>
                        </label>
                        <div className="flex gap-2">
                            {whForm.id && (
                                <Btn variant="soft" className="flex-1"
                                    onClick={() => setWhForm({ id: null, name: '', address: '', is_active: true })}>
                                    Новий
                                </Btn>
                            )}
                            <button type="submit" disabled={busy}
                                className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[12.5px] disabled:opacity-50 transition-colors">
                                {busy ? '…' : 'Зберегти'}
                            </button>
                        </div>
                    </form>

                    <div className="md:border-l md:border-slate-200 md:pl-5">
                        <div className={`${T.label} mb-2`}>Наявні склади</div>
                        <div className="space-y-1.5 sm:max-h-72 sm:overflow-y-auto">
                            {warehouses.map(w => (
                                <div key={w.id}
                                    className={`${T.cardFlat} px-3 py-2 flex items-center gap-2 ${w.is_active ? '' : 'opacity-55'}`}>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[12.5px] font-bold text-slate-900 truncate">{w.name}</div>
                                        {w.address && <div className="text-[10.5px] text-slate-400 truncate">{w.address}</div>}
                                    </div>
                                    <IconBtn variant="softOk" icon={FaBox} label="Переглянути залишки"
                                        onClick={() => { pickWarehouse(String(w.id)); setWhModal(false); }} />
                                    <IconBtn variant="ghost" icon={FaEdit} label="Редагувати"
                                        onClick={() => setWhForm({ id: w.id, name: w.name, address: w.address || '', is_active: w.is_active })} />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            <NomenclatureModal
                isOpen={nomModal.open}
                onClose={() => setNomModal({ open: false, item: null })}
                onSuccess={loadData}
                showToast={toast}
                editingItem={nomModal.item}
            />

            <ItemMovementHistoryModal
                isOpen={!!history}
                onClose={() => setHistory(null)}
                item={history ? { ...history.item, unitName: unitOf(history.item) } : null}
                warehouseId={history?.warehouseId || null}
            />
        </div>
    );
}
