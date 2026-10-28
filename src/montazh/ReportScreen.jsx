// =====================================================================
//  K-CORE · Монтаж · «Звіт»
//
//  Один звіт на об'єкт за день. Здає бригадир за всю бригаду (якщо в
//  бригаді бригадира немає — будь-хто з неї); інші додають свої фото й
//  коментарі. Три короткі кроки, кнопка «Далі» завжди внизу:
//   1. Що зроблено — лише підетапи, які ще не виконані; фото, коментар,
//      як пройшов день;
//   2. Кабель: скільки метрів пішло (решту матеріалів не звітуємо);
//   3. Гроші від клієнта (офіс підтверджує їх у платежі), плани на завтра
//      і що потрібно — списком зі складу з наявністю або своїми словами.
//  Усе, що вписали, і фото лежать на телефоні, поки не натиснули
//  «Надіслати звіт» (local.js): закрили додаток чи зник зв'язок — нічого
//  не губиться, непотрібне фото прибирається хрестиком. Лише після
//  «Надіслати» фото йдуть на Диск і в гілку Telegram. Немає інтернету —
//  звіт чекає на телефоні й надсилається сам, щойно з'явиться мережа.
//  Після надсилання: підетапи оновлюються в CRM, офіс бачить звіт, бот
//  публікує його в гілці об'єкта (без суми грошей).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    FaCamera, FaPaperPlane, FaPlus, FaMinus, FaTimes, FaCheckCircle, FaChevronDown, FaChevronUp, FaUserFriends, FaSearch,
    FaCloudUploadAlt, FaHistory,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useToast, humanError } from '../ui';
import { taskStatusMeta, normalizeTaskStatus } from '../domain/stages';
import {
    useMontazh, useFresh, isoDay, shiftDay, relDay, fmtDay, loadObjects, groupVisits, objectTitle, isBrigadier,
} from './data';
import {
    REPORT_STAGES, DAY_STATUS, DAY_STATUS_LABEL, CURRENCY_SIGN, fmtAmount, fmtQty, uploadPhotos, driveThumb, ensureReport,
    replaceLists, sendQueued, prepareLocalPhoto, isNetworkError, REPORT_SENT_EVENT,
} from './report';
import { reportKey, localGet, localSet, localDel } from './local';
import { Screen, Card, Label, Pill, Big, Line, Empty, Loading, Segment } from './kit';

const BACK_DAYS = 3;   // дописати звіт можна за три останні дні
// Кабель і провід — категорії складу «Кабель» і «Провід»
const isCable = (c) => /^(кабел|провід|провод)/i.test(c?.category_name || '');
// Пошук: «3х4», «3x4», «3×4» і «3*4» — те саме; дужки не заважають
const normSearch = (s) => String(s || '').toLowerCase()
    .replace(/(\d)\s*[xх×*]\s*(\d)/g, '$1*$2').replace(/[()]/g, ' ').trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };

/* Кнопка в шапці: усі звіти, які людина вже надсилала */
const HistoryLink = () => {
    const navigate = useNavigate();
    return (
        <button type="button" onClick={() => navigate('/m/reports')}
            className="h-11 px-3 rounded-xl border-2 border-slate-300 bg-white text-[13.5px] font-bold text-slate-800 flex items-center gap-1.5 flex-shrink-0">
            <FaHistory size={13} /> Мої звіти
        </button>
    );
};
const dm = (iso) => fmtDay(iso, { day: '2-digit', month: '2-digit' });

export default function ReportScreen() {
    const { who } = useMontazh();
    const [params, setParams] = useSearchParams();
    const fresh = useFresh();
    const [state, setState] = useState(null);

    const load = useCallback(async () => {
        const ok = fresh();
        const today = isoDay();
        const { data: mine } = await supabase.from('installation_workers')
            .select('installation_custom_id, employee_custom_id, work_date, notes')
            .eq('employee_custom_id', who.custom_id).gte('work_date', shiftDay(today, -BACK_DAYS)).lte('work_date', today)
            .not('installation_custom_id', 'is', null);
        const my = groupVisits(mine).sort((a, b) => b.date.localeCompare(a.date));
        const dates = [...new Set(my.map(v => v.date))];
        const ids = [...new Set(my.map(v => v.installationId))];
        const [crewRes, objMap, repRes] = await Promise.all([
            ids.length
                ? supabase.from('installation_workers').select('installation_custom_id, employee_custom_id, work_date, notes')
                    .in('work_date', dates).in('installation_custom_id', ids)
                : Promise.resolve({ data: [] }),
            loadObjects(ids),
            ids.length
                ? supabase.from('installer_reports').select('id, installation_custom_id, work_date, submitted_at')
                    .in('installation_custom_id', ids).in('work_date', dates)
                : Promise.resolve({ data: [] }),
        ]);
        if (!ok()) return;
        setState({ visits: my, crew: groupVisits(crewRes.data), objects: objMap, reports: repRes.data || [] });
    }, [who.custom_id, fresh]);

    useEffect(() => { load(); }, [load]);

    if (!state) return <Screen title="Звіт за день"><Loading /></Screen>;

    const { visits, crew, objects, reports } = state;
    if (!visits.length) {
        return (
            <Screen title="Звіт за день" right={<HistoryLink />}>
                <Card hero>
                    <div className="text-[18px] font-bold">Звітувати поки нема про що</div>
                    <p className="text-[14.5px] text-slate-600 mt-1">Звіт подається за об'єкт, на якому ви стоїте в графіку сьогодні або в останні дні.</p>
                </Card>
            </Screen>
        );
    }

    const keyOf = (v) => `${v.installationId}|${v.date}`;
    const reportOf = (v) => reports.find(r => r.installation_custom_id === v.installationId && r.work_date === v.date);
    const today = isoDay();
    const current = visits.find(v => keyOf(v) === params.get('v'))
        || visits.find(v => v.date === today && !reportOf(v)?.submitted_at)
        || visits.find(v => v.date === today)
        || visits.find(v => !reportOf(v)?.submitted_at)
        || visits[0];
    const crewIds = crew.find(c => c.key === current.key)?.workerIds || current.workerIds;
    const choices = visits.map(v => ({
        key: keyOf(v), label: `${relDay(v.date)} · ${objectTitle(objects.get(v.installationId))}`, done: !!reportOf(v)?.submitted_at,
    }));

    return (
        <ReportForm key={keyOf(current)} visit={current} obj={objects.get(current.installationId)} crewIds={crewIds}
            choices={choices.length > 1 ? choices : null} currentKey={keyOf(current)}
            onChoose={(k) => setParams({ v: k }, { replace: true })} onChanged={load} />
    );
}

/* ================================================================== */

function ReportForm({ visit, obj, crewIds, choices, currentKey, onChoose, onChanged }) {
    const { who, people, canWrite, refreshBadges } = useMontazh();
    const toast = useToast();
    const date = visit.date;
    const objId = visit.installationId;

    const [loading, setLoading] = useState(true);
    const [report, setReport] = useState(null);
    const [stagesNow, setStagesNow] = useState({});
    const [marks, setMarks] = useState({});
    const [photos, setPhotos] = useState([]);       // уже на Диску: [{ url, fid }]
    const [localPhotos, setLocalPhotos] = useState([]);  // ще на телефоні: [{ id, blob, name, url }]
    const [queued, setQueued] = useState(false);    // натиснули «Надіслати» без інтернету — чекає
    const [progress, setProgress] = useState('');
    const [comment, setComment] = useState('');
    const [dayStatus, setDayStatus] = useState('ok');
    const [catalog, setCatalog] = useState([]);     // довідник складу з наявністю (v_pick_nomenclature)
    const [onSite, setOnSite] = useState(new Map()); // кабель на об'єкті: nomenclature_id → скільки лишилось
    const [cableIds, setCableIds] = useState([]);   // які кабелі показані в кроці «Кабель»
    const [used, setUsed] = useState({});           // nomenclature_id → метрів (рядком)
    const [extra, setExtra] = useState([]);         // інший кабель своїми словами: [{ name, quantity, unit }]
    const [needs, setNeeds] = useState([]);         // на завтра: [{ key, nomenclature_id, name, unit, quantity }]
    const [needRows, setNeedRows] = useState([]);
    const [moneyOn, setMoneyOn] = useState(false);
    const [amount, setAmount] = useState('');
    const [currency, setCurrency] = useState('UAH');
    const [plan, setPlan] = useState('');
    const [need, setNeed] = useState('');
    const [usageRows, setUsageRows] = useState([]);
    const [addons, setAddons] = useState([]);
    const [step, setStep] = useState(1);
    const [busy, setBusy] = useState(false);

    const crewPeople = crewIds.map(id => people.get(id)).filter(Boolean);
    const brigs = crewPeople.filter(isBrigadier);
    const canSubmit = canWrite && crewIds.includes(who.custom_id) && (brigs.length === 0 || brigs.some(b => b.custom_id === who.custom_id));

    const load = useCallback(async () => {
        const [rep, st, ss, cat] = await Promise.all([
            supabase.from('installer_reports').select('*').eq('installation_custom_id', objId).eq('work_date', date).maybeSingle(),
            supabase.from('project_stages').select('stage_key, status').eq('installation_custom_id', objId),
            supabase.from('v_object_site_stock').select('nomenclature_id, issued_quantity, on_site_quantity').eq('installation_custom_id', objId),
            supabase.from('v_pick_nomenclature').select('*').order('name'),
        ]);
        const r = rep.data || null;
        const now = Object.fromEntries((st.data || []).map(s => [s.stage_key, s.status]));
        setStagesNow(now);
        const all = cat.data || [];
        setCatalog(all);
        // Кабель і провід, що вже видані на цей об'єкт, — одразу в списку
        const cableSet = new Set(all.filter(isCable).map(c => c.id));
        const site = new Map((ss.data || []).filter(s => cableSet.has(s.nomenclature_id) && Number(s.issued_quantity) > 0)
            .map(s => [s.nomenclature_id, Number(s.on_site_quantity || 0)]));
        setOnSite(site);
        setReport(r);
        let ids = [...site.keys()];
        if (r) {
            const [u, a, nd] = await Promise.all([
                supabase.from('installer_report_usage').select('*').eq('report_id', r.id).order('id'),
                supabase.from('installer_report_addons').select('*').eq('report_id', r.id).order('created_at'),
                supabase.from('installer_report_needs').select('*').eq('report_id', r.id).order('id'),
            ]);
            setUsageRows(u.data || []);
            setAddons(a.data || []);
            setNeedRows(nd.data || []);
            setNeeds((nd.data || []).map(x => ({ key: `n${x.id}`, nomenclature_id: x.nomenclature_id, name: x.name, unit: x.unit || '', quantity: x.quantity != null ? String(x.quantity) : '' })));
            ids = [...new Set([...ids, ...(u.data || []).filter(x => x.nomenclature_id).map(x => x.nomenclature_id)])];
            setMarks(r.done_stages || {});
            setPhotos((r.photos || []).map((url, i) => ({ url, fid: (r.photo_file_ids || [])[i] || null })));
            setComment(r.comment || '');
            setDayStatus(r.day_status || 'ok');
            setMoneyOn(r.money_amount != null);
            setAmount(r.money_amount != null ? String(r.money_amount) : '');
            setCurrency(r.money_currency || 'UAH');
            setPlan(r.plan_tomorrow || '');
            setNeed(r.need_tomorrow || '');
            setUsed(Object.fromEntries((u.data || []).filter(x => x.nomenclature_id).map(x => [x.nomenclature_id, String(x.quantity)])));
            setExtra((u.data || []).filter(x => !x.nomenclature_id).map(x => ({ name: x.name, quantity: String(x.quantity), unit: x.unit || '' })));
        } else {
            // Підетапи, які вже «в роботі», так і показуємо
            setMarks(Object.fromEntries(REPORT_STAGES
                .filter(t => normalizeTaskStatus(t.key, now[t.key]) === 'started').map(t => [t.key, 'started'])));
        }

        // Те, що вписано на телефоні, — свіже за базу (могли заповнювати без зв'язку)
        const key = reportKey(objId, date);
        const local = r?.submitted_at ? null : await localGet(key);
        if (r?.submitted_at) localDel(key);
        if (local?.form) {
            const f = local.form;
            setMarks(f.marks || {});
            setComment(f.comment || '');
            setDayStatus(f.dayStatus || 'ok');
            setMoneyOn(!!f.moneyOn);
            setAmount(f.amount || '');
            setCurrency(f.currency || 'UAH');
            setPlan(f.plan || '');
            setNeed(f.need || '');
            setUsed(f.used || {});
            setExtra(f.extra || []);
            setNeeds(f.needs || []);
            ids = [...new Set([...ids, ...(f.cableIds || [])])];
            if (Array.isArray(local.photos)) setPhotos(local.photos);
        }
        setLocalPhotos(old => {
            old.forEach(p => URL.revokeObjectURL(p.url));
            return (local?.localPhotos || []).filter(p => p?.blob).map(p => ({ ...p, url: URL.createObjectURL(p.blob) }));
        });
        setQueued(!!local?.pending);
        setCableIds(ids);
        setLoading(false);
    }, [objId, date]);

    const byId = useMemo(() => new Map(catalog.map(c => [c.id, c])), [catalog]);

    useEffect(() => { load(); }, [load]);

    // Звіт із черги надіслано (інтернет з'явився) — показуємо надісланий
    const key = reportKey(objId, date);
    useEffect(() => {
        const on = (e) => { if (e.detail?.key === key) load(); };
        window.addEventListener(REPORT_SENT_EVENT, on);
        return () => window.removeEventListener(REPORT_SENT_EVENT, on);
    }, [key, load]);

    // Кабель і потреби на завтра — рядки для бази
    const buildLists = () => ({
        usage: [
            ...cableIds.filter(id => num(used[id]) > 0).map(id => ({
                nomenclature_id: id, name: byId.get(id)?.name || 'кабель', quantity: num(used[id]), unit: byId.get(id)?.unit || 'м',
            })),
            ...extra.filter(e => e.name.trim() && num(e.quantity) > 0).map(e => ({
                nomenclature_id: null, name: e.name.trim(), quantity: num(e.quantity), unit: (e.unit || '').trim() || 'м',
            })),
        ],
        needs: needs.filter(n => n.name.trim()).map(n => ({
            nomenclature_id: n.nomenclature_id || null, name: n.name.trim(),
            quantity: num(n.quantity) > 0 ? num(n.quantity) : null, unit: n.unit || null,
        })),
    });

    const textFields = () => ({
        done_stages: marks,
        comment: comment.trim() || null,
        day_status: dayStatus,
        money_amount: moneyOn && num(amount) > 0 ? num(amount) : null,
        money_currency: moneyOn && num(amount) > 0 ? currency : null,
        money_note: null,
        plan_tomorrow: plan.trim() || null,
        need_tomorrow: need.trim() || null,
    });

    const formSnapshot = () => ({ marks, comment, dayStatus, moneyOn, amount, currency, plan, need, used, extra, needs, cableIds });
    const plainLocal = () => localPhotos.map(({ id, blob, name }) => ({ id, blob, name }));

    // Усе вписане — одразу на телефон (через мить після зміни)
    useEffect(() => {
        if (loading || queued || report?.submitted_at || !canSubmit) return undefined;
        const t = setTimeout(() => {
            localSet(key, { form: formSnapshot(), photos, localPhotos: plainLocal(), pending: false });
        }, 400);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading, queued, report?.submitted_at, canSubmit, key, marks, comment, dayStatus, moneyOn, amount, currency, plan, need, used, extra, needs, cableIds, photos, localPhotos]);

    // Чернетка в базі (без фото) — щоб бригада бачила, що звіт уже пишуть.
    // Лише в ще не надісланий звіт: якщо його вже надіслали з іншого телефона,
    // нічого не перезаписуємо, а показуємо надісланий
    const saveDraft = async () => {
        if (!canSubmit || report?.submitted_at || navigator.onLine === false) return;
        try {
            const r = report || await ensureReport(objId, date);
            const { data } = await supabase.from('installer_reports').update(textFields())
                .eq('id', r.id).is('submitted_at', null).select('*');
            if (!data?.length) { load(); return; }
            setReport(data[0]);
            const l = buildLists();
            await replaceLists(r.id, l.usage, l.needs);
        } catch { /* чернетка не критична — усе й так лежить на телефоні */ }
    };

    const goStep = (n) => { saveDraft(); setStep(n); };

    // Фото — лише на телефоні, доки не натиснули «Надіслати звіт»
    const addLocalPhotos = async (files) => {
        const list = [...(files || [])].filter(f => f.type?.startsWith('image/'));
        for (const f of list) {
            const p = await prepareLocalPhoto(f);
            setLocalPhotos(x => [...x, { ...p, url: URL.createObjectURL(p.blob) }]);
        }
    };
    const removeLocalPhoto = (id) => setLocalPhotos(x => {
        const gone = x.find(p => p.id === id);
        if (gone) URL.revokeObjectURL(gone.url);
        return x.filter(p => p.id !== id);
    });

    const OFFLINE_MSG = "Немає інтернету. Звіт збережено на телефоні — надішлеться сам, щойно з'явиться зв'язок";

    const submit = async () => {
        if (!photos.length && !localPhotos.length) { toast('Додайте хоча б одне фото', 'warning'); setStep(1); return; }
        if (moneyOn && !(num(amount) > 0)) { toast('Вкажіть суму, яку отримали від клієнта', 'warning'); return; }

        // Спершу — у чергу на телефоні; звідти й надсилаємо. Зірветься зв'язок — лишиться в черзі
        const l = buildLists();
        const payload = {
            objId, date, fields: textFields(), photos, localPhotos: plainLocal(), usage: l.usage, needs: l.needs, crewIds,
            author: { id: who.id, name: who.name, email: who.email },
            stageChanges: Object.entries(marks).filter(([k, s]) => s && normalizeTaskStatus(k, stagesNow[k]) !== s),
        };
        await localSet(key, { form: formSnapshot(), photos, localPhotos: payload.localPhotos, pending: true, payload });
        if (navigator.onLine === false) { setQueued(true); refreshBadges?.(); toast(OFFLINE_MSG, 'warning'); return; }

        setBusy(true);
        try {
            const res = await sendQueued(key, setProgress);
            if (!res) { setQueued(true); return; }   // його саме надсилає черга
            toast(res.already ? 'Бригада вже надіслала звіт з іншого телефона' : 'Звіт надіслано', res.already ? 'info' : 'success');
            (res.stageErrors || []).forEach(e => toast(humanError(e), 'error'));
            onChanged();
        } catch (e) {
            if (isNetworkError(e)) {
                setQueued(true);
                refreshBadges?.();
                toast(OFFLINE_MSG, 'warning');
            } else {
                // Помилка в даних — повертаємо до форми, щоб виправити
                const v = await localGet(key);
                if (v) await localSet(key, { ...v, pending: false });
                toast(humanError(e), 'error');
            }
        } finally {
            setBusy(false);
            setProgress('');
        }
    };

    const unqueue = async () => {
        const v = await localGet(key);
        if (v) await localSet(key, { ...v, pending: false });
        setQueued(false);
    };

    const title = 'Звіт за день';
    const sub = `${relDay(date)} · ${objectTitle(obj)}`;

    if (loading) return <Screen title={title} sub={sub}><Loading /></Screen>;

    /* ----- уже надіслано, або звіт здає інша людина ----- */
    if (report?.submitted_at || !canSubmit) {
        return (
            <Screen title={title} sub={sub} right={<HistoryLink />}>
                {choices && <Picker choices={choices} current={currentKey} onChoose={onChoose} />}
                {report?.submitted_at
                    ? <ReportView report={report} usage={usageRows} needs={needRows} catalog={byId} people={people} />
                    : (
                        <Card hero>
                            <div className="text-[17px] font-bold">Звіт здає {brigs.length ? 'бригадир' : 'бригада'}</div>
                            <p className="text-[14.5px] text-slate-600 mt-1">
                                {brigs.length ? <><b className="text-slate-900">{brigs.map(b => b.name).join(', ')}</b> ще не надіслав звіт. </> : null}
                                Ви можете додати свої фото чи коментар — вони потраплять у той самий звіт.
                            </p>
                        </Card>
                    )}
                <Addons addons={addons} people={people} />
                {canWrite && crewIds.includes(who.custom_id) && (
                    <AddonForm objId={objId} date={date} onAdded={load} />
                )}
            </Screen>
        );
    }

    /* ----- натиснули «Надіслати» без інтернету: чекає на телефоні ----- */
    if (queued) {
        const n = photos.length + localPhotos.length;
        return (
            <Screen title={title} sub={sub}
                bottom={<Big tone="main" icon={FaPaperPlane} disabled={busy} onClick={async () => {
                    setBusy(true);
                    try {
                        const res = await sendQueued(key, setProgress);
                        if (res) { toast('Звіт надіслано', 'success'); onChanged(); }
                    } catch (e) {
                        toast(isNetworkError(e) ? "Зв'язку ще немає — спробуємо самі, щойно з'явиться" : humanError(e), isNetworkError(e) ? 'warning' : 'error');
                    } finally { setBusy(false); setProgress(''); }
                }}>{busy ? (progress || 'Надсилаю…') : 'Спробувати надіслати зараз'}</Big>}>
                <Card hero>
                    <div className="flex items-start gap-3">
                        <FaCloudUploadAlt size={26} className="text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="text-[18px] font-bold">Звіт чекає інтернету</div>
                            <p className="text-[14.5px] text-slate-600 mt-1">
                                Усе збережено на телефоні{n ? `, разом із фото (${n})` : ''}. Звіт надішлеться сам, щойно з'явиться зв'язок і відкриєте «Монтаж».
                            </p>
                        </div>
                    </div>
                </Card>
                <Big small tone="soft" onClick={unqueue} disabled={busy}>Змінити звіт</Big>
            </Screen>
        );
    }

    /* ----- форма ----- */
    // Що вже виконано раніше — у звіті не показуємо: бригада бачить лише те, що лишилось
    const openStages = REPORT_STAGES.filter(t => !taskStatusMeta(t.key, stagesNow[t.key]).done);
    const shownCable = cableIds.map(id => byId.get(id)).filter(Boolean);

    const bottom = step === 1
        ? <Big tone="main" onClick={() => goStep(2)}>Далі: кабель</Big>
        : step === 2
            ? <Big tone="main" onClick={() => goStep(3)}>Далі: гроші й завтра</Big>
            : <Big tone="main" icon={FaPaperPlane} onClick={submit} disabled={busy}>{busy ? (progress || 'Надсилаю…') : 'Надіслати звіт'}</Big>;

    return (
        <Screen title={title} sub={`${sub} · крок ${step} з 3`} onBack={step > 1 ? () => setStep(step - 1) : undefined} bottom={bottom} scrollKey={step}
            right={step === 1 ? <HistoryLink /> : null}>
            {step === 1 && choices && <Picker choices={choices} current={currentKey} onChoose={onChoose} />}

            {step === 1 && (<>
                {crewPeople.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5 px-1">
                        <FaUserFriends size={13} className="text-slate-500" />
                        {crewPeople.map(p => <Pill key={p.custom_id} tone={p.custom_id === who.custom_id ? 'dark' : 'neutral'}>{p.name}</Pill>)}
                    </div>
                )}
                <Card>
                    <Label right={openStages.length < REPORT_STAGES.length ? `виконано ${REPORT_STAGES.length - openStages.length} з ${REPORT_STAGES.length}` : null}>Що зроблено</Label>
                    {openStages.length === 0 && (
                        <div className="py-3 flex items-center gap-2 text-[15px] font-semibold text-emerald-700">
                            <FaCheckCircle size={16} /> Усі етапи монтажу вже виконані
                        </div>
                    )}
                    {openStages.map((t, i) => {
                        const m = marks[t.key] || '';
                        return (
                            <div key={t.key} className={`py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                                <div className="text-[15px] font-semibold text-slate-900">{t.title}</div>
                                <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                                    {[['', 'Не робили'], ['started', 'В роботі'], ['completed', 'Готово']].map(([v, l]) => (
                                        <button key={v} type="button" onClick={() => setMarks(x => ({ ...x, [t.key]: v }))} aria-pressed={m === v}
                                            className={`h-11 rounded-xl border-2 text-[13.5px] font-bold ${m === v
                                                ? (v === 'completed' ? 'bg-emerald-600 border-emerald-600 text-white'
                                                    : v === 'started' ? 'bg-slate-900 border-slate-900 text-white'
                                                        : 'bg-slate-200 border-slate-200 text-slate-600')
                                                : 'bg-white border-slate-300 text-slate-700'}`}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </Card>

                <Card>
                    <Label right={photos.length + localPhotos.length || null}>Фото</Label>
                    <PhotoGrid photos={photos} local={localPhotos} onAddFiles={addLocalPhotos}
                        onRemove={(i) => setPhotos(p => p.filter((_, j) => j !== i))} onRemoveLocal={removeLocalPhoto} />
                </Card>

                <Card>
                    <Label>Коментар</Label>
                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={3}
                        placeholder="Що важливо знати офісу: що не встигли, що змінили, побажання клієнта…"
                        className="w-full rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 py-2.5 text-[15px] resize-y" />
                </Card>

                <Card>
                    <Label>Як пройшов день</Label>
                    <div className="flex flex-wrap gap-1.5">
                        {DAY_STATUS.map(s => (
                            <button key={s.value} type="button" onClick={() => setDayStatus(s.value)} aria-pressed={dayStatus === s.value}
                                className={`h-11 px-3.5 rounded-xl border-2 text-[14px] font-bold ${dayStatus === s.value
                                    ? (s.value === 'ok' ? 'bg-slate-900 border-slate-900 text-white' : 'bg-amber-400 border-amber-400 text-amber-950')
                                    : 'bg-white border-slate-300 text-slate-700'}`}>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </Card>
            </>)}

            {step === 2 && (<>
                <Card>
                    <Label right={shownCable.some(c => onSite.has(c.id)) ? "на об'єкті" : null}>Кабель: скільки пішло сьогодні</Label>
                    {shownCable.length === 0 && <Empty>Кабелю на цей об'єкт ще не видавали — додайте нижче, якщо брали</Empty>}
                    {shownCable.map((c, i) => {
                        const u = used[c.id] ?? '';
                        const left = onSite.get(c.id);
                        const after = left != null ? left - num(u) : null;
                        return (
                            <div key={c.id} className={`py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 text-[15px] font-semibold text-slate-900 break-words">{c.name}</div>
                                    {left != null && <div className="flex-shrink-0 text-[13px] text-slate-500 tabular-nums whitespace-nowrap">{fmtQty(left)} {c.unit}</div>}
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <Stepper value={u} onChange={(v) => setUsed(x => ({ ...x, [c.id]: v }))} />
                                    <span className="text-[13px] text-slate-500 min-w-0">
                                        {num(u) > 0 && after != null
                                            ? <>лишиться <b className={after < 0 ? 'text-rose-600' : 'text-slate-900'}>{fmtQty(after)}</b></>
                                            : c.unit}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                    <CatalogSearch items={catalog.filter(isCable)} exclude={cableIds} placeholder="Додати кабель: ВВГ, ПВС, Solar…"
                        onPick={(c) => setCableIds(ids => [...ids, c.id])} />
                </Card>

                <Card>
                    <Label>Інший кабель, якого немає в списку</Label>
                    {extra.map((e, i) => (
                        <div key={i} className={`py-2 ${i ? 'border-t border-slate-100' : ''}`}>
                            <div className="flex gap-2">
                                <input value={e.name} onChange={ev => setExtra(x => x.map((y, j) => (j === i ? { ...y, name: ev.target.value } : y)))}
                                    placeholder="Марка й переріз, напр. ПВ-3 1×6" className="flex-1 min-w-0 h-11 rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 text-[15px]" />
                                <button type="button" onClick={() => setExtra(x => x.filter((_, j) => j !== i))} aria-label="Прибрати"
                                    className="w-11 h-11 flex-shrink-0 rounded-xl border-2 border-slate-300 flex items-center justify-center text-slate-500"><FaTimes size={13} /></button>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5">
                                <Stepper value={e.quantity} onChange={(v) => setExtra(x => x.map((y, j) => (j === i ? { ...y, quantity: v } : y)))} />
                                <span className="text-[13px] text-slate-500">м</span>
                            </div>
                        </div>
                    ))}
                    <Big small tone="soft" icon={FaPlus} className={extra.length ? 'mt-2' : ''} onClick={() => setExtra(x => [...x, { name: '', quantity: '', unit: 'м' }])}>
                        Вписати свій
                    </Big>
                </Card>
            </>)}

            {step === 3 && (<>
                <Card>
                    <Label>Гроші від клієнта</Label>
                    <Segment value={moneyOn ? 'yes' : 'no'} onChange={(v) => setMoneyOn(v === 'yes')}
                        items={[{ value: 'no', label: 'Не отримували' }, { value: 'yes', label: 'Отримали' }]} />
                    {moneyOn && (
                        <div className="mt-3 flex flex-col gap-2">
                            <div className="flex gap-2">
                                <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal"
                                    placeholder="Сума" aria-label="Сума"
                                    className="flex-1 min-w-0 h-14 rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 text-[22px] font-bold tabular-nums" />
                                <div className="w-[132px] flex-shrink-0">
                                    <Segment value={currency} onChange={setCurrency} items={[{ value: 'UAH', label: '₴' }, { value: 'USD', label: '$' }]} />
                                </div>
                            </div>
                            <p className="text-[13px] text-slate-500">Офіс перевірить і внесе в платежі об'єкта.</p>
                        </div>
                    )}
                </Card>

                <Card>
                    <Label>Що плануємо завтра</Label>
                    <textarea value={plan} onChange={e => setPlan(e.target.value)} rows={2}
                        placeholder="Наприклад: інвертор, електрика в гаражі"
                        className="w-full rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 py-2.5 text-[15px] resize-y" />
                </Card>

                <Card>
                    <Label right={needs.length || null}>Що потрібно на завтра</Label>
                    {needs.map((n, i) => {
                        const c = n.nomenclature_id ? byId.get(n.nomenclature_id) : null;
                        return (
                            <div key={n.key} className={`py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[15px] font-semibold text-slate-900 break-words">{n.name}</div>
                                        {c ? <StockPill c={c} /> : <span className="text-[12.5px] text-slate-500">вписано вручну</span>}
                                    </div>
                                    <button type="button" onClick={() => setNeeds(x => x.filter(y => y.key !== n.key))} aria-label="Прибрати"
                                        className="w-11 h-11 flex-shrink-0 rounded-xl border-2 border-slate-300 flex items-center justify-center text-slate-500"><FaTimes size={13} /></button>
                                </div>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <Stepper value={n.quantity} onChange={(v) => setNeeds(x => x.map(y => (y.key === n.key ? { ...y, quantity: v } : y)))} />
                                    <span className="text-[13px] text-slate-500">{n.unit || 'шт'}</span>
                                </div>
                            </div>
                        );
                    })}
                    <CatalogSearch items={catalog} exclude={needs.map(n => n.nomenclature_id).filter(Boolean)}
                        placeholder="Почніть писати: кабель, автомат, ПЗІП…" allowFree
                        onPick={(c) => setNeeds(x => [...x, { key: `c${c.id}`, nomenclature_id: c.id, name: c.name, unit: c.unit, quantity: '' }])}
                        onFree={(text) => setNeeds(x => [...x, { key: `f${Date.now()}`, nomenclature_id: null, name: text, unit: '', quantity: '' }])} />
                    <textarea value={need} onChange={e => setNeed(e.target.value)} rows={2}
                        placeholder="Ще щось своїми словами (інструмент, техніка…)"
                        className="w-full mt-2 rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 py-2.5 text-[15px] resize-y" />
                </Card>
            </>)}
        </Screen>
    );
}

/* Скільки є на складі: «є 220 м» або «немає» */
function StockPill({ c }) {
    const a = num(c.available);
    return a > 0
        ? <span className="text-[12.5px] font-semibold text-emerald-700">на складі {fmtQty(a)} {c.unit}</span>
        : <span className="text-[12.5px] font-semibold text-rose-600">на складі немає</span>;
}

/*
 * Пошук по довіднику складу з першої літери: під полем — до 8 збігів із
 * наявністю. allowFree — якщо потрібного немає, можна додати своїми словами.
 */
function CatalogSearch({ items, exclude = [], placeholder, onPick, onFree, allowFree }) {
    const [q, setQ] = useState('');
    const found = useMemo(() => {
        const words = normSearch(q).split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const skip = new Set(exclude);
        return items.filter(c => !skip.has(c.id)).filter(c => {
            const hay = normSearch(`${c.name} ${c.brand || ''} ${c.model || ''}`);
            return words.every(w => hay.includes(w));
        }).sort((a, b) => (num(b.available) > 0) - (num(a.available) > 0)).slice(0, 8);
    }, [q, items, exclude]);

    const pick = (c) => { onPick(c); setQ(''); };
    const free = () => { onFree(q.trim()); setQ(''); };

    return (
        <div className="mt-2">
            <label className="flex items-center gap-2 px-3 h-12 rounded-xl border-2 border-slate-300 focus-within:border-slate-900 bg-white">
                <FaSearch size={13} className="text-slate-400 flex-shrink-0" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder}
                    className="flex-1 min-w-0 outline-none text-[15px] bg-transparent" />
                {q && <button type="button" onClick={() => setQ('')} aria-label="Очистити" className="w-8 h-8 -mr-1 flex items-center justify-center text-slate-400"><FaTimes size={12} /></button>}
            </label>
            {q.trim() && (
                <div className="mt-1 rounded-xl border-2 border-slate-200 overflow-hidden bg-white">
                    {found.map(c => (
                        <button key={c.id} type="button" onClick={() => pick(c)}
                            className="w-full text-left px-3 py-2.5 min-h-[48px] border-t border-slate-100 first:border-t-0 flex items-center gap-2">
                            <span className="min-w-0 flex-1 text-[15px] text-slate-900 break-words">{c.name}</span>
                            <Pill tone={num(c.available) > 0 ? 'ok' : 'bad'}>{num(c.available) > 0 ? `є ${fmtQty(c.available)} ${c.unit}` : 'немає'}</Pill>
                        </button>
                    ))}
                    {found.length === 0 && !allowFree && <div className="px-3 py-3 text-[14px] text-slate-500">Нічого не знайдено</div>}
                    {allowFree && (
                        <button type="button" onClick={free}
                            className="w-full text-left px-3 py-2.5 min-h-[48px] border-t border-slate-100 flex items-center gap-2 text-[14.5px] font-semibold text-slate-700">
                            <FaPlus size={11} className="flex-shrink-0" /> <span className="break-words">Додати своїми словами: «{q.trim()}»</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/* Вибір, за який виїзд звіт (кілька об'єктів або дописати вчорашній) */
function Picker({ choices, current, onChoose }) {
    const [open, setOpen] = useState(false);
    const cur = choices.find(c => c.key === current);
    return (
        <Card className="!p-0 overflow-hidden">
            <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
                className="w-full text-left px-3.5 py-2.5 flex items-center gap-2 min-h-[52px]">
                <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Звіт за</span>
                    <span className="block text-[15px] font-semibold text-slate-900 break-words">{cur?.label}</span>
                </span>
                {cur?.done && <Pill tone="ok">надіслано</Pill>}
                {open ? <FaChevronUp size={13} className="text-slate-500" /> : <FaChevronDown size={13} className="text-slate-500" />}
            </button>
            {open && (
                <div className="border-t border-slate-200 px-3.5">
                    {choices.map((c, i) => (
                        <Line key={c.key} first={i === 0} onClick={() => { setOpen(false); onChoose(c.key); }}
                            right={c.done ? <Pill tone="ok">надіслано</Pill> : <Pill tone="warn">чекає</Pill>}>
                            <span className={c.key === current ? 'font-bold text-slate-900' : ''}>{c.label}</span>
                        </Line>
                    ))}
                </div>
            )}
        </Card>
    );
}

/* Кількість: − [число] + */
function Stepper({ value, onChange }) {
    const n = num(value);
    const set = (v) => onChange(v <= 0 ? '' : String(Math.round(v * 100) / 100));
    return (
        <div className="flex items-center gap-1.5 flex-shrink-0">
            <button type="button" onClick={() => set(n - 1)} aria-label="Менше"
                className="w-11 h-11 rounded-xl border-2 border-slate-900 bg-white flex items-center justify-center"><FaMinus size={12} /></button>
            <input value={value} onChange={e => onChange(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0"
                className="w-16 h-11 rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none text-center text-[17px] font-bold tabular-nums" />
            <button type="button" onClick={() => set(n + 1)} aria-label="Більше"
                className="w-11 h-11 rounded-xl border-2 border-slate-900 bg-white flex items-center justify-center"><FaPlus size={12} /></button>
        </div>
    );
}

/*
 * Фото: сітка мініатюр + плитка «додати». Нові фото лежать на телефоні
 * (local) і нікуди не йдуть, доки не натиснуть «Надіслати» — хрестиком
 * їх можна прибрати. photos — уже завантажені на Диск.
 */
function PhotoGrid({ photos = [], local = [], onAddFiles, onRemove, onRemoveLocal, compact, readOnly }) {
    const { canWrite: mayWrite } = useMontazh();
    const canWrite = mayWrite && !readOnly;
    const [preparing, setPreparing] = useState(0);

    const add = async (list) => {
        const n = [...(list || [])].filter(f => f.type?.startsWith('image/')).length;
        if (!n || !onAddFiles) return;
        setPreparing(x => x + n);
        try { await onAddFiles(list); } finally { setPreparing(x => Math.max(0, x - n)); }
    };

    return (
        <div className={`grid ${compact ? 'grid-cols-4' : 'grid-cols-3'} gap-1.5`}>
            {local.map(p => (
                <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    {canWrite && onRemoveLocal && (
                        <button type="button" onClick={() => onRemoveLocal(p.id)} aria-label="Прибрати фото"
                            className="absolute top-1 right-1 w-9 h-9 rounded-lg bg-slate-900/80 text-white flex items-center justify-center"><FaTimes size={12} /></button>
                    )}
                </div>
            ))}
            {Array.from({ length: preparing }, (_, i) => (
                <div key={`prep-${i}`} className="aspect-square rounded-xl border border-slate-200 bg-slate-100 flex items-center justify-center">
                    <span className="w-7 h-7 border-[3px] border-slate-300 border-t-slate-900 rounded-full animate-spin" />
                </div>
            ))}
            {photos.map((p, i) => (
                <div key={p.fid || p.url} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0">
                        {p.fid && <img src={driveThumb(p.fid)} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
                    </a>
                    {onRemove && canWrite && (
                        <button type="button" onClick={() => onRemove(i)} aria-label="Прибрати фото зі звіту"
                            className="absolute top-1 right-1 w-9 h-9 rounded-lg bg-slate-900/80 text-white flex items-center justify-center"><FaTimes size={12} /></button>
                    )}
                </div>
            ))}
            {canWrite && onAddFiles && (
                <label className="aspect-square rounded-xl border-2 border-dashed border-slate-400 bg-white flex flex-col items-center justify-center gap-1 text-slate-600 cursor-pointer">
                    <FaCamera size={20} />
                    <span className="text-[12.5px] font-bold">Додати</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = ''; }} />
                </label>
            )}
        </div>
    );
}

/* Надісланий звіт — коротко, як його бачить офіс */
function ReportView({ report, usage, needs = [], catalog, people }) {
    const author = [...people.values()].find(p => p.id === report.author_id);
    const marked = Object.entries(report.done_stages || {}).filter(([, s]) => s);
    const photos = (report.photos || []).map((url, i) => ({ url, fid: (report.photo_file_ids || [])[i] || null }));
    const at = new Date(report.submitted_at);
    return (<>
        <Card hero>
            <div className="flex items-center gap-3">
                <FaCheckCircle size={26} className="text-emerald-600 flex-shrink-0" />
                <div className="min-w-0">
                    <div className="text-[18px] font-bold">Звіт надіслано</div>
                    <div className="text-[13.5px] text-slate-600">
                        {[author?.name, `${relDay(isoDay(at)).toLowerCase()} о ${at.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`].filter(Boolean).join(' · ')}
                    </div>
                </div>
            </div>
            {marked.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {marked.map(([k, s]) => {
                        const t = REPORT_STAGES.find(x => x.key === k);
                        return <Pill key={k} tone={s === 'completed' ? 'ok' : 'warn'}>{t?.short || k}{s === 'completed' ? ' ✓' : ' · в роботі'}</Pill>;
                    })}
                </div>
            )}
            {report.day_status && report.day_status !== 'ok' && (
                <div className="mt-2"><Pill tone="warn">{DAY_STATUS_LABEL[report.day_status]}</Pill></div>
            )}
            {report.comment && <p className="mt-2.5 text-[15px] text-slate-800 whitespace-pre-line break-words">{report.comment}</p>}
        </Card>

        {photos.length > 0 && (
            <Card>
                <Label right={photos.length}>Фото</Label>
                <PhotoGrid photos={photos} compact readOnly />
            </Card>
        )}

        {usage.length > 0 && (
            <Card>
                <Label>Кабель</Label>
                {usage.map((u, i) => <Line key={i} first={i === 0} right={`${fmtQty(u.quantity)} ${u.unit || ''}`}>{u.name}</Line>)}
            </Card>
        )}

        {report.money_amount != null && (
            <Card>
                <Label>Гроші від клієнта</Label>
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[22px] font-bold tabular-nums">{fmtAmount(report.money_amount)} {CURRENCY_SIGN[report.money_currency] || ''}</span>
                    <Pill tone={report.money_payment_id ? 'ok' : 'warn'}>{report.money_payment_id ? 'офіс вніс у платежі' : 'чекає офісу'}</Pill>
                </div>
                {report.money_note && <p className="text-[14px] text-slate-600 mt-1 break-words">{report.money_note}</p>}
            </Card>
        )}

        {(report.plan_tomorrow || report.need_tomorrow || needs.length > 0) && (
            <Card>
                {report.plan_tomorrow && (<div className="mb-3"><Label>Плани на завтра</Label><p className="text-[15px] whitespace-pre-line break-words">{report.plan_tomorrow}</p></div>)}
                {(needs.length > 0 || report.need_tomorrow) && <Label>Потрібно на завтра</Label>}
                {needs.map((n, i) => {
                    const c = n.nomenclature_id ? catalog?.get(n.nomenclature_id) : null;
                    return (
                        <div key={n.id || i} className={`py-2 flex items-start gap-2 ${i ? 'border-t border-slate-100' : ''}`}>
                            <div className="min-w-0 flex-1">
                                <div className="text-[15px] text-slate-900 break-words">{n.name}</div>
                                {c && <StockPill c={c} />}
                            </div>
                            {n.quantity != null && <b className="text-[15px] tabular-nums whitespace-nowrap">{fmtQty(n.quantity)} {n.unit || ''}</b>}
                        </div>
                    );
                })}
                {report.need_tomorrow && <p className={`text-[15px] whitespace-pre-line break-words ${needs.length ? 'mt-2' : ''}`}>{report.need_tomorrow}</p>}
            </Card>
        )}
    </>);
}

function Addons({ addons, people }) {
    if (!addons.length) return null;
    return (
        <Card>
            <Label right={addons.length}>Від бригади</Label>
            {addons.map((a, i) => {
                const p = [...people.values()].find(x => x.id === a.author_id);
                const ph = (a.photos || []).map((url, j) => ({ url, fid: (a.photo_file_ids || [])[j] || null }));
                return (
                    <div key={a.id} className={`py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                        <div className="text-[13px] font-bold text-slate-600">{p?.name || 'Хтось із бригади'}</div>
                        {a.text && <p className="text-[15px] text-slate-900 whitespace-pre-line break-words mt-0.5">{a.text}</p>}
                        {ph.length > 0 && <div className="mt-1.5"><PhotoGrid photos={ph} compact readOnly /></div>}
                    </div>
                );
            })}
        </Card>
    );
}

/* Свої фото й коментар до звіту бригади. Фото йдуть на Диск і в гілку лише після «Додати до звіту» */
function AddonForm({ objId, date, onAdded }) {
    const { who } = useMontazh();
    const toast = useToast();
    const [text, setText] = useState('');
    const [local, setLocal] = useState([]);   // [{ id, blob, name, url }]
    const [busy, setBusy] = useState(false);

    const addFiles = async (files) => {
        for (const f of [...(files || [])].filter(x => x.type?.startsWith('image/'))) {
            const p = await prepareLocalPhoto(f);
            setLocal(x => [...x, { ...p, url: URL.createObjectURL(p.blob) }]);
        }
    };
    const removeLocal = (id) => setLocal(x => {
        const gone = x.find(p => p.id === id);
        if (gone) URL.revokeObjectURL(gone.url);
        return x.filter(p => p.id !== id);
    });

    const send = async () => {
        if (!text.trim() && !local.length) return;
        if (navigator.onLine === false) { toast("Немає інтернету — додайте, коли з'явиться зв'язок", 'warning'); return; }
        setBusy(true);
        try {
            const photos = local.length
                ? await uploadPhotos({
                    files: local.map(p => new File([p.blob], p.name, { type: p.blob.type || 'image/jpeg' })),
                    objectId: objId, by: who.name, comment: `Доповнення до звіту за ${dm(date)}`,
                })
                : [];
            const r = await ensureReport(objId, date);
            const { error } = await supabase.from('installer_report_addons').insert({
                report_id: r.id, author_id: who.id, text: text.trim() || null,
                photos: photos.map(p => p.url), photo_file_ids: photos.map(p => p.fid || ''),
            });
            if (error) throw error;
            local.forEach(p => URL.revokeObjectURL(p.url));
            setText(''); setLocal([]);
            toast('Додано до звіту', 'success');
            onAdded();
        } catch (e) {
            toast(isNetworkError(e) ? "Немає зв'язку — спробуйте ще раз трохи пізніше" : humanError(e), 'error');
        } finally {
            setBusy(false);
        }
    };

    const canSend = useMemo(() => !!(text.trim() || local.length), [text, local]);

    return (
        <Card>
            <Label>Додати від себе</Label>
            <PhotoGrid local={local} compact onAddFiles={addFiles} onRemoveLocal={removeLocal} />
            <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Коментар"
                className="w-full mt-2 rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 py-2.5 text-[15px] resize-y" />
            <Big small tone="dark" className="mt-2" icon={FaPaperPlane} onClick={send} disabled={busy || !canSend}>{busy ? 'Надсилаю…' : 'Додати до звіту'}</Big>
        </Card>
    );
}
