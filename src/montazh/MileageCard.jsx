// =====================================================================
//  K-CORE · Монтаж · «Я» → Пробіг
//
//  Працівник, який їздить своїм авто або авто компанії, вносить за день
//  лише одне: скільки кілометрів проїхав по роботі. Без спідометра.
//  Офіс бачить пробіг у «Працівники → Автопарк».
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaRoad } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useToast, humanError } from '../ui';
import { isoDay, shiftDay, relDay } from './data';
import { Card, Label, Big, Empty } from './kit';

const kmText = (v) => `${Number(v).toLocaleString('uk-UA', { maximumFractionDigits: 1 })} км`;

export default function MileageCard({ who, canWrite }) {
    const toast = useToast();
    const today = isoDay();
    const [cars, setCars] = useState(null);           // [{ key, vehicleId, label }]
    const [carKey, setCarKey] = useState('');
    const [day, setDay] = useState(today);
    const [km, setKm] = useState('');
    const [recent, setRecent] = useState([]);
    const [saving, setSaving] = useState(false);

    // Чим людина їздить: своє авто (якщо відмічене) і авто компанії, де вона водій
    const loadCars = useCallback(async () => {
        if (!who?.id) return;
        const [own, fleet, trips] = await Promise.all([
            supabase.from('employee_cars').select('status').eq('employee_id', who.id).maybeSingle(),
            supabase.from('vehicles').select('id, name, plate').neq('status', 'inactive').eq('default_driver_custom_id', who.custom_id),
            supabase.from('trips').select('vehicle:vehicles(id, name, plate)').eq('driver_custom_id', who.custom_id)
                .gte('trip_date', shiftDay(today, -14)).not('vehicle_id', 'is', null),
        ]);
        const list = [];
        if (own.data?.status === 'own' || own.data?.status === 'repair') list.push({ key: 'own', vehicleId: null, label: 'Своє авто' });
        const seen = new Set();
        [...(fleet.data || []), ...(trips.data || []).map(t => t.vehicle).filter(Boolean)].forEach(v => {
            if (seen.has(v.id)) return;
            seen.add(v.id);
            list.push({ key: `v${v.id}`, vehicleId: v.id, label: [v.name, v.plate].filter(Boolean).join(' · ') });
        });
        setCars(list);
        setCarKey(k => k || list[0]?.key || '');
    }, [who?.id, who?.custom_id, today]);

    const loadRecent = useCallback(async () => {
        if (!who?.id) return;
        const { data } = await supabase.from('car_mileage')
            .select('id, vehicle_id, log_date, work_km, vehicle:vehicles(name)')
            .eq('employee_id', who.id).order('log_date', { ascending: false }).order('id', { ascending: false }).limit(40);
        setRecent(data || []);
    }, [who?.id]);

    useEffect(() => { loadCars(); loadRecent(); }, [loadCars, loadRecent]);

    const car = cars?.find(c => c.key === carKey) || null;
    const existing = recent.find(r => (car?.vehicleId ? Number(r.vehicle_id) === Number(car.vehicleId) : r.vehicle_id == null) && r.log_date === day) || null;

    // Обрали інше авто чи день — підставляємо вже внесене
    useEffect(() => {
        setKm(existing?.work_km != null ? String(Number(existing.work_km)) : '');
    }, [existing?.id, carKey, day]); // eslint-disable-line react-hooks/exhaustive-deps

    const monthKm = useMemo(() => recent
        .filter(r => r.log_date.slice(0, 7) === today.slice(0, 7))
        .reduce((s, r) => s + (Number(r.work_km) || 0), 0), [recent, today]);

    const save = async () => {
        if (!car) return;
        if (!(Number(km) > 0)) { toast('Вкажіть, скільки кілометрів', 'error'); return; }
        setSaving(true);
        const row = { employee_id: who.id, vehicle_id: car.vehicleId, log_date: day, work_km: Number(km), updated_at: new Date().toISOString() };
        const { error } = existing
            ? await supabase.from('car_mileage').update(row).eq('id', existing.id)
            : await supabase.from('car_mileage').insert(row);
        setSaving(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Пробіг збережено — офіс бачить', 'success');
        loadRecent();
    };

    if (cars === null || cars.length === 0) return null;

    return (
        <Card>
            <Label icon={FaRoad} right={monthKm ? `цього місяця ${kmText(monthKm)}` : null}>Пробіг</Label>
            {cars.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {cars.map(c => (
                        <button key={c.key} type="button" onClick={() => setCarKey(c.key)}
                            className={`h-10 px-3 rounded-xl border-2 text-[14px] font-bold ${carKey === c.key ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
                            {c.label}
                        </button>
                    ))}
                </div>
            )}
            <div className="flex gap-1.5 mb-2">
                {[today, shiftDay(today, -1)].map(d => (
                    <button key={d} type="button" onClick={() => setDay(d)}
                        className={`h-10 px-3 rounded-xl border-2 text-[14px] font-bold ${day === d ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
                        {relDay(d)}
                    </button>
                ))}
            </div>
            <label className="block">
                <span className="text-[13px] font-semibold text-slate-600">Скільки км проїхали по роботі</span>
                <input type="number" inputMode="decimal" min="0" value={km} disabled={!canWrite} onChange={e => setKm(e.target.value)}
                    placeholder="Напр. 85"
                    className="mt-1 w-full h-12 px-3 rounded-xl border-2 border-slate-300 bg-white text-[17px] font-bold tabular-nums focus:border-slate-900 outline-none" />
            </label>
            {canWrite && <Big small tone="dark" className="mt-2.5" onClick={save} disabled={saving}>{saving ? 'Зберігаю…' : existing ? 'Оновити пробіг' : 'Зберегти пробіг'}</Big>}

            {recent.length > 0 ? (
                <ul className="mt-2.5">
                    {recent.slice(0, 5).map((r, i) => (
                        <li key={r.id} className={`flex items-center gap-2 py-2 text-[14px] ${i ? 'border-t border-slate-100' : ''}`}>
                            <span className="flex-1 min-w-0 break-words text-slate-700">{relDay(r.log_date)} · {r.vehicle?.name || 'своє авто'}</span>
                            {r.work_km != null && <b className="tabular-nums text-slate-900">{kmText(r.work_km)}</b>}
                        </li>
                    ))}
                </ul>
            ) : <Empty>Пробіг ще не вносили</Empty>}
        </Card>
    );
}
