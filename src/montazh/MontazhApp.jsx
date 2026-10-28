// =====================================================================
//  K-CORE · Монтаж — окрема проста частина програми для монтажників
//
//  Адреса /m. Монтажник після входу потрапляє сюди й не бачить офісного
//  меню: «Сьогодні», «Графік», «Задачі», «Я». Без грошей, цін, лідів і
//  аналітики; об'єкт відкривається лише той, де людина в графіку.
//
//  Офіс і керівник можуть зайти сюди ж і подивитись очима будь-якого
//  монтажника («Я → Переглянути як…»). У такому перегляді нічого не
//  змінюється — лише читання.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { FaEye, FaTimes } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { MontazhCtx, loadPeople, OPEN_TASK, OFF_KEYS, isoDay, relDay, useNow, isReportTime } from './data';
import { flushQueue, REPORT_SENT_EVENT } from './report';
import { localAll, reportKey } from './local';
import { useToast } from '../ui';
import { BottomNav, Screen } from './kit';
import TodayScreen from './TodayScreen';
import ScheduleScreen from './ScheduleScreen';
import ReportScreen from './ReportScreen';
import ReportHistory from './ReportHistory';
import TasksScreen from './TasksScreen';
import MeScreen from './MeScreen';
import ObjectScreen from './ObjectScreen';

/* «Мої звіти» — що я (моя бригада) надсилав, по всіх об'єктах */
const MyReportsScreen = () => (
    <Screen title="Мої звіти" sub="усе, що надсилали з вашою бригадою" back="/m/report">
        <ReportHistory mine />
    </Screen>
);

const AS_KEY = 'kcore.m.as';
const readAs = () => { try { return sessionStorage.getItem(AS_KEY); } catch { return null; } };
const writeAs = (v) => { try { if (v) sessionStorage.setItem(AS_KEY, String(v)); else sessionStorage.removeItem(AS_KEY); } catch { /* немає сховища */ } };

export default function MontazhApp() {
    const { employee: me, isOffice } = useAuth();
    const [params, setParams] = useSearchParams();
    const [asId, setAsId] = useState(() => (isOffice ? readAs() : null));
    const [people, setPeople] = useState(new Map());
    const [openTasks, setOpenTasks] = useState(0);

    useEffect(() => { document.title = 'K-Core Монтаж'; return () => { document.title = 'K-Core'; }; }, []);
    useEffect(() => { loadPeople().then(setPeople); }, []);

    // Посилання виду /m?as=123 — одразу відкрити перегляд очима цієї людини
    useEffect(() => {
        const q = params.get('as');
        if (!q) return;
        if (isOffice) { writeAs(q); setAsId(q); }
        params.delete('as');
        setParams(params, { replace: true });
    }, [params, setParams, isOffice]);

    const asEmp = isOffice && asId ? people.get(Number(asId)) || null : null;
    const who = asEmp || me;
    const preview = !!(asEmp && asEmp.id !== me?.id);

    const setPreview = useCallback((customId) => { writeAs(customId); setAsId(customId ? String(customId) : null); }, []);

    // Лічильник відкритих задач на вкладці «Задачі» і чи чекає сьогоднішній звіт
    const [reportPending, setReportPending] = useState(false);
    const refreshBadges = useCallback(async () => {
        if (who?.custom_id == null) return;
        const today = isoDay();
        const [tasks, mine, off] = await Promise.all([
            supabase.from('microtasks').select('custom_id', { count: 'exact', head: true })
                .eq('assigned_to', who.custom_id).in('status', OPEN_TASK),
            supabase.from('installation_workers').select('installation_custom_id')
                .eq('employee_custom_id', who.custom_id).eq('work_date', today).not('installation_custom_id', 'is', null),
            supabase.from('attendance').select('id').eq('employee_custom_id', who.custom_id).eq('work_date', today).in('status', OFF_KEYS),
        ]);
        setOpenTasks(tasks.count || 0);
        const ids = [...new Set((mine.data || []).map(r => r.installation_custom_id))];
        if (!ids.length || (off.data || []).length) { setReportPending(false); return; }
        const [{ data: reps }, local] = await Promise.all([
            supabase.from('installer_reports').select('installation_custom_id, submitted_at')
                .eq('work_date', today).in('installation_custom_id', ids),
            localAll(),
        ]);
        // Звіт, що вже чекає інтернету на телефоні, теж вважаємо зданим — крапка не потрібна
        const waiting = new Set(local.filter(x => x.value?.pending).map(x => x.key));
        setReportPending(ids.some(id => !waiting.has(reportKey(id, today))
            && !(reps || []).some(r => r.installation_custom_id === id && r.submitted_at)));
    }, [who?.custom_id]);
    useEffect(() => { refreshBadges(); }, [refreshBadges]);
    // Звіт надіслали (тут чи з іншого телефона бригади) — крапка зникає одразу
    useEffect(() => {
        const ch = supabase.channel(`m-badges-${who?.custom_id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'installer_reports' }, () => refreshBadges())
            .subscribe();
        window.addEventListener(REPORT_SENT_EVENT, refreshBadges);
        return () => { supabase.removeChannel(ch); window.removeEventListener(REPORT_SENT_EVENT, refreshBadges); };
    }, [refreshBadges, who?.custom_id]);
    const now = useNow();
    const reportDue = reportPending && isReportTime(now);

    // Звіти, що чекають інтернету на телефоні: з'явився зв'язок, відкрили додаток
    // чи минула хвилина — надсилаємо самі
    const toast = useToast();
    useEffect(() => {
        let alive = true;
        const flush = async () => {
            const sent = await flushQueue();
            if (!alive || !sent.length) return;
            sent.forEach(s => toast(`Звіт за ${s.date ? relDay(s.date).toLowerCase() : 'день'} надіслано — чекав інтернету`, 'success'));
            refreshBadges();
        };
        flush();
        window.addEventListener('online', flush);
        const t = setInterval(flush, 60000);
        return () => { alive = false; window.removeEventListener('online', flush); clearInterval(t); };
    }, [toast, refreshBadges]);

    const ctx = useMemo(() => ({
        me, who, preview, isOffice, canWrite: !preview, people, setPreview, refreshBadges, reportDue,
    }), [me, who, preview, isOffice, people, setPreview, refreshBadges, reportDue]);

    // Перегляд очима іншої людини — чекаємо список людей, інакше екран
    // спершу завантажився б для себе, а потім ще раз для неї
    if (!who || (isOffice && asId && !people.size)) return null;

    // Каркас на весь екран: сама сторінка не гортається (гортається лише
    // середина кожного екрана), тож шапка й меню завжди на місці
    return (
        <MontazhCtx.Provider value={ctx}>
            <div className="fixed inset-0 bg-slate-200 text-slate-900 antialiased">
                <div className="h-full max-w-md mx-auto flex flex-col bg-slate-100">
                    {preview && (
                        <div className="flex-shrink-0 bg-slate-900 text-white px-4 py-2 flex items-center gap-2 text-[13.5px]">
                            <FaEye size={13} className="flex-shrink-0 text-[#f2c200]" />
                            <span className="min-w-0 flex-1">Ви бачите як <b>{who.name}</b> · лише перегляд</span>
                            <button type="button" onClick={() => setPreview(null)} aria-label="Вийти з перегляду"
                                className="w-10 h-10 -my-1 -mr-2 flex items-center justify-center rounded-lg text-slate-300 hover:text-white">
                                <FaTimes size={14} />
                            </button>
                        </div>
                    )}
                    <div className="flex-1 min-h-0 flex flex-col">
                        <Routes>
                            <Route index element={<TodayScreen />} />
                            <Route path="schedule" element={<ScheduleScreen />} />
                            <Route path="report" element={<ReportScreen />} />
                            <Route path="reports" element={<MyReportsScreen />} />
                            <Route path="tasks" element={<TasksScreen />} />
                            <Route path="me" element={<MeScreen />} />
                            <Route path="object/:id" element={<ObjectScreen />} />
                            <Route path="*" element={<Navigate to="/m" replace />} />
                        </Routes>
                    </div>
                    <BottomNav badges={{ '/m/tasks': openTasks, '/m/report': reportDue }} />
                </div>
            </div>
        </MontazhCtx.Provider>
    );
}
