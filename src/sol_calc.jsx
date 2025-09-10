import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Sun, Calculator, Phone, CheckCircle, AlertCircle, TrendingUp, Zap, DollarSign } from 'lucide-react';

const SolarCalculator = () => {
  const [formData, setFormData] = useState({
    objectType: '',
    stationType: '',
    region: '',
    powerCapacity: '',
    greenTariff: '',
    months: Array(12).fill('')
  });

  const [contactData, setContactData] = useState({
    firstName: '',
    phone: '',
    isClient: '',
    contactRequest: ''
  });

  const [results, setResults] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Місячна генерація на 1 кВт (кВт·год) - оновлені дані для України
  const monthlyGenerationPerKW = [41.74, 53.67, 95.43, 143.36, 145.98, 157.96, 157.96, 154.97, 130.85, 65.61, 47.63, 35.83];
  const monthNames = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
  const monthNamesShort = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

  const validateForm = () => {
    const errors = {};
    
    if (!formData.objectType) errors.objectType = "Оберіть тип об'єкта";
    if (!formData.stationType) errors.stationType = "Оберіть тип станції";
    if (!formData.region.trim()) errors.region = "Введіть регіон";
    if (!formData.powerCapacity || formData.powerCapacity <= 0) errors.powerCapacity = "Введіть коректну потужність";
    if (!formData.greenTariff) errors.greenTariff = "Оберіть опцію зеленого тарифу";

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateContactForm = () => {
    const errors = {};
    
    if (!contactData.firstName.trim()) errors.firstName = "Введіть ім'я";
    if (!contactData.phone.trim()) errors.phone = "Введіть номер телефону";
    if (!contactData.isClient) errors.isClient = "Оберіть опцію";
    if (!contactData.contactRequest) errors.contactRequest = "Оберіть опцію";

    // Виправлено регулярний вираз - прибрано зайвий екранування
    const phoneRegex = /^[+]?[1-9][\d]{0,15}$/;
    if (contactData.phone && !phoneRegex.test(contactData.phone.replace(/\s/g, ''))) {
      errors.phone = "Введіть коректний номер телефону";
    }

    return Object.keys(errors).length === 0;
  };

  const calculateResults = () => {
    if (!validateForm()) return;

    const powerCapacity = parseFloat(formData.powerCapacity);
    const months = formData.months.map(m => parseFloat(m) || 0);
    const annualConsumption = months.reduce((sum, val) => sum + val, 0);
    const greenTariff = formData.greenTariff === 'Так';

    // Розрахунок генерації
    const monthlyGeneration = monthlyGenerationPerKW.map(val => val * powerCapacity);
    const annualGeneration = monthlyGeneration.reduce((sum, val) => sum + val, 0);

    // Тарифи (оновлені на 2024-2025)
    const electricityRate = formData.objectType === 'Приватний' ? 4.32 : 8.96;
    const greenTariffRate = 0.13; // Євро за кВт·год
    const euroToUah = 47; // Курс євро до гривні

    // Розрахунок власного споживання та надлишку
    const selfConsumption = Math.min(annualGeneration, annualConsumption);
    const excessGeneration = Math.max(0, annualGeneration - selfConsumption);
    const shortfall = Math.max(0, annualConsumption - annualGeneration);

    // Розрахунок економії та прибутку
    const savings = selfConsumption * electricityRate;
    const additionalCost = shortfall * electricityRate;
    
    let grossProfit = 0;
    let netProfit = 0;
    if (excessGeneration > 0 && greenTariff) {
      grossProfit = excessGeneration * greenTariffRate * euroToUah;
      netProfit = grossProfit * 0.77; // Після податків (ПДФО 18% + військовий збір 5%)
    }

    // Статистика
    const consumptionRatio = annualGeneration > 0 ? (selfConsumption / annualGeneration * 100) : 0;
    const selfSufficiency = annualConsumption > 0 ? (selfConsumption / annualConsumption * 100) : 0;

    // Дані для графіків
    const monthlyData = monthNames.map((name, index) => ({
      month: monthNamesShort[index],
      generation: monthlyGeneration[index],
      consumption: months[index],
      surplus: Math.max(0, monthlyGeneration[index] - months[index]),
      deficit: Math.max(0, months[index] - monthlyGeneration[index])
    }));

    const pieData = [
      { name: 'Власне споживання', value: selfConsumption, color: '#3b82f6' },
      { name: 'Видача в мережу', value: excessGeneration, color: '#10b981' }
    ];

    setResults({
      annualGeneration: annualGeneration.toFixed(0),
      annualConsumption: annualConsumption.toFixed(0),
      selfConsumption: selfConsumption.toFixed(0),
      excessGeneration: excessGeneration.toFixed(0),
      shortfall: shortfall.toFixed(0),
      savings: savings.toFixed(0),
      additionalCost: additionalCost.toFixed(0),
      grossProfit: grossProfit.toFixed(0),
      netProfit: netProfit.toFixed(0),
      totalBenefit: (savings + netProfit - additionalCost).toFixed(0),
      consumptionRatio: consumptionRatio.toFixed(0),
      selfSufficiency: selfSufficiency.toFixed(0),
      monthlyData,
      pieData: pieData.filter(item => item.value > 0)
    });

    setShowResults(true);
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!validateContactForm()) return;
    
    setIsSubmitting(true);
    
    // Симуляція відправки даних
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setShowModal(false);
      setShowConfirmation(true);
      
      // Очищення форм
      setFormData({
        objectType: '',
        stationType: '',
        region: '',
        powerCapacity: '',
        greenTariff: '',
        months: Array(12).fill('')
      });
      setContactData({
        firstName: '',
        phone: '',
        isClient: '',
        contactRequest: ''
      });
      
    } catch (error) {
      alert('Помилка при відправці. Спробуйте ще раз.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const InputField = ({ label, error, children }) => (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error && <p className="text-sm text-red-600 flex items-center gap-1"><AlertCircle size={16} />{error}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Sun className="text-yellow-500" size={48} />
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">
              Калькулятор сонячної енергії
            </h1>
          </div>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Розрахуйте потенціал та економічну ефективність вашої сонячної електростанції
          </p>
        </div>

        {/* Main Form */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Parameters */}
          <div className="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-white/20">
            <div className="flex items-center gap-3 mb-6">
              <Calculator className="text-blue-600" size={28} />
              <h2 className="text-2xl font-bold text-gray-800">Основні параметри</h2>
            </div>
            
            <div className="space-y-6">
              <InputField label="Тип об'єкта" error={validationErrors.objectType}>
                <select 
                  value={formData.objectType}
                  onChange={(e) => setFormData(prev => ({...prev, objectType: e.target.value}))}
                  className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                >
                  <option value="">Виберіть тип</option>
                  <option value="Приватний">🏠 Приватний будинок</option>
                  <option value="Бізнес">🏢 Бізнес об'єкт</option>
                </select>
              </InputField>

              <InputField label="Тип станції" error={validationErrors.stationType}>
                <select 
                  value={formData.stationType}
                  onChange={(e) => setFormData(prev => ({...prev, stationType: e.target.value}))}
                  className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                >
                  <option value="">Виберіть тип</option>
                  <option value="Мережева">⚡ Мережева станція</option>
                  <option value="Гібридна">🔋 Гібридна з акумулятором</option>
                </select>
              </InputField>

              <InputField label="Регіон" error={validationErrors.region}>
                <input 
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData(prev => ({...prev, region: e.target.value}))}
                  placeholder="Напр., Київ, Львів, Одеса"
                  className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                />
              </InputField>

              <InputField label="Бажана потужність (кВт)" error={validationErrors.powerCapacity}>
                <input 
                  type="number"
                  value={formData.powerCapacity}
                  onChange={(e) => setFormData(prev => ({...prev, powerCapacity: e.target.value}))}
                  placeholder="Напр., 10"
                  min="0"
                  step="0.1"
                  className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                />
              </InputField>

              <InputField label="Зелений тариф" error={validationErrors.greenTariff}>
                <select 
                  value={formData.greenTariff}
                  onChange={(e) => setFormData(prev => ({...prev, greenTariff: e.target.value}))}
                  className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                >
                  <option value="">Виберіть опцію</option>
                  <option value="Так">✅ Так, планую продавати надлишки</option>
                  <option value="Ні">❌ Ні, тільки для власних потреб</option>
                </select>
              </InputField>
            </div>
          </div>

          {/* Monthly Consumption */}
          <div className="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-white/20">
            <div className="flex items-center gap-3 mb-6">
              <TrendingUp className="text-green-600" size={28} />
              <h2 className="text-2xl font-bold text-gray-800">Помісячне споживання</h2>
            </div>
            <p className="text-sm text-gray-600 mb-6">Введіть споживання електроенергії по місяцях (кВт·год). Поля не обов'язкові.</p>
            
            <div className="grid grid-cols-2 gap-4">
              {monthNames.map((month, index) => (
                <div key={index}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{month}</label>
                  <input 
                    type="number"
                    value={formData.months[index]}
                    onChange={(e) => {
                      const newMonths = [...formData.months];
                      newMonths[index] = e.target.value;
                      setFormData(prev => ({...prev, months: newMonths}));
                    }}
                    placeholder="0"
                    min="0"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/80 backdrop-blur-sm transition-all duration-200"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Calculate Button */}
        <div className="text-center mb-8">
          <button 
            onClick={calculateResults}
            className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-green-600 text-white font-bold text-lg rounded-2xl hover:shadow-2xl hover:scale-105 transition-all duration-300 transform"
          >
            <Calculator size={24} />
            Розрахувати потенціал
            <Sun size={24} />
          </button>
        </div>

        {/* Results */}
        {showResults && results && (
          <div className="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-white/20 mb-8 animate-in slide-in-from-bottom duration-500">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-8">Результати розрахунків 📊</h2>
            
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl text-white text-center">
                <Zap className="mx-auto mb-2" size={32} />
                <p className="text-sm font-medium opacity-90">Річна генерація</p>
                <p className="text-2xl font-bold">{results.annualGeneration} кВт·год</p>
              </div>
              <div className="bg-gradient-to-br from-green-500 to-green-600 p-6 rounded-xl text-white text-center">
                <DollarSign className="mx-auto mb-2" size={32} />
                <p className="text-sm font-medium opacity-90">Економія за рік</p>
                <p className="text-2xl font-bold">{results.savings} грн</p>
              </div>
              <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 p-6 rounded-xl text-white text-center">
                <TrendingUp className="mx-auto mb-2" size={32} />
                <p className="text-sm font-medium opacity-90">Прибуток (після податків)</p>
                <p className="text-2xl font-bold">{results.netProfit} грн</p>
              </div>
              <div className="bg-gradient-to-br from-purple-500 to-purple-600 p-6 rounded-xl text-white text-center">
                <CheckCircle className="mx-auto mb-2" size={32} />
                <p className="text-sm font-medium opacity-90">Загальна вигода</p>
                <p className="text-2xl font-bold">{results.totalBenefit} грн</p>
              </div>
            </div>

            {/* Additional Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <p className="text-sm font-medium text-gray-700">Власне споживання</p>
                <p className="text-xl font-bold text-blue-600">{results.consumptionRatio}%</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <p className="text-sm font-medium text-gray-700">Самозабезпеченість</p>
                <p className="text-xl font-bold text-green-600">{results.selfSufficiency}%</p>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg text-center">
                <p className="text-sm font-medium text-gray-700">Надлишок енергії</p>
                <p className="text-xl font-bold text-yellow-600">{results.excessGeneration} кВт·год</p>
              </div>
            </div>

            {results.netProfit > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-6">
                <p className="text-sm text-amber-800">
                  💡 <strong>Податки:</strong> З прибутку від продажу електроенергії сплачуються: ПДФО (18%) + військовий збір (5%) = 23%
                </p>
              </div>
            )}

            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">Помісячний баланс енергії</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={results.monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip 
                      labelFormatter={(label) => `Місяць: ${label}`}
                      formatter={(value, name) => [
                        `${Math.round(value)} кВт·год`,
                        name === 'generation' ? 'Генерація' : 'Споживання'
                      ]}
                    />
                    <Legend 
                      formatter={(value) => value === 'generation' ? 'Генерація' : 'Споживання'}
                    />
                    <Bar dataKey="generation" fill="#10b981" name="generation" />
                    <Bar dataKey="consumption" fill="#ef4444" name="consumption" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {results.pieData.length > 0 && (
                <div className="bg-white p-6 rounded-xl shadow-lg">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">Розподіл генерації</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={results.pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({name, value}) => `${name}: ${Math.round(value)} кВт·год`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {results.pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${Math.round(value)} кВт·год`, '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="text-center mt-6">
              <p className="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg">
                ⚠️ Це приблизні розрахункові значення. Фактична генерація залежить від кута нахилу панелей, 
                орієнтації, затінення, погодних умов та якості обладнання.
              </p>
            </div>
          </div>
        )}

        {/* Contact Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in duration-300">
              <div className="flex items-center gap-3 mb-6">
                <Phone className="text-blue-600" size={28} />
                <h2 className="text-2xl font-bold text-gray-800">Контактні дані</h2>
              </div>
              
              <div className="space-y-4 mb-6">
                <InputField label="Ім'я">
                  <input 
                    type="text"
                    value={contactData.firstName}
                    onChange={(e) => setContactData(prev => ({...prev, firstName: e.target.value}))}
                    placeholder="Введіть ваше ім'я"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </InputField>

                <InputField label="Номер телефону">
                  <input 
                    type="tel"
                    value={contactData.phone}
                    onChange={(e) => setContactData(prev => ({...prev, phone: e.target.value}))}
                    placeholder="+380123456789"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </InputField>

                <InputField label="Чи ви є клієнтом компанії?">
                  <select 
                    value={contactData.isClient}
                    onChange={(e) => setContactData(prev => ({...prev, isClient: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Виберіть опцію</option>
                    <option value="Так">Так</option>
                    <option value="Ні">Ні</option>
                  </select>
                </InputField>

                <InputField label="Чи можемо з вами зв'язатись?">
                  <select 
                    value={contactData.contactRequest}
                    onChange={(e) => setContactData(prev => ({...prev, contactRequest: e.target.value}))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Виберіть опцію</option>
                    <option value="Так">Так, зв'яжіться зі мною</option>
                    <option value="Ні">Ні, дякую</option>
                  </select>
                </InputField>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 text-white p-4 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Відправляємо...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={20} />
                      Надіслати
                    </>
                  )}
                </button>
                
                <button 
                  onClick={() => setShowModal(false)}
                  className="w-full bg-gray-200 text-gray-700 p-4 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
                >
                  Закрити
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {showConfirmation && (
          <div className="fixed top-4 right-4 bg-green-100 border border-green-300 text-green-800 p-6 rounded-xl shadow-lg z-50 max-w-sm animate-in slide-in-from-right duration-500">
            <div className="flex items-center gap-3">
              <CheckCircle className="text-green-600" size={24} />
              <div>
                <p className="font-bold">Дякуємо, {contactData.firstName}!</p>
                <p className="text-sm">Ми зв'яжемося з вами за номером {contactData.phone}</p>
              </div>
            </div>
            <button 
              onClick={() => setShowConfirmation(false)}
              className="absolute top-2 right-2 text-green-600 hover:text-green-800"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SolarCalculator;