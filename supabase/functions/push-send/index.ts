// =====================================================================
//  K-CORE · push-send — пуш-сповіщення на пристрої людини
//
//  Викликається тригером бази після кожного нового сповіщення
//  (app_notifications): { id }. Бере сповіщення, позначає його
//  «надіслано пушем» (щоб не піти двічі) і надсилає на всі пристрої
//  людини з push_subscriptions. Пристрої, яких уже немає (404/410),
//  прибираються самі. Ключі VAPID — у сховищі секретів бази (push_vapid).
// =====================================================================

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
});

let ready = false;
async function configure() {
    if (ready) return;
    const { data, error } = await supabase.rpc('push_vapid');
    if (error || !data?.private) throw new Error('Немає ключів VAPID');
    webpush.setVapidDetails(data.subject, data.public, data.private);
    ready = true;
}

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
    try {
        const { id } = await req.json().catch(() => ({}));
        if (!id) return json({ error: 'id' }, 400);

        // Забираємо сповіщення собі: якщо його вже надсилали — нічого не робимо
        const { data: n } = await supabase.from('app_notifications')
            .update({ pushed_at: new Date().toISOString() })
            .eq('id', id).is('pushed_at', null)
            .select('id, employee_id, kind, title, body, link')
            .maybeSingle();
        if (!n) return json({ skipped: true });

        const { data: subs } = await supabase.from('push_subscriptions')
            .select('id, endpoint, p256dh, auth, failed_count').eq('employee_id', n.employee_id);
        if (!subs?.length) return json({ sent: 0 });

        await configure();
        const payload = JSON.stringify({
            title: n.title || 'K-Core',
            body: n.body || '',
            url: n.link || '/',
            tag: `${n.kind}-${n.id}`,
        });

        let sent = 0;
        await Promise.all(subs.map(async (s) => {
            try {
                await webpush.sendNotification(
                    { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                    payload,
                    { TTL: 60 * 60 * 24, urgency: 'high' },
                );
                sent += 1;
                await supabase.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), failed_count: 0 }).eq('id', s.id);
            } catch (e) {
                const code = (e as { statusCode?: number })?.statusCode;
                if (code === 404 || code === 410) {
                    await supabase.from('push_subscriptions').delete().eq('id', s.id);
                } else {
                    await supabase.from('push_subscriptions').update({ failed_count: (s.failed_count || 0) + 1 }).eq('id', s.id);
                }
            }
        }));
        return json({ sent });
    } catch (e) {
        return json({ error: String((e as Error)?.message || e) }, 500);
    }
});
