// =====================================================================
//  K-CORE · «Календар» — складання графіка дня прямо на сторінці
//
//  Графік складають на день наперед: обрали день (типово — завтра),
//  додали об'єкти, людей і одразу — чим вони поїдуть: авто компанії
//  (один бус може везти кілька бригад) або власне авто працівника.
//  «Зберегти й надіслати» — графік іде в Telegram-гілку графіка, а кожен
//  з графіка отримує сповіщення: де, з ким, на чому, хто за кермом.
//
//  Праворуч — люди дня (вільні / зайняті / відсутні, у кого своє авто)
//  і транспорт дня (які авто зайняті, які вільні, які в ремонті).
//  Поки складаєте — чернетка зберігається сама, інші менеджери її бачать.
//
//  Транспорт зберігається як поїздки (trips + trip_stops): один запис на
//  авто за день, зупинки — об'єкти бригад, екіпаж — люди цих бригад.
//  Їх бачать водій і екіпаж у «Монтажі» на «Сьогодні».
// =====================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FaPlus, FaTrash, FaHistory, FaShuttleVan, FaCar, FaPaperPlane, FaCheck, FaSave, FaHardHat, FaUserTie,
    FaTasks, FaRoute, FaTimes, FaExclamationTriangle, FaPen, FaUserSlash,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { T, Btn, IconBtn, Chip, Picker, Segmented, Skeleton, useToast, humanError } from '../ui';

const ABSENCE = { OFF: 'вихідний', VACATION: 'відпустка', SICK_LEAVE: 'лікарняний' };
const ABSENCE_WHAT = { OFF: 'вихідний', VACATION: 'відпустку', SICK_LEAVE: 'лікарняний' };
const INSTALL_DEPS = ['Монтаж', 'Склад', 'Водії'];
const CLOSED = ['completed', 'cancelled', 'lost'];

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const shiftDay = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const timeOf = (iso) => (iso ? new Date(iso).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }) : '');
const dayWord = (s) => parseDay(s).toLocaleDateString('uk-UA', { weekday: 'short', day: 'numeric', month: 'short' });

let seq = 0;
const newBlock = (patch = {}) => ({ id: `b${Date.now()}${seq++}`, installationId: null, notes: '', workers: [], transport: null, driver: null, ...patch });
const tKey = (t) => (!t ? null : t.kind === 'vehicle' && t.id != null ? `v:${t.id}` : t.kind === 'own' && t.cid != null ? `o:${t.cid}` : null);
const tripKey = (t) => (t.vehicle_id ? `v:${t.vehicle_id}` : t.own_car_custom_id ? `o:${t.own_car_custom_id}` : null);
const isCustom = (b) => b.installationId === 'custom';
const meaningful = (b) => b.installationId || b.workers.length || (b.notes || '').trim();
const snapshot = (blocks) => JSON.stringify(blocks.filter(meaningful).map(b => ({
    i: b.installationId, n: (b.notes || '').trim(), w: [...b.workers].sort((x, y) => x - y), t: tKey(b.transport) || (b.transport?.kind || ''), d: b.driver ?? null,
})));

/**
 * Закріплений водій їде своїм авто — завжди, навіть коли возити нічого.
 * Є в бригаді людина, за якою закріплене авто (Автопарк → постійний
 * водій), — бригада їде цим авто, водій — вона. Пішла людина з бригади —
 * авто пішло з нею. Інші бригади можуть їхати тим самим авто — тоді водій
 * у них той самий.
 */
function normalizeTransport(list, vehicles) {
    // Авто в ремонті не закріплюємо — тоді вибирають вручну
    const active = (vehicles || []).filter(v => v.status !== 'inactive' && v.status !== 'repair' && v.default_driver_custom_id != null);
    const fixed = list.map(b => {
        const pin = active.find(v => b.workers.includes(Number(v.default_driver_custom_id)));
        if (pin) return { ...b, transport: { kind: 'vehicle', id: Number(pin.id) }, driver: Number(pin.default_driver_custom_id), pinned: true };
        if (b.pinned) return { ...b, transport: null, driver: null, pinned: false };
        return b;
    });
    const pinnedDriver = new Map(fixed.filter(b => b.pinned).map(b => [tKey(b.transport), b.driver]));
    return fixed.map(b => {
        if (b.pinned) return b;
        const d = pinnedDriver.get(tKey(b.transport));
        return d != null && b.driver !== d ? { ...b, driver: d } : b;
    });
}

/** Блоки дня з графіка й поїздок */
function buildBlocks(work, trips) {
    const map = new Map();
    (work || []).forEach(r => {
        const key = r.installation_custom_id ? `i${r.installation_custom_id}` : `c${(r.notes || '').trim()}`;
        if (!map.has(key)) {
            map.set(key, newBlock({
                installationId: r.installation_custom_id || 'custom',
                notes: r.notes || '',
                sourceVisitPlanId: r.visit_plan_id || null,
            }));
        }
        if (r.employee_custom_id != null) map.get(key).workers.push(Number(r.employee_custom_id));
    });
    const live = (trips || []).filter(t => t.status !== 'cancelled');
    return [...map.values()].map(b => {
        const trip = live.find(t => (t.stops || []).some(s => (isCustom(b)
            ? s.installation_custom_id == null && (s.place || '').trim() === (b.notes || '').trim()
            : Number(s.installation_custom_id) === Number(b.installationId))));
        if (!trip) return b;
        const transport = trip.vehicle_id ? { kind: 'vehicle', id: Number(trip.vehicle_id) }
            : trip.own_car_custom_id ? { kind: 'own', cid: Number(trip.own_car_custom_id) } : null;
        return { ...b, transport, driver: trip.driver_custom_id != null ? Number(trip.driver_custom_id) : null };
    });
}

/** Поїздки дня з транспорту блоків: одна поїздка на авто, зупинки — об'єкти бригад */
async function syncTrips(ds, blocks, trips, vehicles, createdBy) {
    const groups = new Map();
    blocks.forEach(b => {
        const k = tKey(b.transport);
        if (!k) return;
        if (!groups.has(k)) groups.set(k, { transport: b.transport, driver: null, blocks: [] });
        const g = groups.get(k);
        g.blocks.push(b);
        if (g.driver == null && b.driver != null) g.driver = b.driver;
    });
    const live = (trips || []).filter(t => t.status !== 'cancelled');

    for (const [k, g] of groups) {
        const crew = [...new Set(g.blocks.flatMap(b => b.workers))];
        const veh = g.transport.kind === 'vehicle' ? vehicles.find(v => Number(v.id) === Number(g.transport.id)) : null;
        const driver = g.driver ?? (veh?.default_driver_custom_id ?? null) ?? (g.transport.kind === 'own' ? g.transport.cid : null);
        const wanted = g.blocks.map(b => (isCustom(b)
            ? { place: (b.notes || '').trim() || 'Завдання', installation_custom_id: null }
            : { place: null, installation_custom_id: Number(b.installationId) }));
        let trip = live.find(t => tripKey(t) === k);
        if (trip) {
            const { error } = await supabase.from('trips')
                .update({ driver_custom_id: driver, crew, updated_at: new Date().toISOString() }).eq('id', trip.id);
            if (error) throw error;
        } else {
            const { data, error } = await supabase.from('trips').insert({
                trip_date: ds, status: 'planned', created_by: createdBy,
                vehicle_id: g.transport.kind === 'vehicle' ? g.transport.id : null,
                own_car_custom_id: g.transport.kind === 'own' ? g.transport.cid : null,
                driver_custom_id: driver, crew,
            }).select('id').single();
            if (error) throw error;
            trip = { id: data.id, stops: [] };
        }
        const stops = trip.stops || [];
        const same = (s, w) => (w.installation_custom_id != null
            ? Number(s.installation_custom_id) === w.installation_custom_id
            : s.installation_custom_id == null && (s.place || '').trim() === w.place);
        // Зупинки бригад, які більше не їдуть цим авто, прибираємо; доставки й склад лишаються
        const drop = stops.filter(s => s.purpose === 'install' && !wanted.some(w => same(s, w))).map(s => s.id);
        if (drop.length) {
            const { error } = await supabase.from('trip_stops').delete().in('id', drop);
            if (error) throw error;
        }
        let pos = stops.reduce((m, s) => Math.max(m, s.position || 0), 0);
        const add = wanted.filter(w => !stops.some(s => same(s, w)))
            .map(w => ({ ...w, trip_id: trip.id, position: ++pos, purpose: 'install' }));
        if (add.length) {
            const { error } = await supabase.from('trip_stops').insert(add);
            if (error) throw error;
        }
    }

    // Авто, яким цього дня вже ніхто не їде
    for (const t of live) {
        const k = tripKey(t);
        if (!k || groups.has(k)) continue;
        const installStops = (t.stops || []).filter(s => s.purpose === 'install').map(s => s.id);
        const rest = (t.stops || []).length - installStops.length;
        if (rest === 0) {
            const { error } = await supabase.from('trips').delete().eq('id', t.id);
            if (error) throw error;
        } else if (installStops.length) {
            const { error } = await supabase.from('trip_stops').delete().in('id', installStops);
            if (error) throw error;
        }
    }
}

/* ---------------------------------------------------------------------
 *  Блок: об'єкт (або інше завдання), люди, транспорт
 * ------------------------------------------------------------------- */
function Block({ b, idx, ctx, readOnly, active, error, onFocus, onChange, onRemove }) {
    const { objectOptions, objByCid, peopleFor, nameOf, vehicles, cars, sharedWith, people } = ctx;
    const [pickObj, setPickObj] = useState(!b.installationId);
    const obj = !isCustom(b) && b.installationId ? objByCid.get(Number(b.installationId)) : null;
    const set = (patch) => onChange({ ...b, ...patch });
    const key = tKey(b.transport);
    const shared = key ? sharedWith(key, b.id) : [];
    const owners = cars.filter(c => c.status === 'own');
    const ownInCrew = owners.filter(c => b.workers.includes(Number(c.cid)));

    const vehicleOptions = vehicles
        .filter(v => v.status !== 'inactive' || (b.transport?.kind === 'vehicle' && Number(b.transport.id) === Number(v.id)))
        .map(v => {
            const others = sharedWith(`v:${v.id}`, b.id);
            return {
                id: v.id,
                label: [v.name, v.plate, v.status === 'repair' ? 'у ремонті' : null, others.length ? `вже везе: ${others.join(', ')}` : null].filter(Boolean).join(' · '),
            };
        });
    const ownerOptions = owners
        .slice().sort((x, y) => Number(b.workers.includes(Number(y.cid))) - Number(b.workers.includes(Number(x.cid))))
        .map(c => ({ id: Number(c.cid), label: `${nameOf(c.cid)}${b.workers.includes(Number(c.cid)) ? ' · у цій бригаді' : ''}` }));
    // Водій — хтось із цієї бригади (або той, хто вже везе інші бригади цим авто)
    const driverOptions = people
        .filter(p => b.workers.includes(p.id) || p.id === b.driver)
        .map(p => ({ id: p.id, label: p.label }));
    const pinnedVehicle = b.pinned && b.transport?.kind === 'vehicle' ? vehicles.find(v => Number(v.id) === Number(b.transport.id)) : null;

    const chooseVehicle = (id) => {
        const v = vehicles.find(x => Number(x.id) === Number(id));
        const sharedDriver = ctx.driverOf(`v:${id}`, b.id);
        const def = v?.default_driver_custom_id != null ? Number(v.default_driver_custom_id) : null;
        const driver = sharedDriver ?? (def != null && b.workers.includes(def) ? def : null)
            ?? (b.driver != null && b.workers.includes(b.driver) ? b.driver : null) ?? (b.workers.length === 1 ? b.workers[0] : null);
        set({ transport: { kind: 'vehicle', id: Number(id) }, driver });
    };
    const chooseOwner = (cid) => set({ transport: { kind: 'own', cid: Number(cid) }, driver: Number(cid) });
    const mode = b.transport?.kind || '';

    if (readOnly) {
        const veh = b.transport?.kind === 'vehicle' ? vehicles.find(v => Number(v.id) === Number(b.transport.id)) : null;
        return (
            <section className={`${T.card} p-3.5 space-y-1.5`}>
                <div className="text-[14.5px] font-bold text-slate-900 break-words">
                    {isCustom(b) ? (b.notes || 'Завдання') : <><span className="font-mono text-[11.5px] text-slate-400 mr-1.5">СЕС-{b.installationId}</span>{obj?.name || `Об'єкт #${b.installationId}`}</>}
                </div>
                {!isCustom(b) && b.notes && <div className="text-[13px] text-slate-600 break-words">{b.notes}</div>}
                <div className="text-[13px] text-slate-700 break-words">{b.workers.map(nameOf).join(', ') || 'без людей'}</div>
                {b.transport && (
                    <div className="text-[12.5px] text-indigo-700 font-semibold inline-flex items-start gap-1.5 break-words">
                        {b.transport.kind === 'own' ? <FaCar size={11} className="mt-0.5" /> : <FaShuttleVan size={11} className="mt-0.5" />}
                        {b.transport.kind === 'vehicle' ? (veh?.name || 'авто') : b.transport.kind === 'own' ? `власне авто: ${nameOf(b.transport.cid)}` : 'без авто'}
                        {b.driver != null && b.transport.kind !== 'none' && ` · водій ${nameOf(b.driver)}`}
                    </div>
                )}
            </section>
        );
    }

    return (
        <section onFocusCapture={onFocus} onClick={onFocus}
            className={`${T.card} p-3 sm:p-3.5 space-y-2.5 ${active ? 'ring-2 ring-indigo-200 border-indigo-300' : ''} ${error ? 'border-rose-300' : ''}`}>
            {/* Що: об'єкт або інше завдання */}
            <div className="flex items-start gap-2">
                <span className="mt-1.5 w-6 h-6 rounded-md bg-slate-100 text-slate-500 text-[11.5px] font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                <div className="min-w-0 flex-1">
                    {isCustom(b) ? (
                        <div className="flex items-center gap-2">
                            <FaTasks size={12} className="text-amber-500 flex-shrink-0" />
                            <input className={T.input} value={b.notes} autoFocus={!b.notes} onChange={e => set({ notes: e.target.value })} placeholder="Назва завдання: прибирання складу, приймання товару…" />
                        </div>
                    ) : pickObj || !b.installationId ? (
                        <Picker options={objectOptions} value={b.installationId ?? ''} autoOpen={!b.installationId && idx > 0}
                            onChange={v => { if (v === 'custom') set({ installationId: 'custom' }); else set({ installationId: Number(v) }); setPickObj(false); }}
                            onCancel={() => setPickObj(false)}
                            placeholder="Оберіть об'єкт…" searchPlaceholder="Номер, назва, місто…" icon={FaHardHat} />
                    ) : (
                        <button type="button" onClick={() => setPickObj(true)} className="text-left w-full group">
                            <div className="text-[14.5px] font-bold text-slate-900 leading-snug break-words">
                                <span className="font-mono text-[11.5px] text-slate-400 mr-1.5">СЕС-{b.installationId}</span>{obj?.name || `Об'єкт #${b.installationId}`}
                                <FaPen size={9} className="inline ml-2 text-slate-300 group-hover:text-indigo-500" />
                            </div>
                            {obj?.client?.populated_place && <div className="text-[12.5px] text-slate-500">{obj.client.populated_place}</div>}
                        </button>
                    )}
                    {!isCustom(b) && b.installationId && (
                        <input className={`${T.input} mt-2`} value={b.notes} onChange={e => set({ notes: e.target.value })} placeholder="Що робимо (необов'язково)" />
                    )}
                </div>
                <IconBtn icon={FaTrash} label="Прибрати з графіка" className="hover:!text-rose-600" onClick={onRemove} />
            </div>

            {/* Хто */}
            <div className="pl-8 space-y-1.5">
                {b.workers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {b.workers.map(cid => (
                            <span key={cid} className="h-8 pl-2.5 pr-1 rounded-lg bg-indigo-50 border border-indigo-100 text-[12.5px] font-semibold text-indigo-800 inline-flex items-center gap-1.5">
                                {nameOf(cid)}
                                {cars.some(c => Number(c.cid) === cid && c.status === 'own') && <FaCar size={10} className="text-emerald-600" title="своє авто" />}
                                <button type="button" aria-label={`Прибрати: ${nameOf(cid)}`} onClick={() => set({ workers: b.workers.filter(w => w !== cid), ...(b.driver === cid ? { driver: null } : {}) })}
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-indigo-300 hover:text-rose-600 hover:bg-white"><FaTimes size={9} /></button>
                            </span>
                        ))}
                    </div>
                )}
                <Picker options={peopleFor()} value="" onChange={v => set({ workers: [...b.workers, Number(v)] })} keepOpen
                    placeholder={b.workers.length ? 'Додати ще людину…' : 'Хто їде…'} searchPlaceholder="Ім'я…" icon={FaUserTie} />
            </div>

            {/* Чим їдуть */}
            {pinnedVehicle ? (
                <div className="pl-8">
                    <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-[13px] text-indigo-900 flex items-start gap-2">
                        <FaShuttleVan size={12} className="mt-0.5 flex-shrink-0 text-indigo-500" />
                        <span className="min-w-0 break-words">
                            <b>{[pinnedVehicle.name, pinnedVehicle.plate].filter(Boolean).join(' · ')}</b> · водій {nameOf(b.driver)}
                            <span className="text-indigo-600/80"> — закріплене авто</span>
                            {shared.length > 0 && <span className="block text-[12.5px] text-indigo-700">Цим авто також: {shared.join(', ')}</span>}
                        </span>
                    </div>
                    {ctx.transportWarn(b) && (
                        <div className="mt-1 text-[12.5px] text-amber-700 font-semibold inline-flex items-start gap-1.5">
                            <FaExclamationTriangle size={11} className="mt-0.5 flex-shrink-0" /> {ctx.transportWarn(b)}
                        </div>
                    )}
                </div>
            ) : (
            <div className="pl-8 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented value={mode} onChange={(m) => {
                        if (m === mode) set({ transport: null, driver: null });           // повторний натиск — зняти вибір
                        else if (m === 'none') set({ transport: { kind: 'none' }, driver: null });
                        else if (m === 'own' && ownInCrew.length === 1) chooseOwner(ownInCrew[0].cid);
                        else set({ transport: { kind: m }, driver: null });
                    }} options={[
                        { value: 'vehicle', label: 'Авто компанії' },
                        { value: 'own', label: 'Власне авто' },
                        { value: 'none', label: 'Без авто' },
                    ]} />
                    {!b.transport && ownInCrew.length > 0 && (
                        <button type="button" onClick={() => chooseOwner(ownInCrew[0].cid)}
                            className="h-8 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[12px] font-semibold text-emerald-800 inline-flex items-center gap-1.5">
                            <FaCar size={10} /> Своє авто: {nameOf(ownInCrew[0].cid)}
                        </button>
                    )}
                </div>
                {mode === 'vehicle' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Picker options={vehicleOptions} value={b.transport.id ?? ''} onChange={chooseVehicle}
                            placeholder={vehicles.length ? 'Яке авто…' : 'Спершу додайте авто в «Автопарк»'} searchPlaceholder="Назва або номер…" icon={FaShuttleVan} />
                        <Picker options={driverOptions} value={b.driver ?? ''} onChange={v => set({ driver: Number(v) })}
                            placeholder={b.workers.length ? 'Хто за кермом…' : 'Спершу додайте людей'} searchPlaceholder="Ім'я…" icon={FaUserTie} disabled={!driverOptions.length} />
                    </div>
                )}
                {mode === 'own' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Picker options={ownerOptions} value={b.transport.cid ?? ''} onChange={chooseOwner}
                            placeholder={owners.length ? 'Чиє авто…' : 'Ніхто ще не відмітив своє авто'} searchPlaceholder="Ім'я…" icon={FaCar} />
                        <Picker options={driverOptions} value={b.driver ?? ''} onChange={v => set({ driver: Number(v) })}
                            placeholder={b.workers.length ? 'Хто за кермом…' : 'Спершу додайте людей'} searchPlaceholder="Ім'я…" icon={FaUserTie} disabled={!driverOptions.length} />
                    </div>
                )}
                {shared.length > 0 && (
                    <div className="text-[12.5px] text-indigo-700 font-semibold inline-flex items-start gap-1.5">
                        <FaRoute size={11} className="mt-0.5 flex-shrink-0" /> <span className="break-words">Цим авто також: {shared.join(', ')}</span>
                    </div>
                )}
                {ctx.transportWarn(b) && (
                    <div className="text-[12.5px] text-amber-700 font-semibold inline-flex items-start gap-1.5">
                        <FaExclamationTriangle size={11} className="mt-0.5 flex-shrink-0" /> {ctx.transportWarn(b)}
                    </div>
                )}
            </div>
            )}
            {error && <div className="pl-8 text-[12.5px] font-semibold text-rose-600">{error}</div>}
        </section>
    );
}

/* ---------------------------------------------------------------------
 *  День
 * ------------------------------------------------------------------- */
export default function DayPlanner({ date, me, canManage, canEditPast, onSaved }) {
    const toast = useToast();
    const today = isoDay();
    const readOnly = !canManage || (date < today && !canEditPast);

    const [base, setBase] = useState(null);       // люди, об'єкти, авто, власні авто
    const [day, setDay] = useState(null);         // збережене: блоки, поїздки, відсутні, виїзди, публікація
    const [blocks, setBlocksRaw] = useState([]);
    // Кожна зміна бригад одразу перевіряє закріплені авто (normalizeTransport)
    const vehiclesRef = useRef([]);
    const setBlocks = useCallback((v) => setBlocksRaw(prev =>
        normalizeTransport(typeof v === 'function' ? v(prev) : v, vehiclesRef.current)), []);
    const [saved, setSaved] = useState('[]');
    const [draft, setDraft] = useState(null);     // чернетка в базі
    const [draftNotice, setDraftNotice] = useState(false);
    const [remote, setRemote] = useState(false);  // хтось змінив день, поки ми редагуємо
    const [active, setActive] = useState(null);
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [autoSave, setAutoSave] = useState(null);
    const [absent, setAbsent] = useState({ status: 'OFF', until: '' });
    const reqRef = useRef(0);
    const dirtyRef = useRef(false);

    const dirty = snapshot(blocks) !== saved;
    dirtyRef.current = dirty;

    /* ---- Завантаження ---- */
    const loadBase = useCallback(async () => {
        const [e, o, v, c] = await Promise.all([
            supabase.from('employees').select('id, custom_id, name, position, department, role, tier, email, hidden_from_list, access_blocked_at').order('name'),
            supabase.from('installations').select('custom_id, name, status, client:clients(name, populated_place)').order('custom_id', { ascending: false }),
            supabase.from('vehicles').select('*').order('name'),
            supabase.from('employee_cars').select('employee_id, status, until'),
        ]);
        const emps = e.data || [];
        const byId = new Map(emps.map(x => [x.id, x]));
        vehiclesRef.current = v.data || [];
        setBlocks(list => list);   // авто відомі — перевірити закріплених водіїв
        setBase({
            employees: emps,
            objects: o.data || [],
            vehicles: v.data || [],
            cars: (c.data || []).map(x => ({ ...x, cid: byId.get(x.employee_id)?.custom_id })).filter(x => x.cid != null),
        });
    }, [setBlocks]);

    const loadDay = useCallback(async (keepLocal = false) => {
        const req = ++reqRef.current;
        const [w, t, a, d, vp, p] = await Promise.all([
            supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, notes, visit_plan_id').eq('work_date', date),
            supabase.from('trips').select('*, stops:trip_stops(*)').eq('trip_date', date),
            supabase.from('attendance').select('employee_custom_id, status').eq('work_date', date).in('status', Object.keys(ABSENCE)),
            supabase.from('schedule_day_drafts').select('payload, updated_at, updated_by_email').eq('work_date', date).maybeSingle(),
            supabase.from('installation_visit_plan').select('id, installation_custom_id, custom_task_title, comment, assignees:installation_visit_plan_employees(employee_id)')
                .eq('planned_date', date).eq('status', 'planned'),
            supabase.from('schedule_publications').select('*').eq('work_date', date).maybeSingle(),
        ]);
        if (req !== reqRef.current) return;
        if (w.error) { toast(humanError(w.error), 'error'); return; }
        const built = buildBlocks(w.data, t.data);
        setDay({ trips: t.data || [], off: a.data || [], visits: vp.data || [], pub: p.data || null });
        setSaved(snapshot(built));
        setDraft(d.data || null);
        if (!keepLocal) {
            setBlocks(built.length ? built : (readOnly ? [] : [newBlock()]));
            setErrors({});
            setRemote(false);
            // Чернетка, що відрізняється від збереженого, — пропонуємо відкрити
            setDraftNotice(!!(d.data && snapshot(d.data.payload || []) !== snapshot(built)));
        }
    }, [date, toast, readOnly, setBlocks]);

    useEffect(() => { loadBase(); }, [loadBase]);
    useEffect(() => { setDay(null); setActive(null); setAutoSave(null); loadDay(); }, [loadDay]);

    // Наживо: зміни інших людей по цьому дню
    useEffect(() => {
        let timer = null;
        const bump = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { if (dirtyRef.current) setRemote(true); else loadDay(); }, 500);
        };
        const ch = supabase.channel(`day-planner-${date}`);
        ['installation_workers', 'attendance', 'trips', 'trip_stops', 'schedule_publications'].forEach(table =>
            ch.on('postgres_changes', { event: '*', schema: 'public', table }, bump));
        ch.on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_day_drafts' }, () =>
            supabase.from('schedule_day_drafts').select('payload, updated_at, updated_by_email').eq('work_date', date).maybeSingle()
                .then(({ data }) => setDraft(data || null)));
        ch.subscribe();
        return () => { clearTimeout(timer); supabase.removeChannel(ch); };
    }, [date, loadDay]);

    // Чернетка зберігається сама — інші менеджери бачать, як складається день
    const lastDraft = useRef('');
    useEffect(() => {
        if (readOnly || !dirty) return undefined;
        const json = snapshot(blocks);
        if (json === lastDraft.current) return undefined;
        const t = setTimeout(async () => {
            lastDraft.current = json;
            setAutoSave('saving');
            const { error } = await supabase.from('schedule_day_drafts').upsert({
                work_date: date, payload: blocks.filter(meaningful), updated_by_email: me?.email || null, updated_at: new Date().toISOString(),
            }, { onConflict: 'work_date' });
            setAutoSave(error ? 'error' : 'saved');
        }, 900);
        return () => clearTimeout(t);
    }, [blocks, dirty, readOnly, date, me?.email]);

    /* ---- Похідне ---- */
    const ctx = useMemo(() => {
        if (!base || !day) return null;
        const empByCid = new Map(base.employees.map(e => [Number(e.custom_id), e]));
        const nameOf = (cid) => empByCid.get(Number(cid))?.name || `#${cid}`;
        const offMap = new Map(day.off.map(a => [Number(a.employee_custom_id), a.status]));
        const busyIn = new Map();
        blocks.forEach(b => b.workers.forEach(w => busyIn.set(w, b)));
        const objByCid = new Map(base.objects.map(o => [o.custom_id, o]));
        const used = new Set(blocks.filter(b => !isCustom(b) && b.installationId).map(b => Number(b.installationId)));
        const staff = base.employees.filter(e => !e.access_blocked_at && !e.hidden_from_list);
        const isInstall = (e) => e.role === 'installer' || (Array.isArray(e.department) ? e.department : [e.department]).some(d => INSTALL_DEPS.includes(d));
        const blockTitle = (b) => (isCustom(b) ? (b.notes || 'завдання') : objByCid.get(Number(b.installationId))?.name || `СЕС-${b.installationId}`);
        const carOf = (cid) => base.cars.find(c => Number(c.cid) === Number(cid));

        return {
            nameOf, objByCid, offMap, busyIn, blockTitle, carOf, isInstall,
            vehicles: base.vehicles,
            cars: base.cars,
            people: staff.map(e => ({ id: Number(e.custom_id), label: e.name })),
            installPeople: staff.filter(isInstall),
            objectOptions: [
                { id: 'custom', label: 'Інше завдання (без обʼєкта)' },
                ...base.objects
                    .filter(o => !CLOSED.includes(o.status) && !used.has(o.custom_id))
                    .map(o => ({ id: o.custom_id, label: [`СЕС-${o.custom_id}`, o.name || o.client?.name, o.client?.populated_place].filter(Boolean).join(' · ') })),
            ],
            // Кого можна додати в бригаду: не відсутні й не зайняті в іншому місці; вільні монтажники — зверху
            peopleFor: () => staff
                .filter(e => !offMap.has(Number(e.custom_id)) && !busyIn.has(Number(e.custom_id)))
                .sort((x, y) => Number(isInstall(y)) - Number(isInstall(x)) || Number(y.tier === 1) - Number(x.tier === 1) || x.name.localeCompare(y.name, 'uk'))
                .map(e => ({
                    id: Number(e.custom_id),
                    label: [e.name, Number(e.tier) === 1 && e.role === 'installer' ? 'бригадир' : null,
                        carOf(e.custom_id)?.status === 'own' ? 'своє авто' : null].filter(Boolean).join(' · '),
                })),
            sharedWith: (key, blockId) => blocks.filter(b => b.id !== blockId && tKey(b.transport) === key).map(blockTitle),
            driverOf: (key, blockId) => blocks.find(b => b.id !== blockId && tKey(b.transport) === key && b.driver != null)?.driver ?? null,
            transportWarn: (b) => {
                if (b.transport?.kind === 'vehicle') {
                    const v = base.vehicles.find(x => Number(x.id) === Number(b.transport.id));
                    if (v?.status === 'repair') return `Авто в ремонті${v.repair_until ? ` до ${parseDay(v.repair_until).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}` : ''}`;
                }
                if (b.transport?.kind === 'own') {
                    const c = carOf(b.transport.cid);
                    if (c?.status === 'repair') return `Авто ${nameOf(b.transport.cid)} у ремонті`;
                }
                if (b.driver != null && offMap.has(Number(b.driver))) return `Водій ${nameOf(b.driver)}: ${ABSENCE[offMap.get(Number(b.driver))]}`;
                return null;
            },
        };
    }, [base, day, blocks]);

    /* ---- Дії з блоками ---- */
    const changeBlock = (nb) => {
        setBlocks(list => {
            const next = list.map(b => (b.id === nb.id ? nb : b));
            // Одне авто — один водій для всіх, кого воно везе
            const k = tKey(nb.transport);
            return k ? next.map(b => (b.id !== nb.id && tKey(b.transport) === k ? { ...b, driver: nb.driver } : b)) : next;
        });
        if (errors[nb.id]) setErrors(e => ({ ...e, [nb.id]: null }));
    };
    const addBlock = (patch) => {
        const nb = newBlock(patch);
        setBlocks(list => [...list.filter(meaningful), nb]);
        setActive(nb.id);
    };
    const removeBlock = (id) => setBlocks(list => list.filter(b => b.id !== id));

    const addPersonToActive = (cid) => {
        const target = blocks.find(b => b.id === active) || blocks[blocks.length - 1];
        if (!target) { addBlock({ workers: [cid] }); return; }
        changeBlock({ ...target, workers: [...target.workers.filter(w => w !== cid), cid] });
    };

    const copyPrevious = async () => {
        for (let i = 1; i <= 7; i++) {
            const ds = shiftDay(date, -i);
            const [{ data: w }, { data: t }] = await Promise.all([
                supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, notes, visit_plan_id').eq('work_date', ds),
                supabase.from('trips').select('*, stops:trip_stops(*)').eq('trip_date', ds),
            ]);
            if (w && w.length) {
                const prev = buildBlocks(w, t).map(b => ({ ...b, id: newBlock().id, sourceVisitPlanId: null, workers: b.workers.filter(x => !ctx.offMap.has(x)) }));
                setBlocks(list => {
                    const keep = list.filter(meaningful);
                    const have = new Set(keep.filter(b => !isCustom(b)).map(b => String(b.installationId)));
                    return [...keep, ...prev.filter(b => isCustom(b) || !have.has(String(b.installationId)))];
                });
                toast(`Взято за основу ${dayWord(ds)} — внесіть правки`);
                return;
            }
        }
        toast('За попередній тиждень графіка не знайдено', 'info');
    };

    const addVisit = (v) => {
        const empById = new Map(base.employees.map(e => [e.id, e]));
        const workers = (v.assignees || []).map(a => Number(empById.get(a.employee_id)?.custom_id)).filter(cid => cid && !ctx.offMap.has(cid) && !ctx.busyIn.has(cid));
        addBlock(v.installation_custom_id
            ? { installationId: v.installation_custom_id, notes: v.comment || '', workers, sourceVisitPlanId: v.id }
            : { installationId: 'custom', notes: v.custom_task_title || 'Виїзд за планом', workers, sourceVisitPlanId: v.id });
    };

    // Відсутність — на цей день або на кілька днів поспіль («до» включно, не більше 60 днів)
    const setAbsence = async (cid, status, until = '') => {
        let error;
        if (status) {
            const days = [date];
            for (let d = shiftDay(date, 1); until && d <= until && days.length < 60; d = shiftDay(d, 1)) days.push(d);
            ({ error } = await supabase.from('attendance').upsert(
                days.map(d => ({ employee_custom_id: cid, work_date: d, status })), { onConflict: 'employee_custom_id, work_date' }));
            if (!error) {
                setBlocks(list => list.map(b => ({ ...b, workers: b.workers.filter(w => w !== cid), driver: b.driver === cid ? null : b.driver })));
                toast(`${ctx.nameOf(cid)}: ${ABSENCE[status]}${days.length > 1 ? `, ${days.length} дн. (до ${parseDay(days[days.length - 1]).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })})` : ''}`);
            }
        } else {
            ({ error } = await supabase.from('attendance').delete().eq('employee_custom_id', cid).eq('work_date', date));
            if (!error) toast(`${ctx.nameOf(cid)} знову в роботі`);
        }
        if (error) { toast(humanError(error), 'error'); return; }
        setDay(d => ({ ...d, off: status ? [...d.off.filter(a => Number(a.employee_custom_id) !== cid), { employee_custom_id: cid, status }] : d.off.filter(a => Number(a.employee_custom_id) !== cid) }));
    };

    /* ---- Збереження і надсилання ---- */
    const validate = () => {
        const errs = {};
        blocks.filter(meaningful).forEach(b => {
            if (!b.installationId) errs[b.id] = "Оберіть об'єкт або «Інше завдання»";
            else if (isCustom(b) && !(b.notes || '').trim()) errs[b.id] = 'Напишіть, що за завдання';
            else if (!b.workers.length) errs[b.id] = 'Додайте людей';
            else if (b.transport?.kind === 'vehicle' && !b.transport.id) errs[b.id] = 'Оберіть авто або приберіть «Авто компанії»';
            else if (b.transport?.kind === 'own' && !b.transport.cid) errs[b.id] = 'Оберіть, чиє авто';
        });
        setErrors(errs);
        return !Object.keys(errs).length;
    };

    const save = async (publish) => {
        if (!validate()) { toast('Перевірте позначене червоним', 'error'); return; }
        setBusy(true);
        try {
            const list = blocks.filter(meaningful);
            const records = list.flatMap(b => b.workers.map(cid => ({
                installation_custom_id: isCustom(b) ? null : Number(b.installationId),
                employee_custom_id: cid,
                notes: (b.notes || '').trim(),
                work_hours: 8,
                visit_plan_id: b.sourceVisitPlanId || null,
            })));
            const { error } = await supabase.rpc('save_day_schedule', { p_work_date: date, p_records: records });
            if (error) throw error;
            await syncTrips(date, list, day.trips, base.vehicles, me?.id || null);
            const now = new Date().toISOString();
            const pub = { work_date: date, saved_at: now, saved_by: me?.id || null };
            if (publish) Object.assign(pub, { published_at: now, published_by: me?.id || null, publish_count: (day.pub?.publish_count || 0) + 1, sent_at: null });
            const { error: e2 } = await supabase.from('schedule_publications').upsert(pub, { onConflict: 'work_date' });
            if (e2) throw e2;
            await supabase.from('schedule_day_drafts').delete().eq('work_date', date);
            lastDraft.current = '';
            setDraft(null);
            setAutoSave(null);
            await loadDay();
            onSaved?.();
            toast(publish ? 'Графік надіслано: люди отримали сповіщення, бот публікує в гілці графіка' : 'Графік збережено', 'success');
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    const openDraft = () => { setBlocks((draft?.payload || []).map(b => ({ ...newBlock(), ...b }))); setDraftNotice(false); };
    const dropDraft = async () => {
        await supabase.from('schedule_day_drafts').delete().eq('work_date', date);
        setDraft(null); setDraftNotice(false);
    };

    /* ---- Відображення ---- */
    if (!ctx) return <div className={T.card}><Skeleton rows={6} /></div>;

    const pub = day.pub;
    const sentState = !pub?.published_at ? 'none'
        : (dirty || (pub.saved_at && new Date(pub.saved_at) > new Date(pub.published_at))) ? 'changed' : 'sent';
    const list = blocks;
    const peopleCount = new Set(blocks.flatMap(b => b.workers)).size;
    const visitsLeft = day.visits.filter(v => !blocks.some(b => (v.installation_custom_id ? Number(b.installationId) === v.installation_custom_id : isCustom(b) && b.notes === v.custom_task_title)));
    const free = ctx.installPeople.filter(e => !ctx.offMap.has(Number(e.custom_id)) && !ctx.busyIn.has(Number(e.custom_id)));
    const off = base.employees.filter(e => ctx.offMap.has(Number(e.custom_id)));
    // Кого можна відмітити: ще не відсутні; хто вже в графіку — з позначкою (з бригади приберемо)
    const absenceOptions = ctx.people
        .filter(p => !ctx.offMap.has(p.id))
        .map(p => { const inB = ctx.busyIn.get(p.id); return { id: p.id, label: inB ? `${p.label} · у графіку: ${ctx.blockTitle(inB)}` : p.label }; });
    const draftByOther = draft && draft.updated_by_email && draft.updated_by_email !== me?.email;

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-3 items-start">
            {/* ГРАФІК ДНЯ */}
            <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={sentState === 'sent' ? 'ok' : sentState === 'changed' ? 'warn' : 'neutral'}>
                        {sentState === 'sent' ? `Надіслано ${timeOf(pub.published_at)}${pub.sent_at ? ' · у Telegram' : ''}`
                            : sentState === 'changed' ? 'Змінено після надсилання' : 'Ще не надіслано'}
                    </Chip>
                    <span className="text-[12.5px] text-slate-500">{list.filter(meaningful).length} завд. · {peopleCount} люд.</span>
                    {!readOnly && (
                        <span className="text-[12px] text-slate-400">
                            {autoSave === 'saving' ? 'чернетка зберігається…' : autoSave === 'saved' ? 'чернетку збережено' : autoSave === 'error' ? 'чернетку не збережено' : ''}
                        </span>
                    )}
                    {!readOnly && <Btn size="sm" variant="soft" icon={FaHistory} className="ml-auto" onClick={copyPrevious}>Взяти попередній день</Btn>}
                </div>

                {remote && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center gap-2 text-[13px] text-amber-900">
                        <FaExclamationTriangle size={12} /> <span className="flex-1 min-w-0">Цей день щойно змінив хтось інший.</span>
                        <Btn size="sm" variant="outline" onClick={() => loadDay()}>Показати їхнє</Btn>
                        <Btn size="sm" variant="ghost" onClick={() => setRemote(false)}>Лишити моє</Btn>
                    </div>
                )}
                {!readOnly && draftNotice && draft && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 flex flex-wrap items-center gap-2 text-[13px] text-amber-900">
                        <FaSave size={12} />
                        <span className="flex-1 min-w-0">Є незбережена чернетка{draft.updated_by_email ? ` (${ctx.nameOf(base.employees.find(e => e.email === draft.updated_by_email)?.custom_id) || draft.updated_by_email})` : ''}, {timeOf(draft.updated_at)}</span>
                        <Btn size="sm" variant="outline" onClick={openDraft}>Відкрити</Btn>
                        <Btn size="sm" variant="ghost" onClick={dropDraft}>Відхилити</Btn>
                    </div>
                )}
                {!readOnly && !draftNotice && draftByOther && dirty === false && (
                    <div className="text-[12.5px] text-slate-500">
                        {base.employees.find(e => e.email === draft.updated_by_email)?.name || draft.updated_by_email} зараз складає цей день ({timeOf(draft.updated_at)}) · <button type="button" className="font-semibold text-indigo-600 hover:underline" onClick={openDraft}>подивитись</button>
                    </div>
                )}

                {!readOnly && visitsLeft.length > 0 && (
                    <div className={`${T.card} px-3.5 py-2.5 flex flex-wrap items-center gap-1.5`}>
                        <span className="text-[12.5px] font-semibold text-slate-500 mr-1 inline-flex items-center gap-1.5"><FaRoute size={11} /> Заплановано раніше:</span>
                        {visitsLeft.map(v => (
                            <button key={v.id} type="button" onClick={() => addVisit(v)}
                                className="h-8 px-2.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[12px] font-semibold text-emerald-800 inline-flex items-center gap-1.5">
                                <FaPlus size={9} /> {v.installation_custom_id ? (ctx.objByCid.get(v.installation_custom_id)?.name || `СЕС-${v.installation_custom_id}`) : (v.custom_task_title || 'Виїзд')}
                            </button>
                        ))}
                    </div>
                )}

                {list.length === 0 && readOnly && (
                    <div className={`${T.card} px-4 py-8 text-center text-[14px] text-slate-500`}>На цей день графіка немає</div>
                )}
                {list.map((b, i) => (
                    <Block key={b.id} b={b} idx={i} ctx={ctx} readOnly={readOnly} active={active === b.id} error={errors[b.id]}
                        onFocus={() => setActive(b.id)} onChange={changeBlock} onRemove={() => removeBlock(b.id)} />
                ))}

                {!readOnly && (
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => addBlock()}
                            className="h-12 rounded-xl border border-dashed border-slate-300 bg-white text-[13.5px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 inline-flex items-center justify-center gap-2">
                            <FaHardHat size={11} /> + Об'єкт
                        </button>
                        <button type="button" onClick={() => addBlock({ installationId: 'custom' })}
                            className="h-12 rounded-xl border border-dashed border-slate-300 bg-white text-[13.5px] font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-700 inline-flex items-center justify-center gap-2">
                            <FaTasks size={11} /> + Інше завдання
                        </button>
                    </div>
                )}

                {/* Зберегти / надіслати — завжди під рукою */}
                {!readOnly && (
                    <div className="sticky bottom-0 z-20 -mx-1 px-1 pt-2 pb-2 bg-gradient-to-t from-slate-100 via-slate-100/95 to-transparent">
                        <div className={`${T.card} p-2 flex flex-wrap items-center gap-2 shadow-lg`}>
                            <span className="text-[12.5px] text-slate-500 px-1.5 flex-1 min-w-[140px]">
                                {dirty ? 'Є незбережені зміни' : sentState === 'sent' ? 'Усе збережено й надіслано' : 'Усе збережено'}
                            </span>
                            <Btn variant="outline" icon={FaCheck} onClick={() => save(false)} disabled={busy || !dirty}>Зберегти</Btn>
                            <Btn variant="accent" icon={FaPaperPlane} onClick={() => save(true)} disabled={busy || (!dirty && sentState === 'sent') || !list.some(meaningful)}>
                                {busy ? 'Зберігаємо…' : sentState === 'none' ? 'Зберегти й надіслати' : 'Надіслати оновлення'}
                            </Btn>
                        </div>
                    </div>
                )}
            </div>

            {/* ЛЮДИ ДНЯ */}
            <aside className="space-y-3">
                <div className={`${T.card} overflow-hidden`}>
                    <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-[14px] font-bold text-slate-900">Вільні монтажники</h3>
                        <span className="text-[12px] text-slate-400 tabular-nums">{free.length}</span>
                    </div>
                    {free.length === 0 ? <div className="px-3.5 py-3 text-[13px] text-slate-400">Усі розподілені</div> : (
                        <div className="p-2.5 flex flex-wrap gap-1.5">
                            {free.map(e => (
                                <button key={e.id} type="button" disabled={readOnly} onClick={() => addPersonToActive(Number(e.custom_id))}
                                    title={readOnly ? undefined : 'Додати в обраний об\'єкт'}
                                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 inline-flex items-center gap-1.5 disabled:hover:border-slate-200 disabled:hover:text-slate-700">
                                    {!readOnly && <FaPlus size={8} className="text-slate-400" />}
                                    {e.name}
                                    {ctx.carOf(e.custom_id)?.status === 'own' && <FaCar size={10} className="text-emerald-600" />}
                                </button>
                            ))}
                        </div>
                    )}
                    {!readOnly && active && free.length > 0 && (
                        <div className="px-3.5 pb-2.5 text-[12px] text-slate-500">Натиск додає в: <b className="text-slate-700">{ctx.blockTitle(blocks.find(b => b.id === active) || {})}</b></div>
                    )}
                </div>

                {/* Відсутні: спершу що (вихідний / відпустка / лікарняний), потім кого — і одразу збережено */}
                <div className={`${T.card} overflow-hidden`}>
                    <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-[14px] font-bold text-slate-900 inline-flex items-center gap-2"><FaUserSlash size={11} className="text-rose-500" /> Відсутні</h3>
                        <span className="text-[12px] text-slate-400 tabular-nums">{off.length}</span>
                    </div>
                    {!readOnly && (
                        <div className="p-3 space-y-2.5 border-b border-slate-100 bg-slate-50/60">
                            <div className="grid grid-cols-3 gap-1.5">
                                {Object.entries(ABSENCE).map(([k, l]) => (
                                    <button key={k} type="button" onClick={() => setAbsent(a => ({ ...a, status: k }))}
                                        className={`h-9 rounded-lg border text-[12.5px] font-semibold first-letter:uppercase transition-colors
                                            ${absent.status === k ? 'bg-rose-600 border-rose-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-rose-300'}`}>
                                        {l}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                                <button type="button" onClick={() => setAbsent(a => ({ ...a, until: '' }))}
                                    className={`h-9 px-3 rounded-lg border font-semibold ${!absent.until ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                                    Лише {dayWord(date)}
                                </button>
                                <label className={`h-9 pl-3 pr-1 rounded-lg border inline-flex items-center gap-1.5 font-semibold ${absent.until ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>
                                    до
                                    <input type="date" min={shiftDay(date, 1)} value={absent.until} aria-label="Останній день відсутності"
                                        onChange={e => setAbsent(a => ({ ...a, until: e.target.value }))}
                                        className="h-7 px-1.5 rounded-md bg-white text-slate-800 text-[12.5px] border-0 outline-none" />
                                </label>
                            </div>
                            <Picker options={absenceOptions} value="" onChange={v => setAbsence(Number(v), absent.status, absent.until)}
                                placeholder={`Кому ${ABSENCE_WHAT[absent.status]}…`} searchPlaceholder="Ім'я…" icon={FaUserSlash} />
                        </div>
                    )}
                    <ul className="divide-y divide-slate-100">
                        {off.map(e => (
                            <li key={e.id} className="px-3.5 py-2 flex items-center gap-2">
                                <span className="text-[13px] font-semibold text-slate-800 flex-1 min-w-0 break-words">{e.name}</span>
                                <Chip tone="danger">{ABSENCE[ctx.offMap.get(Number(e.custom_id))]}</Chip>
                                {!readOnly && <IconBtn icon={FaTimes} label="Прибрати відсутність" onClick={() => setAbsence(Number(e.custom_id), null)} />}
                            </li>
                        ))}
                        {off.length === 0 && <li className="px-3.5 py-2.5 text-[13px] text-slate-400">Усі на місці</li>}
                    </ul>
                </div>
            </aside>
        </div>
    );
}
