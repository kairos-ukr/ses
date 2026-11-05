// =====================================================================
//  K-CORE · Бригадам: що взяти з собою
//
//  Що за специфікаціями (ел. захист, обладнання, матеріали) ще не видано
//  на об'єкт — бригада бачить у «Монтажі» завжди, менеджер — у Календарі.
//  Тут — чи нагадувати ще й повідомленнями (дзвіночок і Telegram):
//   • у сповіщенні «Графік на …» — список для об'єкта людини, а в гілці
//     графіка — короткий рядок під об'єктом;
//   • зранку о 7:00 — особисто, що взяти сьогодні;
//   • кому: усім, хто їде, або лише бригадиру (немає бригадира — усім).
//  Перемикає той, хто змінює налаштування чи забезпечення; решта бачить.
// =====================================================================

import React, { useEffect, useState } from 'react';
import { FaToolbox, FaCalendarCheck, FaSun } from 'react-icons/fa';
import { useAuth } from '../AuthProvider';
import { T, Skeleton, Switch, Segmented, Tip, useToast, humanError } from '../ui';
import { loadTakeReminders, saveSetting } from '../utils/settings';

const ROWS = [
    { key: 'schedule', icon: FaCalendarCheck, title: 'Разом із графіком', on: 'У сповіщенні «Графік на …» — що взяти; у гілці графіка — коротко під об\'єктом', off: 'Графік без списку' },
    { key: 'morning', icon: FaSun, title: 'Зранку о 7:00', on: 'Окреме нагадування в день виїзду: що взяти сьогодні', off: 'Зранку не нагадуємо' },
];
const WHO = [
    { value: 'crew', label: 'Усім, хто їде' },
    { value: 'brigadier', label: 'Лише бригадиру' },
];

export default function TakeReminders() {
    const auth = useAuth();
    const toast = useToast();
    const [cfg, setCfg] = useState(null);
    const [busy, setBusy] = useState(false);
    const canEdit = auth.can('settings', 'edit') || auth.can('provisioning', 'edit');

    useEffect(() => { loadTakeReminders().then(setCfg); }, []);

    const save = async (patch, message) => {
        const next = { ...cfg, ...patch };
        setBusy(true);
        try {
            await saveSetting('take_reminders', next, auth.employee?.id);
            setCfg(next);
            toast(message, 'success');
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`${T.card} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaToolbox size={13} className="text-indigo-500" /> Бригадам: що взяти з собою
                </h2>
                <Tip text="Що за специфікаціями (ел. захист, обладнання, матеріали) ще не видано на об'єкт і з якого складу брати. У «Монтажі» й Календарі список видно завжди; тут — чи нагадувати повідомленнями." />
            </div>
            {!cfg ? <Skeleton rows={3} /> : (
                <ul className="divide-y divide-slate-100">
                    {ROWS.map(r => (
                        <li key={r.key} className="px-4 py-3 flex items-start gap-3">
                            <r.icon size={13} className={`mt-1 flex-shrink-0 ${cfg[r.key] ? 'text-emerald-600' : 'text-slate-400'}`} />
                            <div className="min-w-0 flex-1">
                                <div className="text-[14px] font-semibold text-slate-900">{r.title}</div>
                                <div className="text-[12.5px] text-slate-500 break-words">{cfg[r.key] ? r.on : r.off}</div>
                            </div>
                            <Switch on={!!cfg[r.key]} disabled={!canEdit || busy} label={r.title}
                                onClick={() => save({ [r.key]: !cfg[r.key] }, `${r.title}: ${!cfg[r.key] ? 'увімкнено' : 'вимкнено'}`)} />
                        </li>
                    ))}
                    <li className={`px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${!cfg.schedule && !cfg.morning ? 'opacity-50' : ''}`}>
                        <span className="text-[14px] font-semibold text-slate-900 mr-auto">Кому</span>
                        {canEdit ? (
                            <Segmented value={cfg.to} options={WHO}
                                onChange={(v) => { if (v !== cfg.to && !busy) save({ to: v }, `Нагадування «Взяти з собою»: ${WHO.find(w => w.value === v).label.toLowerCase()}`); }} />
                        ) : (
                            <span className="text-[13px] text-slate-600">{WHO.find(w => w.value === cfg.to)?.label}</span>
                        )}
                    </li>
                </ul>
            )}
        </div>
    );
}
