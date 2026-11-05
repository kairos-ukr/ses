// =====================================================================
//  K-CORE · Монтаж · «Взяти з собою»
//
//  Що ще не видано на об'єкт за специфікаціями: ел. захист — першим,
//  далі обладнання й матеріали, і з якого складу брати. Окремо, червоним —
//  чого на складі немає: уточнити в офісі, а не шукати на складі.
//  Жовтим — що після зміни специфікації привезти назад на склад.
//  Натиск на заголовок — згорнути або розгорнути.
// =====================================================================

import React, { useState } from 'react';
import { FaToolbox, FaShieldAlt, FaBolt, FaBoxOpen, FaChevronDown, FaExclamationTriangle, FaUndo } from 'react-icons/fa';
import { splitTake, takeSummary, takeQty } from '../domain/takeList';

const ICON = { protection: FaShieldAlt, equipment: FaBolt, materials: FaBoxOpen };

const Rows = ({ rows, line = 'border-slate-100', note }) => rows.map((r, i) => (
    <div key={r.id} className={`flex items-start gap-3 py-2 ${i ? `border-t ${line}` : ''}`}>
        <div className="min-w-0 flex-1 text-[14.5px] text-slate-900 leading-snug break-words">
            {r.name}
            {note?.(r)}
        </div>
        <b className="text-[14.5px] tabular-nums whitespace-nowrap">{takeQty(r.toTake)}{r.unit ? ` ${r.unit}` : ''}</b>
    </div>
));

function Group({ g, bad }) {
    const Icon = ICON[g.key] || FaBoxOpen;
    return (
        <div className="mt-2.5 first:mt-0">
            <div className={`text-[11.5px] font-bold uppercase tracking-wide inline-flex items-center gap-1.5 ${bad ? 'text-rose-700' : 'text-slate-500'}`}>
                <Icon size={11} /> {g.title} · {g.rows.length}
            </div>
            <Rows rows={g.rows} line={bad ? 'border-rose-100' : 'border-slate-100'}
                note={bad ? null : (r) => r.missing > 0 && <div className="text-[12.5px] font-semibold text-amber-800">на складі лише {takeQty(r.have)}</div>} />
        </div>
    );
}

export default function TakeList({ rows, open: initial = false, className = 'mt-3' }) {
    const [open, setOpen] = useState(initial);
    if (!rows?.length) return null;
    const { take, absent, back, takeGroups, absentGroups, warehouses } = splitTake(rows);
    return (
        <div className={`rounded-xl border-2 border-slate-300 bg-white overflow-hidden ${className}`}>
            <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
                className="w-full min-h-[52px] px-3 py-2.5 flex items-center gap-3 text-left">
                <FaToolbox size={18} className="flex-shrink-0 text-slate-900" />
                <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-slate-900">Взяти з собою{take.length ? ` · ${take.length} поз.` : ''}</div>
                    <div className="text-[13px] text-slate-600 break-words">{takeSummary(rows)}</div>
                </div>
                <FaChevronDown size={13} className={`flex-shrink-0 text-slate-500 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="px-3 pt-2.5 pb-3 border-t border-slate-200">
                    {takeGroups.map(g => <Group key={g.key} g={g} />)}
                    {warehouses.length > 0 && (
                        <div className="mt-2 text-[13.5px] text-slate-700">Склад: <b className="text-slate-900">{warehouses.join(', ')}</b></div>
                    )}
                    {absent.length > 0 && (
                        <div className={`${take.length ? 'mt-3' : ''} rounded-lg bg-rose-50 border border-rose-200 px-3 py-2.5`}>
                            <div className="text-[14px] font-bold text-rose-800 flex items-start gap-2">
                                <FaExclamationTriangle size={13} className="mt-0.5 flex-shrink-0" />
                                <span>Немає на складі — уточніть в офісі · {absent.length}</span>
                            </div>
                            <div className="mt-1.5">{absentGroups.map(g => <Group key={g.key} g={g} bad />)}</div>
                        </div>
                    )}
                    {back.length > 0 && (
                        <div className={`${take.length || absent.length ? 'mt-3' : ''} rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5`}>
                            <div className="text-[14px] font-bold text-amber-900 flex items-start gap-2">
                                <FaUndo size={12} className="mt-1 flex-shrink-0" />
                                <span>Повернути на склад · {back.length}</span>
                            </div>
                            <div className="text-[12.5px] text-amber-800 mt-0.5">За новою специфікацією це більше не потрібне</div>
                            <div className="mt-1"><Rows rows={back} line="border-amber-100" /></div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
