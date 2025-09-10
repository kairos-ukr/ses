import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./AuthPage";
import HomePage from "./hp";
import SolCalc from "./sol_calc";
import PhotoUploadSite from "./Ocr";
import ProjectPage from "./inst2";
import ClientsPage from "./cli1";
import EmployeesPage from "./empNORM";
import MicrotasksPage from "./microtask";
import Das from "./rep"
import Equimpment from "./eq2"
import Payments from "./pay"
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/calc" element={<SolCalc />} />
        <Route path="/vis" element={<PhotoUploadSite />} />
        <Route path="/installations" element={<ProjectPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/employ" element={<EmployeesPage />} />
        <Route path="/tasks" element={<MicrotasksPage />} />
        <Route path="/dash" element={<Das />} />
        <Route path="/equipment" element={<Equimpment />} />
        <Route path="/payments" element={<Payments />} />
      </Routes>
    </Router>
  );
}
