// =====================================================================
//  K-CORE · Монтаж · «Сьогодні»
//
//  За 10 секунд після входу: куди їдемо, з ким, що робимо, що забрати
//  на складі, які задачі. Усе з графіка робіт; два об'єкти за день —
//  дві картки одна під одною.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaRoute, FaPhone, FaBoxOpen, FaArrowRight, FaUmbrellaBeach, FaListUl, FaClipboardList, FaCheckCircle, FaCloudUploadAlt } from 'react-icons/fa';
import { localAll, reportKey } from './local';
import { REPORT_SENT_EVENT } from './report';

import { supabase } from '../supabaseClient';
import { Linkify, useToast, humanError } from '../ui';
import { getStageGroupLabel } from '../domain/stages';
import {
    useMontazh, useFresh, useNow, isReportTime, isoDay, shiftDay, fmtDay, relDay, OFF_KEYS, OFF_LABEL, loadObjects, groupVisits, visitTitle,
    placeOf, kwText, routeLink, telLink, isBrigadier, TASK_FIELDS, OPEN_TASK, plainText,
} from './data';
import { Screen, Card, Label, Pill, Big, Line, Empty, Loading, Check } from './kit';
import TripCard from './TripCard';

const ISSUE = {
    ready: { label: 'зібрано', tone: 'ok' },
    draft: { label: 'збирається', tone: 'warn' },
};

export default function TodayScreen() {
    const { who, people, canWrite, refreshBadges } = useMontazh();
    const navigate = useNavigate();
    const toast = useToast();
    const today = isoDay();
    const now = useNow();

    const [loading, setLoading] = useState(true);
    const [visits, setVisits] = useState([]);       // мої виїзди на 14 днів наперед
    const [crew, setCrew] = useState([]);           // хто ще на тих самих виїздах сьогодні й завтра
    const [objects, setObjects] = useState(new Map());
    const [offs, setOffs] = useState(new Map());    // дата → статус вихідного
    const [issues, setIssues] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [reports, setReports] = useState([]);     // сьогоднішні звіти по моїх об'єктах
    const [queuedKeys, setQueuedKeys] = useState(new Set());   // звіти, що чекають інтернету на телефоні
    useEffect(() => {
        const read = () => localAll().then(all => setQueuedKeys(new Set(all.filter(x => x.value?.pending).map(x => x.key))));
        read();
        window.addEventListener(REPORT_SENT_EVENT, read);
        return () => window.removeEventListener(REPORT_SENT_EVENT, read);
    }, []);

    const fresh = useFresh();
    const load = useCallback(async () => {
        if (who?.custom_id == null) return;
        const ok = fresh();
        try {
            const until = shiftDay(today, 13);
            const [mine, off, task] = await Promise.all([
                supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, work_date, notes')
                    .eq('employee_custom_id', who.custom_id).gte('work_date', today).lte('work_date', until),
                supabase.from('attendance').select('work_date, status')
                    .eq('employee_custom_id', who.custom_id).gte('work_date', today).lte('work_date', until).in('status', OFF_KEYS),
                supabase.from('microtasks').select(TASK_FIELDS)
                    .eq('assigned_to', who.custom_id).in('status', OPEN_TASK)
                    .order('due_date', { ascending: true, nullsFirst: false }).limit(20),
            ]);
            if (mine.error) throw mine.error;
            const my = groupVisits(mine.data);
            const near = [today, shiftDay(today, 1)];
            const nearIds = my.filter(v => near.includes(v.date) && v.installationId).map(v => v.installationId);
            const todayIds = my.filter(v => v.date === today && v.installationId).map(v => v.installationId);

            const [crewRes, objMap, issueRes, repRes] = await Promise.all([
                supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, work_date, notes').in('work_date', near),
                loadObjects(my.map(v => v.installationId)),
                todayIds.length
                    ? supabase.from('issue_orders')
                        .select('id, doc_number, status, installation_custom_id, warehouse:warehouses(name), items:issue_order_items(count)')
                        .in('installation_custom_id', [...new Set(nearIds)]).in('status', ['draft', 'ready'])
                    : Promise.resolve({ data: [] }),
                todayIds.length
                    ? supabase.from('installer_reports').select('installation_custom_id, submitted_at')
                        .eq('work_date', today).in('installation_custom_id', todayIds)
                    : Promise.resolve({ data: [] }),
            ]);
            if (!ok()) return;
            setVisits(my);
            setCrew(groupVisits(crewRes.data));
            setObjects(objMap);
            setOffs(new Map((off.data || []).map(o => [o.work_date, o.status])));
            setIssues(issueRes.data || []);
            setReports(repRes.data || []);
            setTasks(task.data || []);
        } catch (e) {
            if (ok()) toast(humanError(e), 'error');
        } finally {
            if (ok()) setLoading(false);
        }
    }, [who?.custom_id, today, toast, fresh]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    // Графік змінюють в офісі — підхоплюємо наживо
    useEffect(() => {
        let t;
        const bump = () => { clearTimeout(t); t = setTimeout(load, 500); };
        const ch = supabase.channel(`m-today-${who?.custom_id}`);
        ['installation_workers', 'attendance', 'issue_orders', 'installer_reports'].forEach(table =>
            ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
        ch.subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load, who?.custom_id]);

    const completeTask = async (task) => {
        setTasks(list => list.filter(x => x.custom_id !== task.custom_id));
        const { error } = await supabase.from('microtasks')
            .update({ status: 'виконано', data_complete: new Date().toISOString() }).eq('custom_id', task.custom_id);
        if (error) { toast(humanError(error), 'error'); load(); return; }
        toast('Задачу виконано', 'success');
        refreshBadges();
    };

    const todayVisits = visits.filter(v => v.date === today);
    const tomorrow = shiftDay(today, 1);
    const tomorrowVisits = visits.filter(v => v.date === tomorrow);
    const nextVisit = visits.find(v => v.date > today);
    const offToday = offs.get(today);
    const crewOf = (v) => (crew.find(c => c.key === v.key)?.workerIds || v.workerIds)
        .filter(id => id !== who.custom_id).map(id => people.get(id)).filter(Boolean);

    const roleLine = [isBrigadier(who) ? 'Бригадир' : null, who.position].filter(Boolean).join(' · ');

    // Головна кнопка дня — звіт по об'єктах, де я сьогодні в графіку
    const reportable = todayVisits.filter(v => v.installationId);
    const sentN = reportable.filter(v => reports.some(r => r.installation_custom_id === v.installationId && r.submitted_at)).length;
    const waitingN = reportable.filter(v => queuedKeys.has(reportKey(v.installationId, today))).length;
    // З 15:30 незаповнений звіт — червона кнопка, що блимає
    const late = isReportTime(now);
    const bottom = !loading && reportable.length > 0 && !offToday ? (
        sentN >= reportable.length
            ? <Big tone="soft" icon={FaCheckCircle} onClick={() => navigate('/m/report')}>Звіт надіслано</Big>
            : sentN + waitingN >= reportable.length
                ? <Big tone="soft" icon={FaCloudUploadAlt} onClick={() => navigate('/m/report')}>Звіт чекає інтернету</Big>
                : <Big tone={late ? 'alert' : 'main'} icon={FaClipboardList} onClick={() => navigate('/m/report')}>
                    {late ? 'Час заповнити звіт' : 'Заповнити звіт'}{reportable.length > 1 ? ` · ${sentN} з ${reportable.length}` : ''}
                </Big>
    ) : null;

    return (
        <Screen title={fmtDay(today)} sub={roleLine || who.name} bottom={bottom}>
            {loading ? <Loading /> : (<>
                {offToday && (
                    <Card hero>
                        <div className="flex items-center gap-3">
                            <FaUmbrellaBeach size={22} className="text-slate-900 flex-shrink-0" />
                            <div>
                                <div className="text-[18px] font-bold">Сьогодні у вас {OFF_LABEL[offToday].toLowerCase()}</div>
                                {todayVisits.length > 0 && <div className="text-[14px] text-amber-800 mt-0.5">Але ви стоїте в графіку — офіс уже знає й шукає заміну.</div>}
                            </div>
                        </div>
                    </Card>
                )}

                {todayVisits.map((v, i) => {
                    const o = v.installationId ? objects.get(v.installationId) : null;
                    const team = crewOf(v);
                    const route = routeLink(o);
                    const tel = telLink(o?.client?.phone);
                    const docs = issues.filter(d => d.installation_custom_id === v.installationId);
                    return (
                        <Card key={v.key} hero={i === 0}>
                            <Label right={o?.workflow_stage ? <Pill tone="warn">{getStageGroupLabel(o.workflow_stage)}</Pill> : null}>
                                {i === 0 ? 'Їдемо' : 'Далі'}
                            </Label>
                            <div className="text-[19px] font-bold leading-snug break-words">{visitTitle(v, objects)}</div>
                            {o && (
                                <div className="text-[14px] text-slate-600 mt-0.5 break-words">
                                    {[placeOf(o), kwText(o.capacity_kw), o.station_type].filter(Boolean).join(' · ')}
                                </div>
                            )}
                            {team.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-2.5">
                                    {team.map(p => <Pill key={p.custom_id} tone={isBrigadier(p) ? 'dark' : 'neutral'}>{p.name}{isBrigadier(p) ? ' · бригадир' : ''}</Pill>)}
                                </div>
                            )}
                            {v.installationId && v.notes && (
                                <p className="mt-2.5 text-[15px] text-slate-800 break-words"><b>Що робимо:</b> {v.notes}</p>
                            )}

                            {docs.map(d => {
                                const st = ISSUE[d.status] || { label: d.status, tone: 'neutral' };
                                const n = d.items?.[0]?.count;
                                return (
                                    <div key={d.id} className="mt-3 flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 px-3 py-2.5">
                                        <FaBoxOpen size={17} className="flex-shrink-0 text-slate-700" />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[14.5px] font-bold">Забрати на складі</div>
                                            <div className="text-[13px] text-slate-600 break-words">{[d.doc_number, n ? `${n} поз.` : null, d.warehouse?.name].filter(Boolean).join(' · ')}</div>
                                        </div>
                                        <Pill tone={st.tone}>{st.label}</Pill>
                                    </div>
                                );
                            })}

                            {(route || tel) && (
                                <div className={`grid gap-2 mt-3 ${route && tel ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                    {route && <Big small icon={FaRoute} href={route}>Маршрут</Big>}
                                    {tel && <Big small icon={FaPhone} href={tel}>Клієнт</Big>}
                                </div>
                            )}
                            {o && (
                                <Big small tone="dark" className="mt-2" after={FaArrowRight} onClick={() => navigate(`/m/object/${o.custom_id}`)}>
                                    Відкрити об'єкт
                                </Big>
                            )}
                        </Card>
                    );
                })}

                {!offToday && <TripCard who={who} people={people} canWrite={canWrite} />}

                {todayVisits.length === 0 && !offToday && (
                    <Card hero>
                        <div className="text-[18px] font-bold">Сьогодні вас немає в графіку</div>
                        <p className="text-[14.5px] text-slate-600 mt-1">
                            {nextVisit
                                ? <>Найближчий виїзд — {relDay(nextVisit.date).toLowerCase()}: <b className="text-slate-900">{visitTitle(nextVisit, objects)}</b></>
                                : 'На найближчі два тижні виїздів ще не заплановано.'}
                        </p>
                        <Big small className="mt-3" onClick={() => navigate('/m/schedule')}>Відкрити графік</Big>
                    </Card>
                )}

                {todayVisits.length > 0 && tomorrowVisits.length > 0 && (
                    <Card>
                        <Label right={offs.get(tomorrow) ? <Pill tone="bad">{OFF_LABEL[offs.get(tomorrow)].toLowerCase()}</Pill> : null}>Завтра</Label>
                        {tomorrowVisits.map((v, i) => (
                            <Line key={v.key} first={i === 0}
                                onClick={v.installationId ? () => navigate(`/m/object/${v.installationId}`) : undefined}
                                right={v.installationId ? <FaArrowRight size={12} className="text-slate-400" /> : null}>
                                <b className="text-slate-900">{visitTitle(v, objects)}</b>
                                {crewOf(v).length > 0 && <div className="text-[13px] text-slate-500">з {crewOf(v).map(p => p.name).join(', ')}</div>}
                            </Line>
                        ))}
                    </Card>
                )}

                <Card>
                    <Label icon={FaListUl} right={tasks.length || null}>Мої задачі</Label>
                    {tasks.length === 0 ? <Empty>Відкритих задач немає</Empty> : tasks.slice(0, 3).map((t, i) => (
                        <div key={t.custom_id} className={`flex items-start gap-3 py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                            <Check label="Виконано" onClick={() => completeTask(t)} disabled={!canWrite} />
                            <div className="min-w-0 flex-1 pt-0.5">
                                <div className="text-[15px] font-semibold text-slate-900 break-words whitespace-pre-line"><Linkify>{plainText(t.task_text)}</Linkify></div>
                                <div className="text-[13px] text-slate-500">
                                    {[t.installation?.name, t.due_date ? `до ${relDay(t.due_date).toLowerCase()}` : null].filter(Boolean).join(' · ')}
                                </div>
                            </div>
                        </div>
                    ))}
                    {tasks.length > 3 && <Big small tone="soft" className="mt-1" onClick={() => navigate('/m/tasks')}>Усі задачі · {tasks.length}</Big>}
                </Card>
            </>)}
        </Screen>
    );
}
