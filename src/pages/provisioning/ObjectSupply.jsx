// =====================================================================
//  K-CORE · Забезпечення одного об'єкта
//
//  Відповідає на питання «що ще треба цьому об'єкту і що з цим зробити».
//   • Зверху — скільки позицій готово, що можна брати зі складу, що
//     в дорозі, чого бракує. І дві дії одразу на всі позиції:
//     «Зарезервувати вільне» і «Видати зарезервоване» — спершу видно
//     план (що, скільки, з якого складу), потім «Провести».
//   • Позиції — компактним списком; натиснули — під рядком цифри по
//     складах і дії: резерв, видача, зняти резерв, повернути, замовити.
//     Форма дії — тут же, без вікон поверх сторінки.
//   • Нижче — заявки на закупівлю, видане поза специфікацією (можна
//     повернути) і обладнання з КП для звірки.
//   • Змінили специфікацію (була дахова конструкція — стала наземна):
//     «Після зміни специфікації» — що зі старої версії вже видано чи
//     зарезервовано, а тепер не потрібно: повернути на склад, зняти
//     резерв або лишити на об'єкті (v_object_spec_leftovers). «Версії
//     специфікацій» — що саме змінилось між чинною і попередньою.
//  Працює і для завершених об'єктів: довидача, повернення залишків.
//  Цифри рахує база: v_object_material_needs (лишилось = потрібно −
//  резерв − видано), v_warehouse_stock_available, v_object_incoming.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaChevronLeft, FaChevronDown, FaLock, FaUnlock, FaArrowUp, FaUndo, FaShoppingCart, FaClipboardList,
    FaLayerGroup, FaFileInvoiceDollar, FaExclamationTriangle, FaTrash, FaExternalLinkAlt, FaCheck, FaTimes,
    FaBoxOpen, FaSearch, FaHardHat, FaHistory, FaExchangeAlt, FaMapPin,
} from 'react-icons/fa';

import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthProvider';
import { T, Btn, IconBtn, Chip, Card, Bar, EmptyState, Skeleton, Tip, useToast, useConfirm, humanError, num, useAutoFocus } from '../../ui';
import { getStageGroupLabel } from '../../domain/stages';
import { getObjectStatus } from '../../domain/objects';
import { nomFullName } from '../../domain/nomenclature';

const OPS = {
    reserve: { label: 'Зарезервувати', short: 'Резерв', icon: FaLock, variant: 'accent' },
    issue: { label: 'Видати на об’єкт', short: 'Видати', icon: FaArrowUp, variant: 'ok' },
    unreserve: { label: 'Зняти резерв', short: 'Зняти резерв', icon: FaUnlock, variant: 'soft' },
    return: { label: 'Повернути на склад', short: 'Повернути', icon: FaUndo, variant: 'softWarn' },
    order: { label: 'Заявка на закупівлю', short: 'Замовити', icon: FaShoppingCart, variant: 'softWarn' },
    keep: { label: 'Лишити на об’єкті', short: 'Лишити', icon: FaMapPin, variant: 'soft' },
};

// Види специфікацій — як їх називають на етапах
const SPEC_KINDS = [
    { key: 'complectation', label: 'Комплектація матеріалів', short: 'Матеріали' },
    { key: 'comp_protection', label: 'Комплектація ел. захисту', short: 'Ел. захист' },
    { key: 'commercial_proposal', label: 'Потреба з КП', short: 'З КП' },
];
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');

const REQ_STATUS = {
    requested: { label: 'Потрібно замовити', tone: 'warn' },
    ordered: { label: 'Замовлено', tone: 'info' },
    stock_confirmed: { label: 'Є на складі', tone: 'ok' },
    done: { label: 'Закрито', tone: 'neutral' },
    rejected: { label: 'Відхилено', tone: 'danger' },
};

const STATE_ORDER = { action: 0, missing: 1, waiting: 2, ready: 3 };
const POS_FILTERS = [
    { key: 'all', label: 'Усі' },
    { key: 'action', label: 'Можна брати' },
    { key: 'missing', label: 'Бракує' },
    { key: 'waiting', label: 'В дорозі' },
    { key: 'ready', label: 'Готово' },
];
const EMPTY = Object.freeze({ onHand: 0, reserved: 0, available: 0 });

const LEGEND = [
    { key: 'issued', label: 'видано', dot: 'bg-emerald-500', text: 'text-emerald-700' },
    { key: 'reserved', label: 'резерв', dot: 'bg-indigo-500', text: 'text-indigo-700' },
    { key: 'stock', label: 'є на складі', dot: 'bg-amber-500', text: 'text-amber-700' },
    { key: 'inc', label: 'в дорозі', dot: 'bg-sky-500', text: 'text-sky-700' },
    { key: 'missing', label: 'бракує', dot: 'bg-rose-500', text: 'text-rose-700' },
];

/** Непокрите (лишилось) ділимо: спершу що вже є на складі, потім що в дорозі, решта — бракує */
const splitLeft = (s) => {
    const stock = Math.min(s.left, s.free);
    const inc = Math.min(s.inc, s.left - stock);
    return { issued: s.issued, reserved: s.reserved, stock, inc, missing: Math.max(0, s.left - stock - inc) };
};

const chipBtn = (on) => `h-8 px-2.5 rounded-lg border text-[12px] font-semibold whitespace-nowrap transition-colors flex-shrink-0
    ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`;

/**
 * inst — об'єкт зі списку (зведення); alertsNode — нагадування цього об'єкта;
 * onManual(task) — відкрити ручну комплектацію (її вікно тримає сторінка);
 * reloadKey — сторінка збільшує, коли дані об'єкта змінились ззовні.
 */
export default function ObjectSupply({ inst, warehouses, onBack, onChanged, alertsNode, canProv, onManual, reloadKey = 0 }) {
    const { employee, can } = useAuth();
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const autoFocus = useAutoFocus();

    const [loading, setLoading] = useState(true);
    const [needs, setNeeds] = useState([]);
    const [stockRows, setStockRows] = useState([]);
    const [reservations, setReservations] = useState([]);
    const [incoming, setIncoming] = useState({});
    const [offSpec, setOffSpec] = useState([]);
    const [requests, setRequests] = useState([]);
    const [offerEquip, setOfferEquip] = useState([]);
    const [offerNeed, setOfferNeed] = useState(null);
    const [nomIndex, setNomIndex] = useState(new Map());
    const [leftovers, setLeftovers] = useState([]);   // зайве після зміни специфікації
    const [versions, setVersions] = useState([]);     // [{ kind, cur, prev, diff }]
    const [versionsOpen, setVersionsOpen] = useState(false);

    const [open, setOpen] = useState(null);       // розгорнута позиція (nomenclature_id)
    const [form, setForm] = useState(null);       // { mode, item, warehouse_id, quantity, reason, note }
    const [busy, setBusy] = useState(false);
    const [posFilter, setPosFilter] = useState('all');
    const [q, setQ] = useState('');
    const [bulk, setBulk] = useState(null);       // { mode, steps: [...] , done }
    const [backBulk, setBackBulk] = useState(null); // повернути все зайве: { whId, steps, done }
    const [offerOpen, setOfferOpen] = useState(false);

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const load = useCallback(async () => {
        try {
            const { data: needsData, error: needsErr } = await supabase
                .from('v_object_material_needs').select('*')
                .eq('installation_custom_id', inst.custom_id);
            if (needsErr) throw needsErr;
            const specIds = (needsData || []).map(n => n.nomenclature_id);

            const [stockRes, resRes, movRes, reqRes, incRes, offEqRes, offNeedRes, leftRes, specRes] = await Promise.all([
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
                supabase.from('v_object_incoming').select('*').eq('installation_custom_id', inst.custom_id),
                // До міграції db/2026-09_offer_to_need.sql цих переглядів немає — це не привід ламати екран
                supabase.from('v_object_offer_equipment').select('*').eq('installation_custom_id', inst.custom_id).order('sort_order'),
                supabase.from('v_object_offer_need').select('*').eq('installation_custom_id', inst.custom_id).maybeSingle(),
                // До міграції 2026-11_spec_versions.sql цього представлення немає — тоді без блоку
                supabase.from('v_object_spec_leftovers').select('*').eq('installation_custom_id', inst.custom_id),
                supabase.from('specifications')
                    .select('id, version, status, notes, name, created_at, confirmed_at, created_by, items:specification_items(nomenclature_id, quantity, original_name)')
                    .eq('installation_custom_id', inst.custom_id).in('status', ['confirmed', 'archived'])
                    .order('version', { ascending: false }),
            ]);

            // Версії: чинна кожного виду і попередня — щоб показати, що змінилось
            const specs = specRes.data || [];
            const authorIds = [...new Set(specs.map(s => s.created_by).filter(Boolean))];
            const authors = authorIds.length
                ? new Map(((await supabase.from('employees').select('id, name').in('id', authorIds)).data || []).map(e => [e.id, e.name]))
                : new Map();
            const sumBy = (items) => {
                const m = new Map();
                (items || []).forEach(it => {
                    if (!it.nomenclature_id) return;
                    const cur = m.get(it.nomenclature_id) || { q: 0, name: it.original_name };
                    m.set(it.nomenclature_id, { q: cur.q + (parseFloat(it.quantity) || 0), name: cur.name || it.original_name });
                });
                return m;
            };
            const vers = SPEC_KINDS.map(k => {
                const ofKind = specs.filter(s => s.notes === k.key);
                const cur = ofKind.find(s => s.status === 'confirmed');
                if (!cur) return null;
                const prev = ofKind.find(s => s.status === 'archived' && s.version < cur.version) || null;
                const a = sumBy(prev?.items), b = sumBy(cur.items);
                const diff = prev ? [...new Set([...a.keys(), ...b.keys()])].map(id => ({
                    id, name: (b.get(id) || a.get(id)).name, old: a.get(id)?.q || 0, now: b.get(id)?.q || 0,
                })).filter(d => Math.abs(d.old - d.now) > 1e-9) : [];
                return {
                    kind: k, cur: { ...cur, author: authors.get(cur.created_by) || null },
                    prev, archived: ofKind.filter(s => s.status === 'archived').length, diff,
                };
            }).filter(Boolean);

            const inc = {};
            (incRes.data || []).forEach(r => { inc[r.nomenclature_id] = parseFloat(r.incoming_quantity); });

            // Видане поза специфікацією видно лише з рухів об'єкта
            const net = {};
            (movRes.data || []).forEach(m => {
                const sign = m.operation_type === 'issue' ? 1 : -1;
                net[m.nomenclature_id] = (net[m.nomenclature_id] || 0) + sign * parseFloat(m.quantity || 0);
            });
            const specSet = new Set(specIds);
            const extra = Object.entries(net)
                .filter(([id, qty]) => qty > 0.0001 && !specSet.has(parseInt(id, 10)))
                .map(([id, qty]) => ({ nomenclature_id: parseInt(id, 10), quantity: qty }));

            // Зайве після зміни специфікації — окремим блоком, тож з «поза специфікацією» його прибираємо
            const left = leftRes.error ? [] : leftRes.data || [];
            const leftSet = new Set(left.map(l => l.nomenclature_id));

            // Повні назви з категоріями — лише для позицій цього екрана
            const allIds = [...new Set([...specIds, ...extra.map(e => e.nomenclature_id), ...(reqRes.data || []).map(r => r.nomenclature_id),
                ...left.map(l => l.nomenclature_id), ...vers.flatMap(v => v.diff.map(d => d.id))])];
            let map = new Map();
            if (allIds.length) {
                const [nomRes, catRes] = await Promise.all([
                    supabase.from('nomenclature').select('id, name, sku, category_id, tracking_mode, lot_unit_name, unit:units(name)').in('id', allIds),
                    supabase.from('categories').select('id, name, parent_id'),
                ]);
                const catById = new Map((catRes.data || []).map(c => [c.id, c]));
                map = new Map((nomRes.data || []).map(n => {
                    const path = [];
                    let id = n.category_id, guard = 0;
                    while (id && guard++ < 20) {
                        const c = catById.get(id);
                        if (!c) break;
                        path.unshift(c.name);
                        id = c.parent_id;
                    }
                    return [n.id, { ...n, fullName: nomFullName(path, n.name) }];
                }));
            }

            setNeeds(needsData || []);
            setStockRows(stockRes.data || []);
            setReservations(resRes.data || []);
            setRequests(reqRes.data || []);
            setIncoming(inc);
            setOffSpec(extra.filter(e => !leftSet.has(e.nomenclature_id)));
            setOfferEquip(offEqRes.data || []);
            setOfferNeed(offNeedRes.data || null);
            setNomIndex(map);
            setLeftovers(left);
            setVersions(vers);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [inst.custom_id, toast]);

    useEffect(() => { load(); }, [load, reloadKey]);
    useEffect(() => { setLoading(true); }, [inst.custom_id]);

    const refresh = useCallback(async () => { await load(); onChanged?.(); }, [load, onChanged]);

    /* ---------------- ЗАЛИШКИ ---------------- */

    const activeWarehouses = useMemo(() => {
        const act = warehouses.filter(w => w.is_active);
        return act.length ? act : warehouses;
    }, [warehouses]);
    const whName = useCallback((id) => warehouses.find(w => String(w.id) === String(id))?.name || 'склад', [warehouses]);

    const stockMap = useMemo(() => {
        const m = new Map();
        stockRows.forEach(s => m.set(`${s.nomenclature_id}:${s.warehouse_id}`, {
            onHand: parseFloat(s.quantity_on_hand || 0),
            reserved: parseFloat(s.quantity_reserved || 0),
            available: parseFloat(s.quantity_available || 0),
        }));
        return m;
    }, [stockRows]);
    const stockAt = useCallback((nomId, whId) => stockMap.get(`${nomId}:${whId}`) || EMPTY, [stockMap]);

    /** Зарезервовано під цей об'єкт — усього або на конкретному складі */
    const myReserved = useCallback((nomId, whId = null) => reservations
        .filter(r => String(r.nomenclature_id) === String(nomId) && (whId === null || String(r.warehouse_id) === String(whId)))
        .reduce((s, r) => s + (parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity)), 0), [reservations]);

    /** Скільки фізично можна видати звідси: наявність мінус ЧУЖІ резерви */
    const issuableAt = useCallback((nomId, whId) => {
        const s = stockAt(nomId, whId);
        return Math.max(0, s.onHand - (s.reserved - myReserved(nomId, whId)));
    }, [stockAt, myReserved]);

    const freeTotal = useCallback((nomId) => activeWarehouses.reduce((s, w) => s + Math.max(0, stockAt(nomId, w.id).available), 0), [activeWarehouses, stockAt]);
    const nomOf = useCallback((id) => nomIndex.get(id) || null, [nomIndex]);
    const unitOf = useCallback((id) => nomOf(id)?.unit?.name || 'шт', [nomOf]);
    const nameOf = useCallback((n) => nomOf(n.nomenclature_id)?.fullName || n.nomenclature_name || `Позиція #${n.nomenclature_id}`, [nomOf]);

    /* ---------------- СТАН ПОЗИЦІЇ ---------------- */

    const stateOf = useCallback((n) => {
        const required = parseFloat(n.required_quantity) || 0;
        const issued = parseFloat(n.issued_quantity) || 0;
        const reserved = parseFloat(n.reserved_quantity) || 0;
        const left = parseFloat(n.outstanding_need) || 0;
        const inc = incoming[n.nomenclature_id] || 0;
        const free = freeTotal(n.nomenclature_id);
        const mine = myReserved(n.nomenclature_id);
        let key, label, tone, hint;
        if (left <= 0 && mine <= 0) {
            key = 'ready'; label = 'Готово'; tone = 'ok'; hint = 'Видано все за планом';
        } else if (mine > 0 || (left > 0 && free > 0)) {
            key = 'action'; label = 'Можна брати'; tone = 'accent';
            hint = mine > 0 ? `У резерві ${num(mine)} — можна видавати` : `На складах вільно ${num(free)} — можна зарезервувати або видати`;
        } else if (inc >= left && inc > 0) {
            key = 'waiting'; label = 'В дорозі'; tone = 'info'; hint = `Замовлено ${num(inc)} — чекаємо поставку`;
        } else {
            key = 'missing'; label = 'Бракує'; tone = 'danger';
            hint = inc > 0 ? `У дорозі лише ${num(inc)} з ${num(left)}` : 'Немає ні на складах, ні в замовленнях';
        }
        return { key, label, tone, hint, required, issued, reserved, left, inc, free, mine };
    }, [incoming, freeTotal, myReserved]);

    const positions = useMemo(() => needs
        .map(n => ({ n, s: stateOf(n) }))
        .sort((a, b) => STATE_ORDER[a.s.key] - STATE_ORDER[b.s.key] || nameOf(a.n).localeCompare(nameOf(b.n), 'uk')), [needs, stateOf, nameOf]);

    const counts = useMemo(() => {
        const c = { all: positions.length, action: 0, missing: 0, waiting: 0, ready: 0 };
        positions.forEach(p => { c[p.s.key] += 1; });
        return c;
    }, [positions]);

    const shown = useMemo(() => {
        const term = q.trim().toLowerCase();
        return positions.filter(p => (posFilter === 'all' || p.s.key === posFilter)
            && (!term || nameOf(p.n).toLowerCase().includes(term) || (nomOf(p.n.nomenclature_id)?.sku || '').toLowerCase().includes(term)));
    }, [positions, posFilter, q, nameOf, nomOf]);

    const readiness = useMemo(() => {
        if (!needs.length) return null;
        let sum = 0;
        needs.forEach(n => {
            const req = parseFloat(n.required_quantity) || 1;
            sum += Math.min(100, (((parseFloat(n.reserved_quantity) || 0) + (parseFloat(n.issued_quantity) || 0)) / req) * 100);
        });
        return Math.round(sum / needs.length);
    }, [needs]);

    /** Чому дію не можна виконати. Порожньо — можна */
    const blockedReason = useCallback((mode, s) => {
        switch (mode) {
            case 'reserve': return s.left <= 0 ? 'Потреба вже закрита' : s.free <= 0 ? 'На складах немає вільного залишку' : null;
            case 'issue': return s.mine <= 0 && s.left <= 0 ? 'Потреба вже закрита' : s.mine <= 0 && s.free <= 0 ? 'Немає що видавати' : null;
            case 'unreserve': return s.mine > 0 ? null : 'Під цей об’єкт нічого не зарезервовано';
            case 'return': return s.issued > 0 ? null : 'На об’єкт ще нічого не видавали';
            case 'order': return Math.max(0, s.left - s.inc) <= 0 ? 'Потреба закрита або товар у дорозі' : null;
            default: return null;
        }
    }, []);

    /* ---------------- ФОРМА ДІЇ (на місці) ---------------- */

    const startOp = (mode, item) => {
        if (!canProv) return;
        const nomId = item.nomenclature_id;
        const s = item.__offSpec || item.__left ? { left: 0, issued: item.issued_quantity, mine: 0, inc: 0 } : stateOf(item);
        if (mode === 'order') {
            setForm({ mode, item, quantity: String(num(Math.max(0, s.left - s.inc))), note: '' });
            return;
        }
        if (mode === 'keep') {
            setForm({ mode, item, quantity: String(num(item.issued_quantity)), reason: '' });
            return;
        }
        let list = activeWarehouses;
        if (mode === 'reserve') list = list.filter(w => stockAt(nomId, w.id).available > 0).sort((a, b) => stockAt(nomId, b.id).available - stockAt(nomId, a.id).available);
        if (mode === 'issue') list = list.filter(w => issuableAt(nomId, w.id) > 0).sort((a, b) => myReserved(nomId, b.id) - myReserved(nomId, a.id) || issuableAt(nomId, b.id) - issuableAt(nomId, a.id));
        if (mode === 'unreserve') list = list.filter(w => myReserved(nomId, w.id) > 0);
        if (!list.length) { toast('Немає складу, з якого це можна зробити', 'warning'); return; }
        const wh = list[0];
        let qty = 0;
        if (mode === 'reserve') qty = Math.min(s.left, stockAt(nomId, wh.id).available);
        else if (mode === 'issue') { const here = myReserved(nomId, wh.id); qty = Math.min(here > 0 ? here : s.left, issuableAt(nomId, wh.id)); }
        else if (mode === 'unreserve') qty = item.__left ? Math.min(myReserved(nomId, wh.id), item.release_quantity) : myReserved(nomId, wh.id);
        else qty = s.issued;
        setForm({ mode, item, warehouse_id: String(wh.id), quantity: qty > 0 ? String(num(qty)) : '', reason: '' });
    };

    const overPlan = (f) => {
        if (!f) return 0;
        const qty = parseFloat(f.quantity) || 0;
        if (f.mode === 'reserve' || f.mode === 'issue') {
            const s = f.item.__offSpec || f.item.__left ? { left: 0, mine: 0 } : stateOf(f.item);
            const ref = f.mode === 'issue' ? s.left + myReserved(f.item.nomenclature_id) : s.left;
            return Math.max(0, qty - ref);
        }
        if (f.mode === 'return') return Math.max(0, qty - (parseFloat(f.item.issued_quantity) || 0));
        return 0;
    };

    const runForm = async () => {
        const f = form;
        const qty = parseFloat(f.quantity);
        if (!qty || qty <= 0) { toast('Вкажіть кількість більшу за 0', 'error'); return; }
        const over = overPlan(f);
        if (over > 0 && !(f.reason || '').trim()) { toast('Понад план — вкажіть причину', 'warning'); return; }
        const nomId = f.item.nomenclature_id;
        const unit = unitOf(nomId);
        setBusy(true);
        try {
            if (f.mode === 'order') {
                const { error } = await supabase.from('procurement_requests').insert([{
                    installation_custom_id: inst.custom_id, nomenclature_id: nomId, quantity: qty,
                    note: (f.note || '').trim() || null, requested_by: employee?.id ?? null, status: 'requested',
                }]);
                if (error) throw error;
                toast('Заявку на закупівлю створено — її видно в «Закупівлях»', 'success');
            } else if (f.mode === 'keep') {
                if (qty > (parseFloat(f.item.issued_quantity) || 0) + 1e-9) throw new Error(`Лишити можна не більше ${num(f.item.issued_quantity)} ${unit}`);
                const { error } = await supabase.from('spec_leftover_kept').insert([{
                    installation_custom_id: inst.custom_id, nomenclature_id: nomId, quantity: qty,
                    note: (f.reason || '').trim() || null, created_by: employee?.id ?? null,
                }]);
                if (error) throw error;
                toast(`Лишили на об'єкті: ${num(qty)} ${unit}`, 'success');
            } else if (f.mode === 'unreserve') {
                const targets = reservations
                    .filter(r => String(r.warehouse_id) === String(f.warehouse_id) && String(r.nomenclature_id) === String(nomId))
                    .map(r => ({ id: r.id, active: parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity) }))
                    .filter(r => r.active > 0);
                const total = targets.reduce((s, t) => s + t.active, 0);
                if (qty > total + 1e-9) throw new Error(`На цьому складі в резерві лише ${num(total)}`);
                let left = qty;
                for (const t of targets) {
                    if (left <= 0) break;
                    const take = Math.min(t.active, left);
                    // eslint-disable-next-line no-await-in-loop
                    const { data, error } = await supabase.rpc('release_reservation', { p_reservation_id: t.id, p_qty: take, p_emp: employee?.id ?? null });
                    if (error) throw error;
                    if (data?.ok === false) throw new Error(data.message);
                    left -= take;
                }
                toast(`Резерв знято: ${num(qty)} ${unit}`, 'success');
            } else {
                const rpc = f.mode === 'reserve' ? 'reserve_for_object' : f.mode === 'issue' ? 'issue_to_object' : 'return_from_object';
                const args = f.mode === 'reserve'
                    ? { p_installation: inst.custom_id, p_warehouse: parseInt(f.warehouse_id, 10), p_nomenclature: nomId, p_spec_item: f.item.specification_item_id ?? null, p_qty: qty, p_emp: employee?.id ?? null }
                    : { p_installation: inst.custom_id, p_warehouse: parseInt(f.warehouse_id, 10), p_nomenclature: nomId, p_qty: qty, p_reason: (f.reason || '').trim() || null, p_emp: employee?.id ?? null };
                const { data, error } = await supabase.rpc(rpc, args);
                if (error) throw error;
                if (data?.ok === false) throw new Error(data.message);
                toast(`${OPS[f.mode].short}: ${num(qty)} ${unit} · ${whName(f.warehouse_id)}`, 'success');
            }
            setForm(null);
            await refresh();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    /* ---------------- УСЕ ОДРАЗУ ---------------- */

    /** План: що, скільки й з якого складу — показуємо перед проведенням */
    const planFor = useCallback((mode) => {
        const steps = [];
        needs.forEach(n => {
            const nomId = n.nomenclature_id;
            const s = stateOf(n);
            if (mode === 'reserve') {
                let left = s.left;
                activeWarehouses
                    .map(w => ({ w, free: stockAt(nomId, w.id).available }))
                    .filter(x => x.free > 0)
                    .sort((a, b) => b.free - a.free)
                    .forEach(({ w, free }) => {
                        if (left <= 0) return;
                        const qty = Math.min(left, free);
                        left -= qty;
                        steps.push({ key: `${nomId}:${w.id}`, item: n, whId: w.id, qty, on: true });
                    });
            } else {
                activeWarehouses.forEach(w => {
                    const mine = myReserved(nomId, w.id);
                    const qty = Math.min(mine, issuableAt(nomId, w.id));
                    if (qty > 0) steps.push({ key: `${nomId}:${w.id}`, item: n, whId: w.id, qty, on: true });
                });
            }
        });
        return steps;
    }, [needs, stateOf, activeWarehouses, stockAt, myReserved, issuableAt]);

    const reservePlan = useMemo(() => planFor('reserve'), [planFor]);
    const issuePlan = useMemo(() => planFor('issue'), [planFor]);

    const runBulk = async () => {
        const steps = bulk.steps.filter(x => x.on && !x.result);
        if (!steps.length) return;
        setBusy(true);
        const results = {};
        for (const st of steps) {
            const nomId = st.item.nomenclature_id;
            const args = bulk.mode === 'reserve'
                ? { p_installation: inst.custom_id, p_warehouse: st.whId, p_nomenclature: nomId, p_spec_item: st.item.specification_item_id ?? null, p_qty: st.qty, p_emp: employee?.id ?? null }
                : { p_installation: inst.custom_id, p_warehouse: st.whId, p_nomenclature: nomId, p_qty: st.qty, p_reason: null, p_emp: employee?.id ?? null };
            // По одній позиції: якщо одна не пройшла, решта лишається проведеною
            // eslint-disable-next-line no-await-in-loop
            const { data, error } = await supabase.rpc(bulk.mode === 'reserve' ? 'reserve_for_object' : 'issue_to_object', args);
            results[st.key] = error ? { ok: false, msg: humanError(error) } : data?.ok === false ? { ok: false, msg: data.message } : { ok: true };
        }
        const okCount = Object.values(results).filter(r => r.ok).length;
        const failCount = Object.values(results).length - okCount;
        setBulk(b => ({ ...b, done: true, steps: b.steps.map(x => (results[x.key] ? { ...x, result: results[x.key] } : x)) }));
        setBusy(false);
        toast(failCount
            ? `Проведено ${okCount}, не вдалося ${failCount} — причина біля позиції`
            : `${bulk.mode === 'reserve' ? 'Зарезервовано' : 'Видано'}: ${okCount} ${okCount === 1 ? 'позиція' : 'позицій'}`, failCount ? 'warning' : 'success');
        await refresh();
    };

    /* ---------------- ПІСЛЯ ЗМІНИ СПЕЦИФІКАЦІЇ ---------------- */

    const leftItem = (l) => ({
        __left: true, nomenclature_id: l.nomenclature_id, specification_item_id: null,
        issued_quantity: parseFloat(l.to_return) || 0, release_quantity: parseFloat(l.to_release) || 0,
        nomenclature_name: l.name,
    });
    const toReturn = leftovers.filter(l => parseFloat(l.to_return) > 0);

    const openBackBulk = () => setBackBulk(b => (b && !b.done ? null : {
        whId: activeWarehouses[0]?.id ?? null,
        steps: toReturn.map(l => ({ key: String(l.nomenclature_id), item: leftItem(l), qty: parseFloat(l.to_return) || 0, on: true })),
    }));

    const runBackBulk = async () => {
        const steps = backBulk.steps.filter(x => x.on && !x.result);
        if (!steps.length || !backBulk.whId) return;
        setBusy(true);
        const results = {};
        for (const st of steps) {
            // eslint-disable-next-line no-await-in-loop
            const { data, error } = await supabase.rpc('return_from_object', {
                p_installation: inst.custom_id, p_warehouse: Number(backBulk.whId), p_nomenclature: st.item.nomenclature_id,
                p_qty: st.qty, p_reason: 'Зміна специфікації', p_emp: employee?.id ?? null,
            });
            results[st.key] = error ? { ok: false, msg: humanError(error) } : data?.ok === false ? { ok: false, msg: data.message } : { ok: true };
        }
        const okCount = Object.values(results).filter(r => r.ok).length;
        const failCount = Object.values(results).length - okCount;
        setBackBulk(b => ({ ...b, done: true, steps: b.steps.map(x => (results[x.key] ? { ...x, result: results[x.key] } : x)) }));
        setBusy(false);
        toast(failCount ? `Повернуто ${okCount}, не вдалося ${failCount} — причина біля позиції` : `Повернуто на склад: ${okCount} поз.`, failCount ? 'warning' : 'success');
        await refresh();
    };

    /* ---------------- ЗАЯВКИ ---------------- */

    const setRequestStatus = async (id, status) => {
        const { error } = await supabase.from('procurement_requests')
            .update({ status, resolved_by: employee?.id ?? null, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Статус заявки оновлено');
        refresh();
    };

    const deleteRequest = async (req) => {
        if (!can('provisioning', 'delete')) { toast('Видаляти заявки вам не відкрито', 'error'); return; }
        const ok = await confirm({
            title: 'Видалити заявку?', tone: 'danger', confirmLabel: 'Видалити',
            message: nomOf(req.nomenclature_id)?.fullName || `Номенклатура #${req.nomenclature_id}`,
            details: [`${num(req.quantity)} ${unitOf(req.nomenclature_id)}`, 'Закупівельник більше не побачить цю потребу.'],
        });
        if (!ok) return;
        const { error } = await supabase.from('procurement_requests').delete().eq('id', req.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Заявку видалено');
        refresh();
    };

    /* ---------------- ЧАСТИНИ ---------------- */

    const coverSegments = (s) => {
        const base = s.required || 1;
        const pct = (v) => Math.max(0, Math.min(100, (v / base) * 100));
        const v = splitLeft(s);
        return [
            { pct: pct(v.issued), tone: 'ok' },
            { pct: pct(v.reserved), tone: 'accent' },
            { pct: pct(v.stock), tone: 'warn' },
            { pct: pct(v.inc), tone: 'info' },
            { pct: pct(v.missing), tone: 'danger' },
        ];
    };

    /** Форма дії під рядком: склад, кількість, причина / коментар */
    const renderForm = (item) => {
        if (!form || form.item.nomenclature_id !== item.nomenclature_id
            || !!form.item.__offSpec !== !!item.__offSpec || !!form.item.__left !== !!item.__left) return null;
        const nomId = item.nomenclature_id;
        const unit = unitOf(nomId);
        const over = overPlan(form);
        const isOrder = form.mode === 'order';
        const isKeep = form.mode === 'keep';
        const whHint = (w) => {
            if (form.mode === 'reserve') return `вільно ${num(stockAt(nomId, w.id).available)}`;
            if (form.mode === 'issue') return `можна ${num(issuableAt(nomId, w.id))}${myReserved(nomId, w.id) > 0 ? `, резерв ${num(myReserved(nomId, w.id))}` : ''}`;
            if (form.mode === 'unreserve') return `резерв ${num(myReserved(nomId, w.id))}`;
            return '';
        };
        return (
            <div className="mt-2.5 p-3 rounded-lg border border-indigo-200 bg-white space-y-2.5">
                <div className="text-[13px] font-bold text-slate-900 inline-flex items-center gap-2">
                    {React.createElement(OPS[form.mode].icon, { size: 11, className: 'text-indigo-500' })} {OPS[form.mode].label}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-2">
                    {!isOrder && !isKeep && (
                        <label className="block min-w-0">
                            <span className="text-[12px] font-semibold text-slate-500">{form.mode === 'return' ? 'На склад' : 'Склад'}</span>
                            <select className={`${T.select} mt-1`} value={form.warehouse_id} onChange={e => setForm(x => ({ ...x, warehouse_id: e.target.value }))}>
                                {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}{whHint(w) ? ` — ${whHint(w)}` : ''}</option>)}
                            </select>
                        </label>
                    )}
                    <label className={`block ${isOrder || isKeep ? 'sm:col-span-2 sm:max-w-[200px]' : ''}`}>
                        <span className="text-[12px] font-semibold text-slate-500">Кількість, {unit}</span>
                        <input type="number" min="0" step="any" inputMode="decimal" autoFocus={autoFocus}
                            className={`${T.input} mt-1 text-[15px] font-bold tabular-nums ${over > 0 ? 'border-amber-400 bg-amber-50' : ''}`}
                            value={form.quantity} onChange={e => setForm(x => ({ ...x, quantity: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') runForm(); if (e.key === 'Escape') setForm(null); }} />
                    </label>
                </div>
                {over > 0 && !isKeep && (
                    <div className="text-[12px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        Понад план на {num(over)} {unit} — провести можна, але вкажіть причину.
                    </div>
                )}
                {isOrder ? (
                    <input className={T.input} placeholder="Коментар для закупівлі (необов’язково)" value={form.note}
                        onChange={e => setForm(x => ({ ...x, note: e.target.value }))} />
                ) : form.mode !== 'unreserve' && (
                    <input className={T.input}
                        placeholder={isKeep ? 'Чому лишаємо: пішло в роботу, запас… (необов’язково)' : over > 0 ? 'Причина — обов’язково' : 'Коментар (необов’язково)'}
                        value={form.reason}
                        onChange={e => setForm(x => ({ ...x, reason: e.target.value }))} />
                )}
                <div className="flex justify-end gap-2">
                    <Btn size="sm" variant="ghost" onClick={() => setForm(null)}>Скасувати</Btn>
                    <Btn size="sm" variant={OPS[form.mode].variant === 'soft' ? 'primary' : OPS[form.mode].variant === 'softWarn' ? 'accent' : OPS[form.mode].variant}
                        icon={FaCheck} onClick={runForm} disabled={busy}>
                        {busy ? 'Проводимо…' : isOrder ? 'Створити заявку' : isKeep ? 'Лишити' : 'Провести'}
                    </Btn>
                </div>
            </div>
        );
    };

    const renderPosition = ({ n, s }) => {
        const nom = nomOf(n.nomenclature_id);
        const unit = unitOf(n.nomenclature_id);
        const isOpen = open === n.nomenclature_id;
        const activeReq = requests.find(r => r.nomenclature_id === n.nomenclature_id && ['requested', 'ordered'].includes(r.status));
        const values = splitLeft(s);
        return (
            <li key={n.specification_item_id || n.nomenclature_id} className={isOpen ? 'bg-slate-50/80' : ''}>
                <button type="button" onClick={() => { setOpen(o => (o === n.nomenclature_id ? null : n.nomenclature_id)); setForm(null); }}
                    aria-expanded={isOpen}
                    className="w-full text-left px-3 sm:px-4 py-2.5 hover:bg-slate-50">
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-semibold text-slate-900 leading-snug break-words">{nameOf(n)}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                {nom?.sku && <span className={T.mono}>{nom.sku}</span>}
                                {nom?.tracking_mode === 'lot' && <Chip tone="info" icon={FaLayerGroup}>{nom.lot_unit_name || 'бухти'}</Chip>}
                                {activeReq && <Chip tone={REQ_STATUS[activeReq.status]?.tone}>{REQ_STATUS[activeReq.status]?.label}</Chip>}
                            </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                            <Chip tone={s.tone}>{s.label}</Chip>
                            <div className="text-[13px] font-bold tabular-nums text-slate-900 mt-1">{num(s.required)} <span className="text-[11px] font-semibold text-slate-400">{unit}</span></div>
                        </div>
                        <FaChevronDown size={10} className={`mt-1.5 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                    <Bar className="mt-2" segments={coverSegments(s)} />
                    <div className="flex items-center gap-x-3 gap-y-1 mt-1.5 flex-wrap">
                        {LEGEND.filter(l => values[l.key] > 0).map(l => (
                            <span key={l.key} className="inline-flex items-center gap-1 text-[11.5px]">
                                <span className={`w-2 h-2 rounded-sm ${l.dot}`} />
                                <b className={`tabular-nums ${l.text}`}>{num(values[l.key])}</b>
                                <span className="text-slate-500">{l.label}</span>
                            </span>
                        ))}
                    </div>
                </button>

                {isOpen && (
                    <div className="px-3 sm:px-4 pb-3">
                        <div className="text-[12.5px] text-slate-600 mb-2">{s.hint}</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[12.5px] bg-white border border-slate-200 rounded-lg px-3 py-2">
                            {[['Потрібно', s.required], ['Видано', s.issued], ['У резерві', s.mine], ['Лишилось', s.left], ['В дорозі', s.inc], ['Вільно на складах', s.free]].map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between gap-2">
                                    <span className="text-slate-500">{k}</span>
                                    <b className="tabular-nums text-slate-900">{num(v)} <span className="text-[11px] font-semibold text-slate-400">{unit}</span></b>
                                </div>
                            ))}
                        </div>
                        {activeWarehouses.some(w => stockAt(n.nomenclature_id, w.id).onHand > 0 || myReserved(n.nomenclature_id, w.id) > 0) && (
                            <div className="mt-1.5 text-[12px] text-slate-500 break-words">
                                По складах: {activeWarehouses
                                    .filter(w => stockAt(n.nomenclature_id, w.id).onHand > 0 || myReserved(n.nomenclature_id, w.id) > 0)
                                    .map(w => `${w.name} — вільно ${num(stockAt(n.nomenclature_id, w.id).available)}${myReserved(n.nomenclature_id, w.id) > 0 ? `, наш резерв ${num(myReserved(n.nomenclature_id, w.id))}` : ''}`)
                                    .join(' · ')}
                            </div>
                        )}
                        {canProv && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {['reserve', 'issue', 'unreserve', 'return', 'order'].map(mode => {
                                    const why = mode === 'order' && activeReq ? 'Заявка вже є' : blockedReason(mode, s);
                                    const on = form?.mode === mode && form.item.nomenclature_id === n.nomenclature_id && !form.item.__offSpec;
                                    return (
                                        <Btn key={mode} size="sm" variant={on ? 'primary' : why ? 'outline' : OPS[mode].variant}
                                            icon={OPS[mode].icon} disabled={!!why} title={why || OPS[mode].label}
                                            onClick={() => (on ? setForm(null) : startOp(mode, n))}>
                                            {OPS[mode].short}
                                        </Btn>
                                    );
                                })}
                            </div>
                        )}
                        {renderForm(n)}
                    </div>
                )}
            </li>
        );
    };

    const status = getObjectStatus(inst.status);
    const showStatus = !['planning', 'in_progress'].includes(inst.status);

    return (
        <div className="space-y-2.5">
            {/* Шапка об'єкта */}
            <Card pad="p-3">
                <button type="button" onClick={onBack}
                    className="text-[12.5px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 mb-1.5">
                    <FaChevronLeft size={9} /> Усі об'єкти
                </button>
                <div className="flex items-start gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                        <div className="text-[16px] font-bold text-slate-900 leading-snug break-words">
                            <span className={`${T.mono} mr-1.5`}>СЕС-{inst.custom_id}</span>{inst.name}
                        </div>
                        <div className="text-[12.5px] text-slate-500 break-words">
                            {[inst.client?.company_name || inst.client?.name, inst.client?.populated_place, inst.managerName].filter(Boolean).join(' · ') || 'Клієнт не вказаний'}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {inst.workflow_stage && <Chip tone="neutral" icon={FaHardHat}>{getStageGroupLabel(inst.workflow_stage)}</Chip>}
                            {showStatus && <Chip tone={status.tone}>{status.label}</Chip>}
                            {inst.mine && <Chip tone="accent">мій</Chip>}
                            <button type="button" onClick={() => navigate(`/project/${inst.custom_id}`)}
                                className="h-6 px-2 rounded-md text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50 inline-flex items-center gap-1.5">
                                <FaExternalLinkAlt size={9} /> Картка об'єкта
                            </button>
                        </div>
                    </div>
                    {/* На телефоні — окремим рядком на всю ширину, щоб назва об'єкта не стискалась */}
                    {(canProv || readiness != null) && (
                        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                            {canProv && (
                                <Btn variant="outline" icon={FaClipboardList} onClick={() => onManual?.('complectation')}>
                                    Комплектація вручну
                                </Btn>
                            )}
                            {readiness != null && (
                                <div className="text-right ml-auto sm:ml-0">
                                    <div className="text-[20px] font-black tabular-nums text-slate-900 leading-none">{readiness}%</div>
                                    <div className="text-[11.5px] font-semibold text-slate-400 mt-0.5">забезпечено</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Card>

            {alertsNode}

            {/* Після зміни специфікації: що зі старої версії вже на об'єкті чи в резерві */}
            {!loading && leftovers.length > 0 && (
                <div className={`${T.card} overflow-hidden border-amber-200`}>
                    <div className="px-3 sm:px-4 py-2.5 border-b border-amber-100 bg-amber-50/60 flex flex-wrap items-center gap-2">
                        <FaExchangeAlt className="text-amber-600" size={12} />
                        <span className="text-[13.5px] font-bold text-slate-900">Після зміни специфікації</span>
                        <Tip text="Позиції, яких у новій версії менше або немає, а за старою їх уже видали чи зарезервували. Поверніть на склад, зніміть резерв або лишіть на об'єкті, якщо вони пішли в роботу." />
                        <span className="mr-auto" />
                        {toReturn.length > 0 && canProv && (
                            <Btn size="sm" variant={backBulk && !backBulk.done ? 'primary' : 'softWarn'} icon={FaUndo} onClick={openBackBulk}>
                                Повернути все · {toReturn.length}
                            </Btn>
                        )}
                    </div>

                    {backBulk && (
                        <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 space-y-2">
                            <label className="flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-slate-600">
                                На склад
                                <select className={`${T.select} !w-auto`} value={backBulk.whId ?? ''} disabled={backBulk.done || busy}
                                    onChange={e => setBackBulk(b => ({ ...b, whId: e.target.value }))}>
                                    {activeWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </label>
                            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                                {backBulk.steps.map(st => (
                                    <li key={st.key} className="px-3 py-2 flex items-start gap-2.5">
                                        <input type="checkbox" checked={st.on} disabled={!!st.result || busy}
                                            onChange={() => setBackBulk(b => ({ ...b, steps: b.steps.map(x => (x.key === st.key ? { ...x, on: !x.on } : x)) }))}
                                            className="mt-1 w-4 h-4 accent-indigo-600 flex-shrink-0" aria-label={st.item.nomenclature_name} />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13px] font-semibold text-slate-800 break-words">{nomOf(st.item.nomenclature_id)?.fullName || st.item.nomenclature_name}</div>
                                            <div className="text-[12px] text-slate-500">{num(st.qty)} {unitOf(st.item.nomenclature_id)}</div>
                                            {st.result && !st.result.ok && <div className="text-[12px] font-semibold text-rose-600 break-words">{st.result.msg}</div>}
                                        </div>
                                        {st.result && (st.result.ok ? <Chip tone="ok" icon={FaCheck}>готово</Chip> : <Chip tone="danger" icon={FaTimes}>не вдалося</Chip>)}
                                    </li>
                                ))}
                            </ul>
                            <div className="flex justify-end gap-2">
                                <Btn size="sm" variant="ghost" onClick={() => setBackBulk(null)}>{backBulk.done ? 'Закрити' : 'Скасувати'}</Btn>
                                {!backBulk.done && (
                                    <Btn size="sm" variant="accent" icon={FaCheck} onClick={runBackBulk} disabled={busy || !backBulk.whId || !backBulk.steps.some(x => x.on)}>
                                        {busy ? 'Проводимо…' : `Повернути · ${backBulk.steps.filter(x => x.on).length}`}
                                    </Btn>
                                )}
                            </div>
                        </div>
                    )}

                    <ul className="divide-y divide-slate-100">
                        {leftovers.map(l => {
                            const item = leftItem(l);
                            const unit = unitOf(l.nomenclature_id);
                            const back = parseFloat(l.to_return) || 0;
                            const release = parseFloat(l.to_release) || 0;
                            return (
                                <li key={l.nomenclature_id} className="px-3 sm:px-4 py-2.5">
                                    <div className="flex flex-wrap items-start gap-2">
                                        <div className="min-w-0 flex-1 basis-[220px]">
                                            <div className="text-[13px] font-semibold text-slate-900 break-words">{nomOf(l.nomenclature_id)?.fullName || l.name}</div>
                                            <div className="text-[12px] text-slate-500 break-words">
                                                було {num(l.old_q)} → стало {num(l.new_q)} · видано {num(l.issued)}
                                                {parseFloat(l.kept) > 0 ? ` · лишили на об'єкті ${num(l.kept)}` : ''}
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-1.5">
                                                {back > 0 && <Chip tone="warn">повернути {num(back)} {unit}</Chip>}
                                                {release > 0 && <Chip tone="accent">зняти резерв {num(release)} {unit}</Chip>}
                                            </div>
                                        </div>
                                        {canProv && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {back > 0 && ['return', 'keep'].map(mode => {
                                                    const on = form?.mode === mode && form.item.__left && form.item.nomenclature_id === l.nomenclature_id;
                                                    return (
                                                        <Btn key={mode} size="sm" variant={on ? 'primary' : OPS[mode].variant} icon={OPS[mode].icon}
                                                            onClick={() => (on ? setForm(null) : startOp(mode, item))}>{OPS[mode].short}</Btn>
                                                    );
                                                })}
                                                {release > 0 && (() => {
                                                    const on = form?.mode === 'unreserve' && form.item.__left && form.item.nomenclature_id === l.nomenclature_id;
                                                    return (
                                                        <Btn size="sm" variant={on ? 'primary' : OPS.unreserve.variant} icon={OPS.unreserve.icon}
                                                            onClick={() => (on ? setForm(null) : startOp('unreserve', item))}>{OPS.unreserve.short}</Btn>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                    {renderForm(item)}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {loading ? <Card><Skeleton rows={8} /></Card> : needs.length === 0 ? (
                <Card>
                    <EmptyState icon={FaBoxOpen} title="Специфікація порожня або не затверджена"
                        hint="Оцифруйте специфікацію на етапі проекту або внесіть комплектацію вручну.">
                        {canProv && <Btn variant="accent" icon={FaClipboardList} onClick={() => onManual?.('complectation')}>Внести вручну</Btn>}
                    </EmptyState>
                </Card>
            ) : <>
                {/* Усе одразу: план видно перед проведенням */}
                {canProv && (reservePlan.length > 0 || issuePlan.length > 0) && (
                    <Card pad="p-3" className="space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-bold text-slate-900 mr-auto">Одразу на всі позиції</span>
                            {reservePlan.length > 0 && (
                                <Btn size="sm" variant={bulk?.mode === 'reserve' ? 'primary' : 'accent'} icon={FaLock}
                                    onClick={() => setBulk(b => (b?.mode === 'reserve' && !b.done ? null : { mode: 'reserve', steps: reservePlan.map(x => ({ ...x })) }))}>
                                    Зарезервувати вільне · {new Set(reservePlan.map(x => x.item.nomenclature_id)).size}
                                </Btn>
                            )}
                            {issuePlan.length > 0 && (
                                <Btn size="sm" variant={bulk?.mode === 'issue' ? 'primary' : 'ok'} icon={FaArrowUp}
                                    onClick={() => setBulk(b => (b?.mode === 'issue' && !b.done ? null : { mode: 'issue', steps: issuePlan.map(x => ({ ...x })) }))}>
                                    Видати зарезервоване · {new Set(issuePlan.map(x => x.item.nomenclature_id)).size}
                                </Btn>
                            )}
                        </div>
                        {bulk && (
                            <div className="rounded-lg border border-slate-200 overflow-hidden">
                                <div className="px-3 py-2 bg-slate-50 text-[12.5px] font-semibold text-slate-600">
                                    {bulk.mode === 'reserve' ? 'Поставимо в резерв під об\'єкт' : 'Видамо на об\'єкт'} — зніміть позначку з того, що не треба
                                </div>
                                <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                                    {bulk.steps.map(st => (
                                        <li key={st.key} className="px-3 py-2 flex items-start gap-2.5">
                                            <input type="checkbox" checked={st.on} disabled={!!st.result || busy}
                                                onChange={() => setBulk(b => ({ ...b, steps: b.steps.map(x => (x.key === st.key ? { ...x, on: !x.on } : x)) }))}
                                                className="mt-1 w-4 h-4 accent-indigo-600 flex-shrink-0" aria-label={nameOf(st.item)} />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-[13px] font-semibold text-slate-800 break-words">{nameOf(st.item)}</div>
                                                <div className="text-[12px] text-slate-500">
                                                    {num(st.qty)} {unitOf(st.item.nomenclature_id)} · зі складу «{whName(st.whId)}»
                                                </div>
                                                {st.result && !st.result.ok && <div className="text-[12px] font-semibold text-rose-600 break-words">{st.result.msg}</div>}
                                            </div>
                                            {st.result && (st.result.ok
                                                ? <Chip tone="ok" icon={FaCheck}>готово</Chip>
                                                : <Chip tone="danger" icon={FaTimes}>не вдалося</Chip>)}
                                        </li>
                                    ))}
                                </ul>
                                <div className="px-3 py-2 border-t border-slate-100 flex justify-end gap-2">
                                    <Btn size="sm" variant="ghost" onClick={() => setBulk(null)}>{bulk.done ? 'Закрити' : 'Скасувати'}</Btn>
                                    {!bulk.done && (
                                        <Btn size="sm" variant={bulk.mode === 'reserve' ? 'accent' : 'ok'} icon={FaCheck} onClick={runBulk}
                                            disabled={busy || !bulk.steps.some(x => x.on)}>
                                            {busy ? 'Проводимо…' : `Провести · ${bulk.steps.filter(x => x.on).length}`}
                                        </Btn>
                                    )}
                                </div>
                            </div>
                        )}
                    </Card>
                )}

                {/* Позиції */}
                <div className={`${T.card} overflow-hidden`}>
                    <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 space-y-2">
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                            {POS_FILTERS.map(f => (counts[f.key] > 0 || f.key === 'all') && (
                                <button key={f.key} type="button" onClick={() => setPosFilter(f.key)} className={chipBtn(posFilter === f.key)}>
                                    {f.label} <span className={`tabular-nums ${posFilter === f.key ? 'opacity-70' : 'text-slate-400'}`}>{counts[f.key]}</span>
                                </button>
                            ))}
                        </div>
                        {positions.length > 8 && (
                            <div className="relative">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={11} />
                                <input className={`${T.input} pl-8`} value={q} onChange={e => setQ(e.target.value)} placeholder="Пошук позиції або артикулу…" />
                            </div>
                        )}
                    </div>
                    {shown.length === 0
                        ? <div className="px-4 py-5 text-center text-[13px] text-slate-400">За цим фільтром позицій немає</div>
                        : <ul className="divide-y divide-slate-100">{shown.map(renderPosition)}</ul>}
                </div>
            </>}

            {/* Версії специфікацій: чинна кожного виду і що змінилось проти попередньої */}
            {!loading && versions.length > 0 && (
                <div className={`${T.card} overflow-hidden`}>
                    <button type="button" onClick={() => setVersionsOpen(v => !v)} aria-expanded={versionsOpen}
                        className="w-full px-3 sm:px-4 py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-left hover:bg-slate-50">
                        <FaHistory className="text-slate-500" size={12} />
                        <span className="text-[13.5px] font-bold text-slate-900">Версії специфікацій</span>
                        <span className="text-[12px] text-slate-500 break-words">{versions.map(v => `${v.kind.short} V.${v.cur.version}`).join(' · ')}</span>
                        {versions.some(v => v.diff.length) && <Chip tone="warn">змінювались</Chip>}
                        <FaChevronDown size={10} className={`ml-auto text-slate-400 transition-transform ${versionsOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {versionsOpen && (
                        <ul className="divide-y divide-slate-100 border-t border-slate-100">
                            {versions.map(v => (
                                <li key={v.kind.key} className="px-3 sm:px-4 py-2.5">
                                    <div className="text-[13px] font-bold text-slate-900">{v.kind.label}: V.{v.cur.version}</div>
                                    <div className="text-[12px] text-slate-500 break-words">
                                        {[fmtDate(v.cur.confirmed_at || v.cur.created_at), v.cur.author, v.cur.name].filter(Boolean).join(' · ')}
                                        {v.prev ? ` · замість V.${v.prev.version} від ${fmtDate(v.prev.confirmed_at || v.prev.created_at)}` : ' · перша версія'}
                                        {v.archived > 1 ? ` · в архіві ${v.archived}` : ''}
                                    </div>
                                    {v.prev && (v.diff.length === 0 ? (
                                        <div className="text-[12px] text-slate-400 mt-1">Позиції ті самі</div>
                                    ) : (
                                        <ul className="mt-1.5 space-y-0.5">
                                            {v.diff.map(d => {
                                                const added = d.old === 0, removed = d.now === 0;
                                                return (
                                                    <li key={d.id} className="text-[12.5px] flex items-start gap-2">
                                                        <span className={`w-4 flex-shrink-0 font-black text-center ${added ? 'text-emerald-600' : removed ? 'text-rose-600' : 'text-amber-600'}`}>
                                                            {added ? '+' : removed ? '−' : '±'}
                                                        </span>
                                                        <span className="min-w-0 flex-1 break-words text-slate-800">{nomOf(d.id)?.fullName || d.name || `Позиція #${d.id}`}</span>
                                                        <span className="tabular-nums whitespace-nowrap text-slate-600">
                                                            {added ? num(d.now) : removed ? `було ${num(d.old)}` : `${num(d.old)} → ${num(d.now)}`} {unitOf(d.id)}
                                                        </span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ))}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            {/* Заявки на закупівлю */}
            {!loading && requests.length > 0 && (
                <div className={`${T.card} overflow-hidden`}>
                    <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                        <FaShoppingCart className="text-amber-500" size={12} />
                        <span className="text-[13.5px] font-bold text-slate-900">Заявки на закупівлю</span>
                        <Chip tone="warn">{requests.length}</Chip>
                    </div>
                    <ul className="divide-y divide-slate-100">
                        {requests.map(r => {
                            const closed = ['done', 'rejected'].includes(r.status);
                            return (
                                <li key={r.id} className={`px-3 sm:px-4 py-2.5 flex items-center gap-2 flex-wrap ${closed ? 'opacity-60' : ''}`}>
                                    <div className="min-w-0 flex-1 basis-[200px]">
                                        <div className="text-[13px] font-semibold text-slate-900 break-words">{nomOf(r.nomenclature_id)?.fullName || `Номенклатура #${r.nomenclature_id}`}</div>
                                        <div className="text-[12px] text-slate-400 break-words">
                                            {new Date(r.created_at).toLocaleDateString('uk-UA')}{r.source === 'auto_protection' ? ' · автоматично (захист)' : ''}{r.note && r.source !== 'auto_protection' ? ` · ${r.note}` : ''}
                                        </div>
                                    </div>
                                    <span className="text-[13px] font-bold tabular-nums text-amber-700">{num(r.quantity)} <span className="text-[11px] text-amber-500">{unitOf(r.nomenclature_id)}</span></span>
                                    <select className={`${T.select} !w-44`} value={r.status} disabled={!canProv} onChange={e => setRequestStatus(r.id, e.target.value)}>
                                        {Object.entries(REQ_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                    </select>
                                    {can('provisioning', 'delete') && <IconBtn icon={FaTrash} label="Видалити заявку" className="hover:!text-rose-600" onClick={() => deleteRequest(r)} />}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Видано поза специфікацією — можна повернути */}
            {!loading && offSpec.length > 0 && (
                <div className={`${T.card} overflow-hidden`}>
                    <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
                        <FaExclamationTriangle className="text-amber-500" size={12} />
                        <span className="text-[13.5px] font-bold text-slate-900">Видано поза специфікацією</span>
                        <Chip tone="warn">{offSpec.length}</Chip>
                    </div>
                    <ul className="divide-y divide-slate-100">
                        {offSpec.map(row => {
                            const item = { __offSpec: true, nomenclature_id: row.nomenclature_id, issued_quantity: row.quantity, specification_item_id: null, nomenclature_name: nomOf(row.nomenclature_id)?.fullName };
                            const on = form?.item?.__offSpec && form.item.nomenclature_id === row.nomenclature_id;
                            return (
                                <li key={row.nomenclature_id} className="px-3 sm:px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-semibold text-slate-900 flex-1 min-w-0 break-words">{nomOf(row.nomenclature_id)?.fullName || `Номенклатура #${row.nomenclature_id}`}</span>
                                        <span className="text-[13px] font-bold tabular-nums text-slate-900">{num(row.quantity)} <span className="text-[11px] text-slate-400">{unitOf(row.nomenclature_id)}</span></span>
                                        {canProv && <Btn size="sm" variant={on ? 'primary' : 'softWarn'} icon={FaUndo} onClick={() => (on ? setForm(null) : startOp('return', item))}>Повернути</Btn>}
                                    </div>
                                    {renderForm(item)}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* Обладнання з КП — для звірки, що саме продали клієнту */}
            {!loading && offerEquip.length > 0 && (
                <div className={`${T.card} overflow-hidden`}>
                    <button type="button" onClick={() => setOfferOpen(v => !v)} aria-expanded={offerOpen}
                        className="w-full px-3 sm:px-4 py-2.5 flex items-center gap-2 text-left hover:bg-slate-50">
                        <FaFileInvoiceDollar className="text-indigo-500" size={12} />
                        <span className="text-[13.5px] font-bold text-slate-900">Обладнання з КП</span>
                        <Chip tone="accent">{offerEquip.length}</Chip>
                        {offerNeed?.need_status === 'confirmed' && <Chip tone="ok">у потребі об'єкта</Chip>}
                        {offerNeed?.need_status === 'superseded' && <Chip tone="neutral">замінено комплектацією</Chip>}
                        {!['confirmed', 'superseded'].includes(offerNeed?.need_status) && <Chip tone="warn">не в потребі</Chip>}
                        <FaChevronDown size={10} className={`ml-auto text-slate-400 transition-transform ${offerOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {offerOpen && (
                        <ul className="divide-y divide-slate-100 border-t border-slate-100">
                            {offerEquip.map(o => (
                                <li key={o.offer_item_id} className="px-3 sm:px-4 py-2 flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-semibold text-slate-900 break-words">{o.nomenclature_name || <span className="text-rose-600">не впізнано складом</span>}</div>
                                        <div className="text-[12px] text-slate-500 break-words">{o.category_label}{o.offer_name ? ` · ${o.offer_name}` : ''}{o.match_source === 'fuzzy' ? ' · за схожістю' : ''}</div>
                                    </div>
                                    <span className="text-[13px] font-bold tabular-nums text-slate-900">{num(o.quantity)} <span className="text-[11px] text-slate-400">{o.unit_code || o.unit || ''}</span></span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

        </div>
    );
}
