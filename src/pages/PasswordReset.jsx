// =====================================================================
//  K-CORE · Доступи → людина → «Пароль»
//
//  Лише адміністратор: створити одноразове посилання, за яким людина
//  сама задасть новий пароль (supabase/functions/admin-password-link), і
//  передати його в месенджер — «Поділитися» на телефоні або
//  «Скопіювати». Лист не потрібен, пошта для входу не змінюється.
//  Нове посилання скасовує попереднє. Хто й кому створив — у журналі змін.
// =====================================================================

import React, { useState } from 'react';
import { FaKey, FaCopy, FaShareAlt, FaCheck, FaTimes, FaRedo, FaExclamationTriangle } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, Btn, Tip, Spinner, useToast, humanError } from '../ui';

export default function PasswordReset({ emp, onClose }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const [res, setRes] = useState(null);   // { link, email }
    const [copied, setCopied] = useState(false);
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    const create = async () => {
        setBusy(true);
        setCopied(false);
        try {
            const { data, error } = await supabase.functions.invoke('admin-password-link', {
                body: { employee_id: emp.id, app_url: `${window.location.origin}${window.location.pathname}` },
            });
            if (error) {
                let msg = null;
                try { msg = (await error.context?.json())?.error; } catch { /* відповідь не JSON */ }
                throw new Error(msg || humanError(error));
            }
            if (!data?.link) throw new Error('Не вдалося створити посилання');
            setRes(data);
        } catch (e) {
            toast(e?.message || humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    const text = res
        ? `${emp.name}, ось посилання, щоб задати новий пароль у K-Core. Воно одноразове й діє обмежений час:\n${res.link}`
        : '';
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast('Скопійовано — вставте в месенджер', 'success');
        } catch {
            toast('Не вдалося скопіювати — виділіть посилання вручну', 'error');
        }
    };
    const share = async () => {
        try { await navigator.share({ title: 'K-Core: новий пароль', text }); } catch { /* скасували */ }
    };

    return (
        <div className="rounded-xl border border-indigo-200 bg-white p-3 space-y-2.5">
            <div className="flex items-center gap-2">
                <FaKey size={12} className="text-indigo-500 flex-shrink-0" />
                <span className="text-[13.5px] font-bold text-slate-900 min-w-0 break-words">Новий пароль: {emp.name}</span>
                <Tip text="Людина відкриває посилання, сама задає новий пароль і одразу працює. Пошта для входу не змінюється. Посилання одноразове й діє обмежений час (зазвичай годину); нове скасовує попереднє. Не відкривайте його самі — увійдете як ця людина." />
                <button type="button" onClick={onClose} aria-label="Закрити"
                    className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0">
                    <FaTimes size={11} />
                </button>
            </div>

            {!res ? (
                <Btn variant="accent" size="sm" icon={busy ? undefined : FaKey} onClick={create} disabled={busy}>
                    {busy ? <><Spinner /> Створюю…</> : 'Створити посилання'}
                </Btn>
            ) : (<>
                <input readOnly value={res.link} onFocus={e => e.currentTarget.select()} aria-label="Посилання для нового пароля"
                    className={`${T.input} !h-9 font-mono !text-[12px] text-slate-600`} />
                <div className="flex flex-wrap items-center gap-2">
                    {canShare && <Btn size="sm" variant="accent" icon={FaShareAlt} onClick={share}>Поділитися</Btn>}
                    <Btn size="sm" variant={canShare ? 'outline' : 'accent'} icon={copied ? FaCheck : FaCopy} onClick={copy}>
                        {copied ? 'Скопійовано' : 'Скопіювати'}
                    </Btn>
                    <Btn size="sm" variant="ghost" icon={busy ? undefined : FaRedo} onClick={create} disabled={busy}>
                        {busy ? <><Spinner /> Створюю…</> : 'Нове посилання'}
                    </Btn>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className="text-slate-500 break-all">Пошта для входу: <b className="text-slate-700">{res.email}</b></span>
                    <span className="inline-flex items-center gap-1 font-semibold text-amber-700"><FaExclamationTriangle size={10} /> самі не відкривайте</span>
                </div>
            </>)}
        </div>
    );
}
