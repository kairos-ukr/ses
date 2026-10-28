// =====================================================================
//  K-CORE · Монтаж — спільні дані й підписи
//
//  Графік робіт — таблиця installation_workers (рядок = людина на об'єкті
//  в день; без об'єкта — власна задача, назва в notes). Вихідні —
//  attendance. Звідси ж рахуються відпрацьовані дні: день у графіку, на
//  який людина не поставила вихідний.
// =====================================================================

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';

export const MontazhCtx = createContext(null);
/** { me, who, preview, isOffice, canWrite, people, setPreview, refreshBadges } */
export const useMontazh = () => useContext(MontazhCtx);

/**
 * Захист від «застарілих» відповідей: перемкнули тиждень чи людину, поки
 * попередній запит ще йшов, — його результат не повинен перезаписати новий.
 *   const fresh = useFresh();  …  const ok = fresh();  await …;  if (!ok()) return;
 */
export const useFresh = () => {
    const seq = useRef(0);
    const start = useRef(() => { const my = ++seq.current; return () => my === seq.current; });
    return start.current;   // та сама функція на кожному рендері
};

/** Поточний час, що оновлюється раз на хвилину — для «час звіту» */
export const useNow = () => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
    return now;
};

/** З 15:30 нагадуємо про звіт (так само, як бот) */
export const REPORT_HOUR = 15;
export const REPORT_MINUTE = 30;
export const isReportTime = (d = new Date()) => d.getHours() * 60 + d.getMinutes() >= REPORT_HOUR * 60 + REPORT_MINUTE;

/* ---------- дати ---------- */

export const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const atNoon = (iso) => new Date(`${iso}T12:00:00`);
export const shiftDay = (iso, n) => { const d = atNoon(iso); d.setDate(d.getDate() + n); return isoDay(d); };
/** Понеділок тижня, у якому цей день */
export const weekStartOf = (iso) => shiftDay(iso, -((atNoon(iso).getDay() + 6) % 7));
export const fmtDay = (iso, opts = { weekday: 'long', day: 'numeric', month: 'long' }) => atNoon(iso).toLocaleDateString('uk-UA', opts);
export const weekdayShort = (iso) => atNoon(iso).toLocaleDateString('uk-UA', { weekday: 'short' });
export const dayNum = (iso) => atNoon(iso).getDate();
export const monthName = (iso) => atNoon(iso).toLocaleDateString('uk-UA', { month: 'long' });

/** 1 день, 3 дні, 5 днів, 21 день */
export const daysWord = (n) => {
    const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
    if (a === 1 && b !== 11) return 'день';
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'дні';
    return 'днів';
};

/** «Сьогодні», «Завтра», «Учора» або «вівторок, 21 жовтня» */
export const relDay = (iso) => {
    const t = isoDay();
    if (iso === t) return 'Сьогодні';
    if (iso === shiftDay(t, 1)) return 'Завтра';
    if (iso === shiftDay(t, -1)) return 'Учора';
    return fmtDay(iso);
};

/* ---------- вихідні ---------- */

export const OFF_KEYS = ['OFF', 'VACATION', 'SICK_LEAVE'];
export const OFF_LABEL = { OFF: 'Вихідний', VACATION: 'Відпустка', SICK_LEAVE: 'Лікарняний' };
// «поставити / скасувати …» — знахідний відмінок
export const OFF_WHAT = { OFF: 'вихідний', VACATION: 'відпустку', SICK_LEAVE: 'лікарняний' };
// Позначка в attendance.notes: вихідний поставила сама людина в додатку
export const SELF_SET_NOTE = 'Поставив сам у додатку';

/* ---------- об'єкти ---------- */

export const OBJECT_FIELDS = 'id, custom_id, name, status, workflow_stage, capacity_kw, station_type, mount_type, quant_phase, gps_link, latitude, longitude, client:clients(name, phone, populated_place, oblast)';

export async function loadObjects(ids) {
    const list = [...new Set((ids || []).filter(Boolean))];
    if (!list.length) return new Map();
    const { data } = await supabase.from('installations').select(OBJECT_FIELDS).in('custom_id', list);
    return new Map((data || []).map(o => [o.custom_id, o]));
}

export const placeOf = (o) => [o?.client?.populated_place, o?.client?.oblast].filter(Boolean).join(', ');

/** «Нетішин, Коваль Ірина» — як об'єкт називають на виїзді */
export const objectTitle = (o) => {
    if (!o) return "Об'єкт";
    const parts = [o.client?.populated_place, o.client?.name || o.name].filter(Boolean);
    return parts.length ? parts.join(', ') : (o.name || `Об'єкт ${o.custom_id}`);
};

export const kwText = (v) => (v ? `${String(Math.round(Number(v) * 10) / 10).replace('.', ',')} кВт` : '');

export const routeLink = (o) => {
    if (o?.gps_link) return o.gps_link;
    if (o?.latitude && o?.longitude) return `https://www.google.com/maps/search/?api=1&query=${o.latitude},${o.longitude}`;
    const place = placeOf(o);
    return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : null;
};

export const telLink = (phone) => {
    const p = String(phone || '').replace(/[^\d+]/g, '');
    return p.length >= 7 ? `tel:${p}` : null;
};

/* ---------- графік ---------- */

/**
 * Рядки графіка → виїзди: один об'єкт (або одна власна задача) в один день.
 * { key, date, installationId, notes, workerIds: [custom_id] }
 */
export function groupVisits(rows) {
    const map = new Map();
    (rows || []).forEach(r => {
        const obj = r.installation_custom_id || null;
        const key = `${r.work_date}|${obj || `custom:${(r.notes || '').trim()}`}`;
        if (!map.has(key)) map.set(key, { key, date: r.work_date, installationId: obj, notes: (r.notes || '').trim(), workerIds: [] });
        const v = map.get(key);
        if (!v.notes && r.notes) v.notes = r.notes.trim();
        if (r.employee_custom_id && !v.workerIds.includes(r.employee_custom_id)) v.workerIds.push(r.employee_custom_id);
    });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export const visitTitle = (v, objects) => (v.installationId ? objectTitle(objects.get(v.installationId)) : (v.notes || 'Виїзд'));

/* ---------- люди ---------- */

export const isBrigadier = (p) => Number(p?.tier) === 1;

export async function loadPeople() {
    const { data } = await supabase.from('employees')
        .select('id, custom_id, name, phone, email, role, tier, position, hidden_from_list, access_blocked_at')
        .order('name');
    return new Map((data || []).map(p => [p.custom_id, p]));
}

/** Хто може отримати задачу від монтажника: офіс і керівники з доступом */
export const officePeople = (people) => [...people.values()]
    .filter(p => ['office', 'super_admin'].includes(p.role) && !p.hidden_from_list && !p.access_blocked_at && p.name)
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

/* ---------- задачі ---------- */

export const TASK_FIELDS = 'custom_id, task_text, status, due_date, created_at, data_complete, creator_email, assigned_to, installation:installations(id, custom_id, name)';
export const OPEN_TASK = ['нове', 'в процесі'];
export const plainText = (html) => String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
