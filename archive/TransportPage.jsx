// =====================================================================
//  K-CORE · «Працівники» → «Транспорт»
//
//  • Поїздки дня. Поїздка — один транспорт (авто компанії або власне авто
//    працівника), водій, екіпаж і впорядкований список зупинок. Так один
//    бус за день може завезти матеріали на кілька об'єктів, забрати щось
//    і довезти бригаду. Зупинка — об'єкт або довільне місце (склад,
//    постачальник), мета (доставка / забрати / монтаж / сервіс), примітка,
//    документ видачі зі складу й доручення із «Задач». Позначили зупинку
//    виконаною — пов'язане доручення закривається само.
//  • Нову поїздку можна зібрати з графіка дня: об'єкти, куди заплановані
//    люди, стають зупинками, а самі люди — екіпажем.
//  • Автопарк компанії й власні авто людей: на ходу / у ремонті / немає.
//    Монтажники відмічають своє авто в «Монтажі» (Я → Авто).
//
//  Усе редагується на місці, без вікон поверх. Зміни інших — наживо.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    FaArrowDown, FaArrowUp, FaCar, FaCheck, FaChevronLeft, FaChevronRight, FaEdit, FaHardHat, FaMapMarkedAlt,
    FaPlus, FaRoute, FaShuttleVan, FaTimes, FaTrash, FaUserTie, FaWarehouse, FaExclamationTriangle, FaTasks,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, IconBtn, Chip, Picker, Segmented, Skeleton, Tip, useToast, humanError } from '../ui';

/* ---------------------------------------------------------------------
 *  Довідники
 * ------------------------------------------------------------------- */

export const VEHICLE_KINDS = [
    { v: 'bus', l: 'Бус' }, { v: 'van', l: 'Фургон' }, { v: 'car', l: 'Легкове' },
    { v: 'truck', l: 'Вантажівка' }, { v: 'other', l: 'Інше' },
];
export const VEHICLE_STATUS = {
    active: { l: 'На ходу', tone: 'ok' },
    repair: { l: 'У ремонті', tone: 'warn' },
    inactive: { l: 'Не використовується', tone: 'neutral' },
};
export const CAR_STATUS = {
    own: { l: 'Своє авто', tone: 'ok' },
    repair: { l: 'Авто в ремонті', tone: 'warn' },
    none: { l: 'Без авто', tone: 'neutral' },
};
export const STOP_PURPOSES = [
    { v: 'delivery', l: 'Доставка' }, { v: 'pickup', l: 'Забрати' }, { v: 'install', l: 'Монтаж' },
    { v: 'service', l: 'Сервіс' }, { v: 'other', l: 'Інше' },
];
const TRIP_STATUS = {
    planned: { l: 'Заплановано', tone: 'accent' },
    done: { l: 'Виконано', tone: 'ok' },
    cancelled: { l: 'Скасовано', tone: 'neutral' },
};
const ABSENCE = { OFF: 'вихідний', VACATION: 'відпустка', SICK_LEAVE: 'лікарняний' };
const OPEN_TASK = ['нове', 'в процесі'];
const FLASH_MS = 2600;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const purposeLabel = (v) => STOP_PURPOSES.find(p => p.v === v)?.l || v;
const kindLabel = (v) => VEHICLE_KINDS.find(k => k.v === v)?.l || v;

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const shiftDay = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const mondayOf = (s) => { const d = parseDay(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoDay(d); };
const dayTitle = (s) => parseDay(s).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = (s) => (s ? parseDay(String(s).slice(0, 10)).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '');

const objLabel = (o) => (o ? [`СЕС-${o.custom_id}`, o.name || o.client?.name, o.client?.populated_place].filter(Boolean).join(' · ') : '');

/** Точка для маршруту: координати з GPS-посилання, інакше населений пункт */
const routePoint = (stop, obj) => {
    if (obj?.latitude && obj?.longitude) return `${obj.latitude},${obj.longitude}`;
    const m = String(obj?.gps_link || '').match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
    if (m) return `${m[1]},${m[2]}`;
    if (obj) return [obj.client?.populated_place, obj.client?.oblast].filter(Boolean).join(', ') || null;
    return stop.place || null;
};
const routeUrl = (points) => {
    const pts = points.filter(Boolean);
    if (!pts.length) return null;
    const dest = pts[pts.length - 1];
    const way = pts.slice(0, -1);
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(dest)}${way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : ''}`;
};

/* ---------------------------------------------------------------------
 *  Дрібні частини
 * ------------------------------------------------------------------- */

const ChipBtn = ({ on, children, onClick, tone = 'indigo' }) => (
    <button type="button" onClick={onClick}
        className={`h-8 px-2.5 rounded-lg border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors
            ${on ? (tone === 'indigo' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-900 border-slate-900 text-white') : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
        {children}
    </button>
);

/** Кілька людей: вибрані — чипами з хрестиком, нова — з пошуку */
function PeoplePicker({ value, onChange, options, nameOf, placeholder = 'Додати людину…', warnOf }) {
    const rest = options.filter(o => !value.some(v => Number(v) === Number(o.id)));
    return (
        <div className="space-y-1.5">
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map(cid => {
                        const warn = warnOf?.(cid);
                        return (
                            <span key={cid} className={`h-8 pl-2.5 pr-1 rounded-lg border text-[12.5px] font-semibold inline-flex items-center gap-1.5 ${warn ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-700'}`}>
                                {nameOf(cid)}{warn && <span className="font-normal">· {warn}</span>}
                                <button type="button" aria-label={`Прибрати: ${nameOf(cid)}`} onClick={() => onChange(value.filter(v => Number(v) !== Number(cid)))}
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50"><FaTimes size={9} /></button>
                            </span>
                        );
                    })}
                </div>
            )}
            <Picker options={rest} value="" onChange={(v) => onChange([...value, Number(v)])} placeholder={placeholder} searchPlaceholder="Пошук людини…" icon={FaUserTie} />
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Форма поїздки (нова або редагування) — на місці
 * ------------------------------------------------------------------- */
function TripForm({ trip, date, ctx, onSave, onCancel }) {
    const { vehicles, peopleOptions, nameOf, cars, schedule, absentOf, objByCid } = ctx;
    const isNew = !trip;
    const [mode, setMode] = useState(trip?.own_car_custom_id ? 'own' : 'fleet');
    const [f, setF] = useState(() => ({
        vehicle_id: trip?.vehicle_id ?? '',
        own_car_custom_id: trip?.own_car_custom_id ?? '',
        driver_custom_id: trip?.driver_custom_id ?? '',
        crew: trip?.crew || [],
        title: trip?.title || '',
        notes: trip?.notes || '',
    }));
    const [pickObjs, setPickObjs] = useState([]);   // об'єкти з графіка → зупинки
    const [saving, setSaving] = useState(false);
    const set = (p) => setF(x => ({ ...x, ...p }));

    const vehicleOptions = vehicles
        .filter(v => v.status !== 'inactive' || Number(v.id) === Number(f.vehicle_id))
        .map(v => ({ id: v.id, label: [v.name, v.plate, v.status === 'repair' ? 'у ремонті' : null].filter(Boolean).join(' · ') }));
    const ownerOptions = useMemo(() => {
        const withCar = new Set(cars.filter(c => c.status === 'own').map(c => Number(c.custom_id)));
        return peopleOptions.slice().sort((a, b) => Number(!withCar.has(Number(a.id))) - Number(!withCar.has(Number(b.id))))
            .map(o => ({ ...o, label: withCar.has(Number(o.id)) ? `${o.label} · своє авто` : o.label }));
    }, [cars, peopleOptions]);

    const chooseVehicle = (id) => {
        const v = vehicles.find(x => Number(x.id) === Number(id));
        set({ vehicle_id: id, ...(f.driver_custom_id === '' && v?.default_driver_custom_id ? { driver_custom_id: v.default_driver_custom_id } : {}) });
    };
    const chooseOwner = (cid) => set({ own_car_custom_id: cid, ...(f.driver_custom_id === '' ? { driver_custom_id: cid } : {}) });

    const toggleObj = (cid) => {
        const on = pickObjs.includes(cid);
        setPickObjs(p => (on ? p.filter(x => x !== cid) : [...p, cid]));
        if (!on) {
            // Люди з графіка цього об'єкта — в екіпаж
            const add = (schedule.byObject.get(cid) || []).filter(p => !f.crew.some(c => Number(c) === Number(p)));
            if (add.length) set({ crew: [...f.crew, ...add] });
        }
    };

    const save = async () => {
        setSaving(true);
        const payload = {
            vehicle_id: mode === 'fleet' && f.vehicle_id !== '' ? Number(f.vehicle_id) : null,
            own_car_custom_id: mode === 'own' && f.own_car_custom_id !== '' ? Number(f.own_car_custom_id) : null,
            driver_custom_id: f.driver_custom_id === '' ? null : Number(f.driver_custom_id),
            crew: f.crew.map(Number),
            title: f.title.trim() || null,
            notes: f.notes.trim() || null,
        };
        await onSave(payload, pickObjs);
        setSaving(false);
    };

    const scheduledObjs = [...schedule.byObject.keys()];
    const repair = mode === 'fleet' && vehicles.find(v => Number(v.id) === Number(f.vehicle_id))?.status === 'repair';

    return (
        <div className={`${isNew ? `${T.card} p-3` : 'p-3 bg-indigo-50/40 border-b border-indigo-100'} space-y-3`}
            onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
            {isNew && <div className="text-[14px] font-bold text-slate-900">Нова поїздка · {dayTitle(date)}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Segmented value={mode} onChange={setMode}
                        options={[{ value: 'fleet', label: 'Авто компанії' }, { value: 'own', label: 'Власне авто' }]} />
                    {mode === 'fleet' ? (
                        <Picker options={vehicleOptions} value={f.vehicle_id} onChange={chooseVehicle}
                            placeholder={vehicles.length ? 'Оберіть авто…' : 'Спершу додайте авто в автопарк'} searchPlaceholder="Назва або номер…" icon={FaShuttleVan} />
                    ) : (
                        <Picker options={ownerOptions} value={f.own_car_custom_id} onChange={chooseOwner}
                            placeholder="Чиє авто…" searchPlaceholder="Пошук людини…" icon={FaCar} />
                    )}
                    {repair && <div className="text-[12px] font-semibold text-amber-700">Це авто зараз у ремонті</div>}
                </div>
                <div className="space-y-1.5">
                    <span className={T.label}>Водій</span>
                    <Picker options={peopleOptions} value={f.driver_custom_id} onChange={v => set({ driver_custom_id: v })}
                        placeholder="Хто за кермом…" searchPlaceholder="Пошук людини…" icon={FaUserTie} />
                    {f.driver_custom_id !== '' && absentOf(f.driver_custom_id) && (
                        <div className="text-[12px] font-semibold text-amber-700">{nameOf(f.driver_custom_id)}: {absentOf(f.driver_custom_id)}</div>
                    )}
                </div>
            </div>

            {isNew && scheduledObjs.length > 0 && (
                <div className="space-y-1.5">
                    <span className={T.label}>Зупинки з графіка цього дня</span>
                    <div className="flex flex-wrap gap-1.5">
                        {scheduledObjs.map(cid => (
                            <ChipBtn key={cid} on={pickObjs.includes(cid)} onClick={() => toggleObj(cid)}>
                                {pickObjs.includes(cid) && <FaCheck size={9} />}
                                <span className="break-words text-left">{objLabel(objByCid.get(cid)) || `СЕС-${cid}`}</span>
                            </ChipBtn>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-1.5">
                <span className={T.label}>Екіпаж</span>
                <PeoplePicker value={f.crew} onChange={crew => set({ crew })} options={peopleOptions} nameOf={nameOf} warnOf={absentOf} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={T.input} value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Назва (необов'язково): напр. «Розвіз на Рівне»" />
                <input className={T.input} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Примітка: виїзд о 7:00 від складу…" />
            </div>

            <div className="flex flex-wrap gap-2">
                <Btn variant="accent" icon={isNew ? FaPlus : FaCheck} onClick={save} disabled={saving}>
                    {saving ? 'Зберігаємо…' : isNew ? (pickObjs.length ? `Створити з ${pickObjs.length} зуп.` : 'Створити поїздку') : 'Зберегти'}
                </Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={saving}>Скасувати</Btn>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Форма зупинки — на місці
 * ------------------------------------------------------------------- */
function StopForm({ stop, ctx, onSave, onCancel }) {
    const { objectOptions, objByCid, objById, openTasks } = ctx;
    const [mode, setMode] = useState(stop?.installation_custom_id == null && stop?.place ? 'place' : 'object');
    const [f, setF] = useState(() => ({
        installation_custom_id: stop?.installation_custom_id ?? '',
        place: stop?.place || '',
        purpose: stop?.purpose || 'delivery',
        note: stop?.note || '',
        issue_order_id: stop?.issue_order_id ?? '',
        microtask_id: stop?.microtask_id ? String(stop.microtask_id).trim() : '',
    }));
    const [orders, setOrders] = useState([]);
    const [saving, setSaving] = useState(false);
    const set = (p) => setF(x => ({ ...x, ...p }));

    // Документи видачі зі складу по обраному об'єкту
    useEffect(() => {
        if (mode !== 'object' || f.installation_custom_id === '') { setOrders([]); return undefined; }
        let alive = true;
        supabase.from('issue_orders').select('id, doc_number, status, needed_by')
            .eq('installation_custom_id', f.installation_custom_id).neq('status', 'cancelled')
            .order('created_at', { ascending: false }).limit(10)
            .then(({ data }) => { if (alive) setOrders(data || []); });
        return () => { alive = false; };
    }, [mode, f.installation_custom_id]);

    const ORDER_STATUS = { draft: 'чернетка', ready: 'зібрано', issued: 'видано' };
    const orderOptions = orders.map(o => ({ id: o.id, label: `${o.doc_number} · ${ORDER_STATUS[o.status] || o.status}${o.needed_by ? ` · до ${fmtShort(o.needed_by)}` : ''}` }));

    // Доручення: спершу по цьому об'єкту, далі решта відкритих
    const taskOptions = useMemo(() => {
        const objId = f.installation_custom_id !== '' ? objByCid.get(Number(f.installation_custom_id))?.id : null;
        return openTasks.slice()
            .sort((a, b) => Number(b.installation_id === objId) - Number(a.installation_id === objId))
            .map(t => {
                const o = t.installation_id ? objById.get(t.installation_id) : null;
                return { id: String(t.custom_id).trim(), label: `#${String(t.custom_id).trim()} ${t.task_text}${o ? ` (СЕС-${o.custom_id})` : ''}` };
            });
    }, [openTasks, f.installation_custom_id, objByCid, objById]);

    const takeTask = (id) => {
        const t = openTasks.find(x => String(x.custom_id).trim() === String(id));
        const o = t?.installation_id ? objById.get(t.installation_id) : null;
        const patch = { microtask_id: id };
        if (o && f.installation_custom_id === '') { setMode('object'); patch.installation_custom_id = o.custom_id; }
        if (!o && mode === 'place' && !f.place.trim()) patch.place = (t?.task_text || '').split('\n')[0].slice(0, 80);
        if (!f.note.trim() && t) patch.note = t.task_text;
        set(patch);
    };

    const can = mode === 'object' ? f.installation_custom_id !== '' : f.place.trim().length > 0;

    const save = async () => {
        if (!can) return;
        setSaving(true);
        await onSave({
            installation_custom_id: mode === 'object' ? Number(f.installation_custom_id) : null,
            place: mode === 'place' ? f.place.trim() : null,
            purpose: f.purpose,
            note: f.note.trim() || null,
            issue_order_id: mode === 'object' && f.issue_order_id !== '' ? Number(f.issue_order_id) : null,
            microtask_id: f.microtask_id || null,
        });
        setSaving(false);
    };

    return (
        <div className="px-3 py-3 bg-indigo-50/40 space-y-2.5" onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
            <div className="flex flex-wrap items-center gap-2">
                <Segmented value={mode} onChange={setMode} options={[{ value: 'object', label: "Об'єкт" }, { value: 'place', label: 'Інше місце' }]} />
                <div className="flex flex-wrap gap-1.5">
                    {STOP_PURPOSES.map(p => <ChipBtn key={p.v} tone="dark" on={f.purpose === p.v} onClick={() => set({ purpose: p.v })}>{p.l}</ChipBtn>)}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {mode === 'object' ? (
                    <Picker options={objectOptions} value={f.installation_custom_id} onChange={v => set({ installation_custom_id: v, issue_order_id: '' })}
                        placeholder="Оберіть об'єкт…" searchPlaceholder="Номер, назва, місто…" icon={FaHardHat} />
                ) : (
                    <input className={T.input} value={f.place} onChange={e => set({ place: e.target.value })} placeholder="Куди: склад, постачальник, адреса…" />
                )}
                <input className={T.input} value={f.note} onChange={e => set({ note: e.target.value })} placeholder="Що везти / що зробити" />
                {mode === 'object' && orderOptions.length > 0 && (
                    <Picker options={[{ id: '', label: 'Без документа видачі' }, ...orderOptions]} value={f.issue_order_id} onChange={v => set({ issue_order_id: v })}
                        placeholder="Документ видачі зі складу" searchPlaceholder="Номер…" icon={FaWarehouse} />
                )}
                <Picker options={[{ id: '', label: 'Без доручення' }, ...taskOptions]} value={f.microtask_id} onChange={v => (v === '' ? set({ microtask_id: '' }) : takeTask(v))}
                    placeholder="Взяти з доручень" searchPlaceholder="Текст або номер…" icon={FaTasks} />
            </div>
            <div className="flex flex-wrap gap-2">
                <Btn variant="accent" icon={FaCheck} onClick={save} disabled={!can || saving}>{saving ? 'Зберігаємо…' : stop ? 'Зберегти' : 'Додати зупинку'}</Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={saving}>Скасувати</Btn>
            </div>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Поїздка з зупинками
 * ------------------------------------------------------------------- */
function TripCard({ trip, ctx, canManage, flash, ui, setUi, actions }) {
    const { vehicles, nameOf, objByCid, absentOf, openTasks, tripsOfVehicle } = ctx;
    const stops = (trip.stops || []).slice().sort((a, b) => a.position - b.position || a.id - b.id);
    const vehicle = trip.vehicle_id ? vehicles.find(v => Number(v.id) === Number(trip.vehicle_id)) : null;
    const st = TRIP_STATUS[trip.status] || TRIP_STATUS.planned;
    const route = routeUrl(stops.map(s => routePoint(s, s.installation_custom_id ? objByCid.get(s.installation_custom_id) : null)));
    const doneCount = stops.filter(s => s.done_at).length;
    const editing = ui.trip === trip.id;
    const confirmDel = ui.confirm === `trip-${trip.id}`;

    const warnings = [];
    if (vehicle?.status === 'repair') warnings.push(`авто в ремонті${vehicle.repair_until ? ` до ${fmtShort(vehicle.repair_until)}` : ''}`);
    if (vehicle && tripsOfVehicle(vehicle.id) > 1) warnings.push('це авто має ще поїздку цього дня');
    [trip.driver_custom_id, ...(trip.crew || [])].filter(Boolean).forEach(cid => {
        const a = absentOf(cid);
        if (a) warnings.push(`${nameOf(cid)}: ${a}`);
    });
    if (!vehicle && !trip.own_car_custom_id) warnings.push('транспорт не обрано');

    const transport = vehicle
        ? [vehicle.name, vehicle.plate].filter(Boolean).join(' · ')
        : trip.own_car_custom_id ? `Власне авто: ${nameOf(trip.own_car_custom_id)}` : 'Транспорт не обрано';
    const crew = (trip.crew || []).filter(c => Number(c) !== Number(trip.driver_custom_id));

    return (
        <section className={`${T.card} overflow-hidden transition-colors duration-700 ${flash[`t${trip.id}`] ? 'ring-2 ring-amber-300' : ''} ${trip.status === 'cancelled' ? 'opacity-60' : ''}`}>
            {editing ? (
                <TripForm trip={trip} date={trip.trip_date} ctx={ctx} onCancel={() => setUi({})} onSave={(p) => actions.updateTrip(trip, p)} />
            ) : (
                <div className="px-3 sm:px-4 py-3 border-b border-slate-100 flex items-start gap-3">
                    <span className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center flex-shrink-0">
                        {vehicle || !trip.own_car_custom_id ? <FaShuttleVan size={14} /> : <FaCar size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[14.5px] font-bold text-slate-900 break-words">{trip.title || transport}</span>
                            <Chip tone={st.tone}>{st.l}</Chip>
                            {stops.length > 0 && <span className="text-[12px] text-slate-400 tabular-nums">{doneCount}/{stops.length} зуп.</span>}
                        </div>
                        <div className="text-[12.5px] text-slate-600 leading-snug break-words">
                            {trip.title && <>{transport} · </>}
                            водій <b className="text-slate-800">{trip.driver_custom_id ? nameOf(trip.driver_custom_id) : 'не призначено'}</b>
                            {crew.length > 0 && <> · екіпаж: {crew.map(nameOf).join(', ')}</>}
                        </div>
                        {trip.notes && <div className="text-[12.5px] text-slate-500 break-words">{trip.notes}</div>}
                        {warnings.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                                {warnings.map(w => <Chip key={w} tone="warn" icon={FaExclamationTriangle}>{w}</Chip>)}
                            </div>
                        )}
                    </div>
                    {confirmDel ? (
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-[12px] font-semibold text-rose-700 mr-1">Видалити?</span>
                            <Btn size="sm" variant="danger" onClick={() => actions.deleteTrip(trip)}>Так</Btn>
                            <Btn size="sm" variant="ghost" onClick={() => setUi({})}>Ні</Btn>
                        </div>
                    ) : (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                            {route && (
                                <a href={route} target="_blank" rel="noopener noreferrer" title="Маршрут у Google Maps" aria-label="Маршрут у Google Maps"
                                    className="w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-indigo-600 hover:bg-indigo-50"><FaMapMarkedAlt size={14} /></a>
                            )}
                            {canManage && <IconBtn icon={FaEdit} label="Редагувати поїздку" onClick={() => setUi({ trip: trip.id })} />}
                            {canManage && <IconBtn icon={FaTrash} label="Видалити поїздку" className="hover:!text-rose-600" onClick={() => setUi({ confirm: `trip-${trip.id}` })} />}
                        </div>
                    )}
                </div>
            )}

            <ol className="divide-y divide-slate-100">
                {stops.map((s, i) => {
                    if (ui.stop === s.id) {
                        return <li key={s.id}><StopForm stop={s} ctx={ctx} onCancel={() => setUi({})} onSave={(p) => actions.updateStop(s, p)} /></li>;
                    }
                    const obj = s.installation_custom_id ? objByCid.get(s.installation_custom_id) : null;
                    const task = s.microtask_id ? openTasks.find(t => String(t.custom_id).trim() === String(s.microtask_id).trim()) : null;
                    const confirmStop = ui.confirm === `stop-${s.id}`;
                    return (
                        <li key={s.id} className={`px-3 sm:px-4 py-2.5 flex flex-wrap items-start gap-x-3 gap-y-1 transition-colors duration-700 ${flash[`s${s.id}`] ? 'bg-amber-50' : ''}`}>
                            {canManage ? (
                                <button type="button" onClick={() => actions.toggleStop(s)} aria-label={s.done_at ? 'Повернути зупинку' : 'Зупинку виконано'}
                                    title={s.done_at ? 'Повернути' : 'Виконано'}
                                    className={`mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-[11px] font-bold
                                        ${s.done_at ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 text-slate-500 hover:border-emerald-500 hover:bg-emerald-50'}`}>
                                    {s.done_at ? <FaCheck size={10} /> : i + 1}
                                </button>
                            ) : (
                                <span className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${s.done_at ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {s.done_at ? <FaCheck size={10} /> : i + 1}
                                </span>
                            )}
                            {/* На телефоні кнопки переносяться під текст, а не стискають назву */}
                            <div className="min-w-0 flex-1 basis-[200px]">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {obj ? (
                                        <a href={`#/project/${obj.custom_id}`} className={`text-[13.5px] font-semibold break-words hover:text-indigo-700 ${s.done_at ? 'text-slate-500' : 'text-slate-900'}`}>
                                            <span className="font-mono text-[11px] text-slate-400 mr-1">СЕС-{obj.custom_id}</span>{obj.name || obj.client?.name}
                                        </a>
                                    ) : (
                                        <span className={`text-[13.5px] font-semibold break-words ${s.done_at ? 'text-slate-500' : 'text-slate-900'}`}>{s.place || `СЕС-${s.installation_custom_id}`}</span>
                                    )}
                                    <Chip tone={s.purpose === 'install' ? 'accent' : s.purpose === 'pickup' ? 'warn' : 'neutral'}>{purposeLabel(s.purpose)}</Chip>
                                </div>
                                <div className="text-[12px] text-slate-500 leading-snug break-words">
                                    {[obj?.client?.populated_place, s.note,
                                        s.issue_order_id ? `видача #${s.issue_order_id}` : null,
                                        s.microtask_id ? `доручення #${String(s.microtask_id).trim()}${task ? '' : ' (закрите)'}` : null,
                                        s.done_at ? `виконано ${new Date(s.done_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}` : null,
                                    ].filter(Boolean).join(' · ')}
                                </div>
                            </div>
                            {canManage && (confirmStop ? (
                                <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
                                    <Btn size="sm" variant="danger" onClick={() => actions.deleteStop(s)}>Прибрати</Btn>
                                    <Btn size="sm" variant="ghost" onClick={() => setUi({})}>Ні</Btn>
                                </div>
                            ) : (
                                <div className="flex items-center flex-shrink-0 ml-auto">
                                    <IconBtn icon={FaArrowUp} label="Вище" disabled={i === 0} onClick={() => actions.moveStop(stops, i, -1)} />
                                    <IconBtn icon={FaArrowDown} label="Нижче" disabled={i === stops.length - 1} onClick={() => actions.moveStop(stops, i, 1)} />
                                    <IconBtn icon={FaEdit} label="Змінити зупинку" onClick={() => setUi({ stop: s.id })} />
                                    <IconBtn icon={FaTimes} label="Прибрати зупинку" className="hover:!text-rose-600" onClick={() => setUi({ confirm: `stop-${s.id}` })} />
                                </div>
                            ))}
                        </li>
                    );
                })}
                {ui.addStop === trip.id && (
                    <li><StopForm ctx={ctx} onCancel={() => setUi({})} onSave={(p) => actions.addStop(trip, stops, p)} /></li>
                )}
            </ol>

            {canManage && !editing && ui.addStop !== trip.id && (
                <div className="px-3 sm:px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <Btn size="sm" variant="soft" icon={FaPlus} onClick={() => setUi({ addStop: trip.id })}>Зупинка</Btn>
                    {trip.status === 'planned' && stops.length > 0 && doneCount === stops.length && (
                        <Btn size="sm" variant="softOk" icon={FaCheck} onClick={() => actions.setTripStatus(trip, 'done')}>Поїздку виконано</Btn>
                    )}
                    {trip.status === 'planned' && <Btn size="sm" variant="ghost" onClick={() => actions.setTripStatus(trip, 'cancelled')}>Скасувати поїздку</Btn>}
                    {trip.status !== 'planned' && <Btn size="sm" variant="ghost" onClick={() => actions.setTripStatus(trip, 'planned')}>Повернути в план</Btn>}
                </div>
            )}
        </section>
    );
}

/* ---------------------------------------------------------------------
 *  Автопарк
 * ------------------------------------------------------------------- */
function VehicleForm({ vehicle, peopleOptions, onSave, onCancel }) {
    const [f, setF] = useState(() => ({
        name: vehicle?.name || '', plate: vehicle?.plate || '', kind: vehicle?.kind || 'bus',
        status: vehicle?.status || 'active', repair_until: vehicle?.repair_until || '',
        default_driver_custom_id: vehicle?.default_driver_custom_id ?? '', notes: vehicle?.notes || '',
    }));
    const [saving, setSaving] = useState(false);
    const set = (p) => setF(x => ({ ...x, ...p }));
    const save = async () => {
        if (!f.name.trim()) return;
        setSaving(true);
        await onSave({
            name: f.name.trim(), plate: f.plate.trim() || null, kind: f.kind, status: f.status,
            repair_until: f.status === 'repair' && f.repair_until ? f.repair_until : null,
            default_driver_custom_id: f.default_driver_custom_id === '' ? null : Number(f.default_driver_custom_id),
            notes: f.notes.trim() || null,
        });
        setSaving(false);
    };
    return (
        <div className="p-3 bg-indigo-50/40 space-y-2.5" onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') save(); }}>
            <div className="grid grid-cols-2 gap-2">
                <input className={`${T.input} col-span-2`} value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Назва: Mercedes Sprinter" autoFocus />
                <input className={T.input} value={f.plate} onChange={e => set({ plate: e.target.value })} placeholder="Номер: ВК1234АА" />
                <select className={T.select} value={f.kind} onChange={e => set({ kind: e.target.value })} aria-label="Тип авто">
                    {VEHICLE_KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                </select>
            </div>
            <div className="flex flex-wrap gap-1.5">
                {Object.entries(VEHICLE_STATUS).map(([k, s]) => <ChipBtn key={k} tone="dark" on={f.status === k} onClick={() => set({ status: k })}>{s.l}</ChipBtn>)}
                {f.status === 'repair' && (
                    <input type="date" value={f.repair_until} onChange={e => set({ repair_until: e.target.value })} aria-label="У ремонті до"
                        className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-[12.5px]" />
                )}
            </div>
            <Picker options={[{ id: '', label: 'Без постійного водія' }, ...peopleOptions]} value={f.default_driver_custom_id} onChange={v => set({ default_driver_custom_id: v })}
                placeholder="Постійний водій" searchPlaceholder="Пошук людини…" icon={FaUserTie} />
            <input className={T.input} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Примітка: вантажопідйомність, причіп…" />
            <div className="flex gap-2">
                <Btn variant="accent" icon={FaCheck} onClick={save} disabled={!f.name.trim() || saving}>{saving ? 'Зберігаємо…' : vehicle ? 'Зберегти' : 'Додати авто'}</Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={saving}>Скасувати</Btn>
            </div>
        </div>
    );
}

function FleetPanel({ vehicles, peopleOptions, nameOf, canManage, flash, ui, setUi, actions }) {
    return (
        <div className={`${T.card} overflow-hidden`}>
            <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-bold text-slate-900 inline-flex items-center gap-2"><FaShuttleVan size={12} className="text-indigo-500" /> Автопарк</h3>
                {canManage && ui.vehicle !== 'new' && <Btn size="sm" variant="soft" icon={FaPlus} onClick={() => setUi({ vehicle: 'new' })}>Авто</Btn>}
            </div>
            {ui.vehicle === 'new' && <VehicleForm peopleOptions={peopleOptions} onCancel={() => setUi({})} onSave={actions.addVehicle} />}
            {vehicles.length === 0 && ui.vehicle !== 'new' ? (
                <div className="px-3.5 py-4 text-[13px] text-slate-400">Авто компанії ще не додані</div>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {vehicles.map(v => (ui.vehicle === v.id ? (
                        <li key={v.id}><VehicleForm vehicle={v} peopleOptions={peopleOptions} onCancel={() => setUi({})} onSave={(p) => actions.updateVehicle(v, p)} /></li>
                    ) : (
                        <li key={v.id} className={`px-3.5 py-2.5 flex items-start gap-2 transition-colors duration-700 ${flash[`v${v.id}`] ? 'bg-amber-50' : ''} ${v.status === 'inactive' ? 'opacity-60' : ''}`}>
                            <div className="min-w-0 flex-1">
                                <div className="text-[13.5px] font-semibold text-slate-900 break-words">{v.name}{v.plate && <span className="font-mono text-[12px] text-slate-500 ml-1.5">{v.plate}</span>}</div>
                                <div className="text-[12px] text-slate-500 break-words">
                                    {[kindLabel(v.kind), v.default_driver_custom_id ? `водій ${nameOf(v.default_driver_custom_id)}` : null, v.notes].filter(Boolean).join(' · ')}
                                </div>
                            </div>
                            <Chip tone={VEHICLE_STATUS[v.status]?.tone || 'neutral'}>
                                {VEHICLE_STATUS[v.status]?.l || v.status}{v.status === 'repair' && v.repair_until ? ` до ${fmtShort(v.repair_until)}` : ''}
                            </Chip>
                            {canManage && <IconBtn icon={FaEdit} label="Змінити авто" onClick={() => setUi({ vehicle: v.id })} />}
                        </li>
                    )))}
                </ul>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Власні авто людей
 * ------------------------------------------------------------------- */
function CarsPanel({ people, carOf, canManage, flash, actions }) {
    const [showAll, setShowAll] = useState(false);
    const known = people.filter(p => carOf(p.custom_id));
    const rest = people.filter(p => !carOf(p.custom_id));
    const row = (p) => {
        const c = carOf(p.custom_id);
        return (
            <li key={p.id} className={`px-3.5 py-2 flex flex-wrap items-center gap-2 transition-colors duration-700 ${flash[`c${p.id}`] ? 'bg-amber-50' : ''}`}>
                <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-slate-800 break-words">{p.name}</div>
                    {c?.status === 'repair' && (c.until || c.note) && (
                        <div className="text-[11.5px] text-amber-700">{[c.until ? `до ${fmtShort(c.until)}` : null, c.note].filter(Boolean).join(' · ')}</div>
                    )}
                </div>
                {canManage ? (
                    <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                        {Object.entries(CAR_STATUS).map(([k, s]) => (
                            <button key={k} type="button" onClick={() => actions.setCar(p, k)}
                                className={`h-8 px-2 rounded-md text-[11.5px] font-bold whitespace-nowrap ${c?.status === k ? 'bg-white shadow-sm ' + (k === 'own' ? 'text-emerald-700' : k === 'repair' ? 'text-amber-700' : 'text-slate-700') : 'text-slate-500'}`}>
                                {k === 'own' ? 'Своє' : k === 'repair' ? 'Ремонт' : 'Немає'}
                            </button>
                        ))}
                    </div>
                ) : c ? <Chip tone={CAR_STATUS[c.status]?.tone}>{CAR_STATUS[c.status]?.l}</Chip> : null}
            </li>
        );
    };
    return (
        <div className={`${T.card} overflow-hidden`}>
            <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-bold text-slate-900 inline-flex items-center gap-2"><FaCar size={12} className="text-indigo-500" /> Власні авто людей</h3>
                <Tip text="Монтажники самі відмічають своє авто в «Монтажі» (Я → Авто). Тут це видно й можна поправити." />
            </div>
            <ul className="divide-y divide-slate-100">
                {known.map(row)}
                {known.length === 0 && <li className="px-3.5 py-3 text-[13px] text-slate-400">Ще ніхто не відмітив своє авто</li>}
                {showAll && rest.map(row)}
            </ul>
            {rest.length > 0 && (
                <button type="button" onClick={() => setShowAll(v => !v)} className="w-full py-2 border-t border-slate-100 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                    {showAll ? 'Згорнути' : `Решта людей · ${rest.length}`}
                </button>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Розділ
 * ------------------------------------------------------------------- */
export default function TransportPage() {
    const { role, employee: me } = useAuth();
    const canManage = role === 'super_admin' || role === 'admin' || role === 'office';
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') || '') ? params.get('d') : isoDay();
    const setDate = (d) => setParams(prev => { const p = new URLSearchParams(prev); if (d === isoDay()) p.delete('d'); else p.set('d', d); return p; }, { replace: true });

    const [base, setBase] = useState(null);       // довідники: авто, люди, об'єкти, авто людей
    const [day, setDay] = useState(null);         // поїздки дня, графік, відсутні
    const [weekCounts, setWeekCounts] = useState({});
    const [openTasks, setOpenTasks] = useState([]);
    const [ui, setUiState] = useState({});        // що зараз відкрито: { trip | stop | addStop | vehicle | confirm | newTrip }
    const [flash, setFlash] = useState({});
    const reqRef = useRef(0);

    const pulse = useCallback((key) => {
        setFlash(f => ({ ...f, [key]: true }));
        setTimeout(() => setFlash(f => { const n = { ...f }; delete n[key]; return n; }), FLASH_MS);
    }, []);

    const loadBase = useCallback(async () => {
        const [v, e, o, c, t] = await Promise.all([
            supabase.from('vehicles').select('*').order('status').order('name'),
            supabase.from('employees').select('id, custom_id, name, role, access_blocked_at, hidden_from_list').order('name'),
            supabase.from('installations').select('id, custom_id, name, status, gps_link, latitude, longitude, client:clients(name, populated_place, oblast)').order('custom_id', { ascending: false }),
            supabase.from('employee_cars').select('*'),
            supabase.from('microtasks').select('custom_id, task_text, installation_id, assigned_to, due_date, status').in('status', OPEN_TASK).order('created_at', { ascending: false }),
        ]);
        if (v.error) { toast(humanError(v.error), 'error'); }
        setBase({ vehicles: v.data || [], employees: e.data || [], objects: o.data || [], cars: c.data || [] });
        setOpenTasks(t.data || []);
    }, [toast]);

    const loadDay = useCallback(async (quiet = false) => {
        const req = ++reqRef.current;
        if (!quiet) setDay(null);
        const mon = mondayOf(date);
        const [trips, work, visits, off, week] = await Promise.all([
            supabase.from('trips').select('*, stops:trip_stops(*)').eq('trip_date', date).order('id'),
            supabase.from('installation_workers').select('installation_custom_id, employee_custom_id').eq('work_date', date),
            supabase.from('installation_visit_plan').select('installation_custom_id, assignees:installation_visit_plan_employees(employee_id)').eq('planned_date', date).neq('status', 'cancelled'),
            supabase.from('attendance').select('employee_custom_id, status').eq('work_date', date).in('status', Object.keys(ABSENCE)),
            supabase.from('trips').select('trip_date, status').gte('trip_date', mon).lte('trip_date', shiftDay(mon, 6)),
        ]);
        if (req !== reqRef.current) return;
        if (trips.error) toast(humanError(trips.error), 'error');
        const counts = {};
        (week.data || []).filter(t => t.status !== 'cancelled').forEach(t => { counts[t.trip_date] = (counts[t.trip_date] || 0) + 1; });
        setWeekCounts(counts);
        setDay({ trips: trips.data || [], work: work.data || [], visits: visits.data || [], off: off.data || [] });
    }, [date, toast]);

    useEffect(() => { loadBase(); }, [loadBase]);
    useEffect(() => { loadDay(); setUiState({}); }, [loadDay]);

    // Наживо: поїздки, зупинки, авто
    useEffect(() => {
        let t1 = null, t2 = null;
        const ch = supabase.channel('transport-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => { clearTimeout(t1); t1 = setTimeout(() => loadDay(true), 500); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_stops' }, () => { clearTimeout(t1); t1 = setTimeout(() => loadDay(true), 500); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => { clearTimeout(t2); t2 = setTimeout(loadBase, 500); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_cars' }, () => { clearTimeout(t2); t2 = setTimeout(loadBase, 500); })
            .subscribe();
        return () => { clearTimeout(t1); clearTimeout(t2); supabase.removeChannel(ch); };
    }, [loadDay, loadBase]);

    /* ---- Похідне ---- */
    const ctx = useMemo(() => {
        if (!base || !day) return null;
        const empByCid = new Map(base.employees.map(e => [Number(e.custom_id), e]));
        const empById = new Map(base.employees.map(e => [e.id, e]));
        const active = base.employees.filter(e => !e.access_blocked_at && !e.hidden_from_list);
        const objByCid = new Map(base.objects.map(o => [o.custom_id, o]));
        const objById = new Map(base.objects.map(o => [o.id, o]));
        const offMap = new Map(day.off.map(a => [Number(a.employee_custom_id), ABSENCE[a.status] || a.status]));

        // Графік дня: об'єкт → люди (з графіка і запланованих виїздів)
        const byObject = new Map();
        const addTo = (cid, person) => {
            if (!cid) return;
            if (!byObject.has(cid)) byObject.set(cid, []);
            if (person != null && !byObject.get(cid).includes(person)) byObject.get(cid).push(person);
        };
        day.work.forEach(w => addTo(w.installation_custom_id, w.employee_custom_id != null ? Number(w.employee_custom_id) : null));
        day.visits.forEach(v => {
            addTo(v.installation_custom_id, null);
            (v.assignees || []).forEach(a => { const e = empById.get(a.employee_id); if (e) addTo(v.installation_custom_id, Number(e.custom_id)); });
        });
        const scheduled = new Set(byObject.keys());

        const vehicleUse = {};
        day.trips.filter(t => t.status !== 'cancelled' && t.vehicle_id).forEach(t => { vehicleUse[t.vehicle_id] = (vehicleUse[t.vehicle_id] || 0) + 1; });

        return {
            vehicles: base.vehicles,
            cars: base.cars.map(c => ({ ...c, custom_id: empById.get(c.employee_id)?.custom_id })),
            nameOf: (cid) => empByCid.get(Number(cid))?.name || `#${cid}`,
            peopleOptions: active.map(e => ({ id: Number(e.custom_id), label: e.name })),
            objByCid, objById,
            objectOptions: base.objects
                .slice()
                .sort((a, b) => Number(scheduled.has(b.custom_id)) - Number(scheduled.has(a.custom_id))
                    || Number(['completed', 'cancelled', 'lost'].includes(a.status)) - Number(['completed', 'cancelled', 'lost'].includes(b.status))
                    || b.custom_id - a.custom_id)
                .map(o => ({ id: o.custom_id, label: `${objLabel(o)}${scheduled.has(o.custom_id) ? ' · у графіку' : ''}` })),
            schedule: { byObject },
            absentOf: (cid) => offMap.get(Number(cid)) || null,
            openTasks,
            tripsOfVehicle: (vid) => vehicleUse[vid] || 0,
        };
    }, [base, day, openTasks]);

    /* ---- Дії ---- */
    const done = (msg, key) => { if (key) pulse(key); if (msg) toast(msg); setUiState({}); };
    const fail = (error) => { toast(humanError(error), 'error'); return false; };

    const actions = {
        createTrip: async (payload, objs) => {
            const { data, error } = await supabase.from('trips').insert({ ...payload, trip_date: date, status: 'planned', created_by: me?.id || null }).select('id').single();
            if (error) return fail(error);
            if (objs.length) {
                const { error: e2 } = await supabase.from('trip_stops').insert(objs.map((cid, i) => ({ trip_id: data.id, position: i + 1, installation_custom_id: cid, purpose: 'install' })));
                if (e2) fail(e2);
            }
            await loadDay(true);
            done(objs.length ? `Поїздку створено: ${objs.length} зуп.` : 'Поїздку створено — додайте зупинки', `t${data.id}`);
            if (!objs.length) setUiState({ addStop: data.id });
            return true;
        },
        updateTrip: async (trip, payload) => {
            const { error } = await supabase.from('trips').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', trip.id);
            if (error) return fail(error);
            await loadDay(true);
            done('Поїздку оновлено', `t${trip.id}`);
            return true;
        },
        setTripStatus: async (trip, status) => {
            const { error } = await supabase.from('trips').update({ status, updated_at: new Date().toISOString() }).eq('id', trip.id);
            if (error) return fail(error);
            await loadDay(true);
            done(status === 'done' ? 'Поїздку виконано' : status === 'cancelled' ? 'Поїздку скасовано' : 'Поїздку повернуто в план', `t${trip.id}`);
            return true;
        },
        deleteTrip: async (trip) => {
            const { error } = await supabase.from('trips').delete().eq('id', trip.id);
            if (error) return fail(error);
            await loadDay(true);
            done('Поїздку видалено');
            return true;
        },
        addStop: async (trip, stops, payload) => {
            const position = stops.reduce((m, s) => Math.max(m, s.position || 0), 0) + 1;
            const { data, error } = await supabase.from('trip_stops').insert({ ...payload, trip_id: trip.id, position }).select('id').single();
            if (error) return fail(error);
            await loadDay(true);
            done('Зупинку додано', `s${data.id}`);
            return true;
        },
        updateStop: async (stop, payload) => {
            const { error } = await supabase.from('trip_stops').update(payload).eq('id', stop.id);
            if (error) return fail(error);
            await loadDay(true);
            done('Зупинку оновлено', `s${stop.id}`);
            return true;
        },
        deleteStop: async (stop) => {
            const { error } = await supabase.from('trip_stops').delete().eq('id', stop.id);
            if (error) return fail(error);
            await loadDay(true);
            done('Зупинку прибрано');
            return true;
        },
        moveStop: async (stops, i, dir) => {
            const a = stops[i], b = stops[i + dir];
            if (!a || !b) return;
            // Нумеруємо заново, щоб однакові номери не плутали порядок
            const order = stops.map(s => s.id);
            [order[i], order[i + dir]] = [order[i + dir], order[i]];
            const results = await Promise.all(order.map((id, k) => supabase.from('trip_stops').update({ position: k + 1 }).eq('id', id)));
            const err = results.find(r => r.error)?.error;
            if (err) { fail(err); return; }
            await loadDay(true);
            pulse(`s${a.id}`);
        },
        toggleStop: async (stop) => {
            const doneNow = !stop.done_at;
            const { error } = await supabase.from('trip_stops').update({ done_at: doneNow ? new Date().toISOString() : null }).eq('id', stop.id);
            if (error) { fail(error); return; }
            let extra = '';
            // Пов'язане доручення закриваємо разом із зупинкою
            if (doneNow && stop.microtask_id) {
                const id = String(stop.microtask_id).trim();
                const open = openTasks.some(t => String(t.custom_id).trim() === id);
                if (open) {
                    const { error: e2 } = await supabase.from('microtasks').update({ status: 'виконано', data_complete: new Date().toISOString() }).eq('custom_id', stop.microtask_id);
                    if (!e2) { extra = ` · доручення #${id} закрито`; setOpenTasks(ts => ts.filter(t => String(t.custom_id).trim() !== id)); }
                }
            }
            await loadDay(true);
            pulse(`s${stop.id}`);
            toast(doneNow ? `Зупинку виконано${extra}` : 'Зупинку повернуто');
        },
        addVehicle: async (payload) => {
            const { data, error } = await supabase.from('vehicles').insert(payload).select('id').single();
            if (error) return fail(error);
            await loadBase();
            done(`Авто «${payload.name}» додано`, `v${data.id}`);
            return true;
        },
        updateVehicle: async (v, payload) => {
            const { error } = await supabase.from('vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', v.id);
            if (error) return fail(error);
            await loadBase();
            done('Авто оновлено', `v${v.id}`);
            return true;
        },
        setCar: async (person, status) => {
            const { error } = await supabase.from('employee_cars').upsert({ employee_id: person.id, status, ...(status !== 'repair' ? { until: null } : {}), updated_at: new Date().toISOString() }, { onConflict: 'employee_id' });
            if (error) { fail(error); return; }
            setBase(b => ({ ...b, cars: [...b.cars.filter(c => c.employee_id !== person.id), { ...(b.cars.find(c => c.employee_id === person.id) || {}), employee_id: person.id, status }] }));
            pulse(`c${person.id}`);
            toast(`${person.name}: ${CAR_STATUS[status].l.toLowerCase()}`);
        },
    };

    /* ---- Відображення ---- */
    const mon = mondayOf(date);
    const week = Array.from({ length: 7 }, (_, i) => shiftDay(mon, i));
    const today = isoDay();
    const trips = day?.trips || [];
    const people = useMemo(() => (base?.employees || []).filter(e => !e.access_blocked_at && !e.hidden_from_list), [base]);
    const carOf = useCallback((cid) => {
        const e = people.find(p => Number(p.custom_id) === Number(cid));
        return e ? base?.cars.find(c => c.employee_id === e.id) || null : null;
    }, [people, base]);

    return (
        <div className="p-3 sm:p-5 space-y-3 max-w-[1500px] mx-auto pb-24 lg:pb-8">
            {/* День: тиждень смужкою, стрілки, «сьогодні» */}
            <div className={`${T.card} p-2.5 space-y-2`}>
                <div className="flex flex-wrap items-center gap-2">
                    <IconBtn variant="outline" icon={FaChevronLeft} label="Попередній тиждень" onClick={() => setDate(shiftDay(date, -7))} />
                    <h2 className="text-[16px] font-bold text-slate-900 first-letter:uppercase mr-auto">{dayTitle(date)}</h2>
                    {date !== today && <Btn size="sm" variant="soft" onClick={() => setDate(today)}>Сьогодні</Btn>}
                    <input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} aria-label="Обрати дату"
                        className="h-9 px-2 rounded-lg border border-slate-200 bg-white text-[12.5px] text-slate-700" />
                    <IconBtn variant="outline" icon={FaChevronRight} label="Наступний тиждень" onClick={() => setDate(shiftDay(date, 7))} />
                </div>
                <div className="grid grid-cols-7 gap-1">
                    {week.map((d, i) => {
                        const on = d === date;
                        const n = weekCounts[d] || 0;
                        return (
                            <button key={d} type="button" onClick={() => setDate(d)}
                                className={`h-12 rounded-lg border flex flex-col items-center justify-center leading-tight transition-colors
                                    ${on ? 'bg-indigo-600 border-indigo-600 text-white' : d === today ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                <span className="text-[11px] font-semibold opacity-80 whitespace-nowrap">{WEEKDAYS[i]} {parseDay(d).getDate()}</span>
                                <span className={`text-[12px] font-bold tabular-nums whitespace-nowrap ${n ? '' : 'opacity-40'}`}>
                                    {n ? <>{n}<span className="hidden sm:inline"> поїзд.</span></> : '—'}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-3 items-start">
                {/* Поїздки дня */}
                <div className="space-y-3 min-w-0">
                    {!ctx ? (
                        <div className={T.card}><Skeleton rows={6} /></div>
                    ) : (
                        <>
                            {canManage && (ui.newTrip ? (
                                <TripForm date={date} ctx={ctx} onCancel={() => setUiState({})} onSave={(p, objs) => actions.createTrip(p, objs)} />
                            ) : (
                                <button type="button" onClick={() => setUiState({ newTrip: true })}
                                    className="w-full h-12 px-4 rounded-xl border border-dashed border-slate-300 bg-white text-left text-[14px] font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-700 inline-flex items-center gap-2.5">
                                    <FaPlus size={11} /> Нова поїздка на цей день…
                                    {ctx.schedule.byObject.size > 0 && <span className="ml-auto text-[12px] font-normal text-slate-400">у графіку {ctx.schedule.byObject.size} об'єкт.</span>}
                                </button>
                            ))}
                            {trips.length === 0 && !ui.newTrip ? (
                                <div className={`${T.card} px-4 py-8 text-center`}>
                                    <FaRoute className="mx-auto text-slate-300" size={26} />
                                    <div className="mt-2 text-[14px] font-semibold text-slate-600">Поїздок на цей день немає</div>
                                </div>
                            ) : trips.map(t => (
                                <TripCard key={t.id} trip={t} ctx={ctx} canManage={canManage} flash={flash} ui={ui} setUi={setUiState} actions={actions} />
                            ))}
                        </>
                    )}
                </div>

                {/* Автопарк і власні авто */}
                <div className="space-y-3">
                    {base ? (
                        <>
                            <FleetPanel vehicles={base.vehicles} peopleOptions={ctx?.peopleOptions || []} nameOf={ctx?.nameOf || ((c) => `#${c}`)}
                                canManage={canManage} flash={flash} ui={ui} setUi={setUiState} actions={actions} />
                            <CarsPanel people={people} carOf={carOf} canManage={canManage} flash={flash} actions={actions} />
                        </>
                    ) : <div className={T.card}><Skeleton rows={4} /></div>}
                </div>
            </div>
        </div>
    );
}
