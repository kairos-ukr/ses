import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaMoneyBillWave,
  FaArrowLeft,
  FaPlus,
  FaSearch,
  FaFilter,
  FaReceipt,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaExclamationCircle,
  FaCheckCircle,
  FaSpinner,
  FaFileInvoiceDollar,
  FaTimes
} from "react-icons/fa";
import { createClient } from '@supabase/supabase-js';

// ПРИМІТКА: Для роботи кнопки "Назад" ваш проєкт повинен використовувати react-router-dom

// Supabase клієнт
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Компонент для заголовків таблиці з сортуванням
const SortableHeader = ({ children, column, sortConfig, onSort }) => {
  const isSorted = sortConfig.key === column;
  const direction = isSorted ? sortConfig.direction : 'none';

  const getIcon = () => {
    if (!isSorted) return <FaSort className="text-gray-400" />;
    if (direction === 'ascending') return <FaSortUp className="text-indigo-500" />;
    return <FaSortDown className="text-indigo-500" />;
  };

  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer select-none"
      onClick={() => onSort(column)}
    >
      <div className="flex items-center space-x-2">
        <span>{children}</span>
        {getIcon()}
      </div>
    </th>
  );
};

// Хелпер для форматування валюти
const formatCurrency = (amount) => {
    if (typeof amount !== 'number') return '0,00 ₴';
    return amount.toLocaleString('uk-UA', { style: 'currency', currency: 'UAH' });
};

// Компонент для тост-повідомлень
const Toast = ({ message, type, onClose }) => {
  const isSuccess = type === 'success';
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      className={`fixed top-5 right-5 z-[100] flex items-center p-4 max-w-sm w-full text-white rounded-lg shadow-lg ${isSuccess ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-red-500 to-rose-600'}`}
    >
      <div className="flex-shrink-0 text-2xl">
        {isSuccess ? <FaCheckCircle /> : <FaExclamationCircle />}
      </div>
      <div className="ml-3 text-sm font-medium">{message}</div>
      <button onClick={onClose} className="ml-auto -mx-1.5 -my-1.5 p-1.5 rounded-lg inline-flex h-8 w-8 text-white/70 hover:text-white hover:bg-white/20 transition-colors">
        <FaTimes />
      </button>
    </motion.div>
  );
};


export default function PaymentsPage() {
  const navigate = useNavigate();
  const handleBack = () => navigate("/home");
  
  const [payments, setPayments] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [statusFilter, setStatusFilter] = useState('debtors');
  const [toast, setToast] = useState({ message: '', type: '', visible: false });

  const [formData, setFormData] = useState({
    installation_custom_id: '',
    amount: '',
    paid_at: new Date().toISOString().split('T')[0],
    payment_method: 'Bank Transfer',
    comment: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [installationSearch, setInstallationSearch] = useState("");

  const [sortConfig, setSortConfig] = useState({ key: 'paid_at', direction: 'descending' });

  const showToast = (message, type = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => {
      setToast(p => ({ ...p, visible: false }));
    }, 4000);
  };

  useEffect(() => {
    loadPayments();
    loadInstallations();
  }, []);

  const loadPayments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('payment_history')
        .select(`*, installation:installations!inner(custom_id, total_cost, paid_amount, notes, client:clients(name, company_name))`)
        .order('paid_at', { ascending: false });

      if (error) {
        console.error('Помилка завантаження платежів:', error);
      } else {
        setPayments(data || []);
      }
    } catch (error) {
      console.error('Помилка підключення до БД:', error);
    } finally {
      setLoading(false);
    }
  };

  // ОНОВЛЕНО: Завантажуємо назву об'єкта
  const loadInstallations = async () => {
    try {
      const { data, error } = await supabase
        .from('installations')
        .select(`custom_id, name, client:clients(name, company_name)`);
      if (error) console.error('Помилка завантаження проектів:', error);
      else setInstallations(data || []);
    } catch (error) {
      console.error('Помилка підключення до БД:', error);
    }
  };

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
      if(startDate) startDate.setHours(0,0,0,0);
      if(endDate) endDate.setHours(23,59,59,999);
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
                  const getStatusValue = (p) => {
                      const debt = (p.installation?.total_cost || 0) - (p.installation?.paid_amount || 0);
                      if (debt <= 0) return 2; if ((p.installation?.paid_amount || 0) > 0) return 1; return 0;
                  };
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

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleAddPayment = () => {
    setShowAddForm(true);
    setInstallationSearch("");
    setFormData({
      installation_custom_id: '', amount: '', paid_at: new Date().toISOString().split('T')[0], payment_method: 'Bank Transfer', comment: ''
    });
    setFormErrors({});
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => ({ ...prev, [field]: '' }));
    }
  };
  
  const handleInstallationSelect = (installation) => {
    setFormData(prev => ({ ...prev, installation_custom_id: installation.custom_id }));
    setInstallationSearch(`#${installation.custom_id} - ${installation.name || 'Об\'єкт без назви'}`);
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.installation_custom_id) errors.installation_custom_id = 'Виберіть об\'єкт';
    if (!formData.amount || isNaN(formData.amount) || parseFloat(formData.amount) <= 0) {
      errors.amount = 'Введіть коректну суму (більше 0)';
    }
    if (!formData.paid_at) errors.paid_at = 'Вкажіть дату оплати';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ОНОВЛЕНО: Використовує тости замість alert
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    try {
      const paymentData = {
        installation_custom_id: parseInt(formData.installation_custom_id),
        amount: parseFloat(formData.amount),
        paid_at: formData.paid_at,
        payment_method: formData.payment_method,
        comment: formData.comment || null,
      };

      const { data, error } = await supabase.from('payment_history').insert([paymentData]).select();

      if (error) {
        showToast(`Помилка: ${error.message}`, 'error');
      } else {
        showToast('Платіж успішно додано!');
        handleCloseForm();
        loadPayments();
      }
    } catch (error) {
      showToast('Сталася помилка при підключенні до бази даних', 'error');
    } finally {
      setSubmitting(false);
    }
  };
  
  const paymentStats = useMemo(() => {
    const transactionCount = filteredAndSortedPayments.length;
    const uniqueInstallations = new Map();
    filteredAndSortedPayments.forEach(p => {
        if (p.installation && !uniqueInstallations.has(p.installation.custom_id)) {
            uniqueInstallations.set(p.installation.custom_id, p.installation);
        }
    });

    let totalDebt = 0;
    let totalPaidInSelection = 0;
    uniqueInstallations.forEach(inst => {
        const debt = (inst.total_cost || 0) - (inst.paid_amount || 0);
        if (debt > 0) { totalDebt += debt; }
        totalPaidInSelection += (inst.paid_amount || 0);
    });

    return { transactionCount, totalDebt, totalPaidInSelection };
  }, [filteredAndSortedPayments]);

  // ОНОВЛЕНО: Пошук по ID та назві об'єкта
  const filteredInstallations = useMemo(() => installations.filter(inst => {
    if (!installationSearch) return true;
    const searchLower = installationSearch.toLowerCase();
    return (
      inst.custom_id.toString().includes(searchLower) ||
      (inst.name && inst.name.toLowerCase().includes(searchLower))
    );
  }), [installations, installationSearch]);

  const PaymentStatus = ({ installation }) => {
    const totalCost = installation?.total_cost || 0;
    const paidAmount = installation?.paid_amount || 0;
    const debt = totalCost - paidAmount;
    let statusText, icon, colorClasses;
    if (debt <= 0) { statusText = 'Оплачено'; icon = <FaCheckCircle />; colorClasses = 'bg-green-100 text-green-800'; } 
    else if (paidAmount > 0) { statusText = 'Часткова оплата'; icon = <FaSpinner className="animate-spin" />; colorClasses = 'bg-yellow-100 text-yellow-800'; } 
    else { statusText = 'Не оплачено'; icon = <FaExclamationCircle />; colorClasses = 'bg-red-100 text-red-800'; }
    return <span className={`px-3 py-1 inline-flex items-center gap-2 text-xs leading-5 font-semibold rounded-full ${colorClasses}`}>{icon}{statusText}</span>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg mb-4 animate-pulse">
            <FaMoneyBillWave className="text-white text-2xl" />
          </div>
          <p className="text-gray-600 font-medium">Завантаження платежів...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      <AnimatePresence>
        {toast.visible && <Toast message={toast.message} type={toast.type} onClose={() => setToast(p => ({ ...p, visible: false }))} />}
      </AnimatePresence>
      
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-emerald-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <header className="relative bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={handleBack}
                className="w-10 h-10 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <FaArrowLeft className="text-sm" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-lg">
                  <FaMoneyBillWave className="text-white text-lg" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">Платежі</h1>
                  <p className="text-sm text-gray-500">Історія фінансових операцій</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleAddPayment}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <FaPlus className="text-sm" />
              <span>Додати платіж</span>
            </button>
          </div>
        </div>
      </header>
      
      <div className="relative p-6 border-b border-gray-200/30">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative flex-1 max-w-lg">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Пошук за ID проекту або клієнтом..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white/90 backdrop-blur-xl border border-gray-200/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 shadow-sm"
            />
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm ${showFilters ? 'bg-indigo-500 text-white' : 'bg-white/90 text-gray-700 hover:bg-gray-50'}`}>
              <FaFilter className="text-sm" />
              <span>Фільтри</span>
            </button>
          </div>
        </div>
        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-4 overflow-hidden">
              <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 shadow-sm flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-lg">
                    {['debtors', 'paid', 'all'].map(status => (
                        <button key={status} onClick={() => setStatusFilter(status)} className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${statusFilter === status ? 'bg-indigo-500 text-white shadow' : 'text-gray-600 hover:bg-gray-200'}`}>
                            {status === 'debtors' ? 'Боржники' : status === 'paid' ? 'Оплачено' : 'Всі'}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-4 items-center">
                  <span className="text-sm font-medium text-gray-700">Фільтр по даті:</span>
                  <input type="date" value={dateFilter.start} onChange={(e) => setDateFilter(prev => ({ ...prev, start: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-gray-500">-</span>
                  <input type="date" value={dateFilter.end} onChange={(e) => setDateFilter(prev => ({ ...prev, end: e.target.value }))} className="px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <button onClick={() => setDateFilter({ start: '', end: '' })} className="text-sm text-indigo-600 hover:underline">Скинути</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="relative p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-red-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                        <FaFileInvoiceDollar className="text-white text-2xl" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Загальний борг</p>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(paymentStats.totalDebt)}</p>
                    </div>
                </div>
            </div>
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
                        <FaMoneyBillWave className="text-white text-2xl" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Надходження у вибірці</p>
                        <p className="text-2xl font-bold text-green-700">{formatCurrency(paymentStats.totalPaidInSelection)}</p>
                    </div>
                </div>
            </div>
            <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                        <FaReceipt className="text-white text-2xl" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Кількість транзакцій</p>
                        <p className="text-2xl font-bold text-gray-800">{paymentStats.transactionCount}</p>
                    </div>
                </div>
            </div>
        </div>
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-gray-200/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/50">
                <tr>
                  <SortableHeader column="paid_at" sortConfig={sortConfig} onSort={handleSort}>Дата</SortableHeader>
                  <SortableHeader column="installation_custom_id" sortConfig={sortConfig} onSort={handleSort}>Проект ID</SortableHeader>
                  <SortableHeader column="client_name" sortConfig={sortConfig} onSort={handleSort}>Клієнт</SortableHeader>
                  <SortableHeader column="amount" sortConfig={sortConfig} onSort={handleSort}>Сума платежу</SortableHeader>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Сума / Сплачено</th>
                  <SortableHeader column="debt" sortConfig={sortConfig} onSort={handleSort}>Борг</SortableHeader>
                  <SortableHeader column="status" sortConfig={sortConfig} onSort={handleSort}>Статус</SortableHeader>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Коментар / Нагадування</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredAndSortedPayments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-12">
                      <div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center mx-auto mb-4"><FaReceipt className="text-white text-2xl" /></div>
                      <h3 className="text-xl font-bold text-gray-600 mb-2">Платежів не знайдено</h3>
                      <p className="text-gray-500">Спробуйте змінити параметри фільтрації або додати новий платіж</p>
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedPayments.map((payment, index) => {
                    const inst = payment.installation;
                    const totalCost = inst?.total_cost || 0;
                    const paidAmount = inst?.paid_amount || 0;
                    const debt = totalCost - paidAmount;
                    return (
                        <motion.tr key={payment.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.05 }} className="hover:bg-gray-50/70">
                          <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900">{new Date(payment.paid_at).toLocaleDateString('uk-UA')}</div></td>
                          <td className="px-6 py-4 whitespace-nowrap"><span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">#{inst.custom_id}</span></td>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900">{inst.client?.company_name || inst.client?.name}</div></td>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-bold text-green-600">{formatCurrency(payment.amount)}</div></td>
                          <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-900">{formatCurrency(totalCost)}</div><div className="text-xs text-green-600">{formatCurrency(paidAmount)}</div></td>
                           <td className="px-6 py-4 whitespace-nowrap"><div className={`text-sm font-medium ${debt > 0 ? 'text-red-600' : 'text-gray-500'}`}>{debt > 0 ? formatCurrency(debt) : 'Немає'}</div></td>
                          <td className="px-6 py-4 whitespace-nowrap"><PaymentStatus installation={inst} /></td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 max-w-xs truncate"><div>{payment.comment || '-'}</div>{inst.notes && <div className="text-xs text-blue-500 pt-1">Нагадування: {inst.notes}</div>}</td>
                        </motion.tr>
                    )
                }))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {showAddForm && (
          <motion.div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={(e) => { if (e.target === e.currentTarget) handleCloseForm(); }}>
            <motion.div className="bg-white/95 backdrop-blur-xl rounded-2xl p-8 w-full max-w-2xl shadow-2xl border border-gray-200/50 my-8" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="mb-6"><h2 className="text-3xl font-bold text-gray-800 mb-2">Додати новий платіж</h2><p className="text-gray-600">Внесіть дані про фінансову операцію</p></div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Об'єкт <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input type="text" value={installationSearch}
                      onChange={(e) => { setInstallationSearch(e.target.value); if(formData.installation_custom_id) handleInputChange('installation_custom_id', ''); }}
                      placeholder="Почніть вводити ID або назву об'єкта..."
                      className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 ${formErrors.installation_custom_id ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {installationSearch && !formData.installation_custom_id && (
                      <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 shadow-lg max-h-60 overflow-y-auto">
                        {filteredInstallations.length > 0 ? filteredInstallations.map(inst => (
                          <button key={inst.custom_id} type="button" onClick={() => handleInstallationSelect(inst)} className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 focus:bg-indigo-50 focus:outline-none">
                            <div className="font-medium text-gray-800">#{inst.custom_id} - {inst.name || 'Об\'єкт без назви'}</div>
                            <div className="text-sm text-gray-500">{inst.client?.company_name || inst.client?.name}</div>
                          </button>
                        )) : <div className="p-4 text-sm text-gray-500">Об'єктів не знайдено.</div>}
                      </div>
                    )}
                  </div>
                  {formErrors.installation_custom_id && <p className="text-red-500 text-sm mt-1">{formErrors.installation_custom_id}</p>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Сума (₴) <span className="text-red-500">*</span></label>
                    <input type="number" min="0" step="0.01" value={formData.amount} onChange={(e) => handleInputChange('amount', e.target.value)}
                      className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 ${formErrors.amount ? 'border-red-500' : 'border-gray-300'}`}
                      placeholder="50000" />
                    {formErrors.amount && <p className="text-red-500 text-sm mt-1">{formErrors.amount}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Дата оплати <span className="text-red-500">*</span></label>
                    <input type="date" value={formData.paid_at} onChange={(e) => handleInputChange('paid_at', e.target.value)}
                      className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 ${formErrors.paid_at ? 'border-red-500' : 'border-gray-300'}`} />
                     {formErrors.paid_at && <p className="text-red-500 text-sm mt-1">{formErrors.paid_at}</p>}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Метод оплати</label>
                  <select value={formData.payment_method} onChange={(e) => handleInputChange('payment_method', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200">
                    <option value="Bank Transfer">Банківський переказ</option>
                    <option value="Cash">Готівка</option>
                    <option value="Card">Картка</option>
                    <option value="Other">Інше</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Коментар</label>
                  <textarea rows="3" value={formData.comment} onChange={(e) => handleInputChange('comment', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 resize-none" placeholder="Наприклад: 'Авансовий платіж за матеріали'"></textarea>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200 mt-8">
                <button type="button" onClick={handleCloseForm} disabled={submitting} className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all duration-200 disabled:opacity-50">Скасувати</button>
                <button type="button" onClick={handleSubmit} disabled={submitting} className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none flex items-center space-x-2">
                  {submitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Додавання...</span></>) : (<><FaPlus className="text-sm" /><span>Додати платіж</span></>)}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}