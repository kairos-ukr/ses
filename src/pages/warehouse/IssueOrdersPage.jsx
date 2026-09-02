// =====================================================================
//  Видача — документи комплектації.
//
//  Менеджер складає список: кому і що. Комірник відкриває документ,
//  бачить по кожній позиції, чи є вона на складі, збирає — і аж потім
//  підтверджує видачу. Рухи по складу проводяться в момент підтвердження.
//
//  Між «домовились» і «видали» тепер є документ, а не пам'ять комірника.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FaPlus, FaTrash, FaHardHat, FaUserTie, FaWarehouse, FaCheck, FaBan,
    FaClipboardList, FaBoxOpen, FaPrint, FaLock, FaExclamationTriangle,
    FaChevronDown, FaTruckLoading, FaEdit,
} from 'react-icons/fa';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthProvider';
import {
    T, Btn, IconBtn, Chip, Card, Field, Picker, Bar, EmptyState,
    Skeleton, Modal, useToast, useConfirm, humanError, num,
    useIsMobile,
} from '../../ui';
import { printPickingList } from '../../utils/pickingListPrint';

const STATUS = {
    draft: { label: 'Чернетка', tone: 'neutral' },
    ready: { label: 'До видачі', tone: 'warn' },
    issued: { label: 'Видано', tone: 'ok' },
    cancelled: { label: 'Скасовано', tone: 'danger' },
};

const PURPOSE = {
    issue: { label: "Видача на об'єкт", short: 'Видача' },
    sale: { label: 'Продаж клієнту', short: 'Продаж' },
};

const emptyDoc = () => ({
    warehouse_id: '', purpose: 'issue',
    installation_custom_id: '', client_id: '',
    recipient_name: '', recipient_phone: '',
    needed_by: '', notes: '',
    items: [],
});

export default function IssueOrdersPage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const isMobile = useIsMobile();

    const [orders, setOrders] = useState([]);
    const [readiness, setReadiness] = useState({});   // item_id → рядок готовності
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('open');
    const [expandedId, setExpandedId] = useState(null);
    const [busy, setBusy] = useState(false);

    // Довідники
    const [warehouses, setWarehouses] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [clients, setClients] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);

    // Модалки
    const [editor, setEditor] = useState(null);       // { id?, ...emptyDoc() }
    const [picking, setPicking] = useState(null);     // { order, lines: {itemId: qty} }

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const loadDicts = useCallback(async () => {
        const [whRes, instRes, clRes, nomRes, catRes] = await Promise.all([
            supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
            supabase.from('installations').select('custom_id, name').in('status', ['planning', 'in_progress', 'pending']),
            supabase.from('clients').select('id, name, phone').order('name'),
            supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(name)').eq('is_active', true),
            supabase.from('categories').select('id, name, parent_id'),
        ]);

        setWarehouses(whRes.data || []);
        setInstallations(instRes.data || []);
        setClients(clRes.data || []);

        const catById = new Map((catRes.data || []).map(c => [c.id, c]));
        setNomenclatures((nomRes.data || []).map(n => {
            const path = [];
            let id = n.category_id, guard = 0;
            while (id && guard++ < 20) {
                const c = catById.get(id);
                if (!c) break;
                path.unshift(c.name);
                id = c.parent_id;
            }
            return { ...n, fullName: `${path.join(' ')} ${n.name}`.trim() };
        }).sort((a, b) => a.fullName.localeCompare(b.fullName, 'uk')));
    }, []);

    const loadOrders = useCallback(async () => {
        setLoading(true);
        try {
            let q = supabase.from('issue_orders').select(`
                *,
                warehouse:warehouses(name),
                installation:installations(name),
                client:clients(name, phone),
                requester:employees!issue_orders_requested_by_fkey(name),
                issuer:employees!issue_orders_issued_by_fkey(name),
                items:issue_order_items(*, nomenclature:nomenclature(id, name, sku, unit:units(name)))
            `).order('created_at', { ascending: false }).limit(200);

            if (statusFilter === 'open') q = q.in('status', ['draft', 'ready']);
            else if (statusFilter !== 'all') q = q.eq('status', statusFilter);

            const { data, error } = await q;
            if (error) throw error;
            setOrders(data || []);

            // Готовність по позиціях відкритих документів
            const openIds = (data || []).filter(o => ['draft', 'ready'].includes(o.status)).map(o => o.id);
            if (openIds.length) {
                const { data: rd } = await supabase.from('v_issue_order_readiness')
                    .select('*').in('issue_order_id', openIds);
                const map = {};
                (rd || []).forEach(r => { map[r.item_id] = r; });
                setReadiness(map);
            } else setReadiness({});
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
    }, [statusFilter, toast]);

    useEffect(() => { loadDicts(); }, [loadDicts]);
    useEffect(() => { loadOrders(); }, [loadOrders]);

    // Сигнал «створити» з оболонки складу
    const [prevTrigger, setPrevTrigger] = useState(externalActionTrigger);
    useEffect(() => {
        if (externalActionTrigger > prevTrigger) setEditor({ ...emptyDoc() });
        setPrevTrigger(externalActionTrigger);
    }, [externalActionTrigger, prevTrigger]);

    /* ---------------- ДОПОМІЖНЕ ---------------- */

    const nomById = useMemo(() => new Map(nomenclatures.map(n => [n.id, n])), [nomenclatures]);

    const nomOptions = useMemo(
        () => nomenclatures.map(n => ({ id: n.id, label: `${n.fullName}${n.sku ? ` · ${n.sku}` : ''}` })),
        [nomenclatures]
    );
    const whOptions = useMemo(() => warehouses.map(w => ({ id: w.id, label: w.name })), [warehouses]);
    const instOptions = useMemo(
        () => installations.map(i => ({ id: i.custom_id, label: `#${i.custom_id} ${i.name}` })),
        [installations]
    );
    const clientOptions = useMemo(
        () => clients.map(c => ({ id: c.id, label: c.name })), [clients]
    );

    const recipientOf = (o) => o.installation
        ? `Об'єкт «${o.installation.name}»`
        : o.client ? o.client.name
            : o.recipient_name || '—';

    /** Стан комплектації документа: скільки позицій готово до видачі */
    const docReadiness = useCallback((order) => {
        const items = order.items || [];
        let ready = 0, partial = 0, missing = 0, outstandingTotal = 0;
        items.forEach(it => {
            const r = readiness[it.id];
            const outstanding = Math.max(0, Number(it.requested_quantity) - Number(it.issued_quantity));
            outstandingTotal += outstanding;
            if (outstanding <= 0) { ready += 1; return; }
            const can = r ? Number(r.can_issue_now) : 0;
            if (can >= outstanding) ready += 1;
            else if (can > 0) partial += 1;
            else missing += 1;
        });
        const total = items.length || 1;
        return {
            ready, partial, missing, outstandingTotal,
            pct: Math.round((ready / total) * 100),
            canStart: ready + partial > 0,
            allGood: missing === 0 && partial === 0,
        };
    }, [readiness]);

    const filteredOrders = useMemo(() => {
        const term = externalSearch.trim().toLowerCase();
        if (!term) return orders;
        return orders.filter(o =>
            o.doc_number.toLowerCase().includes(term)
            || recipientOf(o).toLowerCase().includes(term)
            || (o.recipient_name || '').toLowerCase().includes(term)
            || (o.items || []).some(i => (i.nomenclature?.name || '').toLowerCase().includes(term))
        );
    }, [orders, externalSearch]);

    const counts = useMemo(() => ({
        open: orders.filter(o => ['draft', 'ready'].includes(o.status)).length,
    }), [orders]);

    /* ---------------- РЕДАКТОР ДОКУМЕНТА ---------------- */

    const openEditor = (order) => {
        if (!order) return setEditor({ ...emptyDoc() });
        setEditor({
            id: order.id,
            warehouse_id: order.warehouse_id,
            purpose: order.purpose,
            installation_custom_id: order.installation_custom_id || '',
            client_id: order.client_id || '',
            recipient_name: order.recipient_name || '',
            recipient_phone: order.recipient_phone || '',
            needed_by: order.needed_by || '',
            notes: order.notes || '',
            items: (order.items || []).map(i => ({
                id: i.id, nomenclature_id: i.nomenclature_id,
                requested_quantity: String(i.requested_quantity),
                issued_quantity: Number(i.issued_quantity),
                note: i.note || '',
            })),
        });
    };

    const addLine = () => setEditor(e => ({
        ...e, items: [...e.items, { nomenclature_id: '', requested_quantity: '', note: '' }],
    }));

    const setLine = (idx, patch) => setEditor(e => ({
        ...e, items: e.items.map((it, i) => i === idx ? { ...it, ...patch } : it),
    }));

    const removeLine = (idx) => setEditor(e => ({
        ...e, items: e.items.filter((_, i) => i !== idx),
    }));

    const saveDoc = async () => {
        const e = editor;
        if (!e.warehouse_id) return toast('Оберіть склад, з якого видаємо', 'error');
        if (!e.installation_custom_id && !e.client_id && !e.recipient_name.trim()) {
            return toast("Вкажіть, кому видаємо: об'єкт, клієнта або хоча б ПІБ", 'error');
        }
        const lines = e.items.filter(i => i.nomenclature_id && parseFloat(i.requested_quantity) > 0);
        if (!lines.length) return toast('Додайте хоча б одну позицію', 'error');

        const dupes = lines.map(l => l.nomenclature_id).filter((v, i, a) => a.indexOf(v) !== i);
        if (dupes.length) return toast('Одна позиція двічі — обʼєднайте рядки', 'error');

        setBusy(true);
        try {
            const header = {
                warehouse_id: e.warehouse_id,
                purpose: e.purpose,
                installation_custom_id: e.installation_custom_id || null,
                client_id: e.client_id || null,
                recipient_name: e.recipient_name.trim() || null,
                recipient_phone: e.recipient_phone.trim() || null,
                needed_by: e.needed_by || null,
                notes: e.notes.trim() || null,
                updated_by: employee?.id ?? null,
                updated_at: new Date().toISOString(),
            };

            let orderId = e.id;
            if (orderId) {
                const { error } = await supabase.from('issue_orders').update(header).eq('id', orderId);
                if (error) throw error;
                // Позиції простіше перезібрати: видані рядки лишаються недоторканими
                const keepIds = lines.filter(l => l.id).map(l => l.id);
                const { error: delErr } = await supabase.from('issue_order_items')
                    .delete().eq('issue_order_id', orderId)
                    .not('id', 'in', `(${keepIds.length ? keepIds.join(',') : 0})`)
                    .eq('issued_quantity', 0);
                if (delErr) throw delErr;
            } else {
                const { data, error } = await supabase.from('issue_orders')
                    .insert([{ ...header, status: 'draft', requested_by: employee?.id ?? null, created_by: employee?.id ?? null }])
                    .select('id').single();
                if (error) throw error;
                orderId = data.id;
            }

            const payload = lines.map(l => ({
                ...(l.id ? { id: l.id } : {}),
                issue_order_id: orderId,
                nomenclature_id: l.nomenclature_id,
                requested_quantity: parseFloat(l.requested_quantity),
                note: l.note?.trim() || null,
                updated_at: new Date().toISOString(),
            }));
            const { error: upErr } = await supabase.from('issue_order_items')
                .upsert(payload, { onConflict: 'issue_order_id,nomenclature_id' });
            if (upErr) throw upErr;

            toast(e.id ? 'Документ оновлено' : 'Документ створено');
            setEditor(null);
            loadOrders();
        } catch (err) {
            toast(humanError(err), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- СТАН ДОКУМЕНТА ---------------- */

    const setStatus = async (order, status) => {
        if (status === 'cancelled') {
            const ok = await confirm({
                title: 'Скасувати документ?',
                tone: 'danger', confirmLabel: 'Скасувати документ',
                message: `${order.doc_number} · ${recipientOf(order)}`,
                details: [
                    'Видавати за ним більше не можна.',
                    'Уже проведені видачі лишаються — вони не відкочуються.',
                ],
            });
            if (!ok) return;
        }
        try {
            const { error } = await supabase.from('issue_orders')
                .update({ status, updated_by: employee?.id ?? null, updated_at: new Date().toISOString() })
                .eq('id', order.id);
            if (error) throw error;
            toast(status === 'ready' ? 'Передано комірнику' : 'Документ скасовано');
            loadOrders();
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    const reserveForDoc = async (order) => {
        try {
            const { data, error } = await supabase.rpc('issue_order_reserve', {
                p_order_id: order.id, p_emp: employee?.id ?? null,
            });
            if (error) throw error;
            if (data?.ok === false) return toast(data.message, 'warning');
            toast(`Зарезервовано позицій: ${data.reserved_items}`);
            loadOrders();
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    /* ---------------- ВИДАЧА ---------------- */

    const openPicking = (order) => {
        const lines = {};
        (order.items || []).forEach(it => {
            const r = readiness[it.id];
            const outstanding = Math.max(0, Number(it.requested_quantity) - Number(it.issued_quantity));
            const can = r ? Math.min(Number(r.can_issue_now), outstanding) : 0;
            lines[it.id] = can > 0 ? String(num(can)) : '';
        });
        setPicking({ order, lines });
    };

    const pickingTotal = useMemo(() => {
        if (!picking) return 0;
        return Object.values(picking.lines).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    }, [picking]);

    const confirmIssue = async () => {
        const lines = Object.entries(picking.lines)
            .map(([item_id, qty]) => ({ item_id: Number(item_id), qty: parseFloat(qty) }))
            .filter(l => l.qty > 0);

        if (!lines.length) return toast('Вкажіть, що саме видаєте', 'error');

        const order = picking.order;
        const details = lines.map(l => {
            const it = order.items.find(i => i.id === l.item_id);
            const nom = nomById.get(it.nomenclature_id);
            return `${nom?.fullName || it.nomenclature?.name}: ${num(l.qty)} ${nom?.unit?.name || 'шт'}`;
        });

        const ok = await confirm({
            title: 'Підтвердити видачу?',
            tone: 'accent', confirmLabel: 'Видати',
            message: `${order.doc_number} · ${recipientOf(order)} · зі складу «${order.warehouse?.name}»`,
            details: [...details.slice(0, 8),
            ...(details.length > 8 ? [`…та ще ${details.length - 8} позицій`] : [])],
        });
        if (!ok) return;

        setBusy(true);
        try {
            const { data, error } = await supabase.rpc('issue_order_execute', {
                p_order_id: order.id, p_lines: lines, p_emp: employee?.id ?? null,
            });
            if (error) throw error;
            if (data?.ok === false) throw new Error(data.message);

            toast(data.fully_issued
                ? `Видано повністю · документ закрито`
                : `Видано ${num(data.total_quantity)} · документ лишається відкритим`);
            setPicking(null);
            loadOrders();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- ДРУК ---------------- */

    const printDoc = async (order) => {
        try {
            await printPickingList({
                doc: {
                    number: order.doc_number,
                    date: order.created_at,
                    neededBy: order.needed_by,
                    warehouse: order.warehouse?.name,
                    recipient: recipientOf(order),
                    recipientPhone: order.client?.phone || order.recipient_phone,
                    purpose: PURPOSE[order.purpose]?.label,
                    requestedBy: order.requester?.name,
                    notes: order.notes,
                },
                rows: (order.items || []).map(it => {
                    const nom = nomById.get(it.nomenclature_id);
                    const outstanding = Math.max(0, Number(it.requested_quantity) - Number(it.issued_quantity));
                    const r = readiness[it.id];
                    return {
                        name: nom?.fullName || it.nomenclature?.name || 'Позиція',
                        sku: nom?.sku || it.nomenclature?.sku || '',
                        unit: nom?.unit?.name || it.nomenclature?.unit?.name || 'шт',
                        requested: Number(it.requested_quantity),
                        issued: Number(it.issued_quantity),
                        outstanding,
                        available: r ? Number(r.available_at_warehouse) : null,
                        note: it.note || '',
                    };
                }),
            });
        } catch (e) {
            toast(`Не вдалося сформувати документ: ${humanError(e)}`, 'error');
        }
    };

    /* ---------------- ЧАСТИНИ ІНТЕРФЕЙСУ ---------------- */

    const ItemRow = ({ order, it }) => {
        const nom = nomById.get(it.nomenclature_id);
        const requested = Number(it.requested_quantity);
        const issued = Number(it.issued_quantity);
        const outstanding = Math.max(0, requested - issued);
        const r = readiness[it.id];
        const available = r ? Number(r.available_at_warehouse) : null;
        const can = r ? Number(r.can_issue_now) : 0;

        const state = outstanding <= 0 ? 'done'
            : can >= outstanding ? 'ready'
                : can > 0 ? 'partial' : 'missing';

        const chip = {
            done: <Chip tone="ok">видано</Chip>,
            ready: <Chip tone="ok">є на складі</Chip>,
            partial: <Chip tone="warn">є лише {num(can)}</Chip>,
            missing: <Chip tone="danger">немає</Chip>,
        }[state];

        return (
            <div className={`${T.cardFlat} px-2.5 py-2`}>
                <div className="flex items-start gap-2 mb-1">
                    <span className="text-[12.5px] font-semibold text-slate-900 leading-snug flex-1">
                        {nom?.fullName || it.nomenclature?.name || 'Позиція'}
                    </span>
                    <span className="text-[12.5px] font-black tabular-nums text-slate-900 flex-shrink-0">
                        {num(issued)}<span className="text-slate-400">/{num(requested)}</span>
                        <span className="text-[9px] font-bold text-slate-400 ml-0.5">
                            {nom?.unit?.name || it.nomenclature?.unit?.name || 'шт'}
                        </span>
                    </span>
                    {chip}
                </div>
                <Bar segments={[
                    { pct: requested > 0 ? (issued / requested) * 100 : 0, tone: 'ok' },
                    { pct: requested > 0 ? (Math.min(can, outstanding) / requested) * 100 : 0, tone: 'info' },
                ]} />
                <div className="flex items-center justify-between mt-1 text-[10.5px] text-slate-400">
                    <span>{nom?.sku || ''}{it.note ? ` · ${it.note}` : ''}</span>
                    {available != null && (
                        <span className="tabular-nums">на складі вільно {num(available)}</span>
                    )}
                </div>
            </div>
        );
    };

    const OrderActions = ({ order, full }) => {
        const isOpen = ['draft', 'ready'].includes(order.status);
        const rd = docReadiness(order);
        const cls = full ? 'grid grid-cols-2 gap-2' : 'flex items-center gap-1.5 flex-wrap';
        return (
            <div className={cls}>
                <Btn size={full ? 'md' : 'sm'} variant="outline" icon={FaPrint} onClick={() => printDoc(order)}>
                    Друк
                </Btn>
                {isOpen && (
                    <Btn size={full ? 'md' : 'sm'} variant="outline" icon={FaEdit} onClick={() => openEditor(order)}>
                        Змінити
                    </Btn>
                )}
                {order.status === 'draft' && (
                    <Btn size={full ? 'md' : 'sm'} variant="softWarn" icon={FaTruckLoading}
                        onClick={() => setStatus(order, 'ready')}>
                        Передати комірнику
                    </Btn>
                )}
                {isOpen && order.installation_custom_id && (
                    <Btn size={full ? 'md' : 'sm'} variant="soft" icon={FaLock} onClick={() => reserveForDoc(order)}>
                        Зарезервувати
                    </Btn>
                )}
                {isOpen && (
                    <Btn size={full ? 'md' : 'sm'} variant="ok" icon={FaCheck}
                        disabled={!rd.canStart} onClick={() => openPicking(order)}>
                        Видати
                    </Btn>
                )}
                {isOpen && (
                    <Btn size={full ? 'md' : 'sm'} variant="softDanger" icon={FaBan}
                        onClick={() => setStatus(order, 'cancelled')}>
                        Скасувати
                    </Btn>
                )}
            </div>
        );
    };

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <div className="flex flex-col h-full w-full gap-2.5">

            <Card pad="p-2.5" className="flex-none">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                    {[
                        ['open', `Відкриті${counts.open ? ` · ${counts.open}` : ''}`],
                        ['ready', 'До видачі'],
                        ['issued', 'Видані'],
                        ['cancelled', 'Скасовані'],
                        ['all', 'Всі'],
                    ].map(([k, label]) => (
                        <button
                            key={k} onClick={() => setStatusFilter(k)}
                            className={`px-2.5 h-8 rounded-lg text-[11.5px] font-bold whitespace-nowrap border transition-colors flex-shrink-0
                                ${statusFilter === k
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                        >
                            {label}
                        </button>
                    ))}
                    <Btn variant="accent" icon={FaPlus} className="ml-auto flex-shrink-0"
                        onClick={() => openEditor(null)}>
                        <span className="hidden sm:inline">Новий документ</span>
                        <span className="sm:hidden">Новий</span>
                    </Btn>
                </div>
            </Card>

            <div className={`${T.card} flex-1 flex flex-col overflow-hidden min-h-0`}>
                {loading ? <Skeleton rows={6} /> : filteredOrders.length === 0 ? (
                    <EmptyState
                        icon={FaClipboardList}
                        title="Документів немає"
                        hint="Створіть документ, коли треба зібрати комплект: система покаже комірнику, що видавати і чи є це на складі."
                    >
                        <Btn variant="accent" icon={FaPlus} onClick={() => openEditor(null)}>Новий документ</Btn>
                    </EmptyState>
                ) : (
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {filteredOrders.map(order => {
                            const rd = docReadiness(order);
                            const open = expandedId === order.id;
                            const isOpen = ['draft', 'ready'].includes(order.status);
                            return (
                                <div key={order.id} className={open ? 'bg-indigo-50/30' : ''}>
                                    <div className="px-3 py-2.5">
                                        <div className="flex items-start gap-2 flex-wrap">
                                            <button onClick={() => setExpandedId(open ? null : order.id)}
                                                className="flex items-start gap-2 min-w-0 flex-1 text-left">
                                                <FaChevronDown
                                                    className={`text-slate-300 mt-1 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                                                    size={11} />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[13px] font-bold text-slate-900">{order.doc_number}</span>
                                                        <Chip tone={STATUS[order.status]?.tone}>{STATUS[order.status]?.label}</Chip>
                                                        {order.purpose === 'sale' && <Chip tone="info">продаж</Chip>}
                                                        {order.needed_by && new Date(order.needed_by) < new Date() && isOpen && (
                                                            <Chip tone="danger" icon={FaExclamationTriangle}>
                                                                прострочено
                                                            </Chip>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                        {order.installation
                                                            ? <FaHardHat className="text-slate-400" size={9} />
                                                            : <FaUserTie className="text-slate-400" size={9} />}
                                                        {recipientOf(order)}
                                                        <span className="text-slate-300">·</span>
                                                        <FaWarehouse className="text-slate-400" size={9} />
                                                        {order.warehouse?.name}
                                                        <span className="text-slate-300">·</span>
                                                        {new Date(order.created_at).toLocaleDateString('uk-UA')}
                                                    </div>
                                                </div>
                                            </button>

                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <div className="text-right w-28">
                                                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">
                                                        Позицій {(order.items || []).length}
                                                    </div>
                                                    {isOpen ? (
                                                        <div className="text-[11px] font-bold flex items-center gap-1.5 justify-end">
                                                            {rd.ready > 0 && <span className="text-emerald-600">{rd.ready} ✓</span>}
                                                            {rd.partial > 0 && <span className="text-amber-600">{rd.partial} ~</span>}
                                                            {rd.missing > 0 && <span className="text-rose-600">{rd.missing} ✕</span>}
                                                        </div>
                                                    ) : (
                                                        <div className="text-[11px] font-bold text-slate-400">
                                                            {order.issued_at ? new Date(order.issued_at).toLocaleDateString('uk-UA') : '—'}
                                                        </div>
                                                    )}
                                                    <Bar className="mt-1" segments={[{ pct: rd.pct, tone: rd.allGood ? 'ok' : 'warn' }]} />
                                                </div>
                                            </div>
                                        </div>

                                        {!isMobile && <div className="mt-2"><OrderActions order={order} /></div>}
                                    </div>

                                    {open && (
                                        <div className="px-3 pb-3 space-y-2">
                                            {isOpen && rd.missing > 0 && (
                                                <div className={`${T.inset} border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800`}>
                                                    <FaExclamationTriangle className="inline mr-1.5" size={11} />
                                                    {rd.missing} позицій немає на складі «{order.warehouse?.name}» —
                                                    видати можна лише частину.
                                                </div>
                                            )}
                                            <div className="space-y-1.5">
                                                {(order.items || []).map(it => (
                                                    <ItemRow key={it.id} order={order} it={it} />
                                                ))}
                                            </div>
                                            {order.notes && (
                                                <div className={`${T.inset} px-3 py-2 text-[12px] text-slate-600 italic`}>{order.notes}</div>
                                            )}
                                            <div className="text-[10.5px] text-slate-400">
                                                Склав: {order.requester?.name || '—'}
                                                {order.issuer && ` · Видав: ${order.issuer.name}`}
                                            </div>
                                            {isMobile && <OrderActions order={order} full />}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ---------- РЕДАКТОР ДОКУМЕНТА ---------- */}
            <Modal
                isOpen={!!editor} onClose={() => setEditor(null)}
                title={editor?.id ? 'Змінити документ' : 'Новий документ видачі'}
                subtitle="Що і кому видаємо. Рухи по складу проведуться при підтвердженні видачі."
                size="lg"
                onSubmit={() => { if (!busy) saveDoc(); }}
                submitHint="зберегти документ"
                footer={<>
                    <Btn variant="outline" onClick={() => setEditor(null)}>Скасувати</Btn>
                    <Btn variant="accent" onClick={saveDoc} disabled={busy}>
                        {busy ? 'Зберігаємо…' : 'Зберегти'}
                    </Btn>
                </>}
            >
                {editor && (
                    <div className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-3">
                            <Field label="Склад, з якого видаємо" required>
                                <Picker options={whOptions} value={editor.warehouse_id}
                                    onChange={v => setEditor(e => ({ ...e, warehouse_id: v }))}
                                    placeholder="Оберіть склад…" icon={FaWarehouse} />
                            </Field>
                            <Field label="Тип операції">
                                <select className={T.select} value={editor.purpose}
                                    onChange={e => setEditor(x => ({ ...x, purpose: e.target.value }))}>
                                    {Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                            </Field>
                        </div>

                        <div className={`${T.inset} p-3 space-y-3`}>
                            <div className={T.label}>Кому видаємо — достатньо одного</div>
                            <div className="grid sm:grid-cols-2 gap-3">
                                <Field label="Об'єкт">
                                    <Picker options={[{ id: '', label: '— не вказано —' }, ...instOptions]}
                                        value={editor.installation_custom_id}
                                        onChange={v => setEditor(e => ({ ...e, installation_custom_id: v }))}
                                        placeholder="Оберіть об'єкт…" icon={FaHardHat}
                                        searchPlaceholder="Назва або номер…" />
                                </Field>
                                <Field label="Клієнт">
                                    <Picker options={[{ id: '', label: '— не вказано —' }, ...clientOptions]}
                                        value={editor.client_id}
                                        onChange={v => setEditor(e => ({ ...e, client_id: v }))}
                                        placeholder="Оберіть клієнта…" icon={FaUserTie}
                                        searchPlaceholder="Почніть вводити назву…" />
                                </Field>
                                <Field label="Хто прийде забирати"
                                    hint="ПІБ людини, яка розпишеться в документі">
                                    <input className={T.input} placeholder="Напр. Коваль О.П."
                                        value={editor.recipient_name}
                                        onChange={e => setEditor(x => ({ ...x, recipient_name: e.target.value }))} />
                                </Field>
                                <Field label="Телефон">
                                    <input className={T.input} placeholder="Необов’язково"
                                        value={editor.recipient_phone}
                                        onChange={e => setEditor(x => ({ ...x, recipient_phone: e.target.value }))} />
                                </Field>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                            <Field label="Потрібно до" hint="Прострочені документи позначаються в списку">
                                <input type="date" className={T.input} value={editor.needed_by}
                                    onChange={e => setEditor(x => ({ ...x, needed_by: e.target.value }))} />
                            </Field>
                            <Field label="Примітка для комірника">
                                <input className={T.input} placeholder="Напр. видати до обіду"
                                    value={editor.notes}
                                    onChange={e => setEditor(x => ({ ...x, notes: e.target.value }))} />
                            </Field>
                        </div>

                        {/* Позиції */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className={T.label}>Що видаємо</span>
                                <Btn size="sm" variant="soft" icon={FaPlus} className="ml-auto" onClick={addLine}>
                                    Додати позицію
                                </Btn>
                            </div>

                            {editor.items.length === 0 ? (
                                <div className={`${T.inset} px-3 py-5 text-center`}>
                                    <FaBoxOpen className="mx-auto text-2xl text-slate-300 mb-1.5" />
                                    <div className="text-[12.5px] text-slate-500">Список порожній</div>
                                    <Btn size="sm" variant="accent" icon={FaPlus} className="mt-2" onClick={addLine}>
                                        Додати першу позицію
                                    </Btn>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {editor.items.map((line, idx) => {
                                        const locked = Number(line.issued_quantity) > 0;
                                        return (
                                            <div key={idx} className={`${T.cardFlat} px-2.5 py-2 space-y-2`}>
                                                <div className="flex items-start gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <Picker
                                                            options={nomOptions} value={line.nomenclature_id}
                                                            onChange={v => setLine(idx, { nomenclature_id: v })}
                                                            disabled={locked}
                                                            placeholder="Оберіть товар…" icon={FaBoxOpen}
                                                            searchPlaceholder="Назва або SKU…"
                                                        />
                                                    </div>
                                                    <input
                                                        type="number" min="0" step="any" inputMode="decimal"
                                                        placeholder="К-сть" disabled={locked}
                                                        className={`w-24 h-10 px-2 text-center border border-slate-300 rounded-lg text-[13px] font-bold tabular-nums outline-none focus:border-indigo-500 disabled:bg-slate-50 disabled:text-slate-400`}
                                                        value={line.requested_quantity}
                                                        onChange={e => setLine(idx, { requested_quantity: e.target.value })}
                                                    />
                                                    <IconBtn variant="softDanger" icon={FaTrash} label="Прибрати"
                                                        disabled={locked} onClick={() => removeLine(idx)} />
                                                </div>
                                                <input
                                                    className={`${T.input} h-9 text-[12px]`}
                                                    placeholder="Примітка для комірника — напр. «взяти чорний»"
                                                    value={line.note || ''}
                                                    onChange={e => setLine(idx, { note: e.target.value })}
                                                />
                                                {locked && (
                                                    <div className="text-[10.5px] text-emerald-700 font-bold">
                                                        Уже видано {num(line.issued_quantity)} — позицію змінити не можна
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* ---------- ПІДТВЕРДЖЕННЯ ВИДАЧІ ---------- */}
            <Modal
                isOpen={!!picking} onClose={() => setPicking(null)}
                title="Підтвердження видачі"
                subtitle={picking ? `${picking.order.doc_number} · ${recipientOf(picking.order)}` : ''}
                tone="ok" size="md"
                onSubmit={() => { if (!busy && pickingTotal > 0) confirmIssue(); }}
                submitHint="підтвердити видачу"
                footer={<>
                    <Btn variant="outline" onClick={() => setPicking(null)}>Скасувати</Btn>
                    <Btn variant="ok" icon={FaCheck} onClick={confirmIssue} disabled={busy || pickingTotal <= 0}>
                        {busy ? 'Проводимо…' : 'Підтвердити видачу'}
                    </Btn>
                </>}
            >
                {picking && (
                    <div className="space-y-3">
                        <div className={`${T.inset} px-3 py-2 text-[12px] text-slate-600 leading-relaxed`}>
                            Вкажіть, скільки фактично видали. Підставлено максимум, який дозволяє
                            залишок складу. Якщо видали не все — документ лишиться відкритим,
                            і решту можна видати пізніше.
                        </div>

                        <div className="space-y-1.5 sm:max-h-[46vh] sm:overflow-y-auto -mx-1 px-1">
                            {(picking.order.items || []).map(it => {
                                const nom = nomById.get(it.nomenclature_id);
                                const r = readiness[it.id];
                                const outstanding = Math.max(0, Number(it.requested_quantity) - Number(it.issued_quantity));
                                const can = r ? Math.min(Number(r.can_issue_now), outstanding) : 0;
                                const val = picking.lines[it.id] || '';
                                const qty = parseFloat(val) || 0;
                                const over = qty > can;

                                if (outstanding <= 0) return null;

                                return (
                                    <div key={it.id}
                                        className={`px-2.5 py-2 rounded-lg border transition-colors
                                            ${qty > 0 ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                                        <div className="text-[12.5px] font-semibold text-slate-900 leading-snug mb-1.5">
                                            {nom?.fullName || it.nomenclature?.name}
                                            {it.note && <span className="font-normal text-slate-500 italic"> · {it.note}</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-slate-500 tabular-nums">
                                                треба <b className="text-slate-800">{num(outstanding)}</b>
                                                {' · '}можна видати <b className={can >= outstanding ? 'text-emerald-700' : 'text-amber-700'}>{num(can)}</b>
                                            </span>
                                            <input
                                                type="number" min="0" max={can} step="any" inputMode="decimal"
                                                className={`w-24 h-9 ml-auto px-2 text-center border rounded-lg text-[13px] font-bold tabular-nums outline-none transition-colors
                                                    ${over ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-300 focus:border-emerald-500'}`}
                                                value={val}
                                                onChange={e => setPicking(p => ({
                                                    ...p, lines: { ...p.lines, [it.id]: e.target.value },
                                                }))}
                                            />
                                            <span className="text-[10px] text-slate-400 w-8">
                                                {nom?.unit?.name || it.nomenclature?.unit?.name || 'шт'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}
