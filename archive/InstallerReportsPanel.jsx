// =====================================================================
//  K-CORE · «Працівники → Звіти» — денні звіти бригад
//
//  Що бачить офіс за обраний день:
//   • кожен об'єкт із графіка: звіт здано (о котрій), чернетка, чи ще
//     чекаємо; зверху — скільки здано, гроші від клієнтів, проблеми;
//   • звіт розгортається тут же: бригада, що зроблено, фото, коментар,
//     що використано, плани й потреби на завтра, доповнення від бригади;
//   • гроші, які бригада отримала від клієнта, — одним натиском у платежі
//     об'єкта (з курсом, якщо валюта інша, ніж у об'єкта).
//  Наживо: щойно бригада надіслала звіт — він тут.
//  Посилання з дзвіночка: ?tab=reports&r=<id> — відкриває день і звіт.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    FaChevronLeft, FaChevronRight, FaChevronDown, FaChevronUp, FaExternalLinkAlt, FaMoneyBillWave,
    FaExclamationTriangle, FaCheck, FaClock, FaUsers,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, useToast, humanError } from '../ui';
import { getTask } from '../domain/stages';
import { DEFAULT_CURRENCY } from '../domain/objects';
import { DAY_STATUS_LABEL, CURRENCY_SIGN, fmtAmount, fmtQty, driveThumb } from '../montazh/report';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shift = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const dayTitle = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const timeOf = (ts) => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
const objTitle = (o) => [o?.client?.populated_place, o?.client?.name || o?.name].filter(Boolean).join(', ') || o?.name || "Об'єкт";

export default function InstallerReportsPanel() {
    const { employee: me } = useAuth();
    const [params, setParams] = useSearchParams();
    const [date, setDate] = useState(isoDay());
    const [openId, setOpenId] = useState(() => (params.get('r') ? Number(params.get('r')) : null));
    const [data, setData] = useState(null);

    // Посилання з дзвіночка — відкрити день цього звіту
    useEffect(() => {
        const r = params.get('r');
        if (!r) return;
        supabase.from('installer_reports').select('work_date').eq('id', r).maybeSingle()
            .then(({ data: row }) => { if (row) setDate(row.work_date); });
        const p = new URLSearchParams(params); p.delete('r'); setParams(p, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(async () => {
        const [sched, reps, people] = await Promise.all([
            supabase.from('installation_workers').select('installation_custom_id, employee_custom_id')
                .eq('work_date', date).not('installation_custom_id', 'is', null),
            supabase.from('installer_reports')
                .select('*, usage:installer_report_usage(id, name, quantity, unit), needs:installer_report_needs(id, nomenclature_id, name, quantity, unit), addons:installer_report_addons(id, author_id, text, photos, photo_file_ids, created_at)')
                .eq('work_date', date),
            supabase.from('employees').select('id, custom_id, name, tier'),
        ]);
        const byObj = new Map();
        (sched.data || []).forEach(r => {
            if (!byObj.has(r.installation_custom_id)) byObj.set(r.installation_custom_id, []);
            const list = byObj.get(r.installation_custom_id);
            if (!list.includes(r.employee_custom_id)) list.push(r.employee_custom_id);
        });
        (reps.data || []).forEach(r => { if (!byObj.has(r.installation_custom_id)) byObj.set(r.installation_custom_id, r.crew || []); });
        const ids = [...byObj.keys()];
        // Наявність на складі для того, що бригади просять на завтра
        const needIds = [...new Set((reps.data || []).flatMap(r => (r.needs || []).map(n => n.nomenclature_id)).filter(Boolean))];
        const [{ data: objs }, { data: stock }] = await Promise.all([
            ids.length
                ? supabase.from('installations').select('custom_id, name, currency, client:clients(name, populated_place)').in('custom_id', ids)
                : Promise.resolve({ data: [] }),
            needIds.length
                ? supabase.from('v_pick_nomenclature').select('id, available, unit').in('id', needIds)
                : Promise.resolve({ data: [] }),
        ]);
        setData({
            rows: ids.map(id => ({ objId: id, crew: byObj.get(id), report: (reps.data || []).find(r => r.installation_custom_id === id) || null })),
            objects: new Map((objs || []).map(o => [o.custom_id, o])),
            stock: new Map((stock || []).map(s => [s.id, s])),
            byCustom: new Map((people.data || []).map(p => [p.custom_id, p])),
            byId: new Map((people.data || []).map(p => [p.id, p])),
        });
    }, [date]);

    useEffect(() => { setData(null); load(); }, [load]);

    useEffect(() => {
        let t;
        const bump = () => { clearTimeout(t); t = setTimeout(load, 500); };
        const ch = supabase.channel('office-installer-reports');
        ['installer_reports', 'installer_report_addons'].forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
        ch.subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load]);

    const rows = useMemo(() => {
        if (!data) return [];
        const rank = (r) => (r.report?.submitted_at ? 2 : r.report ? 1 : 0);
        return [...data.rows].sort((a, b) => rank(a) - rank(b) || objTitle(data.objects.get(a.objId)).localeCompare(objTitle(data.objects.get(b.objId)), 'uk'));
    }, [data]);

    const sent = rows.filter(r => r.report?.submitted_at);
    const money = sent.filter(r => r.report.money_amount != null);
    const moneyOpen = money.filter(r => !r.report.money_payment_id);
    const problems = sent.filter(r => r.report.day_status && r.report.day_status !== 'ok');
    const today = isoDay();

    return (
        <div className="max-w-4xl mx-auto p-3 sm:p-5 space-y-3">
            <div className={`${T.card} p-3 flex flex-wrap items-center gap-2`}>
                <div className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setDate(d => shift(d, -1))} aria-label="Попередній день"
                        className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50"><FaChevronLeft size={12} /></button>
                    <input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)}
                        className={`${T.input} w-auto`} aria-label="День" />
                    <button type="button" onClick={() => setDate(d => (d < today ? shift(d, 1) : d))} aria-label="Наступний день" disabled={date >= today}
                        className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"><FaChevronRight size={12} /></button>
                    {date !== today && <Btn variant="soft" onClick={() => setDate(today)}>Сьогодні</Btn>}
                </div>
                <div className="text-[14px] font-bold text-slate-900 first-letter:uppercase">{dayTitle(date)}</div>
                <div className="flex flex-wrap gap-1.5 sm:ml-auto">
                    {data && <Chip tone={rows.length && sent.length === rows.length ? 'ok' : 'warn'}>здано {sent.length} з {rows.length}</Chip>}
                    {moneyOpen.length > 0 && <Chip tone="accent" icon={FaMoneyBillWave}>гроші не внесено: {moneyOpen.length}</Chip>}
                    {problems.length > 0 && <Chip tone="danger" icon={FaExclamationTriangle}>проблеми: {problems.length}</Chip>}
                </div>
            </div>

            {!data ? (
                <div className={`${T.card} p-6 text-center text-[13px] text-slate-400`}>Завантаження…</div>
            ) : rows.length === 0 ? (
                <div className={`${T.card} p-6 text-center text-[13.5px] text-slate-500`}>У цей день у графіку немає об'єктів — і звітів немає</div>
            ) : (
                <div className={`${T.card} divide-y divide-slate-100 overflow-hidden`}>
                    {rows.map(r => (
                        <ReportRow key={r.objId} row={r} obj={data.objects.get(r.objId)} people={data} me={me}
                            open={!!r.report && openId === r.report.id} onToggle={() => setOpenId(o => (r.report && o !== r.report.id ? r.report.id : null))}
                            onChanged={load} />
                    ))}
                </div>
            )}
        </div>
    );
}

function ReportRow({ row, obj, people, me, open, onToggle, onChanged }) {
    const r = row.report;
    const crewNames = (row.crew || []).map(id => people.byCustom.get(id)).filter(Boolean)
        .map(p => `${p.name}${Number(p.tier) === 1 ? ' (бригадир)' : ''}`);
    const status = r?.submitted_at
        ? <Chip tone="ok" icon={FaCheck}>здано о {timeOf(r.submitted_at)}</Chip>
        : r ? <Chip tone="warn" icon={FaClock}>чернетка</Chip>
            : <Chip tone="neutral" icon={FaClock}>чекаємо</Chip>;

    return (
        <div>
            <button type="button" onClick={onToggle} disabled={!r?.submitted_at && !r} aria-expanded={open}
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50 disabled:hover:bg-white disabled:cursor-default">
                <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-slate-900 break-words">{objTitle(obj)} <span className="font-mono text-[11px] text-slate-400">СЕС-{row.objId}</span></div>
                    <div className="text-[12.5px] text-slate-500 break-words inline-flex items-start gap-1.5 mt-0.5"><FaUsers size={11} className="mt-0.5 flex-shrink-0" />{crewNames.join(', ') || '—'}</div>
                    {r?.submitted_at && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {r.photos?.length > 0 && <Chip>{r.photos.length} фото</Chip>}
                            {r.money_amount != null && (
                                <Chip tone={r.money_payment_id ? 'ok' : 'accent'} icon={FaMoneyBillWave}>
                                    {fmtAmount(r.money_amount)} {CURRENCY_SIGN[r.money_currency]}{r.money_payment_id ? ' · внесено' : ''}
                                </Chip>
                            )}
                            {r.day_status && r.day_status !== 'ok' && <Chip tone="danger" icon={FaExclamationTriangle}>{DAY_STATUS_LABEL[r.day_status]}</Chip>}
                            {r.needs?.length > 0 && <Chip tone="warn">на завтра: {r.needs.length} поз.</Chip>}
                            {r.addons?.length > 0 && <Chip tone="info">+{r.addons.length} від бригади</Chip>}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {status}
                    {r && (open ? <FaChevronUp size={11} className="text-slate-400" /> : <FaChevronDown size={11} className="text-slate-400" />)}
                </div>
            </button>
            {open && r && <ReportDetails report={r} obj={obj} people={people} me={me} onChanged={onChanged} />}
        </div>
    );
}

function Photos({ photos, fileIds }) {
    if (!photos?.length) return null;
    return (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
            {photos.map((url, i) => {
                const fid = (fileIds || [])[i];
                return (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                        {fid && <img src={driveThumb(fid, 300)} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                    </a>
                );
            })}
        </div>
    );
}

const Block = ({ title, children }) => (
    <div>
        <div className={`${T.label} mb-1`}>{title}</div>
        {children}
    </div>
);

function ReportDetails({ report: r, obj, people, me, onChanged }) {
    const marked = Object.entries(r.done_stages || {}).filter(([, s]) => s);
    const author = people.byId.get(r.author_id);
    return (
        <div className="px-4 pb-4 pt-1 space-y-3 bg-slate-50/60 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <span className="text-[12.5px] text-slate-500">Надіслав: <b className="text-slate-800">{author?.name || '—'}</b></span>
                <a href={`#/project/${r.installation_custom_id}`} className="text-[12.5px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">
                    Картка об'єкта <FaExternalLinkAlt size={9} />
                </a>
            </div>

            {marked.length > 0 && (
                <Block title="Що зроблено">
                    <div className="flex flex-wrap gap-1.5">
                        {marked.map(([k, s]) => <Chip key={k} tone={s === 'completed' ? 'ok' : 'warn'}>{getTask(k)?.title || k}{s === 'completed' ? ' — готово' : ' — в роботі'}</Chip>)}
                    </div>
                </Block>
            )}
            {r.comment && <Block title="Коментар"><p className="text-[13.5px] text-slate-800 whitespace-pre-line break-words">{r.comment}</p></Block>}
            {r.photos?.length > 0 && <Block title={`Фото · ${r.photos.length}`}><Photos photos={r.photos} fileIds={r.photo_file_ids} /></Block>}

            {r.usage?.length > 0 && (
                <Block title="Кабель використано">
                    <ul className="text-[13px] text-slate-700 divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                        {r.usage.map(u => (
                            <li key={u.id} className="px-3 py-1.5 flex justify-between gap-3">
                                <span className="break-words min-w-0">{u.name}</span>
                                <b className="tabular-nums whitespace-nowrap">{fmtQty(u.quantity)} {u.unit || ''}</b>
                            </li>
                        ))}
                    </ul>
                </Block>
            )}

            {r.money_amount != null && <MoneyBlock report={r} obj={obj} me={me} onChanged={onChanged} />}

            {(r.plan_tomorrow || r.need_tomorrow || r.needs?.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-3">
                    {r.plan_tomorrow && <Block title="Плани на завтра"><p className="text-[13.5px] whitespace-pre-line break-words">{r.plan_tomorrow}</p></Block>}
                    {(r.need_tomorrow || r.needs?.length > 0) && (
                        <Block title="Потрібно на завтра">
                            {r.needs?.length > 0 && (
                                <ul className="text-[13px] text-slate-700 divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                                    {r.needs.map(n => {
                                        const s = n.nomenclature_id ? people.stock?.get(n.nomenclature_id) : null;
                                        const have = Number(s?.available || 0);
                                        return (
                                            <li key={n.id} className="px-3 py-1.5 flex items-start justify-between gap-3">
                                                <span className="min-w-0 break-words">
                                                    <span className="font-semibold text-slate-900">{n.name}</span>
                                                    <span className={`block text-[11.5px] ${!n.nomenclature_id ? 'text-slate-400' : have > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                        {!n.nomenclature_id ? 'вписано вручну' : have > 0 ? `на складі ${fmtQty(have)} ${s.unit || ''}` : 'на складі немає'}
                                                    </span>
                                                </span>
                                                {n.quantity != null && <b className="tabular-nums whitespace-nowrap">{fmtQty(n.quantity)} {n.unit || ''}</b>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                            {r.need_tomorrow && <p className={`text-[13.5px] whitespace-pre-line break-words font-semibold text-slate-900 ${r.needs?.length ? 'mt-1.5' : ''}`}>{r.need_tomorrow}</p>}
                        </Block>
                    )}
                </div>
            )}

            {r.addons?.length > 0 && (
                <Block title="Від бригади">
                    <div className="space-y-2">
                        {r.addons.map(a => (
                            <div key={a.id} className="bg-white rounded-lg border border-slate-200 p-2.5">
                                <div className="text-[12px] font-bold text-slate-600">{people.byId.get(a.author_id)?.name || '—'} · {timeOf(a.created_at)}</div>
                                {a.text && <p className="text-[13px] text-slate-800 whitespace-pre-line break-words">{a.text}</p>}
                                {a.photos?.length > 0 && <div className="mt-1.5"><Photos photos={a.photos} fileIds={a.photo_file_ids} /></div>}
                            </div>
                        ))}
                    </div>
                </Block>
            )}
        </div>
    );
}

/* Гроші від клієнта → у платежі об'єкта */
function MoneyBlock({ report: r, obj, me, onChanged }) {
    const toast = useToast();
    const objCurrency = obj?.currency || DEFAULT_CURRENCY;
    const needsRate = r.money_currency !== objCurrency;
    const [rate, setRate] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!needsRate) return;
        supabase.from('app_settings').select('value').eq('key', 'usd_uah_rate').maybeSingle()
            .then(({ data }) => setRate(String(data?.value?.rate || '')));
    }, [needsRate]);

    const confirm = async () => {
        const rt = parseFloat(String(rate).replace(',', '.'));
        if (needsRate && !(rt > 0)) { toast('Вкажіть курс: скільки гривень за 1 долар', 'error'); return; }
        setBusy(true);
        try {
            const { data: pay, error } = await supabase.from('payment_history').insert({
                installation_custom_id: r.installation_custom_id,
                amount: Number(r.money_amount),
                currency: r.money_currency,
                exchange_rate: needsRate ? rt : null,
                paid_at: r.work_date,
                payment_method: 'Готівка через бригаду',
                comment: ['Звіт монтажу', r.money_note].filter(Boolean).join(': '),
                created_by: me?.id || null,
            }).select('id').single();
            if (error) throw error;
            const { error: e2 } = await supabase.from('installer_reports').update({ money_payment_id: pay.id }).eq('id', r.id);
            if (e2) throw e2;
            toast('Платіж внесено — «Оплачено» по об\'єкту перераховано', 'success');
            onChanged();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    return (
        <Block title="Гроші від клієнта">
            <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0">
                    <div className="text-[20px] font-bold tabular-nums text-slate-900 leading-tight">{fmtAmount(r.money_amount)} {CURRENCY_SIGN[r.money_currency]}</div>
                    {r.money_note && <div className="text-[12.5px] text-slate-500 break-words">{r.money_note}</div>}
                </div>
                <div className="sm:ml-auto flex flex-wrap items-center gap-2">
                    {r.money_payment_id ? (
                        <Chip tone="ok" icon={FaCheck}>внесено в платежі</Chip>
                    ) : (<>
                        {needsRate && (
                            <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
                                курс
                                <input value={rate} onChange={e => setRate(e.target.value)} inputMode="decimal" className={`${T.input} w-20`} />
                                ₴ за $
                            </label>
                        )}
                        <Btn variant="accent" icon={FaMoneyBillWave} onClick={confirm} disabled={busy}>{busy ? 'Вношу…' : 'Внести в платежі'}</Btn>
                    </>)}
                </div>
            </div>
        </Block>
    );
}
