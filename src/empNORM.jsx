import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUsers, FaUser, FaBuilding, FaCalendarAlt, FaPhone, FaPlus, FaArrowLeft,
  FaSearch, FaEdit, FaTimes, FaCheck, FaIdBadge, FaHardHat, FaBolt, FaCog,
  FaChevronDown, FaUserPlus, FaTrash, FaCalendar, FaSave, FaClock,
  FaMapMarkerAlt, FaPlane, FaSyringe, FaMoon, FaEllipsisV, FaCloudRain,
  FaSun, FaUserClock, FaTachometerAlt, FaCommentDots, FaTasks
} from "react-icons/fa";
import { createClient } from "@supabase/supabase-js";
import { useNavigate } from 'react-router-dom';

// Supabase client
const supabaseUrl = "https://logxutaepqzmvgsvscle.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE";
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to format date correctly to YYYY-MM-DD
const formatDateToYYYYMMDD = (date) => {
    const offset = date.getTimezoneOffset();
    const adjustedDate = new Date(date.getTime() - offset * 60 * 1000);
    return adjustedDate.toISOString().split("T")[0];
};

const positionColors = {
  Монтажник: { icon: FaHardHat, color: "text-indigo-600 bg-indigo-50" },
  Електрик: { icon: FaBolt, color: "text-amber-600 bg-amber-50" },
  Інженер: { icon: FaCog, color: "text-sky-600 bg-sky-50" },
  default: { icon: FaUser, color: "text-gray-600 bg-gray-50" },
};

// Notification component
const NotificationSystem = ({ notifications, removeNotification }) => (
  <AnimatePresence>
    {notifications.map((notification) => (
      <motion.div
        key={notification.id}
        initial={{ opacity: 0, y: -50, x: 50 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        exit={{ opacity: 0, y: -50, x: 50 }}
        className={`fixed top-4 right-4 z-[9999] max-w-sm w-full mx-4 sm:mx-0 ${
          notification.type === "success"
            ? "bg-gradient-to-r from-green-500 to-emerald-500"
            : notification.type === "error"
            ? "bg-gradient-to-r from-red-500 to-pink-500"
            : "bg-gradient-to-r from-blue-500 to-indigo-500"
        } text-white rounded-xl p-4 shadow-2xl backdrop-blur-xl border border-white/20`}
      >
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            {notification.type === "success" && (
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <FaCheck className="text-sm" />
              </div>
            )}
            {notification.type === "error" && (
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <FaTimes className="text-sm" />
              </div>
            )}
            {notification.type === "info" && (
              <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                <FaCalendar className="text-sm" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm">{notification.message}</p>
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-white/80 hover:text-white transition-colors"
          >
            <FaTimes className="text-sm" />
          </button>
        </div>
      </motion.div>
    ))}
  </AnimatePresence>
);

// Confirmation modal component
const ConfirmationModal = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <motion.div
        className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-gray-200/50 my-8"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-800 mb-4">Підтвердження</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-colors"
          >
            Скасувати
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
          >
            Підтвердити
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Select with search component (memoized for performance)
const SelectWithSearch = memo(({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  icon: Icon,
  isDisabled,
  className = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isTop, setIsTop] = useState(false);
  const selectRef = useRef(null);

  const selectedOption = options.find((opt) => opt.value === value) || null;

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (selectRef.current && !selectRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (isOpen && selectRef.current) {
      const rect = selectRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setIsTop(spaceBelow < 200 && rect.top > 200);
    }
  }, [isOpen]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={selectRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full border rounded-lg px-4 py-3 text-sm text-left transition-all duration-200 ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white text-gray-700 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        } flex items-center justify-between`}
        disabled={disabled}
      >
        <div className="flex items-center space-x-2">
          {Icon && <Icon className="text-gray-400" />}
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <FaChevronDown
          className={`text-xs transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: isTop ? 10 : -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isTop ? 10 : -10 }}
            className={`absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto ${
              isTop ? "bottom-full mb-2" : "top-full mt-2"
            }`}
          >
            <div className="p-2 sticky top-0 bg-white border-b border-gray-200">
              <div className="relative">
                <FaSearch className="absolute top-1/2 left-3 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Пошук..."
                />
              </div>
            </div>
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                    setSearchTerm("");
                  }}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                    value === option.value ? "bg-indigo-100 font-medium" : ""
                  } ${
                    isDisabled && isDisabled(option)
                      ? "text-gray-400 cursor-not-allowed"
                      : "text-gray-700"
                  }`}
                  disabled={isDisabled && isDisabled(option)}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="text-center text-gray-500 py-4 text-sm">
                Не знайдено
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

// Calendar component (memoized for performance)
const Calendar = memo(({
  selectedDate,
  onDateChange,
  workSchedule,
}) => {
  const [currentMonth, setCurrentMonth] = useState(selectedDate.getMonth());
  const [currentYear, setCurrentYear] = useState(selectedDate.getFullYear());

  useEffect(() => {
    setCurrentMonth(selectedDate.getMonth());
    setCurrentYear(selectedDate.getFullYear());
  }, [selectedDate]);

  const months = [
    "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
    "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень",
  ];

  const daysOfWeek = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

  const getDaysInMonth = (month, year) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (month, year) => {
    const firstDay = new Date(year, month, 1).getDay();
    return firstDay === 0 ? 6 : firstDay - 1;
  };

  const navigateMonth = (direction) => {
      let newDate = new Date(currentYear, currentMonth);
      if (direction === "prev") {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      setCurrentMonth(newDate.getMonth());
      setCurrentYear(newDate.getFullYear());
  };

  const renderCalendarDays = () => {
    const daysInMonth = getDaysInMonth(currentMonth, currentYear);
    const firstDay = getFirstDayOfMonth(currentMonth, currentYear);
    const days = [];

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="p-2"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateString = formatDateToYYYYMMDD(date);
      const isSelected = formatDateToYYYYMMDD(selectedDate) === dateString;
      const isToday = formatDateToYYYYMMDD(new Date()) === dateString;
      const hasWork = workSchedule[dateString] && workSchedule[dateString].length > 0;

      days.push(
        <button
          key={day}
          onClick={() => onDateChange(date)}
          className={`p-2 text-sm rounded-lg transition-all duration-200 relative ${
            isSelected
              ? "bg-indigo-500 text-white shadow-lg"
              : isToday
              ? "bg-blue-100 text-blue-600 font-bold"
              : "hover:bg-gray-100"
          }`}
        >
          <span className="block">{day}</span>
          {hasWork && (
            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          )}
        </button>
      );
    }
    return days;
  };

  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigateMonth("prev")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <FaArrowLeft className="text-gray-600" />
        </button>
        <h3 className="text-lg font-semibold text-gray-800">
          {months[currentMonth]} {currentYear}
        </h3>
        <button
          onClick={() => navigateMonth("next")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <FaChevronDown className="text-gray-600 rotate-[-90deg]" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-2">
        {daysOfWeek.map((day) => (
          <div key={day} className="p-2 text-xs font-medium text-gray-500 text-center">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">{renderCalendarDays()}</div>
    </div>
  );
});

// Day schedule form component
const DayScheduleForm = ({
  selectedDate,
  employees,
  installations,
  onSave,
  timeOffEntries,
  workSchedule,
}) => {
  const [scheduleItems, setScheduleItems] = useState([
    { installationId: "", notes: "", workers: [{ employeeId: "", hours: 8 }] },
  ]);
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    const dateString = formatDateToYYYYMMDD(selectedDate);
    const existingSchedule = (workSchedule[dateString] || []).map((item) => ({
      installationId: item.isCustom ? "custom" : item.installationId,
      notes: item.notes || "",
      workers: item.workers.map((worker) => ({
        employeeId: worker.employeeId,
        hours: worker.hours,
      })),
    }));
    setScheduleItems(
      existingSchedule.length > 0
        ? existingSchedule
        : [{ installationId: "", notes: "", workers: [{ employeeId: "", hours: 8 }] }]
    );
  }, [selectedDate, workSchedule]);

  const addInstallation = () => {
    setScheduleItems([
      ...scheduleItems,
      { installationId: "", notes: "", workers: [{ employeeId: "", hours: 8 }] },
    ]);
  };

  const addWorker = (installationIndex) => {
    const newSchedule = [...scheduleItems];
    newSchedule[installationIndex].workers.push({ employeeId: "", hours: 8 });
    setScheduleItems(newSchedule);
  };

  const removeInstallation = (index) => {
    if (scheduleItems.length > 1) {
      setScheduleItems(scheduleItems.filter((_, i) => i !== index));
    }
  };

  const removeWorker = (installationIndex, workerIndex) => {
    const newSchedule = [...scheduleItems];
    if (newSchedule[installationIndex].workers.length > 1) {
      newSchedule[installationIndex].workers = newSchedule[
        installationIndex
      ].workers.filter((_, i) => i !== workerIndex);
      setScheduleItems(newSchedule);
    }
  };

  const updateField = (index, field, value) => {
    const newSchedule = [...scheduleItems];
    newSchedule[index][field] = value;
    // Reset notes if switching from custom task to a project
    if (field === "installationId" && value !== "custom") {
        const existingData = (workSchedule[formatDateToYYYYMMDD(selectedDate)] || []).find(item => item.installationId === value);
        newSchedule[index].notes = existingData ? existingData.notes : "";
    }
    setScheduleItems(newSchedule);
  };

  const updateWorker = (installationIndex, workerIndex, field, value) => {
    const newSchedule = [...scheduleItems];
    newSchedule[installationIndex].workers[workerIndex][field] = value;
    setScheduleItems(newSchedule);
  };
  
  const validateForm = () => {
    const errors = {};
    scheduleItems.forEach((item, index) => {
        if (item.installationId === 'custom' && !item.notes?.trim()) {
            if (!errors[index]) errors[index] = {};
            errors[index].notes = 'Опис завдання є обов\'язковим';
        }
        if (!item.installationId) {
            if (!errors[index]) errors[index] = {};
            errors[index].installationId = 'Оберіть проєкт або тип завдання';
        }
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if(!validateForm()) {
        alert("Будь ласка, заповніть усі обов'язкові поля.");
        return;
    }
    const validSchedule = scheduleItems.filter(
      (item) =>
        item.installationId && item.workers.some((worker) => worker.employeeId)
    );
    onSave(validSchedule);
  };

  const getDisabledWorkers = (currentInstallationIndex, currentWorkerIndex) => {
    const disabledWorkers = new Set();
    const dateString = formatDateToYYYYMMDD(selectedDate);

    timeOffEntries.forEach((entry) => {
      if (entry.work_date === dateString) {
        disabledWorkers.add(entry.employee_custom_id.toString());
      }
    });

    scheduleItems.forEach((item, installationIndex) => {
      item.workers.forEach((worker, workerIndex) => {
        if (
          worker.employeeId &&
          (installationIndex !== currentInstallationIndex ||
            workerIndex !== currentWorkerIndex)
        ) {
          disabledWorkers.add(worker.employeeId);
        }
      });
    });
    return disabledWorkers;
  };
  
  const installationOptions = [
      { value: 'custom', label: '📝 Інше завдання (ввести вручну)' },
      ...installations.map((inst) => ({
          value: inst.custom_id.toString(),
          label: `#${inst.custom_id} - ${inst.name || "Без назви"}`,
      }))
  ];

  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 space-y-4 sm:space-y-0">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">
            Планування на {selectedDate.toLocaleDateString("uk-UA")}
          </h3>
          <p className="text-sm text-gray-600">
            Призначте працівників на проєкти або інші завдання
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={addInstallation}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-sm"
          >
            <FaBuilding className="text-xs" />
            <span>Завдання</span>
          </button>
          <button
            onClick={handleSave}
            className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-sm"
          >
            <FaSave className="text-xs" />
            <span>Зберегти</span>
          </button>
        </div>
      </div>
      <div className="space-y-6">
        {scheduleItems.map((item, installationIndex) => {
            const isCustomTask = item.installationId === 'custom';
            return (
              <motion.div
                key={installationIndex}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-gray-200 rounded-xl p-4 bg-gray-50/50"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 space-y-2 sm:space-y-0">
                  <div className="flex items-center space-x-3 flex-1 w-full sm:w-auto">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isCustomTask ? 'bg-gradient-to-br from-sky-500 to-blue-600' : 'bg-gradient-to-br from-emerald-500 to-green-600'}`}>
                       {isCustomTask ? <FaTasks className="text-white text-xs" /> : <FaBuilding className="text-white text-xs" />}
                    </div>
                    <SelectWithSearch
                      options={installationOptions}
                      value={item.installationId}
                      onChange={(value) => updateField(installationIndex, "installationId", value)}
                      placeholder="Оберіть проєкт або тип завдання..."
                      className="flex-1"
                    />
                  </div>
                  {scheduleItems.length > 1 && (
                    <button
                      onClick={() => removeInstallation(installationIndex)}
                      className="sm:ml-2 p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <FaTimes className="text-xs" />
                    </button>
                  )}
                </div>
                 {item.installationId && (
                    <div className="relative mb-4">
                        <FaCommentDots className="absolute top-3 left-3 text-gray-400" />
                        <textarea
                            rows="2"
                            value={item.notes || ''}
                            onChange={(e) => updateField(installationIndex, "notes", e.target.value)}
                            placeholder={isCustomTask ? "Опишіть завдання (напр., розвозка панелей)..." : "Додатковий коментар (необов'язково)"}
                            className={`w-full pl-10 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${formErrors[installationIndex]?.notes ? 'border-red-500' : 'border-gray-300'}`}
                        />
                         {formErrors[installationIndex]?.notes && <p className="text-red-500 text-xs mt-1">{formErrors[installationIndex].notes}</p>}
                    </div>
                 )}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">Працівники:</h4>
                    <button
                      onClick={() => addWorker(installationIndex)}
                      className="flex items-center space-x-1 px-3 py-1 bg-indigo-100 text-indigo-600 rounded-lg text-xs font-medium hover:bg-indigo-200 transition-colors"
                    >
                      <FaUserPlus className="text-xs" />
                      <span>Додати</span>
                    </button>
                  </div>
                  {item.workers.map((worker, workerIndex) => {
                    const disabledWorkers = getDisabledWorkers(installationIndex, workerIndex);
                    return (
                      <div
                        key={workerIndex}
                        className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 bg-white rounded-lg p-3"
                      >
                        <div className="w-6 h-6 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                          <FaUser className="text-white text-xs" />
                        </div>
                        <SelectWithSearch
                          options={employees.map((emp) => ({
                            value: emp.custom_id.toString(),
                            label: `${emp.name} - ${emp.position}`,
                          }))}
                          value={worker.employeeId}
                          onChange={(value) =>
                            updateWorker(installationIndex, workerIndex, "employeeId", value)
                          }
                          placeholder="Оберіть працівника..."
                          className="flex-1 w-full"
                          isDisabled={(option) =>
                            disabledWorkers.has(option.value) &&
                            option.value !== worker.employeeId
                          }
                        />
                        <div className="flex items-center space-x-2 w-full sm:w-auto">
                          <FaClock className="text-gray-400 text-xs" />
                          <input
                            type="number"
                            min="1"
                            max="12"
                            value={worker.hours}
                            onChange={(e) =>
                              updateWorker(
                                installationIndex,
                                workerIndex,
                                "hours",
                                parseInt(e.target.value) || 0
                              )
                            }
                            className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                          />
                          <span className="text-xs text-gray-500">год</span>
                        </div>
                        {item.workers.length > 1 && (
                          <button
                            onClick={() => removeWorker(installationIndex, workerIndex)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <FaTimes className="text-xs" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )
        })}
      </div>
    </div>
  );
};

// Day schedule view component
const DayScheduleView = ({ selectedDate, daySchedule, employees, installations, onCancelInstallation }) => {
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpenFor(null);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  if (!daySchedule || daySchedule.length === 0) {
    return (
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50">
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center mx-auto mb-4">
            <FaCalendar className="text-white text-2xl" />
          </div>
          <h3 className="text-xl font-bold text-gray-600 mb-2">
            Немає запланованих робіт
          </h3>
          <p className="text-gray-500">
            На {selectedDate.toLocaleDateString("uk-UA")} не заплановано жодних робіт
          </p>
        </div>
      </div>
    );
  }

  const handleCancelClick = (schedule, reason) => {
    setMenuOpenFor(null);
    const taskIdentifier = schedule.isCustom ? `завдання "${schedule.notes}"` : `роботи на об'єкті #${schedule.installationId}`;
    
    // ✅ FIXED: Updated confirmation message to reflect deletion
    const message = reason === 'delete'
      ? `Ви впевнені, що хочете видалити ${taskIdentifier} з розкладу на цей день? Це неможливо буде скасувати.`
      : `Це ВИДАЛИТЬ ${taskIdentifier} з розкладу та позначить цей день як ВИХІДНИЙ для всіх призначених працівників. Продовжити?`;

    setConfirmModal({
      isOpen: true,
      message,
      onConfirm: () => {
        onCancelInstallation(schedule, reason);
        setConfirmModal({ isOpen: false, message: '', onConfirm: null });
      }
    });
  };

  const handleCancelModal = () => {
    setConfirmModal({ isOpen: false, message: '', onConfirm: null });
  };
  
  const getMenuIdentifier = (schedule) => schedule.isCustom ? schedule.notes : schedule.installationId;

  return (
    <>
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50">
        <h3 className="text-lg font-semibold text-gray-800 mb-6">
          Розклад на {selectedDate.toLocaleDateString("uk-UA")}
        </h3>
        <div className="space-y-4">
          {daySchedule.map((schedule, index) => {
            const installation = !schedule.isCustom ? installations.find(
              (inst) => inst.custom_id.toString() === schedule.installationId
            ) : null;
            const isCancelled = schedule.workers.every(w => w.hours === 0);
            const menuId = getMenuIdentifier(schedule);

            return (
              <div
                key={index}
                className={`border rounded-xl p-4 transition-all ${isCancelled ? 'bg-red-50/50 border-red-200' : 'bg-gradient-to-r from-gray-50 to-white border-gray-200'}`}
              >
                <div className="flex items-start space-x-3 mb-2">
                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCancelled ? 'bg-gradient-to-br from-red-400 to-pink-500' : (schedule.isCustom ? 'bg-gradient-to-br from-sky-500 to-blue-600' : 'bg-gradient-to-br from-emerald-500 to-green-600')}`}>
                    {schedule.isCustom ? <FaTasks className="text-white text-sm" /> : <FaBuilding className="text-white text-sm" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold text-gray-800 ${isCancelled ? 'line-through' : ''}`}>
                      {schedule.isCustom 
                        ? schedule.notes 
                        : `#${schedule.installationId} - ${installation?.name || "Невідомий проєкт"}`
                      }
                    </h4>
                    {installation?.gps_link && !isCancelled && (
                      <div className="flex items-center space-x-1 mt-1">
                        <FaMapMarkerAlt className="text-blue-500 text-xs" />
                        <a
                          href={installation.gps_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:text-blue-700"
                        >
                          Місцезнаходження
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="relative" ref={menuOpenFor === menuId ? menuRef : null}>
                    <button
                      onClick={() => setMenuOpenFor(menuOpenFor === menuId ? null : menuId)}
                      className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition-colors"
                    >
                      <FaEllipsisV />
                    </button>
                    <AnimatePresence>
                      {menuOpenFor === menuId && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -10 }}
                          className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border z-10 origin-top-right"
                        >
                          {!schedule.isCustom && 
                            <button
                                onClick={() => handleCancelClick(schedule, 'set-off')}
                                className="w-full text-left flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                                <FaCloudRain className="text-blue-500"/>
                                <span>Скасувати (дощ/погода)</span>
                            </button>
                           }
                           <button
                            onClick={() => handleCancelClick(schedule, 'delete')}
                            className="w-full text-left flex items-center space-x-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <FaTrash />
                            <span>Видалити з розкладу</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                 {schedule.isCustom && isCancelled && (
                    <div className="flex items-start space-x-2.5 p-3 rounded-lg mb-4 bg-red-100/70">
                        <FaCommentDots className="text-sm flex-shrink-0 mt-0.5 text-red-500" />
                        <p className="text-xs text-gray-800 break-words">{schedule.notes}</p>
                    </div>
                 )}
                 {!schedule.isCustom && schedule.notes && (
                    <div className={`flex items-start space-x-2.5 p-3 rounded-lg mb-4 ${isCancelled ? 'bg-red-100/70' : 'bg-amber-50/70'}`}>
                        <FaCommentDots className={`text-sm flex-shrink-0 mt-0.5 ${isCancelled ? 'text-red-500' : 'text-amber-500'}`} />
                        <p className="text-xs text-gray-800 break-words">{schedule.notes}</p>
                    </div>
                 )}
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-gray-700">Працівники:</h5>
                  {schedule.workers.map((worker, workerIndex) => {
                    const employee = employees.find(
                      (emp) => emp.custom_id.toString() === worker.employeeId
                    );
                    if (!employee) return null;
                    const positionInfo = positionColors[employee.position] || positionColors.default;
                    const PositionIcon = positionInfo.icon;
                    return (
                      <div
                        key={workerIndex}
                        className="flex items-center justify-between bg-white rounded-lg p-3"
                      >
                        <div className="flex items-center space-x-3">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center ${positionInfo.color}`}
                          >
                            <PositionIcon className="text-sm" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{employee.name}</p>
                            <p className="text-xs text-gray-500">{employee.position}</p>
                          </div>
                        </div>
                        <div className="text-right">
                           <p className={`text-sm font-medium ${isCancelled ? 'text-red-500 line-through' : 'text-gray-800'}`}>{worker.hours} год</p>
                          <p className="text-xs text-gray-500">робочих</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={handleCancelModal}
      />
    </>
  );
};

// Time off management component (memoized for performance)
const TimeOffManagement = memo(({
  employees,
  timeOffEntries,
  addNotification,
  onTimeOffChange,
}) => {
  const [showForm, setShowForm] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    employeeId: "",
    workDate: "",
    status: "",
    notes: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState(null);

  const statusOptions = [
    { value: "OFF", label: "Вихідний", icon: FaMoon },
    { value: "VACATION", label: "Відпустка", icon: FaPlane },
    { value: "SICK_LEAVE", label: "Лікарняний", icon: FaSyringe },
  ];

  const handleInputChange = (field, value) => {
    setTimeOffForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validateForm = () => {
    const errors = {};
    if (!timeOffForm.employeeId) errors.employeeId = "Оберіть працівника";
    if (!timeOffForm.workDate) errors.workDate = "Оберіть дату";
    if (!timeOffForm.status) errors.status = "Оберіть статус";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("attendance")
        .insert({
          employee_custom_id: parseInt(timeOffForm.employeeId),
          work_date: timeOffForm.workDate,
          status: timeOffForm.status,
          notes: timeOffForm.notes || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          addNotification("Цей запис вже існує для цього працівника та дати.", "error");
        } else {
          throw error;
        }
      } else {
        addNotification("Вихідний успішно додано!", "success");
        onTimeOffChange(data, "add");
        setShowForm(false);
        setTimeOffForm({ employeeId: "", workDate: "", status: "", notes: "" });
      }
    } catch (error) {
      addNotification("Сталася помилка при збереженні: " + error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = (id) => {
    setDeleteItemId(id);
    setShowConfirmModal(true);
  };

  const handleConfirmDelete = async () => {
    setShowConfirmModal(false);
    if (!deleteItemId) return;

    try {
      const { error } = await supabase.from("attendance").delete().eq("id", deleteItemId);
      if (error) throw error;
      addNotification("Запис успішно видалено!", "success");
      onTimeOffChange({ id: deleteItemId }, "delete");
    } catch (error) {
      addNotification("Помилка при видаленні запису: " + error.message, "error");
    } finally {
      setDeleteItemId(null);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirmModal(false);
    setDeleteItemId(null);
  };

  const getStatusInfo = (status) => {
    switch (status) {
      case "OFF":
        return { label: "Вихідний", color: "bg-red-100 text-red-600", icon: FaMoon };
      case "VACATION":
        return { label: "Відпустка", color: "bg-blue-100 text-blue-600", icon: FaPlane };
      case "SICK_LEAVE":
        return { label: "Лікарняний", color: "bg-yellow-100 text-yellow-600", icon: FaSyringe };
      default:
        return { label: "Невідомо", color: "bg-gray-100 text-gray-600", icon: FaCalendar };
    }
  };

  const today = formatDateToYYYYMMDD(new Date());
  const filteredTimeOffEntries = timeOffEntries
    .filter((entry) => entry.work_date >= today)
    .sort((a, b) => new Date(a.work_date) - new Date(b.work_date));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
          <FaCalendarAlt className="text-purple-600" />
          <span>Управління вихідними</span>
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-fuchsia-600 hover:from-purple-600 hover:to-fuchsia-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm"
        >
          <FaPlus className="text-sm" />
          <span>Додати запис</span>
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50 mb-6 overflow-hidden"
          >
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Додати новий запис</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Працівник</label>
                <SelectWithSearch
                  options={employees.map((emp) => ({
                    value: emp.custom_id.toString(),
                    label: `${emp.name} - ${emp.position}`,
                  }))}
                  value={timeOffForm.employeeId}
                  onChange={(value) => handleInputChange("employeeId", value)}
                  placeholder="Оберіть працівника..."
                  icon={FaUser}
                />
                {formErrors.employeeId && <p className="text-red-500 text-sm mt-1">{formErrors.employeeId}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Дата</label>
                <input
                  type="date"
                  value={timeOffForm.workDate}
                  onChange={(e) => handleInputChange("workDate", e.target.value)}
                  className={`w-full border rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm ${
                    formErrors.workDate ? "border-red-500" : "border-gray-300"
                  }`}
                />
                {formErrors.workDate && <p className="text-red-500 text-sm mt-1">{formErrors.workDate}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Статус</label>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => handleInputChange("status", option.value)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                        timeOffForm.status === option.value
                          ? "bg-indigo-500 text-white shadow-md"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      <option.icon />
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
                {formErrors.status && <p className="text-red-500 text-sm mt-1">{formErrors.status}</p>}
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label>
                <textarea
                  rows="2"
                  value={timeOffForm.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 resize-none text-sm"
                  placeholder="Причина, тривалість, тощо."
                ></textarea>
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Збереження...</span>
                  </>
                ) : (
                  <>
                    <FaSave className="text-sm" />
                    <span>Зберегти запис</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Список запланованих вихідних</h3>
        {filteredTimeOffEntries.length === 0 ? (
          <div className="text-center py-8 text-gray-500">Немає запланованих вихідних</div>
        ) : (
          <div className="space-y-3">
            {filteredTimeOffEntries.map((entry) => {
              const employee = employees.find((emp) => emp.custom_id === entry.employee_custom_id);
              const statusInfo = getStatusInfo(entry.status);
              const StatusIcon = statusInfo.icon;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gray-50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm space-y-2 sm:space-y-0"
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${statusInfo.color}`}
                    >
                      <StatusIcon className="text-sm" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">
                        {employee?.name || "Невідомий працівник"}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(entry.work_date).toLocaleDateString("uk-UA", {timeZone: 'UTC'})}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end space-x-2">
                     <span
                      className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.color}`}
                    >
                      {statusInfo.label}
                    </span>
                    <button
                      onClick={() => handleDeleteClick(entry.id)}
                      className="text-red-500 hover:text-red-700 transition-colors p-1"
                    >
                      <FaTrash className="text-sm" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={showConfirmModal}
        message="Ви впевнені, що хочете видалити цей запис про вихідний?"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </div>
  );
});

// Dashboard component (memoized for performance)
const Dashboard = memo(({ employees, timeOffEntries }) => {
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    const todayStr = formatDateToYYYYMMDD(today);
    const tomorrowStr = formatDateToYYYYMMDD(tomorrow);

    const getStatsForDate = (dateStr) => {
        const offEmployees = new Set(
            timeOffEntries
                .filter(entry => entry.work_date === dateStr)
                .map(entry => entry.employee_custom_id)
        );
        const offCount = offEmployees.size;
        const availableCount = employees.length - offCount;
        return { availableCount, offCount };
    };

    const todayStats = getStatsForDate(todayStr);
    const tomorrowStats = getStatsForDate(tomorrowStr);

    const StatCard = ({ title, value, icon: Icon, color }) => (
        <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50 flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="text-white text-xl" />
            </div>
            <div>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
                <p className="text-sm text-gray-600">{title}</p>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Сьогодні, {today.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <StatCard title="Доступні працівники" value={todayStats.availableCount} icon={FaSun} color="bg-gradient-to-br from-emerald-500 to-green-600" />
                    <StatCard title="Працівники вихідні" value={todayStats.offCount} icon={FaUserClock} color="bg-gradient-to-br from-amber-500 to-orange-600" />
                </div>
            </div>
             <div>
                <h2 className="text-xl font-bold text-gray-800 mb-4">Завтра, {tomorrow.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <StatCard title="Доступні працівники" value={tomorrowStats.availableCount} icon={FaSun} color="bg-gradient-to-br from-sky-500 to-blue-600" />
                    <StatCard title="Працівники вихідні" value={tomorrowStats.offCount} icon={FaUserClock} color="bg-gradient-to-br from-purple-500 to-fuchsia-600" />
                </div>
            </div>
        </div>
    );
});

export default function EmployeesManagement() {
  const [employees, setEmployees] = useState([]);
  const [installations, setInstallations] = useState([]);
  const [workSchedule, setWorkSchedule] = useState({});
  const [timeOffEntries, setTimeOffEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentView, setCurrentView] = useState("dashboard");
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [employeeForm, setEmployeeForm] = useState({ name: "", phone: "", position: "", notes: "" });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();
  const handleBack = () => navigate("/home");

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id));
  }, []);

  const addNotification = useCallback((message, type = "info", duration = 4000) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeNotification(id), duration);
  }, [removeNotification]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: employeesData, error: employeesError },
        { data: installationsData, error: installationsError },
        { data: scheduleData, error: scheduleError },
        { data: timeOffData, error: timeOffError },
      ] = await Promise.all([
        supabase.from("employees").select("*").order("created_at", { ascending: false }),
        supabase.from("installations").select("*").order("created_at", { ascending: false }),
        supabase.from("installation_workers").select("*, work_date, notes"),
        supabase.from("attendance").select("*").order("work_date", { ascending: false }),
      ]);

      if (employeesError || installationsError || scheduleError || timeOffError) {
        throw new Error("Помилка завантаження даних з БД.");
      }

      setEmployees(employeesData || []);
      setInstallations(installationsData || []);

      const processedSchedule = {};
      (scheduleData || []).forEach((item) => {
        const date = item.work_date;
        if(!date) return;
        
        if (!processedSchedule[date]) processedSchedule[date] = [];

        const isCustomTask = item.installation_custom_id === null;

        let installationEntry = processedSchedule[date].find(s => 
            isCustomTask 
            ? s.isCustom && s.notes === item.notes 
            : s.installationId === item.installation_custom_id.toString()
        );

        if (installationEntry) {
          installationEntry.workers.push({
            employeeId: item.employee_custom_id?.toString(),
            hours: item.work_hours || 0,
          });
        } else {
          processedSchedule[date].push({
            installationId: isCustomTask ? null : item.installation_custom_id.toString(),
            isCustom: isCustomTask,
            notes: item.notes || "",
            workers: [{
              employeeId: item.employee_custom_id?.toString(),
              hours: item.work_hours || 0,
            }],
          });
        }
      });
      setWorkSchedule(processedSchedule);
      setTimeOffEntries(timeOffData || []);
    } catch (error) {
      console.error("Помилка підключення до БД:", error);
      addNotification("Помилка підключення до БД. Перевірте зʼєднання.", "error");
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const saveDaySchedule = async (scheduleData) => {
    const dateString = formatDateToYYYYMMDD(selectedDate);
    try {
      const { error: deleteError } = await supabase
        .from("installation_workers")
        .delete()
        .eq("work_date", dateString);
      if (deleteError) throw new Error("Помилка видалення старого розкладу: " + deleteError.message);
      
      const insertData = scheduleData.flatMap(item => {
        const isCustom = item.installationId === 'custom';
        return item.workers
          .filter(worker => worker.employeeId)
          .map(worker => ({
            installation_custom_id: isCustom ? null : parseInt(item.installationId),
            employee_custom_id: parseInt(worker.employeeId),
            work_hours: worker.hours,
            work_date: dateString,
            notes: item.notes || null,
          }));
      });

      if (insertData.length > 0) {
        const { error: insertError } = await supabase.from("installation_workers").insert(insertData);
        if (insertError) throw new Error("Помилка збереження розкладу: " + insertError.message);
      }
      
      addNotification(insertData.length > 0 ? "Розклад успішно збережено!" : "Розклад на цей день очищено.", "success");
      
      await loadData();

    } catch (error) {
      console.error("Помилка:", error);
      addNotification("Сталася помилка при збереженні розкладу", "error");
    }
    if (currentView === "schedule") {
        setCurrentView("calendar");
    }
  };

  // ✅ FIXED: Reverted rainy day logic to DELETE from schedule
  const handleCancelInstallationWork = async (schedule, reason) => {
    const { installationId, isCustom, notes, workers } = schedule;
    const dateString = formatDateToYYYYMMDD(selectedDate);
    
    try {
        // Both 'delete' and 'set-off' will now DELETE the record from installation_workers.
        let deleteQuery = supabase
            .from("installation_workers")
            .delete()
            .eq('work_date', dateString);
        
        if (isCustom) {
            deleteQuery = deleteQuery.is('installation_custom_id', null).eq('notes', notes);
        } else {
            deleteQuery = deleteQuery.eq('installation_custom_id', installationId);
        }

        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
      
        // For 'set-off' (rainy day), we ALSO create attendance (day off) records.
        if (reason === 'set-off') {
            const timeOffNote = isCustom ? `Завдання "${notes}" скасовано` : `Роботи на об'єкті #${installationId} скасовано`;
            const timeOffData = workers.map(worker => ({
                employee_custom_id: parseInt(worker.employeeId),
                work_date: dateString,
                status: 'OFF',
                notes: `${timeOffNote} (погодні умови).`,
            }));

            const { data: newTimeOffEntries, error: attendanceError } = await supabase
                .from('attendance')
                .upsert(timeOffData, { onConflict: 'employee_custom_id, work_date', ignoreDuplicates: true })
                .select();
            if (attendanceError) throw attendanceError;
            
            if (newTimeOffEntries) {
                setTimeOffEntries(prev => {
                    const entryMap = new Map(prev.map(item => [item.id, item]));
                    newTimeOffEntries.forEach(item => entryMap.set(item.id, item));
                    return Array.from(entryMap.values());
                });
            }
        }
        
        addNotification(reason === 'delete' ? 'Завдання видалено з розкладу.' : 'Роботи скасовано, для працівників створено вихідний.', "success");
        await loadData(); // Reload data to reflect all changes

    } catch (error) {
      console.error("Помилка скасування робіт:", error);
      addNotification("Сталася помилка: " + error.message, "error");
    }
  };

  const handleAddEmployee = () => {
    setEditingEmployee(null);
    setShowEmployeeForm(true);
    setEmployeeForm({ name: "", phone: "+380", position: "", notes: "" });
    setFormErrors({});
  };

  const handleEditEmployee = (employee) => {
    setEditingEmployee(employee);
    setShowEmployeeForm(true);
    setEmployeeForm({
      name: employee.name || "",
      phone: employee.phone || "+380",
      position: employee.position || "",
      notes: employee.notes || "",
    });
    setFormErrors({});
  };

  const handleInputChange = (field, value) => {
    if (field === "phone") {
      if (!value.startsWith("+380")) {
        value = "+380" + value.replace(/^\+380/, "").replace(/[^\d]/g, "");
      }
      if (value.length > 13) {
        value = value.substring(0, 13);
      }
    }
    setEmployeeForm((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validateEmployeeForm = () => {
    const errors = {};
    if (!employeeForm.name.trim()) errors.name = "Введіть ім'я працівника";
    if (!employeeForm.position.trim()) errors.position = "Оберіть посаду";
    if (employeeForm.phone && !/^\+380\d{9}$/.test(employeeForm.phone.replace(/\s/g, ""))) {
      errors.phone = "Введіть коректний номер телефону (+380XXXXXXXXX)";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmitEmployee = async () => {
    if (!validateEmployeeForm()) return;
    setSubmitting(true);
    try {
      const employeeData = {
        name: employeeForm.name.trim(),
        phone: employeeForm.phone.trim() || null,
        position: employeeForm.position,
        notes: employeeForm.notes.trim() || null,
      };

      const query = editingEmployee
        ? supabase.from("employees").update(employeeData).eq("custom_id", editingEmployee.custom_id)
        : supabase.from("employees").insert(employeeData);

      const { data, error } = await query.select().single();

      if (error) throw error;
      
      if (editingEmployee) {
        setEmployees(prev => prev.map(emp => (emp.custom_id === editingEmployee.custom_id ? data : emp)));
      } else {
        setEmployees(prev => [data, ...prev]);
      }
      
      setShowEmployeeForm(false);
      addNotification(editingEmployee ? "Працівника успішно оновлено!" : "Працівника успішно додано!", "success");
    } catch (error) {
      console.error("Помилка збереження працівника:", error);
      addNotification("Помилка: " + error.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTimeOffChange = useCallback((entry, action) => {
    if (action === 'add') {
      setTimeOffEntries(prev => [...prev, entry]);
    } else if (action === 'delete') {
      setTimeOffEntries(prev => prev.filter(item => item.id !== entry.id));
    }
  }, []);

  const getPositionInfo = (position) => positionColors[position] || positionColors.default;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg mb-4 animate-pulse">
            <FaUsers className="text-white text-2xl" />
          </div>
          <p className="text-gray-600 font-medium">Завантаження даних...</p>
        </div>
      </div>
    );
  }

  const selectedDateString = formatDateToYYYYMMDD(selectedDate);
  const daySchedule = workSchedule[selectedDateString] || [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      <NotificationSystem notifications={notifications} removeNotification={removeNotification} />
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-indigo-400/20 to-purple-600/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-emerald-400/20 to-blue-600/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>
      <header className="relative bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-lg">
        <div className="px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <button
                onClick={handleBack}
                className="w-10 h-10 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white rounded-lg flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                <FaArrowLeft className="text-sm" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                  <FaCalendar className="text-white text-sm sm:text-lg" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Календар робіт
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">
                    Планування та управління розкладом
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentView("dashboard")}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm text-sm sm:text-base ${
                  currentView === "dashboard" ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white" : "bg-white/90 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FaTachometerAlt className="text-xs sm:text-sm" />
                <span className="hidden sm:inline">Панель</span>
              </button>
              <button
                onClick={() => setCurrentView("employees")}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm text-sm sm:text-base ${
                  currentView === "employees" ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white" : "bg-white/90 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FaUsers className="text-xs sm:text-sm" />
                <span className="hidden sm:inline">Працівники</span>
              </button>
              <button
                onClick={() => setCurrentView("time-off")}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm text-sm sm:text-base ${
                  currentView === "time-off" ? "bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white" : "bg-white/90 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FaCalendarAlt className="text-xs sm:text-sm" />
                <span className="hidden sm:inline">Вихідні</span>
              </button>
              <button
                onClick={() => setCurrentView("calendar")}
                className={`flex items-center space-x-2 px-3 sm:px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-sm text-sm sm:text-base ${
                  currentView === "calendar" ? "bg-gradient-to-r from-emerald-500 to-green-600 text-white" : "bg-white/90 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <FaCalendar className="text-xs sm:text-sm" />
                <span className="hidden sm:inline">Календар</span>
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="relative p-4 sm:p-6">
        {currentView === "dashboard" && (
            <Dashboard employees={employees} timeOffEntries={timeOffEntries} />
        )}

        {currentView === "employees" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
                <FaUsers className="text-indigo-600" />
                <span>Працівники ({employees.length})</span>
              </h2>
              <button
                onClick={handleAddEmployee}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm sm:text-base"
              >
                <FaPlus className="text-sm" />
                <span>Додати працівника</span>
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {employees.length === 0 ? (
                <div className="col-span-full text-center py-8">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <FaUsers className="text-white text-2xl" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-600 mb-2">Працівників не знайдено</h3>
                  <p className="text-gray-500 mb-4">Додайте першого працівника для початку роботи</p>
                  <button onClick={handleAddEmployee} className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium">
                    Додати працівника
                  </button>
                </div>
              ) : (
                employees.map((employee, index) => {
                  const positionInfo = getPositionInfo(employee.position);
                  const PositionIcon = positionInfo.icon;
                  return (
                    <motion.div
                      key={employee.custom_id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-500 ease-out hover:-translate-y-1"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                            <PositionIcon className="text-white text-sm sm:text-lg" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm sm:text-lg font-bold text-gray-800 truncate">{employee.name}</h3>
                            <p className="text-xs sm:text-sm text-gray-600">#{employee.custom_id}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleEditEmployee(employee)}
                          className="flex items-center space-x-1 px-3 py-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-xs sm:text-sm"
                        >
                          <FaEdit className="text-xs" />
                          <span>Редагувати</span>
                        </button>
                      </div>
                      <div className={`flex items-center space-x-2 ${positionInfo.color} px-3 py-2 rounded-lg mb-4`}>
                        <PositionIcon className="text-sm flex-shrink-0" />
                        <span className="text-sm font-medium truncate">{employee.position}</span>
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        {employee.phone && (
                          <div className="flex items-center space-x-2">
                            <FaPhone className="text-green-500 text-sm flex-shrink-0" />
                            <a href={`tel:${employee.phone}`} className="text-xs sm:text-sm text-gray-600 hover:text-indigo-600 transition-colors truncate">
                              {employee.phone}
                            </a>
                          </div>
                        )}
                        {employee.notes && (
                          <div className="flex items-start space-x-2">
                            <FaIdBadge className="text-purple-500 text-sm flex-shrink-0 mt-0.5" />
                            <span className="text-xs sm:text-sm text-gray-600 break-words line-clamp-2">
                              {employee.notes.length > 60 ? `${employee.notes.substring(0, 60)}...` : employee.notes}
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {currentView === "time-off" && (
          <TimeOffManagement
            employees={employees}
            timeOffEntries={timeOffEntries}
            addNotification={addNotification}
            onTimeOffChange={handleTimeOffChange}
          />
        )}

        {currentView === "calendar" && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div>
              <Calendar
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                workSchedule={workSchedule}
              />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800">{selectedDate.toLocaleDateString("uk-UA", { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentView("schedule")}
                    className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-sm"
                  >
                    <FaEdit className="text-xs" />
                    <span>{daySchedule.length > 0 ? "Редагувати" : "Створити"}</span>
                  </button>
                </div>
              </div>
              <DayScheduleView
                selectedDate={selectedDate}
                daySchedule={daySchedule}
                employees={employees}
                installations={installations}
                onCancelInstallation={handleCancelInstallationWork} 
              />
            </div>
          </div>
        )}

        {currentView === "schedule" && (
          <div>
            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={() => setCurrentView("calendar")}
                className="flex items-center space-x-2 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-all duration-200 text-sm"
              >
                <FaArrowLeft className="text-xs" />
                <span>Назад до календаря</span>
              </button>
            </div>
            <DayScheduleForm
              selectedDate={selectedDate}
              employees={employees}
              installations={installations}
              onSave={saveDaySchedule}
              workSchedule={workSchedule}
              timeOffEntries={timeOffEntries}
            />
          </div>
        )}
      </main>

      <AnimatePresence>
        {showEmployeeForm && (
          <motion.div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowEmployeeForm(false);
            }}
          >
            <motion.div
              className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-gray-200/50 my-8 max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-2">
                  {editingEmployee ? "Редагувати працівника" : "Додати нового працівника"}
                </h2>
                <p className="text-sm sm:text-base text-gray-600">
                  {editingEmployee ? "Оновіть інформацію про працівника" : "Заповніть інформацію про нового працівника"}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ім'я працівника <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={employeeForm.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base ${
                      formErrors.name ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="Петренко Олександр"
                  />
                  {formErrors.name && <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Телефон</label>
                  <input
                    type="tel"
                    value={employeeForm.phone}
                    onChange={(e) => handleInputChange("phone", e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base ${
                      formErrors.phone ? "border-red-500" : "border-gray-300"
                    }`}
                    placeholder="+380501234567"
                  />
                  {formErrors.phone && <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Посада <span className="text-red-500">*</span></label>
                  <select
                    value={employeeForm.position}
                    onChange={(e) => handleInputChange("position", e.target.value)}
                    className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 text-sm sm:text-base ${
                      formErrors.position ? "border-red-500" : "border-gray-300"
                    }`}
                  >
                    <option value="">Оберіть посаду...</option>
                    <option value="Монтажник">Монтажник</option>
                    <option value="Електрик">Електрик</option>
                    <option value="Інженер">Інженер</option>
                  </select>
                  {formErrors.position && <p className="text-red-500 text-sm mt-1">{formErrors.position}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label>
                  <textarea
                    rows="4"
                    value={employeeForm.notes}
                    onChange={(e) => handleInputChange("notes", e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200 resize-none text-sm sm:text-base"
                    placeholder="Додаткові примітки про працівника..."
                  ></textarea>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200 mt-8">
                <button
                  type="button"
                  onClick={() => setShowEmployeeForm(false)}
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all duration-200 disabled:opacity-50 text-sm sm:text-base"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={handleSubmitEmployee}
                  disabled={submitting}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:transform-none flex items-center justify-center space-x-2 text-sm sm:text-base"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>{editingEmployee ? "Оновлення..." : "Створення..."}</span>
                    </>
                  ) : (
                    <>
                      {editingEmployee ? <FaEdit className="text-sm" /> : <FaPlus className="text-sm" />}
                      <span>{editingEmployee ? "Оновити працівника" : "Створити працівника"}</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}