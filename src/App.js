import React from "react";
// Додаємо Navigate для перенаправлення
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./AuthProvider";
import { ToastProvider, ConfirmProvider } from "./ui";

import AuthPage from "./AuthPage";
// import HomePage from "./homep"; // Вже не потрібен, можеш видалити файл
import ProjectPage from "./inst2";
import ClientsPage from "./cli1";
import EmployeesPage from "./MainEmployeesPage";
import MicrotasksPage from "./microtask";
import Reports from "./rep";
import Equimpment from "./eq2";
import Payments from "./pay";
import DocMen from "./DocumentManager";
import ProjectDetailsPage from './ProjectDetailsPage';
import Admin from './AdminPanel';
import MyWorkflowDashboard from "./MyWorkflowDashboard";
import PlannedVisitsPage from "./PlannedVisitsPage";
import BaseEquipment from "./EquipmentBase.jsx"
import PartnerPage from './PartnershipPage'
import PartnerProjectDetailsPage from './PartnerProjectDetailsPage';

import CategoriesAdminPage from './pages/CategoriesAdminPage';
import NomenclaturePage from './pages/NomenclaturePage';
import PurchasesPage from './pages/PurchasesPage';
import WarehousePage from './pages/WarehousePage';
import StockMovementsPage from './pages/StockMovementsPage';
import ToolsPage from './pages/ToolsPage';
import ProvisioningPage from './pages/ProvisioningPage';
import InventoryWorkspace from './pages/InventoryWorkspace';

export default function App() {
  return (
    <AuthProvider>
     <ToastProvider>
      <ConfirmProvider>
      <Router>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          
          {/* ✅ РЕДИРЕКТ: Всі, хто потрапляє на /home, летять на /my-workflow */}
          <Route path="/home" element={<Navigate to="/my-workflow" replace />} />
          
          <Route path="/my-workflow" element={<MyWorkflowDashboard />} />
          
          <Route path="/installations" element={<ProjectPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/tasks" element={<MicrotasksPage />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/equipment" element={<Equimpment />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/documents" element={<DocMen />} />
          <Route path="/project/:id" element={<ProjectDetailsPage />} />
          <Route path="/plans" element={<PlannedVisitsPage />} />
          <Route path="/base_equip" element={<BaseEquipment />} />
          <Route path="/partners" element={<PartnerPage />} />
          <Route path="/partner-project/:id" element={<PartnerProjectDetailsPage />} />
          
          <Route path="/admin/categories" element={<CategoriesAdminPage />} />
          <Route path="/inventory" element={<InventoryWorkspace />} />
          <Route path="/products" element={<NomenclaturePage />} />
          <Route path="/purchases" element={<PurchasesPage />} />
          <Route path="/warehouse" element={<WarehousePage />} />
          <Route path="/movement" element={<StockMovementsPage />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/provisioning" element={<ProvisioningPage />} />
          
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </Router>
      </ConfirmProvider>
     </ToastProvider>
    </AuthProvider>
  );
}