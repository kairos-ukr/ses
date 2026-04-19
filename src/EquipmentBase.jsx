import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function EquipmentBase() {
  const [equipments, setEquipments] = useState([]);
  const [filteredEquipments, setFilteredEquipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  const [filters, setFilters] = useState({
    type: "всі",
    phase: "всі",
    search: ""
  });
  
  // Додано power_kw
  const [formData, setFormData] = useState({
    brand: "",
    model: "",
    price: "",
    power_kw: "", // Нове поле
    phase_count: "1-фазний",
    system_type: "звичайний гібрид",
    status: "в наявності"
  });

  useEffect(() => {
    fetchEquipments();
  }, []);

  useEffect(() => {
    let result = equipments;
    if (filters.type !== "всі") result = result.filter(item => item.system_type === filters.type);
    if (filters.phase !== "всі") result = result.filter(item => item.phase_count === filters.phase);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(item => item.brand.toLowerCase().includes(q) || item.model.toLowerCase().includes(q));
    }
    setFilteredEquipments(result);
  }, [filters, equipments]);

  async function fetchEquipments() {
    setLoading(true);
    const { data, error } = await supabase
      .from("equipments")
      .select("*")
      .order("brand", { ascending: true });
    
    if (!error) {
      setEquipments(data || []);
      setFilteredEquipments(data || []);
    }
    setLoading(false);
  }

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    let newPhase = formData.phase_count;
    
    if (newType === 'акб' || newType === 'панелі') {
      newPhase = '—';
    } else if (newPhase === '—') {
      newPhase = '1-фазний';
    }
    
    setFormData({ ...formData, system_type: newType, phase_count: newPhase });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    
    // Перетворюємо порожній рядок на null або залишаємо числом
    const payload = { ...formData, power_kw: formData.power_kw ? parseFloat(formData.power_kw) : 0 };

    if (editingId) {
      const { error } = await supabase.from("equipments").update(payload).eq("id", editingId);
      if (!error) setEditingId(null);
    } else {
      await supabase.from("equipments").insert([payload]);
    }
    
    setFormData({ brand: "", model: "", price: "", power_kw: "", phase_count: "1-фазний", system_type: "звичайний гібрид", status: "в наявності" });
    fetchEquipments();
  }

  async function deleteItem(id) {
    if (window.confirm("Видалити цю позицію назавжди?")) {
      const { error } = await supabase.from("equipments").delete().eq("id", id);
      if (!error) fetchEquipments();
    }
  }

  const startEdit = (item) => {
    setEditingId(item.id);
    setFormData({
      brand: item.brand, model: item.model, price: item.price, power_kw: item.power_kw || "",
      phase_count: item.phase_count, system_type: item.system_type, status: item.status
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.h1}>📦 База обладнання</h1>
          <p style={styles.subtitle}>Управління прайс-листами та характеристиками</p>
        </div>
        <button onClick={() => window.history.back()} style={styles.backBtn}>← Назад до КП</button>
      </header>

      <section style={styles.card}>
        <h3 style={styles.cardTitle}>{editingId ? "📝 Редагування позиції" : "➕ Додати нове обладнання"}</h3>
        <form onSubmit={handleSubmit} style={styles.formGrid}>
          
          <Field label="Категорія (Тип)">
            <select value={formData.system_type} onChange={handleTypeChange} style={styles.input}>
              <option value="звичайний гібрид">Інвертор: Звичайний гібрид</option>
              <option value="високовольтний">Інвертор: Високовольтний</option>
              <option value="мережевий">Інвертор: Мережевий</option>
              <option value="акб">Акумулятор (АКБ)</option>
              <option value="панелі">Сонячні панелі</option>
            </select>
          </Field>

          <Field label="Бренд">
            <input value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} required style={styles.input} placeholder="Deye, Jinko..."/>
          </Field>
          
          <Field label="Модель">
            <input value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} required style={styles.input} placeholder="Назва моделі"/>
          </Field>
          
          <Field label="Потужність (кВт)">
            <input 
              type="number" step="0.001" 
              value={formData.power_kw} 
              onChange={e => setFormData({...formData, power_kw: e.target.value})} 
              required style={styles.input} 
              placeholder="Напр. 6.0 або 0.545"
            />
          </Field>

          <Field label="Ціна (USD, $)">
            <input type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} required style={styles.input} placeholder="0.00"/>
          </Field>
          
          <Field label="Фазність">
            <select 
              value={formData.phase_count} 
              onChange={e => setFormData({...formData, phase_count: e.target.value})} 
              style={{...styles.input, background: formData.phase_count === '—' ? '#F2F4F7' : '#fff'}}
              disabled={formData.system_type === 'акб' || formData.system_type === 'панелі'}
            >
              <option value="1-фазний">1-фазний</option>
              <option value="3-фазний">3-фазний</option>
              <option value="—">— (не застосовується)</option>
            </select>
          </Field>

          <Field label="Статус наявності">
            <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} style={styles.input}>
              <option value="в наявності">В наявності</option>
              <option value="очікуємо">Очікуємо постачання</option>
              <option value="під замовлення">Під замовлення</option>
              <option value="немає">Немає на складі</option>
            </select>
          </Field>

          <div style={{display: 'flex', gap: 12, gridColumn: '1 / -1', marginTop: 12}}>
            <button type="submit" style={styles.primaryBtn}>{editingId ? "Зберегти зміни" : "Додати в базу"}</button>
            {editingId && (
              <button type="button" onClick={() => {setEditingId(null); setFormData({brand:"", model:"", price:"", power_kw: "", phase_count:"1-фазний", system_type:"звичайний гібрид", status:"в наявності"})}} style={styles.secondaryBtn}>Скасувати</button>
            )}
          </div>
        </form>
      </section>

      <section style={{...styles.card, padding: '16px 24px', marginBottom: 24}}>
        <div style={{display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap'}}>
          <span style={{fontWeight: 600, fontSize: 14, color: '#344054'}}>Фільтри:</span>
          <input placeholder="🔍 Пошук бренду чи моделі..." style={{...styles.input, width: '280px'}} value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})}/>
          <select style={styles.input} value={filters.type} onChange={e => setFilters({...filters, type: e.target.value})}>
            <option value="всі">Усі категорії</option>
            <option value="звичайний гібрид">Гібридні інвертори</option>
            <option value="високовольтний">Високовольтні інвертори</option>
            <option value="мережевий">Мережеві інвертори</option>
            <option value="акб">АКБ</option>
            <option value="панелі">Панелі</option>
          </select>
          <select style={styles.input} value={filters.phase} onChange={e => setFilters({...filters, phase: e.target.value})}>
            <option value="всі">Усі фази</option>
            <option value="1-фазний">1-фазний</option>
            <option value="3-фазний">3-фазний</option>
            <option value="—">Без фаз</option>
          </select>
          <button style={styles.ghostBtn} onClick={() => setFilters({type: 'всі', phase: 'всі', search: ''})}>Скинути</button>
        </div>
      </section>

      <section style={{...styles.card, padding: 0, overflow: 'hidden'}}>
        <div style={{padding: '20px 24px', borderBottom: '1px solid #EAECF0', background: '#fff'}}>
          <h3 style={{margin: 0, fontSize: 16, color: '#101828', fontWeight: 600}}>Каталог обладнання <span style={{color: '#667085', fontWeight: 400}}>({filteredEquipments.length})</span></h3>
        </div>
        
        {loading ? (
          <div style={{padding: 60, textAlign: 'center', color: '#667085'}}>🔄 Завантаження даних...</div>
        ) : (
          <div style={{overflowX: 'auto'}}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.tableHeader}>
                  <th style={styles.th}>Бренд</th>
                  <th style={styles.th}>Модель</th>
                  <th style={styles.th}>Характеристики</th>
                  <th style={styles.th}>Ціна</th>
                  <th style={styles.th}>Статус</th>
                  <th style={{...styles.th, textAlign: 'right'}}>Дії</th>
                </tr>
              </thead>
              <tbody>
                {filteredEquipments.map(item => (
                  <tr key={item.id} style={styles.tableRow} className="hover-row">
                    <td style={{...styles.td, fontWeight: 600, color: '#101828'}}>{item.brand}</td>
                    <td style={{...styles.td, color: '#344054', fontWeight: 500}}>{item.model}</td>
                    <td style={styles.td}>
                      <div style={{fontSize: 13, color: '#101828', fontWeight: 500, textTransform: 'capitalize'}}>{item.system_type}</div>
                      <div style={{fontSize: 12, color: '#667085', marginTop: 2}}>
                        {item.power_kw ? <strong style={{color: '#344054'}}>{item.power_kw} кВт</strong> : ''}
                        {item.power_kw && item.phase_count !== '—' ? ' • ' : ''}
                        {item.phase_count !== '—' ? item.phase_count : ''}
                      </div>
                    </td>
                    <td style={{...styles.td, fontWeight: 700, color: '#039855', fontSize: 15}}>{fmtMoney(item.price)} $</td>
                    <td style={styles.td}><StatusBadge status={item.status} /></td>
                    <td style={{...styles.td, textAlign: 'right'}}>
                      <button onClick={() => startEdit(item)} style={styles.actionBtn} title="Редагувати">✏️</button>
                      <button onClick={() => deleteItem(item.id)} style={{...styles.actionBtn, marginLeft: 8}} title="Видалити">🗑️</button>
                    </td>
                  </tr>
                ))}
                {filteredEquipments.length === 0 && (
                  <tr><td colSpan="6" style={{padding: '60px 20px', textAlign: 'center', color: '#667085'}}>Нічого не знайдено.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`.hover-row:hover { background-color: #F9FAFB; }`}</style>
    </div>
  );
}

const fmtMoney = (n) => {
  if (!n) return "0.00";
  return Number(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

function Field({ label, children }) {
  return (
    <label style={{display: 'flex', flexDirection: 'column', gap: 6}}>
      <span style={{fontSize: 13, fontWeight: 600, color: '#344054'}}>{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ status }) {
  const colors = {
    'в наявності': { bg: '#ECFDF3', text: '#027A48', border: '#ABEFC6' },
    'очікуємо': { bg: '#FFFAEB', text: '#B54708', border: '#FEDF89' },
    'під замовлення': { bg: '#F9F5FF', text: '#6941C6', border: '#D6BBFB' },
    'немає': { bg: '#FEF3F2', text: '#B42318', border: '#FECDCA' }
  };
  const style = colors[status] || { bg: '#F2F4F7', text: '#344054', border: '#EAECF0' };
  
  return (
    <span style={{
      padding: '4px 10px', borderRadius: '16px', fontSize: 12, fontWeight: 600,
      background: style.bg, color: style.text, border: `1px solid ${style.border}`,
      whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4
    }}>
      <div style={{width: 6, height: 6, borderRadius: '50%', background: style.text}}></div>
      {status}
    </span>
  );
}

const styles = {
  container: { padding: "40px 20px", maxWidth: "1200px", margin: "0 auto", fontFamily: "'Inter', system-ui, sans-serif", background: '#F2F4F7', minHeight: '100vh' },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" },
  h1: { margin: 0, fontSize: 24, color: '#101828', fontWeight: 700, letterSpacing: '-0.02em' },
  subtitle: { color: '#475467', margin: '6px 0 0 0', fontSize: 14 },
  backBtn: { background: "#fff", border: "1px solid #D0D5DD", padding: "10px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: 600, color: '#344054', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', transition: 'all 0.2s' },
  card: { background: "#fff", padding: "24px", borderRadius: "12px", border: '1px solid #EAECF0', boxShadow: "0 1px 3px rgba(16,24,40,0.1)", marginBottom: "24px" },
  cardTitle: { marginTop: 0, marginBottom: 20, fontSize: 18, color: '#101828', fontWeight: 600 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" },
  input: { padding: "10px 14px", borderRadius: "8px", border: "1px solid #D0D5DD", outline: "none", fontSize: 14, fontFamily: 'inherit', color: '#101828', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', transition: 'border-color 0.2s', width: '100%', boxSizing: 'border-box' },
  primaryBtn: { background: "#1E6FEB", color: "#fff", padding: "10px 20px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "600", fontSize: 14, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' },
  secondaryBtn: { background: "#fff", color: "#344054", padding: "10px 20px", borderRadius: "8px", border: "1px solid #D0D5DD", cursor: "pointer", fontSize: 14, fontWeight: "600" },
  ghostBtn: { background: 'none', border: 'none', color: '#475467', cursor: 'pointer', fontSize: 14, fontWeight: 600, padding: '8px 12px', borderRadius: '6px' },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  tableHeader: { background: "#F9FAFB", borderBottom: '1px solid #EAECF0' },
  th: { padding: '12px 24px', textAlign: 'left', fontWeight: 500, color: '#475467', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' },
  tableRow: { borderBottom: "1px solid #EAECF0", transition: 'background 0.2s' },
  td: { padding: '16px 24px', verticalAlign: 'middle' },
  actionBtn: { background: "#fff", border: "1px solid #EAECF0", cursor: "pointer", fontSize: 14, padding: '8px', borderRadius: '6px', transition: 'all 0.2s', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }
};