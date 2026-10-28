// =====================================================================
//  K-CORE · «Мій день» — екран монтажника на телефоні
//
//  Монтажнику не потрібна CRM: потрібні адреса, що робити і куди
//  натиснути брудними руками. Тому тут лише:
//   • виїзди на сьогодні, де він у бригаді: що робити, адреса,
//     хто ще їде, кнопки «Маршрут», «Клієнт», «Відкрити етап»;
//   • що забрати на складі під ці об'єкти (документи видачі);
//   • виїзди на найближчі дні;
//   • його відкриті етапи.
//  Кнопки 48px, текст 14–15px.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaMapMarkerAlt, FaUsers, FaRoute, FaPhone, FaArrowRight, FaBoxOpen, FaSyncAlt, FaCalendarAlt,
} from 'react-icons/fa';

import Layout from './Layout';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { T, Btn, Chip, Skeleton, useToast, humanError } from './ui';
import { getStageGroupLabel, getTaskLabel, taskStatusMeta, isTaskDone, getTask } from './domain/stages';
import { isObjectActive } from './domain/objects';
import { kw } from './domain/pipeline';

const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDay(d); };
const dayLabel = (iso) => {
    if (iso === addDays(0)) return 'Сьогодні';
    if (iso === addDays(1)) return 'Завтра';
    return new Date(iso).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
};

const ISSUE_STATUS = {
    ready: { label: 'готово до видачі', tone: 'ok' },
    draft: { label: 'збирається', tone: 'warn' },
};

const mapsLink = (o) => {
    if (o?.gps_link) return o.gps_link;
    const place = [o?.client?.populated_place, o?.client?.oblast].filter(Boolean).join(', ');
    return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
};

/* Велика кнопка для пальця */
const BigLink = ({ href, icon: Icon, children, primary }) => (
    <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
        className={`flex-1 min-w-0 inline-flex items-center justify-center gap-2 h-12 px-3 rounded-xl text-[14.5px] font-bold border transition-colors
            ${primary ? 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'}`}>
        <Icon size={14} className="flex-shrink-0" /> <span className="truncate">{children}</span>
    </a>
);

export default function MyDayPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const { employee } = useAuth();

    const [loading, setLoading] = useState(true);
    const [visits, setVisits] = useState([]);       // мої виїзди від сьогодні на 7 днів
    const [objects, setObjects] = useState(new Map());
    const [issues, setIssues] = useState([]);       // документи видачі під ці об'єкти
    const [myStages, setMyStages] = useState([]);

    const load = useCallback(async () => {
        if (!employee) return;
        setLoading(true);
        try {
            // 1. Мої виїзди: спершу id планів, де я в бригаді, потім самі плани з бригадою
            const { data: links, error: linkErr } = await supabase
                .from('installation_visit_plan_employees').select('visit_plan_id').eq('employee_id', employee.id);
            if (linkErr) throw linkErr;
            const planIds = [...new Set((links || []).map(l => l.visit_plan_id))];

            const [plansRes, stagesRes] = await Promise.all([
                planIds.length
                    ? supabase.from('installation_visit_plan_with_employees')
                        .select('id, installation_custom_id, planned_date, status, reason, comment, custom_task_title, employees')
                        .in('id', planIds).eq('status', 'planned')
                        .gte('planned_date', addDays(0)).lte('planned_date', addDays(7))
                        .order('planned_date')
                    : Promise.resolve({ data: [] }),
                supabase.from('project_stages')
                    .select('installation_custom_id, stage_key, status, updated_at')
                    .eq('responsible_emp_custom_id', employee.custom_id),
            ]);
            if (plansRes.error) throw plansRes.error;
            const plans = plansRes.data || [];
            const openStages = (stagesRes.data || []).filter(s => getTask(s.stage_key) && !isTaskDone(s.stage_key, s.status));

            // 2. Об'єкти цих виїздів і етапів
            const ids = [...new Set([...plans.map(p => p.installation_custom_id), ...openStages.map(s => s.installation_custom_id)])].filter(Boolean);
            const [objRes, issueRes] = await Promise.all([
                ids.length
                    ? supabase.from('installations')
                        .select('custom_id, name, status, workflow_stage, capacity_kw, gps_link, client:clients(name, phone, populated_place, oblast)')
                        .in('custom_id', ids)
                    : Promise.resolve({ data: [] }),
                plans.length
                    ? supabase.from('issue_orders')
                        .select('id, doc_number, status, installation_custom_id, needed_by, items:issue_order_items(count)')
                        .in('installation_custom_id', [...new Set(plans.map(p => p.installation_custom_id))])
                        .in('status', ['draft', 'ready'])
                    : Promise.resolve({ data: [] }),
            ]);
            const objMap = new Map((objRes.data || []).map(o => [o.custom_id, o]));

            setVisits(plans);
            setObjects(objMap);
            setIssues(issueRes.error ? [] : (issueRes.data || []));
            setMyStages(openStages
                .filter(s => isObjectActive(objMap.get(s.installation_custom_id)?.status))
                .sort((a, b) => new Date(a.updated_at || 0) - new Date(b.updated_at || 0)));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [employee, toast]);

    useEffect(() => { load(); }, [load]);

    const today = addDays(0);
    const todayVisits = visits.filter(v => v.planned_date === today);
    const laterByDay = useMemo(() => {
        const m = new Map();
        visits.filter(v => v.planned_date !== today).forEach(v => {
            if (!m.has(v.planned_date)) m.set(v.planned_date, []);
            m.get(v.planned_date).push(v);
        });
        return [...m.entries()];
    }, [visits, today]);

    const issuesFor = (objId) => issues.filter(i => i.installation_custom_id === objId);

    const visitTitle = (v, o) => v.custom_task_title || v.reason || (o ? getStageGroupLabel(o.workflow_stage) : 'Виїзд');

    const dateLine = new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <Layout>
            <div className="max-w-2xl mx-auto p-3 sm:p-6 space-y-4 text-slate-800">

                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-[13.5px] text-slate-500 first-letter:uppercase">{dateLine}</p>
                        <h1 className="text-[26px] font-bold text-slate-900 tracking-tight leading-tight">Мій день</h1>
                    </div>
                    <button type="button" onClick={load} aria-label="Оновити" title="Оновити"
                        className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800">
                        <FaSyncAlt size={15} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* --- СЬОГОДНІ --- */}
                {loading ? <div className={T.card}><Skeleton rows={4} /></div> : todayVisits.length === 0 ? (
                    <div className={`${T.card} p-5 text-center`}>
                        <div className="text-[15px] font-semibold text-slate-700">На сьогодні виїздів немає</div>
                        {laterByDay[0] && (
                            <div className="text-[13.5px] text-slate-500 mt-1">Найближчий — {dayLabel(laterByDay[0][0]).toLowerCase()}</div>
                        )}
                    </div>
                ) : todayVisits.map((v, i) => {
                    const o = objects.get(v.installation_custom_id);
                    const team = (Array.isArray(v.employees) ? v.employees : []).filter(e => e?.employee_id !== employee?.id).map(e => e.name);
                    const route = mapsLink(o);
                    const place = [o?.client?.populated_place, o?.client?.oblast].filter(Boolean).join(', ');
                    const objIssues = issuesFor(v.installation_custom_id);
                    return (
                        <div key={v.id} className={`${T.card} p-4 space-y-3 ${i === 0 ? 'border-indigo-300 ring-2 ring-indigo-100' : ''}`}>
                            <div className="flex items-center justify-between gap-2">
                                <Chip tone={i === 0 ? 'accent' : 'neutral'}>{i === 0 ? 'зараз' : 'далі'}</Chip>
                                {o && <span className={T.mono}>СЕС-{o.custom_id}</span>}
                            </div>
                            <div>
                                <div className="text-[18px] font-bold text-slate-900 leading-snug">{visitTitle(v, o)}</div>
                                {o && (
                                    <div className="text-[14.5px] text-slate-600 mt-0.5">
                                        {o.name || o.client?.name}{kw(o.capacity_kw) ? ` · ${kw(o.capacity_kw)}` : ''}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1.5 text-[14.5px] text-slate-700">
                                {place && <div className="flex items-start gap-2"><FaMapMarkerAlt className="text-rose-500 mt-1 flex-shrink-0" size={13} /> {place}</div>}
                                {team.length > 0 && <div className="flex items-start gap-2"><FaUsers className="text-slate-400 mt-1 flex-shrink-0" size={13} /> {team.join(', ')}</div>}
                                {v.comment && <div className="text-[13.5px] text-slate-500 pl-5">{v.comment}</div>}
                            </div>

                            {objIssues.map(doc => {
                                const st = ISSUE_STATUS[doc.status] || { label: doc.status, tone: 'neutral' };
                                const n = doc.items?.[0]?.count;
                                return (
                                    <div key={doc.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                                        <FaBoxOpen className="text-amber-600 flex-shrink-0" size={15} />
                                        <div className="min-w-0 flex-1 text-[14px]">
                                            <b className="text-slate-900">Забрати на складі</b>
                                            <div className="text-[13px] text-slate-600">{doc.doc_number}{n ? ` · ${n} позицій` : ''}</div>
                                        </div>
                                        <Chip tone={st.tone}>{st.label}</Chip>
                                    </div>
                                );
                            })}

                            <div className="flex gap-2">
                                {route && <BigLink href={route} icon={FaRoute}>Маршрут</BigLink>}
                                {o?.client?.phone && <BigLink href={`tel:${o.client.phone}`} icon={FaPhone}>Клієнт</BigLink>}
                            </div>
                            {o && (
                                <button type="button" onClick={() => navigate(`/project/${o.custom_id}?tab=workflow`)}
                                    className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-indigo-600 text-white text-[15px] font-bold hover:bg-indigo-700">
                                    Відкрити етап <FaArrowRight size={13} />
                                </button>
                            )}
                        </div>
                    );
                })}

                {/* --- НАЙБЛИЖЧІ ДНІ --- */}
                {!loading && laterByDay.length > 0 && (
                    <div className={T.card}>
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                            <FaCalendarAlt className="text-slate-400" size={13} />
                            <h2 className="text-[15px] font-bold text-slate-900">Найближчі дні</h2>
                        </div>
                        <ul className="divide-y divide-slate-100">
                            {laterByDay.map(([day, list]) => (
                                <li key={day} className="px-4 py-3">
                                    <div className="text-[12.5px] font-semibold text-slate-500 first-letter:uppercase mb-1.5">{dayLabel(day)}</div>
                                    <div className="space-y-2">
                                        {list.map(v => {
                                            const o = objects.get(v.installation_custom_id);
                                            return (
                                                <button key={v.id} type="button" onClick={() => o && navigate(`/project/${o.custom_id}`)}
                                                    className="w-full text-left flex items-center gap-3 min-h-[48px]">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[14.5px] font-semibold text-slate-900 sm:truncate">{visitTitle(v, o)}</div>
                                                        <div className="text-[13px] text-slate-500 sm:truncate">
                                                            {o ? `СЕС-${o.custom_id} · ${o.client?.populated_place || o.name || ''}` : `СЕС-${v.installation_custom_id}`}
                                                        </div>
                                                    </div>
                                                    <FaArrowRight className="text-slate-300 flex-shrink-0" size={12} />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* --- МОЇ ЕТАПИ --- */}
                {!loading && (
                    <div className={T.card}>
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
                            <h2 className="text-[15px] font-bold text-slate-900">Мої етапи в роботі</h2>
                            <span className="text-[12.5px] text-slate-400 tabular-nums">{myStages.length}</span>
                        </div>
                        {myStages.length === 0 ? (
                            <div className="px-4 py-5 text-center text-[14px] text-slate-400">Відкритих етапів на вас немає</div>
                        ) : (
                            <ul className="divide-y divide-slate-100">
                                {myStages.slice(0, 8).map(s => {
                                    const o = objects.get(s.installation_custom_id);
                                    const meta = taskStatusMeta(s.stage_key, s.status);
                                    return (
                                        <li key={`${s.installation_custom_id}-${s.stage_key}`}>
                                            <button type="button" onClick={() => navigate(`/project/${s.installation_custom_id}?tab=workflow`)}
                                                className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-[56px] hover:bg-slate-50">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[14.5px] font-semibold text-slate-900 sm:truncate">{getTaskLabel(s.stage_key)}</div>
                                                    <div className="text-[13px] text-slate-500 sm:truncate">
                                                        СЕС-{s.installation_custom_id}{o ? ` · ${o.name || o.client?.name || ''}` : ''}
                                                    </div>
                                                </div>
                                                <Chip tone={meta.tone}>{meta.label}</Chip>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <div className="px-4 py-3 border-t border-slate-100">
                            <Btn variant="soft" className="w-full h-11" onClick={() => navigate('/my-workflow')}>Усі мої етапи</Btn>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
