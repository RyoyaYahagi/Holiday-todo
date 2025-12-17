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
import type { Task, WorkEvent, EventType } from './types';
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
  const [calendarTaskDate, setCalendarTaskDate] = useState<Date | null>(null); // カレンダーからのタスク追加時の日付
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false); // ヘルプモード
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<WorkEvent | null>(null); // 編集中のイベント
  const [originalEvent, setOriginalEvent] = useState<WorkEvent | null>(null); // 編集前のオリジナルイベント

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
    setCalendarTaskDate(null);
  };

  /**
   * カレンダー日付タップで自動スケジュール対象/除外をトグル
   * 
   * - 休日（イベントなし or 休み）→ 除外にするには「スケジュール除外」を追加
   * - 予定あり（日勤/夜勤/その他）→ 対象にするには「スケジュール対象」を追加
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
              onDeleteCompleted={async () => {
                // 完了済みタスクを一括削除
                const completedTaskIds = scheduledTasks
                  .filter(st => st.isCompleted)
                  .map(st => st.taskId);
                for (const id of completedTaskIds) {
                  await deleteTask(id);
                }
              }}
            />
          </div>
        )}


        {activeTab === 'calendar' && (
          <div className="tab-content fade-in">
            <Calendar
              events={events}
              scheduledTasks={scheduledTasks}
              onToggleExclude={handleToggleExclude}
              onEditEvent={(event) => {
                setEditingEvent({ ...event }); // コピーを作成
                setOriginalEvent(event); // オリジナルを保持
                setIsEventModalOpen(true);
              }}
              onAddEvent={(date) => {
                // 選択された日付に新規イベントを作成
                const newEvent: WorkEvent = {
                  title: '',
                  eventType: 'その他',
                  start: new Date(date.setHours(9, 0, 0, 0)),
                  end: new Date(date.setHours(18, 0, 0, 0)),
                };
                setEditingEvent(newEvent);
                setOriginalEvent(null); // 新規なのでoriginalEventはnull
                setIsEventModalOpen(true);
              }}
              onAddTask={(date) => {
                // カレンダーからタスク追加
                setCalendarTaskDate(date);
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              onEditTask={(task) => {
                // カレンダーからタスク編集（元のTaskを取得）
                const originalTask = tasks.find(t => t.id === task.taskId);
                if (originalTask) {
                  setEditingTask(originalTask);
                  setCalendarTaskDate(new Date(task.scheduledTime));
                  setIsTaskModalOpen(true);
                }
              }}
              onDeleteTask={async (taskId) => {
                // カレンダーからタスク削除（ScheduledTaskのID）
                // scheduledTasksから元のtaskIdを取得
                const scheduledTask = scheduledTasks.find(t => t.id === taskId);
                if (scheduledTask) {
                  await deleteTask(scheduledTask.taskId);
                }
              }}
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
              onShowHelp={() => setIsHelpOpen(true)}
            />
          </div>
        )}
      </main>

      {/* FAB for adding tasks - タブ外に配置して再マウントを防止 */}
      {activeTab === 'tasks' && (
        <div className="fab-container">
          <button className="fab-button" onClick={() => setIsTaskModalOpen(true)}>
            <span>+</span>
          </button>
        </div>
      )}

      {/* Task Add/Edit Modal - タブ外に配置 */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={closeTaskModal}
        title={editingTask ? "タスクを編集" : calendarTaskDate ? "タスクを追加" : "新規タスク追加"}
      >
        <TaskForm
          initialData={editingTask || undefined}
          buttonLabel={editingTask ? "保存" : "追加"}
          calendarMode={calendarTaskDate !== null}
          baseDate={calendarTaskDate || undefined}
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

      {/* Event Edit Modal */}
      <Modal
        isOpen={isEventModalOpen}
        onClose={() => {
          setIsEventModalOpen(false);
          setEditingEvent(null);
          setOriginalEvent(null);
        }}
        title={originalEvent ? "予定を編集" : "新しい予定を追加"}
      >
        {editingEvent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                タイトル
              </label>
              <input
                type="text"
                value={editingEvent.title}
                onChange={(e) => setEditingEvent({ ...editingEvent, title: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
                placeholder="予定名を入力"
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                種類
              </label>
              <select
                value={editingEvent.eventType}
                onChange={(e) => setEditingEvent({ ...editingEvent, eventType: e.target.value as EventType })}
                style={{
                  width: '100%',
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  fontSize: '1rem'
                }}
              >
                <option value="夜勤">夜勤</option>
                <option value="日勤">日勤</option>
                <option value="休み">休み</option>
                <option value="その他">その他</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  開始時刻
                </label>
                <input
                  type="time"
                  value={`${String(editingEvent.start.getHours()).padStart(2, '0')}:${String(editingEvent.start.getMinutes()).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    const newStart = new Date(editingEvent.start);
                    newStart.setHours(h, m);
                    setEditingEvent({ ...editingEvent, start: newStart });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  終了時刻
                </label>
                <input
                  type="time"
                  value={`${String(editingEvent.end.getHours()).padStart(2, '0')}:${String(editingEvent.end.getMinutes()).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    const newEnd = new Date(editingEvent.end);
                    newEnd.setHours(h, m);
                    setEditingEvent({ ...editingEvent, end: newEnd });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                onClick={() => {
                  setIsEventModalOpen(false);
                  setEditingEvent(null);
                  setOriginalEvent(null);
                }}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  background: 'white',
                  cursor: 'pointer'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={async () => {
                  if (originalEvent) {
                    // 既存のイベントを更新（オリジナルの開始時刻とタイトルで特定）
                    const updatedEvents = events.map(e =>
                      e.start.getTime() === originalEvent.start.getTime() &&
                        e.title === originalEvent.title
                        ? editingEvent
                        : e
                    );
                    await saveEvents(updatedEvents);
                  } else {
                    // 新規イベントを追加
                    await saveEvents([...events, editingEvent]);
                  }
                  setIsEventModalOpen(false);
                  setEditingEvent(null);
                  setOriginalEvent(null);
                }}
                style={{
                  flex: 1,
                  padding: '0.8rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#007aff',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {originalEvent ? '保存' : '追加'}
              </button>
            </div>

            {/* 削除ボタン（既存イベント編集時のみ表示） */}
            {originalEvent && (
              <button
                onClick={async () => {
                  if (window.confirm('この予定を削除しますか？')) {
                    // オリジナルの開始時刻とタイトルで特定して削除
                    const filteredEvents = events.filter(e =>
                      !(e.start.getTime() === originalEvent.start.getTime() &&
                        e.title === originalEvent.title)
                    );
                    await saveEvents(filteredEvents);
                    setIsEventModalOpen(false);
                    setEditingEvent(null);
                    setOriginalEvent(null);
                  }
                }}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.8rem',
                  border: 'none',
                  borderRadius: '8px',
                  background: '#ff3b30',
                  color: 'white',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                🗑️ この予定を削除
              </button>
            )}
          </div>
        )}
      </Modal>

      {/* Tutorial Modal */}
      <Tutorial isOpen={isTutorialOpen} onClose={closeTutorial} />

      {/* Help Modal */}
      <Tutorial isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} showHelpOnly />

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
