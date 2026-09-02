// =====================================================================
//  Закупівлі та постачання.
//
//  Замовлення постачальникам: що замовлено, скільки оплачено,
//  скільки вже приїхало. Плюс черга заявок від об'єктів — те, що
//  менеджери об'єктів просять закупити.
//
//  Кожне замовлення показує три показники одразу: борг, приймання
//  і стан. Заглядати всередину треба лише тоді, коли справді треба.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FaPlus, FaEdit, FaInfoCircle, FaFileInvoiceDollar,
    FaBuilding, FaHardHat, FaChevronDown, FaTruckLoading, FaFileExcel,
    FaMoneyBillAlt, FaShoppingCart, FaWarehouse, FaCheck, FaBan,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import PurchaseOrderModal from './PurchaseOrderModal';
import {
    T, Btn, IconBtn, Chip, Card, Field, Picker, Bar, EmptyState,
    Skeleton, Modal, useToast, useConfirm, humanError, num, useIsMobile,
} from '../ui';

const ORDER_STATUS = {
    draft: { label: 'Чернетка', tone: 'neutral' },
    sent: { label: 'Замовлено', tone: 'info' },
    partially_received: { label: 'Приїхало частково', tone: 'warn' },
    received: { label: 'Отримано', tone: 'ok' },
    cancelled: { label: 'Скасовано', tone: 'danger' },
};

const PAYMENT_TYPES = { bank_transfer: 'Банк. переказ', vat: 'З ПДВ', no_vat: 'Без ПДВ', fop: 'Рахунок ФОП', cash: 'Готівка' };
const PAYMENT_PURPOSES = { advance: 'Аванс', partial: 'Часткова', post: 'Постоплата', realization: 'Реалізація' };
const CURRENCIES = ['UAH', 'USD', 'EUR'];

const money = (v, cur) => `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(Number(v) || 0)} ${cur || ''}`.trim();

export default function PurchasesPage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const isMobile = useIsMobile();

    const [orders, setOrders] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);
    const [categories, setCategories] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [systemMemory, setSystemMemory] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    const [statusFilter, setStatusFilter] = useState('all');
    const [expandedId, setExpandedId] = useState(null);
    const [requestsOpen, setRequestsOpen] = useState(true);

    // Модалка замовлення
    const [poModal, setPoModal] = useState(false);
    const [poMode, setPoMode] = useState('manual');
    const [poEdit, setPoEdit] = useState(null);
    const [poFile, setPoFile] = useState(null);
    const fileRef = useRef(null);

    // Оплати та приймання
    const [payModal, setPayModal] = useState(null);       // order
    const [payForm, setPayForm] = useState({ payment_type: 'bank_transfer', purpose: 'partial', amount: '', currency: 'UAH', exchange_rate: 1, notes: '' });
    const [recvModal, setRecvModal] = useState(null);     // { order, warehouse_id, items }
    const [busy, setBusy] = useState(false);

    const prevTrigger = useRef(externalActionTrigger);
    useEffect(() => {
        if (externalActionTrigger > prevTrigger.current) {
            setPoEdit(null); setPoFile(null); setPoMode('manual'); setPoModal(true);
        }
        prevTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [supRes, instRes, nomRes, catRes, whRes, memRes, reqRes] = await Promise.all([
                supabase.from('suppliers').select('id, name').order('name'),
                supabase.from('installations').select('custom_id, name, status').in('status', ['planning', 'in_progress', 'pending']),
                supabase.from('nomenclature').select('id, name, sku, brand, model, technical_characteristics, category_id, type, package_name, package_multiplier, unit:units(name)').eq('is_active', true).order('name'),
                supabase.from('categories').select('*'),
                supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
                supabase.from('supplier_mappings').select('*'),
                supabase.from('procurement_requests').select('*').eq('status', 'requested').order('created_at', { ascending: true }),
            ]);

            setSuppliers(supRes.data || []);
            setInstallations(instRes.data || []);
            setWarehouses(whRes.data || []);
            setSystemMemory(memRes.data || []);
            setRequests(reqRes.data || []);

            const cats = catRes.data || [];
            setCategories(cats);
            const catById = new Map(cats.map(c => [c.id, c]));
            setNomenclatures((nomRes.data || []).map(item => {
                const path = [];
                let id = item.category_id, guard = 0;
                while (id && guard++ < 20) {
                    const c = catById.get(id);
                    if (!c) break;
                    path.unshift(c.name);
                    id = c.parent_id;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim() };
            }));

            const { data: ordersData, error } = await supabase
                .from('purchase_orders')
                .select(`*, supplier:suppliers(name), installation:installations(name),
                         items:purchase_order_items(*, movements:stock_movements(quantity, operation_type)),
                         payments:purchase_payments(*)`)
                .order('created_at', { ascending: false });
            if (error) throw error;
            setOrders(ordersData || []);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

    /* ---------------- РОЗРАХУНКИ ---------------- */

    /** Платіж в іншій валюті переводимо у валюту замовлення */
    const effectivePayment = (amount, payCur, rate, orderCur) => {
        const a = parseFloat(amount) || 0;
        if (payCur === orderCur) return a;
        if (payCur === 'UAH' && orderCur !== 'UAH') return a / (parseFloat(rate) || 1);
        if (payCur !== 'UAH' && orderCur === 'UAH') return a * (parseFloat(rate) || 1);
        return a;
    };

    const receivedQty = (item) => (item.movements || [])
        .filter(m => m.operation_type === 'purchase')
        .reduce((s, m) => s + parseFloat(m.quantity), 0);

    const orderStats = useCallback((order) => {
        const items = order.items || [];
        const cost = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const paid = (order.payments || []).filter(p => p.is_active)
            .reduce((s, p) => s + effectivePayment(p.amount, p.currency, p.exchange_rate, order.currency), 0);

        const ordered = items.reduce((s, i) => s + parseFloat(i.quantity), 0);
        const received = items.reduce((s, i) => s + receivedQty(i), 0);

        return {
            cost, paid,
            debt: Math.max(0, cost - paid),
            paidPct: cost > 0 ? Math.min(100, (paid / cost) * 100) : 0,
            ordered, received,
            recvPct: ordered > 0 ? Math.min(100, (received / ordered) * 100) : 0,
            pendingItems: items.filter(i => receivedQty(i) < parseFloat(i.quantity)).length,
        };
    }, []);

    const counts = useMemo(() => {
        const c = { all: orders.length };
        Object.keys(ORDER_STATUS).forEach(k => { c[k] = orders.filter(o => o.status === k).length; });
        return c;
    }, [orders]);

    const filtered = useMemo(() => {
        const term = externalSearch.trim().toLowerCase();
        return orders.filter(o => {
            if (statusFilter !== 'all' && o.status !== statusFilter) return false;
            if (!term) return true;
            return (o.order_number || '').toLowerCase().includes(term)
                || (o.supplier?.name || '').toLowerCase().includes(term)
                || (o.invoice_number || '').toLowerCase().includes(term)
                || (o.installation?.name || '').toLowerCase().includes(term);
        });
    }, [orders, statusFilter, externalSearch]);

    const nomById = useMemo(() => new Map(nomenclatures.map(n => [n.id, n])), [nomenclatures]);

    /* ---------------- ЗАЯВКИ ВІД ОБ'ЄКТІВ ---------------- */

    const resolveRequest = async (reqId, status) => {
        try {
            const { error } = await supabase.from('procurement_requests')
                .update({ status, resolved_by: employee?.id ?? null, updated_at: new Date().toISOString() })
                .eq('id', reqId);
            if (error) throw error;
            setRequests(prev => prev.filter(r => r.id !== reqId));
            toast({
                ordered: 'Позначено як «Замовлено»',
                stock_confirmed: 'Підтверджено наявність на складі',
                rejected: 'Заявку відхилено',
            }[status] || 'Статус оновлено');
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    /* ---------------- ЗАМОВЛЕННЯ ---------------- */

    const quickAddSupplier = async (name) => {
        try {
            const { data, error } = await supabase.from('suppliers')
                .insert([{ name, created_by: employee?.id }]).select().single();
            if (error) throw error;
            setSuppliers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'uk')));
            toast(`Постачальника «${name}» додано`);
            return data.id;
        } catch (e) {
            toast(humanError(e), 'error');
            return null;
        }
    };

    const onExcelPick = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPoFile(file); setPoMode('import'); setPoEdit(null); setPoModal(true);
        if (fileRef.current) fileRef.current.value = '';
    };

    /* ---------------- ОПЛАТИ ---------------- */

    const openPayments = (order) => {
        setPayForm({
            payment_type: 'bank_transfer', purpose: 'partial', amount: '',
            currency: order.currency, exchange_rate: 1, notes: '',
        });
        setPayModal(order);
    };

    const refreshOrderPayments = async (orderId) => {
        const { data } = await supabase.from('purchase_orders')
            .select('*, payments:purchase_payments(*)').eq('id', orderId).single();
        if (data) setPayModal(prev => prev ? { ...prev, payments: data.payments } : prev);
    };

    const savePayment = async () => {
        const amount = parseFloat(payForm.amount);
        if (!amount || amount <= 0) return toast('Сума має бути більшою за 0', 'error');

        setBusy(true);
        try {
            const { error } = await supabase.from('purchase_payments').insert([{
                purchase_order_id: payModal.id,
                payment_type: payForm.payment_type,
                payment_purpose: payForm.purpose,
                amount, currency: payForm.currency,
                exchange_rate: parseFloat(payForm.exchange_rate) || 1,
                notes: payForm.notes.trim() || null,
                created_by: employee?.id, is_active: true,
            }]);
            if (error) throw error;
            toast('Платіж додано');
            setPayForm(f => ({ ...f, amount: '', notes: '' }));
            await refreshOrderPayments(payModal.id);
            loadData();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    const togglePayment = async (payment) => {
        const ok = await confirm({
            title: payment.is_active ? 'Анулювати платіж?' : 'Відновити платіж?',
            tone: payment.is_active ? 'danger' : 'accent',
            confirmLabel: payment.is_active ? 'Анулювати' : 'Відновити',
            message: payment.is_active
                ? 'Платіж перестане враховуватись у балансі замовлення. Запис лишиться в історії.'
                : 'Платіж знову враховуватиметься в балансі.',
            details: [
                money(payment.amount, payment.currency),
                `${PAYMENT_TYPES[payment.payment_type] || payment.payment_type} · ${PAYMENT_PURPOSES[payment.payment_purpose] || ''}`,
            ],
        });
        if (!ok) return;

        try {
            const { error } = await supabase.from('purchase_payments')
                .update({ is_active: !payment.is_active, updated_by: employee?.id })
                .eq('id', payment.id);
            if (error) throw error;
            toast('Статус платежу змінено');
            await refreshOrderPayments(payModal.id);
            loadData();
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    /* ---------------- ПРИЙМАННЯ ---------------- */

    const openReceiving = (order) => {
        const items = (order.items || []).map(item => {
            const already = receivedQty(item);
            return {
                po_item_id: item.id,
                nomenclature_id: item.nomenclature_id,
                ordered: parseFloat(item.quantity),
                already,
                now: already < item.quantity ? String(item.quantity - already) : '0',
            };
        }).filter(i => i.ordered - i.already > 0);

        if (!items.length) return toast('Усе за цим замовленням уже прийнято', 'info');
        setRecvModal({ order, warehouse_id: '', items });
    };

    const saveReceiving = async () => {
        const { order, warehouse_id, items } = recvModal;
        if (!warehouse_id) return toast('Оберіть склад призначення', 'error');

        const valid = items.filter(i => parseFloat(i.now) > 0);
        if (!valid.length) return toast('Вкажіть кількість для приймання', 'error');

        const over = valid.find(i => parseFloat(i.now) > i.ordered - i.already);
        if (over) {
            const nom = nomById.get(over.nomenclature_id);
            return toast(`«${nom?.fullName || 'позиція'}»: приймаєте більше, ніж лишилось`, 'error');
        }

        setBusy(true);
        try {
            const { error } = await supabase.from('stock_movements').insert(valid.map(i => ({
                operation_type: 'purchase',
                nomenclature_id: i.nomenclature_id,
                quantity: parseFloat(i.now),
                warehouse_to_id: warehouse_id,
                purchase_order_item_id: i.po_item_id,
                created_by: employee?.id, performed_by: employee?.id,
            })));
            if (error) throw error;

            // Перерахунок стану замовлення
            let allReceived = true, someReceived = false;
            (order.items || []).forEach(item => {
                const already = receivedQty(item);
                const now = parseFloat(valid.find(v => v.po_item_id === item.id)?.now || 0);
                const after = already + now;
                if (after > 0) someReceived = true;
                if (after < parseFloat(item.quantity)) allReceived = false;
            });
            const newStatus = allReceived ? 'received' : someReceived ? 'partially_received' : order.status;
            if (newStatus !== order.status) {
                await supabase.from('purchase_orders').update({ status: newStatus }).eq('id', order.id);
            }

            // Замовлення під об'єкт — одразу резервуємо приїхале під його потребу
            let reserved = 0;
            if (order.installation_custom_id) {
                try {
                    const { data: needs } = await supabase.from('v_object_material_needs')
                        .select('nomenclature_id, outstanding_need')
                        .eq('installation_custom_id', order.installation_custom_id);
                    const outstanding = {};
                    (needs || []).forEach(n => {
                        outstanding[n.nomenclature_id] = (outstanding[n.nomenclature_id] || 0) + parseFloat(n.outstanding_need);
                    });
                    for (const i of valid) {
                        const need = outstanding[i.nomenclature_id] || 0;
                        const qty = Math.min(parseFloat(i.now), need);
                        if (qty > 0) {
                            const { data: rr } = await supabase.rpc('reserve_for_object', {
                                p_installation: order.installation_custom_id,
                                p_warehouse: parseInt(warehouse_id),
                                p_nomenclature: i.nomenclature_id,
                                p_spec_item: null, p_qty: qty, p_emp: employee?.id ?? null,
                            });
                            if (rr?.ok) reserved += 1;
                            outstanding[i.nomenclature_id] = need - qty;
                        }
                    }
                } catch (rErr) {
                    console.warn('Авто-резерв під об’єкт не вдався:', rErr.message);
                }
            }

            toast(reserved > 0
                ? `Прийнято на склад · зарезервовано під об'єкт: ${reserved} поз.`
                : 'Товари прийнято на склад');
            setRecvModal(null);
            loadData();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- ЧАСТИНИ ІНТЕРФЕЙСУ ---------------- */

    const StatusChip = ({ status }) => {
        const s = ORDER_STATUS[status] || { label: status, tone: 'neutral' };
        return <Chip tone={s.tone}>{s.label}</Chip>;
    };

    /** Позиції замовлення з відміткою, скільки вже приїхало */
    const OrderItems = ({ order }) => (
        <div className="space-y-1">
            {(order.items || []).map(item => {
                const nom = nomById.get(item.nomenclature_id);
                const got = receivedQty(item);
                const qty = parseFloat(item.quantity);
                const pct = qty > 0 ? (got / qty) * 100 : 0;
                const done = got >= qty;
                return (
                    <div key={item.id} className={`${T.cardFlat} px-2.5 py-2`}>
                        <div className="flex items-start gap-2 mb-1">
                            <span className="text-[12.5px] font-semibold text-slate-900 leading-snug flex-1">
                                {nom?.fullName || item.supplier_item_name || 'Позиція'}
                            </span>
                            <span className="text-[12px] font-black tabular-nums text-slate-900 flex-shrink-0">
                                {num(got)}<span className="text-slate-400">/{num(qty)}</span>
                            </span>
                            {done ? <Chip tone="ok">приїхало</Chip> : <Chip tone="warn">{num(qty - got)} в дорозі</Chip>}
                        </div>
                        <Bar segments={[{ pct, tone: done ? 'ok' : 'info' }]} />
                        <div className="flex items-center justify-between mt-1 text-[10.5px] text-slate-400">
                            <span>{nom?.sku || ''}</span>
                            <span className="tabular-nums">
                                {money(item.unit_price, order.currency)} × {num(qty)} = <b className="text-slate-700">{money(item.quantity * item.unit_price, order.currency)}</b>
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );

    const OrderActions = ({ order, full }) => {
        const canReceive = ['sent', 'partially_received', 'draft'].includes(order.status)
            && (order.items || []).some(i => receivedQty(i) < parseFloat(i.quantity));
        const cls = full ? 'grid grid-cols-2 gap-2' : 'flex items-center justify-end gap-1';
        return (
            <div className={cls}>
                {canReceive && (
                    <Btn size={full ? 'md' : 'sm'} variant="ok" icon={FaTruckLoading}
                        onClick={() => openReceiving(order)}>Прийняти</Btn>
                )}
                <Btn size={full ? 'md' : 'sm'} variant="softWarn" icon={FaMoneyBillAlt}
                    onClick={() => openPayments(order)}>Оплати</Btn>
                <Btn size={full ? 'md' : 'sm'} variant="outline" icon={FaEdit}
                    onClick={() => { setPoEdit(order); setPoMode('manual'); setPoFile(null); setPoModal(true); }}>
                    Редагувати
                </Btn>
            </div>
        );
    };

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500 text-[13px]">Завантаження…</div>;

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <div className="flex flex-col h-full w-full gap-2.5">

            {/* ---------- ФІЛЬТРИ ТА ДІЇ ---------- */}
            <Card pad="p-2.5" className="flex-none">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                    {[['all', 'Всі'], ...Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
                        <button
                            key={k} onClick={() => setStatusFilter(k)}
                            className={`px-2.5 h-8 rounded-lg text-[11.5px] font-bold whitespace-nowrap border transition-colors flex-shrink-0
                                ${statusFilter === k
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                        >
                            {label}
                            <span className={`ml-1 tabular-nums ${statusFilter === k ? 'opacity-70' : 'text-slate-400'}`}>
                                {counts[k] || 0}
                            </span>
                        </button>
                    ))}

                    <div className="ml-auto flex items-center gap-1.5 flex-shrink-0 pl-2">
                        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onExcelPick} className="hidden" />
                        <Btn variant="softOk" icon={FaFileExcel} onClick={() => fileRef.current?.click()}>
                            <span className="hidden sm:inline">Імпорт</span>
                        </Btn>
                        <Btn variant="accent" icon={FaPlus}
                            onClick={() => { setPoEdit(null); setPoFile(null); setPoMode('manual'); setPoModal(true); }}>
                            <span className="hidden sm:inline">Замовлення</span>
                        </Btn>
                    </div>
                </div>
            </Card>

            {/* ---------- ЗАЯВКИ ВІД ОБ'ЄКТІВ ---------- */}
            {requests.length > 0 && (
                <Card pad="p-0" className="flex-none border-orange-200 overflow-hidden">
                    <button
                        onClick={() => setRequestsOpen(v => !v)}
                        className="w-full px-3 py-2.5 bg-orange-50 flex items-center gap-2 text-left"
                    >
                        <FaShoppingCart className="text-orange-500 flex-shrink-0" size={13} />
                        <span className="text-[13px] font-bold text-orange-900">Заявки від об'єктів</span>
                        <Chip tone="warn">{requests.length}</Chip>
                        <span className="text-[11px] text-orange-700/70 hidden md:inline ml-2">
                            менеджери об'єктів просять закупити
                        </span>
                        <FaChevronDown
                            className={`ml-auto text-orange-400 transition-transform ${requestsOpen ? 'rotate-180' : ''}`}
                            size={12}
                        />
                    </button>

                    {requestsOpen && (
                        <div className="divide-y divide-orange-100 sm:max-h-64 sm:overflow-y-auto">
                            {requests.map(r => {
                                const nom = nomById.get(r.nomenclature_id);
                                return (
                                    <div key={r.id} className="px-3 py-2 flex items-center gap-2 flex-wrap hover:bg-orange-50/40 transition-colors">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[12.5px] font-semibold text-slate-900 truncate">
                                                {nom?.fullName || `Номенклатура #${r.nomenclature_id}`}
                                            </div>
                                            <div className="text-[10.5px] text-slate-400">
                                                СЕС-{r.installation_custom_id} · {new Date(r.created_at).toLocaleDateString('uk-UA')}
                                                {r.note && <span className="italic"> · {r.note}</span>}
                                            </div>
                                        </div>
                                        <span className="text-[13px] font-black tabular-nums text-orange-700 flex-shrink-0">
                                            {num(r.quantity)}
                                            <span className="text-[9px] text-orange-400 ml-0.5">{nom?.unit?.name || 'шт'}</span>
                                        </span>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <IconBtn variant="softOk" icon={FaCheck} label="Є на складі"
                                                onClick={() => resolveRequest(r.id, 'stock_confirmed')} />
                                            <Btn size="sm" variant="soft" icon={FaShoppingCart}
                                                onClick={() => resolveRequest(r.id, 'ordered')}>Замовлено</Btn>
                                            <IconBtn variant="softDanger" icon={FaBan} label="Відхилити"
                                                onClick={() => resolveRequest(r.id, 'rejected')} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            )}

            {/* ---------- ЗАМОВЛЕННЯ ---------- */}
            <div className={`${T.card} flex-1 flex flex-col overflow-hidden min-h-0`}>
                {loading ? <Skeleton rows={6} /> : filtered.length === 0 ? (
                    <EmptyState
                        icon={FaFileInvoiceDollar}
                        title="Замовлень немає"
                        hint="Створіть замовлення вручну або імпортуйте рахунок постачальника з Excel."
                    >
                        <Btn variant="softOk" icon={FaFileExcel} onClick={() => fileRef.current?.click()}>Імпорт з Excel</Btn>
                        <Btn variant="accent" icon={FaPlus}
                            onClick={() => { setPoEdit(null); setPoFile(null); setPoMode('manual'); setPoModal(true); }}>
                            Нове замовлення
                        </Btn>
                    </EmptyState>
                ) : (
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {filtered.map(order => {
                            const s = orderStats(order);
                            const open = expandedId === order.id;
                            return (
                                <div key={order.id} className={open ? 'bg-indigo-50/30' : ''}>
                                    <div className="px-3 py-2.5">
                                        {/* Шапка замовлення */}
                                        <div className="flex items-start gap-2 flex-wrap">
                                            <button
                                                onClick={() => setExpandedId(open ? null : order.id)}
                                                className="flex items-start gap-2 min-w-0 flex-1 text-left"
                                            >
                                                <FaChevronDown
                                                    className={`text-slate-300 mt-1 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
                                                    size={11}
                                                />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="text-[13px] font-bold text-slate-900">{order.order_number}</span>
                                                        <StatusChip status={order.status} />
                                                        {order.installation && (
                                                            <Chip tone="accent" icon={FaHardHat}>{order.installation.name}</Chip>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                        <FaBuilding className="text-slate-400" size={9} />
                                                        {order.supplier?.name || 'Постачальник не вказаний'}
                                                        <span className="text-slate-300">·</span>
                                                        {new Date(order.order_date).toLocaleDateString('uk-UA')}
                                                        {order.invoice_number && (
                                                            <>
                                                                <span className="text-slate-300">·</span>
                                                                рахунок {order.invoice_number}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>

                                            {/* Три показники, які вирішують: чи треба сюди лізти */}
                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <div className="text-right">
                                                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Сума</div>
                                                    <div className="text-[13px] font-black tabular-nums text-slate-900">
                                                        {money(s.cost, order.currency)}
                                                    </div>
                                                </div>
                                                <div className="text-right w-24">
                                                    <div className={`text-[9px] font-black uppercase tracking-wider ${s.debt > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                        {s.debt > 0 ? 'Борг' : 'Оплачено'}
                                                    </div>
                                                    <div className={`text-[13px] font-black tabular-nums ${s.debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                                        {s.debt > 0 ? money(s.debt, order.currency) : '✓'}
                                                    </div>
                                                    <Bar className="mt-1" segments={[{ pct: s.paidPct, tone: s.debt > 0 ? 'warn' : 'ok' }]} />
                                                </div>
                                                <div className="text-right w-24 hidden sm:block">
                                                    <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Приїхало</div>
                                                    <div className="text-[13px] font-black tabular-nums text-slate-900">
                                                        {Math.round(s.recvPct)}%
                                                    </div>
                                                    <Bar className="mt-1" segments={[{ pct: s.recvPct, tone: s.recvPct >= 100 ? 'ok' : 'info' }]} />
                                                </div>
                                            </div>
                                        </div>

                                        {!isMobile && (
                                            <div className="mt-2"><OrderActions order={order} /></div>
                                        )}
                                    </div>

                                    {open && (
                                        <div className="px-3 pb-3 space-y-2">
                                            <div className={T.label}>
                                                Позиції ({(order.items || []).length})
                                                {s.pendingItems > 0 && (
                                                    <span className="text-amber-600 ml-2 normal-case tracking-normal">
                                                        · {s.pendingItems} ще не приїхало
                                                    </span>
                                                )}
                                            </div>
                                            <OrderItems order={order} />
                                            {order.notes && (
                                                <div className={`${T.inset} px-3 py-2 text-[12px] text-slate-600 italic`}>
                                                    <FaInfoCircle className="inline text-slate-400 mr-1.5" size={10} />
                                                    {order.notes}
                                                </div>
                                            )}
                                            {isMobile && <OrderActions order={order} full />}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ---------- ОПЛАТИ ---------- */}
            <Modal
                isOpen={!!payModal}
                onClose={() => setPayModal(null)}
                title="Оплати за замовленням"
                subtitle={payModal ? `${payModal.order_number} · ${payModal.supplier?.name || ''}` : ''}
                tone="warn"
                size="md"
            >
                {payModal && (() => {
                    const s = orderStats(payModal);
                    return (
                        <div className="space-y-4">
                            <div className={`${T.inset} px-3 py-2.5 grid grid-cols-3 gap-3 text-center`}>
                                <div>
                                    <div className={T.label}>Сума</div>
                                    <div className="text-[14px] font-black tabular-nums text-slate-900">{money(s.cost, payModal.currency)}</div>
                                </div>
                                <div>
                                    <div className={T.label}>Оплачено</div>
                                    <div className="text-[14px] font-black tabular-nums text-emerald-600">{money(s.paid, payModal.currency)}</div>
                                </div>
                                <div>
                                    <div className={T.label}>Борг</div>
                                    <div className={`text-[14px] font-black tabular-nums ${s.debt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        {money(s.debt, payModal.currency)}
                                    </div>
                                </div>
                            </div>

                            {/* Новий платіж */}
                            <div className="space-y-2.5">
                                <div className={T.label}>Додати платіж</div>
                                <div className="grid grid-cols-2 gap-2.5">
                                    <Field label="Спосіб">
                                        <select className={T.select} value={payForm.payment_type}
                                            onChange={e => setPayForm(f => ({ ...f, payment_type: e.target.value }))}>
                                            {Object.entries(PAYMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Призначення">
                                        <select className={T.select} value={payForm.purpose}
                                            onChange={e => setPayForm(f => ({ ...f, purpose: e.target.value }))}>
                                            {Object.entries(PAYMENT_PURPOSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <Field label="Сума" required className="col-span-2">
                                        <input type="number" step="any" min="0" inputMode="decimal"
                                            className={`${T.input} font-black tabular-nums`} placeholder="0"
                                            value={payForm.amount}
                                            onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} />
                                    </Field>
                                    <Field label="Валюта">
                                        <select className={T.select} value={payForm.currency}
                                            onChange={e => setPayForm(f => ({ ...f, currency: e.target.value }))}>
                                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </Field>
                                </div>
                                {payForm.currency !== payModal.currency && (
                                    <Field label="Курс"
                                        hint={`Платіж у ${payForm.currency}, замовлення в ${payModal.currency} — вкажіть курс перерахунку`}>
                                        <input type="number" step="any" min="0" className={T.input}
                                            value={payForm.exchange_rate}
                                            onChange={e => setPayForm(f => ({ ...f, exchange_rate: e.target.value }))} />
                                    </Field>
                                )}
                                <Field label="Коментар">
                                    <input className={T.input} placeholder="Необов’язково" value={payForm.notes}
                                        onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} />
                                </Field>
                                <Btn variant="ok" icon={FaPlus} className="w-full" onClick={savePayment} disabled={busy}>
                                    {busy ? 'Зберігаємо…' : 'Додати платіж'}
                                </Btn>
                            </div>

                            {/* Історія */}
                            {(payModal.payments || []).length > 0 && (
                                <div className="space-y-1.5">
                                    <div className={T.label}>Проведені платежі</div>
                                    {(payModal.payments || [])
                                        .slice()
                                        .sort((a, b) => new Date(b.payment_date) - new Date(a.payment_date))
                                        .map(p => (
                                            <div key={p.id}
                                                className={`${T.cardFlat} px-2.5 py-2 flex items-center gap-2 ${p.is_active ? '' : 'opacity-50'}`}>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[12.5px] font-bold text-slate-900">
                                                        {money(p.amount, p.currency)}
                                                        {!p.is_active && <span className="text-rose-500 ml-2 text-[10px] font-black uppercase">анульовано</span>}
                                                    </div>
                                                    <div className="text-[10.5px] text-slate-400">
                                                        {PAYMENT_TYPES[p.payment_type] || p.payment_type}
                                                        {' · '}{PAYMENT_PURPOSES[p.payment_purpose] || p.payment_purpose}
                                                        {' · '}{new Date(p.payment_date).toLocaleDateString('uk-UA')}
                                                        {p.notes && <span className="italic"> · {p.notes}</span>}
                                                    </div>
                                                </div>
                                                <IconBtn
                                                    variant={p.is_active ? 'softDanger' : 'softOk'}
                                                    icon={p.is_active ? FaBan : FaCheck}
                                                    label={p.is_active ? 'Анулювати' : 'Відновити'}
                                                    onClick={() => togglePayment(p)}
                                                />
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </Modal>

            {/* ---------- ПРИЙМАННЯ НА СКЛАД ---------- */}
            <Modal
                isOpen={!!recvModal}
                onClose={() => setRecvModal(null)}
                title="Приймання на склад"
                subtitle={recvModal ? `${recvModal.order.order_number} · ${recvModal.order.supplier?.name || ''}` : ''}
                tone="ok"
                size="md"
                footer={<>
                    <Btn variant="outline" onClick={() => setRecvModal(null)}>Скасувати</Btn>
                    <Btn variant="ok" icon={FaTruckLoading} onClick={saveReceiving} disabled={busy}>
                        {busy ? 'Приймаємо…' : 'Прийняти'}
                    </Btn>
                </>}
            >
                {recvModal && (
                    <div className="space-y-3">
                        <Field label="Склад призначення" required>
                            <Picker
                                options={warehouses.map(w => ({ id: w.id, label: w.name }))}
                                value={recvModal.warehouse_id}
                                onChange={v => setRecvModal(m => ({ ...m, warehouse_id: v }))}
                                placeholder="Куди приймаємо…" icon={FaWarehouse}
                            />
                        </Field>

                        {recvModal.order.installation_custom_id && (
                            <div className={`${T.inset} px-3 py-2 text-[12px] text-slate-600 leading-relaxed`}>
                                <FaHardHat className="inline text-indigo-500 mr-1.5" size={11} />
                                Замовлення під об'єкт <b>«{recvModal.order.installation?.name}»</b> —
                                прийняте одразу зарезервуємо під його потребу.
                            </div>
                        )}

                        <div className={T.label}>Що приймаємо</div>
                        <div className="space-y-1.5 sm:max-h-[42vh] sm:overflow-y-auto -mx-1 px-1">
                            {recvModal.items.map((it, idx) => {
                                const nom = nomById.get(it.nomenclature_id);
                                const left = it.ordered - it.already;
                                const now = parseFloat(it.now) || 0;
                                const over = now > left;
                                return (
                                    <div key={it.po_item_id}
                                        className={`px-2.5 py-2 rounded-lg border transition-colors
                                            ${now > 0 ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                                        <div className="text-[12.5px] font-semibold text-slate-900 leading-snug mb-1.5">
                                            {nom?.fullName || 'Позиція'}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] text-slate-500 tabular-nums">
                                                замовлено <b className="text-slate-800">{num(it.ordered)}</b>
                                                {it.already > 0 && <> · вже прийнято <b className="text-slate-800">{num(it.already)}</b></>}
                                                {' · '}лишилось <b className="text-emerald-700">{num(left)}</b>
                                            </span>
                                            <input
                                                type="number" min="0" max={left} step="any" inputMode="decimal"
                                                className={`w-24 h-9 ml-auto px-2 text-center border rounded-lg text-[13px] font-bold tabular-nums outline-none transition-colors
                                                    ${over ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-300 focus:border-emerald-500'}`}
                                                value={it.now}
                                                onChange={e => setRecvModal(m => ({
                                                    ...m,
                                                    items: m.items.map((x, i) => i === idx ? { ...x, now: e.target.value } : x),
                                                }))}
                                            />
                                            <span className="text-[10px] text-slate-400 w-8">{nom?.unit?.name || 'шт'}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </Modal>

            <PurchaseOrderModal
                isOpen={poModal}
                onClose={() => { setPoModal(false); setPoEdit(null); setPoFile(null); }}
                onSuccess={() => { setPoModal(false); setPoEdit(null); setPoFile(null); loadData(); }}
                initialMode={poMode}
                editOrder={poEdit}
                importFile={poFile}
                dictionaries={{ suppliers, installations, nomenclatures, categories, systemMemory }}
                employee={employee}
                showToast={toast}
                onAddSupplier={quickAddSupplier}
            />
        </div>
    );
}
