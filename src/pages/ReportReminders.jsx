// =====================================================================
//  K-CORE · Звіти бригад: сповіщення
//
//   • Бригаді — нагадування заповнити звіт, поки його немає: о котрій
//     (друге — повторне, можна прибрати) і кому (бригадиру або всім).
//   • Менеджеру об'єкта — щойно звіт надіслано: одним повідомленням що
//     зроблено, проблеми, гроші, плани й потреби на завтра.
//   • Ввечері — зведення «звіту немає»: кожному менеджеру його об'єкти,
//     а людям зі списку — усе (і «все здано», коли так).
//  Нагадування й зведення надсилає бот, тож нові години діють після
//  оновлення бота на сервері; «менеджеру» робить база — одразу.
//  Знизу — скільки монтажників узагалі можуть отримати нагадування.
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { FaClipboardCheck, FaUsers, FaUserTie, FaMoon, FaTimes, FaUserPlus } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Skeleton, Switch, Segmented, Picker, Tip, useToast, humanError } from '../ui';
import { loadReportReminders, saveSetting } from '../utils/settings';

const WHO = [
    { value: 'brigadier', label: 'Бригадиру' },
    { value: 'crew', label: 'Усім, хто їде' },
];

export default function ReportReminders() {
    const auth = useAuth();
    const toast = useToast();
    const [cfg, setCfg] = useState(null);
    const [busy, setBusy] = useState(false);
    const [staff, setStaff] = useState([]);
    const [reach, setReach] = useState(null);   // { installers, tg, push }
    const canEdit = auth.can('settings', 'edit');

    useEffect(() => {
        loadReportReminders().then(setCfg);
        (async () => {
            const [emp, subs] = await Promise.all([
                supabase.from('employees').select('id, name, role, telegram_user_id, access_blocked_at, hidden_from_list').order('name'),
                supabase.from('push_subscriptions').select('employee_id'),
            ]);
            const live = (emp.data || []).filter(e => !e.access_blocked_at && !e.hidden_from_list);
            setStaff(live.filter(e => e.role !== 'installer'));
            const pushIds = new Set((subs.data || []).map(s => s.employee_id));
            const inst = live.filter(e => e.role === 'installer');
            setReach({ installers: inst.length, tg: inst.filter(e => e.telegram_user_id).length, push: inst.filter(e => pushIds.has(e.id)).length });
        })();
    }, []);

    const save = async (patch, message) => {
        const next = { ...cfg, ...patch };
        setCfg(next);
        setBusy(true);
        try {
            await saveSetting('report_reminders', next, auth.employee?.id);
            if (message) toast(message, 'success');
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    const extra = useMemo(() => (cfg?.digest_to || []).map(id => staff.find(s => s.id === id)).filter(Boolean), [cfg, staff]);
    const options = useMemo(() => staff.filter(s => !(cfg?.digest_to || []).includes(s.id)).map(s => ({ id: s.id, label: s.name })), [staff, cfg]);

    const timeInput = (key, label) => (
        <label className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600">
            {label}
            <input type="time" className={`${T.input} !w-[110px] !h-9`} value={cfg[key] || ''} disabled={!canEdit}
                onChange={e => setCfg(c => ({ ...c, [key]: e.target.value }))}
                onBlur={e => save({ [key]: e.target.value || null }, null)} />
        </label>
    );

    const row = (key, icon, title, onText, offText, extraNode) => {
        const Icon = icon;
        return (
            <li className="px-4 py-3">
                <div className="flex items-start gap-3">
                    <Icon size={13} className={`mt-1 flex-shrink-0 ${cfg[key] ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-slate-900">{title}</div>
                        <div className="text-[12.5px] text-slate-500 break-words">{cfg[key] ? onText : offText}</div>
                    </div>
                    <Switch on={!!cfg[key]} disabled={!canEdit || busy} label={title}
                        onClick={() => save({ [key]: !cfg[key] }, `${title}: ${!cfg[key] ? 'увімкнено' : 'вимкнено'}`)} />
                </div>
                {cfg[key] && extraNode && <div className="mt-2.5 pl-7">{extraNode}</div>}
            </li>
        );
    };

    return (
        <div className={`${T.card} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaClipboardCheck size={13} className="text-indigo-500" /> Звіти бригад: сповіщення
                </h2>
                <Tip text="Нагадування бригаді й вечірнє зведення надсилає бот — нові години діють після оновлення бота на сервері. Повідомлення менеджеру про надісланий звіт іде одразу." />
            </div>
            {!cfg ? <Skeleton rows={4} /> : (
                <ul className="divide-y divide-slate-100">
                    {row('crew', FaUsers, 'Бригаді: нагадати про звіт', 'Поки звіту немає — нагадуємо', 'Не нагадуємо', (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            {timeInput('first', 'О')}
                            {timeInput('second', 'і ще раз о')}
                            {canEdit ? (
                                <Segmented value={cfg.to} options={WHO} onChange={(v) => { if (v !== cfg.to) save({ to: v }, `Нагадування про звіт: ${WHO.find(w => w.value === v).label.toLowerCase()}`); }} />
                            ) : <span className="text-[12.5px] text-slate-600">{WHO.find(w => w.value === cfg.to)?.label}</span>}
                        </div>
                    ))}
                    {row('manager', FaUserTie, 'Менеджеру: звіт надіслано',
                        'Відповідальний за об\'єкт одразу бачить: що зроблено, проблеми, гроші, плани на завтра', 'Не надсилаємо')}
                    {row('digest', FaMoon, 'Ввечері: хто не здав звіт', 'Кожному менеджеру — його об\'єкти без звіту', 'Зведення немає', (
                        <div className="space-y-2">
                            {timeInput('digest_time', 'О')}
                            <div className="text-[12.5px] font-semibold text-slate-600">Усе зведення ще отримують:</div>
                            <div className="flex flex-wrap gap-1.5">
                                {extra.length === 0 && <span className="text-[12.5px] text-slate-400">лише менеджери об'єктів</span>}
                                {extra.map(p => (
                                    <span key={p.id} className="h-8 pl-2.5 pr-1 rounded-lg bg-indigo-50 border border-indigo-100 text-[12.5px] font-semibold text-indigo-800 inline-flex items-center gap-1.5">
                                        {p.name}
                                        {canEdit && (
                                            <button type="button" aria-label={`Прибрати: ${p.name}`}
                                                onClick={() => save({ digest_to: cfg.digest_to.filter(id => id !== p.id) }, `${p.name} більше не отримує зведення`)}
                                                className="w-6 h-6 rounded-md flex items-center justify-center text-indigo-300 hover:text-rose-600 hover:bg-white"><FaTimes size={9} /></button>
                                        )}
                                    </span>
                                ))}
                            </div>
                            {canEdit && (
                                <div className="max-w-[320px]">
                                    <Picker options={options} value="" icon={FaUserPlus} placeholder="Додати людину…" searchPlaceholder="Ім'я…"
                                        onChange={(id) => save({ digest_to: [...(cfg.digest_to || []), Number(id)] }, 'Додано до зведення')} />
                                </div>
                            )}
                        </div>
                    ))}
                    {reach && (
                        <li className="px-4 py-2.5 bg-slate-50/70 text-[12.5px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>Монтажників: <b className="text-slate-900">{reach.installers}</b></span>
                            <span>· Telegram підключили <b className={reach.tg ? 'text-slate-900' : 'text-rose-600'}>{reach.tg}</b></span>
                            <span>· сповіщення на телефоні — <b className={reach.push ? 'text-slate-900' : 'text-rose-600'}>{reach.push}</b></span>
                            <Tip text="Решта бачить нагадування лише тоді, коли відкриває «Монтаж». Увімкнути сповіщення й підключити Telegram кожен може в «Монтажі» → «Я» → «Сповіщення»." />
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
}
