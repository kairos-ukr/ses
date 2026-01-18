import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./AuthProvider"; 

import AuthPage from "./AuthPage";
import HomePage from "./homep";
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
import Bulder from "./build.jsx"

export default function App() {
  return (
    // 2. Обгортаємо весь додаток. Тепер "userRole" буде доступний на кожній сторінці.
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/installations" element={<ProjectPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/employees" element={<EmployeesPage />} />
          <Route path="/tasks" element={<MicrotasksPage />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/equipment" element={<Equimpment />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/documents" element={<DocMen />} />
          <Route path="/project/:id" element={<ProjectDetailsPage />} />
          {/* Пізніше ми захистимо цей маршрут, щоб сюди не міг зайти монтажник */}
          <Route path="/admin" element={<Admin />} />
          <Route path="/bild" element={<Bulder />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}