import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaFilePdf, FaUpload, FaCheck, FaExclamationTriangle, FaTimes, 
    FaSearch, FaChevronDown, FaHardHat, FaHistory, FaProjectDiagram,
    FaMagic, FaTrash, FaArchive, FaCheckCircle, FaSpinner, FaBoxOpen,
    FaInfoCircle, FaPlus
} from 'react-icons/fa';
import { supabase } from '../supabaseClient';
import Layout from '../Layout';
import { useAuth } from '../AuthProvider';
import ManualSpecBuilder from './ManualSpecBuilder';

// Оновлено URL на Cloudflare Worker API
const OCR_API_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev/parse-pdf';

// --- ДОПОМІЖНІ КОМПОНЕНТИ ---
const Toast = memo(({ message, type = 'success', isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }
    }, [isVisible, onClose]);
    const styles = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-500' };
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="fixed top-20 right-4 z-[100]">
                    <div className={`${styles[type] || 'bg-blue-600'} text-white rounded-xl shadow-2xl p-4 flex items-center space-x-3`}>
                        {type === 'success' ? <FaCheck /> : <FaExclamationTriangle />}
                        <span className="font-bold text-sm">{message}</span>
                        <button onClick={onClose} className="ml-4 text-white/80 hover:text-white"><FaTimes /></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

// Кастомний селект для номенклатури (Студія Мапінгу)
const NomenclatureSelect = ({ options, value, onChange, placeholder, hasError }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(o => o.id === value);
    const filtered = options.filter(o => o.fullName.toLowerCase().includes(search.toLowerCase()) || (o.sku && o.sku.toLowerCase().includes(search.toLowerCase())));

    return (
        <div className="relative w-full" ref={wrapperRef}>
            <div 
                className={`w-full px-3 py-2 bg-white border rounded-lg flex justify-between items-center cursor-pointer text-sm transition-colors ${hasError ? 'border-red-400 bg-red-50/30' : 'border-slate-300 hover:border-indigo-400'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="truncate pr-2">
                    {selectedOption ? <span className="font-bold text-slate-800">{selectedOption.fullName}</span> : <span className={hasError ? "text-red-400 font-medium" : "text-slate-400"}>{placeholder}</span>}
                </div>
                <FaChevronDown className="text-slate-400 text-[10px] flex-shrink-0" />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute z-[60] w-[400px] right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50"><input autoFocus type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" placeholder="Пошук по базі..." value={search} onChange={e => setSearch(e.target.value)} /></div>
                        <div className="overflow-y-auto custom-scrollbar flex-1 p-1">
                            {filtered.length > 0 ? filtered.map(o => (
                                <div key={o.id} className={`px-3 py-2 cursor-pointer text-sm rounded-lg mb-0.5 transition-colors ${o.id === value ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-slate-50 border border-transparent'}`} onClick={() => { onChange(o.id); setIsOpen(false); setSearch(''); }}>
                                    <div className="font-bold text-slate-800 leading-tight">{o.fullName}</div>
                                    {o.sku && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 rounded mt-1 inline-block">SKU: {o.sku}</span>}
                                </div>
                            )) : <div className="px-4 py-4 text-sm text-slate-400 text-center">Нічого не знайдено</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default function ProjectSpecificationsPage() {
    const { employee, loading: authLoading } = useAuth();
    
    // Базові дані
    const [installations, setInstallations] = useState([]);
    const [nomenclatures, setNomenclatures] = useState([]);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState({ isVisible: false, message: '', type: 'success' });
    const showToast = useCallback((message, type = 'success') => setToast({ isVisible: true, message, type }), []);

    // Стан сторінки
    const [selectedInstId, setSelectedInstId] = useState('');
    const [specifications, setSpecifications] = useState([]); // Історія спек для об'єкта
    const [expandedSpecId, setExpandedSpecId] = useState(null);

    // Стан Мапінг-Студії
    const [isParsing, setIsParsing] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [mappedItems, setMappedItems] = useState([]); // Дані після OCR, готові до мапінгу
    const [pdfFileName, setPdfFileName] = useState('');
    const fileInputRef = useRef(null);

    // Ручне внесення комплектації
    const [isManualOpen, setIsManualOpen] = useState(false);

    // --- ЗАВАНТАЖЕННЯ ДОВІДНИКІВ ---
    const loadDictionaries = useCallback(async () => {
        setLoading(true);
        try {
            const [instRes, nomRes, catRes] = await Promise.all([
                supabase.from('installations').select('custom_id, name, status').in('status', ['planning', 'in_progress', 'pending']).order('created_at', { ascending: false }),
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('*')
            ]);

            setInstallations(instRes.data || []);
            
            // Формуємо повні назви номенклатури для зручного пошуку
            const cats = catRes.data || [];
            const processedNom = (nomRes.data || []).map(item => {
                let path = [];
                let currentId = item.category_id;
                while (currentId) {
                    const cat = cats.find(c => c.id === currentId);
                    if (cat) { path.unshift(cat.name); currentId = cat.parent_id; } else break;
                }
                return { ...item, fullName: `${path.join(' ')} ${item.name}`.trim() };
            });
            setNomenclatures(processedNom);
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { if (!authLoading) loadDictionaries(); }, [authLoading, loadDictionaries]);

    // --- ЗАВАНТАЖЕННЯ ІСТОРІЇ СПЕЦИФІКАЦІЙ ДЛЯ ОБ'ЄКТА ---
    const loadSpecifications = useCallback(async (instId) => {
        if (!instId) { setSpecifications([]); return; }
        try {
            const { data, error } = await supabase
                .from('specifications')
                .select(`
                    *,
                    items:specification_items(id, quantity, original_name, nomenclature_id)
                `)
                .eq('installation_custom_id', instId)
                .order('version', { ascending: false });
            
            if (error) throw error;
            setSpecifications(data || []);
            // Авторозгортання найсвіжішої (активної) версії
            if (data && data.length > 0) setExpandedSpecId(data[0].id);
        } catch (error) {
            showToast(error.message, 'error');
        }
    }, [showToast]);

    useEffect(() => { loadSpecifications(selectedInstId); }, [selectedInstId, loadSpecifications]);

    // --- АВТОМАТИЧНИЙ МАПІНГ (FUZZY MATCH) ---
    const autoMatchItem = (originalName) => {
        if (!originalName) return '';
        const lowerName = originalName.toLowerCase();
        
        // 1. Спроба знайти ідеальний збіг в назві
        let match = nomenclatures.find(n => n.fullName.toLowerCase().includes(lowerName) || lowerName.includes(n.name.toLowerCase()));
        if (match) return match.id;

        // 2. Спроба розбити на слова і знайти найбільший перетин
        const words = lowerName.split(/[\s,.-]+/);
        let bestMatch = null;
        let maxScore = 0;

        for (const nom of nomenclatures) {
            const nomWords = nom.fullName.toLowerCase();
            let score = 0;
            words.forEach(w => { if (w.length > 2 && nomWords.includes(w)) score++; });
            if (score > maxScore) { maxScore = score; bestMatch = nom; }
        }

        // Якщо знайшли хоча б 2 спільних слова - вважаємо це матчем
        return maxScore >= 2 && bestMatch ? bestMatch.id : '';
    };

    // --- ОБРОБКА PDF ---
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!selectedInstId) return showToast('Спочатку оберіть об\'єкт!', 'warning');
        if (file.type !== 'application/pdf') return showToast('Дозволені лише PDF файли!', 'error');

        setPdfFileName(file.name);
        setIsParsing(true);
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            // Відправляємо на Cloudflare Worker API
            const response = await fetch(OCR_API_URL, { method: 'POST', body: formData });
            
            if (!response.ok) {
                let errorMsg = 'Помилка OCR сервісу';
                try {
                    const errData = await response.json();
                    errorMsg = errData.detail || errData.error || errData.message || errorMsg;
                } catch (e) {
                    errorMsg = `Помилка сервера: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMsg);
            }
            
            const data = await response.json();
            if (data.items && data.items.length > 0) {
                // Готуємо дані для студії мапінгу
                const initialMapping = data.items.map(item => ({
                    id: Math.random().toString(36).substr(2, 9), // тимчасовий ID
                    original_name: item.original_name + (item.technical_chars ? ` (${item.technical_chars})` : ''),
                    quantity: parseFloat(item.quantity) || 1,
                    unit: item.unit || 'шт',
                    nomenclature_id: autoMatchItem(item.original_name) // АВТОМАПІНГ
                }));
                
                setMappedItems(initialMapping);
                setIsMappingModalOpen(true);
                showToast(`Знайдено позицій: ${initialMapping.length}. Перевірте відповідність.`, 'success');
            } else {
                showToast('Не вдалося знайти таблицю специфікації у файлі.', 'warning');
            }
        } catch (error) {
            showToast(`Помилка: ${error.message}. Переконайтесь, що API працює.`, 'error');
        } finally {
            setIsParsing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // --- ЗБЕРЕЖЕННЯ В БАЗУ ДАНИХ ---
    const handleConfirmMapping = async () => {
        // Перевіряємо чи всі позиції змаплені
        const unmapped = mappedItems.filter(item => !item.nomenclature_id);
        if (unmapped.length > 0) {
            return showToast(`Залишилось ${unmapped.length} неідентифікованих позицій! Оберіть товар з бази або видаліть рядок.`, 'error');
        }
        if (mappedItems.length === 0) return showToast('Специфікація порожня!', 'warning');

        setIsParsing(true);
        try {
            // 1. Визначаємо наступну версію
            const nextVersion = specifications.length > 0 ? Math.max(...specifications.map(s => s.version)) + 1 : 1;

            // 2. Всі попередні версії ставимо в 'archived'
            if (specifications.length > 0) {
                const { error: archErr } = await supabase.from('specifications').update({ status: 'archived' }).eq('installation_custom_id', selectedInstId);
                if (archErr) throw archErr;
            }

            // 3. Створюємо нову шапку (status = confirmed)
            const headerPayload = {
                installation_custom_id: selectedInstId,
                version: nextVersion,
                status: 'confirmed',
                name: `Специфікація V.${nextVersion} (${pdfFileName})`,
                confirmed_at: new Date().toISOString(),
                created_by: employee?.id
            };

            const { data: newSpec, error: hErr } = await supabase.from('specifications').insert([headerPayload]).select().single();
            if (hErr) throw hErr;

            // 4. Додаємо позиції специфікації (Зберігаючи original_name!)
            const itemsPayload = mappedItems.map(item => ({
                specification_id: newSpec.id,
                nomenclature_id: item.nomenclature_id,
                quantity: item.quantity,
                original_name: item.original_name, // Зберігаємо те, що було в PDF
                created_by: employee?.id
            }));

            const { error: iErr } = await supabase.from('specification_items').insert(itemsPayload);
            if (iErr) throw iErr;

            showToast('Специфікацію успішно затверджено!', 'success');
            setIsMappingModalOpen(false);
            loadSpecifications(selectedInstId); // Оновлюємо гармошку
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setIsParsing(false);
        }
    };

    if (authLoading) return <div className="p-8 text-center text-slate-500">Завантаження...</div>;

    const selectedInstData = installations.find(i => String(i.custom_id) === String(selectedInstId));

    return (
        <Layout>
            <div className="p-4 sm:p-8 max-w-[1400px] mx-auto pb-safe min-h-[calc(100vh-80px)] flex flex-col text-slate-800">
                <Toast {...toast} onClose={() => setToast(prev => ({ ...prev, isVisible: false }))} />

                {/* --- HEADER --- */}
                <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8 flex-none">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-3">
                            <FaProjectDiagram className="text-indigo-600" /> Специфікації об'єктів
                        </h1>
                        <p className="text-slate-500 text-sm mt-1 ml-10">Оцифрування проєктів, формування потреби та версіювання</p>
                    </div>
                </div>

                {/* --- ВИБІР ОБ'ЄКТА --- */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6 flex flex-col md:flex-row gap-4 items-center">
                    <div className="w-full md:w-1/2">
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Оберіть об'єкт для роботи</label>
                        <select 
                            value={selectedInstId} 
                            onChange={(e) => setSelectedInstId(e.target.value)} 
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800 transition-colors cursor-pointer"
                        >
                            <option value="">Не обрано...</option>
                            {installations.map(i => <option key={i.custom_id} value={i.custom_id}>[#{i.custom_id}] {i.name}</option>)}
                        </select>
                    </div>
                    {selectedInstId && (
                        <div className="w-full md:w-1/2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3">
                            <button
                                onClick={() => setIsManualOpen(true)}
                                className="w-full sm:w-auto px-5 py-3.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <FaPlus/> Внести вручну
                            </button>
                            <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isParsing}
                                className="w-full sm:w-auto px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isParsing ? <FaSpinner className="animate-spin"/> : <FaUpload/>}
                                {isParsing ? 'Розпізнавання...' : 'Завантажити PDF специфікацію'}
                            </button>
                        </div>
                    )}
                </div>

                {/* --- АКОРДЕОН ВЕРСІЙ (ГАРМОШКА) --- */}
                {selectedInstId ? (
                    <div className="flex-1 flex flex-col">
                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2"><FaHistory className="text-slate-400"/> Історія версій специфікацій</h3>
                        
                        {loading ? (
                            <div className="flex justify-center p-10"><FaSpinner className="animate-spin text-3xl text-indigo-500" /></div>
                        ) : specifications.length === 0 ? (
                            <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-2xl">
                                <FaFilePdf className="mx-auto text-5xl text-slate-300 mb-4" />
                                <h3 className="text-lg font-bold text-slate-600">Специфікацій ще немає</h3>
                                <p className="text-slate-400 text-sm mt-1">Завантажте PDF файл від проектанта, щоб створити першу версію.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {specifications.map(spec => {
                                    const isExpanded = expandedSpecId === spec.id;
                                    const isActive = spec.status === 'confirmed';
                                    
                                    return (
                                        <div key={spec.id} className={`bg-white border rounded-2xl overflow-hidden transition-all ${isActive ? 'border-emerald-500 shadow-md ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                                            {/* Шапка гармошки */}
                                            <div 
                                                className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isActive ? 'bg-emerald-50/30 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}
                                                onClick={() => setExpandedSpecId(isExpanded ? null : spec.id)}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                                        V{spec.version}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                            {spec.name}
                                                            {isActive ? (
                                                                <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest font-black shadow-sm flex items-center gap-1"><FaCheckCircle/> Активна</span>
                                                            ) : (
                                                                <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest font-black flex items-center gap-1"><FaArchive/> Архів</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-slate-500 mt-1">Затверджено: {new Date(spec.confirmed_at || spec.created_at).toLocaleString('uk-UA')} • Позицій: {spec.items?.length || 0}</div>
                                                    </div>
                                                </div>
                                                <FaChevronDown className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-indigo-500' : ''}`} />
                                            </div>

                                            {/* Вміст гармошки */}
                                            <AnimatePresence>
                                                {isExpanded && (
                                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-slate-100">
                                                        <div className="p-6 bg-slate-50/50">
                                                            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                                                                <table className="w-full text-left border-collapse">
                                                                    <thead>
                                                                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                                                                            <th className="px-4 py-3 font-bold w-12 text-center">№</th>
                                                                            <th className="px-4 py-3 font-bold">Зв'язана номенклатура (Склад)</th>
                                                                            <th className="px-4 py-3 font-bold">Оригінальна назва (з PDF)</th>
                                                                            <th className="px-4 py-3 font-bold text-center w-24">К-сть</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100">
                                                                        {spec.items.map((item, idx) => {
                                                                            const nom = nomenclatures.find(n => n.id === item.nomenclature_id);
                                                                            return (
                                                                                <tr key={item.id} className="hover:bg-slate-50/50">
                                                                                    <td className="px-4 py-3 text-center text-slate-400 text-xs font-bold">{idx + 1}</td>
                                                                                    <td className="px-4 py-3">
                                                                                        <div className="font-bold text-slate-800 text-sm leading-tight">{nom?.fullName || 'Не знайдено'}</div>
                                                                                        {nom?.sku && <div className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-widest">SKU: {nom.sku}</div>}
                                                                                    </td>
                                                                                    <td className="px-4 py-3">
                                                                                        <div className="text-xs text-slate-500 italic bg-slate-50 px-2 py-1 rounded inline-block border border-slate-100">{item.original_name}</div>
                                                                                    </td>
                                                                                    <td className="px-4 py-3 text-center">
                                                                                        <div className="inline-block px-2 py-1 rounded border border-slate-200 bg-white shadow-sm">
                                                                                            <span className="font-black text-indigo-700">{item.quantity}</span>
                                                                                            <span className="text-[10px] text-slate-400 ml-1 uppercase">{nom?.unit?.name || 'шт'}</span>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center text-slate-400 flex flex-col items-center">
                            <FaHardHat className="text-6xl text-slate-200 mb-4" />
                            <p className="font-medium">Оберіть об'єкт зі списку вище, щоб розпочати роботу.</p>
                        </div>
                    </div>
                )}

                {/* --- МОДАЛКА: СТУДІЯ МАПІНГУ --- */}
                <AnimatePresence>
                    {isMappingModalOpen && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                                
                                {/* Шапка */}
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl flex-shrink-0">
                                    <div>
                                        <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2"><FaMagic className="text-indigo-500"/> Студія оцифрування (Мапінг)</h2>
                                        <p className="text-xs text-indigo-700 mt-1 font-medium">Перевірте, як система зв'язала позиції з PDF з нашою складською базою.</p>
                                    </div>
                                    <button onClick={() => setIsMappingModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes/></button>
                                </div>

                                {/* Інфо-плашка */}
                                <div className="bg-white p-4 flex items-center gap-3 border-b border-slate-100 flex-shrink-0">
                                    <div className="flex-1 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                                        <FaInfoCircle className="text-amber-500 text-xl flex-shrink-0"/>
                                        <p className="text-xs text-amber-800 leading-relaxed font-medium">
                                            У колонці зліва — оригінальний текст проектанта. Справа — відповідний товар на складі. 
                                            Система спробувала підібрати їх автоматично. <strong className="text-amber-900">Якщо поле червоне — оберіть товар вручну!</strong>
                                        </p>
                                    </div>
                                    <div className="text-center px-6 py-2 bg-slate-50 rounded-xl border border-slate-200">
                                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Позицій</div>
                                        <div className="text-2xl font-black text-slate-800">{mappedItems.length}</div>
                                    </div>
                                </div>

                                {/* Таблиця Мапінгу */}
                                <div className="overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="sticky top-0 bg-slate-100 shadow-sm z-10">
                                            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                                                <th className="px-4 py-3 font-bold border-b border-slate-200">Прочитано з PDF (Оригінал)</th>
                                                <th className="px-4 py-3 font-bold border-b border-slate-200 text-center w-24">К-сть</th>
                                                <th className="px-4 py-3 font-bold border-b border-slate-200 border-l border-slate-200 bg-indigo-50/50"><FaBoxOpen className="inline mr-1 text-indigo-400"/> Товар у базі (Склад)</th>
                                                <th className="px-4 py-3 font-bold border-b border-slate-200 text-center w-12">Дія</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {mappedItems.map((item, index) => {
                                                const hasError = !item.nomenclature_id;
                                                return (
                                                    <tr key={item.id} className={`transition-colors ${hasError ? 'bg-red-50/30' : 'bg-white hover:bg-slate-50'}`}>
                                                        {/* Ліва частина (Оригінал) */}
                                                        <td className="px-4 py-4 w-1/3 align-middle border-r border-dashed border-slate-200">
                                                            <div className="text-sm font-bold text-slate-700 leading-tight mb-1">{item.original_name}</div>
                                                        </td>
                                                        <td className="px-2 py-4 align-middle border-r border-slate-200 text-center">
                                                            <div className="inline-flex items-center gap-1 bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                                                <input 
                                                                    type="number" min="0" step="0.01" 
                                                                    value={item.quantity} 
                                                                    onChange={e => { const newArr = [...mappedItems]; newArr[index].quantity = e.target.value; setMappedItems(newArr); }}
                                                                    className="w-12 text-center text-sm font-black text-indigo-700 bg-transparent outline-none"
                                                                />
                                                                <span className="text-[10px] text-slate-400 font-bold uppercase">{item.unit}</span>
                                                            </div>
                                                        </td>
                                                        {/* Права частина (База) */}
                                                        <td className="px-4 py-4 w-1/2 align-middle border-l-2 border-indigo-100">
                                                            <NomenclatureSelect 
                                                                options={nomenclatures} 
                                                                value={item.nomenclature_id} 
                                                                hasError={hasError}
                                                                placeholder="Увага! Натисніть та оберіть товар з бази"
                                                                onChange={val => { const newArr = [...mappedItems]; newArr[index].nomenclature_id = val; setMappedItems(newArr); }}
                                                            />
                                                        </td>
                                                        <td className="px-4 py-4 align-middle text-center">
                                                            <button 
                                                                onClick={() => { const newArr = mappedItems.filter((_, i) => i !== index); setMappedItems(newArr); }} 
                                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                                title="Видалити цей рядок (якщо це сміття)"
                                                            >
                                                                <FaTrash size={16}/>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Підвал */}
                                <div className="p-5 border-t border-slate-100 flex justify-between items-center bg-white rounded-b-2xl flex-shrink-0">
                                    <button 
                                        type="button" 
                                        onClick={() => setMappedItems([...mappedItems, { id: Math.random().toString(), original_name: 'Додано вручну', quantity: 1, unit: 'шт', nomenclature_id: '' }])}
                                        className="text-indigo-600 font-bold text-sm hover:underline"
                                    >
                                        + Додати пропущений рядок
                                    </button>
                                    <div className="flex gap-3">
                                        <button onClick={() => setIsMappingModalOpen(false)} className="px-6 py-3 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-sm">Скасувати</button>
                                        <button 
                                            onClick={handleConfirmMapping} 
                                            disabled={isParsing || mappedItems.length === 0} 
                                            className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all text-sm flex items-center gap-2 disabled:opacity-50 active:scale-95"
                                        >
                                            {isParsing ? 'Збереження...' : 'Затвердити специфікацію'}
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* --- РУЧНЕ ВНЕСЕННЯ КОМПЛЕКТАЦІЇ --- */}
                {isManualOpen && selectedInstId && (
                    <ManualSpecBuilder
                        isOpen={isManualOpen}
                        onClose={() => setIsManualOpen(false)}
                        onSuccess={() => loadSpecifications(selectedInstId)}
                        installationId={parseInt(selectedInstId)}
                        title="Специфікація матеріалів"
                        showToast={showToast}
                    />
                )}

            </div>
        </Layout>
    );
}