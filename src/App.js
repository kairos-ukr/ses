import React, { Suspense, lazy } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthProvider";
import { ToastProvider, ConfirmProvider } from "./ui";
import AccessGate, { RequireAccess } from "./AccessGate";
import { SearchHost } from "./CommandPalette";
import { homePath } from "./navigation";
import ConnectionStatus from "./ui/ConnectionStatus";
import PushPrompt from "./ui/PushPrompt";

import AuthPage from "./AuthPage";

// =====================================================================
//  Сторінки вантажаться частинами — лише коли їх відкривають. Раніше вся
//  програма (~670 КБ) йшла одним файлом ще до першого екрана, що на
//  телефоні з мобільним інтернетом помітно гальмувало.
//  Найчастіші сторінки браузер підтягує заздалегідь у вільну хвилину
//  (webpackPrefetch), тож перехід на них миттєвий.
// =====================================================================

const RELOAD_KEY = 'kcore.chunkReload';

/** Без інтернету чекаємо на звʼязок і пробуємо ще раз — інакше перезавантаження показало б порожній екран браузера */
const whenOnline = (load) => new Promise((resolve, reject) => {
  window.addEventListener('online', () => load().then(resolve, reject), { once: true });
});

/** Після оновлення програми старих частин уже немає — перезавантажуємо сторінку один раз */
const lazyPage = (load) => lazy(() => load()
  .then((m) => { try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* немає сховища */ } return m; })
  .catch((err) => {
    if (navigator.onLine === false) return whenOnline(load);
    let reloaded = false;
    try { reloaded = !!sessionStorage.getItem(RELOAD_KEY); sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* немає сховища */ }
    if (!reloaded) { window.location.reload(); return new Promise(() => {}); }
    throw err;
  }));

const TodayPage = lazyPage(() => import(/* webpackPrefetch: true */ './TodayPage'));
// Окрема проста частина для монтажників — «K-Core Монтаж» (/m)
const MontazhApp = lazyPage(() => import(/* webpackPrefetch: true */ './montazh/MontazhApp'));
const ProjectPage = lazyPage(() => import(/* webpackPrefetch: true */ './inst2'));
const ProjectDetailsPage = lazyPage(() => import(/* webpackPrefetch: true */ './ProjectDetailsPage'));
const ClientsPage = lazyPage(() => import('./cli1'));
const ClientDetailsPage = lazyPage(() => import('./ClientDetailsPage'));
const EmployeesPage = lazyPage(() => import('./MainEmployeesPage'));
const MicrotasksPage = lazyPage(() => import(/* webpackPrefetch: true */ './microtask'));
const Reports = lazyPage(() => import('./rep'));
const Equimpment = lazyPage(() => import('./eq2'));
const Payments = lazyPage(() => import('./pay'));
const DocMen = lazyPage(() => import('./DocumentManager'));
const Admin = lazyPage(() => import('./AdminPanel'));
const PartnerPage = lazyPage(() => import('./PartnershipPage'));
const PartnerProjectDetailsPage = lazyPage(() => import('./PartnerProjectDetailsPage'));
const NomenclaturePage = lazyPage(() => import('./pages/NomenclaturePage'));
const ProvisioningPage = lazyPage(() => import('./pages/ProvisioningPage'));
const InventoryWorkspace = lazyPage(() => import('./pages/InventoryWorkspace'));
const LeadsPage = lazyPage(() => import('./LeadsPage'));
const AnalyticsPage = lazyPage(() => import('./AnalyticsPage'));
const ChangeLogPage = lazyPage(() => import('./ChangeLogPage'));
const BrigadeReportsPage = lazyPage(() => import('./BrigadeReportsPage'));

/** Поки частина сторінки вантажиться — тихий індикатор, а не біла сторінка */
const PageLoader = () => (
  <div className="h-[100dvh] w-full flex items-center justify-center bg-slate-100">
    <span className="w-7 h-7 border-[3px] border-slate-300 border-t-indigo-500 rounded-full animate-spin" />
  </div>
);

// Головна після входу залежить від ролі: офіс — «Сьогодні», монтажник — «Монтаж»
const HomeRedirect = () => <Navigate to={homePath(useAuth())} replace />;

export default function App() {
  return (
    <AuthProvider>
     <ToastProvider>
      <ConfirmProvider>
      <ConnectionStatus />
      <Router>
       {/* Без входу — на сторінку входу; без підтвердження — екран очікування */}
       <AccessGate>
        <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          
          <Route path="/home" element={<HomeRedirect />} />
          {/* Кожна сторінка CRM — за доступами (Доступи → шаблони й люди) */}
          <Route path="/today" element={<RequireAccess section="today"><TodayPage /></RequireAccess>} />
          <Route path="/m/*" element={<MontazhApp />} />
          {/* «Мій день» замінила частина «Монтаж» */}
          <Route path="/my-day" element={<Navigate to="/m" replace />} />
          <Route path="/admin/changes" element={<RequireAccess section="access"><ChangeLogPage /></RequireAccess>} />
          <Route path="/analytics" element={<RequireAccess section="analytics"><AnalyticsPage /></RequireAccess>} />
          <Route path="/leads" element={<RequireAccess section="leads"><LeadsPage /></RequireAccess>} />
          {/* Окремої сторінки звітів немає — стара адреса веде в картку об'єкта */}
          <Route path="/brigade-reports" element={<RequireAccess section="objects"><BrigadeReportsPage /></RequireAccess>} />

          {/* «Мої етапи» тепер вкладка «Етапи» в «Задачах» */}
          <Route path="/my-workflow" element={<Navigate to="/tasks?tab=stages" replace />} />

          <Route path="/installations" element={<RequireAccess section="objects"><ProjectPage /></RequireAccess>} />
          <Route path="/clients" element={<RequireAccess section="clients"><ClientsPage /></RequireAccess>} />
          <Route path="/clients/:id" element={<RequireAccess section="clients"><ClientDetailsPage /></RequireAccess>} />
          <Route path="/employees" element={<RequireAccess any={['team', 'schedule', 'fleet', 'timeoff']}><EmployeesPage /></RequireAccess>} />
          {/* Свої задачі й етапи — у кожного, хто працює в CRM */}
          <Route path="/tasks" element={<RequireAccess><MicrotasksPage /></RequireAccess>} />
          <Route path="/reports" element={<RequireAccess section="objects"><Reports /></RequireAccess>} />
          <Route path="/equipment" element={<RequireAccess section="objects"><Equimpment /></RequireAccess>} />
          <Route path="/payments" element={<RequireAccess section="payments"><Payments /></RequireAccess>} />
          <Route path="/documents" element={<RequireAccess section="documents"><DocMen /></RequireAccess>} />
          <Route path="/project/:id" element={<RequireAccess section="objects"><ProjectDetailsPage /></RequireAccess>} />
          {/* Старі окремі адреси — тепер розділи «Працівників» і «Складу» */}
          <Route path="/plans" element={<Navigate to="/employees?tab=planning" replace />} />
          <Route path="/base_equip" element={<Navigate to="/inventory?tab=price" replace />} />
          <Route path="/partners" element={<RequireAccess section="partners"><PartnerPage /></RequireAccess>} />
          <Route path="/partner-project/:id" element={<RequireAccess section="partners"><PartnerProjectDetailsPage /></RequireAccess>} />

          <Route path="/admin/categories" element={<Navigate to="/inventory?tab=categories" replace />} />
          <Route path="/inventory" element={<RequireAccess any={['stock', 'purchases', 'price', 'profit']}><InventoryWorkspace /></RequireAccess>} />
          <Route path="/products" element={<RequireAccess section="stock"><NomenclaturePage /></RequireAccess>} />
          <Route path="/purchases" element={<Navigate to="/inventory?tab=purchases" replace />} />
          <Route path="/warehouse" element={<Navigate to="/inventory?tab=stock" replace />} />
          <Route path="/movement" element={<Navigate to="/inventory?tab=movements" replace />} />
          <Route path="/tools" element={<Navigate to="/inventory?tab=tools" replace />} />
          <Route path="/provisioning" element={<RequireAccess section="provisioning"><ProvisioningPage /></RequireAccess>} />

          <Route path="/admin" element={<RequireAccess any={['access', 'settings']}><Admin /></RequireAccess>} />
        </Routes>
        </Suspense>
        <SearchHost />
        {/* Запит на пуш-сповіщення після входу (плашка, не вікно) */}
        <PushPrompt />
       </AccessGate>
      </Router>
      </ConfirmProvider>
     </ToastProvider>
    </AuthProvider>
  );
}