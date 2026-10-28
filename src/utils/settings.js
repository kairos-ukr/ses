// =====================================================================
//  K-CORE · Спільні налаштування (таблиця app_settings)
//
//  • usd_uah_rate       — курс долара: один на всю програму. Ним
//                         заповнюються поля «курс» у платежах, продажах,
//                         звітах бригад, прибутку й аналітиці. Ніде в коді
//                         курс не зашитий; можна підтягнути курс НБУ.
//  • supply_automation  — чи система сама створює нагадування
//                         забезпечення і заявки в закупівлю (обидва —
//                         лише за ручним перемикачем, за замовчуванням ні).
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
