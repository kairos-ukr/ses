import React, { useState, useRef } from 'react';
import { Calendar, Phone, Mail, DollarSign, Plus, Edit2, X, Save, Zap, Sun, Home } from 'lucide-react';

const SolarCRM = () => {
  const [projects, setProjects] = useState([
    {
      id: 1,
      clientName: "Олександр Петренко",
      phone: "+38 067 123 4567",
      email: "alex.petrenko@gmail.com",
      status: "conversation",
      stage: "Розмова з клієнтом",
      createdDate: "2024-01-15",
      budget: 150000,
      stationType: "hybrid",
      tasks: ["Консультація щодо потужності", "Розрахунок економії"]
    },
    {
      id: 2,
      clientName: "Марина Іваненко",
      phone: "+38 095 987 6543",
      email: "marina.ivanenko@ukr.net",
      status: "proposal",
      stage: "Комерційна пропозиція",
      createdDate: "2024-01-20",
      budget: 200000,
      stationType: "grid",
      tasks: ["Підготовка КП", "Розрахунок окупності"]
    },
    {
      id: 3,
      clientName: "ТОВ 'ЕкоЕнерго'",
      phone: "+38 044 555 7788",
      email: "info@ecoenergo.ua",
      status: "measurement",
      stage: "Заміри",
      createdDate: "2024-01-10",
      budget: 500000,
      stationType: "grid",
      tasks: ["Виїзд на об'єкт", "Технічні заміри", "Фото документація"]
    },
    {
      id: 4,
      clientName: "Андрій Коваленко",
      phone: "+38 050 111 2233",
      email: "kovalen@example.com",
      status: "installation",
      stage: "Монтаж та підключення",
      createdDate: "2024-01-05",
      budget: 180000,
      stationType: "autonomous",
      tasks: ["Встановлення панелей", "Підключення інвертора", "Прокладка кабелю"]
    }
  ]);

  const [showModal, setShowModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draggedProject, setDraggedProject] = useState(null);

  const stages = [
    { id: 'conversation', name: 'Розмова з клієнтом', color: 'bg-blue-100 border-blue-300', textColor: 'text-blue-800' },
    { id: 'proposal', name: 'Комерційна пропозиція', color: 'bg-yellow-100 border-yellow-300', textColor: 'text-yellow-800' },
    { id: 'measurement', name: 'Заміри', color: 'bg-orange-100 border-orange-300', textColor: 'text-orange-800' },
    { id: 'installation', name: 'Монтаж та підключення', color: 'bg-purple-100 border-purple-300', textColor: 'text-purple-800' },
    { id: 'completion', name: 'Завершення та запуск у роботу', color: 'bg-green-100 border-green-300', textColor: 'text-green-800' }
  ];

  const stationTypes = {
    grid: { name: 'Мережева', icon: <Zap className="w-4 h-4" />, color: 'bg-blue-100 text-blue-800' },
    hybrid: { name: 'Гібридна', icon: <Sun className="w-4 h-4" />, color: 'bg-yellow-100 text-yellow-800' },
    autonomous: { name: 'Автономна', icon: <Home className="w-4 h-4" />, color: 'bg-green-100 text-green-800' }
  };

  const handleDragStart = (e, project) => {
    setDraggedProject(project);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, newStage) => {
    e.preventDefault();
    if (draggedProject && draggedProject.status !== newStage) {
      setProjects(prev => prev.map(project =>
        project.id === draggedProject.id
          ? { ...project, status: newStage, stage: stages.find(s => s.id === newStage).name }
          : project
      ));
    }
    setDraggedProject(null);
  };

  const openProjectModal = (project) => {
    setSelectedProject({ ...project });
    setShowModal(true);
  };

  const saveProject = () => {
    setProjects(prev => prev.map(project =>
      project.id === selectedProject.id ? selectedProject : project
    ));
    setShowModal(false);
    setSelectedProject(null);
  };

  const addNewProject = (formData) => {
    const newProject = {
      id: Date.now(),
      clientName: formData.clientName,
      phone: formData.phone,
      email: formData.email,
      status: 'conversation',
      stage: 'Розмова з клієнтом',
      createdDate: new Date().toISOString().split('T')[0],
      budget: parseInt(formData.budget) || 0,
      stationType: formData.stationType,
      tasks: ['Первинна консультація']
    };
    setProjects(prev => [...prev, newProject]);
    setShowAddForm(false);
  };

  const ProjectCard = ({ project }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, project)}
      className="bg-white rounded-lg shadow-md p-4 mb-3 border border-gray-200 hover:shadow-lg transition-shadow cursor-move"
      onClick={() => openProjectModal(project)}
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-gray-900 text-sm">{project.clientName}</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${stationTypes[project.stationType].color}`}>
          {stationTypes[project.stationType].icon}
          {stationTypes[project.stationType].name}
        </span>
      </div>
      
      <div className="space-y-1 text-xs text-gray-600">
        <div className="flex items-center gap-1">
          <Phone className="w-3 h-3" />
          <span>{project.phone}</span>
        </div>
        <div className="flex items-center gap-1">
          <Mail className="w-3 h-3" />
          <span>{project.email}</span>
        </div>
        <div className="flex items-center gap-1">
          <DollarSign className="w-3 h-3" />
          <span>{project.budget.toLocaleString()} ₴</span>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{new Date(project.createdDate).toLocaleDateString()}</span>
        </div>
      </div>
      
      <div className="mt-3 pt-2 border-t border-gray-100">
        <div className="text-xs text-gray-500">
          Задач: {project.tasks.length}
        </div>
      </div>
    </div>
  );

  const AddProjectForm = () => {
    const [formData, setFormData] = useState({
      clientName: '',
      phone: '',
      email: '',
      budget: '',
      stationType: 'grid'
    });

    const handleSubmit = () => {
      if (formData.clientName && formData.phone && formData.email) {
        addNewProject(formData);
        setFormData({ clientName: '', phone: '', email: '', budget: '', stationType: 'grid' });
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-96 max-w-90vw">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Додати новий проєкт</h2>
            <button onClick={() => setShowAddForm(false)} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Ім'я клієнта"
              required
              className="w-full p-2 border rounded-md"
              value={formData.clientName}
              onChange={(e) => setFormData({...formData, clientName: e.target.value})}
            />
            <input
              type="tel"
              placeholder="Телефон"
              required
              className="w-full p-2 border rounded-md"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
            />
            <input
              type="email"
              placeholder="Email"
              required
              className="w-full p-2 border rounded-md"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
            />
            <input
              type="number"
              placeholder="Бюджет (₴)"
              className="w-full p-2 border rounded-md"
              value={formData.budget}
              onChange={(e) => setFormData({...formData, budget: e.target.value})}
            />
            <select
              className="w-full p-2 border rounded-md"
              value={formData.stationType}
              onChange={(e) => setFormData({...formData, stationType: e.target.value})}
            >
              <option value="grid">Мережева</option>
              <option value="hybrid">Гібридна</option>
              <option value="autonomous">Автономна</option>
            </select>
            
            <div className="flex gap-2">
              <button 
                onClick={(e) => {
                  e.preventDefault();
                  addNewProject(formData);
                  setFormData({ clientName: '', phone: '', email: '', budget: '', stationType: 'grid' });
                }} 
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
              >
                Додати
              </button>
              <button onClick={() => setShowAddForm(false)} className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400">
                Скасувати
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sun className="w-8 h-8 text-yellow-500" />
              Solar CRM - Управління проєктами
            </h1>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Новий проєкт
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
          {stages.map((stage) => (
            <div
              key={stage.id}
              className={`${stage.color} rounded-lg p-4 min-h-96`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className={`font-semibold ${stage.textColor}`}>{stage.name}</h2>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${stage.textColor} bg-white`}>
                  {projects.filter(p => p.status === stage.id).length}
                </span>
              </div>
              
              <div className="space-y-3">
                {projects
                  .filter(project => project.status === stage.id)
                  .map(project => (
                    <ProjectCard key={project.id} project={project} />
                  ))}
              </div>
            </div>
          ))}
        </div>

        {/* Projects Table */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Всі проєкти</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Клієнт</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Телефон</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Етап</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Тип станції</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Бюджет</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Дата створення</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {projects.map((project) => (
                  <tr key={project.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openProjectModal(project)}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {project.clientName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {project.phone}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${stages.find(s => s.id === project.status)?.color} ${stages.find(s => s.id === project.status)?.textColor}`}>
                        {project.stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${stationTypes[project.stationType].color} w-fit`}>
                        {stationTypes[project.stationType].icon}
                        {stationTypes[project.stationType].name}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {project.budget.toLocaleString()} ₴
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(project.createdDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Project Details Modal */}
      {showModal && selectedProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw max-h-80vh overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Деталі проєкту</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ім'я клієнта</label>
                <input
                  type="text"
                  className="w-full p-2 border rounded-md"
                  value={selectedProject.clientName}
                  onChange={(e) => setSelectedProject({...selectedProject, clientName: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
                <input
                  type="tel"
                  className="w-full p-2 border rounded-md"
                  value={selectedProject.phone}
                  onChange={(e) => setSelectedProject({...selectedProject, phone: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full p-2 border rounded-md"
                  value={selectedProject.email}
                  onChange={(e) => setSelectedProject({...selectedProject, email: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Бюджет</label>
                <input
                  type="number"
                  className="w-full p-2 border rounded-md"
                  value={selectedProject.budget}
                  onChange={(e) => setSelectedProject({...selectedProject, budget: parseInt(e.target.value)})}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Тип станції</label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={selectedProject.stationType}
                  onChange={(e) => setSelectedProject({...selectedProject, stationType: e.target.value})}
                >
                  <option value="grid">Мережева</option>
                  <option value="hybrid">Гібридна</option>
                  <option value="autonomous">Автономна</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Задачі</label>
                <div className="space-y-2">
                  {selectedProject.tasks.map((task, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="rounded"
                      />
                      <span className="text-sm">{task}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <button
                onClick={saveProject}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                Зберегти
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-400"
              >
                Скасувати
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Project Modal */}
      {showAddForm && <AddProjectForm />}
    </div>
  );
};

export default SolarCRM;