// =====================================================================
//  K-CORE · Оцифрована КП у картці проєкту
//
//  Це екран директора, а не менеджера. Менеджер завантажує файл і йде
//  далі — оцифровка відбувається за ним і йому не показується. Сюди
//  приходять тоді, коли треба відповісти на питання «що саме ми
//  пообіцяли клієнту і за скільки», і за потреби виправити те, що
//  недочитав OCR.
//
//  Головний елемент — не таблиця, а звірка вгорі. Якщо сума позицій
//  збіглася з підсумком у документі, розбору можна довіряти. Якщо ні —
//  цифру видно, але поруч чесно написано, наскільки вона не сходиться,
//  і поруч лежить сирий текст OCR, щоб перевірити за 10 секунд, а не
//  відкривати PDF і рахувати руками.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    FaFileInvoiceDollar, FaCheck, FaExclamationTriangle, FaPlus, FaTrash,
    FaExternalLinkAlt, FaChevronDown, FaSpinner, FaArrowRight, FaHistory,
    FaBoxes, FaSyncAlt,
} from 'react-icons/fa';

import { supabase } from './supabaseClient';
import { T, TONE, Btn, IconBtn, Chip, Tip, useToast, humanError, num } from './ui';
import { CATEGORIES, categoryLabel } from './utils/kpParser';
import { loadCurrentOffer, loadOfferVersions } from './utils/commercialOffer';
import {
    loadMatchingContext, loadOfferNeedState, syncOfferNeed, confirmOfferNeed,
    needRoleOf, NEED_ROLE_LABEL, NEED_STATUS_LABEL, CONFIRM_REFUSAL,
} from './utils/offerNeed';
import { hasOfferNeed } from './utils/features';

const STATUS_INFO = {
    parsed: { label: 'Розпізнано', tone: 'info' },
    confirmed: { label: 'Підтверджено', tone: 'ok' },
    manual: { label: 'Внесено вручну', tone: 'neutral' },
    failed: { label: 'Не розпізнано', tone: 'danger' },
};

const emptyRow = (sortOrder) => ({
    id: null, sort_order: sortOrder,
    category_key: '', category_label: '',
    name: '', model: '', quantity: null, unit: 'шт',
    unit_price: null, amount: null,
    is_by_fact: false, is_merged: false, is_manual: true,
});

/** Поля шапки, які має сенс правити руками. */
const HEAD_FIELDS = [
    { key: 'total_amount', label: 'Сума угоди', unit: '' },
    { key: 'capacity_kw', label: 'Потужність', unit: 'кВт' },
    { key: 'inverter_kw', label: 'Інвертор', unit: 'кВт' },
    { key: 'battery_kwh', label: 'АКБ', unit: 'кВт·год' },
];

export default function CommercialOfferPanel({ installationId, canEdit = false, onTotalApplied }) {
    const showToast = useToast();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [offer, setOffer] = useState(null);
    const [versions, setVersions] = useState([]);
    const [viewVersionId, setViewVersionId] = useState(null);

    const [head, setHead] = useState({});
    const [rows, setRows] = useState([]);
    const [removedIds, setRemovedIds] = useState([]);
    const [dirty, setDirty] = useState(false);
    const [showRaw, setShowRaw] = useState(false);

    // Потреба об'єкта: стан із v_object_offer_need і довідник для співставлення
    const [need, setNeed] = useState(null);
    const [nomCtx, setNomCtx] = useState(null);
    const [needBusy, setNeedBusy] = useState(false);
    const [needReady, setNeedReady] = useState(false);

    /* --- Завантаження --------------------------------------------------- */

    const applyOffer = (nextOffer, nextItems) => {
        setOffer(nextOffer);
        setHead(nextOffer ? { ...nextOffer } : {});
        setRows(nextItems.map(i => ({ ...i })));
        setRemovedIds([]);
        setDirty(false);
    };

    const load = useCallback(async (versionId = null) => {
        setLoading(true);
        try {
            const list = await loadOfferVersions(installationId);
            setVersions(list);

            if (versionId) {
                const { data: one } = await supabase
                    .from('commercial_offers').select('*').eq('id', versionId).maybeSingle();
                const { data: its } = await supabase
                    .from('commercial_offer_items').select('*').eq('offer_id', versionId).order('sort_order');
                setViewVersionId(versionId);
                applyOffer(one || null, its || []);
            } else {
                const { offer: cur, items } = await loadCurrentOffer(installationId);
                setViewVersionId(cur?.id || null);
                applyOffer(cur, items);
            }

            setNeed(await loadOfferNeedState(installationId));
        } finally {
            setLoading(false);
        }
    }, [installationId]);

    // Блок потреби з'являється лише після міграції db/2026-09_offer_to_need.sql
    useEffect(() => { hasOfferNeed().then(setNeedReady); }, []);

    // Довідник номенклатури потрібен лише тому, хто правитиме співставлення
    useEffect(() => {
        if (!canEdit || !needReady || nomCtx) return;
        let alive = true;
        loadMatchingContext().then(ctx => { if (alive) setNomCtx(ctx); });
        return () => { alive = false; };
    }, [canEdit, needReady, nomCtx]);

    useEffect(() => { load(); }, [load]);

    /* --- Похідні цифри -------------------------------------------------- */

    // Рахуємо на льоту з чернетки, а не беремо збережене: правиш кількість —
    // звірка ворушиться одразу, ще до збереження.
    const draftSum = useMemo(
        () => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0),
        [rows]
    );
    const draftTotal = head.total_amount == null || head.total_amount === '' ? null : Number(head.total_amount);
    const diff = draftTotal == null ? null : Math.round((draftTotal - draftSum) * 100) / 100;
    const reconciled = draftTotal != null && Math.abs(diff) < 1;
    const pricePerKw = (draftTotal && Number(head.capacity_kw))
        ? Math.round((draftTotal / Number(head.capacity_kw)) * 10) / 10 : null;

    const isHistoric = offer && !offer.is_current;
    const editable = canEdit && offer && !isHistoric;

    // Розкладка рядків КП за роллю для складу. Потребою стає тільки
    // обладнання: комплекти й послуги в номенклатуру не лягають.
    const byRole = useMemo(() => {
        const g = { equipment: [], bundle: [], service: [] };
        rows.forEach(r => g[needRoleOf(r.category_key)].push(r));
        return g;
    }, [rows]);
    const mappedCount = byRole.equipment.filter(r => r.nomenclature_id).length;

    /* --- Редагування ---------------------------------------------------- */

    const patchHead = (key, value) => { setHead(h => ({ ...h, [key]: value })); setDirty(true); };

    const patchRow = (index, key, value) => {
        setRows(prev => prev.map((r, i) => (i === index ? { ...r, [key]: value, is_manual: true } : r)));
        setDirty(true);
    };

    const addRow = () => { setRows(prev => [...prev, emptyRow(prev.length + 1)]); setDirty(true); };

    const removeRow = (index) => {
        setRows(prev => {
            const row = prev[index];
            if (row?.id) setRemovedIds(ids => [...ids, row.id]);
            return prev.filter((_, i) => i !== index);
        });
        setDirty(true);
    };

    const numOrNull = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

    const handleSave = async () => {
        if (!offer) return;
        setSaving(true);
        try {
            const { error: headErr } = await supabase.from('commercial_offers').update({
                total_amount: numOrNull(head.total_amount),
                currency: head.currency || 'USD',
                capacity_kw: numOrNull(head.capacity_kw),
                inverter_kw: numOrNull(head.inverter_kw),
                battery_kwh: numOrNull(head.battery_kwh),
                station_type: head.station_type || null,
                mount_type: head.mount_type || null,
                updated_at: new Date().toISOString(),
            }).eq('id', offer.id);
            if (headErr) throw headErr;

            if (removedIds.length) {
                const { error } = await supabase
                    .from('commercial_offer_items').delete().in('id', removedIds);
                if (error) throw error;
            }

            const asPayload = (r, i) => ({
                offer_id: offer.id,
                sort_order: i + 1,
                category_key: r.category_key || null,
                category_label: r.category_key ? categoryLabel(r.category_key) : (r.category_label || null),
                name: r.name || null,
                model: r.model || null,
                quantity: numOrNull(r.quantity),
                unit: r.unit || null,
                unit_price: numOrNull(r.unit_price),
                amount: numOrNull(r.amount),
                is_by_fact: !!r.is_by_fact,
                is_merged: !!r.is_merged,
                is_manual: !!r.is_manual,
                updated_at: new Date().toISOString(),
            });

            for (let i = 0; i < rows.length; i += 1) {
                if (!rows[i].id) continue;
                const { error } = await supabase.from('commercial_offer_items')
                    .update(asPayload(rows[i], i)).eq('id', rows[i].id);
                if (error) throw error;
            }

            const toInsert = rows.map(asPayload).filter((_, i) => !rows[i].id);
            if (toInsert.length) {
                const { error } = await supabase.from('commercial_offer_items').insert(toInsert);
                if (error) throw error;
            }

            showToast('Оцифровану КП збережено', 'success');
            await load(offer.id);
            onTotalApplied?.();
        } catch (e) {
            showToast(humanError(e), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirm = async () => {
        if (!offer) return;
        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            let empId = null;
            if (user?.id) {
                const { data: emp } = await supabase
                    .from('employees').select('id').eq('user_id', user.id).maybeSingle();
                empId = emp?.id || null;
            }
            const { error } = await supabase.from('commercial_offers').update({
                status: 'confirmed', reviewed_by: empId, reviewed_at: new Date().toISOString(),
            }).eq('id', offer.id);
            if (error) throw error;
            showToast('КП підтверджено', 'success');
            await load(offer.id);
        } catch (e) {
            showToast(humanError(e), 'error');
        } finally {
            setSaving(false);
        }
    };

    // Явна команда «сума з КП — головна». Автоматика на це не здатна:
    // вона свідомо не чіпає цифру, яку хтось уже вводив руками.
    const handleApplyTotal = async () => {
        if (!offer) return;
        setSaving(true);
        try {
            const { error } = await supabase.rpc('apply_offer_total', {
                p_offer_id: offer.id, p_force: true,
            });
            if (error) throw error;
            showToast('Вартість угоди взято з КП', 'success');
            onTotalApplied?.();
        } catch (e) {
            showToast(humanError(e), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCreateManual = async () => {
        setSaving(true);
        try {
            const { error } = await supabase.rpc('save_commercial_offer', {
                p_installation_custom_id: Number(installationId),
                p_offer: { status: 'manual', currency: 'USD' },
                p_items: [],
            });
            if (error) throw error;
            showToast('Порожню КП створено — заповніть позиції', 'success');
            await load();
        } catch (e) {
            showToast(humanError(e), 'error');
        } finally {
            setSaving(false);
        }
    };

    /* --- Потреба об'єкта --------------------------------------------------- */

    const currentEmployeeId = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.id) return null;
        const { data: emp } = await supabase
            .from('employees').select('id').eq('user_id', user.id).maybeSingle();
        return emp?.id || null;
    };

    // Перезбирає чернетку потреби з поточних позицій КП. Потрібна, коли
    // виправили модель, кількість або прив'язку до складу.
    const handleSyncNeed = async () => {
        if (!offer) return;
        setNeedBusy(true);
        try {
            const r = await syncOfferNeed(offer.id, nomCtx);
            if (!r.ok) throw new Error(r.error || 'не вдалося зібрати потребу');
            showToast(`Потреба зібрана: ${r.mapped} з ${r.equipment} позицій обладнання`, 'success');
            await load(offer.id);
        } catch (e) {
            showToast(humanError(e), 'error');
        } finally {
            setNeedBusy(false);
        }
    };

    const handleConfirmNeed = async () => {
        if (!offer) return;
        setNeedBusy(true);
        try {
            const r = await confirmOfferNeed(offer.id, await currentEmployeeId());
            if (!r.ok) {
                showToast(CONFIRM_REFUSAL[r.reason] || r.reason || 'Не вдалося затвердити', 'error');
                return;
            }
            showToast(`Потреба працює в забезпеченні: позицій ${r.items}`, 'success');
            setNeed(await loadOfferNeedState(installationId));
        } catch (e) {
            showToast(humanError(e), 'error');
        } finally {
            setNeedBusy(false);
        }
    };

    // Ручна прив'язка рядка КП до позиції складу. Позначається як manual —
    // автоматичне співставлення її більше не перебиває.
    const handleMapItem = async (itemId, nomenclatureId) => {
        setNeedBusy(true);
        try {
            const { error } = await supabase.from('commercial_offer_items').update({
                nomenclature_id: nomenclatureId || null,
                match_source: nomenclatureId ? 'manual' : null,
                updated_at: new Date().toISOString(),
            }).eq('id', itemId);
            if (error) throw error;
            await syncOfferNeed(offer.id, nomCtx);
            await load(offer.id);
        } catch (e) {
            showToast(humanError(e), 'error');
        } finally {
            setNeedBusy(false);
        }
    };

    /* --- Вигляд ---------------------------------------------------------- */

    if (loading) {
        return (
            <div className={`${T.card} ${T.padLoose} flex items-center gap-2 text-slate-400 text-[13px]`}>
                <FaSpinner className="animate-spin" /> Завантаження КП…
            </div>
        );
    }

    if (!offer) {
        return (
            <div className={`${T.card} ${T.padLoose} text-center`}>
                <FaFileInvoiceDollar className="mx-auto text-3xl text-slate-200 mb-3" />
                <div className={T.h2}>Комерційної пропозиції ще немає</div>
                <p className="text-[13px] text-slate-500 mt-1 mb-4 max-w-md mx-auto">
                    Оцифровка з'явиться сама, щойно менеджер завантажить КП на етапі «КП»
                    або у вкладці «Документи». Якщо файла не буде — внесіть цифри руками.
                </p>
                {canEdit && (
                    <Btn variant="accent" icon={FaPlus} onClick={handleCreateManual} disabled={saving}>
                        Внести КП вручну
                    </Btn>
                )}
            </div>
        );
    }

    const status = STATUS_INFO[offer.status] || STATUS_INFO.parsed;

    return (
        <div className="space-y-4">

            {/* ШАПКА */}
            <div className={T.card}>
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
                    <div className="flex items-center gap-2 min-w-0">
                        <FaFileInvoiceDollar className="text-indigo-500 flex-shrink-0" />
                        <span className={T.h2}>Комерційна пропозиція</span>
                        <Chip tone={status.tone}>{status.label}</Chip>
                        <Chip tone="neutral">версія {offer.version}</Chip>
                        {isHistoric && <Chip tone="warn">архівна</Chip>}
                    </div>

                    <div className="flex items-center gap-2">
                        {versions.length > 1 && (
                            <div className="relative">
                                <select
                                    className={`${T.select} h-8 pr-8 text-[12px]`}
                                    value={viewVersionId || ''}
                                    onChange={(e) => load(Number(e.target.value))}
                                >
                                    {versions.map(v => (
                                        <option key={v.id} value={v.id}>
                                            в. {v.version}{v.is_current ? ' · поточна' : ''}
                                            {v.total_amount != null ? ` · ${num(v.total_amount)} ${v.currency || ''}` : ''}
                                        </option>
                                    ))}
                                </select>
                                <FaChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] pointer-events-none" />
                            </div>
                        )}
                        {offer.source_file_url && (
                            <a href={offer.source_file_url} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-300 bg-white text-[12px] font-bold text-slate-700 hover:bg-slate-50">
                                <FaExternalLinkAlt size={11} /> Оригінал
                            </a>
                        )}
                    </div>
                </div>

                {/* ЗВІРКА — головна відповідь на питання «чи можна вірити цифрі» */}
                <div className="px-4 pt-3">
                    {offer.status === 'failed' ? (
                        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] ${TONE.danger.chip}`}>
                            <FaExclamationTriangle className="mt-0.5 flex-shrink-0" />
                            <span>
                                <b>Файл не розпізнався.</b> {offer.parse_warning || ''} Цифри доведеться внести руками.
                            </span>
                        </div>
                    ) : reconciled ? (
                        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] ${TONE.ok.chip}`}>
                            <FaCheck className="mt-0.5 flex-shrink-0" />
                            <span>
                                <b>Звірка зійшлася.</b> Сума позицій {num(draftSum)} = підсумок у документі {num(draftTotal)}.
                            </span>
                        </div>
                    ) : draftTotal == null ? (
                        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] ${TONE.warn.chip}`}>
                            <FaExclamationTriangle className="mt-0.5 flex-shrink-0" />
                            <span>
                                <b>Підсумкову суму не знайдено.</b> Позицій розібрано {rows.length}, їхня сума {num(draftSum)}.
                                Впишіть суму угоди вручну або візьміть суму позицій.
                            </span>
                        </div>
                    ) : (
                        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] ${TONE.warn.chip}`}>
                            <FaExclamationTriangle className="mt-0.5 flex-shrink-0" />
                            <span>
                                <b>Розбіжність {num(diff)}.</b> Сума позицій {num(draftSum)}, у документі {num(draftTotal)}.
                                {offer.has_by_fact
                                    ? ' Серед позицій є «згідно фактичних витрат» — така різниця нормальна.'
                                    : ' Схоже, якийсь рядок не дочитався: подивіться текст OCR нижче.'}
                            </span>
                        </div>
                    )}
                </div>

                {/* ЦИФРИ ШАПКИ */}
                <div className="p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {HEAD_FIELDS.map(f => (
                        <div key={f.key}>
                            <div className={`${T.label} mb-1`}>{f.label}</div>
                            {editable ? (
                                <input
                                    type="number" step="0.01" className={`${T.input} h-9`}
                                    value={head[f.key] ?? ''}
                                    onChange={(e) => patchHead(f.key, e.target.value)}
                                />
                            ) : (
                                <div className={`${T.num} text-[15px]`}>
                                    {head[f.key] != null ? num(head[f.key]) : '—'}
                                    <span className="text-[10px] font-bold text-slate-400 ml-1">{f.unit}</span>
                                </div>
                            )}
                        </div>
                    ))}
                    <div>
                        <div className={`${T.label} mb-1`}>Ціна за кВт</div>
                        <div className={`${T.num} text-[15px]`}>
                            {pricePerKw != null ? num(pricePerKw) : '—'}
                            <span className="text-[10px] font-bold text-slate-400 ml-1">{offer.currency}</span>
                        </div>
                    </div>
                    <div className="min-w-0">
                        <div className={`${T.label} mb-1`}>Тип · монтаж</div>
                        <div className="text-[12.5px] font-bold text-slate-700 truncate" title={head.station_type || ''}>
                            {head.station_type || '—'}
                            {head.mount_type ? ` · ${head.mount_type}` : ''}
                        </div>
                    </div>
                </div>

                {/* ДІЇ */}
                {canEdit && (
                    <div className="px-4 pb-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                        {editable && (
                            <Btn variant="accent" icon={FaCheck} onClick={handleSave} disabled={saving || !dirty}>
                                {saving ? 'Збереження…' : 'Зберегти зміни'}
                            </Btn>
                        )}
                        {editable && offer.status !== 'confirmed' && (
                            <Btn icon={FaCheck} onClick={handleConfirm} disabled={saving || dirty}>
                                Підтвердити КП
                            </Btn>
                        )}
                        <Btn icon={FaArrowRight} onClick={handleApplyTotal} disabled={saving || draftTotal == null || dirty}>
                            Взяти суму у вартість угоди
                        </Btn>
                        {dirty && <span className="text-[11px] text-amber-600 font-bold">є незбережені правки</span>}
                    </div>
                )}
            </div>

            {/* ПОЗИЦІЇ */}
            <div className={T.card}>
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                    <span className={T.h2}>Позиції ({rows.length})</span>
                    {editable && <Btn size="sm" icon={FaPlus} onClick={addRow}>Додати рядок</Btn>}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[840px]">
                        <thead>
                            <tr>
                                <th className={`${T.th} text-left w-[170px]`}>Категорія</th>
                                <th className={`${T.th} text-left`}>Позиція / модель</th>
                                <th className={`${T.th} text-right w-[110px]`}>К-сть</th>
                                <th className={`${T.th} text-left w-[70px]`}>Од.</th>
                                <th className={`${T.th} text-right w-[110px]`}>Ціна</th>
                                <th className={`${T.th} text-right w-[120px]`}>Сума</th>
                                {editable && <th className={`${T.th} w-[44px]`} />}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={editable ? 7 : 6} className={`${T.td} text-center text-slate-400 py-6`}>
                                        Позицій немає
                                    </td>
                                </tr>
                            )}
                            {rows.map((r, i) => (
                                <tr key={r.id ?? `new-${i}`} className="border-t border-slate-100 hover:bg-slate-50/50">
                                    <td className={T.td}>
                                        {editable ? (
                                            <select className={`${T.select} h-8 text-[12px]`}
                                                value={r.category_key || ''}
                                                onChange={(e) => patchRow(i, 'category_key', e.target.value)}>
                                                <option value="">— не визначено —</option>
                                                {CATEGORIES.map(c => (
                                                    <option key={c.key} value={c.key}>{c.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="font-bold text-[12.5px] text-slate-800">
                                                {r.category_label || categoryLabel(r.category_key)}
                                            </span>
                                        )}
                                    </td>
                                    <td className={T.td}>
                                        {editable ? (
                                            <input type="text" className={`${T.input} h-8 text-[12px]`}
                                                value={r.model || r.name || ''}
                                                onChange={(e) => patchRow(i, 'model', e.target.value)} />
                                        ) : (
                                            <div className="text-[12.5px] text-slate-700">
                                                {r.model || r.name || '—'}
                                                {r.is_merged && <Chip tone="neutral" className="ml-2">об'єднаний рядок</Chip>}
                                            </div>
                                        )}
                                    </td>
                                    <td className={`${T.td} text-right`}>
                                        {editable ? (
                                            <input type="number" step="0.01" className={`${T.input} h-8 text-[12px] text-right`}
                                                value={r.quantity ?? ''}
                                                onChange={(e) => patchRow(i, 'quantity', e.target.value)} />
                                        ) : (
                                            <span className="tabular-nums">{r.quantity != null ? num(r.quantity) : '—'}</span>
                                        )}
                                    </td>
                                    <td className={T.td}>
                                        {editable ? (
                                            <input type="text" className={`${T.input} h-8 text-[12px]`}
                                                value={r.unit || ''}
                                                onChange={(e) => patchRow(i, 'unit', e.target.value)} />
                                        ) : (
                                            <span className="text-[12px] text-slate-500">{r.unit || ''}</span>
                                        )}
                                    </td>
                                    <td className={`${T.td} text-right`}>
                                        {editable ? (
                                            <input type="number" step="0.01" className={`${T.input} h-8 text-[12px] text-right`}
                                                value={r.unit_price ?? ''}
                                                onChange={(e) => patchRow(i, 'unit_price', e.target.value)} />
                                        ) : (
                                            <span className="tabular-nums">{r.unit_price != null ? num(r.unit_price) : '—'}</span>
                                        )}
                                    </td>
                                    <td className={`${T.td} text-right`}>
                                        {editable ? (
                                            <input type="number" step="0.01" className={`${T.input} h-8 text-[12px] text-right font-bold`}
                                                value={r.amount ?? ''}
                                                onChange={(e) => patchRow(i, 'amount', e.target.value)} />
                                        ) : r.is_by_fact ? (
                                            <Chip tone="warn">за фактом</Chip>
                                        ) : (
                                            <span className="tabular-nums font-bold">{r.amount != null ? num(r.amount) : '—'}</span>
                                        )}
                                    </td>
                                    {editable && (
                                        <td className={T.td}>
                                            <IconBtn icon={FaTrash} label="Видалити рядок" variant="softDanger"
                                                onClick={() => removeRow(i)} />
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                                <td className={T.td} colSpan={5}>
                                    <span className={T.label}>Сума позицій</span>
                                </td>
                                <td className={`${T.td} text-right`}>
                                    <span className={`${T.num} text-[14px]`}>{num(draftSum)}</span>
                                </td>
                                {editable && <td className={T.td} />}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* ПОТРЕБА ОБ'ЄКТА — той самий розбір, але для складу */}
            {needReady && (
            <div className={T.card}>
                <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
                    <div className="flex items-center gap-2 min-w-0">
                        <FaBoxes className="text-indigo-500 flex-shrink-0" />
                        <span className={T.h2}>Потреба об'єкта</span>
                        <Tip width={320} text="Обладнання з КП стає потребою об'єкта автоматично при оцифровці — закупівля бачить, що треба, на кілька етапів раніше за комплектацію. Виправлена тут прив'язка одразу оновлює потребу. Комплекти (конструкція, захист, заземлення) сюди не потрапляють: їх розписує комплектація." />
                        <Chip tone={(NEED_STATUS_LABEL[need?.need_status] || NEED_STATUS_LABEL.none).tone}>
                            {(NEED_STATUS_LABEL[need?.need_status] || NEED_STATUS_LABEL.none).label}
                        </Chip>
                    </div>
                    {editable && (
                        <Btn size="sm" icon={FaSyncAlt} onClick={handleSyncNeed} disabled={needBusy}>
                            {needBusy ? 'Збираємо…' : 'Перезібрати'}
                        </Btn>
                    )}
                </div>

                <div className="p-4 space-y-4">
                    {byRole.equipment.length === 0 ? (
                        <p className="text-[13px] text-slate-400 italic">
                            У цій пропозиції немає позицій обладнання — переносити нічого.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[560px]">
                                <thead>
                                    <tr>
                                        <th className={`${T.th} text-left`}>Рядок КП</th>
                                        <th className={`${T.th} text-right w-[90px]`}>К-сть</th>
                                        <th className={`${T.th} text-left w-[300px]`}>Позиція складу</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {byRole.equipment.map(r => {
                                        const pool = (nomCtx && (nomCtx.pools[r.category_key] || nomCtx.nomenclatures)) || [];
                                        const src = r.match_source;
                                        const tone = !r.nomenclature_id ? 'danger'
                                            : src === 'fuzzy' ? 'warn' : 'ok';
                                        const srcLabel = !r.nomenclature_id ? 'не впізнано'
                                            : src === 'memory' ? 'зі словника'
                                                : src === 'manual' ? 'вручну'
                                                    : src === 'fuzzy' ? 'за схожістю' : 'точний збіг';
                                        return (
                                            <tr key={r.id} className="border-t border-slate-100">
                                                <td className={T.td}>
                                                    <div className="font-bold text-[12.5px] text-slate-800">
                                                        {r.category_label || categoryLabel(r.category_key)}
                                                    </div>
                                                    <div className="text-[11.5px] text-slate-500 truncate max-w-[240px]" title={r.model || r.name || ''}>
                                                        {r.model || r.name || '—'}
                                                    </div>
                                                </td>
                                                <td className={`${T.td} text-right tabular-nums`}>
                                                    {r.quantity != null ? num(r.quantity) : '—'}
                                                    <span className="text-[10px] text-slate-400 ml-1">{r.unit || ''}</span>
                                                </td>
                                                <td className={T.td}>
                                                    {editable && nomCtx ? (
                                                        <select
                                                            className={`${T.select} h-8 text-[12px]`}
                                                            value={r.nomenclature_id || ''}
                                                            disabled={needBusy}
                                                            onChange={(e) => handleMapItem(r.id, e.target.value ? Number(e.target.value) : null)}
                                                        >
                                                            <option value="">— не співставлено —</option>
                                                            {pool.map(n => (
                                                                <option key={n.id} value={n.id}>
                                                                    {[n.brand, n.name].filter(Boolean).join(' ')}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span className="text-[12.5px] text-slate-700">
                                                            {r.nomenclature_id
                                                                ? (nomCtx?.nomenclatures.find(n => n.id === r.nomenclature_id)?.name || `#${r.nomenclature_id}`)
                                                                : '—'}
                                                        </span>
                                                    )}
                                                    <Chip tone={tone} className="mt-1">{srcLabel}</Chip>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {(byRole.bundle.length > 0 || byRole.service.length > 0) && (
                        <div className={`${T.inset} px-3 py-2.5`}>
                            <div className={`${T.label} mb-1.5`}>Лишається поза складом</div>
                            <div className="flex flex-wrap gap-1.5">
                                {[...byRole.bundle, ...byRole.service].map(r => (
                                    <Chip key={r.id} tone="neutral">
                                        {r.category_label || categoryLabel(r.category_key)}
                                        <span className="opacity-60 ml-1">· {NEED_ROLE_LABEL[needRoleOf(r.category_key)]}</span>
                                    </Chip>
                                ))}
                            </div>
                        </div>
                    )}

                    {canEdit && (
                        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
                            {/* Кнопка потрібна лише коли автоматика відступила:
                                зазвичай потреба вже затверджена сама */}
                            {need?.need_status !== 'confirmed' && need?.need_status !== 'superseded' && (
                                <Btn
                                    variant="accent"
                                    icon={FaCheck}
                                    onClick={handleConfirmNeed}
                                    disabled={needBusy || mappedCount === 0}
                                >
                                    Затвердити потребу
                                </Btn>
                            )}
                            <span className="text-[12px] text-slate-500">
                                співставлено {mappedCount} з {byRole.equipment.length}
                                {need?.need_status === 'confirmed' && ' · працює в забезпеченні'}
                                {need?.need_status === 'superseded' && ' · замінена комплектацією'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
            )}

            {/* СИРИЙ ТЕКСТ OCR — без нього перевірити розбіжність нічим */}
            {offer.raw_text && (
                <div className={T.card}>
                    <button type="button" onClick={() => setShowRaw(v => !v)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50">
                        <span className="flex items-center gap-2">
                            <FaHistory className="text-slate-400" />
                            <span className={T.h2}>Текст від OCR</span>
                            <span className={T.dim}>
                                рушій {offer.ocr_engine || '—'} · мова {offer.ocr_language || '—'}
                            </span>
                        </span>
                        <FaChevronDown className={`text-slate-400 text-[11px] transition-transform ${showRaw ? 'rotate-180' : ''}`} />
                    </button>
                    {showRaw && (
                        <pre className="px-4 pb-4 text-[11px] leading-relaxed font-mono text-slate-600 whitespace-pre-wrap break-words max-h-96 overflow-auto">
                            {offer.raw_text}
                        </pre>
                    )}
                </div>
            )}
        </div>
    );
}
