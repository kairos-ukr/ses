// =====================================================================
//  K-CORE · Об'єкти: воронка по етапах і таблиця
//
//  Усі об'єкти завантажуються одним списком, а вигляд, фільтри й
//  пошук рахуються тут же — без сторінок по 6 карток.
//   • Воронка — колонки макроетапів; у заголовку кВт і медіана днів на
//     етапі. Картка, що стоїть на етапі понад 30 днів, має червону рамку.
//   • Таблиця — ті самі об'єкти рядками, сортування кліком по заголовку.
//   • Вигляди («Мої», «Без руху», «Без вартості»…) — готові набори
//     фільтрів; свій набір можна зберегти (на цьому пристрої).
//  Вигляд і обраний набір — в адресі (?view=table&v=stale), тож
//  посиланням можна поділитися.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaProjectDiagram, FaPlus, FaFilter, FaMoneyBillWave, FaTrash, FaHardHat,
  FaUserFriends, FaUserEdit, FaInfoCircle, FaTimes, FaColumns, FaTable,
  FaSortUp, FaSortDown, FaBookmark, FaCheck, FaUniversity, FaPause,
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import Layout from "./Layout";
import { useAuth } from "./AuthProvider";
import {
  T, Btn, IconBtn, Chip, Card, Field, Bar, EmptyState, Skeleton, Tip, Modal,
  Drawer, Picker, Segmented, SearchInput, useToast, useConfirm, humanError,
} from "./ui";
import { STAGE_GROUPS, getStageGroup, normalizeGroupKey } from "./domain/stages";
import {
  OBJECT_STATUSES, getObjectStatus, getLostReasonLabel, isObjectActive,
  CURRENCIES, DEFAULT_CURRENCY, formatMoney, COMPANIES, BANKS, getCompany, STATION_TYPES, managerOptions,
  brigadierOptions, canSeeMoney, isOwnObject,
} from "./domain/objects";
import {
  STALE_DAYS, ageTone, stageTone, normText, loadStageNorms, median, stageIndex, costOf, paidOf, debtOf, isReceivable,
  loadActivity, loadReadiness, stationShort, kw,
} from "./domain/pipeline";
import { fetchAll } from "./utils/fetchAll";
import { hasLostDeals, hasMoneyCurrency } from "./utils/features";
import LostReasonPicker from "./LostReasonPicker";

// --- CONSTANTS ---

const OBJECT_COLUMNS = [
  'custom_id', 'name', 'client_id', 'status', 'workflow_stage', 'capacity_kw', 'station_type', 'mount_type',
  'quant_phase', 'gps_link', 'bank', 'bank_name', 'total_cost', 'paid_amount', 'payment_status', 'currency',
  'responsible_emp_id', 'brigadier_emp_id', 'working_company', 'notes', 'creator_email', 'created_at',
  'lost_reason', 'lost_comment',
  'client:clients(name, company_name, populated_place, phone)',
].join(', ');

// Етапи, де показуємо забезпечення матеріалами на картці
const SUPPLY_STAGES = ['equipment', 'complectation', 'installation'];

// КП без рішення довше за це — на картці кнопка «Втрачено?»
const LOST_HINT_DAYS = 60;

const BOARD_LIMIT = 20;

// Без руху довше — угода «спляча»: на дошці згорнута внизу колонки
const SLEEP_DAYS = 60;

// Порядок карток у колонці воронки (запам'ятовується на пристрої)
const BOARD_ORDERS = [
  { v: 'live', l: 'Живі зверху' },
  { v: 'longest', l: 'Найдовше на етапі' },
  { v: 'newest', l: 'Нові зверху' },
  { v: 'value', l: 'Найбільша сума' },
];
const ORDER_KEY = 'kcore.objects.order';
const readOrder = () => { try { return localStorage.getItem(ORDER_KEY) || 'live'; } catch { return 'live'; } };

const ACTIVITY_OPTIONS = [
  { v: 'all', l: 'Будь-яка' },
  { v: 'live', l: `Живі (дія за ${STALE_DAYS} дн)` },
  { v: 'stale', l: `Без руху ${STALE_DAYS}+ дн` },
  { v: 'sleeping', l: `Сплячі ${SLEEP_DAYS}+ дн` },
];
const CREATED_OPTIONS = [
  { v: 'all', l: 'За весь час' },
  { v: '30', l: '30 днів' },
  { v: '90', l: '3 місяці' },
  { v: '365', l: 'Рік' },
];
const TABLE_LIMIT = 100;

/* ---------------------------------------------------------------------
 *  ФІЛЬТРИ І ВИГЛЯДИ
 * ------------------------------------------------------------------- */

const BASE_FILTER = {
  status: 'active', stage: 'all', payment: 'all', company: 'all',
  mine: false, stale: false, nocost: false, debt: false,
  activity: 'all', created: 'all',
};

const sameFilter = (a, b) => Object.keys(BASE_FILTER).every(k => a[k] === b[k]);

const builtinViews = (myId, financeAll = true) => [
  { key: 'active', label: 'Усі активні', filter: { ...BASE_FILTER } },
  ...(myId ? [{ key: 'mine', label: 'Мої', filter: { ...BASE_FILTER, mine: true } }] : []),
  { key: 'live', label: 'Живі', filter: { ...BASE_FILTER, activity: 'live' } },
  { key: 'stale', label: `Без руху понад ${STALE_DAYS} дн`, filter: { ...BASE_FILTER, stale: true } },
  { key: 'sleeping', label: `Сплячі ${SLEEP_DAYS}+ дн`, filter: { ...BASE_FILTER, activity: 'sleeping' } },
  { key: 'nocost', label: financeAll ? 'Без вартості' : 'Мої без вартості', filter: { ...BASE_FILTER, nocost: true } },
  { key: 'debt', label: financeAll ? 'Дебіторка' : 'Моя дебіторка', filter: { ...BASE_FILTER, status: 'all', debt: true } },
  ...COMPANIES.map((c, i) => ({ key: `company${i + 1}`, label: c.short, filter: { ...BASE_FILTER, company: c.key } })),
  { key: 'completed', label: 'Завершені', filter: { ...BASE_FILTER, status: 'completed' } },
  { key: 'lost', label: 'Втрачені', filter: { ...BASE_FILTER, status: 'lost' } },
];

// Свої вигляди — на цьому пристрої (приватне вікно може не дати сховища)
const VIEWS_KEY = 'kcore.objects.views';
const readViews = () => {
  try {
    const v = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => x && x.key && x.label && x.filter) : [];
  } catch { return []; }
};
const writeViews = (list) => {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(list)); } catch { /* немає сховища */ }
};

const STATUS_OPTIONS = [
  { v: 'active', l: 'Активні' }, { v: 'all', l: 'Усі' },
  ...OBJECT_STATUSES.map(s => ({ v: s.key, l: s.label })),
];
const PAYMENT_OPTIONS = [
  { v: 'all', l: 'Усі' }, { v: 'pending', l: 'Очікує' }, { v: 'partial', l: 'Частково' },
  { v: 'paid', l: 'Сплачено' }, { v: 'overdue', l: 'Борг' },
];

const objectTitle = (o) => o.name || o.client?.company_name || o.client?.name || `Об'єкт #${o.custom_id}`;

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString('uk-UA') : '—');

/* ---------------------------------------------------------------------
 *  ДРІБНІ ЧАСТИНИ
 * ------------------------------------------------------------------- */

const ageText = (o, act, norm) => {
  if (!act) return null;
  const stage = getStageGroup(o.workflow_stage)?.label || 'етапі';
  const n = normText(act.stageDays, norm);
  return `На етапі «${stage}» з ${fmtDate(act.stageEnteredAt)}${n ? ` (${n})` : ''}. Остання дія по об'єкту — ${fmtDate(act.lastActivityAt)}.`;
};

// Етапи продажу: тут угода ще може не відбутися — довго без рішення = «Втрачено?»
const PRESALE_STAGES = ['tech_review', 'project', 'proposal'];

const COMPANY_CHIP = {
  accent: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  warn: 'bg-amber-50 text-amber-800 border-amber-100',
  info: 'bg-sky-50 text-sky-700 border-sky-100',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

/** Картка у воронці: усе головне видно одразу, без наведення мишкою */
const BoardCard = ({ o, act, ready, owner, brigadier, norm, onOpen, onLost }) => {
  const days = act?.stageDays ?? null;
  // Призупинений об'єкт стоїть свідомо — не підсвічуємо його як «горить»
  const tone = o.status === 'on_hold' ? 'neutral' : stageTone(days, norm);
  const stage = normalizeGroupKey(o.workflow_stage);
  const cur = o.currency || DEFAULT_CURRENCY;
  const cost = costOf(o);
  const paid = paidOf(o);
  const debt = isReceivable(o) ? debtOf(o) : 0;
  const company = getCompany(o.working_company);
  const idle = act?.idleDays ?? null;
  const meta = [kw(o.capacity_kw), stationShort(o.station_type), o.client?.populated_place].filter(Boolean).join(' · ');
  const askLost = onLost && PRESALE_STAGES.includes(stage) && o.status !== 'on_hold' && days != null && days > LOST_HINT_DAYS;
  const daysTone = tone === 'danger' ? 'bg-rose-50 text-rose-700 border-rose-200'
    : tone === 'warn' ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-100';

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={(e) => onOpen(o, e)}
      onAuxClick={(e) => { if (e.button === 1) onOpen(o, { ...e, ctrlKey: true }); }}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(o, e); }}
      className={`block bg-white rounded-xl border cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-200 overflow-hidden
        ${tone === 'danger' ? 'border-rose-300' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={T.mono}>СЕС-{o.custom_id}</span>
          {company && (
            <span className={`h-5 px-2 rounded-full border text-[11px] font-semibold flex items-center whitespace-nowrap ${COMPANY_CHIP[company.tone] || COMPANY_CHIP.neutral}`}>
              {company.short}
            </span>
          )}
        </div>

        <div className="text-[13.5px] font-semibold text-slate-900 leading-snug break-words">{objectTitle(o)}</div>
        {meta && <div className="text-[12px] text-slate-500 leading-snug">{meta}</div>}
        {brigadier && (
          <div className="text-[12px] text-slate-600 leading-snug flex items-center gap-1.5">
            <FaHardHat size={10} className="text-slate-400 flex-shrink-0" />
            <span className="break-words">{brigadier.name}</span>
          </div>
        )}

        {/* Гроші: сума угоди, скільки сплачено, банк. Чужі угоди — без сум */}
        {(cost > 0 || o.bank === 'Так') && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {cost > 0 ? (
              <span className="text-[13px] font-bold text-slate-900 tabular-nums">
                {formatMoney(cost, cur)}
                {paid > 0 && <span className="ml-1.5 text-[11.5px] font-semibold text-emerald-700">{Math.min(100, Math.round((paid / cost) * 100))}% спл.</span>}
              </span>
            ) : o._moneyHidden ? <span /> : <span className="text-[12px] text-amber-700">вартість не вказана</span>}
            {o.bank === 'Так' && (
              <span className="h-5 px-2 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 flex items-center gap-1 whitespace-nowrap">
                <FaUniversity size={9} /> {o.bank_name || 'банк'}
              </span>
            )}
          </div>
        )}

        {ready != null && (
          <div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
              <span>Матеріали</span><b className="tabular-nums text-slate-700">{ready}%</b>
            </div>
            <Bar segments={[{ pct: ready, tone: ready >= 100 ? 'ok' : ready >= 50 ? 'info' : 'warn' }]} />
          </div>
        )}

        {(o.status === 'on_hold' || debt > 0 || (idle != null && idle > STALE_DAYS)) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {o.status === 'on_hold' && <Chip tone="warn">Пауза</Chip>}
            {debt > 0 && <Chip tone="danger">борг {formatMoney(debt, cur)}</Chip>}
            {idle != null && idle > STALE_DAYS && o.status !== 'on_hold' && <Chip tone="neutral">без руху {idle} дн</Chip>}
          </div>
        )}
      </div>

      {/* Відповідальний повністю + скільки днів на етапі проти норми */}
      <div className="px-2.5 py-2 border-t border-slate-100 bg-slate-50/60 flex items-center gap-2">
        <span className={`text-[12.5px] min-w-0 flex-1 leading-tight break-words ${owner?.name ? 'font-semibold text-slate-700' : 'text-slate-400'}`}>
          {owner?.name || 'Не призначено'}
        </span>
        <Tip text={ageText(o, act, norm)}>
          <span className={`h-6 px-2 rounded-md border text-[11.5px] font-bold tabular-nums flex items-center whitespace-nowrap ${o.status === 'on_hold' ? 'bg-slate-50 text-slate-500 border-slate-200' : daysTone}`}>
            {days == null ? 'новий' : norm ? `${days} / ${norm} дн` : `${days} дн`}
          </span>
        </Tip>
      </div>

      {askLost && (
        <div className="px-2.5 py-2 border-t border-amber-100 bg-amber-50/70 flex items-center justify-between gap-2">
          <span className="text-[12px] text-amber-800 leading-tight">Без рішення {days} дн</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLost(o); }}
            className="h-7 px-2.5 rounded-lg border border-rose-200 bg-white text-[12px] font-bold text-rose-700 hover:bg-rose-50 whitespace-nowrap"
          >
            Втрачено?
          </button>
        </div>
      )}
    </div>
  );
};

/** Колонка етапу у воронці */
const BoardColumn = ({ col, activity, readiness, ownerOf, brigadierOf, norm, onOpen, onLost }) => {
  const [limit, setLimit] = useState(BOARD_LIMIT);
  const [showSleeping, setShowSleeping] = useState(false);
  const { group, items, live, sleeping } = col;
  const medTone = stageTone(col.med, norm);
  return (
    <div className="w-[272px] flex-shrink-0 flex flex-col min-h-0 bg-slate-200/60 rounded-xl snap-start">
      <div className="px-3 pt-2.5 pb-2 flex-none">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-bold text-slate-800 truncate">{group.label}</span>
          <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-white text-[11.5px] font-bold text-slate-600 flex items-center justify-center tabular-nums">{items.length}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11.5px] text-slate-500 tabular-nums">
          <span>{col.kw ? `${col.kw.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} кВт` : '0 кВт'}</span>
          {col.med != null && (
            <Tip text={`Медіана: половина об'єктів колонки стоїть на етапі менше цього, половина — більше.${norm ? ` Норма етапу — ${norm} дн.` : ''}`}>
              <span className={medTone === 'danger' ? 'text-rose-600 font-semibold' : medTone === 'warn' ? 'text-amber-700 font-semibold' : ''}>
                мед. {col.med} дн
              </span>
            </Tip>
          )}
          {norm && <span className="text-slate-400">· норма {norm}</span>}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-2">
        {live.slice(0, limit).map(o => (
          <BoardCard
            key={o.custom_id}
            o={o}
            act={activity[o.custom_id]}
            ready={readiness[o.custom_id]}
            owner={ownerOf(o)}
            brigadier={brigadierOf(o)}
            norm={norm}
            onOpen={onOpen}
            onLost={onLost}
          />
        ))}
        {live.length > limit && (
          <button
            type="button"
            onClick={() => setLimit(l => l + BOARD_LIMIT)}
            className="w-full h-9 rounded-lg text-[12.5px] font-semibold text-slate-600 hover:bg-white/70 transition-colors"
          >
            Показати ще {live.length - limit}
          </button>
        )}
        {/* Сплячі (довго без руху) і на паузі — внизу, згорнуті */}
        {sleeping.length > 0 && (
          <>
            <button type="button" onClick={() => setShowSleeping(v => !v)}
              className="w-full h-9 px-3 rounded-lg border border-dashed border-slate-300 bg-white/50 text-[12.5px] font-semibold text-slate-500 hover:bg-white flex items-center justify-between">
              <span>Сплячі й на паузі · {sleeping.length}</span>
              <span className="text-[11.5px]">{showSleeping ? 'сховати' : 'показати'}</span>
            </button>
            {showSleeping && sleeping.map(o => (
              <div key={o.custom_id} className="opacity-80">
                <BoardCard o={o} act={activity[o.custom_id]} ready={readiness[o.custom_id]} owner={ownerOf(o)} brigadier={brigadierOf(o)} norm={norm} onOpen={onOpen} onLost={onLost} />
              </div>
            ))}
          </>
        )}
        {items.length === 0 && <div className="py-6 text-center text-[12px] text-slate-400">Порожньо</div>}
      </div>
    </div>
  );
};

// --- MAIN PAGE ---
export default function ProjectsPage() {
    const auth = useAuth();
    const { financeAll } = auth;
    const myEmployeeId = auth.employee?.custom_id || null;
    // Доступи → «Об'єкти»
    const canAdd = auth.can('objects', 'add');
    const canEditObj = auth.can('objects', 'edit');
    const canDelete = auth.can('objects', 'delete');
    const objectsAll = auth.canAll('objects');
    const toast = useToast();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    const view = params.get('view') === 'table' ? 'table' : 'board';

    const [projects, setProjects] = useState([]);
    const [activity, setActivity] = useState({});      // custom_id → { stageDays, idleDays, … }
    const [readiness, setReadiness] = useState({});
    const [norms, setNorms] = useState({});            // норма днів на етап: { stage_key: days }
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Вигляди: вбудовані + свої
    const [customViews, setCustomViews] = useState(readViews);
    const views = useMemo(() => [...builtinViews(myEmployeeId, !!financeAll), ...customViews], [myEmployeeId, financeAll, customViews]);
    const [filter, setFilter] = useState(() => {
      const v = [...builtinViews(myEmployeeId), ...readViews()].find(x => x.key === params.get('v'));
      return v ? { ...BASE_FILTER, ...v.filter } : { ...BASE_FILTER };
    });
    const [showFilters, setShowFilters] = useState(false);
    const [naming, setNaming] = useState(null);         // назва нового вигляду, поки вводять
    const [sort, setSort] = useState({ key: 'id', dir: 'desc' });
    const [tableLimit, setTableLimit] = useState(TABLE_LIMIT);
    const [lostTarget, setLostTarget] = useState(null); // { o, reason, comment, error }
    const [boardOrder, setBoardOrder] = useState(readOrder);
    const changeOrder = (v) => { setBoardOrder(v); try { localStorage.setItem(ORDER_KEY, v); } catch { /* немає сховища */ } };

    const [showProjectForm, setShowProjectForm] = useState(false);
    const [editingProject, setEditingProject] = useState(null);

    const [showInlineClientForm, setShowInlineClientForm] = useState(false);
    const [inlineClient, setInlineClient] = useState({ name: '', company_name: '', phone: '' });

    const [clients, setClients] = useState([]);
    const [employees, setEmployees] = useState([]);

    const initialFormData = {
        name: '', working_company: '', bank: '', bank_name: '', client_id: '', gps_link: '',
        mount_type: '', station_type: '', capacity_kw: '',
        responsible_emp_id: '', brigadier_emp_id: '',
        total_cost: '', payment_status: 'pending', paid_amount: '', currency: DEFAULT_CURRENCY,
        status: 'planning', workflow_stage: 'tech_review',
        lost_reason: '', lost_comment: '',
        quant_phase: '',
        notes: '', creator_email: ''
    };

    const [formData, setFormData] = useState(initialFormData);
    const [formErrors, setFormErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    // --- Helpers ---
    const updatePaymentStatus = (totalCost, paidAmount) => {
        const cost = parseFloat(totalCost);
        const paid = parseFloat(paidAmount);
        if (!cost || cost <= 0) return 'pending';
        if (!paid || paid < 0) return 'pending';
        const percentage = (paid / cost) * 100;
        if (percentage >= 100) return 'paid';
        if (percentage > 0) return 'partial';
        return 'pending';
    };

    const getStageConfig = (val) =>
        getStageGroup(val) || { label: val || 'Не визначено', tone: 'neutral', icon: FaInfoCircle };

    // Нові можливості вмикаються самі після відповідних міграцій (src/utils/features.js)
    const [lostReady, setLostReady] = useState(false);
    const [moneyReady, setMoneyReady] = useState(false);
    useEffect(() => {
        hasLostDeals().then(setLostReady);
        hasMoneyCurrency().then(setMoneyReady);
    }, []);

    // --- LOAD DICTIONARIES ---
    useEffect(() => {
        const loadStaticData = async () => {
            try {
                const [clientsRes, employeesRes] = await Promise.all([
                    supabase.from('clients').select('custom_id, name, company_name').order('name'),
                    supabase.from('employees').select('custom_id, name, position, email, role, tier, access_blocked_at, hidden_from_list').order('name')
                ]);
                setClients(clientsRes.data || []);
                setEmployees(employeesRes.data || []);
            } catch (error) {
                toast('Помилка завантаження довідників', 'error');
            }
        };
        loadStaticData();
    }, [toast]);

    const employeesById = useMemo(() => new Map(employees.map(e => [e.custom_id, e])), [employees]);
    const ownerOf = useCallback((o) => employeesById.get(o.responsible_emp_id) || null, [employeesById]);
    const brigadierOf = useCallback((o) => (o.brigadier_emp_id != null ? employeesById.get(o.brigadier_emp_id) || null : null), [employeesById]);

    // --- LOAD PROJECTS ---
    // Усі власні об'єкти (без підрядів) одним списком; фільтри — вже тут, у браузері
    const loadProjects = useCallback(async () => {
        setLoading(true);
        try {
            const [rows, act, nm] = await Promise.all([
                fetchAll(() => supabase.from('installations')
                    .select(OBJECT_COLUMNS)
                    .or('is_subcontract.eq.false,is_subcontract.is.null')
                    .order('custom_id', { ascending: false })),
                loadActivity(),
                loadStageNorms(),
            ]);
            setNorms(nm);
            setProjects(rows);
            setActivity(act);

            const supplyIds = rows
                .filter(o => isObjectActive(o.status) && SUPPLY_STAGES.includes(normalizeGroupKey(o.workflow_stage)))
                .map(o => o.custom_id);
            loadReadiness(supplyIds).then(setReadiness).catch(() => setReadiness({}));
        } catch (error) {
            toast(humanError(error), 'error');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { loadProjects(); }, [loadProjects]);

    // Суми й борги чужих угод бачать лише ті, кому відкрито фінанси компанії;
    // решта — тільки по угодах, де вони відповідальний менеджер
    // Доступ «лише свої об'єкти» — тільки ті, де людина менеджер або бригадир
    const shown = useMemo(() => {
        const list = objectsAll ? projects : projects.filter(o => isOwnObject(o, myEmployeeId));
        if (financeAll) return list;
        const me = { financeAll, can: auth.can, employee: { custom_id: myEmployeeId } };
        return list.map(o => (canSeeMoney(me, o) ? o
            : { ...o, total_cost: null, paid_amount: null, payment_status: null, _moneyHidden: true }));
    }, [projects, financeAll, myEmployeeId, objectsAll, auth.can]);

    /* ---------------- ФІЛЬТРИ ---------------- */

    const matches = useCallback((o, f) => {
        if (f.status === 'active') { if (!isObjectActive(o.status)) return false; }
        else if (f.status !== 'all' && o.status !== f.status) return false;
        if (f.stage !== 'all' && normalizeGroupKey(o.workflow_stage) !== f.stage) return false;
        if (f.payment !== 'all' && o.payment_status !== f.payment) return false;
        if (f.company !== 'all' && o.working_company !== f.company) return false;
        // «Мої» — де я відповідальний менеджер або бригадир
        if (f.mine && Number(o.responsible_emp_id) !== Number(myEmployeeId) && Number(o.brigadier_emp_id) !== Number(myEmployeeId)) return false;
        if (f.stale && !((activity[o.custom_id]?.idleDays ?? 0) > STALE_DAYS)) return false;
        if (f.nocost && (o._moneyHidden || costOf(o) > 0)) return false;
        if (f.debt && !isReceivable(o)) return false;
        if (f.activity && f.activity !== 'all') {
            const idle = activity[o.custom_id]?.idleDays ?? 0;
            if (f.activity === 'live' && idle > STALE_DAYS) return false;
            if (f.activity === 'stale' && idle <= STALE_DAYS) return false;
            if (f.activity === 'sleeping' && idle <= SLEEP_DAYS) return false;
        }
        if (f.created && f.created !== 'all') {
            const since = Date.now() - Number(f.created) * 86400000;
            if (!o.created_at || new Date(o.created_at).getTime() < since) return false;
        }
        return true;
    }, [activity, myEmployeeId]);

    const searched = useMemo(() => {
        const q = searchTerm.trim().toLowerCase().replace(/^сес-?/, '');
        if (!q) return shown;
        return shown.filter(o => [
            o.custom_id, o.name, o.client?.name, o.client?.company_name, o.client?.populated_place,
            o.client?.phone, o.working_company, o.notes,
        ].some(v => v != null && String(v).toLowerCase().includes(q)));
    }, [shown, searchTerm]);

    const visible = useMemo(() => searched.filter(o => matches(o, filter)), [searched, filter, matches]);

    const counts = useMemo(() => {
        const c = {};
        views.forEach(v => { c[v.key] = searched.filter(o => matches(o, { ...BASE_FILTER, ...v.filter })).length; });
        return c;
    }, [views, searched, matches]);

    // Вигляд з адреси: посилання, «Назад» у браузері, перехід зі «Сьогодні»
    const urlView = params.get('v');
    useEffect(() => {
        if (!urlView) return;
        const v = views.find(x => x.key === urlView);
        if (v) setFilter(f => (sameFilter(f, { ...BASE_FILTER, ...v.filter }) ? f : { ...BASE_FILTER, ...v.filter }));
    }, [urlView, views]);

    const activeView = views.find(v => sameFilter({ ...BASE_FILTER, ...v.filter }, filter)) || null;
    const filterIsDefault = sameFilter(filter, BASE_FILTER);

    const setParam = (key, value) => setParams(prev => {
        const p = new URLSearchParams(prev);
        if (value == null) p.delete(key); else p.set(key, value);
        return p;
    }, { replace: true });

    const pickView = (v) => {
        setFilter({ ...BASE_FILTER, ...v.filter });
        setParam('v', v.key === 'active' ? null : v.key);
        setTableLimit(TABLE_LIMIT);
    };

    const patchFilter = (patch) => {
        setFilter(f => ({ ...f, ...patch }));
        setParam('v', null);
        setTableLimit(TABLE_LIMIT);
    };

    const saveView = () => {
        const label = (naming || '').trim();
        if (!label) { setNaming(null); return; }
        const v = { key: `my-${Date.now()}`, label, filter: { ...filter } };
        const next = [...customViews, v];
        setCustomViews(next);
        writeViews(next);
        setNaming(null);
        setParam('v', v.key);
        toast(`Вигляд «${label}» збережено`);
    };

    const removeView = (key) => {
        const next = customViews.filter(v => v.key !== key);
        setCustomViews(next);
        writeViews(next);
        if (params.get('v') === key) setParam('v', null);
    };

    /* ---------------- ВОРОНКА ---------------- */

    const columns = useMemo(() => {
        const groups = [...STAGE_GROUPS];
        const byKey = new Map(groups.map(g => [g.key, []]));
        visible.forEach(o => {
            const k = normalizeGroupKey(o.workflow_stage || 'tech_review');
            if (!byKey.has(k)) {
                groups.push(getStageGroup(k) || { key: k, label: k || 'Не визначено', icon: FaInfoCircle });
                byKey.set(k, []);
            }
            byKey.get(k).push(o);
        });
        // Порядок у колонці; сплячі (довго без руху) і призупинені — окремо внизу
        const idleOf = (o) => activity[o.custom_id]?.idleDays ?? 0;
        const cmp = {
            live: (a, b) => idleOf(a) - idleOf(b),
            longest: (a, b) => (activity[b.custom_id]?.stageDays ?? -1) - (activity[a.custom_id]?.stageDays ?? -1),
            newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
            value: (a, b) => costOf(b) - costOf(a),
        }[boardOrder] || ((a, b) => idleOf(a) - idleOf(b));
        const isSleeping = (o) => o.status === 'on_hold' || idleOf(o) > SLEEP_DAYS;
        return groups.map(g => {
            const items = byKey.get(g.key).slice().sort(cmp);
            return {
                group: g,
                items,
                live: items.filter(o => !isSleeping(o)),
                sleeping: items.filter(isSleeping),
                kw: items.reduce((s, o) => s + (Number(o.capacity_kw) || 0), 0),
                med: median(items.filter(o => o.status !== 'on_hold').map(o => activity[o.custom_id]?.stageDays ?? null)),
            };
        });
    }, [visible, activity, boardOrder]);

    const openObject = useCallback((o, e) => {
        const to = `/project/${o.custom_id}`;
        if (e?.ctrlKey || e?.metaKey) window.open(`#${to}`, '_blank', 'noopener');
        else navigate(to);
    }, [navigate]);

    /* ---------------- ТАБЛИЦЯ ---------------- */

    const SORTS = useMemo(() => ({
        id: o => o.custom_id,
        stage: o => stageIndex(o.workflow_stage),
        stageDays: o => activity[o.custom_id]?.stageDays ?? -1,
        idle: o => activity[o.custom_id]?.idleDays ?? -1,
        kw: o => Number(o.capacity_kw) || 0,
        cost: o => costOf(o),
        debt: o => (isReceivable(o) ? debtOf(o) : 0),
        owner: o => ownerOf(o)?.name || 'яяя',
    }), [activity, ownerOf]);

    const sorted = useMemo(() => {
        const fn = SORTS[sort.key] || SORTS.id;
        const dir = sort.dir === 'asc' ? 1 : -1;
        return visible.slice().sort((a, b) => {
            const x = fn(a), y = fn(b);
            if (x < y) return -dir;
            if (x > y) return dir;
            return b.custom_id - a.custom_id;
        });
    }, [visible, sort, SORTS]);

    const toggleSort = (key) => setSort(s => (s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'owner' || key === 'stage' ? 'asc' : 'desc' }));

    /* ---------------- «ВТРАЧЕНО?» З ВОРОНКИ ---------------- */

    const saveLost = async () => {
        const t = lostTarget;
        if (!t.reason) { setLostTarget({ ...t, error: 'Оберіть причину' }); return; }
        const patch = {
            status: 'lost',
            lost_reason: t.reason,
            lost_comment: (t.comment || '').trim() || null,
            lost_at: new Date().toISOString(),
            lost_stage: normalizeGroupKey(t.o.workflow_stage),
        };
        const { error } = await supabase.from('installations').update(patch).eq('custom_id', t.o.custom_id);
        if (error) { toast(humanError(error), 'error'); return; }
        setProjects(prev => prev.map(o => o.custom_id === t.o.custom_id ? { ...o, ...patch } : o));
        setLostTarget(null);
        toast(`СЕС-${t.o.custom_id}: позначено «Втрачено»`);
    };

    // «Відклав» часто означає не «втрачено», а «повернемось пізніше» — тоді пауза
    const savePause = async () => {
        const t = lostTarget;
        const { error } = await supabase.from('installations').update({ status: 'on_hold' }).eq('custom_id', t.o.custom_id);
        if (error) { toast(humanError(error), 'error'); return; }
        setProjects(prev => prev.map(o => o.custom_id === t.o.custom_id ? { ...o, status: 'on_hold' } : o));
        setLostTarget(null);
        toast(`СЕС-${t.o.custom_id}: на паузі`);
    };

    // --- Handlers ---
    const handleAddProject = () => {
        setFormData(initialFormData);
        setEditingProject(null);
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
        setShowProjectForm(true);
    };
    const handleEditProject = (project) => {
        setFormData({
            name: project.name || '', working_company: project.working_company || '', bank: project.bank || '', bank_name: project.bank_name || '',
            client_id: project.client_id || '', gps_link: project.gps_link || '',
            mount_type: project.mount_type || '', station_type: project.station_type || '',
            capacity_kw: project.capacity_kw ?? '', responsible_emp_id: project.responsible_emp_id || '',
            brigadier_emp_id: project.brigadier_emp_id ?? '',
            total_cost: project.total_cost ?? '', payment_status: project.payment_status || 'pending',
            paid_amount: project.paid_amount ?? '', currency: project.currency || DEFAULT_CURRENCY,
            status: project.status || 'planning',
            lost_reason: project.lost_reason || '', lost_comment: project.lost_comment || '',
            workflow_stage: normalizeGroupKey(project.workflow_stage || 'tech_review'), quant_phase: project.quant_phase || '',
            notes: project.notes || '', creator_email: project.creator_email || '',
            custom_id: project.custom_id,
        });
        setEditingProject(project);
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
        setShowProjectForm(true);
    };
    const handleCloseForm = () => {
        setShowProjectForm(false);
        setEditingProject(null);
        setFormData(initialFormData);
        setFormErrors({});
        setShowInlineClientForm(false);
        setInlineClient({ name: '', company_name: '', phone: '' });
    };
    const handleInputChange = (field, value) => { setFormData(prev => ({ ...prev, [field]: value })); };

    const handleDelete = async (projectId, projectName) => {
        if (!canDelete) {
            toast("У вас немає прав на видалення", "error");
            return;
        }
        const ok = await confirm({
            title: 'Видалити проект?',
            tone: 'danger', confirmLabel: 'Видалити',
            message: `«${projectName}»`,
            details: ['Дію не можна скасувати.'],
        });
        if (!ok) return;
        const { error } = await supabase.from('installations').delete().eq('custom_id', projectId);
        if (error) { toast(humanError(error), 'error'); return; }
        toast('Видалено', 'success');
        loadProjects();
    };

    const handleSubmit = async () => {
        setFormErrors({});
        // «Втрачено» без причини не зберігаємо: саме причини потім показують, де губляться угоди
        if (lostReady && formData.status === 'lost' && !formData.lost_reason) {
            setFormErrors({ lost_reason: 'Оберіть причину' });
            return;
        }
        setSubmitting(true);
        try {
            let clientIdToUse = formData.client_id;
            if (!clientIdToUse) {
                const name = (inlineClient.name || '').trim();
                if (!name) {
                    setFormErrors({ client_id: 'Оберіть клієнта або додайте нового' });
                    setSubmitting(false);
                    return;
                }

                const payload = {
                    name,
                    company_name: (inlineClient.company_name || '').trim() || null,
                    phone: (inlineClient.phone || '').trim() || null,
                };

                const { data: created, error: createErr } = await supabase
                    .from('clients')
                    .insert([payload])
                    .select('custom_id, name, company_name')
                    .single();

                if (createErr) throw createErr;
                clientIdToUse = created.custom_id;

                setClients(prev => {
                    const exists = prev.some(c => c.custom_id === created.custom_id);
                    return exists ? prev : [created, ...prev];
                });
            }

            const {
                client, responsible_employee, custom_id,
                currency, paid_amount, payment_status, lost_reason, lost_comment,
                ...projectData
            } = formData;
            const sanitized = { ...projectData, client_id: clientIdToUse };
            if (sanitized.bank !== 'Так') sanitized.bank_name = null;   // банк — лише для угод «через банк»

            if (moneyReady) {
                // «Оплачено» і статус оплати рахує база з платежів — їх не надсилаємо
                sanitized.currency = currency || DEFAULT_CURRENCY;
            } else {
                sanitized.paid_amount = paid_amount;
                sanitized.payment_status = updatePaymentStatus(projectData.total_cost, paid_amount);
            }

            if (lostReady) {
                const wasLost = editingProject?.status === 'lost';
                if (projectData.status === 'lost') {
                    sanitized.lost_reason = lost_reason;
                    sanitized.lost_comment = (lost_comment || '').trim() || null;
                    if (!wasLost) {
                        sanitized.lost_at = new Date().toISOString();
                        sanitized.lost_stage = normalizeGroupKey(projectData.workflow_stage);
                    }
                } else if (wasLost) {
                    // Повернули в роботу — причина втрати більше не актуальна
                    Object.assign(sanitized, { lost_reason: null, lost_comment: null, lost_at: null, lost_stage: null });
                }
            }
            // Суми чужої угоди в формі не було — не затираємо їх порожнім
            if (editingProject?._moneyHidden) {
                ['total_cost', 'currency', 'paid_amount', 'payment_status'].forEach(k => { delete sanitized[k]; });
            }
            for (let key in sanitized) if (sanitized[key] === '') sanitized[key] = null;

            if (editingProject) {
                const { error } = await supabase.from('installations').update(sanitized).eq('custom_id', editingProject.custom_id);
                if (error) throw error;
            } else {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) sanitized.creator_email = user.email;
                const { error } = await supabase.from('installations').insert([sanitized]);
                if (error) throw error;
            }

            toast('Збережено', 'success');
            handleCloseForm();
            loadProjects();
        } catch (e) {
            toast(humanError(e), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const clientOptions = clients.map(c => ({ id: c.custom_id, label: `${c.company_name || c.name} · ID ${c.custom_id}` }));
    // Відповідальний за угоду — менеджер (офіс і вище), монтажників тут не показуємо
    const employeeOptions = managerOptions(employees, formData.responsible_emp_id);

    /* ---------------- ВІДОБРАЖЕННЯ ---------------- */

    const chipBtn = (on, tone = 'indigo') => `px-2.5 h-8 sm:h-7 rounded-lg text-[12px] font-semibold transition-colors whitespace-nowrap ${on
        ? (tone === 'indigo' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700')
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`;

    const sortTh = (k, children, className = '') => (
        <th key={k} className={`${T.th} ${className}`}>
            <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800">
                {children}
                {sort.key === k && (sort.dir === 'asc' ? <FaSortUp size={10} /> : <FaSortDown size={10} />)}
            </button>
        </th>
    );

    const renderTable = () => (
        <div className={`${T.card} lg:h-full flex flex-col lg:min-h-0 overflow-hidden`}>
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-auto custom-scrollbar">
                {/* Телефон і планшет: картка на об'єкт — усі цифри видно без гортання вбік */}
                <ul className="lg:hidden divide-y divide-slate-100">
                    {sorted.slice(0, tableLimit).map(o => {
                        const act = activity[o.custom_id];
                        const stage = getStageConfig(o.workflow_stage);
                        const status = getObjectStatus(o.status);
                        const cur = o.currency || DEFAULT_CURRENCY;
                        const debt = isReceivable(o) ? debtOf(o) : 0;
                        const owner = ownerOf(o);
                        const norm = norms[normalizeGroupKey(o.workflow_stage)];
                        return (
                            <li key={o.custom_id} onClick={(e) => openObject(o, e)} className="px-3 py-3 active:bg-slate-50 cursor-pointer">
                                <div className="flex items-start gap-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[14px] font-semibold text-slate-900 leading-snug break-words">{objectTitle(o)}</div>
                                        <div className="text-[12px] text-slate-500">
                                            СЕС-{o.custom_id}{o.client?.populated_place ? ` · ${o.client.populated_place}` : ''}{owner ? ` · ${owner.name}` : ''}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                        {canEditObj && <IconBtn icon={FaUserEdit} label="Редагувати" onClick={() => handleEditProject(o)} />}
                                        {canDelete && (
                                            <IconBtn variant="softDanger" icon={FaTrash} label="Видалити"
                                                onClick={() => handleDelete(o.custom_id, objectTitle(o))} />
                                        )}
                                    </div>
                                </div>
                                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                    <Chip tone={stage.tone || 'neutral'}>{stage.label}</Chip>
                                    {(!isObjectActive(o.status) || o.status === 'on_hold') && <Chip tone={status.tone}>{status.short}</Chip>}
                                    {act && isObjectActive(o.status) && (
                                        <Chip tone={o.status === 'on_hold' ? 'neutral' : stageTone(act.stageDays, norm)}>
                                            {act.stageDays} дн{norm ? ` / ${norm}` : ''}
                                        </Chip>
                                    )}
                                    {o.status === 'lost' && o.lost_reason && <span className="text-[12px] text-slate-500">{getLostReasonLabel(o.lost_reason)}</span>}
                                </div>
                                <div className="mt-1.5 flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[12.5px] tabular-nums">
                                    {kw(o.capacity_kw) && <span className="text-slate-600">{kw(o.capacity_kw)}</span>}
                                    {costOf(o) > 0 && <span className="text-slate-800 font-semibold">{formatMoney(costOf(o), cur)}</span>}
                                    {debt > 0 && <span className="text-rose-600 font-bold">борг {formatMoney(debt, cur)}</span>}
                                    {debt === 0 && costOf(o) > 0 && paidOf(o) >= costOf(o) && <span className="text-emerald-600 font-semibold">сплачено</span>}
                                    {act && <span className={`ml-auto ${ageTone(act.idleDays) === 'danger' ? 'text-rose-600' : 'text-slate-400'}`}>
                                        {act.idleDays === 0 ? 'дія сьогодні' : `дія ${act.idleDays} дн тому`}
                                    </span>}
                                </div>
                            </li>
                        );
                    })}
                </ul>
                <table className="hidden lg:table w-full text-left">
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-slate-200">
                            {sortTh('id', "Об'єкт")}
                            {sortTh('stage', 'Етап')}
                            {sortTh('stageDays', 'На етапі', 'text-right')}
                            {sortTh('idle', 'Остання дія', 'text-right hidden lg:table-cell')}
                            {sortTh('kw', 'Потужність', 'text-right hidden md:table-cell')}
                            {sortTh('cost', 'Вартість', 'text-right hidden md:table-cell')}
                            {sortTh('debt', 'Борг', 'text-right hidden md:table-cell')}
                            {sortTh('owner', 'Відповідальний', 'hidden xl:table-cell')}
                            <th className={`${T.th} w-px`} />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sorted.slice(0, tableLimit).map(o => {
                            const act = activity[o.custom_id];
                            const stage = getStageConfig(o.workflow_stage);
                            const status = getObjectStatus(o.status);
                            const cur = o.currency || DEFAULT_CURRENCY;
                            const debt = isReceivable(o) ? debtOf(o) : 0;
                            const owner = ownerOf(o);
                            return (
                                <tr key={o.custom_id} onClick={(e) => openObject(o, e)} className="hover:bg-slate-50 cursor-pointer">
                                    <td className={`${T.td} max-w-[320px]`}>
                                        <div className="font-semibold text-slate-900 truncate">{objectTitle(o)}</div>
                                        <div className="text-[11.5px] text-slate-400 truncate">
                                            СЕС-{o.custom_id}{o.client?.populated_place ? ` · ${o.client.populated_place}` : ''}
                                        </div>
                                    </td>
                                    <td className={T.td}>
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <Chip tone={stage.tone || 'neutral'}>{stage.label}</Chip>
                                            {!isObjectActive(o.status) || o.status === 'on_hold'
                                                ? <Chip tone={status.tone}>{status.short}</Chip> : null}
                                        </div>
                                        {o.status === 'lost' && o.lost_reason && (
                                            <div className="text-[11.5px] text-slate-400 mt-0.5 truncate max-w-[180px]">{getLostReasonLabel(o.lost_reason)}</div>
                                        )}
                                    </td>
                                    <td className={`${T.td} text-right whitespace-nowrap`}>
                                        {act && isObjectActive(o.status) ? (
                                            <Tip text={ageText(o, act, norms[normalizeGroupKey(o.workflow_stage)])}><Chip tone={o.status === 'on_hold' ? 'neutral' : stageTone(act.stageDays, norms[normalizeGroupKey(o.workflow_stage)])}>{act.stageDays} дн</Chip></Tip>
                                        ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className={`${T.td} text-right tabular-nums hidden lg:table-cell whitespace-nowrap ${ageTone(act?.idleDays) === 'danger' ? 'text-rose-600' : 'text-slate-500'}`}>
                                        {act ? (act.idleDays === 0 ? 'сьогодні' : `${act.idleDays} дн тому`) : '—'}
                                    </td>
                                    <td className={`${T.td} text-right tabular-nums hidden md:table-cell whitespace-nowrap`}>{kw(o.capacity_kw) || '—'}</td>
                                    <td className={`${T.td} text-right tabular-nums hidden md:table-cell whitespace-nowrap`}>
                                        {costOf(o) > 0 ? formatMoney(costOf(o), cur) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className={`${T.td} text-right tabular-nums hidden md:table-cell whitespace-nowrap`}>
                                        {debt > 0 ? <b className="text-rose-600">{formatMoney(debt, cur)}</b>
                                            : costOf(o) > 0 && paidOf(o) >= costOf(o) ? <span className="text-emerald-600 text-[12px] font-semibold">сплачено</span>
                                                : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className={`${T.td} hidden xl:table-cell whitespace-nowrap`}>{owner?.name || <span className="text-slate-300">—</span>}</td>
                                    <td className={`${T.td} whitespace-nowrap`} onClick={e => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                            {canEditObj && <IconBtn icon={FaUserEdit} label="Редагувати" onClick={() => handleEditProject(o)} />}
                                            {canDelete && (
                                                <IconBtn variant="softDanger" icon={FaTrash} label="Видалити"
                                                    onClick={() => handleDelete(o.custom_id, objectTitle(o))} />
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {sorted.length > tableLimit && (
                    <div className="p-3 text-center">
                        <Btn variant="soft" onClick={() => setTableLimit(l => l + TABLE_LIMIT)}>
                            Показати ще {Math.min(TABLE_LIMIT, sorted.length - tableLimit)} з {sorted.length - tableLimit}
                        </Btn>
                    </div>
                )}
            </div>
        </div>
    );

    const renderBoard = () => (
        // На телефоні колонки займають майже весь екран і гортаються самі; шапка сторінки йде вгору
        <div className="h-[80dvh] lg:h-full flex gap-3 overflow-x-auto custom-scrollbar pb-1 snap-x">
            {columns.map(c => (
                <BoardColumn
                    key={c.group.key}
                    col={c}
                    activity={activity}
                    readiness={readiness}
                    norm={norms[c.group.key]}
                    ownerOf={ownerOf}
                    brigadierOf={brigadierOf}
                    onOpen={openObject}
                    onLost={lostReady && canEditObj ? (o) => setLostTarget({ o, reason: '', comment: '', error: '' }) : null}
                />
            ))}
        </div>
    );

    return (
        <Layout>
            <div className="lg:h-full flex flex-col lg:min-h-0 text-slate-800">

                {/* --- ШАПКА: вигляд, пошук, фільтр, новий об'єкт --- */}
                <div className="px-3 sm:px-5 pt-4 pb-2.5 flex-none space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mr-1">Об'єкти</h1>
                        <div className="inline-flex bg-white rounded-lg p-0.5 border border-slate-200">
                            {[{ v: 'board', l: 'Воронка', icon: FaColumns }, { v: 'table', l: 'Таблиця', icon: FaTable }].map(o => (
                                <button
                                    key={o.v}
                                    type="button"
                                    onClick={() => setParam('view', o.v === 'board' ? null : o.v)}
                                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-[12.5px] font-semibold transition-colors
                                        ${view === o.v ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                                >
                                    <o.icon size={11} /> {o.l}
                                </button>
                            ))}
                        </div>
                        {view === 'board' && (
                            <select value={boardOrder} onChange={e => changeOrder(e.target.value)} aria-label="Порядок карток"
                                className="h-9 pl-2.5 pr-7 rounded-lg border border-slate-200 bg-white text-[12.5px] font-semibold text-slate-700">
                                {BOARD_ORDERS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                            </select>
                        )}
                        <div className="flex-1" />
                        <SearchInput
                            value={searchTerm}
                            onChange={setSearchTerm}
                            placeholder="Номер, назва, клієнт, місто…"
                            className="w-full sm:w-56 2xl:w-72 order-last sm:order-none"
                        />
                        <Btn variant={showFilters || !activeView ? 'primary' : 'outline'} icon={FaFilter} onClick={() => setShowFilters(v => !v)}>
                            Фільтр
                        </Btn>
                        {canAdd && (
                            <Btn variant="accent" icon={FaPlus} onClick={handleAddProject}>
                                <span className="hidden sm:inline">Новий об'єкт</span>
                            </Btn>
                        )}
                    </div>

                    {/* Збережені вигляди */}
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                        {views.map(v => {
                            const on = activeView?.key === v.key;
                            const mine = v.key.startsWith('my-');
                            return (
                                <span key={v.key} className="relative flex-shrink-0 group">
                                    <button
                                        type="button"
                                        onClick={() => pickView(v)}
                                        className={`inline-flex items-center gap-1.5 h-8 rounded-full border text-[12.5px] font-semibold transition-colors whitespace-nowrap
                                            ${mine ? 'pl-3 pr-7' : 'px-3'}
                                            ${on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'}`}
                                    >
                                        {mine && <FaBookmark size={9} className={on ? 'text-indigo-200' : 'text-slate-400'} />}
                                        {v.label}
                                        <span className={`tabular-nums text-[11.5px] ${on ? 'text-indigo-200' : 'text-slate-400'}`}>{loading ? '' : counts[v.key]}</span>
                                    </button>
                                    {mine && (
                                        <button
                                            type="button"
                                            onClick={() => removeView(v.key)}
                                            aria-label={`Видалити вигляд «${v.label}»`}
                                            title="Видалити вигляд"
                                            className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center
                                                ${on ? 'text-indigo-200 hover:bg-white/20' : 'text-slate-400 hover:bg-slate-100'}`}
                                        >
                                            <FaTimes size={9} />
                                        </button>
                                    )}
                                </span>
                            );
                        })}

                        {!activeView && !filterIsDefault && (naming === null ? (
                            <button
                                type="button"
                                onClick={() => setNaming('')}
                                className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-dashed border-slate-300 text-[12.5px] font-semibold text-slate-500 hover:text-slate-800 hover:border-slate-400"
                            >
                                <FaPlus size={9} /> Зберегти вигляд
                            </button>
                        ) : (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full border border-indigo-300 bg-white">
                                <input
                                    autoFocus
                                    value={naming}
                                    onChange={e => setNaming(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveView(); if (e.key === 'Escape') setNaming(null); }}
                                    placeholder="Назва вигляду"
                                    className="w-36 text-[12.5px] outline-none bg-transparent"
                                />
                                <button type="button" onClick={saveView} aria-label="Зберегти" className="w-6 h-6 rounded-full flex items-center justify-center text-indigo-600 hover:bg-indigo-50"><FaCheck size={10} /></button>
                                <button type="button" onClick={() => setNaming(null)} aria-label="Скасувати" className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100"><FaTimes size={10} /></button>
                            </span>
                        ))}
                    </div>

                    <AnimatePresence>
                        {showFilters && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <Card className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                    <div>
                                        <span className={T.label}>Статус</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {STATUS_OPTIONS.map(s => (
                                                <button key={s.v} onClick={() => patchFilter({ status: s.v })} className={chipBtn(filter.status === s.v)}>{s.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className={T.label}>Етап</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {[{ key: 'all', label: 'Усі' }, ...STAGE_GROUPS].map(s => (
                                                <button key={s.key} onClick={() => patchFilter({ stage: s.key })} className={chipBtn(filter.stage === s.key)}>{s.label}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className={T.label}>Оплата і компанія</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {PAYMENT_OPTIONS.map(s => (
                                                <button key={s.v} onClick={() => patchFilter({ payment: s.v })} className={chipBtn(filter.payment === s.v, 'green')}>{s.l}</button>
                                            ))}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {[{ v: 'all', l: 'Усі компанії' }, ...COMPANIES.map(c => ({ v: c.key, l: c.short }))].map(c => (
                                                <button key={c.v} onClick={() => patchFilter({ company: c.v })} className={chipBtn(filter.company === c.v)}>{c.l}</button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <span className={T.label}>Лише</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {[
                                                ...(myEmployeeId ? [{ k: 'mine', l: 'Мої' }] : []),
                                                { k: 'stale', l: `Без руху > ${STALE_DAYS} дн` },
                                                { k: 'nocost', l: 'Без вартості' },
                                                { k: 'debt', l: 'Дебіторка' },
                                            ].map(t => (
                                                <button key={t.k} onClick={() => patchFilter({ [t.k]: !filter[t.k] })} className={chipBtn(filter[t.k])}>{t.l}</button>
                                            ))}
                                        </div>
                                        <span className={`${T.label} block mt-3`}>Активність</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {ACTIVITY_OPTIONS.map(a => (
                                                <button key={a.v} onClick={() => patchFilter({ activity: a.v })} className={chipBtn(filter.activity === a.v)}>{a.l}</button>
                                            ))}
                                        </div>
                                        <span className={`${T.label} block mt-3`}>Створено</span>
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {CREATED_OPTIONS.map(a => (
                                                <button key={a.v} onClick={() => patchFilter({ created: a.v })} className={chipBtn(filter.created === a.v)}>{a.l}</button>
                                            ))}
                                        </div>
                                        {!filterIsDefault && (
                                            <button type="button" onClick={() => pickView(views[0])} className="mt-3 text-[12px] font-semibold text-slate-500 hover:text-slate-800 underline underline-offset-2">
                                                Скинути фільтри
                                            </button>
                                        )}
                                    </div>
                                </Card>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* --- ВОРОНКА / ТАБЛИЦЯ --- */}
                <div className="lg:flex-1 lg:min-h-0 px-3 sm:px-5 pb-3">
                    {loading ? (
                        <div className="h-full flex gap-3 overflow-hidden">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="w-[272px] flex-shrink-0 bg-slate-200/60 rounded-xl"><Skeleton rows={6} /></div>
                            ))}
                        </div>
                    ) : visible.length === 0 ? (
                        <Card>
                            <EmptyState icon={FaProjectDiagram} title="Об'єктів не знайдено" hint="Спробуйте інший вигляд або пошуковий запит." />
                        </Card>
                    ) : view === 'board' ? renderBoard() : renderTable()}
                </div>

                {/* --- «ВТРАЧЕНО?» --- */}
                <Modal
                    isOpen={!!lostTarget}
                    onClose={() => setLostTarget(null)}
                    title="Угода не відбулась?"
                    subtitle={lostTarget ? `СЕС-${lostTarget.o.custom_id} · ${objectTitle(lostTarget.o)}` : ''}
                    size="sm"
                    onSubmit={saveLost}
                    footer={<>
                        <Btn variant="outline" onClick={() => setLostTarget(null)}>Скасувати</Btn>
                        <Btn variant="outline" icon={FaPause} onClick={savePause}>На паузу</Btn>
                        <Btn variant="danger" onClick={saveLost}>Позначити «Втрачено»</Btn>
                    </>}
                >
                    {lostTarget && (() => {
                        const o = lostTarget.o;
                        const act = activity[o.custom_id];
                        const facts = [
                            ['Етап', `${getStageGroup(o.workflow_stage)?.label || '—'}${act?.stageDays != null ? ` · ${act.stageDays} дн` : ''}`],
                            ['Сума', costOf(o) > 0 ? formatMoney(costOf(o), o.currency || DEFAULT_CURRENCY) : '—'],
                            ['Відповідальний', ownerOf(o)?.name || '—'],
                            ['Остання дія', act?.lastActivityAt ? fmtDate(act.lastActivityAt) : '—'],
                        ];
                        return (
                            <div className="mb-4 grid grid-cols-2 gap-2">
                                {facts.map(([l, v]) => (
                                    <div key={l} className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                                        <div className="text-[11px] font-semibold text-slate-500">{l}</div>
                                        <div className="text-[13px] font-bold text-slate-800 break-words">{v}</div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                    {lostTarget && (
                        <LostReasonPicker
                            reason={lostTarget.reason}
                            comment={lostTarget.comment}
                            error={lostTarget.error}
                            onChange={({ reason, comment }) => setLostTarget(t => ({ ...t, reason, comment, error: reason ? '' : t.error }))}
                        />
                    )}
                </Modal>

                {/* --- ФОРМА: ВИСУВНА ПАНЕЛЬ --- */}
                <Drawer
                    isOpen={showProjectForm} onClose={handleCloseForm}
                    title={editingProject ? 'Редагувати об\'єкт' : 'Новий об\'єкт'}
                    subtitle={editingProject ? `СЕС-${editingProject.custom_id}` : "Заповніть основні дані — решту можна додати пізніше"}
                    size="lg"
                    onSubmit={() => { if (!submitting) handleSubmit(); }}
                    submitHint="зберегти"
                    footer={<>
                        <Btn variant="outline" onClick={handleCloseForm}>Скасувати</Btn>
                        <Btn variant="accent" onClick={handleSubmit} disabled={submitting}>
                            {submitting ? 'Збереження…' : 'Зберегти'}
                        </Btn>
                    </>}
                >
                    <div className="space-y-5">

                        {/* Клієнт */}
                        <div className="space-y-2">
                            <span className={T.label}>Клієнт <span className="text-rose-500">*</span></span>
                            <Picker
                                options={clientOptions}
                                value={formData.client_id}
                                onChange={(v) => { handleInputChange('client_id', v); setFormErrors(p => ({ ...p, client_id: '' })); }}
                                placeholder="Оберіть клієнта…"
                                searchPlaceholder="Пошук клієнта…"
                                icon={FaUserFriends}
                                onAddNew={(q) => { setInlineClient(c => ({ ...c, name: q })); setShowInlineClientForm(true); }}
                                addLabel="Створити клієнта"
                            />
                            {formErrors.client_id && <div className="text-[11px] font-bold text-rose-600">{formErrors.client_id}</div>}

                            {showInlineClientForm && !editingProject && (
                                <div className={`${T.inset} p-3 space-y-2.5`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-bold text-slate-700">Новий клієнт</span>
                                        <IconBtn variant="ghost" icon={FaTimes} label="Прибрати" onClick={() => setShowInlineClientForm(false)} />
                                    </div>
                                    <Field label="Ім'я / назва клієнта" required>
                                        <input className={T.input} value={inlineClient.name}
                                            placeholder="Напр. Петро Іванов або ТОВ «Ромашка»"
                                            onChange={(e) => setInlineClient(p => ({ ...p, name: e.target.value }))} />
                                    </Field>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        <Field label="Компанія">
                                            <input className={T.input} value={inlineClient.company_name}
                                                placeholder="Необов'язково"
                                                onChange={(e) => setInlineClient(p => ({ ...p, company_name: e.target.value }))} />
                                        </Field>
                                        <Field label="Телефон">
                                            <input className={T.input} value={inlineClient.phone}
                                                placeholder="+380…"
                                                onChange={(e) => setInlineClient(p => ({ ...p, phone: e.target.value }))} />
                                        </Field>
                                    </div>
                                </div>
                            )}
                        </div>

                        <Field label="Назва об'єкта">
                            <input className={T.input} value={formData.name || ''}
                                onChange={(e) => handleInputChange('name', e.target.value)} />
                        </Field>

                        {editingProject && (
                            <div className={`${T.inset} p-3 grid grid-cols-1 sm:grid-cols-2 gap-3`}>
                                <Field label="Статус виконання">
                                    <select className={T.select} value={formData.status || ''} onChange={(e) => handleInputChange('status', e.target.value)}>
                                        {OBJECT_STATUSES
                                            .filter(s => s.key !== 'lost' || lostReady || formData.status === 'lost')
                                            .map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                    </select>
                                </Field>
                                <Field label="Етап">
                                    <select className={T.select} value={formData.workflow_stage || 'tech_review'} onChange={(e) => handleInputChange('workflow_stage', e.target.value)}>
                                        {STAGE_GROUPS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                        {/* Старий етап (напр. «Мережа») лишаємо видимим, щоб збереження його не стерло */}
                                        {!STAGE_GROUPS.some(s => s.key === formData.workflow_stage) && formData.workflow_stage && (
                                            <option value={formData.workflow_stage}>{getStageConfig(formData.workflow_stage).label}</option>
                                        )}
                                    </select>
                                </Field>
                                {lostReady && formData.status === 'lost' && (
                                    <div className="sm:col-span-2">
                                        <LostReasonPicker
                                            reason={formData.lost_reason}
                                            comment={formData.lost_comment}
                                            error={formErrors.lost_reason}
                                            onChange={({ reason, comment }) => {
                                                setFormData(prev => ({ ...prev, lost_reason: reason, lost_comment: comment }));
                                                if (reason) setFormErrors(p => ({ ...p, lost_reason: '' }));
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Параметри станції */}
                        <div className="space-y-2.5">
                            <span className={T.label}>Параметри станції</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Тип монтажу">
                                    <select className={T.select} value={formData.mount_type || ''} onChange={(e) => handleInputChange('mount_type', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        <option value="Дахове кріплення (Скатний дах)">Дахове кріплення (Скатний дах)</option>
                                        <option value="Дахове кріплення (Плоский дах)">Дахове кріплення (Плоский дах)</option>
                                        <option value="Наземне кріплення">Наземне кріплення</option>
                                        <option value="Трекерна система">Трекерна система</option>
                                        <option value="Дах/Земля">Дах/Земля</option>
                                        <option value="Електромонтаж">Електромонтаж</option>
                                        <option value="Інше">Інше</option>
                                    </select>
                                </Field>
                                <Field label="Тип станції">
                                    <select className={T.select} value={formData.station_type || ''} onChange={(e) => handleInputChange('station_type', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        {STATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </Field>
                                <Field label="Потужність (кВт)">
                                    <input type="number" step="0.1" min="0" className={T.input} value={formData.capacity_kw || ''}
                                        onChange={(e) => handleInputChange('capacity_kw', e.target.value)} />
                                </Field>
                                <Field label="К-сть фаз">
                                    <select className={T.select} value={formData.quant_phase || ''} onChange={(e) => handleInputChange('quant_phase', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                                    </select>
                                </Field>
                                <Field label="GPS-посилання" className="sm:col-span-2">
                                    <input type="url" className={T.input} value={formData.gps_link || ''}
                                        onChange={(e) => handleInputChange('gps_link', e.target.value)} />
                                </Field>
                            </div>
                        </div>

                        {/* Відповідальний і компанія */}
                        <div className="space-y-2.5">
                            <span className={T.label}>Відповідальний і компанія</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <Field label="Відповідальний менеджер">
                                    <Picker options={employeeOptions} value={formData.responsible_emp_id}
                                        onChange={(v) => handleInputChange('responsible_emp_id', v)}
                                        placeholder="Оберіть менеджера…" searchPlaceholder="Пошук…" icon={FaUserEdit} />
                                </Field>
                                <Field label="Відповідальний бригадир">
                                    <Picker options={brigadierOptions(employees, formData.brigadier_emp_id)} value={formData.brigadier_emp_id}
                                        onChange={(v) => handleInputChange('brigadier_emp_id', v)}
                                        placeholder="Оберіть бригадира…" searchPlaceholder="Пошук…" icon={FaHardHat} />
                                </Field>
                                <Field label="Компанія">
                                    <select className={T.select} value={formData.working_company || ''} onChange={(e) => handleInputChange('working_company', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        {COMPANIES.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
                                    </select>
                                </Field>
                                <Field label="Через банк?">
                                    <select className={T.select} value={formData.bank || ''} onChange={(e) => handleInputChange('bank', e.target.value)}>
                                        <option value="">Виберіть…</option>
                                        <option value="Так">Так</option>
                                        <option value="Ні">Ні</option>
                                    </select>
                                </Field>
                                {formData.bank === 'Так' && (
                                    <Field label="Який банк" className="sm:col-span-2">
                                        <input className={T.input} list="kcore-banks" value={formData.bank_name || ''}
                                            placeholder="Ощадбанк" onChange={(e) => handleInputChange('bank_name', e.target.value)} />
                                        <datalist id="kcore-banks">{BANKS.map(b => <option key={b} value={b} />)}</datalist>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                            {BANKS.slice(0, 6).map(b => (
                                                <button key={b} type="button" onClick={() => handleInputChange('bank_name', b)}
                                                    className={`h-7 px-2.5 rounded-full border text-[12px] font-semibold ${formData.bank_name === b ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                                    {b}
                                                </button>
                                            ))}
                                        </div>
                                    </Field>
                                )}
                            </div>
                        </div>

                        {/* Фінанси — лише тим, хто бачить гроші цієї угоди */}
                        {!editingProject?._moneyHidden && <div className="space-y-2.5">
                            <span className={`${T.label} inline-flex items-center gap-1.5`}><FaMoneyBillWave size={10} /> Фінанси</span>
                            {moneyReady ? (
                                <div className="space-y-2.5">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field label="Вартість угоди" hint="«Оплачено» і статус оплати рахуються самі з платежів, внесених у картці об'єкта.">
                                            <input type="number" min="0" step="0.01" className={T.input} value={formData.total_cost || ''}
                                                onChange={(e) => handleInputChange('total_cost', e.target.value)} />
                                        </Field>
                                        <div>
                                            <span className={`${T.label} block mb-1`}>Валюта</span>
                                            <Segmented
                                                options={CURRENCIES.map(c => ({ value: c.key, label: `${c.symbol} ${c.label}` }))}
                                                value={formData.currency || DEFAULT_CURRENCY}
                                                onChange={(v) => handleInputChange('currency', v)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3">
                                    <Field label="Вартість (USD)">
                                        <input type="number" min="0" step="0.01" className={T.input} value={formData.total_cost || ''}
                                            onChange={(e) => handleInputChange('total_cost', e.target.value)} />
                                    </Field>
                                    <Field label="Сплачено (USD)">
                                        <input type="number" min="0" step="0.01" className={T.input} value={formData.paid_amount || ''}
                                            onChange={(e) => handleInputChange('paid_amount', e.target.value)} />
                                    </Field>
                                </div>
                            )}
                        </div>}

                        <Field label="Примітки">
                            <textarea rows="3" className={`${T.input} h-auto py-2 resize-none`} value={formData.notes || ''}
                                onChange={(e) => handleInputChange('notes', e.target.value)} />
                        </Field>
                    </div>
                </Drawer>
            </div>
        </Layout>
    );
}
