import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom"; 
import { motion, AnimatePresence } from "framer-motion";
import { 
    FaCloudUploadAlt, FaFilePdf, FaFileImage, FaFileAlt, 
    FaEye, FaTimes, FaDownload, FaCheck, FaExclamationTriangle, 
    FaTrash, FaRegFile, FaFilter, FaFileExcel, FaFileWord, FaSpinner, FaImage, FaChevronDown
} from "react-icons/fa";

// --- КОНФІГУРАЦІЯ ---
const SERVER_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev'; 

const DOC_TYPES = [
    "Комерційна пропозиція", 
    "Технічний проєкт", 
    "Фотозвіт", 
    "Фото об'єкта",       
    "3D-візуалізація",    
    "Чек", 
    "Накладна", 
    "Акт", 
    "Інше"
];

// Хелпер для іконок
const getFileIcon = (mimeType) => {
    if (!mimeType) return <FaFileAlt className="text-gray-400 text-4xl"/>;
    if (mimeType.includes('pdf')) return <FaFilePdf className="text-red-500 text-4xl"/>;
    if (mimeType.includes('image')) return <FaFileImage className="text-blue-500 text-4xl"/>;
    if (mimeType.includes('sheet') || mimeType.includes('excel')) return <FaFileExcel className="text-green-600 text-4xl"/>;
    if (mimeType.includes('word') || mimeType.includes('document')) return <FaFileWord className="text-blue-700 text-4xl"/>;
    return <FaFileAlt className="text-gray-400 text-4xl"/>;
};

export default function ProjectDocumentsPage({ project: propProject }) {
    const { id } = useParams(); 
    const projectId = propProject?.custom_id || id;

    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Upload State
    const [uploadFiles, setUploadFiles] = useState([]); 
    const [docType, setDocType] = useState(""); 
    const [customDocType, setCustomDocType] = useState(""); 
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [typeError, setTypeError] = useState(false);
    
    // View State
    const [previewUrl, setPreviewUrl] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Всі");
    const [toast, setToast] = useState(null);
    
    const fileInputRef = useRef(null);

    // Завантаження списку (Оптимізація з AbortController)
    const fetchDocuments = useCallback(async () => {
        if (!projectId) return;
        
        const controller = new AbortController();
        const signal = controller.signal;

        setLoading(true);
        try {
            const response = await fetch(`${SERVER_URL}/documents/${projectId}`, { signal });
            const data = await response.json();
            if (data.status === 'error') throw new Error(data.message);
            setDocuments(data.documents || []);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                showToast('error', "Не вдалося завантажити документи");
            }
        } finally {
            setLoading(false);
        }

        return () => controller.abort();
    }, [projectId]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    const showToast = (type, msg) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3000);
    };

    // Фільтрація документів
    const filteredDocuments = useMemo(() => {
        if (activeFilter === "Всі") return documents;
        return documents.filter(doc => (doc.docType || "Інше") === activeFilter);
    }, [documents, activeFilter]);

    // Підрахунок кількості для фільтрів
    const counts = useMemo(() => {
        const stats = { "Всі": documents.length };
        DOC_TYPES.forEach(type => stats[type] = 0);
        documents.forEach(doc => {
            const t = doc.docType || "Інше";
            stats[t] = (stats[t] || 0) + 1;
        });
        return stats;
    }, [documents]);

    // --- Upload Handlers ---
    const handleFiles = (files) => {
        if (files && files.length > 0) {
            setUploadFiles(prev => [...prev, ...Array.from(files)]);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        
        if (!docType) {
            setTypeError(true);
            showToast('error', "Будь ласка, оберіть тип документа");
            return;
        }

        if (uploadFiles.length === 0) return;

        const finalDocType = docType === "Інше" ? customDocType.trim() : docType;
        if (!finalDocType) return showToast('error', "Вкажіть назву типу документа");

        setIsUploading(true);
        const formData = new FormData();
        formData.append('object_number', projectId);
        formData.append('doc_type', finalDocType);
        uploadFiles.forEach((file) => formData.append('files', file));

        try {
            const response = await fetch(`${SERVER_URL}/upload/`, { method: 'POST', body: formData });
            const result = await response.json();

            if (result.status === 'success') {
                showToast('success', `Завантажено файлів: ${result.count}`);
                setUploadFiles([]); 
                setCustomDocType("");
                setDocType(""); 
                setTypeError(false);
                fetchDocuments(); 
            } else {
                showToast('error', result.message);
            }
        } catch (error) {
            showToast('error', "Помилка з'єднання");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col p-4 md:p-6">
            
            <div className="max-w-[1600px] mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                
                {/* --- ЛІВА КОЛОНКА (ТІЛЬКИ ЗАВАНТАЖЕННЯ) --- */}
                <div className="lg:col-span-1 space-y-6">
                    
                    {/* Upload Card */}
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 sticky top-6">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                            <FaCloudUploadAlt className="text-indigo-500"/> Додати файл
                        </h3>
                        
                        <form onSubmit={handleUpload} className="space-y-4">
                            {/* Type Selector з валідацією */}
                            <div className="relative">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                                    Тип документа <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <select 
                                        value={docType} 
                                        onChange={(e) => {
                                            setDocType(e.target.value);
                                            setTypeError(false); 
                                        }} 
                                        className={`
                                            w-full p-2.5 pr-8 rounded-xl border text-sm focus:ring-2 outline-none transition font-medium text-slate-700 appearance-none cursor-pointer
                                            ${typeError 
                                                ? 'border-red-500 bg-red-50 focus:ring-red-200' 
                                                : 'border-slate-200 bg-slate-50 focus:ring-indigo-500 focus:bg-white'}
                                        `}
                                    >
                                        <option value="" disabled>-- Оберіть тип --</option>
                                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"/>
                                </div>
                                {typeError && (
                                    <p className="text-[10px] text-red-500 mt-1 font-bold animate-pulse">
                                        Необхідно обрати тип документа!
                                    </p>
                                )}
                            </div>

                            {docType === "Інше" && (
                                <input 
                                    type="text" 
                                    placeholder="Введіть назву..." 
                                    value={customDocType}
                                    onChange={(e) => setCustomDocType(e.target.value)}
                                    className="w-full p-2.5 rounded-xl border border-indigo-200 bg-indigo-50 text-sm focus:bg-white outline-none"
                                />
                            )}

                            {/* Drop Zone */}
                            <div 
                                className={`
                                    relative border-2 border-dashed rounded-xl p-6 transition-all text-center cursor-pointer group
                                    ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}
                                `}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" multiple ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} className="hidden" />
                                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition">
                                    <FaCloudUploadAlt size={20}/>
                                </div>
                                <p className="text-xs text-slate-500 font-bold">Натисніть або перетягніть</p>
                            </div>

                            {/* Queue */}
                            <AnimatePresence>
                                {uploadFiles.length > 0 && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="bg-slate-50 rounded-xl border border-slate-200 max-h-32 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                            {uploadFiles.map((file, i) => (
                                                <div key={i} className="flex justify-between items-center text-xs p-2 bg-white rounded border border-slate-100 shadow-sm">
                                                    <span className="truncate max-w-[80%] text-slate-600">{file.name}</span>
                                                    <button type="button" onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600"><FaTrash/></button>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <button 
                                type="submit" 
                                disabled={isUploading || uploadFiles.length === 0} 
                                className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-lg hover:bg-slate-800 disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2 transition active:scale-[0.98]"
                            >
                                {isUploading ? <FaSpinner className="animate-spin"/> : <FaCheck/>} 
                                {isUploading ? 'Завантаження...' : 'Зберегти файли'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* --- ПРАВА КОЛОНКА (ФІЛЬТРИ + СІТКА) --- */}
                <div className="lg:col-span-3 flex flex-col gap-6">
                    
                    {/* 1. ФІЛЬТРИ (Вгорі справа) */}
                    <div className="flex justify-between items-center bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
                        <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2 px-2">
                            <FaFilter className="text-indigo-500"/> Фільтр файлів
                        </div>
                        
                        <div className="relative min-w-[200px] md:min-w-[250px]">
                            <select
                                value={activeFilter}
                                onChange={(e) => setActiveFilter(e.target.value)}
                                className="w-full p-2 pl-4 pr-10 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer hover:bg-slate-100 transition"
                            >
                                <option value="Всі">Всі файли ({counts["Всі"]})</option>
                                {DOC_TYPES.map(type => (
                                    <option key={type} value={type}>
                                        {type} ({counts[type] || 0})
                                    </option>
                                ))}
                            </select>
                            <FaChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs"/>
                        </div>
                    </div>

                    {/* 2. СІТКА ФАЙЛІВ */}
                    <div>
                        {loading ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {Array.from({length: 8}).map((_, i) => (
                                    <div key={i} className="aspect-[4/5] bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 animate-pulse">
                                        <div className="flex-1 bg-slate-100 rounded-xl w-full"></div>
                                        <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                                    </div>
                                ))}
                            </div>
                        ) : filteredDocuments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center min-h-[400px] bg-white rounded-3xl border border-dashed border-slate-300 text-slate-400">
                                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                                    <FaRegFile size={30} className="opacity-50"/>
                                </div>
                                <p className="font-bold text-lg">Документів не знайдено</p>
                                <p className="text-sm">Спробуйте змінити фільтр або завантажте файл</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {filteredDocuments.map((doc) => (
                                        <DocumentCard 
                                            key={doc.id} 
                                            doc={doc} 
                                            onPreview={() => setPreviewUrl(doc.webViewLink)} 
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Preview Overlay */}
            <AnimatePresence>
                {previewUrl && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/90 p-4 flex flex-col backdrop-blur-md">
                        <div className="flex justify-between items-center text-white mb-4 max-w-7xl mx-auto w-full">
                            <h3 className="font-bold text-lg flex items-center gap-2"><FaEye/> Попередній перегляд</h3>
                            <button onClick={() => setPreviewUrl(null)} className="p-2 hover:bg-white/10 rounded-full transition"><FaTimes size={24}/></button>
                        </div>
                        <div className="flex-grow bg-white rounded-2xl overflow-hidden shadow-2xl max-w-7xl mx-auto w-full relative">
                            <iframe src={previewUrl.replace('/view', '/preview')} className="w-full h-full border-0" title="Preview"/>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50, x: '-50%' }} 
                        animate={{ opacity: 1, y: 0, x: '-50%' }} 
                        exit={{ opacity: 0, y: 20, x: '-50%' }} 
                        className={`fixed bottom-10 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-sm z-[90]
                            ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-slate-900 text-white'}
                        `}
                    >
                        {toast.type === 'error' ? <FaExclamationTriangle/> : <FaCheck/>}
                        {toast.msg}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// --- ВИПРАВЛЕНИЙ КОМПОНЕНТ КАРТКИ ---
const DocumentCard = ({ doc, onPreview }) => {
    const isImage = doc.mimeType?.includes('image');
    
    // ОСНОВНА ЗМІНА: Використовуємо проксі-адресу бекенда для завантаження прев'ю
    // Це дозволяє уникнути помилки 429 від Google Drive
    const thumbnail = isImage ? `${SERVER_URL}/thumb/${doc.id}` : null;

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-indigo-300 transition-all duration-300 flex flex-col relative aspect-[3/4]"
        >
            {/* Preview Area */}
            <div className="flex-1 bg-slate-50 relative overflow-hidden flex items-center justify-center p-4 cursor-pointer" onClick={onPreview}>
                {isImage && thumbnail ? (
                    <img 
                        src={thumbnail} 
                        alt={doc.name} 
                        className="w-full h-full object-cover absolute inset-0 group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                        // Якщо проксі не спрацює або файл битий, приховуємо картинку і показуємо іконку
                        onError={(e) => {
                            e.target.style.display = 'none'; 
                            // Додаємо клас, щоб показати fallback (якщо потрібно стилізувати окремо)
                            e.target.parentNode.setAttribute('data-error', 'true');
                        }}
                    />
                ) : (
                    <div className="transform group-hover:scale-110 transition-transform duration-300">
                        {getFileIcon(doc.mimeType)}
                    </div>
                )}
                
                {/* Fallback іконка: відображається, якщо це картинка, але img приховано (через помилку) */}
                {isImage && thumbnail && (
                   <div className="hidden [data-error='true'] & block absolute inset-0 flex items-center justify-center pointer-events-none">
                        {getFileIcon(doc.mimeType)}
                   </div>
                )}

                {/* Overlay on Hover */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-[2px]">
                    <button className="p-3 bg-white text-slate-900 rounded-full shadow-lg hover:scale-110 transition" title="Перегляд">
                        <FaEye/>
                    </button>
                    {doc.webContentLink && (
                        <a 
                            href={doc.webContentLink} 
                            onClick={(e) => e.stopPropagation()} 
                            className="p-3 bg-white text-emerald-600 rounded-full shadow-lg hover:scale-110 transition" 
                            title="Завантажити"
                        >
                            <FaDownload/>
                        </a>
                    )}
                </div>
            </div>

            {/* Info Area */}
            <div className="p-3 bg-white border-t border-slate-100 shrink-0">
                <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate leading-tight" title={doc.name}>{doc.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1 truncate">{doc.docType || 'Документ'}</p>
                    </div>
                    {isImage && <FaImage className="text-slate-300 text-xs shrink-0"/>}
                </div>
                <div className="mt-2 text-[10px] text-slate-400 font-medium">
                    {new Date(doc.createdTime).toLocaleDateString()}
                </div>
            </div>
        </motion.div>
    );
};