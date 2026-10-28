// =====================================================================
//  Нові реєстрації.
//
//  Людина реєструється сама на сторінці входу — з'являється рядок у
//  user_site. Доступу до CRM вона не має, доки адміністратор не
//  прив'яже акаунт до працівника (employees.user_id): наявного або
//  щойно створеного. «Відхилені» — реєстрації, які адміністратор
//  свідомо не підтвердив (колонка user_site.rejected_at, після міграції
//  db/2026-10_registration_review.sql).
// =====================================================================

import { supabase } from '../supabaseClient';

export const registrationName = (r) =>
    [r?.first_name, r?.last_name].filter(Boolean).join(' ').trim() || r?.email || 'Без імені';

/** Реєстрації без прив'язаного працівника: { pending, rejected } */
export const loadRegistrations = async () => {
    const [site, linked] = await Promise.all([
        supabase.from('user_site').select('*').order('id', { ascending: false }),
        supabase.from('employees').select('user_id').not('user_id', 'is', null),
    ]);
    if (site.error) throw site.error;
    if (linked.error) throw linked.error;

    const taken = new Set((linked.data || []).map(e => e.user_id));
    const open = (site.data || []).filter(r => r.user_id && !taken.has(r.user_id));
    return {
        pending: open.filter(r => !r.rejected_at),
        rejected: open.filter(r => r.rejected_at),
    };
};

// Лічильник для меню. Layout монтується на кожній сторінці, тому
// тримаємо результат хвилину, щоб не смикати базу на кожен перехід.
const COUNT_TTL = 60 * 1000;
let countCache = { at: 0, value: 0, promise: null };

export const pendingRegistrationsCount = () => {
    if (countCache.promise) return countCache.promise;
    if (Date.now() - countCache.at < COUNT_TTL) return Promise.resolve(countCache.value);
    countCache.promise = loadRegistrations()
        .then(({ pending }) => {
            countCache = { at: Date.now(), value: pending.length, promise: null };
            return pending.length;
        })
        .catch(() => {
            countCache = { ...countCache, promise: null };
            return countCache.value;
        });
    return countCache.promise;
};

// Після підтвердження/відхилення скидаємо кеш і даємо меню знати, що число змінилось
export const REGISTRATIONS_CHANGED = 'kcore:registrations-changed';
export const invalidatePendingCount = () => {
    countCache = { at: 0, value: countCache.value, promise: null };
    window.dispatchEvent(new Event(REGISTRATIONS_CHANGED));
};

const norm = (s) => String(s || '').toLowerCase().replace(/['’`ʼ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Найімовірніший працівник для реєстрації серед тих, у кого ще немає акаунта:
 * та сама пошта, або в імені працівника є і ім'я, і прізвище з реєстрації.
 */
export const suggestEmployee = (reg, employees) => {
    const free = employees.filter(e => !e.user_id);
    const email = norm(reg.email);
    const byEmail = email && free.find(e => norm(e.email) === email);
    if (byEmail) return { employee: byEmail, reason: 'та сама пошта' };

    // Ім'я й прізвище мають збігатися як окремі слова (не літери всередині слів),
    // і бути довшими за одну-дві літери — інакше «О А» «схоже» на кого завгодно.
    const first = norm(reg.first_name);
    const last = norm(reg.last_name);
    if (first.length >= 2 && last.length >= 3) {
        const byName = free.find(e => {
            const words = norm(e.name).split(' ');
            return words.includes(last) && words.some(w => w === first || (first.length >= 3 && w.startsWith(first)));
        });
        if (byName) return { employee: byName, reason: 'збігається ім’я' };
    }
    return null;
};

/** Прив'язати акаунт до наявного працівника. Порожню пошту працівника заповнюємо з реєстрації. */
export const linkRegistration = (reg, employee) =>
    supabase.from('employees')
        .update({ user_id: reg.user_id, ...(employee.email ? {} : { email: reg.email }) })
        .eq('id', employee.id);

/** Створити нового працівника одразу з доступом. Рівень має сенс лише для монтажників. */
export const createEmployeeForRegistration = (reg, { role, tier }) =>
    supabase.from('employees').insert({
        name: registrationName(reg),
        email: reg.email || null,
        phone: reg.phone ? String(reg.phone) : null,
        role,
        ...(role === 'installer' ? { tier } : {}),
        user_id: reg.user_id,
    });

/** Відхилити реєстрацію або повернути її в очікування. */
export const setRegistrationRejected = (reg, rejected, byEmployeeId) =>
    supabase.from('user_site')
        .update({
            rejected_at: rejected ? new Date().toISOString() : null,
            rejected_by: rejected ? (byEmployeeId || null) : null,
        })
        .eq('id', reg.id);
