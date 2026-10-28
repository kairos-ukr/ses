// =====================================================================
//  K-CORE · Монтаж · картка «Транспорт» на «Сьогодні»
//
//  Поїздки дня, де я водій або в екіпажі (офіс складає їх у
//  «Працівники → Транспорт»): яке авто, хто за кермом, зупинки по черзі
//  й маршрут одним посиланням. Водій відмічає зупинку на місці — офіс
//  бачить це одразу, а пов'язане доручення закривається само.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaRoute, FaShuttleVan, FaCar } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useToast, humanError } from '../ui';
import { useFresh, isoDay, loadObjects, objectTitle, placeOf } from './data';
import { Card, Label, Pill, Big, Check } from './kit';

const PURPOSE = { delivery: 'доставка', pickup: 'забрати', install: 'монтаж', service: 'сервіс', other: 'інше' };

/** Точка маршруту: координати об'єкта, інакше населений пункт або місце */
const pointOf = (stop, o) => {
    if (o?.latitude && o?.longitude) return `${o.latitude},${o.longitude}`;
    const m = String(o?.gps_link || '').match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
    if (m) return `${m[1]},${m[2]}`;
    return (o ? placeOf(o) : stop.place) || null;
};
const routeOf = (points) => {
    const pts = points.filter(Boolean);
    if (!pts.length) return null;
    const way = pts.slice(0, -1);
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(pts[pts.length - 1])}${way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : ''}`;
};

export default function TripCard({ who, people, canWrite }) {
    const toast = useToast();
    const navigate = useNavigate();
    const today = isoDay();
    const [trips, setTrips] = useState([]);
    const [objects, setObjects] = useState(new Map());
    const fresh = useFresh();

    const load = useCallback(async () => {
        if (who?.custom_id == null) return;
        const ok = fresh();
        const id = Number(who.custom_id);
        const { data, error } = await supabase.from('trips')
            .select('*, vehicle:vehicles(name, plate), stops:trip_stops(*)')
            .eq('trip_date', today).neq('status', 'cancelled')
            .or(`driver_custom_id.eq.${id},crew.cs.{${id}}`)
            .order('id');
        if (error || !ok()) return;
        const objs = await loadObjects((data || []).flatMap(t => (t.stops || []).map(s => s.installation_custom_id)));
        if (!ok()) return;
        setTrips(data || []);
        setObjects(objs);
    }, [who?.custom_id, today, fresh]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        let t;
        const bump = () => { clearTimeout(t); t = setTimeout(load, 500); };
        const ch = supabase.channel(`m-trips-${who?.custom_id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, bump)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_stops' }, bump)
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load, who?.custom_id]);

    const toggle = async (trip, stop) => {
        const done = !stop.done_at;
        setTrips(list => list.map(t => (t.id !== trip.id ? t : {
            ...t, stops: t.stops.map(s => (s.id === stop.id ? { ...s, done_at: done ? new Date().toISOString() : null } : s)),
        })));
        const { error } = await supabase.from('trip_stops').update({ done_at: done ? new Date().toISOString() : null }).eq('id', stop.id);
        if (error) { toast(humanError(error), 'error'); load(); return; }
        if (done && stop.microtask_id) {
            await supabase.from('microtasks').update({ status: 'виконано', data_complete: new Date().toISOString() })
                .eq('custom_id', stop.microtask_id).in('status', ['нове', 'в процесі']);
        }
    };

    if (!trips.length) return null;
    const nameOf = (cid) => people.get(Number(cid))?.name || `#${cid}`;

    return trips.map(trip => {
        const stops = (trip.stops || []).slice().sort((a, b) => a.position - b.position || a.id - b.id);
        const isDriver = Number(trip.driver_custom_id) === Number(who.custom_id);
        const transport = trip.vehicle
            ? [trip.vehicle.name, trip.vehicle.plate].filter(Boolean).join(' · ')
            : trip.own_car_custom_id ? `Авто: ${nameOf(trip.own_car_custom_id)}` : 'Транспорт ще не обрано';
        const others = [trip.driver_custom_id, ...(trip.crew || [])]
            .filter((c, i, a) => c != null && Number(c) !== Number(who.custom_id) && a.findIndex(x => Number(x) === Number(c)) === i);
        const route = routeOf(stops.filter(s => !s.done_at).map(s => pointOf(s, objects.get(s.installation_custom_id))));
        const left = stops.filter(s => !s.done_at).length;

        return (
            <Card key={trip.id}>
                <Label icon={trip.vehicle || !trip.own_car_custom_id ? FaShuttleVan : FaCar}
                    right={isDriver ? <Pill tone="dark">я за кермом</Pill> : <Pill>я в екіпажі</Pill>}>
                    Транспорт
                </Label>
                <div className="text-[17px] font-bold leading-snug break-words">{trip.title || transport}</div>
                <div className="text-[14px] text-slate-600 mt-0.5 break-words">
                    {trip.title && <>{transport} · </>}
                    {isDriver ? 'ви водій' : `водій ${trip.driver_custom_id ? nameOf(trip.driver_custom_id) : 'не призначений'}`}
                    {others.length > 0 && <> · з вами: {others.map(nameOf).join(', ')}</>}
                </div>
                {trip.notes && <p className="text-[14.5px] text-slate-800 mt-1.5 break-words">{trip.notes}</p>}

                {stops.length > 0 && (
                    <ol className="mt-2.5">
                        {stops.map((s, i) => {
                            const o = s.installation_custom_id ? objects.get(s.installation_custom_id) : null;
                            return (
                                <li key={s.id} className={`flex items-start gap-3 py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                                    {isDriver && canWrite ? (
                                        <Check on={!!s.done_at} label={s.done_at ? 'Повернути зупинку' : 'Зупинку виконано'} onClick={() => toggle(trip, s)} />
                                    ) : (
                                        <span className={`w-6 h-6 mt-0.5 rounded-lg flex items-center justify-center text-[12px] font-bold flex-shrink-0 ${s.done_at ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                                            {s.done_at ? '✓' : i + 1}
                                        </span>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        <div className={`text-[15px] font-semibold break-words ${s.done_at ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                            {o ? objectTitle(o) : s.place}
                                        </div>
                                        <div className="text-[13px] text-slate-500 break-words">
                                            {[PURPOSE[s.purpose] || s.purpose, s.note].filter(Boolean).join(' · ')}
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                )}
                {route && left > 0 && <Big small icon={FaRoute} href={route} className="mt-2">Маршрут · {left} зуп.</Big>}
                {isDriver && canWrite && <Big small tone="soft" className="mt-2" onClick={() => navigate('/m/me')}>Внести пробіг</Big>}
            </Card>
        );
    });
}
