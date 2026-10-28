// =====================================================================
//  Виявлення можливостей, які залежать від стану бази.
//
//  Частина функціоналу приїжджає в код раніше, ніж у боєву БД
//  виконують міграцію. Замість того, щоб ламати сторінку помилкою
//  «column does not exist», інтерфейс просто не показує ту частину,
//  для якої в базі ще немає полів — і сам вмикає її після міграції.
//
//  Перевірка робиться один раз за сесію і кешується.
// =====================================================================

import { supabase } from '../supabaseClient';

const cache = new Map();

/**
 * Чи є в таблиці задана колонка. Один легкий запит на одну колонку.
 * Помилка = колонки немає (або немає доступу) → можливість вимкнена.
 */
const hasColumn = async (table, column) => {
    const key = `${table}.${column}`;
    if (cache.has(key)) return cache.get(key);

    const probe = supabase.from(table).select(column).limit(1)
        .then(({ error }) => {
            const ok = !error;
            cache.set(key, ok);
            return ok;
        })
        .catch(() => {
            cache.set(key, false);
            return false;
        });

    // Кешуємо саме проміс, щоб паралельні виклики не робили два запити
    cache.set(key, probe);
    return probe;
};

/**
 * Поштучний облік носіїв (бухти, барабани, рулони).
 * Вмикається після міграції db/2026-09_stock_lots.sql, блоки A–I.
 */
export const hasLotTracking = () => hasColumn('nomenclature', 'tracking_mode');

/**
 * Документи видачі (листи комплектації).
 * Вмикається після міграції db/2026-09_issue_orders.sql.
 */
export const hasIssueOrders = () => hasColumn('issue_orders', 'doc_number');

/**
 * Оцифрована комерційна пропозиція.
 * Вмикається після міграції db/2026-09_commercial_offers.sql.
 */
export const hasCommercialOffers = () => hasColumn('commercial_offers', 'total_amount');

/**
 * Перенесення обладнання з КП у потребу об'єкта.
 * Вмикається після міграції db/2026-09_offer_to_need.sql.
 */
export const hasOfferNeed = () => hasColumn('commercial_offer_items', 'need_role');

/**
 * Мінімальні залишки, архів позицій і обʼєднання дублікатів.
 * Вмикається після міграції db/2026-09_stock_rules_and_alerts.sql.
 */
export const hasStockRules = () => hasColumn('nomenclature', 'min_stock');

/**
 * Нагадування забезпечення (електрозахист) і автоматичні заявки.
 * Вмикається після тієї самої міграції.
 */
export const hasSupplyAlerts = () => hasColumn('supply_alerts', 'kind');

/**
 * Відповідальні за нагадування і Telegram ID працівників — для бота.
 * Вмикається після міграції db/2026-09_supply_alerts_bot_ready.sql.
 */
export const hasAlertAssignees = () => hasColumn('supply_alerts', 'assigned_to');
export const hasTelegramIds = () => hasColumn('employees', 'telegram_user_id');

/**
 * Хто що отримує від бота особисто (низькі залишки, системні).
 * Вмикається після міграції db/2026-09_bot_personal_notifications.sql.
 */
export const hasNotificationSubscriptions = () => hasColumn('notification_subscriptions', 'topic');

/**
 * Відхилення нових реєстрацій (кнопка «Відхилити» в «Доступах»).
 * Вмикається після міграції db/2026-10_registration_review.sql.
 * Підтвердження працює й без неї.
 */
export const hasRegistrationReview = () => hasColumn('user_site', 'rejected_at');

/**
 * Блокування доступу працівника (кнопка в «Доступах»).
 * Вмикається після міграції db/2026-10_access_blocking.sql.
 */
export const hasAccessBlocking = () => hasColumn('employees', 'access_blocked_at');

/**
 * Статус «Втрачено» з причиною.
 * Вмикається після міграції db/2026-10_lost_deals.sql.
 */
export const hasLostDeals = () => hasColumn('installations', 'lost_reason');

/**
 * Валюта об'єкта і платежів, «оплачено» з платежів.
 * Вмикається після міграції db/2026-10_money_currency_payments.sql.
 */
export const hasMoneyCurrency = () => hasColumn('installations', 'currency');

/**
 * Об'єднання дублікатів клієнтів (кнопка «Дублікати» на сторінці «Клієнти»).
 * Вмикається після міграції db/2026-10_client_merge.sql.
 */
export const hasClientMerge = () => hasColumn('client_merges', 'source_custom_id');

/**
 * Один довідник обладнання: обладнання на об'єктах і прайс беруться зі складської номенклатури.
 * Вмикається після міграції db/2026-10_single_equipment_catalog.sql.
 */
export const hasSingleEquipmentCatalog = () => hasColumn('installed_equipment', 'nomenclature_id');

/**
 * Список «Борги» (v_receivables). Сам графік платежів у програмі більше
 * не показується (прибрали 21.10.2026), таблиця лишилась порожньою.
 * Вмикається після міграції db/2026-10_payment_schedule.sql.
 */
export const hasPaymentSchedule = () => hasColumn('payment_schedule', 'due_date');

/**
 * Ліди (облік з першого дзвінка) і норма днів на етап.
 * Вмикаються після міграцій db/2026-10_leads.sql і db/2026-10_stage_norms.sql.
 */
export const hasLeads = () => hasColumn('leads', 'next_action_at');

/**
 * Заявки з сайту і «Взяти в роботу» (хто і коли взяв лід).
 * Вмикається після міграції db/2026-10_site_leads.sql.
 */
export const hasLeadTaking = () => hasColumn('leads', 'taken_at');

/**
 * Дзвіночок сповіщень у програмі.
 * Вмикається після міграції db/2026-10_app_notifications.sql.
 */
export const hasNotifications = () => hasColumn('app_notifications', 'read_at');

/**
 * Журнал змін (хто, коли і що змінив).
 * Вмикається після міграції db/2026-10_change_log.sql.
 */
export const hasChangeLog = () => hasColumn('change_log', 'changes');
