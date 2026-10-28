// =====================================================================
//  K-CORE · Меню програми — один опис для бічного меню та пошуку Ctrl+K
//
//  MAIN_NAV — головне меню CRM: лише основні розділи, один рівень.
//  «Склад» і «Працівники» — окремі робочі простори зі своїм меню
//  (WorkspaceShell): зайшли на склад — працюєте зі складом, «До CRM»
//  повертає назад. Їхні розділи описані тут же (INVENTORY_SECTIONS,
//  STAFF_SECTIONS), а активний розділ — в адресі (?tab=…).
//
//  match(path)  — чи пункт активний для поточної адреси.
//  show(auth)   — кому пункт видно (за роллю з useAuth).
// =====================================================================

import {
    FaUsers, FaHandshake, FaHardHat, FaTruck, FaFolderOpen,
    FaWarehouse, FaClipboardList, FaExchangeAlt, FaShoppingCart, FaToolbox, FaTags, FaSitemap,
    FaMoneyBillWave, FaUserTie, FaCalendarAlt, FaUmbrellaBeach, FaHistory, FaTasks,
    FaUserShield, FaHome, FaSun, FaFunnelDollar, FaCoins, FaChartLine, FaShuttleVan,
} from 'react-icons/fa';
import { FIRST_PAGE } from './domain/access';

const starts = (...prefixes) => (path) => prefixes.some(p => path === p || path.startsWith(`${p}/`));

/** Чи відкритий людині CRM: офіс і адміністратори з бодай одним розділом. Монтажник — лише «Монтаж». */
export const hasCrm = (auth) => !!auth?.isOffice && Object.keys(auth.perms || {}).length > 0;

/** Головна сторінка після входу: «Сьогодні» або перший відкритий розділ; монтажник — «Монтаж». */
export const homePath = (auth) => {
    if (!hasCrm(auth)) return '/m';
    const first = FIRST_PAGE.find(([section]) => auth.can(section));
    return first ? first[1] : '/tasks';
};

// Порядок — за тим, як часто відкривають: щоденне вгорі, рідкісне внизу.
// section — розділ доступів (domain/access), що відкриває пункт
export const MAIN_NAV = [
    { key: 'today', label: 'Сьогодні', icon: FaHome, to: '/today', match: starts('/today'), section: 'today' },
    { key: 'myday', label: 'Монтаж', icon: FaSun, to: '/m', match: starts('/m'), show: (a) => !hasCrm(a) },
    { key: 'tasks', label: 'Задачі та етапи', icon: FaTasks, to: '/tasks', match: starts('/tasks'), show: hasCrm },
    { key: 'installations', label: "Об'єкти", icon: FaHardHat, to: '/installations', match: starts('/installations', '/project', '/reports'), section: 'objects' },
    { key: 'employees', label: 'Працівники', icon: FaUserTie, to: '/employees', match: starts('/employees'), show: (a) => STAFF_SECTIONS.some(s => a.can(s.section)) },
    { key: 'leads', label: 'Ліди', icon: FaFunnelDollar, to: '/leads', match: starts('/leads'), section: 'leads' },
    { key: 'clients', label: 'Клієнти', icon: FaUsers, to: '/clients', match: starts('/clients'), section: 'clients' },
    { key: 'provisioning', label: "Забезпечення об'єктів", icon: FaTruck, to: '/provisioning', match: starts('/provisioning'), section: 'provisioning' },
    { key: 'inventory', label: 'Склад', icon: FaWarehouse, to: '/inventory', match: starts('/inventory', '/products'), show: (a) => INVENTORY_SECTIONS.some(s => a.can(s.section)) },
    { key: 'payments', label: 'Платежі', icon: FaMoneyBillWave, to: '/payments', match: starts('/payments'), section: 'payments' },
    { key: 'documents', label: 'Документи', icon: FaFolderOpen, to: '/documents', match: starts('/documents'), section: 'documents' },
    { key: 'partners', label: 'Партнерство', icon: FaHandshake, to: '/partners', match: starts('/partners', '/partner-project'), section: 'partners' },
    { key: 'analytics', label: 'Аналітика', icon: FaChartLine, to: '/analytics', match: starts('/analytics'), section: 'analytics' },
    { key: 'access', label: 'Доступи', icon: FaUserShield, to: '/admin', match: (p) => p === '/admin', show: (a) => a.isOffice && (a.can('access') || a.can('settings')) },
];

/* Розділи складу. action — підпис головної кнопки в шапці (якщо є); section — розділ доступів. */
export const INVENTORY_SECTIONS = [
    { id: 'stock', label: 'Залишки', icon: FaWarehouse, title: 'Залишки та номенклатура', action: 'Додати товар', section: 'stock' },
    { id: 'issue', label: 'Видача', icon: FaClipboardList, title: 'Документи видачі', action: 'Новий документ', section: 'stock' },
    { id: 'movements', label: 'Рух товарів', icon: FaExchangeAlt, title: 'Рух товарів', action: 'Видача / Продаж', section: 'stock' },
    { id: 'purchases', label: 'Закупівлі', icon: FaShoppingCart, title: 'Закупівлі та постачання', action: 'Замовлення / Імпорт', section: 'purchases' },
    { id: 'tools', label: 'Інструмент', icon: FaToolbox, title: 'Інструмент та інвентар', action: 'Видати інвентар', section: 'stock' },
    { id: 'price', label: 'Прайс обладнання', icon: FaTags, title: 'Прайс обладнання', section: 'price' },
    { id: 'categories', label: 'Категорії', icon: FaSitemap, title: 'Категорії товарів', section: 'settings', need: 'edit' },
    { id: 'costs', label: 'Ціни закупівлі', icon: FaCoins, title: 'Ціни закупівлі', section: 'profit' },
];

/* Розділи «Працівників». */
export const STAFF_SECTIONS = [
    { id: 'team', label: 'Команда', icon: FaUsers, title: 'Команда та персонал', section: 'team' },
    { id: 'planning', label: 'Календар', icon: FaCalendarAlt, title: 'Графік робіт', section: 'schedule' },
    { id: 'fleet', label: 'Автопарк', icon: FaShuttleVan, title: 'Автопарк і власні авто', section: 'fleet' },
    { id: 'timeoff', label: 'Вихідні', icon: FaUmbrellaBeach, title: 'Вихідні та відпустки', section: 'timeoff' },
    { id: 'history', label: 'Історія', icon: FaHistory, title: 'Історія виїздів', section: 'team', need: 'edit' },
];

// Пункт видно, якщо відкритий його розділ (і CRM загалом) або так каже show()
const visible = (list, auth) => list.filter(i => {
    if (i.show) return i.show(auth);
    if (i.section) return hasCrm(auth) && auth.can(i.section, i.need || 'view');
    return true;
});

/** Пункти головного меню з урахуванням ролі */
export const mainNav = (auth) => visible(MAIN_NAV, auth);

/** Розділи робочого простору з урахуванням ролі */
export const sectionsFor = (list, auth) => visible(list, auth);

/* Сторінки, яких немає в меню, але їх можна знайти пошуком Ctrl+K */
const EXTRA_PAGES = [
    { key: 'changes', label: 'Журнал змін', icon: FaHistory, to: '/admin/changes', section: 'access', group: 'Доступи' },
    { key: 'settings', label: 'Налаштування: норми етапів, курс', icon: FaUserShield, to: '/admin?tab=settings', section: 'settings', group: 'Доступи' },
    { key: 'montazh', label: 'Монтаж — як бачить монтажник', icon: FaSun, to: '/m/me', show: (a) => a.isOffice, group: 'Працівники' },
];

/** Плоский список усіх сторінок для пошуку Ctrl+K (з назвою розділу) */
export const navItems = (auth) => [
    ...mainNav(auth).map(i => ({ ...i, group: '' })),
    ...visible(EXTRA_PAGES, auth),
    ...sectionsFor(INVENTORY_SECTIONS, auth).map(s => ({
        key: `inv-${s.id}`, label: s.label, icon: s.icon, group: 'Склад', to: `/inventory?tab=${s.id}`,
    })),
    ...sectionsFor(STAFF_SECTIONS, auth).map(s => ({
        key: `staff-${s.id}`, label: s.label, icon: s.icon, group: 'Працівники', to: `/employees?tab=${s.id}`,
    })),
];

export const ROLE_LABELS = {
    super_admin: 'Адміністратор',
    office: 'Офіс',
    installer: 'Монтажник',
};
