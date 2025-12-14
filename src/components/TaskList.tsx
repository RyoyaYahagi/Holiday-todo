import React from 'react';
import type { Task, ScheduledTask, Priority } from '../types';
import { format, isBefore, isToday, isTomorrow, isYesterday, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';

interface TaskListProps {
    tasks: Task[];
    scheduledTasks: ScheduledTask[];
    onDelete: (id: string) => void;
    onComplete: (id: string) => void;
    onUpdatePriority: (id: string, priority: Priority) => void;
    maxPriority?: number;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, scheduledTasks, onDelete, onComplete, onUpdatePriority, maxPriority = 5 }) => {
    // 日付フォーマッター
    const getTaskDateLabel = (date: Date) => {
        if (isYesterday(date)) return <span className="date-text overdue">昨日 (期限切れ)</span>;
        if (isToday(date)) return <span className="date-text today">今日 {format(date, 'HH:mm')}</span>;
        if (isTomorrow(date)) return <span className="date-text">明日 {format(date, 'HH:mm')}</span>;
        if (isBefore(date, startOfDay(new Date()))) return <span className="date-text overdue">{format(date, 'M月d日')} (期限切れ)</span>;
        return <span className="date-text">{format(date, 'M月d日(eee)', { locale: ja })}</span>;
    };

    const todayDate = startOfDay(new Date());

    // 1. 今日のタスク（期限切れ含む）
    const dueTasks = scheduledTasks
        .filter(t => {
            const date = new Date(t.scheduledTime);
            return isBefore(date, startOfDay(new Date(todayDate.getTime() + 86400000))); // 明日の0時より前 = 今日以前
        })
        .sort((a, b) => a.scheduledTime - b.scheduledTime);

    // 2. それ以外のタスク（明日以降のスケジュール + 未定）
    const futureScheduled = scheduledTasks
        .filter(t => {
            const date = new Date(t.scheduledTime);
            return !isBefore(date, startOfDay(new Date(todayDate.getTime() + 86400000)));
        })
        .sort((a, b) => a.scheduledTime - b.scheduledTime);

    const scheduledTaskIds = new Set(scheduledTasks.map(st => st.taskId));
    const unscheduledTasks = tasks.filter(t => !scheduledTaskIds.has(t.id));

    // 未定タスク（優先度順）
    const sortedUnscheduled = [...unscheduledTasks].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.createdAt - a.createdAt;
    });

    const otherTasks = [...futureScheduled, ...sortedUnscheduled]; // 明日以降の後に未定を表示

    // 修正: renderTaskItem内のハンドラ引数を正す
    const renderItem = (item: any, isScheduled: boolean) => {
        const realTaskId = isScheduled ? item.taskId : item.id;
        const isCompleted = isScheduled ? item.isCompleted : false;

        return (
            <li key={item.id} className="task-item-clean">
                <div
                    className={`check-circle ${isCompleted ? 'checked' : ''}`}
                    onClick={() => isScheduled && onComplete(item.id)} // ScheduledTaskのIDを渡す
                    style={{ cursor: isScheduled ? 'pointer' : 'default', borderColor: isScheduled ? '#ddd' : '#eee' }}
                />
                <div className="task-content-clean">
                    <div className={`task-title-clean ${isCompleted ? 'completed' : ''}`}>
                        {item.title}
                    </div>
                    <div className="task-meta-clean">
                        {isScheduled ? (
                            getTaskDateLabel(new Date(item.scheduledTime))
                        ) : (
                            <span className="date-text" style={{ fontSize: '0.8rem', color: '#999' }}>未定</span>
                        )}
                        <span style={{ margin: '0 0.5rem', color: '#eee' }}>|</span>
                        <select
                            className={`priority-badge p-${Math.min(item.priority, maxPriority)}`}
                            value={Math.min(item.priority, maxPriority)}
                            onChange={(e) => onUpdatePriority(realTaskId, parseInt(e.target.value) as Priority)}
                            style={{ border: 'none', cursor: 'pointer', outline: 'none', fontSize: '0.75rem' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {Array.from({ length: maxPriority }, (_, i) => i + 1).map(p => <option key={p} value={p} style={{ color: 'black' }}>P{p}</option>)}
                        </select>
                    </div>
                </div>
                <button
                    className="btn-delete"
                    onClick={() => onDelete(realTaskId)}
                    aria-label="削除"
                    style={{ marginLeft: 'auto', fontSize: '1.2rem', color: '#ccc' }}
                >
                    ×
                </button>
            </li>
        );
    }

    if (tasks.length === 0 && scheduledTasks.length === 0) {
        return (
            <div className="empty-state">
                <p>📝 タスクがありません</p>
                <p className="hint">右下の＋ボタンからタスクを追加してください</p>
            </div>
        );
    }

    return (
        <div className="task-list-container">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', paddingLeft: '0.5rem' }}>タスク一覧</h2>

            {/* 今日のタスク */}
            {dueTasks.length > 0 && (
                <div className="task-group mb-6">
                    <h3 style={{ fontSize: '1.1rem', color: '#333', marginBottom: '0.8rem', paddingLeft: '0.5rem', borderLeft: '4px solid #4a90e2' }}>
                        今日
                    </h3>
                    <ul className="task-list-clean">
                        {dueTasks.map(t => renderItem(t, true))}
                    </ul>
                </div>
            )}

            {/* それ以外のタスク */}
            {otherTasks.length > 0 && (
                <div className="task-group">
                    <h3 style={{ fontSize: '1.1rem', color: '#666', marginBottom: '0.8rem', paddingLeft: '0.5rem', borderLeft: '4px solid #ccc' }}>
                        今後の予定
                    </h3>
                    <ul className="task-list-clean">
                        {futureScheduled.map(t => renderItem(t, true))}
                        {sortedUnscheduled.map(t => renderItem(t, false))}
                    </ul>
                </div>
            )}
        </div>
    );
};
