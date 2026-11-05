// =====================================================================
//  K-CORE · Монтаж · «Я» → Сповіщення
//
//  Щоб нагадування про звіт, графік і «Взяти з собою» справді доходили:
//   • на цьому телефоні — увімкнути сповіщення (пуш), перевірити, вимкнути;
//   • Telegram — чи підключено; якщо ні — кнопка на бота компанії
//     (назву бот сам записує в налаштування, app_settings.telegram_bot):
//     там Start → «Поділитися номером», і бот знайде людину за телефоном.
//  У перегляді «як інша людина» лише показуємо стан — кнопки не для офісу.
// =====================================================================

import React, { useEffect, useState } from 'react';
import { FaBell, FaTelegramPlane, FaCheck } from 'react-icons/fa';

import { supabase } from '../supabaseClient';
import { usePushDevice } from '../ui/PushPrompt';
import { getSetting } from '../utils/settings';
import { Card, Label, Pill, Big } from './kit';

export default function NotifyCard({ who, canWrite }) {
    const push = usePushDevice();
    const [tg, setTg] = useState(null);         // null — ще не знаємо, true / false
    const [bot, setBot] = useState(null);       // назва бота компанії

    useEffect(() => {
        let alive = true;
        Promise.all([
            supabase.from('employees').select('telegram_user_id').eq('id', who.id).maybeSingle(),
            getSetting('telegram_bot').catch(() => null),
        ]).then(([e, b]) => {
            if (!alive) return;
            setTg(!!e.data?.telegram_user_id);
            setBot(b?.username || null);
        });
        return () => { alive = false; };
    }, [who.id]);

    const pushOn = push.state === 'granted' && push.subscribed;
    const pushText = push.state === 'unsupported' ? 'Цей браузер не вміє показувати сповіщення'
        : push.state === 'ios-install' ? 'На iPhone — спершу встановіть K-Core на головний екран (нижче), тоді відкрийте з іконки'
            : push.state === 'denied' ? 'Заблоковано в налаштуваннях телефона — дозвольте сповіщення для цього сайту'
                : pushOn ? 'Нагадування про звіт, графік і що взяти з собою приходять на цей телефон'
                    : 'Без цього нагадування про звіт і графік видно лише тут, у додатку';

    // Пуш стосується телефона, з якого дивляться; у перегляді «як інша людина» — не показуємо
    const showPush = canWrite;

    return (
        <Card>
            <Label icon={FaBell} right={(showPush && pushOn) || tg ? <Pill tone="ok">працює</Pill> : <Pill tone="warn">вимкнено</Pill>}>Сповіщення</Label>

            {showPush && <div className="py-1">
                <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-slate-900 flex-1">На цьому телефоні</span>
                    {pushOn && <Pill tone="ok"><FaCheck size={9} /> увімкнено</Pill>}
                </div>
                <p className="text-[13.5px] text-slate-600 mt-0.5">{pushText}</p>
                {canWrite && (push.state === 'default' || (push.state === 'granted' && !push.subscribed)) && (
                    <Big small tone="main" className="mt-2" onClick={push.enable} disabled={push.busy}>Увімкнути сповіщення</Big>
                )}
                {canWrite && pushOn && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <Big small tone="soft" onClick={push.test}>Пробне</Big>
                        <Big small tone="soft" onClick={push.disable} disabled={push.busy}>Вимкнути</Big>
                    </div>
                )}
            </div>}

            <div className={showPush ? 'pt-2.5 mt-2.5 border-t border-slate-100' : ''}>
                <div className="flex items-center gap-2">
                    <FaTelegramPlane size={15} className="text-sky-500 flex-shrink-0" />
                    <span className="text-[15px] font-bold text-slate-900 flex-1">Telegram</span>
                    {tg === true && <Pill tone="ok"><FaCheck size={9} /> підключено</Pill>}
                    {tg === false && <Pill>не підключено</Pill>}
                </div>
                {tg === false && (<>
                    <p className="text-[13.5px] text-slate-600 mt-0.5">
                        Відкрийте бота компанії, натисніть Start і «Поділитися номером» — бот знайде вас за телефоном.
                    </p>
                    {canWrite && bot && (
                        <Big small tone="dark" icon={FaTelegramPlane} className="mt-2" href={`https://t.me/${bot}?start=connect`}>
                            Підключити Telegram
                        </Big>
                    )}
                </>)}
            </div>
        </Card>
    );
}
