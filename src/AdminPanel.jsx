import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  MagnifyingGlassIcon, 
  FunnelIcon,
  BriefcaseIcon,
  PhoneIcon,
  EnvelopeIcon,
  CalendarIcon,
  IdentificationIcon,
  XMarkIcon,
  UserCircleIcon
} from '@heroicons/react/24/outline';

// Налаштування ролей
const ROLES = [
  { value: 'all', label: 'Всі ролі' },
  { value: 'super_admin', label: '👑 Адміністратор' },
  { value: 'office', label: '🏢 Офіс / Менеджер' },
  { value: 'installer', label: '🛠️ Монтажник' }
];

const TIERS = [
  { value: 1, label: '⚡ Бригадир' },
  { value: 2, label: '🔧 Майстер' }
];

export default function AdminPanel() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  
  // Стан для відкриття детальної картки (Modal)
  const [selectedEmp, setSelectedEmp] = useState(null);

  const fetchEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('name', { ascending: true });
    
    if (!error) setEmployees(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleUpdate = async (id, field, value) => {
    // Оптимістичне оновлення
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    // Оновлення в детальному перегляді, якщо він відкритий
    if (selectedEmp && selectedEmp.id === id) {
      setSelectedEmp(prev => ({ ...prev, [field]: value }));
    }
    await supabase.from('employees').update({ [field]: value }).eq('id', id);
  };

  // Розрахунок віку
  const getAge = (dob) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    const age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    return `${age} р.`;
  };

  // Фільтрація
  const filteredEmployees = employees.filter(emp => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = emp.name.toLowerCase().includes(term) || 
                          emp.position?.toLowerCase().includes(term) ||
                          emp.email?.toLowerCase().includes(term);
    const matchesRole = roleFilter === 'all' || emp.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6 sm:p-10 font-sans">
      <div className="max-w-7xl mx-auto">
        
        {/* ЗАГОЛОВОК */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Персонал</h1>
          <p className="text-slate-500 mt-1">Керування доступами та перегляд досьє</p>
        </div>

        {/* ПАНЕЛЬ ІНСТРУМЕНТІВ (ВИРІВНЯНА) */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-8 flex flex-col sm:flex-row gap-4 items-center">
          
          {/* Пошук */}
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-slate-400" />
            </div>
            <input 
              type="text" 
              placeholder="Пошук за ім'ям, поштою чи посадою..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 w-full border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 py-2.5 transition-all"
            />
          </div>

          {/* Фільтр ролей */}
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FunnelIcon className="h-5 w-5 text-slate-400" />
            </div>
            <select 
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="pl-10 w-full border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 py-2.5 bg-white appearance-none cursor-pointer transition-all"
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        </div>

        {/* СІТКА КАРТОК */}
        {loading ? (
          <div className="text-center py-20 text-slate-400 animate-pulse">Завантаження бази даних...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEmployees.map(emp => (
              <div key={emp.id} className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-100 flex flex-col overflow-hidden group">
                
                {/* Верхня частина картки */}
                <div className="p-6 pb-4">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                      {/* Аватар */}
                      <div className="h-14 w-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xl font-bold border-2 border-white shadow-sm">
                        {emp.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-lg leading-tight">{emp.name}</h3>
                        <div className="flex items-center text-sm text-slate-500 mt-0.5 gap-2">
                           <span>{emp.position || 'Без посади'}</span>
                           {emp.date_birth && (
                             <span className="bg-slate-100 px-1.5 py-0.5 rounded text-xs font-medium text-slate-600">
                               {getAge(emp.date_birth)}
                             </span>
                           )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Основна інфо */}
                  <div className="space-y-2 mt-2">
                    <div className="flex items-center text-sm text-slate-600">
                      <EnvelopeIcon className="w-4 h-4 mr-2 text-slate-400" />
                      <span className="truncate">{emp.email}</span>
                    </div>
                    {emp.phone && (
                      <div className="flex items-center text-sm text-slate-600">
                        <PhoneIcon className="w-4 h-4 mr-2 text-slate-400" />
                        <span>{emp.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Нижня панель керування (Темніша) */}
                <div className="mt-auto bg-slate-50 p-4 border-t border-slate-100">
                  <div className="flex flex-col gap-3">
                    
                    {/* Вибір Ролі - Стильний селект */}
                    <div className="relative">
                       <select 
                        value={emp.role}
                        onChange={(e) => handleUpdate(emp.id, 'role', e.target.value)}
                        className="w-full bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 font-medium cursor-pointer"
                      >
                        {ROLES.filter(r => r.value !== 'all').map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Тіри (Тільки для монтажників) */}
                    {emp.role === 'installer' && (
                      <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                        {TIERS.map((tier) => (
                          <button
                            key={tier.value}
                            onClick={() => handleUpdate(emp.id, 'tier', tier.value)}
                            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                              emp.tier === tier.value
                                ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                                : 'text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            {tier.label}
                          </button>
                        ))}
                      </div>
                    )}

                    <button 
                      onClick={() => setSelectedEmp(emp)}
                      className="w-full mt-1 py-2 text-sm text-slate-500 hover:text-indigo-600 font-medium transition-colors border border-dashed border-slate-300 rounded-lg hover:border-indigo-300 hover:bg-indigo-50"
                    >
                      Переглянути справу
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* --- МОДАЛЬНЕ ВІКНО: ПОВНА СПРАВА --- */}
        {selectedEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-up">
              
              {/* Шапка модалки */}
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center sticky top-0">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <IdentificationIcon className="w-6 h-6 text-indigo-500" />
                  Особиста справа
                </h3>
                <button onClick={() => setSelectedEmp(null)} className="p-2 bg-white rounded-full hover:bg-slate-200 transition">
                  <XMarkIcon className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Тіло модалки */}
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Ліва колонка: Основне */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">ПІБ</label>
                    <p className="text-lg font-semibold text-slate-800">{selectedEmp.name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Посада</label>
                    <p className="text-base text-slate-700">{selectedEmp.position || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Контакти</label>
                    <div className="flex flex-col gap-1 mt-1">
                      <div className="flex items-center gap-2 text-sm">
                        <EnvelopeIcon className="w-4 h-4 text-slate-400"/> {selectedEmp.email}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <PhoneIcon className="w-4 h-4 text-slate-400"/> {selectedEmp.phone || 'Не вказано'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Дата народження / Вік</label>
                    <div className="flex items-center gap-2 mt-1">
                      <CalendarIcon className="w-4 h-4 text-slate-400"/> 
                      <span className="text-sm">
                        {selectedEmp.date_birth 
                          ? `${new Date(selectedEmp.date_birth).toLocaleDateString('uk-UA')} (${getAge(selectedEmp.date_birth)})` 
                          : 'Не вказано'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Права колонка: Деталі */}
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">ID працівника</label>
                    <p className="font-mono text-sm bg-slate-100 inline-block px-2 py-1 rounded text-slate-600">
                      #{selectedEmp.custom_id || selectedEmp.id}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Відділи (Department)</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedEmp.department && selectedEmp.department.length > 0 
                        ? selectedEmp.department.map((dep, idx) => (
                            <span key={idx} className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-medium border border-blue-100">
                              {dep}
                            </span>
                          ))
                        : <span className="text-sm text-slate-400 italic">Не призначено</span>
                      }
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Навички (Skills)</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedEmp.skills && selectedEmp.skills.length > 0 
                        ? selectedEmp.skills.map((skill, idx) => (
                            <span key={idx} className="bg-green-50 text-green-700 px-2 py-1 rounded text-xs font-medium border border-green-100">
                              {skill}
                            </span>
                          ))
                        : <span className="text-sm text-slate-400 italic">Не вказано</span>
                      }
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Нотатки</label>
                    <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg text-sm text-amber-800 mt-1 min-h-[80px]">
                      {selectedEmp.notes || 'Нотаток немає...'}
                    </div>
                  </div>
                </div>

                {/* Статус Auth - на всю ширину */}
                <div className="col-span-1 md:col-span-2 pt-4 border-t border-slate-100">
                   <div className="flex items-center justify-between">
                     <span className="text-sm font-medium text-slate-500">Статус системного доступу:</span>
                     {selectedEmp.user_id ? (
                       <span className="flex items-center gap-2 text-green-600 bg-green-50 px-3 py-1 rounded-full text-sm font-bold">
                         <UserCircleIcon className="w-5 h-5"/> Активний
                       </span>
                     ) : (
                       <span className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full text-sm font-bold">
                         <UserCircleIcon className="w-5 h-5"/> Очікує реєстрації
                       </span>
                     )}
                   </div>
                   {!selectedEmp.user_id && (
                     <p className="text-xs text-slate-400 mt-2 text-right">
                       * Надішліть запрошення через Supabase Auth Dashboard
                     </p>
                   )}
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}