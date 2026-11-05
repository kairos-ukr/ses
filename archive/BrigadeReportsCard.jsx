// =====================================================================
//  K-CORE · Картка «Звіти бригад сьогодні» на офісному «Сьогодні»
//
//  Об'єкти з сьогоднішнього графіка: хто вже здав звіт (о котрій), хто
//  ні (після 15:30 — червоним), де отримали гроші чи була проблема.
//  Натиснули на об'єкт — його картка, вкладка «Звіти монтажу».
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClipboardCheck, FaMoneyBillWave, FaExclamationTriangle } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, Chip, Skeleton } from '../ui';
import { useAuth } from '../AuthProvider';
import { canSeeMoney } from '../domain/objects';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const timeOf = (ts) => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
const objTitle = (o) => [o?.client?.populated_place, o?.client?.name || o?.name].filter(Boolean).join(', ') || o?.name || "Об'єкт";

export default function BrigadeReportsCard() {
    const navigate = useNavigate();
    const auth = useAuth();
    const [rows, setRows] = useState(null);

    const load = useCallback(async () => {
        const today = isoDay();
        const [sched, reps] = await Promise.all([
            supabase.from('installation_workers').select('installation_custom_id').eq('work_date', today).not('installation_custom_id', 'is', null),
            supabase.from('installer_reports').select('installation_custom_id, submitted_at, money_amount, money_payment_id, day_status').eq('work_date', today),
        ]);
        if (sched.error) { setRows([]); return; }
        const ids = [...new Set([...(sched.data || []).map(r => r.installation_custom_id), ...(reps.data || []).filter(r => r.submitted_at).map(r => r.installation_custom_id)])];
        const { data: objs } = ids.length
            ? await supabase.from('installations').select('custom_id, name, responsible_emp_id, client:clients(name, populated_place)').in('custom_id', ids)
            : { data: [] };
        const om = new Map((objs || []).map(o => [o.custom_id, o]));
        setRows(ids.map(id => ({ id, obj: om.get(id), rep: (reps.data || []).find(r => r.installation_custom_id === id) || null }))
            .sort((a, b) => !!a.rep?.submitted_at - !!b.rep?.submitted_at));
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        const ch = supabase.channel('today-brigade-reports')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'installer_reports' }, () => load())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, [load]);

    const now = new Date();
    const late = now.getHours() * 60 + now.getMinutes() >= 15 * 60 + 30;
    const sent = (rows || []).filter(r => r.rep?.submitted_at).length;

    return (
        <div className={T.card}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaClipboardCheck size={13} className="text-indigo-500" /> Звіти бригад сьогодні
                </h2>
                {rows && rows.length > 0 && <Chip tone={sent === rows.length ? 'ok' : late ? 'danger' : 'warn'}>здано {sent} з {rows.length}</Chip>}
            </div>
            {rows === null ? <Skeleton rows={2} /> : rows.length === 0 ? (
                <div className="px-4 py-5 text-center text-[13px] text-slate-400">Сьогодні в графіку бригад немає</div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {rows.map(r => (
                        <li key={r.id}>
                            <button type="button" onClick={() => navigate(`/project/${r.id}?tab=reports`)}
                                className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-slate-50">
                                <span className="min-w-0 flex-1 text-[13px] font-semibold text-slate-800 break-words">{objTitle(r.obj)}</span>
                                {r.rep?.money_amount != null && !r.rep.money_payment_id && canSeeMoney(auth, r.obj) && <FaMoneyBillWave size={12} className="text-indigo-500 flex-shrink-0" title="Отримали гроші — не внесено" />}
                                {r.rep?.day_status && r.rep.day_status !== 'ok' && <FaExclamationTriangle size={11} className="text-rose-500 flex-shrink-0" title="Проблема на об'єкті" />}
                                {r.rep?.submitted_at
                                    ? <Chip tone="ok">{timeOf(r.rep.submitted_at)}</Chip>
                                    : <Chip tone={late ? 'danger' : 'neutral'}>{late ? 'не здано' : 'чекаємо'}</Chip>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
