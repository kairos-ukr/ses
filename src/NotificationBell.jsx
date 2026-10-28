// =====================================================================
//  Дзвіночок сповіщень (етап 5, п.21)
//
//  Ті самі події, що людині приходять у Telegram: доручили задачу,
//  призначили на етап, дедлайн, платіж за графіком, перевищено норму
//  етапу, нагадування забезпечення. Дані — app_notifications
//  (db/2026-10_app_notifications.sql). Лічильник оновлюється раз на
//  хвилину і щоразу, коли людина повертається у вкладку.
// =====================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    FaBell, FaTasks, FaHardHat, FaMoneyBillWave, FaStopwatch, FaShieldAlt, FaBoxes, FaClock, FaCheckDouble, FaTimes,
} from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { hasNotifications } from './utils/features';
import { PushDeviceRow } from './ui/PushPrompt';

const KIND_ICON = {
    task_assigned: FaTasks,
    task_deadline: FaClock,
    stage_assigned: FaHardHat,
    payment_due: FaMoneyBillWave,
    stage_norm: FaStopwatch,
    stage_norm_digest: FaStopwatch,
    supply_alert: FaShieldAlt,
    low_stock: FaBoxes,
    schedule: FaClock,
    object_assigned: FaHardHat,
};

const ago = (ts) => {
    const diff = (Date.now() - new Date(ts).getTime()) / 60000;
    if (diff < 1) return 'щойно';
    if (diff < 60) return `${Math.floor(diff)} хв тому`;
    if (diff < 24 * 60) return `${Math.floor(diff / 60)} год тому`;
    if (diff < 48 * 60) return 'вчора';
    return new Date(ts).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
};

const POLL_MS = 60000;
// Дзвіночків на сторінці два (меню і шапка телефона) — прочитане в одному оновлює інший
const CHANGED = 'kcore:notifications-changed';

/**
 * variant: 'side' — квадратна кнопка поруч із пошуком у бічному меню;
 *          'header' — іконка у верхній панелі телефона.
 */
export default function NotificationBell({ variant = 'side' }) {
    const navigate = useNavigate();
    const { employee } = useAuth();
    const empId = employee?.id ?? null;

    const [ready, setReady] = useState(false);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const panelRef = useRef(null);
    const btnRef = useRef(null);

    useEffect(() => { hasNotifications().then(setReady); }, []);

    const loadCount = useCallback(async () => {
        if (!ready || !empId) return;
        const { count } = await supabase.from('app_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('employee_id', empId).is('read_at', null);
        setUnread(count || 0);
    }, [ready, empId]);

    const loadList = useCallback(async () => {
        if (!ready || !empId) return;
        setLoading(true);
        const { data } = await supabase.from('app_notifications')
            .select('id, kind, title, body, link, created_at, read_at')
            .eq('employee_id', empId).order('created_at', { ascending: false }).limit(40);
        setItems(data || []);
        setLoading(false);
    }, [ready, empId]);

    // Лічильник: зараз, раз на хвилину і коли людина повертається у вкладку
    useEffect(() => {
        if (!ready || !empId) return undefined;
        loadCount();
        const t = setInterval(() => { if (!document.hidden) loadCount(); }, POLL_MS);
        const onVisible = () => { if (!document.hidden) loadCount(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener(CHANGED, loadCount);
        return () => {
            clearInterval(t);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener(CHANGED, loadCount);
        };
    }, [ready, empId, loadCount]);

    useEffect(() => { if (open) loadList(); }, [open, loadList]);

    // Клік поза панеллю чи Escape — закрити
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('pointerdown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const markRead = async (ids) => {
        if (!ids.length) return;
        const now = new Date().toISOString();
        setItems(prev => prev.map(n => (ids.includes(n.id) ? { ...n, read_at: now } : n)));
        setUnread(u => Math.max(0, u - ids.length));
        await supabase.from('app_notifications').update({ read_at: now }).in('id', ids);
        window.dispatchEvent(new Event(CHANGED));
    };

    const openItem = (n) => {
        if (!n.read_at) markRead([n.id]);
        setOpen(false);
        if (n.link) navigate(n.link);
    };

    if (!ready || !empId) return null;

    const unreadIds = items.filter(n => !n.read_at).map(n => n.id);
    const badge = unread > 99 ? '99+' : unread;

    const button = variant === 'side' ? (
        <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)}
            aria-label={`Сповіщення${unread ? `: ${unread} нових` : ''}`} title="Сповіщення"
            className={`relative w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-xl border transition-colors
                ${open ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white hover:border-slate-300'}`}>
            <FaBell size={14} />
            {unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10.5px] font-bold flex items-center justify-center tabular-nums">{badge}</span>
            )}
        </button>
    ) : (
        <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)}
            aria-label={`Сповіщення${unread ? `: ${unread} нових` : ''}`}
            className="relative w-10 h-10 flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 flex-shrink-0">
            <FaBell size={16} />
            {unread > 0 && (
                <span className="absolute top-1 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">{badge}</span>
            )}
        </button>
    );

    const panel = open && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Сповіщення"
            className="fixed z-[140] inset-x-2 top-14 lg:inset-x-auto lg:left-[268px] lg:top-3 lg:w-[400px] max-h-[80dvh] bg-white rounded-xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 mr-auto">Сповіщення</h2>
                {unreadIds.length > 0 && (
                    <button type="button" onClick={() => markRead(unreadIds)}
                        className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 hover:underline">
                        <FaCheckDouble size={11} /> Прочитати все
                    </button>
                )}
                <button type="button" onClick={() => setOpen(false)} aria-label="Закрити"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100">
                    <FaTimes size={12} />
                </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar">
                {loading && !items.length ? (
                    <div className="px-4 py-8 text-center text-[13px] text-slate-400">Завантаження…</div>
                ) : items.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                        <FaBell className="mx-auto text-slate-200 mb-2" size={28} />
                        <div className="text-[13.5px] font-semibold text-slate-600">Сповіщень немає</div>
                        <div className="text-[12.5px] text-slate-400 mt-0.5">Тут з'являться задачі, етапи й нагадування для вас</div>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {items.map(n => {
                            const Icon = KIND_ICON[n.kind] || FaBell;
                            return (
                                <li key={n.id}>
                                    <button type="button" onClick={() => openItem(n)}
                                        className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-slate-50 transition-colors ${n.read_at ? '' : 'bg-indigo-50/40'}`}>
                                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${n.read_at ? 'bg-slate-100 text-slate-400' : 'bg-indigo-100 text-indigo-600'}`}>
                                            <Icon size={13} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="flex items-baseline gap-2">
                                                <span className={`text-[13.5px] leading-snug flex-1 ${n.read_at ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>{n.title}</span>
                                                <span className="text-[11px] text-slate-400 whitespace-nowrap">{ago(n.created_at)}</span>
                                            </span>
                                            {n.body && <span className="block text-[12.5px] text-slate-500 mt-0.5 whitespace-pre-line line-clamp-3">{n.body}</span>}
                                        </span>
                                        {!n.read_at && <span className="w-2 h-2 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            <PushDeviceRow />
        </div>,
        document.body
    );

    return <>{button}{panel}</>;
}
