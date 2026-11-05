// =====================================================================
//  K-CORE · Графік: коли головним стає завтра
//
//  До цієї години на «Сьогодні» в офісі й у «Монтажі» головний —
//  сьогоднішній графік, з неї — завтрашній (куди їдемо, з ким, що
//  взяти). Власник 04.11: «максимум до 19». Значення —
//  app_settings.day_switch (utils/settings → useEvening).
// =====================================================================

import React, { useEffect, useState } from 'react';
import { FaCalendarDay } from 'react-icons/fa';

import { useAuth } from '../AuthProvider';
import { T, Tip, useToast, humanError } from '../ui';
import { useDaySwitch, saveDaySwitch, minutesOf } from '../utils/settings';

export default function DaySwitchSetting() {
    const auth = useAuth();
    const toast = useToast();
    const time = useDaySwitch();
    const [value, setValue] = useState(time);
    const [busy, setBusy] = useState(false);
    const canEdit = auth.can('settings', 'edit');

    useEffect(() => { setValue(time); }, [time]);

    const save = async () => {
        if (value === time) return;
        if (minutesOf(value) == null) { setValue(time); return; }
        setBusy(true);
        try {
            await saveDaySwitch(value, auth.employee?.id);
            toast(`Завтрашній графік стає головним о ${value}`, 'success');
        } catch (e) {
            toast(humanError(e), 'error');
            setValue(time);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`${T.card} overflow-hidden`}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <h2 className="text-[15px] font-bold text-slate-900 inline-flex items-center gap-2">
                    <FaCalendarDay size={13} className="text-indigo-500" /> Графік: коли показувати завтра
                </h2>
                <Tip text="До цієї години на «Сьогодні» в офісі й у «Монтажі» головний — сьогоднішній графік, з неї — завтрашній: куди їдемо, з ким, на чому і що взяти. Звіт за сьогодні бригада може надіслати до півночі." />
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-[14px] font-semibold text-slate-900 mr-auto">Завтрашній графік стає головним о</span>
                <input type="time" className={`${T.input} !w-[110px] !h-9`} value={value || ''} disabled={!canEdit || busy}
                    aria-label="Година, з якої головний — завтрашній графік"
                    onChange={e => setValue(e.target.value)}
                    onBlur={save}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            </div>
        </div>
    );
}
