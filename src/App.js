import React from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import AuthPage from "./AuthPage";
import HomePage from "./homep";
import SolCalc from "./sol_calc";
import PhotoUploadSite from "./Ocr";
import ProjectPage from "./inst2";
import ClientsPage from "./cli1";
import EmployeesPage from "./MainEmployeesPage";
import MicrotasksPage from "./microtask";
import Reports from "./rep"
import Equimpment from "./eq2"
import Payments from "./pay"
import Calculate from "./calc"
import DocMen from "./DocumentManager"
import ProjectDetailsPage from './ProjectDetailsPage';


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
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/tasks" element={<MicrotasksPage />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/equipment" element={<Equimpment />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/calculate" element={<Calculate />} />
        <Route path="/documents" element={<DocMen />} />
        <Route path="/project/:id" element={<ProjectDetailsPage />} />
      </Routes>
    </Router>
  );
}
