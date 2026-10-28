// =====================================================================
//  K-CORE · Журнал змін (етап 5, п.22; лише адміністратор)
//
//  Хто, коли і що змінив: вартість, статус, етап, відповідального,
//  платежі, ціни, ролі й доступ працівників, норми й курс. Записи
//  пише сама база (db/2026-10_change_log.sql).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHistory, FaArrowRight, FaUserTie } from 'react-icons/fa';

import Layout from './Layout';
import { supabase } from './supabaseClient';
import { T, Btn, SearchInput, Skeleton, EmptyState, useToast, humanError } from './ui';
import { TABLE_LABELS, describeChange } from './domain/changes';
import { useAuth } from './AuthProvider';

const PAGE = 200;

const MONEY_TABLES = ['payment_history', 'payment_schedule'];
const MONEY_FIELDS = ['total_cost', 'paid_amount', 'payment_status', 'currency', 'total_cost_source'];

const GROUPS = [
    { key: 'all', label: 'Усе', tables: null },
    { key: 'objects', label: 'Обʼєкти', tables: ['installations'] },
    { key: 'money', label: 'Гроші', tables: ['payment_history', 'payment_schedule'] },
    { key: 'clients', label: 'Клієнти й ліди', tables: ['clients', 'leads'] },
    { key: 'team', label: 'Працівники', tables: ['employees'] },
    { key: 'prices', label: 'Ціни', tables: ['nomenclature'] },
    { key: 'settings', label: 'Налаштування', tables: ['stage_norms', 'app_settings'] },
];

const dayLabel = (d) => {
    const x = new Date(d);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(x); day.setHours(0, 0, 0, 0);
    const diff = Math.round((today - day) / 86400000);
    if (diff === 0) return 'Сьогодні';
    if (diff === 1) return 'Вчора';
    return x.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
};

export default function ChangeLogPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const { financeAll } = useAuth();
    const groups = financeAll ? GROUPS : GROUPS.filter(g => g.key !== 'money');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [more, setMore] = useState(false);
    const [group, setGroup] = useState('all');
    const [search, setSearch] = useState('');
    const [dict, setDict] = useState({ emp: new Map(), cli: new Map(), nom: new Map() });

    const load = useCallback(async (offset = 0) => {
        setLoading(true);
        const g = GROUPS.find(x => x.key === group);
        let q = supabase.from('change_log').select('*').order('created_at', { ascending: false }).range(offset, offset + PAGE - 1);
        if (g?.tables) q = q.in('table_name', g.tables);
        const { data, error } = await q;
        setLoading(false);
        if (error) { toast(humanError(error), 'error'); return; }
        setRows(prev => (offset ? [...prev, ...data] : data));
        setMore((data || []).length === PAGE);
    }, [group, toast]);

    useEffect(() => { load(0); }, [load]);

    // Імена для «#17» → «Іван Петренко»
    useEffect(() => {
        Promise.all([
            supabase.from('employees').select('custom_id, name'),
            supabase.from('clients').select('custom_id, name'),
        ]).then(([e, c]) => setDict(d => ({
            ...d,
            emp: new Map((e.data || []).map(x => [String(x.custom_id), x.name])),
            cli: new Map((c.data || []).map(x => [String(x.custom_id), x.name])),
        })));
    }, []);
    useEffect(() => {
        const ids = [...new Set(rows.filter(r => r.table_name === 'nomenclature').map(r => r.record_key))].filter(id => !dict.nom.has(id));
        if (!ids.length) return;
        supabase.from('nomenclature').select('id, name').in('id', ids)
            .then(({ data }) => setDict(d => ({ ...d, nom: new Map([...d.nom, ...(data || []).map(x => [String(x.id), x.name])]) })));
    }, [rows, dict.nom]);

    const ctx = useMemo(() => ({
        empName: (id) => dict.emp.get(String(id)),
        clientName: (id) => dict.cli.get(String(id)),
        nomName: (id) => dict.nom.get(String(id)),
    }), [dict]);

    // Гроші (платежі, суми угод) — лише тим, кому відкрито фінанси компанії
    const items = useMemo(() => {
        const q = search.trim().toLowerCase().replace(/^сес-?/, '');
        const safe = financeAll ? rows : rows
            .filter(r => !MONEY_TABLES.includes(r.table_name))
            .map(r => {
                if (r.table_name !== 'installations' || !r.changes) return r;
                const changes = { ...r.changes };
                MONEY_FIELDS.forEach(k => { delete changes[k]; });
                return { ...r, changes };
            })
            .filter(r => r.table_name !== 'installations' || r.action !== 'update' || Object.keys(r.changes || {}).length);
        return safe.map(r => ({ r, d: describeChange(r, ctx) }))
            .filter(({ r, d }) => !q || [d.subject, ...d.lines, r.actor_name, r.installation_custom_id]
                .some(v => v != null && String(v).toLowerCase().includes(q)));
    }, [rows, ctx, search, financeAll]);

    // Групуємо по днях
    const days = useMemo(() => {
        const out = [];
        items.forEach(it => {
            const key = new Date(it.r.created_at).toDateString();
            const last = out[out.length - 1];
            if (last && last.key === key) last.items.push(it);
            else out.push({ key, label: dayLabel(it.r.created_at), items: [it] });
        });
        return out;
    }, [items]);

    return (
        <Layout>
            <div className="max-w-[1100px] mx-auto p-3 sm:p-6 space-y-4 text-slate-800">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight mr-auto">Журнал змін</h1>
                    <SearchInput value={search} onChange={setSearch} placeholder="Номер обʼєкта, людина, поле…" className="w-full sm:w-72 order-last sm:order-none" />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                    {groups.map(g => (
                        <button key={g.key} type="button" onClick={() => setGroup(g.key)}
                            className={`flex-shrink-0 h-8 px-3 rounded-full border text-[12.5px] font-semibold transition-colors
                                ${group === g.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                            {g.label}
                        </button>
                    ))}
                </div>

                <div className={`${T.card} overflow-hidden`}>
                    {loading && !rows.length ? <Skeleton rows={8} /> : days.length === 0 ? (
                        <EmptyState icon={FaHistory} title="Змін ще немає"
                            hint="Журнал почав вестися з 16.10.2026: тут зʼявлятиметься кожна зміна вартості, статусу, етапу, платежів, цін і доступів." />
                    ) : (
                        <div>
                            {days.map(day => (
                                <div key={day.key}>
                                    <div className="px-4 py-2 bg-slate-50 border-y border-slate-100 text-[12.5px] font-semibold text-slate-500 first-letter:uppercase sticky top-0">{day.label}</div>
                                    <ul className="divide-y divide-slate-100">
                                        {day.items.map(({ r, d }) => (
                                            <li key={r.id} className="px-4 py-3 flex gap-3">
                                                <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                                                    <FaUserTie size={12} />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-baseline gap-2 flex-wrap">
                                                        <span className="text-[13.5px] text-slate-700">
                                                            <b className="text-slate-900">{r.actor_name || 'Система'}</b> {d.verb} {d.subject}
                                                        </span>
                                                        <span className="text-[11.5px] text-slate-400 tabular-nums ml-auto">
                                                            {new Date(r.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                                                            {' · '}{TABLE_LABELS[r.table_name] || r.table_name}
                                                        </span>
                                                    </div>
                                                    <ul className="mt-0.5 text-[12.5px] text-slate-600 space-y-0.5">
                                                        {d.lines.map((l, i) => <li key={i} className="break-words">{l}</li>)}
                                                    </ul>
                                                </div>
                                                {r.installation_custom_id && (
                                                    <button type="button" onClick={() => navigate(`/project/${r.installation_custom_id}`)}
                                                        aria-label="Відкрити обʼєкт" title="Відкрити обʼєкт"
                                                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-slate-50 flex-shrink-0">
                                                        <FaArrowRight size={11} />
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                            {more && (
                                <div className="p-3 text-center border-t border-slate-100">
                                    <Btn variant="soft" onClick={() => load(rows.length)} disabled={loading}>Показати ще</Btn>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
