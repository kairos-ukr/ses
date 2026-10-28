// =====================================================================
//  K-CORE · «Фінанси»: Борги і Надходження
//
//  Надходження показуються за період — типово останній місяць; період
//  змінюється кнопками (місяць / 3 місяці / рік / усе) або датами.
//  База віддає лише одну сторінку платежів (по 20), далі — гортаємо
//  сторінками, тож сторінка не вантажить усю історію одразу.
//  Новий платіж — форма над списком (PaymentForm), без вікна поверх.
//  Натиснули на платіж — під ним деталі: курс, спосіб, коментар, видалити.
// =====================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaPlus, FaCreditCard, FaQuestionCircle, FaCommentDots, FaChevronDown, FaTrash, FaExternalLinkAlt } from 'react-icons/fa';

import { supabase } from './supabaseClient';
import Layout from './Layout';
import { useAuth } from './AuthProvider';
import { T, Btn, SearchInput, Skeleton, Pagination, Linkify, useToast, humanError } from './ui';
import { CURRENCIES, DEFAULT_CURRENCY, formatMoney } from './domain/objects';
import { hasPaymentSchedule } from './utils/features';
import ReceivablesPanel from './pages/ReceivablesPanel';
import PaymentForm, { methodLabel } from './pages/PaymentForm';
import UsdRateEditor from './pages/UsdRateEditor';

const PAGE = 20;
const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const monthsAgo = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n); return isoDay(d); };
const fmtDate = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('uk-UA') : '');

const PERIODS = [
    { k: 'm1', l: 'Місяць', from: () => monthsAgo(1) },
    { k: 'm3', l: '3 місяці', from: () => monthsAgo(3) },
    { k: 'y1', l: 'Рік', from: () => monthsAgo(12) },
    { k: 'all', l: 'Усе', from: () => '' },
];

const SELECT = 'id, installation_custom_id, client_id, amount, currency, exchange_rate, amount_object, paid_at, payment_method, comment, created_at, '
    + 'installation:installations(custom_id, name, currency, total_cost, paid_amount, client:clients(name, company_name)), '
    + 'client:clients(id, custom_id, name, company_name)';

const payCur = (p) => p.currency || p.installation?.currency || DEFAULT_CURRENCY;
const totalsText = (by) => {
    const parts = CURRENCIES.filter(c => by[c.key]).map(c => formatMoney(by[c.key], c.key));
    return parts.length ? parts.join(' · ') : formatMoney(0, DEFAULT_CURRENCY);
};

/* Деталі платежу — під рядком */
function PaymentDetails({ p, onDelete }) {
    const [ask, setAsk] = useState(false);
    const inst = p.installation;
    const objCur = inst?.currency || DEFAULT_CURRENCY;
    const converted = payCur(p) !== objCur && p.amount_object != null;
    const debt = Math.max(0, (Number(inst?.total_cost) || 0) - (Number(inst?.paid_amount) || 0));
    return (
        <div className="px-4 pb-3.5 pt-1 bg-slate-50/70 border-t border-slate-100 space-y-2.5 text-[13px]">
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
                {converted && <><dt className="text-slate-500">Зараховано в угоду</dt><dd className="font-semibold text-slate-800 tabular-nums">{formatMoney(p.amount_object, objCur)}</dd></>}
                <dt className="text-slate-500">Курс</dt><dd className="font-semibold text-slate-800 tabular-nums">{p.exchange_rate ? `1 $ = ${Number(p.exchange_rate)} ₴` : 'не вказано'}</dd>
                <dt className="text-slate-500">Спосіб</dt><dd className="font-semibold text-slate-800">{methodLabel(p.payment_method)}</dd>
                {inst && <><dt className="text-slate-500">Борг по об'єкту</dt><dd className={`font-semibold tabular-nums ${debt > 0.009 ? 'text-rose-700' : 'text-emerald-700'}`}>{debt > 0.009 ? formatMoney(debt, objCur) : 'немає'}</dd></>}
                {p.comment && <><dt className="text-slate-500">Коментар</dt><dd className="text-slate-800 whitespace-pre-wrap break-words"><Linkify>{p.comment}</Linkify></dd></>}
            </dl>
            <div className="flex flex-wrap items-center gap-2">
                {inst && (
                    <a href={`#/project/${inst.custom_id}`} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:border-slate-300">
                        <FaExternalLinkAlt size={10} /> Картка об'єкта
                    </a>
                )}
                {p.client?.custom_id && (
                    <a href={`#/clients/${p.client.custom_id}`} className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 inline-flex items-center gap-1.5 hover:border-slate-300">
                        <FaExternalLinkAlt size={10} /> Картка клієнта
                    </a>
                )}
                {onDelete && (ask ? (
                    <span className="inline-flex items-center gap-1.5">
                        <span className="text-[12.5px] font-semibold text-rose-700">Видалити платіж?</span>
                        <Btn size="sm" variant="danger" onClick={() => onDelete(p)}>Так</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setAsk(false)}>Ні</Btn>
                    </span>
                ) : (
                    <Btn size="sm" variant="ghost" icon={FaTrash} className="hover:!text-rose-600" onClick={() => setAsk(true)}>Видалити</Btn>
                ))}
            </div>
        </div>
    );
}

function Payments({ employeeId }) {
    const toast = useToast();
    const { can } = useAuth();   // Доступи → «Платежі й борги»: додавати, видаляти
    const [periodKey, setPeriodKey] = useState('m1');
    const [range, setRange] = useState(() => ({ from: monthsAgo(1), to: '' }));
    const [search, setSearch] = useState('');
    const [q, setQ] = useState('');
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState(null);
    const [total, setTotal] = useState(0);
    const [sums, setSums] = useState({});
    const [objects, setObjects] = useState([]);
    const [clients, setClients] = useState([]);
    const [adding, setAdding] = useState(false);
    const [open, setOpen] = useState(null);
    const listTop = useRef(null);

    // Легкі списки об'єктів і клієнтів: для пошуку й для форми платежу
    useEffect(() => {
        supabase.from('installations').select('custom_id, name, currency, client:clients(name, company_name)').order('custom_id', { ascending: false })
            .then(({ data }) => setObjects(data || []));
        supabase.from('clients').select('id, custom_id, name, company_name, phone').order('name')
            .then(({ data }) => setClients(data || []));
    }, []);

    useEffect(() => { const t = setTimeout(() => setQ(search.trim().toLowerCase().replace(/^сес-?/, '')), 300); return () => clearTimeout(t); }, [search]);
    useEffect(() => { setPage(1); }, [q, range]);

    // Пошук: об'єкти й клієнти, що підходять, → платежі по них
    const ids = useMemo(() => {
        if (!q) return null;
        const has = (vals) => vals.some(v => v != null && String(v).toLowerCase().includes(q));
        return {
            objects: objects.filter(o => has([o.custom_id, o.name, o.client?.name, o.client?.company_name])).map(o => o.custom_id),
            clients: clients.filter(c => has([c.name, c.company_name, c.phone])).map(c => c.id),
        };
    }, [q, objects, clients]);

    const load = useCallback(async () => {
        if (ids && !ids.objects.length && !ids.clients.length) { setRows([]); setTotal(0); setSums({}); return; }
        const filter = (query) => {
            let x = query;
            if (range.from) x = x.gte('paid_at', range.from);
            if (range.to) x = x.lte('paid_at', range.to);
            if (ids) {
                const parts = [];
                if (ids.objects.length) parts.push(`installation_custom_id.in.(${ids.objects.slice(0, 300).join(',')})`);
                if (ids.clients.length) parts.push(`client_id.in.(${ids.clients.slice(0, 300).join(',')})`);
                x = x.or(parts.join(','));
            }
            return x;
        };
        const from = (page - 1) * PAGE;
        const [list, money] = await Promise.all([
            filter(supabase.from('payment_history').select(SELECT, { count: 'exact' }))
                .order('paid_at', { ascending: false }).order('id', { ascending: false })
                .range(from, from + PAGE - 1),
            filter(supabase.from('payment_history').select('amount, currency, installation:installations(currency)')),
        ]);
        if (list.error) { toast(humanError(list.error), 'error'); setRows([]); return; }
        setRows(list.data || []);
        setTotal(list.count || 0);
        const by = {};
        (money.data || []).forEach(p => { const c = payCur(p); by[c] = (by[c] || 0) + (Number(p.amount) || 0); });
        setSums(by);
    }, [ids, range, page, toast]);

    useEffect(() => { setRows(null); load(); }, [load]);

    const pickPeriod = (p) => { setPeriodKey(p.k); setRange({ from: p.from(), to: '' }); };
    const setDates = (patch) => { setPeriodKey('custom'); setRange(r => ({ ...r, ...patch })); };
    const goPage = (n) => { setPage(n); setOpen(null); listTop.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); };

    const remove = async (p) => {
        const { error } = await supabase.from('payment_history').delete().eq('id', p.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast("Платіж видалено — «оплачено» по об'єкту перераховано", 'info');
        setOpen(null);
        load();
    };

    const pages = Math.max(1, Math.ceil(total / PAGE));

    return (
        <div className="space-y-3">
            {/* Новий платіж — тут же, над списком */}
            {!can('payments', 'add') ? null : adding ? (
                <div className={`${T.card} p-4 sm:p-5`}>
                    <h2 className="text-[16px] font-bold text-slate-900 mb-3">Новий платіж</h2>
                    <PaymentForm objects={objects} clients={clients} employeeId={employeeId}
                        onCancel={() => setAdding(false)}
                        onSaved={() => { setAdding(false); setPage(1); load(); }} />
                </div>
            ) : (
                <button type="button" onClick={() => setAdding(true)}
                    className="w-full h-12 px-4 rounded-xl border border-dashed border-emerald-300 bg-white text-left text-[14px] font-semibold text-emerald-700 hover:bg-emerald-50 inline-flex items-center gap-2.5">
                    <FaPlus size={11} /> Новий платіж…
                </button>
            )}

            {/* Період, пошук, підсумок */}
            <div className={`${T.card} p-3 space-y-2.5`}>
                <div className="flex flex-wrap items-center gap-1.5">
                    {PERIODS.map(p => (
                        <button key={p.k} type="button" onClick={() => pickPeriod(p)}
                            className={`h-9 px-3 rounded-lg border text-[12.5px] font-semibold ${periodKey === p.k ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {p.l}
                        </button>
                    ))}
                    <span className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-1">
                        <input type="date" value={range.from} onChange={e => setDates({ from: e.target.value })} aria-label="З дати"
                            className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-slate-200 bg-white text-[12.5px]" />
                        <span className="text-slate-400">—</span>
                        <input type="date" value={range.to} onChange={e => setDates({ to: e.target.value })} aria-label="По дату"
                            className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-slate-200 bg-white text-[12.5px]" />
                    </span>
                </div>
                <SearchInput value={search} onChange={setSearch} placeholder="Об'єкт: номер, назва, клієнт…" />
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 pt-0.5">
                    <span className="text-[13px] text-slate-500">Надійшло за період: <b className="text-[16px] text-emerald-700 tabular-nums">{totalsText(sums)}</b></span>
                    <span className="text-[13px] text-slate-500">Платежів: <b className="text-slate-800 tabular-nums">{total}</b></span>
                </div>
            </div>

            {/* Платежі */}
            <div ref={listTop} className="scroll-mt-3">
                {rows === null ? (
                    <div className={T.card}><Skeleton rows={5} /></div>
                ) : rows.length === 0 ? (
                    <div className={`${T.card} px-4 py-10 text-center`}>
                        <div className="text-[14px] font-semibold text-slate-600">За цей період платежів немає</div>
                        {periodKey !== 'all' && (
                            <button type="button" onClick={() => pickPeriod(PERIODS[PERIODS.length - 1])} className="mt-1.5 text-[13px] font-semibold text-indigo-600 hover:underline">Показати за весь час</button>
                        )}
                    </div>
                ) : (
                    <div className={`${T.card} overflow-hidden`}>
                        <ul className="divide-y divide-slate-100">
                            {rows.map(p => {
                                const inst = p.installation;
                                const isOpen = open === p.id;
                                return (
                                    <li key={p.id}>
                                        <button type="button" onClick={() => setOpen(o => (o === p.id ? null : p.id))} aria-expanded={isOpen}
                                            className={`w-full text-left px-4 py-3 flex items-start gap-3 ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-baseline gap-x-2">
                                                    <span className="text-[15px] font-bold text-emerald-700 tabular-nums">{formatMoney(Number(p.amount), payCur(p))}</span>
                                                    <span className="text-[12.5px] text-slate-500 tabular-nums">{fmtDate(p.paid_at)}</span>
                                                    {p.exchange_rate && <span className="text-[12px] text-slate-400 tabular-nums">· курс {Number(p.exchange_rate)}</span>}
                                                </div>
                                                <div className="text-[13px] text-slate-700 break-words">
                                                    {inst
                                                        ? <><span className="font-mono text-[11px] text-slate-400 mr-1">СЕС-{inst.custom_id}</span>{inst.client?.company_name || inst.client?.name || inst.name}</>
                                                        : <><span className="text-[11px] font-semibold text-indigo-600 mr-1">клієнт</span>{p.client?.company_name || p.client?.name || '—'}</>}
                                                </div>
                                                {p.comment && !isOpen && (
                                                    <div className="text-[12px] text-slate-500 break-words line-clamp-1"><FaCommentDots size={10} className="inline mr-1.5 -mt-0.5" />{p.comment}</div>
                                                )}
                                            </div>
                                            <span className="hidden sm:inline text-[12px] text-slate-500 mt-1">{methodLabel(p.payment_method)}</span>
                                            <FaChevronDown size={10} className={`mt-2 text-slate-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                        {isOpen && <PaymentDetails p={p} onDelete={can('payments', 'delete') ? remove : null} />}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>

            {total > PAGE && (
                <Pagination page={page} pages={pages} total={total}
                    from={(page - 1) * PAGE + 1} to={Math.min(page * PAGE, total)} onPage={goPage} />
            )}
        </div>
    );
}

export default function PaymentsPage() {
    const { can, loading: authLoading, employee } = useAuth();
    const isOffice = can('payments');   // Доступи → «Платежі й борги»
    const [scheduleReady, setScheduleReady] = useState(false);
    useEffect(() => { hasPaymentSchedule().then(setScheduleReady); }, []);
    const [params, setParams] = useSearchParams();
    const tab = scheduleReady && params.get('tab') !== 'payments' ? 'debts' : 'payments';

    if (!authLoading && !isOffice) {
        return (
            <Layout>
                <div className="flex flex-col items-center justify-center h-full py-24 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                        <FaQuestionCircle className="text-2xl text-slate-400" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-700">Немає доступу</h2>
                    <p className="text-sm text-slate-400 mt-1 max-w-sm">Розділ «Платежі» бачать офіс-менеджери та адміністратори.</p>
                </div>
            </Layout>
        );
    }

    return (
        <Layout>
            <div className="p-3 sm:p-6 space-y-3 max-w-[1100px] mx-auto pb-24 lg:pb-8">
                <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight inline-flex items-center gap-2 mr-auto">
                        <FaCreditCard className="text-emerald-600" size={20} /> Фінанси
                    </h1>
                    <UsdRateEditor compact />
                </div>

                {scheduleReady && (
                    <nav className="flex gap-1 border-b border-slate-200">
                        {[{ k: 'debts', l: 'Борги' }, { k: 'payments', l: 'Надходження' }].map(t => (
                            <button key={t.k} type="button"
                                onClick={() => setParams(t.k === 'debts' ? {} : { tab: t.k }, { replace: true })}
                                className={`px-3 h-10 text-[14px] border-b-2 -mb-px transition-colors ${tab === t.k ? 'border-indigo-600 text-indigo-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'}`}>
                                {t.l}
                            </button>
                        ))}
                    </nav>
                )}

                {tab === 'debts' && <ReceivablesPanel />}
                {tab === 'payments' && <Payments employeeId={employee?.id} />}
            </div>
        </Layout>
    );
}

