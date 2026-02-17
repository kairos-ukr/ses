import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaSearch,
  FaSyncAlt,
  FaTasks,
  FaClipboardList,
  FaUserCheck,
  FaChevronRight,
  FaTimes,
  FaClock,
  FaHistory,
  FaCheck,
  FaSpinner,
  FaCamera,
  FaPlus,
  FaTrash,
  FaFileAlt,
  FaImage,
  FaArrowRight,
  FaUserTie,
  FaDownload,
} from "react-icons/fa";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";
import Layout from "./Layout";

/** Якщо інший endpoint для upload — зміни тут */
const WORKFLOW_UPLOADER_URL = "https://quiet-water-a1ad.kairosost38500.workers.dev";

/* =====================================================================================
 * 1) Конфіг етапів / статусів
 * ===================================================================================== */

const STAGE_META = {
  // Групи
  tech_review: "Проведення замірів",
  project: "Проект",
  proposal: "КП",
  equipment: "Обладнання",
  complectation: "Комплектація",
  installation: "Монтаж",
  grid_connection: "Мережа",
  monitoring_setup: "Запуск",

  // Детальні етапи
  project_design: "Розробка 3D візуалізації (Завантаження)",
  project_approval: "Вибір та затвердження варіанту",
  tech_project: "Технічний проект", // <-- НОВИЙ ЕТАП
  commercial_proposal: "Комерційна пропозиція",
  advance_payment: "Авансовий платіж",

  equipment: "Закупівля обладнання",
  complectation: "Комплектація матеріалів",
  comp_protection: "Комплектація ел. захисту",

  inst_structure: "Монтаж конструкції",
  inst_panels: "Встановлення панелей",
  inst_cabling: "Прокладання траси DC",
  inst_grounding: "Заземлення",
  inst_inverter: "Підключення інвертора",

  grid_connection: "Заведення потужності",
  monitoring_setup: "Запуск станції",
};

const STAGE_ORDER = [
  "tech_review",
  "project_design",
  "project_approval",
  "tech_project", // <-- Додано в порядок
  "commercial_proposal",
  "advance_payment",
  "equipment",
  "complectation",
  "comp_protection",
  "inst_structure",
  "inst_panels",
  "inst_cabling",
  "inst_grounding",
  "inst_inverter",
  "grid_connection",
  "monitoring_setup",
];

// Етапи, де дозволено завантаження файлів
const STAGES_WITH_UPLOADS = new Set([
  "commercial_proposal",
  "tech_project",
  "complectation",
  "comp_protection",
]);

const STAGE_TO_GROUP = {
  tech_review: "tech_review",

  project: "project",
  project_design: "project",
  project_approval: "project_selector",
  tech_project: "tech_project_group", // Спеціальна група для налаштування статусів

  proposal: "proposal",
  commercial_proposal: "proposal",

  equipment: "equipment",

  installation: "installation",
  inst_structure: "installation",
  inst_panels: "installation",
  inst_cabling: "installation",
  inst_grounding: "installation",
  inst_inverter: "installation",

  complectation: "default",
  comp_protection: "default",
  grid_connection: "default",
  monitoring_setup: "default",
  advance_payment: "default",
};

const STATUS_CONFIG = {
  default: [
    { key: "todo", label: "Не почато", color: "bg-slate-50 text-slate-600 border-slate-200" },
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "done", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  // Конфіг для нового етапу "Технічний проект"
  tech_project_group: [
    { key: "todo", label: "Не почато", color: "bg-slate-50 text-slate-600 border-slate-200" },
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "done", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  proposal: [
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В процесі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "created", label: "Зроблено", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { key: "approved", label: "Погоджено", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  project: [
    { key: "waiting", label: "Очікуємо", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "in_progress", label: "В розробці", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "created", label: "Зроблено", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { key: "approved", label: "Затверджено", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  equipment: [
    { key: "waiting", label: "Не розпочато", color: "bg-slate-50 text-slate-600 border-slate-200" },
    { key: "ordered", label: "Замовлено", color: "bg-purple-50 text-purple-700 border-purple-200" },
    { key: "arrived", label: "Прибуло", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  tech_review: [
    { key: "waiting_client", label: "Очікуємо від клієнта", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "done_on_site", label: "Виконали на виїзді", color: "bg-blue-50 text-blue-700 border-blue-200" },
    { key: "completed", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  project_selector: [
    { key: "selection_needed", label: "Необхідно обрати", color: "bg-amber-50 text-amber-700 border-amber-200" },
    { key: "selected", label: "Обрано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
  installation: [
    { key: "todo", label: "Не почато", color: "bg-slate-50 text-slate-600 border-slate-200" },
    { key: "in_progress", label: "В роботі", color: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    { key: "done", label: "Виконано", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  ],
};

const ALL_STATUS_LABELS = {
  waiting: "Очікуємо",
  waiting_start: "Очікуємо старт",
  not_started: "Не розпочато",
  started: "Розпочато",
  created: "Зроблено",
  arrived: "Прибуло",
  done_on_site: "Виконали на виїзді",
  completed: "Виконано",
  todo: "Не почато",
  in_progress: "В роботі",
  done: "Виконано",
  ordered: "Замовлено",
  approved: "Погоджено",
  waiting_client: "Очікуємо від клієнта",
  selection_needed: "Очікує вибору",
  selected: "Варіант обрано",
  "виконано": "Виконано",
  "завершено": "Завершено",
};

function normalizeStatus(status) {
  return String(status || "").trim().toLowerCase();
}

/**
 * DONE_BY_GROUP — список статусів, при яких етап вважається завершеним
 */
const DONE_BY_GROUP = {
  default: new Set(["completed", "done", "виконано", "завершено"]),
  tech_project_group: new Set(["done", "completed", "виконано"]), // Для тех. проекту
  project: new Set([
    "created",
    "approved",
    "completed",
    "done",
    "project_done",
    "project_approved",
    "kp_done",
    "kp_approved",
  ]),
  proposal: new Set([
    "created",
    "approved",
    "completed",
    "done",
    "kp_done",
    "kp_approved",
  ]),
  project_selector: new Set(["selected"]),
  equipment: new Set(["arrived", "completed", "done"]),
  installation: new Set(["completed", "done"]),
  tech_review: new Set([
    "done_on_site",
    "completed",
    "done",
    "виконано",
    "завершено",
  ]),
};

function isCompletedForStage(stageKey, status) {
  const s = normalizeStatus(status);
  const groupKey = STAGE_TO_GROUP[stageKey] || "default";
  const set = DONE_BY_GROUP[groupKey] || DONE_BY_GROUP.default;
  return set.has(s);
}

function getStageLabel(stageKey) {
  return STAGE_META[stageKey] || stageKey;
}

function getStatusMetaByStage(stageKey, statusKey) {
  const groupKey = STAGE_TO_GROUP[stageKey] || "default";
  const config = STATUS_CONFIG[groupKey] || STATUS_CONFIG.default;
  const found = config.find((s) => s.key === statusKey);
  if (found) return found;

  return {
    key: statusKey,
    label: ALL_STATUS_LABELS[statusKey] || statusKey || "—",
    color: "bg-slate-100 text-slate-700 border-slate-200",
  };
}

function getStatusOptionsByStage(stageKey, currentStatus) {
  const groupKey = STAGE_TO_GROUP[stageKey] || "default";
  let options = STATUS_CONFIG[groupKey] || STATUS_CONFIG.default;

  if (currentStatus && !options.some((o) => o.key === currentStatus)) {
    options = [
      {
        key: currentStatus,
        label: ALL_STATUS_LABELS[currentStatus] || currentStatus,
        color: "bg-slate-100 text-slate-700 border-slate-200",
      },
      ...options,
    ];
  }

  return options;
}

function formatDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatUkShort(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const driveThumbUrl = (fileId, size = 240) =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}-h${size}`;
const driveViewUrl = (fileId) =>
  `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1600`;

function isImageFile(file) {
  return (file?.type || "").startsWith("image/");
}

async function resolveActorName({ user, employee }) {
  if (employee?.name) return employee.name;
  let actorName = user?.email || "Невідомий";

  if (user?.id) {
    const { data } = await supabase
      .from("employees")
      .select("name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.name) actorName = data.name;
  }
  return actorName;
}

async function uploadWorkflowFiles({ files, installationId, stageKey }) {
  if (!files || files.length === 0) return { links: [], fileIds: [] };

  const fd = new FormData();
  files.forEach((f) => fd.append("files", f));
  fd.append("object_number", String(installationId));
  fd.append("doc_type", "Файли етапу");
  if (stageKey) fd.append("stage_key", stageKey);

  const res = await fetch(`${WORKFLOW_UPLOADER_URL}/workflow/upload`, {
    method: "POST",
    body: fd,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data || data.status !== "success") {
    const msg = (data && (data.message || data.detail)) || `Upload error (${res.status})`;
    throw new Error(msg);
  }

  const arr = Array.isArray(data.files) ? data.files : [];
  return {
    links: arr.map((x) => x?.webViewLink).filter(Boolean),
    fileIds: arr.map((x) => x?.fileId).filter(Boolean),
  };
}

/* =====================================================================================
 * 2) UI компоненти
 * ===================================================================================== */

function EmployeeSelect({ employees, selectedId, onSelect, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const wrapperRef = useRef(null);

  const selectedEmployee = (employees || []).find(
    (e) => String(e.custom_id) === String(selectedId)
  );

  const filteredEmployees = (employees || []).filter((e) => {
    if (!searchTerm) return true;
    const t = searchTerm.toLowerCase();
    return (e.name || "").toLowerCase().includes(t) || String(e.custom_id || "").includes(t);
  });

  useEffect(() => {
    const handler = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="min-w-0 relative" ref={wrapperRef}>
      <div className="text-[11px] font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
        <FaUserTie /> {label}
      </div>

      <div className="relative" onClick={() => setIsOpen(true)}>
        <div
          className={`w-full flex items-center justify-between border rounded-xl px-3 py-2.5 text-sm bg-white cursor-text transition-all ${
            isOpen ? "ring-2 ring-indigo-500 border-indigo-500" : "border-slate-200 hover:border-indigo-300"
          }`}
        >
          {!isOpen && selectedEmployee ? (
            <span className="font-bold text-slate-800 truncate pr-2">
              {selectedEmployee.name}{" "}
              <span className="text-slate-400 font-normal">#{selectedEmployee.custom_id}</span>
            </span>
          ) : (
            <input
              type="text"
              className="w-full outline-none bg-transparent placeholder:text-slate-400 font-medium"
              placeholder={selectedEmployee ? selectedEmployee.name : "Введіть ім'я або ID..."}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              autoFocus={isOpen}
            />
          )}

          <div className="flex items-center gap-1 text-slate-400">
            {selectedEmployee && !isOpen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(null);
                  setSearchTerm("");
                }}
                className="p-1 hover:text-red-500 hover:bg-red-50 rounded-full transition"
                type="button"
                title="Очистити відповідального"
              >
                <FaTimes />
              </button>
            )}
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {filteredEmployees.length > 0 ? (
            filteredEmployees.map((emp) => (
              <button
                key={emp.id}
                onClick={() => {
                  onSelect(emp.custom_id);
                  setIsOpen(false);
                  setSearchTerm("");
                }}
                className={`w-full text-left px-4 py-3 text-sm flex justify-between items-center hover:bg-indigo-50 transition border-b border-slate-50 last:border-0 ${
                  String(selectedId) === String(emp.custom_id) ? "bg-indigo-50/50 text-indigo-700" : "text-slate-700"
                }`}
                type="button"
              >
                <div className="flex flex-col">
                  <span className="font-bold">{emp.name}</span>
                  <span className="text-xs text-slate-400">{emp.position || "Працівник"}</span>
                </div>
                <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">
                  #{emp.custom_id}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-slate-400 text-center italic">Нікого не знайдено</div>
          )}
        </div>
      )}
    </div>
  );
}

function PhotoViewerModal({ isOpen, onClose, fileIds, startIndex = 0 }) {
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    if (isOpen) setIdx(startIndex);
  }, [isOpen, startIndex]);

  if (!isOpen || !fileIds?.length) return null;
  const currentId = fileIds[idx];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-500">
            Файл {idx + 1} / {fileIds.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className="px-3 py-2 rounded-xl border font-bold text-xs bg-white disabled:opacity-50"
              type="button"
            >
              Назад
            </button>
            <button
              onClick={() => setIdx(Math.min(fileIds.length - 1, idx + 1))}
              disabled={idx === fileIds.length - 1}
              className="px-3 py-2 rounded-xl border font-bold text-xs bg-white disabled:opacity-50"
              type="button"
            >
              Далі
            </button>
            <button onClick={onClose} className="p-2 bg-slate-100 rounded-full" type="button">
              <FaTimes />
            </button>
          </div>
        </div>
        <div className="bg-black flex items-center justify-center h-[80vh] bg-slate-50 relative">
          <img
            src={driveViewUrl(currentId)}
            alt="Preview"
            className="max-h-full max-w-full object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          {/* Фолбек, якщо це не картинка, а PDF/Doc */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 -z-10">
             <FaFileAlt size={48} className="mb-2 opacity-50"/>
             <span className="text-sm">Попередній перегляд недоступний для цього типу файлу.</span>
             <a 
               href={driveViewUrl(currentId)} 
               target="_blank" 
               rel="noreferrer"
               className="mt-4 px-4 py-2 bg-white rounded-lg border shadow-sm font-bold text-sm text-indigo-600 hover:text-indigo-800"
             >
               Відкрити в новому вікні
             </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function HistoryTimeline({ logs, stageKey, getEmployeeName }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIds, setViewerIds] = useState([]);
  const [viewerStart, setViewerStart] = useState(0);

  const openViewer = (ids, index) => {
    setViewerIds(ids);
    setViewerStart(index);
    setViewerOpen(true);
  };

  if (!logs || logs.length === 0) {
    return <div className="text-center text-slate-400 py-6 text-xs italic">Історія порожня.</div>;
  }

  return (
    <>
      <div className="space-y-4 mt-4">
        {logs.map((log) => {
          const hasStatusChange =
            log.old_status && log.new_status && log.old_status !== log.new_status;

          const oldMeta = hasStatusChange ? getStatusMetaByStage(stageKey, log.old_status) : null;
          const newMeta = hasStatusChange ? getStatusMetaByStage(stageKey, log.new_status) : null;

          const oldResp = log.old_responsible;
          const newResp = log.new_responsible;
          const hasRespInfo = oldResp != null || newResp != null;
          const respChanged = String(oldResp ?? "") !== String(newResp ?? "");

          const fileIds = Array.isArray(log.photo_file_ids) ? log.photo_file_ids.filter(Boolean) : [];
          const links = Array.isArray(log.photos) ? log.photos.filter(Boolean) : [];

          const attachments = [
            ...fileIds.map((id, i) => ({ fileId: id, link: links[i] || driveViewUrl(id), idx: i })),
            ...links.slice(fileIds.length).map((link, i) => ({
              fileId: null,
              link,
              idx: fileIds.length + i,
            })),
          ];

          return (
            <div key={log.id} className="flex gap-3 relative group">
              <div className="absolute left-[15px] top-8 bottom-[-20px] w-0.5 bg-slate-100 group-last:hidden" />
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 z-10 border border-slate-200 shadow-sm">
                <span className="text-[10px] font-black text-slate-600 uppercase">
                  {log.actor?.[0] || "U"}
                </span>
              </div>

              <div className="flex-1 bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-xs text-slate-800">{log.actor || "Невідомий"}</span>
                  <span className="text-[10px] font-bold text-slate-400">{formatUkShort(log.created_at)}</span>
                </div>

                {hasStatusChange && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`px-2 py-0.5 rounded border ${oldMeta.color} opacity-70 line-through`}>
                      {oldMeta.label}
                    </span>
                    <FaArrowRight className="text-slate-300 text-[10px]" />
                    <span className={`px-2 py-0.5 rounded border ${newMeta.color} font-bold`}>
                      {newMeta.label}
                    </span>
                  </div>
                )}

                {hasRespInfo && (
                  <div className="mb-2 text-xs text-slate-600 bg-indigo-50/50 rounded-lg px-2 py-1.5 border border-indigo-100 flex items-center gap-2">
                     <div className="p-1 bg-indigo-100 rounded text-indigo-600">
                        <FaUserTie /> 
                     </div>
                     <div className="flex-1">
                        <span className="font-semibold text-slate-500 mr-1">Призначено:</span>
                        {respChanged ? (
                          <>
                            <span className="line-through opacity-60 mr-1">{getEmployeeName(oldResp)}</span>
                            <FaArrowRight className="inline text-slate-300 text-[10px] mx-1" />
                            <span className="font-bold text-slate-800">{getEmployeeName(newResp)}</span>
                          </>
                        ) : (
                          <span className="font-bold text-slate-800">{getEmployeeName(newResp ?? oldResp)}</span>
                        )}
                     </div>
                  </div>
                )}

                {log.comment && (
                  <p className="text-sm text-slate-700 mb-2 leading-relaxed whitespace-pre-line bg-slate-50/60 p-2 rounded-lg border border-slate-50">
                    {log.comment}
                  </p>
                )}

                {attachments.length > 0 && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {attachments.map((att) => {
                      if (att.fileId) {
                        return (
                          <div key={`att-${log.id}-${att.idx}`} className="flex items-center gap-1 group/file">
                            <button
                              type="button"
                              onClick={() => openViewer(fileIds, att.idx)}
                              className="block w-12 h-10 bg-slate-100 rounded border border-slate-200 overflow-hidden hover:bg-slate-200 transition relative"
                              title="Переглянути"
                            >
                              <img
                                src={driveThumbUrl(att.fileId)}
                                alt="file"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  // Пошукаємо sibling елемент (іконку) і покажемо його
                                  e.currentTarget.parentElement.querySelector('.fallback-icon').style.display = 'flex';
                                }}
                              />
                              <div className="fallback-icon w-full h-full absolute inset-0 hidden items-center justify-center text-slate-400 bg-slate-50">
                                <FaFileAlt size={16} />
                              </div>
                            </button>
                            <a
                              href={att.link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                              title="Завантажити"
                            >
                              <FaDownload size={8} />
                            </a>
                          </div>
                        );
                      }

                      return (
                        <a
                          key={`att-${log.id}-${att.idx}`}
                          href={att.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[11px]"
                          title="Відкрити документ"
                        >
                          <FaFileAlt />
                          Документ
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <PhotoViewerModal
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        fileIds={viewerIds}
        startIndex={viewerStart}
      />
    </>
  );
}

function QuickStageModal({
  isOpen,
  item,
  employees,
  history,
  historyLoading,
  saving,
  getEmployeeName,
  onClose,
  onSave,
}) {
  const [status, setStatus] = useState("");
  const [comment, setComment] = useState("");
  const [assignedEmpId, setAssignedEmpId] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !item) return;
    setStatus(item.status || "in_progress");
    setComment("");
    setAssignedEmpId(item.responsible_emp_custom_id ?? null);
    setSelectedFiles([]);
  }, [isOpen, item]);

  useEffect(() => {
    return () => {
      selectedFiles.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, [selectedFiles]);

  if (!isOpen || !item) return null;

  const statusOptions = getStatusOptionsByStage(item.stage_key, item.status);
  
  // Перевірка чи дозволено завантаження файлів для цього етапу
  const canUploadFiles = STAGES_WITH_UPLOADS.has(item.stage_key);

  const handleFileSelect = (e) => {
    if (!e.target.files) return;
    const arr = Array.from(e.target.files).map((file) => ({
      file,
      preview: isImageFile(file) ? URL.createObjectURL(file) : null,
      isImage: isImageFile(file),
    }));
    setSelectedFiles((prev) => [...prev, ...arr]);
    e.target.value = "";
  };

  const removeSelectedFile = (idx) => {
    setSelectedFiles((prev) => {
      const target = prev[idx];
      if (target?.preview) URL.revokeObjectURL(target.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const hasChanges =
    normalizeStatus(status) !== normalizeStatus(item.status) ||
    comment.trim().length > 0 ||
    String(assignedEmpId ?? "") !== String(item.responsible_emp_custom_id ?? "") ||
    selectedFiles.length > 0;

  const submit = () => {
    if (!hasChanges || saving) return;
    onSave({
      status,
      comment,
      assigned_to: assignedEmpId,
      rawFiles: selectedFiles.map((x) => x.file),
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-white w-full max-w-2xl h-[92vh] sm:h-auto sm:max-h-[92vh] sm:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-white shrink-0">
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              Швидке оновлення етапу
            </div>
            <h3 className="font-extrabold text-lg text-slate-900 leading-tight">{item.stage_label}</h3>
            <p className="text-xs text-slate-500 mt-1">
              Об’єкт #{item.installation_custom_id} · {item.installation_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-slate-50 rounded-full text-slate-500 hover:bg-slate-100 transition"
            type="button"
            disabled={saving}
          >
            <FaTimes />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 bg-slate-50/50">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm mb-6 space-y-5">
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                <FaClock className="text-indigo-500" /> Статус
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {statusOptions.map((opt) => {
                  const isSelected = normalizeStatus(status) === normalizeStatus(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setStatus(opt.key)}
                      className={`w-full py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-between border ${
                        isSelected ? `${opt.color} ring-1 ring-inset ring-black/5` : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                      }`}
                      type="button"
                    >
                      <span>{opt.label}</span>
                      {isSelected && <FaCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            <EmployeeSelect
              label="Відповідальний за етап"
              employees={employees}
              selectedId={assignedEmpId}
              onSelect={setAssignedEmpId}
            />

            <div>
              <div className="text-[11px] font-bold text-slate-500 uppercase mb-1">Коментар</div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Введіть коментар..."
                className="w-full p-3 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[90px] font-medium text-slate-700"
              />
            </div>

            {/* Блок завантаження відображаємо ЛИШЕ якщо дозволено для етапу */}
            {canUploadFiles && (
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase mb-2">Файли / Фото</div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {selectedFiles.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {selectedFiles.map((obj, idx) => (
                        <div
                          key={`${obj.file.name}-${idx}`}
                          className="relative rounded-lg border border-slate-200 bg-white p-2 flex items-center gap-2"
                        >
                          <div className="w-14 h-14 rounded-md overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
                            {obj.preview ? (
                              <img src={obj.preview} alt="preview" className="w-full h-full object-cover" />
                            ) : (
                              <FaFileAlt className="text-slate-400 text-2xl" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-700 truncate">{obj.file.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {Math.max(1, Math.round(obj.file.size / 1024))} KB
                            </div>
                          </div>
                          <button
                            onClick={() => removeSelectedFile(idx)}
                            className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-90 hover:opacity-100 transition shadow-sm"
                            type="button"
                          >
                            <FaTrash size={10} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-2.5 border border-dashed border-indigo-200 text-indigo-600 bg-indigo-50/50 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition"
                      type="button"
                    >
                      <FaPlus /> Додати ще файли
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 border border-dashed border-indigo-200 text-indigo-600 bg-indigo-50/50 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-50 transition"
                    type="button"
                  >
                    <FaCamera /> Додати фото або документи
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <FaHistory /> Хронологія
            </h4>

            {historyLoading ? (
              <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <FaSpinner className="animate-spin" /> Завантаження історії...
              </div>
            ) : (
              <HistoryTimeline logs={history} stageKey={item.stage_key} getEmployeeName={getEmployeeName} />
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-white shrink-0">
          <button
            onClick={submit}
            disabled={saving || !hasChanges}
            className={`w-full py-3.5 rounded-xl font-bold text-lg shadow-lg transition flex justify-center items-center gap-2 ${
              hasChanges
                ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 active:scale-[0.98]"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
            type="button"
          >
            {saving && <FaSpinner className="animate-spin" />} Зберегти зміни
          </button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================================
 * 3) Main Page
 * ===================================================================================== */

export default function MyWorkflowDashboard() {
  const navigate = useNavigate();
  const { employee, user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");

  const [employees, setEmployees] = useState([]);

  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickItem, setQuickItem] = useState(null);
  const [savingQuick, setSavingQuick] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);

  const getEmployeeName = useCallback(
    (customId) => {
      if (customId == null) return "—";
      const found = employees.find((e) => String(e.custom_id) === String(customId));
      return found?.name ? `${found.name} (#${found.custom_id})` : `ID: ${customId}`;
    },
    [employees]
  );

  const loadEmployees = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, custom_id, name, position")
        .order("custom_id", { ascending: true })
        .limit(500);

      if (error) throw error;
      setEmployees(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Employees load error:", e);
      setEmployees([]);
    }
  }, []);

  const loadData = useCallback(async () => {
    if (!employee?.custom_id) return;

    setLoading(true);
    setErrorText("");

    try {
      const { data: stageRows, error: stageErr } = await supabase
        .from("project_stages")
        .select(`
          id,
          installation_custom_id,
          stage_key,
          status,
          updated_at,
          responsible_emp_custom_id
        `)
        .eq("responsible_emp_custom_id", employee.custom_id)
        .order("updated_at", { ascending: false });

      if (stageErr) throw stageErr;

      // ✅ Ключ: прибираємо "завершені" по правилах конкретного етапу/групи
      const activeRows = (stageRows || []).filter((r) => !isCompletedForStage(r.stage_key, r.status));

      if (activeRows.length === 0) {
        setRows([]);
        return;
      }

      const installationIds = [...new Set(activeRows.map((r) => r.installation_custom_id))];

      const { data: installationRows, error: instErr } = await supabase
        .from("installations")
        .select(`
          custom_id,
          name,
          priority,
          status,
          workflow_stage,
          client:clients!installations_client_id_fkey (
            name,
            company_name,
            phone
          )
        `)
        .in("custom_id", installationIds);

      if (instErr) throw instErr;

      const instMap = new Map((installationRows || []).map((i) => [i.custom_id, i]));

      const normalized = activeRows
        .map((s) => {
          const inst = instMap.get(s.installation_custom_id);
          if (!inst) return null;

          const clientName = inst?.client?.company_name || inst?.client?.name || "—";

          return {
            id: s.id,
            installation_custom_id: s.installation_custom_id,
            installation_name: inst?.name || `Об'єкт #${s.installation_custom_id}`,
            priority: inst?.priority || "medium",
            project_status: inst?.status || null,
            workflow_stage: inst?.workflow_stage || null,
            client_name: clientName,

            stage_key: s.stage_key,
            stage_label: getStageLabel(s.stage_key),
            status: s.status || "todo",
            updated_at: s.updated_at,
            responsible_emp_custom_id: s.responsible_emp_custom_id,
          };
        })
        .filter(Boolean);

      setRows(normalized);
    } catch (err) {
      console.error("MyWorkflowDashboard load error:", err);
      setErrorText(err?.message || "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }, [employee?.custom_id]);

  const loadHistoryForItem = useCallback(async (item) => {
    if (!item?.installation_custom_id || !item?.stage_key) return;
    setHistoryLoading(true);

    try {
      const { data, error } = await supabase
        .from("workflow_events")
        .select(`
          id,
          installation_custom_id,
          stage_key,
          old_status,
          new_status,
          old_responsible,
          new_responsible,
          comment,
          created_at,
          actor,
          photos,
          photo_file_ids
        `)
        .eq("installation_custom_id", item.installation_custom_id)
        .eq("stage_key", item.stage_key)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("History load error:", e);
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!employee?.custom_id) return;

    const channel = supabase
      .channel(`my-workflow-active-${employee.custom_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_stages" }, (payload) => {
        const newResp = payload.new?.responsible_emp_custom_id;
        const oldResp = payload.old?.responsible_emp_custom_id;
        if (newResp === employee.custom_id || oldResp === employee.custom_id) {
          loadData();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee?.custom_id, loadData]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      return (
        String(r.installation_custom_id).includes(q) ||
        (r.installation_name || "").toLowerCase().includes(q) ||
        (r.client_name || "").toLowerCase().includes(q) ||
        (r.stage_label || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const groupedSections = useMemo(() => {
    const byStage = filteredRows.reduce((acc, row) => {
      if (!acc[row.stage_key]) acc[row.stage_key] = [];
      acc[row.stage_key].push(row);
      return acc;
    }, {});

    const known = STAGE_ORDER.filter((k) => byStage[k]);
    const unknown = Object.keys(byStage)
      .filter((k) => !STAGE_ORDER.includes(k))
      .sort((a, b) => getStageLabel(a).localeCompare(getStageLabel(b), "uk"));

    return [...known, ...unknown].map((stageKey) => ({
      stageKey,
      stageLabel: getStageLabel(stageKey),
      items: byStage[stageKey],
    }));
  }, [filteredRows]);

  const stats = useMemo(() => {
    const objectCount = new Set(filteredRows.map((r) => r.installation_custom_id)).size;
    return { objects: objectCount, assignments: filteredRows.length };
  }, [filteredRows]);

  const openQuickModal = async (item) => {
    setQuickItem(item);
    setQuickModalOpen(true);
    await loadHistoryForItem(item);
  };

  const closeQuickModal = () => {
    if (savingQuick) return;
    setQuickModalOpen(false);
    setQuickItem(null);
    setHistoryRows([]);
  };

  const handleQuickSave = async (payload) => {
    if (!quickItem || !employee?.custom_id) return;

    setSavingQuick(true);
    setErrorText("");

    try {
      let uploadedLinks = [];
      let uploadedFileIds = [];

      if (payload?.rawFiles?.length) {
        const up = await uploadWorkflowFiles({
          files: payload.rawFiles,
          installationId: quickItem.installation_custom_id,
          stageKey: quickItem.stage_key,
        });
        uploadedLinks = up.links || [];
        uploadedFileIds = up.fileIds || [];
      }

      const photos = [...uploadedLinks];
      const photo_file_ids = [...uploadedFileIds];

      const actorName = await resolveActorName({ user, employee });

      const { data: rpcData, error: rpcError } = await supabase.rpc("update_workflow_stage", {
        p_installation_id: quickItem.installation_custom_id,
        p_stage_key: quickItem.stage_key,
        p_new_status: payload.status,
        p_actor: actorName,
        p_comment: payload.comment || "",
        p_photos: photos,
        p_photo_file_ids: photo_file_ids,
        p_new_responsible: payload.assigned_to ?? null,
        p_set_as_global_stage: false,
      });

      if (rpcError) {
        console.warn("RPC update_workflow_stage failed, fallback:", rpcError);

        const { error: updErr } = await supabase
          .from("project_stages")
          .update({
            status: payload.status,
            responsible_emp_custom_id: payload.assigned_to ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("installation_custom_id", quickItem.installation_custom_id)
          .eq("stage_key", quickItem.stage_key);

        if (updErr) throw updErr;

        const { error: evErr } = await supabase.from("workflow_events").insert({
          installation_custom_id: quickItem.installation_custom_id,
          stage_key: quickItem.stage_key,
          old_status: quickItem.status,
          new_status: payload.status,
          old_responsible: quickItem.responsible_emp_custom_id ?? null,
          new_responsible: payload.assigned_to ?? null,
          comment: payload.comment || "",
          actor: actorName,
          photos,
          photo_file_ids,
        });

        if (evErr) throw evErr;
      } else if (rpcData && rpcData.success === false) {
        throw new Error(rpcData.message || "Оновлення не застосоване");
      }

      // ✅ Optimistic UI
      const newStatusDone = isCompletedForStage(quickItem.stage_key, payload.status);
      const reassignedAway =
        payload.assigned_to != null && String(payload.assigned_to) !== String(employee.custom_id);

      if (newStatusDone || reassignedAway) {
        setRows((prev) =>
          prev.filter(
            (r) =>
              !(
                r.installation_custom_id === quickItem.installation_custom_id &&
                r.stage_key === quickItem.stage_key
              )
          )
        );
      } else {
        const nowIso = new Date().toISOString();
        setRows((prev) =>
          prev.map((r) =>
            r.installation_custom_id === quickItem.installation_custom_id &&
            r.stage_key === quickItem.stage_key
              ? {
                  ...r,
                  status: payload.status,
                  updated_at: nowIso,
                  responsible_emp_custom_id: payload.assigned_to ?? r.responsible_emp_custom_id,
                }
              : r
          )
        );
      }

      closeQuickModal();
      await loadData();
    } catch (err) {
      console.error("Quick update error:", err);
      setErrorText(err?.message || "Не вдалося оновити етап");
    } finally {
      setSavingQuick(false);
    }
  };

  if (!employee) {
    return (
      <Layout>
        <div className="p-6">
          <div className="bg-white border border-amber-200 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-amber-900 mb-2">Немає профілю працівника</h2>
            <p className="text-amber-800 text-sm">
              Для цієї сторінки потрібен запис у таблиці <code>employees</code>, прив’язаний до вашого user_id.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-full bg-slate-50">
        <div className="max-w-[1500px] mx-auto p-4 sm:p-6 space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
                  <FaClipboardList className="text-indigo-600" />
                  Мої етапи
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Показані лише етапи, де ви відповідальні, і які ще не завершені.
                </p>
              </div>

              <button
                onClick={loadData}
                className="w-full lg:w-auto px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-sm font-medium flex items-center justify-center gap-2"
                type="button"
              >
                <FaSyncAlt />
                Оновити
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div className="text-xs text-slate-500">Об’єкти у роботі</div>
                <div className="text-2xl font-bold text-slate-900">{stats.objects}</div>
              </div>
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <div className="text-xs text-slate-500">Активні призначення</div>
                <div className="text-2xl font-bold text-slate-900">{stats.assignments}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="relative w-full md:max-w-lg">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Пошук: № об’єкта, назва, клієнт, етап..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {errorText ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorText}
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-600">
              Завантаження етапів...
            </div>
          ) : groupedSections.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <FaUserCheck className="text-slate-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Немає активних призначень</h3>
              <p className="text-sm text-slate-600 mt-1">Зараз для вас немає етапів, що потребують дій.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedSections.map((section) => (
                <section key={section.stageKey} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <FaTasks className="text-indigo-600" />
                      {section.stageLabel}
                    </h2>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700">
                      {section.items.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {section.items.map((item) => {
                      const statusMeta = getStatusMetaByStage(item.stage_key, item.status);

                      return (
                        <div
                          key={item.id}
                          className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-sm transition bg-white"
                        >
                          <button
                            onClick={() => navigate(`/project/${item.installation_custom_id}`)}
                            className="w-full text-left"
                            title={`Відкрити об'єкт #${item.installation_custom_id}`}
                            type="button"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-xs text-slate-500">Об’єкт #{item.installation_custom_id}</div>
                                <div className="font-semibold text-slate-900 leading-snug mt-0.5">
                                  {item.installation_name || `Об'єкт #${item.installation_custom_id}`}
                                </div>
                              </div>

                              <span className={`text-xs px-2 py-1 rounded-full font-medium border ${statusMeta.color}`}>
                                {statusMeta.label}
                              </span>
                            </div>

                            <div className="mt-3 text-sm text-slate-600">
                              <div className="truncate">
                                <span className="text-slate-500">Клієнт:</span>{" "}
                                <span className="text-slate-800">{item.client_name || "—"}</span>
                              </div>
                              <div className="mt-1">
                                <span className="text-slate-500">Оновлено:</span>{" "}
                                <span className="text-slate-800">{formatDateTime(item.updated_at)}</span>
                              </div>
                            </div>
                          </button>

                          <div className="mt-3 flex items-center justify-between gap-2">
                            <button
                              onClick={() => openQuickModal(item)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm font-medium hover:bg-indigo-100"
                              type="button"
                            >
                              Швидко відмітити
                            </button>

                            <button
                              onClick={() => navigate(`/project/${item.installation_custom_id}`)}
                              className="inline-flex items-center text-indigo-600 text-sm font-medium hover:text-indigo-700"
                              type="button"
                            >
                              В картку
                              <FaChevronRight className="ml-1" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <QuickStageModal
        isOpen={quickModalOpen}
        item={quickItem}
        employees={employees}
        history={historyRows}
        historyLoading={historyLoading}
        saving={savingQuick}
        getEmployeeName={getEmployeeName}
        onClose={closeQuickModal}
        onSave={handleQuickSave}
      />
    </Layout>
  );
}