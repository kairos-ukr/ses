// ============================================================================
// Утиліта співставлення назв: OCR-специфікації / рахунки постачальників ->
// номенклатура складу.
//
// Головна причина, чому "ідентичні" назви не матчаться:
//  - латинські літери-двійники з OCR (a/а, e/е, o/о, c/с, p/р, x/х, i/і...)
//  - нерозривні/подвійні пробіли, апострофи, лапки, розділові знаки
//  - регістр, і/и/ї, роздільники розмірів (4х6 / 4*6 / 4x6)
// Тому БУДЬ-ЯКЕ порівняння виконується тільки після normalizeName з ОБОХ боків.
// ============================================================================

// Латинські двійники -> кирилиця (нормалізація застосовується до обох сторін,
// тому змішування алфавітів у брендах порівнянню не шкодить)
const HOMOGLYPHS = {
    a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м',
    o: 'о', p: 'р', t: 'т', x: 'х', y: 'у'
};

export const normalizeName = (str) => {
    if (!str) return '';
    let s = String(str).toLowerCase();
    // апострофи, лапки — геть
    s = s.replace(/['’‘`"«»]/g, '');
    // латинські двійники -> кирилиця
    s = s.split('').map(ch => HOMOGLYPHS[ch] || ch).join('');
    // уніфікація кириличних варіантів
    s = s.replace(/[ёё]/g, 'е').replace(/[іїй]/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г').replace(/[ъь]/g, '');
    // розміри: 4х6 / 4*6 / 4×6 / 4 x 6 -> 4х6 (х — кирилична після мапінгу)
    s = s.replace(/(\d)\s*[х×*]\s*(\d)/g, '$1х$2');
    // все, що не літера/цифра -> пробіл; стиснути пробіли
    s = s.replace(/[^a-zа-я0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
};

export const tokenizeName = (str) =>
    normalizeName(str).split(' ').filter(t => t.length >= 2 || /^\d+$/.test(t));

/**
 * Пошук найкращого збігу назви з номенклатурою.
 * @param {string} rawName — сира назва з документа
 * @param {Array} nomenclatures — [{ id, fullName, name, sku, brand, model, technical_characteristics }]
 * @param {Array} memory — рядки supplier_mappings [{ supplier_item_name, nomenclature_id }]
 * @returns {{ id: (number|string), source: ('memory'|'exact'|'fuzzy'|null) }}
 */
export const findBestNomenclatureMatch = (rawName, nomenclatures = [], memory = []) => {
    const norm = normalizeName(rawName);
    if (!norm) return { id: '', source: null };

    // 1. Пам'ять співставлень (нормалізоване порівняння)
    const memMatch = memory.find(m => normalizeName(m.supplier_item_name) === norm);
    if (memMatch) return { id: memMatch.nomenclature_id, source: 'memory' };

    // 2. Точний збіг назви у різних комбінаціях полів
    for (const nom of nomenclatures) {
        const variants = [
            nom.fullName,
            nom.name,
            [nom.name, nom.technical_characteristics].filter(Boolean).join(' '),
            [nom.brand, nom.name].filter(Boolean).join(' '),
            [nom.name, nom.brand].filter(Boolean).join(' '),
            [nom.brand, nom.name, nom.technical_characteristics].filter(Boolean).join(' ')
        ];
        if (variants.some(v => v && normalizeName(v) === norm)) {
            return { id: nom.id, source: 'exact' };
        }
    }

    // 3. SKU згадано прямо в тексті
    const skuMatch = nomenclatures.find(n => n.sku && String(n.sku).length >= 4 && norm.includes(normalizeName(n.sku)));
    if (skuMatch) return { id: skuMatch.id, source: 'exact' };

    // 4. Токен-скоринг за схожістю
    const qTokens = tokenizeName(rawName);
    if (qTokens.length === 0) return { id: '', source: null };
    const qNumbers = qTokens.filter(t => /\d/.test(t));

    let best = null;
    let bestScore = 0;

    for (const nom of nomenclatures) {
        const targetStr = [nom.fullName, nom.brand, nom.model, nom.technical_characteristics, nom.sku].filter(Boolean).join(' ');
        const tTokens = new Set(tokenizeName(targetStr));

        let score = 0;
        let matched = 0;
        for (const qt of qTokens) {
            let hit = tTokens.has(qt);
            if (!hit && qt.length >= 4) {
                // часткове входження для довгих слів (гофротруба ~ гофра)
                for (const tt of tTokens) {
                    if (tt.length >= 4 && (tt.includes(qt) || qt.includes(tt))) { hit = true; break; }
                }
            }
            if (hit) {
                matched++;
                // числа (переріз, діаметр, потужність) важать більше за довжину
                score += /\d/.test(qt) ? 8 : Math.min(qt.length, 10);
            }
        }

        // якщо в запиті є числа, а жодне не збіглося — це майже напевно інша позиція
        if (qNumbers.length > 0) {
            const numHits = qNumbers.filter(n => tTokens.has(n)).length;
            if (numHits === 0) score *= 0.3;
        }
        // низьке покриття токенів запиту — штраф
        if (matched / qTokens.length < 0.5) score *= 0.5;

        if (score > bestScore) { bestScore = score; best = nom; }
    }

    const threshold = Math.max(8, qTokens.length * 2);
    if (best && bestScore >= threshold) return { id: best.id, source: 'fuzzy' };
    return { id: '', source: null };
};
