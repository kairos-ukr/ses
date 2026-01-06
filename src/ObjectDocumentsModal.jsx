import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    FaCloudUploadAlt, FaFilePdf, FaFileImage, FaFileAlt, 
    FaEye, FaTimes, FaDownload, FaCheck, FaExclamationTriangle, FaTrash, FaRegFile, FaFolderOpen
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

// Helper for icons (винесено за межі компонента для продуктивності)
const getFileIcon = (mimeType) => {
    if (!mimeType) return <FaFileAlt className="text-gray-400 text-xl"/>;
    if (mimeType.includes('pdf')) return <FaFilePdf className="text-red-500 text-xl"/>;
    if (mimeType.includes('image')) return <FaFileImage className="text-blue-500 text-xl"/>;
    return <FaFileAlt className="text-gray-500 text-xl"/>;
};

export default function ObjectDocumentsModal({ project, onClose }) {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploadFiles, setUploadFiles] = useState([]); 
    const [docType, setDocType] = useState(DOC_TYPES[0]);
    const [customDocType, setCustomDocType] = useState(""); 
    
    const [isUploading, setIsUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false); // Для Drag & Drop
    const [previewUrl, setPreviewUrl] = useState(null);
    const [toast, setToast] = useState(null);
    
    const fileInputRef = useRef(null);

    // Завантаження списку
    const fetchDocuments = useCallback(async () => {
        if (!project) return;
        setLoading(true);
        try {
            const response = await fetch(`${SERVER_URL}/documents/${project.custom_id}`);
            const data = await response.json();
            if (data.status === 'error') throw new Error(data.message);
            setDocuments(data.documents || []);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [project]);

    useEffect(() => {
        fetchDocuments();
    }, [fetchDocuments]);

    // Обробка файлів (через інпут або Drag&Drop)
    const handleFiles = (files) => {
        if (files && files.length > 0) {
            const newFiles = Array.from(files);
            setUploadFiles(prev => [...prev, ...newFiles]);
        }
    };

    const onFileSelect = (e) => {
        handleFiles(e.target.files);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    // Drag & Drop handlers
    const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const removeFileFromQueue = (indexToRemove) => {
        setUploadFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (uploadFiles.length === 0) return;

        const finalDocType = docType === "Інше" ? customDocType.trim() : docType;

        if (!finalDocType) {
            setToast({ type: 'error', msg: "Вкажіть назву документа" });
            setTimeout(() => setToast(null), 3000);
            return;
        }

        setIsUploading(true);
        const formData = new FormData();
        formData.append('object_number', project.custom_id);
        formData.append('doc_type', finalDocType);
        uploadFiles.forEach((file) => formData.append('files', file));

        try {
            const response = await fetch(`${SERVER_URL}/upload/`, { method: 'POST', body: formData });
            const result = await response.json();

            if (result.status === 'success') {
                setToast({ type: 'success', msg: `Завантажено: ${result.count}` });
                setUploadFiles([]); 
                setCustomDocType(""); 
                if(docType === "Інше") setDocType(DOC_TYPES[0]); 
                fetchDocuments(); 
            } else {
                setToast({ type: 'error', msg: result.message });
            }
        } catch (error) {
            setToast({ type: 'error', msg: "Помилка з'єднання" });
        } finally {
            setIsUploading(false);
            setTimeout(() => setToast(null), 3000);
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            className="fixed inset-0 bg-black/50 backdrop-blur-none md:backdrop-blur-sm z-[60] flex items-center justify-center p-4" 
            onClick={onClose}
        >
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }} 
                animate={{ scale: 1, opacity: 1 }} 
                exit={{ scale: 0.95, opacity: 0 }} 
                // Optimized classes: bg-white for mobile, glass effect for desktop
                className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl flex flex-col border border-gray-200 md:bg-white/95 md:backdrop-blur-xl" 
                onClick={e => e.stopPropagation()}
            >
                
                {/* Header */}
                <div className="p-4 sm:p-6 border-b flex justify-between items-start bg-white/50 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
                            <FaFolderOpen className="text-indigo-500"/> Документи
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">{project.name} (#{project.custom_id})</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition"><FaTimes size={20}/></button>
                </div>

                <div className="flex-grow overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* LEFT COLUMN: UPLOAD */}
                    <div className="lg:col-span-1">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 sticky top-0">
                            <h4 className="font-bold text-slate-700 mb-3 text-xs uppercase tracking-wider flex items-center gap-2">
                                <FaCloudUploadAlt/> Завантаження
                            </h4>
                            
                            <form onSubmit={handleUpload} className="space-y-3">
                                {/* Doc Type Selector */}
                                <select 
                                    value={docType} 
                                    onChange={(e) => setDocType(e.target.value)} 
                                    className="w-full p-2.5 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                >
                                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>

                                {docType === "Інше" && (
                                    <motion.input 
                                        initial={{ opacity: 0, height: 0 }} 
                                        animate={{ opacity: 1, height: 'auto' }}
                                        type="text" 
                                        placeholder="Назва документа..." 
                                        value={customDocType}
                                        onChange={(e) => setCustomDocType(e.target.value)}
                                        className="w-full p-2.5 rounded-lg border border-indigo-300 bg-indigo-50/50 text-sm focus:bg-white outline-none"
                                        required
                                    />
                                )}

                                {/* Drop Zone */}
                                <div 
                                    className={`relative border-2 border-dashed rounded-xl p-4 transition-all text-center cursor-pointer ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-white'}`}
                                    onDragOver={onDragOver}
                                    onDragLeave={onDragLeave}
                                    onDrop={onDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <input 
                                        type="file" 
                                        multiple 
                                        ref={fileInputRef}
                                        onChange={onFileSelect} 
                                        className="hidden"
                                    />
                                    <FaCloudUploadAlt className={`mx-auto text-2xl mb-2 ${isDragging ? 'text-indigo-600' : 'text-gray-400'}`}/>
                                    <p className="text-xs text-gray-500 font-medium">Натисніть або перетягніть файли сюди</p>
                                </div>

                                {/* Queue List */}
                                <AnimatePresence>
                                    {uploadFiles.length > 0 && (
                                        <motion.ul initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white border rounded-lg divide-y max-h-32 overflow-y-auto text-xs shadow-inner">
                                            {uploadFiles.map((file, index) => (
                                                <motion.li 
                                                    key={`${file.name}-${index}`} 
                                                    initial={{ opacity: 0, x: -10 }} 
                                                    animate={{ opacity: 1, x: 0 }} 
                                                    exit={{ opacity: 0, x: 10 }}
                                                    className="p-2 flex justify-between items-center hover:bg-slate-50"
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <FaRegFile className="text-gray-400"/>
                                                        <span className="truncate text-slate-600 max-w-[150px]">{file.name}</span>
                                                    </div>
                                                    <button type="button" onClick={() => removeFileFromQueue(index)} className="text-red-400 hover:text-red-600 p-1"><FaTrash size={10}/></button>
                                                </motion.li>
                                            ))}
                                        </motion.ul>
                                    )}
                                </AnimatePresence>

                                {/* Upload Button */}
                                <button 
                                    type="submit" 
                                    disabled={isUploading || uploadFiles.length === 0} 
                                    className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2 transition-all active:scale-95"
                                >
                                    {isUploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <FaCloudUploadAlt/>} 
                                    {isUploading ? 'Завантаження...' : `Завантажити (${uploadFiles.length})`}
                                </button>
                            </form>

                            {/* Toast */}
                            <AnimatePresence>
                                {toast && (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 font-medium ${toast.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                        {toast.type === 'error' ? <FaExclamationTriangle/> : <FaCheck/>} {toast.msg}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: LIST */}
                    <div className="lg:col-span-2">
                        <h4 className="font-bold text-slate-700 mb-3 text-xs uppercase tracking-wider pl-1">Збережені файли</h4>
                        <div className="space-y-2">
                            {loading ? (
                                Array.from({length: 3}).map((_, i) => <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse border border-slate-100"/>)
                            ) : documents.length === 0 ? (
                                <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                                    <FaFolderOpen className="mx-auto text-4xl text-slate-200 mb-2"/>
                                    <p className="text-slate-400 text-sm">Папка порожня</p>
                                </div>
                            ) : (
                                documents.map(doc => (
                                    <motion.div 
                                        layout
                                        key={doc.id} 
                                        className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:shadow-md hover:border-indigo-200 transition group"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-lg flex-shrink-0">
                                                {getFileIcon(doc.mimeType)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-gray-800 text-sm truncate w-full pr-4" title={doc.name}>{doc.name}</p>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mt-0.5">
                                                    <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-medium">{doc.docType || 'Документ'}</span>
                                                    <span>• {new Date(doc.createdTime).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 pl-2">
                                            <button onClick={() => setPreviewUrl(doc.webViewLink)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Перегляд"><FaEye/></button>
                                            {doc.webContentLink && <a href={doc.webContentLink} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition" title="Завантажити"><FaDownload/></a>}
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Preview Overlay */}
                <AnimatePresence>
                    {previewUrl && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/90 p-2 sm:p-6 flex flex-col backdrop-blur-sm">
                            <div className="flex justify-between items-center text-white mb-4 px-2">
                                <h3 className="font-medium text-lg">Попередній перегляд</h3>
                                <button onClick={() => setPreviewUrl(null)} className="p-2 hover:bg-white/10 rounded-full transition"><FaTimes size={24}/></button>
                            </div>
                            <div className="flex-grow bg-white rounded-xl overflow-hidden shadow-2xl">
                                <iframe src={previewUrl.replace('/view', '/preview')} className="w-full h-full border-0" title="Preview"/>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}