import React, { useState } from 'react';
import type { Priority, TaskScheduleType, RecurrenceType, RecurrenceRule, Task } from '../types';
import { format, getDay } from 'date-fns';

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
    /** カレンダーからの追加モード: trueの場合「指定」モードのみ表示 */
    calendarMode?: boolean;
    /** 基準となる日付（カレンダーからの追加時に使用） */
    baseDate?: Date;
}

type ScheduleMode = 'auto' | 'manual' | 'none';

/** 曜日ラベル（日〜土） */
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * タスク追加・編集フォーム
 * 
 * 3モード: 
 * 1. 自動スケジュール（優先度）
 * 2. 手動スケジュール（日時指定 + 繰り返し）
 * 3. 指定なし（スケジュールしない）
 * 
 * calendarMode時は「指定」モードのみ使用可能
 */
export const TaskForm: React.FC<TaskFormProps> = ({
    onSave,
    onCancel,
    initialData,
    maxPriority = 5,
    buttonLabel = '追加',
    calendarMode = false,
    baseDate
}) => {
    // 初期値を計算（initialDataまたはbaseDateから）
    const getInitialDate = () => {
        if (initialData?.manualScheduledTime) {
            return format(new Date(initialData.manualScheduledTime), 'yyyy-MM-dd');
        }
        if (baseDate) {
            return format(baseDate, 'yyyy-MM-dd');
        }
        return format(new Date(), 'yyyy-MM-dd');
    };

    const getInitialTime = () => {
        if (initialData?.manualScheduledTime) {
            return format(new Date(initialData.manualScheduledTime), 'HH:mm');
        }
        return '09:00';
    };

    const getInitialMode = (): ScheduleMode => {
        if (calendarMode) return 'manual';
        if (!initialData) return 'auto';
        if (initialData.scheduleType === 'priority') return 'auto';
        if (initialData.scheduleType === 'time' || initialData.scheduleType === 'recurrence') return 'manual';
        return 'none';
    };

    const getInitialDays = () => {
        if (initialData?.recurrence?.daysOfWeek) {
            return initialData.recurrence.daysOfWeek;
        }
        if (baseDate) {
            return [getDay(baseDate)];
        }
        return [];
    };

    const [title, setTitle] = useState(initialData?.title ?? '');
    const [mode, setMode] = useState<ScheduleMode>(getInitialMode);

    // モードごとのState
    const [priority, setPriority] = useState<Priority>(initialData?.priority ?? 3);

    // 手動用
    const [selectedDate, setSelectedDate] = useState(getInitialDate);
    const [selectedTime, setSelectedTime] = useState(getInitialTime);
    const [isRecurring, setIsRecurring] = useState(
        initialData?.scheduleType === 'recurrence' && !!initialData?.recurrence
    );
    const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
        initialData?.recurrence?.type ?? 'weekly'
    );
    // 週繰り返し用: 選択された曜日（0=日曜, 1=月曜, ...）
    const [selectedDays, setSelectedDays] = useState<number[]>(getInitialDays);

    /**
     * 曜日選択のトグル
     */
    const toggleDay = (day: number) => {
        setSelectedDays(prev =>
            prev.includes(day)
                ? prev.filter(d => d !== day)
                : [...prev, day].sort((a, b) => a - b)
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        if (mode === 'manual') {
            // 手動スケジュール
            const dateTime = new Date(`${selectedDate}T${selectedTime}:00`);
            if (isRecurring) {
                // 繰り返しルールを構築
                const recurrence: RecurrenceRule = { type: recurrenceType };
                // weekly または biweekly の場合、選択した曜日を含める
                if ((recurrenceType === 'weekly' || recurrenceType === 'biweekly') && selectedDays.length > 0) {
                    recurrence.daysOfWeek = selectedDays;
                }
                onSave(title, 'recurrence', {
                    manualScheduledTime: dateTime.getTime(),
                    recurrence
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
            setMode(calendarMode ? 'manual' : 'auto');
            setIsRecurring(false);
            setSelectedDays([]);
            // 日時はリセットしない（連続入力のため）
        }
    };

    /** 週繰り返し（weekly/biweekly）時に曜日選択を表示するかどうか */
    const showDaysOfWeek = isRecurring && (recurrenceType === 'weekly' || recurrenceType === 'biweekly');

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

            {/* モード選択タブ（calendarModeでない場合のみ表示） */}
            {!calendarMode && (
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
            )}

            {/* calendarMode時のヒント表示 */}
            {calendarMode && (
                <div className="calendar-mode-hint">
                    <p className="hint-text">📅 選択した日付を基準にタスクを追加します</p>
                </div>
            )}

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
                                    readOnly={calendarMode}
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
                                        <option value="biweekly">隔週</option>
                                        <option value="weekdays">毎平日（月〜金）</option>
                                        <option value="monthly">毎月</option>
                                        <option value="yearly">毎年</option>
                                    </select>

                                    {/* 曜日選択（毎週/隔週時のみ表示） */}
                                    {showDaysOfWeek && (
                                        <div className="days-of-week-selector">
                                            {DAY_LABELS.map((label, index) => (
                                                <label
                                                    key={index}
                                                    className={`day-checkbox-label ${selectedDays.includes(index) ? 'selected' : ''}`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedDays.includes(index)}
                                                        onChange={() => toggleDay(index)}
                                                    />
                                                    {label}
                                                </label>
                                            ))}
                                        </div>
                                    )}
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

