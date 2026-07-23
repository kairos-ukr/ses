import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FaFilePdf, FaUpload, FaCheck, FaExclamationTriangle, FaTimes, 
    FaChevronDown, FaHistory, FaMagic, FaTrash, FaArchive, 
    FaCheckCircle, FaSpinner, FaBoxOpen, FaPlus
} from 'react-icons/fa';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthProvider';
import ManualSpecBuilder from './pages/ManualSpecBuilder';

const OCR_API_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev/parse-pdf';

// Кастомний селект для номенклатури (Оцифрування)
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
                className={`w-full px-3 py-2.5 bg-white border rounded-lg flex justify-between items-center cursor-pointer text-sm transition-colors ${hasError ? 'border-red-400 bg-red-50/30' : 'border-slate-300 hover:border-indigo-400'}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="truncate pr-2">
                    {selectedOption ? <span className="font-bold text-slate-800">{selectedOption.fullName}</span> : <span className={hasError ? "text-red-500 font-bold" : "text-slate-400"}>{placeholder}</span>}
                </div>
                <FaChevronDown className="text-slate-400 text-[10px] flex-shrink-0" />
            </div>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute z-[80] w-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 flex flex-col overflow-hidden">
                        <div className="p-2 border-b border-slate-100 bg-slate-50">
                            <input 
                                autoFocus 
                                type="text" 
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-indigo-400" 
                                placeholder="Пошук по базі..." 
                                value={search} 
                                onChange={e => setSearch(e.target.value)} 
                            />
                        </div>
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

export default function SpecificationManager({ installationId, onClose }) {
    const { employee } = useAuth();
    
    const [nomenclatures, setNomenclatures] = useState([]);
    const [specifications, setSpecifications] = useState([]); 
    const [expandedSpecId, setExpandedSpecId] = useState(null);
    const [loading, setLoading] = useState(true);

    const [isParsing, setIsParsing] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [mappedItems, setMappedItems] = useState([]); 
    const [pdfFileName, setPdfFileName] = useState('');
    const fileInputRef = useRef(null);

    const [isManualOpen, setIsManualOpen] = useState(false);

    // --- ЗАВАНТАЖЕННЯ ДОВІДНИКІВ ТА СПЕЦИФІКАЦІЙ ---
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [nomRes, catRes, specRes] = await Promise.all([
                supabase.from('nomenclature').select('id, name, sku, category_id, unit:units(name)').eq('is_active', true),
                supabase.from('categories').select('*'),
                supabase.from('specifications').select(`*, items:specification_items(id, quantity, original_name, nomenclature_id)`).eq('installation_custom_id', installationId).order('version', { ascending: false })
            ]);

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

            const specs = specRes.data || [];
            setSpecifications(specs);
            if (specs.length > 0) setExpandedSpecId(specs[0].id);

        } catch (error) {
            alert(error.message);
        } finally {
            setLoading(false);
        }
    }, [installationId]);

    useEffect(() => { loadData(); }, [loadData]);

    // --- РОЗУМНИЙ АВТОМАПІНГ ---
    const autoMatchItem = (originalName) => {
        if (!originalName) return '';
        const lowerName = originalName.toLowerCase();
        
        let match = nomenclatures.find(n => n.fullName.toLowerCase().includes(lowerName) || lowerName.includes(n.name.toLowerCase()));
        if (match) return match.id;

        let bonusKeywords = [];
        if (lowerName.includes('lp1')) bonusKeywords.push('низьковольтний', 'однофазний');
        if (lowerName.includes('lp3')) bonusKeywords.push('низьковольтний', 'трифазний');
        if (lowerName.includes('hv1')) bonusKeywords.push('високовольтний', 'однофазний');
        if (lowerName.includes('hv3')) bonusKeywords.push('високовольтний', 'трифазний');

        const words = lowerName.split(/[\s,.-]+/);
        let bestMatch = null;
        let maxScore = 0;

        for (const nom of nomenclatures) {
            const nomWords = nom.fullName.toLowerCase();
            let score = 0;
            
            words.forEach(w => {
                if (w.length > 2) {
                    const fuzzyW = w.replace(/5/g, 's').replace(/0/g, 'o');
                    if (nomWords.includes(w) || nomWords.includes(fuzzyW)) score += 2;
                }
            });

            bonusKeywords.forEach(bw => {
                if (nomWords.includes(bw)) score += 10;
            });

            if (score > maxScore) { maxScore = score; bestMatch = nom; }
        }

        return maxScore >= 4 && bestMatch ? bestMatch.id : '';
    };

    // --- ОБРОБКА PDF ---
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.type !== 'application/pdf') return alert('Дозволені лише PDF файли!');

        setPdfFileName(file.name);
        setIsParsing(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(OCR_API_URL, { method: 'POST', body: formData });
            if (!response.ok) throw new Error('Помилка OCR сервісу');
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const initialMapping = data.items.map(item => ({
                    id: Math.random().toString(36).substr(2, 9),
                    original_name: item.original_name + (item.technical_chars ? ` (${item.technical_chars})` : ''),
                    quantity: parseInt(item.quantity) || 1, 
                    unit: item.unit || 'шт',
                    nomenclature_id: autoMatchItem(item.original_name)
                }));
                setMappedItems(initialMapping);
                setIsMappingModalOpen(true);
            } else {
                alert('Не вдалося знайти таблицю специфікації у файлі.');
            }
        } catch (error) {
            alert(`Помилка: ${error.message}`);
        } finally {
            setIsParsing(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // --- РЕ-МАПІНГ ОДНОГО РЯДКА ---
    const handleRematchRow = (index) => {
        const newArr = [...mappedItems];
        const newMatchId = autoMatchItem(newArr[index].original_name);
        newArr[index].nomenclature_id = newMatchId;
        setMappedItems(newArr);
    };

    // --- ЗБЕРЕЖЕННЯ ---
    const handleConfirmMapping = async () => {
        const unmapped = mappedItems.filter(item => !item.nomenclature_id);
        if (unmapped.length > 0) return alert(`Залишилось ${unmapped.length} неідентифікованих позицій!`);

        setIsParsing(true);
        try {
            const nextVersion = specifications.length > 0 ? Math.max(...specifications.map(s => s.version)) + 1 : 1;
            if (specifications.length > 0) {
                await supabase.from('specifications').update({ status: 'archived' }).eq('installation_custom_id', installationId);
            }

            const { data: newSpec, error: hErr } = await supabase.from('specifications').insert([{
                installation_custom_id: installationId,
                version: nextVersion,
                status: 'confirmed',
                name: `Специфікація V.${nextVersion} (${pdfFileName})`,
                confirmed_at: new Date().toISOString(),
                created_by: employee?.id
            }]).select().single();
            if (hErr) throw hErr;

            const itemsPayload = mappedItems.map(item => ({
                specification_id: newSpec.id, 
                nomenclature_id: item.nomenclature_id,
                quantity: parseInt(item.quantity) || 1, 
                original_name: item.original_name, 
                created_by: employee?.id
            }));

            const { error: iErr } = await supabase.from('specification_items').insert(itemsPayload);
            if (iErr) throw iErr;

            setIsMappingModalOpen(false);
            loadData(); 
        } catch (error) {
            alert(error.message);
        } finally {
            setIsParsing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-slate-50 w-full max-w-5xl h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                
                {/* Шапка модалки */}
                <div className="p-5 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <FaFilePdf className="text-indigo-600"/> Специфікація об'єкта #{installationId}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition">
                        <FaTimes />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {/* Кнопки завантаження / ручне внесення */}
                    <div className="mb-6 flex justify-end gap-3">
                        <button
                            onClick={() => setIsManualOpen(true)} disabled={loading}
                            className="px-5 py-3 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            <FaPlus/> Внести вручну
                        </button>
                        <input type="file" accept=".pdf" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                        <button
                            onClick={() => fileInputRef.current?.click()} disabled={isParsing || loading}
                            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isParsing ? <FaSpinner className="animate-spin"/> : <FaUpload/>}
                            {isParsing ? 'Розпізнавання...' : 'Завантажити новий PDF'}
                        </button>
                    </div>

                    {/* Гармошка версій */}
                    {loading ? (
                        <div className="flex justify-center p-10"><FaSpinner className="animate-spin text-3xl text-indigo-500" /></div>
                    ) : specifications.length === 0 ? (
                        <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-2xl shadow-sm">
                            <FaFilePdf className="mx-auto text-5xl text-slate-300 mb-4" />
                            <h3 className="text-lg font-bold text-slate-600">Специфікацій ще немає</h3>
                            <p className="text-slate-400 text-sm mt-1">Завантажте PDF файл від проектанта, щоб створити першу версію.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {specifications.map(spec => {
                                const isExpanded = expandedSpecId === spec.id;
                                const isActive = spec.status === 'confirmed';
                                return (
                                    <div key={spec.id} className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-sm ${isActive ? 'border-emerald-500 ring-1 ring-emerald-100' : 'border-slate-200'}`}>
                                        <div onClick={() => setExpandedSpecId(isExpanded ? null : spec.id)} className={`p-4 flex items-center justify-between cursor-pointer transition-colors ${isActive ? 'bg-emerald-50/50 hover:bg-emerald-100/50' : 'hover:bg-slate-50'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>V{spec.version}</div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                                        {spec.name}
                                                        {isActive ? <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full uppercase tracking-widest font-black shadow-sm flex items-center gap-1"><FaCheckCircle/> Активна</span> : <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-widest font-black flex items-center gap-1"><FaArchive/> Архів</span>}
                                                    </div>
                                                    <div className="text-xs text-slate-500 mt-1 font-medium">Затверджено: {new Date(spec.confirmed_at || spec.created_at).toLocaleString('uk-UA')} • Позицій: {spec.items?.length || 0}</div>
                                                </div>
                                            </div>
                                            <FaChevronDown className={`text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-indigo-500' : ''}`} />
                                        </div>
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-slate-100">
                                                    <div className="p-6 bg-slate-50/50">
                                                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
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
                                                                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                                                                                <td className="px-4 py-3 text-center text-slate-400 text-xs font-bold">{idx + 1}</td>
                                                                                <td className="px-4 py-3">
                                                                                    <div className="font-bold text-slate-800 text-sm leading-tight max-w-sm">{nom?.fullName || 'Не знайдено'}</div>
                                                                                    {nom?.sku && <div className="text-[10px] text-slate-400 font-mono mt-0.5 tracking-widest">SKU: {nom.sku}</div>}
                                                                                </td>
                                                                                <td className="px-4 py-3">
                                                                                    <div className="text-[11px] text-slate-500 font-medium italic bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100 inline-block line-clamp-2 max-w-xs">{item.original_name}</div>
                                                                                </td>
                                                                                <td className="px-4 py-3 text-center">
                                                                                    <div className="inline-block px-2.5 py-1 rounded-lg border border-slate-200 bg-white shadow-sm">
                                                                                        <span className="font-black text-indigo-700 text-base">{item.quantity}</span>
                                                                                        <span className="text-[10px] text-slate-400 font-bold ml-1 uppercase">{nom?.unit?.name || 'шт'}</span>
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

                {/* --- СТУДІЯ МАПІНГУ --- */}
                <AnimatePresence>
                    {isMappingModalOpen && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
                            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
                                
                                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-2xl flex-shrink-0">
                                    <div>
                                        <h2 className="text-xl font-bold text-indigo-900 flex items-center gap-2"><FaMagic className="text-indigo-500"/> Оцифрування</h2>
                                    </div>
                                    <button onClick={() => setIsMappingModalOpen(false)} className="p-2 bg-white hover:bg-slate-100 text-slate-400 rounded-full transition-colors shadow-sm"><FaTimes/></button>
                                </div>

                                <div className="overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50 p-6">
                                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                                        <table className="w-full text-left border-collapse">
                                            <thead className="bg-slate-100 border-b border-slate-200 z-10">
                                                <tr className="text-[10px] uppercase tracking-wider text-slate-500">
                                                    <th className="px-4 py-3 font-bold border-r border-slate-200 w-1/3">Прочитано з PDF</th>
                                                    <th className="px-4 py-3 font-bold border-r border-slate-200 text-center w-28">К-сть</th>
                                                    <th className="px-4 py-3 font-bold bg-indigo-50/50"><FaBoxOpen className="inline mr-1 text-indigo-500"/> Товар у базі (Склад)</th>
                                                    <th className="px-4 py-3 font-bold text-center w-12">Дія</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {mappedItems.map((item, index) => {
                                                    const hasError = !item.nomenclature_id;
                                                    return (
                                                        <tr key={item.id} className={`transition-colors ${hasError ? 'bg-red-50/20 hover:bg-red-50/40' : 'bg-white hover:bg-slate-50'}`}>
                                                            {/* Оригінал (Редагований) */}
                                                            <td className="px-4 py-4 w-1/3 align-top border-r border-slate-100">
                                                                <textarea 
                                                                    rows="2"
                                                                    value={item.original_name}
                                                                    onChange={e => { const newArr = [...mappedItems]; newArr[index].original_name = e.target.value; setMappedItems(newArr); }}
                                                                    className="w-full text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors resize-none shadow-sm"
                                                                />
                                                                <button 
                                                                    onClick={() => handleRematchRow(index)}
                                                                    className="mt-2 text-[11px] text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1.5 transition-colors bg-indigo-50 px-2 py-1 rounded w-fit"
                                                                >
                                                                    <FaMagic /> Перевірити збіг ще раз
                                                                </button>
                                                            </td>

                                                            {/* Кількість */}
                                                            <td className="px-3 py-4 align-top border-r border-slate-100 text-center">
                                                                <div className="inline-flex items-center gap-1 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                                                                    <input 
                                                                        type="number" min="1" step="1" 
                                                                        value={item.quantity} 
                                                                        onChange={e => { const newArr = [...mappedItems]; newArr[index].quantity = parseInt(e.target.value) || ''; setMappedItems(newArr); }}
                                                                        className="w-14 text-center text-base font-black text-indigo-700 bg-transparent outline-none"
                                                                    />
                                                                </div>
                                                            </td>

                                                            {/* База (Номенклатура) */}
                                                            <td className="px-4 py-4 w-1/2 align-top">
                                                                <NomenclatureSelect 
                                                                    options={nomenclatures} 
                                                                    value={item.nomenclature_id} 
                                                                    hasError={hasError}
                                                                    placeholder="Увага! Натисніть та оберіть товар з бази"
                                                                    onChange={val => { const newArr = [...mappedItems]; newArr[index].nomenclature_id = val; setMappedItems(newArr); }}
                                                                />
                                                                {hasError && <div className="text-[10px] text-red-500 font-bold mt-1.5 flex items-center gap-1"><FaExclamationTriangle/> Товар не підв'язано!</div>}
                                                            </td>

                                                            {/* Видалення */}
                                                            <td className="px-3 py-4 align-top text-center">
                                                                <button 
                                                                    onClick={() => { const newArr = mappedItems.filter((_, i) => i !== index); setMappedItems(newArr); }} 
                                                                    className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100 mt-1"
                                                                    title="Видалити рядок"
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
                                </div>

                                {/* Підвал */}
                                <div className="p-5 border-t border-slate-100 flex justify-between items-center bg-white rounded-b-2xl flex-shrink-0">
                                    <button 
                                        type="button" 
                                        onClick={() => setMappedItems([...mappedItems, { id: Math.random().toString(), original_name: 'Додано вручну', quantity: 1, unit: 'шт', nomenclature_id: '' }])}
                                        className="text-indigo-600 font-bold text-sm hover:underline flex items-center gap-1.5 bg-indigo-50 px-4 py-2 rounded-lg"
                                    >
                                        <FaPlus size={12}/> Додати пропущений рядок
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
                {isManualOpen && (
                    <ManualSpecBuilder
                        isOpen={isManualOpen}
                        onClose={() => setIsManualOpen(false)}
                        onSuccess={loadData}
                        installationId={parseInt(installationId)}
                        title="Специфікація матеріалів"
                        showToast={(m, t) => { if (t === 'error') alert(m); }}
                    />
                )}

            </div>
        </div>
    );
}