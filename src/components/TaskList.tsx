import React from 'react';
import type { Task, ScheduledTask } from '../types';
import { format, isSameDay, isAfter, startOfDay } from 'date-fns';

interface TaskListProps {
    tasks: Task[];
    scheduledTasks: ScheduledTask[];
    onDelete: (id: string) => void;
    onComplete: (id: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, scheduledTasks, onDelete, onComplete }) => {
    const today = startOfDay(new Date());

    // 今日のスケジュール済みタスク
    const todayScheduled = scheduledTasks
        .filter(st => isSameDay(new Date(st.scheduledTime), today))
        .sort((a, b) => a.scheduledTime - b.scheduledTime);

    // 明日以降のスケジュール済みタスク
    const futureScheduled = scheduledTasks
        .filter(st => isAfter(startOfDay(new Date(st.scheduledTime)), today))
        .sort((a, b) => a.scheduledTime - b.scheduledTime);

    // スケジュール済みタスクのtaskIdセット（元タスクのID）
    const scheduledTaskIds = new Set(scheduledTasks.map(st => st.taskId));

    // 未スケジュールのタスクのみをプールに表示
    const unscheduledTasks = tasks.filter(t => !scheduledTaskIds.has(t.id));

    // 優先度順にソート
    const sortedUnscheduledTasks = [...unscheduledTasks].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.createdAt - a.createdAt;
    });

    if (tasks.length === 0 && scheduledTasks.length === 0) {
        return (
            <div className="empty-state">
                <p>📝 タスクがありません</p>
                <p className="hint">上のフォームからタスクを追加してください</p>
            </div>
        );
    }

    return (
        <div className="task-list-container">
            {/* Today's Scheduled Tasks */}
            {todayScheduled.length > 0 && (
                <div className="scheduled-section">
                    <h4>📅 今日のスケジュール</h4>
                    <ul className="task-list scheduled">
                        {todayScheduled.map(task => (
                            <li key={task.id} className={`task-item ${task.isCompleted ? 'completed' : ''}`}>
                                <button
                                    className={`btn-check ${task.isCompleted ? 'checked' : ''}`}
                                    onClick={() => onComplete(task.id)}
                                    aria-label={task.isCompleted ? "完了済み" : "完了にする"}
                                >
                                    {task.isCompleted ? '✓' : '○'}
                                </button>
                                <div className="task-info">
                                    <span className="task-time">{format(new Date(task.scheduledTime), 'HH:mm')}</span>
                                    <span className={`priority-badge p-${task.priority}`}>P{task.priority}</span>
                                    <span className={`task-title ${task.isCompleted ? 'strikethrough' : ''}`}>{task.title}</span>
                                </div>
                                <button
                                    className="btn-delete"
                                    onClick={() => onDelete(task.taskId)}
                                    aria-label="削除"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Future Scheduled Tasks */}
            {futureScheduled.length > 0 && (
                <div className="scheduled-section">
                    <h4>📆 予定されているタスク</h4>
                    <ul className="task-list scheduled">
                        {futureScheduled.map(task => (
                            <li key={task.id} className={`task-item ${task.isCompleted ? 'completed' : ''}`}>
                                <button
                                    className={`btn-check ${task.isCompleted ? 'checked' : ''}`}
                                    onClick={() => onComplete(task.id)}
                                    aria-label={task.isCompleted ? "完了済み" : "完了にする"}
                                >
                                    {task.isCompleted ? '✓' : '○'}
                                </button>
                                <div className="task-info">
                                    <span className="task-time">{format(new Date(task.scheduledTime), 'M/d HH:mm')}</span>
                                    <span className={`priority-badge p-${task.priority}`}>P{task.priority}</span>
                                    <span className={`task-title ${task.isCompleted ? 'strikethrough' : ''}`}>{task.title}</span>
                                </div>
                                <button
                                    className="btn-delete"
                                    onClick={() => onDelete(task.taskId)}
                                    aria-label="削除"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Task Pool - Only unscheduled tasks */}
            <div className="pool-section">
                <h4>📋 タスクプール（未スケジュール）</h4>
                <p className="hint">休日に自動的にスケジューリングされます（優先度が高い順に最大3件/日）</p>

                {sortedUnscheduledTasks.length === 0 ? (
                    <p className="no-tasks">プールにタスクはありません</p>
                ) : (
                    <ul className="task-list">
                        {sortedUnscheduledTasks.map(task => (
                            <li key={task.id} className="task-item">
                                <div className="task-info">
                                    <span className={`priority-badge p-${task.priority}`}>P{task.priority}</span>
                                    <span className="task-title">{task.title}</span>
                                </div>
                                <button
                                    className="btn-delete"
                                    onClick={() => onDelete(task.id)}
                                    aria-label="削除"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

