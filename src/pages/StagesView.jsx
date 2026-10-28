// =====================================================================
//  K-CORE · «Задачі» → вкладка «Етапи»
//
//  Підетапи об'єктів, де людина зараз відповідальна і які ще не виконані
//  (раніше — окрема сторінка «Мої етапи»). Видно по об'єктах або по
//  етапах. Натиснули на етап — під ним розкривається редагування: статус,
//  відповідальний, коментар, файли й коротка історія. Без вікон поверх.
//  Офіс може подивитись етапи будь-кого з команди.
//
//  Поточний стан етапу — остання подія workflow_events по парі
//  «об'єкт + етап»; відповідальний — останній непорожній new_responsible.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FaArrowRight, FaCamera, FaCheck, FaChevronDown, FaFileAlt, FaHardHat, FaHistory, FaTimes, FaUserTie,
} from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, Picker, Segmented, SearchInput, Skeleton, EmptyState, Spinner, Linkify, useToast, humanError } from '../ui';
import {
    TASKS, getTask, getTaskLabel, getStageGroupLabel, normalizeTaskStatus, taskStatusMeta, taskStatusOptions,
    isTaskDone, taskHasUploads,
} from '../domain/stages';
import { uploadWorkflowFiles, resolveActorName } from '../utils/workflowUpload';
import { ingestOfferInBackground } from '../utils/commercialOffer';

// Об'єкти в цих статусах зараз не в роботі — їхні етапи не показуємо
const INACTIVE = new Set(['completed', 'cancelled', 'lost', 'on_hold']);
const ORDER = new Map(TASKS.map((t, i) => [t.key, i]));
const FLASH_MS = 2600;

const fmtShort = (iso) => (iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
const daysAgo = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
const keyOf = (r) => `${r.installation_custom_id}__${r.stage_key}`;
const objTitle = (o) => o?.name || o?.client?.company_name || o?.client?.name || `Об'єкт #${o?.custom_id}`;

/** Поточні етапи людини: остання подія по кожній парі об'єкт+етап */
export async function loadStagesOf(customId) {
    const { data: mine, error: e1 } = await supabase.from('workflow_events')
        .select('installation_custom_id').eq('new_responsible', customId);
    if (e1) throw e1;
    const ids = [...new Set((mine || []).map(r => r.installation_custom_id))];
    if (!ids.length) return [];

    const { data: hist, error: e2 } = await supabase.from('workflow_events')
        .select('id, installation_custom_id, stage_key, new_status, new_responsible, created_at')
        .in('installation_custom_id', ids)
        .order('created_at', { ascending: false }).order('id', { ascending: false });
    if (e2) throw e2;

    const state = new Map();
    (hist || []).forEach(ev => {
        const k = `${ev.installation_custom_id}__${ev.stage_key}`;
        const s = state.get(k);
        if (!s) state.set(k, { status: ev.new_status || 'todo', responsible: ev.new_responsible, updated_at: ev.created_at });
        else if (s.responsible == null && ev.new_responsible != null) s.responsible = ev.new_responsible;
    });

    const rows = [];
    state.forEach((s, k) => {
        const [inst, stage_key] = k.split('__');
        if (Number(s.responsible) !== Number(customId) || isTaskDone(stage_key, s.status)) return;
        rows.push({
            installation_custom_id: Number(inst), stage_key,
            status: normalizeTaskStatus(stage_key, s.status) || 'todo',
            responsible: s.responsible, updated_at: s.updated_at,
        });
    });
    if (!rows.length) return [];

    const { data: objs, error: e3 } = await supabase.from('installations')
        .select('custom_id, name, status, workflow_stage, client:clients(name, company_name, populated_place)')
        .in('custom_id', [...new Set(rows.map(r => r.installation_custom_id))]);
    if (e3) throw e3;
    const om = new Map((objs || []).map(o => [o.custom_id, o]));
    return rows
        .map(r => ({ ...r, obj: om.get(r.installation_custom_id) }))
        .filter(r => r.obj && !INACTIVE.has(String(r.obj.status || '').toLowerCase()));
}

/* ---------------------------------------------------------------------
 *  Коротка історія етапу — під редагуванням
 * ------------------------------------------------------------------- */
function StageHistory({ instId, stageKey, nameOf }) {
    const [rows, setRows] = useState(null);
    useEffect(() => {
        let alive = true;
        supabase.from('workflow_events')
            .select('id, old_status, new_status, old_responsible, new_responsible, comment, actor, photos, created_at')
            .eq('installation_custom_id', instId).eq('stage_key', stageKey)
            .order('created_at', { ascending: false }).limit(8)
            .then(({ data }) => { if (alive) setRows(data || []); });
        return () => { alive = false; };
    }, [instId, stageKey]);

    if (rows === null) return <div className="py-2 flex items-center gap-2 text-[12.5px] text-slate-400"><Spinner className="w-3.5 h-3.5" /> історія…</div>;
    if (!rows.length) return <div className="py-1 text-[12.5px] text-slate-400">Історії ще немає</div>;
    return (
        <ul className="space-y-1.5">
            {rows.map(r => {
                const changedStatus = r.new_status && r.new_status !== r.old_status;
                const changedWho = r.new_responsible != null && String(r.new_responsible) !== String(r.old_responsible ?? '');
                const comment = r.comment && r.comment !== 'Changed active stage' ? r.comment : null;
                return (
                    <li key={r.id} className="text-[12.5px] leading-snug">
                        <span className="text-slate-400 tabular-nums mr-1.5">{fmtShort(r.created_at)}</span>
                        <b className="text-slate-700">{r.actor || 'Система'}</b>
                        {changedStatus && <> · {taskStatusMeta(stageKey, r.new_status).label.toLowerCase()}</>}
                        {changedWho && <> · відповідальний {nameOf(r.new_responsible)}</>}
                        {comment && <span className="block text-slate-600 break-words whitespace-pre-line"><Linkify>{comment}</Linkify></span>}
                        {r.photos?.length > 0 && (
                            <span className="block">
                                {r.photos.map((p, i) => (
                                    <a key={p} href={p} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-semibold hover:underline mr-2">файл {i + 1}</a>
                                ))}
                            </span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

/* ---------------------------------------------------------------------
 *  Редагування етапу на місці
 * ------------------------------------------------------------------- */
function StageEditor({ row, people, nameOf, onSave, onClose }) {
    const [status, setStatus] = useState(row.status);
    const [who, setWho] = useState(row.responsible ?? '');
    const [comment, setComment] = useState('');
    const [files, setFiles] = useState([]);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef(null);

    const options = useMemo(() => {
        const list = taskStatusOptions(row.stage_key);
        return list.some(o => o.key === row.status) ? list : [taskStatusMeta(row.stage_key, row.status), ...list];
    }, [row.stage_key, row.status]);

    const changed = status !== row.status || String(who ?? '') !== String(row.responsible ?? '') || comment.trim() || files.length;

    const save = async () => {
        if (!changed || saving) return;
        setSaving(true);
        await onSave(row, { status, responsible: who === '' ? null : Number(who), comment: comment.trim(), files });
        setSaving(false);
    };

    return (
        <div className="px-3 sm:px-4 pb-3.5 pt-1 space-y-3 bg-indigo-50/40 border-t border-indigo-100"
            onKeyDown={e => { if (e.key === 'Escape') onClose(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(); }}>
            <div>
                <span className={T.label}>Статус</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {options.map(o => (
                        <button key={o.key} type="button" onClick={() => setStatus(o.key)}
                            className={`h-9 px-3 rounded-lg border text-[12.5px] font-bold inline-flex items-center gap-1.5 transition-colors
                                ${status === o.key ? `${o.color} ring-2 ring-indigo-200` : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                            {status === o.key && <FaCheck size={9} />}{o.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                    <span className={T.label}>Відповідальний</span>
                    <div className="mt-1">
                        <Picker options={people} value={who} onChange={setWho} placeholder="Оберіть людину…" searchPlaceholder="Пошук…" icon={FaUserTie} />
                    </div>
                </div>
                <div>
                    <span className={T.label}>Коментар</span>
                    <textarea rows={comment ? 3 : 1} value={comment} onChange={e => setComment(e.target.value)} placeholder="Що зроблено, що чекаємо…"
                        className={`${T.input} mt-1 h-auto py-2 resize-none`} />
                </div>
            </div>
            {taskHasUploads(row.stage_key) && (
                <div>
                    <input ref={fileRef} type="file" multiple className="hidden"
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                        onChange={e => { const arr = Array.from(e.target.files || []); e.target.value = ''; setFiles(f => [...f, ...arr]); }} />
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Btn size="sm" variant="outline" icon={FaCamera} onClick={() => fileRef.current?.click()}>Додати файли</Btn>
                        {files.map((f, i) => (
                            <span key={`${f.name}-${i}`} className="h-8 pl-2.5 pr-1 rounded-lg bg-white border border-slate-200 text-[12px] font-semibold text-slate-700 inline-flex items-center gap-1.5 max-w-full">
                                <FaFileAlt size={10} className="text-slate-400 flex-shrink-0" />
                                <span className="break-all">{f.name}</span>
                                <button type="button" aria-label="Прибрати файл" onClick={() => setFiles(arr => arr.filter((_, j) => j !== i))}
                                    className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex-shrink-0"><FaTimes size={9} /></button>
                            </span>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
                <Btn variant="accent" icon={saving ? undefined : FaCheck} onClick={save} disabled={!changed || saving}>
                    {saving ? (files.length ? 'Завантажуємо файли…' : 'Зберігаємо…') : 'Зберегти'}
                </Btn>
                <Btn variant="ghost" onClick={onClose} disabled={saving}>Згорнути</Btn>
            </div>
            <details className="group">
                <summary className="cursor-pointer list-none text-[12px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1.5">
                    <FaHistory size={10} /> Історія етапу <FaChevronDown size={8} className="group-open:rotate-180 transition-transform" />
                </summary>
                <div className="mt-2"><StageHistory instId={row.installation_custom_id} stageKey={row.stage_key} nameOf={nameOf} /></div>
            </details>
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Рядок етапу
 * ------------------------------------------------------------------- */
function StageRow({ row, showObject, open, flash, onToggle, children }) {
    const meta = taskStatusMeta(row.stage_key, row.status);
    const age = daysAgo(row.updated_at);
    return (
        <li className={`transition-colors duration-700 ${flash ? 'bg-amber-50' : ''}`}>
            <button type="button" onClick={onToggle} aria-expanded={open}
                className={`w-full text-left px-3 sm:px-4 py-2.5 flex items-start gap-3 ${open ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-slate-900 leading-snug break-words">
                        {showObject ? <><span className="font-mono text-[11px] text-slate-400 mr-1">СЕС-{row.installation_custom_id}</span>{objTitle(row.obj)}</> : getTaskLabel(row.stage_key)}
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-500 leading-snug">
                        {showObject && row.obj?.client?.populated_place ? `${row.obj.client.populated_place} · ` : ''}
                        оновлено {fmtShort(row.updated_at)}
                        {age != null && age > 14 && <span className="text-amber-700 font-semibold"> · {age} дн без змін</span>}
                    </div>
                </div>
                <Chip tone={meta.tone || 'neutral'} className="mt-0.5">{meta.label}</Chip>
                <FaChevronDown size={10} className={`mt-2 text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && children}
        </li>
    );
}

/* ---------------------------------------------------------------------
 *  Вкладка
 * ------------------------------------------------------------------- */
export default function StagesView() {
    const navigate = useNavigate();
    const auth = useAuth();
    const { employee: me, user } = auth;
    // Чужі етапи — тим, кому відкрито «Доручення команди»
    const isOffice = auth.can('tasks');
    const toast = useToast();

    const [who, setWho] = useState(me?.custom_id ?? null);
    const [group, setGroup] = useState(() => { try { return localStorage.getItem('kcore.stages.group') || 'object'; } catch { return 'object'; } });
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [employees, setEmployees] = useState([]);
    const [openKey, setOpenKey] = useState(null);
    const [flash, setFlash] = useState({});
    const reqRef = useRef(0);

    useEffect(() => { if (who == null && me?.custom_id != null) setWho(me.custom_id); }, [me?.custom_id, who]);

    useEffect(() => {
        supabase.from('employees').select('id, custom_id, name, role, access_blocked_at, hidden_from_list').order('name')
            .then(({ data }) => setEmployees(data || []));
    }, []);

    const nameOf = useCallback((cid) => employees.find(e => String(e.custom_id) === String(cid))?.name || (cid != null ? `#${cid}` : '—'), [employees]);
    const people = useMemo(() => employees
        .filter(e => !e.access_blocked_at && !e.hidden_from_list)
        .map(e => ({ id: e.custom_id, label: e.name })), [employees]);

    const load = useCallback(async (quiet = false) => {
        if (who == null) return;
        const req = ++reqRef.current;
        if (!quiet) setRows(null);
        try {
            const data = await loadStagesOf(who);
            if (req === reqRef.current) { setRows(data); setError(''); }
        } catch (e) {
            if (req === reqRef.current) { setError(humanError(e)); setRows([]); }
        }
    }, [who]);

    useEffect(() => { load(); }, [load]);

    // Хтось інший змінив етап — тихо оновлюємо список
    useEffect(() => {
        let t = null;
        const ch = supabase.channel('tasks-stages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'workflow_events' }, () => {
                clearTimeout(t); t = setTimeout(() => load(true), 600);
            })
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(ch); };
    }, [load]);

    const pulse = (key) => {
        setFlash(f => ({ ...f, [key]: true }));
        setTimeout(() => setFlash(f => { const n = { ...f }; delete n[key]; return n; }), FLASH_MS);
    };

    const saveStage = async (row, { status, responsible, comment, files }) => {
        try {
            let links = [], fileIds = [];
            if (files.length) {
                const up = await uploadWorkflowFiles({ files, installationId: row.installation_custom_id, stageKey: row.stage_key, uploadedBy: me?.name });
                links = up.links; fileIds = up.fileIds;
                if (row.stage_key === 'commercial_proposal') {
                    ingestOfferInBackground({
                        files, installationId: row.installation_custom_id, employeeId: me?.id || null,
                        driveFiles: fileIds.map((fileId, i) => ({ fileId, webViewLink: links[i] })), notify: toast,
                    });
                }
            }
            const actor = await resolveActorName({ user, employee: me });
            const { error: err } = await supabase.rpc('update_workflow_stage', {
                p_installation_id: row.installation_custom_id, p_stage_key: row.stage_key, p_new_status: status,
                p_actor: actor, p_comment: comment || '', p_photos: links, p_photo_file_ids: fileIds,
                p_new_responsible: responsible, p_set_as_global_stage: false,
            });
            if (err) throw err;
        } catch (e) {
            toast(humanError(e), 'error');
            return false;
        }
        const key = keyOf(row);
        const done = isTaskDone(row.stage_key, status);
        const handedOver = responsible != null && Number(responsible) !== Number(who);
        if (done || handedOver) {
            // Етап іде зі списку — даємо секунду побачити, що зміну прийнято
            setRows(rs => rs.map(r => (keyOf(r) === key ? { ...r, status, _leaving: done ? 'виконано' : `передано: ${nameOf(responsible)}` } : r)));
            setOpenKey(null);
            pulse(key);
            toast(done ? `${getTask(row.stage_key)?.short || 'Етап'} · СЕС-${row.installation_custom_id}: виконано` : `Етап передано: ${nameOf(responsible)}`);
            setTimeout(() => setRows(rs => (rs || []).filter(r => keyOf(r) !== key)), FLASH_MS);
        } else {
            setRows(rs => rs.map(r => (keyOf(r) === key ? { ...r, status, updated_at: new Date().toISOString() } : r)));
            setOpenKey(null);
            pulse(key);
            toast('Етап оновлено');
        }
        return true;
    };

    const shown = useMemo(() => {
        const q = search.trim().toLowerCase().replace(/^сес-?/, '');
        const list = (rows || []).filter(r => !q || [
            r.installation_custom_id, r.obj?.name, r.obj?.client?.name, r.obj?.client?.company_name, r.obj?.client?.populated_place, getTaskLabel(r.stage_key),
        ].some(v => v != null && String(v).toLowerCase().includes(q)));
        return list;
    }, [rows, search]);

    const sections = useMemo(() => {
        const m = new Map();
        shown.forEach(r => {
            const k = group === 'object' ? r.installation_custom_id : r.stage_key;
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(r);
        });
        const out = [...m.entries()].map(([k, items]) => ({
            key: String(k),
            items: items.slice().sort((a, b) => (group === 'object'
                ? (ORDER.get(a.stage_key) ?? 99) - (ORDER.get(b.stage_key) ?? 99)
                : new Date(a.updated_at) - new Date(b.updated_at))),
            obj: group === 'object' ? items[0].obj : null,
            stage: group === 'stage' ? k : null,
            oldest: Math.min(...items.map(i => new Date(i.updated_at).getTime())),
        }));
        // Об'єкти — спершу ті, що найдовше без змін; етапи — у порядку процесу
        return group === 'object'
            ? out.sort((a, b) => a.oldest - b.oldest)
            : out.sort((a, b) => (ORDER.get(a.stage) ?? 99) - (ORDER.get(b.stage) ?? 99));
    }, [shown, group]);

    const objCount = new Set(shown.map(r => r.installation_custom_id)).size;
    const mine = String(who) === String(me?.custom_id);

    const changeGroup = (g) => { setGroup(g); try { localStorage.setItem('kcore.stages.group', g); } catch { /* немає сховища */ } };

    if (me?.custom_id == null) {
        return <div className={`${T.card} p-5 text-[13.5px] text-slate-600`}>Акаунт не прив'язаний до працівника — етапів немає.</div>;
    }

    return (
        <div className="space-y-3">
            <div className={`${T.card} p-2.5 flex flex-wrap items-center gap-2`}>
                {isOffice && (
                    <div className="w-full sm:w-64">
                        <Picker options={people} value={who ?? ''} onChange={(v) => { setWho(v); setOpenKey(null); }}
                            placeholder="Чиї етапи…" searchPlaceholder="Пошук людини…" icon={FaUserTie} />
                    </div>
                )}
                {isOffice && !mine && <Btn size="sm" variant="soft" onClick={() => setWho(me.custom_id)}>Мої</Btn>}
                <SearchInput value={search} onChange={setSearch} placeholder="Об'єкт, клієнт, етап…" className="flex-1 min-w-[180px]" />
                <Segmented value={group} onChange={changeGroup}
                    options={[{ value: 'object', label: "По об'єктах" }, { value: 'stage', label: 'По етапах' }]} />
            </div>

            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{error}</div>}

            {rows === null ? (
                <div className={T.card}><Skeleton rows={6} /></div>
            ) : sections.length === 0 ? (
                <div className={T.card}>
                    <EmptyState icon={FaCheck} title={search ? 'Нічого не знайдено' : mine ? 'Відкритих етапів немає' : `У ${nameOf(who)} відкритих етапів немає`}
                        hint={search ? 'Спробуйте інший запит.' : 'Тут з’являються етапи об’єктів у роботі, де людина відповідальна.'} />
                </div>
            ) : (
                <>
                    <div className="px-1 text-[12.5px] text-slate-500">
                        {shown.length} {shown.length === 1 ? 'етап' : shown.length < 5 ? 'етапи' : 'етапів'} · {objCount} об'єкт{objCount === 1 ? '' : objCount < 5 ? 'и' : 'ів'}
                    </div>
                    {sections.map(sec => (
                        <section key={sec.key} className={`${T.card} overflow-hidden`}>
                            <div className="px-3 sm:px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-start gap-2">
                                {sec.obj ? (
                                    <>
                                        <FaHardHat size={12} className="mt-1 text-slate-400 flex-shrink-0" />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[14px] font-bold text-slate-900 leading-snug break-words">
                                                <span className="font-mono text-[11.5px] text-slate-400 mr-1.5">СЕС-{sec.obj.custom_id}</span>{objTitle(sec.obj)}
                                            </div>
                                            <div className="text-[12px] text-slate-500 leading-snug">
                                                {[sec.obj.client?.populated_place, `зараз: ${getStageGroupLabel(sec.obj.workflow_stage)}`].filter(Boolean).join(' · ')}
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => navigate(`/project/${sec.obj.custom_id}?tab=workflow`)}
                                            className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50 inline-flex items-center gap-1 flex-shrink-0">
                                            Об'єкт <FaArrowRight size={9} />
                                        </button>
                                    </>
                                ) : (
                                    <div className="text-[14px] font-bold text-slate-900 flex-1">{getTaskLabel(sec.stage)}</div>
                                )}
                                <span className="mt-0.5 text-[12px] font-semibold text-slate-400 tabular-nums flex-shrink-0">{sec.items.length}</span>
                            </div>
                            <ul className="divide-y divide-slate-100">
                                {sec.items.map(r => {
                                    const k = keyOf(r);
                                    if (r._leaving) {
                                        return (
                                            <li key={k} className="px-3 sm:px-4 py-2.5 bg-emerald-50 flex items-center gap-2 text-[13px]">
                                                <FaCheck size={11} className="text-emerald-600 flex-shrink-0" />
                                                <span className="font-semibold text-slate-700 break-words min-w-0 flex-1">{group === 'object' ? getTaskLabel(r.stage_key) : objTitle(r.obj)}</span>
                                                <span className="text-emerald-700 font-semibold">{r._leaving}</span>
                                            </li>
                                        );
                                    }
                                    return (
                                        <StageRow key={k} row={r} showObject={group === 'stage'} open={openKey === k} flash={!!flash[k]}
                                            onToggle={() => setOpenKey(o => (o === k ? null : k))}>
                                            <StageEditor row={r} people={people} nameOf={nameOf} onSave={saveStage} onClose={() => setOpenKey(null)} />
                                        </StageRow>
                                    );
                                })}
                            </ul>
                        </section>
                    ))}
                </>
            )}
        </div>
    );
}
