import React, { useState, useRef, useEffect } from 'react';
import { Upload, ZoomIn, ZoomOut, Download, Trash2, ChevronLeft, ChevronRight, X, Save, Edit3 } from 'lucide-react';

const RoofMeasurementApp = () => {
  const [photos, setPhotos] = useState([]);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [measurements, setMeasurements] = useState({});
  const [currentPoints, setCurrentPoints] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [showMetadataEdit, setShowMetadataEdit] = useState(false);
  const [dialogData, setDialogData] = useState({ distance: '', unit: 'м' });
  const [metadataData, setMetadataData] = useState({ roofType: '', direction: '', angle: '' });
  
  const canvasRef = useRef(null);
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentPhoto = photos[currentPhotoIndex];
  const currentMeasurements = measurements[currentPhoto?.id] || { lines: [], metadata: {} };

  // --- ХЕЛПЕР МАЛЮВАННЯ (ЄДИНИЙ СТИЛЬ) ---
  // Ця функція малює один замір. Використовується і для екрану, і для експорту.
  const renderMeasurement = (ctx, line, scaleFactor) => {
    const { pointA, pointB, distance, unit } = line;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    const x1 = pointA.x * width;
    const y1 = pointA.y * height;
    const x2 = pointB.x * width;
    const y2 = pointB.y * height;

    // Налаштування розмірів відносно масштабу фото
    const LINE_WIDTH = 4 * scaleFactor;
    const OUTLINE_WIDTH = 7 * scaleFactor; // Біла підкладка під лінією
    const DOT_RADIUS = 12 * scaleFactor; // Радіус точки
    const FONT_SIZE = 36 * scaleFactor;
    const LABEL_PADDING_X = 16 * scaleFactor;
    const LABEL_PADDING_Y = 10 * scaleFactor;

    // 1. ЛІНІЯ
    // Біла обводка (щоб відділити від фону)
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
    ctx.strokeStyle = '#2563eb'; // Blue-600
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.stroke();

    // 2. ТОЧКИ (Маркери)
    const drawDot = (x, y) => {
        // Тінь
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS + (2 * scaleFactor), 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Біле коло
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // Синій центр
        ctx.beginPath();
        ctx.arc(x, y, DOT_RADIUS * 0.6, 0, 2 * Math.PI);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
    };
    drawDot(x1, y1);
    drawDot(x2, y2);

    // 3. ТЕКСТ (БЕЙДЖИК)
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
    
    // Малюємо плашку (Rounded Rect)
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

    // Заливка плашки (Біла)
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Обводка плашки (Синя)
    ctx.lineWidth = 3 * scaleFactor;
    ctx.strokeStyle = '#2563eb';
    ctx.stroke();

    // Сам текст (Чорний)
    ctx.fillStyle = '#1e293b'; // Slate-800
    ctx.fillText(text, midX, midY + (scaleFactor * 2)); // + трохи зміщення для візуального центру
  };

  // --- ЕФЕКТИ ---
  useEffect(() => {
    drawCanvas();
  }, [currentPhoto, zoom, currentMeasurements, currentPoints]);

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

    // Розраховуємо масштабний коефіцієнт
    // Беремо більшу сторону картинки і ділимо на базове число (наприклад 1500)
    // Якщо картинка 4000px, scaleFactor буде ~2.6. Якщо 800px, буде ~0.5
    const maxDimension = Math.max(canvas.width, canvas.height);
    const scaleFactor = maxDimension / 1500; 
    
    // 1. Малюємо збережені лінії
    currentMeasurements.lines.forEach((line) => {
      renderMeasurement(ctx, line, scaleFactor);
    });
    
    // 2. Малюємо поточні точки (процес вимірювання)
    if (currentPoints.length > 0) {
        const p1 = currentPoints[0];
        const x1 = p1.x * canvas.width;
        const y1 = p1.y * canvas.height;
        const DOT_RADIUS = 12 * scaleFactor;

        // Точка А
        ctx.beginPath();
        ctx.arc(x1, y1, DOT_RADIUS, 0, 2 * Math.PI);
        ctx.fillStyle = '#2563eb';
        ctx.fill();
        ctx.lineWidth = 3 * scaleFactor;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Якщо є друга точка (пунктир)
        if (currentPoints.length > 1) {
            const p2 = currentPoints[1];
            const x2 = p2.x * canvas.width;
            const y2 = p2.y * canvas.height;

            // Пунктирна лінія
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 4 * scaleFactor;
            ctx.setLineDash([15 * scaleFactor, 10 * scaleFactor]);
            ctx.stroke();
            ctx.setLineDash([]); // Скидання

            // Точка Б
            ctx.beginPath();
            ctx.arc(x2, y2, DOT_RADIUS, 0, 2 * Math.PI);
            ctx.fillStyle = '#2563eb';
            ctx.fill();
            ctx.stroke();
        }
    }
  };

  const handleCanvasClick = (e) => {
    if (!currentPhoto) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Координати відносно відображуваного елемента
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
        lines: [...currentMeasurements.lines, newLine],
        metadata: currentMeasurements.metadata
      }
    });
    setCurrentPoints([]);
    setShowDialog(false);
    setDialogData({ distance: '', unit: 'м' });
  };

  const saveMetadata = () => {
    setMeasurements({
      ...measurements,
      [currentPhoto.id]: {
        lines: currentMeasurements.lines,
        metadata: metadataData
      }
    });
    setShowMetadataEdit(false);
  };

  const openMetadataEdit = () => {
    setMetadataData(currentMeasurements.metadata || { roofType: '', direction: '', angle: '' });
    setShowMetadataEdit(true);
  };

  const deleteLastMeasurement = () => {
    if (currentMeasurements.lines.length === 0) return;
    const newLines = currentMeasurements.lines.slice(0, -1);
    setMeasurements({
      ...measurements,
      [currentPhoto.id]: { ...currentMeasurements, lines: newLines }
    });
  };

  const downloadPhoto = () => {
    if (!currentPhoto) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    ctx.drawImage(img, 0, 0);
    
    // Розрахунок скейлу для експорту
    const maxDimension = Math.max(canvas.width, canvas.height);
    const scaleFactor = maxDimension / 1500;

    // Малюємо (використовуємо ту саму функцію, що і для екрану)
    currentMeasurements.lines.forEach((line) => {
      renderMeasurement(ctx, line, scaleFactor);
    });
    
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `замір-${currentPhoto.name}`;
      a.click();
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 p-2 sm:p-4 font-sans text-gray-800">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER */}
        <div className="flex justify-between items-center mb-4 bg-white p-3 rounded-xl shadow-sm border border-slate-200">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Edit3 className="text-blue-600"/> RoofMaster
            </h1>
            <div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
                <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md transition text-sm font-medium">
                    <Upload size={18} /> <span className="hidden sm:inline">Додати фото</span>
                </button>
            </div>
        </div>

        {photos.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            
            {/* LEFT COLUMN: Viewer */}
            <div className="lg:col-span-3 space-y-4">
                
                {/* Photo Navigation (Tabs) */}
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    {photos.map((p, idx) => (
                        <div key={p.id} onClick={() => setCurrentPhotoIndex(idx)} 
                             className={`relative min-w-[60px] h-[60px] rounded-lg border-2 cursor-pointer overflow-hidden transition-all ${currentPhotoIndex === idx ? 'border-blue-600 ring-2 ring-blue-100' : 'border-gray-200 opacity-60'}`}>
                            <img src={p.url} className="w-full h-full object-cover" />
                        </div>
                    ))}
                </div>

                {/* Main Canvas Area */}
                <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden relative">
                    <div ref={containerRef} className="relative overflow-auto bg-slate-100 touch-pan-x touch-pan-y flex items-center justify-center" style={{ maxHeight: '70vh', minHeight: '300px' }}>
                        <div className="relative inline-block transition-transform duration-100 ease-out" style={{ transform: `scale(${zoom})`, transformOrigin: 'center' }}>
                            <img ref={imageRef} src={currentPhoto.url} alt={currentPhoto.name} className="max-w-full h-auto block select-none" onLoad={drawCanvas} />
                            <canvas ref={canvasRef} onClick={handleCanvasClick} className="absolute top-0 left-0 w-full h-full cursor-crosshair" />
                        </div>
                    </div>
                    
                    {/* Zoom Controls Overlay */}
                    <div className="absolute bottom-4 right-4 flex gap-2">
                        <div className="bg-white/90 backdrop-blur-sm p-1 rounded-lg shadow-md border border-slate-200 flex gap-1">
                            <button onClick={() => setZoom(Math.max(0.5, zoom - 0.25))} className="p-2 hover:bg-slate-100 rounded text-slate-700"><ZoomOut size={20}/></button>
                            <span className="flex items-center px-2 text-xs font-bold text-slate-500 w-[40px] justify-center">{Math.round(zoom*100)}%</span>
                            <button onClick={() => setZoom(Math.min(4, zoom + 0.25))} className="p-2 hover:bg-slate-100 rounded text-slate-700"><ZoomIn size={20}/></button>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Sidebar controls */}
            <div className="space-y-4">
                
                {/* Actions */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-3">
                    <button onClick={deleteLastMeasurement} disabled={currentMeasurements.lines.length === 0} className="flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 px-4 py-3 rounded-xl font-medium transition disabled:opacity-50">
                        <Trash2 size={18} /> Видалити останній
                    </button>
                    <button onClick={downloadPhoto} className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition transform active:scale-95">
                        <Download size={18} /> Скачати фото
                    </button>
                    <button onClick={deletePhoto} className="flex items-center justify-center gap-2 text-slate-400 hover:text-slate-600 text-sm mt-2">
                        <X size={16} /> Видалити фото з проєкту
                    </button>
                </div>

                {/* Metadata Card */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Дані об'єкта</h3>
                        <button onClick={openMetadataEdit} className="text-blue-600 hover:bg-blue-50 p-1.5 rounded-lg transition"><Edit3 size={16}/></button>
                    </div>
                    
                    {currentMeasurements.metadata?.roofType || currentMeasurements.metadata?.direction || currentMeasurements.metadata?.angle ? (
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between border-b border-slate-100 pb-1">
                                <span className="text-slate-500">Тип:</span>
                                <span className="font-semibold text-slate-800">{currentMeasurements.metadata.roofType || '-'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 pb-1">
                                <span className="text-slate-500">Орієнтація:</span>
                                <span className="font-semibold text-slate-800">{currentMeasurements.metadata.direction || '-'}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-100 pb-1">
                                <span className="text-slate-500">Кут:</span>
                                <span className="font-semibold text-slate-800">{currentMeasurements.metadata.angle ? currentMeasurements.metadata.angle + '°' : '-'}</span>
                            </div>
                        </div>
                    ) : (
                        <div onClick={openMetadataEdit} className="text-center py-4 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                            + Додати опис даху
                        </div>
                    )}
                </div>

                {/* Measurements List */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide mb-3">Заміри ({currentMeasurements.lines.length})</h3>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {currentMeasurements.lines.length === 0 && <p className="text-sm text-slate-400 italic">На фото поки немає розмірів.</p>}
                        {currentMeasurements.lines.map((line, index) => (
                            <div key={index} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <span className="text-xs font-bold text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">#{index + 1}</span>
                                <span className="font-bold text-slate-800">{line.distance} <span className="text-sm font-normal text-slate-500">{line.unit}</span></span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
          </div>
        )}

        {photos.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
            <div onClick={() => fileInputRef.current.click()} className="p-10 border-2 border-dashed border-slate-300 rounded-2xl hover:bg-white hover:border-blue-400 hover:text-blue-500 transition cursor-pointer flex flex-col items-center">
                <Upload size={64} className="mb-4 opacity-50" />
                <p className="text-xl font-medium">Завантажте фото</p>
                <p className="text-sm mt-2 opacity-70">JPG, PNG, HEIC</p>
            </div>
          </div>
        )}

        {/* --- MODALS --- */}
        
        {/* Measurement Input */}
        {showDialog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in zoom-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
              <h2 className="text-xl font-bold text-slate-800 mb-4 text-center">Введіть відстань</h2>
              <input type="number" inputMode="decimal" value={dialogData.distance} onChange={(e) => setDialogData({ ...dialogData, distance: e.target.value })}
                placeholder="0.00" className="w-full text-center text-4xl font-bold text-slate-800 border-b-2 border-blue-500 focus:outline-none bg-transparent py-4 mb-6" autoFocus />
              
              <div className="flex justify-center gap-2 mb-6">
                {['м', 'см', 'мм'].map((u) => (
                  <button key={u} onClick={() => setDialogData({...dialogData, unit: u})}
                    className={`px-4 py-2 rounded-lg font-bold transition ${dialogData.unit === u ? 'bg-blue-100 text-blue-700 border-2 border-blue-200' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}>
                    {u}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={saveMeasurement} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold shadow-lg transition active:scale-95">Зберегти</button>
                <button onClick={() => { setShowDialog(false); setCurrentPoints([]); }} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-3 rounded-xl font-bold transition">Скасувати</button>
              </div>
            </div>
          </div>
        )}

        {/* Metadata Edit */}
        {showMetadataEdit && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Дані про об'єкт</h2>
                <button onClick={() => setShowMetadataEdit(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block mb-1 text-sm font-bold text-slate-600">Тип покрівлі</label>
                  <input type="text" value={metadataData.roofType} onChange={(e) => setMetadataData({ ...metadataData, roofType: e.target.value })} className="w-full bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition" />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-bold text-slate-600">Орієнтація</label>
                  <select value={metadataData.direction} onChange={(e) => setMetadataData({ ...metadataData, direction: e.target.value })} className="w-full bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition">
                    <option value="">Не вказано</option>
                    <option value="Північ">Північ</option>
                    <option value="Північний схід">Північний схід</option>
                    <option value="Схід">Схід</option>
                    <option value="Південний схід">Південний схід</option>
                    <option value="Південь">Південь</option>
                    <option value="Південний захід">Південний захід</option>
                    <option value="Захід">Захід</option>
                    <option value="Північний захід">Північний захід</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-sm font-bold text-slate-600">Кут нахилу</label>
                  <input type="number" value={metadataData.angle} onChange={(e) => setMetadataData({ ...metadataData, angle: e.target.value })} className="w-full bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 focus:border-blue-500 outline-none transition" />
                </div>
                <button onClick={saveMetadata} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg mt-4 transition active:scale-95">Зберегти дані</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default RoofMeasurementApp;