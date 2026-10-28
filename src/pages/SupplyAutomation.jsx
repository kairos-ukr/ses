// =====================================================================
//  K-CORE · Забезпечення: що система робить сама
//
//  Два перемикачі (обидва за замовчуванням вимкнені):
//   • нагадування забезпечення — система сама нагадує скласти
//     специфікацію електрозахисту і забезпечити матеріал;
//   • заявки в закупівлю — коли за затвердженою специфікацією бракує
//     матеріалу, система сама ставить заявку.
//  Вимкнули — нічого автоматичного; усе робиться вручну.
//  Перемикає той, хто змінює забезпечення або налаштування; решта бачить.
// =====================================================================

import React, { useEffect, useState } from 'react';
import { FaBell, FaShoppingCart, FaRobot } from 'react-icons/fa';
import { useAuth } from '../AuthProvider';
import { T, Skeleton, useToast, humanError } from '../ui';
import { loadSupplyAutomation, saveSetting } from '../utils/settings';

const ROWS = [
    { key: 'alerts', icon: FaBell, title: 'Нагадування забезпечення', on: 'Система сама нагадує: скласти специфікацію захисту, забезпечити матеріал', off: 'Нагадувань немає — усе вручну' },
    { key: 'requests', icon: FaShoppingCart, title: 'Заявки в закупівлю', on: 'Коли за специфікацією бракує матеріалу — система сама ставить заявку', off: 'Заявки ставлять лише люди' },
];

function Switch({ on, disabled, onClick, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
            className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
    );
}

export default function SupplyAutomation({ onChanged, bare = false }) {
    const auth = useAuth();
    const toast = useToast();
    const [cfg, setCfg] = useState(null);
    const [busy, setBusy] = useState(false);
    const canEdit = auth.can('provisioning', 'edit') || auth.can('settings', 'edit');

    useEffect(() => { loadSupplyAutomation().then(setCfg); }, []);

    const toggle = async (key) => {
        const next = { ...cfg, [key]: !cfg[key] };
        setBusy(true);
        try {
            await saveSetting('supply_automation', next, auth.employee?.id);
            setCfg(next);
            const row = ROWS.find(r => r.key === key);
            toast(`${row.title}: ${next[key] ? 'увімкнено' : 'вимкнено'}`, 'success');
            onChanged?.(next);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    const body = !cfg ? <Skeleton rows={2} /> : (
        <ul className="divide-y divide-slate-100">
            {ROWS.map(r => (
                <li key={r.key} className="px-4 py-3 flex items-start gap-3">
                    <r.icon size={13} className={`mt-1 flex-shrink-0 ${cfg[r.key] ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-semibold text-slate-900">{r.title}</div>
                        <div className="text-[12.5px] text-slate-500 break-words">{cfg[r.key] ? r.on : r.off}</div>
                    </div>
                    <Switch on={!!cfg[r.key]} disabled={!canEdit || busy} onClick={() => toggle(r.key)} label={r.title} />
                </li>
            ))}
        </ul>
    );

    if (bare) return body;
    return (
        <div className={`${T.card} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-slate-100">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaRobot size={13} className="text-indigo-500" /> Забезпечення: що система робить сама
                </h2>
            </div>
            {body}
        </div>
    );
}
