// Supabase віддає не більше 1000 рядків за раз. Для звітів і воронки
// потрібні всі — тож читаємо сторінками, доки дані не скінчаться.
//
//   const rows = await fetchAll(() => supabase.from('x').select('a,b').eq(...).order('id'));
//
// build() має щоразу повертати НОВИЙ запит (без .range) — сторінку
// додаємо тут.

const PAGE = 1000;

export async function fetchAll(build, { max = 20000 } = {}) {
    const out = [];
    for (let from = 0; from < max; from += PAGE) {
        const { data, error } = await build().range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return out;
}
