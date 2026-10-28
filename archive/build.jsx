import React, { useMemo, useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "./supabaseClient";

const A4_W = 595;
const A4_H = 842;

// === ХЕЛПЕРИ ДЛЯ ФОРМАТУВАННЯ ===
const toNum = (v) => {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const fmtMoney = (n) => {
  if (n == null) return "";
  if (n < 50 && n % 1 !== 0) return n.toFixed(2).replace(".", ",");
  const v = Math.round(n);
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

const showMoneyOrBlank = (n) => (n == null ? "" : fmtMoney(n));

export default function CommercialOfferBuilder() {
  // === СТАН ДОДАТКА (ДАНІ) ===
  const [vatSettings, setVatSettings] = useState({ enabled: false, percent: 20 });
  const [headerPower, setHeaderPower] = useState({ inverterKw: "", panelsKw: "", akbKw: "" });

  const [inverter, setInverter] = useState({ enabled: true, position: "Гібридний\nінвертор 1ф", model: "DEYE SUN-6K-SG05LP1-EU-AM2-P", qty: "1", price: "990", power_kw: 6 });
  const [battery, setBattery] = useState({ enabled: true, position: "АКБ", model: "Deye SE-F5 Pro-C", qty: "1", price: "980", power_kw: 5.1 });
  const [panel, setPanel] = useState({ enabled: true, position: "Сонячна\nпанель", model: "LONGI SOLAR 645M", qty: "14", price: "105", power_kw: 0.645 });
  const [mounting, setMounting] = useState({ enabled: true, position: "Конструкція", model: "Метал (оцинкований), кріплення", qtyLabel: "Набір", price: "500" });
  
  const [labor, setLabor] = useState({ enabled: true, sum: "1000" });
  const [electrical, setElectrical] = useState({ enabled: true, price: "300" });
  const [cables, setCables] = useState({ enabled: true, solarPrice: "1.6", powerName: "Силовий кабель ПВС 5*6 +двостінна гофра", powerPrice: "5.5" });
  
  const [groundingEnabled, setGroundingEnabled] = useState(true);
  const [logistics, setLogistics] = useState({ enabled: true, position: "Логістика", sum: "200" });

  const hiddenPdfRef = useRef(null);

  // Авторозрахунок потужності
  useEffect(() => {
    const invKw = (toNum(inverter.qty) || 0) * (toNum(inverter.power_kw) || 0);
    const panKw = (toNum(panel.qty) || 0) * (toNum(panel.power_kw) || 0);
    const batKw = (toNum(battery.qty) || 0) * (toNum(battery.power_kw) || 0);

    setHeaderPower({
      inverterKw: invKw > 0 ? invKw.toFixed(1).replace(/\.0$/, '') : "",
      panelsKw: panKw > 0 ? panKw.toFixed(2).replace(/\.?0+$/, '') : "",
      akbKw: batKw > 0 ? batKw.toFixed(1).replace(/\.0$/, '') : "",
    });
  }, [inverter.qty, inverter.power_kw, panel.qty, panel.power_kw, battery.qty, battery.power_kw]);

  const getPriceWithVat = (rawPrice) => {
    const p = toNum(rawPrice);
    if (p == null) return null;
    return vatSettings.enabled ? p * (1 + (toNum(vatSettings.percent) || 0) / 100) : p;
  };

  const sums = useMemo(() => {
    const invSum = inverter.enabled ? (toNum(inverter.qty) * getPriceWithVat(inverter.price)) : null;
    const batSum = battery.enabled ? (toNum(battery.qty) * getPriceWithVat(battery.price)) : null;
    const panSum = panel.enabled ? (toNum(panel.qty) * getPriceWithVat(panel.price)) : null;
    const mountSum = mounting.enabled ? getPriceWithVat(mounting.price) : null; 
    const laborSumVal = labor.enabled ? getPriceWithVat(labor.sum) : null;
    const elecSum = electrical.enabled ? getPriceWithVat(electrical.price) : null;
    const logisticsSum = logistics.enabled ? getPriceWithVat(logistics.sum) : null;

    const arr = [invSum, batSum, panSum, mountSum, laborSumVal, elecSum, logisticsSum].filter((x) => x != null && !isNaN(x));
    const total = arr.length ? arr.reduce((a, b) => a + b, 0) : null;

    return { invSum, batSum, panSum, mountSum, labor: laborSumVal, electrical: elecSum, logisticsSum, total };
  }, [inverter, battery, panel, mounting, labor, electrical, logistics, vatSettings]);

  // Усі дані пакуємо в один об'єкт для передачі в шаблон
  const templateData = { inverter, battery, panel, mounting, labor, electrical, cables, groundingEnabled, logistics, headerPower, sums, getPriceWithVat };

  // ====== ЛОГІКА ЗАВАНТАЖЕННЯ PDF ======
  const downloadPdf = async () => {
    if (!hiddenPdfRef.current) return;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;

    // Робимо рендер прихованого вузла
    const canvas = await html2canvas(hiddenPdfRef.current, {
      backgroundColor: "#F9F9F9",
      useCORS: true,
      scale: 3, // Масштаб для хорошої якості тексту
      width: A4_W,
      height: A4_H,
      logging: false,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "px", format: [A4_W, A4_H], compress: true });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, A4_W, A4_H, undefined, "FAST");
    pdf.save("Komplektaciya_SES.pdf");
  };

  return (
    <div style={ui.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #F3F6FB; }
        input, textarea, button { font-family: Inter, sans-serif; }
      `}</style>

      {/* ВИДИМИЙ ІНТЕРФЕЙС */}
      <div style={ui.left}>
        <div style={ui.header}>
          <div>
            <div style={ui.title}>Білдер КП (PDF-генератор)</div>
            <div style={ui.sub}>Шаблон генерується у фоні</div>
          </div>
          <button style={ui.primaryBtn} onClick={downloadPdf}>Завантажити PDF</button>
        </div>

        {/* ТУТ ТВОЇ КАРТКИ НАЛАШТУВАНЬ ТА ПОШУКУ */}
        <Card title="Ключове обладнання">
          <RowEditorWithSearch label="Інвертор" value={inverter} onChange={setInverter} searchCategory="inverter" />
          <RowEditorWithSearch label="АКБ" value={battery} onChange={setBattery} searchCategory="battery" />
          <RowEditorWithSearch label="Панелі" value={panel} onChange={setPanel} searchCategory="panel" />
        </Card>
        
        <Card title="Інше">
           <div style={{fontSize: 13, color: "#5A6B85"}}>Всі інші налаштування працюють у фоні. Натисни "Завантажити PDF" щоб перевірити файл.</div>
        </Card>
      </div>

      {/* ПРИХОВАНИЙ КОНТЕЙНЕР ДЛЯ РЕНДЕРУ PDF. 
        Він існує в DOM, але винесений за межі екрану (-9999px), 
        щоб html2canvas міг його сфотографувати, а користувач його не бачив.
      */}
      <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
        <div ref={hiddenPdfRef} style={sheet.page}>
          <PdfTemplate data={templateData} />
        </div>
      </div>
      
    </div>
  );
}

// === КОМПОНЕНТ ІДЕАЛЬНОГО ШАБЛОНУ ПО FIGMA ===
function PdfTemplate({ data }) {
  const { inverter, battery, panel, mounting, labor, electrical, cables, groundingEnabled, logistics, headerPower, sums, getPriceWithVat } = data;

  return (
    <>
      {/* === ШАПКА === */}
      <div style={pos(70, 22, 511, 24, 20, 600, "#151414", "uppercase")}>КОМПЛЕКТАЦІЯ ТА ВАРТІСТЬ ГІБРИДНОЇ СЕС</div>
      <div style={line(104, 80, 410)} />
      {inverter.enabled && <div style={pos(104, 59, 115, 15, 12, 400)}>Інвертор {headerPower.inverterKw ? `${headerPower.inverterKw} кВт` : ""}</div>}
      {panel.enabled && <div style={pos(269, 59, 106, 15, 12, 400)}>Панелі {headerPower.panelsKw ? `${headerPower.panelsKw} кВт` : ""}</div>}
      {battery.enabled && <div style={pos(428, 57, 95, 17, 12, 400)}>АКБ {headerPower.akbKw ? `${headerPower.akbKw} кВт` : ""}</div>}

      {/* === КЛЮЧОВЕ ОБЛАДНАННЯ === */}
      <div style={{ ...pos(32, 97, 218, 24, 20, 600), fontStyle: "italic" }}>Ключове обладнання</div>
      <div style={pos(36, 134, 73, 19, 13, 500)}>Позиція</div>
      <div style={pos(167, 132, 63, 19, 13, 500)}>Модель</div>
      <div style={pos(329, 132, 44, 19, 13, 500)}>К-сть</div>
      <div style={pos(407, 132, 55, 19, 13, 500)}>Ціна, $</div>
      <div style={{ ...pos(0, 130, 62, 19, 13, 500), right: 35, left: "auto" }}>Сума, $</div>
      <div style={line(31, 161, 534)} />

      {inverter.enabled && (
        <>
          <div style={{...pos(39, 167, 91, 40, 13, 400), whiteSpace: "pre-line"}}>{inverter.position}</div>
          <div style={{...pos(151, 166, 139, 32, 13, 400), whiteSpace: "pre-line"}}>{inverter.model}</div>
          <div style={pos(332, 173, 54, 29, 13, 400)}>{inverter.qty} шт</div>
          <div style={pos(418, 173, 51, 23, 13, 400)}>{showMoneyOrBlank(getPriceWithVat(inverter.price))}</div>
          <div style={pos(512, 172, 50, 23, 13, 400)}>{showMoneyOrBlank(sums.invSum)}</div>
        </>
      )}
      <div style={line(31, 204, 534)} />

      {battery.enabled && (
        <>
          <div style={pos(46, 217, 27, 16, 13, 400)}>{battery.position}</div>
          <div style={{...pos(151, 219, 169, 16, 13, 400), whiteSpace: "pre-line"}}>{battery.model}</div>
          <div style={pos(332, 218, 54, 29, 13, 400)}>{battery.qty} шт</div>
          <div style={pos(418, 218, 25, 16, 13, 400)}>{showMoneyOrBlank(getPriceWithVat(battery.price))}</div>
          <div style={pos(512, 219, 25, 16, 13, 400)}>{showMoneyOrBlank(sums.batSum)}</div>
        </>
      )}
      <div style={line(34, 247, 534)} />

      {panel.enabled && (
        <>
          <div style={{...pos(45, 254, 96, 32, 13, 400), whiteSpace: "pre-line"}}>{panel.position}</div>
          <div style={{...pos(151, 263, 137, 16, 13, 400), whiteSpace: "pre-line"}}>{panel.model}</div>
          <div style={pos(334, 265, 54, 22, 13, 400)}>{panel.qty} шт</div>
          <div style={pos(419, 265, 23, 16, 13, 400)}>{showMoneyOrBlank(getPriceWithVat(panel.price))}</div>
          <div style={pos(512, 265, 31, 16, 13, 400)}>{showMoneyOrBlank(sums.panSum)}</div>
        </>
      )}
      <div style={line(32, 293, 534)} />

      {/* === МОНТАЖ ТА ІНЖЕНЕРІЯ === */}
      <div style={{ ...pos(38, 323, 219, 24, 20, 600), fontStyle: "italic" }}>Монтаж та інженерія</div>
      <div style={pos(46, 359, 73, 19, 13, 500)}>Позиція</div>
      <div style={pos(187, 357, 63, 19, 13, 500)}>Модель</div>
      <div style={pos(335, 357, 44, 19, 13, 500)}>К-сть</div>
      <div style={pos(414, 357, 55, 19, 13, 500)}>Ціна, $</div>
      <div style={{ ...pos(0, 357, 62, 19, 13, 500), right: 31, left: "auto" }}>Сума, $</div>
      <div style={line(30, 386, 534)} />

      {mounting.enabled && (
        <>
          <div style={pos(36, 402, 103, 40, 13, 400)}>{mounting.position}</div>
          <div style={{...pos(161, 395, 152, 40, 13, 400), whiteSpace: "pre-line"}}>{mounting.model}</div>
          <div style={pos(335, 400, 54, 29, 13, 400)}>Набір</div>
          <div style={pos(420, 401, 25, 16, 13, 400)}>{showMoneyOrBlank(getPriceWithVat(mounting.price))}</div>
          <div style={pos(507, 401, 25, 16, 13, 400)}>{showMoneyOrBlank(sums.mountSum)}</div>
        </>
      )}
      <div style={line(31, 437, 534)} />

      {labor.enabled && (
        <>
          <div style={pos(40, 456, 46, 16, 13, 400)}>Робота</div>
          <div style={{...pos(161, 444, 173, 32, 13, 400), whiteSpace: "pre-line"}}>Встановлення та запуск сонячної станції</div>
          <div style={pos(349, 455, 112, 24, 13, 400)}>__________________</div>
          <div style={pos(505, 459, 31, 16, 13, 400)}>{showMoneyOrBlank(sums.labor)}</div>
        </>
      )}
      <div style={line(30, 485, 534)} />

      {electrical.enabled && (
        <>
          <div style={{...pos(40, 499, 111, 32, 13, 400), whiteSpace: "pre-line"}}>Електричний{'\n'}захист</div>
          <div style={{...pos(161, 493, 157, 32, 13, 400), whiteSpace: "pre-line"}}>Система захисту, автоматика, комутація</div>
          <div style={pos(335, 502, 54, 22, 13, 400)}>Набір</div>
          <div style={pos(419, 504, 25, 16, 13, 400)}>{showMoneyOrBlank(getPriceWithVat(electrical.price))}</div>
          <div style={pos(504, 504, 25, 16, 13, 400)}>{showMoneyOrBlank(sums.electrical)}</div>
        </>
      )}
      <div style={line(30, 539, 534)} />

      {cables.enabled && (
        <>
          <div style={{...pos(35, 547, 107, 32, 13, 400), whiteSpace: "pre-line"}}>Сонячний кабель</div>
          <div style={{...pos(165, 546, 164, 31, 13, 400), whiteSpace: "pre-line"}}>Кабель КВЕ DB+ 6 мм2 у подвійній ізоляції</div>
          <div style={pos(344, 552, 37, 18, 13, 400)}>1 м</div>
          <div style={pos(425, 552, 31, 17, 13, 400)}>{showMoneyOrBlank(getPriceWithVat(cables.solarPrice))}</div>
          <div style={pos(495, 552, 65, 19, 10, 400)}>Див. кінець сторніки</div>

          <div style={line(31, 582, 534)} />

          <div style={pos(35, 595, 68, 16, 13, 400)}>Електрика</div>
          <div style={{...pos(164, 587, 164, 32, 13, 400), whiteSpace: "pre-line"}}>{cables.powerName}</div>
          <div style={pos(349, 594, 37, 18, 13, 400)}>1 м</div>
          <div style={pos(423, 595, 31, 17, 13, 400)}>{showMoneyOrBlank(getPriceWithVat(cables.powerPrice))}</div>
          <div style={pos(495, 590, 65, 19, 10, 400)}>Див. кінець сторніки</div>
        </>
      )}
      <div style={line(31, 622, 534)} />

      {groundingEnabled && (
        <>
          <div style={pos(33, 631, 80, 21, 13, 400)}>Заземлення</div>
          <div style={pos(476, 629, 91, 23, 10, 400)}>Згідно фактичних витрат</div>
        </>
      )}
      <div style={line(31, 656, 534)} />

      {logistics.enabled && (
        <>
          <div style={pos(36, 661, 84, 20, 13, 400)}>Логістика</div>
          <div style={pos(508, 661, 29, 15, 13, 400)}>{showMoneyOrBlank(sums.logisticsSum)}</div>
        </>
      )}
      <div style={line(31, 683, 534)} />

      {/* === ПІДВАЛ === */}
      <div style={pos(335, 697, 299, 27, 16, 400)}>Орієнтовна вартість системи</div>
      <div style={pos(471, 724, 91, 29, 24, 400, "#F38217")}>{sums.total == null ? "" : `${fmtMoney(sums.total)} $`}</div>
      <div style={pos(29, 733, 120, 29, 10, 400)}>Готівковий розрахунок</div>
      <div style={{...pos(31, 759, 556, 53, 10, 400), whiteSpace: "pre-wrap"}}>
        Комплектація може змінюватися залежно від потреб та наявності обладнання.{"\n"}
        Кабель оплачується за фактом використання (ціна вказана за 1 м).{"\n"}
        Ціни актуальні на дату формування пропозиції.{"\n"}
        Гарантія: інвертор — 5 років, панелі — 12 років, АКБ — 5 років.
      </div>
    </>
  );
}

// === ПОШУК В БАЗІ ===
function RowEditorWithSearch({ label, value, onChange, searchCategory }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = async (text) => {
    onChange((p) => ({ ...p, model: text }));
    if (text.trim().length < 2) { setResults([]); setOpen(false); return; }

    let query = supabase.from("equipments").select("*").or(`model.ilike.%${text}%,brand.ilike.%${text}%`);
    if (searchCategory === 'inverter') query = query.in('system_type', ['звичайний гібрид', 'високовольтний', 'мережевий']);
    else if (searchCategory === 'battery') query = query.eq('system_type', 'акб');
    else if (searchCategory === 'panel') query = query.eq('system_type', 'панелі');

    const { data, error } = await query.limit(5);
    if (!error && data) { setResults(data); setOpen(true); }
  };

  const handleSelect = (item) => {
    let newPosition = value.position;
    if (searchCategory === 'inverter') {
      const typeStr = item.system_type ? item.system_type.toLowerCase() : '';
      if (typeStr.includes('мережевий')) {
        newPosition = "Мережевий\nінвертор";
      } else {
        const ph = item.phase_count === '3-фазний' ? '3ф' : item.phase_count === '1-фазний' ? '1ф' : '';
        newPosition = `Гібридний\nінвертор ${ph}`.trim();
      }
    }
    onChange((p) => ({
      ...p, position: newPosition, model: `${item.brand} ${item.model}`.trim(), price: item.price, power_kw: item.power_kw || 0,
    }));
    setOpen(false);
  };

  return (
    <div style={ui.rowBlock}>
      <div style={ui.rowHead}>
        <div style={ui.rowTitle}>{label}</div>
      </div>
      <div style={ui.gridRowFixedSearch}>
        <div style={{ position: "relative" }} ref={wrapperRef}>
          <div style={ui.label}>Модель (пошук)</div>
          <textarea style={ui.textareaWide} value={value.model} placeholder="Пошук..." onChange={(e) => handleSearch(e.target.value)} rows={2} />
          {open && results.length > 0 && (
            <div style={ui.dropdown}>
              {results.map((item) => (
                <div key={item.id} style={ui.dropdownItem} onClick={() => handleSelect(item)}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0B1220' }}>{item.brand} {item.model}</div>
                  <div style={{ fontSize: 11, color: '#5A6B85' }}>{item.system_type} • <b style={{color: '#1E6FEB'}}>{item.price}$</b></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div><div style={ui.label}>К-сть</div><input style={ui.inputNarrow} value={value.qty} onChange={(e) => onChange((p) => ({ ...p, qty: e.target.value }))} /></div>
        <div><div style={ui.label}>Ціна, $</div><input style={ui.inputNarrow} value={value.price} onChange={(e) => onChange((p) => ({ ...p, price: e.target.value }))} /></div>
      </div>
    </div>
  );
}

// ХЕЛПЕРИ ДЛЯ АБСОЛЮТНИХ КООРДИНАТ
const pos = (l, t, w, h, fz = 13, fw = 400, color = "#000", textTransform = "none") => ({
  position: "absolute", left: l, top: t, width: w, height: h, fontSize: fz, fontWeight: fw, color: color, lineHeight: "normal", letterSpacing: "0.01em", textTransform, fontFamily: "Inter, sans-serif"
});

const line = (l, t, w) => ({
  position: "absolute", left: l, top: t, width: w, height: 0, borderTop: "3px solid #3A5F7D"
});

function Card({ title, children }) { return <div style={ui.card}><div style={ui.cardTitle}>{title}</div>{children}</div>; }

// СТИЛІ ІНТЕРФЕЙСУ
const ui = {
  app: { display: "flex", justifyContent: "center", padding: 20, minHeight: "100vh" },
  left: { width: "600px", background: "#FFFFFF", borderRadius: 16, padding: 20, boxShadow: "0 6px 24px rgba(16, 24, 40, 0.06)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 700, color: "#0B1220" },
  sub: { fontSize: 13, color: "#5A6B85", marginTop: 2 },
  primaryBtn: { padding: "10px 14px", borderRadius: 10, background: "#1E6FEB", color: "#fff", fontWeight: 600, border: "none", cursor: "pointer" },
  card: { border: "1px solid #E6ECF5", borderRadius: 14, padding: 16, marginBottom: 16, background: "#FBFCFF" },
  cardTitle: { fontSize: 14, fontWeight: 700, color: "#0B1220", marginBottom: 12 },
  label: { fontSize: 12, fontWeight: 600, color: "#2B3A52", marginBottom: 6 },
  inputNarrow: { width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #D7E0EE", outline: "none" },
  textareaWide: { width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #D7E0EE", outline: "none", resize: "vertical", minHeight: 40 },
  rowBlock: { border: "1px solid #E6ECF5", borderRadius: 10, padding: 12, background: "#FFFFFF", marginBottom: 10 },
  rowHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  rowTitle: { fontSize: 13, fontWeight: 700, color: "#0B1220" },
  gridRowFixedSearch: { display: "grid", gridTemplateColumns: "1fr 70px 80px", gap: 10, alignItems: "start" },
  dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #D7E0EE', borderRadius: 8, zIndex: 100, maxHeight: 200, overflowY: 'auto' },
  dropdownItem: { padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid #F3F6FB' },
};

const sheet = {
  page: { position: "relative", width: A4_W, height: A4_H, background: "#F9F9F9", fontFamily: "Inter, sans-serif", color: "#000", overflow: "hidden" }
};