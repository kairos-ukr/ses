// =====================================================================
//  K-CORE · Картка об'єкта
//
//  Зверху — 7 макроетапів із днями на кожному. Під ними блок
//  «Наступний крок»: що зараз тримає об'єкт і що з цим зробити
//  (одна-три дії). Праворуч гроші, матеріали, клієнт і відповідальний —
//  те, про що питають найчастіше. Нижче — факти про станцію та
//  історія однією стрічкою (зміни етапів, записи, платежі).
//  Етапи, документи й оцифрована КП — окремі вкладки (?tab=…).
//  Редагування — висувна панель, а не перемикання всієї сторінки.
// =====================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  FaArrowLeft, FaEdit, FaPhone, FaMapMarkerAlt, FaSun, FaCheck, FaBoxes, FaExternalLinkAlt,
  FaFileInvoiceDollar, FaTrash, FaUndo, FaPlus, FaClock, FaPaperPlane, FaArrowRight,
  FaExclamationTriangle, FaPause, FaFlagCheckered, FaHardHat, FaTelegramPlane, FaCommentAlt, FaUserTie, FaHistory,
  FaClipboardCheck,
} from "react-icons/fa";

import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";
import {
  T, Btn, Chip, Field, Drawer, Picker, Tip, Bar, Spinner, Linkify,
  useToast, useConfirm, humanError,
} from "./ui";
import {
  STAGE_GROUPS, normalizeGroupKey, getStageGroupLabel, tasksOfGroup, TASK_ORDER,
  getTaskLabel, normalizeTaskStatus, taskStatusMeta, taskDefaultStatus, isTaskDone, getTask,
} from "./domain/stages";
import {
  OBJECT_STATUSES, getObjectStatus, isObjectActive, getLostReasonLabel, getPaymentStatus,
  DEFAULT_CURRENCY, formatMoney, COMPANIES, BANKS, getCompany, STATION_TYPES, managerOptions,
  brigadierOptions, canSeeMoney, isOwnObject,
} from "./domain/objects";
import { stageTone, normText, loadStageNorms, daysSince, stageIndex, kw, LONG_DAYS } from "./domain/pipeline";
import { hasLostDeals, hasMoneyCurrency, hasCommercialOffers, hasChangeLog } from "./utils/features";
import { describeChange } from "./domain/changes";
import LostReasonPicker from "./LostReasonPicker";
import ObjectProfitPanel from "./ObjectProfitPanel";
import ObjectReports from "./pages/ObjectReports";

import ProjectDocuments, { prefetchDocuments } from "./ProjectDocumentsPage";
import ProjectWorkflow from "./PWT";
import CommercialOfferPanel from "./CommercialOfferPanel";
import Layout from "./Layout";
import PaymentForm, { methodLabel } from "./pages/PaymentForm";

const formatDate = (date) => (date ? new Date(date).toLocaleDateString('uk-UA') : '—');
const formatShort = (date) => (date ? new Date(date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '');
const formatDateTime = (date) => (date ? new Date(date).toLocaleString('uk-UA', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '');

const DAY = 86400000;
const daysBetween = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / DAY)) : null);

/* ---------------------------------------------------------------------
 *  «НАСТУПНИЙ КРОК» — людські назви дій для кожного підетапу
 * ------------------------------------------------------------------- */

const NEXT_TITLES = {
  tech_review: (s) => (s === 'waiting_client' ? 'Отримати від клієнта дані для замірів' : 'Провести заміри'),
  project_design: () => 'Зробити 3D-візуалізацію',
  project_approval: () => 'Погодити з клієнтом варіант дизайну',
  tech_project: () => 'Підготувати технічне креслення',
  commercial_proposal: (s) => (s === 'created' ? 'Отримати рішення клієнта по КП' : 'Підготувати комерційну пропозицію'),
  equipment: (s) => (s === 'ordered' ? 'Дочекатися приходу обладнання' : 'Замовити обладнання'),
  complectation: () => 'Скомплектувати матеріали',
  comp_protection: () => 'Скомплектувати електрозахист',
  inst_structure: () => 'Змонтувати конструкцію',
  inst_panels: () => 'Встановити панелі',
  inst_cabling: () => 'Прокласти трасу DC',
  inst_grounding: () => 'Зробити заземлення',
  inst_inverter: () => 'Підключити інвертор',
  monitoring_setup: () => 'Запустити станцію і налаштувати моніторинг',
};

// Етапи, до яких угода ще може «не відбутися»
const PRE_DEAL = ['tech_review', 'project', 'proposal'];

const NEXT_TONE = {
  danger: 'border-rose-200 bg-rose-50/60',
  warn: 'border-amber-200 bg-amber-50/60',
  neutral: 'border-indigo-200 bg-indigo-50/50',
  ok: 'border-emerald-200 bg-emerald-50/60',
  muted: 'border-slate-200 bg-slate-50',
};
const NEXT_ICON_TONE = {
  danger: 'bg-rose-100 text-rose-600',
  warn: 'bg-amber-100 text-amber-700',
  neutral: 'bg-indigo-100 text-indigo-600',
  ok: 'bg-emerald-100 text-emerald-700',
  muted: 'bg-slate-200 text-slate-500',
};

/* ---------------------------------------------------------------------
 *  ІСТОРІЯ: опис події робочого процесу
 * ------------------------------------------------------------------- */

const isStageSwitch = (e) => e.new_status === 'active' && (!e.old_status || e.comment === 'Changed active stage');

const describeEvent = (e) => {
  if (isStageSwitch(e)) return `перевів об'єкт на етап «${getStageGroupLabel(e.stage_key)}»`;
  const meta = taskStatusMeta(e.stage_key, e.new_status);
  return `${getTaskLabel(e.stage_key)}: ${meta.label}`;
};

/* =====================================================================
 *  СТОРІНКА
 * ===================================================================== */

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const auth = useAuth();
  const { role, tier, employee: me, user } = auth;
  // Доступи → «Об'єкти» (зміни); бригадир редагує свій об'єкт, як і раніше
  const canEdit = auth.can('objects', 'edit') || (role === 'installer' && tier === 1);
  const objectsAll = auth.canAll('objects');
  const myCid = me?.custom_id ?? null;
  const confirm = useConfirm();
  const showToast = useToast();

  // Вмикаються самі після міграцій (src/utils/features.js)
  const [lostReady, setLostReady] = useState(false);
  const [moneyReady, setMoneyReady] = useState(false);
  const [offersReady, setOffersReady] = useState(false);
  useEffect(() => {
    hasLostDeals().then(setLostReady);
    hasMoneyCurrency().then(setMoneyReady);
    hasCommercialOffers().then(setOffersReady);
  }, []);
  // КП і «Прибуток» (собівартість, ставки) — за доступами «Комерційні пропозиції» й «Собівартість і прибуток»
  const canSeeOffer = auth.can('offers') && offersReady;
  const canSeeProfit = auth.can('profit');

  const tab = ['workflow', 'reports', 'documents', ...(canSeeOffer ? ['offer'] : []), ...(canSeeProfit ? ['profit'] : [])].includes(params.get('tab')) ? params.get('tab') : 'overview';
  const setTab = (t) => setParams(prev => {
    const p = new URLSearchParams(prev);
    if (t === 'overview') p.delete('tab'); else p.set('tab', t);
    return p;
  }, { replace: true });

  // Дані
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [events, setEvents] = useState([]);
  const [stages, setStages] = useState({});           // stage_key → { status, responsibleId }
  const [activity, setActivity] = useState(null);     // { stage_entered_at, last_activity_at }
  const [readiness, setReadiness] = useState(null);   // % забезпечення; null — специфікації немає
  const [clientObjects, setClientObjects] = useState(0);
  const [norms, setNorms] = useState({});             // норма днів на етап
  const [changes, setChanges] = useState([]);         // журнал змін по обʼєкту (хто змінив вартість, статус…)
  const [reports, setReports] = useState([]);         // денні звіти бригад (додаток «Монтаж»)

  // Дії
  const [busy, setBusy] = useState(false);
  const [lostDraft, setLostDraft] = useState(null);   // { reason, comment } — панель «Угода не відбулась»
  const [lostError, setLostError] = useState('');
  const [noteText, setNoteText] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const [feedLimit, setFeedLimit] = useState(25);
  const [allPayments, setAllPayments] = useState(false);
  const stepperRef = useRef(null);

  // Редагування
  const [editOpen, setEditOpen] = useState(false);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  // Платіж
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  /* ---------------- ЗАВАНТАЖЕННЯ ---------------- */

  const loadNotes = useCallback(async () => {
    const { data } = await supabase.from('project_additional_info')
      .select('*').eq('installation_custom_id', id).order('created_at', { ascending: false });
    setNotes(data || []);
  }, [id]);

  const loadPayments = useCallback(async () => {
    const { data } = await supabase.from('payment_history')
      .select('*').eq('installation_custom_id', id).order('paid_at', { ascending: false });
    setPayments(data || []);
  }, [id]);

  const loadWorkflow = useCallback(async () => {
    const [ev, st, act, rep] = await Promise.all([
      supabase.from('workflow_events')
        .select('id, stage_key, old_status, new_status, comment, actor, created_at, photos')
        .eq('installation_custom_id', id).order('created_at', { ascending: false }),
      supabase.from('project_stages')
        .select('stage_key, status, responsible_emp_custom_id, updated_at').eq('installation_custom_id', id),
      supabase.from('v_object_activity')
        .select('stage_entered_at, last_activity_at').eq('installation_custom_id', id).maybeSingle(),
      supabase.from('installer_reports')
        .select('id, work_date, author_id, done_stages, comment, day_status, photos, money_amount, money_currency, submitted_at')
        .eq('installation_custom_id', id).not('submitted_at', 'is', null),
    ]);
    setEvents(ev.data || []);
    setReports(rep.error ? [] : (rep.data || []));
    if (await hasChangeLog()) {
      const { data: log } = await supabase.from('change_log')
        .select('*').eq('installation_custom_id', id).order('created_at', { ascending: false }).limit(150);
      setChanges(log || []);
    }
    const map = {};
    (st.data || []).forEach(s => { map[s.stage_key] = { status: s.status, responsibleId: s.responsible_emp_custom_id, updatedAt: s.updated_at }; });
    setStages(map);
    setActivity(act.error ? null : act.data);
  }, [id]);

  const loadProject = useCallback(async () => {
    const { data, error } = await supabase
      .from('installations')
      .select(`
        *,
        client:clients!installations_client_id_fkey (
          custom_id, name, company_name, phone, oblast, populated_place, notes,
          object_type, is_subcontract, contractor_company, first_contact
        ),
        responsible_employee:employees!installations_responsible_emp_id_fkey (*)
      `)
      .eq('custom_id', id)
      .single();
    if (error) throw error;
    setProject(data);
    prefetchDocuments(data.custom_id);   // документи вантажимо заздалегідь — вкладка відкриється одразу
    return data;
  }, [id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadProject();
      if (!data) {
        showToast('Об\'єкт не знайдено', 'error');
        navigate('/installations');
        return;
      }
      // Доступ «лише свої об'єкти»: чужий не відкриваємо
      if (!objectsAll && !isOwnObject(data, myCid)) {
        showToast('Цей об\'єкт вам не відкрито', 'error');
        navigate('/installations');
        return;
      }
      const [, , , , needs, sameClient] = await Promise.all([
        loadNotes(),
        loadPayments(),
        loadStageNorms().then(setNorms),
        loadWorkflow(),
        supabase.from('v_object_material_needs')
          .select('required_quantity, reserved_quantity, issued_quantity').eq('installation_custom_id', id),
        data.client_id
          ? supabase.from('installations').select('custom_id', { count: 'exact', head: true }).eq('client_id', data.client_id)
          : Promise.resolve({ count: 0 }),
      ]);
      const list = needs.data || [];
      if (list.length) {
        let sum = 0;
        list.forEach(n => {
          const req = parseFloat(n.required_quantity) || 1;
          const got = (parseFloat(n.reserved_quantity) || 0) + (parseFloat(n.issued_quantity) || 0);
          sum += Math.min(100, (got / req) * 100);
        });
        setReadiness(Math.round(sum / list.length));
      } else {
        setReadiness(null);
      }
      setClientObjects(sameClient.count || 0);
    } catch (error) {
      showToast(`Помилка завантаження: ${humanError(error)}`, 'error');
      navigate('/installations');
    } finally {
      setLoading(false);
    }
  }, [id, loadProject, loadNotes, loadPayments, loadWorkflow, navigate, showToast, objectsAll, myCid]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    supabase.from('employees').select('id, custom_id, name, phone, role, tier, access_blocked_at, hidden_from_list').order('name')
      .then(({ data }) => setEmployees(data || []));
  }, []);

  const empById = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const empByCustom = useMemo(() => new Map(employees.map(e => [e.custom_id, e])), [employees]);

  const actorName = me?.name || user?.email || 'Невідомий';

  /* ---------------- ПОХІДНІ ДАНІ ---------------- */

  const objectCurrency = project?.currency || DEFAULT_CURRENCY;
  const cost = Number(project?.total_cost) || 0;
  const paid = Number(project?.paid_amount) || 0;
  const debt = Math.max(0, cost - paid);
  const paidPct = cost > 0 ? Math.min(100, (paid / cost) * 100) : 0;
  // Гроші угоди: тим, кому відкрито фінанси компанії, і відповідальному менеджеру
  const seeMoney = canSeeMoney(auth, project);

  const currentKey = normalizeGroupKey(project?.workflow_stage || 'tech_review');
  const currentIdx = stageIndex(currentKey);
  const currentLabel = getStageGroupLabel(currentKey);
  const stageDays = activity ? daysSince(activity.stage_entered_at) : null;
  const currentNorm = norms[currentKey] || null;

  // Коли об'єкт заходив на кожен макроетап (остання подія «перевели на етап»)
  const enteredAt = useMemo(() => {
    const m = {};
    events.forEach(e => {
      if (!isStageSwitch(e)) return;
      const k = normalizeGroupKey(e.stage_key);
      if (!m[k] || e.created_at > m[k]) m[k] = e.created_at;
    });
    if (!m.tech_review && project?.created_at) m.tech_review = project.created_at;
    return m;
  }, [events, project?.created_at]);

  // Підетапи поточного макроетапу з їхніми статусами
  const taskState = useCallback((key) => {
    const raw = stages[key]?.status;
    const status = raw ? normalizeTaskStatus(key, raw) : taskDefaultStatus(key);
    return { status, meta: taskStatusMeta(key, status), responsibleId: stages[key]?.responsibleId || null };
  }, [stages]);

  const doneTasks = TASK_ORDER.filter(k => stages[k] && isTaskDone(k, stages[k].status)).length;

  /* ---------------- ДІЇ ---------------- */

  const setTaskStatus = async (taskKey, status, comment) => {
    setBusy(true);
    const { error } = await supabase.rpc('update_workflow_stage', {
      p_installation_id: Number(id), p_stage_key: taskKey, p_new_status: status, p_actor: actorName,
      p_comment: comment || '', p_photos: [], p_photo_file_ids: [], p_new_responsible: null, p_set_as_global_stage: false,
    });
    setBusy(false);
    if (error) { showToast(humanError(error), 'error'); return false; }
    await loadWorkflow();
    return true;
  };

  const moveToStage = async (groupKey) => {
    const ok = await confirm({
      title: `Перевести на етап «${getStageGroupLabel(groupKey)}»?`,
      message: `Об'єкт СЕС-${id} стане на цей етап для всієї команди.`,
      confirmLabel: 'Перевести',
    });
    if (!ok) return;
    setBusy(true);
    const { error } = await supabase.rpc('update_workflow_stage', {
      p_installation_id: Number(id), p_stage_key: groupKey, p_new_status: 'active', p_actor: actorName,
      p_comment: '', p_photos: [], p_photo_file_ids: [], p_new_responsible: null, p_set_as_global_stage: true,
    });
    setBusy(false);
    if (error) { showToast(humanError(error), 'error'); return; }
    showToast(`Етап: ${getStageGroupLabel(groupKey)}`);
    await Promise.all([loadProject(), loadWorkflow()]);
  };

  const patchProject = async (patch, message) => {
    setBusy(true);
    const { error } = await supabase.from('installations').update({ ...patch, topic_updated: true }).eq('custom_id', id);
    setBusy(false);
    if (error) { showToast(humanError(error), 'error'); return false; }
    setProject(p => ({ ...p, ...patch }));
    if (message) showToast(message);
    loadWorkflow();
    return true;
  };

  const completeObject = async () => {
    const ok = await confirm({ title: 'Завершити об\'єкт?', message: 'Статус стане «Завершено».', confirmLabel: 'Завершити' });
    if (!ok) return;
    const patch = { status: 'completed' };
    if (!project.end_date) patch.end_date = new Date().toISOString().split('T')[0];
    patchProject(patch, 'Об\'єкт завершено');
  };

  const saveLost = async () => {
    if (!lostDraft?.reason) { setLostError('Оберіть причину'); return; }
    const ok = await patchProject({
      status: 'lost',
      lost_reason: lostDraft.reason,
      lost_comment: (lostDraft.comment || '').trim() || null,
      lost_at: new Date().toISOString(),
      lost_stage: currentKey,
    }, 'Позначено як втрачене');
    if (ok) setLostDraft(null);
  };

  const restoreFromLost = () => patchProject(
    { status: 'planning', lost_reason: null, lost_comment: null, lost_at: null, lost_stage: null },
    'Об\'єкт повернуто в роботу'
  );

  const sendNote = async () => {
    const text = noteText.trim();
    if (!text) return;
    setSendingNote(true);
    const { error } = await supabase.from('project_additional_info').insert({
      installation_custom_id: Number(id),
      message_text: text,
      author_name: actorName,
      is_sent_to_telegram: false, // бот підхопить і відправить у гілку об'єкта
    });
    setSendingNote(false);
    if (error) { showToast(humanError(error), 'error'); return; }
    setNoteText('');
    showToast('Запис додано, бот надішле його в Telegram');
    loadNotes();
  };

  /* ---------------- ПЛАТЕЖІ ---------------- */

  // Після зміни платежів база сама перераховує «оплачено» і статус оплати
  const refreshMoney = async () => {
    const { data } = await supabase.from('installations')
      .select('total_cost, paid_amount, payment_status, currency').eq('custom_id', id).single();
    if (data) setProject(p => ({ ...p, ...data }));
  };

  // Новий платіж — форма прямо в блоці «Фінанси» (PaymentForm), без вікна
  const openPaymentModal = () => {
    setShowPaymentModal(true);
    setTimeout(() => document.getElementById('object-payment-form')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
  };
  const paymentSaved = async () => {
    setShowPaymentModal(false);
    await Promise.all([loadPayments(), refreshMoney()]);
  };

  // Помилково внесений платіж: видаляємо, і «оплачено» перерахується само
  const deletePayment = async (p) => {
    const ok = await confirm({
      title: 'Видалити платіж?',
      message: `${formatMoney(p.amount, p.currency || objectCurrency)} від ${formatDate(p.paid_at)}. «Оплачено» по об'єкту перерахується.`,
      confirmLabel: 'Видалити',
    });
    if (!ok) return;
    const { error } = await supabase.from('payment_history').delete().eq('id', p.id);
    if (error) { showToast(humanError(error), 'error'); return; }
    showToast('Платіж видалено', 'success');
    await Promise.all([loadPayments(), refreshMoney(), loadWorkflow()]);
  };

  /* ---------------- РЕДАГУВАННЯ ---------------- */

  const openEdit = () => { setFormData(project); setEditOpen(true); };
  const setF = (patch) => setFormData(f => ({ ...f, ...patch }));
  const setClientF = (patch) => setFormData(f => ({ ...f, client: { ...f.client, ...patch } }));

  const handleSave = async () => {
    if (!canEdit) { showToast('У вас немає прав на редагування', 'error'); return; }

    // «Втрачено» — тільки з причиною; повернення з «Втрачено» стирає причину
    const draft = { ...formData };
    if (lostReady) {
      const wasLost = project.status === 'lost';
      if (draft.status === 'lost') {
        if (!draft.lost_reason) { showToast('Оберіть, чому угода не відбулась', 'error'); return; }
        if (!wasLost) {
          draft.lost_at = new Date().toISOString();
          draft.lost_stage = currentKey;
        }
      } else if (wasLost) {
        Object.assign(draft, { lost_reason: null, lost_comment: null, lost_at: null, lost_stage: null });
      }
    }

    setSaving(true);
    try {
      // 1. Об'єкт — лише змінені поля. Оплату рахує база з платежів.
      const instUpdates = {};
      const ignoredInstKeys = ['client', 'responsible_employee', 'project_stages', 'id', 'created_at', 'updated_at', 'client_id', 'topic_updated', 'paid_amount', 'payment_status'];
      Object.keys(draft).forEach(key => {
        if (ignoredInstKeys.includes(key)) return;
        if (String(project[key] ?? '') !== String(draft[key] ?? '')) instUpdates[key] = draft[key] === '' ? null : draft[key];
      });
      if (Object.keys(instUpdates).length > 0) {
        instUpdates.topic_updated = true;
        instUpdates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('installations').update(instUpdates).eq('custom_id', id);
        if (error) throw error;
      }

      // 2. Клієнт
      const clientUpdates = {};
      if (formData.client && project.client) {
        Object.keys(formData.client).forEach(key => {
          if (['id', 'created_at', 'updated_at', 'custom_id'].includes(key)) return;
          if (String(project.client[key] ?? '') !== String(formData.client[key] ?? '')) clientUpdates[key] = formData.client[key];
        });
      }
      if (Object.keys(clientUpdates).length > 0) {
        clientUpdates.updated_at = new Date().toISOString();
        const { error } = await supabase.from('clients').update(clientUpdates).eq('custom_id', project.client.custom_id);
        if (error) throw error;
      }

      if (!Object.keys(instUpdates).length && !Object.keys(clientUpdates).length) {
        showToast('Змін немає', 'info');
      } else {
        showToast('Збережено');
        await loadProject();
        loadWorkflow();   // історія і журнал змін
      }
      setEditOpen(false);
    } catch (error) {
      showToast(humanError(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- «НАСТУПНИЙ КРОК» ---------------- */

  // Рахується щоразу заново: дешево, і дії завжди бачать свіжі дані
  const nextStep = (() => {
    if (!project) return null;
    const lostBtn = lostReady && canEdit && PRE_DEAL.includes(currentKey)
      ? { label: 'Втрачено…', variant: 'ghost', onClick: () => { setLostDraft({ reason: '', comment: '' }); setLostError(''); } }
      : null;

    if (project.status === 'lost') {
      return {
        tone: 'muted', icon: FaExclamationTriangle,
        title: 'Угода не відбулась',
        text: [
          `Причина: ${getLostReasonLabel(project.lost_reason)}${project.lost_comment ? ` · ${project.lost_comment}` : ''}`,
          project.lost_at ? `Позначено ${formatDate(project.lost_at)} на етапі «${getStageGroupLabel(project.lost_stage || currentKey)}».` : null,
        ],
        actions: canEdit ? [{ label: 'Повернути в роботу', icon: FaUndo, variant: 'outline', onClick: restoreFromLost }] : [],
      };
    }
    if (project.status === 'cancelled') {
      return { tone: 'muted', icon: FaExclamationTriangle, title: 'Роботи скасовано', text: [], actions: [] };
    }
    if (project.status === 'completed') {
      if (seeMoney && debt > 0.009 && cost > 0) {
        const last = payments[0];
        return {
          tone: 'danger', icon: FaFileInvoiceDollar,
          title: 'Отримати залишок оплати',
          text: [
            `Об'єкт завершено, борг ${formatMoney(debt, objectCurrency)}.`,
            last ? `Останній платіж ${formatDate(last.paid_at)}.` : 'Платежів ще не було.',
          ],
          actions: auth.can('payments', 'add') ? [{ label: 'Додати платіж', icon: FaPlus, variant: 'primary', onClick: openPaymentModal }] : [],
        };
      }
      return { tone: 'ok', icon: FaFlagCheckered, title: 'Об\'єкт завершено', text: [seeMoney && cost > 0 ? 'Оплачено повністю.' : null], actions: [] };
    }
    if (project.status === 'on_hold') {
      return {
        tone: 'warn', icon: FaPause,
        title: 'Об\'єкт на паузі',
        text: [`Етап «${currentLabel}»${stageDays != null ? `, стоїть ${stageDays} дн` : ''}.`],
        actions: [
          ...(canEdit ? [{ label: 'Повернути в роботу', icon: FaUndo, variant: 'primary', onClick: () => patchProject({ status: 'in_progress' }, 'Об\'єкт знову в роботі') }] : []),
          ...(lostBtn ? [lostBtn] : []),
        ],
      };
    }

    // Активний об'єкт: перший невиконаний підетап поточного макроетапу
    const tasks = tasksOfGroup(currentKey).map(t => ({ ...t, ...taskState(t.key) }));
    const pending = tasks.filter(t => !t.meta.done);
    const tone = stageTone(stageDays, currentNorm);
    const ageLine = stageDays == null ? null : currentNorm
      ? `На етапі «${currentLabel}» ${stageDays} дн: ${normText(stageDays, currentNorm)}.`
      : `На етапі «${currentLabel}» ${stageDays} дн${stageDays > LONG_DAYS ? ' — довше за місяць' : ''}.`;
    const moneyLine = seeMoney && cost > 0 && paid === 0 && currentIdx >= stageIndex('equipment')
      ? 'Аванс ще не надходив.' : null;
    const payBtn = moneyLine && auth.can('payments', 'add') ? { label: 'Додати платіж', icon: FaPlus, variant: 'outline', onClick: openPaymentModal } : null;
    const phone = project.client?.phone;
    const callBtn = phone && PRE_DEAL.includes(currentKey)
      ? { label: 'Подзвонити', icon: FaPhone, variant: 'outline', href: `tel:${phone}` } : null;

    // КП «Зроблено» рахується виконаним, але далі рухатись можна лише після згоди клієнта
    const kp = taskState('commercial_proposal');
    if (currentKey === 'proposal' && kp.status === 'created') {
      const kpWho = kp.responsibleId ? empByCustom.get(Number(kp.responsibleId))?.name : null;
      return {
        tone, icon: FaClock,
        title: 'Отримати рішення клієнта по КП',
        text: [
          `КП зроблено${kpWho ? ` (${kpWho})` : ''}, клієнт ще не погодив.`,
          ageLine,
          moneyLine,
        ],
        actions: [
          ...(canEdit ? [{ label: 'Клієнт погодив', icon: FaCheck, variant: 'primary', onClick: () => setTaskStatus('commercial_proposal', 'approved', 'Клієнт погодив КП').then(ok => ok && showToast('КП погоджено')) }] : []),
          ...(callBtn ? [callBtn] : []),
          ...(lostBtn ? [lostBtn] : []),
        ],
      };
    }

    if (!pending.length) {
      const next = STAGE_GROUPS[currentIdx + 1];
      if (next) {
        return {
          tone: 'ok', icon: FaArrowRight,
          title: `«${currentLabel}» виконано — перевести на «${next.label}»`,
          text: [ageLine, moneyLine],
          actions: canEdit ? [
            { label: `Перевести на «${next.label}»`, icon: FaArrowRight, variant: 'primary', onClick: () => moveToStage(next.key) },
            ...(payBtn ? [payBtn] : []),
            { label: 'Відкрити етапи', variant: 'outline', onClick: () => setTab('workflow') },
          ] : [],
        };
      }
      return {
        tone: 'ok', icon: FaFlagCheckered,
        title: 'Запуск виконано — можна завершувати об\'єкт',
        text: [seeMoney && debt > 0.009 && cost > 0 ? `Борг ${formatMoney(debt, objectCurrency)}.` : null],
        actions: canEdit ? [{ label: 'Завершити об\'єкт', icon: FaFlagCheckered, variant: 'primary', onClick: completeObject }] : [],
      };
    }

    const t = pending[0];
    const who = t.responsibleId ? empByCustom.get(Number(t.responsibleId))?.name : null;
    const title = (NEXT_TITLES[t.key] || (() => t.title))(t.status);
    const actions = [];
    if (t.key === 'commercial_proposal' && t.status === 'created' && canEdit) {
      actions.push({ label: 'Клієнт погодив', icon: FaCheck, variant: 'primary', onClick: () => setTaskStatus('commercial_proposal', 'approved', 'Клієнт погодив КП').then(ok => ok && showToast('КП погоджено')) });
    } else {
      actions.push({ label: 'Відкрити етап', icon: FaArrowRight, variant: 'primary', onClick: () => setTab('workflow') });
    }
    if (payBtn) actions.push(payBtn);
    if (callBtn) actions.push(callBtn);
    if (lostBtn) actions.push(lostBtn);

    return {
      tone, icon: FaClock,
      title,
      text: [
        `${t.title}: ${t.meta.label.toLowerCase()}${who ? ` · відповідає ${who}` : ''}.`,
        ageLine,
        t.key === 'complectation' && readiness != null ? `Матеріали забезпечені на ${readiness}%.` : null,
        moneyLine,
      ],
      actions,
    };
  })();

  /* ---------------- ІСТОРІЯ ---------------- */

  const feed = useMemo(() => {
    if (!project) return [];
    const items = [];
    events.forEach(e => {
      const comment = e.comment && e.comment !== 'Changed active stage' ? e.comment : null;
      items.push({
        key: `e-${e.id}`, at: e.created_at, who: e.actor || 'Система', kind: isStageSwitch(e) ? 'stage' : 'task',
        text: describeEvent(e), sub: [comment, e.photos?.length ? `${e.photos.length} файл(и)` : null].filter(Boolean).join(' · '),
      });
    });
    notes.forEach(n => items.push({
      key: `n-${n.id}`, at: n.created_at, who: n.author_name || 'Система', kind: 'note',
      text: n.message_text, sent: n.is_sent_to_telegram,
    }));
    reports.forEach(r => {
      const done = Object.entries(r.done_stages || {}).filter(([, s]) => s)
        .map(([k, s]) => `${getTask(k)?.short || k}${s === 'completed' ? ' ✓' : ' (в роботі)'}`);
      items.push({
        key: `r-${r.id}`, at: r.submitted_at, who: empById.get(r.author_id)?.name || 'Бригада', kind: 'report',
        text: `Звіт монтажу за ${formatDate(r.work_date)}${done.length ? `: ${done.join(', ')}` : ''}`,
        sub: [r.comment, r.photos?.length ? `${r.photos.length} фото` : null,
          seeMoney && r.money_amount != null ? `отримали від клієнта ${formatMoney(r.money_amount, r.money_currency === 'UAH' ? 'UAH' : 'USD')}` : null,
        ].filter(Boolean).join(' · '),
        link: `/project/${id}?tab=reports&r=${r.id}`,
      });
    });
    if (seeMoney) payments.forEach(p => items.push({
      key: `p-${p.id}`, at: p.created_at || p.paid_at, who: empById.get(p.created_by)?.name || 'Платіж', kind: 'payment',
      text: `платіж ${formatMoney(p.amount, p.currency || objectCurrency)}`,
      sub: [formatDate(p.paid_at), p.payment_method, p.comment].filter(Boolean).join(' · '),
    }));
    // Журнал змін. Створення обʼєкта, зміну етапу і нові платежі стрічка вже показує — їх не дублюємо
    const ctx = {
      empName: (cid) => empByCustom.get(Number(cid))?.name,
      clientName: (cid) => (String(cid) === String(project.client_id) ? project.client?.name : null),
    };
    changes.forEach(c => {
      if (c.table_name === 'installations' && c.action === 'insert') return;
      if (c.table_name === 'payment_history' && c.action === 'insert') return;
      if (!seeMoney && (c.table_name === 'payment_history' || c.table_name === 'payment_schedule')) return;
      const shown = { ...c, changes: { ...c.changes } };
      if (c.table_name === 'installations') delete shown.changes.workflow_stage;
      if (c.table_name === 'installations' && !seeMoney) {
        ['total_cost', 'paid_amount', 'payment_status', 'currency', 'total_cost_source'].forEach(k => { delete shown.changes[k]; });
      }
      if (!Object.keys(shown.changes).length) return;
      const d = describeChange(shown, ctx);
      const what = c.table_name === 'installations' ? '' : c.table_name === 'payment_history' ? 'платіж — ' : c.table_name === 'payment_schedule' ? 'графік платежів — ' : `${d.subject} — `;
      items.push({
        key: `c-${c.id}`, at: c.created_at, who: c.actor_name || 'Система', kind: 'change',
        text: `${d.verb} ${what}${d.lines.join('; ')}`,
      });
    });
    items.push({ key: 'created', at: project.created_at, who: 'K-Core', kind: 'created', text: 'Об\'єкт створено' });
    return items.filter(i => i.at).sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [events, notes, payments, changes, reports, project, empById, empByCustom, objectCurrency, seeMoney, id]);

  /* ---------------- ВІДОБРАЖЕННЯ ---------------- */

  // На вузькому екрані смуга етапів гортається — показуємо поточний етап
  useEffect(() => {
    const box = stepperRef.current;
    const el = box?.querySelector('[data-current]');
    if (box && el && box.scrollWidth > box.clientWidth) {
      box.scrollLeft = el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2;
    }
  });

  if (loading) {
    return (
      <Layout>
        <div className="min-h-full flex items-center justify-center py-24">
          <Spinner className="w-8 h-8 text-indigo-500" />
        </div>
      </Layout>
    );
  }
  if (!project) return null;

  const status = getObjectStatus(project.status);
  const paymentInfo = getPaymentStatus(project.payment_status);
  const owner = project.responsible_employee;
  const brigadier = project.brigadier_emp_id != null ? empByCustom.get(Number(project.brigadier_emp_id)) || null : null;
  const client = project.client;
  const place = [client?.populated_place, client?.oblast].filter(Boolean).join(', ');
  let mapLink = project.gps_link;
  if (!mapLink && place) mapLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`;

  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/installations');
  };

  /* --- Смуга етапів --- */
  const renderStepper = () => (
    <div ref={stepperRef} className={`${T.card} p-2 overflow-x-auto custom-scrollbar`}>
      <div className="flex min-w-max">
        {STAGE_GROUPS.map((g, i) => {
          const finished = project.status === 'completed' || (currentIdx >= 0 && i < currentIdx);
          const current = !finished && g.key === currentKey;
          const lost = current && project.status === 'lost';
          const nextEntered = STAGE_GROUPS[i + 1] ? enteredAt[STAGE_GROUPS[i + 1].key] : null;
          const dur = finished ? daysBetween(enteredAt[g.key], nextEntered) : null;
          let sub = '';
          if (finished) sub = nextEntered ? `${formatShort(nextEntered)}${dur != null ? ` · ${dur} дн` : ''}` : 'виконано';
          else if (current) sub = lost ? 'зупинено' : stageDays != null ? `${stageDays} дн${currentNorm ? ` · норма ${currentNorm}` : ''}` : 'зараз';
          else if (g.key === 'complectation' && readiness != null) sub = `${readiness}% є`;
          else if (norms[g.key]) sub = `норма ${norms[g.key]} дн`;
          else if (g.key === 'installation') sub = `${tasksOfGroup('installation').length} підетапів`;
          const tone = current && !lost ? stageTone(stageDays, currentNorm) : 'neutral';
          return (
            <button
              key={g.key}
              type="button"
              data-current={current || undefined}
              onClick={() => setTab('workflow')}
              className={`flex-1 min-w-[112px] text-left px-3 py-2 rounded-lg transition-colors hover:bg-slate-50 ${current ? (lost ? 'bg-slate-100' : 'bg-indigo-50 hover:bg-indigo-50') : ''}`}
            >
              <span className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 border-2
                  ${finished ? 'bg-emerald-500 border-emerald-500 text-white' : current ? (lost ? 'border-slate-400' : 'border-indigo-500 bg-white') : 'border-slate-300 bg-white'}`}>
                  {finished && <FaCheck size={9} />}
                  {current && !lost && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                </span>
                <span className={`text-[13px] whitespace-nowrap ${current ? 'font-bold text-slate-900' : finished ? 'font-semibold text-slate-700' : 'font-medium text-slate-400'}`}>{g.label}</span>
              </span>
              <span className={`block mt-0.5 pl-7 text-[11.5px] tabular-nums whitespace-nowrap
                ${tone === 'danger' ? 'text-rose-600 font-semibold' : tone === 'warn' ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>
                {sub || ' '}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  /* --- Наступний крок --- */
  // Коли робити нічого (об'єкт завершено) — тонка смуга, а не велика картка
  const nextIsBare = nextStep && !nextStep.text.filter(Boolean).length && !nextStep.actions.length && !lostDraft;
  const renderNext = () => nextStep && (
    <div className={`rounded-xl border ${nextIsBare ? 'px-4 py-2.5' : 'p-4'} ${NEXT_TONE[nextStep.tone] || NEXT_TONE.neutral}`}>
      <div className={`flex gap-3 ${nextIsBare ? 'items-center' : 'items-start'}`}>
        <span className={`${nextIsBare ? 'w-7 h-7' : 'w-9 h-9'} rounded-lg flex items-center justify-center flex-shrink-0 ${NEXT_ICON_TONE[nextStep.tone] || NEXT_ICON_TONE.neutral}`}>
          <nextStep.icon size={nextIsBare ? 12 : 15} />
        </span>
        <div className="min-w-0 flex-1">
          {!nextIsBare && <div className="text-[12px] font-semibold text-slate-500">Наступний крок</div>}
          <div className={`${nextIsBare ? 'text-[14px]' : 'text-[16px]'} font-bold text-slate-900 leading-snug`}>{nextStep.title}</div>
          {nextStep.text.filter(Boolean).length > 0 && (
            <p className="mt-1 text-[13.5px] text-slate-600 leading-relaxed">{nextStep.text.filter(Boolean).join(' ')}</p>
          )}
          {nextStep.actions.length > 0 && !lostDraft && (
            <div className="mt-3 flex flex-wrap gap-2">
              {nextStep.actions.map(a => (a.href ? (
                <a key={a.label} href={a.href}
                  className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border bg-white text-slate-700 hover:bg-slate-50 border-slate-300 text-[12.5px] font-bold">
                  {a.icon && <a.icon size={12} />}{a.label}
                </a>
              ) : (
                <Btn key={a.label} variant={a.variant === 'primary' ? 'accent' : a.variant} icon={a.icon} onClick={a.onClick} disabled={busy}>
                  {a.label}
                </Btn>
              )))}
            </div>
          )}
          {lostDraft && (
            <div className="mt-3 p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
              <LostReasonPicker
                reason={lostDraft.reason}
                comment={lostDraft.comment}
                error={lostError}
                onChange={(d) => { setLostDraft(d); if (d.reason) setLostError(''); }}
              />
              <div className="flex gap-2 justify-end">
                <Btn variant="outline" onClick={() => setLostDraft(null)}>Скасувати</Btn>
                <Btn variant="danger" onClick={saveLost} disabled={busy}>Позначити «Втрачено»</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  /* --- Факти про станцію: показуємо лише заповнене, порожнє — одним рядком --- */
  const facts = [
    { l: 'Тип станції', v: project.station_type },
    { l: 'Потужність', v: kw(project.capacity_kw) },
    { l: 'Фази', v: project.quant_phase ? `${project.quant_phase} ф` : null },
    { l: 'Монтаж', v: project.mount_type },
    { l: 'Компанія', v: project.working_company },
    { l: 'Через банк', v: project.bank === 'Так' ? (project.bank_name || 'Так') : project.bank },
    { l: 'Старт', v: project.start_date ? formatDate(project.start_date) : null },
    { l: 'Фініш', v: project.end_date ? formatDate(project.end_date) : null },
    { l: 'Перший контакт', v: client?.first_contact ? formatDate(client.first_contact) : null },
    { l: 'Створено', v: formatDate(project.created_at) },
  ];
  const filledFacts = facts.filter(f => f.v);
  const emptyFacts = facts.filter(f => !f.v);
  const hasCost = cost > 0;

  /* --- Історія (головний вміст лівої колонки) --- */
  const renderHistory = () => (
    <div className={T.card}>
      <div className="px-4 pt-3.5 pb-3 border-b border-slate-100">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <h3 className="text-[15px] font-bold text-slate-900">Історія</h3>
          <span className="text-[12px] text-slate-400 tabular-nums">{feed.length} подій</span>
        </div>
        <div className="flex gap-2 items-end">
          <textarea
            rows={noteText ? 3 : 1}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendNote(); }}
            placeholder="Написати робочий запис (піде в Telegram-гілку об'єкта)…"
            className={`${T.input} h-auto py-2 resize-none`}
          />
          <Btn variant="accent" icon={FaPaperPlane} onClick={sendNote} disabled={sendingNote || !noteText.trim()} className="flex-shrink-0">
            <span className="hidden sm:inline">Надіслати</span>
          </Btn>
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {feed.slice(0, feedLimit).map(i => (
          <li key={i.key} className="px-4 py-3 flex gap-3">
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0
              ${i.kind === 'payment' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : i.kind === 'report' ? 'bg-amber-50 text-amber-700 border border-amber-100'
                : i.kind === 'note' ? 'bg-sky-50 text-sky-700 border border-sky-100'
                  : i.kind === 'stage' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
              {i.kind === 'payment' ? <FaFileInvoiceDollar size={12} /> : i.kind === 'report' ? <FaClipboardCheck size={11} /> : i.kind === 'created' ? <FaPlus size={10} />
                : i.kind === 'note' ? <FaCommentAlt size={11} /> : i.kind === 'stage' ? <FaFlagCheckered size={11} /> : <FaHistory size={11} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <b className="text-[13.5px] text-slate-900 min-w-0 break-words">{i.who}</b>
                <span className="text-[11.5px] text-slate-400 tabular-nums whitespace-nowrap flex-shrink-0">{formatDateTime(i.at)}</span>
              </div>
              <p className={`text-[13.5px] text-slate-700 leading-snug ${i.kind === 'note' ? 'whitespace-pre-wrap break-words' : ''}`}><Linkify>{i.text}</Linkify></p>
              {i.sub && <p className="text-[12px] text-slate-500 mt-0.5 break-words">{i.sub}</p>}
              {i.link && <a href={`#${i.link}`} className="text-[12px] font-semibold text-indigo-600 hover:underline">Відкрити звіт</a>}
              {i.kind === 'note' && (
                <p className={`text-[11.5px] mt-1 inline-flex items-center gap-1 ${i.sent ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {i.sent ? <><FaTelegramPlane size={10} /> у Telegram</> : <><FaClock size={9} /> чекає відправки</>}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {feed.length > feedLimit && (
        <div className="p-3 border-t border-slate-100 text-center">
          <Btn variant="soft" onClick={() => setFeedLimit(l => l + 25)}>Показати ще {Math.min(25, feed.length - feedLimit)}</Btn>
        </div>
      )}
    </div>
  );

  /* --- Фінанси --- */
  const renderFinance = () => (
    <div className={T.card}>
      <div className="px-4 pt-3.5 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-slate-900">Фінанси</h3>
        <span className="flex items-center gap-1.5">
          {project.total_cost_source === 'offer' && <Chip tone="accent">з КП</Chip>}
          {hasCost && <Chip tone={paymentInfo.tone}>{paymentInfo.label}</Chip>}
        </span>
      </div>
      <div className="p-4 pt-3 space-y-3">
        {hasCost ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[24px] font-bold text-slate-900 tabular-nums leading-none">{formatMoney(cost, objectCurrency)}</div>
              <span className="text-[12.5px] font-semibold text-slate-500 tabular-nums">{Math.round(paidPct)}% сплачено</span>
            </div>
            <Bar segments={[{ pct: paidPct, tone: 'ok' }]} />
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 px-3 py-2">
                <div className="text-[11.5px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                  Сплачено{moneyReady && <Tip text="Рахується з платежів нижче. Помилковий платіж можна видалити — сума перерахується сама." />}
                </div>
                <div className="text-[15px] font-bold text-emerald-800 tabular-nums">{formatMoney(paid, objectCurrency)}</div>
              </div>
              <div className={`rounded-lg px-3 py-2 border ${debt > 0.009 ? 'bg-rose-50/60 border-rose-100' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`text-[11.5px] font-semibold ${debt > 0.009 ? 'text-rose-700' : 'text-slate-500'}`}>Борг</div>
                <div className={`text-[15px] font-bold tabular-nums ${debt > 0.009 ? 'text-rose-800' : 'text-slate-400'}`}>{formatMoney(debt, objectCurrency)}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50/60 border border-amber-100 px-3 py-2.5">
            <span className="text-[13px] font-semibold text-amber-800">Вартість не вказана</span>
            {canEdit && <Btn size="sm" variant="outline" icon={FaEdit} onClick={openEdit}>Вказати</Btn>}
          </div>
        )}

        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className={T.label}>Платежі · {payments.length}</span>
            {!showPaymentModal && auth.can('payments', 'add') && <Btn size="sm" variant="softOk" icon={FaPlus} onClick={openPaymentModal}>Додати</Btn>}
          </div>
          {showPaymentModal && (
            <div id="object-payment-form" className="mb-3 p-3 rounded-xl border border-emerald-200 bg-emerald-50/40 scroll-mt-20">
              <div className="text-[14px] font-bold text-slate-900 mb-2.5">Новий платіж</div>
              <PaymentForm installation={{ custom_id: project.custom_id, name: project.name, currency: objectCurrency }}
                employeeId={me?.id} onCancel={() => setShowPaymentModal(false)} onSaved={paymentSaved} />
            </div>
          )}
          {payments.length > 0 && (
            <ul className="space-y-1">
              {(allPayments ? payments : payments.slice(0, 3)).map(p => {
                const payCur = p.currency || objectCurrency;
                const converted = payCur !== objectCurrency && p.amount_object != null;
                return (
                  <li key={p.id} className="flex items-center gap-2 py-1 group">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-slate-800 tabular-nums">
                        {formatMoney(p.amount, payCur)}
                        {converted && <span className="font-normal text-slate-400"> = {formatMoney(p.amount_object, objectCurrency)}</span>}
                      </div>
                      <div className="text-[11.5px] text-slate-400 break-words">
                        {formatDate(p.paid_at)}{p.payment_method ? ` · ${methodLabel(p.payment_method)}` : ''}{p.exchange_rate ? ` · курс ${Number(p.exchange_rate)}` : ''}{p.comment ? ` · ${p.comment}` : ''}
                      </div>
                    </div>
                    {auth.can('payments', 'delete') && moneyReady && (
                      <button type="button" onClick={() => deletePayment(p)} title="Видалити платіж" aria-label="Видалити платіж"
                        className="w-8 h-8 flex-shrink-0 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                        <FaTrash size={11} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {payments.length > 3 && (
            <button type="button" onClick={() => setAllPayments(v => !v)} className="mt-1 text-[12px] font-semibold text-indigo-600 hover:underline">
              {allPayments ? 'Згорнути' : `Усі ${payments.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  /* --- Станція: факти + матеріали + карта --- */
  const renderStation = () => (
    <div className={`${T.card} p-4`}>
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h3 className="text-[15px] font-bold text-slate-900">Станція</h3>
        {mapLink && (
          <a href={mapLink} target="_blank" rel="noopener noreferrer"
            className="text-[12px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">
            <FaMapMarkerAlt size={10} className="text-rose-500" /> {project.gps_link ? 'Точка на карті' : 'На карті'}
          </a>
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]">
        {filledFacts.map(f => (
          <React.Fragment key={f.l}>
            <dt className="text-slate-500">{f.l}</dt>
            <dd className="font-semibold text-slate-800 text-right break-words">{f.v}</dd>
          </React.Fragment>
        ))}
      </dl>
      {emptyFacts.length > 0 && (
        <p className="mt-2 text-[12px] text-slate-400 leading-snug">
          Не заповнено: {emptyFacts.map(f => f.l.toLowerCase()).join(', ')}
          {canEdit && <> · <button type="button" onClick={openEdit} className="font-semibold text-indigo-600 hover:underline">заповнити</button></>}
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between gap-2 mb-1.5 text-[13px]">
          <span className="text-slate-500 inline-flex items-center gap-1.5"><FaBoxes size={11} /> Матеріали</span>
          {readiness == null
            ? <span className="text-slate-400 text-[12.5px]">специфікації ще немає</span>
            : <b className="tabular-nums text-slate-900">{readiness}% забезпечено</b>}
        </div>
        {readiness != null && <Bar segments={[{ pct: readiness, tone: readiness >= 100 ? 'ok' : readiness >= 50 ? 'info' : 'warn' }]} />}
        <a href={`#/provisioning?obj=${project.custom_id}`} className="mt-1.5 text-[12px] font-semibold text-indigo-600 hover:underline inline-flex items-center gap-1">
          Забезпечення <FaExternalLinkAlt size={9} />
        </a>
      </div>
    </div>
  );

  /* --- Люди: клієнт і відповідальний в одній картці --- */
  const renderPeople = () => (
    <div className={`${T.card} p-4`}>
      {client && (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className={T.label}>Клієнт</div>
              <a href={`#/clients/${client.custom_id}`} className="text-[14px] font-semibold text-slate-900 hover:text-indigo-700 break-words">
                {client.name}
              </a>
              {client.company_name && <div className="text-[12.5px] text-slate-500">{client.company_name}</div>}
              {place && <div className="text-[12.5px] text-slate-500">{place}</div>}
            </div>
            {clientObjects > 1 && (
              <a href={`#/clients/${client.custom_id}`} className="text-[12px] font-semibold text-indigo-600 hover:underline whitespace-nowrap">
                об'єктів: {clientObjects}
              </a>
            )}
          </div>
          {client.phone && (
            <a href={`tel:${client.phone}`} className="mt-2.5 flex items-center justify-center gap-2 h-10 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-[13px] font-bold hover:bg-indigo-100">
              <FaPhone size={11} /> {client.phone}
            </a>
          )}
          {client.is_subcontract && client.contractor_company && (
            <div className="mt-2"><Chip tone="warn">Підряд · {client.contractor_company}</Chip></div>
          )}
          {client.notes && <p className="mt-2.5 text-[12.5px] text-slate-600 whitespace-pre-wrap break-words"><Linkify>{client.notes}</Linkify></p>}
        </>
      )}
      {[
        { key: 'manager', label: 'Відповідальний менеджер', icon: FaUserTie, person: owner },
        { key: 'brigadier', label: 'Відповідальний бригадир', icon: FaHardHat, person: brigadier },
      ].map((r, i) => (
        <div key={r.key} className={`flex items-center gap-3 ${client || i > 0 ? 'mt-3 pt-3 border-t border-slate-100' : ''}`}>
          <span className="w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center flex-shrink-0">
            <r.icon size={13} />
          </span>
          <div className="min-w-0 flex-1">
            <div className={T.label}>{r.label}</div>
            <div className={`text-[14px] font-semibold break-words ${r.person ? 'text-slate-900' : 'text-slate-400'}`}>{r.person?.name || 'Не призначено'}</div>
          </div>
          {r.person?.phone && (
            <a href={`tel:${r.person.phone}`} aria-label={`Подзвонити: ${r.person.name}`} title={r.person.phone}
              className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-indigo-600 hover:bg-slate-50">
              <FaPhone size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );

  const renderOverview = () => (
    // Ліва колонка — що робити і що сталося; права — гроші, станція, люди.
    // На телефоні порядок інший: крок → гроші → примітки → станція і люди → історія
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
      <div className="contents lg:block lg:space-y-4 lg:min-w-0">
        <div className="order-1">{renderNext()}</div>
        {project.notes && (
          <div className={`${T.card} p-4 order-3`}>
            <div className={T.label}>Технічні примітки</div>
            <p className="text-[13.5px] text-slate-700 whitespace-pre-wrap break-words leading-relaxed"><Linkify>{project.notes}</Linkify></p>
          </div>
        )}
        <div className="order-5">{renderHistory()}</div>
      </div>

      <aside className="contents lg:block lg:space-y-4">
        {seeMoney && <div className="order-2">{renderFinance()}</div>}
        <div className="order-4">{renderStation()}</div>
        <div className="order-4">{renderPeople()}</div>
      </aside>
    </div>
  );

  const TABS = [
    { key: 'overview', label: 'Огляд' },
    { key: 'workflow', label: 'Етапи', badge: `${doneTasks}/${TASK_ORDER.length}` },
    { key: 'reports', label: 'Звіти монтажу', badge: reports.length ? String(reports.length) : null },
    { key: 'documents', label: 'Документи' },
    ...(canSeeOffer ? [{ key: 'offer', label: 'КП (оцифровано)' }] : []),
    ...(canSeeProfit ? [{ key: 'profit', label: 'Прибуток' }] : []),
  ];

  return (
    <Layout>
      <div className="min-h-full pb-16 text-slate-800">

        {/* ШАПКА */}
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-[1500px] mx-auto px-3 sm:px-6 pt-3">
            <button type="button" onClick={goBack} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-slate-800">
              <FaArrowLeft size={10} /> Об'єкти · {currentLabel}
            </button>

            <div className="mt-1.5 flex flex-col md:flex-row md:items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[22px] sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                  <span className="font-mono text-[15px] sm:text-[17px] text-slate-400 font-semibold mr-2">СЕС-{project.custom_id}</span>
                  {project.name || client?.company_name || client?.name || `Об'єкт #${project.custom_id}`}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {kw(project.capacity_kw) && <Chip tone="warn" icon={FaSun}>{kw(project.capacity_kw)}</Chip>}
                  {project.station_type && <Chip>{project.station_type}</Chip>}
                  {client?.populated_place && <Chip icon={FaMapMarkerAlt}>{client.populated_place}</Chip>}
                  {project.working_company && <Chip tone={getCompany(project.working_company).tone}>{getCompany(project.working_company).short}</Chip>}
                  {project.bank === 'Так' && <Chip>Банк{project.bank_name ? ` · ${project.bank_name}` : ''}</Chip>}
                  {(project.status !== 'planning' && project.status !== 'in_progress') && <Chip tone={status.tone}>{status.label}</Chip>}
                  {isObjectActive(project.status) && project.status !== 'on_hold' && (
                    <Chip tone={stageTone(stageDays, currentNorm) === 'neutral' ? 'accent' : stageTone(stageDays, currentNorm)}>
                      {currentLabel}{stageDays != null ? ` · ${stageDays} дн` : ''}
                    </Chip>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {client?.phone && (
                  <a href={`tel:${client.phone}`}
                    className="inline-flex items-center gap-2 h-10 px-3.5 rounded-lg border bg-white text-slate-700 hover:bg-slate-50 border-slate-300 text-[12.5px] font-bold">
                    <FaPhone size={11} /> Подзвонити
                  </a>
                )}
                {canEdit && <Btn variant="primary" icon={FaEdit} onClick={openEdit}>Редагувати</Btn>}
              </div>
            </div>

            {/* Вкладки */}
            <nav className="mt-3 flex gap-1 overflow-x-auto no-scrollbar">
              {TABS.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 h-10 text-[13.5px] whitespace-nowrap border-b-2 transition-colors
                    ${tab === t.key ? 'border-indigo-600 text-indigo-700 font-semibold' : 'border-transparent text-slate-500 hover:text-slate-800 font-medium'}`}
                >
                  {t.label}
                  {t.badge && <span className="text-[11px] font-semibold text-slate-400 tabular-nums">{t.badge}</span>}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="max-w-[1500px] mx-auto p-3 sm:p-6 space-y-4">
          {tab === 'overview' && (
            <>
              {renderStepper()}
              {renderOverview()}
            </>
          )}
          {tab === 'workflow' && <ProjectWorkflow project={project} />}
          {tab === 'documents' && <ProjectDocuments project={project} />}
          {tab === 'reports' && <ObjectReports project={project} />}
          {tab === 'profit' && canSeeProfit && <ObjectProfitPanel installationId={project.custom_id} employeeId={me?.id} />}
          {tab === 'offer' && canSeeOffer && (
            <CommercialOfferPanel installationId={project.custom_id} canEdit={auth.can('offers', 'edit')} onTotalApplied={loadAll} />
          )}
        </main>
      </div>

      {/* РЕДАГУВАННЯ */}
      <Drawer
        isOpen={editOpen} onClose={() => setEditOpen(false)}
        title="Редагувати об'єкт" subtitle={`СЕС-${project.custom_id}`}
        size="lg"
        onSubmit={() => { if (!saving) handleSave(); }}
        submitHint="зберегти"
        footer={<>
          <Btn variant="outline" onClick={() => setEditOpen(false)}>Скасувати</Btn>
          <Btn variant="accent" onClick={handleSave} disabled={saving}>{saving ? 'Збереження…' : 'Зберегти'}</Btn>
        </>}
      >
        <div className="space-y-5">
          <Field label="Назва об'єкта">
            <input className={T.input} value={formData.name ?? ''} onChange={e => setF({ name: e.target.value })} placeholder={`Об'єкт #${project.custom_id}`} />
          </Field>

          <div className={`${T.inset} p-3 grid grid-cols-1 sm:grid-cols-2 gap-3`}>
            <Field label="Статус">
              <select className={T.select} value={formData.status || 'planning'} onChange={e => setF({ status: e.target.value })}>
                {OBJECT_STATUSES
                  .filter(s => s.key !== 'lost' || lostReady || formData.status === 'lost')
                  .map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Відповідальний менеджер">
              <Picker
                options={managerOptions(employees, formData.responsible_emp_id)}
                value={formData.responsible_emp_id || ''}
                onChange={v => setF({ responsible_emp_id: v })}
                placeholder="Оберіть менеджера…" searchPlaceholder="Пошук…" icon={FaUserTie}
              />
            </Field>
            <Field label="Відповідальний бригадир">
              <Picker
                options={brigadierOptions(employees, formData.brigadier_emp_id)}
                value={formData.brigadier_emp_id ?? ''}
                onChange={v => setF({ brigadier_emp_id: v })}
                placeholder="Оберіть бригадира…" searchPlaceholder="Пошук…" icon={FaHardHat}
              />
            </Field>
            <Field label="Старт">
              <input type="date" className={T.input} value={formData.start_date || ''} onChange={e => setF({ start_date: e.target.value })} />
            </Field>
            <Field label="Фініш">
              <input type="date" className={T.input} value={formData.end_date || ''} onChange={e => setF({ end_date: e.target.value })} />
            </Field>
            {lostReady && formData.status === 'lost' && (
              <div className="sm:col-span-2">
                <LostReasonPicker
                  reason={formData.lost_reason || ''}
                  comment={formData.lost_comment || ''}
                  onChange={({ reason, comment }) => setF({ lost_reason: reason, lost_comment: comment })}
                />
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <span className={T.label}>Станція</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Тип станції">
                <select className={T.select} value={formData.station_type || ''} onChange={e => setF({ station_type: e.target.value })}>
                  <option value="">Не вказано</option>
                  {STATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Спосіб монтажу">
                <select className={T.select} value={formData.mount_type || ''} onChange={e => setF({ mount_type: e.target.value })}>
                  <option value="">Не вказано</option>
                  <option value="Дахове кріплення (Скатний дах)">Дах (скатний)</option>
                  <option value="Дахове кріплення (Плоский дах)">Дах (плоский)</option>
                  <option value="Наземне кріплення">Наземна конструкція</option>
                  <option value="Трекерна система">Трекер</option>
                  <option value="Дах/Земля">Дах/Земля</option>
                  <option value="Електромонтаж">Тільки електромонтаж</option>
                  <option value="Інше">Інше</option>
                </select>
              </Field>
              <Field label="Потужність (кВт)">
                <input type="number" step="0.1" min="0" className={T.input} value={formData.capacity_kw ?? ''} onChange={e => setF({ capacity_kw: e.target.value })} />
              </Field>
              <Field label="Фази">
                <select className={T.select} value={formData.quant_phase || ''} onChange={e => setF({ quant_phase: e.target.value })}>
                  <option value="">—</option>
                  <option value="1">1 фаза</option>
                  <option value="3">3 фази</option>
                </select>
              </Field>
              <Field label="GPS-посилання" className="sm:col-span-2">
                <input type="url" className={T.input} value={formData.gps_link || ''} onChange={e => setF({ gps_link: e.target.value })} placeholder="Посилання з Google Maps" />
              </Field>
              <Field label="Компанія">
                <select className={T.select} value={formData.working_company || ''} onChange={e => setF({ working_company: e.target.value })}>
                  <option value="">—</option>
                  {COMPANIES.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
                  {formData.working_company && !COMPANIES.some(c => c.key === formData.working_company) && <option value={formData.working_company}>{formData.working_company}</option>}
                </select>
              </Field>
              <Field label="Через банк?">
                <select className={T.select} value={formData.bank || ''} onChange={e => setF({ bank: e.target.value, ...(e.target.value === 'Так' ? {} : { bank_name: '' }) })}>
                  <option value="">—</option>
                  <option value="Так">Так</option>
                  <option value="Ні">Ні</option>
                </select>
              </Field>
              {formData.bank === 'Так' && (
                <Field label="Який банк" className="sm:col-span-2">
                  <input className={T.input} list="kcore-banks-edit" value={formData.bank_name || ''} placeholder="Ощадбанк" onChange={e => setF({ bank_name: e.target.value })} />
                  <datalist id="kcore-banks-edit">{BANKS.map(b => <option key={b} value={b} />)}</datalist>
                </Field>
              )}
              <Field label="Технічні примітки" className="sm:col-span-2">
                <textarea rows="3" className={`${T.input} h-auto py-2 resize-y`} value={formData.notes || ''} onChange={e => setF({ notes: e.target.value })} placeholder="Умови монтажу, складність тощо" />
              </Field>
            </div>
          </div>

          {formData.client && (
            <div className="space-y-2.5">
              <span className={T.label}>Клієнт</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Контактна особа" className="sm:col-span-2">
                  <input className={T.input} value={formData.client.name || ''} onChange={e => setClientF({ name: e.target.value })} />
                </Field>
                <Field label="Компанія (ФОП)">
                  <input className={T.input} value={formData.client.company_name || ''} onChange={e => setClientF({ company_name: e.target.value })} />
                </Field>
                <Field label="Телефон">
                  <input type="tel" className={T.input} value={formData.client.phone || ''} onChange={e => setClientF({ phone: e.target.value })} />
                </Field>
                <Field label="Область">
                  <input className={T.input} value={formData.client.oblast || ''} onChange={e => setClientF({ oblast: e.target.value })} />
                </Field>
                <Field label="Населений пункт">
                  <input className={T.input} value={formData.client.populated_place || ''} onChange={e => setClientF({ populated_place: e.target.value })} />
                </Field>
                <Field label="Примітки клієнта" className="sm:col-span-2">
                  <textarea rows="2" className={`${T.input} h-auto py-2 resize-y`} value={formData.client.notes || ''} onChange={e => setClientF({ notes: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
        </div>
      </Drawer>

    </Layout>
  );
}
