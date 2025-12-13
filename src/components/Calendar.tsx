import React, { useState } from 'react';
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
    isToday
} from 'date-fns';
import { ja } from 'date-fns/locale';
import type { WorkEvent, ScheduledTask } from '../types';
import { isHoliday } from '../lib/scheduler';

interface CalendarProps {
    events: WorkEvent[];
    scheduledTasks: ScheduledTask[];
}

export const Calendar: React.FC<CalendarProps> = ({ events, scheduledTasks }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

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

    const getDayContent = (day: Date) => {
        const dayEvents = events.filter(e => isSameDay(e.start, day));
        const dayTasks = scheduledTasks.filter(t => isSameDay(new Date(t.scheduledTime), day));
        const isDayHoliday = isHoliday(day, events); // This checks if day has '休み' or NO events (if we treat no events as holiday per rule?)
        // Note: The rule "当日に '休み' イベントがある、またはイベントが存在しない場合は休日"
        // However, if we only loaded partial data, "no events" might be dangerous.
        // Usually user loads full schedule.
        // Implementing strictly as requested: "イベントが存在しない場合は休日"

        // Check if we have ANY events for this day
        const hasAnyEvent = dayEvents.length > 0;
        const isYasumi = dayEvents.some(e => e.eventType === '休み');

        let cellClass = 'day-cell';
        if (!isSameMonth(day, monthStart)) cellClass += ' other-month';
        if (isToday(day)) cellClass += ' today';
        if (isDayHoliday) cellClass += ' holiday'; // Visual cue for holiday

        return (
            <div className={cellClass}>
                <div className="day-header">
                    <span className="day-number">{format(day, 'd')}</span>
                    {isYasumi && <span className="badge-yasumi">休</span>}
                    {!isYasumi && hasAnyEvent && dayEvents.map((e, i) => (
                        <span key={i} className={`badge-work ${e.eventType === '夜勤' ? 'yakin' : 'nikkin'}`}>
                            {e.eventType.charAt(0)}
                        </span>
                    ))}
                </div>
                <div className="day-content">
                    {dayTasks.map(task => (
                        <div key={task.id} className="mini-task">
                            {format(new Date(task.scheduledTime), 'HH:mm')} {task.title}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="calendar-container">
            <div className="calendar-header">
                <button onClick={prevMonth}>&lt;</button>
                <h2>{format(currentDate, 'yyyy年 M月', { locale: ja })}</h2>
                <button onClick={nextMonth}>&gt;</button>
            </div>
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
        </div>
    );
};
