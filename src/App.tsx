import { useState, useEffect } from 'react';
import { useSupabaseQuery } from './hooks/useSupabaseQuery';
import { useAuth } from './contexts/AuthContext';
import { useNotifications } from './hooks/useNotifications';
import { TaskList } from './components/TaskList';
import { TaskForm } from './components/TaskForm';
import { Calendar } from './components/Calendar';
import { Settings } from './components/Settings';
import { Login } from './components/Login';

import { Modal } from './components/Modal';
import { Tutorial } from './components/Tutorial';
import type { Task, WorkEvent } from './types';
import { getNextOccurrence } from './lib/scheduler';
import { isSameDay, startOfDay } from 'date-fns';

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
  } = useSupabaseQuery();

  const [activeTab, setActiveTab] = useState<'tasks' | 'calendar' | 'settings'>('tasks');
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null); // 編集中のタスク
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('tutorial_seen');
    if (!hasSeenTutorial) {
      setIsTutorialOpen(true);
    }
  }, []);

  const closeTutorial = () => {
    setIsTutorialOpen(false);
    localStorage.setItem('tutorial_seen', 'true');
  };

  // Activate notifications hook
  useNotifications(settings, tasks, events, scheduledTasks, saveScheduledTasks);

  // Complete a scheduled task
  const completeTask = async (id: string, isScheduled: boolean) => {
    if (isScheduled) {
      const target = scheduledTasks.find(t => t.id === id);
      if (!target) return;

      const updatedTask = { ...target, isCompleted: !target.isCompleted };
      const tasksToSave = [updatedTask];

      // 完了かつ繰り返し設定がある場合、次回タスクを生成
      if (!target.isCompleted && target.recurrence) {
        const nextTime = getNextOccurrence(target.recurrence, target.scheduledTime);

        const nextTask: import('./types').ScheduledTask = {
          id: crypto.randomUUID(),
          taskId: target.taskId,
          title: target.title,
          createdAt: Date.now(),
          scheduleType: target.scheduleType,
          priority: target.priority,
          manualScheduledTime: nextTime,
          recurrence: target.recurrence, // 次回分も繰り返し設定を引き継ぐ
          scheduledTime: nextTime,
          isCompleted: false,
          recurrenceSourceId: target.id
        };
        tasksToSave.push(nextTask);
      }

      // DB update (update current + insert next)
      await saveScheduledTasks(tasksToSave);
    } else {
      // Complete unscheduled task
      const task = tasks.find(t => t.id === id);
      if (!task) return;

      const newScheduledTask: import('./types').ScheduledTask = {
        id: crypto.randomUUID(),
        taskId: task.id,
        title: task.title,
        createdAt: task.createdAt,
        scheduleType: task.scheduleType,
        priority: task.priority,
        manualScheduledTime: task.manualScheduledTime,
        recurrence: task.recurrence,
        // 未スケジュールタスクを完了した場合、「今後の予定」に留まるよう1年後に設定
        scheduledTime: task.manualScheduledTime || (Date.now() + 365 * 24 * 60 * 60 * 1000),
        isCompleted: true,
        recurrenceSourceId: undefined
      };

      // DB update
      await saveScheduledTasks([newScheduledTask]);
    }
  };

  const handlePriorityChange = async (taskId: string, newPriority: 1 | 2 | 3 | 4 | 5) => {
    const targetTask = tasks.find(t => t.id === taskId);
    if (targetTask) {
      await updateTask({ ...targetTask, priority: newPriority });
    }
  };

  // タスク編集開始
  const handleEditTask = (taskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setEditingTask(task);
      setIsTaskModalOpen(true);
    }
  };

  // モーダルを閉じる
  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  /**
   * カレンダー日付タップで自動スケジュール対象/除外をトグル
   * 
   * - 休日（イベントなし or 休み）→ 除外にするには「スケジュール除外」を追加
   * - 勤務日（日勤/夜勤/その他）→ 対象にするには「スケジュール対象」を追加
   * - 既にカスタム設定がある場合 → 解除（元の状態に戻す）
   * 
   * @param date - タップされた日付
   */
  const handleToggleExclude = async (date: Date) => {
    const normalizedDate = startOfDay(date);
    console.log('[handleToggleExclude] 開始:', normalizedDate.toISOString());
    console.log('[handleToggleExclude] 現在のイベント数:', events.length);

    // この日のイベントを取得
    const dayEvents = events.filter(e => isSameDay(e.start, normalizedDate));
    console.log('[handleToggleExclude] この日のイベント:', dayEvents.map(e => e.eventType));

    // 既存のカスタム設定を確認
    const existingExclude = dayEvents.find(e => e.eventType === 'スケジュール除外');
    const existingInclude = dayEvents.find(e => e.eventType === 'スケジュール対象');

    // 通常状態での休日判定（カスタム設定を除外して判定）
    const normalDayEvents = dayEvents.filter(
      e => e.eventType !== 'スケジュール除外' && e.eventType !== 'スケジュール対象'
    );
    const isNormallyHoliday = normalDayEvents.length === 0 ||
      normalDayEvents.some(e => e.eventType === '休み');

    let newEvents: WorkEvent[];
    let action: string;

    if (existingExclude) {
      // 除外設定を解除
      action = '除外を解除';
      newEvents = events.filter(
        e => !(e.eventType === 'スケジュール除外' && isSameDay(e.start, normalizedDate))
      );
    } else if (existingInclude) {
      // 対象設定を解除
      action = '対象を解除';
      newEvents = events.filter(
        e => !(e.eventType === 'スケジュール対象' && isSameDay(e.start, normalizedDate))
      );
    } else if (isNormallyHoliday) {
      // 通常は休日 → 除外に変更
      action = '除外を追加';
      const newExcludeEvent: WorkEvent = {
        title: 'スケジュール除外',
        start: normalizedDate,
        end: normalizedDate,
        eventType: 'スケジュール除外'
      };
      newEvents = [...events, newExcludeEvent];
    } else {
      // 通常は勤務日 → 対象に変更
      action = '対象を追加';
      const newIncludeEvent: WorkEvent = {
        title: 'スケジュール対象',
        start: normalizedDate,
        end: normalizedDate,
        eventType: 'スケジュール対象'
      };
      newEvents = [...events, newIncludeEvent];
    }

    console.log('[handleToggleExclude] アクション:', action);
    console.log('[handleToggleExclude] 新イベント数:', newEvents.length);

    await saveEvents(newEvents);
    console.log('[handleToggleExclude] saveEvents呼び出し完了');
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
              onEdit={handleEditTask}
              maxPriority={settings.maxPriority}
            />

            {/* FAB for adding tasks */}
            <div className="fab-container">
              <button className="fab-button" onClick={() => setIsTaskModalOpen(true)}>
                <span>+</span>
              </button>
            </div>

            {/* Task Add/Edit Modal */}
            <Modal
              isOpen={isTaskModalOpen}
              onClose={closeTaskModal}
              title={editingTask ? "タスクを編集" : "新規タスク追加"}
            >
              <TaskForm
                initialData={editingTask || undefined}
                buttonLabel={editingTask ? "保存" : "追加"}
                onSave={async (title, scheduleType, options) => {
                  if (editingTask) {
                    // 更新
                    const updatedTask: Task = {
                      ...editingTask,
                      title,
                      scheduleType,
                      priority: options?.priority,
                      manualScheduledTime: options?.manualScheduledTime,
                      recurrence: options?.recurrence
                    };
                    await updateTask(updatedTask);
                  } else {
                    // 新規追加
                    await addTask(title, scheduleType, options);
                  }
                  closeTaskModal();
                }}
                onCancel={closeTaskModal}
                maxPriority={settings.maxPriority}
              />
            </Modal>
          </div>
        )}


        {activeTab === 'calendar' && (
          <div className="tab-content fade-in">
            <Calendar
              events={events}
              scheduledTasks={scheduledTasks}
              onToggleExclude={handleToggleExclude}
            />
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
              onShowTutorial={() => setIsTutorialOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Tutorial Modal */}
      <Tutorial isOpen={isTutorialOpen} onClose={closeTutorial} />

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
