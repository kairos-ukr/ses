// =====================================================================
//  K-CORE · site-lead — заявки з форм сайту в «Ліди»
//
//  Сайт (WordPress, Contact Form 7 + плагін «CF7 to Webhook») після
//  відправки листа шле сюди поля форми. Адреса вебхука в кожній формі:
//    …/functions/v1/site-lead?key=<ключ>&form=<код форми>
//  Ключ — integration_keys ('site_leads'), код форми — див. FORMS.
//  У «Special Mail Tags» форми — рядок [_url]: з нього беремо сторінку
//  й мітки реклами (utm_…).
//
//  Відповідаємо сайту ЗАВЖДИ 200: якщо плагін отримає помилку, клієнт
//  побачить «не вдалося надіслати», і реклама не порахує заявку. Що
//  саме сталося — у полі ok/error відповіді й у логах функції.
//
//  GET з ключем — перевірка без створення ліда.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
});

/** Код форми з адреси вебхука → що хоче клієнт */
const FORMS: Record<string, string> = {
    callback: 'Замовити дзвінок',
    calc: 'Замовити розрахунок',
    consult: 'Отримати консультацію',
    equipment: 'Консультація: насоси, обігрівачі, кондиціонери, сигналізація',
};

/** Перша частина адреси сторінки → назва сторінки */
const PAGES: Record<string, string> = {
    '': 'Головна',
    business: 'Для бізнесу',
    'green-tariff': 'Зелений тариф',
    'hybrid-solar-station': 'Гібридна станція',
    objects: 'Наші обʼєкти',
    'heat-pumps': 'Теплові насоси',
    heaters: 'Обігрівачі',
    conditioners: 'Кондиціонери',
    security: 'Сигналізація',
    thankspage: 'Дякуємо',
};

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const str = (v: unknown): string => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v)).trim();

async function readBody(req: Request): Promise<Record<string, unknown>> {
    const type = req.headers.get('content-type') || '';
    try {
        if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
            const out: Record<string, unknown> = {};
            (await req.formData()).forEach((v, k) => { if (typeof v === 'string') out[k] = v; });
            return out;
        }
        const text = await req.text();
        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return Object.fromEntries(new URLSearchParams(text));
        }
    } catch {
        return {};
    }
}

/** Перше непорожнє поле, назва якого підходить. Службові «_…» (теги CF7) — пропускаємо */
const pick = (body: Record<string, unknown>, re: RegExp) => {
    for (const [k, v] of Object.entries(body)) {
        if (!k.startsWith('_') && re.test(k) && str(v)) return str(v);
    }
    return '';
};

function pageOf(raw: string): { page: string | null; url: string | null; utm: Record<string, string> } {
    const utm: Record<string, string> = {};
    if (!raw) return { page: null, url: null, utm };
    let u: URL;
    try { u = new URL(raw); } catch { return { page: null, url: raw.slice(0, 500), utm }; }
    UTM_KEYS.forEach(k => { const v = u.searchParams.get(k); if (v) utm[k.slice(4)] = v.slice(0, 200); });
    if (u.searchParams.get('fbclid')) utm.click = 'facebook';
    else if (u.searchParams.get('gclid')) utm.click = 'google';

    const parts = u.pathname.split('/').filter(Boolean).map(p => { try { return decodeURIComponent(p); } catch { return p; } });
    let page: string;
    if (parts[0] === 'product' && parts[1]) page = `Товар: ${parts[1].replace(/-/g, ' ')}`;
    else page = PAGES[parts[0] || ''] ?? parts.join(' / ').replace(/-/g, ' ');
    return { page: page.slice(0, 120) || null, url: `${u.origin}${u.pathname}`, utm };
}

Deno.serve(async (req) => {
    try {
        const url = new URL(req.url);
        const key = url.searchParams.get('key') || req.headers.get('x-kcore-key') || '';

        if (req.method === 'GET') {
            const { data, error } = await supabase.rpc('site_lead_intake', { p_key: key, p_data: { check: true } });
            if (error) throw error;
            return json(data?.ok
                ? { ok: true, message: 'Приймач заявок працює, ключ правильний' }
                : { ok: false, message: 'Неправильний або порожній ключ' });
        }
        if (req.method !== 'POST') return json({ ok: false, error: 'method' });

        const body = await readBody(req);
        const name = pick(body, /name|імʼя|ім'я|imya|fio|піб/i);
        let phone = pick(body, /tel|phone|телефон/i);
        if (!phone) {
            // Поле телефону назвали інакше — шукаємо значення, схоже на номер
            phone = Object.entries(body).map(([, v]) => str(v))
                .find(v => { const d = v.replace(/\D/g, ''); return d.length >= 9 && d.length <= 15 && !/[a-zа-яіїєґ]/i.test(v); }) || '';
        }
        const formCode = url.searchParams.get('form') || str(body.form);
        const { page, url: pageUrl, utm } = pageOf(str(body._url) || str(body.url) || str(body._post_url));

        const { data, error } = await supabase.rpc('site_lead_intake', {
            p_key: key,
            p_data: {
                name, phone,
                form: FORMS[formCode] || formCode || null,
                page: page || str(body._post_title) || null,
                url: pageUrl,
                utm,
            },
        });
        if (error) throw error;
        if (!data?.ok) console.warn('site-lead: не прийнято', data?.error, JSON.stringify({ name, phone, formCode }));
        return json(data || { ok: false });
    } catch (e) {
        console.error('site-lead:', (e as Error)?.message || e);
        return json({ ok: false, error: 'server' });
    }
});
