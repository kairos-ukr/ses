// =====================================================================
//  K-CORE · Монтаж · «Автопарк» (Я → Автопарк)
//
//  Для тих, кому дали окреме право «Витрати на авто» (напр. Василю
//  Гонті): ТО й ремонти по кожному авто (запчастини й робота окремо),
//  пальне з чеками від водіїв, аналітика за місяць. Той самий блок, що
//  й у CRM (pages/fleet/VehicleCosts). Без права — сюди не потрапити.
// =====================================================================

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaArrowLeft } from 'react-icons/fa';

import { useAuth } from '../AuthProvider';
import { useMontazh } from './data';
import { Screen, Card, Empty } from './kit';
import VehicleCosts from '../pages/fleet/VehicleCosts';

export default function FleetScreen() {
    const { can } = useAuth();
    const { me, canWrite } = useMontazh();
    const navigate = useNavigate();
    const back = (
        <button type="button" onClick={() => navigate('/m/me')} aria-label="Назад"
            className="h-11 w-11 rounded-xl border-2 border-slate-300 bg-white flex items-center justify-center text-slate-700 flex-shrink-0">
            <FaArrowLeft size={14} />
        </button>
    );

    if (!can('fleet_costs')) {
        return (
            <Screen title="Автопарк" right={back}>
                <Card><Empty>Немає доступу. Його дає адміністратор у «Доступах».</Empty></Card>
            </Screen>
        );
    }
    return (
        <Screen title="Автопарк" sub="ТО, пальне, витрати" right={back}>
            <VehicleCosts me={me}
                can={{ add: canWrite && can('fleet_costs', 'add'), edit: canWrite && can('fleet_costs', 'edit'), delete: canWrite && can('fleet_costs', 'delete') }} />
        </Screen>
    );
}
