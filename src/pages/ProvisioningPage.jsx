import React, { useState, useEffect, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaSearch, FaChevronLeft, FaCheck, FaExclamationTriangle, 
    FaTimes, FaHardHat, FaBoxOpen, FaLock, FaWarehouse
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import Layout from '../Layout';
import { useAuth } from '../AuthProvider';

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
    const [stockAvailable, setStockAvailable] = useState([]);
    const [detailLoading, setDetailLoading] = useState(false);

    // Модалка резервування
    const [reserveModal, setReserveModal] = useState({ isOpen: false, item: null, stockOptions: [] });
    const [reserveForm, setReserveForm] = useState({ warehouse_id: '', quantity: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // --- ЗАВАНТАЖЕННЯ ДАШБОРДУ ТА ДОВІДНИКІВ ---
    const loadDashboard = useCallback(async () => {
        setLoading(true);
        try {
            // Тягнемо все паралельно для швидкодії
            const [instRes, needsRes, whRes, nomRes, catRes] = await Promise.all([
                supabase.from('installations').select(`custom_id, name, status, gps_link, client:clients(name, company_name)`).in('status', ['planning', 'in_progress', 'pending']).order('created_at', { ascending: false }),
                supabase.from('v_object_material_needs').select('*'),
                supabase.from('warehouses').select('id, name'),
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(name)'),
                supabase.from('categories').select('*')
            ]);

            if (instRes.error) throw instRes.error;
            if (needsRes.error) throw needsRes.error;

            setWarehouses(whRes.data || []);

            // Формуємо повні назви номенклатури (як на Складі)
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

            // Формуємо прогрес для кожного об'єкта
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
            // Тягнемо ЧИСТІ в'юхи (без nested joins, бо PostgREST їх не пропустить)
            const [needsRes, stockRes] = await Promise.all([
                supabase.from('v_object_material_needs').select('*').eq('installation_custom_id', inst.custom_id),
                supabase.from('v_warehouse_stock_available').select('*').gt('quantity_available', 0)
            ]);

            if (needsRes.error) throw needsRes.error;
            if (stockRes.error) throw stockRes.error;

            setSpecNeeds(needsRes.data || []);
            setStockAvailable(stockRes.data || []);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setDetailLoading(false);
        }
    };

    // --- ОБРОБНИК РЕЗЕРВУВАННЯ ---
    const handleOpenReserve = (needItem) => {
        // Знаходимо склади, де є цей товар
        const availableOnWarehouses = stockAvailable.filter(s => String(s.nomenclature_id) === String(needItem.nomenclature_id));
        
        if (availableOnWarehouses.length === 0) {
            return showToast('Цього товару зараз немає на жодному складі', 'warning');
        }

        setReserveModal({ isOpen: true, item: needItem, stockOptions: availableOnWarehouses });
        
        // Автозаповнення
        const defect = parseFloat(needItem.outstanding_need);
        const autoWh = availableOnWarehouses[0]; // Беремо перший склад по дефолту де є залишок
        const autoQty = Math.min(defect, parseFloat(autoWh.quantity_available));
        
        setReserveForm({ warehouse_id: autoWh.warehouse_id, quantity: autoQty });
    };

    const handleExecuteReserve = async (e) => {
        e.preventDefault();
        const qty = parseFloat(reserveForm.quantity);
        if (!qty || qty <= 0 || !Number.isInteger(qty)) return showToast('Введіть цілу кількість для резерву', 'error');

        const selectedWh = reserveModal.stockOptions.find(w => String(w.warehouse_id) === String(reserveForm.warehouse_id));
        if (!selectedWh || qty > parseFloat(selectedWh.quantity_available)) {
            return showToast('Недостатньо вільного товару на обраному складі', 'error');
        }

        setIsSubmitting(true);
        try {
            const payload = {
                installation_custom_id: selectedInst.custom_id,
                warehouse_id: parseInt(reserveForm.warehouse_id),
                nomenclature_id: reserveModal.item.nomenclature_id,
                specification_item_id: reserveModal.item.specification_item_id,
                reserved_quantity: qty,
                status: 'active',
                created_by: employee?.id
            };

            const { error: resErr } = await supabase.from('reservations').insert([payload]);
            if (resErr) throw resErr;
            
            showToast(`Успішно зарезервовано ${qty} шт.`, 'success');
            setReserveModal({ isOpen: false, item: null, stockOptions: [] });
            
            await openObjectDetails(selectedInst);
            loadDashboard(); // Оновлюємо дашборд у фоні
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
                                <p className="text-slate-500 text-sm mt-1 ml-10">Контроль комплектації, резерви матеріалів зі складу</p>
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
                                <h2 className="text-2xl font-bold text-slate-800 leading-tight">Комплектація: {selectedInst.name}</h2>
                                <p className="text-sm text-slate-500 mt-1 font-medium">СЕС-{selectedInst.custom_id} • Керування резервами</p>
                            </div>
                            <div className="text-right hidden sm:block">
                                <div className="text-3xl font-black text-slate-800">{selectedInst.readiness}%</div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Забезпечено</div>
                            </div>
                        </div>

                        {detailLoading ? (
                            <div className="flex-1 flex items-center justify-center"><div className="animate-pulse text-indigo-500 font-bold text-lg">Завантаження специфікації...</div></div>
                        ) : specNeeds.length === 0 ? (
                            <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300 flex-1">
                                <FaBoxOpen className="mx-auto text-5xl text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-600">Специфікація порожня або не затверджена</h3>
                                <p className="text-slate-400 text-sm mt-1">Оцифруйте та затвердьте PDF специфікацію для цього об'єкта.</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex-1 overflow-hidden flex flex-col">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[1000px]">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                                                <th className="px-5 py-4 font-bold w-1/3">Номенклатура</th>
                                                <th className="px-4 py-4 font-bold text-center border-l border-slate-200">Потреба (Проєкт)</th>
                                                <th className="px-4 py-4 font-bold text-center bg-blue-50/50">Видано</th>
                                                <th className="px-4 py-4 font-bold text-center bg-amber-50/50">У резерві</th>
                                                <th className="px-4 py-4 font-bold text-center bg-red-50/50">Дефіцит</th>
                                                <th className="px-5 py-4 font-bold text-right border-l border-slate-200">Дія (Склад)</th>
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

                                                const availableGlobal = stockAvailable
                                                    .filter(s => String(s.nomenclature_id) === String(item.nomenclature_id))
                                                    .reduce((sum, s) => sum + parseFloat(s.quantity_available), 0);

                                                return (
                                                    <tr key={item.specification_item_id} className={`hover:bg-slate-50/50 transition-colors ${isFullyCovered ? 'bg-emerald-50/20' : ''}`}>
                                                        <td className="px-5 py-4 align-middle">
                                                            <div className="font-bold text-slate-800 text-sm leading-tight">{nom?.fullName || item.nomenclature_name}</div>
                                                            {nom?.sku && <div className="text-[10px] text-slate-400 font-mono mt-1 tracking-widest uppercase">SKU: {nom.sku}</div>}
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center border-l border-slate-100">
                                                            <span className="font-black text-slate-700 text-base">{req}</span> <span className="text-[10px] font-bold text-slate-400 uppercase">{unitName}</span>
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center bg-blue-50/10">
                                                            <span className="font-bold text-blue-600 text-sm">{iss}</span>
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center bg-amber-50/10">
                                                            <span className="font-bold text-amber-600 text-sm">{res}</span>
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center bg-red-50/10">
                                                            {defect > 0 ? (
                                                                <span className="font-black text-red-600 text-base bg-red-100 px-2 py-0.5 rounded border border-red-200">{defect}</span>
                                                            ) : (
                                                                <FaCheck className="mx-auto text-emerald-500" />
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-4 align-middle text-right border-l border-slate-100">
                                                            {defect > 0 ? (
                                                                availableGlobal > 0 ? (
                                                                    <div className="flex flex-col items-end gap-1.5">
                                                                        <button 
                                                                            onClick={() => handleOpenReserve(item)}
                                                                            className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 border border-indigo-200"
                                                                        >
                                                                            <FaLock/> Зарезервувати
                                                                        </button>
                                                                        <span className="text-[10px] font-medium text-slate-500">На складах є: <b className="text-emerald-600">{availableGlobal}</b> {unitName}</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[11px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded border border-red-100">Немає в наявності</span>
                                                                )
                                                            ) : (
                                                                <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1 w-fit ml-auto">
                                                                    <FaCheck/> Забезпечено
                                                                </span>
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

                {/* --- МОДАЛКА: СТВОРЕННЯ РЕЗЕРВУ --- */}
                <AnimatePresence>
                    {reserveModal.isOpen && reserveModal.item && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
                                    <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2"><FaLock className="text-indigo-500"/> Створення резерву</h2>
                                    <button onClick={() => setReserveModal({ isOpen: false, item: null, stockOptions: [] })} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes/></button>
                                </div>
                                <div className="p-6">
                                    <div className="bg-white p-4 rounded-xl border border-slate-200 mb-6 shadow-sm">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Товар</div>
                                        <div className="font-bold text-slate-800 text-sm leading-tight mb-3">
                                            {nomenclatures.find(n => n.id === reserveModal.item.nomenclature_id)?.fullName || reserveModal.item.nomenclature_name}
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="bg-red-50 text-red-700 px-3 py-1.5 rounded-lg border border-red-100 text-xs font-bold">Дефіцит: {reserveModal.item.outstanding_need} {nomenclatures.find(n => n.id === reserveModal.item.nomenclature_id)?.unit?.name || 'шт'}</div>
                                        </div>
                                    </div>

                                    <form id="reserve-form" onSubmit={handleExecuteReserve} className="space-y-5">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5 flex items-center gap-1.5"><FaWarehouse className="text-slate-400"/> З якого складу резервуємо?</label>
                                            <select 
                                                required 
                                                value={reserveForm.warehouse_id} 
                                                onChange={e => {
                                                    const whId = e.target.value;
                                                    const wh = reserveModal.stockOptions.find(w => String(w.warehouse_id) === String(whId));
                                                    const newAutoQty = Math.min(parseFloat(reserveModal.item.outstanding_need), parseFloat(wh?.quantity_available || 0));
                                                    setReserveForm({ warehouse_id: whId, quantity: newAutoQty });
                                                }} 
                                                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none text-sm font-bold text-slate-800 transition-colors"
                                            >
                                                <option value="">Оберіть склад...</option>
                                                {reserveModal.stockOptions.map(w => {
                                                    const whInfo = warehouses.find(wh => wh.id === w.warehouse_id);
                                                    return (
                                                        <option key={w.warehouse_id} value={w.warehouse_id}>
                                                            {whInfo?.name || `Склад #${w.warehouse_id}`} (Вільно: {w.quantity_available})
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 mb-1.5">Кількість для резерву (Ціле число)</label>
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="number" min="1" step="1" 
                                                    max={reserveModal.stockOptions.find(w => String(w.warehouse_id) === String(reserveForm.warehouse_id))?.quantity_available || 1}
                                                    required 
                                                    autoFocus
                                                    value={reserveForm.quantity} 
                                                    onChange={e => setReserveForm({...reserveForm, quantity: e.target.value})} 
                                                    className="w-32 px-4 py-3 bg-white border-2 border-indigo-200 focus:border-indigo-500 rounded-xl text-xl font-black text-indigo-700 text-center outline-none transition-colors" 
                                                />
                                                <span className="text-sm font-bold text-slate-400 uppercase">
                                                    {nomenclatures.find(n => n.id === reserveModal.item.nomenclature_id)?.unit?.name || 'шт'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-2 font-medium">Товар буде закріплено за об'єктом і недоступний для інших проєктів.</p>
                                        </div>
                                    </form>
                                </div>
                                <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-2xl">
                                    <button type="button" onClick={() => setReserveModal({ isOpen: false, item: null, stockOptions: [] })} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                                    <button form="reserve-form" type="submit" disabled={isSubmitting} className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-colors text-sm flex items-center gap-2 disabled:opacity-50">
                                        {isSubmitting ? 'Обробка...' : 'Підтвердити резерв'}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        </Layout>
    );
}