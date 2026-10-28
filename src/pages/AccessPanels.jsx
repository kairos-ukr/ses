// =====================================================================
//  K-CORE · Доступи — налаштування людини і шаблони
//
//  PersonAccess — розгортається під людиною в «Доступах»: шаблон,
//  перемикач «Без обмежень» і таблиця прав. Зміни відносно шаблону —
//  особисті (підсвічені), «Як у шаблоні» прибирає їх усі.
//  Шаблон для монтажу (Бригадир, Монтажник) — людина працює лише в
//  «Монтажі», тому роль перемикається сама.
//
//  AccessTemplates — вкладка «Шаблони»: змінити права шаблону, назву,
//  де людина працює (CRM чи «Монтаж»), створити новий на основі
//  наявного, видалити непотрібний (якщо ним ніхто не користується).
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaUnlock, FaUndo, FaCheck, FaCopy, FaTrash, FaChevronDown, FaPlus } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import { T, Btn, Chip, Skeleton, useToast, useConfirm, humanError } from '../ui';
import { BUILTIN_TEMPLATES, SECTIONS, defaultTemplateKey, effectivePerms, sameSection } from '../domain/access';
import AccessMatrix from './AccessMatrix';

/** Шаблони з бази; до міграції — запасні з коду */
export function useAccessTemplates() {
    const [list, setList] = useState(null);
    const load = useCallback(async () => {
        const { data, error } = await supabase.from('access_templates').select('*').order('sort').order('name');
        setList(error || !data?.length ? BUILTIN_TEMPLATES.map((t, i) => ({ ...t, sort: i, builtin: true })) : data);
    }, []);
    useEffect(() => { load(); }, [load]);
    return [list, load];
}

const APP_LABEL = { crm: 'CRM', montazh: 'Лише «Монтаж»' };

function Switch({ on, onClick, disabled, label }) {
    return (
        <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={onClick}
            className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
        </button>
    );
}

/** Скільки розділів у людини не так, як у шаблоні */
export const overridesCount = (emp, tpl) => SECTIONS
    .filter(s => Object.prototype.hasOwnProperty.call(emp.access_overrides || {}, s.key)
        && !sameSection(emp.access_overrides[s.key], tpl?.perms?.[s.key], s)).length;

/* ---------------------------------------------------------------------
 *  Людина
 * ------------------------------------------------------------------- */
export function PersonAccess({ emp, templates, onSaved, onClose }) {
    const auth = useAuth();
    const toast = useToast();
    const self = emp.id === auth.employee?.id;
    const readOnly = self || !auth.can('access', 'edit');

    const [tplKey, setTplKey] = useState(emp.access_template || defaultTemplateKey(emp));
    const [unrestricted, setUnrestricted] = useState(emp.access_unrestricted === true);
    const [overrides, setOverrides] = useState(emp.access_overrides || {});
    const [busy, setBusy] = useState(false);

    const tpl = templates.find(t => t.key === tplKey) || null;
    const value = useMemo(() => effectivePerms({ template: tpl, overrides, unrestricted: false }), [tpl, overrides]);

    const changeSection = (key, next) => {
        setOverrides(prev => {
            const o = { ...prev };
            const sec = SECTIONS.find(s => s.key === key);
            if (next === undefined || sameSection(next, tpl?.perms?.[key], sec)) delete o[key];
            else o[key] = next;
            return o;
        });
    };

    const dirty = tplKey !== (emp.access_template || defaultTemplateKey(emp))
        || unrestricted !== (emp.access_unrestricted === true)
        || JSON.stringify(overrides) !== JSON.stringify(emp.access_overrides || {});

    const save = async () => {
        setBusy(true);
        const patch = { access_template: tplKey, access_unrestricted: unrestricted, access_overrides: overrides };
        // Шаблон для монтажу — людина працює лише в «Монтажі»; і навпаки
        if (tpl?.app === 'montazh' && emp.role !== 'installer') patch.role = 'installer';
        if (tpl?.app === 'crm' && emp.role === 'installer') patch.role = 'office';
        if (tplKey === 'brigadier') patch.tier = 1;
        if (tplKey === 'installer') patch.tier = 2;
        const { error } = await supabase.from('employees').update(patch).eq('id', emp.id);
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`Доступ збережено: ${emp.name}${patch.role ? (patch.role === 'installer' ? ' · працює в «Монтажі»' : ' · працює в CRM') : ''}`, 'success');
        onSaved?.({ ...emp, ...patch });
    };

    return (
        <div className="space-y-3">
            {self && <div className="text-[12.5px] text-slate-500">Свій доступ змінити не можна — попросіть іншого адміністратора.</div>}
            <div className="flex flex-wrap items-center gap-2">
                <label className="text-[13px] font-semibold text-slate-600">Шаблон</label>
                <select value={tplKey} disabled={readOnly} onChange={e => setTplKey(e.target.value)}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-800 disabled:opacity-60">
                    {templates.map(t => <option key={t.key} value={t.key}>{t.name}{t.app === 'montazh' ? ' (Монтаж)' : ''}</option>)}
                </select>
                <span className="inline-flex items-center gap-2 ml-auto rounded-lg border border-slate-200 bg-white px-2.5 h-9">
                    <FaUnlock size={11} className={unrestricted ? 'text-emerald-600' : 'text-slate-400'} />
                    <span className="text-[13px] font-semibold text-slate-700">Без обмежень</span>
                    <Switch on={unrestricted} disabled={readOnly} onClick={() => setUnrestricted(v => !v)} label="Без обмежень" />
                </span>
            </div>

            {unrestricted ? (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-[13px] text-emerald-800">
                    Усі розділи відкриті повністю, включно з грошима всієї компанії, аналітикою й доступами. Вимкніть, щоб діяли права нижче.
                </div>
            ) : tpl?.app === 'montazh' ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-[13px] text-slate-600">
                    Працює лише в «Монтажі»: сьогодні, графік, задачі, звіти. CRM закрита.
                </div>
            ) : (
                <AccessMatrix value={value} base={tpl?.perms || {}} onChange={changeSection} readOnly={readOnly} />
            )}

            {!readOnly && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    {Object.keys(overrides).length > 0 && !unrestricted && (
                        <Btn size="sm" variant="ghost" icon={FaUndo} onClick={() => setOverrides({})}>Як у шаблоні</Btn>
                    )}
                    <span className="flex-1" />
                    <Btn size="sm" variant="ghost" onClick={onClose}>Закрити</Btn>
                    <Btn size="sm" variant="accent" icon={FaCheck} onClick={save} disabled={busy || !dirty}>{busy ? 'Зберігаю…' : 'Зберегти'}</Btn>
                </div>
            )}
        </div>
    );
}

/* ---------------------------------------------------------------------
 *  Шаблони
 * ------------------------------------------------------------------- */
export function AccessTemplates({ templates, employees, onChanged }) {
    const auth = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const canEdit = auth.can('access', 'edit');
    const [open, setOpen] = useState(null);
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);

    const usage = useMemo(() => {
        const m = {};
        (employees || []).forEach(e => { const k = e.access_template || defaultTemplateKey(e); m[k] = (m[k] || 0) + 1; });
        return m;
    }, [employees]);

    const openTpl = (t) => {
        if (open === t.key) { setOpen(null); setDraft(null); return; }
        setOpen(t.key);
        setDraft({ name: t.name, app: t.app, perms: { ...(t.perms || {}) } });
    };

    const changeSection = (key, next) => setDraft(d => {
        const perms = { ...d.perms };
        if (!next) delete perms[key]; else perms[key] = next;
        return { ...d, perms };
    });

    const save = async (t) => {
        if (!draft.name.trim()) { toast('Вкажіть назву шаблону', 'error'); return; }
        setBusy(true);
        const { error } = await supabase.from('access_templates').upsert({
            key: t.key, name: draft.name.trim(), app: draft.app, perms: draft.perms, sort: t.sort ?? 500, builtin: !!t.builtin,
            updated_at: new Date().toISOString(), updated_by: auth.employee?.id || null,
        }, { onConflict: 'key' });
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`Шаблон «${draft.name.trim()}» збережено — діє для всіх, хто на ньому`, 'success');
        await onChanged?.();
        auth.refreshAccess?.();
    };

    // Копія відкритого шаблону (з поточними змінами) або збереженого
    const copy = async (t) => {
        const src = draft && open === t.key ? draft : { name: t.name, app: t.app, perms: t.perms || {} };
        const name = `${src.name} (копія)`;
        const key = `custom_${Date.now().toString(36)}`;
        setBusy(true);
        const { error } = await supabase.from('access_templates').insert({
            key, name, app: src.app, perms: src.perms, sort: 500, builtin: false, updated_by: auth.employee?.id || null,
        });
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`Створено шаблон «${name}» — змініть назву й права`, 'success');
        await onChanged?.();
        setOpen(key);
        setDraft({ name, app: src.app, perms: { ...src.perms } });
    };

    const remove = async (t) => {
        const ok = await confirm({ title: 'Видалити шаблон?', message: `«${t.name}»`, confirmLabel: 'Видалити' });
        if (!ok) return;
        const { error } = await supabase.from('access_templates').delete().eq('key', t.key);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Шаблон видалено', 'info');
        setOpen(null); setDraft(null);
        onChanged?.();
    };

    if (!templates) return <div className={T.card}><Skeleton rows={6} /></div>;

    return (
        <div className={`${T.card} overflow-hidden`}>
            <ul className="divide-y divide-slate-100">
                {templates.map(t => {
                    const isOpen = open === t.key;
                    const n = usage[t.key] || 0;
                    const sections = Object.keys(t.perms || {}).length;
                    return (
                        <li key={t.key}>
                            <button type="button" onClick={() => openTpl(t)} aria-expanded={isOpen}
                                className={`w-full text-left px-4 py-3 flex items-center gap-3 ${isOpen ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                <div className="min-w-0 flex-1">
                                    <div className="text-[14px] font-bold text-slate-900 break-words">{t.name}</div>
                                    <div className="text-[12px] text-slate-500">
                                        {t.app === 'montazh' ? 'Лише «Монтаж»' : `CRM · розділів: ${sections} з ${SECTIONS.length}`}
                                    </div>
                                </div>
                                <Chip tone={n ? 'accent' : 'neutral'}>{n} люд.</Chip>
                                <FaChevronDown size={10} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isOpen && draft && (
                                <div className="px-3 sm:px-4 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2 pt-2">
                                        <input className={`${T.input} !h-9 flex-1 min-w-[180px]`} value={draft.name} disabled={!canEdit}
                                            onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} aria-label="Назва шаблону" />
                                        <span className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                                            {['crm', 'montazh'].map(a => (
                                                <button key={a} type="button" disabled={!canEdit} onClick={() => setDraft(d => ({ ...d, app: a }))}
                                                    className={`h-9 px-3 text-[12.5px] font-semibold ${draft.app === a ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>
                                                    {APP_LABEL[a]}
                                                </button>
                                            ))}
                                        </span>
                                    </div>
                                    {draft.app === 'crm' && (
                                        <div className={`${T.card} px-2 py-1`}>
                                            <AccessMatrix value={effectivePerms({ template: { perms: draft.perms } })} onChange={changeSection} readOnly={!canEdit} />
                                        </div>
                                    )}
                                    {canEdit && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Btn size="sm" variant="ghost" icon={FaCopy} onClick={() => copy(t)} disabled={busy}>Створити копію</Btn>
                                            {!t.builtin && n === 0 && <Btn size="sm" variant="ghost" icon={FaTrash} className="hover:!text-rose-600" onClick={() => remove(t)}>Видалити</Btn>}
                                            <span className="flex-1" />
                                            <Btn size="sm" variant="accent" icon={FaCheck} onClick={() => save(t)} disabled={busy}>{busy ? 'Зберігаю…' : 'Зберегти шаблон'}</Btn>
                                        </div>
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            {canEdit && templates.length > 0 && (
                <div className="p-3 border-t border-slate-100">
                    <Btn size="sm" variant="soft" icon={FaPlus} disabled={busy} onClick={() => copy(templates.find(x => x.key === 'office') || templates[0])}>
                        Новий шаблон (на основі «Офіс»)
                    </Btn>
                </div>
            )}
        </div>
    );
}

export { APP_LABEL };
