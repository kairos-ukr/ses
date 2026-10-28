// =====================================================================
//  K-CORE · Файли етапів: завантаження на Google Drive через воркер
//
//  Воркер сам кладе файли в папку об'єкта й надсилає їх у Telegram-гілку.
//  Повертає посилання й ідентифікатори файлів — їх зберігаємо в події етапу.
// =====================================================================

import { supabase } from '../supabaseClient';

export const WORKFLOW_UPLOADER_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev';

const DOC_TYPES = {
    commercial_proposal: 'Комерційна пропозиція',
    tech_project: 'Технічне рішення',
    tech_review: 'Заміри',
    project_design: '3D Візуалізація',
    complectation: 'Специфікація',
    comp_protection: 'Специфікація захисту',
};

export async function uploadWorkflowFiles({ files, installationId, stageKey, uploadedBy }) {
    if (!files || files.length === 0) return { links: [], fileIds: [] };
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('object_number', String(installationId));
    fd.append('doc_type', DOC_TYPES[stageKey] || 'Файли етапу');
    if (stageKey) fd.append('stage_key', stageKey);
    if (uploadedBy) fd.append('uploaded_by', uploadedBy);

    const res = await fetch(`${WORKFLOW_UPLOADER_URL}/workflow/upload`, { method: 'POST', body: fd });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok || !data || data.status !== 'success') {
        throw new Error((data && (data.message || data.detail)) || `Не вдалося завантажити файли (${res.status})`);
    }
    const arr = Array.isArray(data.files) ? data.files : [];
    return {
        links: arr.map((x) => x?.webViewLink).filter(Boolean),
        fileIds: arr.map((x) => x?.fileId).filter(Boolean),
    };
}

/** Ім'я того, хто вносить зміну — для історії етапу */
export async function resolveActorName({ user, employee }) {
    if (employee?.name) return employee.name;
    if (user?.id) {
        const { data } = await supabase.from('employees').select('name').eq('user_id', user.id).maybeSingle();
        if (data?.name) return data.name;
    }
    return user?.email || 'Невідомий';
}

export const driveThumbUrl = (fileId, size = 240) =>
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}-h${size}`;
