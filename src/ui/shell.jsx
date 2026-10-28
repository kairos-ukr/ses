// =====================================================================
//  K-CORE · Оболонки сторінок: пункт меню, кнопка пошуку і «робочий
//  простір» (Склад, Працівники) — окремий інтерфейс зі своїм меню.
//
//  Головне меню (Layout) і меню робочих просторів зібрані з тих самих
//  деталей, тож виглядають однаково: біле меню, активний пункт —
//  індиго, текст 14px.
// =====================================================================

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FaArrowLeft, FaSearch, FaEllipsisH, FaTimes } from 'react-icons/fa';

import { useAuth } from '../AuthProvider';
import { openSearch } from '../CommandPalette';
import { homePath } from '../navigation';
import NotificationBell from '../NotificationBell';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

/** Пункт бічного меню */
export const SideNavItem = ({ icon: Icon, label, active, badge = 0, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`w-full flex items-center gap-3 px-3.5 h-9 rounded-xl text-[14px] transition-colors
            ${active
                ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-200'
                : 'text-slate-600 font-medium hover:bg-slate-100 hover:text-slate-900'}`}
    >
        <Icon size={16} className={`flex-shrink-0 ${active ? 'text-white' : 'text-slate-400'}`} />
        <span className="truncate text-left flex-1">{label}</span>
        {badge > 0 && (
            <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center tabular-nums
                ${active ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'}`}>
                {badge}
            </span>
        )}
    </button>
);

/** Кнопка «Пошук Ctrl K» у бічному меню */
export const SideSearchButton = ({ onClick = openSearch }) => (
    <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-2.5 h-10 px-3.5 text-[14px] text-slate-400 border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 rounded-xl transition-colors"
    >
        <FaSearch size={13} />
        <span className="flex-1 text-left">Пошук</span>
        <kbd className="text-[11px] font-mono border border-slate-200 bg-white rounded px-1.5 py-0.5 text-slate-500">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
);

/** Квадратна кнопка-іконка для мобільної шапки */
export const HeaderIconBtn = ({ icon: Icon, label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 flex-shrink-0"
    >
        <Icon size={16} />
    </button>
);

/* =====================================================================
 *  РОБОЧИЙ ПРОСТІР — окремий інтерфейс розділу (Склад, Працівники)
 *
 *  sections   — розділи з navigation.js (уже відфільтровані за роллю)
 *  active     — id відкритого розділу, onSelect(id) — перемкнути
 *  actions    — кнопки праворуч у шапці (пошук у розділі, «Додати…»)
 *  below      — додатковий рядок шапки (напр. пошук на телефоні)
 *  mainClass  — як прокручується вміст (за замовчуванням уся сторінка),
 *  bodyClass  — обгортка розділу (склад гортає таблиці всередині себе)
 * ===================================================================== */

const MAX_BOTTOM = 5;

export function WorkspaceShell({ title, icon: Icon, sections, active, onSelect, actions, below, mainClass, bodyClass, children }) {
    const navigate = useNavigate();
    const auth = useAuth();
    const [moreOpen, setMoreOpen] = useState(false);

    const current = sections.find(s => s.id === active) || sections[0];
    const back = () => navigate(homePath(auth));

    // На телефоні внизу вміщається 5 кнопок; якщо розділів більше — 4 + «Ще»
    const overflow = sections.length > MAX_BOTTOM;
    const bottom = overflow ? sections.slice(0, MAX_BOTTOM - 1) : sections;
    const rest = overflow ? sections.slice(MAX_BOTTOM - 1) : [];
    const restActive = rest.some(s => s.id === active);

    const select = (id) => { setMoreOpen(false); if (id !== active) onSelect(id); };

    return (
        <div className="flex h-[100dvh] w-full bg-slate-100 overflow-hidden text-slate-800">

            {/* --- МЕНЮ РОЗДІЛУ (DESKTOP) --- */}
            <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 h-full flex-shrink-0 z-20">
                <div className="px-5 flex items-center gap-3 border-b border-slate-100 min-h-[72px]">
                    <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                        <Icon size={17} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-[16px] font-bold text-slate-900 leading-tight truncate">{title}</div>
                        <div className="text-[12px] text-slate-400">K-Core</div>
                    </div>
                </div>

                <div className="px-3 pt-3 flex gap-2">
                    <div className="flex-1 min-w-0"><SideSearchButton /></div>
                    <NotificationBell variant="side" />
                </div>

                <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2.5 space-y-0.5">
                    {sections.map(s => (
                        <SideNavItem key={s.id} icon={s.icon} label={s.label} active={s.id === current.id} onClick={() => select(s.id)} />
                    ))}
                </nav>

                <div className="p-3 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={back}
                        className="w-full flex items-center gap-3 px-3.5 h-10 rounded-xl text-[14px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                    >
                        <FaArrowLeft size={14} className="text-slate-400" /> До CRM
                    </button>
                </div>
            </aside>

            {/* --- ОСНОВНА ЧАСТИНА --- */}
            <div className="flex-1 flex flex-col min-w-0 h-full">
                <header className="bg-white border-b border-slate-200 flex-shrink-0 z-30 pt-safe">
                    <div className="px-3 sm:px-5 min-h-[64px] py-2.5 short:min-h-[48px] short:py-1 flex items-center gap-2 sm:gap-3">
                        <span className="lg:hidden"><HeaderIconBtn icon={FaArrowLeft} label="До CRM" onClick={back} /></span>
                        <div className="min-w-0 flex-1">
                            <div className="lg:hidden text-[11.5px] font-semibold text-slate-400 leading-none mb-0.5">{title}</div>
                            <h1 className="text-[17px] sm:text-xl font-bold text-slate-900 tracking-tight leading-tight lg:truncate">{current.title}</h1>
                        </div>
                        {actions}
                        <span className="lg:hidden flex items-center">
                            <NotificationBell variant="header" />
                            <HeaderIconBtn icon={FaSearch} label="Пошук" onClick={openSearch} />
                        </span>
                    </div>
                </header>

                <main className={mainClass || 'flex-1 min-h-0 overflow-y-auto custom-scrollbar pb-24 short:pb-14 lg:pb-0'}>
                    {/* Додатковий рядок (пошук на телефоні) гортається разом зі сторінкою, щоб не з'їдати висоту */}
                    {below}
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={current.id}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.15 }}
                            className={bodyClass || 'min-h-full'}
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>

            {/* --- НИЖНЄ МЕНЮ (ТЕЛЕФОН / ПЛАНШЕТ) --- */}
            <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-40 pb-safe shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
                {bottom.map(s => {
                    const on = s.id === current.id;
                    return (
                        <button key={s.id} type="button" onClick={() => select(s.id)} aria-label={s.label}
                            className="flex-1 min-w-0 flex flex-col items-center gap-1 pt-2.5 pb-2 short:py-2">
                            <s.icon size={18} className={on ? 'text-indigo-600' : 'text-slate-400'} />
                            <span className={`text-[11px] truncate max-w-full px-1 short:hidden ${on ? 'text-indigo-700 font-semibold' : 'text-slate-500 font-medium'}`}>{s.label}</span>
                        </button>
                    );
                })}
                {overflow && (
                    <button type="button" onClick={() => setMoreOpen(true)} aria-label="Ще"
                        className="flex-1 min-w-0 flex flex-col items-center gap-1 pt-2.5 pb-2 short:py-2">
                        <FaEllipsisH size={18} className={restActive ? 'text-indigo-600' : 'text-slate-400'} />
                        <span className={`text-[11px] short:hidden ${restActive ? 'text-indigo-700 font-semibold' : 'text-slate-500 font-medium'}`}>Ще</span>
                    </button>
                )}
            </nav>

            {/* «Ще» — решта розділів знизу екрана */}
            <AnimatePresence>
                {moreOpen && (
                    <>
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setMoreOpen(false)} className="fixed inset-0 bg-black/40 z-50 lg:hidden" />
                        <motion.div
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: 'tween', ease: 'easeOut', duration: 0.22 }}
                            className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl lg:hidden pb-safe"
                        >
                            <div className="flex items-center justify-between px-4 pt-3 pb-1">
                                <span className="text-[13px] font-semibold text-slate-500">{title}</span>
                                <HeaderIconBtn icon={FaTimes} label="Закрити" onClick={() => setMoreOpen(false)} />
                            </div>
                            <div className="px-3 pb-4 space-y-1">
                                {rest.map(s => (
                                    <SideNavItem key={s.id} icon={s.icon} label={s.label} active={s.id === current.id} onClick={() => select(s.id)} />
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
