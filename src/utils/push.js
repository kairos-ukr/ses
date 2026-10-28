// =====================================================================
//  K-CORE · Пуш-сповіщення на цьому пристрої
//
//  Людина дозволяє сповіщення → браузер дає «адресу» пристрою → вона
//  зберігається в push_subscriptions. Далі кожне нове сповіщення
//  дзвіночка сервер надсилає пушем (функція push-send).
//  На iPhone пуші працюють лише в програмі, встановленій на головний
//  екран (iOS 16.4+); у звичайній вкладці Safari їх немає.
// =====================================================================

import { supabase } from '../supabaseClient';

// Відкритий ключ VAPID (закритий — лише в сховищі секретів бази)
export const VAPID_PUBLIC = 'BOmX78sdhvIONcTmbDOD4y8nd8ErrBsL6neFgMAayh7mctMBRrExOvJSNL2RpM6q4bGX6qxXwQU4-OF6wxf6dRw';

const SW_URL = `${process.env.PUBLIC_URL || ''}/sw.js`;

export const pushSupported = () =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

/** 'granted' | 'denied' | 'default' | 'unsupported' | 'ios-install' (iPhone без встановлення) */
export const pushState = () => {
    if (!pushSupported()) return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
    return Notification.permission;
};

const toKey = (b64) => {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

export async function registerWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try {
        await navigator.serviceWorker.register(SW_URL);
        return await navigator.serviceWorker.ready;
    } catch { return null; }
}

/** Підписати цей пристрій на пуші людини (дозвіл уже має бути) */
export async function subscribeDevice(employeeId) {
    if (!pushSupported() || Notification.permission !== 'granted' || !employeeId) return false;
    const reg = await registerWorker();
    if (!reg) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) });
    const j = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
        employee_id: employeeId,
        endpoint: j.endpoint,
        p256dh: j.keys.p256dh,
        auth: j.keys.auth,
        user_agent: navigator.userAgent.slice(0, 250),
        failed_count: 0,
    }, { onConflict: 'endpoint' });
    return !error;
}

/** Попросити дозвіл і підписати пристрій. Повертає стан дозволу. */
export async function enablePush(employeeId) {
    if (!pushSupported()) return pushState();
    const perm = await Notification.requestPermission();
    if (perm === 'granted') await subscribeDevice(employeeId);
    return perm;
}

/** Цей пристрій більше не отримує пушів (вихід з програми чи вимкнення) */
export async function forgetDevice() {
    try {
        const reg = await navigator.serviceWorker?.getRegistration(SW_URL);
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return;
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
    } catch { /* немає підписки */ }
}

export async function deviceSubscribed() {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    try {
        const reg = await navigator.serviceWorker.getRegistration(SW_URL);
        return !!(await reg?.pushManager.getSubscription());
    } catch { return false; }
}

/** Пробне сповіщення собі — приходить і в дзвіночок, і пушем */
export const sendTestPush = (employeeId) => supabase.from('app_notifications').insert({
    employee_id: employeeId, kind: 'system', ref_key: `push-test:${Date.now()}`,
    title: 'Пробне сповіщення', body: 'Сповіщення на цьому пристрої працюють', link: '/',
});

// «Пізніше» — не питати тиждень
const LATER_KEY = 'kcore.push.later';
export const askedRecently = () => {
    try { return Date.now() - Number(localStorage.getItem(LATER_KEY) || 0) < 7 * 86400000; } catch { return false; }
};
export const askLater = () => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* немає сховища */ } };
