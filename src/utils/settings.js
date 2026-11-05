// =====================================================================
//  K-CORE · Спільні налаштування (таблиця app_settings)
//
//  • usd_uah_rate       — поточний курс долара. Курс тепер свій у кожної
//                         угоди (installations.exchange_rate): нова угода
//                         бере поточний у момент створення й тримає свій.
//                         Поточний ще підставляється в платежі й продажі
//                         без об'єкта і рахує старі угоди без курсу.
//  • supply_automation  — чи система сама створює нагадування
//                         забезпечення і заявки в закупівлю (обидва —
//                         лише за ручним перемикачем, за замовчуванням ні).
//  • take_reminders     — нагадування бригадам «Взяти з собою»: у
//                         сповіщенні про графік, зранку о 7:00, кому.
//  • report_reminders   — звіти бригад: нагадування бригаді (коли, кому),
//                         менеджеру — щойно звіт надіслано, вечірнє
//                         зведення «звіту немає» і хто ще його отримує.
//  • telegram_bot       — назва бота компанії (записує сам бот).
//  • day_switch         — о котрій «завтра» стає головним днем на
//                         «Сьогодні» в офісі й у «Монтажі» (за
//                         замовчуванням 19:00).
// =====================================================================

import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const cache = new Map();
const listeners = new Set();

export async function getSetting(key, { fresh = false } = {}) {
    if (!fresh && cache.has(key)) return cache.get(key);
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    const value = data?.value ?? null;
    cache.set(key, value);
    return value;
}

export async function saveSetting(key, value, employeeId = null) {
    const { error } = await supabase.from('app_settings')
        .upsert({ key, value, updated_by: employeeId || null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    cache.set(key, value);
    listeners.forEach(fn => fn(key, value));
}

/* ---------------- Курс долара ---------------- */

/** Курс із налаштувань (гривень за 1 $) або null, якщо ще не задано */
export async function loadUsdRate(opts) {
    try {
        const v = await getSetting('usd_uah_rate', opts);
        return Number(v?.rate) > 0 ? Number(v.rate) : null;
    } catch {
        return null;
    }
}

export const saveUsdRate = (rate, employeeId) =>
    saveSetting('usd_uah_rate', { rate: Number(rate) }, employeeId);

/** Офіційний курс НБУ на сьогодні: { rate, date } */
export async function fetchNbuRate() {
    const res = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json');
    if (!res.ok) throw new Error('НБУ не відповідає');
    const [row] = await res.json();
    if (!(Number(row?.rate) > 0)) throw new Error('НБУ не віддав курс');
    return { rate: Math.round(Number(row.rate) * 100) / 100, date: row.exchangedate };
}

/** Поточний курс; оновлюється, щойно його змінили будь-де в програмі */
export function useUsdRate() {
    const [rate, setRate] = useState(() => (cache.has('usd_uah_rate') ? Number(cache.get('usd_uah_rate')?.rate) || null : undefined));
    useEffect(() => {
        let alive = true;
        loadUsdRate().then(r => { if (alive) setRate(r); });
        const fn = (key, value) => { if (key === 'usd_uah_rate') setRate(Number(value?.rate) || null); };
        listeners.add(fn);
        return () => { alive = false; listeners.delete(fn); };
    }, []);
    return rate;   // undefined — ще вантажиться, null — не задано
}

/* ---------------- Автоматика забезпечення ---------------- */

export const SUPPLY_AUTO_DEFAULT = Object.freeze({ alerts: false, requests: false });

export async function loadSupplyAutomation() {
    try {
        return { ...SUPPLY_AUTO_DEFAULT, ...((await getSetting('supply_automation', { fresh: true })) || {}) };
    } catch {
        return { ...SUPPLY_AUTO_DEFAULT };
    }
}

/* ---------------- «Взяти з собою» ---------------- */

// Так само за замовчуванням і в базі (take_reminders_cfg), і в боті
export const TAKE_REMINDERS_DEFAULT = Object.freeze({ schedule: true, morning: true, to: 'crew' });

export async function loadTakeReminders() {
    try {
        return { ...TAKE_REMINDERS_DEFAULT, ...((await getSetting('take_reminders', { fresh: true })) || {}) };
    } catch {
        return { ...TAKE_REMINDERS_DEFAULT };
    }
}

/* ---------------- Звіти бригад ---------------- */

// Так само за замовчуванням і в базі (report_reminders_cfg), і в боті
export const REPORT_REMINDERS_DEFAULT = Object.freeze({
    crew: true, first: '15:30', second: '17:30', to: 'brigadier',
    manager: true, digest: true, digest_time: '19:00', digest_to: [],
});

export async function loadReportReminders() {
    try {
        return { ...REPORT_REMINDERS_DEFAULT, ...((await getSetting('report_reminders', { fresh: true })) || {}) };
    } catch {
        return { ...REPORT_REMINDERS_DEFAULT };
    }
}

/* ---------------- Коли «завтра» стає головним ---------------- */

// Власник 04.11: сьогоднішній графік — головний «максимум до 19», потім завтрашній
export const DAY_SWITCH_DEFAULT = '19:00';
const DAY_SWITCH_KEY = 'day_switch';

/** «19:00» → 1140 хвилин від півночі; погане значення — null */
export const minutesOf = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Чи вже настала година, з якої головний — завтрашній день */
export const isEvening = (now = new Date(), time = DAY_SWITCH_DEFAULT) =>
    now.getHours() * 60 + now.getMinutes() >= (minutesOf(time) ?? minutesOf(DAY_SWITCH_DEFAULT));

export const saveDaySwitch = (time, employeeId) => saveSetting(DAY_SWITCH_KEY, { time }, employeeId);

/** Година перемикання з налаштувань; оновлюється, щойно її змінили */
export function useDaySwitch() {
    const cached = () => (cache.has(DAY_SWITCH_KEY) ? cache.get(DAY_SWITCH_KEY)?.time : null);
    const [time, setTime] = useState(() => (minutesOf(cached()) != null ? cached() : DAY_SWITCH_DEFAULT));
    useEffect(() => {
        let alive = true;
        getSetting(DAY_SWITCH_KEY)
            .then(v => { if (alive) setTime(minutesOf(v?.time) != null ? v.time : DAY_SWITCH_DEFAULT); })
            .catch(() => {});
        const fn = (key, value) => { if (key === DAY_SWITCH_KEY) setTime(minutesOf(value?.time) != null ? value.time : DAY_SWITCH_DEFAULT); };
        listeners.add(fn);
        return () => { alive = false; listeners.delete(fn); };
    }, []);
    return time;
}

/**
 * { evening, time }: чи вже «вечір» (головний — завтрашній день) і о котрій
 * перемикаємо. Перевіряє щопівхвилини, тож відкрита сторінка перемикається сама.
 */
export function useEvening() {
    const time = useDaySwitch();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const t = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(t);
    }, []);
    return { evening: isEvening(now, time), time, now };
}
