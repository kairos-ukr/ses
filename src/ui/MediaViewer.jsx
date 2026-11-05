// =====================================================================
//  K-CORE · Перегляд фото й файлів у самій програмі
//
//  Власник 04.11: фото й файли звіту мають відкриватися у програмі, а
//  не окремим посиланням. Тож натиснули мініатюру — фото на весь екран:
//  гортання стрілками, клавішами ← → і свайпом, лічильник «3 з 12»,
//  стрічка мініатюр знизу, подвійний дотик чи клік — збільшити й
//  роздивитися. Файл (PDF, документ) — вбудований перегляд Google Диска.
//  «Відкрити на Диску» лишається для завантаження чи друку.
//
//  Фото — велика мініатюра Диска (thumbnail?sz=w2000), як і маленькі в
//  сітці, тож працює для файлів, відкритих за посиланням. Не вдалося —
//  показуємо вбудований перегляд Диска.
//
//    <PhotoThumbs photos={urls} fileIds={ids} />            — сітка + перегляд
//    <MediaViewer items={[{ fid, url, name, kind }]} index={0} onClose={…} />
//    toMediaItems(urls, ids)                                — фото звіту → items
// =====================================================================

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    FaChevronLeft, FaChevronRight, FaTimes, FaExternalLinkAlt, FaSearchPlus, FaSearchMinus, FaFileAlt,
} from 'react-icons/fa';

/** Ідентифікатор файлу Диска з посилання (/d/<id>/ або ?id=<id>) */
export const driveFileId = (url) =>
    (String(url || '').match(/\/d\/([^/?#]+)/) || String(url || '').match(/[?&]id=([^&#]+)/) || [])[1] || null;

export const driveThumbUrl = (fid, size = 360) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w${size}-h${size}`;
const bigUrl = (fid) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w2000-h2000`;
const previewUrl = (fid) => `https://drive.google.com/file/d/${encodeURIComponent(fid)}/preview`;
const openUrl = (it) => it.url || (it.fid ? `https://drive.google.com/file/d/${encodeURIComponent(it.fid)}/view` : null);

/** Фото звіту: масив посилань + паралельний масив id файлів → елементи перегляду */
export const toMediaItems = (photos, fileIds) => (photos || []).map((url, i) => ({
    url, fid: (fileIds || [])[i] || driveFileId(url), kind: 'image',
})).filter(x => x.url || x.fid);

export function MediaViewer({ items, index = 0, onClose }) {
    const n = items.length;
    const [at, setAt] = useState(() => Math.min(Math.max(index, 0), Math.max(n - 1, 0)));
    const [zoom, setZoom] = useState(false);
    const [state, setState] = useState('loading');   // loading | ok | failed
    const start = useRef(null);
    const swiped = useRef(false);   // після свайпу «клік» по тлу не закриває перегляд
    const stripRef = useRef(null);
    const mainRef = useRef(null);
    const item = items[at] || null;
    const asFile = item && (item.kind === 'file' || state === 'failed' || !item.fid);

    // Новий кадр — одразу «вантажиться» і без збільшення (одним оновленням, щоб
    // фото з кешу, що завантажилось миттєво, не лишилось прихованим)
    const show = useCallback((next) => { setAt(next); setZoom(false); setState('loading'); }, []);
    const go = useCallback((d) => { if (n > 1) show(i => (i + d + n) % n); }, [n, show]);

    // Клавіші: ← → гортати, Esc — закрити (і не закривати те, що під переглядом)
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
            else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [go, onClose]);

    // Сторінка під переглядом не гортається
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    // Сусідні фото — заздалегідь, щоб гортання було миттєвим
    useEffect(() => {
        if (n < 2) return;
        [1, -1].forEach(d => {
            const it = items[(at + d + n) % n];
            if (it?.fid && it.kind !== 'file') { const img = new Image(); img.referrerPolicy = 'no-referrer'; img.src = bigUrl(it.fid); }
        });
    }, [at, items, n]);

    // Збільшене фото — одразу з середини, а не з лівого верхнього кута
    useLayoutEffect(() => {
        const m = mainRef.current;
        if (!zoom || !m) return;
        m.scrollLeft = (m.scrollWidth - m.clientWidth) / 2;
        m.scrollTop = (m.scrollHeight - m.clientHeight) / 2;
    }, [zoom]);

    // Поточна мініатюра в стрічці — у полі зору
    useEffect(() => {
        stripRef.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }, [at]);

    if (!item) return null;

    // Свайп ліворуч/праворуч — наступне/попереднє (коли фото не збільшене)
    const onPointerDown = (e) => {
        swiped.current = false;
        if (zoom || e.button > 0) return;
        start.current = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e) => {
        const s = start.current; start.current = null;
        if (!s || zoom) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) swiped.current = true;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
    };
    // Дотик по темному тлу (не по фото) — закрити
    const closeOnBackdrop = (e) => {
        if (e.target !== e.currentTarget || zoom) return;
        if (swiped.current) { swiped.current = false; return; }
        onClose();
    };

    const link = openUrl(item);
    const navBtn = 'absolute top-1/2 -translate-y-1/2 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/45 hover:bg-black/65 text-white flex items-center justify-center backdrop-blur-sm';
    const topBtn = 'h-11 min-w-[44px] px-3 rounded-xl text-white/90 hover:bg-white/10 inline-flex items-center justify-center gap-2 text-[13.5px] font-semibold flex-shrink-0';

    return createPortal(
        <div role="dialog" aria-modal="true" aria-label={n > 1 ? `Перегляд: ${at + 1} з ${n}` : 'Перегляд'}
            className="fixed inset-0 z-[300] bg-slate-950 flex flex-col select-none">
            <header className="flex-shrink-0 flex items-center gap-1 px-2 pt-[max(8px,env(safe-area-inset-top))] pb-2 text-white">
                <div className="min-w-0 flex-1 px-2">
                    {n > 1 && <div className="text-[14px] font-bold tabular-nums">{at + 1} з {n}</div>}
                    {item.name && <div className="text-[12.5px] text-white/70 break-words leading-snug">{item.name}</div>}
                </div>
                {!asFile && (
                    <button type="button" onClick={() => setZoom(z => !z)} className={topBtn}
                        aria-label={zoom ? 'Зменшити' : 'Збільшити'} title={zoom ? 'Зменшити' : 'Збільшити'}>
                        {zoom ? <FaSearchMinus size={15} /> : <FaSearchPlus size={15} />}
                    </button>
                )}
                {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer" className={topBtn} title="Відкрити на Диску">
                        <FaExternalLinkAlt size={13} /><span className="hidden sm:inline">Відкрити на Диску</span>
                    </a>
                )}
                <button type="button" onClick={onClose} className={topBtn} aria-label="Закрити" title="Закрити (Esc)">
                    <FaTimes size={17} />
                </button>
            </header>

            <main ref={mainRef} className={`relative flex-1 min-h-0 ${zoom ? 'overflow-auto' : 'overflow-hidden'}`}
                style={{ touchAction: zoom ? 'auto' : 'pan-y pinch-zoom' }}
                onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { start.current = null; }}
                onClick={closeOnBackdrop}>
                {asFile ? (
                    item.fid ? (
                        <iframe key={`${at}:${item.fid}`} src={previewUrl(item.fid)} title={item.name || 'Файл'} allow="autoplay"
                            className="absolute inset-0 w-full h-full border-0 bg-white sm:inset-x-4 sm:w-[calc(100%-2rem)] sm:rounded-lg" />
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80 px-6 text-center">
                            <FaFileAlt size={36} />
                            <div className="text-[14px]">Цей файл можна відкрити лише на Диску</div>
                        </div>
                    )
                ) : (
                    // Збільшене: центр через m-auto — так до будь-якого краю можна догорнути
                    <div className={zoom ? 'min-w-full min-h-full flex' : 'absolute inset-0 flex items-center justify-center p-1 sm:p-4'}
                        onClick={closeOnBackdrop}>
                        {state === 'loading' && (
                            <span className="absolute w-9 h-9 border-[3px] border-white/25 border-t-white rounded-full animate-spin" aria-hidden />
                        )}
                        <img key={`${at}:${item.fid}`} src={bigUrl(item.fid)} alt={item.name || ''} referrerPolicy="no-referrer" draggable={false}
                            onLoad={() => setState('ok')} onError={() => setState('failed')}
                            onDoubleClick={() => setZoom(z => !z)}
                            className={`${state === 'ok' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-150 ${zoom
                                ? 'm-auto max-w-none w-[200%] sm:w-auto sm:max-w-none cursor-zoom-out'
                                : 'max-w-full max-h-full object-contain cursor-zoom-in'}`} />
                    </div>
                )}

                {n > 1 && !zoom && (<>
                    <button type="button" onClick={() => go(-1)} className={`${navBtn} left-2 sm:left-4`} aria-label="Попереднє">
                        <FaChevronLeft size={16} />
                    </button>
                    <button type="button" onClick={() => go(1)} className={`${navBtn} right-2 sm:right-4`} aria-label="Наступне">
                        <FaChevronRight size={16} />
                    </button>
                </>)}
            </main>

            {n > 1 && (
                <div ref={stripRef} className="flex-shrink-0 flex gap-1.5 overflow-x-auto px-3 pt-2 pb-[max(10px,env(safe-area-inset-bottom))] custom-scrollbar">
                    {items.map((it, i) => (
                        <button key={`${it.fid || it.url}-${i}`} type="button" data-i={i} onClick={() => { if (i !== at) show(i); }}
                            aria-label={`Фото ${i + 1} з ${n}`} aria-current={i === at}
                            className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 bg-white/10 ${i === at ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                            <span className="absolute inset-0 flex items-center justify-center text-white/50"><FaFileAlt size={14} /></span>
                            {it.fid && (
                                <img src={driveThumbUrl(it.fid, 120)} alt="" loading="lazy" referrerPolicy="no-referrer"
                                    className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
}

/**
 * Сітка мініатюр фото, що відкриваються в перегляді.
 * photos — посилання Диска, fileIds — паралельні id (без id — дістаємо з посилання).
 */
export function PhotoThumbs({ photos, fileIds, items: given, className = 'grid grid-cols-4 gap-1.5', tile = 'rounded-lg', size = 300 }) {
    const items = given || toMediaItems(photos, fileIds);
    const [at, setAt] = useState(null);
    if (!items.length) return null;
    return (
        <>
            <div className={className}>
                {items.map((it, i) => (
                    <button key={`${it.fid || it.url}-${i}`} type="button" onClick={() => setAt(i)}
                        aria-label={items.length > 1 ? `Відкрити фото ${i + 1} з ${items.length}` : 'Відкрити фото'}
                        className={`relative block aspect-square overflow-hidden border border-slate-200 bg-slate-100 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${tile}`}>
                        <span className="absolute inset-0 flex items-center justify-center text-slate-300"><FaFileAlt size={18} /></span>
                        {it.fid && (
                            <img src={driveThumbUrl(it.fid, size)} alt="" loading="lazy" referrerPolicy="no-referrer"
                                className="absolute inset-0 w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        )}
                    </button>
                ))}
            </div>
            {at != null && <MediaViewer items={items} index={at} onClose={() => setAt(null)} />}
        </>
    );
}

export default MediaViewer;
