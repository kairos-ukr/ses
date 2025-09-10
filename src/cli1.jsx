import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FaUsers, FaMapMarkerAlt, FaCalendarAlt, FaPhone, FaPlus,
  FaArrowLeft, FaSearch, FaFilter, FaBuilding, FaUserTie,
  FaEdit, FaHandshake, FaIndustry, FaStickyNote, FaTimes,
  FaCheck, FaChevronLeft, FaChevronRight, FaBriefcase
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
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
};

// Компонент сповіщень
const NotificationSystem = ({ notifications, removeNotification }) => (
  <AnimatePresence>
    {notifications.map((notification) => (
      <motion.div
        key={notification.id}
        initial={{ opacity: 0, y: -50, x: 50 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: -50, x: 50 }}
        className={`fixed top-4 right-4 z-[9999] max-w-sm w-full mx-4 sm:mx-0 ${
          notification.type === 'success' 
            ? 'bg-gradient-to-r from-green-500 to-emerald-500' 
            : notification.type === 'error'
            ? 'bg-gradient-to-r from-red-500 to-pink-500'
            : 'bg-gradient-to-r from-blue-500 to-indigo-500'
        } text-white rounded-xl p-4 shadow-2xl backdrop-blur-xl border border-white/20`}
      >
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            {notification.type === 'success' && (
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <FaCheck className="text-sm" />
              </div>
            )}
            {notification.type === 'error' && (
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <FaTimes className="text-sm" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{notification.message}</p>
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-white/80 hover:text-white transition-colors"
          >
            <FaTimes className="text-sm" />
          </button>
        </div>
      </motion.div>
    ))}
  </AnimatePresence>
);

// Компонент пагінації
const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  const [inputPage, setInputPage] = useState(currentPage);

  useEffect(() => {
    setInputPage(currentPage);
  }, [currentPage]);

  const handleInputChange = (e) => {
    setInputPage(e.target.value);
  };

  const handleGoToPage = (e) => {
    e.preventDefault();
    const pageNumber = parseInt(inputPage, 10);
    if (pageNumber >= 1 && pageNumber <= totalPages) {
      onPageChange(pageNumber);
    } else {
      setInputPage(currentPage); // Скидаємо, якщо введено невірне значення
    }
  };

  const getPaginationNumbers = () => {
    const pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      if (currentPage > 2) pages.push(currentPage - 1);
      if (currentPage > 1 && currentPage < totalPages) pages.push(currentPage);
      if (currentPage < totalPages - 1) pages.push(currentPage + 1);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return [...new Set(pages)]; // Видаляємо дублікати
  };

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between mt-6">
      <div className="flex items-center space-x-2 mb-4 sm:mb-0">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow-md disabled:opacity-50 transition"
        >
          <FaChevronLeft className="text-gray-600 text-sm" />
        </button>
        {getPaginationNumbers().map((page, index) =>
          page === '...' ? (
            <span key={index} className="text-gray-500 px-2">...</span>
          ) : (
            <button
              key={index}
              onClick={() => onPageChange(page)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg shadow-md transition ${
                currentPage === page ? 'bg-indigo-500 text-white font-bold' : 'bg-white text-gray-700'
              }`}
            >
              {page}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="w-9 h-9 flex items-center justify-center bg-white rounded-lg shadow-md disabled:opacity-50 transition"
        >
          <FaChevronRight className="text-gray-600 text-sm" />
        </button>
      </div>
      <form onSubmit={handleGoToPage} className="flex items-center space-x-2">
        <input
          type="number"
          value={inputPage}
          onChange={handleInputChange}
          className="w-16 p-2 border border-gray-300 rounded-lg text-center"
          min="1"
          max={totalPages}
        />
        <button type="submit" className="px-4 py-2 bg-gray-700 text-white rounded-lg font-medium text-sm">
          Перейти
        </button>
      </form>
    </div>
  );
};

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300); // Зменшив затримку до 300ms для швидшої реакції
  
  // Фільтри
  const [typeFilter, setTypeFilter] = useState("all");
  const [subcontractFilter, setSubcontractFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // Пагінація
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);
  const [totalClients, setTotalClients] = useState(0);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [formData, setFormData] = useState({
    name: '',
    oblast: '',
    populated_place: '',
    phone: '+380',
    object_type: '',
    company_name: '',
    is_subcontract: false,
    contractor_company: '',
    first_contact: '',
    notes: '',
    working_company: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  
  const handleBack = () => {
     navigate("/home");
  };

  // Система сповіщень
  const addNotification = (message, type = 'info', duration = 4000) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeNotification(id), duration);
  };

  const removeNotification = id => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  // ОНОВЛЕНА функція пошуку
  const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || !searchTerm.trim()) return null;
    
    const cleanedTerm = searchTerm.trim();
    
    // Створюємо масив умов пошуку для різних полів
    const searchConditions = [
      `name.ilike.%${cleanedTerm}%`,
      `company_name.ilike.%${cleanedTerm}%`,
      `phone.ilike.%${cleanedTerm}%`,
      `working_company.ilike.%${cleanedTerm}%`,
      `oblast.ilike.%${cleanedTerm}%`,
      `populated_place.ilike.%${cleanedTerm}%`,
      `contractor_company.ilike.%${cleanedTerm}%`,
      `notes.ilike.%${cleanedTerm}%`,
      `object_type.ilike.%${cleanedTerm}%`
    ];
    
    // Перевіряємо, чи є введений термін числом для пошуку по ID
    if (/^\d+$/.test(cleanedTerm)) {
      // Якщо введено тільки цифри, шукаємо ТОЧНЕ співпадіння по custom_id (тип int4)
      searchConditions.push(`custom_id.eq.${cleanedTerm}`);
    }
    
    return searchConditions.join(',');
  };

  // Завантаження клієнтів з бази даних (з пагінацією, пошуком та фільтрацією)
  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('clients')
        .select('*', { count: 'exact' });

      // ОНОВЛЕНЕ застосування пошуку
      if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
        const searchQuery = buildSearchQuery(debouncedSearchTerm);
        if (searchQuery) {
          query = query.or(searchQuery);
        }
      }

      // Застосування фільтрів
      if (typeFilter !== 'all') {
        query = query.eq('object_type', typeFilter);
      }
      if (subcontractFilter !== 'all') {
        const isSubcontract = subcontractFilter === 'subcontract';
        query = query.eq('is_subcontract', isSubcontract);
      }
      if (companyFilter !== 'all') {
        query = query.eq('working_company', companyFilter);
      }

      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data, error, count } = await query;

      if (error) {
        console.error('Помилка завантаження клієнтів:', error);
        addNotification('Помилка завантаження даних', 'error');
        setClients([]);
        setTotalClients(0);
      } else {
        setClients(data || []);
        setTotalClients(count || 0);
      }
    } catch (error) {
      console.error('Помилка підключення до БД:', error);
      addNotification('Не вдалося підключитись до бази даних', 'error');
      setClients([]);
      setTotalClients(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm, typeFilter, subcontractFilter, companyFilter]);
  
  useEffect(() => {
    loadClients();
  }, [loadClients]);

  // Скидання на першу сторінку при зміні фільтрів або пошуку
  useEffect(() => {
    if (currentPage !== 1) {
        setCurrentPage(1);
    }
  }, [debouncedSearchTerm, typeFilter, subcontractFilter, companyFilter]);

  // Функція для роботи з типами об'єктів
  const getObjectTypeInfo = (type) => {
    const typeMap = {
      'Приватний будинок': { icon: FaBuilding, color: 'text-blue-600 bg-blue-50', label: 'Приватний будинок' },
      'Промислове підприємство': { icon: FaIndustry, color: 'text-purple-600 bg-purple-50', label: 'Промисловість' },
      'Офісна будівля': { icon: FaUserTie, color: 'text-green-600 bg-green-50', label: 'Офіс' },
      'Комерційний об\'єкт': { icon: FaHandshake, color: 'text-orange-600 bg-orange-50', label: 'Комерція' }
    };
    return typeMap[type] || { icon: FaBuilding, color: 'text-gray-600 bg-gray-50', label: type || 'Не вказано' };
  };
  
  const handleAddClient = () => {
    setEditingClient(null);
    setShowAddForm(true);
    setFormData({
      name: '', oblast: '', populated_place: '', phone: '+380',
      object_type: '', company_name: '', is_subcontract: false,
      contractor_company: '', first_contact: '', notes: '', working_company: ''
    });
    setFormErrors({});
  };

  const handleEditClient = (client) => {
    setEditingClient(client);
    setShowAddForm(true);
    setFormData({
      name: client.name || '',
      oblast: client.oblast || '',
      populated_place: client.populated_place || '',
      phone: client.phone || '+380',
      object_type: client.object_type || '',
      company_name: client.company_name || '',
      is_subcontract: client.is_subcontract || false,
      contractor_company: client.contractor_company || '',
      first_contact: client.first_contact || '',
      notes: client.notes || '',
      working_company: client.working_company || ''
    });
    setFormErrors({});
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingClient(null);
    setFormErrors({});
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
      errors.phone = 'Введіть коректний номер телефону (+380XXXXXXXXX)';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    
    try {
      const clientData = {
        name: formData.name.trim(),
        oblast: formData.oblast.trim() || null,
        populated_place: formData.populated_place.trim() || null,
        phone: formData.phone.trim() || null,
        object_type: formData.object_type || null,
        company_name: formData.company_name.trim() || null,
        is_subcontract: formData.is_subcontract,
        contractor_company: formData.is_subcontract ? (formData.contractor_company.trim() || null) : null,
        first_contact: formData.first_contact || null,
        notes: formData.notes.trim() || null,
        working_company: formData.working_company || null,
      };

      let result;
      if (editingClient) {
        result = await supabase
          .from('clients')
          .update(clientData)
          .eq('custom_id', editingClient.custom_id);
      } else {
        result = await supabase
          .from('clients')
          .insert([clientData]);
      }

      if (result.error) throw result.error;
        
      addNotification(
        editingClient ? 'Клієнт успішно оновлено!' : 'Клієнт успішно створено!', 
        'success'
      );
      handleCloseForm();
      loadClients();
    } catch (error) {
      console.error('Помилка збереження клієнта:', error);
      addNotification('Помилка при збереженні: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };
  
  // Правильне форматування дати
  const formatDate = (dateString) => {
    if (!dateString) return 'Не вказано';
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Date(dateString).toLocaleDateString('uk-UA', options);
  };

  if (loading && clients.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg mb-4 animate-pulse">
            <FaUsers className="text-white text-2xl" />
          </div>
          <p className="text-gray-600 font-medium">Завантаження клієнтів...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      <NotificationSystem notifications={notifications} removeNotification={removeNotification} />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-emerald-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <header className="relative bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <button onClick={handleBack} className="w-10 h-10 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                <FaArrowLeft className="text-sm" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                  <FaUsers className="text-white text-sm sm:text-lg" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Клієнти
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Управління клієнтами СЕС</p>
                </div>
              </div>
            </div>

            <button onClick={handleAddClient} className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base">
              <FaPlus className="text-xs sm:text-sm" />
              <span className="hidden sm:inline">Додати клієнта</span>
              <span className="sm:hidden">Додати</span>
            </button>
          </div>
        </div>
      </header>

      <div className="relative p-4 sm:p-6 border-b border-gray-200/30">
        <div className="flex flex-col gap-4 items-center justify-between">
          <div className="w-full">
            <div className="relative">
              <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Пошук за ID, іменем, компанією, телефоном, містом..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/90 backdrop-blur-xl border border-gray-200/50 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 shadow-sm text-sm sm:text-base"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <FaTimes className="text-sm" />
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-end w-full">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-xl font-medium transition-all duration-200 shadow-sm text-sm ${showFilters ? 'bg-indigo-500 text-white' : 'bg-white/90 text-gray-700 hover:bg-gray-50'}`}
            >
              <FaFilter className="text-sm" />
              <span>Фільтри</span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="bg-white/90 backdrop-blur-xl rounded-xl p-4 border border-gray-200/50 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Фільтр по компанії-виконавцю */}
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-gray-700 block">Компанія-виконавець:</span>
                    <div className="flex flex-wrap gap-2">
                      {[ { value: 'all', label: 'Всі' }, { value: 'Кайрос', label: 'Кайрос' }, { value: 'Розумне збереження енергії', label: 'РЗЕ' }
                      ].map((type) => (
                        <button key={type.value} onClick={() => setCompanyFilter(type.value)}
                          className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${companyFilter === type.value ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Тип об'єкта */}
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-gray-700 block">Тип об'єкта:</span>
                    <div className="flex flex-wrap gap-2">
                      {[ { value: 'all', label: 'Всі' }, { value: 'Приватний будинок', label: 'Приватний' }, { value: 'Промислове підприємство', label: 'Промисловість' }, { value: 'Офісна будівля', label: 'Офіс' }, { value: 'Комерційний об\'єкт', label: 'Комерція' }
                      ].map((type) => (
                        <button key={type.value} onClick={() => setTypeFilter(type.value)}
                          className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${typeFilter === type.value ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Тип співпраці */}
                  <div className="space-y-2">
                    <span className="text-sm font-medium text-gray-700 block">Співпраця:</span>
                    <div className="flex flex-wrap gap-2">
                      {[ { value: 'all', label: 'Всі' }, { value: 'direct', label: 'Прямі' }, { value: 'subcontract', label: 'Субпідряд' }
                      ].map((type) => (
                        <button key={type.value} onClick={() => setSubcontractFilter(type.value)}
                          className={`px-3 py-1 rounded-full text-xs sm:text-sm font-medium transition-all duration-200 ${subcontractFilter === type.value ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {type.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <main className="relative p-4 sm:p-6">
        {loading && <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-600 font-medium">Завантаження...</span>
          </div>
        </div>}
        
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {!loading && clients.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center mx-auto mb-4">
                <FaUsers className="text-white text-2xl" />
              </div>
              <h3 className="text-xl font-bold text-gray-600 mb-2">Клієнтів не знайдено</h3>
              <p className="text-gray-500">Спробуйте змінити параметри пошуку або фільтри</p>
            </div>
          ) : (
            clients.map((client, index) => {
              const objectTypeInfo = getObjectTypeInfo(client.object_type);
              const ObjectIcon = objectTypeInfo.icon;

              return (
                <motion.div
                  key={client.custom_id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-500 ease-out hover:-translate-y-1 flex flex-col"
                >
                  <div className="flex-grow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                          <FaUsers className="text-white text-sm sm:text-lg" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm sm:text-lg font-bold text-gray-800 truncate" title={client.company_name || client.name}>
                            {client.company_name || client.name}
                          </h3>
                          {client.company_name && <p className="text-xs sm:text-sm text-gray-600 truncate" title={client.name}>{client.name}</p>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-1 flex-shrink-0 ml-2">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">#{client.custom_id}</span>
                        {client.is_subcontract && <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">Субпідряд</span>}
                      </div>
                    </div>

                    <div className="space-y-2 sm:space-y-3 mb-4">
                      {client.working_company && (
                        <div className="flex items-center space-x-2 bg-gray-100 px-3 py-2 rounded-lg">
                           <FaBriefcase className="text-gray-500 text-sm flex-shrink-0" />
                           <span className="text-xs sm:text-sm font-semibold text-gray-700 truncate">{client.working_company}</span>
                        </div>
                      )}
                      <div className={`flex items-center space-x-2 ${objectTypeInfo.color} px-3 py-2 rounded-lg`}>
                        <ObjectIcon className="text-sm flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{objectTypeInfo.label}</span>
                      </div>
                      {(client.oblast || client.populated_place) && (
                        <div className="flex items-center space-x-2"><FaMapMarkerAlt className="text-indigo-500 text-sm flex-shrink-0" /><span className="text-xs sm:text-sm text-gray-600 truncate">{[client.populated_place, client.oblast].filter(Boolean).join(', ')}</span></div>
                      )}
                      {client.phone && (
                        <div className="flex items-center space-x-2"><FaPhone className="text-green-500 text-sm flex-shrink-0" /><a href={`tel:${client.phone}`} className="text-xs sm:text-sm text-gray-600 hover:text-indigo-600 transition-colors truncate">{client.phone}</a></div>
                      )}
                      {client.first_contact && (
                        <div className="flex items-start space-x-2"><FaCalendarAlt className="text-blue-500 text-sm flex-shrink-0 mt-0.5" /><span className="text-xs sm:text-sm text-gray-600 break-words">Перший контакт: {formatDate(client.first_contact)}</span></div>
                      )}
                      {client.notes && (
                        <div className="flex items-start space-x-2"><FaStickyNote className="text-yellow-500 text-sm flex-shrink-0 mt-0.5" /><span className="text-xs sm:text-sm text-gray-600 break-words line-clamp-2">{client.notes}</span></div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                    <span className="text-xs text-gray-500">Додано: {formatDate(client.created_at)}</span>
                    <button onClick={() => handleEditClient(client)} className="flex items-center justify-center space-x-1 px-3 py-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-xs sm:text-sm">
                      <FaEdit className="text-xs" /><span>Редагувати</span>
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
        {totalClients > itemsPerPage && !loading && (
          <Pagination 
            currentPage={currentPage}
            totalPages={Math.ceil(totalClients / itemsPerPage)}
            onPageChange={setCurrentPage}
          />
        )}
      </main>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => { if (e.target === e.currentTarget) handleCloseForm(); }}
          >
            <motion.div
              className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-4xl shadow-2xl border border-gray-200/50 my-8 max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">{editingClient ? 'Редагувати клієнта' : 'Додати нового клієнта'}</h2>
                <p className="text-sm sm:text-base text-gray-600">{editingClient ? 'Оновіть інформацію про клієнта' : 'Заповніть інформацію про нового клієнта'}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                
                {/* Компанія-виконавець (обов'язкове) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Компанія-виконавець <span className="text-red-500">*</span></label>
                  <select value={formData.working_company} onChange={(e) => handleInputChange('working_company', e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition ${formErrors.working_company ? 'border-red-500' : 'border-gray-300'}`}>
                    <option value="">Оберіть компанію...</option>
                    <option value="Кайрос">Кайрос</option>
                    <option value="Розумне збереження енергії">Розумне збереження енергії</option>
                  </select>
                  {formErrors.working_company && <p className="text-red-500 text-sm mt-1">{formErrors.working_company}</p>}
                </div>

                {/* Назва компанії клієнта */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Назва компанії клієнта</label>
                  <input type="text" value={formData.company_name} onChange={(e) => handleInputChange('company_name', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="ТОВ Сонячна Енергія" />
                </div>

                {/* Ім'я (обов'язкове) */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ім'я клієнта (ПІБ) <span className="text-red-500">*</span></label>
                  <input type="text" value={formData.name} onChange={(e) => handleInputChange('name', e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition ${formErrors.name ? 'border-red-500' : 'border-gray-300'}`} placeholder="Петренко Олексій Іванович"/>
                  {formErrors.name && <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>}
                </div>

                {/* Область та Населений пункт */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Область</label>
                  <select value={formData.oblast} onChange={(e) => handleInputChange('oblast', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3">
                    <option value="">Оберіть область...</option>
                    {["Вінницька","Волинська","Дніпропетровська","Донецька","Житомирська","Закарпатська","Запорізька","Івано-Франківська","Київська","Кіровоградська","Луганська","Львівська","Миколаївська","Одеська","Полтавська","Рівненська","Сумська","Тернопільська","Харківська","Херсонська","Хмельницька","Черкаська","Чернівецька","Чернігівська"].map(o => <option key={o} value={o}>{o} область</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Населений пункт</label>
                  <input type="text" value={formData.populated_place} onChange={(e) => handleInputChange('populated_place', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="м. Київ"/>
                </div>

                {/* Телефон та Тип об'єкта */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Телефон</label>
                  <input type="tel" value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 transition ${formErrors.phone ? 'border-red-500' : 'border-gray-300'}`} placeholder="+380501234567"/>
                  {formErrors.phone && <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Тип об'єкта</label>
                  <select value={formData.object_type} onChange={(e) => handleInputChange('object_type', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3">
                    <option value="">Оберіть тип...</option>
                    <option value="Приватний будинок">Приватний будинок</option>
                    <option value="Промислове підприємство">Промислове підприємство</option>
                    <option value="Офісна будівля">Офісна будівля</option>
                    <option value="Комерційний об'єкт">Комерційний об'єкт</option>
                    <option value="Сільськогосподарський об'єкт">Сільськогосподарський об'єкт</option>
                    <option value="Інше">Інше</option>
                  </select>
                </div>
                
                {/* Дата першого контакту та Субпідряд */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Дата першого контакту</label>
                  <input type="date" value={formData.first_contact} onChange={(e) => handleInputChange('first_contact', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3"/>
                </div>
                <div className="flex items-center space-x-3 self-end">
                  <input type="checkbox" id="is_subcontract" checked={formData.is_subcontract} onChange={(e) => handleInputChange('is_subcontract', e.target.checked)} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"/>
                  <label htmlFor="is_subcontract" className="text-sm font-medium text-gray-700">Робота через субпідряд</label>
                </div>

                {/* Компанія підрядника */}
                {formData.is_subcontract && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Компанія підрядника</label>
                    <input type="text" value={formData.contractor_company} onChange={(e) => handleInputChange('contractor_company', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3" placeholder="ТОВ ЕнергоБуд"/>
                  </div>
                )}
                
                {/* Примітки */}
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label>
                  <textarea rows="4" value={formData.notes} onChange={(e) => handleInputChange('notes', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 resize-none" placeholder="Додаткові примітки..."></textarea>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200 mt-8">
                <button type="button" onClick={handleCloseForm} disabled={submitting} className="w-full sm:w-auto px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition disabled:opacity-50">Скасувати</button>
                <button type="button" onClick={handleSubmit} disabled={submitting} className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none flex items-center justify-center space-x-2">
                  {submitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>{editingClient ? 'Оновлення...' : 'Створення...'}</span></>) : (<>{editingClient ? <FaEdit /> : <FaPlus />}<span>{editingClient ? 'Оновити клієнта' : 'Створити клієнта'}</span></>)}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}