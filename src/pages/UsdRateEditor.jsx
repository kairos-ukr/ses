// =====================================================================
//  K-CORE · Курс долара — один на всю програму
//
//  Видно, який курс зараз діє; змінити можна тут же (вписати свій або
//  взяти офіційний курс НБУ на сьогодні). Міняють ті, кому відкриті
//  «Налаштування» або гроші всієї компанії; решта лише бачить.
//  compact — рядок для шапки сторінки; інакше — картка налаштувань.
// =====================================================================

import React, { useState } from 'react';
import { FaDollarSign, FaPen, FaUniversity, FaCheck, FaTimes } from 'react-icons/fa';
import { useAuth } from '../AuthProvider';
import { T, Btn, IconBtn, Tip, useToast, humanError } from '../ui';
import { useUsdRate, saveUsdRate, fetchNbuRate } from '../utils/settings';

const fmt = (r) => Number(r).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export default function UsdRateEditor({ compact = false }) {
    const auth = useAuth();
    const toast = useToast();
    const rate = useUsdRate();
    const canEdit = auth.can('settings', 'edit') || auth.financeAll;
    const [draft, setDraft] = useState(null);     // null — не редагуємо
    const [nbu, setNbu] = useState(null);         // { rate, date }
    const [busy, setBusy] = useState(false);

    const close = () => { setDraft(null); setNbu(null); };

    const save = async (value) => {
        const r = Number(String(value).replace(',', '.'));
        if (!(r > 0)) { toast('Курс — число більше за 0', 'error'); return; }
        setBusy(true);
        try {
            await saveUsdRate(r, auth.employee?.id);
            close();
            toast(`Курс ${fmt(r)} ₴ збережено — підставлятиметься всюди`, 'success');
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    const takeNbu = async () => {
        setBusy(true);
        try {
            const n = await fetchNbuRate();
            setNbu(n);
            setDraft(String(n.rate));
        } catch {
            toast('Не вдалося отримати курс НБУ — впишіть вручну', 'error');
        } finally {
            setBusy(false);
        }
    };

    const editor = (
        <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-slate-500 whitespace-nowrap">1 $ =</span>
            <input autoFocus className={`${T.input} !h-9 !w-28 text-right tabular-nums`} inputMode="decimal" value={draft ?? ''}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') save(draft); if (e.key === 'Escape') close(); }} />
            <span className="text-[13px] text-slate-500">₴</span>
            <Btn size="sm" variant="soft" icon={FaUniversity} onClick={takeNbu} disabled={busy}>Курс НБУ</Btn>
            <Btn size="sm" variant="accent" icon={FaCheck} onClick={() => save(draft)} disabled={busy}>Зберегти</Btn>
            <IconBtn icon={FaTimes} label="Скасувати" onClick={close} />
            {nbu && <span className="w-full text-[12px] text-slate-500">НБУ на {nbu.date}: {fmt(nbu.rate)} ₴ — можна підправити перед збереженням</span>}
        </div>
    );

    if (compact) {
        return draft !== null ? (
            <div className={`${T.card} px-3 py-2`}>{editor}</div>
        ) : (
            <span className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-600">
                <FaDollarSign size={11} className="text-emerald-600" />
                Курс: <b className="text-slate-900 tabular-nums">{rate ? `${fmt(rate)} ₴` : rate === null ? 'не задано' : '…'}</b>
                {canEdit
                    ? <IconBtn icon={FaPen} label="Змінити курс долара" onClick={() => setDraft(rate ? String(rate) : '')} />
                    : <span className="w-1" />}
            </span>
        );
    }

    return (
        <div className={`${T.card} p-4 space-y-3`}>
            <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                <FaDollarSign size={13} className="text-emerald-600" /> Курс долара
                <Tip width={300} text="Один курс на всю програму: підставляється в платежі, продажі, звіти бригад; за ним рахуються прибуток об'єктів і аналітика. Можна вписати свій або взяти курс НБУ на сьогодні." />
            </h2>
            {draft !== null ? editor : (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] text-slate-600">1 $ = <b className="text-[18px] text-slate-900 tabular-nums">{rate ? fmt(rate) : rate === null ? '—' : '…'}</b> ₴</span>
                    {canEdit && <Btn size="sm" variant="outline" icon={FaPen} className="ml-auto" onClick={() => setDraft(rate ? String(rate) : '')}>Змінити</Btn>}
                </div>
            )}
        </div>
    );
}
