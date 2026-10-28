// =====================================================================
//  K-CORE · Оболонка CRM: головне бічне меню
//
//  Меню одного рівня — лише основні розділи (navigation.js). «Склад» і
//  «Працівники» відкриваються окремими робочими просторами зі своїм
//  меню (ui/shell.jsx), тож тут вони — один пункт. Пошук Ctrl+K живе
//  на рівні всієї програми (SearchHost у App.js).
// =====================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaSignOutAlt, FaSearch, FaUserTie } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

import { useAuth } from './AuthProvider';
import { pendingRegistrationsCount, REGISTRATIONS_CHANGED } from './utils/registrations';
import { mainNav, ROLE_LABELS } from './navigation';
import { openSearch } from './CommandPalette';
import { SideNavItem, SideSearchButton, HeaderIconBtn } from './ui/shell';
import NotificationBell from './NotificationBell';
import logo from './logoCore1.webp';


const Layout = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const { signOut, isAdmin, employee, role } = auth;

  const [mobileOpen, setMobileOpen] = useState(false);

  // Скільки нових акаунтів чекають на підтвердження — лише для адміністраторів
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    const refresh = () => pendingRegistrationsCount().then(n => { if (alive) setPendingCount(n); });
    refresh();
    window.addEventListener(REGISTRATIONS_CHANGED, refresh);
    return () => { alive = false; window.removeEventListener(REGISTRATIONS_CHANGED, refresh); };
  }, [isAdmin, location.pathname]);

  const items = mainNav(auth);
  const go = useCallback((to) => { navigate(to); setMobileOpen(false); }, [navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate('/', { replace: true });
  };

  const renderNav = () => (
    <nav className="flex-1 overflow-y-auto custom-scrollbar px-3 py-2.5 space-y-0.5">
      {items.map(item => (
        <SideNavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          active={item.match(location.pathname)}
          badge={item.key === 'access' ? pendingCount : 0}
          onClick={() => go(item.to)}
        />
      ))}
    </nav>
  );

  const renderUser = () => (
    <div className="border-t border-slate-100 p-3 flex items-center gap-2.5">
      <span className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center text-[12px] font-bold flex-shrink-0">
        <FaUserTie size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-slate-800 truncate">{employee?.name || '—'}</div>
        <div className="text-[12px] text-slate-400 truncate">{ROLE_LABELS[role] || ''}</div>
      </div>
      <button
        onClick={handleLogout}
        title="Вийти"
        aria-label="Вийти"
        className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-shrink-0"
      >
        <FaSignOutAlt size={15} />
      </button>
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full bg-slate-50 overflow-hidden">

      {/* --- SIDEBAR (DESKTOP) --- */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 h-full flex-shrink-0 z-20">
        <div className="px-5 flex items-center border-b border-slate-100 min-h-[64px]">
          <img src={logo} alt="K-Core" className="h-10 w-auto object-contain" />
        </div>
        <div className="px-3 pt-3 flex gap-2">
          <div className="flex-1 min-w-0"><SideSearchButton onClick={openSearch} /></div>
          <NotificationBell variant="side" />
        </div>
        {renderNav()}
        {renderUser()}
      </aside>

      {/* --- MOBILE MENU --- */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'tween', ease: 'easeOut', duration: 0.25 }}
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-white shadow-2xl flex flex-col lg:hidden will-change-transform pt-safe"
            >
              <div className="px-4 flex justify-between items-center border-b border-slate-100 min-h-[64px]">
                <img src={logo} alt="K-Core" className="h-8 w-auto object-contain" />
                <HeaderIconBtn icon={FaTimes} label="Закрити меню" onClick={() => setMobileOpen(false)} />
              </div>
              <div className="px-3 pt-3"><SideSearchButton onClick={() => { setMobileOpen(false); openSearch(); }} /></div>
              {renderNav()}
              <div className="pb-safe">{renderUser()}</div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* --- MAIN CONTENT --- */}
      <div className="flex-1 flex flex-col min-w-0 relative h-full">
        <header className="lg:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 flex-shrink-0 z-30 min-h-[56px] pt-safe">
          <HeaderIconBtn icon={FaBars} label="Меню" onClick={() => setMobileOpen(true)} />
          <img src={logo} alt="K-Core" className="h-7 w-auto object-contain" />
          <span className="ml-auto flex items-center">
            <NotificationBell variant="header" />
            <HeaderIconBtn icon={FaSearch} label="Пошук" onClick={openSearch} />
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-100 w-full relative scroll-smooth">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
