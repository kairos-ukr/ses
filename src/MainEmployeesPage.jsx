import React, { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { FaUserTie } from "react-icons/fa";

import { WorkspaceShell } from "./ui/shell";
import { STAFF_SECTIONS, sectionsFor } from "./navigation";
import EmployeeList from "./EmployeeList";
import WorkCalendar from "./WorkCalendar";
import TimeOffManager from "./TimeOffManager";
import EmployeeHistoryPage from "./EmployeeHistoryPage";
import FleetPage from "./pages/FleetPage";
import { useAuth } from "./AuthProvider";

// Старі розділи: «Виїзди» тепер у Календарі, «Транспорт» — це «Автопарк»
const MOVED = { visits: 'planning', transport: 'fleet' };

// «Працівники» — окремий робочий простір зі своїм меню, як і склад.
// Відкритий розділ — в адресі (?tab=…).
export default function MainEmployeesPage() {
    const auth = useAuth();
    const [params, setParams] = useSearchParams();

    const sections = useMemo(() => sectionsFor(STAFF_SECTIONS, auth), [auth]);
    const asked = MOVED[params.get('tab')] || params.get('tab');
    const activeTab = sections.some(s => s.id === asked) ? asked : (sections[0]?.id || 'team');

    return (
        <WorkspaceShell
            title="Працівники"
            icon={FaUserTie}
            sections={sections}
            active={activeTab}
            onSelect={(id) => setParams({ tab: id }, { replace: true })}
        >
            {activeTab === "team" && <EmployeeList />}
            {activeTab === "planning" && <WorkCalendar />}
            {activeTab === "fleet" && <FleetPage />}
            {activeTab === "timeoff" && <TimeOffManager />}
            {activeTab === "history" && <EmployeeHistoryPage />}
        </WorkspaceShell>
    );
}
