// =====================================================================
//  K-CORE · Монтаж · «Авто за день» — для водія авто компанії
//
//  Водій (постійний або той, хто сьогодні везе бригаду) вносить:
//   • показник одометра — щодня, наприкінці дня;
//   • якщо заправлявся — суму, літри (бажано), хто платив і фото чека
//     (обов'язково). Заправок за день може бути кілька.
//  Одометр не може бути меншим за останній відомий показник. Внесене
//  офіс бачить у «Працівники → Автопарк» (лише ті, кому дали право
//  «Витрати на авто»). db/2026-11_fleet.sql.
//
//  Де: на «Сьогодні» в картці «Транспорт» (водій, сам день) і в «Я».
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { FaShuttleVan, FaCamera, FaTimes, FaGasPump, FaTrash } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useToast, humanError } from '../ui';
import { isoDay, shiftDay, relDay } from './data';
import { Card, Label, Big, Pill, Segment } from './kit';
import { driveThumb, isNetworkError } from './report';
import { PAID_BY, PAID_BY_LABEL, lastOdometer, uploadReceipts, vehicleTitle, uah, kmText, numOf } from '../pages/fleet/fleetData';

const field = 'w-full h-12 px-3 rounded-xl border-2 border-slate-300 bg-white text-[17px] font-bold tabular-nums focus:border-slate-900 outline-none disabled:bg-slate-50';

/**
 * vehicleId — лише це авто (картка «Транспорт»); без нього — усі авто,
 * які людина водить (постійний водій або возила бригаду за 2 тижні).
 * embedded — без власної картки (усередині іншої).
 */
export default function VehicleDayCard({ who, canWrite, vehicleId = null, embedded = false }) {
    const toast = useToast();
    const today = isoDay();
    const [vehicles, setVehicles] = useState(null);
    const [vid, setVid] = useState(vehicleId);
    const [day, setDay] = useState(today);
    const [last, setLast] = useState(null);          // останній показник до цього дня: { value, date }
    const [mine, setMine] = useState(null);          // мій запис одометра за цей день
    const [fuelRows, setFuelRows] = useState([]);    // мої заправки (останні)
    const [odo, setOdo] = useState('');
    const [fuelOn, setFuelOn] = useState(false);
    const [amount, setAmount] = useState('');
    const [liters, setLiters] = useState('');
    const [paidBy, setPaidBy] = useState('company_card');
    const [photos, setPhotos] = useState([]);        // [{ id, file, url }]
    const [busy, setBusy] = useState('');

    // Які авто людина водить
    useEffect(() => {
        if (!who?.custom_id) return;
        let alive = true;
        (async () => {
            const [fleet, trips] = await Promise.all([
                vehicleId
                    ? supabase.from('vehicles').select('id, name, plate, status').eq('id', vehicleId)
                    : supabase.from('vehicles').select('id, name, plate, status').neq('status', 'inactive').eq('default_driver_custom_id', who.custom_id),
                vehicleId ? Promise.resolve({ data: [] })
                    : supabase.from('trips').select('trip_date, vehicle:vehicles(id, name, plate, status)').eq('driver_custom_id', who.custom_id)
                        .gte('trip_date', shiftDay(today, -14)).lte('trip_date', today).not('vehicle_id', 'is', null).order('trip_date', { ascending: false }),
            ]);
            if (!alive) return;
            const seen = new Set();
            const list = [];
            // Сьогоднішня поїздка — першою
            [...(trips.data || []).map(t => t.vehicle), ...(fleet.data || [])].filter(Boolean).forEach(v => {
                if (seen.has(v.id)) return;
                seen.add(v.id);
                list.push(v);
            });
            setVehicles(list);
            setVid(x => x || list[0]?.id || null);
        })();
        return () => { alive = false; };
    }, [who?.custom_id, vehicleId, today]);

    const vehicle = vehicles?.find(v => v.id === vid) || null;

    const load = useCallback(async () => {
        if (!vid || !who?.id) return;
        const [prev, my, fuel] = await Promise.all([
            lastOdometer(vid, shiftDay(day, -1)),
            supabase.from('car_mileage').select('id, odometer').eq('employee_id', who.id).eq('vehicle_id', vid).eq('log_date', day)
                .order('id', { ascending: false }).limit(1),
            supabase.from('vehicle_expenses').select('*')
                .eq('vehicle_id', vid).eq('employee_id', who.id).eq('kind', 'fuel')
                .order('expense_date', { ascending: false }).order('id', { ascending: false }).limit(5),
        ]);
        setLast(prev);
        const m = my.data?.[0] || null;
        setMine(m);
        setOdo(m?.odometer != null ? String(m.odometer) : '');
        setFuelRows(fuel.data || []);
    }, [vid, day, who?.id]);

    useEffect(() => { load(); }, [load]);

    const odoN = Math.round(numOf(odo));
    const delta = last && odoN ? odoN - last.value : null;
    const tooLow = last && odoN > 0 && odoN < last.value;

    const addPhotos = (files) => {
        const list = [...(files || [])].filter(f => f.type?.startsWith('image/'));
        setPhotos(p => [...p, ...list.map(f => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, file: f, url: URL.createObjectURL(f) }))]);
    };
    const removePhoto = (id) => setPhotos(p => {
        const gone = p.find(x => x.id === id);
        if (gone) URL.revokeObjectURL(gone.url);
        return p.filter(x => x.id !== id);
    });

    const resetFuel = () => {
        photos.forEach(p => URL.revokeObjectURL(p.url));
        setPhotos([]); setAmount(''); setLiters(''); setFuelOn(false);
    };

    const save = async () => {
        if (!vehicle) return;
        if (!(odoN > 0)) { toast('Вкажіть показник одометра', 'warning'); return; }
        if (tooLow) { toast(`Менше, ніж останній показник (${kmText(last.value)}) — перевірте цифри`, 'error'); return; }
        if (fuelOn) {
            if (!(numOf(amount) > 0)) { toast('Вкажіть суму заправки', 'warning'); return; }
            if (!photos.length) { toast('Додайте фото чека', 'warning'); return; }
        }
        if (navigator.onLine === false) { toast("Немає інтернету — збережіть, коли з'явиться зв'язок", 'warning'); return; }
        try {
            let receipts = [];
            if (fuelOn) {
                setBusy('Завантажую чек…');
                receipts = await uploadReceipts({ files: photos.map(p => p.file), vehicle, by: who.name });
            }
            setBusy('Зберігаю…');
            const row = { employee_id: who.id, vehicle_id: vehicle.id, log_date: day, odometer: odoN, updated_at: new Date().toISOString() };
            const { error } = mine
                ? await supabase.from('car_mileage').update(row).eq('id', mine.id)
                : await supabase.from('car_mileage').insert(row);
            if (error) throw error;
            if (fuelOn) {
                const { error: e2 } = await supabase.from('vehicle_expenses').insert({
                    vehicle_id: vehicle.id, kind: 'fuel', expense_date: day, odometer: odoN,
                    amount: numOf(amount), liters: numOf(liters) > 0 ? numOf(liters) : null, paid_by: paidBy,
                    receipt_urls: receipts.map(r => r.url), receipt_fids: receipts.map(r => r.fid || ''),
                    employee_id: who.id, created_by: who.id,
                });
                if (e2) throw e2;
                resetFuel();
            }
            toast(fuelOn ? 'Одометр і заправку збережено' : 'Одометр збережено', 'success');
            load();
        } catch (e) {
            toast(isNetworkError(e) ? "Немає зв'язку — спробуйте ще раз трохи пізніше" : humanError(e), 'error');
        } finally {
            setBusy('');
        }
    };

    // Помилкову заправку можна прибрати — свою, за сьогодні чи вчора
    const removeFuel = async (r) => {
        const { error } = await supabase.from('vehicle_expenses').delete().eq('id', r.id).eq('employee_id', who.id);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Заправку прибрано');
        load();
    };

    if (vehicles === null || !vehicles.length) return null;

    const body = (<>
        {!vehicleId && vehicles.length > 1 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
                {vehicles.map(v => (
                    <button key={v.id} type="button" onClick={() => setVid(v.id)}
                        className={`h-10 px-3 rounded-xl border-2 text-[14px] font-bold ${vid === v.id ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-800'}`}>
                        {vehicleTitle(v)}
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
            <span className="text-[13.5px] font-semibold text-slate-700">Одометр, км</span>
            <input type="number" inputMode="numeric" min="0" value={odo} disabled={!canWrite} onChange={e => setOdo(e.target.value.replace(/[^\d]/g, ''))}
                placeholder={last ? String(last.value) : 'Напр. 154230'} className={`mt-1 ${field} ${tooLow ? '!border-rose-400' : ''}`} />
        </label>
        <div className="text-[13px] mt-1 min-h-[18px]">
            {tooLow ? <span className="font-semibold text-rose-600">Менше, ніж останній: {kmText(last.value)}</span>
                : delta > 0 ? <span className="text-slate-600">за день <b className="text-slate-900">+{kmText(delta)}</b>{delta > 2000 ? <span className="text-amber-700 font-semibold"> · багато — перевірте</span> : null}</span>
                    : last ? <span className="text-slate-500">останній: {kmText(last.value)}, {relDay(last.date).toLowerCase()}</span> : null}
        </div>

        <div className="mt-2">
            <Segment value={fuelOn ? 'yes' : 'no'} onChange={(v) => setFuelOn(v === 'yes')}
                items={[{ value: 'no', label: 'Не заправлявся' }, { value: 'yes', label: 'Заправлявся' }]} />
        </div>
        {fuelOn && (
            <div className="mt-2.5 flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2">
                    <label className="block min-w-0">
                        <span className="text-[13.5px] font-semibold text-slate-700">Сума, ₴</span>
                        <input inputMode="decimal" value={amount} disabled={!canWrite} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                            placeholder="2500" className={`mt-1 ${field}`} />
                    </label>
                    <label className="block min-w-0">
                        <span className="text-[13.5px] font-semibold text-slate-700">Літри <span className="font-normal text-slate-500">(бажано)</span></span>
                        <input inputMode="decimal" value={liters} disabled={!canWrite} onChange={e => setLiters(e.target.value.replace(/[^\d.,]/g, ''))}
                            placeholder="45" className={`mt-1 ${field}`} />
                    </label>
                </div>
                <div>
                    <div className="text-[13.5px] font-semibold text-slate-700 mb-1">Хто платив</div>
                    <div className="flex flex-wrap gap-1.5">
                        {PAID_BY.map(p => (
                            <button key={p.value} type="button" onClick={() => setPaidBy(p.value)} aria-pressed={paidBy === p.value}
                                className={`h-11 px-3 rounded-xl border-2 text-[14px] font-bold ${paidBy === p.value ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-300 text-slate-700'}`}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div className="text-[13.5px] font-semibold text-slate-700 mb-1">Фото чека</div>
                    <div className="grid grid-cols-3 gap-1.5">
                        {photos.map(p => (
                            <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                                <img src={p.url} alt="" className="w-full h-full object-cover" />
                                <button type="button" onClick={() => removePhoto(p.id)} aria-label="Прибрати фото"
                                    className="absolute top-1 right-1 w-9 h-9 rounded-lg bg-slate-900/80 text-white flex items-center justify-center"><FaTimes size={12} /></button>
                            </div>
                        ))}
                        {canWrite && (
                            <label className="aspect-square rounded-xl border-2 border-dashed border-slate-400 bg-white flex flex-col items-center justify-center gap-1 text-slate-600 cursor-pointer">
                                <FaCamera size={20} />
                                <span className="text-[12.5px] font-bold">Чек</span>
                                <input type="file" accept="image/*" multiple className="hidden" onChange={e => { addPhotos(e.target.files); e.target.value = ''; }} />
                            </label>
                        )}
                    </div>
                </div>
            </div>
        )}

        {canWrite && (
            <Big small tone="dark" className="mt-3" onClick={save} disabled={!!busy}>
                {busy || (fuelOn ? 'Зберегти одометр і заправку' : mine ? 'Оновити одометр' : 'Зберегти одометр')}
            </Big>
        )}

        {fuelRows.length > 0 && (
            <ul className="mt-2.5">
                {fuelRows.map((r, i) => (
                    <li key={r.id} className={`flex items-center gap-2.5 py-2 ${i ? 'border-t border-slate-100' : ''}`}>
                        {r.receipt_fids?.[0]
                            ? <img src={driveThumb(r.receipt_fids[0], 120)} alt="" referrerPolicy="no-referrer" className="w-10 h-10 rounded-lg object-cover bg-slate-100 flex-shrink-0" />
                            : <span className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0"><FaGasPump size={14} className="text-slate-500" /></span>}
                        <div className="min-w-0 flex-1 text-[14px]">
                            <b className="text-slate-900 tabular-nums">{uah(r.amount)}</b>
                            {r.liters ? <span className="text-slate-600"> · {String(Number(r.liters)).replace('.', ',')} л</span> : null}
                            <div className="text-[12.5px] text-slate-500">{relDay(r.expense_date)} · {PAID_BY_LABEL[r.paid_by] || '—'}</div>
                        </div>
                        {r.paid_by === 'own' && (r.reimbursed_at ? <Pill tone="ok">повернуто</Pill> : <Pill tone="warn">повернути</Pill>)}
                        {canWrite && r.expense_date >= shiftDay(today, -1) && !r.reimbursed_at && (
                            <button type="button" onClick={() => removeFuel(r)} aria-label="Прибрати заправку"
                                className="w-10 h-10 rounded-xl border-2 border-slate-300 flex items-center justify-center text-slate-500 flex-shrink-0"><FaTrash size={12} /></button>
                        )}
                    </li>
                ))}
            </ul>
        )}
    </>);

    if (embedded) return <div className="mt-3 pt-3 border-t border-slate-200">{body}</div>;
    return (
        <Card>
            <Label icon={FaShuttleVan} right={vehicle && (vehicleId || vehicles.length === 1) ? vehicleTitle(vehicle) : null}>Службове авто</Label>
            {body}
        </Card>
    );
}
