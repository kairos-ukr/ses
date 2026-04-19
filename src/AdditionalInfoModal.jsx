import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaPaperPlane, FaTimes, FaCommentDots } from "react-icons/fa";
import { supabase } from "./supabaseClient";

export default function AdditionalInfoModal({ isOpen, onClose, project, currentUser, showToast }) {
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);

    const handleSubmit = async () => {
        if (!message.trim()) return;
        setSending(true);

        try {
            const { error } = await supabase.from('project_additional_info').insert({
                installation_custom_id: project.custom_id,
                message_text: message,
                author_name: currentUser?.name || currentUser?.email || "Менеджер",
                is_sent_to_telegram: false // Бот побачить це і відправить
            });

            if (error) throw error;

            showToast("Повідомлення відправлено в чергу", "success");
            setMessage("");
            onClose();
        } catch (error) {
            console.error(error);
            showToast("Помилка відправки", "error");
        } finally {
            setSending(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
                    onClick={onClose}
                >
                    <motion.div 
                        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} 
                        className="bg-white rounded-xl w-full max-w-md shadow-2xl p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <FaCommentDots className="text-indigo-600"/> 
                                Додаткова інформація
                            </h3>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><FaTimes/></button>
                        </div>

                        <div className="mb-4">
                            <p className="text-sm text-gray-500 mb-2">
                                Це повідомлення буде надіслано в Telegram-гілку об'єкта <b>#{project.custom_id}</b>.
                            </p>
                            <textarea
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                rows="5"
                                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm"
                                placeholder="Напишіть важливу інформацію тут..."
                            />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Скасувати</button>
                            <button 
                                onClick={handleSubmit} 
                                disabled={sending || !message.trim()}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {sending ? "Відправка..." : <><FaPaperPlane/> Відправити</>}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}