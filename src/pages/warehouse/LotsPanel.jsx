// =====================================================================
//  Носії (бухти / барабани / рулони) для однієї позиції на одному складі.
//
//  Показує кожен носій окремо з поточним залишком, і дає три дії:
//  прийняти партію, змотати (видача/списання), перемістити.
//
//  Компонент самодостатній: сам вантажить свої дані й сам їх оновлює.
//  Через це його можна вставити і в залишки, і в забезпечення об'єктів.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FaPlus, FaCut, FaExchangeAlt, FaLayerGroup, FaCheckCircle,
    FaTrash, FaBoxOpen
} from 'react-icons/fa';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../AuthProvider';
import {
    T, TONE, Btn, IconBtn, Chip, Modal, Field, Bar, Skeleton,
    useToast, useConfirm, humanError, num, useAutoFocus,
} from '../../ui';

/* Носій майже змотаний — далі це обрізок, який лише заважає на полиці */
const LOW_REMAINDER_RATIO = 0.1;

const lotTone = (lot) => {
    if (lot.status === 'depleted') return 'neutral';
    if (lot.status === 'written_off') return 'danger';
    const ratio = lot.remaining_quantity / lot.initial_quantity;
    if (ratio >= 0.999) return 'ok';
    if (ratio <= LOW_REMAINDER_RATIO) return 'warn';
    return 'info';
};

const lotLabel = (lot) => {
    if (lot.status === 'depleted') return 'Порожня';
    if (lot.status === 'written_off') return 'Списана';
    if (lot.remaining_quantity >= lot.initial_quantity) return 'Ціла';
    if (lot.remaining_quantity / lot.initial_quantity <= LOW_REMAINDER_RATIO) return 'Обрізок';
    return 'Почата';
};

export default function LotsPanel({ item, warehouseId, warehouses = [], onChanged }) {
    const { employee } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const autoFocus = useAutoFocus();

    const [lots, setLots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showDepleted, setShowDepleted] = useState(false);
    const [busy, setBusy] = useState(false);

    // Приймання партії
    const [receive, setReceive] = useState(null);   // { count, size, reference, batch }
    // Змотування — { mode: 'issue'|'writeoff', cuts: {lotId: qty}, reason }
    const [cut, setCut] = useState(null);
    // Переміщення носія
    const [move, setMove] = useState(null);         // { lot, toId }

    const unitName = item?.unit?.name || 'од';
    const lotWord = item?.lot_unit_name || 'бухта';
    const lotWordPlural = lotWord === 'бухта' ? 'бухти' : `${lotWord}и`;

    const load = useCallback(async () => {
        if (!item?.id || !warehouseId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('stock_lots')
                .select('*')
                .eq('nomenclature_id', item.id)
                .eq('warehouse_id', warehouseId)
                .order('status', { ascending: true })
                .order('remaining_quantity', { ascending: true });
            if (error) throw error;
            setLots(data || []);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [item?.id, warehouseId, toast]);

    useEffect(() => { load(); }, [load]);

    const visible = useMemo(
        () => lots.filter(l => showDepleted || l.status === 'active'),
        [lots, showDepleted]
    );

    const stats = useMemo(() => {
        const active = lots.filter(l => l.status === 'active');
        return {
            count: active.length,
            total: active.reduce((s, l) => s + Number(l.remaining_quantity), 0),
            whole: active.filter(l => Number(l.remaining_quantity) >= Number(l.initial_quantity)).length,
            opened: active.filter(l => Number(l.remaining_quantity) < Number(l.initial_quantity)).length,
            depleted: lots.filter(l => l.status !== 'active').length,
        };
    }, [lots]);

    const refresh = async () => { await load(); onChanged?.(); };

    /* ---------- ПРИЙМАННЯ ПАРТІЇ ---------- */

    const openReceive = () => setReceive({
        count: '', size: item?.lot_default_size || '', reference: '', batch: '',
    });

    const submitReceive = async () => {
        const count = parseInt(receive.count, 10);
        const size = parseFloat(receive.size);
        if (!count || count < 1) return toast('Вкажіть кількість носіїв', 'error');
        if (!size || size <= 0) return toast(`Вкажіть, скільки ${unitName} в одному носії`, 'error');
        if (count > 500) return toast('За раз приймаємо не більше 500 носіїв', 'error');

        setBusy(true);
        try {
            const { data, error } = await supabase.rpc('receive_stock_lots', {
                p_warehouse: warehouseId,
                p_nomenclature: item.id,
                p_lots: Array.from({ length: count }, () => ({ qty: size })),
                p_batch_code: receive.batch.trim() || null,
                p_reference: receive.reference.trim() || null,
                p_emp: employee?.id ?? null,
            });
            if (error) throw error;
            if (data?.ok === false) throw new Error(data.message);

            toast(`Прийнято ${count} × ${num(size)} ${unitName} — разом ${num(data.total_quantity)}`, 'success');
            setReceive(null);
            await refresh();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------- ЗМОТУВАННЯ ----------
       Підбираємо носії так, щоб лишалось якнайменше обрізків:
       спершу вже початі, від найменшого достатнього. */

    const openCut = (mode, preselectLot = null) => {
        setCut({ mode, need: '', cuts: preselectLot ? { [preselectLot.id]: '' } : {}, reason: '' });
    };

    const autoPick = (need) => {
        const want = parseFloat(need);
        if (!want || want <= 0) return;

        const pool = [...lots.filter(l => l.status === 'active' && Number(l.remaining_quantity) > 0)];
        // Почата бухта, якої вистачає повністю — найкращий варіант: не відкриваємо нову
        const enoughOpened = pool
            .filter(l => Number(l.remaining_quantity) >= want && Number(l.remaining_quantity) < Number(l.initial_quantity))
            .sort((a, b) => a.remaining_quantity - b.remaining_quantity)[0];

        if (enoughOpened) {
            setCut(c => ({ ...c, cuts: { [enoughOpened.id]: String(want) } }));
            return;
        }

        // Інакше — набираємо від найменших залишків, доки не вистачить
        pool.sort((a, b) => a.remaining_quantity - b.remaining_quantity);
        const picked = {};
        let left = want;
        for (const l of pool) {
            if (left <= 0) break;
            const take = Math.min(Number(l.remaining_quantity), left);
            picked[l.id] = String(num(take));
            left -= take;
        }
        if (left > 0.0001) {
            toast(`На складі лише ${num(stats.total)} ${unitName} — це менше, ніж потрібно`, 'warning');
        }
        setCut(c => ({ ...c, cuts: picked }));
    };

    const cutTotal = useMemo(() => {
        if (!cut) return 0;
        return Object.values(cut.cuts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    }, [cut]);

    const submitCut = async () => {
        const payload = Object.entries(cut.cuts)
            .map(([lot_id, qty]) => ({ lot_id: Number(lot_id), qty: parseFloat(qty) }))
            .filter(c => c.qty > 0);

        if (payload.length === 0) return toast('Вкажіть, скільки і з якого носія змотати', 'error');
        if (cut.mode === 'writeoff' && !cut.reason.trim()) {
            return toast('Списання без причини не проводимо', 'error');
        }

        // Скільки носіїв спорожніє — це варто побачити до, а не після
        const willEmpty = payload.filter(p => {
            const lot = lots.find(l => l.id === p.lot_id);
            return lot && Number(lot.remaining_quantity) - p.qty <= 0.0001;
        });

        const ok = await confirm({
            title: cut.mode === 'writeoff' ? 'Списати?' : 'Змотати з носіїв?',
            tone: cut.mode === 'writeoff' ? 'danger' : 'accent',
            confirmLabel: cut.mode === 'writeoff' ? 'Списати' : 'Змотати',
            message: `Разом ${num(cutTotal)} ${unitName} з ${payload.length} носіїв.`,
            details: [
                ...payload.map(p => {
                    const lot = lots.find(l => l.id === p.lot_id);
                    return `${lot?.label}: ${num(p.qty)} ${unitName} → лишиться ${num(Number(lot?.remaining_quantity) - p.qty)}`;
                }),
                ...(willEmpty.length ? [`${willEmpty.length} ${willEmpty.length === 1 ? 'носій спорожніє' : 'носіїв спорожніє'}`] : []),
            ],
        });
        if (!ok) return;

        setBusy(true);
        try {
            const { data, error } = await supabase.rpc('consume_from_lots', {
                p_operation: cut.mode,
                p_warehouse: warehouseId,
                p_nomenclature: item.id,
                p_cuts: payload,
                p_reason: cut.reason.trim() || null,
                p_emp: employee?.id ?? null,
            });
            if (error) throw error;
            if (data?.ok === false) throw new Error(data.message);

            toast(`Змотано ${num(data.total_quantity)} ${unitName}`
                + (data.lots_emptied ? ` · спорожніло носіїв: ${data.lots_emptied}` : ''), 'success');
            setCut(null);
            await refresh();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------- ПЕРЕМІЩЕННЯ ---------- */

    const submitMove = async () => {
        if (!move.toId) return toast('Оберіть склад', 'error');
        setBusy(true);
        try {
            const { data, error } = await supabase.rpc('transfer_lot', {
                p_lot_id: move.lot.id,
                p_warehouse_to: Number(move.toId),
                p_emp: employee?.id ?? null,
            });
            if (error) throw error;
            if (data?.ok === false) throw new Error(data.message);

            toast(`${move.lot.label} переміщено`, 'success');
            setMove(null);
            await refresh();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------- РЕНДЕР ---------- */

    if (loading) return <Skeleton rows={3} />;

    const otherWarehouses = warehouses.filter(w => w.is_active && w.id !== warehouseId);

    return (
        <div className="space-y-2.5">

            {/* Шапка: що є на складі + головні дії */}
            <div className="flex items-center gap-2 flex-wrap">
                <FaLayerGroup className="text-slate-400" size={13} />
                <span className="text-[12.5px] font-bold text-slate-800">
                    {stats.count} {lotWordPlural}
                </span>
                <span className="text-[12.5px] text-slate-500 tabular-nums">
                    · разом <b className="text-slate-800">{num(stats.total)}</b> {unitName}
                </span>
                {stats.whole > 0 && <Chip tone="ok">цілих {stats.whole}</Chip>}
                {stats.opened > 0 && <Chip tone="info">почато {stats.opened}</Chip>}

                <div className="ml-auto flex items-center gap-1.5">
                    <Btn size="sm" variant="softOk" icon={FaPlus} onClick={openReceive}>Прийняти</Btn>
                    <Btn size="sm" variant="accent" icon={FaCut} onClick={() => openCut('issue')} disabled={stats.count === 0}>
                        Змотати
                    </Btn>
                    <Btn size="sm" variant="softDanger" icon={FaTrash} onClick={() => openCut('writeoff')} disabled={stats.count === 0}>
                        Списати
                    </Btn>
                </div>
            </div>

            {/* Список носіїв */}
            {visible.length === 0 ? (
                <div className={`${T.inset} px-3 py-4 text-center`}>
                    <FaBoxOpen className="mx-auto text-2xl text-slate-300 mb-1.5" />
                    <div className="text-[12.5px] font-bold text-slate-600">Носіїв на цьому складі немає</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Прийміть партію, щоб завести {lotWordPlural}</div>
                </div>
            ) : (
                <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map(lot => {
                        const remaining = Number(lot.remaining_quantity);
                        const initial = Number(lot.initial_quantity);
                        const pct = initial > 0 ? (remaining / initial) * 100 : 0;
                        const tone = lotTone(lot);
                        const isActive = lot.status === 'active';

                        return (
                            <div
                                key={lot.id}
                                className={`${T.cardFlat} px-2.5 py-2 ${isActive ? '' : 'opacity-55'}`}
                            >
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className="font-mono text-[11px] font-bold text-slate-800 tracking-wide">{lot.label}</span>
                                    <Chip tone={tone}>{lotLabel(lot)}</Chip>
                                    <span className="ml-auto text-[13px] font-black tabular-nums text-slate-900">
                                        {num(remaining)}
                                        <span className="text-[9px] font-bold text-slate-400 ml-0.5">{unitName}</span>
                                    </span>
                                </div>

                                <Bar segments={[{ pct, tone }]} className="mb-1" />

                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-400 tabular-nums">
                                        із {num(initial)}
                                        {lot.batch_code && <span className="ml-1.5">· партія {lot.batch_code}</span>}
                                    </span>
                                    {isActive && (
                                        <span className="ml-auto flex items-center gap-1">
                                            <IconBtn
                                                variant="ghost" icon={FaCut} label="Змотати з цього носія"
                                                onClick={() => openCut('issue', lot)}
                                            />
                                            {otherWarehouses.length > 0 && (
                                                <IconBtn
                                                    variant="ghost" icon={FaExchangeAlt} label="Перемістити на інший склад"
                                                    onClick={() => setMove({ lot, toId: '' })}
                                                />
                                            )}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {stats.depleted > 0 && (
                <button
                    onClick={() => setShowDepleted(v => !v)}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 transition-colors"
                >
                    {showDepleted ? 'Сховати' : 'Показати'} порожні та списані ({stats.depleted})
                </button>
            )}

            {/* --- ПРИЙМАННЯ ПАРТІЇ --- */}
            <Modal
                isOpen={!!receive}
                onClose={() => setReceive(null)}
                title="Приймання партії"
                subtitle={item?.fullName}
                tone="ok"
                size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setReceive(null)}>Скасувати</Btn>
                    <Btn variant="ok" onClick={submitReceive} disabled={busy}>
                        {busy ? 'Приймаємо…' : 'Прийняти'}
                    </Btn>
                </>}
            >
                {receive && (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label={`Скільки ${lotWordPlural}`} required>
                                <input type="number" min="1" step="1" inputMode="numeric" autoFocus={autoFocus}
                                    className={T.input} placeholder="20"
                                    value={receive.count}
                                    onChange={e => setReceive({ ...receive, count: e.target.value })} />
                            </Field>
                            <Field label={`${unitName} в кожній`} required>
                                <input type="number" min="0" step="any" inputMode="decimal"
                                    className={T.input} placeholder="500"
                                    value={receive.size}
                                    onChange={e => setReceive({ ...receive, size: e.target.value })} />
                            </Field>
                        </div>

                        {receive.count > 0 && receive.size > 0 && (
                            <div className={`${TONE.ok.chip} border rounded-lg px-3 py-2 text-[12.5px] font-bold`}>
                                Разом: {num(receive.count * receive.size)} {unitName}
                                <span className="font-medium opacity-75"> · бирки згенеруються автоматично</span>
                            </div>
                        )}

                        <Field label="Накладна" hint="Номер документа приходу — необов'язково">
                            <input className={T.input} placeholder="№ 1234"
                                value={receive.reference}
                                onChange={e => setReceive({ ...receive, reference: e.target.value })} />
                        </Field>
                        <Field label="Партія постачальника">
                            <input className={T.input} placeholder="напр. LOT-7788"
                                value={receive.batch}
                                onChange={e => setReceive({ ...receive, batch: e.target.value })} />
                        </Field>

                        <p className="text-[11px] text-slate-500 leading-relaxed">
                            Якщо носії різного розміру — прийміть їх кількома партіями,
                            або відкоригуйте кожен окремо після приймання.
                        </p>
                    </div>
                )}
            </Modal>

            {/* --- ЗМОТУВАННЯ / СПИСАННЯ --- */}
            <Modal
                isOpen={!!cut}
                onClose={() => setCut(null)}
                title={cut?.mode === 'writeoff' ? 'Списання' : 'Змотати з носіїв'}
                subtitle={item?.fullName}
                tone={cut?.mode === 'writeoff' ? 'danger' : 'accent'}
                size="md"
                footer={<>
                    <Btn variant="outline" onClick={() => setCut(null)}>Скасувати</Btn>
                    <Btn
                        variant={cut?.mode === 'writeoff' ? 'danger' : 'accent'}
                        onClick={submitCut}
                        disabled={busy || cutTotal <= 0}
                    >
                        {busy ? 'Проводимо…' : `${cut?.mode === 'writeoff' ? 'Списати' : 'Змотати'} ${num(cutTotal)} ${unitName}`}
                    </Btn>
                </>}
            >
                {cut && (
                    <div className="space-y-3">
                        {/* Швидкий підбір: вводиш потрібний метраж — система розкладає по носіях */}
                        <div className={`${T.inset} p-3`}>
                            <div className={`${T.label} mb-1.5`}>Скільки потрібно</div>
                            <div className="flex gap-2">
                                <input
                                    type="number" min="0" step="any" inputMode="decimal" autoFocus={autoFocus}
                                    className={T.input} placeholder={`${unitName}, напр. 120`}
                                    value={cut.need}
                                    onChange={e => setCut({ ...cut, need: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); autoPick(cut.need); } }}
                                />
                                <Btn variant="primary" onClick={() => autoPick(cut.need)}>Підібрати</Btn>
                            </div>
                            <p className="text-[10.5px] text-slate-500 mt-1.5 leading-relaxed">
                                Спершу беремо вже почату {lotWord}, якої вистачає повністю —
                                щоб не відкривати нову і не плодити обрізки.
                            </p>
                        </div>

                        <div className={`${T.label}`}>Або вкажіть вручну</div>
                        <div className="space-y-1.5 sm:max-h-[38vh] sm:overflow-y-auto -mx-1 px-1">
                            {lots.filter(l => l.status === 'active' && Number(l.remaining_quantity) > 0).map(lot => {
                                const remaining = Number(lot.remaining_quantity);
                                const val = cut.cuts[lot.id] || '';
                                const taking = parseFloat(val) || 0;
                                const over = taking > remaining;
                                return (
                                    <div key={lot.id}
                                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors
                                            ${taking > 0 ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white'}`}>
                                        <span className="font-mono text-[11px] font-bold text-slate-800 w-20 flex-shrink-0">{lot.label}</span>
                                        <Chip tone={lotTone(lot)}>{lotLabel(lot)}</Chip>
                                        <span className="text-[11.5px] text-slate-500 tabular-nums ml-auto whitespace-nowrap">
                                            є <b className="text-slate-800">{num(remaining)}</b>
                                        </span>
                                        <input
                                            type="number" min="0" max={remaining} step="any" inputMode="decimal"
                                            placeholder="0"
                                            className={`w-24 h-9 px-2 text-center border rounded-lg text-[13px] font-bold tabular-nums outline-none transition-colors
                                                ${over ? 'border-rose-400 bg-rose-50 text-rose-700' : 'border-slate-300 focus:border-indigo-500'}`}
                                            value={val}
                                            onChange={e => setCut({ ...cut, cuts: { ...cut.cuts, [lot.id]: e.target.value } })}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        <Field
                            label={cut.mode === 'writeoff' ? 'Причина списання' : 'Коментар'}
                            required={cut.mode === 'writeoff'}
                        >
                            <input className={T.input}
                                placeholder={cut.mode === 'writeoff' ? 'Напр. пошкоджено при транспортуванні' : 'Необов’язково'}
                                value={cut.reason}
                                onChange={e => setCut({ ...cut, reason: e.target.value })} />
                        </Field>

                        {cutTotal > 0 && (
                            <div className={`${TONE.accent.chip} border rounded-lg px-3 py-2 flex items-center gap-2`}>
                                <FaCheckCircle size={12} />
                                <span className="text-[12.5px] font-bold">
                                    Разом {num(cutTotal)} {unitName} з {Object.values(cut.cuts).filter(v => parseFloat(v) > 0).length} носіїв
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* --- ПЕРЕМІЩЕННЯ НОСІЯ --- */}
            <Modal
                isOpen={!!move}
                onClose={() => setMove(null)}
                title={`Перемістити ${move?.lot.label || ''}`}
                subtitle={move ? `Їде цілком: ${num(move.lot.remaining_quantity)} ${unitName}` : ''}
                size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setMove(null)}>Скасувати</Btn>
                    <Btn variant="accent" onClick={submitMove} disabled={busy}>
                        {busy ? 'Переміщуємо…' : 'Перемістити'}
                    </Btn>
                </>}
            >
                {move && (
                    <Field label="На який склад" required>
                        <select className={T.select} value={move.toId}
                            onChange={e => setMove({ ...move, toId: e.target.value })}>
                            <option value="">Оберіть…</option>
                            {otherWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </Field>
                )}
            </Modal>
        </div>
    );
}
