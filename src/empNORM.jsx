import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaUsers, FaUser, FaBuilding, FaCalendarAlt, FaPhone, FaPlus, FaArrowLeft,
  FaSearch, FaEdit, FaTimes, FaCheck, FaCog,
  FaChevronDown, FaUserPlus, FaTrash, FaCalendar, FaSave, FaClock,
  FaMapMarkerAlt, FaPlane, FaSyringe, FaMoon, FaEllipsisV, FaCloudRain,
  FaSun, FaUserClock, FaTachometerAlt, FaCommentDots, FaTasks,
  FaHome, FaUserFriends, FaIndustry, FaCreditCard, FaUserTie,
  FaEye, FaPencilAlt, FaBars, FaSignOutAlt, FaFolderOpen
} from "react-icons/fa";
import { createClient } from "@supabase/supabase-js";
import { useNavigate } from 'react-router-dom';

// Supabase client
const supabaseUrl = "https://logxutaepqzmvgsvscle.supabase.co";
const supabaseKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE";
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to format date correctly to YYY-MM-DD, respecting local timezone
const formatDateToYYYYMMDD = (date) => {
    if (!date) return null;
    const d = new Date(date);
    // Adjust for the timezone offset to get the correct "local" date in YYYY-MM-DD format
    const offset = d.getTimezoneOffset();
    const adjustedDate = new Date(d.getTime() - offset * 60 * 1000);
    return adjustedDate.toISOString().split("T")[0];
};


// --- ОПТИМІЗОВАНІ UI КОМПОНЕНТИ ---

const LoadingScreen = () => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg mb-4 animate-pulse">
            <FaUsers className="text-white text-2xl" />
        </div>
        <p className="text-gray-600 font-medium">Завантаження даних...</p>
      </div>
    </div>
);

// ✅ IMPROVED: Sidebar now slides from the left
const Sidebar = memo(({ onNavigate, onLogout, isOpen, setIsOpen }) => {
    const menuItems = [
      { id: 'home', label: 'Головна', icon: FaHome, path: '/home' },
      { id: 'clients', label: 'Клієнти', icon: FaUserFriends, path: '/clients' },
      { id: 'installations', label: "Об'єкти", icon: FaIndustry, path: '/installations' },
      { id: 'employees', label: 'Працівники', icon: FaUserTie, path: '/employees' },
      { id: 'equipment', label: 'Обладнання', icon: FaCog, path: '/equipment' },
      { id: 'payments', label: 'Платежі', icon: FaCreditCard, path: '/payments' },
      { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks, path: '/tasks' },
      { id: 'documents', label: 'Документи', icon: FaFolderOpen, path: '/documents' },
    ];
    
    const handleNavigation = (page) => {
        onNavigate(page);
        setIsOpen(false); // Close menu on navigation
    };

    return (
      <>
        {/* Mobile menu overlay */}
        <AnimatePresence>
            {isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOpen(false)} className="fixed inset-0 bg-black/30 z-[101]"/>}
        </AnimatePresence>
        
        {/* Sidebar panel */}
        <aside 
            className={`
                fixed top-0 left-0 z-[102] h-full w-64
                bg-white/95 backdrop-blur-xl text-slate-800 shadow-2xl border-r border-slate-200/50
                flex flex-col
                transform transition-transform duration-300 ease-in-out
                ${isOpen ? "translate-x-0" : "-translate-x-full"}
            `}
        >
            <div className="p-5 border-b border-slate-200/80 flex items-center justify-between">
                <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent" translate="no">K-Core</h2>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close menu"><FaTimes/></button>
            </div>
            <nav className="flex-1 py-4 overflow-y-auto">
                {menuItems.map((item) => (
                    <button key={item.id} onClick={() => handleNavigation(item.path)} className="w-full flex items-center space-x-4 px-6 py-3.5 text-left hover:bg-indigo-50 transition-all duration-200 group rounded-lg mx-2 my-1">
                        <item.icon className="text-slate-500 group-hover:text-indigo-600 transition-colors text-lg" />
                        <span className="font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{item.label}</span>
                    </button>
                ))}
            </nav>
            <div className="p-4 border-t border-slate-200/80">
                <button onClick={onLogout} className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 rounded-lg font-medium transition-all duration-200">
                    <FaSignOutAlt /><span>Вийти</span>
                </button>
            </div>
        </aside>
      </>
    );
});

const NotificationSystem = ({ notifications, removeNotification }) => (
  <div className="fixed top-4 right-4 z-[9999] flex flex-col items-end space-y-3">
    <AnimatePresence>
      {notifications.map((notification) => (
        <motion.div
          key={notification.id}
          layout
          initial={{ opacity: 0, y: 50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.7 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={`max-w-sm w-full ${
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
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center"><FaCheck className="text-sm" /></div>
              )}
              {notification.type === "error" && (
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center"><FaTimes className="text-sm" /></div>
              )}
              {notification.type === "info" && (
                <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center"><FaCalendar className="text-sm" /></div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{notification.message}</p>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="text-white/80 hover:text-white transition-colors"
              aria-label="Close notification"
            >
              <FaTimes className="text-sm" />
            </button>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);

const ConfirmationModal = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-[1000]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    >
      <motion.div
        className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl border border-gray-200/50"
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

const SelectWithSearch = memo(({
  options, value, onChange, placeholder, disabled, icon: Icon, className = "",
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
      setIsTop(spaceBelow < 250 && rect.top > 250);
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
        className={`w-full border rounded-xl px-4 py-3 text-base text-left transition-all duration-200 ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white text-gray-800 border-gray-300 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        } flex items-center justify-between`}
        disabled={disabled}
      >
        <div className="flex items-center space-x-3 min-w-0">
          {Icon && <Icon className="text-gray-500" />}
          <span className="truncate font-medium">
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <FaChevronDown className={`text-sm transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: isTop ? 10 : -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: isTop ? 10 : -10 }}
            className={`absolute z-20 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto ${isTop ? "bottom-full mb-2" : "top-full mt-2"}`}
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
                  autoFocus
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
                  className="block w-full text-left px-4 py-3 text-sm hover:bg-indigo-50 transition-colors text-gray-700"
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="text-center text-gray-500 py-4 text-sm">Не знайдено</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});


const Calendar = memo(({ selectedDate, onDateChange, workSchedule }) => {
  const [currentDisplayDate, setCurrentDisplayDate] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));

  useEffect(() => {
    // Only update the display month if the selectedDate's month is different
    if (selectedDate.getMonth() !== currentDisplayDate.getMonth() || selectedDate.getFullYear() !== currentDisplayDate.getFullYear()) {
      setCurrentDisplayDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [selectedDate, currentDisplayDate]);

  const months = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
  const daysOfWeek = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

  const currentMonth = currentDisplayDate.getMonth();
  const currentYear = currentDisplayDate.getFullYear();

  const navigateMonth = useCallback((direction) => {
    setCurrentDisplayDate(prevDate => {
        const newDate = new Date(prevDate);
        newDate.setMonth(newDate.getMonth() + direction);
        return newDate;
    });
  }, []);

  const renderCalendarDays = useCallback(() => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1; // Monday is 0
    
    const days = [];
    
    for (let i = 0; i < startOffset; i++) {
      days.push(<div key={`empty-${i}`} className="w-12 h-12"></div>);
    }
    
    const todayString = formatDateToYYYYMMDD(new Date());
    const selectedDateString = formatDateToYYYYMMDD(selectedDate);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateString = formatDateToYYYYMMDD(date);
      const isSelected = selectedDateString === dateString;
      const isToday = todayString === dateString;
      const hasWork = workSchedule[dateString] && workSchedule[dateString].length > 0;

      days.push(
        <button
          key={day}
          onClick={() => onDateChange(date)}
          className={`h-12 w-12 text-sm rounded-full flex items-center justify-center transition-all duration-200 relative ${
            isSelected
              ? "bg-indigo-600 text-white shadow-lg font-bold"
              : isToday
              ? "bg-indigo-100 text-indigo-700 font-bold"
              : "hover:bg-gray-100 text-gray-700"
          }`}
        >
          <span>{day}</span>
          {hasWork && !isSelected && (
            <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
          )}
        </button>
      );
    }
    return days;
  }, [currentMonth, currentYear, selectedDate, workSchedule, onDateChange]);

  return (
    <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Previous month"><FaArrowLeft className="text-gray-600" /></button>
        <h3 className="text-lg font-semibold text-gray-800 text-center">{months[currentMonth]} {currentYear}</h3>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors" aria-label="Next month"><FaChevronDown className="text-gray-600 rotate-[-90deg]" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 place-items-center mb-2">
        {daysOfWeek.map((day) => (<div key={day} className="w-12 text-xs font-medium text-gray-500 text-center">{day}</div>))}
      </div>
      <div className="grid grid-cols-7 gap-1 place-items-center">{renderCalendarDays()}</div>
    </div>
  );
});

const DayScheduleForm = memo(({
  selectedDate, employees, installations, onScheduleChange, scheduleItems, 
  timeOffEntries, onPreview, onCancel, addNotification
}) => {
  const [formErrors, setFormErrors] = useState({});

  const activeInstallations = useMemo(() => 
    installations.filter(inst => !['completed', 'cancelled'].includes(inst.status)), 
  [installations]);

  const addInstallation = useCallback(() => {
    onScheduleChange([
      { id: Date.now(), installationId: "", notes: "", workers: [{ id: Date.now() + 1, employeeId: "", hours: 8 }] },
      ...scheduleItems,
    ]);
  }, [scheduleItems, onScheduleChange]);

  // ✅ FIXED: New worker field now correctly appears at the top.
  const addWorker = useCallback((installationIndex) => {
    onScheduleChange(currentSchedule => 
      currentSchedule.map((item, index) => {
        if (index === installationIndex) {
          return {
            ...item,
            workers: [
              { id: Date.now(), employeeId: "", hours: 8 }, // Add new worker to the TOP
              ...item.workers
            ]
          };
        }
        return item;
      })
    );
  }, [onScheduleChange]);

  const removeInstallation = useCallback((index) => {
    onScheduleChange(currentSchedule => currentSchedule.filter((_, i) => i !== index));
  }, [onScheduleChange]);
  
  const removeWorker = useCallback((installationIndex, workerIndex) => {
    onScheduleChange(currentSchedule => {
      const newSchedule = [...currentSchedule];
      if (newSchedule[installationIndex].workers.length > 1) {
        newSchedule[installationIndex].workers = newSchedule[installationIndex].workers.filter((_, i) => i !== workerIndex);
      }
      return newSchedule;
    });
  }, [onScheduleChange]);

  const updateField = useCallback((index, field, value) => {
    onScheduleChange(currentSchedule => {
      const newSchedule = [...currentSchedule];
      newSchedule[index] = { ...newSchedule[index], [field]: value };
      return newSchedule;
    });
  }, [onScheduleChange]);

  const updateWorker = useCallback((installationIndex, workerIndex, field, value) => {
    onScheduleChange(currentSchedule => {
      const newSchedule = [...currentSchedule];
      const newWorkers = [...newSchedule[installationIndex].workers];
      newWorkers[workerIndex] = { ...newWorkers[workerIndex], [field]: value };
      newSchedule[installationIndex] = { ...newSchedule[installationIndex], workers: newWorkers };
      return newSchedule;
    });
  }, [onScheduleChange]);

  const validateForm = useCallback(() => {
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
      if (item.workers.every(w => !w.employeeId)) {
        if (!errors[index]) errors[index] = {};
        errors[index].workers = 'Додайте хоча б одного працівника';
      }
    });
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [scheduleItems]);
  
  const handlePreview = useCallback(() => {
    const validSchedule = scheduleItems.filter(item => item.installationId && item.workers.some(w => w.employeeId));
    if (validSchedule.length === 0) {
      addNotification("Будь ласка, додайте хоча б одне завдання з працівниками.", "error");
      return;
    }
    if (!validateForm()) {
      addNotification("Будь ласка, заповніть усі обов'язкові поля.", "error");
      return;
    }
    onPreview(validSchedule);
  }, [scheduleItems, addNotification, validateForm, onPreview]);

  const getUnavailableWorkers = useCallback((currentWorkerId) => {
    const unavailable = new Set();
    const dateString = formatDateToYYYYMMDD(selectedDate);
    timeOffEntries.forEach((entry) => { if (entry.work_date === dateString) { unavailable.add(entry.employee_custom_id.toString()); } });
    scheduleItems.forEach(item => { item.workers.forEach(worker => { if (worker.employeeId && worker.employeeId !== currentWorkerId) { unavailable.add(worker.employeeId); } }); });
    return unavailable;
  }, [selectedDate, timeOffEntries, scheduleItems]);
  
  return (
    <div className="flex flex-col h-full bg-slate-50">
      <header className="flex-shrink-0 flex items-center justify-between p-4 sm:p-6 border-b bg-white/80 backdrop-blur-xl">
        <div><h2 className="text-xl font-bold text-gray-800">Планування на день</h2><p className="text-sm text-gray-600">{selectedDate.toLocaleDateString("uk-UA", { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <button onClick={onCancel} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full" aria-label="Close form"><FaTimes /></button>
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {scheduleItems.map((item, installationIndex) => {
          const isCustomTask = item.installationId === 'custom';
          const selectedInstallationIds = scheduleItems
            .map(si => si.installationId)
            .filter(id => id !== item.installationId);

          const installationOptions = [
              { value: 'custom', label: '📝 Інше завдання (ввести вручну)' },
              ...activeInstallations
                  .filter(inst => !selectedInstallationIds.includes(inst.custom_id.toString()))
                  .map(inst => ({ value: inst.custom_id.toString(), label: `#${inst.custom_id} - ${inst.name || "Без назви"}` }))
          ];

          return (
            <motion.div key={item.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="border border-gray-200/80 rounded-2xl bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-200/80">
                    <div className="flex-1 min-w-0">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Завдання / Об'єкт</label>
                        <SelectWithSearch 
                            options={installationOptions} 
                            value={item.installationId} 
                            onChange={(value) => updateField(installationIndex, "installationId", value)} 
                            placeholder="Оберіть проєкт..." 
                            icon={FaBuilding}
                        />
                        {formErrors[installationIndex]?.installationId && <p className="text-red-500 text-xs mt-1">{formErrors[installationIndex].installationId}</p>}
                    </div>
                    {scheduleItems.length > 1 && (
                        <button onClick={() => removeInstallation(installationIndex)} className="self-end p-3 text-red-500 hover:bg-red-50 rounded-lg transition-colors" aria-label="Remove task">
                            <FaTrash />
                        </button>
                    )}
                </div>

                <div className="p-4 space-y-5">
                    {item.installationId && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">{isCustomTask ? "Опис завдання*" : "Додатковий коментар"}</label>
                            <div className="relative">
                                <FaCommentDots className="absolute top-4 left-4 text-gray-400" />
                                <textarea rows="3" value={item.notes || ''} onChange={(e) => updateField(installationIndex, "notes", e.target.value)}
                                    placeholder={isCustomTask ? "Наприклад: розвозка сонячних панелей по об'єктах..." : "Будь-які важливі деталі по роботі на об'єкті..."}
                                    className={`w-full pl-12 pr-4 py-3 text-base border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none ${formErrors[installationIndex]?.notes ? 'border-red-500' : 'border-gray-300'}`}
                                />
                                {formErrors[installationIndex]?.notes && <p className="text-red-500 text-xs mt-1">{formErrors[installationIndex].notes}</p>}
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-700">Працівники на цьому завданні:</h4>
                            <button onClick={() => addWorker(installationIndex)} className="flex items-center space-x-2 px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition-colors">
                                <FaUserPlus /><span>Додати</span>
                            </button>
                        </div>
                        {formErrors[installationIndex]?.workers && <p className="text-red-500 text-xs mt-1">{formErrors[installationIndex].workers}</p>}
                        
                        <div className="space-y-3">
                            {item.workers.map((worker, workerIndex) => {
                                const unavailableWorkers = getUnavailableWorkers(worker.employeeId);
                                const currentWorkerInfo = employees.find(emp => emp.custom_id.toString() === worker.employeeId);
                                const availableEmployees = employees.filter(emp => !unavailableWorkers.has(emp.custom_id.toString()));
                                if (currentWorkerInfo && !availableEmployees.some(e => e.custom_id === currentWorkerInfo.custom_id)) { 
                                    availableEmployees.unshift(currentWorkerInfo); 
                                }
                                return (
                                <div key={worker.id} className="flex flex-col sm:flex-row items-center gap-3 bg-slate-50 rounded-xl p-3 ring-1 ring-gray-200">
                                    <SelectWithSearch options={availableEmployees.map((emp) => ({ value: emp.custom_id.toString(), label: `#${emp.custom_id} - ${emp.name}` }))} value={worker.employeeId} onChange={(value) => updateWorker(installationIndex, workerIndex, "employeeId", value)} placeholder="Оберіть працівника..." className="flex-1 w-full" icon={FaUser} />
                                    <div className="flex items-center space-x-2 w-full sm:w-auto">
                                        <FaClock className="text-gray-400" />
                                        <input type="number" min="1" max="12" value={worker.hours} onChange={(e) => updateWorker(installationIndex, workerIndex, "hours", parseInt(e.target.value, 10) || 0)} className="w-24 border border-gray-300 rounded-xl p-3 text-base text-center focus:ring-2 focus:ring-indigo-500"/>
                                        <span className="text-sm text-gray-600">год</span>
                                    </div>
                                    {item.workers.length > 1 && (<button onClick={() => removeWorker(installationIndex, workerIndex)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors" aria-label="Remove worker"><FaTimes/></button>)}
                                </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>
          )
        })}
      </div>
      <footer className="flex-shrink-0 p-4 sm:p-6 border-t bg-white/80 backdrop-blur-xl flex flex-col sm:flex-row items-center gap-3">
        <button onClick={addInstallation} className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium transition-all duration-200 hover:bg-gray-100 hover:border-gray-400 text-base"><FaBuilding /><span>Додати Завдання</span></button>
        <button onClick={handlePreview} className="w-full sm:w-auto flex items-center justify-center space-x-2 px-5 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-base"><FaEye /><span>Попередній перегляд</span></button>
      </footer>
    </div>
  );
});


const SchedulePreview = memo(({ daySchedule, selectedDate, employees, installations, onConfirm, onBackToEdit, onCancel }) => { return (<div className="flex flex-col h-full bg-white/95 backdrop-blur-xl"><header className="flex-shrink-0 flex items-center justify-between p-4 sm:p-6 border-b"><div><h2 className="text-xl font-bold text-gray-800">Попередній перегляд</h2><p className="text-sm text-gray-600">{selectedDate.toLocaleDateString("uk-UA", { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><button onClick={onCancel} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full" aria-label="Close preview"><FaTimes /></button></header><div className="flex-1 overflow-y-auto p-4 sm:p-6"><div className="space-y-4">{daySchedule.map((schedule, index) => { const installation = schedule.installationId !== 'custom' ? installations.find(inst => inst.custom_id.toString() === schedule.installationId) : null; return (<div key={index} className="border rounded-xl p-4 bg-gradient-to-r from-gray-50 to-white border-gray-200"><div className="flex items-start space-x-3 mb-2"><div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${schedule.installationId === 'custom' ? 'bg-gradient-to-br from-sky-500 to-blue-600' : 'bg-gradient-to-br from-emerald-500 to-green-600'}`}>{schedule.installationId === 'custom' ? <FaTasks className="text-white text-sm" /> : <FaBuilding className="text-white text-sm" />}</div><div className="flex-1 min-w-0"><h4 className="font-semibold text-gray-800 break-words">{schedule.installationId === 'custom' ? schedule.notes : `#${schedule.installationId} - ${installation?.name || "Невідомий проєкт"}`}</h4></div></div>{schedule.notes && schedule.installationId !== 'custom' && (<div className="flex items-start space-x-2.5 p-3 rounded-lg mb-4 bg-amber-50/70"><FaCommentDots className="text-sm flex-shrink-0 mt-0.5 text-amber-500" /><p className="text-xs text-gray-800 break-words">{schedule.notes}</p></div>)}<div className="space-y-2"><h5 className="text-sm font-medium text-gray-700">Працівники:</h5>{schedule.workers.map((worker, workerIndex) => { const employee = employees.find((emp) => emp.custom_id.toString() === worker.employeeId); if (!employee) return null; return (<div key={workerIndex} className="flex items-center justify-between bg-white rounded-lg p-3"><div className="flex items-center space-x-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 text-gray-600"><FaUser className="text-sm" /></div><div><p className="text-sm font-medium text-gray-800">{employee.name}</p><p className="text-xs text-gray-500">#{employee.custom_id}</p></div></div><div className="text-right"><p className="text-sm font-medium text-gray-800">{worker.hours} год</p><p className="text-xs text-gray-500">робочих</p></div></div>); })}</div></div>); })}</div></div><footer className="flex-shrink-0 p-4 sm:p-6 border-t flex flex-col sm:flex-row items-center gap-3"><button onClick={onBackToEdit} className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium transition-all duration-200 text-sm"><FaPencilAlt className="text-xs" /><span>Повернутись до редагування</span></button><button onClick={onConfirm} className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium transition-all duration-200 shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-sm"><FaSave className="text-xs" /><span>Підтвердити та Зберегти</span></button></footer></div>); });
const DayScheduleView = memo(({ selectedDate, daySchedule, employees, installations, onCancelInstallation }) => {
  const [menuOpenFor, setMenuOpenFor] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, message: '', onConfirm: null });
  const menuRef = useRef(null);
  useEffect(() => { const handleOutsideClick = (event) => { if (menuRef.current && !menuRef.current.contains(event.target)) { setMenuOpenFor(null); } }; document.addEventListener("mousedown", handleOutsideClick); return () => document.removeEventListener("mousedown", handleOutsideClick); }, []);
  const handleCancelClick = useCallback((schedule, reason) => { setMenuOpenFor(null); const taskIdentifier = schedule.isCustom ? `завдання "${schedule.notes}"` : `роботи на об'єкті #${schedule.installationId}`; const message = reason === 'delete' ? `Ви впевнені, що хочете видалити ${taskIdentifier} з розкладу на цей день? Це неможливо буде скасувати.` : `Це ВИДАЛИТЬ ${taskIdentifier} з розкладу та позначить цей день як ВИХІДНИЙ для всіх призначених працівників. Продовжити?`; setConfirmModal({ isOpen: true, message, onConfirm: () => { onCancelInstallation(schedule, reason); setConfirmModal({ isOpen: false, message: '', onConfirm: null }); } }); }, [onCancelInstallation]);
  const handleCancelModal = useCallback(() => { setConfirmModal({ isOpen: false, message: '', onConfirm: null }); }, []);
  const getMenuIdentifier = (schedule) => schedule.isCustom ? schedule.notes : schedule.installationId;
  if (!daySchedule || daySchedule.length === 0) { return (<div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50"><div className="text-center py-8"><div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center mx-auto mb-4"><FaCalendar className="text-white text-2xl" /></div><h3 className="text-xl font-bold text-gray-600 mb-2">Немає запланованих робіт</h3><p className="text-gray-500">На {selectedDate.toLocaleDateString("uk-UA")} не заплановано жодних робіт.</p></div></div>); }
  return (
    <>
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50">
        <div className="space-y-4">
          {daySchedule.map((schedule) => {
            const installation = !schedule.isCustom ? installations.find(inst => inst.custom_id.toString() === schedule.installationId) : null;
            const isCancelled = schedule.workers.every(w => w.hours === 0);
            const menuId = getMenuIdentifier(schedule);
            return (
              <div key={menuId} className={`border rounded-xl p-4 transition-all ${isCancelled ? 'bg-red-50/50 border-red-200' : 'bg-gradient-to-r from-gray-50 to-white border-gray-200'}`}>
                <div className="flex items-start space-x-3 mb-2">
                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCancelled ? 'bg-gradient-to-br from-red-400 to-pink-500' : (schedule.isCustom ? 'bg-gradient-to-br from-sky-500 to-blue-600' : 'bg-gradient-to-br from-emerald-500 to-green-600')}`}>{schedule.isCustom ? <FaTasks className="text-white text-sm" /> : <FaBuilding className="text-white text-sm" />}</div>
                  <div className="flex-1 min-w-0"><h4 className={`font-semibold text-gray-800 break-words ${isCancelled ? 'line-through' : ''}`}>{schedule.isCustom ? schedule.notes : `#${schedule.installationId} - ${installation?.name || "Невідомий проєкт"}`}</h4>{installation?.gps_link && !isCancelled && (<div className="flex items-center space-x-1 mt-1"><FaMapMarkerAlt className="text-blue-500 text-xs" /><a href={installation.gps_link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:text-blue-700">Місцезнаходження</a></div>)}</div>
                  <div className="relative" ref={menuOpenFor === menuId ? menuRef : null}>
                    <button onClick={() => setMenuOpenFor(menuOpenFor === menuId ? null : menuId)} className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition-colors" aria-label="Task options"><FaEllipsisV /></button>
                    <AnimatePresence>{menuOpenFor === menuId && (<motion.div initial={{ opacity: 0, scale: 0.9, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -10 }} className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border z-10 origin-top-right">{!schedule.isCustom && <button onClick={() => handleCancelClick(schedule, 'set-off')} className="w-full text-left flex items-center space-x-3 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"><FaCloudRain className="text-blue-500"/><span>Скасувати (дощ/погода)</span></button>}<button onClick={() => handleCancelClick(schedule, 'delete')} className="w-full text-left flex items-center space-x-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"><FaTrash /><span>Видалити з розкладу</span></button></motion.div>)}</AnimatePresence>
                  </div>
                </div>
                 {(schedule.notes && (schedule.isCustom || !schedule.isCustom)) && (<div className={`flex items-start space-x-2.5 p-3 rounded-lg mb-4 ${isCancelled ? 'bg-red-100/70' : (schedule.isCustom ? '' : 'bg-amber-50/70')}`}>{schedule.notes && <FaCommentDots className={`text-sm flex-shrink-0 mt-0.5 ${isCancelled ? 'text-red-500' : 'text-amber-500'}`} />}{schedule.notes && <p className="text-xs text-gray-800 break-words">{schedule.notes}</p>}</div>)}
                <div className="space-y-2">
                  <h5 className="text-sm font-medium text-gray-700">Працівники:</h5>
                  {schedule.workers.map((worker, workerIndex) => {
                    const employee = employees.find(emp => emp.custom_id.toString() === worker.employeeId);
                    if (!employee) return null;
                    return (
                      <div key={workerIndex} className="flex items-center justify-between bg-white rounded-lg p-3">
                        <div className="flex items-center space-x-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 text-gray-600"><FaUser className="text-sm" /></div><div><p className="text-sm font-medium text-gray-800">{employee.name}</p><p className="text-xs text-gray-500">#{employee.custom_id}</p></div></div>
                        <div className="text-right"><p className={`text-sm font-medium ${isCancelled ? 'text-red-500 line-through' : 'text-gray-800'}`}>{worker.hours} год</p><p className="text-xs text-gray-500">робочих</p></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <ConfirmationModal isOpen={confirmModal.isOpen} message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={handleCancelModal} />
    </>
  );
});

const TimeOffManagement = memo(({ employees, timeOffEntries, addNotification, loadData }) => {
  const [showForm, setShowForm] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({ employeeId: "", startDate: "", endDate: "", status: "", notes: "" });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState(null);
  const statusOptions = useMemo(() => [ { value: "OFF", label: "Вихідний", icon: FaMoon }, { value: "VACATION", label: "Відпустка", icon: FaPlane }, { value: "SICK_LEAVE", label: "Лікарняний", icon: FaSyringe }, ], []);
  const handleInputChange = useCallback((field, value) => { setTimeOffForm(prev => ({ ...prev, [field]: value })); if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: "" })); }, [formErrors]);
  const validateForm = useCallback(() => { const errors = {}; if (!timeOffForm.employeeId) errors.employeeId = "Оберіть працівника"; if (!timeOffForm.startDate) errors.startDate = "Оберіть дату початку"; if (!timeOffForm.status) errors.status = "Оберіть статус"; setFormErrors(errors); return Object.keys(errors).length === 0; }, [timeOffForm]);
  const handleSubmit = useCallback(async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const start = new Date(timeOffForm.startDate);
      const end = timeOffForm.endDate ? new Date(timeOffForm.endDate) : start;
      if (start > end) { addNotification("Дата закінчення не може бути раніше дати початку.", "error"); setSubmitting(false); return; }
      const insertRecords = [];
      for (let day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) { insertRecords.push({ employee_custom_id: parseInt(timeOffForm.employeeId, 10), work_date: formatDateToYYYYMMDD(new Date(day)), status: timeOffForm.status, notes: timeOffForm.notes || null, }); }
      const { error } = await supabase.from("attendance").insert(insertRecords);
      if (error) { if (error.code === "23505") { addNotification("Один або декілька записів у цьому діапазоні вже існують.", "error"); } else throw error; } else { addNotification(`Записи на ${insertRecords.length} дн. успішно додано!`, "success"); await loadData(); setShowForm(false); setTimeOffForm({ employeeId: "", startDate: "", endDate: "", status: "", notes: "" }); }
    } catch (error) { addNotification(`Сталася помилка при збереженні: ${error.message}`, "error"); } finally { setSubmitting(false); }
  }, [validateForm, timeOffForm, addNotification, loadData]);
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteItemId) return;
    try {
      const { error } = await supabase.from("attendance").delete().eq("id", deleteItemId);
      if (error) throw error;
      addNotification("Запис успішно видалено!", "success");
      await loadData();
    } catch (error) { addNotification(`Помилка при видаленні запису: ${error.message}`, "error"); } finally { setDeleteItemId(null); }
  }, [deleteItemId, addNotification, loadData]);
  const getStatusInfo = useCallback((status) => { switch (status) { case "OFF": return { label: "Вихідний", color: "bg-red-100 text-red-600", icon: FaMoon }; case "VACATION": return { label: "Відпустка", color: "bg-blue-100 text-blue-600", icon: FaPlane }; case "SICK_LEAVE": return { label: "Лікарняний", color: "bg-yellow-100 text-yellow-600", icon: FaSyringe }; default: return { label: "Невідомо", color: "bg-gray-100 text-gray-600", icon: FaCalendar }; } }, []);
  const today = formatDateToYYYYMMDD(new Date());
  const filteredTimeOffEntries = useMemo(() => timeOffEntries.filter(entry => entry.work_date >= today).sort((a, b) => new Date(a.work_date) - new Date(b.work_date)), [timeOffEntries, today]);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><h2 className="text-xl font-bold text-gray-800">Управління вихідними</h2><button onClick={() => setShowForm(prev => !prev)} className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm transition-all"><FaPlus className="text-sm" /><span>Додати запис</span></button></div>
      <AnimatePresence>{showForm && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50 overflow-hidden"><h3 className="text-lg font-semibold text-gray-800 mb-4">Додати новий запис</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Працівник</label><SelectWithSearch options={employees.map(e => ({ value: e.custom_id.toString(), label: `#${e.custom_id} - ${e.name}` }))} value={timeOffForm.employeeId} onChange={v => handleInputChange("employeeId", v)} placeholder="Оберіть працівника..." icon={FaUser} />{formErrors.employeeId && <p className="text-red-500 text-sm mt-1">{formErrors.employeeId}</p>}</div><div><label className="block text-sm font-medium text-gray-700 mb-2">Дата початку</label><input type="date" value={timeOffForm.startDate} onChange={e => handleInputChange("startDate", e.target.value)} className={`w-full border rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm ${formErrors.startDate ? "border-red-500" : "border-gray-300"}`} />{formErrors.startDate && <p className="text-red-500 text-sm mt-1">{formErrors.startDate}</p>}</div><div><label className="block text-sm font-medium text-gray-700 mb-2">Дата закінчення (необов'язково)</label><input type="date" value={timeOffForm.endDate} min={timeOffForm.startDate} onChange={e => handleInputChange("endDate", e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 text-sm" /></div><div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Статус</label><div className="flex flex-wrap gap-2">{statusOptions.map(opt => (<button key={opt.value} onClick={() => handleInputChange("status", opt.value)} className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${timeOffForm.status === opt.value ? "bg-indigo-500 text-white shadow-md" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}><opt.icon /><span>{opt.label}</span></button>))}</div>{formErrors.status && <p className="text-red-500 text-sm mt-1">{formErrors.status}</p>}</div><div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label><textarea rows="2" value={timeOffForm.notes} onChange={e => handleInputChange("notes", e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 resize-none text-sm" placeholder="Причина, тривалість, тощо."></textarea></div></div><div className="flex justify-end mt-4"><button onClick={handleSubmit} disabled={submitting} className="flex items-center justify-center w-full sm:w-auto space-x-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-fuchsia-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 transition-all">{submitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Збереження...</span></>) : (<><FaSave className="text-sm" /><span>Зберегти запис</span></>)}</button></div></motion.div>)}</AnimatePresence>
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50"><h3 className="text-lg font-semibold text-gray-800 mb-4">Список запланованих вихідних</h3>{filteredTimeOffEntries.length === 0 ? (<div className="text-center py-8 text-gray-500">Немає запланованих вихідних</div>) : (<div className="space-y-3">{filteredTimeOffEntries.map(entry => { const employee = employees.find(emp => emp.custom_id === entry.employee_custom_id); const statusInfo = getStatusInfo(entry.status); return (<motion.div key={entry.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-50 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm gap-2"><div className="flex items-center space-x-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${statusInfo.color}`}><statusInfo.icon className="text-sm" /></div><div><p className="text-sm font-medium text-gray-800">{employee?.name || "Невідомий працівник"}</p><p className="text-xs text-gray-500">{new Date(entry.work_date).toLocaleDateString("uk-UA", { timeZone: 'UTC' })}</p></div></div><div className="flex items-center justify-end sm:justify-end space-x-2"><span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span><button onClick={() => setDeleteItemId(entry.id)} className="text-red-500 hover:text-red-700 p-1 transition-colors" aria-label="Delete entry"><FaTrash className="text-sm" /></button></div></motion.div>); })}</div>)}</div>
      <ConfirmationModal isOpen={!!deleteItemId} message="Ви впевнені, що хочете видалити цей запис про вихідний?" onConfirm={handleConfirmDelete} onCancel={() => setDeleteItemId(null)} />
    </div>
  );
});

const DashboardAndEmployees = memo(({ employees, timeOffEntries, onAdd, onEdit }) => {
    const todayStr = formatDateToYYYYMMDD(new Date());
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDateToYYYYMMDD(tomorrow);
    const getStatsForDate = useCallback((dateStr) => { const offEmployees = new Set(timeOffEntries.filter(e => e.work_date === dateStr).map(e => e.employee_custom_id)); const offCount = offEmployees.size; const availableCount = employees.length - offCount; return { availableCount, offCount }; }, [employees, timeOffEntries]);
    const todayStats = getStatsForDate(todayStr);
    const tomorrowStats = getStatsForDate(tomorrowStr);
    const StatCard = ({ title, value, icon: Icon, color }) => (<div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 shadow-xl border border-gray-200/50 flex items-center space-x-4"><div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}><Icon className="text-white text-xl" /></div><div><p className="text-2xl font-bold text-gray-800">{value}</p><p className="text-sm text-gray-600">{title}</p></div></div>);
    return (
        <div className="space-y-8">
            <div className="space-y-6">
                <div><h2 className="text-xl font-bold text-gray-800 mb-4">Сьогодні, {new Date().toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><StatCard title="Доступні працівники" value={todayStats.availableCount} icon={FaSun} color="bg-gradient-to-br from-emerald-500 to-green-600" /><StatCard title="Працівники вихідні" value={todayStats.offCount} icon={FaUserClock} color="bg-gradient-to-br from-amber-500 to-orange-600" /></div></div>
                 <div><h2 className="text-xl font-bold text-gray-800 mb-4">Завтра, {tomorrow.toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' })}</h2><div className="grid grid-cols-1 md:grid-cols-2 gap-6"><StatCard title="Доступні працівники" value={tomorrowStats.availableCount} icon={FaSun} color="bg-gradient-to-br from-sky-500 to-blue-600" /><StatCard title="Працівники вихідні" value={tomorrowStats.offCount} icon={FaUserClock} color="bg-gradient-to-br from-purple-500 to-fuchsia-600" /></div></div>
            </div>
            <div>
                <div className="flex items-center justify-between mb-6"><h2 className="text-xl font-bold text-gray-800 flex items-center space-x-2"><FaUsers className="text-indigo-600" /><span>Працівники ({employees.length})</span></h2><button onClick={onAdd} className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 text-sm transition-all"><FaPlus className="text-sm" /><span>Додати працівника</span></button></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {employees.length === 0 ? (<div className="col-span-full text-center py-8"><div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl flex items-center justify-center mx-auto mb-4"><FaUsers className="text-white text-2xl" /></div><h3 className="text-xl font-bold text-gray-600 mb-2">Працівників не знайдено</h3><p className="text-gray-500 mb-4">Додайте першого працівника для початку роботи</p><button onClick={onAdd} className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg font-medium">Додати працівника</button></div>) : 
                    (employees.map((employee, index) => (
                      <motion.div key={employee.custom_id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 sm:p-6 shadow-xl border border-gray-200/50 hover:shadow-2xl hover:bg-white/95 transition-all duration-300 hover:-translate-y-1">
                        <div className="flex items-start justify-between mb-4"><div className="flex items-center space-x-3 flex-1 min-w-0"><div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0"><FaUser className="text-white text-lg" /></div><div className="min-w-0 flex-1"><h3 className="text-lg font-bold text-gray-800 truncate">{employee.name}</h3><p className="text-sm text-gray-600">ID: {employee.custom_id}</p></div></div><button onClick={() => onEdit(employee)} className="flex items-center space-x-1 px-3 py-2 bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-lg font-medium shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-xs transition-all"><FaEdit className="text-xs" /><span>Редагувати</span></button></div>
                        <div className="space-y-3">
                          {employee.phone && (<div className="flex items-center space-x-2"><FaPhone className="text-green-500 text-sm flex-shrink-0" /><a href={`tel:${employee.phone}`} className="text-sm text-gray-600 hover:text-indigo-600 transition-colors truncate">{employee.phone}</a></div>)}
                          {employee.notes && (<div className="flex items-start space-x-2"><FaCommentDots className="text-purple-500 text-sm flex-shrink-0 mt-0.5" /><p className="text-sm text-gray-600 break-words line-clamp-2">{employee.notes}</p></div>)}
                        </div>
                      </motion.div>
                    )))
                  }
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
  const [activeTab, setActiveTab] = useState("dashboard"); 
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleModalMode, setScheduleModalMode] = useState('edit');
  const [draftSchedule, setDraftSchedule] = useState([]);
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [employeeForm, setEmployeeForm] = useState({ name: "", phone: "", notes: "" });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const removeNotification = useCallback((id) => { setNotifications((prev) => prev.filter((notif) => notif.id !== id)); }, []);
  const addNotification = useCallback((message, type = "info", duration = 4000) => { const id = Date.now(); setNotifications((prev) => [...prev, { id, message, type }]); setTimeout(() => removeNotification(id), duration); }, [removeNotification]);

  const loadData = useCallback(async () => {
    try {
      const [{ data: employeesData, error: employeesError }, { data: installationsData, error: installationsError }, { data: scheduleData, error: scheduleError }, { data: timeOffData, error: timeOffError }] = await Promise.all([
        supabase.from("employees").select("*").order("created_at", { ascending: false }),
        supabase.from("installations").select("*").order("created_at", { ascending: false }),
        supabase.from("installation_workers").select("*, work_date, notes"),
        supabase.from("attendance").select("*").order("work_date", { ascending: false }),
      ]);
      if (employeesError || installationsError || scheduleError || timeOffError) throw new Error("Помилка завантаження даних з БД.");
      
      setEmployees(employeesData || []);
      setInstallations(installationsData || []);
      const processedSchedule = {};
        (scheduleData || []).forEach((item) => {
            const date = item.work_date;
            if (!date) return;
            if (!processedSchedule[date]) processedSchedule[date] = [];
            const isCustomTask = item.installation_custom_id === null;
            const uniqueTaskKey = isCustomTask ? item.notes : item.installation_custom_id.toString();
            let installationEntry = processedSchedule[date].find(s => (isCustomTask && s.isCustom && s.notes === uniqueTaskKey) || (!isCustomTask && !s.isCustom && s.installationId === uniqueTaskKey));
            if (installationEntry) {
                installationEntry.workers.push({ employeeId: item.employee_custom_id?.toString(), hours: item.work_hours || 0 });
            } else {
                processedSchedule[date].push({ installationId: isCustomTask ? 'custom' : item.installation_custom_id.toString(), isCustom: isCustomTask, notes: item.notes || "", workers: [{ employeeId: item.employee_custom_id?.toString(), hours: item.work_hours || 0 }] });
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

  useEffect(() => { loadData(); }, [loadData]);
  
  const handleOpenScheduleModal = useCallback(() => {
    const dateString = formatDateToYYYYMMDD(selectedDate);
    const existingSchedule = (workSchedule[dateString] || []).map((item, index) => ({ ...item, id: Date.now() + index, workers: item.workers.map((w, wi) => ({...w, id: Date.now() + index + wi + 1000})) }));
    setDraftSchedule(existingSchedule.length > 0 ? existingSchedule : [{ id: Date.now(), installationId: "", notes: "", workers: [{ id: Date.now() + 1, employeeId: "", hours: 8 }] }]);
    setScheduleModalMode('edit');
    setIsScheduleModalOpen(true);
  }, [selectedDate, workSchedule]);

  const handleCloseScheduleModal = useCallback(() => { setIsScheduleModalOpen(false); setDraftSchedule([]); }, []);
  const handlePreviewSchedule = useCallback((finalSchedule) => { setDraftSchedule(finalSchedule); setScheduleModalMode('preview'); }, []);

  const saveDaySchedule = useCallback(async () => {
    const dateString = formatDateToYYYYMMDD(selectedDate);
    try {
      const { error: deleteError } = await supabase.from("installation_workers").delete().eq("work_date", dateString);
      if (deleteError) throw deleteError;
      
      const insertData = draftSchedule.flatMap(item => {
        const isCustom = item.installationId === 'custom';
        return item.workers.filter(w => w.employeeId).map(worker => ({ installation_custom_id: isCustom ? null : parseInt(item.installationId, 10), employee_custom_id: parseInt(worker.employeeId, 10), work_hours: worker.hours, work_date: dateString, notes: item.notes || null, }));
      });
      if (insertData.length > 0) { const { error: insertError } = await supabase.from("installation_workers").insert(insertData); if (insertError) throw insertError; }
      addNotification(insertData.length > 0 ? "Розклад успішно збережено!" : "Розклад на цей день очищено.", "success");
      await loadData();
      handleCloseScheduleModal();
    } catch (error) {
      console.error("Помилка збереження розкладу:", error);
      addNotification(`Сталася помилка: ${error.message}`, "error");
    }
  }, [selectedDate, draftSchedule, addNotification, loadData, handleCloseScheduleModal]);
  
  const handleCancelInstallationWork = useCallback(async (schedule, reason) => {
    const { installationId, isCustom, notes } = schedule;
    const dateString = formatDateToYYYYMMDD(selectedDate);
    try {
        let deleteQuery = supabase.from("installation_workers").delete().eq('work_date', dateString);
        deleteQuery = isCustom ? deleteQuery.is('installation_custom_id', null).eq('notes', notes) : deleteQuery.eq('installation_custom_id', installationId);
        const { error: deleteError } = await deleteQuery;
        if (deleteError) throw deleteError;
        if (reason === 'set-off') {
            const timeOffNote = isCustom ? `Завдання "${notes}" скасовано` : `Роботи на об'єкті #${installationId} скасовано`;
            const timeOffData = schedule.workers.map(worker => ({ employee_custom_id: parseInt(worker.employeeId, 10), work_date: dateString, status: 'OFF', notes: `${timeOffNote} (погодні умови).`, }));
            const { error: attendanceError } = await supabase.from('attendance').upsert(timeOffData, { onConflict: 'employee_custom_id, work_date' });
            if (attendanceError) throw attendanceError;
        }
        addNotification(reason === 'delete' ? 'Завдання видалено з розкладу.' : 'Роботи скасовано, для працівників створено вихідний.', "success");
        await loadData(); 
    } catch (error) {
      console.error("Помилка скасування робіт:", error);
      addNotification(`Сталася помилка: ${error.message}`, "error");
    }
  }, [selectedDate, addNotification, loadData]);

  const handleAddEmployee = useCallback(() => { setEditingEmployee(null); setShowEmployeeForm(true); setEmployeeForm({ name: "", phone: "+380", notes: "" }); setFormErrors({}); }, []);
  const handleEditEmployee = useCallback((employee) => { setEditingEmployee(employee); setShowEmployeeForm(true); setEmployeeForm({ name: employee.name || "", phone: employee.phone || "+380", notes: employee.notes || "" }); setFormErrors({}); }, []);
  const handleInputChange = useCallback((field, value) => { let finalValue = value; if (field === "phone") { const digits = value.replace(/\D/g, ''); finalValue = `+${digits}`; if (finalValue.length > 13) finalValue = finalValue.substring(0, 13); } setEmployeeForm(prev => ({ ...prev, [field]: finalValue })); if (formErrors[field]) setFormErrors(prev => ({ ...prev, [field]: "" })); }, [formErrors]);
  const validateEmployeeForm = useCallback(() => { const errors = {}; if (!employeeForm.name.trim()) errors.name = "Введіть ім'я працівника"; if (employeeForm.phone && employeeForm.phone.trim() !== "+380" && !/^\+380\d{9}$/.test(employeeForm.phone)) { errors.phone = "Введіть коректний номер телефону (+380XXXXXXXXX)"; } setFormErrors(errors); return Object.keys(errors).length === 0; }, [employeeForm]);
  const handleSubmitEmployee = useCallback(async () => {
    if (!validateEmployeeForm()) return;
    setSubmitting(true);
    try {
      const employeeData = { name: employeeForm.name.trim(), phone: (employeeForm.phone.trim() === "+380" || employeeForm.phone.trim() === "") ? null : employeeForm.phone.trim(), notes: employeeForm.notes.trim() || null, };
      const { error } = editingEmployee ? await supabase.from("employees").update(employeeData).eq("custom_id", editingEmployee.custom_id) : await supabase.from("employees").insert(employeeData);
      if (error) throw error;
      await loadData();
      setShowEmployeeForm(false);
      addNotification(editingEmployee ? "Працівника успішно оновлено!" : "Працівника успішно додано!", "success");
    } catch (error) { console.error("Помилка збереження працівника:", error); addNotification(`Помилка: ${error.message}`, "error"); } finally { setSubmitting(false); }
  }, [validateEmployeeForm, employeeForm, editingEmployee, addNotification, loadData]);
  const handleLogout = useCallback(async () => { await supabase.auth.signOut(); navigate("/"); }, [navigate]);
  const handleNavigate = useCallback((path) => { navigate(path); }, [navigate]);
  const tabs = useMemo(() => [ { id: 'dashboard', label: 'Огляд', icon: FaTachometerAlt }, { id: 'calendar', label: 'Календар', icon: FaCalendar }, { id: 'time-off', label: 'Вихідні', icon: FaCalendarAlt }, ], []);

  if (loading) { return <LoadingScreen />; }
  const selectedDateString = formatDateToYYYYMMDD(selectedDate);
  const daySchedule = workSchedule[selectedDateString] || [];

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
        <NotificationSystem notifications={notifications} removeNotification={removeNotification} />
        <Sidebar onNavigate={handleNavigate} onLogout={handleLogout} isOpen={isMenuOpen} setIsOpen={setIsMenuOpen} />
        
        {/* ✅ ADDED: New static header */}
        <header className="sticky top-0 z-40 bg-slate-50/80 backdrop-blur-lg border-b border-slate-200">
            <div className="flex items-center justify-between p-4 sm:p-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Управління командою</h1>
                    <p className="text-sm sm:text-base text-slate-500">Розклад, вихідні та список працівників</p>
                </div>
                <button 
                    onClick={() => setIsMenuOpen(true)} 
                    className="p-3 bg-white/80 backdrop-blur-md rounded-full shadow-md text-slate-700 hover:bg-slate-100 transition" 
                    aria-label="Open menu"
                >
                    <FaBars/>
                </button>
            </div>
        </header>
        
        {/* ✅ ADJUSTED: Main content padding */}
        <main className="p-4 sm:p-6 lg:p-8">
            <div className="mb-6 bg-slate-200/50 p-1 rounded-lg flex flex-col sm:flex-row flex-wrap sm:space-x-1 gap-1 sm:gap-0">
                {tabs.map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2.5 rounded-md font-medium text-sm transition-all duration-200 shadow-sm ${activeTab === tab.id ? "bg-white text-indigo-600 shadow-md" : "bg-transparent text-slate-600 hover:bg-white/50"}`}><tab.icon /><span>{tab.label}</span></button>))}
            </div>

            <AnimatePresence mode="wait">
                <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                    {activeTab === "dashboard" && (<DashboardAndEmployees employees={employees} timeOffEntries={timeOffEntries} onAdd={handleAddEmployee} onEdit={handleEditEmployee} />)}
                    {activeTab === "time-off" && (<TimeOffManagement employees={employees} timeOffEntries={timeOffEntries} addNotification={addNotification} loadData={loadData} />)}
                    {activeTab === "calendar" && (
                      <div className="space-y-6">
                         <Calendar selectedDate={selectedDate} onDateChange={setSelectedDate} workSchedule={workSchedule} />
                         <div>
                            <div className="flex items-center justify-between mt-6 mb-4">
                                <h3 className="text-lg font-semibold text-gray-800">{selectedDate.toLocaleDateString("uk-UA", { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                                <button onClick={handleOpenScheduleModal} className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg font-medium shadow-sm hover:shadow-md transform hover:-translate-y-0.5 text-sm transition-all">
                                    <FaEdit className="text-xs" /><span>{daySchedule.length > 0 ? "Редагувати" : "Створити"}</span>
                                </button>
                            </div>
                            <DayScheduleView selectedDate={selectedDate} daySchedule={daySchedule} employees={employees} installations={installations} onCancelInstallation={handleCancelInstallationWork} />
                         </div>
                      </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </main>
        
        <AnimatePresence>
          {isScheduleModalOpen && (
              <motion.div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex flex-col justify-end z-[70]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={handleCloseScheduleModal}>
                <motion.div className="w-full max-h-[90vh] bg-white rounded-t-2xl shadow-2xl" initial={{ y: "100%" }} animate={{ y: "0%" }} exit={{ y: "100%" }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} onClick={e => e.stopPropagation()}>
                    <AnimatePresence mode="wait">
                        <motion.div key={scheduleModalMode} initial={{ opacity: 0, x: scheduleModalMode === 'edit' ? -50 : 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: scheduleModalMode === 'edit' ? 50 : -50 }} transition={{ duration: 0.2 }} className="h-full">
                            {scheduleModalMode === 'edit' ? (<DayScheduleForm selectedDate={selectedDate} employees={employees} installations={installations} scheduleItems={draftSchedule} onScheduleChange={setDraftSchedule} timeOffEntries={timeOffEntries} onPreview={handlePreviewSchedule} onCancel={handleCloseScheduleModal} addNotification={addNotification} />) : 
                             (<SchedulePreview selectedDate={selectedDate} daySchedule={draftSchedule} employees={employees} installations={installations} onConfirm={saveDaySchedule} onBackToEdit={() => setScheduleModalMode('edit')} onCancel={handleCloseScheduleModal} />)}
                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEmployeeForm && (
            <motion.div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-[80] overflow-y-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowEmployeeForm(false)}>
              <motion.div className="bg-white/95 backdrop-blur-xl rounded-2xl p-6 sm:p-8 w-full max-w-2xl shadow-2xl border border-gray-200/50 my-8 max-h-[90vh] overflow-y-auto" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} onClick={e => e.stopPropagation()}>
                <div className="mb-6"><h2 className="text-2xl font-bold text-gray-800">{editingEmployee ? "Редагувати працівника" : "Додати нового працівника"}</h2><p className="text-sm text-gray-600">{editingEmployee ? "Оновіть інформацію про працівника" : "Заповніть інформацію про нового працівника"}</p></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Ім'я працівника <span className="text-red-500">*</span></label><input type="text" value={employeeForm.name} onChange={e => handleInputChange("name", e.target.value)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 text-base ${formErrors.name ? "border-red-500" : "border-gray-300"}`} placeholder="Петренко Олександр"/>{formErrors.name && <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>}</div>
                  <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Телефон</label><input type="tel" value={employeeForm.phone} onChange={e => handleInputChange("phone", e.target.value)} className={`w-full border rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 text-base ${formErrors.phone ? "border-red-500" : "border-gray-300"}`} placeholder="+380501234567"/>{formErrors.phone && <p className="text-red-500 text-sm mt-1">{formErrors.phone}</p>}</div>
                  <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Примітки</label><textarea rows="4" value={employeeForm.notes} onChange={e => handleInputChange("notes", e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 resize-none text-base" placeholder="Додаткові примітки про працівника..."></textarea></div>
                </div>
                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-6 border-t border-gray-200 mt-8">
                  <button type="button" onClick={() => setShowEmployeeForm(false)} disabled={submitting} className="w-full sm:w-auto px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl font-medium transition-all disabled:opacity-50 text-base">Скасувати</button>
                  <button type="button" onClick={handleSubmitEmployee} disabled={submitting} className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 flex items-center justify-center space-x-2 text-base">{submitting ? (<><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>{editingEmployee ? "Оновлення..." : "Створення..."}</span></>) : (<>{editingEmployee ? <FaEdit /> : <FaPlus />}<span>{editingEmployee ? "Оновити" : "Створити"}</span></>)}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
    </div>
  );
}