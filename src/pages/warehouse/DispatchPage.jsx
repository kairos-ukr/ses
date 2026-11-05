// =====================================================================
//  K-CORE · Склад · «На виїзди»
//
//  Комірнику — що видати бригадам сьогодні чи завтра. Для кожного об'єкта
//  з графіка: хто їде, що за чинною специфікацією ще не видано (і з якого
//  складу), чого на складі немає, що після зміни специфікації чекаємо
//  назад. «Видати» — форма видачі, одразу заповнена тим, що є на складі
//  (кількість можна поправити перед проведенням).
//  Той самий список бригада бачить у «Монтажі» як «Взяти з собою».
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTruckLoading, FaArrowUp, FaBoxOpen, FaSyncAlt, FaChevronDown, FaUsers, FaExternalLinkAlt } from 'react-icons/fa';

import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthProvider';
import { T, Btn, IconBtn, Chip, Segmented, Skeleton, EmptyState, useToast, humanError } from '../../ui';
import { loadTakeLists, splitTake, takeQty } from '../../domain/takeList';
import DirectSaleModal from '../DirectSaleModal';

const isoDay = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plusDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });

const Lines = ({ rows, tone = 'text-slate-900' }) => (
    <ul className="divide-y divide-slate-100">
        {rows.map(r => (
            <li key={r.id} className="py-1.5 flex items-start gap-3 text-[13px]">
                <span className={`min-w-0 flex-1 break-words ${tone}`}>
                    {r.name}
                    {r.where && <span className="text-slate-400"> · {r.where}</span>}
                    {r.kind !== 'return' && r.have > 0 && r.missing > 0 && <span className="text-amber-700"> · на складі лише {takeQty(r.have)}</span>}
                </span>
                <b className="tabular-nums whitespace-nowrap">{takeQty(r.toTake)}{r.unit ? ` ${r.unit}` : ''}</b>
            </li>
        ))}
    </ul>
);

export default function DispatchPage() {
    const { can } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();
    const today = isoDay();
    const [date, setDate] = useState(() => (new Date().getHours() >= 13 ? plusDays(today, 1) : today));
    const [loading, setLoading] = useState(true);
    const [visits, setVisits] = useState([]);       // [{ id, inst, crew: [employee] }]
    const [take, setTake] = useState(new Map());
    const [withSpec, setWithSpec] = useState(new Set());
    const [warehouses, setWarehouses] = useState([]);
    const [open, setOpen] = useState({});
    const [issue, setIssue] = useState(null);       // { installationId, warehouseId }

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data: rows, error } = await supabase.from('installation_workers')
                .select('installation_custom_id, employee_custom_id')
                .eq('work_date', date).not('installation_custom_id', 'is', null);
            if (error) throw error;
            const ids = [...new Set((rows || []).map(r => r.installation_custom_id))];
            const cids = [...new Set((rows || []).map(r => r.employee_custom_id))];
            const [inst, emp, wh, needs, takeMap] = await Promise.all([
                ids.length ? supabase.from('installations').select('custom_id, name, status, workflow_stage, client:clients(name, populated_place)').in('custom_id', ids) : { data: [] },
                cids.length ? supabase.from('employees').select('custom_id, name, tier').in('custom_id', cids) : { data: [] },
                supabase.from('warehouses').select('id, name, is_active').order('name'),
                ids.length ? supabase.from('v_object_material_needs').select('installation_custom_id').in('installation_custom_id', ids) : { data: [] },
                loadTakeLists(ids),
            ]);
            const empBy = new Map((emp.data || []).map(e => [e.custom_id, e]));
            const instBy = new Map((inst.data || []).map(i => [i.custom_id, i]));
            setVisits(ids.map(id => ({
                id,
                inst: instBy.get(id) || { custom_id: id, name: `Об'єкт #${id}` },
                crew: [...new Set((rows || []).filter(r => r.installation_custom_id === id).map(r => r.employee_custom_id))]
                    .map(c => empBy.get(c)).filter(Boolean)
                    .sort((a, b) => Number(b.tier === 1) - Number(a.tier === 1) || a.name.localeCompare(b.name, 'uk')),
            })).sort((a, b) => (takeMap.get(b.id)?.length || 0) - (takeMap.get(a.id)?.length || 0) || b.id - a.id));
            setTake(takeMap);
            setWithSpec(new Set((needs.data || []).map(n => n.installation_custom_id)));
            setWarehouses((wh.data || []).filter(w => w.is_active !== false));
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [date, toast]);

    useEffect(() => { load(); }, [load]);

    /** Склад, звідки найбільше позицій цього об'єкта */
    const mainWarehouse = useCallback((rows) => {
        const count = new Map();
        rows.forEach(r => (r.where || '').split(',').map(s => s.trim()).filter(Boolean).forEach(w => count.set(w, (count.get(w) || 0) + 1)));
        const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return warehouses.find(w => w.name === best)?.id || null;
    }, [warehouses]);

    const totals = useMemo(() => {
        let give = 0, absent = 0, back = 0;
        visits.forEach(v => {
            const s = splitTake(take.get(v.id));
            give += s.take.length; absent += s.absent.length; back += s.back.length;
        });
        return { give, absent, back };
    }, [visits, take]);

    const canIssue = can('stock', 'add');

    return (
        <div className="max-w-[1100px] mx-auto w-full space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[18px] font-bold text-slate-900 inline-flex items-center gap-2 mr-auto">
                    <FaTruckLoading className="text-indigo-600" size={16} /> На виїзди
                    <span className="text-[13px] font-semibold text-slate-400 first-letter:uppercase">{dayLabel(date)}</span>
                </h1>
                <Segmented value={date === today ? 'today' : 'tomorrow'} onChange={(v) => setDate(v === 'today' ? today : plusDays(today, 1))}
                    options={[{ value: 'today', label: 'Сьогодні' }, { value: 'tomorrow', label: 'Завтра' }]} />
                <IconBtn icon={FaSyncAlt} label="Оновити" onClick={load} />
            </div>

            {!loading && visits.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    <Chip tone="neutral">{visits.length} об'єкт.</Chip>
                    {totals.give > 0 && <Chip tone="accent">видати {totals.give} поз.</Chip>}
                    {totals.absent > 0 && <Chip tone="danger">немає на складі {totals.absent}</Chip>}
                    {totals.back > 0 && <Chip tone="warn">чекаємо назад {totals.back}</Chip>}
                </div>
            )}

            {loading ? <div className={T.card}><Skeleton rows={6} /></div> : visits.length === 0 ? (
                <div className={T.card}>
                    <EmptyState icon={FaTruckLoading} title="Виїздів на цей день ще немає" hint="Графік складають у «Працівники → Календар»." />
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 items-start">
                    {visits.map(v => {
                        const rows = take.get(v.id) || [];
                        const s = splitTake(rows);
                        const isOpen = open[v.id] ?? (rows.length > 0 && rows.length <= 12);
                        const wh = mainWarehouse(s.take);
                        return (
                            <section key={v.id} className={`${T.card} p-3 space-y-2`}>
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[14.5px] font-bold text-slate-900 leading-snug break-words">
                                            <span className={`${T.mono} mr-1.5`}>СЕС-{v.id}</span>{v.inst.name}
                                        </div>
                                        {v.inst.client?.populated_place && <div className="text-[12.5px] text-slate-500 break-words">{v.inst.client.populated_place}</div>}
                                        {v.crew.length > 0 && (
                                            <div className="text-[12.5px] text-slate-600 mt-0.5 inline-flex items-start gap-1.5 break-words">
                                                <FaUsers size={11} className="mt-0.5 flex-shrink-0 text-slate-400" />
                                                <span>{v.crew.map(p => (p.tier === 1 ? `${p.name} (бригадир)` : p.name)).join(', ')}</span>
                                            </div>
                                        )}
                                    </div>
                                    {can('provisioning') && (
                                        <IconBtn icon={FaExternalLinkAlt} label="Забезпечення об'єкта" onClick={() => navigate(`/provisioning?obj=${v.id}`)} />
                                    )}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5">
                                    {!withSpec.has(v.id) ? <Chip tone="neutral">специфікації немає</Chip>
                                        : rows.length === 0 ? <Chip tone="ok">усе видано</Chip> : null}
                                    {s.take.length > 0 && <Chip tone="accent">видати {s.take.length}</Chip>}
                                    {s.absent.length > 0 && <Chip tone="danger">немає на складі {s.absent.length}</Chip>}
                                    {s.back.length > 0 && <Chip tone="warn">чекаємо назад {s.back.length}</Chip>}
                                    {rows.length > 0 && (
                                        <button type="button" onClick={() => setOpen(o => ({ ...o, [v.id]: !isOpen }))} aria-expanded={isOpen}
                                            className="ml-auto h-7 px-2 rounded-md text-[12px] font-semibold text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1">
                                            {isOpen ? 'Згорнути' : 'Список'} <FaChevronDown size={9} className={isOpen ? 'rotate-180' : ''} />
                                        </button>
                                    )}
                                </div>

                                {isOpen && rows.length > 0 && (
                                    <div className="space-y-2">
                                        {s.take.length > 0 && <div><div className={T.label}>Видати</div><Lines rows={s.take} /></div>}
                                        {s.absent.length > 0 && <div><div className={`${T.label} !text-rose-600`}>Немає на складі</div><Lines rows={s.absent} tone="text-rose-700" /></div>}
                                        {s.back.length > 0 && <div><div className={`${T.label} !text-amber-700`}>Чекаємо назад — змінилась специфікація</div><Lines rows={s.back} tone="text-amber-800" /></div>}
                                    </div>
                                )}

                                {canIssue && s.take.length > 0 && (
                                    <div className="flex justify-end">
                                        <Btn size="sm" variant="ok" icon={FaArrowUp} onClick={() => setIssue({ installationId: v.id, warehouseId: wh })}>
                                            Видати · {s.take.length}
                                        </Btn>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            )}

            {!loading && visits.length > 0 && totals.give === 0 && totals.absent === 0 && totals.back === 0 && (
                <div className="text-[12.5px] text-slate-500 inline-flex items-center gap-1.5"><FaBoxOpen size={11} /> На цей день видавати нічого — усе за специфікаціями вже видано.</div>
            )}

            <DirectSaleModal
                isOpen={!!issue}
                onClose={() => setIssue(null)}
                onSuccess={load}
                presetInstallationId={issue?.installationId || null}
                presetWarehouseId={issue?.warehouseId || null}
                autoFill
            />
        </div>
    );
}
