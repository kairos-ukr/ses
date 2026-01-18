import React, { useState, useRef } from 'react';
import { useReactToPrint } from 'react-to-print';
import { Printer, Plus, Trash2 } from 'lucide-react';

// --- СТИЛІ (Беремо з твого CSS) ---
const colors = {
  primary: '#3A5F7D', // Синій з ліній
  accent: '#F38217',  // Помаранчевий (Сума)
  bg: '#F9F9F9',
  text: '#000000',
};

const Page4 = () => {
  // --- STATE: Дані для таблиць ---
  const [equipment, setEquipment] = useState([
    { id: 1, name: 'Гібридний інвертор 1ф', model: 'Deye SUN-10K-SG02LP1-EU-AM3', qty: 1, price: 2030 },
    { id: 2, name: 'АКБ', model: 'Deye SE-G5.1 Pro-B', qty: 3, price: 950 },
    { id: 3, name: 'Сонячна панель', model: 'Trina TSN615', qty: 18, price: 95 },
  ]);

  const [services, setServices] = useState([
    { id: 1, name: 'Конструкція', model: 'Метал (оцинкований), кріплення', qty: 1, price: 630 },
    { id: 2, name: 'Робота', model: 'Встановлення та запуск сонячної станції', qty: 1, price: 800 },
    { id: 3, name: 'Електричний захист', model: 'Система захисту, автоматика, комутація', qty: 1, price: 300 },
  ]);

  const [cable, setCable] = useState({
    solarPrice: 1.7,
    powerPrice: 4.4,
    logistics: 160
  });

  // --- ЛОГІКА РОЗРАХУНКУ ---
  const calculateSubtotal = (items) => items.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const total = calculateSubtotal(equipment) + calculateSubtotal(services) + cable.logistics;

  // --- ФУНКЦІЇ РЕДАГУВАННЯ ---
  const handleQtyChange = (id, val, list, setList) => {
    setList(list.map(item => item.id === id ? { ...item, qty: Number(val) } : item));
  };
  
  const handleModelChange = (id, val, list, setList) => {
    setList(list.map(item => item.id === id ? { ...item, model: val } : item));
  };

  const componentRef = useRef();
  const handlePrint = useReactToPrint({ content: () => componentRef.current });

  return (
    <div className="flex bg-gray-100 min-h-screen font-sans">
      
      {/* === ЛІВА ПАНЕЛЬ (РЕДАКТОР) === */}
      <div className="w-1/3 p-6 bg-white border-r shadow-xl overflow-y-auto h-screen">
        <h2 className="text-xl font-bold mb-6 text-gray-800 flex items-center gap-2">
          🛠 Конструктор КП
        </h2>

        {/* Секція Обладнання */}
        <div className="mb-8">
          <h3 className="font-bold text-sm uppercase text-gray-500 mb-3">Ключове обладнання</h3>
          {equipment.map(item => (
            <div key={item.id} className="mb-4 p-3 border rounded-lg bg-gray-50 hover:border-blue-300 transition">
              <div className="flex justify-between mb-2">
                <span className="font-semibold text-sm">{item.name}</span>
                <span className="text-xs text-gray-500">{item.price}$ / шт</span>
              </div>
              <textarea 
                className="w-full p-2 border rounded text-sm mb-2"
                rows="2"
                value={item.model}
                onChange={(e) => handleModelChange(item.id, e.target.value, equipment, setEquipment)}
              />
              <div className="flex items-center gap-2">
                <label className="text-xs">Кількість:</label>
                <input 
                  type="number" 
                  value={item.qty} 
                  onChange={(e) => handleQtyChange(item.id, e.target.value, equipment, setEquipment)}
                  className="w-20 p-1 border rounded text-center"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Кнопка Друку */}
        <button 
          onClick={handlePrint}
          className="w-full bg-[#3A5F7D] hover:bg-[#2c4860] text-white py-3 rounded-lg flex items-center justify-center gap-2 font-bold shadow-lg transition-all"
        >
          <Printer size={20} /> Завантажити PDF
        </button>
      </div>

      {/* === ПРАВА ПАНЕЛЬ (PREVIEW) === */}
      <div className="w-2/3 bg-gray-500 p-8 overflow-y-auto h-screen flex justify-center">
        
        {/* Сторінка А4 (Масштаб 1:1) */}
        <div 
          ref={componentRef}
          className="bg-[#F9F9F9] relative shadow-2xl origin-top"
          style={{ width: '595px', minHeight: '842px', padding: '0px' }} // Розміри з твого CSS
        >
          
          {/* --- HEADER STATIC --- */}
          <div className="absolute top-[26px] left-[68px] font-semibold text-[20px] uppercase tracking-wider text-[#151414]">
            Комплектація та вартість гібридної СЕС
          </div>
          
          {/* Синя лінія під заголовком */}
          <div className="absolute top-[80px] left-[104px] w-[410px] h-0 border-t-[3px]" style={{ borderColor: colors.primary }}></div>

          {/* --- DYNAMIC CONTENT AREA --- */}
          {/* Ми відступаємо top: 110px як в дизайні, але далі використовуємо flex flow */}
          <div style={{ position: 'absolute', top: '110px', left: '30px', width: '535px' }}>
            
            {/* ТАБЛИЦЯ 1: ОБЛАДНАННЯ */}
            <div className="mb-2">
              <h3 className="italic font-semibold text-[20px] mb-2 text-black">Ключове обладнання</h3>
              
              {/* Шапка таблиці */}
              <div className="flex border-b-[3px] pb-1 mb-2" style={{ borderColor: colors.primary }}>
                <div className="w-[130px] font-medium text-[13px] pl-1">Позиція</div>
                <div className="w-[170px] font-medium text-[13px]">Модель</div>
                <div className="w-[80px] font-medium text-[13px] text-center">К-сть</div>
                <div className="w-[70px] font-medium text-[13px] text-right">Ціна, $</div>
                <div className="w-[85px] font-medium text-[13px] text-right pr-2">Сума, $</div>
              </div>

              {/* Рядки таблиці */}
              {equipment.map((item, index) => (
                <div key={item.id} className="flex items-start mb-3 text-[13px] leading-[16px]">
                   {/* Назва */}
                  <div className="w-[130px] pr-2">{item.name}</div>
                   {/* Модель (дозволяємо перенос слів!) */}
                  <div className="w-[170px] pr-2 text-gray-900 break-words whitespace-pre-wrap">
                    {item.model}
                  </div>
                  <div className="w-[80px] text-center">{item.qty} шт</div>
                  <div className="w-[70px] text-right">{item.price}</div>
                  <div className="w-[85px] text-right font-medium pr-2">
                    {item.price * item.qty}
                  </div>
                </div>
              ))}
            </div>

            {/* ТАБЛИЦЯ 2: МОНТАЖ (Йде одразу за першою, автоматично зсуваючись вниз) */}
            <div className="mt-6">
               {/* Лінія розділювач перед другою таблицею */}
              <div className="w-full h-0 border-t-[3px] mb-4" style={{ borderColor: colors.primary }}></div>
              
              <h3 className="italic font-semibold text-[20px] mb-2 text-black">Монтаж та інженерія</h3>
              
              {/* Шапка таблиці 2 */}
              <div className="flex border-b-[3px] pb-1 mb-2" style={{ borderColor: colors.primary }}>
                <div className="w-[130px] font-medium text-[13px] pl-1">Позиція</div>
                <div className="w-[170px] font-medium text-[13px]">Модель</div>
                <div className="w-[80px] font-medium text-[13px] text-center">К-сть</div>
                <div className="w-[70px] font-medium text-[13px] text-right">Ціна, $</div>
                <div className="w-[85px] font-medium text-[13px] text-right pr-2">Сума, $</div>
              </div>

              {/* Рядки таблиці 2 */}
              {services.map((item) => (
                <div key={item.id} className="flex items-start mb-3 text-[13px] leading-[16px]">
                  <div className="w-[130px] pr-2">{item.name}</div>
                  <div className="w-[170px] pr-2 break-words">{item.model}</div>
                  <div className="w-[80px] text-center">{item.qty > 0 ? `${item.qty} шт` : 'Набір'}</div>
                  <div className="w-[70px] text-right">{item.price}</div>
                  <div className="w-[85px] text-right font-medium pr-2">
                    {item.price * item.qty}
                  </div>
                </div>
              ))}
              
               {/* Окремі рядки для кабелів (статичні/напівдинамічні) */}
               <div className="flex items-start mb-3 text-[13px]">
                  <div className="w-[130px] pr-2">Сонячний кабель</div>
                  <div className="w-[170px] pr-2">Кабель КВЕ DB+ 6 мм² у подвійній ізоляції</div>
                  <div className="w-[80px] text-center">1 м</div>
                  <div className="w-[70px] text-right">{cable.solarPrice}</div>
                  <div className="w-[85px] text-[10px] text-right leading-3">Див. кінець сторінки</div>
               </div>
               
               <div className="flex items-start mb-3 text-[13px]">
                  <div className="w-[130px] pr-2">Електрика</div>
                  <div className="w-[170px] pr-2">Силовий кабель АВВГ 4х25 + двостінна гофра</div>
                  <div className="w-[80px] text-center">1 м</div>
                  <div className="w-[70px] text-right">{cable.powerPrice}</div>
                  <div className="w-[85px] text-[10px] text-right leading-3">Див. кінець сторінки</div>
               </div>

               {/* Логістика (Фінальна лінія розділювач) */}
               <div className="w-full h-0 border-t-[3px] my-3" style={{ borderColor: colors.primary }}></div>
               
               <div className="flex justify-between items-center text-[13px]">
                 <div className="pl-1">Логістика</div>
                 <div className="pr-2 font-medium">{cable.logistics} $</div>
               </div>
            </div>

            {/* ПІДСУМОК (Total) */}
            <div className="mt-8 flex justify-end items-end flex-col pr-2">
              <span className="text-[15px] mb-1">Орієнтовна вартість системи</span>
              <span className="text-[24px] font-bold" style={{ color: colors.accent }}>
                {total.toLocaleString()} $
              </span>
            </div>

          </div>

          {/* --- FOOTER (Прибитий до низу сторінки) --- */}
          <div className="absolute bottom-[20px] left-[32px] w-[556px] text-[10px] leading-[12px] text-gray-800">
            <p className="mb-1">Комплектація може змінюватися залежно від потреб та наявності обладнання.</p>
            <p className="mb-1">Кабель оплачується за фактом використання (ціна вказана за 1 м).</p>
            <p className="mb-1">Ціни актуальні на дату формування пропозиції.</p>
            <p>Гарантія: інвертор — 5 років, панелі — 12 років, АКБ — 5 років.</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Page4;