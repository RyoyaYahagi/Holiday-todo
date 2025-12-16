import React, { useState } from 'react';
import type { Task, ScheduledTask, Priority } from '../types';
import { format, isBefore, isToday, isTomorrow, isYesterday, startOfDay } from 'date-fns';
import { ja } from 'date-fns/locale';

import { formatRecurrence } from '../lib/formatter';

interface TaskListProps {
    tasks: Task[];
    scheduledTasks: ScheduledTask[];
    onDelete: (id: string) => void;
    onComplete: (id: string, isScheduled: boolean) => void;
    onUpdatePriority: (id: string, priority: Priority) => void;
    onEdit?: (id: string) => void;
    onDeleteCompleted?: () => void;
    maxPriority?: number;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, scheduledTasks, onDelete, onComplete, onUpdatePriority, onEdit, onDeleteCompleted, maxPriority = 5 }) => {
    // 完了タスク折りたたみ状態
    const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);

    // 日付フォーマッター
    const getTaskDateLabel = (date: Date) => {
        if (isYesterday(date)) return <span className="date-text overdue">昨日 (期限切れ)</span>;
        if (isToday(date)) return <span className="date-text today">今日 {format(date, 'HH:mm')}</span>;
        if (isTomorrow(date)) return <span className="date-text">明日 {format(date, 'HH:mm')}</span>;
        if (isBefore(date, startOfDay(new Date()))) return <span className="date-text overdue">{format(date, 'M月d日')} (期限切れ)</span>;
        return <span className="date-text">{format(date, 'M月d日(eee)', { locale: ja })}</span>;
    };

    const todayDate = startOfDay(new Date());

    // 完了/未完了でスケジュール済みタスクを分離
    const completedScheduled = scheduledTasks.filter(t => t.isCompleted);
    const activeScheduled = scheduledTasks.filter(t => !t.isCompleted);

    // 1. 今日のタスク（期限切れ含む）- 未完了のみ
    const dueTasks = activeScheduled
        .filter(t => {
            const date = new Date(t.scheduledTime);
            return isBefore(date, startOfDay(new Date(todayDate.getTime() + 86400000))); // 明日の0時より前 = 今日以前
        })
        .sort((a, b) => a.scheduledTime - b.scheduledTime);

    // 2. それ以外のタスク（明日以降のスケジュール + 未定）- 未完了のみ
    const futureScheduled = activeScheduled
        .filter(t => {
            const date = new Date(t.scheduledTime);
            return !isBefore(date, startOfDay(new Date(todayDate.getTime() + 86400000)));
        })
        .sort((a, b) => a.scheduledTime - b.scheduledTime);

    const scheduledTaskIds = new Set(scheduledTasks.map(st => st.taskId));
    const unscheduledTasks = tasks.filter(t => !scheduledTaskIds.has(t.id));

    // 未定タスク（優先度順 - 優先度がないものは最後）
    const sortedUnscheduled = [...unscheduledTasks].sort((a, b) => {
        const priorityA = a.priority ?? 0;
        const priorityB = b.priority ?? 0;
        if (priorityB !== priorityA) return priorityB - priorityA;
        return b.createdAt - a.createdAt;
    });

    // 完了タスク（完了日時で降順ソート）
    const sortedCompleted = [...completedScheduled].sort((a, b) => b.scheduledTime - a.scheduledTime);

    // タスクタイプのアイコンを取得
    const getScheduleTypeIcon = (scheduleType?: string) => {
        switch (scheduleType) {
            case 'time': return '🕐';
            case 'recurrence': return '🔁';
            case 'priority': return '⭐';
            case 'none': return '📝';
            default: return '📝';
        }
    };

    const renderItem = (item: any, isScheduled: boolean) => {
        const realTaskId = isScheduled ? item.taskId : item.id;
        const isCompleted = isScheduled ? item.isCompleted : false;

        return (
            <li key={item.id} className="task-item-clean">
                <div
                    className={`check-circle ${isCompleted ? 'checked' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onComplete(item.id, isScheduled);
                    }}
                    style={{ cursor: 'pointer', borderColor: isScheduled ? '#ddd' : '#eee' }}
                />
                <div
                    className="task-content-clean"
                    onClick={() => onEdit && onEdit(realTaskId)}
                    style={{ cursor: onEdit ? 'pointer' : 'default' }}
                >
                    <div className={`task-title-clean ${isCompleted ? 'completed' : ''}`}>
                        <span className="task-type-icon">{getScheduleTypeIcon(item.scheduleType)}</span>
                        {item.title}
                    </div>
                    <div className="task-meta-clean">
                        {isScheduled && item.scheduleType !== 'none' ? (
                            isCompleted ? (
                                <span className="date-text" style={{ color: 'var(--text-muted)' }}>
                                    完了日: {format(new Date(item.scheduledTime), 'M月d日(eee)', { locale: ja })}
                                </span>
                            ) : (
                                getTaskDateLabel(new Date(item.scheduledTime))
                            )
                        ) : (
                            <span className="date-text" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>未定</span>
                        )}

                        {/* 繰り返し情報の表示 */}
                        {item.recurrence && (
                            <>
                                <span style={{ margin: '0 0.5rem', color: 'var(--border-color)' }}>|</span>
                                <span className="recurrence-info" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                    🔁 {formatRecurrence(item.recurrence)}
                                </span>
                            </>
                        )}

                        {!isCompleted && item.priority && (
                            <>
                                <span style={{ margin: '0 0.5rem', color: 'var(--border-color)' }}>|</span>
                                <select
                                    className={`priority-badge p-${Math.min(item.priority, maxPriority)}`}
                                    value={Math.min(item.priority, maxPriority)}
                                    onChange={(e) => {
                                        e.stopPropagation();
                                        onUpdatePriority(realTaskId, parseInt(e.target.value) as Priority);
                                    }}
                                    style={{ border: 'none', cursor: 'pointer', outline: 'none', fontSize: '0.75rem' }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {Array.from({ length: maxPriority }, (_, i) => i + 1).map(p => <option key={p} value={p} style={{ color: 'black' }}>P{p}</option>)}
                                </select>
                            </>
                        )}
                    </div>
                </div>
                <button
                    className="btn-delete"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(realTaskId);
                    }}
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
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: '0.8rem', paddingLeft: '0.5rem', borderLeft: '4px solid var(--primary-color)' }}>
                        今日
                    </h3>
                    <ul className="task-list-clean">
                        {dueTasks.map(t => renderItem(t, true))}
                    </ul>
                </div>
            )}

            {/* それ以外のタスク */}
            {(futureScheduled.length > 0 || sortedUnscheduled.length > 0) && (
                <div className="task-group">
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', marginBottom: '0.8rem', paddingLeft: '0.5rem', borderLeft: '4px solid var(--border-color)' }}>
                        今後の予定
                    </h3>
                    <ul className="task-list-clean">
                        {futureScheduled.map(t => renderItem(t, true))}
                        {sortedUnscheduled.map(t => renderItem(t, false))}
                    </ul>
                </div>
            )}

            {/* 完了タスク - 折りたたみセクション */}
            {sortedCompleted.length > 0 && (
                <div className="task-group completed-section" style={{ marginTop: '1.5rem' }}>
                    <button
                        onClick={() => setIsCompletedExpanded(!isCompletedExpanded)}
                        style={{
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.8rem 1rem',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            color: 'var(--text-secondary)',
                        }}
                    >
                        <span>✓ 完了（{sortedCompleted.length}件）</span>
                        <span style={{ fontSize: '1.2rem' }}>{isCompletedExpanded ? '∧' : '∨'}</span>
                    </button>

                    {isCompletedExpanded && (
                        <>
                            <ul className="task-list-clean" style={{ marginTop: '0.5rem', opacity: 0.7 }}>
                                {sortedCompleted.map(t => renderItem(t, true))}
                            </ul>
                            {onDeleteCompleted && (
                                <button
                                    onClick={() => {
                                        if (window.confirm(`完了済みタスク${sortedCompleted.length}件をすべて削除しますか？`)) {
                                            onDeleteCompleted();
                                        }
                                    }}
                                    style={{
                                        marginTop: '0.5rem',
                                        padding: '0.6rem 1rem',
                                        border: 'none',
                                        borderRadius: '8px',
                                        background: '#ff3b30',
                                        color: 'white',
                                        cursor: 'pointer',
                                        width: '100%',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    🗑️ 完了済みをすべて削除
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
