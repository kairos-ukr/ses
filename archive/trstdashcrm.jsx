import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Calendar, MapPin, Zap, User, Phone, Clock, CheckCircle, AlertCircle, Settings, Loader } from 'lucide-react';
// 1. Імпортуємо клієнт Supabase
import { supabase } from './supabaseClient'; // Переконайтесь, що шлях правильний

const SolarPanelDashboard = () => {
  // 2. Змінюємо початковий стан на порожній масив
  const [projects, setProjects] = useState([]);
  // 3. Додаємо стани для завантаження та помилок
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [draggedProject, setDraggedProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('all');

  // ... (масиви stages, priorityColors, priorityLabels залишаються без змін)
  const stages = [
    { id: 'new', title: 'Нові заявки', color: 'bg-blue-100 border-blue-300', textColor: 'text-blue-800', icon: Phone, tasks: ['Перший дзвінок', 'Збір інформації', 'Кваліфікація клієнта'] },
    { id: 'consultation', title: 'Консультація', color: 'bg-yellow-100 border-yellow-300', textColor: 'text-yellow-800', icon: User, tasks: ['Технічна консультація', 'Розрахунок потужності', 'Попередня оцінка'] },
    { id: 'proposal', title: 'Комерційна пропозиція', color: 'bg-orange-100 border-orange-300', textColor: 'text-orange-800', icon: Settings, tasks: ['Підготовка КП', 'Презентація рішення', 'Узгодження умов'] },
    { id: 'measurement', title: 'Заміри та проектування', color: 'bg-purple-100 border-purple-300', textColor: 'text-purple-800', icon: MapPin, tasks: ['Виїзд на об\'єкт', 'Технічні заміри', 'Проектування системи'] },
    { id: 'installation', title: 'Монтаж та запуск', color: 'bg-indigo-100 border-indigo-300', textColor: 'text-indigo-800', icon: Zap, tasks: ['Монтаж панелей', 'Підключення інвертора', 'Налаштування системи', 'Введення в експлуатацію'] },
    { id: 'completed', title: 'Завершено', color: 'bg-green-100 border-green-300', textColor: 'text-green-800', icon: CheckCircle, tasks: ['Здача об\'єкта', 'Навчання клієнта', 'Гарантійне обслуговування'] }
  ];
  const priorityColors = { high: 'border-l-4 border-red-500 bg-red-50', medium: 'border-l-4 border-yellow-500 bg-yellow-50', low: 'border-l-4 border-green-500 bg-green-50' };
  const priorityLabels = { high: 'Високий', medium: 'Середній', low: 'Низький' };

  // 4. Функція для завантаження даних з Supabase
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Запитуємо дані з таблиці 'installations' і пов'язані дані з 'clients'
    const { data, error } = await supabase
      .from('installations')
      .select(`
        custom_id,
        status,
        priority,
        total_cost,
        capacity_kw,
        created_at,
        notes,
        clients (
          full_name,
          phone_number,
          address
        )
      `);

    if (error) {
      console.error('Error fetching projects:', error);
      setError('Не вдалося завантажити проекти. Спробуйте оновити сторінку.');
      setProjects([]);
    } else if (data) {
        // Трансформуємо дані у формат, зручний для компонента
        const formattedProjects = data.map(p => ({
            id: p.custom_id,
            clientName: p.clients?.full_name || 'Клієнт не вказаний',
            phone: p.clients?.phone_number || 'Немає номера',
            address: p.clients?.address || 'Адреса не вказана',
            power: `${p.capacity_kw} кВт`,
            status: p.status,
            priority: p.priority,
            estimatedValue: p.total_cost,
            createdAt: p.created_at,
            notes: p.notes,
        }));
      setProjects(formattedProjects);
    }
    setLoading(false);
  }, []);

  // 5. Викликаємо функцію завантаження при першому рендері
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);


  // 6. Оновлюємо функцію handleDrop, щоб вона була асинхронною
  const handleDrop = async (e, stageId) => {
    e.preventDefault();
    if (draggedProject && draggedProject.status !== stageId) {
      const originalProjects = [...projects];
      
      // Оптимістичне оновлення UI
      setProjects(prevProjects =>
        prevProjects.map(project =>
          project.id === draggedProject.id
            ? { ...project, status: stageId }
            : project
        )
      );

      // Запит на оновлення до Supabase
      const { error } = await supabase
        .from('installations')
        .update({ status: stageId })
        .eq('custom_id', draggedProject.id); // Використовуємо 'custom_id'

      if (error) {
        console.error('Error updating project status:', error);
        setError(`Не вдалося оновити статус для проекту #${draggedProject.id}`);
        // Повертаємо стан до попереднього у разі помилки
        setProjects(originalProjects);
      }
      
      setDraggedProject(null);
    }
  };

  const handleDragStart = (e, project) => {
    setDraggedProject(project);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  // ... (решта функцій: filteredProjects, getProjectsByStage, formatCurrency, getDaysAgo залишаються)
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.phone.includes(searchTerm);
    const matchesPriority = selectedPriority === 'all' || project.priority === selectedPriority;
    return matchesSearch && matchesPriority;
  });

  const getProjectsByStage = (stageId) => {
    return filteredProjects.filter(project => project.status === stageId);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: 'UAH',
      minimumFractionDigits: 0
    }).format(amount || 0); // Додаємо || 0 на випадок null
  };
  
  const getDaysAgo = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const diffTime = Math.abs(today - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const totalValue = filteredProjects.reduce((sum, project) => sum + (project.estimatedValue || 0), 0);
  const completedValue = filteredProjects.filter(p => p.status === 'completed').reduce((sum, project) => sum + (project.estimatedValue || 0), 0);
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <Loader className="animate-spin text-blue-600" size={48} />
        <p className="ml-4 text-xl">Завантаження проектів...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
       <div className="max-w-7xl mx-auto">
        {/* Заголовок та статистика */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 flex items-center gap-3">
                <Zap className="text-yellow-500" size={40} />
                Сонячні панелі - Дашборд проектів
              </h1>
              <p className="text-gray-600 mt-2">Управління проектами встановлення сонячних електростанцій</p>
            </div>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors">
              <Plus size={20} />
              Новий проект
            </button>
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Всього проектів</p>
                  <p className="text-3xl font-bold text-gray-900">{filteredProjects.length}</p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <Settings className="text-blue-600" size={24} />
                </div>
              </div>
            </div>
            
            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Загальна вартість</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalValue)}</p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <Zap className="text-green-600" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Завершено</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(completedValue)}</p>
                </div>
                <div className="bg-green-100 p-3 rounded-full">
                  <CheckCircle className="text-green-600" size={24} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">В роботі</p>
                  <p className="text-3xl font-bold text-blue-600">
                    {filteredProjects.filter(p => p.status !== 'completed').length}
                  </p>
                </div>
                <div className="bg-blue-100 p-3 rounded-full">
                  <Clock className="text-blue-600" size={24} />
                </div>
              </div>
            </div>
          </div>
          
          {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}

          {/* Фільтри */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Пошук за клієнтом, адресою або телефоном..."
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
            >
              <option value="all">Всі пріоритети</option>
              <option value="high">Високий пріоритет</option>
              <option value="medium">Середній пріоритет</option>
              <option value="low">Низький пріоритет</option>
            </select>
          </div>
        </div>

        {/* Kanban дошка */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-6 mb-8">
          {stages.map((stage) => {
            const stageProjects = getProjectsByStage(stage.id);
            const StageIcon = stage.icon;
            
            return (
              <div
                key={stage.id}
                className={`${stage.color} rounded-xl p-4 border-2 min-h-96`}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <StageIcon className={stage.textColor} size={20} />
                    <h3 className={`font-semibold ${stage.textColor}`}>
                      {stage.title}
                    </h3>
                  </div>
                  <span className={`${stage.textColor} bg-white px-2 py-1 rounded-full text-sm font-medium`}>
                    {stageProjects.length}
                  </span>
                </div>

                {/* Задачі етапу */}
                <div className="mb-4">
                  <div className="text-xs text-gray-600 mb-2">Ключові завдання:</div>
                  {stage.tasks.map((task, index) => (
                    <div key={index} className="text-xs text-gray-700 mb-1 flex items-center gap-1">
                      <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                      {task}
                    </div>
                  ))}
                </div>

                {/* Проекти */}
                <div className="space-y-3">
                  {stageProjects.map((project) => (
                    <div
                      key={project.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, project)}
                      className={`bg-white rounded-lg p-4 shadow-md cursor-move hover:shadow-lg transition-all duration-200 transform hover:scale-105 ${priorityColors[project.priority]}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-semibold text-gray-900 text-sm leading-tight">
                          {project.clientName}
                        </h4>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {priorityLabels[project.priority]}
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-xs text-gray-600">
                        <div className="flex items-center gap-1">
                          <MapPin size={12} />
                          <span className="truncate">{project.address}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone size={12} />
                          <span>{project.phone}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Zap size={12} />
                          <span>{project.power}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar size={12} />
                          <span>{getDaysAgo(project.createdAt)} днів тому</span>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-green-600">
                            {formatCurrency(project.estimatedValue)}
                          </span>
                          {project.priority === 'high' && (
                            <AlertCircle size={14} className="text-red-500" />
                          )}
                        </div>
                      </div>

                      {project.notes && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-700">
                          {project.notes}
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {stageProjects.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <div className="text-sm">Немає проектів</div>
                      <div className="text-xs mt-1">Перетягніть сюди картку проекту</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ... (блок Аналітика проектів залишається без змін) */}
      </div>
    </div>
  );
};

export default SolarPanelDashboard;