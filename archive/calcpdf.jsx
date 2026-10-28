import React, { useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const A4_W = 595;
const A4_H = 842;

// Середня генерація 1 кВт встановленої потужності по місяцях (для України)
const MONTHLY_GEN_PER_KW = [41.74, 53.67, 95.43, 143.36, 145.98, 157.96, 157.96, 154.97, 130.85, 65.61, 47.63, 35.83];
const MONTH_NAMES = ['Січ', 'Лют', 'Бер', 'Квіт', 'Трав', 'Черв', 'Лип', 'Серп', 'Вер', 'Жовт', 'Лист', 'Груд'];
const TOTAL_YEAR_GEN_PER_KW = MONTHLY_GEN_PER_KW.reduce((a, b) => a + b, 0);

const toNum = (v) => {
  const s = String(v ?? "").trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const fmtMoney = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// SVG Кругова діаграма (Пофікшено зсув тексту для PDF)
const DonutChart = ({ percentUsed, percentExcess }) => {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const usedDash = (percentUsed / 100) * circumference;
    
    return (
        <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
            <svg width="140" height="140" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={radius} fill="transparent" stroke="#E2E8F0" strokeWidth="14" />
                <circle 
                    cx="60" cy="60" r={radius} 
                    fill="transparent" 
                    stroke="#3B82F6" 
                    strokeWidth="14" 
                    strokeDasharray={`${usedDash} ${circumference}`}
                    strokeDashoffset={circumference * 0.25} 
                    strokeLinecap="round"
                />
            </svg>
            {/* Фікс для html2canvas: без transform, використовуємо flex на весь розмір */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 22, color: '#1E293B', lineHeight: '1' }}>{percentUsed}%</div>
                <div style={{ fontSize: 9, color: '#64748B', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center' }}>Власне<br/>споживання</div>
            </div>
        </div>
    );
};

export default function GenerationBuilder() {
  const previewRef = useRef(null);

  const [data, setData] = useState({
    powerKw: "15",
    totalPrice: "8500",
    monthlyCons: "500",
    tariffUah: "4.32", 
    exchangeRate: "41.5", 
  });

  const handleChange = (field, val) => setData(p => ({ ...p, [field]: val }));

  const handleAutoPower = () => {
    const annualCons = toNum(data.monthlyCons) * 12;
    if (annualCons > 0) {
      const recommendedPower = (annualCons / TOTAL_YEAR_GEN_PER_KW) * 1.2; 
      handleChange("powerKw", recommendedPower.toFixed(1));
    }
  };

  const calc = useMemo(() => {
    const pKw = toNum(data.powerKw);
    const price = toNum(data.totalPrice);
    const mCons = toNum(data.monthlyCons);
    const gridTariffUsd = toNum(data.tariffUah) / (toNum(data.exchangeRate) || 41.5);

    const monthlyData = MONTH_NAMES.map((month, i) => {
      const gen = MONTHLY_GEN_PER_KW[i] * pKw;
      const used = Math.min(gen, mCons);
      const excess = Math.max(0, gen - mCons);
      return { month, generation: Math.round(gen), used, excess };
    });

    const annualGeneration = monthlyData.reduce((sum, item) => sum + item.generation, 0);
    const annualUsed = monthlyData.reduce((sum, item) => sum + item.used, 0);
    const annualExcess = monthlyData.reduce((sum, item) => sum + item.excess, 0);

    const maxGenMonth = Math.max(...monthlyData.map(d => d.generation));

    const savingsUsd = annualUsed * gridTariffUsd;
    
    const paybackYears = savingsUsd > 0 ? (price / savingsUsd).toFixed(1) : "—";
    const percentUsed = annualGeneration > 0 ? Math.round((annualUsed / annualGeneration) * 100) : 0;
    const percentExcess = 100 - percentUsed;

    return { 
        annualGeneration, annualUsed, annualExcess, 
        savingsUsd, paybackYears, monthlyData, maxGenMonth, 
        percentUsed, percentExcess 
    };
  }, [data]);

  const downloadPdf = async () => {
    if (!previewRef.current) return;
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const node = previewRef.current;
    node.classList.add("exporting");
    await new Promise((r) => setTimeout(r, 50));

    const canvas = await html2canvas(node, { backgroundColor: "#FAFAFA", scale: 4, width: A4_W, height: A4_H });
    node.classList.remove("exporting");

    const pdf = new jsPDF({ orientation: "p", unit: "px", format: [A4_W, A4_H] });
    pdf.addImage(canvas.toDataURL("image/png", 1.0), "PNG", 0, 0, A4_W, A4_H, undefined, "FAST");
    pdf.save("solar_efficiency.pdf");
  };

  return (
    <div style={ui.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        input, button { font-family: Inter, system-ui, sans-serif; }
        .exporting * { transform: none !important; }
      `}</style>

      {/* ЛІВА ПАНЕЛЬ */}
      <div style={ui.left}>
        <div style={ui.header}>
          <div>
            <div style={ui.title}>Білдер Ефективності</div>
            <div style={ui.sub}>Акцент на економії власного споживання</div>
          </div>
          <button style={ui.primaryBtn} onClick={downloadPdf}>Завантажити PDF</button>
        </div>

        <Card title="Базові параметри">
          <div style={ui.grid2}>
            <Field label="Потужність (кВт)"><input style={ui.input} value={data.powerKw} onChange={(e) => handleChange("powerKw", e.target.value)} /></Field>
            <Field label='Ціна "Під ключ" ($)'><input style={ui.input} value={data.totalPrice} onChange={(e) => handleChange("totalPrice", e.target.value)} /></Field>
          </div>
        </Card>

        <Card title="Споживання та Тарифи">
          <Field label="Споживання (кВт·год/міс)"><input style={ui.input} value={data.monthlyCons} onChange={(e) => handleChange("monthlyCons", e.target.value)} /></Field>
          <div style={{...ui.grid2, marginTop: 10}}>
            <Field label="Тариф мережі (грн)"><input style={ui.input} value={data.tariffUah} onChange={(e) => handleChange("tariffUah", e.target.value)} /></Field>
            <Field label='Курс $ (для розрахунку)'><input style={ui.input} value={data.exchangeRate} onChange={(e) => handleChange("exchangeRate", e.target.value)} /></Field>
          </div>
          <button style={ui.secondaryBtn} onClick={handleAutoPower}>⚡ Автопідбір потужності</button>
        </Card>
      </div>

      {/* ПРАВА ПАНЕЛЬ (PDF ПРЕВ'Ю) */}
      <div style={ui.right}>
        <div style={ui.previewShell}>
          <div ref={previewRef} style={sheet.page}>
            
            <div style={sheet.header}>ОЦІНКА ЕФЕКТИВНОСТІ СОНЯЧНОЇ СТАНЦІЇ</div>

            {/* БЛОК KPI - Вирівняно як на схемі (3 зверху, 2 по центру знизу) */}
            <div style={sheet.kpiContainer}>
                <div style={sheet.kpiRow}>
                    <KpiCard label="Потужність СЕС" value={`${data.powerKw} кВт`} icon="⚡" />
                    <KpiCard label="Вартість системи" value={`$ ${fmtMoney(data.totalPrice)}`} icon="💰" />
                    <KpiCard label="Річна генерація" value={`${fmtMoney(calc.annualGeneration)} кВт·год`} icon="☀️" highlight />
                </div>
                {/* Центруємо нижній ряд */}
                <div style={{ ...sheet.kpiRow, justifyContent: 'center' }}>
                    <KpiCard label="Річна економія" value={`$ ${fmtMoney(calc.savingsUsd)}`} icon="📉" highlight />
                    <KpiCard label="Орієнтовна окупність" value={calc.paybackYears !== "—" ? `${calc.paybackYears} роки` : "—"} icon="⏳" />
                </div>
            </div>

            <div style={sheet.mainLayout}>
                <div style={sheet.chartSection}>
                    <div style={sheet.sectionTitle}>Прогноз середньомісячної генерації (кВт·год)</div>
                    <div style={sheet.chartWrapper}>
                        {calc.monthlyData.map((d, i) => {
                            const widthPct = calc.maxGenMonth > 0 ? (d.generation / calc.maxGenMonth) * 100 : 0;
                            
                            return (
                                <div key={i} style={sheet.barRow}>
                                    <div style={sheet.barLabel}>{d.month}</div>
                                    <div style={sheet.barTrack}>
                                        <div style={{
                                            ...sheet.barFill, 
                                            width: `${widthPct}%`,
                                            minWidth: '35px'
                                        }}>
                                            <span style={sheet.barValue}>{d.generation}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={sheet.infoSection}>
                    <div style={sheet.sectionTitle}>Розподіл згенерованої енергії</div>
                    
                    <div style={{ marginTop: 20 }}>
                        <DonutChart percentUsed={calc.percentUsed} percentExcess={calc.percentExcess} />
                    </div>
                    
                    <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <LegendItem color="#3B82F6" label="Покриття власного споживання" value={`${fmtMoney(calc.annualUsed)} кВт·год`} />
                        <LegendItem color="#E2E8F0" label="Надлишок (невикористано)" value={`${fmtMoney(calc.annualExcess)} кВт·год`} />
                    </div>

                    <div style={sheet.disclaimer}>
                        * Зверніть увагу: всі наведені розрахунки та показники генерації є орієнтовними прогнозами. Фактичний виробіток електроенергії залежить від реальних погодних умов (кількості сонячних днів, рівня хмарності), кута нахилу та орієнтації сонячних панелей відносно півдня, а також відсутності фізичних затінень. Економія розрахована на основі вказаного тарифу ({data.tariffUah} грн/кВт·год) за умови максимального споживання енергії в момент її генерації.
                    </div>
                </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

// === ОНОВЛЕНІ КОМПОНЕНТИ ДЛЯ PDF ===
function KpiCard({ label, value, icon, highlight }) {
    return (
        <div style={{
            // Фіксована ширина (3 картки в ряд з відступом 14px)
            width: 'calc((100% - 28px) / 3)',
            boxSizing: 'border-box',
            background: highlight ? '#EFF6FF' : '#FFFFFF',
            border: highlight ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
            borderRadius: 12,
            padding: '10px 14px', // Зменшили відступи, щоб не були такими громіздкими
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
            <div style={{
                width: 36, // Трішки зменшили іконку
                height: 36,
                borderRadius: 10,
                background: highlight ? '#3B82F6' : '#F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                color: highlight ? '#FFFFFF' : '#475569',
            }}>
                {/* Фікс для html2canvas, щоб іконки емодзі не стрибали */}
                <span style={{ display: 'block', lineHeight: 1 }}>{icon}</span>
            </div>
            <div>
                <div style={{ fontSize: 10, color: highlight ? '#1E3A8A' : '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                    {label}
                </div>
                <div style={{ fontSize: 16, color: highlight ? '#1D4ED8' : '#0F172A', fontWeight: 800 }}>
                    {value}
                </div>
            </div>
        </div>
    );
}

function LegendItem({ color, label, value }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #F1F5F9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, fontWeight: 500, color: '#334155' }}>
                <div style={{ width: 10, height: 10, backgroundColor: color, borderRadius: '50%' }} />
                {label}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{value}</div>
        </div>
    );
}

function Card({ title, children }) {
  return <div style={ui.card}><div style={ui.cardTitle}>{title}</div>{children}</div>;
}
function Field({ label, children }) {
  return <label style={ui.field}><div style={ui.label}>{label}</div>{children}</label>;
}

/* ===== СТИЛІ ІНТЕРФЕЙСУ (UI) ===== */
const ui = {
  app: { display: "grid", gridTemplateColumns: "380px 1fr", gap: 18, padding: 18, background: "#F1F5F9", minHeight: "100vh", fontFamily: "Inter, sans-serif" },
  left: { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 16, padding: 16, height: "calc(100vh - 36px)", overflow: "auto" },
  right: { display: "flex", justifyContent: "center", alignItems: "flex-start" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 800, color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B", marginTop: 2 },
  primaryBtn: { padding: "8px 12px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  secondaryBtn: { width: "100%", padding: "10px", marginTop: "10px", borderRadius: 8, border: "1px solid #DBEAFE", background: "#EFF6FF", color: "#2563EB", fontWeight: 600, cursor: "pointer", fontSize: 13 },
  card: { border: "1px solid #E2E8F0", borderRadius: 12, padding: 14, marginBottom: 14, background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.02)" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 12 },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  field: { display: "grid", gap: 6, marginBottom: 0 },
  label: { fontSize: 12, fontWeight: 600, color: "#475569" },
  input: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #CBD5E1", outline: "none", fontSize: 13 },
  previewShell: { padding: 14, borderRadius: 16, border: "1px solid #E2E8F0", background: "#FFFFFF", boxShadow: "0 10px 25px rgba(0,0,0,0.05)" }
};

/* ===== СТИЛІ PDF АРКУША ===== */
const sheet = {
  page: {
    position: "relative", width: A4_W, height: A4_H, background: "#FAFAFA",
    fontFamily: "Inter, sans-serif", color: "#0F172A",
    display: "flex", flexDirection: "column", padding: "40px", boxSizing: 'border-box'
  },
  header: {
    fontSize: 22, fontWeight: 800, color: "#1E293B", textAlign: "center",
    letterSpacing: "0.02em", marginBottom: 20, textTransform: "uppercase"
  },
  
  // Зменшили відступи між блоком карток і графіками
  kpiContainer: { display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 25 },
  kpiRow: { display: 'flex', gap: 14, width: '100%' },

  mainLayout: { display: 'grid', gridTemplateColumns: '1.2fr 0.9fr', gap: 40, flex: 1 },
  sectionTitle: {
    fontSize: 14, fontWeight: 700, color: "#334155", marginBottom: 15,
    paddingBottom: 8, borderBottom: '2px solid #E2E8F0'
  },
  chartSection: { display: 'flex', flexDirection: 'column' },
  chartWrapper: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 },
  barRow: { display: 'flex', alignItems: 'center' },
  barLabel: { width: 45, fontSize: 12, fontWeight: 600, color: "#64748B" },
  barTrack: { flex: 1, height: 26, background: "#F1F5F9", borderRadius: 4, overflow: 'hidden' },
  barFill: { 
    height: '100%', background: "#93C5FD", borderRadius: 4, 
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8,
    boxSizing: 'border-box' // Фікс: щоб паддінги не вилазили за межі треку в PDF
  },
  barValue: { fontSize: 11, fontWeight: 700, color: "#1E3A8A", lineHeight: 1, display: 'inline-block' },
  
  infoSection: { display: 'flex', flexDirection: 'column' },
  disclaimer: {
    marginTop: 'auto', paddingTop: 20, fontSize: 9, color: '#94A3B8', lineHeight: '1.6', textAlign: 'justify'
  }
};