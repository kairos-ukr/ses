// =====================================================================
//  K-CORE · Налаштування (вкладка в «Доступах»)
//
//  • Поточний курс долара — для нових угод; у кожної угоди свій (UsdRateEditor).
//  • Забезпечення — чи система сама створює нагадування й заявки
//    (SupplyAutomation).
//  • Бригадам: що взяти з собою — нагадування разом із графіком і
//    зранку, кому (TakeReminders).
//  • Звіти бригад: нагадування бригаді, менеджеру — звіт надіслано,
//    вечірнє зведення (ReportReminders).
//  • Графік: з котрої години головним стає завтрашній день
//    (DaySwitchSetting).
//  Норми етапів прибрано 02.11.2026: «вік» на етапі тепер скрізь за
//  загальним правилом — понад 14 днів жовтий, понад 30 червоний.
// =====================================================================

import React from 'react';
import UsdRateEditor from './UsdRateEditor';
import SupplyAutomation from './SupplyAutomation';
import TakeReminders from './TakeReminders';
import ReportReminders from './ReportReminders';
import DaySwitchSetting from './DaySwitchSetting';

export default function SettingsPanel() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <UsdRateEditor />
            <SupplyAutomation />
            <TakeReminders />
            <ReportReminders />
            <DaySwitchSetting />
        </div>
    );
}
