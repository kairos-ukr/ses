import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaTimes, FaShoppingCart, FaUserTie, FaBox, 
    FaMoneyBillWave, FaMapMarkerAlt, FaFileAlt, FaInfoCircle,
    FaPlus, FaSearch, FaCheck, FaChevronDown
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthProvider';

// --- ДОПОМІЖНИЙ КОМПОНЕНТ: Кастомний Select з пошуком ---
const SearchableSelect = ({ options, value, onChange, placeholder, disabled, icon: Icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(opt => 
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (opt.subLabel && opt.subLabel.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div 
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between transition-colors ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-white focus-within:ring-2 focus-within:ring-blue-200 focus-within:bg-white'}`}
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    {Icon && <Icon className="text-slate-400 flex-shrink-0" />}
                    <span className={`truncate text-sm font-bold ${selectedOption ? 'text-slate-800' : 'text-slate-400'}`}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <FaChevronDown className={`text-slate-400 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }} 
                        animate={{ opacity: 1, y: 0 }} 
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
                    >
                        <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50">
                            <FaSearch className="text-slate-400 ml-2" />
                            <input 
                                type="text"
                                autoFocus
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Пошук..."
                                className="w-full bg-transparent border-none outline-none text-sm font-medium py-1"
                            />
                        </div>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            {filteredOptions.length === 0 ? (
                                <div className="p-4 text-center text-sm text-slate-400">Нічого не знайдено</div>
                            ) : (
                                filteredOptions.map(opt => (
                                    <div 
                                        key={opt.value}
                                        onClick={() => {
                                            onChange(opt.value);
                                            setIsOpen(false);
                                            setSearchTerm('');
                                        }}
                                        className={`p-3 hover:bg-blue-50 cursor-pointer border-l-2 transition-colors ${value === opt.value ? 'border-blue-500 bg-blue-50/50' : 'border-transparent'}`}
                                    >
                                        <div className="text-sm font-bold text-slate-800">{opt.label}</div>
                                        {opt.subLabel && <div className="text-[10px] text-slate-500 mt-0.5">{opt.subLabel}</div>}
                                    </div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function DirectSaleModal({ isOpen, onClose, onSuccess, showToast }) {
    const { employee } = useAuth();
    
    const [dictionaries, setDictionaries] = useState({
        nomenclatures: [],
        warehouses: [],
        clients: [],
        installations: [],
        stockBalances: []
    });
    
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Стейт для швидкого додавання клієнта
    const [isAddingClient, setIsAddingClient] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', phone: '', notes: '' });

    const initialFormState = {
        operation_type: 'sale',
        client_id: '',
        installation_custom_id: '',
        warehouse_from_id: '',
        nomenclature_id: '',
        sellMode: 'base', // 'base' (упаковки/базова од.) або 'piece' (штуки)
        quantity: '',
        sale_price: '',
        currency: 'USD',
        exchange_rate: 1.0,
        reference_document: '',
        notes: ''
    };
    
    const [form, setForm] = useState(initialFormState);

    useEffect(() => {
        if (isOpen) {
            setForm(initialFormState);
            setIsAddingClient(false);
            setNewClient({ name: '', phone: '', notes: '' });
            loadDictionaries();
        }
    }, [isOpen]);

    const loadDictionaries = async () => {
        setIsLoading(true);
        try {
            const [nomRes, catRes, whRes, clientsRes, instRes, stockRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, package_name, package_multiplier, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('id, name, parent_id'),
                supabase.from('warehouses').select('id, name').eq('is_active', true).order('name'),
                supabase.from('clients').select('id, name, is_subcontract').order('name'),
                // Фільтруємо об'єкти: беремо лише активні
                supabase.from('installations').select('custom_id, name').in('status', ['planning', 'in_progress', 'pending']),
                supabase.from('v_warehouse_stock_available').select('warehouse_id, nomenclature_id, quantity_available')
            ]);

            // Будуємо повні імена для товарів (з ієрархією категорій)
            const cats = catRes.data || [];
            const processedNom = (nomRes.data || []).map(item => {
                let path = [];
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
                }
                return {
                    ...item,
                    fullName: `${path.join(' ')} ${item.name}`.trim(),
                    unitName: item.unit?.name || 'шт'
                };
            });

            setDictionaries({
                nomenclatures: processedNom,
                warehouses: whRes.data || [],
                clients: clientsRes.data || [],
                installations: instRes.data || [],
                stockBalances: stockRes.data || []
            });
        } catch (error) {
            if (showToast) showToast(`Помилка: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    // --- ЛОГІКА ДОДАВАННЯ КЛІЄНТА ---
    const handleQuickAddClient = async () => {
        if (!newClient.name.trim()) return showToast('Ім\'я/Назва клієнта є обов\'язковим', 'error');
        setIsSubmitting(true);
        try {
            const { data, error } = await supabase
                .from('clients')
                .insert([{ name: newClient.name, phone: newClient.phone, notes: newClient.notes }])
                .select()
                .single();
            
            if (error) throw error;
            
            setDictionaries(prev => ({
                ...prev,
                clients: [...prev.clients, data].sort((a, b) => a.name.localeCompare(b.name))
            }));
            
            setForm(prev => ({ ...prev, client_id: data.id }));
            setIsAddingClient(false);
            showToast('Клієнта успішно додано!', 'success');
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- ЛОГІКА ФІЛЬТРАЦІЇ ТА ЗАЛИШКІВ ---
    const selectedItem = dictionaries.nomenclatures.find(n => n.id === parseInt(form.nomenclature_id));
    const hasPackage = selectedItem && selectedItem.package_multiplier > 1;
    
    // Отримуємо баланс в базових одиницях
    const getAvailableStockBase = () => {
        if (!form.nomenclature_id || !form.warehouse_from_id) return 0;
        const balance = dictionaries.stockBalances.find(
            b => b.nomenclature_id === parseInt(form.nomenclature_id) && 
                 b.warehouse_id === parseInt(form.warehouse_from_id)
        );
        return balance ? parseFloat(balance.quantity_available) : 0;
    };

    const availableQtyBase = getAvailableStockBase();

    // Формуємо список товарів для Dropdown (тільки ті, що є на обраному складі)
    const availableNomenclatureOptions = dictionaries.nomenclatures
        .filter(nom => {
            if (!form.warehouse_from_id) return false;
            const bal = dictionaries.stockBalances.find(b => b.warehouse_id === parseInt(form.warehouse_from_id) && b.nomenclature_id === nom.id);
            return bal && parseFloat(bal.quantity_available) > 0;
        })
        .map(nom => {
            const bal = dictionaries.stockBalances.find(b => b.warehouse_id === parseInt(form.warehouse_from_id) && b.nomenclature_id === nom.id);
            return {
                value: nom.id,
                label: nom.fullName,
                subLabel: `SKU: ${nom.sku || '---'} | Вільно: ${bal ? bal.quantity_available : 0} ${nom.unitName}`
            };
        });

    // --- САБМІТ ФОРМИ ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        let qtyToProcess = parseFloat(form.quantity);
        let priceToProcess = parseFloat(form.sale_price);
        
        if (isNaN(qtyToProcess) || qtyToProcess <= 0) return showToast('Введіть коректну кількість (більше 0)', 'error');
        
        // Якщо продаж в штуках, конвертуємо введену кількість в базові одиниці (дріб)
        if (form.sellMode === 'piece' && hasPackage) {
            qtyToProcess = qtyToProcess / selectedItem.package_multiplier;
            // Якщо ціна була за 1 штуку, то ціна за базу (упаковку) = ціна * множник
            if (!isNaN(priceToProcess)) {
                priceToProcess = priceToProcess * selectedItem.package_multiplier;
            }
        }

        if (qtyToProcess > availableQtyBase) {
            return showToast(`Недостатньо товару! Вільно: ${availableQtyBase} ${selectedItem?.unitName}`, 'error');
        }

        setIsSubmitting(true);
        try {
            const payload = {
                operation_type: form.operation_type,
                nomenclature_id: parseInt(form.nomenclature_id),
                warehouse_from_id: parseInt(form.warehouse_from_id),
                quantity: qtyToProcess,
                client_id: form.client_id ? parseInt(form.client_id) : null,
                installation_custom_id: form.installation_custom_id ? parseInt(form.installation_custom_id) : null,
                sale_price: !isNaN(priceToProcess) ? priceToProcess : null,
                currency: form.currency,
                exchange_rate: parseFloat(form.exchange_rate) || 1.0,
                reference_document: form.reference_document || null,
                notes: form.notes || null,
                performed_by: employee?.id,
                created_by: employee?.id
            };

            const { error } = await supabase.from('stock_movements').insert([payload]);
            if (error) throw error;

            showToast('Успішно відвантажено!', 'success');
            onSuccess(); 
            onClose();   
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const totalAmount = (parseFloat(form.quantity) || 0) * (parseFloat(form.sale_price) || 0);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[80]" 
                    onClick={onClose}
                >
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0, y: 20 }} 
                        animate={{ scale: 1, opacity: 1, y: 0 }} 
                        exit={{ scale: 0.95, opacity: 0, y: 20 }} 
                        className="bg-white rounded-[24px] w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" 
                        onClick={e => e.stopPropagation()}
                    >
                        {/* HEADER */}
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50/50 flex-shrink-0">
                            <div>
                                <h2 className="text-xl sm:text-2xl font-black text-blue-900 flex items-center gap-3">
                                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                                        <FaShoppingCart />
                                    </div>
                                    Відвантаження / Продаж
                                </h2>
                                <p className="text-sm font-medium text-blue-700/70 mt-1 ml-14">
                                    Списання товару зі складу з фіксацією фінансів та контрагента
                                </p>
                            </div>
                            <button onClick={onClose} className="w-10 h-10 bg-white hover:bg-slate-100 text-slate-400 rounded-full flex items-center justify-center transition-colors shadow-sm"><FaTimes /></button>
                        </div>

                        {/* BODY */}
                        <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative">
                            {isLoading && (
                                <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center backdrop-blur-sm">
                                    <div className="animate-pulse flex gap-2">
                                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                                        <div className="w-3 h-3 bg-blue-400 rounded-full"></div>
                                    </div>
                                </div>
                            )}

                            <form id="direct-sale-form" onSubmit={handleSubmit} className="space-y-8">
                                
                                {/* БЛОК 1: КОНТРАГЕНТ */}
                                <section>
                                    <div className="flex justify-between items-end mb-4">
                                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <FaUserTie /> Інформація про контрагента
                                        </h3>
                                        {!isAddingClient && (
                                            <button type="button" onClick={() => setIsAddingClient(true)} className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg flex items-center gap-1 transition-colors">
                                                <FaPlus size={10} /> Новий клієнт
                                            </button>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2 flex gap-4 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                                            <button type="button" onClick={() => setForm({...form, operation_type: 'sale'})} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${form.operation_type === 'sale' ? 'bg-white text-blue-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>Прямий продаж</button>
                                            <button type="button" onClick={() => setForm({...form, operation_type: 'partner_transfer'})} className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${form.operation_type === 'partner_transfer' ? 'bg-white text-violet-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-slate-200/50'}`}>Передача партнеру</button>
                                        </div>

                                        {isAddingClient ? (
                                            <div className="md:col-span-2 bg-blue-50/30 border border-blue-100 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">ПІБ / Назва <span className="text-red-500">*</span></label>
                                                    <input autoFocus type="text" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="Іван Іваненко" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Телефон</label>
                                                    <input type="text" value={newClient.phone} onChange={e => setNewClient({...newClient, phone: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="+380..." />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Коментар</label>
                                                    <input type="text" value={newClient.notes} onChange={e => setNewClient({...newClient, notes: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" placeholder="Звідки дізнався..." />
                                                </div>
                                                <div className="md:col-span-3 flex justify-end gap-2 mt-1">
                                                    <button type="button" onClick={() => setIsAddingClient(false)} className="px-4 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-600">Скасувати</button>
                                                    <button type="button" onClick={handleQuickAddClient} disabled={isSubmitting} className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"><FaCheck/> Зберегти і обрати</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Клієнт / Партнер <span className="text-red-500">*</span></label>
                                                    <SearchableSelect 
                                                        options={dictionaries.clients.map(c => ({ value: c.id, label: `${c.name} ${c.is_subcontract ? '(Партнер)' : ''}` }))}
                                                        value={form.client_id}
                                                        onChange={(val) => setForm({...form, client_id: val})}
                                                        placeholder="Пошук клієнта..."
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Пов'язаний об'єкт (Опц.)</label>
                                                    <SearchableSelect 
                                                        options={[{value: '', label: "Без прив'язки"}, ...dictionaries.installations.map(i => ({ value: i.custom_id, label: `Об'єкт #${i.custom_id} - ${i.name}` }))]}
                                                        value={form.installation_custom_id}
                                                        onChange={(val) => setForm({...form, installation_custom_id: val})}
                                                        placeholder="Оберіть активний об'єкт..."
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </section>

                                {/* БЛОК 2: ТОВАР ТА СКЛАД */}
                                <section>
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 border-t border-slate-100 pt-6">
                                        <FaBox /> Локація та Номенклатура
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Склад списання <span className="text-red-500">*</span></label>
                                            <select required value={form.warehouse_from_id} onChange={e => setForm({...form, warehouse_from_id: e.target.value, nomenclature_id: ''})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none text-sm font-bold text-slate-800 transition-colors">
                                                <option value="">Оберіть склад спочатку...</option>
                                                {dictionaries.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Пошук товару <span className="text-red-500">*</span></label>
                                            <SearchableSelect 
                                                options={availableNomenclatureOptions}
                                                value={form.nomenclature_id}
                                                onChange={(val) => setForm({...form, nomenclature_id: val, sellMode: 'base'})}
                                                placeholder={form.warehouse_from_id ? "Почніть вводити назву..." : "Оберіть склад..."}
                                                disabled={!form.warehouse_from_id}
                                            />
                                        </div>

                                        {/* Інформація про залишок та Дроблення */}
                                        <div className="md:col-span-2">
                                            <AnimatePresence mode="wait">
                                                {form.warehouse_from_id && form.nomenclature_id && selectedItem && (
                                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 space-y-4">
                                                        <div className="flex items-center gap-3">
                                                            <FaInfoCircle className="text-blue-500 flex-shrink-0" />
                                                            <span className="text-sm font-medium text-slate-700">
                                                                Доступно на складі: <span className={`font-black ml-1 ${availableQtyBase > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{availableQtyBase} {selectedItem.unitName}</span>
                                                            </span>
                                                        </div>

                                                        {/* Логіка розпаковки (Zip Tie Problem) */}
                                                        {hasPackage && (
                                                            <div className="bg-white p-3 rounded-lg border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                                                <div>
                                                                    <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                                                        Цей товар надходить упаковками 
                                                                        <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[10px]">1 {selectedItem.unitName} = {selectedItem.package_multiplier} {selectedItem.package_name || 'шт'}</span>
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-500 mt-0.5">Виберіть, в чому ви зараз здійснюєте продаж:</div>
                                                                </div>
                                                                <div className="flex bg-slate-100 p-1 rounded-lg">
                                                                    <button type="button" onClick={() => setForm({...form, sellMode: 'base'})} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${form.sellMode === 'base' ? 'bg-white shadow border border-slate-200 text-blue-700' : 'text-slate-500'}`}>Упаковки ({selectedItem.unitName})</button>
                                                                    <button type="button" onClick={() => setForm({...form, sellMode: 'piece'})} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${form.sellMode === 'piece' ? 'bg-white shadow border border-slate-200 text-amber-700' : 'text-slate-500'}`}>Штучно ({selectedItem.package_name || 'шт'})</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                </section>

                                {/* БЛОК 3: ФІНАНСИ */}
                                <section>
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 border-t border-slate-100 pt-6">
                                        <FaMoneyBillWave /> Кількість та Вартість
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">
                                                Віддаємо <span className="text-red-500">*</span>
                                            </label>
                                            <div className="relative">
                                                <input type="number" min="1" step={form.sellMode === 'piece' ? "1" : "0.001"} required value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} className="w-full px-4 py-3 bg-white border-2 border-blue-200 rounded-xl focus:border-blue-500 outline-none text-lg font-black text-blue-700 transition-colors pr-12" placeholder="0" />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">
                                                    {selectedItem ? (form.sellMode === 'piece' ? (selectedItem.package_name || 'шт') : selectedItem.unitName) : ''}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-span-2 md:col-span-1">
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">
                                                Ціна за 1 {selectedItem ? (form.sellMode === 'piece' ? (selectedItem.package_name || 'шт') : selectedItem.unitName) : 'од.'}
                                            </label>
                                            <input type="number" min="0" step="0.01" value={form.sale_price} onChange={e => setForm({...form, sale_price: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none text-sm font-bold text-slate-800 transition-colors" placeholder="0.00" />
                                        </div>

                                        <div className="col-span-1">
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Валюта</label>
                                            <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none text-sm font-bold text-slate-800 transition-colors">
                                                <option value="UAH">UAH (₴)</option>
                                                <option value="USD">USD ($)</option>
                                                <option value="EUR">EUR (€)</option>
                                            </select>
                                        </div>

                                        <div className="col-span-1">
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase" title="Курс відносно гривні">Курс</label>
                                            <input type="number" min="0.0001" step="0.01" required value={form.exchange_rate} onChange={e => setForm({...form, exchange_rate: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none text-sm font-bold text-slate-800 transition-colors" placeholder="1.0" />
                                        </div>

                                        {/* Загальна сума */}
                                        {totalAmount > 0 && (
                                            <div className="col-span-2 md:col-span-4 bg-slate-50 rounded-xl p-4 flex justify-between items-center border border-slate-100">
                                                <span className="text-sm font-bold text-slate-500">Загальна сума до сплати:</span>
                                                <span className="text-xl font-black text-slate-800">{totalAmount.toLocaleString('uk-UA')} <span className="text-sm text-slate-500 font-bold">{form.currency}</span></span>
                                            </div>
                                        )}
                                    </div>
                                </section>

                                {/* БЛОК 4: ДОДАТКОВО */}
                                <section>
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 border-t border-slate-100 pt-6">
                                        <FaFileAlt /> Коментарі та Документи
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Документ (Акт / Накладна)</label>
                                            <input type="text" value={form.reference_document} onChange={e => setForm({...form, reference_document: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none text-sm text-slate-800 transition-colors" placeholder="№..." />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-slate-500 mb-1.5 uppercase">Коментар</label>
                                            <input type="text" value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-200 outline-none text-sm text-slate-800 transition-colors" placeholder="Деталі..." />
                                        </div>
                                    </div>
                                </section>

                            </form>
                        </div>

                        {/* FOOTER */}
                        <div className="p-6 border-t border-slate-100 flex flex-col-reverse sm:flex-row justify-end gap-3 flex-shrink-0 bg-slate-50 rounded-b-[24px]">
                            <button type="button" onClick={onClose} className="w-full sm:w-auto px-6 py-3.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-100 transition-colors text-sm">Скасувати</button>
                            <button form="direct-sale-form" type="submit" disabled={isSubmitting || isLoading} className="w-full sm:w-auto px-8 py-3.5 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-70">
                                {isSubmitting ? 'Проведення...' : 'Підтвердити відвантаження'}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}