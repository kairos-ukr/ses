// =====================================================================
//  K-CORE · Етапи об'єкта і їхні статуси — ОДИН список на всю програму
//
//  Раніше ті самі етапи були описані окремо в «Моїх етапах»
//  (MyWorkflowDashboard), у вкладці «Етапи та задачі» (PWT), у
//  «Партнерстві» та в «Об'єктах», і кожна копія по-своєму вирішувала,
//  що таке «виконано». Через це той самий етап міг бути «done» в одному
//  місці й «completed» в іншому, а лічильники розходились.
//
//  Тепер:
//   • макроетапи (Заміри → … → Запуск) і підетапи описані тут;
//   • у кожного підетапу один набір статусів, і в кожного статусу
//     явна ознака done — саме вона рахує «виконано» всюди;
//   • старі написання («done» замість «completed», «виконано» тощо)
//     перекладаються в правильні через normalizeTaskStatus, тож навіть
//     старі записи показуються й рахуються однаково.
//
//  Новий етап або статус додається ТІЛЬКИ тут.
//  Telegram-бот («tg bot/workflow_monitor.py») має власні підписи —
//  при зміні назв їх треба оновити й там.
// =====================================================================

import {
    FaMapMarkerAlt, FaDraftingCompass, FaFileInvoiceDollar, FaTruckLoading,
    FaBoxOpen, FaSolarPanel, FaBroadcastTower, FaFileSignature,
} from 'react-icons/fa';

/* ---------------------------------------------------------------------
 *  МАКРОЕТАПИ — порядок має значення
 * ------------------------------------------------------------------- */

export const STAGE_GROUPS = [
    { key: 'tech_review', label: 'Заміри', icon: FaMapMarkerAlt, tone: 'info' },
    { key: 'project', label: 'Проект', icon: FaDraftingCompass, tone: 'accent' },
    { key: 'proposal', label: 'КП', icon: FaFileInvoiceDollar, tone: 'warn' },
    { key: 'equipment', label: 'Обладнання', icon: FaTruckLoading, tone: 'neutral' },
    { key: 'complectation', label: 'Комплектація', icon: FaBoxOpen, tone: 'info' },
    { key: 'installation', label: 'Монтаж', icon: FaSolarPanel, tone: 'accent' },
    { key: 'monitoring_setup', label: 'Запуск', icon: FaBroadcastTower, tone: 'ok' },
];

// «Мережу» прибрали з робочого процесу, але в частини старих об'єктів
// цей етап лишився. Показуємо його, нових не створюємо.
const LEGACY_GROUPS = [
    { key: 'grid_connection', label: 'Мережа', icon: FaFileSignature, tone: 'warn', legacy: true },
];

const ALL_GROUPS = [...STAGE_GROUPS, ...LEGACY_GROUPS];

// Старі назви макроетапу в installations.workflow_stage
const GROUP_ALIASES = {
    survey: 'tech_review',          // старе значення за замовчуванням у базі
    project_design: 'project',
    commercial_proposal: 'proposal',
    advance_payment: 'proposal',
    tech_measurements: 'tech_review',
    mon_launch_station: 'monitoring_setup',
    installation_finish: 'installation',
};

export const normalizeGroupKey = (key) => GROUP_ALIASES[key] || key;

/** Макроетап за ключем (з урахуванням старих назв) або null. */
export const getStageGroup = (key) => ALL_GROUPS.find(g => g.key === normalizeGroupKey(key)) || null;

export const getStageGroupLabel = (key) => getStageGroup(key)?.label || key || 'Не визначено';

/* ---------------------------------------------------------------------
 *  НАБОРИ СТАТУСІВ
 *  done: true — етап вважається виконаним (лічильники, «Мої етапи»).
 * ------------------------------------------------------------------- */

const TONE_COLOR = {
    neutral: 'bg-slate-50 text-slate-600 border-slate-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    accent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const S = (key, label, tone, done = false) => ({ key, label, tone, done, color: TONE_COLOR[tone] });

const STATUS_KINDS = {
    simple: [
        S('todo', 'Не почато', 'neutral'),
        S('in_progress', 'В роботі', 'accent'),
        S('done', 'Виконано', 'ok', true),
    ],
    withWaiting: [
        S('todo', 'Не почато', 'neutral'),
        S('waiting', 'Очікуємо', 'warn'),
        S('in_progress', 'В роботі', 'accent'),
        S('done', 'Виконано', 'ok', true),
    ],
    tech_review: [
        S('waiting_client', 'Очікуємо від клієнта', 'warn'),
        S('done_on_site', 'Виконали на виїзді', 'info', true),
        S('completed', 'Виконано', 'ok', true),
    ],
    project: [
        S('waiting', 'Очікуємо', 'warn'),
        S('in_progress', 'В розробці', 'accent'),
        S('created', 'Зроблено', 'info', true),
        S('approved', 'Затверджено', 'ok', true),
    ],
    proposal: [
        S('waiting', 'Очікуємо', 'warn'),
        S('in_progress', 'В процесі', 'accent'),
        S('created', 'Зроблено', 'info', true),
        S('approved', 'Погоджено', 'ok', true),
    ],
    selector: [
        S('selection_needed', 'Необхідно обрати', 'warn'),
        S('selected', 'Обрано', 'ok', true),
    ],
    equipment: [
        S('waiting', 'Не розпочато', 'neutral'),
        S('in_progress', 'В роботі', 'accent'),
        S('ordered', 'Замовлено', 'accent'),
        S('arrived', 'Прибуло', 'ok', true),
    ],
    installation: [
        S('waiting_start', 'Очікуємо старт', 'neutral'),
        S('started', 'Розпочато', 'accent'),
        S('completed', 'Виконано', 'ok', true),
    ],
};

// Старі або «чужі» написання → правильний ключ у межах набору
const DONE_WORDS = ['виконано', 'завершено'];
const STATUS_ALIASES = {
    simple: { completed: 'done', not_started: 'todo', started: 'in_progress', ...words('done') },
    withWaiting: { completed: 'done', not_started: 'todo', started: 'in_progress', ...words('done') },
    tech_review: { done: 'completed', ...words('completed') },
    project: { project_done: 'created', project_approved: 'approved', kp_done: 'created', kp_approved: 'approved', done: 'approved', completed: 'approved', active: 'in_progress' },
    proposal: { kp_done: 'created', kp_approved: 'approved', done: 'approved', completed: 'approved', active: 'in_progress' },
    selector: {},
    equipment: { done: 'arrived', completed: 'arrived', todo: 'waiting', not_started: 'waiting' },
    installation: { done: 'completed', in_progress: 'started', todo: 'waiting_start', not_started: 'waiting_start', ...words('completed') },
};
function words(target) { return Object.fromEntries(DONE_WORDS.map(w => [w, target])); }

/* ---------------------------------------------------------------------
 *  ПІДЕТАПИ (задачі всередині макроетапу)
 *  autoDone — який статус ставити, коли до етапу завантажили файл.
 * ------------------------------------------------------------------- */

export const TASKS = [
    { key: 'tech_review', group: 'tech_review', title: 'Проведення замірів', short: 'Заміри', kind: 'tech_review', autoDone: 'completed' },

    { key: 'project_design', group: 'project', title: 'Розробка 3D візуалізації', short: '3D візуалізація', kind: 'project', autoDone: 'created' },
    { key: 'project_approval', group: 'project', title: 'Вибір та затвердження варіанту', short: 'Затвердження дизайну', kind: 'selector' },
    { key: 'tech_project', group: 'project', title: 'Технічне креслення', short: 'Технічний проект', kind: 'withWaiting', autoDone: 'done', uploads: true },

    { key: 'commercial_proposal', group: 'proposal', title: 'Комерційна пропозиція', short: 'КП', kind: 'proposal', autoDone: 'created', uploads: true },

    { key: 'equipment', group: 'equipment', title: 'Закупівля обладнання', short: 'Закупівля', kind: 'equipment' },

    { key: 'complectation', group: 'complectation', title: 'Комплектація матеріалів', short: 'Матеріали', kind: 'simple', autoDone: 'done', uploads: true },
    { key: 'comp_protection', group: 'complectation', title: 'Комплектація ел. захисту', short: 'Ел. захист', kind: 'simple', autoDone: 'done', uploads: true },

    { key: 'inst_structure', group: 'installation', title: 'Монтаж конструкції', short: 'Конструкція', kind: 'installation' },
    { key: 'inst_panels', group: 'installation', title: 'Встановлення панелей', short: 'Панелі', kind: 'installation' },
    { key: 'inst_cabling', group: 'installation', title: 'Прокладання траси DC', short: 'Траса DC', kind: 'installation' },
    { key: 'inst_grounding', group: 'installation', title: 'Заземлення', short: 'Заземлення', kind: 'installation' },
    { key: 'inst_inverter', group: 'installation', title: 'Підключення інвертора', short: 'Інвертор', kind: 'installation' },

    { key: 'monitoring_setup', group: 'monitoring_setup', title: 'Запуск станції', short: 'Запуск', kind: 'withWaiting' },

    // Старі підетапи: у робочому процесі їх уже немає, але записи в базі є
    { key: 'grid_connection', group: 'grid_connection', title: 'Заведення потужності', short: 'Мережа', kind: 'withWaiting', legacy: true },
    { key: 'advance_payment', group: 'proposal', title: 'Авансовий платіж', short: 'Аванс', kind: 'withWaiting', legacy: true },
    { key: 'installation', group: 'installation', title: 'Монтаж', short: 'Монтаж', kind: 'installation', legacy: true },
    { key: 'proposal', group: 'proposal', title: 'КП', short: 'КП', kind: 'proposal', legacy: true },
    { key: 'project', group: 'project', title: 'Проект', short: 'Проект', kind: 'project', legacy: true },
];

const TASK_BY_KEY = Object.fromEntries(TASKS.map(t => [t.key, t]));

/** Підетапи макроетапу в робочому порядку (без старих). */
export const tasksOfGroup = (groupKey) => TASKS.filter(t => t.group === normalizeGroupKey(groupKey) && !t.legacy);

/** Усі актуальні підетапи в порядку процесу. */
export const TASK_ORDER = STAGE_GROUPS.flatMap(g => tasksOfGroup(g.key).map(t => t.key));

export const getTask = (key) => TASK_BY_KEY[key] || null;

export const getTaskLabel = (key) => TASK_BY_KEY[key]?.title || getStageGroup(key)?.label || key || '—';

export const taskHasUploads = (key) => !!TASK_BY_KEY[key]?.uploads;

export const taskAutoDoneStatus = (key) => TASK_BY_KEY[key]?.autoDone || null;

const kindOf = (taskKey) => TASK_BY_KEY[taskKey]?.kind || 'simple';

/** Статуси, які можна обрати для підетапу. */
export const taskStatusOptions = (taskKey) => STATUS_KINDS[kindOf(taskKey)];

/** Привести будь-яке написання статусу до правильного ключа набору. */
export const normalizeTaskStatus = (taskKey, status) => {
    const s = String(status ?? '').trim().toLowerCase();
    if (!s) return s;
    const kind = kindOf(taskKey);
    if (STATUS_KINDS[kind].some(o => o.key === s)) return s;
    return STATUS_ALIASES[kind][s] || s;
};

// Підписи для «порожніх» станів, яких немає в наборі (напр. заміри ще не почались)
const IDLE_LABELS = { '': 'Не почато', todo: 'Не почато', not_started: 'Не розпочато' };

/** Опис статусу: { key, label, tone, done, color }. Невідомий — сірий, не виконаний. */
export const taskStatusMeta = (taskKey, status) => {
    const key = normalizeTaskStatus(taskKey, status);
    return STATUS_KINDS[kindOf(taskKey)].find(o => o.key === key)
        || { key, label: IDLE_LABELS[key] || key, tone: 'neutral', done: false, color: TONE_COLOR.neutral };
};

/**
 * Статус підетапу, якого ще немає в базі. Зазвичай — перший у наборі;
 * для замірів «Не почато», а не «Очікуємо від клієнта», бо ще нічого не чекаємо.
 */
export const taskDefaultStatus = (taskKey) => {
    const kind = kindOf(taskKey);
    if (kind === 'tech_review') return 'todo';
    return STATUS_KINDS[kind][0].key;
};

/** Чи виконаний підетап — ОДНЕ правило для всієї програми. */
export const isTaskDone = (taskKey, status) => taskStatusMeta(taskKey, status).done;
