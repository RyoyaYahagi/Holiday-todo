import React, { useState, useEffect } from 'react';
import type { Priority, TaskScheduleType, RecurrenceType, RecurrenceRule, Task } from '../types';
import { format } from 'date-fns';

interface TaskFormProps {
    onSave: (
        title: string,
        scheduleType: TaskScheduleType,
        options?: {
            priority?: Priority;
            manualScheduledTime?: number;
            recurrence?: RecurrenceRule;
        }
    ) => void;
    onCancel?: () => void;
    initialData?: Task;
    maxPriority?: number;
    buttonLabel?: string;
}

type ScheduleMode = 'auto' | 'manual' | 'none';

/**
 * タスク追加・編集フォーム
 * 
 * 3モード: 
 * 1. 自動スケジュール（優先度）
 * 2. 手動スケジュール（日時指定 + 繰り返し）
 * 3. 指定なし（スケジュールしない）
 */
export const TaskForm: React.FC<TaskFormProps> = ({
    onSave,
    onCancel,
    initialData,
    maxPriority = 5,
    buttonLabel = '追加'
}) => {
    const [title, setTitle] = useState('');
    const [mode, setMode] = useState<ScheduleMode>('auto');

    // モードごとのState
    const [priority, setPriority] = useState<Priority>(3);

    // 手動用
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedTime, setSelectedTime] = useState('09:00');
    const [isRecurring, setIsRecurring] = useState(false);
    const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('weekly');

    // 初期化（編集モード）
    useEffect(() => {
        if (initialData) {
            setTitle(initialData.title);
            if (initialData.scheduleType === 'priority') {
                setMode('auto');
                if (initialData.priority) setPriority(initialData.priority);
            } else if (initialData.scheduleType === 'time' || initialData.scheduleType === 'recurrence') {
                setMode('manual');
                if (initialData.manualScheduledTime) {
                    const d = new Date(initialData.manualScheduledTime);
                    setSelectedDate(format(d, 'yyyy-MM-dd'));
                    setSelectedTime(format(d, 'HH:mm'));
                }
                if (initialData.scheduleType === 'recurrence' && initialData.recurrence) {
                    setIsRecurring(true);
                    setRecurrenceType(initialData.recurrence.type);
                } else {
                    setIsRecurring(false);
                }
            } else {
                setMode('none');
            }
        }
    }, [initialData]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        if (mode === 'manual') {
            // 手動スケジュール
            const dateTime = new Date(`${selectedDate}T${selectedTime}:00`);
            if (isRecurring) {
                onSave(title, 'recurrence', {
                    manualScheduledTime: dateTime.getTime(),
                    recurrence: { type: recurrenceType }
                });
            } else {
                onSave(title, 'time', {
                    manualScheduledTime: dateTime.getTime()
                });
            }
        } else if (mode === 'auto') {
            // 自動スケジュール
            onSave(title, 'priority', { priority });
        } else {
            // 指定なし
            onSave(title, 'none', {});
        }

        // フォームリセット（編集時は親コンポーネントが閉じる前提だが、追加時のためにリセット）
        if (!initialData) {
            setTitle('');
            setPriority(3);
            setMode('auto');
            setIsRecurring(false);
            // 日時はリセットしない（連続入力のため）
        }
    };

    return (
        <form onSubmit={handleSubmit} className="task-form">
            {/* タスク名入力 */}
            <div className="form-group">
                <label htmlFor="task-title">タスク名</label>
                <input
                    id="task-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="タスクを入力..."
                    required
                    className="task-title-input"
                />
            </div>

            {/* モード選択タブ */}
            <div className="schedule-type-tabs three-tabs">
                <button
                    type="button"
                    className={`tab-button ${mode === 'auto' ? 'active' : ''}`}
                    onClick={() => setMode('auto')}
                >
                    ⭐ 自動
                </button>
                <button
                    type="button"
                    className={`tab-button ${mode === 'manual' ? 'active' : ''}`}
                    onClick={() => setMode('manual')}
                >
                    🕐 指定
                </button>
                <button
                    type="button"
                    className={`tab-button ${mode === 'none' ? 'active' : ''}`}
                    onClick={() => setMode('none')}
                >
                    📝 なし
                </button>
            </div>

            {/* タブコンテンツ */}
            <div className="tab-content">
                {mode === 'auto' && (
                    <div className="form-group">
                        <label>優先度 (自動スケジュール)</label>
                        <p className="hint-text">休日の空き時間に自動で割り当てられます</p>
                        <div className="priority-selector">
                            {Array.from({ length: maxPriority }, (_, i) => i + 1).map((p) => (
                                <label key={p} className={`priority-label ${priority === p ? 'selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="priority"
                                        value={p}
                                        checked={priority === p}
                                        onChange={() => setPriority(p as Priority)}
                                    />
                                    {p}
                                </label>
                            ))}
                        </div>
                    </div>
                )}

                {mode === 'manual' && (
                    <>
                        <div className="form-group">
                            <label>日時を指定</label>
                            <p className="hint-text">指定した日時に固定されます</p>
                            <div className="datetime-inputs">
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="date-input"
                                />
                                <input
                                    type="time"
                                    value={selectedTime}
                                    onChange={(e) => setSelectedTime(e.target.value)}
                                    className="time-input"
                                />
                            </div>
                        </div>

                        <div className="form-group recurrence-section">
                            <label className="recurrence-toggle">
                                <input
                                    type="checkbox"
                                    checked={isRecurring}
                                    onChange={(e) => setIsRecurring(e.target.checked)}
                                />
                                <span>🔁 繰り返す</span>
                            </label>

                            {isRecurring && (
                                <div className="recurrence-options">
                                    <select
                                        value={recurrenceType}
                                        onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
                                        className="recurrence-select"
                                    >
                                        <option value="daily">毎日</option>
                                        <option value="weekly">毎週</option>
                                        <option value="weekdays">毎平日（月〜金）</option>
                                        <option value="monthly">毎月</option>
                                        <option value="yearly">毎年</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {mode === 'none' && (
                    <div className="form-group">
                        <p className="hint-text">
                            スケジュールしません。タスクリストには表示されますが、カレンダーや自動計画には含まれません。<br />
                            手が空いた時にいつでも実行できます。
                        </p>
                    </div>
                )}
            </div>

            <div className="form-actions">
                {onCancel && (
                    <button type="button" className="btn-secondary" onClick={onCancel}>
                        キャンセル
                    </button>
                )}
                <button type="submit" className="btn-primary">{buttonLabel}</button>
            </div>
        </form>
    );
};
