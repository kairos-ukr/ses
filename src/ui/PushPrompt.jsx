// =====================================================================
//  K-CORE · Пуш-сповіщення: запит дозволу й налаштування пристрою
//
//  PushPrompt — невелика плашка внизу після входу: «Отримувати
//  сповіщення на цьому пристрої?» → системний запит дозволу. «Пізніше» —
//  не питати тиждень. Якщо дозвіл уже є — пристрій мовчки
//  підписується (і переписується на того, хто зараз увійшов).
//  PushDeviceRow — рядок у дзвіночку CRM і в «Монтажі» (Я): увімкнути,
//  пробне сповіщення, вимкнути на цьому пристрої.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaBell, FaTimes } from 'react-icons/fa';

import { useAuth } from '../AuthProvider';
import { useToast, humanError } from './index';
import {
    pushState, enablePush, subscribeDevice, forgetDevice, deviceSubscribed, sendTestPush, askedRecently, askLater,
} from '../utils/push';

export function usePushDevice() {
    const { employee } = useAuth();
    const toast = useToast();
    const [state, setState] = useState(pushState());
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(() => {
        setState(pushState());
        deviceSubscribed().then(setSubscribed);
    }, []);
    useEffect(() => { refresh(); }, [refresh]);

    const enable = async () => {
        setBusy(true);
        try {
            const perm = await enablePush(employee?.id);
            if (perm === 'granted') toast('Сповіщення на цьому пристрої увімкнено', 'success');
            else if (perm === 'denied') toast('Сповіщення заблоковані — дозвольте їх у налаштуваннях браузера чи телефона', 'warning');
        } catch (e) { toast(humanError(e), 'error'); }
        setBusy(false);
        refresh();
    };
    const disable = async () => { setBusy(true); await forgetDevice(); setBusy(false); refresh(); toast('На цьому пристрої сповіщень більше не буде', 'info'); };
    const test = async () => {
        const { error } = await sendTestPush(employee?.id);
        if (error) toast(humanError(error), 'error');
        else toast('Пробне сповіщення надіслано — має прийти за кілька секунд');
    };
    return { state, subscribed, busy, enable, disable, test, employeeId: employee?.id };
}

/** Плашка-запит після входу */
export default function PushPrompt() {
    const { employee } = useAuth();
    const { pathname } = useLocation();
    const navigate = useNavigate();
    const { state, busy, enable } = usePushDevice();
    const [later, setLater] = useState(askedRecently());
    const montazh = pathname === '/m' || pathname.startsWith('/m/');

    // Дозвіл є — тримаємо підписку цього пристрою за тим, хто зараз увійшов
    useEffect(() => { if (state === 'granted' && employee?.id) subscribeDevice(employee.id); }, [state, employee?.id]);

    // Натиск на сповіщення, коли K-Core вже відкрита
    useEffect(() => {
        if (!('serviceWorker' in navigator)) return undefined;
        const onMsg = (e) => { if (e.data?.type === 'kcore-open' && e.data.url) navigate(e.data.url); };
        navigator.serviceWorker.addEventListener('message', onMsg);
        return () => navigator.serviceWorker.removeEventListener('message', onMsg);
    }, [navigate]);

    if (!employee?.id || pathname === '/' || later) return null;
    const iosHint = montazh && state === 'ios-install';
    if (state !== 'default' && !iosHint) return null;
    const close = () => { askLater(); setLater(true); };

    return (
        <div className={`fixed z-[150] inset-x-3 ${montazh ? 'bottom-[92px]' : 'bottom-3 lg:left-auto lg:right-4 lg:w-[400px]'}`}>
            <div className={`${montazh ? 'rounded-2xl border-2 border-slate-900' : 'rounded-xl border border-slate-200'} bg-white shadow-2xl p-3.5 flex items-start gap-3`}>
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${montazh ? 'bg-[#f2c200] text-[#1d1600]' : 'bg-indigo-50 text-indigo-600'}`}>
                    <FaBell size={16} />
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-slate-900 leading-snug">
                        {iosHint ? 'Сповіщення на iPhone' : 'Отримувати сповіщення на цьому пристрої?'}
                    </div>
                    <div className="text-[13px] text-slate-600 leading-snug mt-0.5">
                        {iosHint
                            ? 'Встановіть K-Core на головний екран: «Поділитися» → «На початковий екран», відкрийте з іконки й дозвольте сповіщення.'
                            : 'Задачі й призначення для вас, графік на завтра, нагадування про звіт.'}
                    </div>
                    {!iosHint && (
                        <div className="mt-2.5 flex gap-2">
                            <button type="button" onClick={enable} disabled={busy}
                                className={`h-10 px-4 rounded-xl text-[14px] font-bold ${montazh ? 'bg-slate-900 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'} disabled:opacity-50`}>
                                Увімкнути
                            </button>
                            <button type="button" onClick={close} className="h-10 px-3 rounded-xl text-[14px] font-semibold text-slate-600 hover:bg-slate-100">Пізніше</button>
                        </div>
                    )}
                </div>
                <button type="button" onClick={close} aria-label="Закрити" className="w-8 h-8 -mr-1 -mt-1 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0">
                    <FaTimes size={12} />
                </button>
            </div>
        </div>
    );
}

/** Рядок «Сповіщення на цьому пристрої» — у дзвіночку CRM */
export function PushDeviceRow() {
    const { state, subscribed, busy, enable, disable, test } = usePushDevice();
    const text = state === 'unsupported' ? 'Цей браузер не підтримує сповіщення'
        : state === 'ios-install' ? 'На iPhone сповіщення працюють у встановленій програмі (головний екран)'
            : state === 'denied' ? 'Сповіщення заблоковані в налаштуваннях браузера'
                : state === 'granted' && subscribed ? 'Сповіщення на цьому пристрої увімкнено' : 'Сповіщення на цьому пристрої вимкнено';
    return (
        <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/70 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-slate-600 flex-1 min-w-[160px]">{text}</span>
            {(state === 'default' || (state === 'granted' && !subscribed)) && (
                <button type="button" onClick={enable} disabled={busy} className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-[12.5px] font-bold disabled:opacity-50">Увімкнути</button>
            )}
            {state === 'granted' && subscribed && <>
                <button type="button" onClick={test} className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700">Пробне</button>
                <button type="button" onClick={disable} disabled={busy} className="h-8 px-2.5 rounded-lg text-[12.5px] font-semibold text-slate-500 hover:bg-slate-100">Вимкнути</button>
            </>}
        </div>
    );
}
