// =====================================================================
//  K-CORE · Розпізнавання PDF комерційної пропозиції (OCR.space)
//
//  Ключ і параметри лежать прямо тут, як адреса воркера в PWT.jsx і
//  ключ Supabase у supabaseClient.js. Нічого налаштовувати перед
//  роботою не треба: склонував, запустив — оцифровка працює. Ніяких
//  .env, ніяких «а звідки він має взяти ключ».
//
//  НАЛАШТУВАННЯ ЗАФІКСОВАНІ І ВИБОРУ НЕ МАЮТЬ:
//
//    OCREngine = 3   рушій, який віддає таблицю в Markdown. Саме з нього
//                    виходить найточніший розбір: колонки лишаються
//                    колонками, і «кількість» не злипається з «ціною».
//    language  = auto  рушії 2 і 3 визначають мову самі; значення 'ukr'
//                    вони не розуміють взагалі (це параметр рушія 1).
//    isTable   = true  читати рядок за рядком, а не суцільним текстом.
//
//  Параметри підібрані на реальних КП і навмисно в константах, а не в
//  інтерфейсі: різні галочки в різних менеджерів давали б різну якість
//  оцифровки на однакових документах.
// =====================================================================

/* Ключ OCR.space. Лежить у коді свідомо: у зібраному бандлі CRA він
   опинився б усе одно, а так його видно, і замінити його — один рядок.
   Якщо колись знадобиться сховати — переносимо цей виклик у той самий
   Cloudflare Worker, де вже живе /parse-pdf, і ходимо туди без ключа. */
export const OCR_API_KEY = 'K88558555588957';

export const OCR_ENGINE = '3';
export const OCR_LANGUAGE = 'auto';

const OCR_URL = 'https://api.ocr.space/parse/image';

/**
 * Проганяє файл через OCR.space із зафіксованими налаштуваннями.
 *
 * @param {File|Blob} file — PDF або зображення комерційної пропозиції
 * @returns {Promise<{text: string, engine: string, language: string, raw: object}>}
 * @throws {Error} з людською причиною: недоступний сервіс, завеликий
 *   файл, забагато сторінок, порожній результат.
 */
export async function recognizeOffer(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('OCREngine', OCR_ENGINE);
    fd.append('language', OCR_LANGUAGE);
    fd.append('isTable', 'true');
    fd.append('scale', 'false');
    fd.append('isOverlayRequired', 'false');

    let res;
    try {
        res = await fetch(OCR_URL, { method: 'POST', headers: { apikey: OCR_API_KEY }, body: fd });
    } catch {
        throw new Error('Сервіс розпізнавання недоступний (api.ocr.space не відповідає).');
    }

    let json;
    try {
        json = await res.json();
    } catch {
        // Ліміти тарифу сервіс іноді віддає не JSON-ом, а голим текстом
        throw new Error(`Сервіс розпізнавання повернув не JSON (код ${res.status}). Найчастіше це ліміт тарифу: файл завеликий або сторінок більше, ніж дозволено.`);
    }

    if (json.IsErroredOnProcessing) {
        const m = json.ErrorMessage;
        throw new Error(Array.isArray(m) ? m.join('; ') : (m || 'OCR повернув помилку'));
    }

    const text = (json.ParsedResults || []).map(p => p.ParsedText || '').join('\n');
    if (!text.trim()) {
        throw new Error('OCR не побачив у файлі жодного рядка тексту.');
    }

    return { text, engine: OCR_ENGINE, language: OCR_LANGUAGE, raw: json };
}
