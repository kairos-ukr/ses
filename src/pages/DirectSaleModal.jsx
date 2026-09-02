// =====================================================================
//  Видача · Передача · Продаж — одна форма на три операції.
//
//  Різниця між ними лише в тому, кому віддаємо і чи є гроші:
//    видача   → під об'єкт, без грошей     (issue_to_object)
//    передача → партнеру, без грошей       (sell_to_object, partner_transfer)
//    продаж   → клієнту, з ціною           (sell_to_object, sale)
//
//  Тому це один екран із перемикачем, а не три схожі модалки.
//  Позиції проводяться по одній: якщо одна не пройшла, решта лишається
//  проведеною, а на проблемній видно причину.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FaArrowUp, FaHandshake, FaShoppingCart, FaPlus, FaTrash, FaBox,
    FaWarehouse, FaHardHat, FaUserTie, FaExclamationTriangle, FaCheckCircle,
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import DeliveryNoteModal from './DeliveryNoteModal';
import { generateDeliveryNoteNumber } from '../utils/deliveryNote';
import {
    T, TONE, Btn, IconBtn, Chip, Field, Picker, Modal, Skeleton,
    useToast, humanError, num,
} from '../ui';

const KINDS = {
    issue: { label: "Видача під об'єкт", short: 'Видача', icon: FaArrowUp, op: 'issue', money: false, tone: 'ok' },
    partner: { label: 'Передача партнеру', short: 'Передача', icon: FaHandshake, op: 'partner_transfer', money: false, tone: 'accent' },
    sale: { label: 'Продаж клієнту', short: 'Продаж', icon: FaShoppingCart, op: 'sale', money: true, tone: 'info' },
};

const CURRENCIES = ['USD', 'UAH', 'EUR'];
const newKey = () => Math.random().toString(36).slice(2, 10);
const emptyLine = () => ({ key: newKey(), nomenclature_id: '', sellMode: 'base', quantity: '', unit_price: '', error: '' });

export default function DirectSaleModal({ isOpen, onClose, onSuccess }) {
    const { employee } = useAuth();
    const toast = useToast();

    const [dict, setDict] = useState({ nomenclatures: [], warehouses: [], clients: [], installations: [], stock: [] });
    const [objNeeds, setObjNeeds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [noteDoc, setNoteDoc] = useState(null);

    const [form, setForm] = useState({
        kind: 'issue', client_id: '', installation_custom_id: '', warehouse_from_id: '',
        currency: 'USD', exchange_rate: '41.5', reference_document: '', notes: '',
    });
    const [lines, setLines] = useState([emptyLine()]);

    const cfg = KINDS[form.kind];
    const isMoney = cfg.money;

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const loadDict = useCallback(async () => {
        setLoading(true);
        try {
            const [nomRes, catRes, whRes, clRes, instRes, stockRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, package_name, package_multiplier, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
                supabase.from('clients').select('id, custom_id, name, phone, is_subcontract').order('name'),
                supabase.from('installations').select('custom_id, name').in('status', ['planning', 'in_progress', 'pending']),
                supabase.from('v_warehouse_stock_available').select('warehouse_id, nomenclature_id, quantity_on_hand, quantity_available'),
            ]);

            const catById = new Map((catRes.data || []).map(c => [c.id, c]));
            const noms = (nomRes.data || []).map(item => {
                const path = [];
                let id = item.category_id, guard = 0;
                while (id && guard++ < 20) {
                    const c = catById.get(id);
                    if (!c) break;
                    path.unshift(c.name);
                    id = c.parent_id;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim(), unitName: item.unit?.name || 'шт' };
            });

            setDict({
                nomenclatures: noms, warehouses: whRes.data || [],
                clients: clRes.data || [], installations: instRes.data || [],
                stock: stockRes.data || [],
            });
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
    }, [toast]);

    useEffect(() => {
        if (!isOpen) return;
        setForm(f => ({
            ...f, kind: 'issue', client_id: '', installation_custom_id: '',
            warehouse_from_id: '', notes: '', reference_document: '',
        }));
        setLines([emptyLine()]);
        setObjNeeds([]);
        setNoteDoc(null);
        loadDict();
        generateDeliveryNoteNumber().then(n => setForm(p => ({ ...p, reference_document: n })));
    }, [isOpen, loadDict]);

    // Потреба об'єкта — щоб бачити, чи видаємо в межах плану
    useEffect(() => {
        if (!form.installation_custom_id) { setObjNeeds([]); return; }
        let alive = true;
        supabase.from('v_object_material_needs').select('*')
            .eq('installation_custom_id', form.installation_custom_id)
            .then(({ data }) => { if (alive) setObjNeeds(data || []); });
        return () => { alive = false; };
    }, [form.installation_custom_id]);

    /* ---------------- ДОВІДКОВЕ ---------------- */

    const nomById = useCallback(
        (id) => dict.nomenclatures.find(n => String(n.id) === String(id)),
        [dict.nomenclatures]
    );

    const balOf = useCallback((nomId) => {
        if (!nomId || !form.warehouse_from_id) return { onHand: 0, available: 0 };
        const b = dict.stock.find(x =>
            String(x.nomenclature_id) === String(nomId) &&
            String(x.warehouse_id) === String(form.warehouse_from_id));
        return { onHand: parseFloat(b?.quantity_on_hand || 0), available: parseFloat(b?.quantity_available || 0) };
    }, [dict.stock, form.warehouse_from_id]);

    const needOf = useCallback(
        (nomId) => objNeeds.find(n => String(n.nomenclature_id) === String(nomId)),
        [objNeeds]
    );

    /* Видача бере фізичний залишок (свій резерв теж свій),
       продаж і передача — тільки вільний */
    const usableOf = useCallback(
        (nomId) => (form.kind === 'issue' ? balOf(nomId).onHand : balOf(nomId).available),
        [form.kind, balOf]
    );

    const nomOptions = useMemo(() => {
        if (!form.warehouse_from_id) return [];
        return dict.nomenclatures
            .filter(n => usableOf(n.id) > 0)
            .map(n => ({
                id: n.id,
                label: `${n.fullName}${n.sku ? ` · ${n.sku}` : ''} — ${num(usableOf(n.id))} ${n.unitName}`,
            }));
    }, [dict.nomenclatures, form.warehouse_from_id, usableOf]);

    const whOptions = useMemo(
        () => dict.warehouses.map(w => ({ id: w.id, label: w.name })), [dict.warehouses]
    );
    const clientOptions = useMemo(
        () => dict.clients.map(c => ({
            id: c.id, label: `${c.name}${c.is_subcontract ? ' · партнер' : ''} · #${c.custom_id || c.id}`,
        })), [dict.clients]
    );
    const instOptions = useMemo(
        () => dict.installations.map(i => ({ id: i.custom_id, label: `#${i.custom_id} ${i.name}` })),
        [dict.installations]
    );

    /* ---------------- РЯДКИ ---------------- */

    const addLine = () => setLines(ls => [...ls, emptyLine()]);
    const removeLine = (key) => setLines(ls => ls.length > 1 ? ls.filter(l => l.key !== key) : [emptyLine()]);
    const patchLine = (key, patch) => setLines(ls => ls.map(l => l.key === key ? { ...l, ...patch, error: '' } : l));

    /** Кількість у базових одиницях: у пачках — ділимо на кратність */
    const qtyBase = useCallback((line) => {
        const q = parseFloat(line.quantity);
        if (isNaN(q)) return 0;
        const nom = nomById(line.nomenclature_id);
        return (line.sellMode === 'piece' && nom?.package_multiplier > 1) ? q / nom.package_multiplier : q;
    }, [nomById]);

    const priceBase = useCallback((line) => {
        const p = parseFloat(line.unit_price);
        if (isNaN(p)) return null;
        const nom = nomById(line.nomenclature_id);
        return (line.sellMode === 'piece' && nom?.package_multiplier > 1) ? p * nom.package_multiplier : p;
    }, [nomById]);

    const grandTotal = useMemo(() => !isMoney ? 0 : lines.reduce((s, l) => {
        const q = parseFloat(l.quantity) || 0, p = parseFloat(l.unit_price) || 0;
        return s + q * p;
    }, 0), [lines, isMoney]);

    /* Перевищення плану або позиція поза специфікацією — просимо причину */
    const needsReason = useMemo(() => {
        if (!form.installation_custom_id) return false;
        return lines.some(l => {
            if (!l.nomenclature_id || !(parseFloat(l.quantity) > 0)) return false;
            const need = needOf(l.nomenclature_id);
            if (!need) return true;
            return qtyBase(l) > parseFloat(need.outstanding_need);
        });
    }, [form.installation_custom_id, lines, needOf, qtyBase]);

    const filledLines = lines.filter(l => l.nomenclature_id && parseFloat(l.quantity) > 0);

    /* ---------------- ШВИДКЕ ДОДАВАННЯ КЛІЄНТА ---------------- */

    const quickAddClient = async (name) => {
        try {
            const { data, error } = await supabase.from('clients').insert([{ name }]).select().single();
            if (error) throw error;
            setDict(p => ({ ...p, clients: [...p.clients, data].sort((a, b) => a.name.localeCompare(b.name, 'uk')) }));
            setForm(p => ({ ...p, client_id: data.id }));
            toast(`Клієнта «${name}» додано`);
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    /* ---------------- ПРОВЕДЕННЯ ---------------- */

    const recipientOk = () => {
        if (form.kind === 'issue') return !!form.installation_custom_id;
        if (form.kind === 'partner') return !!form.client_id;
        return !!form.client_id || !!form.installation_custom_id;
    };

    const buildNote = (okLines, docNumber) => {
        const client = dict.clients.find(c => String(c.id) === String(form.client_id));
        const inst = dict.installations.find(i => String(i.custom_id) === String(form.installation_custom_id));
        const wh = dict.warehouses.find(w => String(w.id) === String(form.warehouse_from_id));
        return {
            number: docNumber, date: new Date().toISOString(), kind: form.kind,
            buyerName: client ? client.name : (inst ? `Об’єкт «${inst.name}»` : '—'),
            buyerPhone: client?.phone || null,
            buyerId: client ? (client.custom_id || client.id) : null,
            objectLabel: inst ? `«${inst.name}» #${inst.custom_id}` : null,
            warehouseName: wh?.name || null,
            responsibleName: employee?.name || null,
            currency: isMoney ? form.currency : null,
            exchangeRate: isMoney ? (parseFloat(form.exchange_rate) || null) : null,
            notes: form.notes.trim() || null,
            items: okLines.map(l => {
                const nom = nomById(l.nomenclature_id);
                return {
                    name: nom?.fullName || 'Товар', sku: nom?.sku || '',
                    unit: nom?.unitName || 'шт', qty: qtyBase(l),
                    price: isMoney ? priceBase(l) : null,
                };
            }),
        };
    };

    const submit = async () => {
        if (!recipientOk()) {
            return toast(form.kind === 'issue' ? "Оберіть об'єкт" :
                form.kind === 'partner' ? 'Оберіть партнера' : "Оберіть клієнта або об'єкт", 'error');
        }
        if (!form.warehouse_from_id) return toast('Оберіть склад списання', 'error');
        if (!filledLines.length) return toast('Додайте хоча б одну позицію з кількістю', 'error');
        if (isMoney && filledLines.some(l => !(parseFloat(l.unit_price) >= 0))) {
            return toast('Вкажіть ціну для кожної позиції', 'error');
        }
        if (needsReason && !form.notes.trim()) {
            return toast('Є позиції поза планом — вкажіть причину в коментарі', 'warning');
        }

        setBusy(true);
        let docNumber = form.reference_document.trim() || await generateDeliveryNoteNumber();
        const ok = [], failed = [], movementIds = [];
        const next = [...lines];

        try {
            for (const line of filledLines) {
                const q = qtyBase(line);
                let data, error;

                if (form.kind === 'issue') {
                    ({ data, error } = await supabase.rpc('issue_to_object', {
                        p_installation: parseInt(form.installation_custom_id),
                        p_warehouse: parseInt(form.warehouse_from_id),
                        p_nomenclature: parseInt(line.nomenclature_id),
                        p_qty: q,
                        p_reason: form.notes.trim() || null,
                        p_emp: employee?.id ?? null,
                    }));
                } else {
                    ({ data, error } = await supabase.rpc('sell_to_object', {
                        p_installation: form.installation_custom_id ? parseInt(form.installation_custom_id) : null,
                        p_warehouse: parseInt(form.warehouse_from_id),
                        p_nomenclature: parseInt(line.nomenclature_id),
                        p_qty: q,
                        p_op: cfg.op,
                        p_client: form.client_id ? parseInt(form.client_id) : null,
                        p_sale_price: isMoney ? priceBase(line) : null,
                        p_currency: isMoney ? form.currency : null,
                        p_exchange_rate: isMoney ? (parseFloat(form.exchange_rate) || 1) : 1,
                        p_reference: docNumber || null,
                        p_reason: form.notes.trim() || null,
                        p_emp: employee?.id ?? null,
                    }));
                }

                const i = next.findIndex(l => l.key === line.key);
                if (error) {
                    failed.push(line);
                    if (i >= 0) next[i] = { ...next[i], error: humanError(error) };
                } else if (data?.ok === false) {
                    failed.push(line);
                    if (i >= 0) next[i] = { ...next[i], error: data.message || 'Відхилено' };
                } else {
                    ok.push(line);
                    if (data?.movement_id) movementIds.push(data.movement_id);
                }
            }

            // issue_to_object не приймає номер документа — дописуємо після проведення
            if (docNumber && movementIds.length) {
                const { error: stampErr } = await supabase.from('stock_movements')
                    .update({ reference_document: docNumber }).in('id', movementIds);
                if (stampErr) toast(`Номер накладної не збережено: ${humanError(stampErr)}`, 'error');
            }

            if (ok.length) onSuccess?.();

            if (!failed.length) {
                toast(`Проведено позицій: ${ok.length}`);
                setNoteDoc(buildNote(ok, docNumber));
            } else {
                setLines(next);
                toast(`Проведено ${ok.length}, з помилкою ${failed.length}`, 'error');
            }
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- РЯДОК КОШИКА ---------------- */

    const renderLine = (line) => {
        const nom = nomById(line.nomenclature_id);
        const usable = usableOf(line.nomenclature_id);
        const need = needOf(line.nomenclature_id);
        const q = qtyBase(line);
        const over = q > usable + 0.0001;
        const hasPackage = nom?.package_multiplier > 1;
        const unit = line.sellMode === 'piece' ? (nom?.package_name || 'уп.') : (nom?.unitName || 'шт');

        // На широкому екрані товар і числа стоять поруч — рядок займає
        // одну смугу замість трьох, і в списку видно більше позицій
        return (
            <div key={line.key} className={`${T.cardFlat} px-2.5 py-2.5 space-y-2 ${line.error ? 'border-rose-300 bg-rose-50/40' : over ? 'border-amber-300' : ''}`}>
                <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-3 lg:items-end space-y-2 lg:space-y-0">
                    <div className="flex items-start gap-2">
                        <Picker
                            className="flex-1"
                            options={nomOptions}
                            value={line.nomenclature_id}
                            onChange={v => patchLine(line.key, { nomenclature_id: v, sellMode: 'base' })}
                            disabled={!form.warehouse_from_id}
                            placeholder={form.warehouse_from_id ? 'Оберіть товар…' : 'Спершу склад'}
                            icon={FaBox}
                            searchPlaceholder="Назва або SKU…"
                        />
                        <IconBtn variant="softDanger" icon={FaTrash} label="Прибрати рядок"
                            onClick={() => removeLine(line.key)} />
                    </div>

                    {line.nomenclature_id && (
                        <div className="flex items-end gap-2 flex-wrap lg:flex-nowrap">
                            <div className="flex-1 min-w-[110px] lg:flex-none lg:w-24">
                                <span className={`${T.label} block mb-1`}>Кількість, {unit}</span>
                                <input
                                    type="number" min="0" step="any" inputMode="decimal"
                                    className={`${T.input} font-black tabular-nums ${over ? 'border-amber-400 bg-amber-50' : ''}`}
                                    placeholder="0" value={line.quantity}
                                    onChange={e => patchLine(line.key, { quantity: e.target.value })}
                                />
                            </div>

                            {hasPackage && (
                                <div className="flex-shrink-0">
                                    <span className={`${T.label} block mb-1`}>Одиниця</span>
                                    <select
                                        className={`${T.select} w-28`}
                                        value={line.sellMode}
                                        onChange={e => patchLine(line.key, { sellMode: e.target.value })}
                                    >
                                        <option value="base">{nom.unitName}</option>
                                        <option value="piece">{nom.package_name || 'уп.'}</option>
                                    </select>
                                </div>
                            )}

                            {isMoney && (
                                <div className="flex-1 min-w-[110px] lg:flex-none lg:w-28">
                                    <span className={`${T.label} block mb-1`}>Ціна за {unit}</span>
                                    <input
                                        type="number" min="0" step="any" inputMode="decimal"
                                        className={`${T.input} font-black tabular-nums`}
                                        placeholder="0" value={line.unit_price}
                                        onChange={e => patchLine(line.key, { unit_price: e.target.value })}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {line.nomenclature_id && (
                    <>
                        <div className="flex items-center gap-2 flex-wrap text-[11px]">
                            <Chip tone={usable > 0 ? 'ok' : 'danger'}>
                                на складі {num(usable)} {nom?.unitName}
                            </Chip>
                            {hasPackage && line.sellMode === 'piece' && (
                                <Chip tone="neutral">= {num(q)} {nom.unitName}</Chip>
                            )}
                            {need && (
                                <Chip tone={q > parseFloat(need.outstanding_need) ? 'warn' : 'info'}>
                                    потреба об'єкта {num(need.outstanding_need)}
                                </Chip>
                            )}
                            {form.installation_custom_id && !need && (
                                <Chip tone="warn" icon={FaExclamationTriangle}>поза специфікацією</Chip>
                            )}
                            {isMoney && parseFloat(line.quantity) > 0 && parseFloat(line.unit_price) > 0 && (
                                <span className="ml-auto font-black tabular-nums text-slate-900">
                                    {num(parseFloat(line.quantity) * parseFloat(line.unit_price))} {form.currency}
                                </span>
                            )}
                        </div>

                        {over && (
                            <div className="text-[11.5px] font-bold text-amber-700">
                                Більше, ніж є на складі — операцію буде відхилено.
                            </div>
                        )}
                        {line.error && (
                            <div className="text-[11.5px] font-bold text-rose-700">{line.error}</div>
                        )}
                    </>
                )}
            </div>
        );
    };

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={cfg.label}
                subtitle={form.reference_document ? `Документ ${form.reference_document}` : 'Списання зі складу'}
                tone={cfg.tone}
                size="lg"
                onSubmit={() => { if (!busy && filledLines.length) submit(); }}
                submitHint={cfg.short.toLowerCase()}
                footer={<>
                    {isMoney && grandTotal > 0 && (
                        <span className="mr-auto text-[13px] font-black tabular-nums text-slate-900">
                            Разом {num(grandTotal)} {form.currency}
                            {form.currency !== 'UAH' && parseFloat(form.exchange_rate) > 0 && (
                                <span className="text-[11px] font-bold text-slate-400 ml-1.5">
                                    ≈ {num(grandTotal * parseFloat(form.exchange_rate))} грн
                                </span>
                            )}
                        </span>
                    )}
                    <Btn variant="outline" onClick={onClose}>Скасувати</Btn>
                    <Btn
                        variant={form.kind === 'sale' ? 'accent' : 'ok'}
                        icon={cfg.icon}
                        onClick={submit}
                        disabled={busy || !filledLines.length}
                    >
                        {busy ? 'Проводимо…' : `${cfg.short} · ${filledLines.length}`}
                    </Btn>
                </>}
            >
                {loading ? <Skeleton rows={6} /> : (
                    <div className="space-y-4">

                        {/* Тип операції */}
                        <div className="grid grid-cols-3 gap-2">
                            {Object.entries(KINDS).map(([k, c]) => {
                                const on = form.kind === k;
                                return (
                                    <button
                                        key={k} type="button"
                                        onClick={() => setForm(f => ({ ...f, kind: k }))}
                                        className={`px-2 py-2.5 rounded-lg border-2 transition-colors text-center
                                            ${on ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-400'}`}
                                    >
                                        <c.icon className={`mx-auto mb-1 ${on ? 'text-indigo-600' : 'text-slate-400'}`} size={14} />
                                        <span className={`block text-[12px] font-bold ${on ? 'text-indigo-700' : 'text-slate-600'}`}>
                                            {c.short}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {/* На ПК «кому» і «звідки» стоять поруч: шапка документа
                            займає одну смугу, а список позицій отримує решту висоти */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">

                        {/* Кому */}
                        <div className={`${T.inset} p-3 space-y-2.5`}>
                            <div className={T.label}>
                                {form.kind === 'issue' ? "На який об'єкт"
                                    : form.kind === 'partner' ? 'Якому партнеру' : 'Кому продаємо'}
                            </div>

                            {form.kind !== 'partner' && (
                                <Field label="Об'єкт" required={form.kind === 'issue'}>
                                    <Picker
                                        options={[{ id: '', label: '— не вказано —' }, ...instOptions]}
                                        value={form.installation_custom_id}
                                        onChange={v => setForm(f => ({ ...f, installation_custom_id: v }))}
                                        placeholder="Оберіть об'єкт…" icon={FaHardHat}
                                        searchPlaceholder="Назва або номер…"
                                    />
                                </Field>
                            )}

                            {form.kind !== 'issue' && (
                                <Field
                                    label={form.kind === 'partner' ? 'Партнер' : 'Клієнт'}
                                    required={form.kind === 'partner'}
                                    hint="Якщо клієнта ще немає — введіть назву й створіть прямо тут"
                                >
                                    <Picker
                                        options={[{ id: '', label: '— не вказано —' }, ...clientOptions]}
                                        value={form.client_id}
                                        onChange={v => setForm(f => ({ ...f, client_id: v }))}
                                        onAddNew={quickAddClient}
                                        addLabel="Створити клієнта"
                                        placeholder="Оберіть…" icon={FaUserTie}
                                        searchPlaceholder="Почніть вводити назву…"
                                    />
                                </Field>
                            )}
                        </div>

                        {/* Звідки і гроші */}
                        <div className={`${T.inset} p-3 space-y-2.5`}>
                            <div className={T.label}>Звідки списуємо</div>

                            <Field label="Склад списання" required>
                                <Picker
                                    options={whOptions} value={form.warehouse_from_id}
                                    onChange={v => setForm(f => ({ ...f, warehouse_from_id: v }))}
                                    placeholder="Оберіть склад…" icon={FaWarehouse}
                                />
                            </Field>

                            {isMoney && (
                                <div className="grid grid-cols-2 gap-2.5">
                                    <Field label="Валюта">
                                        <select className={T.select} value={form.currency}
                                            onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </Field>
                                    {form.currency !== 'UAH' && (
                                        <Field label="Курс до гривні">
                                            <input type="number" step="any" min="0" inputMode="decimal"
                                                className={T.input} value={form.exchange_rate}
                                                onChange={e => setForm(f => ({ ...f, exchange_rate: e.target.value }))} />
                                        </Field>
                                    )}
                                </div>
                            )}
                        </div>

                        </div>{/* /шапка документа */}

                        {/* Позиції */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className={T.label}>Позиції · {filledLines.length}</span>
                                <Btn size="sm" variant="soft" icon={FaPlus} className="ml-auto"
                                    onClick={addLine} disabled={!form.warehouse_from_id}>
                                    Додати
                                </Btn>
                            </div>

                            {!form.warehouse_from_id ? (
                                <div className={`${T.inset} px-3 py-4 text-center text-[12.5px] text-slate-500`}>
                                    Спершу оберіть склад — далі буде видно, що на ньому є.
                                </div>
                            ) : nomOptions.length === 0 ? (
                                <div className={`${T.inset} px-3 py-4 text-center text-[12.5px] text-slate-500`}>
                                    На цьому складі немає нічого доступного для цієї операції.
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {lines.map(l => renderLine(l))}
                                </div>
                            )}
                        </div>

                        {/* Коментар */}
                        <Field
                            label={needsReason ? 'Причина — обов’язково' : 'Коментар'}
                            required={needsReason}
                            hint={needsReason
                                ? 'Є позиції поза специфікацією або понад потребу об’єкта'
                                : undefined}
                        >
                            <input
                                className={`${T.input} ${needsReason && !form.notes.trim() ? 'border-amber-400 bg-amber-50' : ''}`}
                                placeholder={needsReason ? 'Напр. заміна пошкодженого' : 'Необов’язково'}
                                value={form.notes}
                                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            />
                        </Field>

                        {filledLines.length > 0 && (
                            <div className={`${TONE[cfg.tone].chip} border rounded-lg px-3 py-2 flex items-center gap-2`}>
                                <FaCheckCircle size={12} />
                                <span className="text-[12.5px] font-bold">
                                    {cfg.short}: {filledLines.length} позицій
                                    {isMoney && grandTotal > 0 && ` на ${num(grandTotal)} ${form.currency}`}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <DeliveryNoteModal
                isOpen={!!noteDoc}
                doc={noteDoc}
                onClose={() => { setNoteDoc(null); onClose(); }}
            />
        </>
    );
}
