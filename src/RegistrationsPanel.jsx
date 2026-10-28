// =====================================================================
//  «Нові реєстрації» в Доступах (AdminPanel).
//
//  Адміністратор бачить акаунти, які ще не прив'язані до працівника, і
//  прямо в рядку вирішує, хто це: наявний працівник (тоді вся його
//  історія лишається на місці) або новий. Без другого вікна поверх
//  першого — панель розгортається під рядком.
// =====================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaCheck, FaUserClock, FaUserTie, FaUndo } from 'react-icons/fa';

import { useAuth } from './AuthProvider';
import { T, Btn, Chip, Field, Segmented, Picker, Skeleton, Tip, useToast, useConfirm, humanError } from './ui';
import { hasRegistrationReview } from './utils/features';
import {
    loadRegistrations, registrationName, suggestEmployee, linkRegistration,
    createEmployeeForRegistration, setRegistrationRejected, invalidatePendingCount,
} from './utils/registrations';

const ROLE_OPTIONS = [
    { value: 'installer', label: 'Монтажник' },
    { value: 'office', label: 'Офіс' },
    { value: 'super_admin', label: 'Адміністратор' },
];

const TIER_OPTIONS = [
    { value: 1, label: 'Бригадир' },
    { value: 2, label: 'Майстер' },
];

export default function RegistrationsPanel({ employees, onChanged }) {
    const toast = useToast();
    const [regs, setRegs] = useState({ pending: [], rejected: [] });
    const [loading, setLoading] = useState(true);
    const [canReject, setCanReject] = useState(false);
    const [showRejected, setShowRejected] = useState(false);

    const load = useCallback(async () => {
        try {
            setRegs(await loadRegistrations());
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        hasRegistrationReview().then(setCanReject);
    }, [load]);

    const done = useCallback(() => {
        invalidatePendingCount();
        load();
        onChanged?.();
    }, [load, onChanged]);

    const { pending, rejected } = regs;

    return (
        <section className={`${T.card} overflow-hidden mb-8`}>
            <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                    <FaUserClock className="text-amber-500 flex-shrink-0" size={15} />
                    <h2 className="text-[15px] font-bold text-slate-900">Нові реєстрації</h2>
                    <Tip text="Працівник реєструється сам на сторінці входу, а тут ви підтверджуєте, хто він у команді. До підтвердження він бачить лише екран очікування." />
                    {pending.length > 0 && <Chip tone="warn">{pending.length} чекають</Chip>}
                </div>
                {rejected.length > 0 && (
                    <Btn variant="ghost" size="sm" onClick={() => setShowRejected(v => !v)}>
                        {showRejected ? 'Сховати відхилені' : `Відхилені · ${rejected.length}`}
                    </Btn>
                )}
            </header>

            {loading ? (
                <Skeleton rows={2} />
            ) : pending.length === 0 ? (
                <p className="px-4 py-3.5 text-[13px] text-slate-500">Нових реєстрацій немає</p>
            ) : (
                <div className="divide-y divide-slate-100">
                    {pending.map(reg => (
                        <RegistrationRow key={reg.id} reg={reg} employees={employees} canReject={canReject} onDone={done} />
                    ))}
                </div>
            )}

            {showRejected && rejected.length > 0 && (
                <div className="border-t border-slate-200 bg-slate-50/70 divide-y divide-slate-100">
                    {rejected.map(reg => (
                        <RejectedRow key={reg.id} reg={reg} onDone={done} />
                    ))}
                </div>
            )}
        </section>
    );
}

function RegistrationRow({ reg, employees, canReject, onDone }) {
    const toast = useToast();
    const confirm = useConfirm();
    const { employee: me } = useAuth();

    const name = registrationName(reg);
    const suggestion = useMemo(() => suggestEmployee(reg, employees), [reg, employees]);
    const freeEmployees = useMemo(() => employees
        .filter(e => !e.user_id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'uk'))
        .map(e => ({ id: e.id, label: e.position ? `${e.name} · ${e.position}` : e.name })),
    [employees]);

    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState(suggestion ? 'link' : 'new');
    const [empId, setEmpId] = useState(suggestion?.employee.id ?? '');
    const [role, setRole] = useState('installer');
    const [tier, setTier] = useState(2);
    const [busy, setBusy] = useState(false);

    const approve = async () => {
        const emp = employees.find(e => String(e.id) === String(empId));
        if (mode === 'link' && !emp) return;

        if (mode === 'new' && role === 'super_admin') {
            const ok = await confirm({
                title: 'Надати права адміністратора?',
                message: `${name} зможе змінювати ролі, підтверджувати реєстрації та бачити фінанси.`,
                confirmLabel: 'Так, адміністратор',
            });
            if (!ok) return;
        }

        setBusy(true);
        const { error } = mode === 'link'
            ? await linkRegistration(reg, emp)
            : await createEmployeeForRegistration(reg, { role, tier });
        setBusy(false);

        if (error) { toast(humanError(error), 'error'); return; }
        toast(mode === 'link' ? `Доступ надано: ${emp.name}` : `Доступ надано, створено працівника ${name}`);
        onDone();
    };

    const reject = async () => {
        setBusy(true);
        const { error } = await setRegistrationRejected(reg, true, me?.id);
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        onDone();
        toast(`Реєстрацію відхилено: ${name}`, 'info', {
            label: 'Скасувати',
            onClick: async () => { await setRegistrationRejected(reg, false); onDone(); },
        });
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                        <FaUserClock size={13} />
                    </span>
                    <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-slate-900 truncate">{name}</div>
                        <div className="text-[12.5px] text-slate-500 truncate">
                            {reg.email}{reg.phone ? ` · ${reg.phone}` : ''}
                        </div>
                        {suggestion && !open && (
                            <div className="text-[12px] text-indigo-700 mt-0.5">
                                Схоже на працівника {suggestion.employee.name} ({suggestion.reason})
                            </div>
                        )}
                    </div>
                </div>
                {!open && (
                    <div className="flex gap-2 sm:flex-shrink-0">
                        <Btn variant="accent" icon={FaCheck} onClick={() => setOpen(true)} className="flex-1 sm:flex-none">Підтвердити</Btn>
                        {canReject && (
                            <Btn variant="ghost" onClick={reject} disabled={busy}>Відхилити</Btn>
                        )}
                    </div>
                )}
            </div>

            {open && (
                <div className="mx-4 mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    <Segmented
                        options={[
                            { value: 'link', label: 'Це наявний працівник' },
                            { value: 'new', label: 'Новий працівник' },
                        ]}
                        value={mode}
                        onChange={setMode}
                    />

                    {mode === 'link' ? (
                        <Field label="Працівник" hint="У списку лише ті, хто ще не має акаунта. Їхні етапи, виїзди й історія залишаться на місці.">
                            <Picker
                                options={freeEmployees}
                                value={empId}
                                onChange={setEmpId}
                                placeholder="Оберіть працівника без акаунта…"
                                searchPlaceholder="Пошук працівника…"
                                icon={FaUserTie}
                            />
                        </Field>
                    ) : (
                        <div className="space-y-2.5">
                            <p className="text-[13px] text-slate-700 leading-snug flex items-center gap-1.5 flex-wrap">
                                <span>Буде створено працівника <b>{name}</b>{reg.email ? ` з поштою ${reg.email}` : ''}</span>
                                <Tip text="Посаду, телефон і дату народження потім можна додати в «Працівниках»." />
                            </p>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[12px] font-semibold text-slate-600 w-14">Роль</span>
                                <Segmented options={ROLE_OPTIONS} value={role} onChange={setRole} />
                            </div>
                            {role === 'installer' && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[12px] font-semibold text-slate-600 w-14">Рівень</span>
                                    <Segmented options={TIER_OPTIONS} value={tier} onChange={setTier} />
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                        <Btn variant="outline" onClick={() => setOpen(false)} disabled={busy}>Скасувати</Btn>
                        <Btn variant="accent" icon={FaCheck} onClick={approve} disabled={busy || (mode === 'link' && !empId)}>
                            {busy ? 'Зберігаю…' : 'Надати доступ'}
                        </Btn>
                    </div>
                </div>
            )}
        </div>
    );
}

function RejectedRow({ reg, onDone }) {
    const toast = useToast();
    const [busy, setBusy] = useState(false);
    const name = registrationName(reg);
    const when = reg.rejected_at ? new Date(reg.rejected_at).toLocaleDateString('uk-UA') : '';

    const restore = async () => {
        setBusy(true);
        const { error } = await setRegistrationRejected(reg, false);
        setBusy(false);
        if (error) { toast(humanError(error), 'error'); return; }
        toast(`${name} знову чекає на підтвердження`, 'info');
        onDone();
    };

    return (
        <div className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-600 truncate">{name}</div>
                <div className="text-[12px] text-slate-400 truncate">{reg.email}{when ? ` · відхилено ${when}` : ''}</div>
            </div>
            <Btn variant="outline" size="sm" icon={FaUndo} onClick={restore} disabled={busy}>Повернути</Btn>
        </div>
    );
}
