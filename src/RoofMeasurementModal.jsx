import React, { useState, useRef, useEffect } from 'react';
import { Upload, ZoomIn, ZoomOut, Trash2, X, Edit3, CloudUpload, Loader2, Maximize2 } from 'lucide-react';

// ВСТАВ СВІЙ URL ТУТ АБО БЕРИ З .ENV
const API_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev'; 

const RoofMeasurementModal = ({ isOpen, onClose, objectNumber }) => {
  const [photos, setPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [hasMoved, setHasMoved] = useState(false);
  
  const [measurements, setMeasurements] = useState({});
  const [currentPoints, setCurrentPoints] = useState([]);
  
  const [showDialog, setShowDialog] = useState(false);
  const [dialogData, setDialogData] = useState({ distance: '', unit: 'м' });

  // Стан завантаження
  const [isUploading, setIsUploading] = useState(false);
  
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentPhoto = photos[currentPhotoIndex];
  const currentMeasurements = measurements[currentPhoto?.id] || { lines: [] };

  // Блокування прокрутки body
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // --- ЛОГІКА МАЛЮВАННЯ (Твій оригінальний код) ---
  const renderMeasurement = (ctx, line, scaleFactor) => {
    const { pointA, pointB, distance, unit } = line;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    const x1 = pointA.x * width;
    const y1 = pointA.y * height;
    const x2 = pointB.x * width;
    const y2 = pointB.y * height;

    const LINE_WIDTH = 4 * scaleFactor;
    const OUTLINE_WIDTH = 7 * scaleFactor;
    const DOT_RADIUS = 12 * scaleFactor;
    const FONT_SIZE = 36 * scaleFactor;
    const LABEL_PADDING_X = 16 * scaleFactor;
    const LABEL_PADDING_Y = 10 * scaleFactor;

    // Біла обводка
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = OUTLINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Основна синя лінія
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Точки
    const drawDot = (x, y) => {
      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS + (2 * scaleFactor), 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, DOT_RADIUS * 0.6, 0, 2 * Math.PI);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
    };
    drawDot(x1, y1);
    drawDot(x2, y2);

    // Бейдж з текстом
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const text = `${distance} ${unit}`;

    ctx.font = `bold ${FONT_SIZE}px sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const boxWidth = textWidth + (LABEL_PADDING_X * 2);
    const boxHeight = FONT_SIZE + (LABEL_PADDING_Y * 2);
    
    const rectX = midX - boxWidth / 2;
    const rectY = midY - boxHeight / 2;
    const radius = 8 * scaleFactor;

    ctx.beginPath();
    ctx.moveTo(rectX + radius, rectY);
    ctx.lineTo(rectX + boxWidth - radius, rectY);
    ctx.quadraticCurveTo(rectX + boxWidth, rectY, rectX + boxWidth, rectY + radius);
    ctx.lineTo(rectX + boxWidth, rectY + boxHeight - radius);
    ctx.quadraticCurveTo(rectX + boxWidth, rectY + boxHeight, rectX + boxWidth - radius, rectY + boxHeight);
    ctx.lineTo(rectX + radius, rectY + boxHeight);
    ctx.quadraticCurveTo(rectX, rectY + boxHeight, rectX, rectY + boxHeight - radius);
    ctx.lineTo(rectX, rectY + radius);
    ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
    ctx.closePath();

    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3 * scaleFactor;
    ctx.strokeStyle = '#2563eb';
    ctx.stroke();

    ctx.fillStyle = '#1e293b';
    ctx.fillText(text, midX, midY + (scaleFactor * 2));
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(drawCanvas, 100);
    }
  }, [currentPhoto, zoom, currentMeasurements, currentPoints, isOpen, pan]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [currentPhotoIndex]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    const newPhotos = files.map((file, index) => ({
      id: Date.now() + index,
      file,
      url: URL.createObjectURL(file),
      name: file.name
    }));
    
    setPhotos([...photos, ...newPhotos]);
    if (photos.length === 0) {
      setCurrentPhotoIndex(0);
    }
  };

  const deletePhoto = () => {
    if (!currentPhoto || photos.length === 0) return;
    const newPhotos = photos.filter((_, index) => index !== currentPhotoIndex);
    const newMeasurements = { ...measurements };
    delete newMeasurements[currentPhoto.id];
    setPhotos(newPhotos);
    setMeasurements(newMeasurements);
    setCurrentPhotoIndex(Math.max(0, currentPhotoIndex - 1));
  };

  const drawCanvas = () => {
    if (!canvasRef.current || !imageRef.current || !currentPhoto) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;
    
    if (!img.complete) return;
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const maxDimension = Math.max(canvas.width, canvas.height);
    const scaleFactor = maxDimension / 1500; 
    
    currentMeasurements.lines.forEach((line) => {
      renderMeasurement(ctx, line, scaleFactor);
    });
    
    if (currentPoints.length > 0) {
      const p1 = currentPoints[0];
      const x1 = p1.x * canvas.width;
      const y1 = p1.y * canvas.height;
      const DOT_RADIUS = 12 * scaleFactor;

      ctx.beginPath();
      ctx.arc(x1, y1, DOT_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = '#2563eb';
      ctx.fill();
      ctx.lineWidth = 3 * scaleFactor;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      if (currentPoints.length > 1) {
        const p2 = currentPoints[1];
        const x2 = p2.x * canvas.width;
        const y2 = p2.y * canvas.height;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 4 * scaleFactor;
        ctx.setLineDash([15 * scaleFactor, 10 * scaleFactor]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(x2, y2, DOT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.stroke();
      }
    }
  };

  const handleCanvasClick = (e) => {
    if (!currentPhoto || hasMoved) {
      setHasMoved(false);
      return;
    }
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = ((e.clientX - rect.left) * scaleX) / canvas.width;
    const y = ((e.clientY - rect.top) * scaleY) / canvas.height;
    
    if (currentPoints.length === 0) {
      setCurrentPoints([{ x, y }]);
    } else if (currentPoints.length === 1) {
      setCurrentPoints([...currentPoints, { x, y }]);
      setShowDialog(true);
      setDialogData({ distance: '', unit: 'м' });
    }
  };

  const handleMouseDown = (e) => {
    if (zoom > 1 && e.button === 0) {
      setIsPanning(true);
      setHasMoved(false);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      setHasMoved(true);
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1 && zoom > 1) {
      setIsPanning(true);
      setHasMoved(false);
      setPanStart({ 
        x: e.touches[0].clientX - pan.x, 
        y: e.touches[0].clientY - pan.y 
      });
    }
  };

  const handleTouchMove = (e) => {
    if (isPanning && e.touches.length === 1) {
      e.preventDefault();
      setHasMoved(true);
      setPan({
        x: e.touches[0].clientX - panStart.x,
        y: e.touches[0].clientY - panStart.y
      });
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
  };

  const saveMeasurement = () => {
    if (!dialogData.distance) {
      alert('Будь ласка, введіть відстань');
      return;
    }
    const newLine = {
      pointA: currentPoints[0],
      pointB: currentPoints[1],
      distance: dialogData.distance.replace(',', '.'),
      unit: dialogData.unit
    };
    setMeasurements({
      ...measurements,
      [currentPhoto.id]: {
        lines: [...currentMeasurements.lines, newLine]
      }
    });
    setCurrentPoints([]);
    setShowDialog(false);
    setDialogData({ distance: '', unit: 'м' });
  };

  const deleteLastMeasurement = () => {
    if (currentMeasurements.lines.length === 0) return;
    const newLines = currentMeasurements.lines.slice(0, -1);
    setMeasurements({
      ...measurements,
      [currentPhoto.id]: { lines: newLines }
    });
  };

  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // --- НОВА ФУНКЦІЯ ВІДПРАВКИ НА СЕРВЕР ---
  const handleUpload = async () => {
    if (!currentPhoto) return;
    if (!objectNumber) {
        alert("Помилка: Не вказано ID об'єкта!");
        return;
    }

    setIsUploading(true);

    try {
        // 1. Генерація зображення з канвасу
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = imageRef.current;
        
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        // Малюємо оригінальне фото
        ctx.drawImage(img, 0, 0);
        
        // Малюємо лінії розмірів (використовуємо ту ж логіку скейлу)
        const maxDimension = Math.max(canvas.width, canvas.height);
        const scaleFactor = maxDimension / 1500;
        
        currentMeasurements.lines.forEach((line) => {
            renderMeasurement(ctx, line, scaleFactor);
        });

        // 2. Конвертація в Blob
        canvas.toBlob(async (blob) => {
            if (!blob) {
                alert("Помилка генерації зображення");
                setIsUploading(false);
                return;
            }

            // 3. Підготовка даних для відправки
            const formData = new FormData();
            // Ім'я файлу не грає ролі, бо бекенд його переназве, але розширення важливе
            formData.append('files', blob, `measurement.jpg`); 
            formData.append('object_number', objectNumber);
            formData.append('doc_type', 'Заміри');

            // 4. Відправка на сервер
            const response = await fetch(`${API_URL}/upload/`, {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Помилка завантаження");
            }

            const result = await response.json();
            alert(`Успішно збережено в папку: ${result.folder}`);
            
            setIsUploading(false);

        }, 'image/jpeg', 0.95); // Якість 95%

    } catch (error) {
        console.error("Upload error:", error);
        alert(`Помилка: ${error.message}`);
        setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300] animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      <div className="fixed inset-0 z-[310] flex items-center justify-center p-4 pointer-events-none overflow-hidden">
        <div 
          className="w-full max-w-[95vw] h-[95vh] bg-white rounded-2xl shadow-2xl overflow-hidden pointer-events-auto animate-in zoom-in duration-200 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-3 right-3 z-[320]">
            <button 
              onClick={onClose} 
              className="bg-slate-800 hover:bg-slate-700 text-white p-2.5 rounded-full shadow-lg transition"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50">
            <div className="p-4 sm:p-6">
              
              <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200 pr-14">
                <h1 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Edit3 className="text-blue-600 flex-shrink-0"/> 
                  <span className="truncate">RoofMaster - Заміри дахів</span>
                </h1>
                <div className="flex-shrink-0">
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
                  <button 
                    onClick={() => fileInputRef.current.click()} 
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg shadow-md transition text-sm font-medium"
                  >
                    <Upload size={18} className="flex-shrink-0" /> 
                    <span className="hidden sm:inline whitespace-nowrap">Додати фото</span>
                  </button>
                </div>
              </div>

              {photos.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                  
                  <div className="lg:col-span-3 space-y-4">
                    
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {photos.map((p, idx) => (
                        <div 
                          key={p.id} 
                          onClick={() => setCurrentPhotoIndex(idx)} 
                          className={`relative min-w-[60px] h-[60px] rounded-lg border-2 cursor-pointer overflow-hidden transition-all flex-shrink-0 ${
                            currentPhotoIndex === idx ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200 opacity-60'
                          }`}
                        >
                          <img src={p.url} className="w-full h-full object-cover" alt="" />
                        </div>
                      ))}
                    </div>

                    <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative">
                      <div 
                        ref={containerRef} 
                        className="relative overflow-hidden bg-slate-100 flex items-center justify-center select-none"
                        style={{ height: '65vh', minHeight: '400px' }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                      >
                        <div 
                          className="relative inline-block transition-transform duration-100 ease-out"
                          style={{ 
                            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                            transformOrigin: 'center',
                            cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'crosshair'
                          }}
                        >
                          <img 
                            ref={imageRef} 
                            src={currentPhoto.url} 
                            alt={currentPhoto.name} 
                            className="max-w-full max-h-[60vh] h-auto block select-none pointer-events-none" 
                            onLoad={drawCanvas}
                            draggable={false}
                          />
                          <canvas 
                            ref={canvasRef} 
                            onClick={handleCanvasClick} 
                            className="absolute top-0 left-0 w-full h-full"
                            style={{ 
                              cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : 'crosshair'
                            }}
                          />
                        </div>
                      </div>
                      
                      <div className="absolute bottom-4 right-4 flex gap-2">
                        <div className="bg-white/95 backdrop-blur-sm p-1 rounded-lg shadow-lg border border-slate-200 flex gap-1">
                          <button 
                            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} 
                            className="p-2 hover:bg-slate-100 rounded text-slate-700 transition"
                          >
                            <ZoomOut size={20}/>
                          </button>
                          <span className="flex items-center px-2 text-xs font-bold text-slate-500 w-[50px] justify-center">
                            {Math.round(zoom*100)}%
                          </span>
                          <button 
                            onClick={() => setZoom(Math.min(4, zoom + 0.25))} 
                            className="p-2 hover:bg-slate-100 rounded text-slate-700 transition"
                          >
                            <ZoomIn size={20}/>
                          </button>
                          <div className="w-px bg-slate-200 mx-1"></div>
                          <button 
                            onClick={resetZoom}
                            className="p-2 hover:bg-slate-100 rounded text-slate-700 transition"
                            title="Скинути масштаб"
                          >
                            <Maximize2 size={20}/>
                          </button>
                        </div>
                      </div>

                      {zoom > 1 && (
                        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600/90 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg">
                          {isPanning ? 'Переміщення...' : 'Утримуйте для переміщення або клацніть для точки'}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
                      <button 
                        onClick={deleteLastMeasurement} 
                        disabled={currentMeasurements.lines.length === 0} 
                        className="flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-3 rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={18} /> Видалити останній
                      </button>
                      
                      {/* НОВА КНОПКА ЗАВАНТАЖЕННЯ */}
                      <button 
                        onClick={handleUpload} 
                        disabled={isUploading}
                        className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition transform active:scale-95 disabled:opacity-70 disabled:cursor-wait"
                      >
                        {isUploading ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                <span>Збереження...</span>
                            </>
                        ) : (
                            <>
                                <CloudUpload size={18} />
                                <span>Відправити замір</span>
                            </>
                        )}
                      </button>

                      <button 
                        onClick={deletePhoto} 
                        className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-sm mt-2 transition"
                      >
                        <X size={16} /> Видалити фото з проєкту
                      </button>
                    </div>

                    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                      <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3">
                        Заміри ({currentMeasurements.lines.length})
                      </h3>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {currentMeasurements.lines.length === 0 && (
                          <p className="text-sm text-slate-400 italic">На фото поки немає розмірів.</p>
                        )}
                        {currentMeasurements.lines.map((line, index) => (
                          <div key={index} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                            <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                              #{index + 1}
                            </span>
                            <span className="font-bold text-slate-800">
                              {line.distance} <span className="text-sm font-normal text-slate-500">{line.unit}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-slate-400">
                  <div 
                    onClick={() => fileInputRef.current.click()} 
                    className="p-10 border-2 border-dashed border-slate-300 rounded-2xl hover:bg-white hover:border-blue-400 hover:text-blue-500 transition cursor-pointer flex flex-col items-center"
                  >
                    <Upload size={64} className="mb-4 opacity-50" />
                    <p className="text-xl font-medium">Завантажте фото</p>
                    <p className="text-sm mt-2 opacity-70">JPG, PNG, HEIC</p>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {showDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[330]">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h2 className="text-xl font-bold text-slate-800 mb-4 text-center">Введіть відстань</h2>
            <input 
              type="number" 
              inputMode="decimal" 
              value={dialogData.distance} 
              onChange={(e) => setDialogData({ ...dialogData, distance: e.target.value })}
              placeholder="0.00" 
              className="w-full text-center text-4xl font-bold text-slate-800 border-b-2 border-blue-500 focus:outline-none bg-transparent py-4 mb-6" 
              autoFocus 
            />
            
            <div className="flex justify-center gap-2 mb-6">
              {['м', 'см', 'мм'].map((u) => (
                <button 
                  key={u} 
                  onClick={() => setDialogData({...dialogData, unit: u})}
                  className={`px-4 py-2 rounded-lg font-bold transition ${
                    dialogData.unit === u 
                      ? 'bg-blue-100 text-blue-700 border-2 border-blue-200' 
                      : 'bg-slate-50 text-slate-500 border border-slate-200'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button 
                onClick={saveMeasurement} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition active:scale-95"
              >
                Зберегти
              </button>
              <button 
                onClick={() => { setShowDialog(false); setCurrentPoints([]); }} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-bold transition"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default RoofMeasurementModal;