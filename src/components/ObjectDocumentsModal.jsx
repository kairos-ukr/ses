import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaCloudUploadAlt, FaFilePdf, FaFileImage, FaFileAlt, FaEye, FaTimes, FaDownload, FaCheck, FaExclamationTriangle } from "react-icons/fa";

// --- КОНФІГУРАЦІЯ ---
const SERVER_URL = 'http://prem-eu4.bot-hosting.net:20112'; // Твоя адреса

const DOC_TYPES = ["Комерційна пропозиція", "Технічний проєкт", "Фотозвіт", "Чек", "Накладна", "Акт", "Інше"];

export default function ObjectDocumentsModal({ project, onClose }) {
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploadFiles, setUploadFiles] = useState([]);
    const [docType, setDocType] = useState(DOC_TYPES[0]);
    const [isUploading, setIsUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [toast, setToast] = useState(null);

    // Завантаження списку при відкритті
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

    // Завантаження файлів
    const handleUpload = async (e) => {
        e.preventDefault();
        if (uploadFiles.length === 0) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('object_number', project.custom_id);
        formData.append('doc_type', docType);
        Array.from(uploadFiles).forEach((file) => formData.append('files', file));

        try {
            const response = await fetch(`${SERVER_URL}/upload/`, { method: 'POST', body: formData });
            const result = await response.json();

            if (result.status === 'success') {
                setToast({ type: 'success', msg: `Завантажено файлів: ${result.count}` });
                setUploadFiles([]);
                fetchDocuments(); // Оновити список
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

    const getIcon = (mimeType) => {
        if (mimeType.includes('pdf')) return <FaFilePdf className="text-red-500 text-xl"/>;
        if (mimeType.includes('image')) return <FaFileImage className="text-blue-500 text-xl"/>;
        return <FaFileAlt className="text-gray-500 text-xl"/>;
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-white/95 backdrop-blur-xl rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col border border-gray-200/50" onClick={e => e.stopPropagation()}>
                
                {/* Header */}
                <div className="p-4 sm:p-6 border-b flex justify-between items-start">
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Документи об'єкта</h2>
                        <p className="text-sm text-gray-500">{project.name} (#{project.custom_id})</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FaTimes size={20}/></button>
                </div>

                <div className="flex-grow overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Ліва колонка: Завантаження */}
                    <div className="lg:col-span-1">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <h4 className="font-bold text-slate-700 mb-3 text-sm uppercase">Новий файл</h4>
                            <form onSubmit={handleUpload} className="space-y-3">
                                <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full p-2 rounded-lg border text-sm">
                                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <input type="file" multiple onChange={(e) => setUploadFiles(e.target.files)} className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"/>
                                <button type="submit" disabled={isUploading || uploadFiles.length === 0} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center gap-2">
                                    {isUploading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <FaCloudUploadAlt/>} Завантажити
                                </button>
                            </form>
                            {toast && (
                                <div className={`mt-3 p-2 rounded text-xs flex items-center gap-2 ${toast.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                    {toast.type === 'error' ? <FaExclamationTriangle/> : <FaCheck/>} {toast.msg}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Права колонка: Список */}
                    <div className="lg:col-span-2 space-y-2">
                        {loading ? (
                             Array.from({length: 3}).map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse"/>)
                        ) : documents.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 text-sm">Немає документів</div>
                        ) : (
                            documents.map(doc => (
                                <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md transition">
                                    <div className="flex items-center gap-3 min-w-0">
                                        {getIcon(doc.mimeType)}
                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-800 text-sm truncate w-full">{doc.name}</p>
                                            <p className="text-xs text-slate-400">{new Date(doc.createdTime).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setPreviewUrl(doc.webViewLink)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded"><FaEye/></button>
                                        {doc.webContentLink && <a href={doc.webContentLink} className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded"><FaDownload/></a>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Preview Overlay */}
                {previewUrl && (
                    <div className="fixed inset-0 z-[70] bg-black/90 p-4 flex flex-col">
                        <button onClick={() => setPreviewUrl(null)} className="self-end text-white mb-2"><FaTimes size={24}/></button>
                        <iframe src={previewUrl.replace('/view', '/preview')} className="flex-grow bg-white rounded" title="Preview"/>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
}