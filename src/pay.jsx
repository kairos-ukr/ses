import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaDollarSign, FaPlus, FaSearch, FaReceipt, FaSort,
  FaSortUp, FaSortDown, FaExclamationCircle, FaCheckCircle, FaTimes,
  FaFileInvoiceDollar, FaHome, FaUsers, FaBuilding, FaUserTie, FaTasks,
  FaCog, FaCreditCard, FaBolt, FaSignOutAlt, FaSpinner, FaFolderOpen
} from "react-icons/fa";
import { createClient } from '@supabase/supabase-js';

// Ініціалізація Supabase клієнта
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Хелпер для форматування валюти в USD
const formatCurrency = (amount) => {
    if (typeof amount !== 'number') return '$0.00';
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
};

// --- ГОЛОВНИЙ КОМПОНЕНТ СТОРІНКИ ---
export default function PaymentsPage() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  // ⭐️ ЗМІНЕНО: Фільтр за замовчуванням
  const [statusFilter, setStatusFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'paid_at', direction: 'descending' });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    if (showAddForm) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showAddForm]);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => setToast(null), 4000);
  };

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
      console.error('Помилка завантаження:', error);
      showToast(`Помилка завантаження: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredAndSortedPayments = useMemo(() => {
    let filtered = payments.filter(payment => {
      const clientName = payment.installation?.client?.name?.toLowerCase() || '';
      const companyName = payment.installation?.client?.company_name?.toLowerCase() || '';
      const installationId = payment.installation?.custom_id?.toString() || '';
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = clientName.includes(searchLower) || companyName.includes(searchLower) || installationId.includes(searchLower);
      const paymentDate = new Date(payment.paid_at);
      const startDate = dateFilter.start ? new Date(dateFilter.start) : null;
      const endDate = dateFilter.end ? new Date(dateFilter.end) : null;
      if (startDate) startDate.setHours(0, 0, 0, 0);
      if (endDate) endDate.setHours(23, 59, 59, 999);
      const matchesDate = (!startDate || paymentDate >= startDate) && (!endDate || paymentDate <= endDate);
      if (!matchesSearch || !matchesDate) return false;
      const totalCost = payment.installation?.total_cost || 0;
      const paidAmount = payment.installation?.paid_amount || 0;
      const debt = totalCost - paidAmount;
      switch (statusFilter) {
        case 'paid': return debt <= 0;
        case 'debtors': return debt > 0;
        case 'all': default: return true;
      }
    });
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aValue, bValue;
        switch (sortConfig.key) {
          case 'installation_custom_id': aValue = a.installation?.custom_id; bValue = b.installation?.custom_id; break;
          case 'client_name': aValue = a.installation?.client?.company_name || a.installation?.client?.name; bValue = b.installation?.client?.company_name || b.installation?.client?.name; break;
          case 'debt': aValue = (a.installation?.total_cost || 0) - (a.installation?.paid_amount || 0); bValue = (b.installation?.total_cost || 0) - (b.installation?.paid_amount || 0); break;
          case 'status':
            const getStatusValue = (p) => { const debt = (p.installation?.total_cost || 0) - (p.installation?.paid_amount || 0); if (debt <= 0) return 2; if ((p.installation?.paid_amount || 0) > 0) return 1; return 0; };
            aValue = getStatusValue(a); bValue = getStatusValue(b); break;
          default: aValue = a[sortConfig.key]; bValue = b[sortConfig.key]; break;
        }
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [payments, searchTerm, dateFilter, sortConfig, statusFilter]);
  
  const paymentStats = useMemo(() => {
    const transactionCount = filteredAndSortedPayments.length;
    const uniqueInstallations = new Map();
    filteredAndSortedPayments.forEach(p => { if (p.installation && !uniqueInstallations.has(p.installation.custom_id)) { uniqueInstallations.set(p.installation.custom_id, p.installation); } });
    let totalDebt = 0;
    let totalPaidInSelection = 0;
    uniqueInstallations.forEach(inst => { const debt = (inst.total_cost || 0) - (inst.paid_amount || 0); if (debt > 0) { totalDebt += debt; } totalPaidInSelection += (inst.paid_amount || 0); });
    return { transactionCount, totalDebt, totalPaidInSelection };
  }, [filteredAndSortedPayments]);
  
  const handleSort = (key) => { let direction = 'ascending'; if (sortConfig.key === key && sortConfig.direction === 'ascending') { direction = 'descending'; } setSortConfig({ key, direction }); };

  if (loading) return <LoadingScreen />;

  return (
    <div className="flex h-screen bg-zinc-50 font-sans">
      <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} navigate={navigate} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onAddPayment={() => setShowAddForm(true)} onToggleSidebar={() => setIsSidebarOpen(p => !p)} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-zinc-100 p-4 sm:p-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <StatCard title="Загальний борг" value={paymentStats.totalDebt} icon={FaFileInvoiceDollar} color="red" />
              <StatCard title="Надходження у вибірці" value={paymentStats.totalPaidInSelection} icon={FaDollarSign} color="green" />
              <StatCard title="Кількість транзакцій" value={paymentStats.transactionCount} icon={FaReceipt} color="indigo" isCurrency={false} />
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm mb-6 ring-1 ring-zinc-200">
              <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-4">
                <div className="relative flex-grow w-full"><FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" /><input type="text" placeholder="Пошук за ID, клієнтом..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 transition" /></div>
                <div className="flex items-center gap-2 p-1 bg-zinc-100 rounded-lg w-full md:w-auto">
                  {['all', 'debtors', 'paid'].map(status => (<button key={status} onClick={() => setStatusFilter(status)} className={`w-full text-center px-4 py-2 text-sm font-semibold rounded-md transition-colors ${statusFilter === status ? 'bg-indigo-500 text-white shadow' : 'text-zinc-600 hover:bg-zinc-200'}`}>{status === 'all' ? 'Всі' : status === 'debtors' ? 'Боржники' : 'Оплачено'}</button>))}
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-4 items-center border-t border-zinc-200 pt-4"><label className="text-sm font-medium text-zinc-700 whitespace-nowrap">Фільтр по даті:</label><input type="date" value={dateFilter.start} onChange={(e) => setDateFilter(p => ({ ...p, start: e.target.value }))} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm w-full md:w-auto" /><span className="text-zinc-500">-</span><input type="date" value={dateFilter.end} onChange={(e) => setDateFilter(p => ({ ...p, end: e.target.value }))} className="px-3 py-2 border border-zinc-300 rounded-lg text-sm w-full md:w-auto" /><button onClick={() => setDateFilter({ start: '', end: '' })} className="text-sm text-indigo-600 hover:underline">Скинути</button></div>
            </div>
            <div className="hidden md:block bg-white rounded-xl shadow-sm ring-1 ring-zinc-200 overflow-hidden"><PaymentsTable payments={filteredAndSortedPayments} sortConfig={sortConfig} onSort={handleSort} /></div>
            <div className="md:hidden space-y-4">{filteredAndSortedPayments.length > 0 ? (filteredAndSortedPayments.map(payment => <PaymentCard key={payment.id} payment={payment} />)) : <NoDataPlaceholder />}</div>
          </div>
        </main>
      </div>

      {/* ⭐️ КНОПКА ДЛЯ МОБІЛЬНИХ */}
      <div className="sm:hidden fixed bottom-4 right-4 z-30">
        <button onClick={() => setShowAddForm(true)} className="w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"><FaPlus size={24} /></button>
      </div>

      <AnimatePresence>{showAddForm && <AddPaymentModal onClose={() => setShowAddForm(false)} installations={installations} onSuccess={loadData} showToast={showToast} />}</AnimatePresence>
      <AnimatePresence>{toast && <Toast key={toast.id} {...toast} onClose={() => setToast(null)} />}</AnimatePresence>
    </div>
  );
}
const LoadingScreen = () => (<div className="min-h-screen bg-zinc-50 flex items-center justify-center"><div className="text-center"><div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg mb-4 animate-pulse"><FaDollarSign className="text-white text-3xl" /></div><p className="text-zinc-600 font-medium">Завантаження платежів...</p></div></div>);
const Header = ({ onAddPayment, onToggleSidebar }) => (<header className="bg-white/80 backdrop-blur-lg border-b border-zinc-200 sticky top-0 z-20"><div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"><div className="flex justify-between items-center h-16"><div className="flex items-center gap-4"><div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-md"><FaDollarSign className="text-white text-xl" /></div><h1 className="text-2xl font-bold text-zinc-900">Платежі</h1></div><div className="flex items-center gap-2"><button onClick={onAddPayment} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition shadow"><FaPlus /><span>Новий платіж</span></button><button onClick={onToggleSidebar} className="p-2.5 bg-zinc-100 hover:bg-zinc-200 rounded-lg"><FaBolt className="text-zinc-700 text-xl" /></button></div></div></div></header>);
const Sidebar = ({ isSidebarOpen, setIsSidebarOpen, navigate }) => {
  const menuItems = [ { id: 'home', label: 'Головна', icon: FaHome, path: '/home' }, { id: 'clients', label: 'Клієнти', icon: FaUsers, path: '/clients' }, { id: 'installations', label: "Об'єкти", icon: FaBuilding, path: '/installations' }, { id: 'employees', label: 'Працівники', icon: FaUserTie, path: '/employees' }, { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks, path: '/tasks' }, { id: 'equipment', label: 'Обладнання', icon: FaCog, path: '/equipment' }, { id: 'payments', label: 'Платежі', icon: FaCreditCard, path: '/payments' }, { id: 'documents', label: 'Документи', icon: FaFolderOpen, path: '/documents' }, ];
  const handleNavigate = (path) => { navigate(path); setIsSidebarOpen(false); };
  const SidebarContent = () => (<div className="flex flex-col h-full bg-white text-zinc-700"><div className="p-5 border-b border-zinc-200 flex items-center gap-3"><div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg"><FaBolt className="text-white text-lg" /></div><h2 className="text-xl font-bold text-zinc-800">Меню</h2></div><nav className="flex-1 p-3 space-y-1">{menuItems.map((item) => { const isActive = window.location.pathname === item.path; return (<div key={item.id} onClick={() => !isActive && handleNavigate(item.path)} className={`w-full flex items-center gap-4 px-4 py-3 text-left rounded-lg transition-all ${isActive ? 'bg-indigo-100 text-indigo-700 cursor-default' : 'hover:bg-zinc-100 hover:text-zinc-800 cursor-pointer'}`}><item.icon className={isActive ? 'text-indigo-600' : 'text-zinc-500'} size={20} /><span className="font-semibold">{item.label}</span></div>) })}</nav><div className="p-4 border-t border-zinc-200"><button onClick={() => navigate("/")} className="w-full flex items-center justify-center gap-3 py-3 bg-zinc-100 hover:bg-red-50 hover:text-red-600 text-zinc-600 rounded-lg font-bold transition-all"><FaSignOutAlt /><span>Вийти</span></button></div></div>);
  return (<><AnimatePresence>{isSidebarOpen && (<><motion.div className="fixed inset-0 bg-black/60 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSidebarOpen(false)} /><motion.div className="fixed top-0 right-0 w-72 h-full z-50 shadow-2xl" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}><SidebarContent /></motion.div></>)}</AnimatePresence></>);
};
const StatCard = ({ title, value, icon: Icon, color, isCurrency = true }) => { const colors = { red: 'from-red-400 to-orange-500 text-red-600', green: 'from-green-400 to-emerald-500 text-green-700', indigo: 'from-indigo-400 to-purple-500 text-zinc-800' }; return (<div className="bg-white rounded-2xl p-6 shadow-sm ring-1 ring-zinc-200"><div className="flex items-center space-x-4"><div className={`w-12 h-12 bg-gradient-to-br ${colors[color]} rounded-xl flex items-center justify-center shadow-lg`}><Icon className="text-white text-2xl" /></div><div><p className="text-sm text-zinc-500">{title}</p><p className={`text-2xl font-bold ${colors[color]}`}>{isCurrency ? formatCurrency(value) : value}</p></div></div></div>); };
const SortableHeader = ({ children, column, sortConfig, onSort }) => { const isSorted = sortConfig.key === column; const direction = isSorted ? sortConfig.direction : 'none'; const getIcon = () => { if (!isSorted) return <FaSort className="text-zinc-400" />; if (direction === 'ascending') return <FaSortUp className="text-indigo-500" />; return <FaSortDown className="text-indigo-500" />; }; return (<th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider cursor-pointer select-none" onClick={() => onSort(column)}><div className="flex items-center space-x-2"><span>{children}</span>{getIcon()}</div></th>); };
const PaymentsTable = ({ payments, sortConfig, onSort }) => (<div className="overflow-x-auto"><table className="min-w-full divide-y divide-zinc-200"><thead className="bg-zinc-50"><tr><SortableHeader column="paid_at" sortConfig={sortConfig} onSort={onSort}>Дата</SortableHeader><SortableHeader column="installation_custom_id" sortConfig={sortConfig} onSort={onSort}>Проект ID</SortableHeader><SortableHeader column="client_name" sortConfig={sortConfig} onSort={onSort}>Клієнт</SortableHeader><SortableHeader column="amount" sortConfig={sortConfig} onSort={onSort}>Сума платежу</SortableHeader><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Сума / Сплачено</th><SortableHeader column="debt" sortConfig={sortConfig} onSort={onSort}>Борг</SortableHeader><SortableHeader column="status" sortConfig={sortConfig} onSort={onSort}>Статус</SortableHeader><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Коментар / Нагадування</th></tr></thead><tbody className="bg-white divide-y divide-zinc-200">{payments.length === 0 ? (<tr><td colSpan="8" className="text-center py-12"><NoDataPlaceholder /></td></tr>) : (payments.map((payment, i) => <PaymentTableRow key={payment.id} payment={payment} index={i} />))}</tbody></table></div>);
const PaymentStatus = ({ installation }) => { const totalCost = installation?.total_cost || 0; const paidAmount = installation?.paid_amount || 0; const debt = totalCost - paidAmount; let statusText, icon, colorClasses; if (debt <= 0) { statusText = 'Оплачено'; icon = <FaCheckCircle />; colorClasses = 'bg-green-100 text-green-800'; } else if (paidAmount > 0) { statusText = 'Часткова оплата'; icon = <FaSpinner className="animate-spin" />; colorClasses = 'bg-yellow-100 text-yellow-800'; } else { statusText = 'Не оплачено'; icon = <FaExclamationCircle />; colorClasses = 'bg-red-100 text-red-800'; } return <span className={`px-3 py-1 inline-flex items-center gap-2 text-xs leading-5 font-semibold rounded-full ${colorClasses}`}>{icon}{statusText}</span>; };
const PaymentTableRow = ({ payment, index }) => { const inst = payment.installation; const totalCost = inst?.total_cost || 0; const paidAmount = inst?.paid_amount || 0; const debt = totalCost - paidAmount; return (<motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.05 }} className="hover:bg-zinc-50"><td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-zinc-900">{new Date(payment.paid_at).toLocaleDateString('uk-UA')}</div></td><td className="px-6 py-4 whitespace-nowrap"><span className="text-sm text-zinc-500 bg-zinc-100 px-2 py-1 rounded-full">#{inst.custom_id}</span></td><td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-zinc-900">{inst.client?.company_name || inst.client?.name}</div></td><td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-bold text-green-600">{formatCurrency(payment.amount)}</div></td><td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-zinc-900">{formatCurrency(totalCost)}</div><div className="text-xs text-green-600">{formatCurrency(paidAmount)}</div></td><td className="px-6 py-4 whitespace-nowrap"><div className={`text-sm font-medium ${debt > 0 ? 'text-red-600' : 'text-zinc-500'}`}>{debt > 0 ? formatCurrency(debt) : 'Немає'}</div></td><td className="px-6 py-4 whitespace-nowrap"><PaymentStatus installation={inst} /></td><td className="px-6 py-4 whitespace-normal text-sm text-zinc-600 min-w-[200px]" title={payment.comment || inst.notes}><div>{payment.comment || '-'}</div>{inst.notes && <div className="text-xs text-blue-500 pt-1">Нагадування: {inst.notes}</div>}</td></motion.tr>) };
const PaymentCard = ({ payment }) => { const inst = payment.installation; const totalCost = inst?.total_cost || 0; const paidAmount = inst?.paid_amount || 0; const debt = totalCost - paidAmount; return (<div className="bg-white rounded-xl shadow-sm ring-1 ring-zinc-200 p-4 space-y-3"><div className="flex justify-between items-start"><div className="space-y-1"><p className="font-bold text-zinc-800">{inst.client?.company_name || inst.client?.name}</p><p className="text-sm text-zinc-500">Проект #{inst.custom_id}</p></div><PaymentStatus installation={inst} /></div><div className="grid grid-cols-2 gap-4 border-t border-b border-zinc-100 py-3"><div className="space-y-1"><p className="text-xs text-zinc-500">Сума платежу</p><p className="font-bold text-green-600">{formatCurrency(payment.amount)}</p></div><div className="space-y-1"><p className="text-xs text-zinc-500">Дата</p><p className="font-medium text-zinc-700">{new Date(payment.paid_at).toLocaleDateString('uk-UA')}</p></div><div className="space-y-1"><p className="text-xs text-zinc-500">Загальна вартість</p><p className="font-medium text-zinc-700">{formatCurrency(totalCost)}</p></div><div className="space-y-1"><p className="text-xs text-zinc-500">Борг</p><p className={`font-bold ${debt > 0 ? 'text-red-600' : 'text-zinc-500'}`}>{debt > 0 ? formatCurrency(debt) : 'Немає'}</p></div></div>{payment.comment && <div><p className="text-xs text-zinc-500">Коментар</p><p className="text-sm text-zinc-700">{payment.comment}</p></div>}</div>); };
const AddPaymentModal = ({ onClose, installations, onSuccess, showToast }) => { const [formData, setFormData] = useState({ installation_custom_id: '', amount: '', paid_at: new Date().toISOString().split('T')[0], payment_method: 'Bank Transfer', comment: '' }); const [formErrors, setFormErrors] = useState({}); const [installationSearch, setInstallationSearch] = useState(""); const [submitting, setSubmitting] = useState(false); const handleInputChange = (field, value) => { setFormData(p => ({ ...p, [field]: value })); if (formErrors[field]) { setFormErrors(p => ({ ...p, [field]: '' })); } }; const handleInstallationSelect = (inst) => { setFormData(p => ({ ...p, installation_custom_id: inst.custom_id })); setInstallationSearch(`#${inst.custom_id} - ${inst.name || 'Об\'єкт без назви'}`); }; const validateForm = () => { const errors = {}; if (!formData.installation_custom_id) errors.installation_custom_id = 'Виберіть об\'єкт'; if (!formData.amount || isNaN(formData.amount) || parseFloat(formData.amount) <= 0) { errors.amount = 'Введіть коректну суму'; } if (!formData.paid_at) errors.paid_at = 'Вкажіть дату'; setFormErrors(errors); return Object.keys(errors).length === 0; }; const handleSubmit = async () => { if (!validateForm()) return; setSubmitting(true); try { const { error } = await supabase.from('payment_history').insert([{ installation_custom_id: parseInt(formData.installation_custom_id), amount: parseFloat(formData.amount), paid_at: formData.paid_at, payment_method: formData.payment_method, comment: formData.comment || null, }]); if (error) { showToast(`Помилка: ${error.message}`, 'error'); } else { showToast('Платіж успішно додано!'); onSuccess(); onClose(); } } catch (error) { showToast('Помилка при підключенні до БД', 'error'); } finally { setSubmitting(false); } }; const filteredInstallations = useMemo(() => installations.filter(inst => { if (!installationSearch) return true; const searchLower = installationSearch.toLowerCase(); return (inst.custom_id.toString().includes(searchLower) || (inst.name && inst.name.toLowerCase().includes(searchLower))); }), [installations, installationSearch]);
  return (<motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}><motion.div className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl relative my-8 ring-1 ring-zinc-200" initial={{ scale: 0.9, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 20, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} onClick={e => e.stopPropagation()}><div className="flex justify-between items-center mb-6"><h2 className="text-2xl font-bold text-zinc-800">Новий платіж</h2><button onClick={onClose} className="p-2 text-zinc-400 hover:bg-zinc-100 rounded-full"><FaTimes /></button></div><div className="space-y-5"><div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Об'єкт <span className="text-red-500">*</span></label><div className="relative"><input type="text" value={installationSearch} onChange={(e) => { setInstallationSearch(e.target.value); if(formData.installation_custom_id) handleInputChange('installation_custom_id', ''); }} placeholder="Почніть вводити ID або назву..." className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition ${formErrors.installation_custom_id ? 'border-red-500' : 'border-zinc-300'}`} />{installationSearch && !formData.installation_custom_id && (<div className="absolute z-10 w-full bg-white border border-zinc-200 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">{filteredInstallations.length > 0 ? filteredInstallations.map(inst => (<button key={inst.custom_id} type="button" onClick={() => handleInstallationSelect(inst)} className="w-full px-4 py-3 text-left hover:bg-zinc-50 border-b last:border-b-0"><div className="font-medium text-zinc-800">#{inst.custom_id} - {inst.name || 'Без назви'}</div><div className="text-sm text-zinc-500">{inst.client?.company_name || inst.client?.name}</div></button>)) : <div className="p-4 text-sm text-zinc-500">Не знайдено.</div>}</div>)}</div>{formErrors.installation_custom_id && <p className="text-red-500 text-sm mt-1">{formErrors.installation_custom_id}</p>}</div><div className="grid grid-cols-1 md:grid-cols-2 gap-5"><div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Сума ($) <span className="text-red-500">*</span></label><input type="number" min="0" step="0.01" value={formData.amount} onChange={(e) => handleInputChange('amount', e.target.value)} className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition ${formErrors.amount ? 'border-red-500' : 'border-zinc-300'}`} placeholder="50000" />{formErrors.amount && <p className="text-red-500 text-sm mt-1">{formErrors.amount}</p>}</div><div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Дата оплати <span className="text-red-500">*</span></label><input type="date" value={formData.paid_at} onChange={(e) => handleInputChange('paid_at', e.target.value)} className={`w-full border rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition ${formErrors.paid_at ? 'border-red-500' : 'border-zinc-300'}`} />{formErrors.paid_at && <p className="text-red-500 text-sm mt-1">{formErrors.paid_at}</p>}</div></div><div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Метод оплати</label><select value={formData.payment_method} onChange={(e) => handleInputChange('payment_method', e.target.value)} className="w-full border border-zinc-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 bg-white"><option>Банківський переказ</option><option>Готівка</option><option>Картка</option><option>Інше</option></select></div><div><label className="block text-sm font-medium text-zinc-700 mb-1.5">Коментар</label><textarea rows="3" value={formData.comment} onChange={(e) => handleInputChange('comment', e.target.value)} className="w-full border border-zinc-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Авансовий платіж..."></textarea></div></div><div className="flex justify-end gap-3 pt-5 border-t mt-6"><button type="button" onClick={onClose} disabled={submitting} className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg font-semibold transition disabled:opacity-50">Скасувати</button><button type="button" onClick={handleSubmit} disabled={submitting} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition shadow disabled:opacity-60 flex items-center gap-2">{submitting ? (<><FaSpinner className="animate-spin" /><span>Додавання...</span></>) : (<><FaPlus /><span>Додати платіж</span></>)}</button></div></motion.div></motion.div>);};
const Toast = ({ message, type, onClose }) => { const isSuccess = type === 'success'; return (<motion.div initial={{ y: -100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -100, opacity: 0 }} className={`fixed top-5 right-5 z-[100] flex items-center p-4 max-w-sm w-full text-white rounded-lg shadow-lg ${isSuccess ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}><div className="flex-shrink-0 text-2xl">{isSuccess ? <FaCheckCircle /> : <FaExclamationCircle />}</div><div className="ml-3 text-sm font-medium">{message}</div><button onClick={onClose} className="ml-auto -mx-1.5 -my-1.5 p-1.5 rounded-lg inline-flex h-8 w-8 text-white/70 hover:text-white hover:bg-white/20"><FaTimes /></button></motion.div>);};
const NoDataPlaceholder = () => (<div className="text-center py-12"><div className="w-16 h-16 bg-zinc-200 rounded-xl flex items-center justify-center mx-auto mb-4"><FaReceipt className="text-zinc-400 text-2xl" /></div><h3 className="text-xl font-bold text-zinc-600 mb-2">Платежів не знайдено</h3><p className="text-zinc-500">Спробуйте змінити фільтри</p></div>);