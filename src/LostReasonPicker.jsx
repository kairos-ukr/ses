// =====================================================================
//  Причина, чому угода не відбулась (статус «Втрачено»).
//  Один і той самий блок у формі об'єкта, у картці об'єкта та у вікні
//  «Втрачено?» на дошці — щоб причини збиралися однаково і їх можна
//  було порахувати в аналітиці.
// =====================================================================

import React from 'react';
import { FaTag, FaUserFriends, FaHourglassHalf, FaPhoneSlash, FaEllipsisH } from 'react-icons/fa';
import { T } from './ui';
import { LOST_REASONS } from './domain/objects';

const ICONS = { price: FaTag, competitor: FaUserFriends, postponed: FaHourglassHalf, no_contact: FaPhoneSlash, other: FaEllipsisH };

const PLACEHOLDERS = {
    price: 'Яку ціну хотів клієнт, на скільки ми дорожчі…',
    competitor: 'Який конкурент, за якою ціною…',
    postponed: 'До коли відклав, чому…',
    no_contact: 'Скільки разів дзвонили, коли востаннє…',
    other: 'Що сталося…',
};

export default function LostReasonPicker({ reason, comment, onChange, error }) {
    return (
        <div className="space-y-2.5">
            <span className={`${T.label} block`}>
                Чому угода не відбулась<span className="text-rose-500 ml-0.5">*</span>
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LOST_REASONS.map(r => {
                    const on = reason === r.key;
                    const Icon = ICONS[r.key] || FaEllipsisH;
                    return (
                        <button
                            key={r.key}
                            type="button"
                            onClick={() => onChange({ reason: r.key, comment })}
                            className={`min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center gap-2.5 transition-colors
                                ${on
                                    ? 'bg-rose-50 border-rose-300 text-rose-800 ring-1 ring-rose-200'
                                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                            <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${on ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>
                                <Icon size={12} />
                            </span>
                            <span className="text-[13px] font-semibold leading-tight">{r.label}</span>
                        </button>
                    );
                })}
            </div>
            {error && <div className="text-[12px] font-bold text-rose-600">{error}</div>}
            <textarea
                rows={2}
                className={`${T.input} h-auto py-2 resize-none`}
                value={comment || ''}
                onChange={e => onChange({ reason, comment: e.target.value })}
                placeholder={PLACEHOLDERS[reason] || 'Коментар (необов’язково)'}
            />
        </div>
    );
}
