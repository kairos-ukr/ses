// =====================================================================
//  «Борги» — хто винен, скільки і як давно не платив
//
//  Дані — перегляд v_receivables (db/2026-10_payment_schedule.sql):
//  борг по об'єкту й останній платіж. Графік платежів прибрали
//  (21.10.2026, ним не користуються) — тож «прострочено» тут означає
//  «давно без оплат». Суми в різних валютах не складаємо між собою.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPhone, FaArrowRight, FaFileInvoiceDollar } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Chip, Tip, SearchInput, Skeleton, EmptyState, Person, useToast, humanError } from '../ui';
import { CURRENCIES, formatMoney, getObjectStatus } from '../domain/objects';
import { getStageGroupLabel } from '../domain/stages';
import { fetchAll } from '../utils/fetchAll';

const fmt = (d) => (d ? new Date(d).toLocaleDateString('uk-UA') : '—');

const sumByCurrency = (rows, field) => {
    const m = {};
    rows.forEach(r => { m[r.currency] = (m[r.currency] || 0) + (Number(r[field]) || 0); });
    const parts = CURRENCIES.filter(c => m[c.key] > 0.009).map(c => formatMoney(Math.round(m[c.key]), c.key));
    return parts.length ? parts : [formatMoney(0)];
};

// Скільки днів без оплати (від останнього платежу); null — платежів ще не було
const daysSincePaid = (r) => (r.last_paid_at ? Math.floor((Date.now() - new Date(r.last_paid_at).getTime()) / 86400000) : null);
const STALE = 30;
const isStale = (r) => { const d = daysSincePaid(r); return d == null || d > STALE; };

const FILTERS = [
    { key: 'all', label: 'Усі', test: () => true },
    { key: 'completed', label: 'Завершені об\'єкти', test: r => r.status === 'completed' },
    { key: 'stale', label: `Без оплат понад ${STALE} дн`, test: isStale },
    { key: 'mine', label: 'Мої', test: (r, me) => me != null && r.responsible_emp_id === me },
];

export default function ReceivablesPanel() {
    const navigate = useNavigate();
    const toast = useToast();
    const { employee } = useAuth();
    const me = employee?.custom_id ?? null;

    const [rows, setRows] = useState([]);
    const [employees, setEmployees] = useState(new Map());
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [search, setSearch] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [data, emp] = await Promise.all([
                fetchAll(() => supabase.from('v_receivables').select('*').order('installation_custom_id')),
                supabase.from('employees').select('custom_id, name'),
            ]);
            setRows(data);
            setEmployees(new Map((emp.data || []).map(e => [e.custom_id, e.name])));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const searched = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => [r.installation_custom_id, r.name, r.client_name, r.client_company, r.client_phone]
            .some(v => v != null && String(v).toLowerCase().includes(q)));
    }, [rows, search]);

    const visible = useMemo(() => {
        const f = FILTERS.find(x => x.key === filter) || FILTERS[0];
        return searched
            .filter(r => f.test(r, me))
            .sort((a, b) => Number(b.status === 'completed') - Number(a.status === 'completed') || Number(b.debt) - Number(a.debt));
    }, [searched, filter, me]);

    const doneRows = rows.filter(r => r.status === 'completed');
    const staleRows = rows.filter(isStale);
    const kpis = [
        { label: 'Винні всього', value: sumByCurrency(rows, 'debt'), sub: `${rows.length} об'єктів` },
        { label: 'Завершені з боргом', value: sumByCurrency(doneRows, 'debt'), sub: `${doneRows.length} об'єктів`, tone: doneRows.length ? 'danger' : null },
        { label: `Без оплат понад ${STALE} дн`, value: sumByCurrency(staleRows, 'debt'), sub: `${staleRows.length} об'єктів` },
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                {kpis.map(k => (
                    <div key={k.label} className={`${T.card} p-2.5 sm:p-4 min-w-0 ${k.tone === 'danger' ? 'border-rose-200 bg-rose-50/40' : ''}`}>
                        <div className={`text-[11px] sm:text-[12.5px] leading-tight font-semibold flex items-center gap-1 ${k.tone === 'danger' ? 'text-rose-700' : 'text-slate-500'}`}>
                            {k.label}{k.hint && <Tip text={k.hint} width={300} />}
                        </div>
                        <div className={`mt-1 text-[15px] sm:text-[24px] leading-tight font-bold tabular-nums break-words ${k.tone === 'danger' ? 'text-rose-700' : 'text-slate-900'}`}>
                            {loading ? '…' : k.value[0]}
                        </div>
                        <div className="text-[12.5px] text-slate-500 mt-0.5">
                            {!loading && k.value.slice(1).map(v => `+ ${v} · `)}{k.sub}
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    {FILTERS.filter(f => f.key !== 'mine' || me != null).map(f => {
                        const n = searched.filter(r => f.test(r, me)).length;
                        const on = filter === f.key;
                        return (
                            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                                className={`flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[12.5px] font-semibold transition-colors
                                    ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                {f.label}<span className={`tabular-nums text-[11.5px] ${on ? 'text-indigo-200' : 'text-slate-400'}`}>{loading ? '' : n}</span>
                            </button>
                        );
                    })}
                </div>
                <SearchInput value={search} onChange={setSearch} placeholder="Об'єкт, клієнт, телефон…" className="md:ml-auto md:w-72" />
            </div>

            <div className={`${T.card} overflow-hidden`}>
                {loading ? <Skeleton rows={6} /> : visible.length === 0 ? (
                    <EmptyState icon={FaFileInvoiceDollar} title="Боргів немає" hint="За цим фільтром ніхто нічого не винен." />
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {visible.map(r => {
                            const owner = employees.get(r.responsible_emp_id);
                            const days = daysSincePaid(r);
                            const status = getObjectStatus(r.status);
                            return (
                                <li key={r.installation_custom_id}
                                    onClick={() => navigate(`/project/${r.installation_custom_id}`)}
                                    className="px-4 py-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-x-4 gap-y-1.5 items-center cursor-pointer hover:bg-slate-50">
                                    <div className="min-w-0">
                                        <div className="text-[13.5px] font-semibold text-slate-900 sm:truncate">{r.name || r.client_company || r.client_name || `Об'єкт #${r.installation_custom_id}`}</div>
                                        <div className="text-[12px] text-slate-500 sm:truncate">
                                            СЕС-{r.installation_custom_id}
                                            {r.client_name ? ` · ${r.client_name}` : ''}
                                            {` · ${r.status === 'completed' ? status.label.toLowerCase() : getStageGroupLabel(r.workflow_stage)}`}
                                        </div>
                                    </div>
                                    <div className="tabular-nums">
                                        <div className="text-[15px] font-bold text-rose-700">{formatMoney(r.debt, r.currency)}</div>
                                        <div className="text-[12px] text-slate-500">з {formatMoney(r.total_cost, r.currency)} · останній платіж {fmt(r.last_paid_at)}</div>
                                    </div>
                                    <div className="min-w-0 text-[12.5px] flex items-center gap-1.5 flex-wrap">
                                        {r.status === 'completed' && <Chip tone="danger">завершено, не доплачено</Chip>}
                                        {days == null
                                            ? <Chip tone="warn">оплат ще не було</Chip>
                                            : days > STALE
                                                ? <Chip tone="warn">без оплат {days} дн</Chip>
                                                : <span className="text-slate-500">оплата {days === 0 ? 'сьогодні' : `${days} дн тому`}</span>}
                                    </div>
                                    <div className="flex items-center gap-2 justify-start md:justify-end" onClick={e => e.stopPropagation()}>
                                        {owner && <Person name={owner} />}
                                        {r.client_phone && (
                                            <a href={`tel:${r.client_phone}`} title={`Подзвонити: ${r.client_phone}`} aria-label="Подзвонити клієнту"
                                                className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-50">
                                                <FaPhone size={12} />
                                            </a>
                                        )}
                                        <button type="button" onClick={() => navigate(`/project/${r.installation_custom_id}`)}
                                            className="h-9 px-3 rounded-lg border border-slate-300 bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5">
                                            Відкрити <FaArrowRight size={10} />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
