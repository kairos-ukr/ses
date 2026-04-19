import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCloudUploadAlt, FaSearch, FaFilePdf, FaFileImage, FaFileAlt, FaFilter,
  FaDownload, FaEye, FaTimes, FaBuilding, FaFolderOpen, FaCheck, FaExclamationTriangle, FaTrash
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";

import Layout from "./Layout";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthProvider";

// --- КОНФІГУРАЦІЯ ---
const SERVER_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev'; 

const DOC_TYPES = [
    "Комерційна пропозиція",
    "Технічний проєкт",
    "Фото об'єкта",
    "3D-візуалізація",
    "Фотозвіт",
    "Чек",
    "Накладна",
    "Акт",
    "Інше"
];

// --- COMPONENTS ---

const Toast = memo(({ message, type, isVisible, onClose }) => {
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(onClose, 4000);
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div initial={{ opacity: 0, y: -20, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }} className="fixed top-20 right-5 z-[200]">
                    <div className={`px-4 py-3 rounded-xl shadow-xl flex items-center gap-3 text-white font-medium ${type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
                        {type === 'error' ? <FaExclamationTriangle/> : <FaCheck/>}
                        <span>{message}</span>
                        <button onClick={onClose}><FaTimes/></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

// --- НОВЕ КРАСИВЕ ВІКНО ПІДТВЕРДЖЕННЯ ---
const ConfirmationModal = ({ isOpen, onClose, onConfirm, fileName, isDeleting }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }} 
                        animate={{ scale: 1, opacity: 1 }} 
                        exit={{ scale: 0.95, opacity: 0 }} 
                        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-6 text-center">
                            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 mb-4">
                                <FaTrash className="h-6 w-6 text-red-600" />
                            </div>
                            <h3 className="text-lg leading-6 font-bold text-gray-900 mb-2">Видалити документ?</h3>
                            <p className="text-sm text-gray-500">
                                Ви збираєтесь безповоротно видалити файл <br/>
                                <span className="font-semibold text-gray-800">"{fileName}"</span> <br/>
                                з Google Диску. Цю дію неможливо скасувати.
                            </p>
                        </div>
                        <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-2">
                            <button 
                                type="button" 
                                disabled={isDeleting}
                                className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                                onClick={onConfirm}
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Видалення...
                                    </>
                                ) : (
                                    "Так, видалити"
                                )}
                            </button>
                            <button 
                                type="button" 
                                disabled={isDeleting}
                                className="mt-3 w-full inline-flex justify-center rounded-xl border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                                onClick={onClose}
                            >
                                Скасувати
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const DocumentCard = memo(({ doc, onPreview, onDeleteClick, canDelete }) => {
    const getIcon = (mimeType) => {
        if (mimeType.includes('pdf')) return <FaFilePdf className="text-red-500 text-3xl"/>;
        if (mimeType.includes('image')) return <FaFileImage className="text-blue-500 text-3xl"/>;
        return <FaFileAlt className="text-gray-500 text-3xl"/>;
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('uk-UA', {
            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl p-4 shadow-sm border border-slate-200 hover:shadow-md transition-all flex items-center gap-4 group"
        >
            <div className="p-3 bg-slate-50 rounded-lg group-hover:bg-slate-100 transition-colors">
                {getIcon(doc.mimeType)}
            </div>
            <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-slate-800 truncate" title={doc.name}>{doc.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{formatDate(doc.createdTime)}</p>
            </div>
            <div className="flex gap-2">
                <button 
                    onClick={() => onPreview(doc.webViewLink)} 
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    title="Переглянути"
                >
                    <FaEye />
                </button>
                {doc.webContentLink && (
                    <a 
                        href={doc.webContentLink} 
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Скачати"
                    >
                        <FaDownload />
                    </a>
                )}
                
                {canDelete && (
                    <button 
                        onClick={() => onDeleteClick(doc)} // Викликаємо відкриття модалки
                        className="p-2 text-red-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Видалити з Google Drive"
                    >
                        <FaTrash />
                    </button>
                )}
            </div>
        </motion.div>
    );
});

export default function DocumentsPage() {
    const fileInputRef = useRef(null);
    const { role } = useAuth();
    
    // Права на видалення
    const canDelete = ['admin', 'super_admin', 'office'].includes(role);
    
    // --- STATE ---
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [selectedObject, setSelectedObject] = useState(null);
    const [isSearching, setIsSearching] = useState(false);

    const [documents, setDocuments] = useState([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [docFilter, setDocFilter] = useState("Всі");

    const [uploadFiles, setUploadFiles] = useState([]); 
    const [docType, setDocType] = useState(DOC_TYPES[0]);
    const [customDocType, setCustomDocType] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const [previewUrl, setPreviewUrl] = useState(null);
    const [notification, setNotification] = useState({ isVisible: false, message: '', type: 'success' });
    const [showFilters, setShowFilters] = useState(false);

    // Стан для модального вікна видалення
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, doc: null, isDeleting: false });

    // --- SEARCH ---
    useEffect(() => {
        const searchObjects = async () => {
            if (!searchTerm || searchTerm.length < 2) {
                setSearchResults([]);
                return;
            }
            setIsSearching(true);
            try {
                let query = supabase.from('installations')
                    .select('custom_id, name, client:clients(name)')
                    .limit(5);

                if (/^\d+$/.test(searchTerm)) {
                    query = query.eq('custom_id', parseInt(searchTerm));
                } else {
                    query = query.ilike('name', `%${searchTerm}%`);
                }

                const { data } = await query;
                setSearchResults(data || []);
            } catch (error) {
                console.error(error);
            } finally {
                setIsSearching(false);
            }
        };

        const timer = setTimeout(searchObjects, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const fetchDocuments = useCallback(async (customId) => {
        setLoadingDocs(true);
        try {
            const response = await fetch(`${SERVER_URL}/documents/${customId}`);
            if (!response.ok) throw new Error("Server error");
            const data = await response.json();
            if (data.status === 'error') throw new Error(data.message);
            setDocuments(data.documents || []);
        } catch (error) {
            console.error("Error fetching docs:", error);
            setDocuments([]);
        } finally {
            setLoadingDocs(false);
        }
    }, []);

    const handleSelectObject = (obj) => {
        setSelectedObject(obj);
        setSearchTerm("");
        setSearchResults([]);
        fetchDocuments(obj.custom_id);
    };

    // --- FILE HANDLERS ---
    const handleFileChange = (e) => {
        const selected = Array.from(e.target.files);
        setUploadFiles(prev => [...prev, ...selected]);
        if (fileInputRef.current) fileInputRef.current.value = ""; 
    };

    const removeFile = (indexToRemove) => {
        setUploadFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!selectedObject) return showToast("Оберіть об'єкт!", "error");
        if (uploadFiles.length === 0) return showToast("Виберіть файли!", "error");

        const finalDocType = docType === "Інше" ? customDocType : docType;
        if (!finalDocType) return showToast("Вкажіть тип документа!", "error");

        setIsUploading(true);
        const formData = new FormData();
        formData.append('object_number', selectedObject.custom_id);
        formData.append('doc_type', finalDocType);
        
        uploadFiles.forEach((file) => {
            formData.append('files', file);
        });

        try {
            const response = await fetch(`${SERVER_URL}/upload/`, {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();

            if (result.status === 'success') {
                showToast(`Завантажено файлів: ${result.count}`, "success");
                setUploadFiles([]);
                setCustomDocType("");
                fetchDocuments(selectedObject.custom_id);
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            showToast("Помилка: " + error.message, "error");
        } finally {
            setIsUploading(false);
        }
    };

    // --- ЛОГІКА ВИДАЛЕННЯ ---
    
    // 1. Відкрити модалку
    const openDeleteModal = (doc) => {
        setDeleteModal({ isOpen: true, doc: doc, isDeleting: false });
    };

    // 2. Закрити модалку
    const closeDeleteModal = () => {
        setDeleteModal({ isOpen: false, doc: null, isDeleting: false });
    };

    // 3. Виконати видалення
    const confirmDeleteDocument = async () => {
        const doc = deleteModal.doc;
        if (!doc) return;

        setDeleteModal(prev => ({ ...prev, isDeleting: true }));

        try {
            const response = await fetch(`${SERVER_URL}/delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ file_id: doc.id })
            });

            const result = await response.json();

            if (result.status === 'success' || response.ok) {
                showToast("Файл успішно видалено з Google Drive", "success");
                setDocuments(prev => prev.filter(d => d.id !== doc.id));
                closeDeleteModal(); // Закриваємо модалку при успіху
            } else {
                throw new Error(result.message || "Помилка сервера при видаленні");
            }
        } catch (error) {
            console.error("Delete failed:", error);
            showToast("Не вдалося видалити файл: " + error.message, "error");
            // Не закриваємо модалку, щоб юзер бачив, що сталась помилка, або просто скидаємо стан завантаження
            setDeleteModal(prev => ({ ...prev, isDeleting: false }));
        }
    };

    const showToast = (message, type) => {
        setNotification({ isVisible: true, message, type });
    };

    const filteredDocuments = documents.filter(doc => {
        if (docFilter === "Всі") return true;
        return doc.name.startsWith(docFilter);
    });

    return (
        <Layout>
            <div className="p-4 sm:p-8 space-y-6 max-w-[1600px] mx-auto pb-safe min-h-[calc(100dvh-80px)] flex flex-col">
                <Toast {...notification} onClose={() => setNotification(prev => ({ ...prev, isVisible: false }))} />
                
                {/* МОДАЛЬНЕ ВІКНО ПІДТВЕРДЖЕННЯ */}
                <ConfirmationModal 
                    isOpen={deleteModal.isOpen} 
                    onClose={closeDeleteModal} 
                    onConfirm={confirmDeleteDocument} 
                    fileName={deleteModal.doc?.name}
                    isDeleting={deleteModal.isDeleting}
                />

                {/* HEADER */}
                <div className="flex flex-col gap-4 flex-none">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                            <FaFolderOpen className="text-white text-lg" />
                        </div>
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Документи</h1>
                            <p className="text-slate-500 text-sm">Керування файлами об'єктів</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                    {/* LEFT COLUMN: Search & Upload */}
                    <div className="lg:col-span-1 space-y-6 flex flex-col">
                        
                        {/* 1. Пошук */}
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 relative z-30">
                            <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wide">1. Пошук об'єкта</h3>
                            <div className="relative">
                                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="Назва або ID..." 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition outline-none text-sm"
                                />
                                {isSearching && <div className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                            </div>

                            <AnimatePresence>
                                {searchResults.length > 0 && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                        className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-60 overflow-y-auto z-50 mx-5"
                                    >
                                        {searchResults.map(obj => (
                                            <button 
                                                key={obj.custom_id} 
                                                onClick={() => handleSelectObject(obj)}
                                                className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors"
                                            >
                                                <div className="font-semibold text-slate-800 text-sm">{obj.name}</div>
                                                <div className="text-xs text-slate-500 flex justify-between mt-1">
                                                    <span>ID: {obj.custom_id}</span>
                                                    <span>{obj.client?.name}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {selectedObject && (
                                <motion.div 
                                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                    className="mt-3 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between"
                                >
                                    <div>
                                        <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wide">Обрано</div>
                                        <div className="font-bold text-slate-800 text-sm">{selectedObject.name}</div>
                                    </div>
                                    <button onClick={() => {setSelectedObject(null); setDocuments([]);}} className="p-2 text-slate-400 hover:text-red-500"><FaTimes/></button>
                                </motion.div>
                            )}
                        </div>

                        {/* 2. Завантаження */}
                        <div className={`bg-white rounded-2xl p-5 shadow-sm border border-slate-200 transition-all flex-1 ${!selectedObject ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                            <h3 className="font-bold text-slate-800 mb-3 text-sm uppercase tracking-wide">2. Завантаження</h3>
                            <form onSubmit={handleUpload} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Тип документа</label>
                                    <select 
                                        value={docType} 
                                        onChange={(e) => setDocType(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                    >
                                        {DOC_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                                    </select>
                                    
                                    {docType === "Інше" && (
                                        <motion.input 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            type="text"
                                            placeholder="Введіть тип документа..."
                                            value={customDocType}
                                            onChange={(e) => setCustomDocType(e.target.value)}
                                            className="w-full mt-2 px-4 py-2 bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        />
                                    )}
                                </div>
                                
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1.5 ml-1">Файли</label>
                                    <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:bg-slate-50 hover:border-indigo-400 transition-colors bg-slate-50/50">
                                        <div className="flex flex-col items-center justify-center">
                                            <FaCloudUploadAlt className="w-6 h-6 text-slate-400 mb-1" />
                                            <p className="text-xs text-slate-500">Додати файли</p>
                                        </div>
                                        <input 
                                            ref={fileInputRef}
                                            type="file" 
                                            multiple 
                                            className="hidden" 
                                            onChange={handleFileChange} 
                                        />
                                    </label>
                                </div>

                                {/* Список обраних файлів */}
                                {uploadFiles.length > 0 && (
                                    <div className="max-h-32 overflow-y-auto space-y-2 custom-scrollbar pr-1">
                                        {uploadFiles.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                                                <span className="truncate flex-1 mr-2 text-slate-700">{file.name}</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => removeFile(idx)}
                                                    className="text-red-400 hover:text-red-600 p-1"
                                                >
                                                    <FaTrash />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <button 
                                    type="submit" 
                                    disabled={isUploading || uploadFiles.length === 0}
                                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex justify-center items-center gap-2 hover:shadow-xl transition-all active:scale-95"
                                >
                                    {isUploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Завантажити"}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Document List */}
                    <div className="lg:col-span-2 lg:h-full lg:min-h-[500px] h-auto">
                         <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 lg:h-full h-auto flex flex-col">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 border-b border-slate-100 pb-4 flex-none">
                                <div>
                                    <h3 className="font-bold text-slate-800 text-lg">Архів документів</h3>
                                    <p className="text-sm text-slate-500">
                                        {selectedObject ? `Файли для "${selectedObject.name}"` : "Оберіть об'єкт зліва"}
                                    </p>
                                </div>
                                
                                {selectedObject && (
                                    <div className="relative z-20">
                                        <button 
                                            onClick={() => setShowFilters(!showFilters)} 
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${showFilters ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                        >
                                            <FaFilter /> Фільтр {docFilter !== "Всі" && `(${docFilter.slice(0,5)}...)`}
                                        </button>
                                        <AnimatePresence>
                                            {showFilters && (
                                                <motion.div 
                                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                    className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden"
                                                >
                                                    <button onClick={() => {setDocFilter("Всі"); setShowFilters(false)}} className="w-full text-left px-4 py-3 hover:bg-indigo-50 text-sm font-medium border-b border-slate-50">Всі типи</button>
                                                    {DOC_TYPES.map(type => (
                                                        <button key={type} onClick={() => {setDocFilter(type); setShowFilters(false)}} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm text-slate-700">{type}</button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                )}
                            </div>

                            {/* LIST CONTENT */}
                            <div className="lg:flex-1 lg:overflow-y-auto lg:pr-1 custom-scrollbar">
                                {!selectedObject ? (
                                    <div className="h-64 lg:h-full flex flex-col items-center justify-center text-slate-400">
                                        <FaBuilding className="text-6xl mb-4 opacity-10" />
                                        <p>Оберіть об'єкт для перегляду документів</p>
                                    </div>
                                ) : loadingDocs ? (
                                    <div className="space-y-4">
                                        {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse"></div>)}
                                    </div>
                                ) : filteredDocuments.length === 0 ? (
                                    <div className="h-64 lg:h-full flex flex-col items-center justify-center text-slate-400 py-10">
                                        <FaFolderOpen className="text-5xl mb-3 opacity-10" />
                                        <p>Файлів не знайдено</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3">
                                        {filteredDocuments.map(doc => (
                                            <DocumentCard 
                                                key={doc.id} 
                                                doc={doc} 
                                                onPreview={setPreviewUrl} 
                                                onDeleteClick={openDeleteModal} // Відкриваємо модалку замість прямого видалення
                                                canDelete={canDelete}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* PREVIEW MODAL */}
                <AnimatePresence>
                    {previewUrl && (
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/90 z-[300] flex flex-col p-4"
                            onClick={() => setPreviewUrl(null)}
                        >
                            <div className="flex justify-end mb-4">
                                <button className="text-white/70 hover:text-white p-2 bg-white/10 rounded-full transition-colors"><FaTimes className="text-2xl"/></button>
                            </div>
                            <div className="flex-1 bg-white rounded-lg overflow-hidden relative" onClick={e => e.stopPropagation()}>
                                <iframe 
                                    src={previewUrl.replace('/view', '/preview')} 
                                    className="w-full h-full" 
                                    title="Document Preview"
                                    allow="autoplay"
                                ></iframe>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </Layout>
    );
}