// =====================================================================
//  K-CORE · Монтаж · картка об'єкта
//
//  Лише для об'єктів, де людина в графіку (офіс бачить будь-який).
//  Вкладки:
//   • Об'єкт — клієнт з телефоном, станція, етапи монтажу;
//   • Файли — технічне креслення, 3D, специфікації, фото замірів і монтажу
//     (з тих самих етапів, куди офіс уже завантажує; без КП — там ціни);
//   • Матеріали — специфікації «Комплектація матеріалів» і «Комплектація
//     ел. захисту» з позначкою, що вже видано зі складу;
//   • Звіти — що бригади звітували по цьому об'єкту день за днем;
//   • Нотатки — важливе по об'єкту; нове бот надсилає в гілку об'єкта.
// =====================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { FaRoute, FaPhone, FaFilePdf, FaFileAlt, FaCube, FaShieldAlt, FaBoxOpen, FaPaperPlane, FaLock } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { Linkify, useToast, humanError } from '../ui';
import { getStageGroupLabel, tasksOfGroup, taskStatusMeta } from '../domain/stages';
import {
    useMontazh, isoDay, shiftDay, relDay, OBJECT_FIELDS, objectTitle, placeOf, kwText, routeLink, telLink,
} from './data';
import { Screen, Card, Label, Pill, Big, Line, Empty, Loading, Tabs } from './kit';
import ReportHistory from './ReportHistory';

const TABS = [
    { value: 'info', label: "Об'єкт" },
    { value: 'files', label: 'Файли' },
    { value: 'materials', label: 'Матеріали' },
    { value: 'reports', label: 'Звіти' },
    { value: 'notes', label: 'Нотатки' },
];

export default function ObjectScreen() {
    const { id } = useParams();
    const objId = Number(id);
    const [params, setParams] = useSearchParams();
    const tab = TABS.some(t => t.value === params.get('tab')) ? params.get('tab') : 'info';
    const setTab = (t) => setParams(t === 'info' ? {} : { tab: t }, { replace: true });

    const { who, isOffice, preview } = useMontazh();
    const [obj, setObj] = useState(null);
    const [allowed, setAllowed] = useState(null);   // null — перевіряємо

    useEffect(() => {
        let alive = true;
        (async () => {
            setAllowed(null);
            // Монтажник бачить лише свої об'єкти: у графіку за останні 4 місяці або наперед
            let ok = isOffice && !preview;
            if (!ok) {
                const { data } = await supabase.from('installation_workers').select('id')
                    .eq('employee_custom_id', who.custom_id).eq('installation_custom_id', objId)
                    .gte('work_date', shiftDay(isoDay(), -120)).limit(1);
                ok = (data || []).length > 0;
            }
            const { data: o } = ok
                ? await supabase.from('installations').select(OBJECT_FIELDS).eq('custom_id', objId).maybeSingle()
                : { data: null };
            if (!alive) return;
            setAllowed(ok);
            setObj(o || null);
        })();
        return () => { alive = false; };
    }, [objId, who?.custom_id, isOffice, preview]);

    if (allowed === null) return <Screen title="Об'єкт" back="/m"><Loading /></Screen>;
    if (!allowed || !obj) {
        return (
            <Screen title="Об'єкт" back="/m">
                <Card hero>
                    <div className="flex items-start gap-3">
                        <FaLock size={18} className="mt-1 flex-shrink-0" />
                        <div>
                            <div className="text-[17px] font-bold">Цей об'єкт не у вашому графіку</div>
                            <p className="text-[14.5px] text-slate-600 mt-1">Картка відкривається, коли вас ставлять на об'єкт у графіку робіт.</p>
                        </div>
                    </div>
                </Card>
            </Screen>
        );
    }

    return (
        <Screen title={objectTitle(obj)} sub={`СЕС-${obj.custom_id}${placeOf(obj) ? ` · ${placeOf(obj)}` : ''}`} back="/m"
            tabs={<Tabs value={tab} onChange={setTab} items={TABS} />} scrollKey={tab}>
            {tab === 'info' && <InfoTab obj={obj} />}
            {tab === 'files' && <FilesTab objId={objId} />}
            {tab === 'materials' && <MaterialsTab objId={objId} />}
            {tab === 'reports' && <ReportHistory objId={objId} />}
            {tab === 'notes' && <NotesTab objId={objId} />}
        </Screen>
    );
}

/* ---------------- Об'єкт ---------------- */

function InfoTab({ obj }) {
    const { who } = useMontazh();
    const [stages, setStages] = useState({});
    const [days, setDays] = useState([]);

    useEffect(() => {
        (async () => {
            const [st, wk] = await Promise.all([
                supabase.from('project_stages').select('stage_key, status').eq('installation_custom_id', obj.custom_id),
                supabase.from('installation_workers').select('work_date').eq('installation_custom_id', obj.custom_id)
                    .eq('employee_custom_id', who.custom_id).gte('work_date', shiftDay(isoDay(), -60)).order('work_date'),
            ]);
            setStages(Object.fromEntries((st.data || []).map(s => [s.stage_key, s.status])));
            setDays([...new Set((wk.data || []).map(r => r.work_date))]);
        })();
    }, [obj.custom_id, who.custom_id]);

    const tel = telLink(obj.client?.phone);
    const route = routeLink(obj);
    const steps = tasksOfGroup('installation');
    const doneN = steps.filter(t => taskStatusMeta(t.key, stages[t.key]).done).length;
    const today = isoDay();
    const ahead = days.filter(d => d >= today);

    return (<>
        <Card>
            <Label>Клієнт</Label>
            <div className="text-[17px] font-bold break-words">{obj.client?.name || obj.name || '—'}</div>
            {(obj.client?.phone || placeOf(obj)) && (
                <div className="text-[14.5px] text-slate-600 mt-0.5 break-words">{[obj.client?.phone, placeOf(obj)].filter(Boolean).join(' · ')}</div>
            )}
            {(tel || route) && (
                <div className={`grid gap-2 mt-3 ${route && tel ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {tel && <Big small icon={FaPhone} href={tel}>Подзвонити</Big>}
                    {route && <Big small icon={FaRoute} href={route}>Маршрут</Big>}
                </div>
            )}
        </Card>

        <Card>
            <Label>Станція</Label>
            <Line first right={obj.station_type || '—'}>Тип</Line>
            {obj.capacity_kw ? <Line right={kwText(obj.capacity_kw)}>Потужність</Line> : null}
            {obj.mount_type ? <Line right={obj.mount_type}>Монтаж</Line> : null}
            {obj.quant_phase ? <Line right={obj.quant_phase}>Фази</Line> : null}
            <Line right={getStageGroupLabel(obj.workflow_stage)}>Етап</Line>
        </Card>

        <Card>
            <Label right={`${doneN} з ${steps.length}`}>Етапи монтажу</Label>
            <div className="flex flex-wrap gap-1.5">
                {steps.map(t => {
                    const m = taskStatusMeta(t.key, stages[t.key]);
                    const tone = m.done ? 'ok' : (m.key === 'started' ? 'warn' : 'neutral');
                    return <Pill key={t.key} tone={tone}>{t.short}{m.done ? ' ✓' : m.key === 'started' ? ' · в роботі' : ''}</Pill>;
                })}
            </div>
        </Card>

        {days.length > 0 && (
            <Card>
                <Label>Ви на цьому об'єкті</Label>
                <p className="text-[14.5px] text-slate-700">
                    {ahead.length > 0 ? <>Далі: <b className="text-slate-900">{ahead.map(d => relDay(d).toLowerCase()).join(', ')}</b>. </> : null}
                    Усього днів: <b className="text-slate-900">{days.length}</b>
                </p>
            </Card>
        )}
    </>);
}

/* ---------------- Файли ---------------- */

// Групи файлів у тому порядку, у якому вони потрібні на виїзді
const FILE_GROUPS = [
    { key: 'drawing', title: 'Технічне креслення', stages: ['tech_project'], icon: FaFileAlt },
    { key: '3d', title: '3D-візуалізація', stages: ['project_design'], icon: FaCube },
    { key: 'spec', title: 'Специфікації', stages: ['complectation', 'comp_protection'], icon: FaFilePdf },
    { key: 'survey', title: "Фото об'єкта і заміри", stages: ['tech_review'], icon: null },
    { key: 'install', title: 'Фото з монтажу', stages: ['inst_structure', 'inst_panels', 'inst_cabling', 'inst_grounding', 'inst_inverter', 'installation', 'monitoring_setup'], icon: null },
];
const ALL_STAGES = FILE_GROUPS.flatMap(g => g.stages);
const fileIdOf = (url) => (String(url).match(/\/d\/([^/?#]+)/) || String(url).match(/[?&]id=([^&#]+)/) || [])[1] || null;
const thumb = (fid) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(fid)}&sz=w360-h360`;

function FilesTab({ objId }) {
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState([]);
    const [selected3d, setSelected3d] = useState(new Set());
    const [open, setOpen] = useState({});

    useEffect(() => {
        (async () => {
            const [ev, dv, rep] = await Promise.all([
                supabase.from('workflow_events').select('id, stage_key, created_at, photos, photo_file_ids')
                    .eq('installation_custom_id', objId).in('stage_key', ALL_STAGES).order('created_at', { ascending: false }),
                supabase.from('project_design_variants').select('google_file_id').eq('installation_custom_id', objId).eq('is_selected', true),
                // Фото з денних звітів бригади — теж «з монтажу»
                supabase.from('installer_reports').select('id, created_at, photos, photo_file_ids, addons:installer_report_addons(created_at, photos, photo_file_ids)')
                    .eq('installation_custom_id', objId).order('work_date', { ascending: false }),
            ]);
            const fromReports = (rep.data || []).flatMap(r => [
                { stage_key: 'installation', created_at: r.created_at, photos: r.photos, photo_file_ids: r.photo_file_ids },
                ...(r.addons || []).map(a => ({ stage_key: 'installation', ...a })),
            ]);
            const seen = new Set();
            const files = [];
            [...fromReports, ...(ev.data || [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).forEach(e => (e.photos || []).forEach((url, i) => {
                const fid = (e.photo_file_ids || [])[i] || fileIdOf(url);
                const k = fid || url;
                if (!url || seen.has(k)) return;
                seen.add(k);
                files.push({ url, fid, stage: e.stage_key, at: e.created_at });
            }));
            setSelected3d(new Set((dv.data || []).map(d => d.google_file_id).filter(Boolean)));
            setGroups(FILE_GROUPS.map(g => ({ ...g, files: files.filter(f => g.stages.includes(f.stage)) })).filter(g => g.files.length));
            setLoading(false);
        })();
    }, [objId]);

    if (loading) return <Loading />;
    if (!groups.length) return <Card><Empty>Файлів по об'єкту ще немає</Empty></Card>;

    return groups.map(g => {
        // Затверджене 3D — першим
        const files = g.key === '3d' ? [...g.files].sort((a, b) => selected3d.has(b.fid) - selected3d.has(a.fid)) : g.files;
        const limit = open[g.key] ? files.length : 6;
        return (
            <Card key={g.key}>
                <Label right={files.length}>{g.title}</Label>
                <div className="grid grid-cols-3 gap-1.5">
                    {files.slice(0, limit).map(f => (
                        <a key={f.fid || f.url} href={f.url} target="_blank" rel="noopener noreferrer"
                            className="relative block aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                            {/* Значок під мініатюрою: видно, поки вона вантажиться або якщо її немає */}
                            <span className="absolute inset-0 flex items-center justify-center text-slate-400">
                                <FaFileAlt size={22} />
                            </span>
                            {f.fid && (
                                <img src={thumb(f.fid)} alt="" loading="lazy" referrerPolicy="no-referrer"
                                    className="absolute inset-0 w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            )}
                            {g.key === '3d' && selected3d.has(f.fid) && (
                                <span className="absolute left-1 bottom-1"><Pill tone="ok">затверджено</Pill></span>
                            )}
                        </a>
                    ))}
                </div>
                {files.length > limit && (
                    <Big small tone="soft" className="mt-2" onClick={() => setOpen(o => ({ ...o, [g.key]: true }))}>Показати всі · {files.length}</Big>
                )}
                <div className="text-[12.5px] text-slate-500 mt-2">Останнє: {relDay(isoDay(new Date(files[0].at))).toLowerCase()}</div>
            </Card>
        );
    });
}

/* ---------------- Матеріали ---------------- */

const SPEC_KINDS = [
    { key: 'complectation', title: 'Комплектація матеріалів', icon: FaBoxOpen },
    { key: 'comp_protection', title: 'Комплектація ел. захисту', icon: FaShieldAlt },
];
const qty = (n) => String(Math.round(Number(n || 0) * 100) / 100).replace('.', ',');

function MaterialsTab({ objId }) {
    const [loading, setLoading] = useState(true);
    const [specs, setSpecs] = useState({});
    const [issued, setIssued] = useState(new Map());

    useEffect(() => {
        (async () => {
            const [sp, need] = await Promise.all([
                supabase.from('specifications')
                    .select('id, notes, version, status, specification_items(id, quantity, original_name, nomenclature_id, nomenclature:nomenclature(name, brand, model, unit:units(code, name)))')
                    .eq('installation_custom_id', objId).in('notes', SPEC_KINDS.map(k => k.key)).neq('status', 'archived')
                    .order('version', { ascending: false }),
                // Видано на об'єкт по кожній позиції (видача, продаж, передача мінус повернення)
                supabase.from('v_object_site_stock').select('nomenclature_id, issued_quantity').eq('installation_custom_id', objId),
            ]);
            // Остання версія кожного виду; затверджена має перевагу над чернеткою
            const pick = {};
            (sp.data || []).forEach(s => {
                const cur = pick[s.notes];
                if (!cur || (cur.status !== 'confirmed' && s.status === 'confirmed')) pick[s.notes] = s;
            });
            setSpecs(pick);
            setIssued(new Map((need.data || []).map(r => [r.nomenclature_id, Number(r.issued_quantity || 0)])));
            setLoading(false);
        })();
    }, [objId]);

    if (loading) return <Loading />;
    if (!Object.keys(specs).length) return <Card><Empty>Комплектацію для цього об'єкта ще не складено</Empty></Card>;

    return SPEC_KINDS.filter(k => specs[k.key]).map(k => {
        const items = specs[k.key].specification_items || [];
        const doneN = items.filter(it => (issued.get(it.nomenclature_id) || 0) >= Number(it.quantity || 0) - 1e-9).length;
        return (
            <Card key={k.key}>
                <Label icon={k.icon} right={`видано ${doneN} з ${items.length}`}>{k.title}</Label>
                {items.map((it, i) => {
                    const need = Number(it.quantity || 0);
                    const got = issued.get(it.nomenclature_id) || 0;
                    const name = it.nomenclature ? [it.nomenclature.name, it.nomenclature.model].filter(Boolean).join(' ') : it.original_name;
                    const unit = String(it.nomenclature?.unit?.code || it.nomenclature?.unit?.name || '').toLowerCase();
                    const tone = got >= need - 1e-9 ? 'ok' : got > 0 ? 'warn' : 'neutral';
                    const label = got >= need - 1e-9 ? 'видано' : got > 0 ? `видано ${qty(got)}` : 'ще ні';
                    return (
                        <div key={it.id} className={`flex items-center gap-2.5 py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                            <div className="min-w-0 flex-1 text-[14.5px] text-slate-800 break-words">{name || '—'}</div>
                            <b className="text-[14.5px] tabular-nums whitespace-nowrap">{qty(need)}{unit ? ` ${unit}` : ''}</b>
                            <Pill tone={tone}>{label}</Pill>
                        </div>
                    );
                })}
                {specs[k.key].status !== 'confirmed' && <div className="text-[12.5px] text-amber-800 mt-1">Чернетка — офіс ще уточнює</div>}
            </Card>
        );
    });
}

/* ---------------- Нотатки ---------------- */

function NotesTab({ objId }) {
    const { who, canWrite } = useMontazh();
    const toast = useToast();
    const [list, setList] = useState(null);
    const [text, setText] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const { data } = await supabase.from('project_additional_info')
            .select('id, message_text, author_name, created_at').eq('installation_custom_id', objId).order('created_at', { ascending: false });
        setList(data || []);
    }, [objId]);
    useEffect(() => { load(); }, [load]);

    const add = async () => {
        const msg = text.trim();
        if (!msg) return;
        setBusy(true);
        const { error } = await supabase.from('project_additional_info').insert({
            installation_custom_id: objId, message_text: msg, author_name: who.name || who.email,
            is_sent_to_telegram: false,   // бот надішле в гілку об'єкта
        });
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        setText('');
        toast('Нотатку додано', 'success');
        load();
    };

    const sorted = list || [];

    return (<>
        {canWrite && (
            <Card>
                <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
                    placeholder="Що важливо знати по об'єкту: ключі, доступ, побажання клієнта…"
                    className="w-full rounded-xl border-2 border-slate-300 focus:border-slate-900 outline-none px-3 py-2.5 text-[15px] resize-y" />
                <Big tone="main" small className="mt-2" icon={FaPaperPlane} onClick={add} disabled={busy || !text.trim()}>
                    {busy ? 'Зберігаю…' : 'Додати нотатку'}
                </Big>
            </Card>
        )}
        {list === null ? <Loading /> : sorted.length === 0 ? <Card><Empty>Нотаток ще немає</Empty></Card> : (
            <Card>
                {sorted.map((n, i) => (
                    <div key={n.id} className={`py-2.5 ${i ? 'border-t border-slate-100' : ''}`}>
                        <div className="text-[15px] text-slate-900 whitespace-pre-line break-words"><Linkify>{n.message_text}</Linkify></div>
                        <div className="text-[12.5px] text-slate-500 mt-0.5">{[n.author_name, relDay(isoDay(new Date(n.created_at))).toLowerCase()].filter(Boolean).join(' · ')}</div>
                    </div>
                ))}
            </Card>
        )}
    </>);
}
