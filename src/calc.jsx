import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Sun, Calculator, Phone, CheckCircle, AlertCircle, TrendingUp, Zap, DollarSign, BrainCircuit, ShieldCheck, Rocket, Users, BatteryCharging, Info, Lightbulb, Leaf, Home, Coins, Award, Target, ArrowRight } from 'lucide-react';
// +++ 1. ІМПОРТ КЛІЄНТА SUPABASE +++
import { createClient } from '@supabase/supabase-js';


// +++ 2. СТВОРЕННЯ КЛІЄНТА З ВАШИМИ КЛЮЧАМИ +++
// ⚠️ Важливо: Замініть на ваші реальні дані з панелі Supabase (Settings -> API)
const supabaseUrl = 'https://dymcoyjwtytfiszvncrn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5bWNveWp3dHl0ZmlzenZuY3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc2NjEzMDAsImV4cCI6MjA3MzIzNzMwMH0.FGNCLp94xkq-Rdr0NOUCX2YCe1-1y_RpEEww43QzV8s';
const supabase = createClient(supabaseUrl, supabaseAnonKey);


// --- Constants and Configuration ---
const MONTHLY_GENERATION_PER_KW = [41.74, 53.67, 95.43, 143.36, 145.98, 157.96, 157.96, 154.97, 130.85, 65.61, 47.63, 35.83];
const MONTH_NAMES_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

const TARIFFS = { private: 4.32, business: 8.96, greenTariff: 0.13, euroToUah: 47 };
const TAX_RATE = 0.23; // 18% ПДФО + 5% Військовий збір

const UKRAINE_REGIONS = ["Вінницька обл.", "Волинська обл.", "Дніпропетровська обл.", "Донецька обл.", "Житомирська обл.", "Закарпатська обл.", "Запорізька обл.", "Івано-Франківська обл.", "Київська обл.", "Кіровоградська обл.", "Луганська обл.", "Львівська обл.", "Миколаївська обл.", "Одеська обл.", "Полтавська обл.", "Рівненська обл.", "Сумська обл.", "Тернопільська обл.", "Харківська обл.", "Херсонська обл.", "Хмельницька обл.", "Черкаська обл.", "Чернівецька обл.", "Чернігівська обл.", "м. Київ"];

// --- Reusable UI Components (без змін) ---
// ... (увесь ваш код для компонентів CustomSelect, InputField, etc. залишається тут)
const CustomSelect = ({ children, ...props }) => (
    <div className="relative">
        <select {...props} className="w-full p-3 border border-gray-300 rounded-lg appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white transition-colors">
            {children}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
        </div>
    </div>
);

const InputField = React.memo(({ label, error, children }) => (
    <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {children}
        {error && (
            <p className="text-sm text-red-600 flex items-center gap-1.5 pt-1">
                <AlertCircle size={16} />
                {error}
            </p>
        )}
    </div>
));

const InfoTooltip = ({ text }) => (
    <div className="group relative flex items-center">
        <Info size={16} className="text-white/70 cursor-pointer hover:text-white transition-colors" />
        <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
            {text}
        </div>
    </div>
);

const ResultCard = ({ icon, title, value, unit, gradient, infoText, isInfoCard = false, children, className = "" }) => (
    <div className={`p-6 rounded-xl text-white shadow-lg flex flex-col h-full transition-all hover:scale-105 hover:shadow-xl ${gradient} ${className}`}>
        <div className="flex justify-between items-start mb-3">
            <div className="w-fit bg-white/20 p-3 rounded-full backdrop-blur-sm">
                {icon}
            </div>
            {infoText && <InfoTooltip text={infoText} />}
        </div>
        <div className="flex-grow flex flex-col justify-center text-center">
            <p className="text-base font-medium opacity-90 mb-2">{title}</p>
            {isInfoCard ? (
                <div className="mt-2 text-sm opacity-90">{children}</div>
            ) : (
                <p className="text-3xl font-bold">
                    {value} <span className="text-xl font-normal opacity-80">{unit}</span>
                </p>
            )}
        </div>
    </div>
);

const PhoneInput = ({ value, onChange, error }) => (
    <InputField label="Номер телефону" error={error}>
        <div className="flex items-center">
            <span className="p-3 border border-r-0 border-gray-300 bg-gray-50 rounded-l-lg text-gray-600 font-medium">
                +380
            </span>
            <input 
                type="tel" 
                value={value} 
                onChange={onChange} 
                placeholder="XX XXX XX XX" 
                className="w-full p-3 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                maxLength="9" 
            />
        </div>
    </InputField>
);
const renderCustomizedLabel = ({ cx, cy, midAngle, outerRadius, percent, name, value }) => {
    if (percent < 0.05) return null; // Не показываем метки для очень малых сегментов
    
    const RADIAN = Math.PI / 180;
    const radius = outerRadius * 1.4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
        <text 
            x={x} 
            y={y} 
            fill="#374151" 
            textAnchor={x > cx ? 'start' : 'end'} 
            dominantBaseline="central" 
            className="text-xs font-medium"
        >
            <tspan x={x} dy="0em" className="font-bold text-sm">
                {`${(percent * 100).toFixed(0)}%`}
            </tspan>
            <tspan x={x} dy="1.2em" className="text-xs">
                {name}
            </tspan>
            <tspan x={x} dy="2.2em" className="text-xs opacity-80">
                {`${Math.round(value)} кВт⋅год`}
            </tspan>
        </text>
    );
};
const BenefitsSection = ({ stationType, greenTariff, results }) => {
    const scenario = `${stationType}-${greenTariff}`;
    
    const benefits = {
        'Мережева-Ні': { 
            title: "Переваги мережевої станції для себе", 
            icon: <Home className="inline-block mr-2 text-blue-600" />,
            text: "Така станція працює синхронно з мережею, щоб максимально покрити ваше власне споживання вдень. Це найдоступніший спосіб суттєво зменшити рахунки за електроенергію, використовуючи сонячну енергію в реальному часі.",
            color: "from-blue-500 to-cyan-500"
        },
        'Мережева-Так': { 
            title: "Переваги мережевої станції з 'зеленим тарифом'", 
            icon: <Coins className="inline-block mr-2 text-green-600" />,
            text: "Це ваш шлях до максимальної фінансової віддачі. Станція не тільки покриває ваше споживання, але й автоматично продає всі надлишки в мережу. Ідеальний вибір для швидкої окупності та отримання пасивного доходу.",
            color: "from-green-500 to-emerald-500"
        },
        'Гібридна-Ні': { 
            title: "Переваги гібридної станції для енергонезалежності", 
            icon: <BatteryCharging className="inline-block mr-2 text-purple-600" />, 
            text: "Ваша особиста фортеця енергії. Акумулятори накопичують надлишки для живлення будинку вночі або під час відключень світла. Ви отримуєте комфорт, безпеку та незалежність від загальної мережі.",
            color: "from-purple-500 to-indigo-500"
        },
        'Гібридна-Так': { 
            title: "Максимум можливостей: гібридна станція з 'зеленим тарифом'", 
            icon: <Award className="inline-block mr-2 text-amber-600" />, 
            text: "Найкраще з двох світів: ви отримуєте енергетичну незалежність завдяки акумуляторам і водночас заробляєте, продаючи надлишки в мережу. Це комплексне рішення для повної автономії та максимального прибутку.",
            color: "from-amber-500 to-orange-500"
        }
    };

    const selectedBenefit = benefits[scenario] || {
        title: "Чому сонячна енергія — це вигідно?",
        icon: <Sun className="inline-block mr-2 text-yellow-600" />,
        text: "Сонячні станції дозволяють суттєво зменшити рахунки за електроенергію. Залежно від типу станції, ви можете отримати енергонезалежність або навіть стабільний пасивний дохід.",
        color: "from-yellow-500 to-orange-500"
    };

    // Додаткові рекомендації на основі результатів
    const getAdditionalRecommendations = () => {
        if (!results) return [];
        
        const recommendations = [];
        const annualGeneration = parseFloat(results.annualGeneration);
        const savings = parseFloat(results.savings);
        const netProfit = parseFloat(results.netProfit);
        
        if (stationType === 'Мережева' && greenTariff === 'Ні' && annualGeneration > 0) {
            const excessRatio = Math.max(0, annualGeneration - (savings / TARIFFS.private)) / annualGeneration;
            if (excessRatio > 0.3) {
                recommendations.push({
                    icon: <TrendingUp className="text-green-600" />,
                    title: "Розгляньте зелений тариф",
                    text: `У вас ${(excessRatio * 100).toFixed(0)}% невикористаної генерації. З зеленим тарифом ви могли б заробляти додатково близько ${((annualGeneration * excessRatio * TARIFFS.greenTariff * TARIFFS.euroToUah) * (1 - TAX_RATE)).toFixed(0)} грн/рік.`
                });
            }
        }

        if (netProfit > 10000) {
            recommendations.push({
                icon: <Target className="text-purple-600" />,
                title: "Відмінний вибір для інвестиції",
                text: "Ваш річний чистий прибуток складає понад 10,000 грн. Це чудова довгострокова інвестиція з стабільним доходом."
            });
        }

        if (stationType === 'Мережева' && savings > 15000) {
            recommendations.push({
                icon: <BatteryCharging className="text-indigo-600" />,
                title: "Розгляньте гібридну систему",
                text: "З такою високою економією варто подумати про додавання акумуляторів для повної енергонезалежності."
            });
        }

        return recommendations;
    };

    const additionalRecommendations = getAdditionalRecommendations();

    return (
        <section className="mt-12 space-y-8">
            {/* Основні переваги */}
            <div className={`bg-gradient-to-r ${selectedBenefit.color} p-8 rounded-2xl shadow-xl text-white`}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                    <div className="space-y-6">
                        <h3 className="text-3xl font-bold flex items-center">
                            {selectedBenefit.icon}
                            {selectedBenefit.title}
                        </h3>
                        <p className="text-lg leading-relaxed opacity-90">
                            {selectedBenefit.text}
                        </p>
                    </div>
                    <div className="bg-white/20 backdrop-blur-sm p-6 rounded-xl border border-white/30">
                        <h4 className="text-2xl font-bold mb-4 text-center">Чому варто обрати РБП Груп Кайрос?</h4>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <ShieldCheck className="w-8 h-8 mt-1 flex-shrink-0" />
                                <div>
                                    <h5 className="font-semibold text-lg">Досвід та надійність</h5>
                                    <p className="text-sm opacity-90">8+ років на ринку, 450+ успішно реалізованих проєктів.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <Rocket className="w-8 h-8 mt-1 flex-shrink-0" />
                                <div>
                                    <h5 className="font-semibold text-lg">Швидкість та якість</h5>
                                    <p className="text-sm opacity-90">Виконуємо проєкти "під ключ", гарантуючи якість на кожному етапі.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <Users className="w-8 h-8 mt-1 flex-shrink-0" />
                                <div>
                                    <h5 className="font-semibold text-lg">Довіра клієнтів</h5>
                                    <p className="text-sm opacity-90">Серед наших клієнтів — приватні домогосподарства, бізнес та державні установи.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Додаткові рекомендації */}
            {additionalRecommendations.length > 0 && (
                <div className="bg-white/70 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-white/20">
                    <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                        <Lightbulb className="mr-3 text-amber-500" />
                        Персональні рекомендації для вас
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {additionalRecommendations.map((rec, index) => (
                            <div key={index} className="bg-gradient-to-r from-gray-50 to-blue-50 p-6 rounded-xl border border-blue-100">
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-md">
                                        {rec.icon}
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-gray-800 mb-2">{rec.title}</h4>
                                        <p className="text-gray-600 text-sm leading-relaxed">{rec.text}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
};
// --- Main Calculator Component ---
const SolarCalculator = () => {
    const [formData, setFormData] = useState({ 
        objectType: '', 
        stationType: '', 
        region: '', 
        powerCapacity: '', 
        greenTariff: 'Так', 
        months: Array(12).fill('') 
    });
    const [contactData, setContactData] = useState({ firstName: '', phone: '' });
    const [results, setResults] = useState(null);
    const [recommendation, setRecommendation] = useState('');
    const [calculationDone, setCalculationDone] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});
    const [contactErrors, setContactErrors] = useState({});

    const resultsRef = useRef(null);

    useEffect(() => {
        if (calculationDone && resultsRef.current) {
            resultsRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        }
    }, [calculationDone]);

    const annualConsumption = useMemo(() => 
        formData.months.reduce((sum, val) => sum + (parseFloat(val) || 0), 0), 
        [formData.months]
    );

    const handleFormChange = useCallback((e) => 
        setFormData(p => ({ ...p, [e.target.name]: e.target.value })), 
        []
    );

    const handleMonthChange = useCallback((index, value) => {
        const newMonths = [...formData.months];
        newMonths[index] = value;
        setFormData(p => ({ ...p, months: newMonths }));
    }, [formData.months]);

    const handlePhoneChange = (e) => 
        setContactData(p => ({ ...p, phone: e.target.value.replace(/\D/g, '') }));

    const validatePhoneNumber = (phone) => {
        if (phone.length !== 9) return false;
        if (/^(\d)\1{8}$/.test(phone)) return false;
        const seq = "0123456789"; 
        const revSeq = "9876543210";
        if (seq.includes(phone) || revSeq.includes(phone)) return false;
        return true;
    };

    const validateMainForm = () => {
        const errors = {};
        if (!formData.objectType) errors.objectType = "Оберіть тип об'єкта";
        if (!formData.stationType) errors.stationType = "Оберіть тип станції";
        if (!formData.region) errors.region = "Оберіть ваш регіон";
        if (!formData.powerCapacity || parseFloat(formData.powerCapacity) <= 0) 
            errors.powerCapacity = "Введіть потужність";
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCalculateClick = () => {
        if (validateMainForm()) {
            setShowModal(true);
        } else {
            setCalculationDone(false);
            setResults(null);
        }
    };
    
    // +++ 3. ОНОВЛЕНА ФУНКЦІЯ для відправки даних +++
    const handleModalSubmitAndCalculate = async () => {
        const errors = {};
        if (!contactData.firstName.trim()) errors.firstName = "Ім'я є обов'язковим полем";
        if (!validatePhoneNumber(contactData.phone))
            errors.phone = "Введіть коректний 9-значний номер";
        setContactErrors(errors);

        if (Object.keys(errors).length > 0) return;

        setIsSubmitting(true);
        
        try {
            const leadData = {
                first_name: contactData.firstName.trim(),
                phone_number: contactData.phone,
                object_type: formData.objectType,
                station_type: formData.stationType,
                region: formData.region,
                power_capacity_kw: parseFloat(formData.powerCapacity),
                green_tariff: formData.greenTariff === 'Так',
                monthly_consumption_kwh: formData.months
                    .map(month => parseFloat(month) || 0)
                    .filter(val => val > 0).length > 0 ? formData.months.map(month => parseFloat(month) || 0) : null,
            };

            const { error } = await supabase
                .from('calculator_leads')
                .insert([leadData]);

            if (error) {
                console.error('Помилка збереження даних в Supabase:', error);
                throw new Error(error.message);
            }

        } catch (error) {
            setIsSubmitting(false);
            alert("Не вдалося зберегти ваші дані. Спробуйте, будь ласка, пізніше.");
            return;
        }

        // --- Код для розрахунків (виконується після успішного збереження) ---
        const powerCapacity = parseFloat(formData.powerCapacity);
        const useGreenTariff = formData.greenTariff === 'Так';
        const electricityRate = formData.objectType === 'Приватний' ? TARIFFS.private : TARIFFS.business;
        const annualGeneration = MONTHLY_GENERATION_PER_KW.reduce((a, b) => a + b, 0) * powerCapacity;
        
        const selfConsumption = Math.min(annualGeneration, annualConsumption || annualGeneration);
        const savings = selfConsumption * electricityRate;
        const excessGeneration = Math.max(0, annualGeneration - (annualConsumption || 0));
        const grossProfit = useGreenTariff ? excessGeneration * TARIFFS.greenTariff * TARIFFS.euroToUah : 0;
        const netProfit = grossProfit * (1 - TAX_RATE);
        const additionalCost = Math.max(0, (annualConsumption || 0) - annualGeneration) * electricityRate;
        
        let totalBenefit;
        let savingsInfoText = "Розраховується як обсяг власного споживання, помножений на ваш тариф. Якщо споживання не вказано — як вся генерація, помножена на тариф.";
        let netProfitInfoText = "Прибуток від продажу надлишків за 'зеленим тарифом'. Вже враховано податок 23% (18% ПДФО + 5% ВЗ).";
        let newRecommendation = '';

        if (useGreenTariff && annualConsumption === 0) {
            totalBenefit = savings;
            savingsInfoText = "Значення розраховане за умови, що вся згенерована енергія йде на покриття ваших власних потреб.";
            netProfitInfoText = "Значення можливе, якщо вся згенерована енергія продається за 'зеленим тарифом'. Для більш точного розрахунку рекомендуємо заповнити інформацію про власне місячне споживання.";
        } else {
            totalBenefit = savings + netProfit - additionalCost;
        }

        if (formData.stationType === 'Мережева' && !useGreenTariff && excessGeneration > selfConsumption * 0.3 && annualConsumption > 0) {
            newRecommendation = `У вашому випадку річна генерація значно перевищує споживання. Ми рекомендуємо розглянути підключення "зеленого тарифу" для продажу надлишків, або зменшити потужність станції для оптимізації інвестицій.`;
        }
        
        setRecommendation(newRecommendation);

        const monthlyData = MONTH_NAMES_SHORT.map((name, i) => ({
            month: name,
            'Генерація': Math.round(MONTHLY_GENERATION_PER_KW[i] * powerCapacity),
            'Споживання': Math.round(parseFloat(formData.months[i]) || 0),
            'Баланс': Math.round((MONTHLY_GENERATION_PER_KW[i] * powerCapacity) - (parseFloat(formData.months[i]) || 0))
        }));

        const pieData = [];
        if (selfConsumption > 0.1) {
            pieData.push({ 
                name: 'Власне споживання', 
                value: selfConsumption, 
                color: '#3b82f6' 
            });
        }
        if (excessGeneration > 0.1) {
            pieData.push({ 
                name: useGreenTariff ? 'Продаж в мережу' : 'Невикористаний надлишок', 
                value: excessGeneration, 
                color: useGreenTariff ? '#10b981' : '#f59e0b' 
            });
        }

        setResults({
            annualGeneration: annualGeneration.toFixed(0),
            savings: savings.toFixed(0),
            netProfit: netProfit.toFixed(0),
            totalBenefit: totalBenefit.toFixed(0),
            monthlyData,
            pieData,
            savingsInfoText,
            netProfitInfoText
        });

        setIsSubmitting(false);
        setShowModal(false);
        setCalculationDone(true);
        setContactErrors({});
    };

    const recommendPower = useCallback(() => {
        if (annualConsumption > 0) {
            const annualGenerationPerKW = MONTHLY_GENERATION_PER_KW.reduce((s, v) => s + v, 0);
            const recommendedPower = (annualConsumption * 1.10) / annualGenerationPerKW;
            setFormData(p => ({...p, powerCapacity: recommendedPower.toFixed(1)}));
        }
    }, [annualConsumption]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
           {/* ... (увесь ваш JSX код для рендерингу залишається без змін) ... */}
           <div className="container mx-auto px-4 py-6 sm:py-10 max-w-7xl">
                {/* Заголовок с анимацией */}
                <header className="text-center mb-12 animate-in fade-in slide-in-from-top duration-1000">
                    <div className="inline-flex items-center justify-center gap-3 mb-6">
                        <div className="relative">
                            <Sun className="text-yellow-500 w-12 h-12 sm:w-16 sm:h-16 animate-pulse" />
                            <div className="absolute inset-0 bg-yellow-400 rounded-full blur-xl opacity-30 animate-pulse"></div>
                        </div>
                        <h1 className="text-2xl sm:text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-green-600 bg-clip-text text-transparent">
                            Калькулятор сонячної станції
                        </h1>
                    </div>
                    <p className="text-sm sm:text-base text-gray-600 max-w-3xl mx-auto leading-relaxed">
                        Оцініть потенційну генерацію, економію та прибуток від власної СЕС. 
                        Отримайте персональні рекомендації для максимальної ефективності.
                    </p>
                </header>
                
                <main className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    {/* Форма */}
                    <div className="lg:col-span-3 space-y-8">
                        <section className="bg-white/70 backdrop-blur-sm p-4 sm:p-8 rounded-2xl shadow-xl border border-white/20 transition-all hover:shadow-2xl">
                            <div className="flex items-center gap-3 mb-6">
                                <Calculator className="text-blue-600" size={28} />
                                <h2 className="text-2xl font-bold text-gray-800">1. Параметри системи</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <InputField label="Тип об'єкта" error={validationErrors.objectType}>
                                    <CustomSelect name="objectType" value={formData.objectType} onChange={handleFormChange}>
                                        <option value="">Оберіть...</option>
                                        <option value="Приватний">🏠 Приватний будинок</option>
                                        <option value="Бізнес">🏢 Бізнес</option>
                                    </CustomSelect>
                                </InputField>
                                <InputField label="Тип станції" error={validationErrors.stationType}>
                                    <CustomSelect name="stationType" value={formData.stationType} onChange={handleFormChange}>
                                        <option value="">Оберіть...</option>
                                        <option value="Мережева">⚡ Мережева (без АКБ)</option>
                                        <option value="Гібридна">🔋 Гібридна (з АКБ)</option>
                                    </CustomSelect>
                                </InputField>
                                <InputField label="Ваш регіон" error={validationErrors.region}>
                                    <CustomSelect name="region" value={formData.region} onChange={handleFormChange}>
                                        <option value="">Оберіть область...</option>
                                        {UKRAINE_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </CustomSelect>
                                </InputField>
                                <InputField label="Продаж за 'зеленим тарифом'?" error={validationErrors.greenTariff}>
                                    <CustomSelect name="greenTariff" value={formData.greenTariff} onChange={handleFormChange}>
                                        <option value="Так">✅ Так, продавати</option>
                                        <option value="Ні">❌ Ні, для себе</option>
                                    </CustomSelect>
                                </InputField>
                                <div className="md:col-span-2">
                                    <InputField label="Потужність станції (кВт)" error={validationErrors.powerCapacity}>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                name="powerCapacity" 
                                                value={formData.powerCapacity} 
                                                onChange={handleFormChange} 
                                                placeholder="Напр., 10" 
                                                min="0" 
                                                step="0.1" 
                                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                            />
                                            <button 
                                                onClick={recommendPower} 
                                                disabled={!annualConsumption} 
                                                title="Авто-підбір потужності" 
                                                className="p-3 bg-blue-100 text-blue-700 rounded-lg disabled:opacity-50 hover:bg-blue-200 transition-all hover:scale-105 disabled:hover:scale-100"
                                            >
                                                <BrainCircuit size={20}/>
                                            </button>
                                        </div>
                                    </InputField>
                                </div>
                            </div>
                        </section>

                        <section className="bg-white/70 backdrop-blur-sm p-4 sm:p-8 rounded-2xl shadow-xl border border-white/20 transition-all hover:shadow-2xl">
                            <div className="flex items-center gap-3 mb-4">
                                <TrendingUp className="text-green-600" size={28} />
                                <h2 className="text-2xl font-bold text-gray-800">2. Ваше споживання (кВт⋅год)</h2>
                            </div>
                            <p className="text-sm text-gray-600 mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100">
                                <Info className="inline mr-2" size={16} />
                                Необов'язково, але допомагає розрахувати розподіл енергії та економію. 
                                Дані можна знайти в рахунках за електроенергію.
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-3 gap-y-4 sm:gap-4">
                                {MONTH_NAMES_SHORT.map((month, index) => (
                                    <InputField key={month} label={month}>
                                        <input 
                                            type="number" 
                                            value={formData.months[index]} 
                                            onChange={(e) => handleMonthChange(index, e.target.value)} 
                                            placeholder="0" 
                                            min="0" 
                                            className="w-full p-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                        />
                                    </InputField>
                                ))}
                            </div>
                            {annualConsumption > 0 && (
                                <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                                    <p className="text-green-800 font-medium">
                                        Загальне річне споживання: <span className="font-bold">{annualConsumption.toFixed(0)} кВт⋅год</span>
                                    </p>
                                </div>
                            )}
                        </section>
                    </div>

                    {/* Бічна панель */}
                    <aside className="lg:col-span-2">
                        <div className="sticky top-8 bg-gradient-to-br from-purple-600 via-blue-600 to-cyan-600 p-8 rounded-2xl shadow-2xl text-white text-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-white/10 backdrop-blur-sm"></div>
                            <div className="relative z-10">
                                <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                                    <Zap className="w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-bold mb-4">3. Розрахунок вигоди</h2>
                                <p className="mb-6 opacity-90 leading-relaxed">
                                    Заповніть поля та натисніть кнопку, щоб побачити ваш персональний розрахунок 
                                    з детальною візуалізацією та рекомендаціями.
                                </p>
                                <button 
                                    onClick={handleCalculateClick} 
                                    className="w-full inline-flex items-center justify-center gap-3 px-5 py-3 sm:px-6 sm:py-4 bg-white text-blue-600 font-bold text-base sm:text-lg rounded-xl hover:bg-gray-50 hover:shadow-xl hover:scale-105 transition-all duration-300"
                                >
                                    <Calculator size={22} />
                                    Розрахувати вигоду
                                </button>
                                <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                                    <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
                                        <Leaf className="w-6 h-6 mx-auto mb-2" />
                                        <p className="text-xs opacity-90">Екологічно</p>
                                    </div>
                                    <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
                                        <DollarSign className="w-6 h-6 mx-auto mb-2" />
                                        <p className="text-xs opacity-90">Вигідно</p>
                                    </div>
                                    <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
                                        <ShieldCheck className="w-6 h-6 mx-auto mb-2" />
                                        <p className="text-xs opacity-90">Надійно</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </aside>
                </main>
                
                <div ref={resultsRef}> 
                    {/* Секція переваг */}
                    {calculationDone && <BenefitsSection stationType={formData.stationType} greenTariff={formData.greenTariff} results={results} />}
                    
                    {/* Персональна рекомендація */}
                    {calculationDone && recommendation && (
                        <section className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-6 rounded-xl shadow-lg mt-8 animate-in fade-in duration-700">
                            <div className="flex items-start gap-4">
                                <div className="bg-amber-100 p-3 rounded-full">
                                    <Lightbulb className="text-amber-600 w-8 h-8" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-amber-800 mb-2">Персональна рекомендація</h3>
                                    <p className="text-amber-700">{recommendation}</p>
                                </div>
                            </div>
                        </section>
                    )}
                    
                    {/* Результати */}
                    {calculationDone && results && (
                        <section className="bg-white/70 backdrop-blur-sm p-4 sm:p-8 rounded-2xl shadow-xl border border-white/20 mt-8 animate-in slide-in-from-bottom duration-500">
                            <h2 className="text-3xl font-bold text-center text-gray-800 mb-8 flex items-center justify-center gap-3">
                                <Award className="text-purple-600" />
                                📊 Ваші персональні результати
                            </h2>
                            
                            {/* Карточки результатів */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
                                <ResultCard 
                                    icon={<Zap size={32}/>} 
                                    title="Річна генерація" 
                                    value={results.annualGeneration} 
                                    unit="кВт⋅год" 
                                    gradient="bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-600" 
                                />
                                <ResultCard 
                                    icon={<DollarSign size={32}/>} 
                                    title="Економія" 
                                    value={results.savings} 
                                    unit="грн/рік" 
                                    gradient="bg-gradient-to-br from-green-500 via-emerald-600 to-teal-600" 
                                    infoText={results.savingsInfoText}
                                />
                                {formData.greenTariff === 'Так' ? (
                                    <ResultCard 
                                        icon={<TrendingUp size={32}/>} 
                                        title="Чистий прибуток" 
                                        value={results.netProfit} 
                                        unit="грн/рік" 
                                        gradient="bg-gradient-to-br from-amber-500 via-orange-500 to-red-500" 
                                        infoText={results.netProfitInfoText}
                                    />
                                ) : (
                                    <ResultCard 
                                        icon={<TrendingUp size={32}/>} 
                                        title="Чистий прибуток" 
                                        gradient="bg-gradient-to-br from-gray-400 to-gray-500" 
                                        isInfoCard={true}
                                    >
                                        <p>Розраховується лише при підключенні "зеленого тарифу".</p>
                                    </ResultCard>
                                )}
                                <ResultCard 
                                    icon={<CheckCircle size={32}/>} 
                                    title="Загальна вигода" 
                                    value={results.totalBenefit} 
                                    unit="грн/рік" 
                                    gradient="bg-gradient-to-br from-purple-500 via-pink-500 to-rose-500" 
                                    infoText="Сума вашої економії та чистого прибутку, мінус вартість електроенергії, докупленої з мережі при необхідності." 
                                />
                            </div>

                            {/* Графіки */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                                    <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center flex items-center justify-center gap-2">
                                        <BarChart className="w-5 h-5 text-blue-600" />
                                        Баланс енергії (кВт⋅год)
                                    </h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={results.monthlyData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                            <XAxis 
                                                dataKey="month" 
                                                fontSize={12} 
                                                tick={{ fill: '#6b7280' }}
                                                axisLine={{ stroke: '#d1d5db' }}
                                            />
                                            <YAxis 
                                                fontSize={12} 
                                                tick={{ fill: '#6b7280' }}
                                                axisLine={{ stroke: '#d1d5db' }}
                                            />
                                            <Tooltip 
                                                formatter={(v, n) => [`${Math.round(v)} кВт⋅год`, n]} 
                                                contentStyle={{
                                                    backgroundColor: '#f9fafb',
                                                    border: '1px solid #e5e7eb',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                                }}
                                            />
                                            <Legend />
                                            <Bar 
                                                dataKey="Генерація" 
                                                fill="#10b981" 
                                                radius={[4, 4, 0, 0]} 
                                                name="Генерація СЕС"
                                            />
                                            <Bar 
                                                dataKey="Споживання" 
                                                fill="#3b82f6" 
                                                radius={[4, 4, 0, 0]} 
                                                name="Ваше споживання"
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {results.pieData.length > 0 && (
                                    <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                                        <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center flex items-center justify-center gap-2">
                                            <Target className="w-5 h-5 text-green-600" />
                                            Розподіл генерації
                                        </h3>
                                        <ResponsiveContainer width="100%" height={350}>
                                            <PieChart margin={{ top: 20, right: 60, bottom: 20, left: 60 }}>
                                                <Pie 
                                                    data={results.pieData} 
                                                    dataKey="value" 
                                                    nameKey="name" 
                                                    cx="50%" 
                                                    cy="50%" 
                                                    outerRadius={80} 
                                                    innerRadius={30}
                                                    labelLine={true} 
                                                    label={renderCustomizedLabel} 
                                                    fill="#8884d8"
                                                    stroke="#ffffff"
                                                    strokeWidth={3}
                                                >
                                                    {results.pieData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                </Pie>
                                                <Tooltip 
                                                    formatter={(v, n) => [`${Math.round(v)} кВт⋅год`, n]} 
                                                    contentStyle={{
                                                        backgroundColor: '#f9fafb',
                                                        border: '1px solid #e5e7eb',
                                                        borderRadius: '8px',
                                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                                    }}
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="mt-4 flex flex-wrap justify-center gap-4">
                                            {results.pieData.map((entry, index) => (
                                                <div key={index} className="flex items-center gap-2">
                                                    <div 
                                                        className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                                                        style={{ backgroundColor: entry.color }}
                                                    ></div>
                                                    <span className="text-sm text-gray-600 font-medium">{entry.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="mt-8 bg-gradient-to-r from-blue-50 to-green-50 p-6 rounded-xl border border-blue-100">
                                <h3 className="text-xl font-semibold text-gray-800 mb-4 text-center">🎯 Ключові показники ефективності</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                        <div className="text-2xl font-bold text-blue-600 mb-1">
                                            {results.pieData.length > 0 && results.pieData[0] 
                                                ? ((results.pieData[0].value / parseFloat(results.annualGeneration)) * 100).toFixed(0)
                                                : '100'
                                            }%
                                        </div>
                                        <div className="text-sm text-gray-600">Власне використання</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                        <div className="text-2xl font-bold text-green-600 mb-1">
                                            {((parseFloat(results.totalBenefit) / 12) / 1000).toFixed(1)}k
                                        </div>
                                        <div className="text-sm text-gray-600">Вигода на місяць (грн)</div>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg shadow-sm">
                                        <div className="text-2xl font-bold text-purple-600 mb-1">
                                            {(parseFloat(results.annualGeneration) / 1000 * 0.9).toFixed(1)}
                                        </div>
                                        <div className="text-sm text-gray-600">Зменшення CO₂ (тон/рік)</div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </div>

                {/* Модальне вікно */}
                {showModal && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-50 duration-300 relative">
                            <button 
                                onClick={() => setShowModal(false)} 
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl font-bold hover:scale-110 transition-all"
                            >
                                ✕
                            </button>
                            <div className="text-center mb-6">
                                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Phone className="text-blue-600 w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800">Майже готово!</h2>
                                <p className="text-gray-600 mt-2">
                                    Введіть ваші дані, щоб побачити детальний розрахунок та отримати персональні рекомендації.
                                </p>
                            </div>
                            <div className="space-y-4 mb-6">
                                <InputField label="Ваше ім'я" error={contactErrors.firstName}>
                                    <input 
                                        type="text" 
                                        value={contactData.firstName} 
                                        onChange={(e) => setContactData(p => ({...p, firstName: e.target.value}))} 
                                        placeholder="Ім'я" 
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                    />
                                </InputField>
                                <PhoneInput 
                                    value={contactData.phone} 
                                    onChange={handlePhoneChange} 
                                    error={contactErrors.phone} 
                                />
                            </div>
                            <button 
                                onClick={handleModalSubmitAndCalculate} 
                                disabled={isSubmitting} 
                                className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white p-4 rounded-lg hover:from-green-700 hover:to-blue-700 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all hover:scale-105 disabled:hover:scale-100"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div> 
                                        Розрахунок...
                                    </>
                                ) : (
                                    <>
                                        <ArrowRight size={20} />
                                        Побачити результати
                                    </>
                                )}
                            </button>
                            <p className="text-xs text-gray-500 text-center mt-4">
                                Ваші дані захищені та не будуть передані третім сторонам
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SolarCalculator;