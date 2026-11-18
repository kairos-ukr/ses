// =====================================================================
//  K-CORE · Автопарк: дані для водія, ТО й аналітики
//
//  Одометр — car_mileage.odometer (водій вносить за день), витрати —
//  vehicle_expenses (пальне з чеком, ТО, ремонт, інше; суми запчастин і
//  роботи база рахує сама з позицій). db/2026-11_fleet.sql.
//  Чеки — на Диск через той самий воркер, що й фото звітів, у папку
//  «Автопарк_<авто>»; у Telegram вони не йдуть.
// =====================================================================

import { supabase } from '../../supabaseClient';
import { compressImage } from '../../montazh/report';

const UPLOADER_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev';

export const EXPENSE_KINDS = {
    fuel: { label: 'Пальне', tone: 'info' },
    service: { label: 'ТО', tone: 'accent' },
    repair: { label: 'Ремонт', tone: 'warn' },
    other: { label: 'Інше', tone: 'neutral' },
};

export const PAID_BY = [
    { value: 'company_card', label: 'Картка компанії' },
    { value: 'company_cash', label: 'Готівка компанії' },
    { value: 'own', label: 'Свої гроші' },
];
export const PAID_BY_LABEL = Object.fromEntries(PAID_BY.map(p => [p.value, p.label]));

export const vehicleTitle = (v) => [v?.name, v?.plate].filter(Boolean).join(' · ') || 'Авто';

export const uah = (n) => `${Math.round(Number(n) || 0).toLocaleString('uk-UA')} ₴`;
export const kmText = (n) => `${Math.round(Number(n) || 0).toLocaleString('uk-UA')} км`;
export const numOf = (v) => { const n = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const monthBounds = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return { from: `${ym}-01`, to: isoDay(new Date(y, m, 0, 12)) };
};
export const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return isoDay(new Date(y, m - 1 + n, 1, 12)).slice(0, 7); };
export const monthTitle = (ym) => { const t = new Date(`${ym}-01T12:00:00`).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Останній відомий одометр авто (з журналу пробігу й з витрат) на дату або раніше */
export async function lastOdometer(vehicleId, onOrBefore = null) {
    let a = supabase.from('car_mileage').select('odometer, log_date').eq('vehicle_id', vehicleId).not('odometer', 'is', null)
        .order('log_date', { ascending: false }).order('odometer', { ascending: false }).limit(1);
    let b = supabase.from('vehicle_expenses').select('odometer, expense_date').eq('vehicle_id', vehicleId).not('odometer', 'is', null)
        .order('expense_date', { ascending: false }).order('odometer', { ascending: false }).limit(1);
    if (onOrBefore) { a = a.lte('log_date', onOrBefore); b = b.lte('expense_date', onOrBefore); }
    const [r1, r2] = await Promise.all([a, b]);
    const c = [
        r1.data?.[0] && { value: Number(r1.data[0].odometer), date: r1.data[0].log_date },
        r2.data?.[0] && { value: Number(r2.data[0].odometer), date: r2.data[0].expense_date },
    ].filter(Boolean);
    return c.sort((x, y) => y.value - x.value)[0] || null;
}

/** Чеки й фото → у папку авто на Диску. Повертає [{ url, fid }] */
export async function uploadReceipts({ files, vehicle, by, docType = 'Чек пального' }) {
    const fd = new FormData();
    for (const f of files) {
        const small = await compressImage(f);
        fd.append('files', small, small.name || 'receipt.jpg');
    }
    // Не номер об'єкта — окрема папка авто; у гілки об'єктів у Telegram не потрапляє
    fd.append('object_number', `Автопарк_${vehicleTitle(vehicle).replace(/[\\/:*?"<>|]+/g, ' ').trim()}`);
    fd.append('doc_type', docType);
    if (by) fd.append('uploaded_by', by);
    const res = await fetch(`${UPLOADER_URL}/workflow/upload`, { method: 'POST', body: fd });
    let data = null;
    try { data = await res.json(); } catch { /* не JSON */ }
    if (!res.ok || !data || data.status !== 'success') {
        throw new Error((data && (data.message || data.detail)) || `Чек не завантажився (${res.status})`);
    }
    return (Array.isArray(data.files) ? data.files : [])
        .filter(x => x?.webViewLink)
        .map(x => ({ url: x.webViewLink, fid: x.fileId || null }));
}

/**
 * Аналітика по кожному авто за період: км (з одометра), пальне (₴ і л),
 * л/100 км, ТО й ремонти (запчастини / робота), усього, ₴ за км, днів у
 * роботі й хто водив. Км — різниця між найбільшим показником у періоді й
 * останнім до нього (або найменшим у періоді, якщо раніше не вносили).
 */
export async function loadFleetMonth(from, to) {
    const [veh, mil, before, exp, trips, emps] = await Promise.all([
        supabase.from('vehicles').select('*').order('status').order('name'),
        supabase.from('car_mileage').select('vehicle_id, log_date, odometer, employee:employees(name)')
            .not('vehicle_id', 'is', null).not('odometer', 'is', null).gte('log_date', from).lte('log_date', to),
        supabase.from('car_mileage').select('vehicle_id, log_date, odometer')
            .not('vehicle_id', 'is', null).not('odometer', 'is', null).lt('log_date', from).order('log_date', { ascending: false }).limit(300),
        supabase.from('vehicle_expenses').select('*, employee:employees(name)').gte('expense_date', from).lte('expense_date', to)
            .order('expense_date', { ascending: false }).order('id', { ascending: false }),
        supabase.from('trips').select('vehicle_id, trip_date, driver_custom_id')
            .not('vehicle_id', 'is', null).neq('status', 'cancelled').gte('trip_date', from).lte('trip_date', to),
        supabase.from('employees').select('custom_id, name'),
    ]);
    const nameByCid = new Map((emps.data || []).map(e => [Number(e.custom_id), e.name]));
    // Останнє ТО по кожному авто — за весь час
    const svc = await supabase.from('vehicle_expenses').select('vehicle_id, expense_date, odometer, title')
        .in('kind', ['service', 'repair']).order('expense_date', { ascending: false }).limit(200);

    const vehicles = veh.data || [];
    const tripRows = trips.error ? [] : (trips.data || []);
    const out = vehicles.map(v => {
        const reads = [
            ...(mil.data || []).filter(r => r.vehicle_id === v.id).map(r => ({ date: r.log_date, value: Number(r.odometer) })),
            ...(exp.data || []).filter(r => r.vehicle_id === v.id && r.odometer != null).map(r => ({ date: r.expense_date, value: Number(r.odometer) })),
        ];
        const prev = (before.data || []).find(r => r.vehicle_id === v.id);
        const maxIn = reads.length ? Math.max(...reads.map(r => r.value)) : null;
        const base = prev ? Number(prev.odometer) : (reads.length > 1 ? Math.min(...reads.map(r => r.value)) : null);
        const km = maxIn != null && base != null && maxIn >= base ? maxIn - base : null;
        const rows = (exp.data || []).filter(r => r.vehicle_id === v.id);
        const fuel = rows.filter(r => r.kind === 'fuel');
        const fuelSum = fuel.reduce((s, r) => s + Number(r.amount || 0), 0);
        const liters = fuel.reduce((s, r) => s + Number(r.liters || 0), 0);
        const parts = rows.reduce((s, r) => s + Number(r.parts_cost || 0), 0);
        const labor = rows.reduce((s, r) => s + Number(r.labor_cost || 0), 0);
        const other = rows.filter(r => r.kind !== 'fuel' && !(Number(r.parts_cost) || Number(r.labor_cost))).reduce((s, r) => s + Number(r.amount || 0), 0);
        const total = fuelSum + parts + labor + other;
        const vt = tripRows.filter(t => t.vehicle_id === v.id);
        const lastSvc = (svc.data || []).find(r => r.vehicle_id === v.id) || null;
        return {
            v, km, odometer: maxIn ?? (prev ? Number(prev.odometer) : null), rows,
            fuelSum, liters, per100: km && liters ? (liters / km) * 100 : null,
            parts, labor, other, total, perKm: km ? total / km : null,
            days: new Set(vt.map(t => t.trip_date)).size,
            drivers: [...new Set([...vt.map(t => nameByCid.get(Number(t.driver_custom_id))), ...(mil.data || []).filter(r => r.vehicle_id === v.id).map(r => r.employee?.name)].filter(Boolean))],
            lastSvc,
            reads: (mil.data || []).filter(r => r.vehicle_id === v.id).sort((a, b) => b.log_date.localeCompare(a.log_date)),
        };
    });
    return out;
}
