// =====================================================================
//  K-CORE · Монтаж — надіслані звіти: список із розгортанням
//
//  • У картці об'єкта (вкладка «Звіти») — усі звіти по цьому об'єкту:
//    хто, коли, що зроблено, фото, кабель, що просили на завтра.
//  • «Мої звіти» — звіти бригад, у яких була ця людина, по всіх об'єктах.
//  Суму, отриману від клієнта, видно лише у власних звітах (де людина
//  була в бригаді): по об'єкту загалом гроші не показуємо.
// =====================================================================

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChevronDown, FaChevronUp, FaArrowRight, FaCamera } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { Linkify } from '../ui';
import { useMontazh, relDay, fmtDay, loadObjects, objectTitle } from './data';
import { REPORT_STAGES, DAY_STATUS_LABEL, CURRENCY_SIGN, fmtAmount, fmtQty, driveThumb } from './report';
import { Card, Label, Pill, Empty, Loading } from './kit';

const STAGE_SHORT = Object.fromEntries(REPORT_STAGES.map(t => [t.key, t.short]));
const timeOf = (ts) => new Date(ts).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

export default function ReportHistory({ objId, mine, limit = 40 }) {
    const { who, people } = useMontazh();
    const [rows, setRows] = useState(null);
    const [objects, setObjects] = useState(new Map());
    const [open, setOpen] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            let q = supabase.from('installer_reports')
                .select('*, usage:installer_report_usage(id, name, quantity, unit), needs:installer_report_needs(id, name, quantity, unit), addons:installer_report_addons(id, author_id, text, photos, photo_file_ids, created_at)')
                .not('submitted_at', 'is', null)
                .order('work_date', { ascending: false }).order('submitted_at', { ascending: false })
                .limit(limit);
            if (objId) q = q.eq('installation_custom_id', objId);
            if (mine) q = q.contains('crew', [who.custom_id]);
            const { data } = await q;
            const list = data || [];
            const objMap = mine ? await loadObjects(list.map(r => r.installation_custom_id)) : new Map();
            if (!alive) return;
            setObjects(objMap);
            setRows(list);
        })();
        return () => { alive = false; };
    }, [objId, mine, limit, who.custom_id]);

    if (rows === null) return <Loading />;
    if (!rows.length) return <Card><Empty>{mine ? 'Ви ще не надсилали звітів' : 'Звітів по цьому об\'єкту ще немає'}</Empty></Card>;

    const byId = (id) => [...people.values()].find(p => p.id === id);

    return rows.map(r => {
        const isOpen = open === r.id;
        const marked = Object.entries(r.done_stages || {}).filter(([, s]) => s);
        const author = byId(r.author_id);
        const showMoney = (r.crew || []).includes(who.custom_id);
        const photoN = (r.photos || []).length + (r.addons || []).reduce((n, a) => n + (a.photos || []).length, 0);
        return (
            <Card key={r.id} className="!p-0 overflow-hidden">
                <button type="button" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}
                    className="w-full text-left px-3.5 py-3 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold text-slate-900 first-letter:uppercase">
                            {relDay(r.work_date)}{mine ? <span className="font-semibold text-slate-600"> · {objectTitle(objects.get(r.installation_custom_id))}</span> : null}
                        </div>
                        <div className="text-[13px] text-slate-500">{[author?.name, `о ${timeOf(r.submitted_at)}`].filter(Boolean).join(' · ')}</div>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {marked.map(([k, s]) => (
                                <Pill key={k} tone={s === 'completed' ? 'ok' : 'warn'}>{STAGE_SHORT[k] || k}{s === 'completed' ? ' ✓' : ' · в роботі'}</Pill>
                            ))}
                            {r.day_status && r.day_status !== 'ok' && <Pill tone="bad">{DAY_STATUS_LABEL[r.day_status]}</Pill>}
                            {photoN > 0 && <Pill><FaCamera size={10} /> {photoN}</Pill>}
                        </div>
                    </div>
                    {isOpen ? <FaChevronUp size={13} className="text-slate-400 mt-1.5" /> : <FaChevronDown size={13} className="text-slate-400 mt-1.5" />}
                </button>
                {isOpen && <Details r={r} showMoney={showMoney} byId={byId} mine={mine} />}
            </Card>
        );
    });
}

function Thumbs({ photos, fileIds }) {
    if (!photos?.length) return null;
    return (
        <div className="grid grid-cols-4 gap-1.5">
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

function Details({ r, showMoney, byId, mine }) {
    const navigate = useNavigate();
    return (
        <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-100 flex flex-col gap-3">
            {r.comment && <p className="text-[15px] text-slate-800 whitespace-pre-line break-words pt-2"><Linkify>{r.comment}</Linkify></p>}
            {r.photos?.length > 0 && <Thumbs photos={r.photos} fileIds={r.photo_file_ids} />}

            {r.usage?.length > 0 && (
                <div>
                    <Label>Кабель</Label>
                    {r.usage.map(u => (
                        <div key={u.id} className="flex justify-between gap-3 py-1 text-[14.5px]">
                            <span className="min-w-0 break-words">{u.name}</span>
                            <b className="tabular-nums whitespace-nowrap">{fmtQty(u.quantity)} {u.unit || ''}</b>
                        </div>
                    ))}
                </div>
            )}

            {showMoney && r.money_amount != null && (
                <div>
                    <Label>Гроші від клієнта</Label>
                    <div className="flex items-center justify-between gap-2">
                        <b className="text-[18px] tabular-nums">{fmtAmount(r.money_amount)} {CURRENCY_SIGN[r.money_currency] || ''}</b>
                        <Pill tone={r.money_payment_id ? 'ok' : 'warn'}>{r.money_payment_id ? 'офіс вніс у платежі' : 'чекає офісу'}</Pill>
                    </div>
                </div>
            )}

            {r.plan_tomorrow && (
                <div><Label>Плани на наступний день</Label><p className="text-[14.5px] whitespace-pre-line break-words">{r.plan_tomorrow}</p></div>
            )}
            {(r.needs?.length > 0 || r.need_tomorrow) && (
                <div>
                    <Label>Просили на наступний день</Label>
                    {(r.needs || []).map(n => (
                        <div key={n.id} className="flex justify-between gap-3 py-1 text-[14.5px]">
                            <span className="min-w-0 break-words">{n.name}</span>
                            {n.quantity != null && <b className="tabular-nums whitespace-nowrap">{fmtQty(n.quantity)} {n.unit || ''}</b>}
                        </div>
                    ))}
                    {r.need_tomorrow && <p className="text-[14.5px] whitespace-pre-line break-words">{r.need_tomorrow}</p>}
                </div>
            )}

            {r.addons?.length > 0 && (
                <div>
                    <Label>Від бригади</Label>
                    <div className="flex flex-col gap-2">
                        {r.addons.map(a => (
                            <div key={a.id} className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                                <div className="text-[12.5px] font-bold text-slate-600">{byId(a.author_id)?.name || 'Бригада'} · {fmtDay(a.created_at.slice(0, 10), { day: 'numeric', month: 'short' })}</div>
                                {a.text && <p className="text-[14.5px] whitespace-pre-line break-words">{a.text}</p>}
                                {a.photos?.length > 0 && <div className="mt-1.5"><Thumbs photos={a.photos} fileIds={a.photo_file_ids} /></div>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {mine && (
                <button type="button" onClick={() => navigate(`/m/object/${r.installation_custom_id}?tab=reports`)}
                    className="self-start inline-flex items-center gap-1.5 h-10 text-[14px] font-semibold text-slate-700">
                    Усі звіти по цьому об'єкту <FaArrowRight size={11} />
                </button>
            )}
        </div>
    );
}
