import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { supabase } from './supabaseClient'; 

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);

  // === FIX: Використовуємо ref, щоб слідкувати за юзером без перерендерів ===
  const userRef = useRef(user);

  // Оновлюємо ref кожного разу, коли змінюється юзер, але це НЕ запускає ефект
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const fetchEmployeeProfile = async (userId) => {
    try {
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (data) setEmployee(data);
    } catch (error) {
      console.error("Profile fetch error:", error);
    }
  };

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
          await fetchEmployeeProfile(session.user.id);
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
        setUser(session.user);
        fetchEmployeeProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setEmployee(null);
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
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []); // <--- ОСЬ ТУТ ТЕПЕР ПУСТО! ЦЕ ГАРАНТУЄ ВІДСУТНІСТЬ ЦИКЛУ.

  const signOut = async () => {
    return supabase.auth.signOut();
  };

  const value = {
    user,
    employee,
    role: employee?.role || null,
    tier: employee?.tier || null,
    isAdmin: employee?.role === 'super_admin',
    isOffice: ['office', 'super_admin'].includes(employee?.role),
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