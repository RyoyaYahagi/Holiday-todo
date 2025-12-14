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

// onUpdatePriority, maxPriority は将来的に詳細画面等で使用するが、現在はリスト表示で使用しないためリントエラー回避
export const TaskList: React.FC<TaskListProps> = ({ tasks, scheduledTasks, onDelete, onComplete }) => {
    // 日付フォーマッター
    const getTaskDateLabel = (date: Date) => {
        if (isYesterday(date)) return <span className="date-text overdue">昨日 (期限切れ)</span>;
        if (isToday(date)) return <span className="date-text today">今日 {format(date, 'HH:mm')}</span>;
        if (isTomorrow(date)) return <span className="date-text">明日 {format(date, 'HH:mm')}</span>;
        if (isBefore(date, startOfDay(new Date()))) return <span className="date-text overdue">{format(date, 'M月d日')} (期限切れ)</span>;
        return <span className="date-text">{format(date, 'M月d日(eee)', { locale: ja })}</span>;
    };

    // 1. スケジュール済みタスク（時系列順）
    const sortedScheduled = [...scheduledTasks].sort((a, b) => a.scheduledTime - b.scheduledTime);

    // 2. 未スケジュール（プール）タスク
    const scheduledTaskIds = new Set(scheduledTasks.map(st => st.taskId));
    const unscheduledTasks = tasks.filter(t => !scheduledTaskIds.has(t.id));

    // プールは優先度順 -> 作成順
    const sortedUnscheduled = [...unscheduledTasks].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.createdAt - a.createdAt;
    });

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

            <ul className="task-list-clean">
                {/* スケジュール済みタスク */}
                {sortedScheduled.map(task => (
                    <li key={task.id} className="task-item-clean">
                        <div
                            className={`check-circle ${task.isCompleted ? 'checked' : ''}`}
                            onClick={() => onComplete(task.id)}
                        />
                        <div className="task-content-clean">
                            <div className={`task-title-clean ${task.isCompleted ? 'completed' : ''}`}>
                                {task.title}
                            </div>
                            <div className="task-meta-clean">
                                {getTaskDateLabel(new Date(task.scheduledTime))}
                            </div>
                        </div>
                        {/* 優先度変更用（隠し機能的、あるいは控えめに配置） */}
                        {/* 画像にはないので一旦非表示にするか、デバッグ用に残すならここ */}
                        {/* ここでは画像のシンプルさを優先して削除するが、機能維持のため別の場所(詳細など)が必要。
                             今回はユーザー要望「UIをこのように」を最優先し、一旦隠す。ただし削除機能は必要。 */}
                        <button
                            className="btn-delete"
                            onClick={() => onDelete(task.taskId)}
                            aria-label="削除"
                            style={{ marginLeft: 'auto', fontSize: '1.2rem', color: '#ccc' }}
                        >
                            ×
                        </button>
                    </li>
                ))}

                {/* プールタスク（区切り線を入れるか、そのまま続けるか。フラットに見せるなら続ける） */}
                {sortedUnscheduled.map(task => (
                    <li key={task.id} className="task-item-clean">
                        <div className="check-circle" style={{ borderColor: '#eee', cursor: 'default' }} /> {/* プールはまだ完了できない？ -> できるようにすべきだが、スケジュール前なので */}
                        {/* 元のロジックではプールタスクは完了状態を持たない（Task型にはisCompletedがない）。
                            完了するにはスケジュールされる必要があるか、Task型にisCompletedを追加する必要がある。
                            現状の仕様ではプールタスクは「未完了」前提。 */}

                        <div className="task-content-clean">
                            <div className="task-title-clean">
                                {task.title}
                            </div>
                            <div className="task-meta-clean">
                                <span className="date-text" style={{ fontSize: '0.8rem', color: '#999' }}>
                                    未定 (P{task.priority})
                                </span>
                            </div>
                        </div>
                        <button
                            className="btn-delete"
                            onClick={() => onDelete(task.id)}
                            aria-label="削除"
                            style={{ marginLeft: 'auto', fontSize: '1.2rem', color: '#ccc' }}
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
