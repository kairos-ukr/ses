import React, { useState } from 'react';
import { FileText, Download, Eye, Loader2, AlertCircle } from 'lucide-react';

// --- Helper Functions ---
// Функція для перекладу методів оплати на українську
const getPaymentMethodName = (method) => {
  const paymentMethods = {
    'cash': 'Готівка',
    'bank_transfer': 'Безготівковий розрахунок',
    'card': 'Оплата картою',
  };
  return paymentMethods[method] || method || 'Не вказано';
};


// Компонент для генерації звітів
const ReportGenerator = () => {
  const [objectId, setObjectId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportData, setReportData] = useState(null);
  
  // Конфігурація Supabase (замініть на ваші дані)
  const SUPABASE_URL = 'https://logxutaepqzmvgsvscle.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvZ3h1dGFlcHF6bXZnc3ZzY2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM5ODU4MDEsImV4cCI6MjA2OTU2MTgwMX0.NhbaKL5X48jHyPPxZ-6EadLcBfM-NMxMA8qbksT9VhE';

  // Функція для завантаження даних з Supabase
  const fetchInstallationData = async (customId) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      };

      // 1. Основні дані об'єкта
      const installationResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installations?custom_id=eq.${customId}&select=*,clients(*),employees(*)`,
        { headers }
      );
      if (!installationResponse.ok) throw new Error('Помилка завантаження даних об\'єкта');
      const installations = await installationResponse.json();
      if (installations.length === 0) throw new Error('Об\'єкт з таким ID не знайдено');
      const installation = installations[0];

      // 2. Завантаження встановленого обладнання з деталями
      const equipmentResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installed_equipment?installation_custom_id=eq.${customId}&select=*,equipment:equipment_id(*),employees:employee_custom_id(name,phone)`,
        { headers }
      );
      const installedEquipment = await equipmentResponse.json();

      // 3. Завантаження працівників на об'єкті
      const workersResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/installation_workers?installation_custom_id=eq.${customId}&select=*,employees(*)`,
        { headers }
      );
      const workers = await workersResponse.json();

      // 4. Завантаження платежів
      const paymentsResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/payment_history?installation_custom_id=eq.${customId}`,
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

  // Функція для генерації HTML звіту
  const generateHTMLReport = (data) => {
    const { installation, installedEquipment, workers, payments } = data;
    const currentDate = new Date().toLocaleDateString('uk-UA');
    
    const formatDate = (dateString) => {
      return dateString ? new Date(dateString).toLocaleDateString('uk-UA') : 'Не вказано';
    };

    const formatCurrency = (amount) => {
      return amount ? `${amount.toLocaleString('uk-UA')} грн` : '0 грн';
    };

    return `
<!DOCTYPE html>
<html lang="uk">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Звіт по об'єкту № ${installation.custom_id}</title>
    <style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.5; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; background: white; }
        h1 { text-align: center; color: #1a274d; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 30px; font-weight: 600; }
        h2 { color: #1a274d; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-top: 30px; margin-bottom: 15px; font-size: 1.4em; }
        .header-info { text-align: center; margin-bottom: 30px; background: #f9fafb; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb; }
        .info-section { margin-bottom: 25px; padding: 15px; background: #f9fafb; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
        th, td { padding: 12px; text-align: left; border: 1px solid #e5e7eb; }
        th { background-color: #f3f4f6; font-weight: 600; color: #1f2937; }
        tr:nth-child(even) { background-color: #f9fafb; }
        .summary-table { background: #f3f4f6; border: 2px solid #3b82f6; border-radius: 8px; overflow: hidden; }
        .summary-table th { background: #3b82f6; color: white; }
        .signature-section { margin-top: 50px; padding: 20px; border-top: 1px solid #e5e7eb; }
        .no-data { text-align: center; color: #6b7280; font-style: italic; padding: 20px; background: #f9fafb; border-radius: 8px; }
        .credentials { font-size: 0.85em; color: #4b5563; }
        @media print { body { margin: 0; padding: 15px; } .no-print { display: none !important; } }
    </style>
</head>
<body>
    <h1>Звіт по об'єкту № ${installation.custom_id}</h1>
    
    <div class="header-info">
        <h3>${installation.name || 'Назва об\'єкта не вказана'}</h3>
        <p><strong>Дата формування документа:</strong> ${currentDate}</p>
    </div>

    <h2>Інформація про клієнта</h2>
    <div class="info-section">
        <p><strong>Компанія/ПІБ:</strong> ${installation.clients?.company_name || installation.clients?.name || 'Не вказано'}</p>
        <p><strong>Область:</strong> ${installation.clients?.oblast || 'Не вказано'}</p>
        <p><strong>Населений пункт:</strong> ${installation.clients?.populated_place || 'Не вказано'}</p>
        <p><strong>Телефон:</strong> ${installation.clients?.phone || 'Не вказано'}</p>
        <p><strong>Примітки:</strong> ${installation.clients?.notes || 'Немає'}</p>
    </div>

    <h2>Інформація про об'єкт</h2>
    <div class="info-section">
        <p><strong>Тип станції:</strong> ${installation.station_type || 'Не вказано'}</p>
        <p><strong>Тип монтажу:</strong> ${installation.mount_type || 'Не вказано'}</p>
        <p><strong>Потужність:</strong> ${installation.capacity_kw ? installation.capacity_kw + ' кВт' : 'Не вказано'}</p>
        <p><strong>GPS посилання:</strong> ${installation.gps_link ? `<a href="${installation.gps_link}">Переглянути на карті</a>` : 'Не вказано'}</p>
        <p><strong>Координати:</strong> ${installation.latitude && installation.longitude ? `${installation.latitude}, ${installation.longitude}` : 'Не вказано'}</p>
        <p><strong>Дата початку робіт:</strong> ${formatDate(installation.start_date)}</p>
        <p><strong>Дата завершення робіт:</strong> ${formatDate(installation.end_date)}</p>
        <p><strong>Відповідальний працівник (загальний):</strong> ${installation.employees?.name || 'Не призначено'}</p>
        <p><strong>Статус:</strong> ${installation.status || 'Не вказано'}</p>
        <p><strong>Примітки:</strong> ${installation.notes || 'Немає'}</p>
    </div>

    <h2>Встановлене обладнання</h2>
    ${installedEquipment.length > 0 ? `
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
                    ${item.login ? `Л: ${item.login}` : ''}
                    ${item.password ? `<br>П: ${item.password}` : ''}
                    ${!item.login && !item.password ? 'Немає' : ''}
                </td>
                <td>${item.employees?.name || 'Не вказано'}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : '<div class="no-data">Обладнання не додано</div>'}

    <h2>Працівники на об'єкті</h2>
    ${workers.length > 0 ? `
    <table>
        <thead>
            <tr>
                <th>Ім'я</th>
                <th>Посада</th>
                <th>Телефон</th>
                <th>Відпрацьовані години</th>
            </tr>
        </thead>
        <tbody>
            ${workers.map(worker => `
            <tr>
                <td>${worker.employees?.name || 'Не вказано'}</td>
                <td>${worker.employees?.position || 'Не вказано'}</td>
                <td>${worker.employees?.phone || 'Не вказано'}</td>
                <td>${worker.work_hours || 0} год</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : '<div class="no-data">Працівники не додані</div>'}

    <h2>Історія платежів</h2>
    ${payments.length > 0 ? `
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
                <td>${payment.comment || 'Немає'}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : '<div class="no-data">Історія платежів відсутня</div>'}

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
                <td><strong>${installation.payment_status || 'Не вказано'}</strong></td>
            </tr>
        </tbody>
    </table>

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
</body>
</html>`;
  };

  // Функція для завантаження як PDF (використовуючи window.print)
  const downloadAsPDF = () => {
    if (!reportData) return;

    const htmlContent = generateHTMLReport(reportData);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  };

  // Функція для завантаження як HTML
  const downloadAsHTML = () => {
    if (!reportData) return;

    const htmlContent = generateHTMLReport(reportData);
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

  // Функція для попереднього перегляду
  const previewReport = () => {
    if (!reportData) return;
    const htmlContent = generateHTMLReport(reportData);
    const previewWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
    previewWindow.document.write(htmlContent);
    previewWindow.document.close();
  };

  // Обробник генерації звіту
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

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="text-center mb-8">
        <FileText className="mx-auto h-12 w-12 text-blue-600 mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Генератор звітів
        </h1>
        <p className="text-gray-600">
          Введіть ID об'єкта для створення офіційного звіту
        </p>
      </div>

      <div className="mb-6">
        <label htmlFor="objectId" className="block text-sm font-medium text-gray-700 mb-2">
          ID об'єкта
        </label>
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

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {reportData && (
        <div className="border-t pt-6">
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              Звіт готовий для об'єкта № {reportData.installation.custom_id}
            </h3>
            <p className="text-green-700">
              {reportData.installation.name || 'Назва об\'єкта не вказана'}
            </p>
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

          <div className="mt-4 text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
            <p className="mb-1"><strong>Порада:</strong> Для отримання PDF файлу використовуйте функцію друку браузера.</p>
            <p>HTML файл можна відкрити в будь-якому браузері або конвертувати в інші формати.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportGenerator;