// =====================================================================
//  K-CORE · «Мої угоди на перегляд» (вкладка «Мій день» на «Задачах»)
//
//  Угоди менеджера, які застоялись: довго без жодної дії, довше за норму
//  етапу, без вартості — за його власними правилами. Тут же він налаштовує,
//  як часто бот нагадує переглянути угоди (щодня / щотижня, о котрій).
//  Хто нічого не змінював — щопонеділка о 9:00, без руху понад 14 днів.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaClipboardCheck, FaCog, FaCheck, FaTimes } from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, useToast, humanError } from '../ui';
import { getStageGroupLabel } from '../domain/stages';

const DEFAULTS = { enabled: true, frequency: 'weekly', weekday: 1, hour: 9, stale_days: 14, include_over_norm: true, include_no_cost: false };
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'];

const reasonsOf = (r, s) => {
    const why = [];
    const stale = (r.idle_days ?? 0) > s.stale_days;
    const over = s.include_over_norm && r.norm_days && (r.stage_days ?? 0) > r.norm_days;
    // Стоїть на етапі стільки ж, скільки без руху — одне речення замість двох
    if (stale && over && Math.abs((r.stage_days ?? 0) - (r.idle_days ?? 0)) <= 7) {
        why.push(`без руху ${r.idle_days} дн (норма етапу ${r.norm_days})`);
        if (s.include_no_cost && !Number(r.total_cost)) why.push('без вартості');
        return why;
    }
    if (stale) why.push(`без руху ${r.idle_days} дн`);
    if (over) why.push(`етап ${r.stage_days} дн при нормі ${r.norm_days}`);
    if (s.include_no_cost && !Number(r.total_cost)) why.push('без вартості');
    return why;
};

export default function DealReviewCard() {
    const { employee: me } = useAuth();
    const toast = useToast();
    const [rows, setRows] = useState([]);
    const [settings, setSettings] = useState(DEFAULTS);
    const [draft, setDraft] = useState(null);   // відкрите налаштування
    const [loading, setLoading] = useState(true);
    const [limit, setLimit] = useState(8);

    const load = useCallback(async () => {
        if (!me?.id || me?.custom_id == null) return;
        const [d, s] = await Promise.all([
            supabase.from('v_deal_review').select('*').eq('responsible_emp_id', me.custom_id),
            supabase.from('deal_review_settings').select('*').eq('employee_id', me.id).maybeSingle(),
        ]);
        if (!d.error) setRows(d.data || []);
        if (!s.error && s.data) setSettings({ ...DEFAULTS, ...s.data });
        setLoading(false);
    }, [me?.id, me?.custom_id]);

    useEffect(() => { load(); }, [load]);

    const list = useMemo(() => rows
        .map(r => ({ r, why: reasonsOf(r, settings) }))
        .filter(x => x.why.length)
        .sort((a, b) => (b.r.idle_days ?? 0) - (a.r.idle_days ?? 0)), [rows, settings]);

    const save = async () => {
        const row = {
            employee_id: me.id,
            enabled: draft.enabled, frequency: draft.frequency, weekday: Number(draft.weekday), hour: Number(draft.hour),
            stale_days: Math.min(120, Math.max(3, Number(draft.stale_days) || 14)),
            include_over_norm: draft.include_over_norm, include_no_cost: draft.include_no_cost,
        };
        const { error } = await supabase.from('deal_review_settings').upsert(row, { onConflict: 'employee_id' });
        if (error) { toast(humanError(error), 'error'); return; }
        setSettings({ ...DEFAULTS, ...row });
        setDraft(null);
        toast('Нагадування про угоди налаштовано', 'success');
    };

    const scheduleText = !settings.enabled ? 'нагадування вимкнено'
        : `${settings.frequency === 'daily' ? 'щодня' : `щотижня, ${WEEKDAYS[settings.weekday - 1]}`} о ${settings.hour}:00`;

    if (!me?.id || me?.custom_id == null) return null;

    return (
        <div className={T.card}>
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaClipboardCheck size={12} className="text-indigo-500" /> Мої угоди на перегляд
                </h3>
                <span className="flex items-center gap-1">
                    <span className="text-[12px] text-slate-400 tabular-nums">{list.length}</span>
                    <button type="button" onClick={() => setDraft(d => (d ? null : { ...settings }))} aria-label="Налаштувати нагадування"
                        className={`w-8 h-8 rounded-md flex items-center justify-center ${draft ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-50'}`}>
                        <FaCog size={12} />
                    </button>
                </span>
            </div>

            {/* Налаштування — тут же, без окремого вікна */}
            {draft && (
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 space-y-2.5 text-[12.5px]">
                    <label className="flex items-center gap-2 font-semibold text-slate-700">
                        <input type="checkbox" checked={draft.enabled} onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))} />
                        Нагадувати переглянути угоди
                    </label>
                    {draft.enabled && <>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {[{ v: 'daily', l: 'Щодня' }, { v: 'weekly', l: 'Щотижня' }].map(f => (
                                <button key={f.v} type="button" onClick={() => setDraft(d => ({ ...d, frequency: f.v }))}
                                    className={`h-8 px-2.5 rounded-lg border font-semibold ${draft.frequency === f.v ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{f.l}</button>
                            ))}
                            {draft.frequency === 'weekly' && (
                                <select value={draft.weekday} onChange={e => setDraft(d => ({ ...d, weekday: Number(e.target.value) }))} className="h-8 px-2 rounded-lg border border-slate-200 bg-white">
                                    {WEEKDAYS.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}
                                </select>
                            )}
                            <span className="text-slate-500">о</span>
                            <select value={draft.hour} onChange={e => setDraft(d => ({ ...d, hour: Number(e.target.value) }))} className="h-8 px-2 rounded-lg border border-slate-200 bg-white">
                                {Array.from({ length: 16 }, (_, i) => i + 6).map(h => <option key={h} value={h}>{h}:00</option>)}
                            </select>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
                            Без руху понад
                            <input type="number" min="3" max="120" value={draft.stale_days} onChange={e => setDraft(d => ({ ...d, stale_days: e.target.value }))}
                                className="w-16 h-8 px-2 rounded-lg border border-slate-200 bg-white text-right" /> днів
                        </div>
                        <label className="flex items-center gap-2 text-slate-700">
                            <input type="checkbox" checked={draft.include_over_norm} onChange={e => setDraft(d => ({ ...d, include_over_norm: e.target.checked }))} />
                            Також ті, що довше за норму етапу
                        </label>
                        <label className="flex items-center gap-2 text-slate-700">
                            <input type="checkbox" checked={draft.include_no_cost} onChange={e => setDraft(d => ({ ...d, include_no_cost: e.target.checked }))} />
                            Також ті, де не вказана вартість
                        </label>
                    </>}
                    <div className="flex justify-end gap-1.5">
                        <Btn size="sm" variant="ghost" icon={FaTimes} onClick={() => setDraft(null)}>Скасувати</Btn>
                        <Btn size="sm" variant="accent" icon={FaCheck} onClick={save}>Зберегти</Btn>
                    </div>
                </div>
            )}

            {loading ? (
                <p className="px-4 py-5 text-[13px] text-slate-400 text-center">Завантаження…</p>
            ) : list.length === 0 ? (
                <p className="px-4 py-5 text-[13px] text-slate-400 text-center">Усі ваші угоди в русі</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {list.slice(0, limit).map(({ r, why }) => (
                        <li key={r.custom_id}>
                            <a href={`#/project/${r.custom_id}`} className="block px-4 py-2.5 hover:bg-slate-50">
                                <div className="text-[13px] font-semibold text-slate-800 leading-snug break-words">
                                    <span className="font-mono text-[11px] text-slate-400 mr-1">СЕС-{r.custom_id}</span>{r.name || 'без назви'}
                                </div>
                                <div className="text-[11.5px] text-slate-500 leading-snug">{getStageGroupLabel(r.workflow_stage)} · <span className="text-amber-700">{why.join(', ')}</span></div>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
            {list.length > limit && (
                <button type="button" onClick={() => setLimit(l => l + 10)} className="w-full py-2 border-t border-slate-100 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                    Показати ще {list.length - limit}
                </button>
            )}
            <div className="px-4 py-2 border-t border-slate-100 text-[11.5px] text-slate-400">Бот нагадує: {scheduleText}</div>
        </div>
    );
}
