// =====================================================================
//  K-CORE · admin-password-link — посилання, щоб працівник задав новий пароль
//
//  Лише адміністратор (право змінювати «Доступи»: шаблон, де «Доступи»
//  можна змінювати, або «Без обмежень») створює одноразове посилання для
//  конкретної людини: { employee_id, app_url } → { link, email }.
//  Людина відкриває його, задає новий пароль і одразу працює.
//
//  Лист нікуди не йде: посилання адміністратор передає сам (Viber,
//  Telegram), тож усе працює й без поштового сервера. Посилання веде
//  прямо в програму (#/reset-password?token_hash=…) і не залежить від
//  списку дозволених адрес у налаштуваннях входу Supabase.
//  Пароль адміністратора може скинути лише інший адміністратор
//  (роль super_admin). Кожне посилання — у журналі змін.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Так само, як domain/access.js → defaultTemplateKey
const defaultTemplate = (emp: Record<string, unknown>) =>
    emp.role === 'super_admin' ? 'admin' : emp.role === 'installer' ? (Number(emp.tier) === 1 ? 'brigadier' : 'installer') : 'office';

/** Чи може людина змінювати «Доступи» (domain/access.js → can('access', 'edit')) */
async function canManageAccess(emp: Record<string, any> | null): Promise<boolean> {
    if (!emp || emp.access_blocked_at) return false;
    if (!['office', 'super_admin'].includes(emp.role)) return false;
    if (emp.access_unrestricted === true) return true;
    const own = emp.access_overrides || {};
    let perms: Record<string, unknown> | null = null;
    if (Object.prototype.hasOwnProperty.call(own, 'access')) {
        perms = own.access;
    } else {
        const key = emp.access_template || defaultTemplate(emp);
        const { data } = await admin.from('access_templates').select('perms').eq('key', key).maybeSingle();
        perms = data ? (data.perms?.access ?? null) : (key === 'admin' ? { view: true, edit: true } : null);
    }
    return !!(perms && perms.view && perms.edit);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Лише POST' }, 405);
    try {
        const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const { data: who } = jwt ? await admin.auth.getUser(jwt) : { data: null };
        if (!who?.user) return json({ error: 'Потрібно увійти' }, 401);

        const { data: me } = await admin.from('employees').select('*').eq('user_id', who.user.id).maybeSingle();
        if (!(await canManageAccess(me))) return json({ error: 'Скидати паролі може лише адміністратор' }, 403);

        const body = await req.json().catch(() => ({}));
        const id = Number(body?.employee_id);
        if (!Number.isFinite(id)) return json({ error: 'Не вказано працівника' }, 400);

        let base: string;
        try {
            const u = new URL(String(body?.app_url || ''));
            if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
            base = `${u.origin}${u.pathname}`;
        } catch {
            return json({ error: 'Немає адреси програми' }, 400);
        }

        const { data: emp } = await admin.from('employees').select('id, custom_id, name, role, user_id').eq('id', id).maybeSingle();
        if (!emp) return json({ error: 'Працівника не знайдено' }, 404);
        if (!emp.user_id) return json({ error: 'У працівника ще немає акаунта для входу' }, 400);
        if (emp.role === 'super_admin' && me.role !== 'super_admin' && emp.id !== me.id) {
            return json({ error: 'Пароль адміністратора може скинути лише адміністратор' }, 403);
        }

        const { data: acc } = await admin.auth.admin.getUserById(emp.user_id);
        const email = acc?.user?.email;
        if (!email) return json({ error: 'В акаунта немає пошти' }, 400);

        // Лише створює одноразовий ключ — лист не надсилається
        const { data: gen, error: genErr } = await admin.auth.admin.generateLink({ type: 'recovery', email });
        const token = gen?.properties?.hashed_token;
        if (genErr || !token) return json({ error: genErr?.message || 'Не вдалося створити посилання' }, 500);

        await admin.from('change_log').insert({
            table_name: 'employees', record_key: String(emp.custom_id ?? emp.id), action: 'update',
            changes: { password_link: [null, 'створено'] },
            actor_user: who.user.id, actor_name: me.name || null,
        });

        return json({ link: `${base}#/reset-password?token_hash=${encodeURIComponent(token)}&type=recovery`, email });
    } catch (e) {
        return json({ error: String((e as Error)?.message || e) }, 500);
    }
});
