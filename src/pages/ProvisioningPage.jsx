import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaSearch, FaChevronLeft, FaCheck, FaExclamationTriangle,
    FaTimes, FaHardHat, FaBoxOpen, FaLock, FaWarehouse,
    FaArrowUp, FaUndo, FaClipboardList
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import Layout from '../Layout';
import { useAuth } from '../AuthProvider';
import ManualSpecBuilder from './ManualSpecBuilder';

// --- ДОПОМІЖНІ КОМПОНЕНТИ ---
const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }
    }, [isVisible, onClose]);
    const styles = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500' };
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 right-4 z-[100]">
                    <div className={`${styles[type] || 'bg-blue-600'} text-white rounded-xl shadow-2xl p-4 flex items-center space-x-3`}>
                        {type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
                        <span className="font-bold text-sm">{message}</span>
                        <button onClick={onClose} className="ml-4 text-white/80 hover:text-white"><FaTimes /></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

// Конфіг режимів операції
const OP_MODES = {
    reserve: { label: 'Резервування', verb: 'Зарезервувати', icon: FaLock, accent: 'indigo', headBg: 'bg-indigo-50', headText: 'text-indigo-900', headIcon: 'text-indigo-500', btn: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200', ring: 'focus:ring-indigo-500', border: 'border-indigo-200 focus:border-indigo-500', text: 'text-indigo-700' },
    issue:   { label: 'Видача під об\'єкт', verb: 'Видати', icon: FaArrowUp, accent: 'emerald', headBg: 'bg-emerald-50', headText: 'text-emerald-900', headIcon: 'text-emerald-500', btn: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200', ring: 'focus:ring-emerald-500', border: 'border-emerald-200 focus:border-emerald-500', text: 'text-emerald-700' },
    return:  { label: 'Повернення на склад', verb: 'Повернути', icon: FaUndo, accent: 'amber', headBg: 'bg-amber-50', headText: 'text-amber-900', headIcon: 'text-amber-500', btn: 'bg-amber-600 hover:bg-amber-700 shadow-amber-200', ring: 'focus:ring-amber-500', border: 'border-amber-200 focus:border-amber-500', text: 'text-amber-700' },
};

export default function ProvisioningPage() {
    const { employee, loading: authLoading } = useAuth();

    const [installations, setInstallations] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Стан для детального перегляду об'єкта
    const [selectedInst, setSelectedInst] = useState(null);
    const [specNeeds, setSpecNeeds] = useState([]);
    const [stockRows, setStockRows] = useState([]);        // повний v_warehouse_stock_available
    const [objReservations, setObjReservations] = useState([]); // активні резерви цього об'єкта
    const [detailLoading, setDetailLoading] = useState(false);

    // Єдина модалка операцій (reserve / issue / return)
    const [opModal, setOpModal] = useState({ isOpen: false, mode: null, item: null });
    const [opForm, setOpForm] = useState({ warehouse_id: '', quantity: '', reason: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Ручне внесення/редагування комплектації
    const [isManualOpen, setIsManualOpen] = useState(false);

    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // --- ЗАВАНТАЖЕННЯ ДАШБОРДУ ТА ДОВІДНИКІВ ---
    const loadDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const [instRes, needsRes, whRes, nomRes, catRes] = await Promise.all([
                supabase.from('installations').select(`custom_id, name, status, gps_link, client:clients(name, company_name)`).in('status', ['planning', 'in_progress', 'pending']).order('created_at', { ascending: false }),
                supabase.from('v_object_material_needs').select('*'),
                supabase.from('warehouses').select('id, name, is_active').order('name'),
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(name)'),
                supabase.from('categories').select('*')
            ]);

            if (instRes.error) throw instRes.error;
            if (needsRes.error) throw needsRes.error;

            setWarehouses(whRes.data || []);

            const cats = catRes.data || [];
            const processedNom = (nomRes.data || []).map(item => {
                let path = [];
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim() };
            });
            setNomenclatures(processedNom);

            const needsData = needsRes.data || [];

            const processedInst = (instRes.data || []).map(inst => {
                const objectNeeds = needsData.filter(n => String(n.installation_custom_id) === String(inst.custom_id));

                let readiness = 0;
                let statusBadge = "Без специфікації";
                let badgeColor = "bg-slate-100 text-slate-500";

                if (objectNeeds.length > 0) {
                    let totalPercent = 0;
                    objectNeeds.forEach(need => {
                        const required = parseFloat(need.required_quantity) || 1;
                        const covered = (parseFloat(need.reserved_quantity) || 0) + (parseFloat(need.issued_quantity) || 0);
                        totalPercent += Math.min(100, (covered / required) * 100);
                    });
                    readiness = Math.round(totalPercent / objectNeeds.length);

                    if (readiness === 100) {
                        statusBadge = "Скомплектовано";
                        badgeColor = "bg-emerald-100 text-emerald-700 border-emerald-200";
                    } else if (readiness > 0) {
                        statusBadge = "Частково забезпечено";
                        badgeColor = "bg-blue-100 text-blue-700 border-blue-200";
                    } else {
                        statusBadge = "Очікує матеріалів";
                        badgeColor = "bg-amber-100 text-amber-700 border-amber-200";
                    }
                }

                return { ...inst, readiness, statusBadge, badgeColor, needsCount: objectNeeds.length };
            });

            setInstallations(processedInst);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { if (!authLoading) loadDashboard(); }, [authLoading, loadDashboard]);

    // --- ЗАВАНТАЖЕННЯ ДЕТАЛЕЙ ОБ'ЄКТА ---
    const openObjectDetails = async (inst) => {
        setSelectedInst(inst);
        setDetailLoading(true);
        try {
            const [needsRes, stockRes, resRes] = await Promise.all([
                supabase.from('v_object_material_needs').select('*').eq('installation_custom_id', inst.custom_id),
                supabase.from('v_warehouse_stock_available').select('*'),
                supabase.from('reservations').select('id, warehouse_id, nomenclature_id, reserved_quantity, released_quantity, status').eq('installation_custom_id', inst.custom_id).eq('status', 'active')
            ]);

            if (needsRes.error) throw needsRes.error;
            if (stockRes.error) throw stockRes.error;

            setSpecNeeds(needsRes.data || []);
            setStockRows(stockRes.data || []);
            setObjReservations(resRes.data || []);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setDetailLoading(false);
        }
    };

    const refreshDetails = async () => {
        if (selectedInst) await openObjectDetails(selectedInst);
        loadDashboard();
    };

    // --- ХЕЛПЕРИ ЗАЛИШКІВ ---
    const stockAt = (whId, nomId) => {
        const r = stockRows.find(s => String(s.warehouse_id) === String(whId) && String(s.nomenclature_id) === String(nomId));
        return {
            onHand: parseFloat(r?.quantity_on_hand || 0),
            reservedTotal: parseFloat(r?.quantity_reserved || 0),
            available: parseFloat(r?.quantity_available || 0),
        };
    };
    const reservedHereAt = (whId, nomId) => objReservations
        .filter(r => String(r.warehouse_id) === String(whId) && String(r.nomenclature_id) === String(nomId))
        .reduce((sum, r) => sum + (parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity)), 0);
    // Скільки фізично можна видати з цього складу під цей об'єкт (наявність − чужі резерви)
    const issuableAt = (whId, nomId) => {
        const s = stockAt(whId, nomId);
        return s.onHand - (s.reservedTotal - reservedHereAt(whId, nomId));
    };
    const reservedHereTotal = (nomId) => objReservations
        .filter(r => String(r.nomenclature_id) === String(nomId))
        .reduce((sum, r) => sum + (parseFloat(r.reserved_quantity) - parseFloat(r.released_quantity)), 0);

    const unitOf = (nomId) => nomenclatures.find(n => n.id === nomId)?.unit?.name || 'шт';
    const nameOf = (item) => nomenclatures.find(n => n.id === item.nomenclature_id)?.fullName || item.nomenclature_name;

    // --- ВІДКРИТТЯ МОДАЛКИ ОПЕРАЦІЇ ---
    const openOp = (mode, needItem) => {
        const nomId = needItem.nomenclature_id;
        const outstanding = parseFloat(needItem.outstanding_need);
        const activeWh = warehouses.filter(w => w.is_active);

        let candidates = [];
        if (mode === 'reserve') {
            candidates = activeWh.filter(w => stockAt(w.id, nomId).available > 0);
            if (candidates.length === 0) return showToast('Цього товару немає у вільному залишку на жодному складі', 'warning');
        } else if (mode === 'issue') {
            candidates = activeWh.filter(w => issuableAt(w.id, nomId) > 0);
            if (candidates.length === 0) return showToast('Немає доступного залишку для видачі (все зайнято/відсутнє)', 'warning');
            // пріоритет складу, де є власний резерв цього об'єкта
            candidates.sort((a, b) => reservedHereAt(b.id, nomId) - reservedHereAt(a.id, nomId));
        } else { // return
            candidates = activeWh.length ? activeWh : warehouses;
            if (candidates.length === 0) return showToast('Немає активних складів для повернення', 'warning');
        }

        const wh = candidates[0];
        let qty = 0;
        if (mode === 'reserve') {
            qty = Math.min(outstanding > 0 ? outstanding : 0, stockAt(wh.id, nomId).available);
        } else if (mode === 'issue') {
            const rHere = reservedHereAt(wh.id, nomId);
            const target = rHere > 0 ? rHere : outstanding;
            qty = Math.min(target > 0 ? target : 0, issuableAt(wh.id, nomId));
        } else {
            qty = parseFloat(needItem.issued_quantity) || 0;
        }

        setOpModal({ isOpen: true, mode, item: needItem });
        setOpForm({ warehouse_id: wh.id, quantity: qty > 0 ? qty : '', reason: '' });
    };

    const closeOp = () => setOpModal({ isOpen: false, mode: null, item: null });

    // Довідка по обраному складу в модалці
    const modalStockInfo = () => {
        if (!opModal.item || !opForm.warehouse_id) return null;
        const nomId = opModal.item.nomenclature_id;
        const whId = opForm.warehouse_id;
        const s = stockAt(whId, nomId);
        return { ...s, reservedHere: reservedHereAt(whId, nomId), issuable: issuableAt(whId, nomId) };
    };

    // Чи є перевищення плану (для звірки «попереджати, але дозволяти»)
    const computeOverage = () => {
        if (!opModal.item) return { over: false, ref: 0 };
        const qty = parseFloat(opForm.quantity) || 0;
        if (opModal.mode === 'reserve' || opModal.mode === 'issue') {
            const ref = parseFloat(opModal.item.outstanding_need) || 0;
            return { over: qty > ref, ref };
        }
        if (opModal.mode === 'return') {
            const ref = parseFloat(opModal.item.issued_quantity) || 0;
            return { over: qty > ref, ref };
        }
        return { over: false, ref: 0 };
    };

    // --- ВИКОНАННЯ ОПЕРАЦІЇ ---
    const executeOp = async (e) => {
        e.preventDefault();
        const qty = parseFloat(opForm.quantity);
        if (!qty || qty <= 0) return showToast('Введіть кількість більше 0', 'error');
        if (!opForm.warehouse_id && opModal.mode !== 'return') return showToast('Оберіть склад', 'error');
        if (!opForm.warehouse_id) return showToast('Оберіть склад', 'error');

        const { over } = computeOverage();
        if (over && !opForm.reason.trim()) {
            return showToast('Перевищення плану — вкажіть причину в коментарі', 'warning');
        }

        const item = opModal.item;
        setIsSubmitting(true);
        try {
            let rpcName, args;
            if (opModal.mode === 'reserve') {
                rpcName = 'reserve_for_object';
                args = {
                    p_installation: selectedInst.custom_id,
                    p_warehouse: parseInt(opForm.warehouse_id),
                    p_nomenclature: item.nomenclature_id,
                    p_spec_item: item.specification_item_id,
                    p_qty: qty,
                    p_emp: employee?.id ?? null,
                };
            } else if (opModal.mode === 'issue') {
                rpcName = 'issue_to_object';
                args = {
                    p_installation: selectedInst.custom_id,
                    p_warehouse: parseInt(opForm.warehouse_id),
                    p_nomenclature: item.nomenclature_id,
                    p_qty: qty,
                    p_reason: opForm.reason.trim() || null,
                    p_emp: employee?.id ?? null,
                };
            } else {
                rpcName = 'return_from_object';
                args = {
                    p_installation: selectedInst.custom_id,
                    p_warehouse: parseInt(opForm.warehouse_id),
                    p_nomenclature: item.nomenclature_id,
                    p_qty: qty,
                    p_reason: opForm.reason.trim() || null,
                    p_emp: employee?.id ?? null,
                };
            }

            const { data, error } = await supabase.rpc(rpcName, args);
            if (error) throw error;
            if (data && data.ok === false) {
                return showToast(data.message || 'Операцію відхилено', 'error');
            }

            showToast(`${OP_MODES[opModal.mode].verb}: успішно (${qty} ${unitOf(item.nomenclature_id)})`, 'success');
            closeOp();
            await refreshDetails();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- ФІЛЬТРАЦІЯ ДАШБОРДУ ---
    const filteredInst = installations.filter(i => {
        const term = searchTerm.toLowerCase();
        return i.name?.toLowerCase().includes(term) || String(i.custom_id).includes(term) || i.client?.name?.toLowerCase().includes(term);
    });

    if (authLoading) return <div className="p-8 text-center text-slate-500">Завантаження...</div>;

    const overage = opModal.isOpen ? computeOverage() : { over: false, ref: 0 };
    const mInfo = opModal.isOpen ? modalStockInfo() : null;
    const modeCfg = opModal.mode ? OP_MODES[opModal.mode] : null;

    return (
        <Layout>
            <div className="p-4 sm:p-8 max-w-[1400px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800 relative">
                <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

                {/* --- ГОЛОВНИЙ ЕКРАН (ДАШБОРД) --- */}
                {!selectedInst ? (
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8 flex-none">
                            <div>
                                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
                                    <FaBoxOpen className="text-indigo-600" /> Забезпечення об'єктів
                                </h1>
                                <p className="text-slate-500 text-sm mt-1 ml-10">Комплектація, резерв, видача та повернення матеріалів</p>
                            </div>
                        </div>

                        <div className="relative mb-6">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input type="text" placeholder="Пошук за назвою або номером об'єкта..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm shadow-sm transition-colors" />
                        </div>

                        {loading ? (
                            <div className="space-y-4">
                                {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse"></div>)}
                            </div>
                        ) : filteredInst.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                                <FaHardHat className="mx-auto text-5xl text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-600">Активних об'єктів не знайдено</h3>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredInst.map(inst => (
                                    <div
                                        key={inst.custom_id}
                                        onClick={() => openObjectDetails(inst)}
                                        className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col md:flex-row md:justify-between md:items-center cursor-pointer hover:shadow-md hover:border-indigo-300 transition-all gap-4 group"
                                    >
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="text-xs text-slate-400 font-mono font-bold tracking-wider">СЕС-{inst.custom_id}</span>
                                                <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wide border shadow-sm ${inst.badgeColor}`}>
                                                    {inst.statusBadge}
                                                </span>
                                            </div>
                                            <h3 className="font-bold text-lg text-slate-800 group-hover:text-indigo-700 transition-colors leading-tight mb-1">{inst.name}</h3>
                                            <p className="text-xs font-medium text-slate-500">{inst.client?.company_name || inst.client?.name || 'Невідомий клієнт'} • Позицій у специфікації: {inst.needsCount}</p>
                                        </div>

                                        <div className="w-full md:w-32 text-right">
                                            <div className="text-xl font-black text-slate-800 mb-1.5">{inst.readiness}%</div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                                <div className={`h-full rounded-full transition-all duration-1000 ${inst.readiness === 100 ? 'bg-emerald-500' : inst.readiness > 0 ? 'bg-blue-500' : 'bg-slate-300'}`} style={{width: `${inst.readiness}%`}}></div>
                                            </div>
                                            <div className="text-[10px] font-bold text-slate-400 mt-1.5 uppercase tracking-widest">Готовність</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                ) : (
                    /* --- ДЕТАЛІ ОБ'ЄКТА (СПЕЦИФІКАЦІЯ VS СКЛАД) --- */
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex-1 flex flex-col h-full">
                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 sticky top-0 z-10">
                            <div>
                                <button onClick={() => setSelectedInst(null)} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 mb-2 flex items-center gap-1 transition-colors">
                                    <FaChevronLeft/> Назад до списку
                                </button>
                                <h2 className="text-xl sm:text-2xl font-bold text-slate-800 leading-tight">Комплектація: {selectedInst.name}</h2>
                                <p className="text-sm text-slate-500 mt-1 font-medium">СЕС-{selectedInst.custom_id} • Резерв · Видача · Повернення</p>
                            </div>
                            <div className="flex items-center gap-3 w-full md:w-auto">
                                <button
                                    onClick={() => setIsManualOpen(true)}
                                    className="flex-1 md:flex-none px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"
                                >
                                    <FaClipboardList size={13}/> Комплектація вручну
                                </button>
                                <div className="text-right hidden sm:block">
                                    <div className="text-3xl font-black text-slate-800">{selectedInst.readiness}%</div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Забезпечено</div>
                                </div>
                            </div>
                        </div>

                        {detailLoading ? (
                            <div className="flex-1 flex items-center justify-center"><div className="animate-pulse text-indigo-500 font-bold text-lg">Завантаження специфікації...</div></div>
                        ) : specNeeds.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300 flex-1">
                                <FaBoxOpen className="mx-auto text-5xl text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-600">Специфікація порожня або не затверджена</h3>
                                <p className="text-slate-400 text-sm mt-1 mb-5">Оцифруйте PDF або внесіть комплектацію вручну для цього об'єкта.</p>
                                <button onClick={() => setIsManualOpen(true)} className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow-md hover:bg-indigo-700 transition-colors">
                                    <FaClipboardList size={13}/> Внести комплектацію вручну
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[1050px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                                                <th className="px-5 py-4 font-bold w-1/3">Номенклатура</th>
                                                <th className="px-4 py-4 font-bold text-center border-l border-slate-200">Потреба</th>
                                                <th className="px-4 py-4 font-bold text-center bg-amber-50/50">У резерві</th>
                                                <th className="px-4 py-4 font-bold text-center bg-blue-50/50">Видано</th>
                                                <th className="px-4 py-4 font-bold text-center bg-red-50/50">Дефіцит</th>
                                                <th className="px-5 py-4 font-bold text-right border-l border-slate-200 w-[280px]">Дії</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {specNeeds.map(item => {
                                                const req = parseFloat(item.required_quantity);
                                                const iss = parseFloat(item.issued_quantity);
                                                const res = parseFloat(item.reserved_quantity);
                                                const defect = parseFloat(item.outstanding_need);

                                                const isFullyCovered = defect <= 0;
                                                const nom = nomenclatures.find(n => n.id === item.nomenclature_id);
                                                const unitName = nom?.unit?.name || 'шт';

                                                const availableGlobal = stockRows
                                                    .filter(s => String(s.nomenclature_id) === String(item.nomenclature_id))
                                                    .reduce((sum, s) => sum + parseFloat(s.quantity_available), 0);
                                                const myReserved = reservedHereTotal(item.nomenclature_id);
                                                const canIssue = myReserved > 0 || (defect > 0 && availableGlobal > 0);

                                                return (
                                                    <tr key={item.specification_item_id} className={`hover:bg-slate-50/50 transition-colors ${isFullyCovered ? 'bg-emerald-50/20' : ''}`}>
                                                        <td className="px-5 py-4 align-middle">
                                                            <div className="font-bold text-slate-800 text-sm leading-tight">{nom?.fullName || item.nomenclature_name}</div>
                                                            {nom?.sku && <div className="text-[10px] text-slate-400 font-mono mt-1 tracking-widest uppercase">SKU: {nom.sku}</div>}
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center border-l border-slate-100">
                                                            <span className="font-black text-slate-700 text-base">{req}</span> <span className="text-[10px] font-bold text-slate-400 uppercase">{unitName}</span>
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center bg-amber-50/10">
                                                            <span className="font-bold text-amber-600 text-sm">{res}</span>
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center bg-blue-50/10">
                                                            <span className="font-bold text-blue-600 text-sm">{iss}</span>
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center bg-red-50/10">
                                                            {defect > 0 ? (
                                                                <span className="font-black text-red-600 text-base bg-red-100 px-2 py-0.5 rounded border border-red-200">{defect}</span>
                                                            ) : (
                                                                <FaCheck className="mx-auto text-emerald-500" />
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-4 align-middle text-right border-l border-slate-100">
                                                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                                                {defect > 0 && (
                                                                    <button
                                                                        onClick={() => openOp('reserve', item)}
                                                                        disabled={availableGlobal <= 0}
                                                                        title={availableGlobal > 0 ? `На складах вільно: ${availableGlobal} ${unitName}` : 'Немає вільного залишку'}
                                                                        className="px-3 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white disabled:opacity-40 disabled:hover:bg-indigo-50 disabled:hover:text-indigo-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 border border-indigo-200"
                                                                    >
                                                                        <FaLock size={11}/> Резерв
                                                                    </button>
                                                                )}
                                                                <button
                                                                    onClick={() => openOp('issue', item)}
                                                                    disabled={!canIssue}
                                                                    title={myReserved > 0 ? `У резерві під об'єкт: ${myReserved} ${unitName}` : 'Видати зі складу'}
                                                                    className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white disabled:opacity-40 disabled:hover:bg-emerald-50 disabled:hover:text-emerald-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 border border-emerald-200"
                                                                >
                                                                    <FaArrowUp size={11}/> Видати
                                                                </button>
                                                                {iss > 0 && (
                                                                    <button
                                                                        onClick={() => openOp('return', item)}
                                                                        title="Повернути на склад"
                                                                        className="px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 border border-amber-200"
                                                                    >
                                                                        <FaUndo size={11}/> Повернути
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {isFullyCovered && iss === 0 && (
                                                                <div className="text-[10px] font-bold text-emerald-600 mt-1.5">Забезпечено (резерв)</div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* --- ЄДИНА МОДАЛКА ОПЕРАЦІЇ (РЕЗЕРВ / ВИДАЧА / ПОВЕРНЕННЯ) --- */}
                <AnimatePresence>
                    {opModal.isOpen && opModal.item && modeCfg && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-[80]">
                            <motion.div initial={{ scale: 0.98, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 30 }} className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[95vh]" onClick={e => e.stopPropagation()}>
                                <div className={`p-5 sm:p-6 border-b border-slate-100 flex justify-between items-center ${modeCfg.headBg} flex-shrink-0`}>
                                    <h2 className={`text-lg sm:text-xl font-bold ${modeCfg.headText} flex items-center gap-2`}>
                                        <modeCfg.icon className={modeCfg.headIcon}/> {modeCfg.label}
                                    </h2>
                                    <button onClick={closeOp} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes/></button>
                                </div>

                                <div className="p-5 sm:p-6 flex-1 overflow-y-auto custom-scrollbar">
                                    {/* Товар + звірка */}
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 mb-5 shadow-sm">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Товар</div>
                                        <div className="font-bold text-slate-800 text-sm leading-tight mb-3">{nameOf(opModal.item)}</div>
                                        <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                                            <div className="bg-slate-50 rounded-lg py-1.5 border border-slate-100">
                                                <div className="text-slate-400 font-bold uppercase">Потреба</div>
                                                <div className="font-black text-slate-700">{parseFloat(opModal.item.required_quantity)}</div>
                                            </div>
                                            <div className="bg-amber-50 rounded-lg py-1.5 border border-amber-100">
                                                <div className="text-amber-500 font-bold uppercase">Резерв</div>
                                                <div className="font-black text-amber-700">{parseFloat(opModal.item.reserved_quantity)}</div>
                                            </div>
                                            <div className="bg-blue-50 rounded-lg py-1.5 border border-blue-100">
                                                <div className="text-blue-500 font-bold uppercase">Видано</div>
                                                <div className="font-black text-blue-700">{parseFloat(opModal.item.issued_quantity)}</div>
                                            </div>
                                            <div className="bg-red-50 rounded-lg py-1.5 border border-red-100">
                                                <div className="text-red-500 font-bold uppercase">Дефіцит</div>
                                                <div className="font-black text-red-700">{parseFloat(opModal.item.outstanding_need)}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <form id="op-form" onSubmit={executeOp} className="space-y-5">
                                        <div>
                                            <label className="text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5">
                                                <FaWarehouse className="text-slate-400"/>
                                                {opModal.mode === 'return' ? 'Склад повернення (куди)' : 'Склад (звідки)'}
                                            </label>
                                            <select
                                                required
                                                value={opForm.warehouse_id}
                                                onChange={e => setOpForm(f => ({ ...f, warehouse_id: e.target.value }))}
                                                className={`w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 ${modeCfg.ring} focus:bg-white outline-none text-sm font-bold text-slate-800 transition-colors`}
                                            >
                                                <option value="">Оберіть склад...</option>
                                                {warehouses.filter(w => w.is_active).map(w => {
                                                    const s = stockAt(w.id, opModal.item.nomenclature_id);
                                                    const hint = opModal.mode === 'reserve'
                                                        ? `вільно: ${s.available}`
                                                        : opModal.mode === 'issue'
                                                            ? `можна видати: ${issuableAt(w.id, opModal.item.nomenclature_id)}`
                                                            : `на складі: ${s.onHand}`;
                                                    return <option key={w.id} value={w.id}>{w.name} ({hint})</option>;
                                                })}
                                            </select>
                                            {mInfo && (
                                                <div className="text-[11px] text-slate-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
                                                    <span>Фізично: <b className="text-slate-700">{mInfo.onHand}</b></span>
                                                    <span>Резерв (всі): <b className="text-amber-600">{mInfo.reservedTotal}</b></span>
                                                    <span>Резерв цього об'єкта: <b className="text-indigo-600">{mInfo.reservedHere}</b></span>
                                                    <span>Вільно: <b className="text-emerald-600">{mInfo.available}</b></span>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Кількість <span className="text-red-500">*</span></label>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number" min="0" step="any" required autoFocus
                                                    value={opForm.quantity}
                                                    onChange={e => setOpForm(f => ({ ...f, quantity: e.target.value }))}
                                                    className={`w-36 px-4 py-3 bg-white border-2 ${modeCfg.border} rounded-xl text-xl font-black ${modeCfg.text} text-center outline-none transition-colors`}
                                                />
                                                <span className="text-sm font-bold text-slate-400 uppercase">{unitOf(opModal.item.nomenclature_id)}</span>
                                            </div>
                                        </div>

                                        {/* Попередження про перевищення плану */}
                                        {overage.over && (
                                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                                                <FaExclamationTriangle className="text-amber-500 mt-0.5 flex-shrink-0"/>
                                                <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
                                                    {opModal.mode === 'return'
                                                        ? `Повернення (${opForm.quantity}) перевищує видану кількість (${overage.ref}).`
                                                        : `Перевищення плану: ${opForm.quantity} проти залишкової потреби ${overage.ref}.`}
                                                    {' '}Вкажіть причину нижче.
                                                </p>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">
                                                Коментар / причина {overage.over && <span className="text-red-500">*</span>}
                                            </label>
                                            <input
                                                type="text"
                                                value={opForm.reason}
                                                onChange={e => setOpForm(f => ({ ...f, reason: e.target.value }))}
                                                placeholder={overage.over ? 'Обов’язково: чому перевищення?' : 'Опційно...'}
                                                className={`w-full px-4 py-2.5 bg-slate-50 border rounded-xl focus:bg-white focus:ring-2 ${modeCfg.ring} outline-none text-sm text-slate-800 transition-colors ${overage.over ? 'border-amber-300' : 'border-slate-200'}`}
                                            />
                                        </div>
                                    </form>
                                </div>

                                <div className="p-4 sm:p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0 pb-safe">
                                    <button type="button" onClick={closeOp} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                    <button form="op-form" type="submit" disabled={isSubmitting} className={`px-8 py-2.5 text-white rounded-xl font-bold shadow-md transition-colors text-sm flex items-center gap-2 disabled:opacity-50 ${modeCfg.btn}`}>
                                        {isSubmitting ? 'Обробка...' : modeCfg.verb}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* --- РУЧНЕ ВНЕСЕННЯ / РЕДАГУВАННЯ КОМПЛЕКТАЦІЇ --- */}
                {isManualOpen && selectedInst && (
                    <ManualSpecBuilder
                        isOpen={isManualOpen}
                        onClose={() => setIsManualOpen(false)}
                        onSuccess={refreshDetails}
                        installationId={selectedInst.custom_id}
                        taskId="complectation"
                        title="Комплектація матеріалів"
                        showToast={showToast}
                    />
                )}

            </div>
        </Layout>
    );
}
