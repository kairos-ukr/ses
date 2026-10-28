// =====================================================================
//  K-CORE · «Що чекає на складі» — смуга над залишками
//
//  Складівник одразу бачить свою роботу за процесом:
//  видати зібране → прийняти те, що їде → закрити заявки → докупити те,
//  чого нижче мінімуму. Плитка веде просто в потрібну чергу.
// =====================================================================

import React, { useEffect, useState } from 'react';
import { FaClipboardList, FaTruck, FaShoppingCart, FaExclamationTriangle } from 'react-icons/fa';
import { supabase } from '../../supabaseClient';

const count = async (q) => {
    const { count: n, error } = await q;
    return error ? null : n;
};

export default function WarehouseQueue({ onGo }) {
    const [n, setN] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            const [issue, incoming, requests, below] = await Promise.all([
                count(supabase.from('issue_orders').select('id', { count: 'exact', head: true }).eq('status', 'ready')),
                count(supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['sent', 'partially_received'])),
                count(supabase.from('procurement_requests').select('id', { count: 'exact', head: true }).eq('status', 'requested')),
                count(supabase.from('v_stock_below_min').select('nomenclature_id', { count: 'exact', head: true })),
            ]);
            if (alive) setN({ issue, incoming, requests, below });
        })();
        return () => { alive = false; };
    }, []);

    const tiles = [
        { key: 'issue', label: 'До видачі', hint: 'зібрано, чекає видачі', icon: FaClipboardList, tone: 'amber', go: () => onGo('issue') },
        { key: 'incoming', label: 'Чекаємо поставку', hint: 'замовлено, ще не прийнято', icon: FaTruck, tone: 'sky', go: () => onGo('purchases') },
        { key: 'requests', label: 'Заявки на закупівлю', hint: 'ще не замовлено', icon: FaShoppingCart, tone: 'indigo', go: () => onGo('purchases') },
        { key: 'below', label: 'Нижче мінімуму', hint: 'час докупити', icon: FaExclamationTriangle, tone: 'rose', go: () => onGo('stock', { stock: 'belowmin' }) },
    ];
    const TONES = {
        amber: 'text-amber-700 bg-amber-50 border-amber-200',
        sky: 'text-sky-700 bg-sky-50 border-sky-200',
        indigo: 'text-indigo-700 bg-indigo-50 border-indigo-200',
        rose: 'text-rose-700 bg-rose-50 border-rose-200',
    };

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-2.5 flex-none">
            {tiles.map(t => {
                const v = n ? n[t.key] : null;
                if (n && v == null) return null; // розділу ще немає в базі
                const busy = v > 0;
                return (
                    <button key={t.key} type="button" onClick={t.go}
                        className={`text-left rounded-xl border px-3 py-2 flex items-center gap-2.5 transition-colors ${busy ? `${TONES[t.tone]} hover:brightness-95` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                        <t.icon size={14} className="flex-shrink-0" />
                        <span className="min-w-0 flex-1">
                            <span className="block text-[12.5px] font-bold leading-tight">{t.label}</span>
                            <span className="block text-[11px] opacity-80 leading-tight">{t.hint}</span>
                        </span>
                        <span className="text-[20px] font-bold tabular-nums leading-none">{v == null ? '·' : v}</span>
                    </button>
                );
            })}
        </div>
    );
}
