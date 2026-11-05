// =====================================================================
//  K-CORE · Новий пароль за посиланням
//
//  Адміністратор у «Доступах» створює для працівника одноразове
//  посилання (supabase/functions/admin-password-link) і передає його в
//  месенджер. Людина відкриває — тут перевіряємо ключ, вона задає новий
//  пароль і одразу працює. Ключ одразу прибираємо з адреси, щоб він не
//  лишався в історії браузера. Сюди ж веде й лист Supabase «Скинути
//  пароль», якщо його колись надішлють. Посилання протерміноване чи вже
//  використане — так і кажемо, і що робити далі.
// =====================================================================

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaKey, FaEye, FaEyeSlash, FaCheckCircle, FaExclamationTriangle, FaSignOutAlt, FaCircle } from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { T, Btn, Spinner } from './ui';
import logo from './logoCore1.webp';

// Ті самі вимоги, що й під час реєстрації (AuthPage)
const RULES = [
    { key: 'len', text: 'щонайменше 8 символів', ok: (p) => p.length >= 8 },
    { key: 'digit', text: 'хоча б одна цифра', ok: (p) => /\d/.test(p) },
    { key: 'sign', text: 'хоча б один знак: ! @ # $ % …', ok: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

const authError = (e) => {
    const m = String(e?.message || '');
    if (e?.code === 'same_password' || /different from the old/i.test(m)) return 'Новий пароль має відрізнятися від старого.';
    if (e?.code === 'weak_password' || /weak|pwned|leaked/i.test(m)) return 'Пароль надто простий — оберіть складніший.';
    if (/session|jwt|expired|not authenticated|missing/i.test(m)) return 'Посилання вже не дійсне. Попросіть адміністратора створити нове.';
    if (/network|fetch/i.test(m)) return 'Немає зв’язку з сервером. Перевірте інтернет і спробуйте ще раз.';
    return 'Не вдалося зберегти пароль. Спробуйте ще раз.';
};

const Shell = ({ children }) => (
    <div className="min-h-[100dvh] w-full bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-6 sm:p-8 flex flex-col gap-5">
            <img src={logo} alt="K-Core" className="h-9 w-auto object-contain self-start" />
            {children}
        </div>
    </div>
);

const Head = ({ icon: Icon, tone, title, sub }) => (
    <div className="flex items-start gap-3.5">
        <span className={`w-11 h-11 rounded-xl border flex items-center justify-center flex-shrink-0 ${tone}`}><Icon size={18} /></span>
        <div className="min-w-0">
            <h1 className="text-lg font-bold text-slate-900 leading-snug">{title}</h1>
            {sub && <p className="text-[13.5px] text-slate-600 mt-0.5 break-words">{sub}</p>}
        </div>
    </div>
);

export default function ResetPasswordPage() {
    const { user, endRecovery, signOut } = useAuth();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const tokenHash = params.get('token_hash');

    // checking — перевіряємо ключ; form — новий пароль; invalid — посилання не діє; done — збережено
    const [phase, setPhase] = useState(() => (tokenHash ? 'checking' : null));
    const shown = phase || (user ? 'form' : 'invalid');
    const [pw, setPw] = useState('');
    const [pw2, setPw2] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const ran = useRef(false);

    // Ключ одноразовий: перевіряємо рівно один раз і прибираємо з адреси
    useEffect(() => {
        if (!tokenHash || ran.current) return;
        ran.current = true;
        (async () => {
            const { error: e } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
            setParams({}, { replace: true });
            setPhase(e ? 'invalid' : 'form');
        })();
    }, [tokenHash, setParams]);

    const okAll = RULES.every(r => r.ok(pw));
    const same = pw.length > 0 && pw === pw2;

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (!okAll) { setError('Пароль не відповідає вимогам нижче.'); return; }
        if (!same) { setError('Паролі не збігаються.'); return; }
        setBusy(true);
        const { error: err } = await supabase.auth.updateUser({ password: pw });
        setBusy(false);
        if (err) { setError(authError(err)); return; }
        endRecovery();
        setPhase('done');
    };

    const leave = async () => {
        endRecovery();
        await signOut();
        navigate('/', { replace: true });
    };

    if (shown === 'checking') {
        return (
            <Shell>
                <div className="flex items-center gap-3 text-[14px] text-slate-600"><Spinner className="w-5 h-5 text-slate-400" /> Перевіряю посилання…</div>
            </Shell>
        );
    }

    if (shown === 'invalid') {
        return (
            <Shell>
                <Head icon={FaExclamationTriangle} tone="bg-amber-50 text-amber-600 border-amber-200"
                    title="Посилання вже не дійсне" sub="Воно одноразове й діє обмежений час. Попросіть адміністратора створити нове." />
                <Btn variant="accent" size="lg" onClick={() => navigate('/', { replace: true })}>На сторінку входу</Btn>
            </Shell>
        );
    }

    if (shown === 'done') {
        return (
            <Shell>
                <Head icon={FaCheckCircle} tone="bg-emerald-50 text-emerald-600 border-emerald-200"
                    title="Пароль збережено" sub="Надалі входьте з ним. Пошта для входу — та сама." />
                {user?.email && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 text-[13px] text-slate-600">
                        Пошта: <span className="font-semibold text-slate-800 break-all">{user.email}</span>
                    </div>
                )}
                <Btn variant="accent" size="lg" onClick={() => navigate('/home', { replace: true })}>Перейти до роботи</Btn>
            </Shell>
        );
    }

    const field = (value, set, placeholder, auto) => (
        <div className="relative">
            <input type={show ? 'text' : 'password'} value={value} onChange={e => { set(e.target.value); if (error) setError(''); }}
                placeholder={placeholder} autoComplete={auto} required
                className={`${T.input} !h-12 !pr-12 !text-[15px]`} />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Сховати пароль' : 'Показати пароль'}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700">
                {show ? <FaEyeSlash size={15} /> : <FaEye size={15} />}
            </button>
        </div>
    );

    return (
        <Shell>
            <Head icon={FaKey} tone="bg-indigo-50 text-indigo-600 border-indigo-200" title="Новий пароль"
                sub={user?.email ? <>Для входу як <b className="text-slate-800 break-all">{user.email}</b></> : null} />

            <form onSubmit={submit} className="flex flex-col gap-3">
                {field(pw, setPw, 'Новий пароль', 'new-password')}
                {field(pw2, setPw2, 'Ще раз той самий пароль', 'new-password')}

                <ul className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 space-y-1">
                    {RULES.map(r => {
                        const ok = r.ok(pw);
                        return (
                            <li key={r.key} className={`text-[13px] flex items-center gap-2 ${ok ? 'text-emerald-700' : 'text-slate-500'}`}>
                                {ok ? <FaCheckCircle size={12} /> : <FaCircle size={7} className="mx-[2.5px]" />} {r.text}
                            </li>
                        );
                    })}
                    <li className={`text-[13px] flex items-center gap-2 ${same ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {same ? <FaCheckCircle size={12} /> : <FaCircle size={7} className="mx-[2.5px]" />} обидва поля однакові
                    </li>
                </ul>

                {error && <p className="text-[13.5px] font-semibold text-rose-700" role="alert">{error}</p>}

                <Btn type="submit" variant="accent" size="lg" disabled={busy}>
                    {busy ? <><Spinner /> Зберігаю…</> : 'Зберегти пароль'}
                </Btn>
            </form>

            <button type="button" onClick={leave}
                className="self-start inline-flex items-center gap-2 h-10 text-[13px] font-semibold text-slate-500 hover:text-slate-800">
                <FaSignOutAlt size={12} /> Це не мій акаунт — вийти
            </button>
        </Shell>
    );
}
