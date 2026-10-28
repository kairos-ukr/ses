import React, { createContext, useState, useEffect, useContext, useRef, useCallback, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { forgetDevice } from './utils/push';
import { BUILTIN_TEMPLATES, defaultTemplateKey, effectivePerms, makeCan, makeAll } from './domain/access';

/** Шаблон доступу людини з бази; до міграції — запасний з коду */
const loadTemplate = async (emp) => {
  const key = emp.access_template || defaultTemplateKey(emp);
  const builtin = BUILTIN_TEMPLATES.find(t => t.key === key) || BUILTIN_TEMPLATES.find(t => t.key === defaultTemplateKey(emp));
  try {
    const { data, error } = await supabase.from('access_templates').select('key, name, app, perms').eq('key', key).maybeSingle();
    if (error || !data) return builtin;
    return data;
  } catch {
    return builtin;
  }
};

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

// Стан доступу до CRM:
//  none     — ніхто не увійшов
//  loading  — перевіряємо, чи акаунт прив'язаний до працівника
//  ok       — працівник знайдений, CRM відкрита
//  pending  — акаунт є, але адміністратор ще не підтвердив, хто це
//  rejected — адміністратор відхилив реєстрацію
//  blocked  — працівник є, але адміністратор заблокував йому доступ
//  error    — не вдалося перевірити (мережа)
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [registration, setRegistration] = useState(null);
  const [access, setAccess] = useState('none');
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState(null);   // шаблон доступу (domain/access)

  // === FIX: Використовуємо ref, щоб слідкувати за юзером без перерендерів ===
  const userRef = useRef(user);
  const accessRef = useRef(access);

  // Оновлюємо ref кожного разу, коли змінюється юзер, але це НЕ запускає ефект
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    accessRef.current = access;
  }, [access]);

  // silent — перевірка у фоні: не ховаємо відкриту сторінку за спінером
  // і не викидаємо людину з CRM через разовий збій мережі.
  const loadAccess = useCallback(async (userId, { silent = false } = {}) => {
    if (!silent) setAccess('loading');
    try {
      const { data: emp, error } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;

      if (emp) {
        // access_blocked_at з'являється після міграції db/2026-10_access_blocking.sql;
        // до неї поля просто немає, і всі працюють як раніше.
        const next = emp.access_blocked_at ? 'blocked' : 'ok';
        const tpl = await loadTemplate(emp);
        setTemplate(prev => (prev && JSON.stringify(prev) === JSON.stringify(tpl) ? prev : tpl));
        // Фонова перевірка не повинна «оновлювати» профіль без змін: сторінки,
        // що залежать від employee, інакше перезавантажували б дані щоразу.
        setEmployee(prev => (prev && JSON.stringify(prev) === JSON.stringify(emp) ? prev : emp));
        setRegistration(null);
        setAccess(next);
        return next;
      }

      const { data: reg } = await supabase
        .from('user_site')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      const next = reg?.rejected_at ? 'rejected' : 'pending';
      setEmployee(null);
      setRegistration(reg || null);
      setAccess(next);
      return next;
    } catch (error) {
      console.error("Profile fetch error:", error);
      if (!silent) setAccess('error');
      return 'error';
    }
  }, []);

  const refreshSession = async () => {
    // Використовуємо ref, щоб перевірити, чи ми залогінені
    if (!userRef.current) return;

    try {
      console.log("🔄 Відновлення зв'язку...");
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session) {
         setUser(data.session.user);
      }
    } catch (e) {
      console.error("Connection error:", e);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          await loadAccess(session.user.id);
        }
      } catch (error) {
        console.error("Init error:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initializeAuth();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // SIGNED_IN приходить і при поверненні на вкладку. Якщо це той самий
        // користувач — перевіряємо тихо, щоб не скидати відкриту сторінку.
        const sameUser = userRef.current?.id === session.user.id;
        setUser(session.user);
        loadAccess(session.user.id, { silent: sameUser && accessRef.current !== 'none' });
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setEmployee(null);
        setRegistration(null);
        setTemplate(null);
        setAccess('none');
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setUser(session.user);
      }
    });

    // === БУДИЛЬНИК (ТЕПЕР БЕЗПЕЧНИЙ) ===
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Перевіряємо через ref - це не викликає цикл!
        if (userRef.current) {
            refreshSession();
            // Поки людина була в іншій вкладці, адміністратор міг надати
            // доступ (чекала на підтвердження) або заблокувати його.
            loadAccess(userRef.current.id, { silent: true });
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Блокування має спрацювати і в людини, яка тримає CRM відкритою весь день
    const recheck = setInterval(() => {
      if (userRef.current && document.visibilityState === 'visible') {
        loadAccess(userRef.current.id, { silent: true });
      }
    }, 5 * 60 * 1000);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(recheck);
    };
  }, [loadAccess]); // loadAccess стабільний (useCallback без залежностей) — циклу немає

  const signOut = async () => {
    // Після виходу цей пристрій більше не отримує чужих пушів
    await forgetDevice();
    return supabase.auth.signOut();
  };

  const refreshAccess = useCallback(
    () => (userRef.current ? loadAccess(userRef.current.id, { silent: true }) : Promise.resolve('none')),
    [loadAccess]
  );

  // Рівневі доступи: шаблон + особисті відхилення, або «без обмежень» (domain/access)
  const perms = useMemo(() => (employee ? effectivePerms({
    template,
    overrides: employee.access_overrides || {},
    unrestricted: employee.access_unrestricted === true,
  }) : {}), [employee, template]);
  const can = useMemo(() => makeCan(perms), [perms]);
  const canAll = useMemo(() => makeAll(perms), [perms]);

  const role = employee?.role || null;
  // Монтажник працює лише в «Монтажі»; CRM — для офісу й адміністраторів
  const isOffice = ['office', 'super_admin'].includes(role);

  const value = {
    user,
    employee,
    registration,
    access,
    refreshAccess,
    role,
    tier: employee?.tier || null,
    isOffice,
    template,
    perms,
    can,
    canAll,
    unrestricted: employee?.access_unrestricted === true,
    // Керує доступами й налаштуваннями
    isAdmin: isOffice && can('access', 'edit'),
    // Гроші всієї компанії: загальна дебіторка, оборот. Решта бачить гроші
    // лише своїх об'єктів (domain/objects.canSeeMoney)
    financeAll: isOffice && canAll('money'),
    signOut,
    loading
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
         <h2 className="text-lg font-medium text-slate-600">Завантаження...</h2>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
