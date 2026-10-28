// =====================================================================
//  K-CORE · «Працівники → Автопарк»
//
//  • Авто компанії: назва, номер, тип, постійний водій, стан
//    (на ходу / у ремонті до … / не використовується).
//  • Власні авто людей: своє / у ремонті / немає. Монтажники відмічають
//    самі в «Монтажі» (Я → Моє авто), тут видно й можна поправити.
//  Хто чим їде в конкретний день — вирішують у «Календарі», коли
//  складають графік: там для кожного об'єкта обирають авто.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { FaCar, FaCheck, FaEdit, FaPlus, FaShuttleVan, FaUserTie } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, IconBtn, Chip, Picker, Skeleton, Tip, useToast, humanError } from '../ui';
import MileagePanel from './MileagePanel';

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
const FLASH_MS = 2600;

const kindLabel = (v) => VEHICLE_KINDS.find(k => k.v === v)?.l || v;
const fmtShort = (s) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '');

const ChipBtn = ({ on, children, onClick }) => (
    <button type="button" onClick={onClick}
        className={`h-8 px-2.5 rounded-lg border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors
            ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
        {children}
    </button>
);

/* Авто — додати або змінити, на місці */
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
                {Object.entries(VEHICLE_STATUS).map(([k, s]) => <ChipBtn key={k} on={f.status === k} onClick={() => set({ status: k })}>{s.l}</ChipBtn>)}
                {f.status === 'repair' && (
                    <input type="date" value={f.repair_until} onChange={e => set({ repair_until: e.target.value })} aria-label="У ремонті до"
                        className="h-8 px-2 rounded-lg border border-slate-200 bg-white text-[12.5px]" />
                )}
            </div>
            <Picker options={[{ id: '', label: 'Без постійного водія' }, ...peopleOptions]} value={f.default_driver_custom_id} onChange={v => set({ default_driver_custom_id: v })}
                placeholder="Постійний водій" searchPlaceholder="Пошук людини…" icon={FaUserTie} />
            <input className={T.input} value={f.notes} onChange={e => set({ notes: e.target.value })} placeholder="Примітка: скільки місць, вантажопідйомність, причіп…" />
            <div className="flex gap-2">
                <Btn variant="accent" icon={FaCheck} onClick={save} disabled={!f.name.trim() || saving}>{saving ? 'Зберігаємо…' : vehicle ? 'Зберегти' : 'Додати авто'}</Btn>
                <Btn variant="ghost" onClick={onCancel} disabled={saving}>Скасувати</Btn>
            </div>
        </div>
    );
}

export default function FleetPage() {
    const { can } = useAuth();
    const canManage = can('fleet', 'edit');   // Доступи → «Автопарк і пробіг»
    const toast = useToast();
    const [data, setData] = useState(null);
    const [editing, setEditing] = useState(null);     // id авто | 'new'
    const [showAll, setShowAll] = useState(false);
    const [flash, setFlash] = useState({});

    const pulse = (k) => {
        setFlash(f => ({ ...f, [k]: true }));
        setTimeout(() => setFlash(f => { const n = { ...f }; delete n[k]; return n; }), FLASH_MS);
    };

    const load = useCallback(async () => {
        const [v, e, c] = await Promise.all([
            supabase.from('vehicles').select('*').order('status').order('name'),
            supabase.from('employees').select('id, custom_id, name, role, department, access_blocked_at, hidden_from_list').order('name'),
            supabase.from('employee_cars').select('*'),
        ]);
        if (v.error) toast(humanError(v.error), 'error');
        setData({ vehicles: v.data || [], employees: e.data || [], cars: c.data || [] });
    }, [toast]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        let t;
        const ch = supabase.channel('fleet-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, () => { clearTimeout(t); t = setTimeout(load, 400); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_cars' }, () => { clearTimeout(t); t = setTimeout(load, 400); })
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load]);

    if (!data) return <div className="p-3 sm:p-5"><div className={T.card}><Skeleton rows={5} /></div></div>;

    const people = data.employees.filter(e => !e.access_blocked_at && !e.hidden_from_list);
    const peopleOptions = people.map(e => ({ id: Number(e.custom_id), label: e.name }));
    const nameOf = (cid) => data.employees.find(e => Number(e.custom_id) === Number(cid))?.name || `#${cid}`;
    const carOf = (p) => data.cars.find(c => c.employee_id === p.id) || null;
    const known = people.filter(p => carOf(p) && carOf(p).status !== 'none');
    const rest = people.filter(p => !carOf(p) || carOf(p).status === 'none');

    const addVehicle = async (payload) => {
        const { data: row, error } = await supabase.from('vehicles').insert(payload).select('id').single();
        if (error) { toast(humanError(error), 'error'); return; }
        setEditing(null); await load(); pulse(`v${row.id}`);
        toast(`Авто «${payload.name}» додано`);
    };
    const updateVehicle = async (v, payload) => {
        const { error } = await supabase.from('vehicles').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', v.id);
        if (error) { toast(humanError(error), 'error'); return; }
        setEditing(null); await load(); pulse(`v${v.id}`);
        toast('Авто оновлено');
    };
    const setCar = async (p, status) => {
        const { error } = await supabase.from('employee_cars')
            .upsert({ employee_id: p.id, status, ...(status !== 'repair' ? { until: null } : {}), updated_at: new Date().toISOString() }, { onConflict: 'employee_id' });
        if (error) { toast(humanError(error), 'error'); return; }
        setData(d => ({ ...d, cars: [...d.cars.filter(c => c.employee_id !== p.id), { ...(d.cars.find(c => c.employee_id === p.id) || {}), employee_id: p.id, status }] }));
        pulse(`c${p.id}`);
        toast(`${p.name}: ${CAR_STATUS[status].l.toLowerCase()}`);
    };

    const carRow = (p) => {
        const c = carOf(p);
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
                        {Object.keys(CAR_STATUS).map(k => (
                            <button key={k} type="button" onClick={() => setCar(p, k)}
                                className={`h-8 px-2 rounded-md text-[11.5px] font-bold whitespace-nowrap ${c?.status === k ? `bg-white shadow-sm ${k === 'own' ? 'text-emerald-700' : k === 'repair' ? 'text-amber-700' : 'text-slate-700'}` : 'text-slate-500'}`}>
                                {k === 'own' ? 'Своє' : k === 'repair' ? 'Ремонт' : 'Немає'}
                            </button>
                        ))}
                    </div>
                ) : c ? <Chip tone={CAR_STATUS[c.status]?.tone}>{CAR_STATUS[c.status]?.l}</Chip> : null}
            </li>
        );
    };

    return (
        <div className="p-3 sm:p-5 max-w-[1200px] mx-auto pb-24 lg:pb-8 grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {/* Авто компанії */}
            <div className={`${T.card} overflow-hidden`}>
                <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2"><FaShuttleVan size={13} className="text-indigo-500" /> Авто компанії</h3>
                    {canManage && editing !== 'new' && <Btn size="sm" variant="soft" icon={FaPlus} onClick={() => setEditing('new')}>Авто</Btn>}
                </div>
                {editing === 'new' && <VehicleForm peopleOptions={peopleOptions} onCancel={() => setEditing(null)} onSave={addVehicle} />}
                {data.vehicles.length === 0 && editing !== 'new' ? (
                    <div className="px-3.5 py-5 text-[13px] text-slate-400">Авто компанії ще не додані</div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {data.vehicles.map(v => (editing === v.id ? (
                            <li key={v.id}><VehicleForm vehicle={v} peopleOptions={peopleOptions} onCancel={() => setEditing(null)} onSave={(p) => updateVehicle(v, p)} /></li>
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
                                {canManage && <IconBtn icon={FaEdit} label="Змінити авто" onClick={() => setEditing(v.id)} />}
                            </li>
                        )))}
                    </ul>
                )}
            </div>

            {/* Власні авто людей */}
            <div className={`${T.card} overflow-hidden`}>
                <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
                    <h3 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2"><FaCar size={13} className="text-indigo-500" /> Власні авто людей</h3>
                    <Tip text="Монтажники самі відмічають своє авто в «Монтажі» (Я → Моє авто). У «Календарі» людей зі своїм авто видно одразу." />
                </div>
                <ul className="divide-y divide-slate-100">
                    {known.map(carRow)}
                    {known.length === 0 && <li className="px-3.5 py-3 text-[13px] text-slate-400">Ще ніхто не відмітив своє авто</li>}
                    {showAll && rest.map(carRow)}
                </ul>
                {rest.length > 0 && (
                    <button type="button" onClick={() => setShowAll(v => !v)} className="w-full py-2 border-t border-slate-100 text-[12.5px] font-semibold text-indigo-600 hover:bg-slate-50">
                        {showAll ? 'Згорнути' : `Решта людей · ${rest.length}`}
                    </button>
                )}
            </div>

            {/* Пробіг, що люди вносять у «Монтажі» */}
            <MileagePanel />
        </div>
    );
}
