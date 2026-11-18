// =====================================================================
//  K-CORE · Монтаж — денний звіт: дані й завантаження фото
//
//  Фото зменшуються на телефоні (до 1600 px, JPEG) — на мобільному
//  інтернеті це в 5–10 разів швидше. Далі той самий сервер, що й для
//  етапів: кладе файли в папку об'єкта на Диску й публікує їх у гілці
//  об'єкта в Telegram.
// =====================================================================

import { supabase } from '../supabaseClient';
import { tasksOfGroup } from '../domain/stages';
import { localGet, localSet, localDel, localAll } from './local';

const UPLOADER_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev';

/** Підетапи монтажу, які відмічаються у звіті */
export const REPORT_STAGES = tasksOfGroup('installation');

export const DAY_STATUS = [
    { value: 'ok', label: 'Без проблем' },
    { value: 'no_material', label: 'Бракує матеріалу' },
    { value: 'weather', label: 'Погода' },
    { value: 'client', label: 'Клієнт' },
    { value: 'other', label: 'Інше' },
];
export const DAY_STATUS_LABEL = Object.fromEntries(DAY_STATUS.map(s => [s.value, s.label]));

export const CURRENCY_SIGN = { UAH: '₴', USD: '$', EUR: '€' };
export const MONEY_CURRENCIES = [{ value: 'UAH', label: '₴' }, { value: 'USD', label: '$' }, { value: 'EUR', label: '€' }];

/**
 * Гроші від клієнта зі звіту: [{ amount, currency, payment_id, idx }] — і нові звіти (кілька сум),
 * і старі (одна). idx — місце суми в money_lines (null — стара одна сума).
 */
export const moneyLinesOf = (r) => {
    if (Array.isArray(r?.money_lines) && r.money_lines.length) {
        const lines = r.money_lines.map((l, idx) => ({ ...l, idx })).filter(l => Number(l?.amount) > 0);
        // Одна сума — «внесено» могли позначити й старим способом (money_payment_id)
        return lines.map(l => ({ ...l, amount: Number(l.amount), currency: l.currency || 'UAH', payment_id: l.payment_id ?? (lines.length === 1 ? r.money_payment_id : null) ?? null }));
    }
    return r?.money_amount != null
        ? [{ amount: Number(r.money_amount), currency: r.money_currency || 'UAH', payment_id: r.money_payment_id || null, idx: null }]
        : [];
};

/** Офіс вніс суму зі звіту в платежі: позначити саме її; money_payment_id — коли внесено все */
export const markMoneyPaid = (r, idx, paymentId) => {
    if (idx == null || !Array.isArray(r.money_lines)) return { money_payment_id: paymentId };
    const lines = r.money_lines.map((l, i) => (i === idx ? { ...l, payment_id: paymentId } : l));
    const allPaid = lines.every(l => !(Number(l?.amount) > 0) || l.payment_id);
    return { money_lines: lines, ...(allPaid ? { money_payment_id: paymentId } : {}) };
};
/** «12 000 ₴ + 300 €» */
export const moneyText = (lines) => lines.map(l => `${fmtAmount(l.amount)} ${CURRENCY_SIGN[l.currency] || ''}`.trim()).join(' + ');

/** Серійні номери: бажано інвертор і логер; можна й більше (АКБ тощо) */
export const SERIAL_KINDS = ['Інвертор', 'Логер', 'АКБ', 'Інше'];
export const serialsOf = (r) => (Array.isArray(r?.serials) ? r.serials : []).filter(s => String(s?.value || '').trim());

export const fmtAmount = (n) => {
    const v = Math.round(Number(n || 0) * 100) / 100;
    const [i, f] = String(v).split('.');
    return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? `,${f}` : '');
};

export const fmtQty = (n) => String(Math.round(Number(n || 0) * 100) / 100).replace('.', ',');

/* ---------- фото ---------- */

const MAX_SIDE = 1600;

/** Зменшити фото на телефоні. Не фото або вже маленьке — як є. */
export async function compressImage(file) {
    if (!file?.type?.startsWith('image/') || file.size < 350 * 1024) return file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close?.();
        const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
        if (!blob || blob.size >= file.size) return file;
        const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
        return new File([blob], name, { type: 'image/jpeg' });
    } catch {
        return file;   // старий браузер — шлемо оригінал
    }
}

/** Завантажити фото в папку об'єкта. Повертає [{ url, fid }] */
export async function uploadPhotos({ files, objectId, by, comment }) {
    const fd = new FormData();
    for (const f of files) {
        const small = await compressImage(f);
        fd.append('files', small, small.name || 'photo.jpg');
    }
    fd.append('object_number', String(objectId));
    fd.append('doc_type', 'Фотозвіт монтажу');
    fd.append('stage_key', 'installation_report');
    if (by) fd.append('uploaded_by', by);
    if (comment) fd.append('comment', comment);

    const res = await fetch(`${UPLOADER_URL}/workflow/upload`, { method: 'POST', body: fd });
    let data = null;
    try { data = await res.json(); } catch { /* не JSON */ }
    if (!res.ok || !data || data.status !== 'success') {
        throw new Error((data && (data.message || data.detail)) || `Фото не завантажились (${res.status})`);
    }
    return (Array.isArray(data.files) ? data.files : [])
        .filter(x => x?.webViewLink)
        .map(x => ({ url: x.webViewLink, fid: x.fileId || null }));
}

export const driveThumb = (fid, size = 360) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w${size}-h${size}`;

/** Нема зв'язку (а не помилка в даних) — такий звіт чекає в черзі */
export const isNetworkError = (e) => (typeof navigator !== 'undefined' && navigator.onLine === false)
    || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(String(e?.message || e || ''));

/** Фото з телефона, підготовлене до відправки: { id, blob, name } */
export async function prepareLocalPhoto(file) {
    const small = await compressImage(file);
    return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, blob: small, name: small.name || 'photo.jpg' };
}

/* ---------- звіт ---------- */

/** Звіт об'єкта за день: знайти або створити чернетку */
export async function ensureReport(objectId, date) {
    const { data: found } = await supabase.from('installer_reports').select('*')
        .eq('installation_custom_id', objectId).eq('work_date', date).maybeSingle();
    if (found) return found;
    const { data, error } = await supabase.from('installer_reports')
        .insert({ installation_custom_id: objectId, work_date: date }).select('*').single();
    if (!error) return data;
    // Хтось із бригади створив її одночасно — беремо ту
    const { data: again } = await supabase.from('installer_reports').select('*')
        .eq('installation_custom_id', objectId).eq('work_date', date).maybeSingle();
    if (again) return again;
    throw error;
}

/** Кабель і потреби на завтра звіту — замінити повністю */
export async function replaceLists(reportId, usage = [], needs = []) {
    const [d1, d2] = await Promise.all([
        supabase.from('installer_report_usage').delete().eq('report_id', reportId),
        supabase.from('installer_report_needs').delete().eq('report_id', reportId),
    ]);
    if (d1.error) throw d1.error;
    if (d2.error) throw d2.error;
    if (usage.length) {
        const { error } = await supabase.from('installer_report_usage').insert(usage.map(u => ({ ...u, report_id: reportId })));
        if (error) throw error;
    }
    if (needs.length) {
        const { error } = await supabase.from('installer_report_needs').insert(needs.map(n => ({ ...n, report_id: reportId })));
        if (error) throw error;
    }
}

const dm = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });

/**
 * Надіслати звіт — і з кнопки, і з черги (коли з'явився інтернет).
 * payload: { objId, date, fields, photos:[{url,fid}], localPhotos:[{id,blob,name}],
 *            usage, needs, crewIds, author:{id,name,email}, stageChanges:[[ключ, статус]],
 *            panelsTotal — усього панелей, якщо специфікації немає }
 * onUploaded(photos) — фото вже на Диску: збережіть це, щоб повтор не вантажив їх удруге.
 * Фото йдуть на Диск і в гілку Telegram лише тут, тобто після «Надіслати звіт».
 */
export async function submitReport(p, { onProgress, onUploaded } = {}) {
    let photos = [...(p.photos || [])];
    if (p.localPhotos?.length) {
        onProgress?.(`Завантажую фото: ${p.localPhotos.length}`);
        const files = p.localPhotos.map(x => new File([x.blob], x.name || 'photo.jpg', { type: x.blob?.type || 'image/jpeg' }));
        const got = await uploadPhotos({ files, objectId: p.objId, by: p.author?.name, comment: `Звіт монтажу за ${dm(p.date)}` });
        photos = [...photos, ...got];
        await onUploaded?.(photos);
    }

    onProgress?.('Зберігаю звіт…');
    const r = await ensureReport(p.objId, p.date);
    if (r.submitted_at) return { report: r, photos, already: true };   // бригада вже надіслала з іншого телефона

    await replaceLists(r.id, p.usage, p.needs);
    // Специфікації немає — бригадир вписав, скільки всього панелей (лише раз: уже записане не чіпаємо)
    if (p.panelsTotal > 0) {
        await supabase.from('installations').update({ panels_total: p.panelsTotal })
            .eq('custom_id', p.objId).is('panels_total', null);
    }
    // Лише якщо ще ніхто не надіслав (два телефони однієї бригади одночасно)
    const { data: rows, error } = await supabase.from('installer_reports').update({
        ...p.fields,
        photos: photos.map(x => x.url),
        photo_file_ids: photos.map(x => x.fid || ''),
        crew: p.crewIds || [],
        author_id: p.author?.id || null,
        submitted_at: new Date().toISOString(),
    }).eq('id', r.id).is('submitted_at', null).select('*');
    if (error) throw error;
    if (!rows?.length) {
        const { data: other } = await supabase.from('installer_reports').select('*').eq('id', r.id).maybeSingle();
        return { report: other, photos, already: true };
    }
    const saved = rows[0];

    // Підетапи в CRM — так само, як їх змінюють з картки об'єкта
    const stageErrors = [];
    for (const [k, s] of (p.stageChanges || [])) {
        const { error: e } = await supabase.rpc('update_workflow_stage', {
            p_installation_id: p.objId, p_stage_key: k, p_new_status: s, p_actor: p.author?.name || p.author?.email || 'Бригада',
            p_comment: `Звіт монтажу за ${dm(p.date)}`, p_photos: [], p_photo_file_ids: [],
            p_new_responsible: null, p_set_as_global_stage: false,
        });
        if (e) stageErrors.push(e);
    }
    return { report: saved, photos, stageErrors };
}

/** Подія для відкритих екранів: звіт із черги надіслано */
export const REPORT_SENT_EVENT = 'kcore:report-sent';

/* ---------- черга на телефоні ---------- */

const inFlight = new Set();   // що саме зараз надсилається — щоб не надіслати двічі

/**
 * Надіслати звіт, що чекає в черзі на телефоні (pending). Повертає результат
 * або null, якщо його вже надсилає інший прохід. Помилку зв'язку кидає далі —
 * звіт лишається в черзі.
 */
export async function sendQueued(key, onProgress) {
    if (inFlight.has(key)) return null;
    inFlight.add(key);
    try {
        const value = await localGet(key);
        if (!value?.pending || !value.payload) return null;
        const res = await submitReport(value.payload, {
            onProgress,
            // Фото вже на Диску — запам'ятовуємо одразу, щоб повтор не вантажив їх удруге
            onUploaded: async (photos) => {
                const v = await localGet(key);
                if (v) await localSet(key, { ...v, photos, localPhotos: [], payload: { ...v.payload, photos, localPhotos: [] } });
            },
        });
        await localDel(key);
        window.dispatchEvent(new CustomEvent(REPORT_SENT_EVENT, { detail: { key, res } }));
        return res;
    } finally {
        inFlight.delete(key);
    }
}

/** Пройти всю чергу (з'явився інтернет, відкрили додаток). Повертає надіслані */
export async function flushQueue() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];
    const sent = [];
    for (const { key, value } of await localAll()) {
        if (!value?.pending) continue;
        try {
            const res = await sendQueued(key);
            if (res) sent.push({ key, date: value.payload?.date, res });
        } catch (e) {
            if (isNetworkError(e)) break;   // зв'язку знову немає — решта почекає
        }
    }
    return sent;
}
