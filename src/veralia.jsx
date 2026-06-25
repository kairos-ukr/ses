import React, { useState, useEffect } from 'react';

// ================= ДОВІДНИКИ =================
const DEFECTS_DATA = [
  { categoryId: 'cat_glass', title: '🫧 Скло', items: [{ id: 'glass_stones', name: 'Камінці' }, { id: 'glass_bubbles', name: 'Пузирі' }, { id: 'glass_cords', name: 'Свилі (смуги)' }] },
  { categoryId: 'cat_cracks', title: '⚡ Тріщини', items: [{ id: 'crack_neck', name: 'Тріщина на горловині' }, { id: 'crack_body', name: 'Тріщина на корпусі' }, { id: 'crack_bottom', name: 'Тріщина на дні' }] },
  { categoryId: 'cat_geometry', title: '📐 Геометрія', items: [{ id: 'geom_neck', name: 'Викривлення горловини' }, { id: 'geom_height', name: 'Невідповідність висоти' }, { id: 'geom_bottom', name: 'Деформація дна' }] },
  { categoryId: 'cat_visual', title: '👁 Візуальні', items: [{ id: 'vis_dirt', name: 'Забруднення / Плями' }, { id: 'vis_scratch', name: 'Потертості / Подряпини' }] },
  { categoryId: 'cat_func', title: '⚙️ Функціональні', items: [{ id: 'func_thread', name: 'Брак різьби' }] },
];

const BLOCKING_REASONS = [
  { id: 'quality', label: '🛑 Брак якості (з лінії)' },
  { id: 'repack', label: '📦 Перепакування' },
  { id: 'wet', label: '💧 Замокша палета' },
  { id: 'other', label: '❓ Різне' },
];

const COMPLEXITY_LEVELS = [
  { id: 'low', label: '🟢 Легка', desc: 'Швидкий візуальний огляд, мінімум перекладання' },
  { id: 'medium', label: '🟡 Середня', desc: 'Детальна перевірка кожної одиниці' },
  { id: 'high', label: '🔴 Складна', desc: 'Додаткова обробка (протирання, зняття плівки тощо)' },
];

const ASSORTMENT = ["Пляшка 0.5л Прозора", "Пляшка 0.7л Оливкова", "Банка 1.0л СТО", "Пляшка 0.33л Зелена"];

// ================= ГОЛОВНИЙ КОМПОНЕНТ =================
export default function SmartDefectTracker() {
  // Стан навігації: IDLE, REASON, COMPLEXITY, SORTING, RESULTS, DATA_VIEW
  const [appState, setAppState] = useState('IDLE'); 
  
  // Поточні дані сесії
  const [pallet, setPallet] = useState(null);
  const [blockingReason, setBlockingReason] = useState(null);
  const [complexity, setComplexity] = useState(null);
  const [defectCounts, setDefectCounts] = useState({});
  const [expandedCategory, setExpandedCategory] = useState(null);
  
  // Дані з локального сховища
  const [savedReports, setSavedReports] = useState([]);

  // Завантаження даних при відкритті таблиці
  const loadSavedData = () => {
    const data = JSON.parse(localStorage.getItem('ses_pallet_reports') || '[]');
    setSavedReports(data);
  };

  // КРОК 1: Імітація сканування
  const handleScan = () => {
    setPallet({
      id: `PL-${Math.floor(10000 + Math.random() * 90000)}`,
      product: ASSORTMENT[Math.floor(Math.random() * ASSORTMENT.length)],
      machine: `Лінія ${Math.floor(Math.random() * 3) + 1}`,
      shift: ['А', 'Б', 'В', 'Г'][Math.floor(Math.random() * 4)],
      totalItems: 1200,
    });
    setAppState('REASON');
  };

  // КРОК 2: Вибір причини
  const selectReason = (reasonLabel) => {
    setBlockingReason(reasonLabel);
    setAppState('COMPLEXITY');
  };

  // КРОК 3: Вибір складності та перехід до сортування
  const selectComplexity = (comp) => {
    setComplexity(comp);
    setDefectCounts({});
    setExpandedCategory('cat_glass'); 
    setAppState('SORTING');
  };

  // Логіка підрахунку
  const totalDefects = Object.values(defectCounts).reduce((a, b) => a + b, 0);
  const goodItems = pallet ? pallet.totalItems - totalDefects : 0;

  const updateDefectCount = (defectId, amount) => {
    setDefectCounts((prev) => {
      let newCount = (prev[defectId] || 0) + amount;
      if (newCount < 0) newCount = 0;
      if (totalDefects - (prev[defectId] || 0) + newCount > pallet.totalItems) {
        newCount = pallet.totalItems - (totalDefects - (prev[defectId] || 0)); 
      }
      return { ...prev, [defectId]: newCount };
    });
  };

  // КРОК 4: Збереження в базу (localStorage)
  const finishAndSave = () => {
    const report = {
      timestamp: new Date().toLocaleString('uk-UA'),
      palletId: pallet.id,
      product: pallet.product,
      machine: pallet.machine,
      shift: pallet.shift,
      reason: blockingReason,
      complexity: complexity.label,
      totalItems: pallet.totalItems,
      defectsSum: totalDefects,
      goodItems: goodItems,
      defectsDetail: defectCounts // Зберігаємо деталі для майбутнього дашборда
    };

    const existingData = JSON.parse(localStorage.getItem('ses_pallet_reports') || '[]');
    const newData = [report, ...existingData]; // Нові записи зверху
    localStorage.setItem('ses_pallet_reports', JSON.stringify(newData));
    
    setAppState('RESULTS');
  };

  const resetToIdle = () => {
    setAppState('IDLE');
    setPallet(null);
  };

  const openDataView = () => {
    loadSavedData();
    setAppState('DATA_VIEW');
  };

  const clearDatabase = () => {
    if(window.confirm("Видалити всі збережені звіти?")) {
      localStorage.removeItem('ses_pallet_reports');
      setSavedReports([]);
    }
  };

  // Допоміжна функція
  const getCategoryTotal = (items) => items.reduce((sum, item) => sum + (defectCounts[item.id] || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans md:p-6 flex flex-col items-center select-none">
      <div className="w-full max-w-5xl bg-white md:rounded-2xl shadow-2xl overflow-hidden min-h-[90vh] flex flex-col">
        
        {/* ХЕДЕР */}
        <div className="bg-slate-900 text-white p-4 text-center shadow-md z-10 flex justify-between items-center px-6">
          <div className="w-1/3"></div>
          <h1 className="text-xl font-bold uppercase tracking-widest text-blue-400 w-1/3">SES System</h1>
          <div className="w-1/3 text-right text-xs text-slate-400">
            {new Date().toLocaleDateString('uk-UA')}
          </div>
        </div>

        <div className="flex-grow flex flex-col relative">
          
          {/* ================= ЕКРАН 0: ГОЛОВНИЙ (IDLE) ================= */}
          {appState === 'IDLE' && (
            <div className="flex-grow flex flex-col items-center justify-center p-6 bg-slate-50 relative">
              <div className="text-center space-y-4 mb-16">
                <p className="text-4xl font-bold text-slate-700">Цех пересортування</p>
                <p className="text-xl text-slate-500">Система готова до роботи</p>
              </div>
              
              <button onClick={handleScan} className="bg-blue-600 hover:bg-blue-700 text-white text-3xl font-bold py-10 px-16 rounded-[2rem] shadow-[0_10px_20px_rgba(37,99,235,0.3)] active:scale-95 transition-all z-10">
                📲 ВІДСКАНУВАТИ ПАЛЕТУ
              </button>

              {/* Кнопка переходу в Таблицю Даних */}
              <div className="absolute bottom-10 w-full px-10 flex justify-center border-t border-slate-200 pt-8">
                <button onClick={openDataView} className="bg-white border-2 border-slate-300 hover:border-slate-400 text-slate-600 text-xl font-bold py-4 px-12 rounded-xl shadow-sm flex items-center space-x-3 transition-colors">
                  <span>📊</span>
                  <span>Переглянути базу даних</span>
                </button>
              </div>
            </div>
          )}

          {/* ================= ЕКРАНИ НАЛАШТУВАНЬ ПАЛЕТИ ================= */}
          {appState === 'REASON' && (
            <div className="flex-grow flex flex-col p-8 bg-slate-50">
              <h2 className="text-3xl font-bold text-center text-slate-800 mb-8">Причина блокування?</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow max-w-3xl mx-auto w-full">
                {BLOCKING_REASONS.map((reason) => (
                  <button key={reason.id} onClick={() => selectReason(reason.label)} className="bg-white hover:bg-blue-50 border-2 border-slate-200 hover:border-blue-400 text-xl font-bold text-slate-700 py-6 px-4 rounded-2xl shadow-sm active:bg-blue-100 text-left">
                    {reason.label}
                  </button>
                ))}
              </div>
              <button onClick={resetToIdle} className="mt-8 text-slate-500 underline font-bold text-lg text-center">Скасувати</button>
            </div>
          )}

          {appState === 'COMPLEXITY' && (
            <div className="flex-grow flex flex-col p-8 bg-slate-50">
              <h2 className="text-3xl font-bold text-center text-slate-800 mb-8">Оцініть складність сортування</h2>
              <div className="flex flex-col gap-4 flex-grow max-w-2xl mx-auto w-full">
                {COMPLEXITY_LEVELS.map((comp) => (
                  <button key={comp.id} onClick={() => selectComplexity(comp)} className="bg-white hover:bg-slate-100 border-2 border-slate-200 text-left p-6 rounded-2xl shadow-sm active:bg-slate-200 transition-colors">
                    <div className="text-2xl font-bold text-slate-800 mb-2">{comp.label}</div>
                    <div className="text-slate-500 text-lg">{comp.desc}</div>
                  </button>
                ))}
              </div>
              <button onClick={() => setAppState('REASON')} className="mt-8 text-slate-500 underline font-bold text-lg text-center">Назад</button>
            </div>
          )}

          {/* ================= ЕКРАН ВНЕСЕННЯ ДАНИХ (СОРТУВАННЯ) ================= */}
          {appState === 'SORTING' && (
            <div className="flex flex-col h-full bg-slate-50">
              <div className="bg-white p-4 shadow-sm border-b border-slate-200">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-2xl font-bold text-slate-800">{pallet.id}</p>
                    <p className="text-slate-500">{pallet.product} | {pallet.machine}</p>
                  </div>
                  <div className="text-right text-sm font-bold flex flex-col gap-1">
                    <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded">Причина: {blockingReason.split(' ')[1]}</span>
                    <span className="bg-slate-100 text-slate-700 px-3 py-1 rounded">Складність: {complexity.label.split(' ')[1]}</span>
                  </div>
                </div>

                <div className="flex bg-slate-100 rounded-xl overflow-hidden h-16 border border-slate-200">
                  <div className="w-1/3 p-2 flex flex-col items-center border-r border-slate-200"><span className="text-xs uppercase text-slate-500 font-bold">Всього</span><span className="text-xl font-black">{pallet.totalItems}</span></div>
                  <div className="w-1/3 bg-red-50 p-2 flex flex-col items-center border-r border-red-100 text-red-600"><span className="text-xs uppercase font-bold">Брак</span><span className="text-2xl font-black">{totalDefects}</span></div>
                  <div className="w-1/3 bg-green-50 p-2 flex flex-col items-center text-green-700"><span className="text-xs uppercase font-bold">Хороші</span><span className="text-2xl font-black">{goodItems}</span></div>
                </div>
              </div>

              {/* СПИСОК ДЕФЕКТІВ */}
              <div className="flex-grow overflow-y-auto p-4 space-y-3">
                {DEFECTS_DATA.map((category) => {
                  const isExpanded = expandedCategory === category.categoryId;
                  const catTotal = getCategoryTotal(category.items);
                  return (
                    <div key={category.categoryId} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                      <button onClick={() => setExpandedCategory(isExpanded ? null : category.categoryId)} className={`w-full p-5 flex justify-between items-center transition-colors ${isExpanded ? 'bg-blue-50 border-b border-blue-100' : 'hover:bg-slate-50'}`}>
                        <span className="text-xl font-bold text-slate-700">{category.title}</span>
                        <div className="flex items-center space-x-4">
                          {catTotal > 0 && <span className="bg-red-100 text-red-600 font-bold px-3 py-1 rounded-full text-lg">{catTotal} шт</span>}
                          <span className={`text-slate-400 text-2xl ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="divide-y divide-slate-100">
                          {category.items.map((defect) => (
                            <div key={defect.id} className="p-4 flex items-center justify-between bg-white hover:bg-slate-50">
                              <span className="text-lg text-slate-700 font-medium">{defect.name}</span>
                              <div className="flex items-center space-x-4">
                                <button onClick={() => updateDefectCount(defect.id, -1)} disabled={!defectCounts[defect.id]} className="w-14 h-14 rounded-xl font-black text-2xl bg-slate-100 text-slate-600 disabled:opacity-30">-1</button>
                                <div className="w-16 text-center"><span className="text-3xl font-black">{defectCounts[defect.id] || 0}</span></div>
                                <button onClick={() => updateDefectCount(defect.id, 1)} disabled={totalDefects >= pallet.totalItems} className="w-14 h-14 rounded-xl font-black text-2xl bg-red-100 text-red-600 disabled:opacity-30">+1</button>
                                <button onClick={() => updateDefectCount(defect.id, 5)} disabled={totalDefects + 5 > pallet.totalItems} className="w-14 h-14 rounded-xl font-black text-xl bg-red-200 text-red-700 disabled:opacity-30">+5</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="p-4 bg-white border-t border-slate-200 z-10">
                <button onClick={finishAndSave} className="w-full bg-green-500 hover:bg-green-600 text-white text-2xl font-bold py-5 rounded-2xl shadow-lg active:scale-[0.98]">
                  ✅ ЗАВЕРШИТИ ТА ЗБЕРЕГТИ
                </button>
              </div>
            </div>
          )}

          {/* ================= ЕКРАН РЕЗУЛЬТАТІВ ================= */}
          {appState === 'RESULTS' && (
            <div className="flex-grow flex flex-col p-6 items-center justify-center bg-slate-50">
              <div className="text-center mb-8">
                <div className="inline-block bg-green-100 text-green-600 p-6 rounded-full mb-6 shadow-sm">
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <h2 className="text-4xl font-bold text-slate-800 mb-2">Дані успішно збережено!</h2>
                <p className="text-xl text-slate-500">Запис додано до локальної бази даних.</p>
              </div>
              <button onClick={resetToIdle} className="bg-slate-800 hover:bg-slate-900 text-white text-2xl font-bold py-6 px-16 rounded-2xl shadow-md active:scale-95">
                🔄 ПОВЕРНУТИСЯ НА ГОЛОВНУ
              </button>
            </div>
          )}

          {/* ================= ЕКРАН БАЗИ ДАНИХ (ТАБЛИЦЯ) ================= */}
          {appState === 'DATA_VIEW' && (
            <div className="flex-grow flex flex-col bg-white overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <h2 className="text-2xl font-bold text-slate-800">База збережених палет</h2>
                <div className="space-x-4">
                  <button onClick={clearDatabase} className="px-4 py-2 text-red-600 hover:bg-red-50 font-bold rounded-lg transition-colors border border-red-200">Очистити базу</button>
                  <button onClick={resetToIdle} className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg shadow hover:bg-slate-900">Назад до роботи</button>
                </div>
              </div>

              <div className="flex-grow overflow-auto p-6">
                {savedReports.length === 0 ? (
                  <div className="text-center text-slate-400 py-20 text-xl font-medium border-2 border-dashed border-slate-200 rounded-xl">
                    База даних порожня. Відскануйте першу палету.
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Час збереження</th>
                        <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Палета / Лінія</th>
                        <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Причина / Складність</th>
                        <th className="px-4 py-4 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Всього</th>
                        <th className="px-4 py-4 text-center text-xs font-bold text-red-500 uppercase tracking-wider">Брак</th>
                        <th className="px-4 py-4 text-center text-xs font-bold text-green-600 uppercase tracking-wider">Готові</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {savedReports.map((report, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-600 font-medium">{report.timestamp}</td>
                          <td className="px-4 py-3 text-sm">
                            <div className="font-bold text-slate-800">{report.palletId}</div>
                            <div className="text-slate-500 text-xs">{report.product} <br/> {report.machine} (Зм.{report.shift})</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="text-slate-700">{report.reason}</div>
                            <div className="text-slate-500 text-xs mt-1 font-semibold">{report.complexity}</div>
                          </td>
                          <td className="px-4 py-3 text-center font-medium">{report.totalItems}</td>
                          <td className="px-4 py-3 text-center font-bold text-red-600">{report.defectsSum}</td>
                          <td className="px-4 py-3 text-center font-bold text-green-600">{report.goodItems}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}