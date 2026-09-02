// =====================================================================
//  K-CORE · Спільні елементи інтерфейсу
//
//  Одна стилістика для всіх модулів: однакові відступи, радіуси,
//  розміри шрифтів і кольори станів. Замість того, щоб кожна сторінка
//  вигадувала свій Toast, свою модалку і свої відступи.
//
//  Щільність вища за типову «повітряну» верстку: це робочий інструмент,
//  у якому важливо бачити багато рядків одночасно, а не милуватись
//  проміжками. Базовий рядок таблиці — 40px замість 76px.
// =====================================================================

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaCheck, FaExclamationTriangle, FaTimes, FaInfoCircle, FaSearch,
    FaChevronLeft, FaChevronRight, FaChevronDown, FaPlus,
} from 'react-icons/fa';

/* =====================================================================
 *  ТОКЕНИ
 *  Класи-константи, щоб «одна стилістика» була фактом, а не побажанням.
 * ===================================================================== */

export const T = {
    // Поверхні
    card: 'bg-white border border-slate-200 rounded-xl',
    cardFlat: 'bg-white border border-slate-200 rounded-lg',
    inset: 'bg-slate-50 border border-slate-200 rounded-lg',

    // Відступи — три щільності, більше не вигадуємо
    padTight: 'p-2.5',
    pad: 'p-3.5',
    padLoose: 'p-5',

    // Текст
    h1: 'text-base font-bold text-slate-900 tracking-tight',
    h2: 'text-sm font-bold text-slate-900',
    label: 'text-[10px] font-black uppercase tracking-wider text-slate-400',
    body: 'text-[13px] text-slate-700',
    dim: 'text-[11px] text-slate-500',
    mono: 'font-mono text-[10px] tracking-wider text-slate-500 uppercase',
    num: 'font-black tabular-nums text-slate-900',

    // Поля вводу — 16px на дотикових екранах ставить index.css, тут лише вигляд
    input: 'w-full px-3 h-10 bg-white border border-slate-300 rounded-lg text-[13px] text-slate-800 ' +
        'outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors ' +
        'placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400',
    select: 'w-full px-3 h-10 bg-white border border-slate-300 rounded-lg text-[13px] font-semibold text-slate-800 ' +
        'outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors cursor-pointer',

    // Рядки таблиці
    th: 'px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 whitespace-nowrap',
    td: 'px-3 py-2 text-[13px] text-slate-700 align-middle',

    // Мінімальна зона дотику на мобільному
    tap: 'min-h-[44px]',
};

/* Кольори станів — семантика, не декорація. */
export const TONE = {
    neutral: { chip: 'bg-slate-100 text-slate-600 border-slate-200', text: 'text-slate-600', bar: 'bg-slate-300' },
    ok: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'text-emerald-700', bar: 'bg-emerald-500' },
    warn: { chip: 'bg-amber-50 text-amber-700 border-amber-200', text: 'text-amber-700', bar: 'bg-amber-500' },
    danger: { chip: 'bg-rose-50 text-rose-700 border-rose-200', text: 'text-rose-700', bar: 'bg-rose-500' },
    info: { chip: 'bg-sky-50 text-sky-700 border-sky-200', text: 'text-sky-700', bar: 'bg-sky-500' },
    accent: { chip: 'bg-indigo-50 text-indigo-700 border-indigo-200', text: 'text-indigo-700', bar: 'bg-indigo-500' },
};

/* =====================================================================
 *  TOAST — один на застосунок замість п'ятнадцяти копій
 * ===================================================================== */

const ToastCtx = createContext(() => { });

/** Показати повідомлення: toast('Збережено') або toast('Помилка', 'error') */
export const useToast = () => useContext(ToastCtx);

const TOAST_TONE = {
    success: { bg: 'bg-emerald-600', Icon: FaCheck },
    error: { bg: 'bg-rose-600', Icon: FaExclamationTriangle },
    warning: { bg: 'bg-amber-500', Icon: FaExclamationTriangle },
    info: { bg: 'bg-slate-800', Icon: FaInfoCircle },
};

export const ToastProvider = ({ children }) => {
    const [queue, setQueue] = useState([]);

    const push = useCallback((message, type = 'success', action) => {
        const id = Date.now() + Math.random();
        setQueue(q => [...q, { id, message, type, action }]);
        setTimeout(() => setQueue(q => q.filter(t => t.id !== id)), action ? 8000 : 4000);
    }, []);

    const drop = (id) => setQueue(q => q.filter(t => t.id !== id));

    return (
        <ToastCtx.Provider value={push}>
            {children}
            <div className="fixed z-[200] inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-auto sm:top-4 sm:right-4 sm:w-[360px] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence>
                    {queue.map(t => {
                        const cfg = TOAST_TONE[t.type] || TOAST_TONE.info;
                        return (
                            <motion.div
                                key={t.id}
                                initial={{ opacity: 0, y: 16, scale: .97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: .97 }}
                                transition={{ duration: .18 }}
                                className={`${cfg.bg} text-white rounded-xl shadow-xl px-3.5 py-3 flex items-center gap-3 pointer-events-auto`}
                            >
                                <cfg.Icon className="flex-shrink-0" size={14} />
                                <span className="font-semibold text-[13px] leading-snug flex-1">{t.message}</span>
                                {t.action && (
                                    <button
                                        onClick={() => { t.action.onClick(); drop(t.id); }}
                                        className="text-[11px] font-black uppercase tracking-wider bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
                                    >
                                        {t.action.label}
                                    </button>
                                )}
                                <button onClick={() => drop(t.id)} className="text-white/70 hover:text-white flex-shrink-0">
                                    <FaTimes size={12} />
                                </button>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </ToastCtx.Provider>
    );
};

/* =====================================================================
 *  КНОПКИ
 * ===================================================================== */

const BTN_VARIANTS = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900 shadow-sm',
    accent: 'bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-600 shadow-sm',
    ok: 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600 shadow-sm',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600 shadow-sm',
    outline: 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300',
    soft: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-transparent',
    softOk: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200',
    softWarn: 'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200',
    softDanger: 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200',
    ghost: 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 border-transparent',
};

const BTN_SIZES = {
    sm: 'h-8 px-2.5 text-[11px] gap-1.5 rounded-lg',
    md: 'h-10 px-3.5 text-[12.5px] gap-2 rounded-lg',
    lg: 'h-12 px-5 text-[14px] gap-2 rounded-xl',
};

export const Btn = ({ variant = 'outline', size = 'md', icon: Icon, children, className = '', ...rest }) => (
    <button
        type="button"
        className={`inline-flex items-center justify-center border font-bold whitespace-nowrap transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed
            ${BTN_VARIANTS[variant]} ${BTN_SIZES[size]} ${className}`}
        {...rest}
    >
        {Icon && <Icon size={size === 'sm' ? 11 : 13} className="flex-shrink-0" />}
        {children}
    </button>
);

/** Квадратна кнопка-іконка. На мобільному лишається придатною для пальця. */
export const IconBtn = ({ variant = 'ghost', icon: Icon, label, className = '', ...rest }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        className={`w-9 h-9 sm:w-8 sm:h-8 inline-flex items-center justify-center border rounded-lg transition-colors flex-shrink-0
            disabled:opacity-40 disabled:cursor-not-allowed ${BTN_VARIANTS[variant]} ${className}`}
        {...rest}
    >
        <Icon size={13} />
    </button>
);

/* =====================================================================
 *  ДРІБНІ ЕЛЕМЕНТИ
 * ===================================================================== */

export const Chip = ({ tone = 'neutral', icon: Icon, children, className = '' }) => (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${TONE[tone].chip} ${className}`}>
        {Icon && <Icon size={9} />}{children}
    </span>
);

/** Число з підписом. Компактна заміна «плиткам» на пів екрана. */
export const Metric = ({ label, value, unit, tone = 'neutral', className = '' }) => (
    <div className={`leading-tight ${className}`}>
        <div className={`text-[9px] font-black uppercase tracking-wider ${tone === 'neutral' ? 'text-slate-400' : TONE[tone].text} opacity-80`}>{label}</div>
        <div className={`text-[13px] font-black tabular-nums ${tone === 'neutral' ? 'text-slate-800' : TONE[tone].text}`}>
            {value}{unit && <span className="text-[9px] font-bold opacity-60 ml-0.5">{unit}</span>}
        </div>
    </div>
);

/** Смуга покриття: скільки видано / зарезервовано / лишилось. */
export const Bar = ({ segments, className = '' }) => (
    <div className={`h-1.5 rounded-full bg-slate-200 overflow-hidden flex ${className}`}>
        {segments.filter(s => s.pct > 0).map((s, i) => (
            <span key={i} className={`h-full ${TONE[s.tone].bar}`} style={{ width: `${Math.min(100, s.pct)}%` }} />
        ))}
    </div>
);

export const Card = ({ children, className = '', pad = T.pad, ...rest }) => (
    <div className={`${T.card} ${pad} ${className}`} {...rest}>{children}</div>
);

export const Field = ({ label, hint, required, children, className = '' }) => (
    <label className={`block ${className}`}>
        <span className={`${T.label} block mb-1`}>
            {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        {children}
        {hint && <span className="block text-[10px] text-slate-400 mt-1 leading-snug">{hint}</span>}
    </label>
);

export const SearchInput = ({ value, onChange, placeholder = 'Пошук…', className = '' }) => (
    <div className={`relative ${className}`}>
        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={12} />
        <input
            type="search"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`${T.input} pl-8`}
        />
    </div>
);

export const Segmented = ({ options, value, onChange, className = '' }) => (
    <div className={`inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200 ${className}`}>
        {options.map(o => (
            <button
                key={o.value}
                type="button"
                onClick={() => onChange(o.value)}
                className={`px-3 h-9 sm:h-8 rounded-md text-[11.5px] font-bold transition-colors whitespace-nowrap
                    ${value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
                {o.label}
            </button>
        ))}
    </div>
);

/**
 * Селект із пошуком. За наявності onAddNew дозволяє створити запис
 * прямо з поля — коли потрібного варіанта в довіднику ще немає.
 *
 * options: [{ id, label }]
 */
export const Picker = ({
    options, value, onChange, placeholder = 'Оберіть…',
    icon: Icon, disabled = false, onAddNew, addLabel = 'Додати',
    searchPlaceholder = 'Пошук…', className = '',
    // keepOpen — для полів «додати позицію»: після вибору список лишається
    // відкритим і курсор у пошуку, щоб десяток позицій можна було внести
    // підряд із клавіатури, не клікаючи щоразу мишею.
    keepOpen = false,
    // autoOpen — поле саме розкриває список одразу після появи. Для полів,
    // які виринають на місці існуючого значення (наприклад, інлайн-заміна
    // рядка): людина вже клікнула «замінити», і зайвий клік по самому полю
    // тільки б заважав.
    autoOpen = false,
    onCancel,   // Esc / клік поза полем, коли autoOpen — скасувати, а не просто закрити
}) => {
    const [open, setOpen] = useState(autoOpen);
    const [search, setSearch] = useState('');
    const [active, setActive] = useState(0);   // підсвічений рядок для клавіатури
    const [dropUp, setDropUp] = useState(false);
    const ref = useRef(null);
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const isTouch = useIsTouch();

    useEffect(() => {
        const onOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
                if (autoOpen) onCancel?.();
            }
        };
        document.addEventListener('mousedown', onOutside);
        return () => document.removeEventListener('mousedown', onOutside);
    }, [autoOpen, onCancel]);

    // Список унизу вікна інакше ховається під край модалки й доводиться скролити.
    // Дивимось, чи є місце під полем, і за потреби розкриваємо вгору.
    useEffect(() => {
        if (!open || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setDropUp(window.innerHeight - r.bottom < 280 && r.top > 300);
        setActive(0);
    }, [open]);

    const selected = options.find(o => String(o.id) === String(value));
    const q = search.trim().toLowerCase();
    const exact = options.some(o => o.label.toLowerCase() === q);

    // Показуємо найсхожіші зверху: спершу збіг із початку рядка, потім будь-де.
    // Так «гощ» одразу дає «Гощанська ЗОШ», а не тридцятий рядок списку.
    const filtered = useMemo(() => {
        if (!q) return options;
        const starts = [], contains = [];
        options.forEach(o => {
            const label = o.label.toLowerCase();
            const at = label.indexOf(q);
            if (at === 0) starts.push(o);
            else if (at > 0) contains.push({ o, at });
        });
        contains.sort((a, b) => a.at - b.at);
        return [...starts, ...contains.map(c => c.o)];
    }, [options, q]);

    const canAdd = !!onAddNew && !!q && !exact;

    const choose = (o) => {
        onChange(o.id);
        setSearch('');
        setActive(0);
        if (keepOpen && !isTouch) inputRef.current?.focus();
        else setOpen(false);
    };

    // Підсвічений рядок тримаємо у видимій частині списку
    useEffect(() => {
        listRef.current?.children?.[active]?.scrollIntoView({ block: 'nearest' });
    }, [active, filtered.length]);

    // Робота з клавіатури: стрілки — вибір, Enter — підтвердити,
    // Escape — закрити ЛИШЕ список, а не всю модалку (тому stopPropagation).
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            if (open) {
                e.stopPropagation(); e.preventDefault();
                setOpen(false); setSearch('');
                if (autoOpen) onCancel?.();
            }
            return;
        }
        if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); setOpen(true);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive(i => Math.min(i + 1, filtered.length - 1 + (canAdd ? 1 : 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive(i => Math.max(i - 1, 0));
        } else if (e.key === 'Home') {
            e.preventDefault(); setActive(0);
        } else if (e.key === 'End') {
            e.preventDefault(); setActive(filtered.length - 1 + (canAdd ? 1 : 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (canAdd && active >= filtered.length) { onAddNew(q); setOpen(false); setSearch(''); }
            else if (filtered[active]) choose(filtered[active]);
        } else if (e.key === 'Tab') {
            setOpen(false);
        }
    };

    return (
        <div className={`relative w-full ${className}`} ref={ref} onKeyDown={onKeyDown}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(v => !v)}
                className={`w-full h-10 px-3 border rounded-lg flex items-center justify-between gap-2 text-[13px] transition-colors
                    focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500
                    ${disabled
                        ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-white border-slate-300 hover:border-indigo-400 cursor-pointer'}`}
            >
                <span className="flex items-center gap-2 truncate">
                    {Icon && <Icon size={12} className={selected ? 'text-indigo-500' : 'text-slate-400'} />}
                    <span className={`truncate ${selected ? 'text-slate-800 font-semibold' : 'text-slate-400'}`}>
                        {selected ? selected.label : placeholder}
                    </span>
                </span>
                <FaChevronDown size={10} className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: dropUp ? -4 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: dropUp ? -4 : 4 }}
                        transition={{ duration: .13 }}
                        className={`absolute z-[130] w-full bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-64
                            ${dropUp ? 'bottom-full mb-1' : 'mt-1'}`}
                    >
                        <div className="p-1.5 border-b border-slate-100 bg-slate-50 flex-shrink-0">
                            {/* На сенсорі не фокусуємо: клавіатура має підніматись,
                                коли людина сама торкнеться поля, а не сама собою */}
                            <input
                                ref={inputRef}
                                autoFocus={!isTouch} type="text" value={search} placeholder={searchPlaceholder}
                                onChange={e => { setSearch(e.target.value); setActive(0); }}
                                className="w-full h-9 px-2.5 bg-white border border-slate-200 rounded-md text-[13px] outline-none focus:border-indigo-500"
                            />
                        </div>
                        <div ref={listRef} className="overflow-y-auto flex-1 p-1 custom-scrollbar">
                            {filtered.length ? filtered.map((o, i) => (
                                <button
                                    key={o.id} type="button"
                                    onMouseEnter={() => setActive(i)}
                                    onClick={() => choose(o)}
                                    className={`w-full text-left px-2.5 py-2 rounded-md text-[13px] transition-colors
                                        ${String(o.id) === String(value) ? 'text-indigo-700 font-bold' : 'text-slate-700'}
                                        ${i === active ? 'bg-indigo-50' : ''}`}
                                >
                                    {o.label}
                                </button>
                            )) : (
                                <div className="px-3 py-4 text-[12.5px] text-slate-400 text-center">Нічого не знайдено</div>
                            )}
                        </div>
                        {!isTouch && (
                            <div className="px-2 py-1 border-t border-slate-100 bg-white flex-shrink-0 text-[10px] text-slate-400 flex items-center gap-2">
                                <span>↑↓ вибір</span>
                                <span>Enter {keepOpen ? 'додати' : 'обрати'}</span>
                                <span>Esc закрити</span>
                            </div>
                        )}
                        {canAdd && (
                            <div className="p-1.5 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                                <button
                                    type="button"
                                    onMouseEnter={() => setActive(filtered.length)}
                                    onClick={() => { onAddNew(search.trim()); setOpen(false); setSearch(''); }}
                                    className={`w-full h-9 rounded-md text-[12.5px] font-bold transition-colors inline-flex items-center justify-center gap-2
                                        ${active >= filtered.length
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white'}`}
                                >
                                    <FaPlus size={10} /> {addLabel} «{search.trim()}»
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export const EmptyState = ({ icon: Icon, title, hint, children }) => (
    <div className="flex-1 flex flex-col items-center justify-center py-12 px-6 text-center">
        {Icon && <Icon className="text-5xl text-slate-200 mb-3" />}
        <h3 className="text-sm font-bold text-slate-600">{title}</h3>
        {hint && <p className="text-[12px] text-slate-400 mt-1 mb-4 max-w-sm leading-relaxed">{hint}</p>}
        {children && <div className="flex flex-wrap gap-2 justify-center mt-1">{children}</div>}
    </div>
);

export const Skeleton = ({ rows = 5 }) => (
    <div className="p-3 space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
        ))}
    </div>
);

export const Pagination = ({ page, pages, total, from, to, onPage }) => {
    if (!total) return null;
    return (
        <div className={`${T.card} px-3 py-2 flex items-center justify-between gap-3 flex-none`}>
            <span className="text-[11.5px] text-slate-500 font-medium tabular-nums">
                <b className="text-slate-800">{from}–{to}</b> із <b className="text-slate-800">{total}</b>
            </span>
            <div className="flex items-center gap-1.5">
                <IconBtn variant="outline" icon={FaChevronLeft} label="Попередня" disabled={page === 1} onClick={() => onPage(page - 1)} />
                <span className="px-2.5 h-8 inline-flex items-center bg-slate-50 border border-slate-200 rounded-lg text-[11.5px] font-bold text-slate-700 tabular-nums">
                    {page} / {pages || 1}
                </span>
                <IconBtn variant="outline" icon={FaChevronRight} label="Наступна" disabled={page >= pages} onClick={() => onPage(page + 1)} />
            </div>
        </div>
    );
};

/* =====================================================================
 *  МОДАЛКА
 *  На десктопі — по центру. На телефоні — «шухляда» знизу:
 *  великий палець дістає до кнопок, ніщо не тікає під клавіатуру.
 * ===================================================================== */

// На великому екрані вузька модалка змушує гортати там, де все могло б
// поміститись одразу. Тому на ПК даємо помітно більше ширини.
const SIZES = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-xl  lg:max-w-2xl',
    lg: 'sm:max-w-3xl lg:max-w-4xl',
    xl: 'sm:max-w-5xl lg:max-w-6xl',
};

// Стос відкритих модалок. Esc має закривати лише верхню, інакше одне
// натискання згортає одразу і підтвердження, і форму під ним.
const modalStack = [];

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * toolbar — смуга під заголовком, яка НЕ прокручується разом із вмістом.
 * Саме сюди йдуть фільтри, підсумки й вкладки. Робити їх `sticky`
 * усередині прокрутки не варто: вміст накладається зверху, і виходить
 * каша з двох шарів.
 */
export const Modal = ({
    isOpen, onClose, title, subtitle, tone = 'neutral', size = 'md',
    toolbar, footer, children,
    onSubmit,               // Ctrl+Enter — головна дія вікна
    submitHint,             // що саме зробить Ctrl+Enter (текст у підвалі)
}) => {
    const isTouch = useIsTouch();
    const boxRef = useRef(null);
    const downOnBackdrop = useRef(false);
    const tokenRef = useRef(null);
    if (!tokenRef.current) tokenRef.current = {};

    // Esc закриває верхню модалку; поки відкрито — фон не скролиться
    useEffect(() => {
        if (!isOpen) return;
        const token = tokenRef.current;
        modalStack.push(token);

        const onKey = (e) => {
            if (modalStack[modalStack.length - 1] !== token) return;   // під нами — не наша черга
            if (e.key === 'Escape') { onClose(); return; }
            if (onSubmit && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); onSubmit();
            }
        };
        document.addEventListener('keydown', onKey);

        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            const at = modalStack.indexOf(token);
            if (at >= 0) modalStack.splice(at, 1);
            document.removeEventListener('keydown', onKey);
            // Фон розблоковуємо лише коли закрилась остання модалка
            document.body.style.overflow = modalStack.length ? 'hidden' : prev;
        };
    }, [isOpen, onClose, onSubmit]);

    // Клавіатура на ПК: фокус повертається у вікно, Tab ходить по колу
    // всередині нього, а після закриття — назад на кнопку, що його відкрила.
    useEffect(() => {
        if (!isOpen || isTouch) return;
        const returnTo = document.activeElement;
        const t = setTimeout(() => {
            const box = boxRef.current;
            if (!box || box.contains(document.activeElement)) return;
            // Свідомо оминаємо type=number: фокус на полі кількості
            // перетворює прокрутку колесом на зміну числа
            const first = box.querySelector(
                'input[type="text"]:not([disabled]),input[type="search"]:not([disabled]),input:not([type]):not([disabled]),textarea:not([disabled])'
            );
            (first || box).focus?.();
        }, 60);
        return () => { clearTimeout(t); returnTo?.focus?.(); };
    }, [isOpen, isTouch]);

    const trapTab = (e) => {
        if (e.key !== 'Tab' || !boxRef.current) return;
        const list = Array.from(boxRef.current.querySelectorAll(FOCUSABLE))
            .filter(el => el.offsetParent !== null);
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={{ duration: .15 }}
                    // Закриваємо лише коли натиск І відпускання були на тлі.
                    // Інакше виділення тексту з протягуванням за край вікна
                    // закриває його разом із усім, що людина встигла ввести.
                    onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
                    onClick={e => { if (e.target === e.currentTarget && downOnBackdrop.current) onClose(); }}
                    className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 lg:p-6"
                >
                    <motion.div
                        ref={boxRef}
                        tabIndex={-1}
                        onKeyDown={trapTab}
                        initial={isTouch ? { y: '100%' } : { opacity: 0, scale: .97, y: 8 }}
                        animate={isTouch ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
                        exit={isTouch ? { y: '100%' } : { opacity: 0, scale: .97, y: 8 }}
                        transition={{ type: 'tween', ease: 'easeOut', duration: isTouch ? .22 : .16 }}
                        className={`w-full ${SIZES[size]} bg-white rounded-t-2xl sm:rounded-xl shadow-2xl outline-none
                            flex flex-col max-h-[92dvh] sm:max-h-[88vh] lg:max-h-[90vh] overflow-hidden`}
                    >
                        {/* Смужка-«ручка» — підказка, що шухляду можна закрити */}
                        <div className="sm:hidden pt-2 pb-1 flex justify-center flex-none">
                            <span className="w-9 h-1 rounded-full bg-slate-300" />
                        </div>

                        <div className={`px-4 lg:px-6 py-3 lg:py-3.5 border-b border-slate-200 flex items-start justify-between gap-3 flex-none
                            ${tone === 'neutral' ? 'bg-white' : TONE[tone].chip.replace(/border-\S+/, '')}`}>
                            <div className="min-w-0">
                                <h2 className={`text-[15px] lg:text-base font-bold leading-tight ${tone === 'neutral' ? 'text-slate-900' : TONE[tone].text}`}>{title}</h2>
                                {subtitle && <p className="text-[11.5px] lg:text-xs text-slate-500 mt-0.5 leading-snug">{subtitle}</p>}
                            </div>
                            <IconBtn variant="soft" icon={FaTimes} label="Закрити (Esc)" onClick={onClose} />
                        </div>

                        {toolbar && (
                            <div className="px-4 lg:px-6 py-2.5 border-b border-slate-200 bg-white flex-none">
                                {toolbar}
                            </div>
                        )}

                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 lg:px-6 py-4 lg:py-5">{children}</div>

                        {footer && (
                            <div className="px-4 lg:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 flex-none pb-safe">
                                {submitHint && (
                                    <span className="hidden lg:block mr-auto text-[11px] text-slate-400">
                                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-sans font-bold text-slate-500">Ctrl</kbd>
                                        {' + '}
                                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-sans font-bold text-slate-500">Enter</kbd>
                                        {' — '}{submitHint}
                                    </span>
                                )}
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

/* =====================================================================
 *  ПІДТВЕРДЖЕННЯ
 *  Замість window.confirm: видно, ЩО саме станеться, і це можна скасувати.
 * ===================================================================== */

const ConfirmCtx = createContext(null);
export const useConfirm = () => useContext(ConfirmCtx);

export const ConfirmProvider = ({ children }) => {
    const [state, setState] = useState(null);
    const resolver = useRef(null);
    const autoFocus = useAutoFocus();

    // Колесо миші над полем «кількість» непомітно змінює число: людина
    // гортає список позицій, а разом зі списком «прокручується» і кількість.
    // Прибираємо фокус — колесо знову лише гортає.
    useEffect(() => {
        const onWheel = (e) => {
            const el = document.activeElement;
            if (el === e.target && el?.tagName === 'INPUT' && el.type === 'number') el.blur();
        };
        document.addEventListener('wheel', onWheel, { passive: true });
        return () => document.removeEventListener('wheel', onWheel);
    }, []);

    const confirm = useCallback((opts) => new Promise(resolve => {
        resolver.current = resolve;
        setState({ tone: 'danger', confirmLabel: 'Підтвердити', ...opts });
    }), []);

    const finish = (ok) => { resolver.current?.(ok); resolver.current = null; setState(null); };

    return (
        <ConfirmCtx.Provider value={confirm}>
            {children}
            <Modal
                isOpen={!!state}
                onClose={() => finish(false)}
                title={state?.title || 'Підтвердіть дію'}
                tone={state?.tone}
                size="sm"
                onSubmit={() => finish(true)}
                footer={<>
                    {/* Фокус із клавіатури: на безпечній дії — на «підтвердити»,
                        на небезпечній — на «скасувати», щоб Enter не видаляв зопалу */}
                    <Btn variant="outline" onClick={() => finish(false)}
                        autoFocus={autoFocus && state?.tone === 'danger'}>Скасувати</Btn>
                    <Btn variant={state?.tone === 'danger' ? 'danger' : 'accent'} onClick={() => finish(true)}
                        autoFocus={autoFocus && state?.tone !== 'danger'}>
                        {state?.confirmLabel}
                    </Btn>
                </>}
            >
                {state?.message && <p className="text-[13px] text-slate-700 leading-relaxed">{state.message}</p>}
                {state?.details?.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                        {state.details.map((d, i) => (
                            <li key={i} className={`${T.inset} px-3 py-2 text-[12.5px] text-slate-700 font-medium`}>{d}</li>
                        ))}
                    </ul>
                )}
            </Modal>
        </ConfirmCtx.Provider>
    );
};

/* =====================================================================
 *  ПОМИЛКИ POSTGRES ЛЮДСЬКОЮ МОВОЮ
 *  «duplicate key value violates unique constraint …» нікому не допомагає.
 * ===================================================================== */

const PG_MESSAGES = {
    '23505': 'Такий запис уже існує — перевірте SKU або номер.',
    '23503': 'Запис пов’язаний з іншими даними, тому дію заблоковано.',
    '23514': 'Значення виходить за допустимі межі — перевірте кількість.',
    '23502': 'Не заповнено обов’язкове поле.',
    '22P02': 'Некоректне значення в одному з полів.',
    '42501': 'Недостатньо прав для цієї дії.',
};

export const humanError = (error) => {
    if (!error) return 'Невідома помилка';
    // Помилки, кинуті нашими RPC через RAISE — вже написані для людей
    if (error.code === 'P0001' && error.message) return error.message;
    if (PG_MESSAGES[error.code]) return PG_MESSAGES[error.code];
    const msg = error.message || String(error);
    if (/JWT|token|expired/i.test(msg)) return 'Сесія завершилась — перезайдіть у систему.';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Немає зв’язку із сервером. Перевірте інтернет.';
    return msg;
};

/* =====================================================================
 *  РОЗМІР ЕКРАНА
 * ===================================================================== */

/**
 * Сенсорний ввід (палець, а не миша).
 * Саме за цим, а не за шириною екрана, вирішуємо, чи можна ставити
 * autoFocus: на телефоні він піднімає клавіатуру одразу при відкритті
 * вікна, і та закриває пів екрана ще до того, як людина щось прочитала.
 */
export const useIsTouch = () => {
    const [touch, setTouch] = useState(
        () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
    );
    useEffect(() => {
        if (!window.matchMedia) return;
        const mq = window.matchMedia('(pointer: coarse)');
        const handler = (e) => setTouch(e.matches);
        setTouch(mq.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return touch;
};

/**
 * Значення для atribute autoFocus: true на десктопі, false на сенсорі.
 * Використовувати як autoFocus={useAutoFocus()}.
 */
export const useAutoFocus = () => !useIsTouch();

export const useIsMobile = (breakpoint = 768) => {
    const [isMobile, setIsMobile] = useState(
        typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
    );
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const handler = (e) => setIsMobile(e.matches);
        setIsMobile(mq.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, [breakpoint]);
    return isMobile;
};

/* Число без «хвостів» плаваючої крапки: 12.300000000000001 → 12.3 */
export const num = (v, digits = 3) => {
    const n = Number(v) || 0;
    const f = 10 ** digits;
    const r = Math.round(n * f) / f;
    return Number.isInteger(r) ? String(r) : String(r);
};

export const Spinner = memo(({ className = '' }) => (
    <span className={`inline-block w-3.5 h-3.5 border-2 border-current border-r-transparent rounded-full animate-spin ${className}`} />
));
