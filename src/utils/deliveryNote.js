import { supabase } from '../supabaseClient';

// Номер видаткової накладної: ВН-РРРРММДД-NNN.
// Спільний для всіх позицій одного продажу — за ним потім збирається документ.
export const DELIVERY_NOTE_PREFIX = 'ВН';

export const deliveryNoteBase = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${DELIVERY_NOTE_PREFIX}-${y}${m}${d}`;
};

/** Наступний вільний номер накладної на сьогодні. */
export async function generateDeliveryNoteNumber(date = new Date()) {
    const base = deliveryNoteBase(date);
    let next = 1;
    try {
        const { data } = await supabase
            .from('stock_movements')
            .select('reference_document')
            .like('reference_document', `${base}-%`)
            .limit(500);
        const maxNum = (data || []).reduce((max, row) => {
            const n = parseInt(String(row.reference_document).slice(base.length + 1), 10);
            return Number.isNaN(n) ? max : Math.max(max, n);
        }, 0);
        next = maxNum + 1;
    } catch {
        // Якщо номер підібрати не вдалось — беремо перший, користувач може виправити вручну
    }
    return `${base}-${String(next).padStart(3, '0')}`;
}
