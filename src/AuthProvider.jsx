import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from './supabaseClient'; // Перевір шлях до твого клієнта

// Створюємо контекст (це як глобальна змінна для всього додатка)
const AuthContext = createContext({});

// Цей хук ми будемо використовувати на сторінках: const { role } = useAuth();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Дані з Auth (email, id)
  const [employee, setEmployee] = useState(null); // Дані з Employees (role, tier, name)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Перевіряємо поточну сесію при завантаженні
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setUser(session.user);
        await fetchEmployeeProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    checkUser();

    // 2. Слухаємо зміни (вхід/вихід)
    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        await fetchEmployeeProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setEmployee(null);
        setLoading(false);
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Функція, яка тягне роль і права з таблиці employees
  const fetchEmployeeProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*') // Можна вибрати тільки role, tier, name
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error("Помилка отримання профілю працівника:", error);
      }
      
      if (data) {
        console.log("Зайшов працівник:", data.name, "| Роль:", data.role);
        setEmployee(data);
      }
    } catch (error) {
      console.error("Critical error fetching profile:", error);
    } finally {
      setLoading(false);
    }
  };

  // Це значення буде доступне всюди в програмі
  const value = {
    user,              // Технічний юзер Supabase
    employee,          // Наш працівник (з правами!)
    role: employee?.role || null, // Швидкий доступ до ролі
    tier: employee?.tier || null, // Швидкий доступ до рівня
    isAdmin: employee?.role === 'super_admin',
    isOffice: employee?.role === 'office' || employee?.role === 'super_admin', // Офіс + Адмін
    signOut: () => supabase.auth.signOut(),
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};