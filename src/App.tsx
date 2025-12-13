import { useState, useEffect } from 'react';
import { useIndexedDB } from './hooks/useIndexedDB';
import { useNotifications } from './hooks/useNotifications';
import { TaskList } from './components/TaskList';
import { TaskForm } from './components/TaskForm';
import { Calendar } from './components/Calendar';
import { Settings } from './components/Settings';
import { scheduleTasksAcrossHolidays } from './lib/scheduler';

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
    deleteScheduledTask,
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
  // タスクを複数の休日に分配してスケジュールする
  // - 今日が休日 → 今日 + 次の休日
  // - 今日が休日ではない → 次の休日 + 次の次の休日
  // - 各休日には最大3件まで
  // - 一度スケジュールしたタスクは再スケジュールしない
  useEffect(() => {
    if (loading) return;

    const today = new Date();

    // 未スケジュールのタスクがあれば、複数の休日に分配してスケジュール
    const newSchedule = scheduleTasksAcrossHolidays(tasks, events, scheduledTasks, today);

    if (newSchedule.length > 0) {
      console.log("Auto-scheduling tasks across holidays:", newSchedule);
      saveScheduledTasks([...scheduledTasks, ...newSchedule]);
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
              onDeleteScheduled={deleteScheduledTask}
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
