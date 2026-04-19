import React, { useState } from 'react';
import { FileText, Download, Eye, Loader2, AlertCircle, Settings, Image, Camera } from 'lucide-react';

// --- Helper Functions for Localization ---

const getPaymentMethodName = (method) => {
  const map = {
    'cash': 'Готівка',
    'bank_transfer': 'Безготівковий розрахунок',
    'card': 'Оплата картою',
  };
  return map[method] || method || 'Не вказано';
};

const getInstallationStatusName = (status) => {
  const map = {
    'planned': 'Заплановано',
    'in_progress': 'В роботі',
    'completed': 'Завершено',
    'paused': 'Призупинено',
    'cancelled': 'Скасовано',
  };
  return map[status] || status || 'Не вказано';
};

const getPaymentStatusName = (status) => {
  const map = {
    'paid': 'Сплачено',
    'partially_paid': 'Частково сплачено',
    'unpaid': 'Не сплачено',
    'overpaid': 'Переплата',
  };
  return map[status] || status || 'Не вказано';
};

const getMountTypeName = (type) => {
  const map = {
    'ground': 'Наземна',
    'roof': 'Дахова',
    'facade': 'Фасадна',
  };
  return map[type] || type || 'Не вказано';
};

const getStationTypeName = (type) => {
  const map = {
    'hybrid': 'Гібридна',
    'grid_tied': 'Мережева',
    'off_grid': 'Автономна',
  };
  return map[type] || type || 'Не вказано';
};

// --- Main Component ---

const ReportGenerator = () => {
  const [objectId, setObjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  const [reportSections, setReportSections] = useState({
    client: true,
    object: true,
    equipment: true,
    workers: true,
    payments: true,
    additionalInfo: true,
    designVariants: true,
    photos: true,
    summary: true,
  });

  // Supabase configuration
  const SUPABASE_URL = 'https://logxutaepqzmvgsvscle.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';

  const fetchInstallationData = async (customId) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      };

      // Installations with client and responsible employee
      const installationResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installations?custom_id=eq.${customId}&select=*,clients(*),employees(*)`,
        { headers }
      );
      if (!installationResponse.ok) throw new Error('Помилка завантаження даних об\'єкта');
      const installations = await installationResponse.json();
      if (installations.length === 0) throw new Error('Об\'єкт з таким ID не знайдено');
      const installation = installations[0];

      // Equipment
      const equipmentResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installed_equipment?installation_custom_id=eq.${customId}&select=*,equipment:equipment_id(name),employees:employee_custom_id(name,phone)`,
        { headers }
      );
      const installedEquipment = await equipmentResponse.json();

      // Workers
      const workersResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installation_workers?installation_custom_id=eq.${customId}&select=*,employees(*)&order=work_date.asc`,
        { headers }
      );
      const workers = await workersResponse.json();

      // Payments
      const paymentsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/payment_history?installation_custom_id=eq.${customId}&order=paid_at.asc`,
        { headers }
      );
      const payments = await paymentsResponse.json();

      // Additional Info
      const additionalInfoResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/project_additional_info?installation_custom_id=eq.${customId}&order=created_at.desc`,
        { headers }
      );
      const additionalInfo = await additionalInfoResponse.json();

      // Design Variants (only approved ones)
      const designVariantsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/project_design_variants?installation_custom_id=eq.${customId}&is_selected=eq.true&order=created_at.desc`,
        { headers }
      );
      const designVariants = await designVariantsResponse.json();

      // Workflow Events (for photos metadata from workflow)
      const workflowEventsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/workflow_events?installation_custom_id=eq.${customId}&order=created_at.asc`,
        { headers }
      );
      const workflowEvents = await workflowEventsResponse.json();

      // Photos from Google Drive via document system API
      const DRIVE_API_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev';
      let drivePhotos = [];
      try {
        const driveResponse = await fetch(`${DRIVE_API_URL}/documents/${customId}`);
        if (driveResponse.ok) {
          const driveData = await driveResponse.json();
          console.log('Drive API response:', driveData);
          if (driveData.status === 'success' && driveData.documents) {
            // Filter only image files
            drivePhotos = driveData.documents.filter(doc => 
              doc.mimeType && doc.mimeType.startsWith('image/')
            );
            console.log('Filtered photos:', drivePhotos.length, drivePhotos);
          }
        } else {
          console.error('Drive API error:', driveResponse.status, driveResponse.statusText);
        }
      } catch (err) {
        console.error('Не вдалося завантажити фото з Google Drive:', err);
      }

      return {
        installation,
        installedEquipment,
        workers,
        payments,
        additionalInfo,
        designVariants,
        workflowEvents,
        drivePhotos
      };
    } catch (error) {
      throw new Error(`Помилка завантаження даних: ${error.message}`);
    }
  };

  const generateHTMLReport = (data, sections) => {
    const { installation, installedEquipment, workers, payments, additionalInfo, designVariants, workflowEvents, drivePhotos } = data;
    const currentDate = new Date().toLocaleDateString('uk-UA');
    
    const formatDate = (dateString) => {
      return dateString ? new Date(dateString).toLocaleDateString('uk-UA') : 'Не вказано';
    };

    const formatDateTime = (dateString) => {
      if (!dateString) return 'Не вказано';
      const date = new Date(dateString);
      return `${date.toLocaleDateString('uk-UA')} ${date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
    };

    const formatCurrency = (amount) => {
      return amount != null ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '$0.00';
    };
    
    // Group workers by date
    const workersByDate = workers.reduce((acc, worker) => {
      const date = worker.work_date ? formatDate(worker.work_date) : 'Дата не вказана';
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(worker.employees?.name || 'Ім\'я невідоме');
      return acc;
    }, {});

    // Group photos by date - using both workflow_events and drivePhotos
    const photosByDate = {};
    
    // Add photos from workflow_events
    workflowEvents.forEach(event => {
      if (event.photos && event.photos.length > 0) {
        const date = event.created_at ? formatDate(event.created_at) : 'Дата не вказана';
        if (!photosByDate[date]) {
          photosByDate[date] = [];
        }
        event.photos.forEach((photoUrl, index) => {
          photosByDate[date].push({
            url: photoUrl,
            fileId: event.photo_file_ids && event.photo_file_ids[index] ? event.photo_file_ids[index] : null,
            source: 'workflow'
          });
        });
      }
    });

    // Add photos from Google Drive
    if (drivePhotos && drivePhotos.length > 0) {
      drivePhotos.forEach(photo => {
        // Try to extract date from filename (format: TYPE_DD_MM_OBJECTNAME_INDEX.ext)
        let dateStr = 'Дата не вказана';
        try {
          const nameParts = photo.name.split('_');
          if (nameParts.length >= 3) {
            const day = nameParts[1];
            const month = nameParts[2];
            // Current year or from createdTime
            const year = photo.createdTime ? new Date(photo.createdTime).getFullYear() : new Date().getFullYear();
            
            if (day && month && !isNaN(parseInt(day)) && !isNaN(parseInt(month))) {
              const parsedDate = new Date(year, parseInt(month) - 1, parseInt(day));
              if (!isNaN(parsedDate.getTime())) {
                dateStr = formatDate(parsedDate.toISOString());
              }
            }
          }
          
          // Fallback to createdTime if date parsing failed
          if (dateStr === 'Дата не вказана' && photo.createdTime) {
            dateStr = formatDate(photo.createdTime);
          }
        } catch (err) {
          // Use createdTime as fallback
          if (photo.createdTime) {
            dateStr = formatDate(photo.createdTime);
          }
        }

        if (!photosByDate[dateStr]) {
          photosByDate[dateStr] = [];
        }
        
        // Use the proxy endpoint from the API for better image loading
        const DRIVE_API_URL = 'https://quiet-water-a1ad.kairosost38500.workers.dev';
        const imageUrl = `${DRIVE_API_URL}/thumb/${photo.id}`;
        
        photosByDate[dateStr].push({
          url: imageUrl,
          fileId: photo.id,
          name: photo.name,
          webViewLink: photo.webViewLink,
          source: 'drive'
        });
      });
    }

    return `
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Звіт по об'єкту № ${installation.custom_id}</title>
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; 
            line-height: 1.7; 
            color: #1f2937; 
            max-width: 1000px; 
            margin: 0 auto; 
            padding: 40px 20px; 
            background: linear-gradient(135deg, #f0f9ff 0%, #f9fafb 100%);
        }
        .report-container { 
            background: white; 
            padding: 50px; 
            border-radius: 16px; 
            box-shadow: 0 20px 60px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.03);
        }
        h1 { 
            text-align: center; 
            color: #0f172a; 
            font-size: 2.5em;
            font-weight: 800; 
            letter-spacing: -0.02em;
            margin-bottom: 12px;
            background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        h2 { 
            color: #0f172a; 
            border-bottom: 3px solid #0ea5e9; 
            padding-bottom: 12px; 
            margin-top: 50px; 
            margin-bottom: 25px; 
            font-size: 1.75em; 
            font-weight: 700;
            letter-spacing: -0.01em;
        }
        h3 {
            color: #334155;
            font-size: 1.3em;
            font-weight: 600;
            margin-top: 30px;
            margin-bottom: 15px;
        }
        .header-info { 
            text-align: center; 
            margin-bottom: 40px; 
            background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
            padding: 25px; 
            border-radius: 12px; 
            border: 2px solid #7dd3fc;
        }
        .header-info h3 {
            margin: 0 0 10px 0;
            color: #0c4a6e;
            font-size: 1.5em;
        }
        .info-section { margin-bottom: 30px; }
        .info-section p { 
            margin: 10px 0; 
            padding: 14px 20px; 
            border-left: 4px solid #0ea5e9; 
            background: linear-gradient(90deg, #f0f9ff 0%, #ffffff 100%);
            border-radius: 0 8px 8px 0;
            transition: all 0.2s ease;
        }
        .info-section p:hover {
            background: linear-gradient(90deg, #e0f2fe 0%, #f9fafb 100%);
            transform: translateX(4px);
        }
        .info-section p strong {
            color: #0c4a6e;
            font-weight: 600;
        }
        table { 
            width: 100%; 
            border-collapse: separate;
            border-spacing: 0;
            margin-bottom: 25px; 
            font-size: 14px;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        th, td { 
            padding: 14px 18px; 
            text-align: left; 
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top; 
        }
        th { 
            background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
            font-weight: 600; 
            color: white;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.05em;
        }
        tr:last-child td {
            border-bottom: none;
        }
        tr:nth-child(even) { 
            background: #f9fafb; 
        }
        tr:hover {
            background: #f0f9ff;
        }
        .summary-table { 
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border: 3px solid #0ea5e9; 
            border-radius: 12px; 
            overflow: hidden; 
            margin-top: 30px;
            box-shadow: 0 8px 24px rgba(14, 165, 233, 0.15);
        }
        .summary-table th { 
            background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%);
        }
        .signature-section { 
            margin-top: 60px; 
            padding-top: 30px; 
            border-top: 2px solid #e5e7eb; 
        }
        .no-data { 
            text-align: center; 
            color: #6b7280; 
            font-style: italic; 
            padding: 30px; 
            background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
            border-radius: 12px;
            border: 2px dashed #d1d5db;
        }
        
        /* Photo Gallery Styles */
        .photo-section {
            margin-top: 40px;
        }
        .photo-date-group {
            margin-bottom: 40px;
        }
        .photo-date-header {
            background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 600;
            font-size: 1.1em;
            margin-bottom: 20px;
            display: inline-block;
        }
        .photo-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .photo-frame {
            background: #f9fafb;
            border: 3px solid #e5e7eb;
            border-radius: 12px;
            padding: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            aspect-ratio: 4/3;
            overflow: hidden;
            transition: all 0.3s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .photo-frame:hover {
            border-color: #0ea5e9;
            box-shadow: 0 8px 24px rgba(14, 165, 233, 0.2);
            transform: translateY(-4px);
        }
        .photo-frame img {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            border-radius: 6px;
        }
        
        /* Design Variants Styles */
        .design-variant-item {
            background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            border: 3px solid #86efac;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 4px 12px rgba(34, 197, 94, 0.1);
        }
        .design-variant-badge {
            display: inline-block;
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            color: white;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: 600;
            margin-bottom: 10px;
        }
        
        /* Additional Info Styles */
        .additional-info-item {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border-left: 5px solid #f59e0b;
            padding: 16px 20px;
            margin-bottom: 15px;
            border-radius: 0 8px 8px 0;
            box-shadow: 0 2px 8px rgba(245, 158, 11, 0.1);
        }
        .additional-info-meta {
            font-size: 0.85em;
            color: #92400e;
            margin-top: 8px;
        }
        
        @media print { 
            body { 
                margin: 0; 
                padding: 10px; 
                background: white; 
            } 
            .report-container { 
                box-shadow: none; 
                border-radius: 0; 
                padding: 20px;
            }
            .photo-grid {
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
            }
            .photo-frame {
                page-break-inside: avoid;
            }
            h2 {
                page-break-after: avoid;
            }
        }
        
        @media (max-width: 768px) {
            .photo-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: 12px;
            }
            body {
                padding: 20px 10px;
            }
            .report-container {
                padding: 30px 20px;
            }
        }
    </style>
</head>
<body>
<div class="report-container">
    <h1>Звіт по об'єкту № ${installation.custom_id}</h1>
    
    <div class="header-info">
        <h3>${installation.name || 'Назва об\'єкта не вказана'}</h3>
        <p style="margin: 5px 0; color: #0c4a6e; font-weight: 500;"><strong>Дата формування звіту:</strong> ${currentDate}</p>
    </div>

    ${sections.client ? `
    <h2>📋 Інформація про клієнта</h2>
    <div class="info-section">
        <p><strong>Компанія/ПІБ:</strong> ${installation.clients?.company_name || installation.clients?.name || 'Не вказано'}</p>
        ${installation.clients?.oblast ? `<p><strong>Область:</strong> ${installation.clients.oblast}</p>` : ''}
        ${installation.clients?.populated_place ? `<p><strong>Населений пункт:</strong> ${installation.clients.populated_place}</p>` : ''}
        ${installation.clients?.phone ? `<p><strong>Телефон:</strong> ${installation.clients.phone}</p>` : ''}
        ${installation.clients?.object_type ? `<p><strong>Тип об'єкта:</strong> ${installation.clients.object_type}</p>` : ''}
        ${installation.clients?.is_subcontract ? `<p><strong>Субпідряд:</strong> ${installation.clients.is_subcontract ? 'Так' : 'Ні'}</p>` : ''}
        ${installation.clients?.contractor_company ? `<p><strong>Компанія підрядника:</strong> ${installation.clients.contractor_company}</p>` : ''}
        ${installation.clients?.working_company ? `<p><strong>Компанія виконавець:</strong> ${installation.clients.working_company}</p>` : ''}
        ${installation.clients?.first_contact ? `<p><strong>Перший контакт:</strong> ${formatDate(installation.clients.first_contact)}</p>` : ''}
        ${installation.clients?.notes ? `<p><strong>Примітки по клієнту:</strong> ${installation.clients.notes}</p>` : ''}
    </div>
    ` : ''}

    ${sections.object ? `
    <h2>🏗️ Інформація про об'єкт</h2>
    <div class="info-section">
        ${installation.employees?.name ? `<p><strong>Відповідальна особа:</strong> ${installation.employees.name}</p>` : ''}
        ${installation.employees?.phone ? `<p><strong>Телефон відповідального:</strong> ${installation.employees.phone}</p>` : ''}
        ${installation.capacity_kw ? `<p><strong>Потужність:</strong> ${installation.capacity_kw} кВт</p>` : ''}
        ${installation.quant_phase ? `<p><strong>Кількість фаз:</strong> ${installation.quant_phase}</p>` : ''}
        ${installation.station_type ? `<p><strong>Тип станції:</strong> ${getStationTypeName(installation.station_type)}</p>` : ''}
        ${installation.mount_type ? `<p><strong>Тип монтажу:</strong> ${getMountTypeName(installation.mount_type)}</p>` : ''}
        ${installation.working_company ? `<p><strong>Компанія виконавець:</strong> ${installation.working_company}</p>` : ''}
        ${installation.start_date ? `<p><strong>Дата початку:</strong> ${formatDate(installation.start_date)}</p>` : ''}
        ${installation.end_date ? `<p><strong>Дата завершення:</strong> ${formatDate(installation.end_date)}</p>` : ''}
        ${installation.bank !== null && installation.bank !== undefined ? `<p><strong>Через банк:</strong> ${installation.bank ? 'Так' : 'Ні'}</p>` : ''}
        ${installation.gps_link ? `<p><strong>Геолокація:</strong> <a href="${installation.gps_link}" target="_blank" style="color: #0ea5e9;">Посилання на карту</a></p>` : ''}
        ${installation.status ? `<p><strong>Статус проєкту:</strong> ${getInstallationStatusName(installation.status)}</p>` : ''}
        ${installation.workflow_stage ? `<p><strong>Етап робочого процесу:</strong> ${installation.workflow_stage}</p>` : ''}
        ${installation.priority ? `<p><strong>Пріоритет:</strong> ${installation.priority === 'high' ? 'Високий' : installation.priority === 'medium' ? 'Середній' : 'Низький'}</p>` : ''}
        ${installation.creator_email ? `<p><strong>Створив:</strong> ${installation.creator_email}</p>` : ''}
        ${installation.notes ? `<p><strong>Примітки:</strong> ${installation.notes}</p>` : ''}
    </div>
    ` : ''}

    ${sections.additionalInfo && additionalInfo && additionalInfo.length > 0 ? `
    <h2>📌 Додаткова інформація</h2>
    <div class="info-section">
        ${additionalInfo.map(info => `
            <div class="additional-info-item">
                <div style="font-weight: 500; color: #92400e;">${info.message_text}</div>
                <div class="additional-info-meta">
                    ${info.author_name ? `<strong>Автор:</strong> ${info.author_name} | ` : ''}
                    <strong>Дата:</strong> ${formatDateTime(info.created_at)}
                </div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${sections.equipment && installedEquipment && installedEquipment.length > 0 ? `
    <h2>⚡ Обладнання</h2>
    <table>
        <thead>
            <tr>
                <th>Назва обладнання</th>
                <th>Серійний номер</th>
                <th>Кількість</th>
                <th>Встановив</th>
            </tr>
        </thead>
        <tbody>
            ${installedEquipment.map(eq => `
                <tr>
                    <td><strong>${eq.equipment?.name || 'Не вказано'}</strong></td>
                    <td>${eq.serial_number || 'Не вказано'}</td>
                    <td>${eq.quantity || 1} шт.</td>
                    <td>${eq.employees?.name || 'Не вказано'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : sections.equipment ? '<div class="no-data">Обладнання не додано</div>' : ''}

    ${sections.workers && workers && workers.length > 0 ? `
    <h2>👷 Працівники на об'єкті</h2>
    <table>
        <thead>
            <tr>
                <th>Дата</th>
                <th>Працівники</th>
            </tr>
        </thead>
        <tbody>
            ${Object.entries(workersByDate).map(([date, workerNames]) => `
                <tr>
                    <td style="white-space: nowrap;"><strong>${date}</strong></td>
                    <td>${workerNames.join(', ')}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : sections.workers ? '<div class="no-data">Працівники не додані</div>' : ''}

    ${sections.payments && payments && payments.length > 0 ? `
    <h2>💰 Історія платежів</h2>
    <table>
        <thead>
            <tr>
                <th>Дата</th>
                <th>Сума</th>
                <th>Спосіб оплати</th>
                <th>Коментар</th>
            </tr>
        </thead>
        <tbody>
            ${payments.map(payment => `
                <tr>
                    <td style="white-space: nowrap;">${formatDate(payment.paid_at)}</td>
                    <td><strong>${formatCurrency(payment.amount)}</strong></td>
                    <td>${getPaymentMethodName(payment.payment_method)}</td>
                    <td>${payment.comment || '—'}</td>
                </tr>
            `).join('')}
        </tbody>
    </table>
    ` : sections.payments ? '<div class="no-data">Платежі відсутні</div>' : ''}

    ${sections.summary ? `
    <h2>💵 Фінансова інформація</h2>
    <table class="summary-table">
        <thead>
            <tr>
                <th>Параметр</th>
                <th>Значення</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td><strong>Загальна вартість</strong></td>
                <td><strong>${formatCurrency(installation.total_cost)}</strong></td>
            </tr>
            <tr>
                <td><strong>Сплачено</strong></td>
                <td><strong>${formatCurrency(installation.paid_amount)}</strong></td>
            </tr>
            <tr>
                <td><strong>Залишок</strong></td>
                <td><strong>${formatCurrency((installation.total_cost || 0) - (installation.paid_amount || 0))}</strong></td>
            </tr>
            <tr>
                <td><strong>Статус оплати</strong></td>
                <td><strong>${getPaymentStatusName(installation.payment_status)}</strong></td>
            </tr>
        </tbody>
    </table>
    ` : ''}

    ${sections.designVariants && designVariants && designVariants.length > 0 ? `
    <h2>🎨 Затверджена 3D візуалізація</h2>
    <div class="info-section">
        ${designVariants.map(variant => `
            <div class="design-variant-item">
                <span class="design-variant-badge">✓ ЗАТВЕРДЖЕНО</span>
                <p style="margin: 10px 0 5px 0;"><strong>Назва файлу:</strong> ${variant.file_name || 'Не вказано'}</p>
                <p style="margin: 5px 0;"><strong>Дата створення:</strong> ${formatDateTime(variant.created_at)}</p>
                ${variant.public_url ? `
                    <p style="margin: 5px 0;">
                        <a href="${variant.public_url}" target="_blank" style="color: #16a34a; font-weight: 600; text-decoration: none;">
                            📎 Переглянути файл
                        </a>
                    </p>
                ` : ''}
            </div>
        `).join('')}
    </div>
    ` : sections.designVariants && designVariants && designVariants.length === 0 ? '<div class="no-data">3D візуалізація ще не затверджена</div>' : ''}

    ${sections.photos && Object.keys(photosByDate).length > 0 ? `
    <h2>📸 Фотозвіт</h2>
    <div class="photo-section">
        ${Object.entries(photosByDate).sort((a, b) => {
          // Sort by date descending
          try {
            const dateA = new Date(a[0].split('.').reverse().join('-'));
            const dateB = new Date(b[0].split('.').reverse().join('-'));
            return dateB - dateA;
          } catch {
            return 0;
          }
        }).map(([date, photos]) => `
            <div class="photo-date-group">
                <div class="photo-date-header">📅 ${date} (${photos.length} фото)</div>
                <div class="photo-grid">
                    ${photos.map(photo => {
                      const imgSrc = photo.url;
                      const viewLink = photo.webViewLink || photo.url;
                      const photoName = (photo.name || 'Фото від ' + date).replace(/'/g, "\\'");
                      
                      return `
                        <div class="photo-frame" onclick="window.open('${viewLink}', '_blank')" style="cursor: pointer;" title="Клікніть для перегляду в новому вікні">
                            <img 
                              src="${imgSrc}" 
                              alt="${photoName}" 
                              loading="lazy" 
                              onerror="this.onerror=null; this.parentElement.innerHTML='<div style=\\'color: #9ca3af; text-align: center; padding: 20px; font-size: 12px;\\'>📷<br>Фото недоступне<br><small>${photoName}</small></div>'"
                            >
                        </div>
                      `;
                    }).join('')}
                </div>
            </div>
        `).join('')}
    </div>
    ` : sections.photos ? '<div class="no-data">Фотографії відсутні</div>' : ''}

    <div class="signature-section">
        <h3>Підтвердження</h3>
        <p style="margin-top: 20px;"><strong>Відповідальна особа:</strong> ${installation.employees?.name || '_____________________'}</p>
        <br>
        <p><strong>Підпис:</strong> _____________________</p>
        <br>
        <p><strong>Дата:</strong> _____________________</p>
        <p style="margin-top: 30px; font-size: 13px; color: #6b7280; text-align: center;">
            Документ згенеровано автоматично системою KAIROS • ${currentDate}
        </p>
    </div>
</div>
</body>
</html>`;
  };

  const downloadAsPDF = () => {
    if (!reportData) return;
    const htmlContent = generateHTMLReport(reportData, reportSections);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  };

  const downloadAsHTML = () => {
    if (!reportData) return;
    const htmlContent = generateHTMLReport(reportData, reportSections);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zvit_object_${reportData.installation.custom_id}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const previewReport = () => {
    if (!reportData) return;
    const htmlContent = generateHTMLReport(reportData, reportSections);
    const previewWindow = window.open('', '_blank', 'width=1000,height=800,scrollbars=yes,resizable=yes');
    previewWindow.document.write(htmlContent);
    previewWindow.document.close();
  };

  const handleGenerateReport = async () => {
    if (!objectId.trim()) {
      setError('Будь ласка, введіть ID об\'єкта');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchInstallationData(objectId.trim());
      console.log('📊 Завантажені дані:', {
        drivePhotos: data.drivePhotos?.length || 0,
        workflowEvents: data.workflowEvents?.length || 0,
        installation: data.installation?.custom_id
      });
      if (data.drivePhotos && data.drivePhotos.length > 0) {
        console.log('📸 Перше фото з Drive:', data.drivePhotos[0]);
      }
      setReportData(data);
    } catch (err) {
      setError(err.message);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSectionChange = (event) => {
    const { name, checked } = event.target;
    setReportSections(prev => ({ ...prev, [name]: checked }));
  };

  const sectionLabels = {
    client: "Інфо про клієнта",
    object: "Інфо про об'єкт",
    equipment: "Обладнання",
    workers: "Працівники",
    payments: "Платежі",
    additionalInfo: "Додаткова інформація",
    designVariants: "3D Візуалізація",
    photos: "Фотозвіт",
    summary: "Фінанси"
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      padding: '60px 20px',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    }}>
      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        background: 'white',
        borderRadius: '24px',
        padding: '50px',
        boxShadow: '0 25px 80px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '50px' }}>
          <div style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
            borderRadius: '20px',
            padding: '20px',
            marginBottom: '25px',
            boxShadow: '0 12px 30px rgba(14, 165, 233, 0.3)'
          }}>
            <FileText style={{ width: '56px', height: '56px', color: 'white' }} />
          </div>
          <h1 style={{
            fontSize: '3em',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '12px',
            letterSpacing: '-0.02em'
          }}>
            Генератор звітів
          </h1>
          <p style={{ color: '#64748b', fontSize: '1.1em', fontWeight: '500' }}>
            Створіть детальний звіт по об'єкту за лічені секунди
          </p>
        </div>

        <div style={{ marginBottom: '35px' }}>
          <label htmlFor="objectId" style={{
            display: 'block',
            fontSize: '0.95em',
            fontWeight: '600',
            color: '#334155',
            marginBottom: '12px',
            letterSpacing: '0.01em'
          }}>
            ID об'єкта
          </label>
          <div style={{ display: 'flex', gap: '15px' }}>
            <input
              id="objectId"
              type="text"
              value={objectId}
              onChange={(e) => setObjectId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleGenerateReport()}
              placeholder="Введіть custom_id об'єкта..."
              style={{
                flex: 1,
                padding: '16px 20px',
                border: '2px solid #e2e8f0',
                borderRadius: '12px',
                fontSize: '1em',
                outline: 'none',
                transition: 'all 0.2s ease',
                fontFamily: 'inherit'
              }}
              onFocus={(e) => e.target.style.borderColor = '#0ea5e9'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              disabled={loading}
            />
            <button
              onClick={handleGenerateReport}
              disabled={loading}
              style={{
                padding: '16px 32px',
                background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1em',
                fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition: 'all 0.3s ease',
                boxShadow: loading ? 'none' : '0 8px 20px rgba(14, 165, 233, 0.3)',
                fontFamily: 'inherit'
              }}
              onMouseEnter={(e) => !loading && (e.target.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => !loading && (e.target.style.transform = 'translateY(0)')}
            >
              {loading ? (
                <>
                  <Loader2 style={{ width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} />
                  Завантаження...
                </>
              ) : (
                <>
                  <FileText style={{ width: '20px', height: '20px' }} />
                  Генерувати
                </>
              )}
            </button>
          </div>
        </div>
        
        <div style={{
          marginBottom: '40px',
          padding: '30px',
          background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
          border: '2px solid #e2e8f0',
          borderRadius: '16px'
        }}>
          <h3 style={{
            fontSize: '1.1em',
            fontWeight: '700',
            color: '#334155',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Settings style={{ width: '22px', height: '22px', color: '#64748b' }} />
            Налаштування звіту
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '15px',
            fontSize: '0.95em'
          }}>
            {Object.keys(reportSections).map((key) => (
              <label key={key} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                padding: '12px 16px',
                background: 'white',
                borderRadius: '10px',
                border: '2px solid',
                borderColor: reportSections[key] ? '#0ea5e9' : '#e2e8f0',
                transition: 'all 0.2s ease',
                fontWeight: '500'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#0ea5e9';
                e.currentTarget.style.background = '#f0f9ff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = reportSections[key] ? '#0ea5e9' : '#e2e8f0';
                e.currentTarget.style.background = 'white';
              }}
              >
                <input
                  type="checkbox"
                  name={key}
                  checked={reportSections[key]}
                  onChange={handleSectionChange}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    accentColor: '#0ea5e9'
                  }}
                />
                <span style={{ color: '#334155' }}>{sectionLabels[key]}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            marginBottom: '35px',
            padding: '20px 24px',
            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            border: '2px solid #fca5a5',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '15px'
          }}>
            <AlertCircle style={{ width: '22px', height: '22px', color: '#dc2626', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ color: '#991b1b', margin: 0, fontWeight: '500' }}>{error}</p>
          </div>
        )}

        {reportData && (
          <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '40px' }}>
            <div style={{
              marginBottom: '30px',
              padding: '24px 28px',
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              border: '2px solid #86efac',
              borderRadius: '12px'
            }}>
              <h3 style={{
                fontSize: '1.3em',
                fontWeight: '700',
                color: '#065f46',
                marginBottom: '8px'
              }}>
                ✓ Звіт готовий для об'єкта № {reportData.installation.custom_id}
              </h3>
              <p style={{ color: '#047857', margin: 0, fontSize: '1.05em' }}>
                {reportData.installation.name || 'Назва об\'єкта не вказана'}
              </p>
              <div style={{ 
                marginTop: '12px', 
                fontSize: '0.9em', 
                color: '#059669',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '15px'
              }}>
                {reportData.drivePhotos && reportData.drivePhotos.length > 0 && (
                  <span>📸 {reportData.drivePhotos.length} фото з Google Drive</span>
                )}
                {reportData.installedEquipment && reportData.installedEquipment.length > 0 && (
                  <span>⚡ {reportData.installedEquipment.length} одиниць обладнання</span>
                )}
                {reportData.payments && reportData.payments.length > 0 && (
                  <span>💰 {reportData.payments.length} платежів</span>
                )}
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '15px'
            }}>
              <button
                onClick={previewReport}
                style={{
                  padding: '16px 24px',
                  background: 'linear-gradient(135deg, #64748b 0%, #475569 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1em',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 6px 16px rgba(100, 116, 139, 0.3)',
                  fontFamily: 'inherit'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-3px)';
                  e.target.style.boxShadow = '0 10px 25px rgba(100, 116, 139, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 6px 16px rgba(100, 116, 139, 0.3)';
                }}
              >
                <Eye style={{ width: '20px', height: '20px' }} />
                Переглянути
              </button>
              <button
                onClick={downloadAsPDF}
                style={{
                  padding: '16px 24px',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1em',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 6px 16px rgba(220, 38, 38, 0.3)',
                  fontFamily: 'inherit'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-3px)';
                  e.target.style.boxShadow = '0 10px 25px rgba(220, 38, 38, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.3)';
                }}
              >
                <Download style={{ width: '20px', height: '20px' }} />
                PDF (Друк)
              </button>
              <button
                onClick={downloadAsHTML}
                style={{
                  padding: '16px 24px',
                  background: 'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '1em',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 6px 16px rgba(14, 165, 233, 0.3)',
                  fontFamily: 'inherit'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-3px)';
                  e.target.style.boxShadow = '0 10px 25px rgba(14, 165, 233, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 6px 16px rgba(14, 165, 233, 0.3)';
                }}
              >
                <Download style={{ width: '20px', height: '20px' }} />
                HTML файл
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default ReportGenerator;