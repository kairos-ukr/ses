import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaDollarSign, FaPlus, FaSearch, FaReceipt, FaSort,
  FaSortUp, FaSortDown, FaExclamationCircle, FaCheckCircle, FaTimes,
  FaFileInvoiceDollar, FaCreditCard, FaSpinner, FaCalendarAlt, FaCommentDots,
  FaUniversity, FaMoneyBillWave, FaCreditCard as FaCard, FaQuestionCircle
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./components/Layout";

// --- Helpers ---
const formatCurrency = (amount) => {
    if (typeof amount !== 'number') return '$0.00';
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

const getMethodLabel = (method) => {
    const map = {
        'Bank Transfer': 'Банківський переказ',
        'Cash': 'Готівка',
        'Card': 'Картка',
        'Other': 'Інше'
    };
    return map[method] || method || 'Не вказано';
};

const getMethodIcon = (method) => {
    switch (method) {
        case 'Bank Transfer': return <FaUniversity className="text-blue-500"/>;
        case 'Cash': return <FaMoneyBillWave className="text-green-500"/>;
        case 'Card': return <FaCard className="text-purple-500"/>;
        default: return <FaQuestionCircle className="text-gray-400"/>;
    }
};

// --- UI Components ---

const StatCard = ({ title, value, icon: Icon, color, isCurrency = true }) => {
    const colors = {
        red: 'bg-red-50 text-red-600 border-red-100',
        green: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100'
    };
    const iconColors = {
        red: 'bg-red-500',
        green: 'bg-emerald-500',
        indigo: 'bg-indigo-500'
    };

    return (
        <div className={`p-5 rounded-2xl border ${colors[color]} shadow-sm flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-md ${iconColors[color]}`}>
                <Icon className="text-xl" />
            </div>
            <div>
                <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-0.5">{title}</p>
                <p className="text-2xl font-extrabold">{isCurrency ? formatCurrency(value) : value}</p>
            </div>
        </div>
    );
};

const PaymentStatusBadge = ({ installation }) => {
    const totalCost = installation?.total_cost || 0;
    const paidAmount = installation?.paid_amount || 0;
    const debt = totalCost - paidAmount;

    let statusConfig = { text: 'Невідомо', className: 'bg-slate-100 text-slate-600' };

    if (debt <= 0) {
        statusConfig = { text: 'Оплачено', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    } else if (paidAmount > 0) {
        statusConfig = { text: 'Частково', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    } else {
        statusConfig = { text: 'Борг', className: 'bg-red-100 text-red-700 border-red-200' };
    }

    return (
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusConfig.className}`}>
            {statusConfig.text}
        </span>
    );
};

const PaymentCard = ({ payment, onClick }) => {
    const inst = payment.installation;
    const debt = (inst?.total_cost || 0) - (inst?.paid_amount || 0);

    return (
        <div onClick={onClick} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer">
            <div className="flex justify-between items-start">
                <div>
                    <h4 className="font-bold text-slate-800 text-lg">{formatCurrency(payment.amount)}</h4>
                    <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-1">
                        <FaCalendarAlt /> {new Date(payment.paid_at).toLocaleDateString('uk-UA')}
                    </p>
                </div>
                <PaymentStatusBadge installation={inst} />
            </div>
            
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p className="text-sm font-bold text-slate-700 mb-1">{inst.client?.company_name || inst.client?.name}</p>
                <p className="text-xs text-slate-500">Проект: <span className="font-mono">{inst.name || '---'} (#{inst.custom_id})</span></p>
            </div>

            <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-100">
                <span className="text-slate-400">Загальний борг:</span>
                <span className={`font-bold ${debt > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {debt > 0 ? formatCurrency(debt) : '0.00'}
                </span>
            </div>
            
            {payment.comment && (
                <div className="flex items-start gap-2 text-xs text-slate-500 bg-yellow-50/50 p-2 rounded border border-yellow-100">
                    <FaCommentDots className="mt-0.5 text-yellow-500 flex-shrink-0"/>
                    <span className="line-clamp-2">{payment.comment}</span>
                </div>
            )}
        </div>
    );
};

// --- View Payment Details Modal ---
const PaymentDetailsModal = ({ onClose, payment }) => {
    const inst = payment.installation;
    const totalCost = inst?.total_cost || 0;
    const paidAmount = inst?.paid_amount || 0;
    const debt = totalCost - paidAmount;

    return (
        <motion.div 
            className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 sm:p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        >
            <motion.div 
                className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden relative"
                initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-none p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                    <div>
                        <h3 className="text-xl font-bold text-slate-800">Деталі платежу</h3>
                        <p className="text-sm text-slate-500">{new Date(payment.paid_at).toLocaleDateString('uk-UA')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 bg-white text-slate-400 hover:text-slate-600 rounded-full shadow-sm"><FaTimes /></button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 overscroll-contain">
                    <div className="text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Сума платежу</p>
                        <h2 className="text-4xl font-extrabold text-emerald-600">{formatCurrency(payment.amount)}</h2>
                        <div className="flex items-center justify-center gap-2 mt-3 text-sm text-slate-700 bg-slate-100 py-1.5 px-4 rounded-full w-fit mx-auto border border-slate-200">
                            {getMethodIcon(payment.payment_method)}
                            <span className="font-medium">{getMethodLabel(payment.payment_method)}</span>
                        </div>
                    </div>

                    <div className="border-t border-slate-100"></div>

                    <div className="space-y-3">
                        <h4 className="font-bold text-slate-800 text-xs uppercase flex items-center gap-2 tracking-wider"><FaFileInvoiceDollar/> Проект</h4>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-slate-500 text-sm">Клієнт</span>
                                <span className="font-bold text-slate-700 text-right">{inst.client?.company_name || inst.client?.name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 text-sm">Об'єкт</span>
                                <span className="font-medium text-slate-700 text-right">{inst.name} (#{inst.custom_id})</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h4 className="font-bold text-slate-800 text-xs uppercase flex items-center gap-2 tracking-wider"><FaCreditCard/> Баланс проекту</h4>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                                <p className="text-[10px] uppercase text-slate-400 font-bold mb-1">Всього</p>
                                <p className="font-bold text-slate-800">{formatCurrency(totalCost)}</p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-xl border border-red-100 text-center">
                                <p className="text-[10px] uppercase text-red-400 font-bold mb-1">Борг</p>
                                <p className="font-bold text-red-600">{formatCurrency(debt > 0 ? debt : 0)}</p>
                            </div>
                        </div>
                    </div>

                    {payment.comment && (
                        <div className="space-y-2">
                            <h4 className="font-bold text-slate-800 text-xs uppercase flex items-center gap-2 tracking-wider"><FaCommentDots/> Коментар</h4>
                            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-slate-700 text-sm italic leading-relaxed whitespace-pre-wrap">
                                {payment.comment}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex-none p-4 border-t border-slate-100 bg-slate-50 pb-safe">
                    <button onClick={onClose} className="w-full py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl shadow-sm hover:bg-slate-50 active:scale-95 transition-transform">
                        Закрити
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// --- Add Payment Modal ---
const AddPaymentModal = ({ onClose, installations, onSuccess, showToast }) => {
    const [formData, setFormData] = useState({
        installation_custom_id: '',
        amount: '',
        paid_at: new Date().toISOString().split('T')[0],
        payment_method: 'Bank Transfer', 
        comment: ''
    });
    const [installationSearch, setInstallationSearch] = useState("");
    const [formErrors, setFormErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    
    const filteredInstallations = useMemo(() => {
        if (!installationSearch) return [];
        const lower = installationSearch.toLowerCase();
        return installations.filter(inst => 
            inst.custom_id.toString().includes(lower) || 
            (inst.name && inst.name.toLowerCase().includes(lower)) ||
            (inst.client?.name && inst.client.name.toLowerCase().includes(lower))
        );
    }, [installations, installationSearch]);

    const handleInstallationSelect = (inst) => {
        setFormData(p => ({ ...p, installation_custom_id: inst.custom_id }));
        setInstallationSearch(`#${inst.custom_id} - ${inst.name || 'Без назви'}`);
        setFormErrors(p => ({ ...p, installation_custom_id: '' }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = {};
        if (!formData.installation_custom_id) errors.installation_custom_id = 'Оберіть об\'єкт';
        if (!formData.amount || parseFloat(formData.amount) <= 0) errors.amount = 'Введіть суму';
        
        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            return;
        }

        setSubmitting(true);
        try {
            const { error } = await supabase.from('payment_history').insert([{
                installation_custom_id: parseInt(formData.installation_custom_id),
                amount: parseFloat(formData.amount),
                paid_at: formData.paid_at,
                payment_method: formData.payment_method,
                comment: formData.comment || null,
            }]);

            if (error) throw error;
            showToast('Платіж додано!', 'success');
            onSuccess();
            onClose();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <motion.div 
            className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 sm:p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
        >
            <motion.div 
                className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden"
                initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                onClick={e => e.stopPropagation()}
            >
                <div className="flex-none p-5 border-b border-slate-100 flex justify-between items-center bg-white">
                    <h2 className="text-xl font-bold text-slate-800">Новий платіж</h2>
                    <button onClick={onClose} className="p-2 bg-slate-50 text-slate-400 hover:text-slate-600 rounded-full"><FaTimes /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-5 bg-slate-50/30">
                    <div className="relative">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Об'єкт</label>
                        <div className="relative">
                            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input 
                                type="text" 
                                value={installationSearch} 
                                onChange={(e) => { setInstallationSearch(e.target.value); if(formData.installation_custom_id) setFormData(p => ({...p, installation_custom_id: ''})); }} 
                                placeholder="Пошук (ID, Назва, Клієнт)..." 
                                className={`w-full border rounded-xl pl-11 pr-4 py-3.5 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white ${formErrors.installation_custom_id ? 'border-red-500' : 'border-slate-200'}`}
                            />
                        </div>
                        {installationSearch && !formData.installation_custom_id && (
                            <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl mt-1 shadow-xl max-h-48 overflow-y-auto">
                                {filteredInstallations.length > 0 ? filteredInstallations.map(inst => (
                                    <button key={inst.custom_id} type="button" onClick={() => handleInstallationSelect(inst)} className="w-full px-4 py-3 text-left hover:bg-indigo-50 border-b border-slate-50 last:border-0">
                                        <div className="font-bold text-slate-800 text-sm">#{inst.custom_id} - {inst.name}</div>
                                        <div className="text-xs text-slate-500">{inst.client?.company_name || inst.client?.name}</div>
                                    </button>
                                )) : <div className="p-4 text-sm text-slate-400 text-center">Не знайдено</div>}
                            </div>
                        )}
                        {formErrors.installation_custom_id && <p className="text-red-500 text-xs mt-1 font-bold ml-1">{formErrors.installation_custom_id}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Сума ($)</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">$</span>
                                <input type="number" min="0" step="0.01" value={formData.amount} onChange={(e) => setFormData(p => ({ ...p, amount: e.target.value }))} className={`w-full border rounded-xl pl-8 pr-4 py-3.5 text-base sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${formErrors.amount ? 'border-red-500' : 'border-slate-200'}`} placeholder="0.00" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Дата</label>
                            <input type="date" value={formData.paid_at} onChange={(e) => setFormData(p => ({ ...p, paid_at: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-base sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Метод оплати</label>
                        <select value={formData.payment_method} onChange={(e) => setFormData(p => ({ ...p, payment_method: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-4 py-3.5 text-base sm:text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white appearance-none">
                            <option value="Bank Transfer">Банківський переказ</option>
                            <option value="Cash">Готівка</option>
                            <option value="Card">Картка</option>
                            <option value="Other">Інше</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Коментар</label>
                        <textarea rows="3" value={formData.comment} onChange={(e) => setFormData(p => ({ ...p, comment: e.target.value }))} className="w-full border border-slate-200 rounded-xl p-4 text-base sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-white" placeholder="Призначення платежу..."></textarea>
                    </div>
                </div>

                <div className="flex-none p-6 bg-white border-t border-slate-100 flex justify-end gap-3 pb-safe">
                    <button type="button" onClick={onClose} disabled={submitting} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition">Скасувати</button>
                    <button type="button" onClick={handleSubmit} disabled={submitting} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-lg transition flex items-center gap-2">
                        {submitting ? <FaSpinner className="animate-spin" /> : <FaPlus />} <span>Додати</span>
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
};

// --- Toast ---
const Toast = ({ message, type, onClose }) => { 
    useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
    return (
        <motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto z-[200] flex items-center gap-3 p-4 rounded-xl shadow-2xl text-white font-medium ${type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
            <div className="text-xl">{type === 'error' ? <FaExclamationCircle /> : <FaCheckCircle />}</div>
            <p className="text-sm flex-1">{message}</p>
            <button onClick={onClose} className="opacity-80 hover:opacity-100"><FaTimes /></button>
        </motion.div>
    );
};

// --- MAIN PAGE ---
export default function PaymentsPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'paid_at', direction: 'descending' });
  
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewingPayment, setViewingPayment] = useState(null); 
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => setToast({ id: Date.now(), message, type }), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentsRes, installationsRes] = await Promise.all([
        supabase.from('payment_history').select(`*, installation:installations!inner(custom_id, name, total_cost, paid_amount, notes, client:clients(name, company_name))`).order('paid_at', { ascending: false }),
        supabase.from('installations').select(`custom_id, name, client:clients(name, company_name)`)
      ]);
      if (paymentsRes.error) throw paymentsRes.error;
      if (installationsRes.error) throw installationsRes.error;
      setPayments(paymentsRes.data || []);
      setInstallations(installationsRes.data || []);
    } catch (error) {
      showToast(`Помилка: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtering & Sorting
  const filteredPayments = useMemo(() => {
    let res = payments.filter(payment => {
      const searchLower = searchTerm.toLowerCase();
      const clientName = payment.installation?.client?.name || '';
      const companyName = payment.installation?.client?.company_name || '';
      const instName = payment.installation?.name || '';
      const instId = payment.installation?.custom_id?.toString() || '';
      
      const matchesSearch = clientName.toLowerCase().includes(searchLower) || 
                            companyName.toLowerCase().includes(searchLower) || 
                            instName.toLowerCase().includes(searchLower) ||
                            instId.includes(searchLower);

      // Date Filter
      const pDate = new Date(payment.paid_at);
      const start = dateFilter.start ? new Date(dateFilter.start) : null;
      const end = dateFilter.end ? new Date(dateFilter.end) : null;
      if (end) end.setHours(23, 59, 59, 999);
      const matchesDate = (!start || pDate >= start) && (!end || pDate <= end);

      // Status Filter
      const total = payment.installation?.total_cost || 0;
      const paid = payment.installation?.paid_amount || 0;
      const debt = total - paid;
      let matchesStatus = true;
      if (statusFilter === 'debtors') matchesStatus = debt > 0;
      if (statusFilter === 'paid') matchesStatus = debt <= 0;

      return matchesSearch && matchesDate && matchesStatus;
    });

    if (sortConfig.key) {
        res.sort((a, b) => {
            let aVal = a[sortConfig.key];
            let bVal = b[sortConfig.key];
            
            if (sortConfig.key === 'client') {
                aVal = a.installation?.client?.company_name || a.installation?.client?.name;
                bVal = b.installation?.client?.company_name || b.installation?.client?.name;
            }

            if (aVal < bVal) return sortConfig.direction === 'ascending' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'ascending' ? 1 : -1;
            return 0;
        });
    }
    return res;
  }, [payments, searchTerm, statusFilter, dateFilter, sortConfig]);

  const stats = useMemo(() => {
      const uniqueInsts = new Map();
      let totalPaid = 0;
      
      filteredPayments.forEach(p => {
          totalPaid += p.amount;
          if (p.installation) uniqueInsts.set(p.installation.custom_id, p.installation);
      });

      let totalDebt = 0;
      uniqueInsts.forEach(inst => {
          const d = (inst.total_cost || 0) - (inst.paid_amount || 0);
          if (d > 0) totalDebt += d;
      });

      return { count: filteredPayments.length, totalPaid, totalDebt };
  }, [filteredPayments]);

  const handleSort = (key) => {
      setSortConfig(p => ({ key, direction: p.key === key && p.direction === 'ascending' ? 'descending' : 'ascending' }));
  };

  return (
    <Layout>
      <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto pb-safe min-h-[calc(100dvh-80px)] flex flex-col">
        {/* HEADER */}
        <div className="flex flex-col gap-4 flex-none">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                        <FaCreditCard className="text-emerald-600"/> Фінанси
                    </h1>
                    <p className="text-slate-500 text-sm mt-1">Історія надходжень та заборгованість</p>
                </div>
                <button onClick={() => setShowAddForm(true)} className="hidden sm:flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 active:scale-95 transition-all w-full sm:w-auto">
                    <FaPlus/> <span>Новий платіж</span>
                </button>
            </div>

            {/* STATS CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard title="Надходження (Вибірка)" value={stats.totalPaid} icon={FaDollarSign} color="green" />
                <StatCard title="Загальний борг (Вибірка)" value={stats.totalDebt} icon={FaFileInvoiceDollar} color="red" />
                <StatCard title="Транзакцій" value={stats.count} icon={FaReceipt} color="indigo" isCurrency={false} />
            </div>

            {/* FILTERS */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-col md:flex-row gap-4 justify-between">
                    <div className="relative flex-grow max-w-md">
                        <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <input type="text" placeholder="Пошук (Клієнт, ID, Сума)..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none text-sm transition-all"/>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto">
                        {[{id:'all', l:'Всі'}, {id:'debtors', l:'Боржники'}, {id:'paid', l:'Оплачені'}].map(s => (
                            <button key={s.id} onClick={() => setStatusFilter(s.id)} className={`flex-1 px-4 py-2 rounded-lg text-xs font-bold transition-all ${statusFilter === s.id ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{s.l}</button>
                        ))}
                    </div>
                </div>
                {/* FIX: Адаптивний блок фільтру дати */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-slate-600 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700">Період:</span>
                        <input 
                            type="date" 
                            value={dateFilter.start} 
                            onChange={e => setDateFilter(p => ({...p, start: e.target.value}))} 
                            className="border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-emerald-500 text-xs"
                        />
                        <span className="text-slate-400">—</span>
                        <input 
                            type="date" 
                            value={dateFilter.end} 
                            onChange={e => setDateFilter(p => ({...p, end: e.target.value}))} 
                            className="border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:border-emerald-500 text-xs"
                        />
                    </div>
                    
                    {(dateFilter.start || dateFilter.end) && (
                        <button 
                            onClick={() => setDateFilter({start:'', end:''})} 
                            className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-auto sm:ml-0 bg-red-50/50 border border-red-100"
                        >
                            Скинути
                        </button>
                    )}
                </div>
            </div>
        </div>

        {/* CONTENT */}
        <div className="flex-1">
            {loading ? <div className="text-center py-20 text-slate-400">Завантаження...</div> : 
             filteredPayments.length === 0 ? <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">Платежів не знайдено</div> : 
             (
                <>
                    {/* DESKTOP TABLE */}
                    <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500 font-bold">
                                <tr>
                                    <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('paid_at')}>Дата <FaSort className="inline ml-1"/></th>
                                    <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('client')}>Клієнт <FaSort className="inline ml-1"/></th>
                                    <th className="p-4 cursor-pointer hover:bg-slate-100" onClick={() => handleSort('amount')}>Сума <FaSort className="inline ml-1"/></th>
                                    <th className="p-4">Проект</th>
                                    <th className="p-4 text-center">Статус боргу</th>
                                    <th className="p-4 text-center">Коментар</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                                {filteredPayments.map(payment => (
                                    <tr key={payment.id} onClick={() => setViewingPayment(payment)} className="hover:bg-slate-50/50 transition-colors cursor-pointer">
                                        <td className="p-4 text-slate-600 font-mono">{new Date(payment.paid_at).toLocaleDateString('uk-UA')}</td>
                                        <td className="p-4 font-bold text-slate-800">{payment.installation?.client?.company_name || payment.installation?.client?.name}</td>
                                        <td className="p-4 font-bold text-emerald-600">{formatCurrency(payment.amount)}</td>
                                        <td className="p-4 text-slate-600">
                                            <div>{payment.installation?.name}</div>
                                            <div className="text-xs text-slate-400 font-mono">#{payment.installation?.custom_id}</div>
                                        </td>
                                        <td className="p-4 text-center"><PaymentStatusBadge installation={payment.installation} /></td>
                                        <td className="p-4 text-center">
                                            {payment.comment && <FaCommentDots className="inline text-slate-400"/>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* MOBILE CARDS */}
                    <div className="md:hidden space-y-3">
                        {filteredPayments.map(payment => (
                            <PaymentCard key={payment.id} payment={payment} onClick={() => setViewingPayment(payment)} />
                        ))}
                    </div>
                </>
             )
            }
        </div>

        {/* MOBILE FAB */}
        <div className="sm:hidden fixed bottom-6 right-6 z-40">
            <button onClick={() => setShowAddForm(true)} className="w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center shadow-2xl active:scale-90 transition-transform">
                <FaPlus size={24} />
            </button>
        </div>

        <AnimatePresence>
            {showAddForm && <AddPaymentModal onClose={() => setShowAddForm(false)} installations={installations} onSuccess={loadData} showToast={showToast} />}
            {viewingPayment && <PaymentDetailsModal onClose={() => setViewingPayment(null)} payment={viewingPayment} />}
            {toast && <Toast key={toast.id} {...toast} onClose={() => setToast(null)} />}
        </AnimatePresence>
      </div>
    </Layout>
  );
}