import React, { useState, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUsers, FaMapMarkerAlt, FaPhone, FaPlus, FaSearch, FaFilter, FaBuilding, FaUserTie,
  FaEdit, FaHandshake, FaIndustry, FaTimes, FaCheck, FaChevronLeft, FaChevronRight,
  FaSignOutAlt
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./Layout";
import { useAuth } from "./AuthProvider"; // 1. ІМПОРТУЄМО AUTH CONTEXT

// Debounce hook
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// --- КОМПОНЕНТИ ---

const NotificationSystem = memo(({ notifications, removeNotification }) => (
  <div className="fixed top-20 right-5 z-[9999] w-full max-w-sm pointer-events-none">
    <AnimatePresence>
      {notifications.map((notification) => (
        <motion.div
          key={notification.id}
          layout
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.9 }}
          className={`pointer-events-auto p-4 rounded-xl shadow-xl text-white font-medium text-sm flex items-center gap-3 mb-3
              ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}
        >
          {notification.type === 'success' ? <FaCheck/> : <FaTimes/>}
          <span>{notification.message}</span>
          <button onClick={() => removeNotification(notification.id)} className="ml-auto opacity-70 hover:opacity-100"><FaTimes/></button>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
));

// 2. ОНОВЛЮЄМО CLIENT CARD: приймаємо проп canEdit
const ClientCard = memo(({ client, onEdit, canEdit }) => {
  const typeMap = {
    'Приватний будинок': { icon: FaBuilding, color: 'text-blue-600 bg-blue-50', label: 'Приватний' },
    'Промислове підприємство': { icon: FaIndustry, color: 'text-purple-600 bg-purple-50', label: 'Промисловість' },
    'Офісна будівля': { icon: FaUserTie, color: 'text-green-600 bg-green-50', label: 'Офіс' },
    'Комерційний об\'єкт': { icon: FaHandshake, color: 'text-orange-600 bg-orange-50', label: 'Комерція' }
  };
  const { icon: ObjectIcon, color, label } = typeMap[client.object_type] || { icon: FaBuilding, color: 'text-gray-600 bg-gray-50', label: client.object_type || 'Інше' };
  
  const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('uk-UA') : 'N/A';

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:shadow-md transition-shadow flex flex-col h-full">
      <div className="flex-grow">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="font-bold text-slate-800 text-lg truncate leading-tight" title={client.company_name || client.name}>
                {client.company_name || client.name}
            </h3>
            {client.company_name && <p className="text-sm text-slate-500 truncate mt-0.5">{client.name}</p>}
          </div>
          <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded-md font-mono flex-shrink-0 border border-slate-200">
              #{client.custom_id}
          </span>
        </div>
        
        <div className="space-y-2.5 text-sm">
          <div className={`flex items-center gap-2 p-1.5 rounded-lg w-fit ${color}`}>
            <ObjectIcon className="w-3.5 h-3.5"/> <span className="font-semibold text-xs">{label}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
              <FaMapMarkerAlt className="text-slate-400 flex-shrink-0 text-xs"/> 
              <span className="truncate text-xs sm:text-sm">{[client.populated_place, client.oblast].filter(Boolean).join(', ') || '---'}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600">
              <FaPhone className="text-slate-400 flex-shrink-0 text-xs"/> 
              <a href={`tel:${client.phone}`} className="hover:text-indigo-600 truncate text-xs sm:text-sm font-medium">{client.phone || '---'}</a>
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
        <span className="text-[10px] text-slate-400">Створено: {formatDate(client.created_at)}</span>
        
        {/* 3. УМОВА ВІДОБРАЖЕННЯ КНОПКИ РЕДАГУВАННЯ */}
        {canEdit && (
          <button onClick={() => onEdit(client)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded-lg text-xs font-bold transition-colors border border-slate-200 hover:border-indigo-200">
            <FaEdit/> Редагувати
          </button>
        )}
      </div>
    </div>
  );
});

const Pagination = memo(({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;
    return (
        <div className="flex items-center justify-center gap-2 mt-8 pb-8">
            <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-slate-200 disabled:opacity-50 text-slate-600 hover:bg-slate-50 transition"><FaChevronLeft size={12}/></button>
            <span className="text-sm font-medium text-slate-600 px-2">Стор. {currentPage} з {totalPages}</span>
            <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-slate-200 disabled:opacity-50 text-slate-600 hover:bg-slate-50 transition"><FaChevronRight size={12}/></button>
        </div>
    );
});

export default function ClientsPage() {
  // 4. ОТРИМУЄМО РОЛЬ КОРИСТУВАЧА
  const { role } = useAuth();
  
  // 5. ВИЗНАЧАЄМО ПРАВА ДОСТУПУ
  // Create доступно всім (згідно з таблицею), тому canCreate окремо не потрібен, кнопка просто відображається.
  // Edit доступно тільки Адміну та Офісу.
  const canEdit = role === 'admin' || role === 'super_admin' || role === 'office';

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
        const term = debouncedSearchTerm.trim();
        const searchConditions = [`name.ilike.%${term}%`, `company_name.ilike.%${term}%`, `phone.ilike.%${term}%`];
        if (/^\d+$/.test(term)) searchConditions.push(`custom_id.eq.${term}`);
        query = query.or(searchConditions.join(','));
      }

      if (filters.type === 'private') query = query.eq('object_type', 'Приватний будинок');
      else if (filters.type === 'business') query = query.not('object_type', 'eq', 'Приватний будинок');

      if (filters.subcontract !== 'all') query = query.eq('is_subcontract', filters.subcontract === 'subcontract');
      if (filters.company !== 'all') query = query.eq('working_company', filters.company);

      const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + itemsPerPage - 1);

      if (error) throw error;
      setClients(data || []);
      setTotalClients(count || 0);
    } catch (error) {
      addNotification('Помилка завантаження даних', 'error');
    } finally {
      setLoading(false);
    }
  }, [itemsPerPage, debouncedSearchTerm, filters, addNotification]);
  
  useEffect(() => { setCurrentPage(1); }, [debouncedSearchTerm, filters]);
  useEffect(() => { loadClients(currentPage); }, [currentPage, loadClients]);

  const handleEditClient = (client) => {
      // Додатковий захист: якщо монтажник якось викликав цю функцію
      if (!canEdit) {
        addNotification("У вас немає прав на редагування", "error");
        return;
      }
      setEditingClient(client);
      setFormData({
          name: client.name || '', oblast: client.oblast || '', populated_place: client.populated_place || '',
          phone: client.phone || '+380', object_type: client.object_type || '', company_name: client.company_name || '',
          is_subcontract: client.is_subcontract || false, contractor_company: client.contractor_company || '',
          first_contact: client.first_contact ? new Date(client.first_contact).toISOString().split('T')[0] : '', 
          notes: client.notes || '', working_company: client.working_company || ''
      });
      setShowForm(true);
  };
  
  const handleAddClient = () => {
      setEditingClient(null);
      setFormData({
          name: '', oblast: '', populated_place: '', phone: '+380', object_type: '',
          company_name: '', is_subcontract: false, contractor_company: '', first_contact: '',
          notes: '', working_company: ''
      });
      setShowForm(true);
  };

  const handleInputChange = (field, value) => {
    if (field === 'phone') {
        if (!value.startsWith('+380')) value = '+380' + value.replace(/^\+380/, '').replace(/[^\d]/g, '');
        if (value.length > 13) value = value.substring(0, 13);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Введіть ім\'я';
    if (!formData.working_company) errors.working_company = 'Оберіть компанію';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    
    setSubmitting(true);
    try {
      const clientData = { ...formData, first_contact: formData.first_contact || null };
      let result;
      
      // Перевірка прав при спробі оновлення
      if (editingClient) {
        if (!canEdit) throw new Error("Немає прав на редагування");
        // --- ТУТ ЗМІНЕНО ---
        result = await supabase.from('clients').update({ 
            ...clientData, 
            updated_at: new Date().toISOString(),
            telegram_synced: false // Додаємо цей рядок, щоб скинути статус синхронізації
        }).eq('custom_id', editingClient.custom_id);
      } else {
        // Створення доступне всім
        result = await supabase.from('clients').insert([clientData]);
      }
      if (result.error) throw result.error;
        
      addNotification(editingClient ? 'Збережено!' : 'Створено!', 'success');
      setShowForm(false);
      loadClients(currentPage);
    } catch (error) {
      addNotification('Помилка: ' + error.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto pb-safe">
        
        {/* Page Header Area */}
        <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Клієнти</h1>
                    <p className="text-slate-500 text-sm mt-1">База замовників та об'єктів</p>
                </div>
                {/* КНОПКА СТВОРЕННЯ (Доступна всім ✅) */}
                <button onClick={handleAddClient} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all w-full sm:w-auto">
                    <FaPlus/> <span>Новий клієнт</span>
                </button>
            </div>

            {/* Search & Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-grow">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <input 
                        type="text" 
                        placeholder="Пошук клієнта..." 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition shadow-sm text-sm"
                    />
                </div>
                <button 
                    onClick={() => setShowFilters(!showFilters)} 
                    className={`flex-shrink-0 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold transition shadow-sm border ${showFilters ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                >
                    <FaFilter/> <span className="hidden sm:inline">Фільтри</span>
                </button>
            </div>

            {/* Expanded Filters */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 shadow-sm">
                            {[
                                { label: 'Компанія', key: 'company', opts: [{v:'all', l:'Всі'}, {v:'Кайрос', l:'Кайрос'}, {v:'Розумне збереження енергії', l:'РЗЕ'}] },
                                { label: 'Тип об\'єкта', key: 'type', opts: [{v:'all', l:'Всі'}, {v:'private', l:'Приватний'}, {v:'business', l:'Бізнес'}] },
                                { label: 'Співпраця', key: 'subcontract', opts: [{v:'all', l:'Всі'}, {v:'direct', l:'Прямі'}, {v:'subcontract', l:'Субпідряд'}] }
                            ].map((group, idx) => (
                                <div key={idx}>
                                    <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">{group.label}</span>
                                    <div className="flex flex-wrap gap-2">
                                        {group.opts.map(opt => (
                                            <button key={opt.v} onClick={() => setFilters(f => ({...f, [group.key]: opt.v}))} 
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filters[group.key] === opt.v ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                                {opt.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>

        {/* Content Grid */}
        <div className="min-h-[300px]">
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="bg-white h-40 rounded-2xl animate-pulse border border-slate-100"></div>)}
                </div>
            ) : clients.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                    <FaUsers className="mx-auto text-4xl text-slate-300 mb-3"/>
                    <h3 className="text-lg font-bold text-slate-600">Клієнтів не знайдено</h3>
                    <p className="text-slate-400 text-sm">Спробуйте змінити фільтри</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {clients.map(client => (
                        <ClientCard 
                            key={client.custom_id} 
                            client={client} 
                            onEdit={handleEditClient}
                            canEdit={canEdit} // 6. ПЕРЕДАЄМО ПРАВА В КАРТКУ
                        />
                    ))}
                </div>
            )}
        </div>
        
        {!loading && totalClients > itemsPerPage && (
            <Pagination currentPage={currentPage} totalPages={Math.ceil(totalClients / itemsPerPage)} onPageChange={setCurrentPage} />
        )}
      </div>

      <NotificationSystem notifications={notifications} removeNotification={removeNotification} />

      {/* Modal Form */}
      <AnimatePresence>
        {showForm && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" onClick={() => setShowForm(false)}>
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" /> 
                <motion.div 
                    initial={{ scale: 0.95, opacity: 0, y: 20 }} 
                    animate={{ scale: 1, opacity: 1, y: 0 }} 
                    exit={{ scale: 0.95, opacity: 0, y: 20 }} 
                    className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-2xl flex flex-col relative z-10 overflow-hidden" 
                    onClick={e => e.stopPropagation()}
                >
                    <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-20">
                        <h2 className="text-xl font-bold text-slate-800">{editingClient ? 'Редагування' : 'Новий клієнт'}</h2>
                        <button onClick={() => setShowForm(false)} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"><FaTimes/></button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Ім'я / Назва <span className="text-red-500">*</span></label>
                                <input type="text" value={formData.name} onChange={e => handleInputChange('name', e.target.value)} className={`w-full border rounded-xl px-4 py-3 bg-slate-50 focus:bg-white transition-colors outline-none focus:ring-2 focus:ring-indigo-500 ${formErrors.name ? 'border-red-500' : 'border-slate-200'}`} placeholder="ПІБ або назва"/>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Компанія-виконавець <span className="text-red-500">*</span></label>
                                <select value={formData.working_company} onChange={e => handleInputChange('working_company', e.target.value)} className={`w-full border rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none ${formErrors.working_company ? 'border-red-500' : 'border-slate-200'}`}>
                                    <option value="">Оберіть...</option>
                                    <option value="Кайрос">Кайрос</option>
                                    <option value="Розумне збереження енергії">РЗЕ</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Телефон</label>
                                <input type="tel" value={formData.phone} onChange={e => handleInputChange('phone', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none focus:ring-2 focus:ring-indigo-500" placeholder="+380..."/>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Тип об'єкта</label>
                                <select value={formData.object_type} onChange={e => handleInputChange('object_type', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none">
                                    <option value="">Не вказано</option>
                                    <option value="Приватний будинок">Приватний будинок</option>
                                    <option value="Промислове підприємство">Промислове підприємство</option>
                                    <option value="Офісна будівля">Офісна будівля</option>
                                    <option value="Комерційний об'єкт">Комерційний об'єкт</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Назва компанії (якщо є)</label>
                                <input type="text" value={formData.company_name} onChange={e => handleInputChange('company_name', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none" placeholder="ТОВ..."/>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Область</label>
                                <input type="text" value={formData.oblast} onChange={e => handleInputChange('oblast', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none"/>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Населений пункт</label>
                                <input type="text" value={formData.populated_place} onChange={e => handleInputChange('populated_place', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none"/>
                            </div>
                        </div>

                        {/* Subcontract Toggle */}
                        <div className="mt-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <div className="flex items-center space-x-3 mb-3">
                                <input type="checkbox" id="subcontract" checked={formData.is_subcontract} onChange={e => handleInputChange('is_subcontract', e.target.checked)} className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500"/>
                                <label htmlFor="subcontract" className="text-sm font-bold text-slate-700 select-none">Субпідряд</label>
                            </div>
                            {formData.is_subcontract && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Назва підрядника</label>
                                    <input type="text" value={formData.contractor_company} onChange={e => handleInputChange('contractor_company', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white outline-none" placeholder="Введіть назву..."/>
                                </div>
                            )}
                        </div>

                        <div className="mt-5">
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Примітки</label>
                          <textarea rows="3" value={formData.notes} onChange={e => handleInputChange('notes', e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 focus:bg-white outline-none resize-none" placeholder="Додаткова інформація..."></textarea>
                        </div>
                    </form>

                    <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 sticky bottom-0 z-20">
                        <button type="button" onClick={() => setShowForm(false)} className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition">Скасувати</button>
                        <button type="submit" onClick={handleSubmit} disabled={submitting} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:shadow-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">
                          {submitting ? 'Збереження...' : (editingClient ? 'Оновити' : 'Створити')}
                        </button>
                    </div>
                </motion.div>
            </div>
        )}
      </AnimatePresence>
    </Layout>
  );
}