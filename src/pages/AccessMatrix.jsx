// =====================================================================
//  K-CORE · Доступи — таблиця прав по розділах
//
//  Рядок = розділ програми; праворуч — що людина в ньому може:
//  Бачить / Додає / Змінює / Видаляє, а де це має сенс — «свої / усі».
//  Зняли «Бачить» — розділ закрився цілком; увімкнули будь-що інше —
//  «Бачить» вмикається саме.
//
//  base — права шаблону: рядки, що від нього відрізняються, підсвічені,
//  і їх можна повернути «як у шаблоні».
// =====================================================================

import React, { useMemo } from 'react';
import { FaUndo } from 'react-icons/fa';
import { Tip } from '../ui';
import { ACTIONS, SECTIONS, sameSection } from '../domain/access';

const GROUPS = SECTIONS.reduce((acc, s) => {
    (acc.find(g => g.name === s.group) || acc[acc.push({ name: s.group, items: [] }) - 1]).items.push(s);
    return acc;
}, []);

/** Новий стан розділу після натиску на дію */
export const toggleAction = (sec, cur, action) => {
    const p = { ...(cur || {}) };
    if (action === 'view') {
        if (p.view) return null;                       // закрили розділ цілком
        return { view: true, all: true };
    }
    p[action] = !p[action];
    if (p[action]) { p.view = true; if (p.all === undefined) p.all = true; }
    return p;
};

const chip = (on, tone = 'indigo') => `h-8 px-2.5 rounded-lg border text-[12px] font-semibold transition-colors whitespace-nowrap
    ${on ? (tone === 'rose' ? 'bg-rose-600 border-rose-600 text-white' : 'bg-indigo-600 border-indigo-600 text-white')
        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`;

export default function AccessMatrix({ value, base, onChange, readOnly = false }) {
    const diff = useMemo(() => (base ? new Set(SECTIONS.filter(s => !sameSection(value?.[s.key], base?.[s.key], s)).map(s => s.key)) : new Set()), [value, base]);

    return (
        <div className="divide-y divide-slate-100">
            {GROUPS.map(g => (
                <div key={g.name} className="py-1.5">
                    <div className="px-1 pt-1 pb-0.5 text-[11.5px] font-bold text-slate-400">{g.name}</div>
                    {g.items.map(sec => {
                        const p = value?.[sec.key] || null;
                        const changed = diff.has(sec.key);
                        return (
                            <div key={sec.key} className={`px-1.5 py-1.5 rounded-lg flex flex-wrap items-center gap-x-3 gap-y-1.5 ${changed ? 'bg-amber-50' : ''}`}>
                                <div className="min-w-0 flex-1 basis-[180px] text-[13.5px] font-semibold text-slate-800 inline-flex items-center gap-1.5">
                                    <span className="break-words">{sec.label}</span>
                                    {sec.hint && <Tip text={sec.hint} width={280} />}
                                    {changed && <span className="text-[11px] font-semibold text-amber-700">особисто</span>}
                                </div>
                                <div className="flex flex-wrap items-center gap-1">
                                    {ACTIONS.filter(a => sec.acts.includes(a.key)).map(a => (
                                        <button key={a.key} type="button" disabled={readOnly} aria-pressed={!!p?.[a.key]}
                                            onClick={() => onChange(sec.key, toggleAction(sec, p, a.key))}
                                            className={`${chip(!!p?.[a.key], a.key === 'delete' ? 'rose' : 'indigo')} disabled:cursor-default`}>
                                            {a.label}
                                        </button>
                                    ))}
                                    {sec.scope && p?.view && (
                                        <span className="inline-flex ml-1 rounded-lg border border-slate-200 overflow-hidden">
                                            {[{ v: false, l: 'Свої' }, { v: true, l: 'Усі' }].map(o => (
                                                <button key={o.l} type="button" disabled={readOnly} onClick={() => onChange(sec.key, { ...p, all: o.v })}
                                                    className={`h-8 px-2.5 text-[12px] font-semibold ${!!p.all === o.v ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'} disabled:cursor-default`}>
                                                    {o.l}
                                                </button>
                                            ))}
                                        </span>
                                    )}
                                    {changed && !readOnly && base && (
                                        <button type="button" onClick={() => onChange(sec.key, undefined)} title="Як у шаблоні" aria-label={`${sec.label}: як у шаблоні`}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center text-amber-600 hover:bg-amber-100">
                                            <FaUndo size={10} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
