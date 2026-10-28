// =====================================================================
//  K-CORE · Файли ліда: фото й документи на Google Диску
//
//  Сервер документів кладе їх у «Ліди / Лід #12 …». Коли з ліда роблять
//  об'єкт, ця папка стає папкою об'єкта — файли самі з'являються в його
//  «Документах». Поки сервер не оновлено (у /health немає 'leads'),
//  замість кнопки — коротка примітка: інакше файли пішли б у складську папку.
// =====================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaPaperclip, FaFileAlt, FaFilePdf, FaTimes } from 'react-icons/fa';

import { T, Btn, Tip, Spinner, useToast, useConfirm, humanError } from './ui';
import { WORKFLOW_UPLOADER_URL } from './utils/workflowUpload';

let supportPromise = null;
/** Чи вміє сервер документів працювати з лідами — питаємо раз за сесію */
const serverSupportsLeads = () => {
    if (!supportPromise) {
        supportPromise = fetch(`${WORKFLOW_UPLOADER_URL}/health`)
            .then(r => r.json())
            .then(d => Array.isArray(d?.features) && d.features.includes('leads'))
            .catch(() => { supportPromise = null; return false; });
    }
    return supportPromise;
};

const isImage = (f) => (f.mimeType || '').startsWith('image/');

export default function LeadFiles({ leadId, canEdit, uploadedBy }) {
    const toast = useToast();
    const confirm = useConfirm();
    const inputRef = useRef(null);
    const [supported, setSupported] = useState(null);
    const [files, setFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const objectNumber = `lead-${leadId}`;

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${WORKFLOW_UPLOADER_URL}/documents/${objectNumber}`);
            const data = await res.json();
            setFiles(Array.isArray(data?.documents) ? data.documents : []);
        } catch {
            setFiles([]);
        } finally {
            setLoading(false);
        }
    }, [objectNumber]);

    useEffect(() => {
        let alive = true;
        serverSupportsLeads().then(ok => {
            if (!alive) return;
            setSupported(ok);
            if (ok) load(); else setLoading(false);
        });
        return () => { alive = false; };
    }, [load]);

    const upload = async (list) => {
        const picked = Array.from(list || []);
        if (!picked.length) return;
        setUploading(true);
        try {
            const fd = new FormData();
            picked.forEach(f => fd.append('files', f));
            fd.append('object_number', objectNumber);
            fd.append('doc_type', 'Лід');
            if (uploadedBy) fd.append('uploaded_by', uploadedBy);
            const res = await fetch(`${WORKFLOW_UPLOADER_URL}/upload/`, { method: 'POST', body: fd });
            let data = null;
            try { data = await res.json(); } catch { data = null; }
            if (!res.ok || data?.status !== 'success') {
                throw new Error(data?.message || `Не вдалося завантажити файли (${res.status})`);
            }
            if (data.message) toast(data.message, 'warning'); else toast(picked.length > 1 ? `Додано файлів: ${data.count}` : 'Файл додано');
            await load();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const remove = async (f) => {
        const ok = await confirm({
            title: 'Видалити файл?', message: `«${f.name}» піде в кошик Google Диска — 30 днів його ще можна повернути.`,
            confirmLabel: 'Видалити',
        });
        if (!ok) return;
        try {
            const res = await fetch(`${WORKFLOW_UPLOADER_URL}/delete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: f.id }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || data?.status !== 'success') throw new Error(data?.message || 'Не вдалося видалити файл');
            setFiles(prev => prev.filter(x => x.id !== f.id));
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    return (
        <div>
            <div className="flex items-center gap-2 mb-1.5">
                <span className={`${T.label} flex items-center gap-1`}>
                    Файли і фото{files.length ? ` · ${files.length}` : ''}
                    {supported && <Tip text="Фото даху, рахунки за світло, документи. Лежать на Google Диску в папці «Ліди», а коли лід стане об'єктом — самі перейдуть в його «Документи»." width={300} />}
                </span>
                {supported === false && (
                    <span className="text-[11.5px] text-slate-400 flex items-center gap-1">
                        після оновлення сервера документів
                        <Tip text="Файли до ліда лежатимуть на Google Диску в папці «Ліди», а коли лід стане об'єктом — перейдуть в об'єкт. Для цього на хостингу треба оновити сервер документів (папка doc-server)." width={300} />
                    </span>
                )}
                {supported && canEdit && (
                    <Btn size="sm" icon={uploading ? null : FaPaperclip} className="ml-auto" disabled={uploading}
                        onClick={() => inputRef.current?.click()}>
                        {uploading ? <><Spinner className="w-3 h-3" /> Завантаження…</> : 'Додати'}
                    </Btn>
                )}
                <input ref={inputRef} type="file" multiple hidden
                    accept="image/*,.heic,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={e => upload(e.target.files)} />
            </div>

            {supported && (loading ? (
                <div className="text-[12.5px] text-slate-400 py-1">Завантаження списку…</div>
            ) : files.length === 0 ? (
                <div className="text-[12.5px] text-slate-400">Ще немає</div>
            ) : (
                <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {files.map(f => (
                        <li key={f.id} className="relative group">
                            <a href={f.webViewLink} target="_blank" rel="noreferrer" title={f.name}
                                className="block aspect-square rounded-lg border border-slate-200 bg-slate-50 overflow-hidden hover:border-indigo-300">
                                {isImage(f) ? (
                                    <img src={`${WORKFLOW_UPLOADER_URL}/thumb/${encodeURIComponent(f.id)}?size=240`} alt={f.name}
                                        loading="lazy" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="w-full h-full flex flex-col items-center justify-center gap-1 p-1.5 text-center">
                                        {(f.mimeType || '').includes('pdf') ? <FaFilePdf className="text-rose-500" size={20} /> : <FaFileAlt className="text-slate-400" size={20} />}
                                        <span className="text-[10.5px] leading-tight text-slate-600 break-all line-clamp-3">{f.name}</span>
                                    </span>
                                )}
                            </a>
                            {canEdit && (
                                <button type="button" onClick={() => remove(f)} aria-label="Видалити файл" title="Видалити"
                                    className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-500 hover:text-rose-600 flex items-center justify-center">
                                    <FaTimes size={10} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            ))}
        </div>
    );
}
