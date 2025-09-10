import React, { useState, useCallback } from 'react';
import { Upload, Camera, CheckCircle, AlertCircle, Loader2, Send, TestTube } from 'lucide-react';

const PhotoUploadSite = () => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [chatId, setChatId] = useState('');
  const [isTesting, setIsTesting] = useState(false);

  // Telegram Bot Configuration
  const BOT_TOKEN = "8134982467:AAE-MhOH0Mu2xHLOZhFfQLn_WJ57MG6WdnQ";
  const BOT_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

  // Handle drag events
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  // Handle file selection
  const handleFile = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadStatus({ type: 'error', message: 'Будь ласка, оберіть файл зображення' });
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setUploadStatus({ type: 'error', message: 'Файл завеликий. Максимальний розмір: 20MB' });
      return;
    }

    setSelectedFile(file);
    setUploadStatus(null);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // Test connection to bot
  const testConnection = async () => {
    if (!chatId.trim()) {
      setUploadStatus({ type: 'error', message: 'Введіть Chat ID для тесту' });
      return;
    }

    setIsTesting(true);
    setUploadStatus(null);

    try {
      // Парсимо Chat ID та Thread ID (якщо є)
      let targetChatId = chatId.trim();
      let messageThreadId = null;
      
      if (chatId.includes(':')) {
        const [chatPart, threadPart] = chatId.split(':');
        targetChatId = chatPart.trim();
        messageThreadId = threadPart.trim();
      }

      const testPayload = {
        chat_id: targetChatId,
        text: '🧪 Тест з\'єднання\n✅ Бот працює правильно!\n📱 Тепер ви можете надсилати фото для аналізу.',
      };
      
      if (messageThreadId) {
        testPayload.message_thread_id = parseInt(messageThreadId);
      }

      const response = await fetch(`${BOT_API_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
      });

      const data = await response.json();

      if (data.ok) {
        const chatType = messageThreadId ? 'гілці' : 'чаті';
        setUploadStatus({
          type: 'success',
          message: `✅ Тест успішний! Повідомлення надіслано в ${chatType}. Перевірте Telegram.`
        });
      } else {
        throw new Error(data.description || 'Помилка тесту');
      }
    } catch (error) {
      console.error('Test error:', error);
      let errorMessage = `❌ Тест не пройдено: ${error.message}`;
      
      if (error.message.includes('chat not found')) {
        errorMessage += '\n💡 Почніть діалог з ботом або додайте його в групу.';
      } else if (error.message.includes('bot was blocked')) {
        errorMessage += '\n💡 Розблокуйте бота в Telegram.';
      } else if (error.message.includes('thread')) {
        errorMessage += '\n💡 Перевірте правильність Thread ID.';
      }
      
      setUploadStatus({
        type: 'error',
        message: errorMessage
      });
    } finally {
      setIsTesting(false);
    }
  };

  const sendToTelegram = async () => {
    if (!selectedFile) return;

    if (!chatId.trim()) {
      setUploadStatus({ type: 'error', message: 'Введіть Chat ID або Thread ID' });
      return;
    }

    setIsUploading(true);
    setUploadStatus(null);

    try {
      // Парсимо Chat ID та Thread ID (якщо є)
      let targetChatId = chatId.trim();
      let messageThreadId = null;
      
      if (chatId.includes(':')) {
        const [chatPart, threadPart] = chatId.split(':');
        targetChatId = chatPart.trim();
        messageThreadId = threadPart.trim();
      }

      // Спочатку відправляємо команду для активації аналізу
      const commandPayload = {
        chat_id: targetChatId,
        text: '🔍 Початок аналізу зображення... Надсилаю фото для обробки.',
      };
      
      if (messageThreadId) {
        commandPayload.message_thread_id = parseInt(messageThreadId);
      }

      const commandResponse = await fetch(`${BOT_API_URL}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(commandPayload),
      });

      const commandData = await commandResponse.json();
      if (!commandData.ok) {
        throw new Error(commandData.description || 'Помилка відправки команди');
      }

      // Потім відправляємо фото з командою для аналізу
      const formData = new FormData();
      formData.append('chat_id', targetChatId);
      if (messageThreadId) {
        formData.append('message_thread_id', messageThreadId);
      }
      formData.append('photo', selectedFile);
      formData.append('caption', `/analyze 📷 Фото для OCR аналізу\n📅 ${new Date().toLocaleString('uk-UA')}\n\n💡 Бот автоматично обробить це зображення та надасть результат аналізу тексту.`);

      const response = await fetch(`${BOT_API_URL}/sendPhoto`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.ok) {
        // Відправляємо додаткову команду для гарантованого запуску аналізу
        const followUpPayload = {
          chat_id: targetChatId,
          text: '🤖 Аналізую зображення... Зачекайте, будь ласка.',
          reply_to_message_id: data.result.message_id,
        };
        
        if (messageThreadId) {
          followUpPayload.message_thread_id = parseInt(messageThreadId);
        }

        await fetch(`${BOT_API_URL}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(followUpPayload),
        });

        const chatType = messageThreadId ? 'гілку' : 'чат';
        setUploadStatus({
          type: 'success',
          message: `Фото успішно відправлено в ${chatType}! Бот розпочав аналіз. Очікуйте результат в Telegram.`
        });
        setTimeout(() => {
          setSelectedFile(null);
          setPreview(null);
          setUploadStatus(null);
        }, 3000);
      } else {
        throw new Error(data.description || 'Помилка відправки фото');
      }
    } catch (error) {
      console.error('Upload error:', error);
      let errorMessage = `Помилка відправки: ${error.message}`;
      
      if (error.message.includes('chat not found') || error.message.includes('bot was blocked')) {
        errorMessage += ' Переконайтеся, що ви почали діалог з ботом або додали його в групу.';
      } else if (error.message.includes('thread')) {
        errorMessage += ' Перевірте правильність Thread ID для гілки.';
      }
      
      setUploadStatus({
        type: 'error',
        message: errorMessage
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreview(null);
    setUploadStatus(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <div className="flex justify-center items-center gap-3 mb-6">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              OCR Аналізатор
            </h1>
          </div>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
            Завантажте фото чеку або документа для автоматичного розпізнавання тексту та аналізу
          </p>
        </div>

        {/* Main Upload Card */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
            
            {/* Chat ID Input */}
            <div className="p-8 border-b border-gray-100">
              <label className="block text-lg font-semibold text-gray-700 mb-3">
                Telegram Chat ID або Thread ID
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="Введіть Chat ID або Thread ID (наприклад: 123456789 або 123456789:5678)"
                  className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors text-lg"
                />
                <button
                  onClick={testConnection}
                  disabled={isTesting || !chatId.trim()}
                  className={`
                    px-6 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 whitespace-nowrap
                    ${isTesting || !chatId.trim()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-100 hover:bg-blue-200 text-blue-700 hover:shadow-md'
                    }
                  `}
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Тест...
                    </>
                  ) : (
                    <>
                      <TestTube className="w-5 h-5" />
                      Тест
                    </>
                  )}
                </button>
              </div>
              <div className="text-sm text-gray-500 mt-3 space-y-1">
                <p>💡 Для особистого чату: напишіть <code className="bg-gray-100 px-1 rounded">@userinfobot</code> в Telegram</p>
                <p>👥 Для групи: додайте бота в групу, і він надішле Group ID</p>
                <p>🧵 Для гілки: використовуйте формат <code className="bg-gray-100 px-1 rounded">GROUP_ID:THREAD_ID</code></p>
              </div>
            </div>

            {/* Upload Area */}
            <div className="p-8">
              <div
                className={`
                  relative border-3 border-dashed rounded-2xl p-12 text-center transition-all duration-300 cursor-pointer
                  ${dragActive 
                    ? 'border-blue-500 bg-blue-50 scale-105 shadow-lg' 
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                  }
                  ${selectedFile ? 'border-green-400 bg-green-50' : ''}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('fileInput').click()}
              >
                <input
                  id="fileInput"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {!selectedFile ? (
                  <div className="space-y-6">
                    <div className={`mx-auto w-20 h-20 rounded-full flex items-center justify-center transition-colors duration-300 ${
                      dragActive ? 'bg-blue-600' : 'bg-gray-100'
                    }`}>
                      <Upload className={`w-10 h-10 ${dragActive ? 'text-white' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold text-gray-700 mb-2">
                        {dragActive ? 'Відпустіть файл тут' : 'Перетягніть фото сюди'}
                      </h3>
                      <p className="text-gray-500 text-lg">
                        або натисніть для вибору файлу
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2 text-sm text-gray-400">
                      <span className="px-3 py-1 bg-gray-100 rounded-full">JPG</span>
                      <span className="px-3 py-1 bg-gray-100 rounded-full">PNG</span>
                      <span className="px-3 py-1 bg-gray-100 rounded-full">WEBP</span>
                      <span className="px-3 py-1 bg-gray-100 rounded-full">До 20MB</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
                    <div>
                      <h3 className="text-xl font-semibold text-gray-700">Файл обрано</h3>
                      <p className="text-gray-500">{selectedFile.name}</p>
                      <p className="text-sm text-gray-400">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              {preview && (
                <div className="mt-8">
                  <h4 className="text-lg font-semibold text-gray-700 mb-4">Попередній перегляд:</h4>
                  <div className="relative bg-gray-50 rounded-xl p-4">
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-w-full max-h-80 mx-auto rounded-lg shadow-md object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {selectedFile && (
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                  <button
                    onClick={sendToTelegram}
                    disabled={isUploading || !chatId.trim()}
                    className={`
                      flex-1 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 flex items-center justify-center gap-3
                      ${isUploading || !chatId.trim()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:shadow-lg hover:scale-105 active:scale-95'
                      }
                    `}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin" />
                        Відправляю...
                      </>
                    ) : (
                      <>
                        <Send className="w-6 h-6" />
                        Відправити в Telegram
                      </>
                    )}
                  </button>

                  <button
                    onClick={clearSelection}
                    disabled={isUploading}
                    className="px-8 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors disabled:opacity-50"
                  >
                    Очистити
                  </button>
                </div>
              )}

              {/* Status Messages */}
              {uploadStatus && (
                <div className={`
                  mt-6 p-4 rounded-xl flex items-start gap-3 text-lg whitespace-pre-line
                  ${uploadStatus.type === 'success' 
                    ? 'bg-green-50 text-green-700 border border-green-200' 
                    : 'bg-red-50 text-red-700 border border-red-200'
                  }
                `}>
                  {uploadStatus.type === 'success' ? (
                    <CheckCircle className="w-6 h-6 text-green-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-500 mt-0.5 flex-shrink-0" />
                  )}
                  <span>{uploadStatus.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="mt-12 bg-white rounded-2xl shadow-lg p-8">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">
              📋 Як використовувати
            </h3>
            <div className="grid md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-blue-600">1</span>
                </div>
                <h4 className="font-semibold text-lg text-gray-700 mb-2">Отримайте ID</h4>
                <p className="text-gray-600 text-sm">Напишіть @userinfobot в Telegram та скопіюйте ваш ID</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-purple-600">2</span>
                </div>
                <h4 className="font-semibold text-lg text-gray-700 mb-2">Почніть діалог</h4>
                <p className="text-gray-600 text-sm">Напишіть /start боту або додайте його в групу/гілку</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-orange-600">3</span>
                </div>
                <h4 className="font-semibold text-lg text-gray-700 mb-2">Завантажте фото</h4>
                <p className="text-gray-600 text-sm">Перетягніть фото чеку або документа в область завантаження</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-green-600">4</span>
                </div>
                <h4 className="font-semibold text-lg text-gray-700 mb-2">Отримайте результат</h4>
                <p className="text-gray-600 text-sm">Бот проаналізує фото та надішле розпізнаний текст</p>
              </div>
            </div>

            {/* Додаткові поради */}
            <div className="mt-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6">
              <h4 className="font-semibold text-lg text-gray-700 mb-4 text-center">💡 Корисні поради:</h4>
              <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
                <div className="flex items-start gap-2">
                  <span className="text-blue-500">👤</span>
                  <span><strong>Особистий чат:</strong> Просто введіть ваш User ID</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-500">👥</span>
                  <span><strong>Групові чати:</strong> Використовуйте Group ID (від'ємне число)</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-purple-500">🧵</span>
                  <span><strong>Гілки (Topics):</strong> Формат GROUP_ID:THREAD_ID</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-orange-500">📱</span>
                  <span><strong>Якість фото:</strong> Чіткі знімки дають кращий результат</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>🤖 Powered by Azure Computer Vision & Telegram Bot API</p>
        </div>
      </footer>
    </div>
  );
};

export default PhotoUploadSite;