// =====================================================================
//  Прибуток з об'єкта: план і факт (етап 4, п.17)
//
//  Прибуток = вартість для клієнта − матеріали − роботи − інші витрати,
//  усе в гривнях (долари — за курсом з налаштувань). Дані — перегляди
//  v_object_profit / v_object_materials_cost / v_object_labour_cost
//  (db/2026-10_object_profit.sql).
//
//  Ціни закупівлі й денні ставки, яких бракує, вводяться прямо тут:
//  інакше прибуток вийде завищеним, і панель про це попереджає.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { FaPlus, FaTrash, FaExclamationTriangle, FaCheck, FaPen } from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { T, Btn, IconBtn, Tip, Skeleton, useToast, useConfirm, humanError, num } from './ui';
import { CURRENCIES, formatMoney } from './domain/objects';
import { saveUsdRate as storeUsdRate } from './utils/settings';
import { useAuth } from './AuthProvider';

const uah = (v) => formatMoney(Math.round(Number(v) || 0), 'UAH');
const today = () => new Date().toISOString().slice(0, 10);

/** Невелике поле ціни з кнопкою «зберегти» — для таблиць */
export const InlinePrice = ({ value, currency, withCurrency, onSave, placeholder = 'ціна', readOnly = false }) => {
    const [draft, setDraft] = useState(null);
    if (readOnly) {
        return <span className="tabular-nums font-semibold text-slate-800">{value != null ? formatMoney(value, currency || 'UAH') : '—'}</span>;
    }
    if (draft === null) {
        return (
            <button type="button" onClick={() => setDraft({ v: value ?? '', c: currency || 'UAH' })}
                className={`inline-flex items-center gap-1.5 tabular-nums ${value != null ? 'font-semibold text-slate-800 hover:underline' : 'text-amber-700 font-semibold hover:underline'}`}>
                {value != null ? formatMoney(value, currency || 'UAH') : <><FaPen size={9} /> {placeholder}</>}
            </button>
        );
    }
    const save = async () => {
        const raw = String(draft.v).trim();
        const n = raw === '' ? null : Number(raw.replace(',', '.'));
        if (n != null && (!Number.isFinite(n) || n < 0)) return;
        const ok = await onSave(n, draft.c);
        if (ok !== false) setDraft(null);
    };
    return (
        <span className="inline-flex items-center gap-1">
            <input autoFocus type="number" min="0" step="0.01" value={draft.v}
                onChange={e => setDraft(d => ({ ...d, v: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setDraft(null); }}
                className={`${T.input} h-8 w-24 text-right tabular-nums`} />
            {withCurrency && (
                <select value={draft.c} onChange={e => setDraft(d => ({ ...d, c: e.target.value }))} className={`${T.select} h-8 w-14 px-1.5`}>
                    {CURRENCIES.map(c => <option key={c.key} value={c.key}>{c.symbol}</option>)}
                </select>
            )}
            <IconBtn variant="ok" icon={FaCheck} label="Зберегти" onClick={save} />
        </span>
    );
};

export default function ObjectProfitPanel({ installationId, employeeId }) {
    const toast = useToast();
    const confirm = useConfirm();
    // Доступи → «Собівартість і прибуток»: змінювати ціни, ставки, витрати, курс
    const canEditProfit = useAuth().can('profit', 'edit');

    const [loading, setLoading] = useState(true);
    const [profit, setProfit] = useState(null);
    const [materials, setMaterials] = useState([]);
    const [labour, setLabour] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [rateDraft, setRateDraft] = useState(null);
    const [expDraft, setExpDraft] = useState(null);

    const load = useCallback(async () => {
        const [p, m, l, x] = await Promise.all([
            supabase.from('v_object_profit').select('*').eq('installation_custom_id', installationId).maybeSingle(),
            supabase.from('v_object_materials_cost').select('*').eq('installation_custom_id', installationId),
            supabase.from('v_object_labour_cost').select('*').eq('installation_custom_id', installationId),
            supabase.from('object_expenses').select('*').eq('installation_custom_id', installationId).order('spent_at', { ascending: false }),
        ]);
        if (p.error) { toast(humanError(p.error), 'error'); setLoading(false); return; }
        setProfit(p.data);
        // Без ціни — зверху, далі найдорожчі
        setMaterials((m.data || []).sort((a, b) => (a.cost_price == null ? -1 : 0) - (b.cost_price == null ? -1 : 0) || (Number(b.amount_uah) || 0) - (Number(a.amount_uah) || 0)));
        setLabour((l.data || []).sort((a, b) => b.days - a.days));
        setExpenses(x.data || []);
        setLoading(false);
    }, [installationId, toast]);

    useEffect(() => { load(); }, [load]);

    const saveCost = async (nomId, price, currency) => {
        const { error } = await supabase.from('nomenclature')
            .update({ cost_price: price, cost_currency: currency, cost_price_updated_at: new Date().toISOString() })
            .eq('id', nomId);
        if (error) { toast(humanError(error), 'error'); return false; }
        load();
        return true;
    };

    const saveRate = async (empCustomId, rate) => {
        const { error } = await supabase.from('employees').update({ day_rate: rate }).eq('custom_id', empCustomId);
        if (error) { toast(humanError(error), 'error'); return false; }
        load();
        return true;
    };

    const saveUsdRate = async () => {
        const rate = Number(String(rateDraft).replace(',', '.'));
        if (!(rate > 0)) { toast('Курс — число більше за 0', 'error'); return; }
        try {
            await storeUsdRate(rate, employeeId);
        } catch (error) { toast(humanError(error), 'error'); return; }
        setRateDraft(null);
        toast('Курс збережено — прибуток перераховано для всіх об\'єктів');
        load();
    };

    const addExpense = async () => {
        const amount = Number(String(expDraft.amount).replace(',', '.'));
        if (!expDraft.title.trim()) { toast('Вкажіть, що це за витрата', 'error'); return; }
        if (!(amount > 0)) { toast('Сума має бути більшою за 0', 'error'); return; }
        const { error } = await supabase.from('object_expenses').insert({
            installation_custom_id: Number(installationId), title: expDraft.title.trim(), amount,
            currency: expDraft.currency, spent_at: expDraft.spent_at || today(), created_by: employeeId || null,
        });
        if (error) { toast(humanError(error), 'error'); return; }
        setExpDraft(null);
        load();
    };

    const removeExpense = async (e) => {
        const ok = await confirm({ title: 'Видалити витрату?', message: `${e.title}: ${formatMoney(e.amount, e.currency)}`, confirmLabel: 'Видалити' });
        if (!ok) return;
        const { error } = await supabase.from('object_expenses').delete().eq('id', e.id);
        if (error) { toast(humanError(error), 'error'); return; }
        load();
    };

    if (loading) return <div className={T.card}><Skeleton rows={6} /></div>;
    if (!profit) return <div className={`${T.card} p-6 text-center text-slate-400`}>Прибуток рахується лише для власних об'єктів</div>;

    const p = profit;
    const incomplete = p.materials_missing > 0 || p.labour_missing > 0;
    const marginTone = p.margin_pct == null ? 'text-slate-400' : p.margin_pct < 10 ? 'text-rose-700' : p.margin_pct < 20 ? 'text-amber-700' : 'text-emerald-700';

    const tiles = [
        { label: 'Виручка', value: uah(p.revenue_uah), sub: p.currency === 'USD' && p.total_cost ? `${formatMoney(p.total_cost, 'USD')} за курсом ${num(p.usd_rate, 2)}` : 'вартість для клієнта' },
        { label: 'Собівартість', value: uah(p.cost_uah), sub: `матеріали ${uah(p.materials_uah)} · роботи ${uah(p.labour_uah)}${p.expenses_uah > 0 ? ` · інше ${uah(p.expenses_uah)}` : ''}` },
        { label: 'Прибуток', value: uah(p.profit_uah), tone: Number(p.profit_uah) < 0 ? 'text-rose-700' : 'text-slate-900', sub: incomplete ? 'порахований не повністю' : 'факт' },
        { label: 'Маржа', value: p.margin_pct == null ? '—' : `${num(p.margin_pct, 1)}%`, tone: marginTone, sub: p.plan_profit_before_labour_uah != null ? `план до робіт: ${uah(p.plan_profit_before_labour_uah)}` : 'плану за специфікацією немає' },
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {tiles.map(t => (
                    <div key={t.label} className={`${T.card} p-4`}>
                        <div className="text-[12.5px] font-semibold text-slate-500">{t.label}</div>
                        <div className={`mt-1 text-[22px] leading-tight font-bold tabular-nums ${t.tone || 'text-slate-900'}`}>{t.value}</div>
                        <div className="mt-1 text-[12px] text-slate-500 line-clamp-2">{t.sub}</div>
                    </div>
                ))}
            </div>

            {incomplete && (
                <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-[13px] text-amber-900">
                    <FaExclamationTriangle className="mt-0.5 flex-shrink-0" size={13} />
                    <span>
                        Прибуток завищений: {p.materials_missing > 0 && <b>{p.materials_missing} позицій без ціни закупівлі</b>}
                        {p.materials_missing > 0 && p.labour_missing > 0 && ', '}
                        {p.labour_missing > 0 && <b>{p.labour_missing} працівників без ставки</b>}. Вкажіть їх нижче — ціна позиції запам'ятається для всіх об'єктів.
                    </span>
                </div>
            )}

            <div className="flex items-center justify-end gap-2 text-[12.5px] text-slate-500">
                {rateDraft === null ? (
                    <button type="button" disabled={!canEditProfit} onClick={() => setRateDraft(String(p.usd_rate))} className="hover:text-slate-800 inline-flex items-center gap-1.5 disabled:hover:text-slate-500 disabled:cursor-default">
                        Курс для розрахунку: <b className="text-slate-700 tabular-nums">1 $ = {num(p.usd_rate, 2)} ₴</b> {canEditProfit && <FaPen size={9} />}
                    </button>
                ) : (
                    <span className="inline-flex items-center gap-1.5">
                        1 $ =
                        <input autoFocus type="number" min="0" step="0.01" value={rateDraft}
                            onChange={e => setRateDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveUsdRate(); if (e.key === 'Escape') setRateDraft(null); }}
                            className={`${T.input} h-8 w-20 text-right tabular-nums`} /> ₴
                        <IconBtn variant="ok" icon={FaCheck} label="Зберегти курс" onClick={saveUsdRate} />
                    </span>
                )}
                <Tip text="Один курс для всіх об'єктів: ним переводяться долари у гривні в прибутку й аналітиці." />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 items-start">
                {/* Матеріали */}
                <div className={T.card}>
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-[15px] font-bold text-slate-900">Матеріали зі складу</h3>
                        <span className="text-[13px] font-bold tabular-nums text-slate-900">{uah(p.materials_uah)}</span>
                    </div>
                    {materials.length === 0 ? (
                        <p className="px-4 py-5 text-center text-[13px] text-slate-400">На об'єкт ще нічого не видавали</p>
                    ) : (
                        <>
                        {/* Телефон: назва повністю, під нею кількість, ціна і сума */}
                        <ul className="md:hidden divide-y divide-slate-100">
                            {materials.map(m => (
                                <li key={m.nomenclature_id} className={`px-4 py-2.5 ${m.cost_price == null ? 'bg-amber-50/40' : ''}`}>
                                    <div className="text-[13.5px] font-medium text-slate-800 leading-snug break-words">
                                        {m.brand && !m.name.startsWith(m.brand) ? `${m.brand} ` : ''}{m.name}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 flex-wrap text-[12.5px]">
                                        <span className="text-slate-500 tabular-nums">{num(m.qty)} {m.unit_name || ''} ×</span>
                                        <InlinePrice readOnly={!canEditProfit} value={m.cost_price} currency={m.cost_currency} withCurrency
                                            onSave={(v, c) => saveCost(m.nomenclature_id, v, c)} placeholder="вказати ціну" />
                                        <span className="ml-auto font-semibold tabular-nums">{m.amount_uah != null ? uah(m.amount_uah) : '—'}</span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-slate-200">
                                        <th className={T.th}>Позиція</th>
                                        <th className={`${T.th} text-right`}>Видано</th>
                                        <th className={`${T.th} text-right`}>Ціна закупівлі</th>
                                        <th className={`${T.th} text-right`}>Сума, ₴</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {materials.map(m => (
                                        <tr key={m.nomenclature_id} className={m.cost_price == null ? 'bg-amber-50/40' : ''}>
                                            <td className={`${T.td} max-w-[280px]`}><div className="truncate" title={m.name}>{m.brand && !m.name.startsWith(m.brand) ? `${m.brand} ` : ''}{m.name}</div></td>
                                            <td className={`${T.td} text-right tabular-nums whitespace-nowrap`}>{num(m.qty)} {m.unit_name || ''}</td>
                                            <td className={`${T.td} text-right whitespace-nowrap`}>
                                                <InlinePrice readOnly={!canEditProfit} value={m.cost_price} currency={m.cost_currency} withCurrency
                                                    onSave={(v, c) => saveCost(m.nomenclature_id, v, c)} placeholder="вказати" />
                                            </td>
                                            <td className={`${T.td} text-right tabular-nums whitespace-nowrap font-semibold`}>{m.amount_uah != null ? uah(m.amount_uah) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        </>
                    )}
                </div>

                <div className="space-y-4">
                    {/* Роботи */}
                    <div className={T.card}>
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-1.5">
                                Роботи бригади
                                <Tip text="Людино-дні з обліку робочих днів на об'єкті × денна ставка працівника. Ставку видно лише в цій вкладці." />
                            </h3>
                            <span className="text-[13px] font-bold tabular-nums text-slate-900">{uah(p.labour_uah)}</span>
                        </div>
                        {labour.length === 0 ? (
                            <p className="px-4 py-5 text-center text-[13px] text-slate-400">Робочих днів на об'єкті не записано</p>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {labour.map(w => (
                                    <li key={w.employee_custom_id} className={`px-4 py-2.5 flex items-center gap-3 text-[13px] ${w.day_rate == null ? 'bg-amber-50/40' : ''}`}>
                                        <span className="flex-1 min-w-0 truncate font-medium text-slate-800">{w.name || `#${w.employee_custom_id}`}</span>
                                        <span className="text-slate-500 tabular-nums whitespace-nowrap">{w.days} дн ×</span>
                                        <InlinePrice readOnly={!canEditProfit} value={w.day_rate} currency="UAH" onSave={v => saveRate(w.employee_custom_id, v)} placeholder="ставка" />
                                        <span className="w-20 text-right font-semibold tabular-nums">{w.amount_uah != null ? uah(w.amount_uah) : '—'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Інші витрати */}
                    <div className={T.card}>
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <h3 className="text-[15px] font-bold text-slate-900">Інші витрати</h3>
                            <span className="text-[13px] font-bold tabular-nums text-slate-900">{uah(p.expenses_uah)}</span>
                        </div>
                        <ul className="divide-y divide-slate-100">
                            {expenses.map(e => (
                                <li key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-slate-800 truncate">{e.title}</div>
                                        <div className="text-[11.5px] text-slate-400">{new Date(e.spent_at).toLocaleDateString('uk-UA')}</div>
                                    </div>
                                    <span className="font-semibold tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                                    {canEditProfit && <IconBtn icon={FaTrash} label="Видалити" onClick={() => removeExpense(e)} />}
                                </li>
                            ))}
                        </ul>
                        <div className={`p-3 border-t border-slate-100 ${canEditProfit ? '' : 'hidden'}`}>
                            {expDraft ? (
                                <div className="space-y-2">
                                    <input autoFocus className={`${T.input} h-9`} value={expDraft.title} placeholder="Що це: транспорт, підрядник, оренда…"
                                        onChange={e => setExpDraft(d => ({ ...d, title: e.target.value }))} />
                                    <div className="flex gap-2">
                                        <input type="number" min="0" step="0.01" className={`${T.input} h-9 tabular-nums`} value={expDraft.amount} placeholder="Сума"
                                            onChange={e => setExpDraft(d => ({ ...d, amount: e.target.value }))} />
                                        <select className={`${T.select} h-9 w-16 px-1.5`} value={expDraft.currency} onChange={e => setExpDraft(d => ({ ...d, currency: e.target.value }))}>
                                            {CURRENCIES.map(c => <option key={c.key} value={c.key}>{c.symbol}</option>)}
                                        </select>
                                        <input type="date" className={`${T.input} h-9`} value={expDraft.spent_at} onChange={e => setExpDraft(d => ({ ...d, spent_at: e.target.value }))} />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Btn size="sm" variant="outline" onClick={() => setExpDraft(null)}>Скасувати</Btn>
                                        <Btn size="sm" variant="accent" onClick={addExpense}>Додати</Btn>
                                    </div>
                                </div>
                            ) : (
                                <button type="button" onClick={() => setExpDraft({ title: '', amount: '', currency: 'UAH', spent_at: today() })}
                                    className="w-full h-9 rounded-lg border border-dashed border-slate-300 text-[12.5px] font-semibold text-slate-500 hover:text-slate-800 hover:border-slate-400 inline-flex items-center justify-center gap-1.5">
                                    <FaPlus size={10} /> Додати витрату
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
