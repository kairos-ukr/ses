// =====================================================================
//  K-CORE · Оцифрування комерційної пропозиції
//
//  Один вхід для всіх місць, де менеджер завантажує КП: етап «КП» у
//  робочому процесі (PWT.jsx) і вкладка «Документи» картки об'єкта.
//  Далі все однаково: файл → OCR → розбір → рядок у базі.
//
//  ДЛЯ МЕНЕДЖЕРА ЦЕ НЕВИДИМО. Він завантажив файл і пішов працювати
//  далі; жодних вікон «перевірте, чи правильно розпізналось» немає —
//  вони б перетворили завантаження документа на рутину звірки. Розбір
//  зберігається як є, разом із чесною позначкою про якість, а дивиться
//  й підправляє його super_admin у картці проєкту.
//
//  ЩО РОБИТИ, ЯКЩО OCR НЕ ВПОРАВСЯ. Рядок усе одно створюється — зі
//  статусом failed і причиною. Так «КП завантажили, але цифр немає»
//  видно одразу, замість тиші, у якій ніхто не помічає, що оцифровки
//  просто не сталося.
// =====================================================================

import { supabase } from '../supabaseClient';
import { recognizeOffer } from './kpOcr';
import { parseOffer } from './kpParser';
import { syncOfferNeed } from './offerNeed';
import { hasCommercialOffers } from './features';

/** Чи схожий файл на комерційну пропозицію, яку є сенс розпізнавати. */
export const isOfferFile = (file) => {
    if (!file) return false;
    const name = (file.name || '').toLowerCase();
    return (file.type || '').includes('pdf') || name.endsWith('.pdf')
        || (file.type || '').startsWith('image/');
};

/** Коротка причина, чому розбору не варто довіряти беззастережно. */
function buildWarning({ items, check }) {
    if (!items.length) return 'Позицій у документі не розібрано';
    if (check.total == null) return 'Підсумкову суму в документі не знайдено';
    if (!check.ok) {
        return `Розбіжність ${check.diff}: сума позицій ${check.itemsSum}, у документі ${check.total}`;
    }
    return null;
}

/**
 * Розпізнає файл КП і зберігає результат як поточну пропозицію об'єкта.
 *
 * Ніколи не кидає виняток: збій розпізнавання — теж результат, який має
 * лягти в базу, а не загубитися в catch у місці виклику.
 *
 * @param {object}  p
 * @param {File}    p.file            — сам PDF
 * @param {number}  p.installationId  — installations.custom_id
 * @param {number} [p.employeeId]     — employees.id того, хто завантажив
 * @param {object} [p.drive]          — { fileId, webViewLink } з Google Drive
 * @returns {Promise<{ok: boolean, offerId: number|null, total: number|null,
 *                     itemsCount: number, warning: string|null, error: string|null}>}
 */
export async function ingestCommercialOffer({ file, installationId, employeeId = null, drive = null }) {
    // Код приїжджає в браузери раніше, ніж міграцію виконують у бойовій
    // базі. До того моменту оцифровка просто не відбувається — файл
    // завантажується як звичайний документ, і нічого не ламається.
    if (!(await hasCommercialOffers())) {
        return {
            ok: false, offerId: null, total: null, itemsCount: 0, warning: null,
            error: 'Міграцію db/2026-09_commercial_offers.sql ще не застосовано',
        };
    }

    const base = {
        source_file_name: file?.name || null,
        source_file_id: drive?.fileId || null,
        source_file_url: drive?.webViewLink || null,
        created_by: employeeId || null,
    };

    let ocr;
    try {
        ocr = await recognizeOffer(file);
    } catch (e) {
        // Розпізнати не вийшло — лишаємо слід, щоб було видно, що робота є,
        // а цифр немає, і super_admin міг внести їх руками.
        const { data, error } = await supabase.rpc('save_commercial_offer', {
            p_installation_custom_id: Number(installationId),
            p_offer: { ...base, status: 'failed', parse_warning: e.message },
            p_items: [],
        });
        return {
            ok: false,
            offerId: error ? null : data,
            total: null,
            itemsCount: 0,
            warning: null,
            error: e.message,
        };
    }

    const { head, items, check } = parseOffer(ocr.text);

    const payload = {
        ...base,
        status: 'parsed',
        total_amount: head.total,
        currency: head.currency || 'USD',
        capacity_kw: head.capacityKw,
        inverter_kw: head.inverterKw,
        battery_kwh: head.batteryKwh,
        station_type: head.stationType,
        mount_type: head.mount,
        payment_form: head.payment,
        ocr_engine: ocr.engine,
        ocr_language: ocr.language,
        raw_text: ocr.text,
        parse_warning: buildWarning({ items, check }),
    };

    const rows = items.map((it, i) => ({
        sort_order: i + 1,
        category_key: it.category,
        category_label: it.label,
        name: it.name || it.model,
        model: it.model,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.price,
        amount: it.sum,
        is_by_fact: it.byFact,
        is_merged: it.merged,
    }));

    const { data, error } = await supabase.rpc('save_commercial_offer', {
        p_installation_custom_id: Number(installationId),
        p_offer: payload,
        p_items: rows,
    });

    if (error) {
        return { ok: false, offerId: null, total: null, itemsCount: 0, warning: null, need: null, error: error.message };
    }

    // Другий заєць: той самий розбір одразу стає потребою об'єкта.
    // Збій тут не скасовує оцифровку — КП уже в базі, а потребу можна
    // перезібрати кнопкою в картці проєкту.
    const need = await syncOfferNeed(data);

    return {
        ok: true,
        offerId: data,
        total: head.total,
        itemsCount: rows.length,
        warning: payload.parse_warning,
        need,
        error: null,
    };
}

/**
 * Запускає оцифровку у фоні з будь-якого місця, де вантажать документи.
 *
 * Викликається одразу після успішного завантаження файлів і нічого не
 * блокує: людина вже вільна. Єдиний слід для неї — короткий рядок
 * «оцифровуємо…» і, за кілька секунд, чим це скінчилось.
 *
 * @param {File[]}   files        — усе, що щойно поїхало на сервер
 * @param {number}   installationId
 * @param {number}  [employeeId]
 * @param {object[]}[driveFiles]  — відповідь Google Drive у тому ж порядку
 * @param {function}[notify]      — (повідомлення, тип) — той самий useToast
 */
export function ingestOfferInBackground({ files, installationId, employeeId = null, driveFiles = [], notify }) {
    const idx = (files || []).findIndex(isOfferFile);
    if (idx < 0) return;

    notify?.('Оцифровуємо КП…', 'info');

    const d = Array.isArray(driveFiles) ? driveFiles[idx] : null;
    ingestCommercialOffer({
        file: files[idx],
        installationId,
        employeeId,
        drive: d ? { fileId: d.fileId || d.id, webViewLink: d.webViewLink } : null,
    }).then(r => {
        if (!r.ok) {
            notify?.(`КП не оцифровано: ${r.error}`, 'error');
            return;
        }
        const need = r.need?.mapped
            ? ` · обладнання ${r.need.mapped} з ${r.need.equipment}${r.need.confirmed ? ' → у забезпеченні' : ''}`
            : '';
        notify?.(
            `КП оцифровано: позицій ${r.itemsCount}${r.total != null ? `, сума ${r.total}` : ''}${need}`,
            'success',
        );
    });
}

/** Поточна пропозиція об'єкта разом із позиціями. */
export async function loadCurrentOffer(installationId) {
    const { data: offer, error } = await supabase
        .from('commercial_offers')
        .select('*')
        .eq('installation_custom_id', installationId)
        .eq('is_current', true)
        .maybeSingle();

    if (error || !offer) return { offer: null, items: [] };

    const { data: items } = await supabase
        .from('commercial_offer_items')
        .select('*')
        .eq('offer_id', offer.id)
        .order('sort_order');

    return { offer, items: items || [] };
}

/** Усі версії КП об'єкта — коротким списком для перемикача. */
export async function loadOfferVersions(installationId) {
    const { data } = await supabase
        .from('commercial_offers')
        .select('id, version, status, total_amount, currency, is_current, created_at, source_file_name')
        .eq('installation_custom_id', installationId)
        .order('version', { ascending: false });
    return data || [];
}
