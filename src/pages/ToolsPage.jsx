// =====================================================================
//  Інструмент та інвентар.
//
//  Кожна одиниця має інвентарний номер і поточну локацію: склад або
//  об'єкт. Дві вкладки — інвентар і журнал переміщень.
//
//  Дії залежать від стану: інструмент на складі можна видати чи
//  перемістити, виданий — повернути. Показуємо лише те, що доречно
//  просто зараз, а не всі шість кнопок одразу.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    FaWrench, FaWarehouse, FaHardHat, FaHeartBroken, FaQuestionCircle,
    FaArrowUp, FaArrowDown, FaExchangeAlt, FaHistory, FaPlus, FaHashtag,
    FaInfoCircle, FaMagic, FaBoxOpen, FaClock, FaFileExcel,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';
import {
    T, Btn, IconBtn, Chip, Card, Field, Picker, Segmented, EmptyState,
    Skeleton, Modal, useToast, useConfirm, humanError, useIsMobile,
} from '../ui';

const STATUS = {
    in_stock: { label: 'На складі', tone: 'ok', icon: FaWarehouse },
    issued: { label: 'Видано', tone: 'info', icon: FaHardHat },
    under_repair: { label: 'В ремонті', tone: 'warn', icon: FaWrench },
    written_off: { label: 'Списано', tone: 'danger', icon: FaHeartBroken },
    lost: { label: 'Втрачено', tone: 'neutral', icon: FaQuestionCircle },
};

const MOVE = {
    issue: { label: 'Видача', tone: 'info', icon: FaArrowUp },
    return: { label: 'Повернення', tone: 'ok', icon: FaArrowDown },
    transfer: { label: 'Переміщення', tone: 'accent', icon: FaExchangeAlt },
    writeoff: { label: 'Списання', tone: 'danger', icon: FaHeartBroken },
};

/* Що можна зробити з інструментом у кожному стані */
const ACTIONS = {
    issue: { label: 'Видати', icon: FaArrowUp, variant: 'accent', title: 'Видача на об’єкт' },
    return: { label: 'Повернути', icon: FaArrowDown, variant: 'softOk', title: 'Повернення на склад' },
    transfer: { label: 'Перемістити', icon: FaExchangeAlt, variant: 'soft', title: 'Переміщення між складами' },
    repair: { label: 'В ремонт', icon: FaWrench, variant: 'softWarn', title: 'Відправити в ремонт' },
    writeoff: { label: 'Списати', icon: FaHeartBroken, variant: 'softDanger', title: 'Списання' },
    lost: { label: 'Втрачено', icon: FaQuestionCircle, variant: 'soft', title: 'Позначити втраченим' },
};

const allowedActions = (status) => {
    switch (status) {
        case 'in_stock': return ['issue', 'transfer', 'repair', 'writeoff', 'lost'];
        case 'issued': return ['return', 'lost', 'writeoff'];
        case 'under_repair': return ['return', 'writeoff'];
        default: return ['return'];   // списаний / втрачений — можна повернути в обіг
    }
};

export default function ToolsPage({ externalSearch = '', externalActionTrigger = 0 }) {
    const { employee, loading: authLoading } = useAuth();
    const toast = useToast();
    const confirm = useConfirm();
    const isMobile = useIsMobile();

    const [tab, setTab] = useState('inventory');
    const [tools, setTools] = useState([]);
    const [movements, setMovements] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [installations, setInstallations] = useState([]);
    const [empDict, setEmpDict] = useState({});
    const [loading, setLoading] = useState(true);

    const [statusFilter, setStatusFilter] = useState('all');
    const [addModal, setAddModal] = useState(false);
    const [addForm, setAddForm] = useState({ nomenclature_id: '', inventory_number: '', serial_number: '', warehouse_id: '', notes: '' });
    const [action, setAction] = useState(null);   // { tool, type, installation_id, warehouse_id, notes, expected_date }
    const [sheetTool, setSheetTool] = useState(null);
    const [busy, setBusy] = useState(false);

    const prevTrigger = useRef(externalActionTrigger);
    useEffect(() => {
        if (externalActionTrigger > prevTrigger.current) {
            setAddForm({ nomenclature_id: '', inventory_number: '', serial_number: '', warehouse_id: '', notes: '' });
            setAddModal(true);
        }
        prevTrigger.current = externalActionTrigger;
    }, [externalActionTrigger]);

    /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [toolRes, movRes, nomRes, catRes, whRes, instRes, empRes] = await Promise.all([
                supabase.from('tools').select('*').order('created_at', { ascending: false }),
                supabase.from('tool_movements').select('*').order('movement_date', { ascending: false }).limit(500),
                supabase.from('nomenclature').select('id, name, sku, category_id').eq('type', 'tool').eq('is_active', true).order('name'),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
                supabase.from('installations').select('custom_id, name, status'),
                supabase.from('employees').select('id, name'),
            ]);
            if (toolRes.error) throw toolRes.error;

            setWarehouses(whRes.data || []);
            setInstallations(instRes.data || []);

            const catById = new Map((catRes.data || []).map(c => [c.id, c]));
            const nom = (nomRes.data || []).map(item => {
                const path = [];
                let id = item.category_id, guard = 0;
                while (id && guard++ < 20) {
                    const c = catById.get(id);
                    if (!c) break;
                    path.unshift(c.name);
                    id = c.parent_id;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim() };
            });
            setNomenclatures(nom);

            const nomById = new Map(nom.map(n => [n.id, n]));
            setTools((toolRes.data || []).map(t => ({ ...t, nomenclature: nomById.get(t.nomenclature_id) })));
            setMovements(movRes.data || []);

            const emps = {};
            (empRes.data || []).forEach(e => emps[e.id] = e.name);
            setEmpDict(emps);
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { if (!authLoading) loadData(); }, [authLoading, loadData]);

    /* ---------------- ДОВІДКОВІ ЗНАЧЕННЯ ---------------- */

    const whName = useCallback(id => warehouses.find(w => w.id === id)?.name, [warehouses]);
    const instName = useCallback(id => installations.find(i => i.custom_id === id)?.name, [installations]);

    const nomOptions = useMemo(
        () => nomenclatures.map(n => ({ id: n.id, label: `${n.fullName}${n.sku ? ` · ${n.sku}` : ''}` })),
        [nomenclatures]
    );
    const whOptions = useMemo(() => warehouses.map(w => ({ id: w.id, label: w.name })), [warehouses]);
    const instOptions = useMemo(() => installations
        .filter(i => ['planning', 'in_progress', 'pending'].includes(i.status))
        .map(i => ({ id: i.custom_id, label: `#${i.custom_id} ${i.name}` })), [installations]);

    const counts = useMemo(() => {
        const c = { all: tools.length };
        Object.keys(STATUS).forEach(k => { c[k] = tools.filter(t => t.status === k).length; });
        return c;
    }, [tools]);

    const filteredTools = useMemo(() => {
        const term = externalSearch.trim().toLowerCase();
        return tools.filter(t => {
            if (statusFilter !== 'all' && t.status !== statusFilter) return false;
            if (!term) return true;
            return (t.inventory_number || '').toLowerCase().includes(term)
                || (t.serial_number || '').toLowerCase().includes(term)
                || (t.nomenclature?.fullName || '').toLowerCase().includes(term);
        });
    }, [tools, statusFilter, externalSearch]);

    const filteredMovements = useMemo(() => {
        const term = externalSearch.trim().toLowerCase();
        const byId = new Map(tools.map(t => [t.id, t]));
        return movements
            .map(m => ({ ...m, tool: byId.get(m.tool_id) }))
            .filter(m => !term
                || (m.tool?.inventory_number || '').toLowerCase().includes(term)
                || (m.tool?.nomenclature?.fullName || '').toLowerCase().includes(term));
    }, [movements, tools, externalSearch]);

    /* Інструмент на об'єкті довше очікуваного — це те, що варто бачити */
    const overdue = useCallback((tool) => {
        if (tool.status !== 'issued') return null;
        const mv = movements.find(m => m.tool_id === tool.id && m.movement_type === 'issue');
        if (!mv?.expected_return_date) return null;
        const due = new Date(mv.expected_return_date);
        return due < new Date() ? due : null;
    }, [movements]);

    /* ---------------- СТВОРЕННЯ ---------------- */

    const genInvNumber = () => setAddForm(f => ({
        ...f, inventory_number: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
    }));

    const saveTool = async () => {
        if (!addForm.nomenclature_id) return toast('Оберіть позицію номенклатури', 'error');
        if (!addForm.inventory_number.trim()) return toast('Вкажіть інвентарний номер', 'error');
        if (!addForm.warehouse_id) return toast('Оберіть склад', 'error');

        setBusy(true);
        try {
            const { error } = await supabase.from('tools').insert([{
                nomenclature_id: addForm.nomenclature_id,
                inventory_number: addForm.inventory_number.trim(),
                serial_number: addForm.serial_number.trim() || null,
                status: 'in_stock',
                current_warehouse_id: addForm.warehouse_id,
                notes: addForm.notes.trim() || null,
                created_by: employee?.id,
            }]);
            if (error) throw error;
            toast('Інструмент додано в інвентар');
            setAddModal(false);
            loadData();
        } catch (e) {
            toast(e.code === '23505'
                ? 'Інструмент із таким інвентарним або серійним номером уже є'
                : humanError(e), 'error');
        } finally { setBusy(false); }
    };

    const quickAddInstallation = async (name) => {
        try {
            const { data, error } = await supabase.from('installations').insert([{
                name, status: 'in_progress',
                notes: 'Віртуальний об’єкт для переміщень інструменту',
            }]).select().single();
            if (error) throw error;
            setInstallations(prev => [...prev, data]);
            setAction(a => ({ ...a, installation_id: data.custom_id }));
            toast(`Об’єкт «${name}» створено`);
        } catch (e) {
            toast(humanError(e), 'error');
        }
    };

    /* ---------------- ОПЕРАЦІЇ ---------------- */

    const openAction = (tool, type) => setAction({
        tool, type,
        installation_id: tool.current_installation_custom_id || '',
        warehouse_id: tool.current_warehouse_id || '',
        notes: '', expected_date: '',
    });

    const runAction = async () => {
        const { tool, type } = action;
        const empId = employee?.id;
        let update = {}, move = null;

        try {
            if (type === 'issue') {
                if (!action.installation_id) throw new Error("Оберіть об'єкт для видачі");
                update = {
                    status: 'issued', current_warehouse_id: null,
                    current_installation_custom_id: action.installation_id,
                };
                move = {
                    tool_id: tool.id, movement_type: 'issue',
                    warehouse_from_id: tool.current_warehouse_id,
                    installation_custom_id: action.installation_id,
                    expected_return_date: action.expected_date || null,
                };
            } else if (type === 'return') {
                if (!action.warehouse_id) throw new Error('Оберіть склад для повернення');
                update = {
                    status: 'in_stock', current_warehouse_id: action.warehouse_id,
                    current_installation_custom_id: null,
                };
                move = {
                    tool_id: tool.id, movement_type: 'return',
                    warehouse_to_id: action.warehouse_id,
                    installation_custom_id: tool.current_installation_custom_id,
                };
            } else if (type === 'transfer') {
                if (!action.warehouse_id || String(action.warehouse_id) === String(tool.current_warehouse_id)) {
                    throw new Error('Оберіть інший склад');
                }
                update = { current_warehouse_id: action.warehouse_id };
                move = {
                    tool_id: tool.id, movement_type: 'transfer',
                    warehouse_from_id: tool.current_warehouse_id,
                    warehouse_to_id: action.warehouse_id,
                };
            } else {
                const newStatus = type === 'repair' ? 'under_repair' : type === 'writeoff' ? 'written_off' : 'lost';
                if (['writeoff', 'lost'].includes(type) && !action.notes.trim()) {
                    throw new Error('Вкажіть причину — без неї запис нічого не пояснює');
                }
                update = {
                    status: newStatus, current_warehouse_id: null,
                    current_installation_custom_id: null,
                };
                if (['writeoff', 'lost'].includes(type)) {
                    move = {
                        tool_id: tool.id, movement_type: 'writeoff',
                        warehouse_from_id: tool.current_warehouse_id,
                        installation_custom_id: tool.current_installation_custom_id,
                    };
                }
            }
        } catch (e) {
            return toast(e.message, 'error');
        }

        // Незворотні стани підтверджуємо явно
        if (['writeoff', 'lost'].includes(type)) {
            const ok = await confirm({
                title: type === 'writeoff' ? 'Списати інструмент?' : 'Позначити втраченим?',
                tone: 'danger',
                confirmLabel: type === 'writeoff' ? 'Списати' : 'Позначити',
                message: tool.nomenclature?.fullName,
                details: [
                    `Інв. № ${tool.inventory_number}`,
                    `Причина: ${action.notes.trim()}`,
                    'Інструмент зникне зі списку доступних. Повернути в обіг можна дією «Повернути».',
                ],
            });
            if (!ok) return;
        }

        setBusy(true);
        try {
            update.notes = action.notes.trim() || tool.notes || null;
            update.updated_by = empId;
            const { error } = await supabase.from('tools').update(update).eq('id', tool.id);
            if (error) throw error;

            if (move) {
                const { error: mErr } = await supabase.from('tool_movements')
                    .insert([{ ...move, notes: action.notes.trim() || null, performed_by: empId, created_by: empId }]);
                if (mErr) throw mErr;
            }

            toast(`${ACTIONS[type].label}: виконано`);
            setAction(null);
            setSheetTool(null);
            loadData();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally { setBusy(false); }
    };

    /* ---------------- ЕКСПОРТ ---------------- */

    const exportExcel = () => {
        if (!filteredTools.length) return toast('За цими фільтрами порожньо', 'error');
        const rows = filteredTools.map(t => ({
            'Інв. номер': t.inventory_number,
            'Найменування': t.nomenclature?.fullName || '',
            'Серійний номер': t.serial_number || '',
            'Статус': STATUS[t.status]?.label || t.status,
            'Склад': whName(t.current_warehouse_id) || '',
            "Об'єкт": t.current_installation_custom_id
                ? `#${t.current_installation_custom_id} ${instName(t.current_installation_custom_id) || ''}`.trim() : '',
            'Примітка': t.notes || '',
        }));
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = [{ wch: 14 }, { wch: 46 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 30 }, { wch: 30 }];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Інструмент');
        XLSX.writeFile(wb, `Інструмент_${new Date().toISOString().slice(0, 10)}.xlsx`);
        toast(`Вивантажено ${rows.length} позицій`);
    };

    /* ---------------- ЧАСТИНИ ІНТЕРФЕЙСУ ---------------- */

    const StatusChip = ({ status }) => {
        const s = STATUS[status] || { label: status, tone: 'neutral', icon: FaInfoCircle };
        return <Chip tone={s.tone} icon={s.icon}>{s.label}</Chip>;
    };

    const Location = ({ tool }) => {
        if (tool.status === 'in_stock' && tool.current_warehouse_id) {
            return (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-700">
                    <FaWarehouse className="text-emerald-500" size={11} />
                    {whName(tool.current_warehouse_id) || 'Склад'}
                </span>
            );
        }
        if (tool.status === 'issued' && tool.current_installation_custom_id) {
            const late = overdue(tool);
            return (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-slate-700 flex-wrap">
                    <FaHardHat className="text-sky-500 flex-shrink-0" size={11} />
                    #{tool.current_installation_custom_id} {instName(tool.current_installation_custom_id) || ''}
                    {late && (
                        <Chip tone="danger" icon={FaClock}>
                            мав повернутись {late.toLocaleDateString('uk-UA')}
                        </Chip>
                    )}
                </span>
            );
        }
        return <span className="text-[12px] text-slate-400">локації немає</span>;
    };

    const ToolActions = ({ tool, full }) => {
        const list = allowedActions(tool.status);
        if (full) return (
            <div className="grid grid-cols-2 gap-2">
                {list.map(k => (
                    <Btn key={k} variant={ACTIONS[k].variant} icon={ACTIONS[k].icon}
                        onClick={() => { openAction(tool, k); setSheetTool(null); }}>
                        {ACTIONS[k].label}
                    </Btn>
                ))}
            </div>
        );
        // У таблиці — головна дія текстом, решта іконками
        const [primary, ...rest] = list;
        return (
            <div className="flex items-center justify-end gap-1">
                <Btn size="sm" variant={ACTIONS[primary].variant} icon={ACTIONS[primary].icon}
                    onClick={() => openAction(tool, primary)}>
                    {ACTIONS[primary].label}
                </Btn>
                {rest.map(k => (
                    <IconBtn key={k} variant="ghost" icon={ACTIONS[k].icon} label={ACTIONS[k].title}
                        onClick={() => openAction(tool, k)} />
                ))}
            </div>
        );
    };

    if (authLoading) return <div className="flex-1 flex items-center justify-center text-slate-500 text-[13px]">Завантаження…</div>;

    const needsWarehouse = action && ['return', 'transfer'].includes(action.type);
    const needsInstallation = action && action.type === 'issue';

    /* ---------------- РЕНДЕР ---------------- */

    return (
        <div className="flex flex-col h-full w-full gap-2.5">

            {/* ---------- ВКЛАДКИ ТА ФІЛЬТРИ ---------- */}
            <Card pad="p-2.5" className="flex-none">
                <div className="flex items-center gap-2 flex-wrap">
                    <Segmented
                        value={tab} onChange={setTab}
                        options={[
                            { value: 'inventory', label: 'Інвентар' },
                            { value: 'movements', label: 'Журнал рухів' },
                        ]}
                    />
                    <div className="ml-auto flex items-center gap-1.5">
                        <Btn variant="softOk" icon={FaFileExcel} onClick={exportExcel}>Excel</Btn>
                        <Btn variant="accent" icon={FaPlus} onClick={() => setAddModal(true)}>
                            <span className="hidden sm:inline">Додати інструмент</span>
                            <span className="sm:hidden">Додати</span>
                        </Btn>
                    </div>
                </div>

                {tab === 'inventory' && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto">
                        {[['all', 'Всі'], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
                            <button
                                key={k}
                                onClick={() => setStatusFilter(k)}
                                className={`px-2.5 h-8 rounded-lg text-[11.5px] font-bold whitespace-nowrap border transition-colors flex-shrink-0
                                    ${statusFilter === k
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
                            >
                                {label}
                                <span className={`ml-1 tabular-nums ${statusFilter === k ? 'opacity-70' : 'text-slate-400'}`}>
                                    {counts[k] || 0}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </Card>

            {/* ---------- ІНВЕНТАР ---------- */}
            {tab === 'inventory' && (
                <div className={`${T.card} flex-1 flex flex-col overflow-hidden min-h-0`}>
                    {loading ? <Skeleton rows={8} /> : filteredTools.length === 0 ? (
                        <EmptyState
                            icon={FaWrench}
                            title="Інструментів не знайдено"
                            hint="Змініть фільтр за станом або додайте нову одиницю в інвентар."
                        >
                            <Btn variant="accent" icon={FaPlus} onClick={() => setAddModal(true)}>Додати інструмент</Btn>
                        </EmptyState>
                    ) : isMobile ? (
                        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                            {filteredTools.map(t => (
                                <button key={t.id} onClick={() => setSheetTool(t)}
                                    className="w-full text-left px-3 py-2.5 active:bg-slate-50 transition-colors">
                                    <div className="flex items-start gap-2 mb-1.5">
                                        <span className="text-[13px] font-bold text-slate-900 leading-snug flex-1">
                                            {t.nomenclature?.fullName || 'Невідома позиція'}
                                        </span>
                                        <StatusChip status={t.status} />
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                            <FaHashtag className="text-slate-400" size={8} />{t.inventory_number}
                                        </span>
                                        <Location tool={t} />
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="w-full border-collapse min-w-[900px]">
                                <thead className="sticky top-0 z-10">
                                    <tr className="border-b border-slate-200">
                                        <th className={`${T.th} text-left`}>Інструмент</th>
                                        <th className={`${T.th} text-left w-32`}>Стан</th>
                                        <th className={`${T.th} text-left w-[30%]`}>Локація</th>
                                        <th className={`${T.th} text-right w-72`}></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredTools.map(t => (
                                        <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                                            <td className={T.td}>
                                                <div className="font-semibold text-slate-900">{t.nomenclature?.fullName || 'Невідома позиція'}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                                        <FaHashtag className="text-slate-400" size={8} />{t.inventory_number}
                                                    </span>
                                                    {t.serial_number && <span className={T.mono}>SN {t.serial_number}</span>}
                                                </div>
                                            </td>
                                            <td className={T.td}><StatusChip status={t.status} /></td>
                                            <td className={T.td}>
                                                <Location tool={t} />
                                                {t.notes && (
                                                    <div className="text-[10.5px] text-slate-400 italic truncate mt-0.5">{t.notes}</div>
                                                )}
                                            </td>
                                            <td className={T.td}><ToolActions tool={t} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ---------- ЖУРНАЛ РУХІВ ---------- */}
            {tab === 'movements' && (
                <div className={`${T.card} flex-1 flex flex-col overflow-hidden min-h-0`}>
                    {loading ? <Skeleton rows={8} /> : filteredMovements.length === 0 ? (
                        <EmptyState icon={FaHistory} title="Переміщень немає"
                            hint="Тут з'являться видачі, повернення та списання інструменту." />
                    ) : (
                        <div className="flex-1 overflow-auto custom-scrollbar divide-y divide-slate-100">
                            {filteredMovements.map(m => {
                                const cfg = MOVE[m.movement_type] || { label: m.movement_type, tone: 'neutral', icon: FaInfoCircle };
                                const d = new Date(m.movement_date || m.created_at);
                                const from = whName(m.warehouse_from_id)
                                    || (m.installation_custom_id && m.movement_type === 'return'
                                        ? `#${m.installation_custom_id} ${instName(m.installation_custom_id) || ''}` : null);
                                const to = whName(m.warehouse_to_id)
                                    || (m.installation_custom_id && m.movement_type === 'issue'
                                        ? `#${m.installation_custom_id} ${instName(m.installation_custom_id) || ''}` : null);
                                return (
                                    <div key={m.id} className="px-3 py-2.5 hover:bg-slate-50 transition-colors">
                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                            <Chip tone={cfg.tone} icon={cfg.icon}>{cfg.label}</Chip>
                                            <span className="text-[10.5px] text-slate-400 tabular-nums">
                                                {d.toLocaleDateString('uk-UA')} {d.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            {m.expected_return_date && (
                                                <Chip tone="warn" icon={FaClock}>
                                                    до {new Date(m.expected_return_date).toLocaleDateString('uk-UA')}
                                                </Chip>
                                            )}
                                            <span className="ml-auto text-[11px] text-slate-500">{empDict[m.performed_by] || 'Система'}</span>
                                        </div>
                                        <div className="text-[13px] font-semibold text-slate-900">
                                            {m.tool?.nomenclature?.fullName || 'Інструмент'}
                                            {m.tool && <span className={`${T.mono} ml-2`}>{m.tool.inventory_number}</span>}
                                        </div>
                                        <div className="text-[11.5px] text-slate-500 mt-0.5">
                                            {from || '—'} <span className="text-slate-300">→</span> {to || 'списано'}
                                            {m.notes && <span className="italic"> · {m.notes}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ---------- ШУХЛЯДА ІНСТРУМЕНТА (телефон) ---------- */}
            <Modal
                isOpen={!!sheetTool}
                onClose={() => setSheetTool(null)}
                title={sheetTool?.nomenclature?.fullName || ''}
                subtitle={sheetTool ? `Інв. № ${sheetTool.inventory_number}` : ''}
                size="sm"
            >
                {sheetTool && (
                    <div className="space-y-3">
                        <div className={`${T.inset} px-3 py-2.5 space-y-2`}>
                            <div className="flex items-center justify-between">
                                <span className="text-[11.5px] text-slate-500">Стан</span>
                                <StatusChip status={sheetTool.status} />
                            </div>
                            <div className="flex items-start justify-between gap-3">
                                <span className="text-[11.5px] text-slate-500 flex-shrink-0">Локація</span>
                                <span className="text-right"><Location tool={sheetTool} /></span>
                            </div>
                            {sheetTool.serial_number && (
                                <div className="flex items-center justify-between">
                                    <span className="text-[11.5px] text-slate-500">Серійний номер</span>
                                    <span className={T.mono}>{sheetTool.serial_number}</span>
                                </div>
                            )}
                            {sheetTool.notes && (
                                <div className="pt-1.5 border-t border-slate-200 text-[12px] text-slate-600 italic">
                                    {sheetTool.notes}
                                </div>
                            )}
                        </div>
                        <ToolActions tool={sheetTool} full />
                    </div>
                )}
            </Modal>

            {/* ---------- ДОДАВАННЯ ІНСТРУМЕНТА ---------- */}
            <Modal
                isOpen={addModal}
                onClose={() => setAddModal(false)}
                title="Новий інструмент"
                subtitle="Одна фізична одиниця з власним інвентарним номером"
                size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setAddModal(false)}>Скасувати</Btn>
                    <Btn variant="accent" onClick={saveTool} disabled={busy}>{busy ? 'Зберігаємо…' : 'Додати'}</Btn>
                </>}
            >
                <div className="space-y-3">
                    <Field label="Позиція номенклатури" required
                        hint={nomOptions.length ? undefined : 'У номенклатурі ще немає позицій типу «Інструмент»'}>
                        <Picker
                            options={nomOptions} value={addForm.nomenclature_id}
                            onChange={v => setAddForm(f => ({ ...f, nomenclature_id: v }))}
                            placeholder="Оберіть інструмент…" icon={FaBoxOpen}
                            searchPlaceholder="Назва або SKU…"
                        />
                    </Field>

                    <Field label="Інвентарний номер" required>
                        <div className="flex gap-2">
                            <input className={T.input} placeholder="INV-1234" value={addForm.inventory_number}
                                onChange={e => setAddForm(f => ({ ...f, inventory_number: e.target.value }))} />
                            <IconBtn variant="soft" icon={FaMagic} label="Згенерувати номер" onClick={genInvNumber} />
                        </div>
                    </Field>

                    <Field label="Серійний номер">
                        <input className={T.input} placeholder="Необов’язково" value={addForm.serial_number}
                            onChange={e => setAddForm(f => ({ ...f, serial_number: e.target.value }))} />
                    </Field>

                    <Field label="Склад зберігання" required>
                        <Picker options={whOptions} value={addForm.warehouse_id}
                            onChange={v => setAddForm(f => ({ ...f, warehouse_id: v }))}
                            placeholder="Оберіть склад…" icon={FaWarehouse} />
                    </Field>

                    <Field label="Примітка">
                        <input className={T.input} placeholder="Стан, комплектність…" value={addForm.notes}
                            onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} />
                    </Field>
                </div>
            </Modal>

            {/* ---------- ОПЕРАЦІЯ НАД ІНСТРУМЕНТОМ ---------- */}
            <Modal
                isOpen={!!action}
                onClose={() => setAction(null)}
                title={action ? ACTIONS[action.type].title : ''}
                subtitle={action ? `${action.tool.nomenclature?.fullName || ''} · ${action.tool.inventory_number}` : ''}
                tone={action && ['writeoff', 'lost'].includes(action.type) ? 'danger'
                    : action?.type === 'return' ? 'ok' : 'accent'}
                size="sm"
                footer={<>
                    <Btn variant="outline" onClick={() => setAction(null)}>Скасувати</Btn>
                    <Btn
                        variant={action && ['writeoff', 'lost'].includes(action.type) ? 'danger' : 'accent'}
                        onClick={runAction} disabled={busy}
                    >
                        {busy ? 'Проводимо…' : action ? ACTIONS[action.type].label : ''}
                    </Btn>
                </>}
            >
                {action && (
                    <div className="space-y-3">
                        {needsInstallation && (
                            <>
                                <Field label="Об'єкт" required
                                    hint="Якщо потрібного об'єкта немає — почніть вводити назву і створіть його прямо тут">
                                    <Picker
                                        options={instOptions} value={action.installation_id}
                                        onChange={v => setAction(a => ({ ...a, installation_id: v }))}
                                        onAddNew={quickAddInstallation}
                                        addLabel="Створити об'єкт"
                                        placeholder="Оберіть об'єкт…" icon={FaHardHat}
                                        searchPlaceholder="Назва або номер…"
                                    />
                                </Field>
                                <Field label="Очікуване повернення"
                                    hint="Прострочені видачі позначаються в списку червоним">
                                    <input type="date" className={T.input} value={action.expected_date}
                                        onChange={e => setAction(a => ({ ...a, expected_date: e.target.value }))} />
                                </Field>
                            </>
                        )}

                        {needsWarehouse && (
                            <Field label={action.type === 'return' ? 'Склад повернення' : 'Куди переміщуємо'} required>
                                <Picker
                                    options={action.type === 'transfer'
                                        ? whOptions.filter(w => String(w.id) !== String(action.tool.current_warehouse_id))
                                        : whOptions}
                                    value={action.warehouse_id}
                                    onChange={v => setAction(a => ({ ...a, warehouse_id: v }))}
                                    placeholder="Оберіть склад…" icon={FaWarehouse}
                                />
                            </Field>
                        )}

                        <Field
                            label={['writeoff', 'lost'].includes(action.type) ? 'Причина' : 'Коментар'}
                            required={['writeoff', 'lost'].includes(action.type)}
                        >
                            <input className={T.input}
                                placeholder={['writeoff', 'lost'].includes(action.type)
                                    ? 'Напр. згорів двигун' : 'Необов’язково'}
                                value={action.notes}
                                onChange={e => setAction(a => ({ ...a, notes: e.target.value }))} />
                        </Field>
                    </div>
                )}
            </Modal>
        </div>
    );
}
