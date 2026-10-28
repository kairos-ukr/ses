// =====================================================================
//  K-CORE · Новий платіж — форма на місці, без вікна поверх сторінки
//
//  Одна форма для «Фінансів» і для картки об'єкта. Поля: об'єкт (якщо
//  не з картки), сума й валюта, дата, курс, спосіб, коментар.
//  Курс дня записується в кожен платіж: якщо валюта платежу інша, ніж
//  валюта угоди, — за ним перераховується сума (і він обов'язковий);
//  якщо та сама — лишається довідкою. Типово — курс із налаштувань.
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { FaCheck, FaHardHat, FaUserTie } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, Btn, Picker, Field, useToast, humanError, useAutoFocus } from '../ui';
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney, paymentInObjectCurrency } from '../domain/objects';
import { loadUsdRate } from '../utils/settings';

export const PAY_METHODS = [
    { v: 'Bank Transfer', l: 'Банк' },
    { v: 'Cash', l: 'Готівка' },
    { v: 'Card', l: 'Картка' },
    { v: 'Other', l: 'Інше' },
];
export const methodLabel = (v) => ({ 'Bank Transfer': 'Банківський переказ', Cash: 'Готівка', Card: 'Картка', Other: 'Інше', 'Безготівково': 'Безготівково' }[v] || v || '—');

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const chip = (on) => `h-10 px-3 rounded-lg border text-[13px] font-semibold transition-colors ${on
    ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`;

/**
 * installation — об'єкт, якщо форма в його картці ({ custom_id, name, currency });
 * client       — клієнт, якщо форма в його картці ({ id, name }); тоді objects — його об'єкти;
 * objects      — список об'єктів для вибору ({ custom_id, name, currency, client });
 * clients      — список клієнтів для платежу без об'єкта ({ id, name, company_name, phone }).
 */
export default function PaymentForm({ installation, client, objects = [], clients = [], employeeId, onSaved, onCancel }) {
    const toast = useToast();
    const autoFocus = useAutoFocus();
    // На що платіж: на об'єкт чи напряму на клієнта (продаж без об'єкта, аванс тощо)
    const [target, setTarget] = useState(installation ? 'object' : client ? 'client' : 'object');
    const [objId, setObjId] = useState(installation?.custom_id ?? '');
    const [clientId, setClientId] = useState(client?.id ?? '');
    const obj = installation || (target === 'object' || client ? objects.find(o => String(o.custom_id) === String(objId)) : null) || null;
    const dealCur = obj?.currency || DEFAULT_CURRENCY;

    const [f, setF] = useState({ amount: '', currency: installation?.currency || DEFAULT_CURRENCY, paid_at: isoDay(), rate: '', method: 'Bank Transfer', comment: '' });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);
    const set = (p) => { setF(x => ({ ...x, ...p })); setErrors(e => ({ ...e, ...Object.fromEntries(Object.keys(p).map(k => [k, null])) })); };

    useEffect(() => { loadUsdRate().then(r => setF(x => (x.rate === '' ? { ...x, rate: r ? String(r) : '' } : x))); }, []);

    const needsRate = !!obj && f.currency !== dealCur;
    const counted = needsRate ? paymentInObjectCurrency(f.amount, f.currency, dealCur, f.rate) : null;
    const otherCur = f.currency === 'USD' ? 'UAH' : 'USD';
    const inOther = Number(f.amount) > 0 && Number(f.rate) > 0
        ? (f.currency === 'USD' ? Number(f.amount) * Number(f.rate) : Number(f.amount) / Number(f.rate)) : null;

    const objectOptions = useMemo(() => objects.map(o => ({
        id: o.custom_id,
        label: [`СЕС-${o.custom_id}`, o.name, o.client?.company_name || o.client?.name].filter(Boolean).join(' · '),
    })), [objects]);
    const clientOptions = useMemo(() => clients.map(c => ({
        id: c.id,
        label: [c.company_name || c.name, c.company_name ? c.name : null, c.phone].filter(Boolean).join(' · '),
    })), [clients]);

    const save = async () => {
        const errs = {};
        if (target === 'object' && !client && !obj) errs.obj = "Оберіть об'єкт";
        if (target === 'client' && !client && clientId === '') errs.obj = 'Оберіть клієнта';
        if (!(Number(f.amount) > 0)) errs.amount = 'Вкажіть суму';
        if (needsRate && !(Number(f.rate) > 0)) errs.rate = 'Потрібен курс для перерахунку';
        if (f.rate !== '' && !(Number(f.rate) > 0)) errs.rate = 'Курс — додатне число';
        setErrors(errs);
        if (Object.keys(errs).length) return;
        setSaving(true);
        const { error } = await supabase.from('payment_history').insert({
            installation_custom_id: obj ? Number(obj.custom_id) : null,
            client_id: client ? client.id : (!obj && clientId !== '' ? Number(clientId) : null),
            amount: Number(f.amount),
            currency: f.currency,
            exchange_rate: f.rate === '' ? null : Number(f.rate),
            paid_at: f.paid_at,
            payment_method: f.method,
            comment: f.comment.trim() || null,
            created_by: employeeId || null,
        });
        setSaving(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`Платіж ${formatMoney(Number(f.amount), f.currency)} додано`, 'success');
        onSaved?.();
    };

    return (
        <div className="space-y-3" onKeyDown={e => { if (e.key === 'Escape') onCancel?.(); }}>
            {!installation && !client && (
                <div className="flex gap-1.5">
                    {[{ v: 'object', l: "На об'єкт" }, { v: 'client', l: 'На клієнта' }].map(t => (
                        <button key={t.v} type="button" onClick={() => { setTarget(t.v); setErrors({}); }} className={chip(target === t.v)}>{t.l}</button>
                    ))}
                </div>
            )}
            {!installation && (client || target === 'object') && (
                <Field label={client ? "Об'єкт (якщо платіж по об'єкту)" : "Об'єкт"} required={!client}>
                    <Picker options={client ? [{ id: '', label: "Без об'єкта — на клієнта" }, ...objectOptions] : objectOptions} value={objId} onChange={v => {
                        setObjId(v);
                        const o = objects.find(x => String(x.custom_id) === String(v));
                        set({ currency: o?.currency || f.currency || DEFAULT_CURRENCY });
                        setErrors(e => ({ ...e, obj: null }));
                    }} placeholder={client ? "Без об'єкта — на клієнта" : 'Номер, назва або клієнт…'} searchPlaceholder="Пошук об'єкта…" icon={FaHardHat} />
                    {errors.obj && <div className="mt-1 text-[12px] font-semibold text-rose-600">{errors.obj}</div>}
                </Field>
            )}
            {!installation && !client && target === 'client' && (
                <Field label="Клієнт" required>
                    <Picker options={clientOptions} value={clientId} onChange={v => { setClientId(v); setErrors(e => ({ ...e, obj: null })); }}
                        placeholder="Ім'я, компанія або телефон…" searchPlaceholder="Пошук клієнта…" icon={FaUserTie} />
                    {errors.obj && <div className="mt-1 text-[12px] font-semibold text-rose-600">{errors.obj}</div>}
                </Field>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-3 items-end">
                <Field label="Сума" required>
                    <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus={autoFocus && !!installation}
                        className={`${T.input} h-11 text-[16px] font-bold tabular-nums ${errors.amount ? 'border-rose-400' : ''}`}
                        value={f.amount} onChange={e => set({ amount: e.target.value })} placeholder="0" />
                    {errors.amount && <div className="mt-1 text-[12px] font-semibold text-rose-600">{errors.amount}</div>}
                </Field>
                <div className="flex gap-1.5">
                    {CURRENCIES.map(c => (
                        <button key={c.key} type="button" onClick={() => set({ currency: c.key })} className={`${chip(f.currency === c.key)} h-11 min-w-[64px]`}>
                            {c.symbol} {c.key === 'USD' ? 'дол.' : 'грн'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Дата">
                    <input type="date" className={`${T.input} h-11`} value={f.paid_at} onChange={e => set({ paid_at: e.target.value })} />
                </Field>
                <Field label={needsRate ? 'Курс, грн за 1 $ (для перерахунку)' : 'Курс, грн за 1 $'} required={needsRate}>
                    <input type="number" inputMode="decimal" min="0" step="0.01" className={`${T.input} h-11 tabular-nums ${errors.rate ? 'border-rose-400' : ''}`}
                        value={f.rate} onChange={e => set({ rate: e.target.value })} placeholder="Напр. 41.50" />
                    {errors.rate && <div className="mt-1 text-[12px] font-semibold text-rose-600">{errors.rate}</div>}
                </Field>
            </div>

            {(counted != null || inOther != null) && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-[13px] text-emerald-800 tabular-nums">
                    {counted != null
                        ? <>Зараховується в угоду: <b>{formatMoney(counted, dealCur)}</b></>
                        : <>За курсом це ≈ <b>{formatMoney(Math.round(inOther * 100) / 100, otherCur)}</b></>}
                </div>
            )}

            <div>
                <span className={T.label}>Спосіб</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {PAY_METHODS.map(m => <button key={m.v} type="button" onClick={() => set({ method: m.v })} className={chip(f.method === m.v)}>{m.l}</button>)}
                </div>
            </div>

            <Field label="Коментар">
                <textarea rows={2} className={`${T.input} h-auto py-2 resize-y`} value={f.comment} onChange={e => set({ comment: e.target.value })} placeholder="За що: аванс, залишок, обладнання…" />
            </Field>

            <div className="flex flex-wrap gap-2 pt-1">
                <Btn variant="ok" size="lg" icon={FaCheck} onClick={save} disabled={saving} className="flex-1 sm:flex-none">
                    {saving ? 'Зберігаємо…' : 'Додати платіж'}
                </Btn>
                {onCancel && <Btn variant="outline" size="lg" onClick={onCancel} disabled={saving}>Скасувати</Btn>}
            </div>
        </div>
    );
}
