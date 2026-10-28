// =====================================================================
//  K-CORE · Хто може зайти в CRM
//
//  Зареєструватись на сторінці входу може будь-хто, але сам акаунт ще
//  нічого не відкриває. Доступ з'являється, коли адміністратор у
//  «Доступах» (AdminPanel) прив'язує акаунт до працівника. До того
//  людина бачить екран «очікує підтвердження» замість меню й даних.
// =====================================================================

import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { FaHourglassHalf, FaBan, FaLock, FaExclamationTriangle, FaSyncAlt, FaSignOutAlt } from 'react-icons/fa';

import { useAuth } from './AuthProvider';
import { Btn, Spinner } from './ui';
import { registrationName } from './utils/registrations';
import { homePath, hasCrm } from './navigation';
import logo from './logoCore1.webp';

const FullScreen = ({ children }) => (
    <div className="min-h-[100dvh] w-full bg-slate-100 flex items-center justify-center p-4">
        {children}
    </div>
);

export default function AccessGate({ children }) {
    const { user, access } = useAuth();
    const { pathname } = useLocation();

    // Сторінка входу сама вирішує, куди вести далі
    if (pathname === '/') return children;
    if (!user) return <Navigate to="/" replace />;
    if (access === 'ok') return children;
    if (access === 'loading' || access === 'none') {
        return <FullScreen><Spinner className="w-6 h-6 text-slate-400" /></FullScreen>;
    }
    return <AccessWaiting />;
}

/**
 * Сторінка CRM за доступами (domain/access): section — розділ, any — будь-який
 * із переліку. Монтажникові CRM закритий зовсім — його місце в «Монтажі».
 * Без доступу — на свою головну, а не на порожній екран.
 */
export const RequireAccess = ({ section, any, need = 'view', children }) => {
    const auth = useAuth();
    const ok = hasCrm(auth) && (
        section ? auth.can(section, need) : any ? any.some(s => auth.can(s, need)) : true
    );
    if (!ok) return <Navigate to={homePath(auth)} replace />;
    return children;
};

const SCREENS = {
    pending: {
        Icon: FaHourglassHalf,
        tone: 'bg-amber-50 text-amber-600 border-amber-200',
        title: 'Акаунт чекає на підтвердження',
        text: 'Адміністратор має підтвердити, хто ви в команді. Після цього тут відкриється K-Core. Коли вам скажуть, що доступ надано, натисніть «Перевірити ще раз».',
    },
    rejected: {
        Icon: FaBan,
        tone: 'bg-rose-50 text-rose-600 border-rose-200',
        title: 'Доступ не надано',
        text: 'Адміністратор не підтвердив цей акаунт. Якщо це помилка, зверніться до керівника.',
    },
    blocked: {
        Icon: FaLock,
        tone: 'bg-rose-50 text-rose-600 border-rose-200',
        title: 'Доступ заблоковано',
        text: 'Адміністратор закрив вам доступ до K-Core. Якщо це помилка, зверніться до керівника.',
    },
    error: {
        Icon: FaExclamationTriangle,
        tone: 'bg-slate-100 text-slate-500 border-slate-200',
        title: 'Не вдалося перевірити доступ',
        text: 'Схоже, зник зв’язок із сервером. Перевірте інтернет і спробуйте ще раз.',
    },
};

function AccessWaiting() {
    const { user, registration, access, refreshAccess, signOut } = useAuth();
    const [checking, setChecking] = useState(false);
    const [stillWaiting, setStillWaiting] = useState(false);

    const screen = SCREENS[access] || SCREENS.error;
    const name = registration ? registrationName(registration) : '';
    // Відхилено чи заблоковано — повторна перевірка нічого не дасть, лише «Вийти»
    const final = access === 'rejected' || access === 'blocked';

    const check = async () => {
        setChecking(true);
        setStillWaiting(false);
        const result = await refreshAccess();
        setChecking(false);
        if (result !== 'ok') setStillWaiting(true);
    };

    return (
        <FullScreen>
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 flex flex-col gap-5">
                <img src={logo} alt="K-Core" className="h-9 w-auto object-contain self-start" />

                <div className="flex items-start gap-3.5">
                    <span className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${screen.tone}`}>
                        <screen.Icon size={18} />
                    </span>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 leading-snug">{screen.title}</h1>
                        {name && access === 'pending' && (
                            <p className="text-[14px] text-slate-600 mt-0.5">Вітаємо, {name}!</p>
                        )}
                    </div>
                </div>

                <p className="text-[14px] text-slate-600 leading-relaxed">{screen.text}</p>

                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-[13px] text-slate-600">
                    Ви увійшли як <span className="font-semibold text-slate-800 break-all">{user?.email}</span>
                </div>

                {stillWaiting && access === 'pending' && (
                    <p className="text-[13px] font-semibold text-amber-700">Поки ще не підтверджено. Спробуйте трохи пізніше.</p>
                )}

                <div className="flex flex-col sm:flex-row gap-2">
                    {!final && (
                        <Btn variant="accent" size="lg" icon={checking ? undefined : FaSyncAlt} onClick={check} disabled={checking} className="flex-1">
                            {checking ? <><Spinner /> Перевіряю…</> : 'Перевірити ще раз'}
                        </Btn>
                    )}
                    <Btn variant="outline" size="lg" icon={FaSignOutAlt} onClick={signOut} className={final ? 'flex-1' : ''}>
                        Вийти
                    </Btn>
                </div>
            </div>
        </FullScreen>
    );
}
