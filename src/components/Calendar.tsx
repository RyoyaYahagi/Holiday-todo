import React, { useState, useMemo } from 'react';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isToday,
    startOfDay
} from 'date-fns';
import { ja } from 'date-fns/locale';
import type { WorkEvent, ScheduledTask } from '../types';
import { isHoliday } from '../lib/scheduler';

interface CalendarProps {
    events: WorkEvent[];
    scheduledTasks: ScheduledTask[];
    /** 日付の除外状態をトグルするコールバック（オプション） */
    onToggleExclude?: (date: Date) => void;
    /** イベントを編集するコールバック（オプション） */
    onEditEvent?: (event: WorkEvent) => void;
    /** 新規イベントを追加するコールバック（オプション） */
    onAddEvent?: (date: Date) => void;
}

/**
 * カレンダーコンポーネント
 * 
 * イベントとスケジュール済みタスクを表示する。
 * 日付セルをタップすると、詳細モーダルが表示される。
 */
export const Calendar: React.FC<CalendarProps> = ({ events, scheduledTasks, onToggleExclude, onEditEvent, onAddEvent }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    // 選択された日付のみを保持（詳細はevents/scheduledTasksから動的に取得）
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days = eachDayOfInterval({
        start: startDate,
        end: endDate,
    });

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    /**
     * 選択された日の詳細情報をpropsから動的に計算
     * eventsやscheduledTasksが更新されると自動的に再計算される
     */
    const selectedDayDetails = useMemo(() => {
        if (!selectedDate) return null;

        const dayEvents = events.filter(e => isSameDay(e.start, selectedDate));
        const dayTasks = scheduledTasks.filter(t => isSameDay(new Date(t.scheduledTime), selectedDate));
        const isExcluded = dayEvents.some(e => e.eventType === 'スケジュール除外');
        const isForceIncluded = dayEvents.some(e => e.eventType === 'スケジュール対象');
        const isDayHoliday = isHoliday(selectedDate, events);

        // 通常状態での休日判定（カスタム設定を除外）
        const normalDayEvents = dayEvents.filter(
            e => e.eventType !== 'スケジュール除外' && e.eventType !== 'スケジュール対象'
        );
        const isNormallyHoliday = normalDayEvents.length === 0 ||
            normalDayEvents.some(e => e.eventType === '休み');

        return {
            date: selectedDate,
            events: dayEvents.filter(e => e.eventType !== 'スケジュール除外' && e.eventType !== 'スケジュール対象'),
            tasks: dayTasks,
            isExcluded,
            isForceIncluded,
            isDayHoliday,
            isNormallyHoliday,
            hasCustomSetting: isExcluded || isForceIncluded
        };
    }, [selectedDate, events, scheduledTasks]);

    /**
     * 日付セルのクリックハンドラ - 詳細モーダルを開く
     * 
     * @param day - クリックされた日付
     */
    const handleDayClick = (day: Date) => {
        setSelectedDate(startOfDay(day));
    };

    /**
     * 詳細モーダルを閉じる
     */
    const closeModal = () => {
        setSelectedDate(null);
    };

    /**
     * 自動スケジュール除外をトグル
     */
    const handleToggleExclude = () => {
        if (selectedDate && onToggleExclude) {
            onToggleExclude(selectedDate);
            // 状態の更新はpropsから自動的に反映される（useMemoで再計算）
        }
    };

    const getDayContent = (day: Date) => {
        const dayEvents = events.filter(e => isSameDay(e.start, day));
        const dayTasks = scheduledTasks.filter(t => isSameDay(new Date(t.scheduledTime), day));
        const isDayHoliday = isHoliday(day, events);

        const isYasumi = dayEvents.some(e => e.eventType === '休み');
        const isExcluded = dayEvents.some(e => e.eventType === 'スケジュール除外');
        const isForceIncluded = dayEvents.some(e => e.eventType === 'スケジュール対象');
        const hasCustomSetting = isExcluded || isForceIncluded;

        let cellClass = 'day-cell';
        if (!isSameMonth(day, monthStart)) cellClass += ' other-month';
        if (isToday(day)) cellClass += ' today';
        if (isDayHoliday) cellClass += ' holiday';
        if (isExcluded) cellClass += ' excluded';
        if (isForceIncluded) cellClass += ' force-included';

        // 表示用のイベント（カスタム設定は除く）
        const displayEvents = dayEvents.filter(
            e => e.eventType !== 'スケジュール除外' && e.eventType !== 'スケジュール対象'
        );

        return (
            <div
                className={cellClass}
                onClick={() => handleDayClick(day)}
                style={{ cursor: 'pointer' }}
            >
                <div className="day-header">
                    <span className="day-number">{format(day, 'd')}</span>
                    {isForceIncluded && <span className="badge-included" title="自動スケジュール対象（手動設定）">✓</span>}
                    {isExcluded && <span className="badge-excluded" title="自動スケジュール除外">🚫</span>}
                    {isYasumi && !hasCustomSetting && <span className="badge-yasumi">休</span>}
                    {!isYasumi && !hasCustomSetting && displayEvents.length > 0 && displayEvents.map((e, i) => (
                        <span key={i} className={`badge-work ${e.eventType === '夜勤' ? 'yakin' : 'nikkin'}`}>
                            {e.eventType.charAt(0)}
                        </span>
                    ))}
                </div>
                <div className="day-content">
                    {dayTasks.slice(0, 2).map(task => (
                        <div
                            key={task.id}
                            className={`mini-task ${task.isCompleted ? 'completed' : ''}`}
                            style={{
                                textDecoration: task.isCompleted ? 'line-through' : 'none',
                                opacity: task.isCompleted ? 0.6 : 1,
                                color: task.isCompleted ? '#888' : 'inherit'
                            }}
                        >
                            {task.isCompleted && '✓ '}
                            {format(new Date(task.scheduledTime), 'HH:mm')} {task.title}
                        </div>
                    ))}
                    {dayTasks.length > 2 && (
                        <div className="mini-task more">+{dayTasks.length - 2}件</div>
                    )}
                </div>
            </div>
        );
    };

    /**
     * イベントタイプに応じたラベルを取得
     */
    const getEventTypeLabel = (eventType: string) => {
        switch (eventType) {
            case '夜勤': return '🌙 夜勤';
            case '日勤': return '☀️ 日勤';
            case '休み': return '🏖️ 休み';
            default: return `📅 ${eventType}`;
        }
    };

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                <button onClick={prevMonth}>&lt;</button>
                <h2>{format(currentDate, 'yyyy年 M月', { locale: ja })}</h2>
                <button onClick={nextMonth}>&gt;</button>
            </div>
            <p className="calendar-hint" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '0.5rem' }}>
                日付をタップして詳細を表示
            </p>
            <div className="calendar-grid">
                {['日', '月', '火', '水', '木', '金', '土'].map(d => (
                    <div key={d} className="weekday-header">{d}</div>
                ))}
                {days.map(day => (
                    <div key={day.toISOString()} className="calendar-day-wrapper">
                        {getDayContent(day)}
                    </div>
                ))}
            </div>

            {/* 日付詳細モーダル */}
            {selectedDayDetails && (
                <div
                    className="day-detail-overlay"
                    onClick={closeModal}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}
                >
                    <div
                        className="day-detail-modal"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: 'var(--card-bg)',
                            color: 'var(--text-primary)',
                            borderRadius: '12px',
                            padding: '1.5rem',
                            maxWidth: '90%',
                            width: '400px',
                            maxHeight: '80vh',
                            overflow: 'auto',
                            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.4)'
                        }}
                    >
                        {/* モーダルヘッダー */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>
                                {format(selectedDayDetails.date, 'M月d日(EEEE)', { locale: ja })}
                            </h3>
                            <button
                                onClick={closeModal}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    fontSize: '1.5rem',
                                    cursor: 'pointer',
                                    color: '#888'
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {/* 予定 */}
                        <section style={{ marginBottom: '1rem' }}>
                            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.3rem' }}>
                                📋 予定
                            </h4>
                            {selectedDayDetails.events.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>予定なし（休日）</p>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {selectedDayDetails.events.map((event, i) => (
                                        <li
                                            key={i}
                                            style={{
                                                padding: '0.5rem 0',
                                                borderBottom: '1px solid var(--border-color)',
                                                cursor: onEditEvent ? 'pointer' : 'default'
                                            }}
                                            onClick={() => onEditEvent && onEditEvent(event)}
                                        >
                                            <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{event.title || getEventTypeLabel(event.eventType)}</span>
                                                <span style={{
                                                    fontSize: '0.75rem',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    background: event.eventType === '夜勤' ? '#5c6bc0' :
                                                        event.eventType === '日勤' ? '#42a5f5' :
                                                            event.eventType === '休み' ? '#66bb6a' : '#bdbdbd',
                                                    color: 'white'
                                                }}>
                                                    {getEventTypeLabel(event.eventType)}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                                {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
                                                {onEditEvent && <span style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}>タップで編集</span>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {/* 予定追加ボタン */}
                            {onAddEvent && (
                                <button
                                    onClick={() => {
                                        setSelectedDate(null);
                                        onAddEvent(selectedDayDetails.date);
                                    }}
                                    style={{
                                        marginTop: '0.5rem',
                                        padding: '0.5rem 1rem',
                                        border: '1px dashed var(--border-color)',
                                        borderRadius: '8px',
                                        background: 'var(--card-bg)',
                                        cursor: 'pointer',
                                        width: '100%',
                                        color: 'var(--text-secondary)'
                                    }}
                                >
                                    + 予定を追加
                                </button>
                            )}
                        </section>

                        {/* タスク */}
                        <section style={{ marginBottom: '1.5rem' }}>
                            <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.3rem' }}>
                                ✅ タスク
                            </h4>
                            {selectedDayDetails.tasks.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>タスクなし</p>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                    {selectedDayDetails.tasks.map(task => (
                                        <li
                                            key={task.id}
                                            style={{
                                                padding: '0.5rem 0',
                                                borderBottom: '1px solid var(--border-color)',
                                                opacity: task.isCompleted ? 0.6 : 1,
                                                textDecoration: task.isCompleted ? 'line-through' : 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{
                                                    backgroundColor: task.priority ? `hsl(${(5 - task.priority) * 30}, 70%, 50%)` : '#ccc',
                                                    color: 'white',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.7rem'
                                                }}>
                                                    {task.priority ? `P${task.priority}` : '-'}
                                                </span>
                                                <span style={{ flex: 1 }}>{task.title}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                                                {format(new Date(task.scheduledTime), 'HH:mm')}
                                                {task.isCompleted && ' ✓ 完了'}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {/* 自動スケジュール設定 */}
                        {onToggleExclude && (
                            <section style={{
                                borderTop: '2px solid var(--border-color)',
                                paddingTop: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>自動スケジュール</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {selectedDayDetails.isExcluded
                                            ? '🚫 除外中（タップで解除）'
                                            : selectedDayDetails.isForceIncluded
                                                ? '✓ 対象（手動設定、タップで解除）'
                                                : selectedDayDetails.isDayHoliday
                                                    ? '✅ 対象（タップで除外）'
                                                    : '⚠️ 対象外（予定あり、タップで対象に）'}
                                    </div>
                                    {selectedDayDetails.hasCustomSetting && (
                                        <div style={{ fontSize: '0.7rem', color: '#f57c00', marginTop: '0.2rem' }}>
                                            ※ 手動設定中（タップで元に戻す）
                                        </div>
                                    )}
                                </div>
                                <label style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                }}>
                                    <div style={{
                                        width: '50px',
                                        height: '26px',
                                        backgroundColor: selectedDayDetails.isDayHoliday ? '#4CAF50' : '#ccc',
                                        borderRadius: '13px',
                                        position: 'relative',
                                        transition: 'background-color 0.2s'
                                    }}>
                                        <div style={{
                                            width: '22px',
                                            height: '22px',
                                            backgroundColor: 'white',
                                            borderRadius: '50%',
                                            position: 'absolute',
                                            top: '2px',
                                            left: selectedDayDetails.isDayHoliday ? '26px' : '2px',
                                            transition: 'left 0.2s',
                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                        }} />
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={selectedDayDetails.isDayHoliday}
                                        onChange={handleToggleExclude}
                                        style={{ display: 'none' }}
                                    />
                                </label>
                            </section>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
