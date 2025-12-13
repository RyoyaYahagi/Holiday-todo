import { useState, useEffect } from 'react';
import { useIndexedDB } from './hooks/useIndexedDB';
import { useNotifications } from './hooks/useNotifications';
import { TaskList } from './components/TaskList';
import { TaskForm } from './components/TaskForm';
import { Calendar } from './components/Calendar';
import { Settings } from './components/Settings';
import { scheduleTasksForHoliday } from './lib/scheduler';
import { isSameDay } from 'date-fns';

function App() {
  const {
    tasks,
    scheduledTasks,
    events,
    settings,
    loading,
    addTask,
    deleteTask,
    updateSettings,
    saveEvents,
    saveScheduledTasks,
    exportData,
    importData
  } = useIndexedDB();

  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar' | 'settings'>('tasks');

  // Activate notifications hook
  useNotifications(settings, tasks, events, scheduledTasks, saveScheduledTasks);

  // Complete a scheduled task
  const completeTask = (id: string) => {
    const updated = scheduledTasks.map(t =>
      t.id === id ? { ...t, isCompleted: !t.isCompleted } : t
    );
    saveScheduledTasks(updated);
  };

  // Auto-scheduler logic:
  // When 'events' or 'tasks' change, check if today needs scheduling?
  // Or maybe only schedule when explicitly requested or just-in-time?
  // Requirement: "休日には必ずタスクを割り当てる"
  // Let's do a check on mount/update: If today is holiday and no tasks scheduled, schedule them.
  useEffect(() => {
    if (loading) return;

    const today = new Date();
    // Check if today already has scheduled tasks
    const todayTasks = scheduledTasks.filter(t => isSameDay(new Date(t.scheduledTime), today));

    if (todayTasks.length === 0) {
      // Attempt to schedule
      const newSchedule = scheduleTasksForHoliday(today, tasks, events);
      if (newSchedule.length > 0) {
        console.log("Auto-scheduling for today:", newSchedule);
        saveScheduledTasks([...scheduledTasks, ...newSchedule]);
      }
    }
  }, [loading, tasks, events, scheduledTasks]);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Holiday Todo</h1>
      </header>

      <main className="app-content">
        {activeTab === 'tasks' && (
          <div className="tab-content fade-in">
            <TaskForm onAdd={addTask} />
            <div className="section-divider"></div>
            <TaskList
              tasks={tasks}
              scheduledTasks={scheduledTasks}
              onDelete={deleteTask}
              onComplete={completeTask}
            />
          </div>
        )}

        {activeTab === 'calendar' && (
          <div className="tab-content fade-in">
            <Calendar events={events} scheduledTasks={scheduledTasks} />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="tab-content fade-in">
            <Settings
              settings={settings}
              onUpdateSettings={updateSettings}
              onSaveEvents={saveEvents}
              onExport={exportData}
              onImport={importData}
              onNavigateToCalendar={() => setActiveTab('calendar')}
            />
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <span className="icon">📝</span>
          <span className="label">タスク</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          <span className="icon">📅</span>
          <span className="label">カレンダー</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <span className="icon">⚙️</span>
          <span className="label">設定</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
