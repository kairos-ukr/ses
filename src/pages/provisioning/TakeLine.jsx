// =====================================================================
//  K-CORE · «Взяти з собою» в CRM — один рядок під об'єктом
//
//  Коротко: «ел. захист 1 · матеріали 1 · немає на складі 9». Натиск —
//  розгортає список на місці: що взяти (і з якого складу) та чого на
//  складі немає. Той самий список бригада бачить у «Монтажі» й отримує
//  разом зі сповіщенням про графік.
// =====================================================================

import React, { useState } from 'react';
import { FaToolbox, FaChevronDown } from 'react-icons/fa';
import { splitTake, takeSummary, takeLine } from '../../domain/takeList';

export default function TakeLine({ rows, className = '' }) {
    const [open, setOpen] = useState(false);
    if (!rows?.length) return null;
    const { take, absent, back, takeGroups, absentGroups, warehouses } = splitTake(rows);
    return (
        <div className={className}>
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
                className={`text-[12.5px] font-semibold inline-flex items-start gap-1.5 text-left ${take.length || back.length ? 'text-amber-800 hover:text-amber-900' : 'text-rose-700 hover:text-rose-800'}`}>
                <FaToolbox size={11} className="mt-0.5 flex-shrink-0" />
                <span className="break-words">Взяти з собою: {takeSummary(rows)}</span>
                <FaChevronDown size={9} className={`mt-1 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="mt-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-700 space-y-1.5">
                    {takeGroups.map(g => (
                        <div key={g.key} className="break-words"><b className="text-slate-900">{g.title}:</b> {g.rows.map(takeLine).join('; ')}</div>
                    ))}
                    {warehouses.length > 0 && <div className="text-slate-500">Склад: {warehouses.join(', ')}</div>}
                    {absent.length > 0 && (
                        <div className="text-rose-700 break-words">
                            <b>Немає на складі:</b> {absentGroups.map(g => g.rows.map(takeLine).join('; ')).join('; ')}
                        </div>
                    )}
                    {back.length > 0 && (
                        <div className="text-amber-800 break-words">
                            <b>Повернути на склад (зміна специфікації):</b> {back.map(takeLine).join('; ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
