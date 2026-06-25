import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams } from "react-router-dom"; 
import { motion, AnimatePresence } from "framer-motion";
import { 
    FaCloudUploadAlt, FaFilePdf, FaFileImage, FaFileAlt, 
    FaEye, FaTimes, FaDownload, FaCheck, FaExclamationTriangle, 
    FaTrash, FaRegFile, FaFilter, FaFileExcel, FaFileWord, 
    FaSpinner, FaImage, FaChevronDown, FaHdd
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
const getFileIcon = (mimeType, fileName = "") => {
    const isPdf = mimeType?.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    const isImage = mimeType?.includes('image') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
    const isExcel = mimeType?.includes('sheet') || mimeType?.includes('excel') || /\.(xls|xlsx|csv)$/i.test(fileName);
    const isWord = mimeType?.includes('word') || mimeType?.includes('document') || /\.(doc|docx)$/i.test(fileName);

    if (isPdf) return <FaFilePdf className="text-red-500"/>;
    if (isImage) return <FaFileImage className="text-blue-500"/>;
    if (isExcel) return <FaFileExcel className="text-green-600"/>;
    if (isWord) return <FaFileWord className="text-blue-700"/>;
    return <FaFileAlt className="text-slate-400"/>;
};

// Форматування розміру файлу
const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
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
    const [uploadProgress, setUploadProgress] = useState(0); // НОВЕ: Стан прогресу
    const [isDragging, setIsDragging] = useState(false);
    const [typeError, setTypeError] = useState(false);
    
    // View State
    const [previewUrl, setPreviewUrl] = useState(null);
    const [activeFilter, setActiveFilter] = useState("Всі");
    const [toast, setToast] = useState(null);
    
    const fileInputRef = useRef(null);

    const fetchDocuments = useCallback(async () => {
        if (!projectId) return;
        const controller = new AbortController();
        setLoading(true);
        try {
            const response = await fetch(`${SERVER_URL}/documents/${projectId}`, { signal: controller.signal });
            const data = await response.json();
            if (data.status === 'error') throw new Error(data.message);
            setDocuments(data.documents || []);
        } catch (error) {
            if (error.name !== 'AbortError') {
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

    const filteredDocuments = useMemo(() => {
        if (activeFilter === "Всі") return documents;
        return documents.filter(doc => (doc.docType || "Інше") === activeFilter);
    }, [documents, activeFilter]);

    const counts = useMemo(() => {
        const stats = { "Всі": documents.length };
        DOC_TYPES.forEach(type => stats[type] = 0);
        documents.forEach(doc => {
            const t = doc.docType || "Інше";
            stats[t] = (stats[t] || 0) + 1;
        });
        return stats;
    }, [documents]);

    const handleFiles = (files) => {
        if (files && files.length > 0) {
            setUploadFiles(prev => [...prev, ...Array.from(files)]);
        }
    };

    // НОВЕ: Оптимізована функція завантаження з реальним прогресом (XMLHttpRequest)
    const handleUpload = (e) => {
        e.preventDefault();
        
        if (!docType) {
            setTypeError(true);
            showToast('error', "Оберіть тип документа");
            return;
        }

        if (uploadFiles.length === 0) return;

        const finalDocType = docType === "Інше" ? customDocType.trim() : docType;
        if (!finalDocType) return showToast('error', "Вкажіть назву типу документа");

        setIsUploading(true);
        setUploadProgress(0);

        const formData = new FormData();
        formData.append('object_number', projectId);
        formData.append('doc_type', finalDocType);
        uploadFiles.forEach((file) => formData.append('files', file));

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${SERVER_URL}/upload/`, true);

        // Відстеження прогресу
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                setUploadProgress(percentComplete);
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const result = JSON.parse(xhr.responseText);
                    if (result.status === 'success') {
                        showToast('success', `Завантажено файлів: ${result.count}`);
                        setUploadFiles([]); 
                        setCustomDocType("");
                        setDocType(""); 
                        setTypeError(false);
                        fetchDocuments(); 
                    } else {
                        showToast('error', result.message || "Сталася помилка");
                    }
                } catch (err) {
                    showToast('error', "Помилка обробки відповіді сервера");
                }
            } else {
                showToast('error', `Помилка сервера: ${xhr.status}`);
            }
            setIsUploading(false);
            setUploadProgress(0);
        };

        xhr.onerror = () => {
            showToast('error', "Помилка з'єднання з сервером");
            setIsUploading(false);
            setUploadProgress(0);
        };

        xhr.send(formData);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col p-4 md:p-6 lg:p-8">
            <div className="max-w-[1600px] mx-auto w-full grid grid-cols-1 xl:grid-cols-4 gap-8 items-start">
                
                {/* --- ЛІВА КОЛОНКА (ЗАВАНТАЖЕННЯ) --- */}
                <div className="xl:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 sticky top-6">
                        <h3 className="font-extrabold text-slate-800 mb-5 flex items-center gap-2 text-sm uppercase tracking-wider">
                            <FaCloudUploadAlt className="text-indigo-500 text-lg"/> Новий документ
                        </h3>
                        
                        <form onSubmit={handleUpload} className="space-y-5">
                            
                            {/* Type Selector */}
                            <div className="relative">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                    Категорія <span className="text-red-500">*</span>
                                </label>
                                <div className="relative group">
                                    <select 
                                        value={docType} 
                                        onChange={(e) => { setDocType(e.target.value); setTypeError(false); }} 
                                        className={`w-full p-3 pr-10 rounded-xl border text-sm focus:ring-2 outline-none transition font-semibold text-slate-700 appearance-none cursor-pointer
                                            ${typeError ? 'border-red-400 bg-red-50 focus:ring-red-200' : 'border-slate-200 bg-slate-50 focus:ring-indigo-500 focus:bg-white hover:border-indigo-300'}
                                        `}
                                    >
                                        <option value="" disabled>-- Оберіть категорію --</option>
                                        {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                    <FaChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-xs group-hover:text-indigo-500 transition"/>
                                </div>
                            </div>

                            {/* Custom Type Input */}
                            <AnimatePresence>
                                {docType === "Інше" && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                                        <input 
                                            type="text" placeholder="Своя назва..." value={customDocType}
                                            onChange={(e) => setCustomDocType(e.target.value)}
                                            className="w-full p-3 rounded-xl border border-indigo-200 bg-indigo-50 text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium mt-1"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Drop Zone */}
                            <div 
                                className={`relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 text-center cursor-pointer group flex flex-col items-center justify-center
                                    ${isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.02]' : 'border-slate-200 bg-slate-50/50 hover:border-indigo-400 hover:bg-slate-50'}
                                `}
                                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                                onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input type="file" multiple ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} className="hidden" />
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-all duration-300 ${isDragging ? 'bg-indigo-600 text-white scale-110 shadow-lg shadow-indigo-200' : 'bg-indigo-100 text-indigo-600 group-hover:bg-indigo-200 group-hover:scale-110'}`}>
                                    <FaCloudUploadAlt size={24}/>
                                </div>
                                <p className="text-sm font-extrabold text-slate-700 mb-1">Натисніть або перетягніть</p>
                                <p className="text-[10px] text-slate-400 font-medium">Будь-які формати файлів</p>
                            </div>

                            {/* Queue List */}
                            <AnimatePresence>
                                {uploadFiles.length > 0 && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                        <div className="bg-white rounded-xl border border-slate-200 max-h-48 overflow-y-auto custom-scrollbar p-1.5 space-y-1 shadow-inner bg-slate-50/50">
                                            {uploadFiles.map((file, i) => (
                                                <div key={i} className="flex justify-between items-center text-xs p-2 bg-white rounded-lg border border-slate-100 shadow-sm hover:border-indigo-100 transition">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <span className="text-lg opacity-80 shrink-0">{getFileIcon(file.type, file.name)}</span>
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="truncate font-semibold text-slate-700">{file.name}</span>
                                                            <span className="text-[9px] text-slate-400 flex items-center gap-1"><FaHdd/> {formatBytes(file.size)}</span>
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => setUploadFiles(prev => prev.filter((_, idx) => idx !== i))} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition ml-2 shrink-0"><FaTrash size={12}/></button>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Реальний Прогрес-Бар */}
                            {isUploading && (
                                <div className="w-full bg-slate-100 rounded-full h-2.5 mb-4 overflow-hidden border border-slate-200 relative">
                                    <motion.div 
                                        className="bg-indigo-600 h-2.5 rounded-full relative"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${uploadProgress}%` }}
                                        transition={{ ease: "linear", duration: 0.2 }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_1s_infinite] rounded-full"></div>
                                    </motion.div>
                                    <p className="text-center text-[9px] font-bold text-indigo-700 mt-1">{uploadProgress}%</p>
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={isUploading || uploadFiles.length === 0} 
                                className={`w-full py-3.5 rounded-xl text-sm font-extrabold shadow-lg flex justify-center items-center gap-2 transition-all duration-300
                                    ${isUploading || uploadFiles.length === 0 
                                        ? 'bg-slate-100 text-slate-400 shadow-none cursor-not-allowed' 
                                        : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200 active:scale-[0.98]'
                                    }
                                `}
                            >
                                {isUploading ? <FaSpinner className="animate-spin text-indigo-500" size={16}/> : <FaCloudUploadAlt size={16}/>} 
                                {isUploading ? 'Відправка на сервер...' : 'Завантажити файли'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* --- ПРАВА КОЛОНКА (ФІЛЬТРИ + СІТКА) --- */}
                <div className="xl:col-span-3 flex flex-col gap-6">
                    
                    {/* НОВИЙ ФІЛЬТР (CHIPS - горизонтальна стрічка) */}
                    <div className="bg-white p-2 sm:p-3 rounded-2xl shadow-sm border border-slate-200">
                        <div className="flex overflow-x-auto gap-2 no-scrollbar px-1 py-1 scroll-smooth">
                            {["Всі", ...DOC_TYPES].map(type => {
                                const count = counts[type] || 0;
                                const isActive = activeFilter === type;
                                // Якщо фільтр не "Всі" і пустий - робимо його напівпрозорим
                                if (type !== "Всі" && count === 0) return null; // Опціонально: можна ховати порожні категорії

                                return (
                                    <button
                                        key={type}
                                        onClick={() => setActiveFilter(type)}
                                        className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border
                                            ${isActive 
                                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200/50' 
                                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-indigo-600'}
                                        `}
                                    >
                                        {type}
                                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isActive ? 'bg-white/20' : 'bg-white text-slate-400 border border-slate-200'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* СІТКА ФАЙЛІВ */}
                    <div className="bg-slate-50 flex-1">
                        {loading ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                {Array.from({length: 10}).map((_, i) => (
                                    <div key={i} className="aspect-[3/4] bg-white rounded-2xl border border-slate-200 p-4 flex flex-col gap-3 animate-pulse shadow-sm">
                                        <div className="flex-1 bg-slate-100/50 rounded-xl w-full flex items-center justify-center"><FaImage className="text-slate-200 text-3xl"/></div>
                                        <div className="h-3 bg-slate-100 rounded-full w-3/4"></div>
                                        <div className="h-2 bg-slate-50 rounded-full w-1/2"></div>
                                    </div>
                                ))}
                            </div>
                        ) : filteredDocuments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center min-h-[50vh] bg-white rounded-3xl border border-dashed border-slate-200 text-slate-400">
                                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-4 shadow-inner">
                                    <FaRegFile size={36} className="text-slate-300"/>
                                </div>
                                <p className="font-extrabold text-lg text-slate-700 mb-1">Папка порожня</p>
                                <p className="text-sm font-medium">Спробуйте змінити фільтр або завантажте перший файл.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-5">
                                <AnimatePresence mode="popLayout">
                                    {filteredDocuments.map((doc) => (
                                        <DocumentCard key={doc.id} doc={doc} onPreview={() => setPreviewUrl(doc.webViewLink)} />
                                    ))}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Preview Overlay (Модалка) */}
            <AnimatePresence>
                {previewUrl && (
                    <motion.div initial={{ opacity: 0, backdropFilter: "blur(0px)" }} animate={{ opacity: 1, backdropFilter: "blur(8px)" }} exit={{ opacity: 0, backdropFilter: "blur(0px)" }} className="fixed inset-0 z-[100] bg-slate-900/90 p-4 sm:p-8 flex flex-col">
                        <div className="flex justify-between items-center text-white mb-4 max-w-7xl mx-auto w-full">
                            <h3 className="font-bold text-lg flex items-center gap-2"><FaEye className="text-indigo-400"/> Попередній перегляд</h3>
                            <button onClick={() => setPreviewUrl(null)} className="p-2.5 bg-white/10 hover:bg-red-500 hover:text-white rounded-full transition-colors"><FaTimes size={20}/></button>
                        </div>
                        <div className="flex-grow bg-slate-50 rounded-2xl overflow-hidden shadow-2xl shadow-black/50 max-w-7xl mx-auto w-full relative flex items-center justify-center border border-slate-700">
                            <iframe src={previewUrl.replace('/view', '/preview')} className="w-full h-full border-0 absolute inset-0 z-10" title="Preview"/>
                            {/* Фоновий лоадер поки iframe вантажиться */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 z-0">
                                <FaSpinner className="animate-spin text-4xl mb-3 text-indigo-500"/>
                                <span className="text-sm font-bold">Завантаження документа...</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50, x: '-50%', scale: 0.9 }} 
                        animate={{ opacity: 1, y: 0, x: '-50%', scale: 1 }} 
                        exit={{ opacity: 0, y: 20, x: '-50%', scale: 0.9 }} 
                        className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-sm z-[150]
                            ${toast.type === 'error' ? 'bg-red-500 text-white border border-red-400' : 'bg-slate-900 text-white border border-slate-700'}
                        `}
                    >
                        {toast.type === 'error' ? <FaExclamationTriangle size={18} className="text-red-200"/> : <FaCheck size={18} className="text-emerald-400"/>}
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
    const thumbnail = isImage ? `${SERVER_URL}/thumb/${doc.id}` : null;

    return (
        <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="group bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-xl hover:shadow-indigo-100 hover:border-indigo-300 transition-all duration-300 flex flex-col relative aspect-[3/4] cursor-pointer"
            onClick={onPreview}
        >
            {/* Preview Area */}
            <div className="flex-1 bg-slate-50 relative overflow-hidden flex items-center justify-center p-6">
                {isImage && thumbnail ? (
                    <img 
                        src={thumbnail} 
                        alt={doc.name} 
                        className="w-full h-full object-cover absolute inset-0 group-hover:scale-110 transition-transform duration-700 ease-in-out"
                        loading="lazy"
                        onError={(e) => {
                            e.target.style.display = 'none'; 
                            e.target.parentNode.setAttribute('data-error', 'true');
                        }}
                    />
                ) : (
                    <div className="transform group-hover:scale-125 transition-transform duration-500 drop-shadow-md text-6xl">
                        {getFileIcon(doc.mimeType, doc.name)}
                    </div>
                )}
                
                {isImage && thumbnail && (
                   <div className="hidden [data-error='true'] & block absolute inset-0 flex items-center justify-center pointer-events-none bg-slate-50 text-5xl drop-shadow-sm">
                        {getFileIcon(doc.mimeType, doc.name)}
                   </div>
                )}

                {/* Overlay on Hover */}
                <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3 backdrop-blur-[2px]">
                    <button className="w-12 h-12 flex items-center justify-center bg-white text-slate-900 rounded-full shadow-lg hover:scale-110 active:scale-95 transition-all" title="Перегляд">
                        <FaEye size={20}/>
                    </button>
                    {doc.webContentLink && (
                        <a 
                            href={doc.webContentLink} 
                            onClick={(e) => e.stopPropagation()} 
                            className="w-12 h-12 flex items-center justify-center bg-indigo-600 text-white rounded-full shadow-lg hover:scale-110 hover:bg-indigo-700 active:scale-95 transition-all" 
                            title="Завантажити"
                        >
                            <FaDownload size={18}/>
                        </a>
                    )}
                </div>
            </div>

            {/* Info Area */}
            <div className="p-4 bg-white border-t border-slate-100 shrink-0 group-hover:bg-indigo-50/10 transition-colors">
                <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-800 truncate leading-tight group-hover:text-indigo-700 transition-colors" title={doc.name}>
                            {doc.name}
                        </p>
                        <p className="text-[10px] font-medium text-slate-400 mt-1.5 truncate uppercase tracking-wide">
                            {doc.docType || 'Документ'}
                        </p>
                    </div>
                    {isImage ? (
                        <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                            <FaImage className="text-blue-500 text-[10px]"/>
                        </div>
                    ) : (
                        <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <FaFileAlt className="text-slate-400 text-[10px]"/>
                        </div>
                    )}
                </div>
                <div className="mt-3 text-[10px] font-bold text-slate-300 border-t border-slate-50 pt-2">
                    {new Date(doc.createdTime).toLocaleDateString('uk-UA')}
                </div>
            </div>
        </motion.div>
    );
};