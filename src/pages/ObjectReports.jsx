// =====================================================================
//  K-CORE · Картка об'єкта → «Звіти монтажу»
//
//  Усі денні звіти бригад по цьому об'єкту (з додатка «Монтаж»), від
//  найновішого. Звіт розгортається тут же: хто надіслав і хто був у
//  бригаді, що зроблено, фото, коментар, скільки кабелю пішло, плани й
//  що просять на завтра (з наявністю на складі), доповнення від бригади.
//  Гроші, отримані від клієнта, видно лише тим, хто бачить фінанси цього
//  об'єкта, — там же кнопка «Внести в платежі».
//  Посилання з дзвіночка: ?tab=reports&r=<id> — одразу розгорнутий звіт.
//  Окремої сторінки звітів немає: усе про об'єкт — в його картці.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    FaChevronDown, FaChevronUp, FaMoneyBillWave, FaExclamationTriangle, FaCheck, FaUsers, FaClipboardCheck, FaCamera,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, Linkify, useToast, humanError } from '../ui';
import { getTask } from '../domain/stages';
import { loadUsdRate } from '../utils/settings';
import { DEFAULT_CURRENCY, canSeeMoney } from '../domain/objects';
import { DAY_STATUS_LABEL, CURRENCY_SIGN, fmtAmount, fmtQty, driveThumb } from '../montazh/report';

const dayTitle = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const timeOf = (ts) => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

export default function ObjectReports({ project }) {
    const auth = useAuth();
    const [params, setParams] = useSearchParams();
    const [rows, setRows] = useState(null);
    const [people, setPeople] = useState({ byId: new Map(), byCustom: new Map() });
    const [stock, setStock] = useState(new Map());
    const [open, setOpen] = useState(() => (params.get('r') ? Number(params.get('r')) : null));
    const money = canSeeMoney(auth, project);
    const objId = project.custom_id;

    // Посилання з дзвіночка відкрили — прибираємо ?r з адреси, звіт лишається розгорнутим
    useEffect(() => {
        if (!params.get('r')) return;
        const p = new URLSearchParams(params); p.delete('r'); setParams(p, { replace: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = useCallback(async () => {
        const [reps, emps] = await Promise.all([
            supabase.from('installer_reports')
                .select('*, usage:installer_report_usage(id, name, quantity, unit), needs:installer_report_needs(id, nomenclature_id, name, quantity, unit), addons:installer_report_addons(id, author_id, text, photos, photo_file_ids, created_at)')
                .eq('installation_custom_id', objId).not('submitted_at', 'is', null)
                .order('work_date', { ascending: false }).order('submitted_at', { ascending: false }),
            supabase.from('employees').select('id, custom_id, name, tier'),
        ]);
        const list = reps.data || [];
        const needIds = [...new Set(list.flatMap(r => (r.needs || []).map(n => n.nomenclature_id)).filter(Boolean))];
        const { data: st } = needIds.length
            ? await supabase.from('v_pick_nomenclature').select('id, available, unit').in('id', needIds)
            : { data: [] };
        setPeople({
            byId: new Map((emps.data || []).map(p => [p.id, p])),
            byCustom: new Map((emps.data || []).map(p => [p.custom_id, p])),
        });
        setStock(new Map((st || []).map(s => [s.id, s])));
        setRows(list);
    }, [objId]);

    useEffect(() => { load(); }, [load]);

    // Бригада надіслала звіт чи доповнення — тут одразу
    useEffect(() => {
        let t;
        const bump = () => { clearTimeout(t); t = setTimeout(load, 500); };
        const ch = supabase.channel(`object-reports-${objId}`);
        ['installer_reports', 'installer_report_addons'].forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
        ch.subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load, objId]);

    if (rows === null) return <div className={`${T.card} p-6 text-center text-[13px] text-slate-400`}>Завантаження…</div>;
    if (!rows.length) {
        return (
            <div className={`${T.card} p-8 text-center`}>
                <FaClipboardCheck className="text-slate-300 text-3xl mx-auto mb-2" />
                <div className="text-[14px] font-semibold text-slate-700">Звітів монтажу ще немає</div>
                <div className="text-[12.5px] text-slate-500 mt-1">Їх надсилає бригада з «Монтажу» в дні, коли стоїть на цьому об'єкті в графіку.</div>
            </div>
        );
    }

    const moneyOpen = money ? rows.filter(r => r.money_amount != null && !r.money_payment_id).length : 0;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Chip>звітів: {rows.length}</Chip>
                {moneyOpen > 0 && <Chip tone="accent" icon={FaMoneyBillWave}>гроші не внесено: {moneyOpen}</Chip>}
            </div>
            <div className={`${T.card} divide-y divide-slate-100 overflow-hidden`}>
                {rows.map(r => {
                    const isOpen = open === r.id;
                    const author = people.byId.get(r.author_id);
                    const marked = Object.entries(r.done_stages || {}).filter(([, s]) => s);
                    const photoN = (r.photos || []).length + (r.addons || []).reduce((n, a) => n + (a.photos || []).length, 0);
                    return (
                        <div key={r.id}>
                            <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}
                                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-slate-50">
                                <div className="min-w-0 flex-1">
                                    <div className="text-[14px] font-bold text-slate-900 first-letter:uppercase">{dayTitle(r.work_date)}</div>
                                    <div className="text-[12.5px] text-slate-500">{[author?.name, `надіслано о ${timeOf(r.submitted_at)}`].filter(Boolean).join(' · ')}</div>
                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                        {marked.map(([k, s]) => <Chip key={k} tone={s === 'completed' ? 'ok' : 'warn'}>{getTask(k)?.short || k}{s === 'completed' ? ' ✓' : ' · в роботі'}</Chip>)}
                                        {photoN > 0 && <Chip icon={FaCamera}>{photoN}</Chip>}
                                        {r.day_status && r.day_status !== 'ok' && <Chip tone="danger" icon={FaExclamationTriangle}>{DAY_STATUS_LABEL[r.day_status]}</Chip>}
                                        {money && r.money_amount != null && (
                                            <Chip tone={r.money_payment_id ? 'ok' : 'accent'} icon={FaMoneyBillWave}>
                                                {fmtAmount(r.money_amount)} {CURRENCY_SIGN[r.money_currency]}{r.money_payment_id ? ' · внесено' : ''}
                                            </Chip>
                                        )}
                                        {r.needs?.length > 0 && <Chip tone="warn">на завтра: {r.needs.length} поз.</Chip>}
                                    </div>
                                </div>
                                {isOpen ? <FaChevronUp size={11} className="text-slate-400 mt-1.5" /> : <FaChevronDown size={11} className="text-slate-400 mt-1.5" />}
                            </button>
                            {isOpen && <ReportDetails r={r} project={project} people={people} stock={stock} money={money} me={auth.employee} onChanged={load} />}
                        </div>
                    );
                })}
            </div>
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

function ReportDetails({ r, project, people, stock, money, me, onChanged }) {
    const marked = Object.entries(r.done_stages || {}).filter(([, s]) => s);
    const crew = (r.crew || []).map(id => people.byCustom.get(id)).filter(Boolean)
        .map(p => `${p.name}${Number(p.tier) === 1 ? ' (бригадир)' : ''}`);
    return (
        <div className="px-4 pb-4 pt-1 space-y-3 bg-slate-50/60 border-t border-slate-100">
            {crew.length > 0 && (
                <div className="pt-2 text-[12.5px] text-slate-600 inline-flex items-start gap-1.5"><FaUsers size={11} className="mt-0.5 flex-shrink-0" /> {crew.join(', ')}</div>
            )}
            {marked.length > 0 && (
                <Block title="Що зроблено">
                    <div className="flex flex-wrap gap-1.5">
                        {marked.map(([k, s]) => <Chip key={k} tone={s === 'completed' ? 'ok' : 'warn'}>{getTask(k)?.title || k}{s === 'completed' ? ' — готово' : ' — в роботі'}</Chip>)}
                    </div>
                </Block>
            )}
            {r.comment && <Block title="Коментар"><p className="text-[13.5px] text-slate-800 whitespace-pre-line break-words"><Linkify>{r.comment}</Linkify></p></Block>}
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

            {money && r.money_amount != null && <MoneyBlock report={r} project={project} me={me} onChanged={onChanged} />}

            {(r.plan_tomorrow || r.need_tomorrow || r.needs?.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-3">
                    {r.plan_tomorrow && <Block title="Плани на наступний день"><p className="text-[13.5px] whitespace-pre-line break-words">{r.plan_tomorrow}</p></Block>}
                    {(r.need_tomorrow || r.needs?.length > 0) && (
                        <Block title="Просили на наступний день">
                            {r.needs?.length > 0 && (
                                <ul className="text-[13px] text-slate-700 divide-y divide-slate-100 bg-white rounded-lg border border-slate-200">
                                    {r.needs.map(n => {
                                        const s = n.nomenclature_id ? stock.get(n.nomenclature_id) : null;
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
function MoneyBlock({ report: r, project, me, onChanged }) {
    const toast = useToast();
    const objCurrency = project?.currency || DEFAULT_CURRENCY;
    const needsRate = r.money_currency !== objCurrency;
    const [rate, setRate] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!needsRate) return;
        loadUsdRate().then(r => setRate(r ? String(r) : ''));
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
                <div className="text-[20px] font-bold tabular-nums text-slate-900 leading-tight">{fmtAmount(r.money_amount)} {CURRENCY_SIGN[r.money_currency]}</div>
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
