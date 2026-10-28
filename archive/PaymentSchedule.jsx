// =====================================================================
//  Графік платежів об'єкта (етап 4, п.16)
//
//  Що й коли клієнт має сплатити: «Аванс 50% до 20.10», «Залишок після
//  монтажу». Позначати «сплачено» не треба: внесені платежі самі
//  закривають рядки по черзі (рахує база, v_payment_schedule).
//  Готові шаблони 50/50, 70/30, 100% розписують вартість одним кліком.
// =====================================================================

import React, { useState } from 'react';
import { FaPlus, FaTimes, FaPen } from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { T, Btn, Chip, useToast, humanError } from './ui';
import { formatMoney } from './domain/objects';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : null);

const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Розписати вартість частками; копійки — в останній рядок */
const split = (cost, parts) => {
    const rows = parts.map(p => ({ ...p, amount: Math.round(cost * p.share * 100) / 100 }));
    const diff = Math.round((cost - rows.reduce((s, r) => s + r.amount, 0)) * 100) / 100;
    rows[rows.length - 1].amount = Math.round((rows[rows.length - 1].amount + diff) * 100) / 100;
    return rows.map(({ share, ...r }) => ({ ...r, amount: String(r.amount) }));
};

const TEMPLATES = [
    { key: '50', label: '50 / 50', parts: [{ title: 'Аванс 50%', share: 0.5, due_date: addDays(3) }, { title: 'Залишок після монтажу', share: 0.5, due_date: '' }] },
    { key: '70', label: '70 / 30', parts: [{ title: 'Аванс 70%', share: 0.7, due_date: addDays(3) }, { title: 'Залишок після монтажу', share: 0.3, due_date: '' }] },
    { key: '100', label: '100%', parts: [{ title: 'Повна оплата', share: 1, due_date: addDays(3) }] },
];

const STATUS = {
    paid: { label: 'сплачено', tone: 'ok' },
    partial: { label: 'частково', tone: 'info' },
    pending: { label: 'очікується', tone: 'neutral' },
};

export default function PaymentSchedule({ installationId, rows, cost, currency, canEdit, employeeId, onSaved }) {
    const toast = useToast();
    const [draft, setDraft] = useState(null);   // редагування: [{ id?, title, amount, due_date }]
    const [saving, setSaving] = useState(false);

    const startEdit = (fromTemplate) => {
        if (fromTemplate) setDraft(split(cost, fromTemplate.parts));
        else setDraft(rows.length
            ? rows.map(r => ({ id: r.id, title: r.title, amount: String(r.amount), due_date: r.due_date || '' }))
            : [{ title: 'Аванс', amount: '', due_date: addDays(3) }]);
    };

    const setRow = (i, patch) => setDraft(d => d.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const draftSum = (draft || []).reduce((s, r) => s + (Number(r.amount) || 0), 0);

    const save = async () => {
        const clean = draft
            .map(r => ({ ...r, title: (r.title || '').trim(), amount: Number(r.amount) }))
            .filter(r => r.title || r.amount);
        if (clean.some(r => !r.title)) { toast('Вкажіть назву кожного платежу', 'error'); return; }
        if (clean.some(r => !(r.amount > 0))) { toast('Сума кожного платежу має бути більшою за 0', 'error'); return; }

        setSaving(true);
        try {
            const keep = new Set(clean.filter(r => r.id).map(r => r.id));
            const removed = rows.filter(r => !keep.has(r.id)).map(r => r.id);
            if (removed.length) {
                const { error } = await supabase.from('payment_schedule').delete().in('id', removed);
                if (error) throw error;
            }
            for (let i = 0; i < clean.length; i += 1) {
                const r = clean[i];
                const payload = { seq: i + 1, title: r.title, amount: r.amount, due_date: r.due_date || null };
                // eslint-disable-next-line no-await-in-loop
                const { error } = r.id
                    ? await supabase.from('payment_schedule').update(payload).eq('id', r.id)
                    : await supabase.from('payment_schedule').insert({ ...payload, installation_custom_id: Number(installationId), created_by: employeeId || null });
                if (error) throw error;
            }
            toast(clean.length ? 'Графік платежів збережено' : 'Графік платежів очищено');
            setDraft(null);
            onSaved?.();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setSaving(false);
        }
    };

    /* ---------- Редагування ---------- */
    if (draft) {
        const mismatch = cost > 0 && Math.abs(draftSum - cost) > 0.009;
        return (
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className={T.label}>Графік платежів</span>
                    {cost > 0 && (
                        <span className="flex gap-1">
                            {TEMPLATES.map(t => (
                                <button key={t.key} type="button" onClick={() => startEdit(t)}
                                    className="h-7 px-2 rounded-md border border-slate-200 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50">
                                    {t.label}
                                </button>
                            ))}
                        </span>
                    )}
                </div>
                {draft.map((r, i) => (
                    <div key={r.id || `new-${i}`} className={`${T.inset} p-2 space-y-1.5`}>
                        <div className="flex gap-1.5">
                            <input className={`${T.input} h-9`} value={r.title} placeholder="Назва, напр. «Аванс»"
                                onChange={e => setRow(i, { title: e.target.value })} />
                            <button type="button" onClick={() => setDraft(d => d.filter((_, j) => j !== i))}
                                aria-label="Прибрати рядок" title="Прибрати рядок"
                                className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                                <FaTimes size={11} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                            <input type="number" min="0" step="0.01" className={`${T.input} h-9 tabular-nums`} value={r.amount}
                                placeholder={`Сума, ${currency}`} onChange={e => setRow(i, { amount: e.target.value })} />
                            <input type="date" className={`${T.input} h-9`} value={r.due_date || ''} title="До якої дати (можна без дати)"
                                onChange={e => setRow(i, { due_date: e.target.value })} />
                        </div>
                    </div>
                ))}
                <button type="button" onClick={() => setDraft(d => [...d, { title: '', amount: '', due_date: '' }])}
                    className="w-full h-9 rounded-lg border border-dashed border-slate-300 text-[12.5px] font-semibold text-slate-500 hover:text-slate-800 hover:border-slate-400 inline-flex items-center justify-center gap-1.5">
                    <FaPlus size={10} /> Додати платіж у графік
                </button>
                <div className={`text-[12px] tabular-nums ${mismatch ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>
                    Розписано {formatMoney(draftSum, currency)}{cost > 0 ? ` з ${formatMoney(cost, currency)}` : ''}
                    {mismatch && (draftSum < cost ? ` · не вистачає ${formatMoney(cost - draftSum, currency)}` : ` · більше на ${formatMoney(draftSum - cost, currency)}`)}
                </div>
                <div className="flex gap-2 justify-end">
                    <Btn size="sm" variant="outline" onClick={() => setDraft(null)} disabled={saving}>Скасувати</Btn>
                    <Btn size="sm" variant="accent" onClick={save} disabled={saving}>{saving ? 'Зберігаю…' : 'Зберегти'}</Btn>
                </div>
            </div>
        );
    }

    /* ---------- Перегляд ---------- */
    const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const mismatch = rows.length > 0 && cost > 0 && Math.abs(total - cost) > 0.009;

    return (
        <div>
            <div className="flex items-center justify-between mb-1.5">
                <span className={T.label}>Графік платежів</span>
                {canEdit && rows.length > 0 && (
                    <button type="button" onClick={() => startEdit()} className="text-[12px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">
                        <FaPen size={9} /> Змінити
                    </button>
                )}
            </div>

            {rows.length === 0 ? (
                canEdit ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[12.5px] text-slate-400 mr-1">Не задано</span>
                        {cost > 0 && TEMPLATES.map(t => (
                            <button key={t.key} type="button" onClick={() => startEdit(t)}
                                className="h-7 px-2 rounded-md border border-slate-200 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-50">
                                {t.label}
                            </button>
                        ))}
                        <button type="button" onClick={() => startEdit()}
                            className="h-7 px-2 rounded-md border border-dashed border-slate-300 text-[11.5px] font-semibold text-slate-500 hover:text-slate-800">
                            Свій
                        </button>
                    </div>
                ) : <p className="text-[12.5px] text-slate-400">Не задано</p>
            ) : (
                <ul className="space-y-1">
                    {rows.map(r => {
                        const st = r.status === 'overdue'
                            ? { label: `прострочено ${r.days_overdue} дн`, tone: 'danger' }
                            : STATUS[r.status] || STATUS.pending;
                        const partial = Number(r.paid_part) > 0 && Number(r.remaining) > 0.009;
                        return (
                            <li key={r.id} className="flex items-start gap-2 py-1">
                                <div className="min-w-0 flex-1">
                                    <div className={`text-[13px] font-semibold truncate ${r.status === 'paid' ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800'}`}>{r.title}</div>
                                    <div className="text-[11.5px] text-slate-500 tabular-nums">
                                        {formatMoney(r.amount, currency)}
                                        {r.due_date ? ` · до ${fmt(r.due_date)}` : ' · без дати'}
                                        {partial && ` · лишилось ${formatMoney(r.remaining, currency)}`}
                                    </div>
                                </div>
                                <Chip tone={st.tone}>{st.label}</Chip>
                            </li>
                        );
                    })}
                </ul>
            )}
            {mismatch && (
                <p className="mt-1 text-[11.5px] font-semibold text-amber-700 tabular-nums">
                    У графіку {formatMoney(total, currency)}, а вартість {formatMoney(cost, currency)}
                </p>
            )}
        </div>
    );
}
