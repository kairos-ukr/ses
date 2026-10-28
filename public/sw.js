// =====================================================================
//  K-CORE · сервіс-воркер — лише пуш-сповіщення
//
//  Нічого не кешує (сторінки завжди свіжі з сервера). Приймає пуш,
//  показує системне сповіщення; натиск — відкриває K-Core на потрібній
//  сторінці (або перемикає вже відкриту вкладку).
// =====================================================================

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
    const scope = self.registration.scope;
    event.waitUntil(self.registration.showNotification(data.title || 'K-Core', {
        body: data.body || '',
        icon: `${scope}logo192.png`,
        tag: data.tag || undefined,
        renotify: !!data.tag,
        data: { url: data.url || '/' },
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const scope = self.registration.scope;
    const path = (event.notification.data && event.notification.data.url) || '/';
    const target = `${scope}#${path.startsWith('/') ? path : `/${path}`}`;
    event.waitUntil((async () => {
        const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const mine = wins.find(w => w.url.startsWith(scope));
        if (mine) {
            await mine.focus();
            try { await mine.navigate(target); } catch (e) { mine.postMessage({ type: 'kcore-open', url: path }); }
            return;
        }
        await self.clients.openWindow(target);
    })());
});
