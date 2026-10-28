// =====================================================================
//  K-CORE · Монтаж · «Я»
//
//  Мій місяць (днів у графіку — так рахуються відпрацьовані дні), мої
//  вихідні, встановлення на телефон, вихід.
//  Офісу й керівнику тут же — «Переглянути як монтажник» і назад у CRM.
// =====================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaSignOutAlt, FaMobileAlt, FaEye, FaSearch, FaArrowLeft, FaHistory, FaCar } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { useToast, humanError } from '../ui';
import {
    useMontazh, isoDay, relDay, fmtDay, monthName, OFF_KEYS, OFF_LABEL, isBrigadier, daysWord,
} from './data';
import { Screen, Card, Label, Pill, Big, Line, Empty, Segment } from './kit';
import MileageCard from './MileageCard';

// Браузер пропонує «встановити програму» один раз — ловимо цю подію одразу
let installPrompt = null;
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
}
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent);

export default function MeScreen() {
    const { who, me, isOffice, preview, people, setPreview, canWrite } = useMontazh();
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const today = isoDay();
    const monthStart = `${today.slice(0, 7)}-01`;

    const [month, setMonth] = useState(null);
    const [offsAhead, setOffsAhead] = useState([]);
    const [canInstall, setCanInstall] = useState(!!installPrompt);
    const [carRev, setCarRev] = useState(0);     // змінили «Моє авто» — картка пробігу перечитує авто

    useEffect(() => {
        const on = () => setCanInstall(true);
        window.addEventListener('beforeinstallprompt', on);
        return () => window.removeEventListener('beforeinstallprompt', on);
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            // Останній день місяця (у листопаді 31-го немає — база такої дати не прийме)
            const monthEnd = isoDay(new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0, 12));
            const [w, a, ahead] = await Promise.all([
                supabase.from('installation_workers').select('work_date').eq('employee_custom_id', who.custom_id)
                    .gte('work_date', monthStart).lte('work_date', monthEnd),
                supabase.from('attendance').select('work_date').eq('employee_custom_id', who.custom_id)
                    .gte('work_date', monthStart).lte('work_date', monthEnd).in('status', OFF_KEYS),
                supabase.from('attendance').select('id, work_date, status').eq('employee_custom_id', who.custom_id)
                    .gte('work_date', today).in('status', OFF_KEYS).order('work_date').limit(20),
            ]);
            if (!alive) return;
            const off = new Set((a.data || []).map(r => r.work_date));
            const daysIn = [...new Set((w.data || []).map(r => r.work_date))].filter(d => !off.has(d));
            setMonth({ worked: daysIn.filter(d => d <= today).length, planned: daysIn.filter(d => d > today).length, off: off.size });
            setOffsAhead(ahead.data || []);
        })();
        return () => { alive = false; };
    }, [who.custom_id, today, monthStart]);

    const install = async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        try { await installPrompt.userChoice; } catch { /* користувач закрив */ }
        installPrompt = null;
        setCanInstall(false);
    };

    // Кілька вихідних поспіль — одним рядком «3–7 листопада»
    const offRanges = useMemo(() => {
        const out = [];
        offsAhead.forEach(o => {
            const last = out[out.length - 1];
            const next = last && new Date(`${last.to}T12:00:00`);
            if (next) next.setDate(next.getDate() + 1);
            if (last && last.status === o.status && next && isoDay(next) === o.work_date) last.to = o.work_date;
            else out.push({ from: o.work_date, to: o.work_date, status: o.status });
        });
        return out;
    }, [offsAhead]);

    const role = [isBrigadier(who) ? 'Бригадир' : null, who.position].filter(Boolean).join(' · ');

    return (
        <Screen title={who.name || 'Я'} sub={role || who.email}>
            <Card hero>
                <Label right={<span className="first-letter:uppercase inline-block">{monthName(today)}</span>}>Мій місяць</Label>
                {month === null ? <Empty>Рахую…</Empty> : (<>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-xl bg-slate-100 px-3 py-2.5">
                            <div className="text-[34px] font-bold leading-none tabular-nums">{month.worked}</div>
                            <div className="text-[13.5px] text-slate-600 mt-1">робочих {daysWord(month.worked)}</div>
                        </div>
                        <div className="rounded-xl bg-rose-50 px-3 py-2.5">
                            <div className="text-[34px] font-bold leading-none tabular-nums text-rose-700">{month.off}</div>
                            <div className="text-[13.5px] text-rose-700/80 mt-1">{({ 'день': 'вихідний', 'дні': 'вихідні', 'днів': 'вихідних' })[daysWord(month.off)]}</div>
                        </div>
                    </div>
                    {month.planned > 0 && <p className="text-[13.5px] text-slate-500 mt-2">Ще заплановано цього місяця: <b className="text-slate-900">{month.planned}</b></p>}
                </>)}
            </Card>

            <Card>
                <Label>Мої вихідні</Label>
                {offRanges.length === 0 ? <Empty>Попереду вихідних немає</Empty> : offRanges.map((r, i) => (
                    <Line key={r.from} first={i === 0} right={<Pill tone={r.status === 'OFF' ? 'bad' : 'neutral'}>{OFF_LABEL[r.status].toLowerCase()}</Pill>}>
                        {r.from === r.to ? relDay(r.from) : `${fmtDay(r.from, { day: 'numeric', month: 'long' })} – ${fmtDay(r.to, { day: 'numeric', month: 'long' })}`}
                    </Line>
                ))}
                <Big small tone="soft" className="mt-2" onClick={() => navigate('/m/schedule')}>Поставити або скасувати — у «Графіку»</Big>
            </Card>

            <MyCar who={who} canWrite={canWrite} onChanged={() => setCarRev(n => n + 1)} />
            <MileageCard key={`${who.id}-${carRev}`} who={who} canWrite={canWrite} />

            <Big tone="soft" icon={FaHistory} onClick={() => navigate('/m/reports')}>Мої звіти</Big>

            {!isStandalone() && (canInstall || isIOS()) && (
                <Card>
                    <Label icon={FaMobileAlt}>На телефон</Label>
                    {canInstall ? (<>
                        <p className="text-[14.5px] text-slate-700">Іконка на головному екрані — відкривається як звичайний додаток.</p>
                        <Big tone="dark" small className="mt-2" onClick={install}>Встановити на телефон</Big>
                    </>) : (
                        <p className="text-[14.5px] text-slate-700">У Safari натисніть «Поділитися» внизу екрана, потім «На початковий екран».</p>
                    )}
                </Card>
            )}

            {isOffice && <PreviewPicker people={people} who={who} me={me} preview={preview} setPreview={setPreview} />}

            {isOffice ? (
                <Big tone="soft" icon={FaArrowLeft} onClick={() => navigate('/today')}>Повернутися в CRM</Big>
            ) : (
                canWrite && <Big tone="danger" icon={FaSignOutAlt} onClick={signOut}>Вийти</Big>
            )}
        </Screen>
    );
}

/* Моє авто: офіс бачить це в «Працівники → Транспорт» і в «Команді» */
const CAR_ITEMS = [
    { value: 'own', label: 'Є, на ходу' },
    { value: 'repair', label: 'У ремонті' },
    { value: 'none', label: 'Немає' },
];

function MyCar({ who, canWrite, onChanged }) {
    const toast = useToast();
    const [car, setCar] = useState(undefined);   // undefined — ще вантажиться, null — не вказано

    useEffect(() => {
        if (!who?.id) return undefined;
        let alive = true;
        supabase.from('employee_cars').select('status, until, note').eq('employee_id', who.id).maybeSingle()
            .then(({ data }) => { if (alive) setCar(data || null); });
        return () => { alive = false; };
    }, [who?.id]);

    const save = async (patch) => {
        const next = { status: car?.status || 'none', until: car?.until || null, note: car?.note || null, ...patch };
        if (next.status !== 'repair') next.until = null;
        const prev = car;
        setCar(next);
        const { error } = await supabase.from('employee_cars')
            .upsert({ employee_id: who.id, ...next, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' });
        if (error) { setCar(prev); toast(humanError(error), 'error'); return; }
        toast('Збережено — офіс бачить', 'success');
        onChanged?.();
    };

    if (car === undefined) return null;
    return (
        <Card>
            <Label icon={FaCar} right={car?.status === 'repair' && car.until ? `до ${fmtDay(car.until, { day: 'numeric', month: 'long' })}` : null}>Моє авто</Label>
            <Segment value={car?.status || ''} onChange={(v) => canWrite && save({ status: v })} items={CAR_ITEMS} />
            {car?.status === 'repair' && (
                <label className="mt-2 flex items-center gap-2 text-[14.5px] text-slate-700">
                    <span className="flex-shrink-0">Повернеться з ремонту</span>
                    <input type="date" value={car.until || ''} disabled={!canWrite} min={isoDay()}
                        onChange={e => save({ until: e.target.value || null })}
                        className="flex-1 min-w-0 h-11 px-2 rounded-xl border-2 border-slate-300 bg-white text-[15px]" />
                </label>
            )}
        </Card>
    );
}

/* Офіс дивиться очима монтажника — лише перегляд */
function PreviewPicker({ people, who, me, preview, setPreview }) {
    const [q, setQ] = useState('');
    const installers = useMemo(() => [...people.values()]
        .filter(p => p.role === 'installer' && !p.hidden_from_list && p.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'uk')), [people]);
    const found = q.trim() ? installers.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase())) : installers;

    return (
        <Card>
            <Label icon={FaEye} right={preview ? 'лише перегляд' : null}>Переглянути як монтажник</Label>
            {preview && <Big small tone="dark" className="mb-2" onClick={() => setPreview(null)}>Повернутися до себе ({me?.name})</Big>}
            <label className="flex items-center gap-2 px-3 h-11 rounded-xl border-2 border-slate-300 focus-within:border-slate-900">
                <FaSearch size={12} className="text-slate-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ім'я монтажника" className="flex-1 min-w-0 outline-none text-[15px] bg-transparent" />
            </label>
            <div className="max-h-[260px] overflow-y-auto mt-1">
                {found.map((p, i) => (
                    <Line key={p.custom_id} first={i === 0} onClick={() => { setPreview(p.custom_id); window.scrollTo({ top: 0 }); }}
                        right={p.custom_id === who.custom_id ? <Pill tone="dark">зараз</Pill> : isBrigadier(p) ? <Pill>бригадир</Pill> : null}>
                        {p.name}
                    </Line>
                ))}
                {found.length === 0 && <Empty>Нікого не знайдено</Empty>}
            </div>
        </Card>
    );
}
