// =====================================================================
//  K-CORE · Налаштування (вкладка в «Доступах», лише адміністратор)
//
//  • Норми етапів — скільки днів має тривати кожен етап. Поруч —
//    скільки він триває насправді (медіана за пів року), щоб норму
//    ставити не навмання. Від норм залежать кольори на дошці,
//    «Потребує уваги» на «Сьогодні» і нагадування бота.
//  • Курс долара — один на всю програму (UsdRateEditor).
//  • Забезпечення — чи система сама створює нагадування й заявки
//    (SupplyAutomation).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaStopwatch, FaUndo } from 'react-icons/fa';
import UsdRateEditor from './UsdRateEditor';
import SupplyAutomation from './SupplyAutomation';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Tip, Skeleton, useToast, humanError } from '../ui';
import { STAGE_GROUPS, normalizeGroupKey } from '../domain/stages';
import { median, stageTone } from '../domain/pipeline';
import { fetchAll } from '../utils/fetchAll';

const HALF_YEAR = 182 * 24 * 3600 * 1000;

export default function SettingsPanel() {
    const { employee: me } = useAuth();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [norms, setNorms] = useState({});
    const [draft, setDraft] = useState({});
    const [facts, setFacts] = useState({});
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const since = new Date(Date.now() - HALF_YEAR).toISOString();
            const [n, durations] = await Promise.all([
                supabase.from('stage_norms').select('stage_key, days'),
                fetchAll(() => supabase.from('v_stage_durations').select('stage_key, days, left_at').gte('left_at', since).order('left_at')),
            ]);
            const map = Object.fromEntries((n.data || []).map(r => [r.stage_key, r.days]));
            setNorms(map);
            setDraft(Object.fromEntries(STAGE_GROUPS.map(g => [g.key, map[g.key] ?? ''])));
            const byStage = {};
            durations.forEach(d => {
                const k = normalizeGroupKey(d.stage_key);
                (byStage[k] = byStage[k] || []).push(Math.round(Number(d.days)));
            });
            setFacts(Object.fromEntries(Object.entries(byStage).map(([k, list]) => [k, { med: median(list), n: list.length }])));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const changed = useMemo(() => STAGE_GROUPS.filter(g => String(draft[g.key] ?? '') !== String(norms[g.key] ?? '')), [draft, norms]);

    const saveNorms = async () => {
        const rows = STAGE_GROUPS.map(g => ({ stage_key: g.key, days: Number(draft[g.key]) }));
        if (rows.some(r => !Number.isInteger(r.days) || r.days < 1 || r.days > 365)) {
            toast('Норма — ціле число днів від 1 до 365', 'error');
            return;
        }
        setSaving(true);
        const { error } = await supabase.from('stage_norms')
            .upsert(rows.map(r => ({ ...r, updated_by: me?.id || null })), { onConflict: 'stage_key' });
        setSaving(false);
        if (error) { toast(humanError(error), 'error'); return; }
        setNorms(Object.fromEntries(rows.map(r => [r.stage_key, r.days])));
        toast('Норми етапів збережено');
    };

    if (loading) return <div className={T.card}><Skeleton rows={8} /></div>;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
            {/* НОРМИ ЕТАПІВ */}
            <div className={T.card}>
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                        <FaStopwatch size={13} className="text-indigo-500" /> Норми етапів
                        <Tip width={300} text="Скільки днів має тривати етап. Довше за норму — картка на дошці червона, об'єкт потрапляє в «Потребує уваги», відповідальному приходить нагадування. «Насправді» — медіана за останні пів року: половина об'єктів проходить етап швидше, половина — довше." />
                    </h2>
                    <div className="flex items-center gap-2">
                        {changed.length > 0 && (
                            <Btn size="sm" variant="ghost" icon={FaUndo} onClick={() => setDraft(Object.fromEntries(STAGE_GROUPS.map(g => [g.key, norms[g.key] ?? ''])))}>
                                Скасувати
                            </Btn>
                        )}
                        <Btn size="sm" variant="accent" onClick={saveNorms} disabled={saving || changed.length === 0}>
                            Зберегти{changed.length ? ` (${changed.length})` : ''}
                        </Btn>
                    </div>
                </div>
                <ul className="divide-y divide-slate-100">
                    {STAGE_GROUPS.map(g => {
                        const f = facts[g.key];
                        const norm = Number(draft[g.key]) || null;
                        const tone = f?.med != null && norm ? stageTone(f.med, norm) : 'neutral';
                        const dirty = String(draft[g.key] ?? '') !== String(norms[g.key] ?? '');
                        return (
                            <li key={g.key} className="px-4 py-2.5 flex items-center gap-3">
                                <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
                                    <g.icon size={13} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[14px] font-semibold text-slate-800">{g.label}</div>
                                    <div className="text-[12px] text-slate-500">
                                        {f?.med != null ? (
                                            <>насправді <b className={tone === 'danger' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-700' : 'text-emerald-700'}>{f.med} дн</b> · {f.n} об'єктів за пів року</>
                                        ) : 'ще немає завершених за пів року'}
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 flex-shrink-0">
                                    <input
                                        type="number" min="1" max="365" inputMode="numeric"
                                        aria-label={`Норма етапу ${g.label}, днів`}
                                        className={`${T.input} w-20 text-right tabular-nums ${dirty ? 'border-indigo-400 ring-1 ring-indigo-200' : ''}`}
                                        value={draft[g.key] ?? ''}
                                        onChange={e => setDraft(d => ({ ...d, [g.key]: e.target.value }))}
                                    />
                                    <span className="text-[13px] text-slate-500 w-5">дн</span>
                                </label>
                            </li>
                        );
                    })}
                </ul>
            </div>

            <div className="space-y-4">
                <UsdRateEditor />
                <SupplyAutomation />
            </div>
        </div>
    );
}
