import React, { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUsers, FaMapMarkerAlt, FaCalendarAlt, FaPhone, FaPlus, FaSearch, FaFilter, FaBuilding, FaUserTie,
  FaEdit, FaHandshake, FaIndustry, FaStickyNote, FaTimes, FaCheck, FaChevronLeft, FaChevronRight,
  FaBriefcase, FaSignOutAlt, FaBars, FaCog, FaCreditCard, FaTasks, FaFolderOpen
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { createClient } from '@supabase/supabase-js';

// Supabase клієнт
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

// Хук для дебаунсу (затримки) вводу
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};


// --- ОПТИМІЗОВАНІ UI КОМПОНЕНТИ ---

const Sidebar = memo(({ onNavigate, onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuItems = [
      { id: 'home', label: 'Головна', icon: FaBuilding },
      { id: 'clients', label: 'Клієнти', icon: FaUsers },
      { id: 'installations', label: "Об'єкти", icon: FaIndustry },
      { id: 'employees', label: 'Працівники', icon: FaUserTie },
      { id: 'equipment', label: 'Обладнання', icon: FaCog },
      { id: 'payments', label: 'Платежі', icon: FaCreditCard },
      { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks },
      { id: 'documents', label: 'Документи', icon: FaFolderOpen, path: '/documents' },
    ];
    
    const handleNavigation = (page) => {
        onNavigate(page);
        if (window.innerWidth < 1024) setIsOpen(false);
    };

    return (
      <>
        {/* Кнопка для мобільного меню */}
        <button
          onClick={() => setIsOpen(true)}
          className="lg:hidden fixed top-4 left-4 z-[90] w-12 h-12 bg-white/80 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center text-slate-700"
        >
          <FaBars/>
        </button>

        {/* Оверлей для мобільного меню */}
        <AnimatePresence>
            {isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOpen(false)} className="fixed inset-0 bg-black/30 z-[99] lg:hidden"/>}
        </AnimatePresence>
        
        {/* Сама панель меню (праворуч) */}
        <aside className={`fixed top-0 right-0 h-full bg-white/95 backdrop-blur-xl text-slate-800 z-[100] shadow-2xl border-l border-slate-200/50 w-64 transform transition-transform duration-300 ease-in-out flex flex-col
                       ${isOpen ? 'translate-x-0' : 'translate-x-full'} lg:sticky lg:h-screen lg:translate-x-0`}>
            <div className="p-5 border-b border-slate-200/80 flex items-center justify-between">
                <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent" translate="no">SES Tracker</h2>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 lg:hidden"><FaTimes/></button>
            </div>
            <nav className="flex-1 py-4 overflow-y-auto">
                {menuItems.map((item) => (
                    <button key={item.id} onClick={() => handleNavigation(item.id)} className="w-full flex items-center space-x-4 px-6 py-3.5 text-left hover:bg-indigo-50 transition-all duration-200 group rounded-lg mx-2 my-1">
                        <item.icon className="text-slate-500 group-hover:text-indigo-600 transition-colors text-lg" />
                        <span className="font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{item.label}</span>
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t border-slate-200/80">
                <button onClick={onLogout} className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 rounded-lg font-medium transition-all duration-200">
                    <FaSignOutAlt /><span>Вийти</span>
                </button>
            </div>
        </aside>
      </>
    );
});

const NotificationSystem = memo(({ notifications, removeNotification }) => (
  <div className="fixed top-5 right-5 z-[9999] w-full max-w-sm">
    <AnimatePresence>
      {notifications.map((notification) => (
        <motion.div
          key={notification.id}
          layout
          initial={{ opacity: 0, y: -50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.5 }}
          className={`p-4 rounded-xl shadow-2xl text-white font-medium text-sm flex items-center gap-3 mb-4
              ${notification.type === 'success' ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-red-500 to-pink-500'}`}
        >
          {notification.type === 'success' ? <FaCheck/> : <FaTimes/>}
          <span>{notification.message}</span>
          <button onClick={() => removeNotification(notification.id)} className="ml-auto opacity-70 hover:opacity-100"><FaTimes/></button>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
));

const ClientCard = memo(({ client, onEdit, delay }) => {
  const typeMap = {
    'Приватний будинок': { icon: FaBuilding, color: 'text-blue-600 bg-blue-100', label: 'Приватний будинок' },
    'Промислове підприємство': { icon: FaIndustry, color: 'text-purple-600 bg-purple-100', label: 'Промисловість' },
    'Офісна будівля': { icon: FaUserTie, color: 'text-green-600 bg-green-100', label: 'Офіс' },
    'Комерційний об\'єкт': { icon: FaHandshake, color: 'text-orange-600 bg-orange-100', label: 'Комерція' }
  };
  const { icon: ObjectIcon, color, label } = typeMap[client.object_type] || { icon: FaBuilding, color: 'text-gray-600 bg-gray-100', label: client.object_type || 'Не вказано' };
  
  const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('uk-UA') : 'N/A';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="bg-white/80 backdrop-blur-xl rounded-2xl p-5 shadow-lg border border-slate-200/50 hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col"
    >
      <div className="flex-grow">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 text-lg truncate" title={client.company_name || client.name}>{client.company_name || client.name}</h3>
            {client.company_name && <p className="text-sm text-slate-500 truncate" title={client.name}>{client.name}</p>}
          </div>
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full font-mono ml-2 flex-shrink-0">#{client.custom_id}</span>
        </div>
        <div className="space-y-3 text-sm">
          <div className={`flex items-center gap-3 p-2 rounded-lg ${color}`}>
            <ObjectIcon className="w-4 h-4 flex-shrink-0"/> <span className="font-semibold truncate">{label}</span>
          </div>
          <div className="flex items-center gap-3"><FaMapMarkerAlt className="text-slate-400 flex-shrink-0"/> <span className="text-slate-600 truncate">{[client.populated_place, client.oblast].filter(Boolean).join(', ') || 'Адреса не вказана'}</span></div>
          <div className="flex items-center gap-3"><FaPhone className="text-slate-400 flex-shrink-0"/> <a href={`tel:${client.phone}`} className="text-slate-600 hover:text-indigo-600 truncate">{client.phone || 'Телефон не вказано'}</a></div>
        </div>
      </div>
      <div className="mt-5 pt-4 border-t border-slate-200 flex justify-between items-center">
        <span className="text-xs text-slate-400">Додано: {formatDate(client.created_at)}</span>
        <button onClick={() => onEdit(client)} className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 rounded-lg text-xs font-semibold transition">
          <FaEdit/> Редагувати
        </button>
      </div>
    </motion.div>
  );
});

const Pagination = memo(({ currentPage, totalPages, onPageChange }) => {
    const getPaginationNumbers = () => {
        const pages = [];
        if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) pages.push('...');
            if (currentPage > 2) pages.push(currentPage - 1);
            if (currentPage > 1 && currentPage < totalPages) pages.push(currentPage);
            if (currentPage < totalPages - 1) pages.push(currentPage + 1);
            if (currentPage < totalPages - 2) pages.push('...');
            pages.push(totalPages);
        }
        return [...new Set(pages)];
    };

    return (
        <div className="flex items-center justify-center space-x-1 sm:space-x-2 mt-8">
            <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow-md disabled:opacity-50 transition"><FaChevronLeft className="text-slate-600 text-sm" /></button>
            {getPaginationNumbers().map((page, index) =>
                page === '...' ? (
                    <span key={index} className="text-slate-500 px-2">...</span>
                ) : (
                    <button key={index} onClick={() => onPageChange(page)}
                        className={`w-9 h-9 flex items-center justify-center rounded-lg shadow-md transition text-sm font-medium ${currentPage === page ? 'bg-indigo-500 text-white' : 'bg-white text-slate-700'}`}>
                        {page}
                    </button>
                )
            )}
            <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow-md disabled:opacity-50 transition"><FaChevronRight className="text-slate-600 text-sm" /></button>
        </div>
    );
});


export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  
  const [filters, setFilters] = useState({ type: "all", subcontract: "all", company: "all" });
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);
  const [totalClients, setTotalClients] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [formData, setFormData] = useState({
    name: '', oblast: '', populated_place: '', phone: '+380', object_type: '',
    company_name: '', is_subcontract: false, contractor_company: '', first_contact: '',
    notes: '', working_company: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  
  const navigate = useNavigate();

  const addNotification = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), duration);
  }, []);
  
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const loadClients = useCallback(async (pageToLoad) => {
    setLoading(true);
    try {
      const from = (pageToLoad - 1) * itemsPerPage;
      let query = supabase.from('clients').select('*', { count: 'exact' });

      if (debouncedSearchTerm) {
        const searchConditions = [
            `name.ilike.%${debouncedSearchTerm}%`,
            `company_name.ilike.%${debouncedSearchTerm}%`,
            `phone.ilike.%${debouncedSearchTerm}%`
        ];
        if (/^\d+$/.test(debouncedSearchTerm)) {
            searchConditions.push(`custom_id.eq.${debouncedSearchTerm}`);
        }
        query = query.or(searchConditions.join(','));
      }

      if (filters.type === 'private') {
        query = query.eq('object_type', 'Приватний будинок');
      } else if (filters.type === 'business') {
        query = query.not('object_type', 'eq', 'Приватний будинок');
      }

      if (filters.subcontract !== 'all') {
        query = query.eq('is_subcontract', filters.subcontract === 'subcontract');
      }
      if (filters.company !== 'all') {
        query = query.eq('working_company', filters.company);
      }

      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + itemsPerPage - 1);

      if (error) throw error;
      setClients(data || []);
      setTotalClients(count || 0);
    } catch (error) {
      console.error("Помилка завантаження клієнтів:", error);
      addNotification('Помилка завантаження клієнтів', 'error');
    } finally {
      setLoading(false);
    }
  }, [itemsPerPage, debouncedSearchTerm, filters, addNotification]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, filters]);
  
  useEffect(() => {
      loadClients(currentPage);
  }, [currentPage, loadClients]);


  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleNavigate = (page) => {
    if (page === 'home') navigate('/home');
    else navigate(`/${page}`);
  };

  const handlePageChange = (newPage) => {
      if (newPage > 0 && newPage <= Math.ceil(totalClients / itemsPerPage)) {
          setCurrentPage(newPage);
      }
  };
  
  const handleEditClient = (client) => {
      setEditingClient(client);
      setFormData({
          name: client.name || '', oblast: client.oblast || '', populated_place: client.populated_place || '',
          phone: client.phone || '+380', object_type: client.object_type || '', company_name: client.company_name || '',
          is_subcontract: client.is_subcontract || false, contractor_company: client.contractor_company || '',
          first_contact: client.first_contact ? new Date(client.first_contact).toISOString().split('T')[0] : '', 
          notes: client.notes || '', working_company: client.working_company || ''
      });
      setFormErrors({});
      setShowForm(true);
  };
  
  const handleAddClient = () => {
      setEditingClient(null);
      setFormData({
          name: '', oblast: '', populated_place: '', phone: '+380', object_type: '',
          company_name: '', is_subcontract: false, contractor_company: '', first_contact: '',
          notes: '', working_company: ''
      });
      setFormErrors({});
      setShowForm(true);
  };

  const handleInputChange = (field, value) => {
    if (field === 'phone') {
      if (!value.startsWith('+380')) {
        value = '+380' + value.replace(/^\+380/, '').replace(/[^\d]/g, '');
      }
      if (value.length > 13) {
        value = value.substring(0, 13);
      }
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Введіть ім\'я клієнта';
    if (!formData.working_company) errors.working_company = 'Оберіть компанію-виконавця';
    if (formData.phone && !/^\+380\d{9}$/.test(formData.phone.replace(/\s/g, ''))) {
      errors.phone = 'Введіть коректний номер (+380XXXXXXXXX)';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setSubmitting(true);
    
    try {
      const clientData = { ...formData, first_contact: formData.first_contact || null };
      let result;

      if (editingClient) {
        // Додаємо поле updated_at з поточним часом при редагуванні
        const updateData = {
          ...clientData,
          updated_at: new Date().toISOString(),
        };
        result = await supabase.from('clients').update(updateData).eq('custom_id', editingClient.custom_id);
      } else {
        result = await supabase.from('clients').insert([clientData]).select();
      }

      if (result.error) throw result.error;
        
      addNotification(editingClient ? 'Клієнт оновлено!' : 'Клієнт створено!', 'success');
      setShowForm(false);
      loadClients(currentPage);
    } catch (error) {
      addNotification('Помилка: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-row-reverse font-sans">
      <main className="flex-1 flex flex-col h-screen">
        <div className="flex-1 p-6 sm:p-8 overflow-y-auto">
          <header className="mb-8">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-slate-800">Клієнти</h1>
                <p className="text-slate-500">Управління базою клієнтів та проєктів</p>
              </div>
              <button onClick={handleAddClient} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-semibold shadow-lg hover:-translate-y-0.5 transition-transform w-full sm:w-auto">
                <FaPlus/> <span>Додати клієнта</span>
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-grow">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input type="text" placeholder="Пошук за ID, іменем, компанією, телефоном..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-400 transition shadow-sm"/>
              </div>
              <button onClick={() => setShowFilters(!showFilters)} className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition shadow-sm ${showFilters ? 'bg-indigo-500 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>
                <FaFilter/> <span>Фільтри</span>
              </button>
            </div>
          </header>

          <AnimatePresence>
            {showFilters && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-8">
                <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <span className="text-sm font-medium text-slate-700 block mb-2">Компанія-виконавець:</span>
                    <div className="flex flex-wrap gap-2">
                        {[{ value: 'all', label: 'Всі' }, { value: 'Кайрос', label: 'Кайрос' }, { value: 'Розумне збереження енергії', label: 'РЗЕ' }].map(c => 
                            <button key={c.value} onClick={() => setFilters(f => ({...f, company: c.value}))} className={`px-3 py-1 rounded-full text-xs font-medium ${filters.company === c.value ? 'bg-teal-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c.label}</button>
                        )}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-slate-700 block mb-2">Тип об'єкта:</span>
                     <div className="flex flex-wrap gap-2">
                        {[{ value: 'all', label: 'Всі' }, { value: 'private', label: 'Приватний' }, { value: 'business', label: 'Бізнес' }].map(t => 
                            <button key={t.value} onClick={() => setFilters(f => ({...f, type: t.value}))} className={`px-3 py-1 rounded-full text-xs font-medium ${filters.type === t.value ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.label}</button>
                        )}
                    </div>
                  </div>
                   <div>
                    <span className="text-sm font-medium text-slate-700 block mb-2">Співпраця:</span>
                     <div className="flex flex-wrap gap-2">
                        {[{ value: 'all', label: 'Всі' }, { value: 'direct', label: 'Прямі' }, { value: 'subcontract', label: 'Субпідряд' }].map(s => 
                            <button key={s.value} onClick={() => setFilters(f => ({...f, subcontract: s.value}))} className={`px-3 py-1 rounded-full text-xs font-medium ${filters.subcontract === s.value ? 'bg-purple-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s.label}</button>
                        )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {loading && clients.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-white/50 h-64 rounded-2xl animate-pulse"></div>)}
            </div>
          ) : !loading && clients.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
               <h3 className="text-xl font-bold text-slate-600 mb-2">Клієнтів не знайдено</h3>
               <p>Спробуйте змінити параметри пошуку або додати нового клієнта.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {clients.map((client, index) => (
                <ClientCard key={client.custom_id} client={client} onEdit={handleEditClient} delay={index * 0.05} />
              ))}
            </div>
          )}
          
          {!loading && totalClients > itemsPerPage && (
            <Pagination 
                currentPage={currentPage}
                totalPages={Math.ceil(totalClients / itemsPerPage)}
                onPageChange={handlePageChange}
            />
          )}
        </div>
      </main>
      
      <Sidebar onNavigate={handleNavigate} onLogout={handleLogout} />
      <NotificationSystem notifications={notifications} removeNotification={removeNotification} />

      <AnimatePresence>
        {showForm && (
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[110] flex items-center justify-center p-4" 
                onClick={() => setShowForm(false)}
            >
                <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }} 
                    exit={{ scale: 0.9, opacity: 0 }} 
                    className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-xl flex flex-col" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-6 border-b flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-slate-800">{editingClient ? 'Редагувати клієнта' : 'Новий клієнт'}</h2>
                        <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><FaTimes/></button>
                    </div>
                    <form onSubmit={handleSubmit} className="p-6 flex-grow overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Компанія-виконавець <span className="text-red-500">*</span></label>
                          <select value={formData.working_company} onChange={(e) => handleInputChange('working_company', e.target.value)} className={`w-full border rounded-xl px-4 py-3 bg-white ${formErrors.working_company ? 'border-red-500' : 'border-gray-300'}`}>
                            <option value="">Оберіть компанію...</option>
                            <option value="Кайрос">Кайрос</option>
                            <option value="Розумне збереження енергії">Розумне збереження енергії</option>
                          </select>
                          {formErrors.working_company && <p className="text-red-500 text-xs mt-1">{formErrors.working_company}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Назва компанії клієнта</label>
                          <input type="text" value={formData.company_name} onChange={(e) => handleInputChange('company_name', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="ТОВ Сонячна Енергія" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Ім'я клієнта (ПІБ) <span className="text-red-500">*</span></label>
                          <input type="text" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)} className={`w-full border rounded-xl px-4 py-3 ${formErrors.name ? 'border-red-500' : 'border-gray-300'}`} placeholder="Петренко Олексій Іванович"/>
                          {formErrors.name && <p className="text-red-500 text-xs mt-1">{formErrors.name}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Телефон</label>
                          <input type="tel" value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} className={`w-full border rounded-xl px-4 py-3 ${formErrors.phone ? 'border-red-500' : 'border-gray-300'}`} placeholder="+380501234567"/>
                          {formErrors.phone && <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>}
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Тип об'єкта</label>
                          <select value={formData.object_type} onChange={(e) => handleInputChange('object_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 bg-white">
                            <option value="">Оберіть тип...</option>
                            <option value="Приватний будинок">Приватний будинок</option>
                            <option value="Промислове підприємство">Промислове підприємство</option>
                            <option value="Офісна будівля">Офісна будівля</option>
                            <option value="Комерційний об'єкт">Комерційний об'єкт</option>
                          </select>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Область</label>
                            <input type="text" value={formData.oblast} onChange={(e) => handleInputChange('oblast', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="Київська"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Населений пункт</label>
                            <input type="text" value={formData.populated_place} onChange={(e) => handleInputChange('populated_place', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="м. Київ"/>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Дата першого контакту</label>
                          <input type="date" value={formData.first_contact} onChange={(e) => handleInputChange('first_contact', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3"/>
                        </div>
                        <div className="flex items-center space-x-3 self-end pb-3">
                          <input type="checkbox" id="is_subcontract" checked={formData.is_subcontract} onChange={(e) => handleInputChange('is_subcontract', e.target.checked)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/>
                          <label htmlFor="is_subcontract" className="text-sm font-medium text-gray-700">Робота через субпідряд</label>
                        </div>
                        {formData.is_subcontract && (
                          <div className="sm:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Компанія підрядника</label>
                            <input type="text" value={formData.contractor_company} onChange={(e) => handleInputChange('contractor_company', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="ТОВ ЕнергоБуд"/>
                          </div>
                        )}
                        <div className="sm:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label>
                          <textarea rows="3" value={formData.notes} onChange={(e) => handleInputChange('notes', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 resize-none" placeholder="Додаткові примітки..."></textarea>
                        </div>
                    </form>
                    <div className="p-6 bg-slate-50 border-t flex justify-end gap-3">
                        <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-300 transition">Скасувати</button>
                        <button type="submit" onClick={handleSubmit} disabled={submitting} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 w-36">
                          {submitting ? (<><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Збереження...</span></>) : <span>{editingClient ? 'Оновити' : 'Створити'}</span>}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        )}
       </AnimatePresence>
    </div>
  );
}