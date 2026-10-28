// =====================================================================
//  K-CORE · Документи об'єкта (вкладка в картці)
//
//  Чому тепер швидше:
//   • список документів запам'ятовується: при повторному відкритті
//     показується одразу, а свіжий список тихо підтягується у фоні;
//   • картка об'єкта починає вантажити документи заздалегідь
//     (prefetchDocuments), ще до того, як відкрили вкладку;
//   • мініатюри просимо маленькі (360 px замість 800) — у кілька разів
//     менше даних; браузер тримає їх у кеші тиждень;
//   • показуємо порціями по 24, решта — кнопкою.
//  Мініатюри тепер є і в PDF / Word / Excel — їх малює Google Диск.
// =====================================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
    FaCloudUploadAlt, FaFilePdf, FaFileImage, FaFileAlt, FaTimes, FaDownload,
    FaTrash, FaRegFile, FaFileExcel, FaFileWord, FaSpinner, FaThLarge, FaList, FaSyncAlt, FaExternalLinkAlt,
} from "react-icons/fa";
import { T, TONE, Btn, useToast } from "./ui";
import { useAuth } from "./AuthProvider";
import { ingestOfferInBackground } from "./utils/commercialOffer";

const SERVER_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev';
const PAGE = 24;

const DOC_TYPES = [
    "Комерційна пропозиція",
    "Технічний проєкт",
    "Фотозвіт",
    "Фото об'єкта",
    "3D-візуалізація",
    "Чек",
    "Накладна",
    "Акт",
    "Інше"
];

// Колір по типу документа — швидше сканувати сітку й фільтри очима
const DOC_TYPE_TONE = {
    "Комерційна пропозиція": "accent",
    "Технічний проєкт": "info",
    "Фотозвіт": "ok",
    "Фото об'єкта": "info",
    "3D-візуалізація": "accent",
    "Чек": "warn",
    "Накладна": "warn",
    "Акт": "neutral",
    "Інше": "neutral",
};
const toneOf = (docType) => TONE[DOC_TYPE_TONE[docType] || "neutral"];

const kindOf = (mimeType = '', fileName = '') => {
    const n = fileName.toLowerCase();
    if (mimeType.includes('pdf') || n.endsWith('.pdf')) return 'pdf';
    if (mimeType.includes('image') || /\.(jpg|jpeg|png|gif|webp|heic)$/.test(n)) return 'image';
    if (mimeType.includes('sheet') || mimeType.includes('excel') || /\.(xls|xlsx|csv)$/.test(n)) return 'excel';
    if (mimeType.includes('word') || mimeType.includes('document') || /\.(doc|docx)$/.test(n)) return 'word';
    return 'file';
};

const FileIcon = ({ kind, size = 16 }) => {
    if (kind === 'pdf') return <FaFilePdf size={size} className="text-rose-500" />;
    if (kind === 'image') return <FaFileImage size={size} className="text-sky-500" />;
    if (kind === 'excel') return <FaFileExcel size={size} className="text-emerald-600" />;
    if (kind === 'word') return <FaFileWord size={size} className="text-blue-700" />;
    return <FaFileAlt size={size} className="text-slate-400" />;
};

const formatBytes = (bytes) => {
    if (!+bytes) return '';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i ? 1 : 0))} ${sizes[i]}`;
};

const thumbUrl = (doc, size) => `${SERVER_URL}/thumb/${doc.id}?size=${size}`;

/* ---------------------------------------------------------------------
 *  КЕШ СПИСКУ ДОКУМЕНТІВ
 *  У пам'яті — на час роботи сторінки; у sessionStorage — щоб пережити
 *  перезавантаження. Запит, який уже йде, не дублюємо.
 * ------------------------------------------------------------------- */

const memory = new Map();       // id → { docs, at }
const inflight = new Map();     // id → Promise
const storeKey = (id) => `kcore.docs.${id}`;

const readCached = (id) => {
    if (memory.has(String(id))) return memory.get(String(id));
    try {
        const v = JSON.parse(sessionStorage.getItem(storeKey(id)) || 'null');
        if (v && Array.isArray(v.docs)) { memory.set(String(id), v); return v; }
    } catch { /* немає сховища */ }
    return null;
};

const writeCached = (id, docs) => {
    const v = { docs, at: Date.now() };
    memory.set(String(id), v);
    try { sessionStorage.setItem(storeKey(id), JSON.stringify(v)); } catch { /* немає сховища або переповнене */ }
};

/** Свіжий список з сервера (паралельні виклики для одного об'єкта — один запит) */
export function fetchDocuments(id) {
    const key = String(id);
    if (inflight.has(key)) return inflight.get(key);
    const p = fetch(`${SERVER_URL}/documents/${encodeURIComponent(key)}`)
        .then(r => r.json())
        .then(data => {
            if (data.status === 'error') throw new Error(data.message);
            const docs = data.documents || [];
            writeCached(key, docs);
            return docs;
        })
        .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
}

/** Картка об'єкта кличе це одразу — щоб до відкриття вкладки список уже був */
export function prefetchDocuments(id) {
    if (!id) return;
    const c = readCached(id);
    if (c && Date.now() - c.at < 60 * 1000) return;   // щойно оновлювали
    fetchDocuments(id).catch(() => { /* покажемо помилку, коли відкриють вкладку */ });
}

/* ===================================================================== */

export default function ProjectDocumentsPage({ project: propProject }) {
    const { id } = useParams();
    const projectId = propProject?.custom_id || id;
    const { employee } = useAuth();
    const toast = useToast();

    const cached = readCached(projectId);
    const [documents, setDocuments] = useState(cached?.docs || []);
    const [loading, setLoading] = useState(!cached);
    const [refreshing, setRefreshing] = useState(false);
    const [limit, setLimit] = useState(PAGE);
    const [view, setView] = useState(() => { try { return localStorage.getItem('kcore.docs.view') || 'grid'; } catch { return 'grid'; } });

    // Завантаження
    const [showUpload, setShowUpload] = useState(false);
    const [uploadFiles, setUploadFiles] = useState([]);
    const [docType, setDocType] = useState("");
    const [customDocType, setCustomDocType] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [typeError, setTypeError] = useState(false);

    const [preview, setPreview] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Всі");
    const fileInputRef = useRef(null);

    const refresh = useCallback(async () => {
        if (!projectId) return;
        setRefreshing(true);
        try {
            setDocuments(await fetchDocuments(projectId));
        } catch {
            toast("Не вдалося завантажити документи", 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [projectId, toast]);

    useEffect(() => { refresh(); }, [refresh]);

    const setViewMode = (v) => { setView(v); try { localStorage.setItem('kcore.docs.view', v); } catch { /* немає сховища */ } };

    const counts = useMemo(() => {
        const stats = { "Всі": documents.length };
        documents.forEach(doc => {
            const t = doc.docType || "Інше";
            stats[t] = (stats[t] || 0) + 1;
        });
        return stats;
    }, [documents]);

    // Типи, що реально є: спершу стандартні в їхньому порядку, далі свої
    const filterTypes = useMemo(() => {
        const present = Object.keys(counts).filter(k => k !== "Всі");
        return ["Всі", ...DOC_TYPES.filter(t => present.includes(t)), ...present.filter(t => !DOC_TYPES.includes(t))];
    }, [counts]);

    const filtered = useMemo(() => (activeFilter === "Всі" ? documents : documents.filter(doc => (doc.docType || "Інше") === activeFilter)), [documents, activeFilter]);
    useEffect(() => { setLimit(PAGE); }, [activeFilter]);

    const handleFiles = (files) => {
        if (files && files.length > 0) setUploadFiles(prev => [...prev, ...Array.from(files)]);
    };

    // Завантаження з реальним прогресом (XMLHttpRequest)
    const handleUpload = (e) => {
        e.preventDefault();
        if (!docType) { setTypeError(true); toast("Оберіть тип документа", 'error'); return; }
        if (uploadFiles.length === 0) return;

        const finalDocType = docType === "Інше" ? customDocType.trim() : docType;
        if (!finalDocType) { toast("Вкажіть назву типу документа", 'error'); return; }

        // Копія списку до того, як його очистить успішна відправка:
        // оцифровка КП стартує вже після відповіді сервера.
        const sentFiles = [...uploadFiles];

        setIsUploading(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('object_number', projectId);
        formData.append('doc_type', finalDocType);
        // Хто завантажив — у підписі в гілці Telegram
        formData.append('uploaded_by', employee?.name || '');
        uploadFiles.forEach((file) => formData.append('files', file));

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${SERVER_URL}/upload/`, true);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (result.status === 'success') {
                        toast(`Завантажено файлів: ${result.count}`, 'success');
                        // КП іде на оцифровку у фоні: розбір дивиться директор у вкладці «КП»
                        if (finalDocType === "Комерційна пропозиція") {
                            ingestOfferInBackground({
                                files: sentFiles,
                                installationId: projectId,
                                employeeId: employee?.id || null,
                                driveFiles: result.files,
                                notify: toast,
                            });
                        }
                        setUploadFiles([]);
                        setCustomDocType("");
                        setDocType("");
                        setTypeError(false);
                        setShowUpload(false);
                        refresh();
                    } else {
                        toast(result.message || "Сталася помилка", 'error');
                    }
                } catch {
                    toast("Помилка обробки відповіді сервера", 'error');
                }
            } else {
                // Сервер документів пояснює причину в message — показуємо її, а не лише код
                let message = `Помилка сервера: ${xhr.status}`;
                try { message = JSON.parse(xhr.responseText).message || message; } catch { /* не JSON */ }
                toast(message, 'error');
            }
            setIsUploading(false);
            setUploadProgress(0);
        };
        xhr.onerror = () => {
            toast("Помилка з'єднання з сервером", 'error');
            setIsUploading(false);
            setUploadProgress(0);
        };
        xhr.send(formData);
    };

    const shown = filtered.slice(0, limit);

    return (
        <div className="space-y-3">
            {/* Панель: типи документів + вигляд + завантажити */}
            <div className={`${T.card} p-2 sm:p-2.5 flex flex-wrap items-center gap-2`}>
                <div className="basis-full sm:basis-0 sm:flex-1 min-w-0 overflow-x-auto no-scrollbar">
                    <div className="flex gap-1.5 min-w-max">
                        {filterTypes.map(type => {
                            const isActive = activeFilter === type;
                            return (
                                <button key={type} type="button" onClick={() => setActiveFilter(type)}
                                    className={`h-8 px-3 rounded-full text-[12.5px] font-semibold border inline-flex items-center gap-1.5 whitespace-nowrap transition-colors
                                        ${isActive ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                                    {type !== "Всі" && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-white' : toneOf(type).bar}`} />}
                                    {type}
                                    <span className={`tabular-nums text-[11.5px] ${isActive ? 'text-indigo-100' : 'text-slate-400'}`}>{counts[type] || 0}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                    {refreshing && !loading && <FaSpinner className="animate-spin text-slate-300" size={12} />}
                    <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        <button type="button" aria-label="Плиткою" onClick={() => setViewMode('grid')}
                            className={`w-8 h-8 rounded-md flex items-center justify-center ${view === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><FaThLarge size={12} /></button>
                        <button type="button" aria-label="Списком" onClick={() => setViewMode('list')}
                            className={`w-8 h-8 rounded-md flex items-center justify-center ${view === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}><FaList size={12} /></button>
                    </div>
                    <Btn size="sm" variant="ghost" icon={FaSyncAlt} onClick={refresh} disabled={refreshing} aria-label="Оновити список" />
                    <Btn size="sm" variant={showUpload ? 'outline' : 'accent'} icon={showUpload ? FaTimes : FaCloudUploadAlt} onClick={() => setShowUpload(v => !v)}>
                        {showUpload ? 'Закрити' : 'Завантажити'}
                    </Btn>
                </div>
            </div>

            {/* Завантаження — розгортається тут же, без окремого вікна */}
            {showUpload && (
                <form onSubmit={handleUpload} className={`${T.card} p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-3`}>
                    <div className="space-y-2">
                        <div className={T.label}>Тип документа <span className="text-rose-500">*</span></div>
                        <div className="flex flex-wrap gap-1.5">
                            {DOC_TYPES.map(t => (
                                <button key={t} type="button" onClick={() => { setDocType(t); setTypeError(false); }}
                                    className={`h-8 px-2.5 rounded-lg border text-[12.5px] font-semibold transition-colors
                                        ${docType === t ? 'bg-indigo-600 border-indigo-600 text-white' : typeError ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                    {t}
                                </button>
                            ))}
                        </div>
                        {docType === "Інше" && (
                            <input type="text" placeholder="Своя назва типу" value={customDocType}
                                onChange={(e) => setCustomDocType(e.target.value)} className={T.input} />
                        )}
                    </div>

                    <div className="space-y-2 min-w-0">
                        <div
                            className={`rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5
                                ${isDragging ? 'border-indigo-500 bg-indigo-50/60' : 'border-slate-200 bg-slate-50/60 hover:border-indigo-300'}`}
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                            onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input type="file" multiple ref={fileInputRef} onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} className="hidden" />
                            <FaCloudUploadAlt size={22} className="text-indigo-500" />
                            <span className="text-[13.5px] font-bold text-slate-700">Оберіть файли або перетягніть сюди</span>
                        </div>

                        {uploadFiles.length > 0 && (
                            <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto custom-scrollbar">
                                {uploadFiles.map((file, i) => (
                                    <li key={i} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                                        <FileIcon kind={kindOf(file.type, file.name)} />
                                        <span className="min-w-0 flex-1 font-semibold text-slate-700 break-all">{file.name}</span>
                                        <span className="text-slate-400 tabular-nums whitespace-nowrap">{formatBytes(file.size)}</span>
                                        <button type="button" onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))} aria-label="Прибрати"
                                            className="w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50"><FaTrash size={11} /></button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        {isUploading && (
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-indigo-600 transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
                            </div>
                        )}

                        <div className="flex justify-end">
                            <Btn type="submit" variant="accent" icon={isUploading ? undefined : FaCloudUploadAlt} disabled={isUploading || uploadFiles.length === 0}>
                                {isUploading ? `Відправляю… ${uploadProgress}%` : `Завантажити${uploadFiles.length ? ` (${uploadFiles.length})` : ''}`}
                            </Btn>
                        </div>
                    </div>
                </form>
            )}

            {/* Документи */}
            {loading ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className={`${T.card} overflow-hidden animate-pulse`}>
                            <div className="aspect-[4/3] bg-slate-100" />
                            <div className="p-2.5 space-y-1.5"><div className="h-3 bg-slate-100 rounded w-4/5" /><div className="h-2.5 bg-slate-50 rounded w-1/2" /></div>
                        </div>
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className={`${T.card} py-14 flex flex-col items-center justify-center text-slate-400 gap-2`}>
                    <FaRegFile size={28} className="text-slate-300" />
                    <p className="font-bold text-[15px] text-slate-700">Документів ще немає</p>
                    <Btn variant="accent" icon={FaCloudUploadAlt} onClick={() => setShowUpload(true)}>Завантажити перший</Btn>
                </div>
            ) : view === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {shown.map(doc => <DocumentCard key={doc.id} doc={doc} onPreview={() => setPreview(doc)} />)}
                </div>
            ) : (
                <ul className={`${T.card} divide-y divide-slate-100 overflow-hidden`}>
                    {shown.map(doc => <DocumentRow key={doc.id} doc={doc} onPreview={() => setPreview(doc)} />)}
                </ul>
            )}

            {!loading && filtered.length > limit && (
                <div className="text-center">
                    <Btn variant="soft" onClick={() => setLimit(l => l + PAGE)}>Показати ще {Math.min(PAGE, filtered.length - limit)} з {filtered.length - limit}</Btn>
                </div>
            )}

            {/* Перегляд */}
            {preview && (
                <div className="fixed inset-0 z-[100] bg-slate-900/90 p-2 sm:p-6 flex flex-col" onClick={() => setPreview(null)}>
                    <div className="flex items-center gap-2 text-white mb-2 sm:mb-3 max-w-6xl mx-auto w-full" onClick={e => e.stopPropagation()}>
                        <span className="min-w-0 flex-1 font-semibold text-[14px] break-words">{preview.name}</span>
                        {preview.webViewLink && (
                            <a href={preview.webViewLink} target="_blank" rel="noreferrer" aria-label="Відкрити в Google Диску"
                                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><FaExternalLinkAlt size={14} /></a>
                        )}
                        {preview.webContentLink && (
                            <a href={preview.webContentLink} aria-label="Завантажити"
                                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"><FaDownload size={14} /></a>
                        )}
                        <button type="button" onClick={() => setPreview(null)} aria-label="Закрити"
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-rose-500 flex items-center justify-center"><FaTimes size={16} /></button>
                    </div>
                    <div className="flex-1 bg-white rounded-xl overflow-hidden max-w-6xl mx-auto w-full relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                            <FaSpinner className="animate-spin text-3xl mb-2 text-indigo-500" />
                        </div>
                        {preview.webViewLink && (
                            <iframe src={preview.webViewLink.replace('/view', '/preview')} className="w-full h-full border-0 absolute inset-0" title={preview.name} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  ПЛИТКА ДОКУМЕНТА
 *  Мініатюра — є в фото, PDF, Word, Excel (якщо Google Диск її зробив).
 *  Кнопки «відкрити» і «завантажити» видно завжди — на телефоні наведення немає.
 * ------------------------------------------------------------------- */

// Мініатюри просимо не всі разом, а по 4: тоді перші з'являються за
// секунду-дві, а не всі одночасно через 15 секунд. І лише ті, що на екрані.
const MAX_THUMBS = 4;
let activeThumbs = 0;
const waitingThumbs = [];
const acquireThumb = () => new Promise(res => {
    if (activeThumbs < MAX_THUMBS) { activeThumbs += 1; res(); } else waitingThumbs.push(res);
});
const releaseThumb = () => {
    const next = waitingThumbs.shift();
    if (next) next(); else activeThumbs = Math.max(0, activeThumbs - 1);
};

const Thumb = ({ doc, size, className, iconSize }) => {
    const kind = kindOf(doc.mimeType, doc.name);
    const [failed, setFailed] = useState(false);
    const [src, setSrc] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const boxRef = useRef(null);
    const held = useRef(false);
    const can = (kind === 'image' || !!doc.thumbnailLink) && !failed;
    const url = thumbUrl(doc, size);

    const done = () => { if (held.current) { held.current = false; releaseThumb(); } };

    useEffect(() => {
        if (!can || !boxRef.current) return undefined;
        let cancelled = false;
        const io = new IntersectionObserver(([e]) => {
            if (!e.isIntersecting) return;
            io.disconnect();
            acquireThumb().then(() => {
                if (cancelled) { releaseThumb(); return; }
                held.current = true;
                setSrc(url);
            });
        }, { rootMargin: '300px' });
        io.observe(boxRef.current);
        return () => { cancelled = true; io.disconnect(); done(); };
    }, [url, can]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div ref={boxRef} className={`relative bg-slate-50 flex items-center justify-center overflow-hidden ${className}`}>
            <FileIcon kind={kind} size={iconSize} />
            {can && src && (
                <img src={src} alt="" decoding="async"
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => { setLoaded(true); done(); }}
                    onError={() => { setFailed(true); done(); }} />
            )}
        </div>
    );
};

const DocumentCard = ({ doc, onPreview }) => {
    const tone = toneOf(doc.docType);
    return (
        <div className={`${T.card} overflow-hidden flex flex-col group hover:border-indigo-300 hover:shadow-md transition`}>
            <button type="button" onClick={onPreview} className="block text-left">
                <Thumb doc={doc} size={360} className="aspect-[4/3]" iconSize={34} />
            </button>
            <div className="p-2.5 flex-1 flex flex-col gap-1.5">
                <button type="button" onClick={onPreview} className="text-left text-[12.5px] font-semibold text-slate-800 leading-snug break-words group-hover:text-indigo-700">
                    {doc.name}
                </button>
                <div className="mt-auto flex items-center justify-between gap-1.5">
                    <span className={`px-1.5 py-0.5 rounded border text-[10.5px] font-semibold leading-tight ${tone.chip}`}>{doc.docType || 'Документ'}</span>
                    {doc.webContentLink && (
                        <a href={doc.webContentLink} aria-label="Завантажити" title="Завантажити"
                            className="w-7 h-7 flex-shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><FaDownload size={11} /></a>
                    )}
                </div>
                <div className="text-[11px] text-slate-400 tabular-nums">
                    {doc.createdTime ? new Date(doc.createdTime).toLocaleDateString('uk-UA') : ''}{doc.size ? ` · ${formatBytes(doc.size)}` : ''}
                </div>
            </div>
        </div>
    );
};

const DocumentRow = ({ doc, onPreview }) => {
    const tone = toneOf(doc.docType);
    return (
        <li className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
            <button type="button" onClick={onPreview} className="flex-shrink-0">
                <Thumb doc={doc} size={120} className="w-12 h-12 rounded-lg border border-slate-200" iconSize={18} />
            </button>
            <button type="button" onClick={onPreview} className="min-w-0 flex-1 text-left">
                <div className="text-[13px] font-semibold text-slate-800 leading-snug break-words">{doc.name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-slate-400">
                    <span className={`px-1.5 py-0.5 rounded border text-[10.5px] font-semibold ${tone.chip}`}>{doc.docType || 'Документ'}</span>
                    <span className="tabular-nums">{doc.createdTime ? new Date(doc.createdTime).toLocaleDateString('uk-UA') : ''}</span>
                    {doc.size ? <span className="tabular-nums">{formatBytes(doc.size)}</span> : null}
                </div>
            </button>
            {doc.webContentLink && (
                <a href={doc.webContentLink} aria-label="Завантажити"
                    className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"><FaDownload size={12} /></a>
            )}
        </li>
    );
};
