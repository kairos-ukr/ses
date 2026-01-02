import React, { useState, useEffect, useCallback, memo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaCloudUploadAlt, FaSearch, FaFilePdf, FaFileImage, FaFileAlt, FaFilter,
  FaDownload, FaEye, FaTimes, FaBars, FaSignOutAlt, FaBuilding, FaUsers,
  FaUserTie, FaCog, FaCreditCard, FaTasks, FaFolderOpen, FaCheck, FaExclamationTriangle, FaTrash
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import { createClient } from '@supabase/supabase-js';

// --- КОНФІГУРАЦІЯ ---
const SERVER_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev'; 
const supabaseUrl = 'https://logxutaepqzmvgsvscle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';
const supabase = createClient(supabaseUrl, supabaseKey);

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

// Оновлений компонент Sidebar
const Sidebar = memo(({ onNavigate, onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuItems = [
      { id: 'home', label: 'Головна', icon: FaBuilding },
      { id: 'clients', label: 'Клієнти', icon: FaUsers },
      { id: 'installations', label: "Об'єкти", icon: FaBuilding },
      { id: 'employees', label: 'Працівники', icon: FaUserTie },
      { id: 'equipment', label: 'Обладнання', icon: FaCog },
      { id: 'payments', label: 'Платежі', icon: FaCreditCard },
      { id: 'documents', label: 'Документи', icon: FaFolderOpen },
      { id: 'tasks', label: 'Мікрозадачі', icon: FaTasks },
    ];
    
    const handleNavigation = (page) => {
        onNavigate(page);
        if (window.innerWidth < 1024) setIsOpen(false);
    };

    return (
      <>
        <button onClick={() => setIsOpen(true)} className="lg:hidden fixed top-4 left-4 z-[90] w-12 h-12 bg-white/80 backdrop-blur-md rounded-full shadow-lg flex items-center justify-center text-slate-700">
          <FaBars/>
        </button>
        <AnimatePresence>
            {isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsOpen(false)} className="fixed inset-0 bg-black/30 z-[99] lg:hidden"/>}
        </AnimatePresence>
        
        {/* Додано overflow-x-hidden, щоб прибрати горизонтальний скрол */}
        <aside className={`fixed top-0 right-0 h-full bg-white/95 backdrop-blur-xl text-slate-800 z-[100] shadow-2xl border-l border-slate-200/50 w-64 transform transition-transform duration-300 ease-in-out flex flex-col overflow-x-hidden
                        ${isOpen ? 'translate-x-0' : 'translate-x-full'} lg:sticky lg:h-screen lg:translate-x-0`}>
            
            <div className="p-5 border-b border-slate-200/80 flex items-center justify-between shrink-0">
                <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">K-Core</h2>
                <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 lg:hidden"><FaTimes/></button>
            </div>

            {/* Змінено overflow-y-auto та додано pr-2 для відступу від скролбару */}
            <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {menuItems.map((item) => (
                    <button 
                        key={item.id} 
                        onClick={() => handleNavigation(item.id)} 
                        className={`flex items-center space-x-4 px-6 py-3.5 text-left transition-all duration-200 group rounded-xl mx-3 my-1 block-size-auto
                        ${item.id === 'documents' ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                    >
                        <item.icon className={`text-lg shrink-0 ${item.id === 'documents' ? 'text-indigo-600' : 'text-slate-500 group-hover:text-indigo-600'}`} />
                        <span className="font-semibold whitespace-nowrap">{item.label}</span>
                    </button>
                ))}
            </nav>

            <div className="p-4 border-t border-slate-200/80 shrink-0">
                <button onClick={onLogout} className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-slate-100 hover:bg-red-100 text-slate-600 hover:text-red-700 rounded-xl font-medium transition-all duration-200">
                    <FaSignOutAlt className="shrink-0"/><span>Вийти</span>
                </button>
            </div>
        </aside>
      </>
    );
});

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
                <motion.div initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} className="fixed top-5 right-5 z-[200]">
                    <div className={`px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-white font-medium backdrop-blur-md ${type === 'error' ? 'bg-red-500/90' : 'bg-emerald-500/90'}`}>
                        {type === 'error' ? <FaExclamationTriangle/> : <FaCheck/>}
                        <span>{message}</span>
                        <button onClick={onClose}><FaTimes/></button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
});

const DocumentCard = memo(({ doc, onPreview }) => {
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
            </div>
        </motion.div>
    );
});


export default function DocumentsPage() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    
    // --- STATE ---
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [selectedObject, setSelectedObject] = useState(null);
    const [isSearching, setIsSearching] = useState(false);

    const [documents, setDocuments] = useState([]);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [docFilter, setDocFilter] = useState("Всі");

    const [uploadFiles, setUploadFiles] = useState([]); // Array of File objects
    const [docType, setDocType] = useState(DOC_TYPES[0]);
    const [customDocType, setCustomDocType] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const [previewUrl, setPreviewUrl] = useState(null);
    const [notification, setNotification] = useState({ isVisible: false, message: '', type: 'success' });
    const [showFilters, setShowFilters] = useState(false);

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
        if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input to allow re-selection
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

    const showToast = (message, type) => {
        setNotification({ isVisible: true, message, type });
    };

    const filteredDocuments = documents.filter(doc => {
        if (docFilter === "Всі") return true;
        return doc.name.startsWith(docFilter);
    });

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/");
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-row-reverse font-sans">
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
                    <header className="mb-8">
                         <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg">
                                <FaFolderOpen className="text-white text-lg" />
                            </div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Документи</h1>
                        </div>
                        <p className="text-slate-500">Керування файлами об'єктів</p>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 space-y-6">
                            
                            {/* 1. Пошук */}
                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200/60 relative z-30">
                                <h3 className="font-bold text-slate-800 mb-4">1. Пошук об'єкта</h3>
                                <div className="relative">
                                    <FaSearch className="absolute left-4 top-3.5 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Назва або ID..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition outline-none"
                                    />
                                    {isSearching && <div className="absolute right-4 top-3.5 w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                                </div>

                                <AnimatePresence>
                                    {searchResults.length > 0 && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                            className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden max-h-60 overflow-y-auto z-50 mx-6"
                                        >
                                            {searchResults.map(obj => (
                                                <button 
                                                    key={obj.custom_id} 
                                                    onClick={() => handleSelectObject(obj)}
                                                    className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-slate-50 last:border-0 transition-colors"
                                                >
                                                    <div className="font-semibold text-slate-800">{obj.name}</div>
                                                    <div className="text-xs text-slate-500 flex justify-between">
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
                                        className="mt-4 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between"
                                    >
                                        <div>
                                            <div className="text-xs text-indigo-500 font-bold uppercase tracking-wide">Обрано</div>
                                            <div className="font-bold text-slate-800">{selectedObject.name}</div>
                                        </div>
                                        <button onClick={() => {setSelectedObject(null); setDocuments([]);}} className="p-2 text-slate-400 hover:text-red-500"><FaTimes/></button>
                                    </motion.div>
                                )}
                            </div>

                            {/* 2. Завантаження */}
                            <div className={`bg-white rounded-2xl p-6 shadow-lg border border-slate-200/60 transition-all ${!selectedObject ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                <h3 className="font-bold text-slate-800 mb-4">2. Завантаження</h3>
                                <form onSubmit={handleUpload} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Тип документа</label>
                                        <select 
                                            value={docType} 
                                            onChange={(e) => setDocType(e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:ring-2 focus:ring-indigo-500 outline-none"
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
                                        <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Файли</label>
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
                                    <div className="max-h-40 overflow-y-auto space-y-2">
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

                                    <button 
                                        type="submit" 
                                        disabled={isUploading || uploadFiles.length === 0}
                                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl shadow-lg disabled:opacity-50 flex justify-center items-center gap-2"
                                    >
                                        {isUploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Завантажити"}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* 3. Список документів */}
                        <div className="lg:col-span-2">
                             <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 shadow-lg border border-slate-200/50 h-full flex flex-col min-h-[500px]">
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-100 pb-4">
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
                                                <FaFilter /> Фільтр
                                            </button>
                                            <AnimatePresence>
                                                {showFilters && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                        className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden"
                                                    >
                                                        <button onClick={() => {setDocFilter("Всі"); setShowFilters(false)}} className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm">Всі</button>
                                                        {DOC_TYPES.map(type => (
                                                            <button key={type} onClick={() => {setDocFilter(type); setShowFilters(false)}} className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm">{type}</button>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 overflow-y-auto pr-1">
                                    {!selectedObject ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                            <FaBuilding className="text-6xl mb-4 opacity-20" />
                                            <p>Оберіть об'єкт для перегляду документів</p>
                                        </div>
                                    ) : loadingDocs ? (
                                        <div className="space-y-4">
                                            {[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse"></div>)}
                                        </div>
                                    ) : filteredDocuments.length === 0 ? (
                                        <div className="h-full flex flex-col items-center justify-center text-slate-400 py-10">
                                            <FaFolderOpen className="text-5xl mb-3 opacity-20" />
                                            <p>Файлів не знайдено</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {filteredDocuments.map(doc => (
                                                <DocumentCard key={doc.id} doc={doc} onPreview={setPreviewUrl} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Sidebar onNavigate={(p) => navigate(p === 'home' ? '/home' : `/${p}`)} onLogout={handleLogout} />
            <Toast {...notification} onClose={() => setNotification(prev => ({ ...prev, isVisible: false }))} />

            {/* PREVIEW MODAL */}
            <AnimatePresence>
                {previewUrl && (
                    <motion.div 
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/90 z-[300] flex flex-col p-4"
                        onClick={() => setPreviewUrl(null)}
                    >
                        <div className="flex justify-end mb-4">
                            <button className="text-white/70 hover:text-white p-2 bg-white/10 rounded-full"><FaTimes className="text-2xl"/></button>
                        </div>
                        <div className="flex-1 bg-white rounded-lg overflow-hidden" onClick={e => e.stopPropagation()}>
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
    );
}