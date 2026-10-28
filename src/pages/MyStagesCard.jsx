// =====================================================================
//  K-CORE · Картка «Мої етапи» на офісному «Сьогодні»
//
//  Етапи об'єктів у роботі, де я відповідальний і які ще не виконані —
//  ті, що найдовше без змін, зверху. Натиснули — «Задачі та етапи →
//  Етапи», де етап можна одразу оновити.
// =====================================================================

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaProjectDiagram, FaArrowRight } from 'react-icons/fa';

import { useAuth } from '../AuthProvider';
import { T, Chip, Skeleton } from '../ui';
import { getTaskLabel, taskStatusMeta } from '../domain/stages';
import { loadStagesOf } from './StagesView';

const LIMIT = 5;
const objTitle = (o) => [o?.client?.populated_place, o?.client?.name || o?.name].filter(Boolean).join(', ') || o?.name || "Об'єкт";
const daysAgo = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);

export default function MyStagesCard() {
    const navigate = useNavigate();
    const { employee: me } = useAuth();
    const [rows, setRows] = useState(null);

    useEffect(() => {
        if (me?.custom_id == null) return undefined;
        let alive = true;
        loadStagesOf(me.custom_id)
            .then(list => { if (alive) setRows(list.sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at))); })
            .catch(() => { if (alive) setRows([]); });
        return () => { alive = false; };
    }, [me?.custom_id]);

    if (me?.custom_id == null) return null;
    const open = () => navigate('/tasks?tab=stages');

    return (
        <div className={T.card}>
            <button type="button" onClick={open} className="w-full px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2 hover:bg-slate-50 rounded-t-xl">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaProjectDiagram size={12} className="text-indigo-500" /> Мої етапи
                </h2>
                <span className="text-[12.5px] text-slate-400 tabular-nums inline-flex items-center gap-1.5">
                    {rows ? rows.length : ''} <FaArrowRight size={9} />
                </span>
            </button>
            {rows === null ? <Skeleton rows={2} /> : rows.length === 0 ? (
                <div className="px-4 py-5 text-center text-[13px] text-slate-400">Відкритих етапів на вас немає</div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {rows.slice(0, LIMIT).map(r => {
                        const meta = taskStatusMeta(r.stage_key, r.status);
                        const age = daysAgo(r.updated_at);
                        return (
                            <li key={`${r.installation_custom_id}-${r.stage_key}`}>
                                <button type="button" onClick={open} className="w-full text-left px-4 py-2.5 flex items-start gap-2 hover:bg-slate-50">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-semibold text-slate-800 break-words">{getTaskLabel(r.stage_key)}</div>
                                        <div className="text-[12px] text-slate-500 break-words">
                                            СЕС-{r.installation_custom_id} · {objTitle(r.obj)}
                                            {age != null && age > 7 && <span className="text-amber-700 font-semibold"> · {age} дн без змін</span>}
                                        </div>
                                    </div>
                                    <Chip tone={meta.tone || 'neutral'}>{meta.label}</Chip>
                                </button>
                            </li>
                        );
                    })}
                    {rows.length > LIMIT && (
                        <li>
                            <button type="button" onClick={open} className="w-full py-2 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                                Усі {rows.length}
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
