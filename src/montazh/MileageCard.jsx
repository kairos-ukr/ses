// =====================================================================
//  K-CORE · Монтаж · «Я» → Пробіг
//
//  Працівник, який їздить своїм авто, вносить за день лише одне: скільки
//  кілометрів проїхав по роботі. Без спідометра. Офіс бачить пробіг у
//  «Працівники → Автопарк». Авто компанії — окремо: одометр і пальне з
//  чеком (VehicleDayCard, «Службове авто»).
//  Км накопичуються; коли людина сама вирішить — «Подати на оплату»
//  (заявка з усіма ще не поданими км; подані дні змінити вже не можна).
//  Офіс оплачує або відхиляє в «Працівники → Виплати».
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaRoad } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useToast, humanError } from '../ui';
import { isoDay, shiftDay, relDay } from './data';
import { Card, Label, Big, Empty, Pill } from './kit';

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

    // Лише своє авто (якщо відмічене). Авто компанії — одометр і пальне в «Службове авто» (VehicleDayCard)
    const loadCars = useCallback(async () => {
        if (!who?.id) return;
        const own = await supabase.from('employee_cars').select('status').eq('employee_id', who.id).maybeSingle();
        const list = [];
        if (own.data?.status === 'own' || own.data?.status === 'repair') list.push({ key: 'own', vehicleId: null, label: 'Своє авто' });
        setCars(list);
        setCarKey(k => k || list[0]?.key || '');
    }, [who?.id]);

    const [requests, setRequests] = useState([]);    // мої заявки на оплату
    const [pending, setPending] = useState({ km: 0, days: 0, from: null });  // ще не подано
    const [rate, setRate] = useState(null);
    const [asking, setAsking] = useState(false);

    const loadRecent = useCallback(async () => {
        if (!who?.id) return;
        const [r, q, p, s] = await Promise.all([
            supabase.from('car_mileage')
                .select('id, vehicle_id, log_date, work_km, request_id, vehicle:vehicles(name)')
                .eq('employee_id', who.id).is('vehicle_id', null).order('log_date', { ascending: false }).order('id', { ascending: false }).limit(40),
            supabase.from('payout_requests').select('*').eq('employee_id', who.id).order('submitted_at', { ascending: false }).limit(5),
            supabase.from('car_mileage').select('work_km, log_date').eq('employee_id', who.id).is('vehicle_id', null).is('request_id', null).gt('work_km', 0).lte('log_date', today),
            supabase.from('app_settings').select('value').eq('key', 'km_rate').maybeSingle(),
        ]);
        setRecent(r.data || []);
        setRequests(q.error ? [] : q.data || []);
        const rows = p.error ? [] : p.data || [];
        setPending({ km: rows.reduce((t, x) => t + Number(x.work_km || 0), 0), days: rows.length, from: rows.map(x => x.log_date).sort()[0] || null });
        setRate(Number(who.km_rate) > 0 ? Number(who.km_rate) : Number(s.data?.value?.rate) > 0 ? Number(s.data.value.rate) : null);
    }, [who?.id, who?.km_rate, today]);

    // Подати на оплату все, що накопичилось (вирішує сама людина)
    const submitRequest = async () => {
        setSaving(true);
        const { error } = await supabase.rpc('submit_km_request', { p_employee_id: who.id, p_note: null });
        setSaving(false);
        setAsking(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Подано на оплату — офіс бачить заявку', 'success');
        loadRecent();
    };

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
        if (existing?.request_id) { toast('Цей день уже подано на оплату — змінити не можна', 'warning'); return; }
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
            {existing?.request_id
                ? <div className="mt-2 text-[13.5px] font-semibold text-slate-600">Цей день уже подано на оплату</div>
                : canWrite && <Big small tone="dark" className="mt-2.5" onClick={save} disabled={saving}>{saving ? 'Зберігаю…' : existing ? 'Оновити пробіг' : 'Зберегти пробіг'}</Big>}

            {/* Накопичене — подає на оплату сама людина, коли вирішить */}
            {pending.km > 0 && (
                <div className="mt-3 rounded-xl border-2 border-slate-200 bg-slate-50 p-3">
                    <div className="text-[14.5px] text-slate-800">
                        Не подано: <b className="tabular-nums">{kmText(pending.km)}</b>
                        <span className="text-slate-500"> · {pending.days} {pending.days === 1 ? 'день' : 'дн.'}{rate ? ` · ≈ ${Math.round(pending.km * rate).toLocaleString('uk-UA')} ₴` : ''}</span>
                    </div>
                    {canWrite && (asking ? (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            <Big small tone="main" onClick={submitRequest} disabled={saving}>{saving ? 'Подаю…' : 'Так, подати'}</Big>
                            <Big small tone="soft" onClick={() => setAsking(false)}>Ні</Big>
                        </div>
                    ) : (
                        <Big small tone="dark" className="mt-2" onClick={() => setAsking(true)}>Подати на оплату</Big>
                    ))}
                </div>
            )}

            {requests.length > 0 && (
                <ul className="mt-2.5">
                    {requests.map((q, i) => (
                        <li key={q.id} className={`flex items-center gap-2 py-2 text-[14px] ${i ? 'border-t border-slate-100' : ''}`}>
                            <span className="flex-1 min-w-0 break-words text-slate-700">
                                Заявка {relDay(String(q.submitted_at).slice(0, 10)).toLowerCase()} · {kmText(q.km)}
                                {q.status === 'rejected' && q.decision_note ? <span className="block text-[12.5px] text-slate-500">{q.decision_note}</span> : null}
                            </span>
                            <b className="tabular-nums text-slate-900">{Math.round(Number(q.amount)).toLocaleString('uk-UA')} ₴</b>
                            <Pill tone={q.status === 'paid' ? 'ok' : q.status === 'rejected' ? 'bad' : 'warn'}>{q.status === 'paid' ? 'оплачено' : q.status === 'rejected' ? 'відхилено' : 'подано'}</Pill>
                        </li>
                    ))}
                </ul>
            )}

            {recent.length > 0 ? (
                <ul className="mt-2.5">
                    {recent.slice(0, 5).map((r, i) => (
                        <li key={r.id} className={`flex items-center gap-2 py-2 text-[14px] ${i ? 'border-t border-slate-100' : ''}`}>
                            <span className="flex-1 min-w-0 break-words text-slate-700">{relDay(r.log_date)} · {r.vehicle?.name || 'своє авто'}</span>
                            {r.work_km != null && <b className="tabular-nums text-slate-900">{kmText(r.work_km)}</b>}
                            {r.request_id && <Pill>подано</Pill>}
                        </li>
                    ))}
                </ul>
            ) : <Empty>Пробіг ще не вносили</Empty>}
        </Card>
    );
}
