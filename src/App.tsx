import { useState } from 'react';
import { useSupabase } from './hooks/useSupabase';
import { useAuth } from './contexts/AuthContext';
import { useNotifications } from './hooks/useNotifications';
import { TaskList } from './components/TaskList';
import { TaskForm } from './components/TaskForm';
import { Calendar } from './components/Calendar';
import { Settings } from './components/Settings';
import { Login } from './components/Login';

import { Modal } from './components/Modal';

function App() {
  const { user, loading: authLoading, signOut } = useAuth();

  const {
    tasks,
    scheduledTasks,
    events,
    settings,
    loading,
    addTask,
    updateTask,
    deleteTask,
    updateSettings,
    saveEvents,
    saveScheduledTasks,
    exportData,
    importData
  } = useSupabase();

  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar' | 'settings'>('tasks');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Activate notifications hook
  useNotifications(settings, tasks, events, scheduledTasks, saveScheduledTasks);

  // Complete a scheduled task
  const completeTask = (id: string) => {
    const updated = scheduledTasks.map(t =>
      t.id === id ? { ...t, isCompleted: !t.isCompleted } : t
    );
    saveScheduledTasks(updated);
  };

  const handlePriorityChange = async (taskId: string, newPriority: 1 | 2 | 3 | 4 | 5) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (targetTask) {
      await updateTask({ ...targetTask, priority: newPriority });
    }
  };

  // 認証読み込み中
  if (authLoading) {
    return <div className="loading">認証を確認中...</div>;
  }

  // 未ログイン時はログイン画面を表示
  if (!user) {
    return <Login />;
  }

  // データ読み込み中
  if (loading) {
    return <div className="loading">データを読み込み中...</div>;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>Holiday Todo</h1>
        <div className="header-user">
          <span className="user-email">{user.email}</span>
          <button className="logout-btn" onClick={signOut} type="button">
            ログアウト
          </button>
        </div>
      </header>

      <main className="app-content">
        {activeTab === 'tasks' && (
          <div className="tab-content fade-in">
            <TaskList
              tasks={tasks}
              scheduledTasks={scheduledTasks}
              onDelete={deleteTask}
              onComplete={completeTask}
              onUpdatePriority={handlePriorityChange}
              maxPriority={settings.maxPriority}
            />

            {/* FAB for adding tasks */}
            <div className="fab-container">
              <button className="fab-button" onClick={() => setIsTaskModalOpen(true)}>
                <span>+</span>
              </button>
            </div>

            {/* Task Add Modal */}
            <Modal
              isOpen={isTaskModalOpen}
              onClose={() => setIsTaskModalOpen(false)}
              title="新規タスク追加"
            >
              <TaskForm
                onAdd={async (title, priority) => {
                  await addTask(title, priority);
                  setIsTaskModalOpen(false);
                }}
                maxPriority={settings.maxPriority}
              />
            </Modal>
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
