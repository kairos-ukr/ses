// =====================================================================
//  Забезпечення об'єктів.
//
//  Відповідає на одне питання: чи можна виїжджати на об'єкт.
//  По кожній позиції специфікації видно смугу покриття — скільки вже
//  видано, скільки в резерві, скільки в дорозі і чого бракує.
//
//  Замість шести однакових плиток із цифрами — одна смуга й одна
//  головна дія. Решта дій живе в аркуші, який відкривається однаково
//  і мишею, і пальцем.
//
//  Окремо розрізняємо «дефіцит» і «недовидачу»: якщо частину вже
//  возили, це не брак матеріалу, а незавершена видача.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FaSearch, FaChevronLeft, FaExclamationTriangle, FaHardHat, FaBoxOpen,
    FaLock, FaUnlock, FaArrowUp, FaUndo, FaClipboardList, FaShoppingCart,
    FaTrash, FaEllipsisH, FaTruck, FaLayerGroup,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import Layout from '../Layout';
import { useAuth } from '../AuthProvider';
import ManualSpecBuilder from './ManualSpecBuilder';
import {
    T, TONE, Btn, IconBtn, Chip, Card, Field, Bar, EmptyState,
    Skeleton, Modal, useToast, useConfirm, humanError, num, useAutoFocus,
} from '../ui';

const OPS = {
    reserve: { label: 'Зарезервувати', short: 'Резерв', icon: FaLock, tone: 'accent', variant: 'accent' },
    issue: { label: 'Видати на об’єкт', short: 'Видати', icon: FaArrowUp, tone: 'ok', variant: 'ok' },
    unreserve: { label: 'Зняти резерв', short: 'Зняти резерв', icon: FaUnlock, tone: 'neutral', variant: 'soft' },
    return: { label: 'Повернути на склад', short: 'Повернути', icon: FaUndo, tone: 'warn', variant: 'softWarn' },
};

const REQ_STATUS = {
    requested: { label: 'Потрібно замовити', tone: 'warn' },
    ordered: { label: 'Замовлено', tone: 'info' },
    stock_confirmed: { label: 'Є на складі', tone: 'ok' },
    done: { label: 'Закрито', tone: 'neutral' },
    rejected: { label: 'Відхилено', tone: 'danger' },
};

/* Позиція без жодного руху — це не помилка, а нулі */
const EMPTY = Object.freeze({ onHand: 0, reserved: 0, available: 0 });

const FILTERS = [
    { value: 'all', label: 'Всі' },
    { value: 'deficit', label: 'Дефіцит' },
    { value: 'waiting', label: 'В дорозі' },
    { value: 'ready', label: 'Готові' },
    { value: 'nospec', label: 'Без специфікації' },
];

export default function ProvisioningPage() {
    const { employee, loading: authLoading } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const autoFocus = useAutoFocus();

    const [installations, setInstallations] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [nomIndex, setNomIndex] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const [selected, setSelected] = useState(null);
    const [needs, setNeeds] = useState([]);
    const [stockRows, setStockRows] = useState([]);
    const [reservations, setReservations] = useState([]);
    const [incoming, setIncoming] = useState({});
    const [offSpec, setOffSpec] = useState([]);
    const [requests, setRequests] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);

    const [sheet, setSheet] = useState(null);
    const [op, setOp] = useState(null);
    const [reqModal, setReqModal] = useState(null);
    const [manualOpen, setManualOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    /* ---------------- ДАШБОРД ---------------- */

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const [instRes, needsRes, whRes, incRes, reqRes] = await Promise.all([
                supabase.from('installations')
                    .select('custom_id, name, status, client:clients(name, company_name)')
                    // on_hold теж показуємо: об'єкт на паузі не має зникати зі складу
                    .in('status', ['planning', 'in_progress', 'pending', 'on_hold'])
                    .order('created_at', { ascending: false }),
                supabase.from('v_object_material_needs').select('*'),
                supabase.from('warehouses').select('id, name, is_active').order('name'),
                supabase.from('v_object_incoming').select('*'),
                supabase.from('procurement_requests').select('installation_custom_id').eq('status', 'requested'),
            ]);
            if (instRes.error) throw instRes.error;
            if (needsRes.error) throw needsRes.error;

            setWarehouses(whRes.data || []);

            // «В дорозі» рахує база. Якщо в'юхи ще немає — просто нулі.
            const inc = {};
            (incRes.data || []).forEach(r => {
                if (!inc[r.installation_custom_id]) inc[r.installation_custom_id] = {};
                inc[r.installation_custom_id][r.nomenclature_id] = parseFloat(r.incoming_quantity);
            });

            const reqCount = {};
            (reqRes.data || []).forEach(r => {
                reqCount[r.installation_custom_id] = (reqCount[r.installation_custom_id] || 0) + 1;
            });

            const byObject = new Map();
            (needsRes.data || []).forEach(n => {
                const k = String(n.installation_custom_id);
                if (!byObject.has(k)) byObject.set(k, []);
                byObject.get(k).push(n);
            });

            setInstallations((instRes.data || []).map(inst => {
                const list = byObject.get(String(inst.custom_id)) || [];
                const objInc = inc[inst.custom_id] || {};

                let covered = 0, waiting = 0, deficit = 0, sum = 0;
                list.forEach(n => {
                    const req = parseFloat(n.required_quantity) || 1;
                    const got = (parseFloat(n.reserved_quantity) || 0) + (parseFloat(n.issued_quantity) || 0);
                    sum += Math.min(100, (got / req) * 100);

                    const left = parseFloat(n.outstanding_need) || 0;
                    if (left <= 0) covered += 1;
                    else if ((objInc[n.nomenclature_id] || 0) >= left) waiting += 1;
                    else deficit += 1;
                });

                return {
                    ...inst,
                    positions: list.length,
                    covered, waiting, deficit,
                    readiness: list.length ? Math.round(sum / list.length) : 0,
                    state: list.length === 0 ? 'nospec'
                        : deficit > 0 ? 'deficit'
                            : waiting > 0 ? 'waiting' : 'ready',
                    requests: reqCount[inst.custom_id] || 0,
                };
            }));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { if (!authLoading) loadDashboard(); }, [authLoading, loadDashboard]);

    /* ---------------- ДЕТАЛІ ОБ'ЄКТА ---------------- */

    const openObject = useCallback(async (inst) => {
        setSelected(inst);
        setDetailLoading(true);
        try {
            const { data: needsData, error: needsErr } = await supabase
                .from('v_object_material_needs').select('*')
                .eq('installation_custom_id', inst.custom_id);
            if (needsErr) throw needsErr;

            const specIds = (needsData || []).map(n => n.nomenclature_id);

            const [stockRes, resRes, movRes, reqRes, incRes] = await Promise.all([
                // Раніше тут тягнулась УСЯ таблиця залишків: усі склади × вся
                // номенклатура. Тепер лише позиції цього об'єкта.
                specIds.length
                    ? supabase.from('v_warehouse_stock_available').select('*').in('nomenclature_id', specIds)
                    : Promise.resolve({ data: [] }),
                supabase.from('reservations')
                    .select('id, warehouse_id, nomenclature_id, reserved_quantity, released_quantity')
                    .eq('installation_custom_id', inst.custom_id).eq('status', 'active'),
                supabase.from('stock_movements')
                    .select('nomenclature_id, quantity, operation_type')
                    .eq('installation_custom_id', inst.custom_id)
                    .in('operation_type', ['issue', 'return']),
                supabase.from('procurement_requests').select('*')
                    .eq('installation_custom_id', inst.custom_id)
                    .order('created_at', { ascending: false }),
                supabase.from('v_object_incoming').select('*')
                    .eq('installation_custom_id', inst.custom_id),
            ]);

            setNeeds(needsData || []);
            setReservations(resRes.data || []);
            setRequests(reqRes.data || []);

            const inc = {};
            (incRes.data || []).forEach(r => { inc[r.nomenclature_id] = parseFloat(r.incoming_quantity); });
            setIncoming(inc);

            // Видане поза специфікацією видно лише з рухів об'єкта
            const net = {};
            (movRes.data || []).forEach(m => {
                const sign = m.operation_type === 'issue' ? 1 : -1;
                net[m.nomenclature_id] = (net[m.nomenclature_id] || 0) + sign * parseFloat(m.quantity || 0);
            });
            const specSet = new Set(specIds);
            const extra = Object.entries(net)
                .filter(([id, q]) => q > 0.0001 && !specSet.has(parseInt(id)))
                .map(([id, q]) => ({ nomenclature_id: parseInt(id), quantity: q }));
            setOffSpec(extra);

            // Довідник назв — тільки те, що потрібне цьому екрану
            const allIds = [...new Set([...specIds, ...extra.map(e => e.nomenclature_id)])];
            if (allIds.length) {
                const [nomRes, catRes] = await Promise.all([
                    supabase.from('nomenclature')
                        .select('id, name, sku, category_id, tracking_mode, lot_unit_name, unit:units(name)')
                        .in('id', allIds),
                    supabase.from('categories').select('id, name, parent_id'),
                ]);
                const catById = new Map((catRes.data || []).map(c => [c.id, c]));
                const map = new Map();
                (nomRes.data || []).forEach(n => {
                    const path = [];
                    let id = n.category_id, guard = 0;
                    while (id && guard++ < 20) {
                        const c = catById.get(id);
                        if (!c) break;
                        path.unshift(c.name);
                        id = c.parent_id;
                    }
                    map.set(n.id, { ...n, fullName: `${path.join(' ')} ${n.name}`.trim() });
                });
                setNomIndex(map);
            } else {
                setNomIndex(new Map());
            }

            setStockRows(stockRes.data || []);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setDetailLoading(false); }
    }, [toast]);

    const refresh = useCallback(async () => {
        if (selected) await openObject(selected);
        loadDashboard();
    }, [selected, openObject, loadDashboard]);

    /* ---------------- ЗАЛИШКИ ---------------- */

    const stockMap = useMemo(() => {
        const m = new Map();
        stockRows.forEach(s => m.set(`${s.nomenclature_id}:${s.warehouse_id}`, {
            onHand: parseFloat(s.quantity_on_hand || 0),
            reserved: parseFloat(s.quantity_reserved || 0),
            available: parseFloat(s.quantity_available || 0),
        }));
        return m;
    }, [stockRows]);

    const stockAt = useCallback((nomId, whId) =>
        stockMap.get(`${nomId}:${whId}`) || EMPTY, [stockMap]);

    const freeTotal = useCallback((nomId) => stockRows
        .filter(s => String(s.nomenclature_id) === String(nomId))
        .reduce((sum, s) => sum + parseFloat(s.quantity_available || 0), 0), [stockRows]);

    /** Зарезервовано під цей об'єкт — усього або на конкретному складі */
    const myReserved = useCallback((nomId, whId = null) => reservations
        .filter(r => String(r.nomenclature_id) === String(nomId)
            && (whId === null || String(r.warehouse_id) === String(whId)))
        .reduce((s, r) => s + (parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity)), 0),
        [reservations]);

    /** Скільки фізично можна видати звідси: наявність мінус ЧУЖІ резерви */
    const issuableAt = useCallback((nomId, whId) => {
        const s = stockAt(nomId, whId);
        return s.onHand - (s.reserved - myReserved(nomId, whId));
    }, [stockAt, myReserved]);

    const activeWarehouses = useMemo(() => warehouses.filter(w => w.is_active), [warehouses]);
    const nomOf = useCallback((id) => nomIndex.get(id) || null, [nomIndex]);
    const unitOf = useCallback((id) => nomOf(id)?.unit?.name || 'шт', [nomOf]);

    /* ---------------- СТАН ПОЗИЦІЇ ---------------- */

    const stateOf = useCallback((n) => {
        const required = parseFloat(n.required_quantity) || 0;
        const issued = parseFloat(n.issued_quantity) || 0;
        const reserved = parseFloat(n.reserved_quantity) || 0;
        const left = parseFloat(n.outstanding_need) || 0;
        const inc = incoming[n.nomenclature_id] || 0;
        const free = freeTotal(n.nomenclature_id);
        const mine = myReserved(n.nomenclature_id);

        // Чотири стани замість шести формулювань. Кожен відповідає на
        // «що мені з цим робити», а подробиці — цифрами під смугою.
        let key, label, tone, hint;
        if (left <= 0) {
            key = 'ready'; label = 'Готово'; tone = 'ok';
            hint = 'Потреба закрита повністю';
        } else if (mine > 0 || free > 0) {
            key = 'action'; label = 'Можна брати'; tone = 'accent';
            hint = mine > 0
                ? `Під об’єкт зарезервовано ${num(mine)} — лишилось видати`
                : `На складах вільно ${num(free)}`;
        } else if (inc >= left && inc > 0) {
            key = 'waiting'; label = 'Чекаємо'; tone = 'info';
            hint = `Замовлено ${num(inc)}, у дорозі — робити нічого не треба`;
        } else {
            key = 'missing'; label = 'Бракує'; tone = 'danger';
            hint = inc > 0
                ? `У дорозі лише ${num(inc)} з потрібних ${num(left)}`
                : `Немає ні на складах, ні в замовленнях`;
        }

        return { key, label, tone, hint, required, issued, reserved, left, inc, free, mine };
    }, [incoming, freeTotal, myReserved]);

    /**
     * Чому дію не можна виконати. Порожньо — можна.
     * Показуємо саме причину, а не ховаємо кнопку: інакше незрозуміло,
     * чому в одного рядка кнопка є, а в сусіднього немає.
     */
    const blockedReason = useCallback((mode, n) => {
        const s = stateOf(n);
        switch (mode) {
            case 'reserve':
                if (s.left <= 0) return 'Потреба вже закрита';
                if (s.free <= 0) return 'На складах немає вільного залишку';
                return null;
            case 'issue':
                if (s.mine <= 0 && s.left <= 0) return 'Потреба вже закрита';
                if (s.mine <= 0 && s.free <= 0) return 'Немає що видавати';
                return null;
            case 'unreserve':
                return s.mine > 0 ? null : 'Під цей об’єкт нічого не зарезервовано';
            case 'return':
                return s.issued > 0 ? null : 'На об’єкт ще нічого не видавали';
            default: return 'Недоступно';
        }
    }, [stateOf]);

    /* ---------------- ОПЕРАЦІЯ ---------------- */

    const openOp = (mode, n) => {
        const nomId = n.nomenclature_id;
        const left = parseFloat(n.outstanding_need) || 0;
        let candidates;

        if (mode === 'reserve') {
            candidates = activeWarehouses.filter(w => stockAt(nomId, w.id).available > 0);
            if (!candidates.length) return toast('Немає вільного залишку на жодному складі', 'warning');
        } else if (mode === 'issue') {
            candidates = activeWarehouses.filter(w => issuableAt(nomId, w.id) > 0);
            if (!candidates.length) return toast('Немає доступного залишку для видачі', 'warning');
            candidates.sort((a, b) => myReserved(nomId, b.id) - myReserved(nomId, a.id));
        } else if (mode === 'unreserve') {
            candidates = activeWarehouses.filter(w => myReserved(nomId, w.id) > 0);
            if (!candidates.length) return toast('Активних резервів під цей об’єкт немає', 'warning');
            candidates.sort((a, b) => myReserved(nomId, b.id) - myReserved(nomId, a.id));
        } else {
            candidates = activeWarehouses.length ? activeWarehouses : warehouses;
            if (!candidates.length) return toast('Немає активних складів', 'warning');
        }

        const wh = candidates[0];
        let qty = 0;
        if (mode === 'reserve') qty = Math.min(Math.max(left, 0), stockAt(nomId, wh.id).available);
        else if (mode === 'issue') {
            const here = myReserved(nomId, wh.id);
            qty = Math.min(here > 0 ? here : Math.max(left, 0), issuableAt(nomId, wh.id));
        } else if (mode === 'unreserve') qty = myReserved(nomId, wh.id);
        else qty = parseFloat(n.issued_quantity) || 0;

        setSheet(null);
        setOp({ mode, item: n, warehouse_id: String(wh.id), quantity: qty > 0 ? String(num(qty)) : '', reason: '' });
    };

    const overage = useMemo(() => {
        if (!op) return { over: false, ref: 0 };
        const q = parseFloat(op.quantity) || 0;
        if (op.mode === 'reserve' || op.mode === 'issue') {
            const ref = parseFloat(op.item.outstanding_need) || 0;
            return { over: q > ref, ref };
        }
        if (op.mode === 'return') {
            const ref = parseFloat(op.item.issued_quantity) || 0;
            return { over: q > ref, ref };
        }
        return { over: false, ref: 0 };
    }, [op]);

    const opStock = useMemo(() => {
        if (!op?.warehouse_id) return null;
        const nomId = op.item.nomenclature_id, whId = op.warehouse_id;
        return {
            ...stockAt(nomId, whId),
            mine: myReserved(nomId, whId),
            issuable: issuableAt(nomId, whId),
        };
    }, [op, stockAt, myReserved, issuableAt]);

    const runOp = async () => {
        const qty = parseFloat(op.quantity);
        if (!qty || qty <= 0) return toast('Введіть кількість більшу за 0', 'error');
        if (!op.warehouse_id) return toast('Оберіть склад', 'error');
        if (overage.over && !op.reason.trim()) {
            return toast('Понад план — вкажіть причину', 'warning');
        }

        const item = op.item;
        const unit = unitOf(item.nomenclature_id);
        const whName = warehouses.find(w => String(w.id) === String(op.warehouse_id))?.name;

        const ok = await confirm({
            title: `${OPS[op.mode].label}?`,
            tone: op.mode === 'return' ? 'warn' : 'accent',
            confirmLabel: OPS[op.mode].short,
            message: nomOf(item.nomenclature_id)?.fullName || item.nomenclature_name,
            details: [
                `${num(qty)} ${unit}`,
                op.mode === 'return' ? `на склад ${whName}` : `зі складу ${whName}`,
                ...(overage.over ? [`Понад план на ${num(qty - overage.ref)} ${unit}`] : []),
                ...(op.reason.trim() ? [`Причина: ${op.reason.trim()}`] : []),
            ],
        });
        if (!ok) return;

        setBusy(true);
        try {
            if (op.mode === 'unreserve') {
                const targets = reservations
                    .filter(r => String(r.warehouse_id) === String(op.warehouse_id)
                        && String(r.nomenclature_id) === String(item.nomenclature_id))
                    .map(r => ({ id: r.id, active: parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity) }))
                    .filter(r => r.active > 0);

                const total = targets.reduce((s, t) => s + t.active, 0);
                if (qty > total) throw new Error(`На цьому складі активний резерв лише ${num(total)}`);

                let left = qty;
                for (const t of targets) {
                    if (left <= 0) break;
                    const take = Math.min(t.active, left);
                    const { data, error } = await supabase.rpc('release_reservation', {
                        p_reservation_id: t.id, p_qty: take, p_emp: employee?.id ?? null,
                    });
                    if (error) throw error;
                    if (data?.ok === false) throw new Error(data.message);
                    left -= take;
                }
                toast(`Резерв знято: ${num(qty)} ${unit}`);
            } else {
                const rpc = op.mode === 'reserve' ? 'reserve_for_object'
                    : op.mode === 'issue' ? 'issue_to_object' : 'return_from_object';

                const args = op.mode === 'reserve'
                    ? {
                        p_installation: selected.custom_id,
                        p_warehouse: parseInt(op.warehouse_id),
                        p_nomenclature: item.nomenclature_id,
                        p_spec_item: item.specification_item_id,
                        p_qty: qty, p_emp: employee?.id ?? null,
                    }
                    : {
                        p_installation: selected.custom_id,
                        p_warehouse: parseInt(op.warehouse_id),
                        p_nomenclature: item.nomenclature_id,
                        p_qty: qty,
                        p_reason: op.reason.trim() || null,
                        p_emp: employee?.id ?? null,
                    };

                const { data, error } = await supabase.rpc(rpc, args);
                if (error) throw error;
                if (data?.ok === false) throw new Error(data.message);
                toast(`${OPS[op.mode].short}: ${num(qty)} ${unit}`);
            }

            setOp(null);
            await refresh();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- ЗАЯВКИ ---------------- */

    const saveRequest = async () => {
        const qty = parseFloat(reqModal.quantity);
        if (!qty || qty <= 0) return toast('Вкажіть кількість більшу за 0', 'error');
        setBusy(true);
        try {
            const { error } = await supabase.from('procurement_requests').insert([{
                installation_custom_id: selected.custom_id,
                nomenclature_id: reqModal.item.nomenclature_id,
                quantity: qty,
                note: reqModal.note.trim() || null,
                requested_by: employee?.id ?? null,
                status: 'requested',
            }]);
            if (error) throw error;
            toast('Заявку на закупівлю створено');
            setReqModal(null);
            await refresh();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    const setRequestStatus = async (id, status) => {
        try {
            const { error } = await supabase.from('procurement_requests')
                .update({ status, resolved_by: employee?.id ?? null, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
            toast('Статус заявки оновлено');
            await refresh();
        } catch (e) { toast(humanError(e), 'error'); }
    };

    const deleteRequest = async (req) => {
        const ok = await confirm({
            title: 'Видалити заявку?', tone: 'danger', confirmLabel: 'Видалити',
            message: nomOf(req.nomenclature_id)?.fullName || `Номенклатура #${req.nomenclature_id}`,
            details: [
                `${num(req.quantity)} ${unitOf(req.nomenclature_id)}`,
                'Закупівельник більше не побачить цю потребу.',
            ],
        });
        if (!ok) return;
        try {
            const { error } = await supabase.from('procurement_requests').delete().eq('id', req.id);
            if (error) throw error;
            toast('Заявку видалено');
            await refresh();
        } catch (e) { toast(humanError(e), 'error'); }
    };

    /* ---------------- ФІЛЬТРАЦІЯ ---------------- */

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return installations.filter(i => {
            if (statusFilter !== 'all' && i.state !== statusFilter) return false;
            if (!term) return true;
            return (i.name || '').toLowerCase().includes(term)
                || String(i.custom_id).includes(term)
                || (i.client?.name || '').toLowerCase().includes(term)
                || (i.client?.company_name || '').toLowerCase().includes(term);
        });
    }, [installations, statusFilter, search]);

    const counts = useMemo(() => {
        const c = { all: installations.length };
        FILTERS.slice(1).forEach(f => { c[f.value] = installations.filter(i => i.state === f.value).length; });
        return c;
    }, [installations]);

    if (authLoading) {
        return <Layout><div className="p-6 text-center text-slate-500 text-[13px]">Завантаження…</div></Layout>;
    }

    /* ---------------- ЧАСТИНИ ---------------- */

    /** Смуга покриття: видано · резерв · в дорозі · бракує */
    const coverSegments = (s) => {
        const base = s.required || 1;
        const pct = (v) => Math.max(0, Math.min(100, (v / base) * 100));
        return [
            { pct: pct(s.issued), tone: 'ok' },
            { pct: pct(s.reserved), tone: 'accent' },
            { pct: pct(Math.min(s.inc, s.left)), tone: 'info' },
            { pct: pct(Math.max(0, s.left - s.inc)), tone: 'danger' },
        ];
    };

    /** Підпис під смугою: колір + число + слово. Легенду не треба пам'ятати. */
    const LEGEND = [
        { key: 'issued', label: 'видано', dot: 'bg-emerald-500', text: 'text-emerald-700' },
        { key: 'reserved', label: 'резерв', dot: 'bg-indigo-500', text: 'text-indigo-700' },
        { key: 'inc', label: 'в дорозі', dot: 'bg-sky-500', text: 'text-sky-700' },
        { key: 'missing', label: 'бракує', dot: 'bg-rose-500', text: 'text-rose-700' },
    ];

    const renderPosition = (n) => {
        const s = stateOf(n);
        const nom = nomOf(n.nomenclature_id);
        const unit = unitOf(n.nomenclature_id);
        const activeReq = requests.find(r => r.nomenclature_id === n.nomenclature_id
            && ['requested', 'ordered'].includes(r.status));
        const missing = Math.max(0, s.left - s.inc);
        const canOrder = missing > 0 && !activeReq;

        const values = { issued: s.issued, reserved: s.reserved, inc: Math.min(s.inc, s.left), missing };

        return (
            <div key={n.specification_item_id || n.nomenclature_id}
                className={`${T.cardFlat} px-3 py-2.5 ${s.key === 'ready' ? 'bg-emerald-50/40' : ''}`}>

                <div className="flex items-start gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-slate-900 leading-snug">
                            {nom?.fullName || n.nomenclature_name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {nom?.sku && <span className={T.mono}>{nom.sku}</span>}
                            {nom?.tracking_mode === 'lot' && (
                                <Chip tone="info" icon={FaLayerGroup}>{nom.lot_unit_name || 'бухти'}</Chip>
                            )}
                            {activeReq && (
                                <Chip tone={REQ_STATUS[activeReq.status]?.tone}>
                                    {REQ_STATUS[activeReq.status]?.label}
                                </Chip>
                            )}
                        </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                        <Chip tone={s.tone}>{s.label}</Chip>
                        <div className="text-[13px] font-black tabular-nums text-slate-900 mt-1">
                            {num(s.required)} <span className="text-[9px] font-bold text-slate-400">{unit}</span>
                        </div>
                    </div>
                </div>

                <Bar segments={coverSegments(s)} />

                {/* Легенда просто під смугою: видно, який колір що означає */}
                <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 flex-wrap">
                    {LEGEND.filter(l => values[l.key] > 0).map(l => (
                        <span key={l.key} className="inline-flex items-center gap-1 text-[10.5px]">
                            <span className={`w-2 h-2 rounded-sm ${l.dot}`} />
                            <b className={`tabular-nums ${l.text}`}>{num(values[l.key])}</b>
                            <span className="text-slate-500">{l.label}</span>
                        </span>
                    ))}
                </div>

                <div className="text-[11px] text-slate-500 mt-1.5 leading-snug">{s.hint}</div>

                {/* Усі дії видно завжди. Недоступні — сірі, з причиною в підказці. */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {['reserve', 'issue'].map(mode => {
                        const why = blockedReason(mode, n);
                        return (
                            <Btn key={mode} size="sm"
                                variant={why ? 'outline' : OPS[mode].variant}
                                icon={OPS[mode].icon}
                                disabled={!!why}
                                title={why || OPS[mode].label}
                                onClick={() => openOp(mode, n)}>
                                {OPS[mode].short}
                            </Btn>
                        );
                    })}

                    <Btn size="sm"
                        variant={canOrder ? 'softWarn' : 'outline'}
                        icon={FaShoppingCart}
                        disabled={!canOrder}
                        title={activeReq ? 'Заявка вже створена'
                            : missing <= 0 ? 'Потреба закрита або товар у дорозі'
                                : 'Створити заявку на закупівлю'}
                        onClick={() => setReqModal({ item: n, quantity: String(num(missing)), note: '' })}>
                        Замовити
                    </Btn>

                    <IconBtn variant="ghost" icon={FaEllipsisH} label="Зняти резерв · повернути · подробиці"
                        className="ml-auto" onClick={() => setSheet({ item: n })} />
                </div>
            </div>
        );
    };

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <Layout>
            <div className="p-3 sm:p-5 max-w-[1200px] mx-auto flex flex-col gap-2.5">

                {!selected ? (
                    <>
                        <div>
                            <h1 className="text-[19px] font-bold text-slate-900 flex items-center gap-2">
                                <FaBoxOpen className="text-indigo-600" size={16} /> Забезпечення об'єктів
                            </h1>
                            <p className="text-[12.5px] text-slate-500 mt-0.5">
                                Комплектація, резерв, видача та повернення матеріалів
                            </p>
                        </div>

                        <Card pad="p-2.5" className="space-y-2.5">
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                                <input className={`${T.input} pl-8`} value={search}
                                    placeholder="Назва об'єкта, номер або клієнт…"
                                    onChange={e => setSearch(e.target.value)} />
                            </div>
                            <div className="flex items-center gap-1.5 overflow-x-auto">
                                {FILTERS.map(f => (
                                    <button key={f.value} onClick={() => setStatusFilter(f.value)}
                                        className={`px-2.5 h-8 rounded-lg text-[11.5px] font-bold whitespace-nowrap border transition-colors flex-shrink-0
                                            ${statusFilter === f.value
                                                ? 'bg-slate-900 text-white border-slate-900'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}>
                                        {f.label}
                                        <span className={`ml-1 tabular-nums ${statusFilter === f.value ? 'opacity-70' : 'text-slate-400'}`}>
                                            {counts[f.value] || 0}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </Card>

                        <div className={`${T.card} overflow-hidden`}>
                            {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
                                <EmptyState icon={FaHardHat} title="Об'єктів не знайдено"
                                    hint="Змініть фільтр або пошуковий запит." />
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {filtered.map(inst => (
                                        <button key={inst.custom_id} onClick={() => openObject(inst)}
                                            className="w-full text-left px-3 py-2.5 hover:bg-slate-50 active:bg-slate-100 transition-colors">
                                            <div className="flex items-start gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={T.mono}>СЕС-{inst.custom_id}</span>
                                                        <span className="text-[13px] font-bold text-slate-900">{inst.name}</span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5">
                                                        {inst.client?.company_name || inst.client?.name || 'Клієнт не вказаний'}
                                                        {' · '}позицій {inst.positions}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                                        {inst.positions === 0 && <Chip tone="neutral">без специфікації</Chip>}
                                                        {inst.covered > 0 && <Chip tone="ok">{inst.covered} забезпечено</Chip>}
                                                        {inst.waiting > 0 && <Chip tone="info" icon={FaTruck}>{inst.waiting} в дорозі</Chip>}
                                                        {inst.deficit > 0 && <Chip tone="danger">{inst.deficit} бракує</Chip>}
                                                        {inst.requests > 0 && <Chip tone="warn" icon={FaShoppingCart}>{inst.requests} заявки</Chip>}
                                                    </div>
                                                </div>
                                                <div className="text-right w-20 flex-shrink-0">
                                                    <div className="text-[17px] font-black tabular-nums text-slate-900">{inst.readiness}%</div>
                                                    <Bar className="mt-1" segments={[{
                                                        pct: inst.readiness,
                                                        tone: inst.readiness === 100 ? 'ok' : inst.deficit > 0 ? 'danger' : 'info',
                                                    }]} />
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <Card pad="p-2.5">
                            <div className="flex items-start gap-2 flex-wrap">
                                <div className="min-w-0 flex-1">
                                    <button onClick={() => setSelected(null)}
                                        className="text-[11.5px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mb-1">
                                        <FaChevronLeft size={9} /> Усі об'єкти
                                    </button>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={T.mono}>СЕС-{selected.custom_id}</span>
                                        <h2 className="text-[15px] font-bold text-slate-900">{selected.name}</h2>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Btn variant="outline" icon={FaClipboardList} onClick={() => setManualOpen(true)}>
                                        <span className="hidden sm:inline">Комплектація вручну</span>
                                        <span className="sm:hidden">Вручну</span>
                                    </Btn>
                                    <div className="text-right">
                                        <div className="text-[17px] font-black tabular-nums text-slate-900">{selected.readiness}%</div>
                                        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">готовність</div>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {detailLoading ? <Card><Skeleton rows={8} /></Card> : (
                            <div className="space-y-2.5">
                                {needs.length === 0 ? (
                                    <Card>
                                        <EmptyState
                                            icon={FaBoxOpen}
                                            title="Специфікація порожня або не затверджена"
                                            hint="Оцифруйте PDF на етапі проекту або внесіть комплектацію вручну."
                                        >
                                            <Btn variant="accent" icon={FaClipboardList} onClick={() => setManualOpen(true)}>
                                                Внести вручну
                                            </Btn>
                                        </EmptyState>
                                    </Card>
                                ) : (
                                    <div className="space-y-1.5">{needs.map(renderPosition)}</div>
                                )}

                                {requests.length > 0 && (
                                    <Card pad="p-0" className="border-amber-200 overflow-hidden">
                                        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 flex-wrap">
                                            <FaShoppingCart className="text-amber-500" size={12} />
                                            <span className="text-[12.5px] font-bold text-amber-900">Заявки на закупівлю</span>
                                            <Chip tone="warn">{requests.length}</Chip>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {requests.map(r => {
                                                const closed = ['done', 'rejected'].includes(r.status);
                                                return (
                                                    <div key={r.id} className={`px-3 py-2 flex items-center gap-2 flex-wrap ${closed ? 'opacity-50' : ''}`}>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                                                                {nomOf(r.nomenclature_id)?.fullName || `Номенклатура #${r.nomenclature_id}`}
                                                            </div>
                                                            <div className="text-[10.5px] text-slate-400">
                                                                {new Date(r.created_at).toLocaleDateString('uk-UA')}
                                                                {r.note && <span className="italic"> · {r.note}</span>}
                                                            </div>
                                                        </div>
                                                        <span className="text-[13px] font-black tabular-nums text-amber-700">
                                                            {num(r.quantity)}
                                                            <span className="text-[9px] text-amber-400 ml-0.5">{unitOf(r.nomenclature_id)}</span>
                                                        </span>
                                                        <select className={`${T.select} w-40`} value={r.status}
                                                            onChange={e => setRequestStatus(r.id, e.target.value)}>
                                                            {Object.entries(REQ_STATUS).map(([k, v]) =>
                                                                <option key={k} value={k}>{v.label}</option>)}
                                                        </select>
                                                        <IconBtn variant="ghost" icon={FaTrash} label="Видалити заявку"
                                                            onClick={() => deleteRequest(r)} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Card>
                                )}

                                {offSpec.length > 0 && (
                                    <Card pad="p-0" className="border-amber-200 overflow-hidden">
                                        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                                            <FaExclamationTriangle className="text-amber-500" size={12} />
                                            <span className="text-[12.5px] font-bold text-amber-900">Видано поза специфікацією</span>
                                            <Chip tone="warn">{offSpec.length}</Chip>
                                        </div>
                                        <div className="divide-y divide-slate-100">
                                            {offSpec.map(row => (
                                                <div key={row.nomenclature_id} className="px-3 py-2 flex items-center gap-2">
                                                    <span className="text-[12.5px] font-semibold text-slate-900 flex-1 truncate">
                                                        {nomOf(row.nomenclature_id)?.fullName || `Номенклатура #${row.nomenclature_id}`}
                                                    </span>
                                                    <span className="text-[13px] font-black tabular-nums text-slate-900">
                                                        {num(row.quantity)}
                                                        <span className="text-[9px] text-slate-400 ml-0.5">{unitOf(row.nomenclature_id)}</span>
                                                    </span>
                                                    <Btn size="sm" variant="softWarn" icon={FaUndo}
                                                        onClick={() => openOp('return', {
                                                            nomenclature_id: row.nomenclature_id,
                                                            required_quantity: 0, reserved_quantity: 0,
                                                            issued_quantity: row.quantity, outstanding_need: 0,
                                                            specification_item_id: null,
                                                            nomenclature_name: nomOf(row.nomenclature_id)?.fullName,
                                                        })}>
                                                        Повернути
                                                    </Btn>
                                                </div>
                                            ))}
                                        </div>
                                    </Card>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ---------- АРКУШ ДІЙ ---------- */}
            <Modal
                isOpen={!!sheet} onClose={() => setSheet(null)}
                title={sheet ? (nomOf(sheet.item.nomenclature_id)?.fullName || sheet.item.nomenclature_name) : ''}
                subtitle="Що зробити з позицією" size="sm"
            >
                {sheet && (() => {
                    const s = stateOf(sheet.item);
                    const unit = unitOf(sheet.item.nomenclature_id);
                    return (
                        <div className="space-y-3">
                            <div className={`${TONE[s.tone].chip} border rounded-lg px-3 py-2 text-[12.5px] font-semibold`}>
                                {s.label} — {s.hint}
                            </div>

                            <div className={`${T.inset} px-3 py-2.5 space-y-1.5 text-[12.5px]`}>
                                {[
                                    ['Потрібно за планом', s.required], ['Уже видано', s.issued],
                                    ['У резерві під об’єкт', s.mine], ['Лишилось покрити', s.left],
                                    ['Замовлено, в дорозі', s.inc], ['Вільно на складах', s.free],
                                ].map(([k, v]) => (
                                    <div key={k} className="flex items-center justify-between">
                                        <span className="text-slate-500">{k}</span>
                                        <b className="tabular-nums text-slate-900">
                                            {num(v)} <span className="text-[9px] text-slate-400">{unit}</span>
                                        </b>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {Object.keys(OPS).map(k => {
                                    const why = blockedReason(k, sheet.item);
                                    return (
                                        <Btn key={k}
                                            variant={why ? 'outline' : OPS[k].variant}
                                            icon={OPS[k].icon}
                                            disabled={!!why}
                                            title={why || OPS[k].label}
                                            onClick={() => openOp(k, sheet.item)}>
                                            {OPS[k].short}
                                        </Btn>
                                    );
                                })}
                            </div>

                            <p className="text-[11px] text-slate-400 leading-relaxed">
                                Сірі кнопки зараз недоступні — наведіть, щоб побачити причину.
                            </p>
                            )}
                        </div>
                    );
                })()}
            </Modal>

            {/* ---------- ОПЕРАЦІЯ ---------- */}
            <Modal
                isOpen={!!op} onClose={() => setOp(null)}
                title={op ? OPS[op.mode].label : ''}
                subtitle={op ? (nomOf(op.item.nomenclature_id)?.fullName || op.item.nomenclature_name) : ''}
                tone={op ? OPS[op.mode].tone : 'neutral'} size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setOp(null)}>Скасувати</Btn>
                    <Btn variant={op ? OPS[op.mode].variant : 'accent'} onClick={runOp} disabled={busy}>
                        {busy ? 'Проводимо…' : op ? OPS[op.mode].short : ''}
                    </Btn>
                </>}
            >
                {op && (
                    <div className="space-y-3">
                        <Field label={op.mode === 'return' ? 'Склад повернення' : 'Склад'} required>
                            <select className={T.select} value={op.warehouse_id}
                                onChange={e => setOp(o => ({ ...o, warehouse_id: e.target.value }))}>
                                {(activeWarehouses.length ? activeWarehouses : warehouses).map(w => {
                                    const st = stockAt(op.item.nomenclature_id, w.id);
                                    const hint = op.mode === 'reserve' ? `вільно ${num(st.available)}`
                                        : op.mode === 'issue' ? `можна ${num(issuableAt(op.item.nomenclature_id, w.id))}`
                                            : op.mode === 'unreserve' ? `резерв ${num(myReserved(op.item.nomenclature_id, w.id))}` : '';
                                    return <option key={w.id} value={w.id}>{w.name}{hint ? ` — ${hint}` : ''}</option>;
                                })}
                            </select>
                        </Field>

                        {opStock && (
                            <div className={`${T.inset} px-3 py-2 flex items-center justify-between gap-2 text-[11.5px] flex-wrap`}>
                                <span className="text-slate-500">фізично <b className="text-slate-900">{num(opStock.onHand)}</b></span>
                                <span className="text-slate-500">вільно <b className="text-emerald-700">{num(opStock.available)}</b></span>
                                <span className="text-slate-500">наш резерв <b className="text-indigo-700">{num(opStock.mine)}</b></span>
                                {op.mode === 'issue' && (
                                    <span className="text-slate-500">до видачі <b className="text-slate-900">{num(opStock.issuable)}</b></span>
                                )}
                            </div>
                        )}

                        <Field label={`Кількість, ${unitOf(op.item.nomenclature_id)}`} required>
                            <input type="number" min="0" step="any" inputMode="decimal" autoFocus={autoFocus}
                                className={`${T.input} text-lg font-black tabular-nums ${overage.over ? 'border-amber-400 bg-amber-50' : ''}`}
                                value={op.quantity}
                                onChange={e => setOp(o => ({ ...o, quantity: e.target.value }))} />
                        </Field>

                        {overage.over && (
                            <div className={`${TONE.warn.chip} border rounded-lg px-3 py-2 text-[12px] font-semibold`}>
                                Понад план на {num((parseFloat(op.quantity) || 0) - overage.ref)}.
                                Провести можна, але потрібна причина.
                            </div>
                        )}

                        {op.mode !== 'unreserve' && (
                            <Field label={overage.over ? 'Причина — обов’язково' : 'Коментар'} required={overage.over}>
                                <input className={T.input} value={op.reason}
                                    placeholder={overage.over ? 'Напр. заміна пошкодженого' : 'Необов’язково'}
                                    onChange={e => setOp(o => ({ ...o, reason: e.target.value }))} />
                            </Field>
                        )}
                    </div>
                )}
            </Modal>

            {/* ---------- ЗАЯВКА НА ЗАКУПІВЛЮ ---------- */}
            <Modal
                isOpen={!!reqModal} onClose={() => setReqModal(null)}
                title="Заявка на закупівлю"
                subtitle={reqModal ? (nomOf(reqModal.item.nomenclature_id)?.fullName || reqModal.item.nomenclature_name) : ''}
                tone="warn" size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setReqModal(null)}>Скасувати</Btn>
                    <Btn variant="accent" onClick={saveRequest} disabled={busy}>
                        {busy ? 'Створюємо…' : 'Створити заявку'}
                    </Btn>
                </>}
            >
                {reqModal && (
                    <div className="space-y-3">
                        <p className="text-[12px] text-slate-500 leading-relaxed">
                            Заявка потрапить у розділ «Закупівлі» — закупівельник побачить,
                            що і під який об'єкт треба замовити.
                        </p>
                        <Field label={`Кількість, ${unitOf(reqModal.item.nomenclature_id)}`} required>
                            <input type="number" min="0" step="any" inputMode="decimal" autoFocus={autoFocus}
                                className={`${T.input} text-lg font-black tabular-nums`}
                                value={reqModal.quantity}
                                onChange={e => setReqModal(m => ({ ...m, quantity: e.target.value }))} />
                        </Field>
                        <Field label="Коментар">
                            <input className={T.input} placeholder="Напр. терміново, до п'ятниці"
                                value={reqModal.note}
                                onChange={e => setReqModal(m => ({ ...m, note: e.target.value }))} />
                        </Field>
                    </div>
                )}
            </Modal>

            {manualOpen && selected && (
                <ManualSpecBuilder
                    isOpen={manualOpen}
                    onClose={() => setManualOpen(false)}
                    onSuccess={refresh}
                    installationId={selected.custom_id}
                    taskId="complectation"
                    title="Комплектація матеріалів"
                    showToast={toast}
                />
            )}
        </Layout>
    );
}
