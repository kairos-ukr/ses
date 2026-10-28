// =====================================================================
//  K-CORE · Монтаж — сховище на самому телефоні (IndexedDB)
//
//  Звіт, поки його заповнюють, живе на телефоні: текст, кабель, потреби
//  і фото (самі файли). Закрили додаток, зник інтернет, сів телефон —
//  нічого не губиться. Звіт, натиснутий «Надіслати» без зв'язку, лежить
//  тут із позначкою pending і відправляється сам, щойно з'явиться мережа.
//
//  У приватному режимі браузера сховища може не бути — тоді все працює
//  як раніше, просто без запасу на телефоні.
// =====================================================================

const DB_NAME = 'kcore-montazh';
const STORE = 'reports';

let dbPromise = null;
const openDb = () => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            if (typeof indexedDB === 'undefined') { reject(new Error('no-idb')); return; }
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        }).catch((e) => { dbPromise = null; throw e; });
    }
    return dbPromise;
};

const run = async (mode, fn) => {
    try {
        const db = await openDb();
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, mode);
            const req = fn(tx.objectStore(STORE));
            tx.oncomplete = () => resolve(req?.result);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    } catch {
        return undefined;   // сховища немає — працюємо без нього
    }
};

/** Ключ звіту: об'єкт + день */
export const reportKey = (objId, date) => `${objId}|${date}`;

export const localGet = (key) => run('readonly', s => s.get(key));
export const localSet = (key, value) => run('readwrite', s => s.put({ ...value, savedAt: Date.now() }, key));
export const localDel = (key) => run('readwrite', s => s.delete(key));

/** Усі збережені звіти: [{ key, value }] */
export const localAll = async () => {
    const keys = (await run('readonly', s => s.getAllKeys())) || [];
    const values = (await run('readonly', s => s.getAll())) || [];
    return keys.map((key, i) => ({ key, value: values[i] }));
};
