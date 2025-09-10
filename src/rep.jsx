import React, { useState } from 'react';
import { FileText, Download, Eye, Loader2, AlertCircle, Settings } from 'lucide-react';

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

      const installationResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installations?custom_id=eq.${customId}&select=*,clients(*),employees(*)`,
        { headers }
      );
      if (!installationResponse.ok) throw new Error('Помилка завантаження даних об\'єкта');
      const installations = await installationResponse.json();
      if (installations.length === 0) throw new Error('Об\'єкт з таким ID не знайдено');
      const installation = installations[0];

      const equipmentResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installed_equipment?installation_custom_id=eq.${customId}&select=*,equipment:equipment_id(name),employees:employee_custom_id(name,phone)`,
        { headers }
      );
      const installedEquipment = await equipmentResponse.json();

      const workersResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installation_workers?installation_custom_id=eq.${customId}&select=*,employees(*)&order=work_date.asc`,
        { headers }
      );
      const workers = await workersResponse.json();

      const paymentsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/payment_history?installation_custom_id=eq.${customId}&order=paid_at.asc`,
        { headers }
      );
      const payments = await paymentsResponse.json();

      return {
        installation,
        installedEquipment,
        workers,
        payments
      };
    } catch (error) {
      throw new Error(`Помилка завантаження даних: ${error.message}`);
    }
  };

  const generateHTMLReport = (data, sections) => {
    const { installation, installedEquipment, workers, payments } = data;
    const currentDate = new Date().toLocaleDateString('uk-UA');
    
    const formatDate = (dateString) => {
      return dateString ? new Date(dateString).toLocaleDateString('uk-UA') : 'Не вказано';
    };

    const formatCurrency = (amount) => {
      return amount != null ? `${amount.toLocaleString('uk-UA')} грн` : '0 грн';
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

    return `
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Звіт по об'єкту № ${installation.custom_id}</title>
    <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 20px auto; padding: 20px; background: #f9fafb; }
        .report-container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        h1 { text-align: center; color: #1a274d; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 30px; font-weight: 600; }
        h2 { color: #1a274d; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 30px; margin-bottom: 15px; font-size: 1.4em; }
        .header-info { text-align: center; margin-bottom: 30px; background: #f3f4f6; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
        .info-section { margin-bottom: 25px; }
        .info-section p { margin: 6px 0; padding: 6px 12px; border-left: 3px solid #3b82f6; background-color: #f9fafb; border-radius: 0 4px 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
        th, td { padding: 12px; text-align: left; border: 1px solid #e5e7eb; vertical-align: top; }
        th { background-color: #f3f4f6; font-weight: 600; color: #1f2937; }
        tr:nth-child(even) { background-color: #f9fafb; }
        .summary-table { background: #f3f4f6; border: 2px solid #3b82f6; border-radius: 8px; overflow: hidden; margin-top: 20px; }
        .summary-table th { background: #3b82f6; color: white; }
        .signature-section { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
        .no-data { text-align: center; color: #6b7280; font-style: italic; padding: 20px; background: #f9fafb; border-radius: 8px; }
        .credentials { font-size: 0.9em; color: #4b5563; line-height: 1.4; }
        @media print { body { margin: 0; padding: 10px; background: white; } .report-container { box-shadow: none; border-radius: 0; } }
    </style>
</head>
<body>
<div class="report-container">
    <h1>Звіт по об'єкту № ${installation.custom_id}</h1>
    
    <div class="header-info">
        <h3>${installation.name || 'Назва об\'єкта не вказана'}</h3>
        <p><strong>Дата формування документа:</strong> ${currentDate}</p>
    </div>

    ${sections.client ? `
    <h2>Інформація про клієнта</h2>
    <div class="info-section">
        <p><strong>Компанія/ПІБ:</strong> ${installation.clients?.company_name || installation.clients?.name || 'Не вказано'}</p>
        ${installation.clients?.oblast ? `<p><strong>Область:</strong> ${installation.clients.oblast}</p>` : ''}
        ${installation.clients?.populated_place ? `<p><strong>Населений пункт:</strong> ${installation.clients.populated_place}</p>` : ''}
        ${installation.clients?.phone ? `<p><strong>Телефон:</strong> ${installation.clients.phone}</p>` : ''}
        ${installation.clients?.notes ? `<p><strong>Примітки по клієнту:</strong> ${installation.clients.notes}</p>` : ''}
    </div>
    ` : ''}

    ${sections.object ? `
    <h2>Інформація про об'єкт</h2>
    <div class="info-section">
        ${installation.station_type ? `<p><strong>Тип станції:</strong> ${getStationTypeName(installation.station_type)}</p>` : ''}
        ${installation.mount_type ? `<p><strong>Тип монтажу:</strong> ${getMountTypeName(installation.mount_type)}</p>` : ''}
        ${installation.capacity_kw ? `<p><strong>Потужність:</strong> ${installation.capacity_kw} кВт</p>` : ''}
        ${installation.gps_link ? `<p><strong>GPS:</strong> <a href="${installation.gps_link}" target="_blank">${installation.gps_link}</a></p>` : ''}
        ${installation.latitude && installation.longitude ? `<p><strong>Координати:</strong> ${installation.latitude}, ${installation.longitude}</p>` : ''}
        ${installation.start_date ? `<p><strong>Дата початку робіт:</strong> ${formatDate(installation.start_date)}</p>` : ''}
        ${installation.end_date ? `<p><strong>Дата завершення робіт:</strong> ${formatDate(installation.end_date)}</p>` : ''}
        ${installation.employees?.name ? `<p><strong>Відповідальний працівник:</strong> ${installation.employees.name}</p>` : ''}
        ${installation.status ? `<p><strong>Статус об'єкту:</strong> ${getInstallationStatusName(installation.status)}</p>` : ''}
        ${installation.notes ? `<p><strong>Примітки по об'єкту:</strong> ${installation.notes}</p>` : ''}
    </div>
    ` : ''}

    ${sections.equipment && installedEquipment.length > 0 ? `
    <h2>Встановлене обладнання</h2>
    <table>
        <thead>
            <tr>
                <th>Назва / К-сть</th>
                <th>Серійний номер</th>
                <th>Облікові дані</th>
                <th>Відповідальний за монтаж</th>
            </tr>
        </thead>
        <tbody>
            ${installedEquipment.map(item => `
            <tr>
                <td>
                    <strong>${item.equipment?.name || 'Не вказано'}</strong>
                    <br>
                    <span>Кількість: ${item.quantity || 1} шт.</span>
                </td>
                <td>${item.serial_number || 'Не вказано'}</td>
                <td class="credentials">
                    ${item.login ? `Логін: ${item.login}` : ''}
                    ${item.password ? `<br>Пароль: ${item.password}` : ''}
                    ${!item.login && !item.password ? 'Немає' : ''}
                </td>
                <td>${item.employees?.name || 'Не вказано'}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : sections.equipment ? '<div class="no-data">Обладнання не додано</div>' : ''}

    ${sections.workers && Object.keys(workersByDate).length > 0 ? `
    <h2>Працівники на об'єкті</h2>
    <table>
        <thead>
            <tr>
                <th>Дата роботи</th>
                <th>Працівники</th>
            </tr>
        </thead>
        <tbody>
            ${Object.entries(workersByDate).map(([date, names]) => `
            <tr>
                <td><strong>${date}</strong></td>
                <td>${names.join(', ')}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : sections.workers ? '<div class="no-data">Працівники не додані</div>' : ''}
    
    ${sections.payments && payments.length > 0 ? `
    <h2>Історія платежів</h2>
    <table>
        <thead>
            <tr>
                <th>Дата</th>
                <th>Сума</th>
                <th>Метод оплати</th>
                <th>Коментар</th>
            </tr>
        </thead>
        <tbody>
            ${payments.map(payment => `
            <tr>
                <td>${formatDate(payment.paid_at)}</td>
                <td>${formatCurrency(payment.amount)}</td>
                <td>${getPaymentMethodName(payment.payment_method)}</td>
                <td>${payment.comment || ''}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : sections.payments ? '<div class="no-data">Історія платежів відсутня</div>' : ''}

    ${sections.summary ? `
    <table class="summary-table">
        <thead>
            <tr>
                <th>Фінансова інформація</th>
                <th>Сума</th>
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
                <td><strong>Статус платежу</strong></td>
                <td><strong>${getPaymentStatusName(installation.payment_status)}</strong></td>
            </tr>
        </tbody>
    </table>
    ` : ''}

    <div class="signature-section">
        <h3>Підтвердження</h3>
        <p>Відповідальна особа: ${installation.employees?.name || '_____________________'}</p>
        <br>
        <p>Підпис: _____________________</p>
        <br>
        <p>Дата: _____________________</p>
        <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
            Документ згенеровано автоматично ${currentDate}
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
      }, 250);
    };
  };

  const downloadAsHTML = () => {
    if (!reportData) return;
    const htmlContent = generateHTMLReport(reportData, reportSections);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zvit_object_${reportData.installation.custom_id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const previewReport = () => {
    if (!reportData) return;
    const htmlContent = generateHTMLReport(reportData, reportSections);
    const previewWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
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

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <FileText className="mx-auto h-12 w-12 text-blue-600 mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Генератор звітів</h1>
        <p className="text-gray-600">Введіть ID об'єкта для створення детального звіту</p>
      </div>

      <div className="mb-4">
        <label htmlFor="objectId" className="block text-sm font-medium text-gray-700 mb-2">ID об'єкта</label>
        <div className="flex gap-3">
          <input
            id="objectId"
            type="text"
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleGenerateReport()}
            placeholder="Введіть custom_id об'єкта"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            disabled={loading}
          />
          <button
            onClick={handleGenerateReport}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {loading ? 'Завантаження...' : 'Генерувати'}
          </button>
        </div>
      </div>
      
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-md">
        <h3 className="text-md font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-600"/>
            Налаштування звіту
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm">
            {Object.keys(reportSections).map((key) => {
              const labels = {
                client: "Інфо про клієнта",
                object: "Інфо про об'єкт",
                equipment: "Обладнання",
                workers: "Працівники",
                payments: "Платежі",
                summary: "Фінанси"
              };
              return (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name={key}
                    checked={reportSections[key]}
                    onChange={handleSectionChange}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">{labels[key]}</span>
                </label>
              );
            })}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {reportData && (
        <div className="border-t pt-6">
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="text-lg font-semibold text-green-800 mb-2">Звіт готовий для об'єкта № {reportData.installation.custom_id}</h3>
            <p className="text-green-700">{reportData.installation.name || 'Назва об\'єкта не вказана'}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={previewReport}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="h-4 w-4" />
              Переглянути
            </button>
            <button
              onClick={downloadAsPDF}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              PDF (Друк)
            </button>
            <button
              onClick={downloadAsHTML}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              HTML файл
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;