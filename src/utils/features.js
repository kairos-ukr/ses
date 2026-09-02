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
