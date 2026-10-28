// =====================================================================
//  K-CORE · Стан інтернету
//
//  Поки звʼязку немає — зверху висить помітна плашка, щоб людина на
//  обʼєкті не натискала «Зберегти» навмання і не думала, що все пішло.
//  Коли звʼязок повертається — коротко показуємо «Звʼязок відновлено».
// =====================================================================

import React, { useEffect, useState } from 'react';
import { FaWifi } from 'react-icons/fa';

const isOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export default function ConnectionStatus() {
  const [online, setOnline] = useState(isOnline);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let timer;
    const goOffline = () => { clearTimeout(timer); setRestored(false); setOnline(false); };
    const goOnline = () => {
      setOnline(true);
      setRestored(true);
      clearTimeout(timer);
      timer = setTimeout(() => setRestored(false), 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !restored) return null;

  // У «Монтажі» звіт і фото без зв'язку чекають на телефоні — так і кажемо
  const montazh = typeof window !== 'undefined' && /^#\/m(\/|$|\?)/.test(window.location.hash);
  const offlineText = montazh ? 'Немає інтернету — звіт чекатиме на телефоні' : 'Немає інтернету — зміни не збережуться';

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-[300] pointer-events-none px-3 flex justify-center"
      style={{ top: 'max(8px, env(safe-area-inset-top))' }}
    >
      <div className={`flex items-center gap-2 px-3.5 py-2 rounded-full shadow-lg text-[13px] font-bold text-white ${online ? 'bg-emerald-600' : 'bg-slate-900'}`}>
        <span className="relative shrink-0">
          <FaWifi size={13} className={online ? '' : 'opacity-60'} />
          {!online && <span className="absolute -inset-0.5 flex items-center justify-center"><span className="block w-[18px] h-[2px] bg-rose-400 rotate-45 rounded" /></span>}
        </span>
        <span className="leading-tight">{online ? 'Звʼязок відновлено' : offlineText}</span>
      </div>
    </div>
  );
}
