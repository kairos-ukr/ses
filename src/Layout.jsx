import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  FaBars, FaTimes, FaHome, FaUsers, FaUserTie, 
  FaTasks, FaCog, FaFolderOpen, FaSignOutAlt,
  FaHardHat, FaMoneyBillWave 
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

// ЗМІНА 1: Імпортуємо useAuth замість supabase
import { useAuth } from './AuthProvider'; 

import logo from './logoCore1.png'; 

const Layout = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  
  // ЗМІНА 2: Дістаємо функцію signOut з контексту
  const { signOut } = useAuth();

  // ЗМІНА 3: Використовуємо функцію з "хаком"
  const handleLogout = async () => {
    await signOut();
    // navigate("/") тут вже не потрібен, бо signOut зробить редірект через window.location
  };

  const menuItems = [
      { path: '/home', label: 'Головна', icon: FaHome },
      { path: '/clients', label: 'Клієнти', icon: FaUsers },
      { path: '/installations', label: "Об'єкти", icon: FaHardHat },
      { path: '/employees', label: 'Працівники', icon: FaUserTie },
      { path: '/tasks', label: 'Задачі', icon: FaTasks },
      { path: '/equipment', label: 'Обладнання', icon: FaCog },
      { path: '/payments', label: 'Платежі', icon: FaMoneyBillWave },
      { path: '/documents', label: 'Документи', icon: FaFolderOpen },
  ];

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 overflow-hidden">
      
      {/* --- SIDEBAR (DESKTOP) --- */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 h-full flex-shrink-0 z-20">
        <div className="p-6 flex items-center justify-start border-b border-slate-100 min-h-[80px]">
           <img 
             src={logo} 
             alt="K-Core" 
             className="h-12 w-auto object-contain transition-all hover:scale-105" 
           />
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
           {menuItems.map(item => {
             const isActive = location.pathname.startsWith(item.path);
             return (
               <button 
                 key={item.path}
                 onClick={() => navigate(item.path)}
                 className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm
                   ${isActive 
                     ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                     : 'text-slate-500 hover:bg-slate-50 hover:text-indigo-600'}
                 `}
               >
                 <item.icon className={isActive ? 'text-white' : 'text-slate-400'} size={18} /> 
                 {item.label}
               </button>
             );
           })}
        </nav>

        <div className="p-4 border-t border-slate-100">
            {/* Кнопка виходу тепер викликає handleLogout з хаком */}
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all w-full text-sm font-medium">
                <FaSignOutAlt /> Вихід
            </button>
        </div>
      </aside>

      {/* --- MOBILE MENU OVERLAY --- */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            />
            
            <motion.div 
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.3 }}
              className="fixed inset-y-0 right-0 z-50 w-72 bg-white shadow-2xl flex flex-col lg:hidden will-change-transform"
            >
              <div className="p-5 flex justify-between items-center border-b border-slate-100 min-h-[80px]">
                 <img src={logo} alt="K-Core" className="h-9 w-auto object-contain" />
                 <button onClick={() => setIsOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-600">
                    <FaTimes size={20}/>
                 </button>
              </div>
              
              <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                 {menuItems.map(item => {
                   const isActive = location.pathname.startsWith(item.path);
                   return (
                     <button 
                       key={item.path}
                       onClick={() => { navigate(item.path); setIsOpen(false); }}
                       className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-medium text-sm transition-colors
                         ${isActive 
                           ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' 
                           : 'text-slate-600 hover:bg-slate-50'}
                       `}
                     >
                       <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-400'} /> 
                       {item.label}
                     </button>
                   )
                 })}
              </nav>

              <div className="p-4 border-t border-slate-100 bg-slate-50 pb-safe">
                  {/* Кнопка виходу мобільна */}
                  <button onClick={() => { handleLogout(); setIsOpen(false); }} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-red-500 rounded-xl font-bold shadow-sm active:scale-95 transition-all">
                      <FaSignOutAlt /> Вийти
                  </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="lg:hidden flex items-center justify-between px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0 z-30 min-h-[64px]">
           <img 
             src={logo} 
             alt="K-Core" 
             className="h-8 w-auto object-contain" 
           />
           <button onClick={() => setIsOpen(true)} className="p-2.5 -mr-2 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition-colors border border-slate-100">
             <FaBars size={22} />
           </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-100 w-full relative scroll-smooth">
           {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;