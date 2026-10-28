// =====================================================================
//  Швидкий пошук (Ctrl+K / ⌘K).
//
//  Одне поле — і сторінки меню, і об'єкти (за номером СЕС чи назвою),
//  і клієнти (ім'я, компанія, телефон), і товари складу (назва, SKU).
//  Стрілки — вибір, Enter — відкрити, Esc — закрити.
// =====================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaSearch, FaHardHat, FaUser, FaBox, FaArrowRight, FaHandshake } from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import { navItems } from './navigation';
import { getObjectStatus } from './domain/objects';

// Символи, що ламають фільтр PostgREST «or(...)», прибираємо з запиту
const clean = (q) => q.replace(/[%,()*\\]/g, ' ').trim();

const SECTION_LABELS = { pages: 'Сторінки', objects: "Об'єкти", clients: 'Клієнти', goods: 'Склад' };

/* Пошук живе один на всю програму (App.js), тож працює і в CRM, і в
   «Складі» та «Працівниках». Кнопки «Пошук» лише надсилають подію. */
const OPEN_EVENT = 'kcore:open-search';
export const openSearch = () => window.dispatchEvent(new Event(OPEN_EVENT));

export function SearchHost() {
    const { user, access } = useAuth();
    const { pathname } = useLocation();
    const enabled = !!user && access === 'ok' && pathname !== '/';
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!enabled) { setOpen(false); return undefined; }
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
                e.preventDefault();
                setOpen(v => !v);
            }
        };
        const onOpen = () => setOpen(true);
        window.addEventListener('keydown', onKey);
        window.addEventListener(OPEN_EVENT, onOpen);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener(OPEN_EVENT, onOpen);
        };
    }, [enabled]);

    return <CommandPalette open={open && enabled} onClose={() => setOpen(false)} />;
}

export default function CommandPalette({ open, onClose }) {
    const navigate = useNavigate();
    const auth = useAuth();
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const [query, setQuery] = useState('');
    const [found, setFound] = useState({ objects: [], clients: [], goods: [] });
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState(0);

    useEffect(() => {
        if (!open) return;
        setQuery('');
        setFound({ objects: [], clients: [], goods: [] });
        setActive(0);
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [open]);

    // Пошук у базі — з невеликою паузою, щоб не смикати її на кожну літеру
    useEffect(() => {
        if (!open) return;
        const q = clean(query);
        if (q.length < 2) { setFound({ objects: [], clients: [], goods: [] }); setLoading(false); return; }

        let alive = true;
        setLoading(true);
        const timer = setTimeout(async () => {
            const isNum = /^\d+$/.test(q);
            const like = `%${q}%`;
            const [objects, clients, goods] = await Promise.all([
                supabase.from('installations')
                    .select('custom_id, name, status, is_subcontract, client:clients(name, company_name)')
                    .or(isNum ? `custom_id.eq.${q},name.ilike.${like}` : `name.ilike.${like}`)
                    .order('created_at', { ascending: false }).limit(6),
                supabase.from('clients')
                    .select('custom_id, name, company_name, phone, populated_place')
                    .or(`name.ilike.${like},company_name.ilike.${like},phone.ilike.${like}${isNum ? `,custom_id.eq.${q}` : ''}`)
                    .limit(6),
                supabase.from('nomenclature')
                    .select('id, name, brand, sku')
                    .eq('is_active', true)
                    .or(`name.ilike.${like},sku.ilike.${like},brand.ilike.${like}`)
                    .limit(6),
            ]);
            if (!alive) return;
            setFound({
                objects: objects.data || [],
                clients: clients.data || [],
                goods: goods.data || [],
            });
            setLoading(false);
            setActive(0);
        }, 200);
        return () => { alive = false; clearTimeout(timer); };
    }, [query, open]);

    // Усі результати одним списком — для стрілок і Enter
    const results = useMemo(() => {
        const q = query.trim().toLowerCase();
        const pages = navItems(auth)
            .filter(i => !q || i.label.toLowerCase().includes(q) || (i.group || '').toLowerCase().includes(q))
            .slice(0, q ? 6 : 8)
            .map(i => ({ section: 'pages', key: `p-${i.key}`, icon: i.icon, title: i.label, sub: i.group, to: i.to }));

        const objects = found.objects.map(o => ({
            section: 'objects', key: `o-${o.custom_id}`,
            icon: o.is_subcontract ? FaHandshake : FaHardHat,
            title: o.name || `Об'єкт #${o.custom_id}`,
            sub: [`СЕС-${o.custom_id}`, o.client?.company_name || o.client?.name, getObjectStatus(o.status).label].filter(Boolean).join(' · '),
            to: o.is_subcontract ? `/partner-project/${o.custom_id}` : `/project/${o.custom_id}`,
        }));
        const clients = found.clients.map(c => ({
            section: 'clients', key: `c-${c.custom_id}`, icon: FaUser,
            title: c.company_name ? `${c.name} · ${c.company_name}` : c.name,
            sub: [`ID ${c.custom_id}`, c.phone, c.populated_place].filter(Boolean).join(' · '),
            to: `/clients/${c.custom_id}`,
        }));
        const goods = found.goods.map(g => ({
            section: 'goods', key: `g-${g.id}`, icon: FaBox,
            title: g.brand && !g.name.toLowerCase().startsWith(g.brand.toLowerCase()) ? `${g.brand} ${g.name}` : g.name,
            sub: g.sku ? `SKU ${g.sku}` : 'Залишки на складі',
            to: `/inventory?tab=stock&q=${encodeURIComponent(g.name)}`,
        }));
        // Коли щось шукають — спершу дані, потім сторінки
        return q.length >= 2 ? [...objects, ...clients, ...goods, ...pages] : pages;
    }, [query, found, auth]);

    const openResult = (r) => { if (!r) return; navigate(r.to); onClose(); };

    const onKeyDown = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); openResult(results[active]); }
    };

    useEffect(() => {
        listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    if (!open) return null;

    let lastSection = null;
    const showEmpty = clean(query).length >= 2 && !loading && results.length === 0;

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-start justify-center p-3 sm:pt-[12vh] bg-slate-900/40" onMouseDown={onClose}>
            <div
                role="dialog" aria-label="Пошук"
                onMouseDown={e => e.stopPropagation()}
                className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80dvh]"
            >
                <div className="flex items-center gap-3 px-4 border-b border-slate-200">
                    <FaSearch className="text-slate-400 flex-shrink-0" size={14} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Номер СЕС, клієнт, телефон, товар або сторінка…"
                        className="flex-1 h-12 outline-none text-[15px] text-slate-800 placeholder:text-slate-400 bg-transparent"
                    />
                    {loading && <span className="w-3.5 h-3.5 border-2 border-slate-300 border-r-transparent rounded-full animate-spin flex-shrink-0" />}
                    <kbd className="hidden sm:inline text-[10.5px] font-mono border border-slate-200 rounded px-1.5 py-0.5 text-slate-400">Esc</kbd>
                </div>

                <div ref={listRef} className="overflow-y-auto custom-scrollbar py-1.5">
                    {showEmpty && (
                        <div className="px-4 py-6 text-center text-[13px] text-slate-400">Нічого не знайдено</div>
                    )}
                    {results.map((r, idx) => {
                        const header = r.section !== lastSection ? SECTION_LABELS[r.section] : null;
                        lastSection = r.section;
                        const on = idx === active;
                        return (
                            <React.Fragment key={r.key}>
                                {header && <div className="px-4 pt-2.5 pb-1 text-[11.5px] font-semibold text-slate-400">{header}</div>}
                                <button
                                    data-idx={idx}
                                    onMouseEnter={() => setActive(idx)}
                                    onClick={() => openResult(r)}
                                    className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${on ? 'bg-indigo-50' : ''}`}
                                >
                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${on ? 'bg-white text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>
                                        <r.icon size={13} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={`block text-[13.5px] truncate ${on ? 'text-indigo-800 font-semibold' : 'text-slate-800 font-medium'}`}>{r.title}</span>
                                        {r.sub && <span className="block text-[12px] text-slate-400 truncate">{r.sub}</span>}
                                    </span>
                                    {on && <FaArrowRight size={11} className="text-indigo-400 flex-shrink-0" />}
                                </button>
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400">
                    <span>↑↓ вибір</span><span>Enter відкрити</span><span>Esc закрити</span>
                </div>
            </div>
        </div>,
        document.body
    );
}
