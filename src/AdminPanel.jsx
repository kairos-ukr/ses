import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from './supabaseClient';
import SettingsPanel from './pages/SettingsPanel';
import Layout from './Layout';
import RegistrationsPanel from './RegistrationsPanel';
import { useAuth } from './AuthProvider';
import { useToast, useConfirm, humanError, Tip, Segmented } from './ui';
import { hasAccessBlocking } from './utils/features';
import { defaultTemplateKey } from './domain/access';
import { PersonAccess, AccessTemplates, useAccessTemplates, overridesCount } from './pages/AccessPanels';
import {
  FaLock, FaLockOpen, FaSearch, FaPhone, FaEnvelope, FaCalendarAlt, FaIdCard, FaTimes, FaUserCircle, FaHistory,
  FaUsers, FaUserShield, FaBriefcase, FaHardHat, FaUserSlash, FaCheckCircle, FaSlidersH, FaUnlock,
} from 'react-icons/fa';

// Налаштування ролей
const ROLES = [
  { value: 'all', label: 'Всі ролі' },
  { value: 'super_admin', label: 'Адміністратор' },
  { value: 'office', label: 'Офіс / менеджер' },
  { value: 'installer', label: 'Монтажник' }
];

const TIERS = [
  { value: 1, label: 'Бригадир' },
  { value: 2, label: 'Майстер' }
];

export default function AdminPanel() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  
  // Стан для відкриття детальної картки (Modal)
  const [selectedEmp, setSelectedEmp] = useState(null);

  // Вкладки: люди / шаблони доступу / налаштування (норми етапів, курс, автоматика)
  const auth = useAuth();
  const canAccess = auth.can('access');
  const canSettings = auth.can('settings');
  const TABS = [
    ...(canAccess ? [{ value: 'people', label: 'Люди' }, { value: 'templates', label: 'Шаблони' }] : []),
    ...(canSettings ? [{ value: 'settings', label: 'Налаштування' }] : []),
  ];
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.value === params.get('tab')) ? params.get('tab') : (TABS[0]?.value || 'settings');
  const setTab = (t) => setParams(t === 'people' ? {} : { tab: t }, { replace: true });
  const [templates, reloadTemplates] = useAccessTemplates();
  const [accessOpen, setAccessOpen] = useState(null);   // id людини, чий доступ розгорнуто
  const tplOf = (emp) => (templates || []).find(t => t.key === (emp.access_template || defaultTemplateKey(emp)));

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

  // --- Блокування доступу ---
  // Працівник лишається в усіх списках, історії й графіках — закривається
  // лише вхід у CRM. Кнопка з'являється після міграції db/2026-10_access_blocking.sql.
  const { employee: me } = auth;
  const toast = useToast();
  const confirm = useConfirm();
  const [blockingReady, setBlockingReady] = useState(false);
  useEffect(() => { hasAccessBlocking().then(setBlockingReady); }, []);

  const toggleBlock = async (emp) => {
    const block = !emp.access_blocked_at;
    if (block) {
      const ok = await confirm({
        title: 'Заблокувати доступ?',
        message: `${emp.name} більше не зможе працювати в K-Core. Його етапи, виїзди й історія залишаться на місці. Розблокувати можна будь-коли.`,
        confirmLabel: 'Заблокувати',
      });
      if (!ok) return;
    }
    const patch = {
      access_blocked_at: block ? new Date().toISOString() : null,
      access_blocked_by: block ? (me?.id || null) : null,
    };
    const { error } = await supabase.from('employees').update(patch).eq('id', emp.id);
    if (error) { toast(humanError(error), 'error'); return; }
    setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, ...patch } : e));
    toast(block ? `Доступ заблоковано: ${emp.name}` : `Доступ відновлено: ${emp.name}`, block ? 'info' : 'success');
  };

  // --- Рівневий доступ: шаблон, «без обмежень», особисті зміни (pages/AccessPanels) ---
  const accessBtn = (emp, h) => {
    const tpl = tplOf(emp);
    const own = tpl ? overridesCount(emp, tpl) : 0;
    const on = accessOpen === emp.id;
    return (
      <button type="button" onClick={() => setAccessOpen(on ? null : emp.id)} aria-expanded={on}
        className={`${h} px-2.5 rounded-lg border text-[12px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap max-w-full
          ${on ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300'}`}>
        {emp.access_unrestricted ? <FaUnlock size={10} className={on ? '' : 'text-emerald-600'} /> : <FaSlidersH size={10} />}
        <span className="truncate">{emp.access_unrestricted ? 'Без обмежень' : tpl?.name || '—'}</span>
        {!emp.access_unrestricted && own > 0 && <span className={on ? 'text-indigo-100' : 'text-amber-600'}>+{own}</span>}
      </button>
    );
  };
  const accessEditor = (emp) => templates && (
    <PersonAccess emp={emp} templates={templates} onClose={() => setAccessOpen(null)}
      onSaved={(next) => { setEmployees(prev => prev.map(e => (e.id === next.id ? next : e))); setAccessOpen(null); }} />
  );

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

  const countBy = (fn) => employees.filter(fn).length;

  // Фільтрація
  const filteredEmployees = employees.filter(emp => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = emp.name.toLowerCase().includes(term) || 
                          emp.position?.toLowerCase().includes(term) ||
                          emp.email?.toLowerCase().includes(term);
    const matchesRole = roleFilter === 'all' ? true
      : roleFilter === 'noaccount' ? !emp.user_id
        : roleFilter === 'blocked' ? !!emp.access_blocked_at
          : emp.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <Layout>
    <div className="min-h-full bg-slate-50 p-3 sm:p-6">
      <div className="max-w-[1500px] mx-auto">

        {/* ЗАГОЛОВОК */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Доступи</h1>
          <div className="flex flex-wrap items-center gap-2">
            {TABS.length > 1 && <Segmented value={tab} onChange={setTab} options={TABS} />}
            {canAccess && (
              <a href="#/admin/changes"
                className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-[13px] font-bold">
                <FaHistory size={12} /> Журнал змін
              </a>
            )}
          </div>
        </div>

        {tab === 'settings' ? <SettingsPanel /> : tab === 'templates' ? (
          <AccessTemplates templates={templates} employees={employees} onChanged={reloadTemplates} />
        ) : <>
        {/* Акаунти, які ще чекають на підтвердження */}
        <RegistrationsPanel employees={employees} onChanged={fetchEmployees} />

        {/* Підсумок: скільки кого — натискання фільтрує */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-3">
          {[
            { key: 'all', label: 'Усього', n: employees.length, icon: FaUsers, tone: 'text-slate-700' },
            { key: 'super_admin', label: 'Адміністратори', n: countBy(e => e.role === 'super_admin'), icon: FaUserShield, tone: 'text-indigo-700' },
            { key: 'office', label: 'Офіс', n: countBy(e => e.role === 'office'), icon: FaBriefcase, tone: 'text-sky-700' },
            { key: 'installer', label: 'Монтажники', n: countBy(e => e.role === 'installer'), icon: FaHardHat, tone: 'text-amber-700' },
            { key: 'noaccount', label: 'Без входу в CRM', n: countBy(e => !e.user_id), icon: FaUserSlash, tone: 'text-slate-500' },
            { key: 'blocked', label: 'Заблоковані', n: countBy(e => !!e.access_blocked_at), icon: FaLock, tone: 'text-rose-700' },
          ].map(t => (
            <button key={t.key} type="button" onClick={() => setRoleFilter(t.key)}
              className={`text-left bg-white rounded-xl border px-3.5 py-3 transition-colors ${roleFilter === t.key ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-slate-300'}`}>
              <div className={`text-[12px] font-semibold inline-flex items-center gap-1.5 ${t.tone}`}><t.icon size={11} /> {t.label}</div>
              <div className="text-[22px] font-bold text-slate-900 tabular-nums leading-tight">{t.n}</div>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-2 mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
            <input type="text" placeholder="Ім'я, пошта або посада" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 text-[13px] outline-none focus:border-indigo-400" />
          </div>
          {roleFilter !== 'all' && (
            <button type="button" onClick={() => setRoleFilter('all')} className="h-9 px-3 rounded-lg border border-slate-200 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
              <FaTimes size={10} /> Скинути фільтр
            </button>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400 animate-pulse">Завантаження…</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-slate-500">Нікого не знайдено</div>
        ) : (
          <>
            {/* Комп'ютер — таблиця */}
            <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                    <th className="px-4 py-2.5">Людина</th>
                    <th className="px-3 py-2.5 w-[200px]">Роль</th>
                    <th className="px-3 py-2.5 w-[190px]">Рівень</th>
                    <th className="px-3 py-2.5">Права</th>
                    <th className="px-3 py-2.5">Вхід у CRM</th>
                    <th className="px-3 py-2.5">Доступ</th>
                    <th className="px-4 py-2.5 text-right">Справа</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map(emp => (
                    <React.Fragment key={emp.id}>
                    <tr className={emp.access_blocked_at ? 'bg-rose-50/30' : accessOpen === emp.id ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'}>
                      <td className="px-4 py-2.5">
                        <div className="text-[13.5px] font-semibold text-slate-900">{emp.name}</div>
                        <div className="text-[12px] text-slate-500">{[emp.position, emp.email].filter(Boolean).join(' · ') || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <select value={emp.role} onChange={(e) => handleUpdate(emp.id, 'role', e.target.value)} disabled={emp.id === me?.id}
                          className="w-full h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 disabled:opacity-60">
                          {ROLES.filter(r => r.value !== 'all').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        {emp.role === 'installer' ? (
                          <div className="inline-flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                            {TIERS.map(tier => (
                              <button key={tier.value} type="button" onClick={() => handleUpdate(emp.id, 'tier', tier.value)}
                                className={`h-8 px-2.5 rounded-md text-[12px] font-bold ${emp.tier === tier.value ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
                                {tier.label}
                              </button>
                            ))}
                          </div>
                        ) : <span className="text-slate-300 text-[13px]">—</span>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[220px]">{accessBtn(emp, 'h-8')}</td>
                      <td className="px-3 py-2.5">
                        {emp.user_id
                          ? <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-emerald-50 text-emerald-700 text-[12px] font-semibold"><FaCheckCircle size={10} /> є акаунт</span>
                          : <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-md bg-slate-100 text-slate-500 text-[12px] font-semibold">без входу</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {blockingReady && emp.user_id && emp.id !== me?.id ? (
                          <button type="button" onClick={() => toggleBlock(emp)}
                            className={`h-8 px-2.5 rounded-lg border text-[12px] font-bold inline-flex items-center gap-1.5 ${emp.access_blocked_at ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-slate-200 text-slate-600 hover:border-rose-200 hover:text-rose-700 hover:bg-rose-50'}`}>
                            {emp.access_blocked_at ? <><FaLockOpen size={10} /> Розблокувати</> : <><FaLock size={10} /> Заблокувати</>}
                          </button>
                        ) : emp.access_blocked_at ? (
                          <span className="text-[12px] font-semibold text-rose-700">заблоковано</span>
                        ) : <span className="text-slate-300 text-[13px]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => setSelectedEmp(emp)} className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50 inline-flex items-center gap-1.5">
                          <FaIdCard size={11} /> Відкрити
                        </button>
                      </td>
                    </tr>
                    {accessOpen === emp.id && (
                      <tr className="bg-indigo-50/30">
                        <td colSpan={7} className="px-4 pb-4 pt-1">{accessEditor(emp)}</td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Телефон — картки */}
            <div className="md:hidden space-y-2">
              {filteredEmployees.map(emp => (
                <div key={emp.id} className={`bg-white rounded-xl border p-3 space-y-2 ${emp.access_blocked_at ? 'border-rose-200' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-slate-900 break-words">{emp.name}</div>
                      <div className="text-[12px] text-slate-500 break-words">{[emp.position, emp.email].filter(Boolean).join(' · ') || '—'}</div>
                    </div>
                    <button type="button" onClick={() => setSelectedEmp(emp)} aria-label="Відкрити справу" className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-indigo-600"><FaIdCard size={13} /></button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <select value={emp.role} onChange={(e) => handleUpdate(emp.id, 'role', e.target.value)} disabled={emp.id === me?.id}
                      className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">
                      {ROLES.filter(r => r.value !== 'all').map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    {emp.role === 'installer' && TIERS.map(tier => (
                      <button key={tier.value} type="button" onClick={() => handleUpdate(emp.id, 'tier', tier.value)}
                        className={`h-9 px-2.5 rounded-lg border text-[12px] font-bold ${emp.tier === tier.value ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>
                        {tier.label}
                      </button>
                    ))}
                    {accessBtn(emp, 'h-9')}
                    {emp.user_id ? <span className="h-7 px-2 rounded-md bg-emerald-50 text-emerald-700 text-[12px] font-semibold inline-flex items-center">є акаунт</span>
                      : <span className="h-7 px-2 rounded-md bg-slate-100 text-slate-500 text-[12px] font-semibold inline-flex items-center">без входу</span>}
                    {blockingReady && emp.user_id && emp.id !== me?.id && (
                      <button type="button" onClick={() => toggleBlock(emp)}
                        className={`h-9 px-2.5 rounded-lg border text-[12px] font-bold inline-flex items-center gap-1.5 ml-auto ${emp.access_blocked_at ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-700'}`}>
                        {emp.access_blocked_at ? <><FaLockOpen size={10} /> Розблокувати</> : <><FaLock size={10} /> Заблокувати</>}
                      </button>
                    )}
                  </div>
                  {accessOpen === emp.id && <div className="pt-2 border-t border-slate-100">{accessEditor(emp)}</div>}
                </div>
              ))}
            </div>
          </>
        )}
        </>}

        {/* --- МОДАЛЬНЕ ВІКНО: ПОВНА СПРАВА --- */}
        {selectedEmp && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in-up">
              
              {/* Шапка модалки */}
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center sticky top-0">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <FaIdCard className="w-6 h-6 text-indigo-500" />
                  Особиста справа
                </h3>
                <button onClick={() => setSelectedEmp(null)} className="p-2 bg-white rounded-full hover:bg-slate-200 transition">
                  <FaTimes className="w-5 h-5 text-slate-500" />
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
                        <FaEnvelope className="w-4 h-4 text-slate-400"/> {selectedEmp.email}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <FaPhone className="w-4 h-4 text-slate-400"/> {selectedEmp.phone || 'Не вказано'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Дата народження / Вік</label>
                    <div className="flex items-center gap-2 mt-1">
                      <FaCalendarAlt className="w-4 h-4 text-slate-400"/> 
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
                         <FaUserCircle className="w-5 h-5"/> Активний
                       </span>
                     ) : (
                       <span className="flex items-center gap-2 text-amber-600 bg-amber-50 px-3 py-1 rounded-full text-sm font-bold">
                         <FaUserCircle className="w-5 h-5"/> Ще не має акаунта
                         <Tip text="Попросіть працівника зареєструватись на сторінці входу, а потім підтвердіть його в блоці «Нові реєстрації»." />
                       </span>
                     )}
                   </div>
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
    </Layout>
  );
}