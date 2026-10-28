// =====================================================================
//  K-CORE · Ліди: статуси і джерела (етап 4, п.15)
//  Один список для сторінки «Ліди», «Сьогодні» й аналітики.
// =====================================================================

import { FaInbox, FaPhoneAlt, FaRulerCombined, FaCheckCircle, FaHeartBroken } from 'react-icons/fa';

export const LEAD_STATUSES = [
    { key: 'new', label: 'Новий', tone: 'info', icon: FaInbox, active: true },
    { key: 'contacted', label: 'Зв\'язались', tone: 'accent', icon: FaPhoneAlt, active: true },
    { key: 'measure', label: 'Заміри', tone: 'warn', icon: FaRulerCombined, active: true },
    { key: 'converted', label: 'Став об\'єктом', tone: 'ok', icon: FaCheckCircle },
    { key: 'lost', label: 'Відмова', tone: 'neutral', icon: FaHeartBroken },
];

export const ACTIVE_LEAD_STATUSES = LEAD_STATUSES.filter(s => s.active).map(s => s.key);

export const getLeadStatus = (key) => LEAD_STATUSES.find(s => s.key === key) || LEAD_STATUSES[0];

export const isLeadActive = (key) => ACTIVE_LEAD_STATUSES.includes(key);

/** Вільний лід — активний і ще ніхто не веде: його бачать усі й можуть узяти */
export const isLeadFree = (l) => !!l && isLeadActive(l.status) && l.responsible_emp_id == null;

/** Реклама із заявки з сайту: «facebook · Осінь-СЕС» */
export const leadAdLabel = (l) => {
    const u = l?.site_info?.utm;
    if (!u) return null;
    return [u.source || (u.click ? u.click : null), u.campaign].filter(Boolean).join(' · ') || null;
};

/** Звідки дізнались. Ключі зберігаються в базі — назви можна міняти тут. */
export const LEAD_SOURCES = [
    { key: 'site', label: 'Заявка з сайту' },   // приходять самі: supabase/functions/site-lead
    { key: 'referral', label: 'Рекомендація' },
    { key: 'repeat', label: 'Повторний клієнт' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'google', label: 'Google / сайт' },
    { key: 'ads', label: 'Реклама' },
    { key: 'partner', label: 'Партнер' },
    { key: 'other', label: 'Інше' },
];

export const getLeadSourceLabel = (key) => LEAD_SOURCES.find(s => s.key === key)?.label || (key ? key : 'Не вказано');

/** Останні 9 цифр телефону: +380 67 123 45 67 = 0671234567 */
export const phoneKey = (phone) => {
    const d = String(phone || '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : '';
};
