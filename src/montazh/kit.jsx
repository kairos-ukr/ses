// =====================================================================
//  K-CORE · Монтаж — будівельні блоки екранів
//
//  Оформлення «каска і жилет»: плоско, без тіней і анімацій, чорне на
//  білому, сигнальний жовтий — лише на головній дії екрана. Кнопки від
//  48px під палець у рукавиці, текст 15–16px, щоб читалось на сонці.
// =====================================================================

import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { FaArrowLeft, FaSun, FaCalendarAlt, FaListUl, FaUser, FaClipboardList } from 'react-icons/fa';

/*
 * Екран. Заголовок (і вкладки під ним) закріплені вгорі, головна кнопка —
 * внизу над меню; гортається лише середина. Сторінка під нею не
 * прокручується взагалі, тож нічого не «відривається» при потягуванні.
 */
export const Screen = ({ title, sub, back, onBack, right, tabs, children, bottom, scrollKey }) => {
    const navigate = useNavigate();
    const goBack = onBack || (() => (window.history.length > 1 ? navigate(-1) : navigate(back)));
    // Новий крок чи вкладка в тому самому екрані — з початку
    const mainRef = useRef(null);
    useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [scrollKey]);
    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <header className="flex-shrink-0 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2.5 flex items-center gap-3 bg-slate-100">
                {(back || onBack) && (
                    <button type="button" onClick={goBack} aria-label="Назад"
                        className="w-11 h-11 rounded-xl border-2 border-slate-300 bg-white flex items-center justify-center flex-shrink-0 text-slate-900">
                        <FaArrowLeft size={15} />
                    </button>
                )}
                <div className="min-w-0 flex-1">
                    <h1 className="text-[20px] font-bold text-slate-900 leading-tight break-words first-letter:uppercase">{title}</h1>
                    {sub && <p className="text-[13.5px] text-slate-500 leading-snug break-words">{sub}</p>}
                </div>
                {right}
            </header>
            {tabs && <div className="flex-shrink-0 bg-slate-100">{tabs}</div>}
            {/* Діти не стискаються: довгий екран гортається, а кнопки не сплющуються */}
            <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pt-1 pb-4 flex flex-col gap-3 [&>*]:flex-shrink-0">{children}</main>
            {bottom && <div className="flex-shrink-0 px-3 pt-2 pb-2 bg-slate-100 border-t border-slate-200">{bottom}</div>}
        </div>
    );
};

/* Картка. hero — головна картка екрана з товстою рамкою */
export const Card = ({ hero, className = '', children, ...rest }) => (
    <section {...rest} className={`bg-white rounded-2xl ${hero ? 'border-2 border-slate-900' : 'border border-slate-200'} p-3.5 ${className}`}>
        {children}
    </section>
);

/* Підпис над вмістом картки: ліворуч назва, праворуч — дрібниця (лічильник, статус) */
export const Label = ({ children, right, icon: Icon }) => (
    <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500 inline-flex items-center gap-1.5 min-w-0">
            {Icon && <Icon size={11} className="flex-shrink-0" />}<span className="break-words">{children}</span>
        </span>
        {right != null && <span className="text-[12.5px] font-semibold text-slate-500 flex-shrink-0">{right}</span>}
    </div>
);

const PILL = {
    neutral: 'bg-slate-100 text-slate-700',
    ok: 'bg-emerald-50 text-emerald-800',
    warn: 'bg-amber-100 text-amber-900',
    bad: 'bg-rose-50 text-rose-700',
    dark: 'bg-slate-900 text-white',
};
export const Pill = ({ tone = 'neutral', children, className = '' }) => (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12px] font-bold leading-none whitespace-nowrap ${PILL[tone] || PILL.neutral} ${className}`}>{children}</span>
);

const BTN = {
    main: 'bg-[#f2c200] border-[#f2c200] text-[#1d1600]',
    outline: 'bg-white border-slate-900 text-slate-900',
    dark: 'bg-slate-900 border-slate-900 text-white',
    soft: 'bg-white border-slate-300 text-slate-800',
    danger: 'bg-white border-rose-300 text-rose-700',
    // Час звіту минув, а звіту немає: червона кнопка, що блимає
    alert: 'bg-rose-600 border-rose-600 text-white animate-pulse',
};
/* Кнопка або посилання (href) на всю ширину контейнера */
export const Big = ({ tone = 'outline', icon: Icon, after: After, children, href, onClick, disabled, small, className = '', type = 'button', ...rest }) => {
    const cls = `w-full min-w-0 inline-flex items-center justify-center gap-2 border-2 font-bold ${small ? 'h-12 rounded-xl text-[14.5px] px-3' : 'h-14 rounded-2xl text-[16px] px-4'} ${BTN[tone] || BTN.outline} ${disabled ? 'opacity-40 pointer-events-none' : ''} ${className}`;
    const body = <>
        {Icon && <Icon size={small ? 14 : 16} className="flex-shrink-0" />}
        <span className="truncate min-w-0">{children}</span>
        {After && <After size={small ? 12 : 14} className="flex-shrink-0" />}
    </>;
    if (href) {
        return <a href={href} className={cls} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" {...rest}>{body}</a>;
    }
    return <button type={type} onClick={onClick} disabled={disabled} className={cls} {...rest}>{body}</button>;
};

/* Рядок списку: ліворуч текст, праворуч значення */
export const Line = ({ children, right, onClick, first }) => {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag type={onClick ? 'button' : undefined} onClick={onClick}
            className={`w-full text-left flex items-center gap-3 py-2.5 min-h-[44px] ${first ? '' : 'border-t border-slate-100'}`}>
            <div className="min-w-0 flex-1 text-[14.5px] text-slate-800 break-words">{children}</div>
            {right != null && <div className="flex-shrink-0 text-[14.5px] font-semibold text-slate-900 tabular-nums">{right}</div>}
        </Tag>
    );
};

export const Empty = ({ children }) => (
    <div className="py-5 text-center text-[14.5px] text-slate-500">{children}</div>
);

export const Loading = () => (
    <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-slate-200/70" />)}
    </div>
);

/* Перемикач на кілька варіантів (вкладки в картці об'єкта, «Мені / Від мене») */
// Вкладки рівної ширини — на телефоні видно всі, нічого не ховається за край
export const Tabs = ({ value, onChange, items }) => (
    <div className="flex border-b-2 border-slate-200 px-1">
        {items.map(it => (
            <button key={it.value} type="button" onClick={() => onChange(it.value)}
                className={`flex-1 min-w-0 px-1 h-11 text-[13.5px] font-bold whitespace-nowrap border-b-[3px] -mb-[2px] ${value === it.value ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'}`}>
                {it.label}{it.count != null && <span className="ml-1 text-slate-400 font-semibold">{it.count}</span>}
            </button>
        ))}
    </div>
);

export const Segment = ({ value, onChange, items }) => (
    <div className="grid border-2 border-slate-900 rounded-xl overflow-hidden" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(it => (
            <button key={it.value} type="button" onClick={() => onChange(it.value)}
                className={`h-11 px-1 text-[13.5px] font-bold truncate ${value === it.value ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
                {it.label}
            </button>
        ))}
    </div>
);

/* Квадратна галочка для пальця */
export const Check = ({ on, onClick, label, disabled }) => (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={!!on}
        className={`w-11 h-11 -m-1.5 flex items-center justify-center flex-shrink-0 ${disabled ? 'opacity-40' : ''}`}>
        <span className={`w-6 h-6 rounded-lg border-2 border-slate-900 flex items-center justify-center ${on ? 'bg-slate-900' : 'bg-white'}`}>
            {on && <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>}
        </span>
    </button>
);

/* Нижнє меню — п'ять вкладок */
const NAV = [
    { to: '/m', end: true, label: 'Сьогодні', icon: FaSun },
    { to: '/m/schedule', label: 'Графік', icon: FaCalendarAlt },
    { to: '/m/report', label: 'Звіт', icon: FaClipboardList },
    { to: '/m/tasks', label: 'Задачі', icon: FaListUl },
    { to: '/m/me', label: 'Я', icon: FaUser },
];

export const BottomNav = ({ badges = {} }) => {
    // «Мої звіти» (/m/reports) — частина вкладки «Звіт»
    const { pathname } = useLocation();
    const activeOf = (n, isActive) => isActive || (n.to === '/m/report' && pathname.startsWith('/m/reports'));
    return (
    <nav className="flex-shrink-0 bg-white border-t-2 border-slate-200 pb-[env(safe-area-inset-bottom)]" aria-label="Меню монтажника">
        <div className="grid grid-cols-5">
            {NAV.map(n => (
                <NavLink key={n.to} to={n.to} end={n.end}
                    className={({ isActive }) => `flex flex-col items-center gap-1 pt-2 pb-2 text-[11.5px] font-bold ${activeOf(n, isActive) ? 'text-slate-900' : 'text-slate-500'}`}>
                    {({ isActive: navActive }) => { const isActive = activeOf(n, navActive); return (<>
                        <span className={`relative px-3.5 py-1 rounded-xl ${isActive ? 'bg-[#f2c200]' : ''}`}>
                            <n.icon size={19} />
                            {badges[n.to] === true ? (
                                // Час звіту, а його ще немає — червона крапка, що блимає
                                <span className="absolute -top-0.5 right-2 w-3 h-3 rounded-full bg-rose-600 border-2 border-white animate-pulse" aria-label="Звіт ще не надіслано" />
                            ) : badges[n.to] > 0 && (
                                <span className="absolute -top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10.5px] leading-[18px] text-center">{badges[n.to]}</span>
                            )}
                        </span>
                        {n.label}
                    </>); }}
                </NavLink>
            ))}
        </div>
    </nav>
    );
};
