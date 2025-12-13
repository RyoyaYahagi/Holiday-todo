import type { Task, ScheduledTask, WorkEvent } from '../types';
import { isSameDay, getHours, setHours, setMinutes, startOfDay, subDays } from 'date-fns';

/**
 * 指定日が休日（タスクをスケジュールできる日）かどうかを判定する
 * 
 * 判定ルール:
 * - 「休み」イベントがある → 休日（タスク可）
 * - イベントが全くない → 休日（タスク可）
 * - 勤務イベント（日勤/夜勤）がある → 休日ではない（タスク不可）
 * - その他イベント（非勤務の予定）がある → 休日ではない（タスク不可）
 * 
 * @param date 判定対象の日付
 * @param events 勤務イベントの配列
 * @returns 休日の場合true、そうでない場合false
 */
export function isHoliday(date: Date, events: WorkEvent[]): boolean {
    const dayEvents = events.filter(e => isSameDay(e.start, date));

    // イベントがない日は休日
    if (dayEvents.length === 0) {
        return true;
    }

    // 「休み」イベントがある場合は休日
    const hasYasumi = dayEvents.some(e => e.eventType === '休み');
    if (hasYasumi) {
        return true;
    }

    // 勤務イベント（日勤/夜勤）または非勤務イベント（その他）がある場合は休日ではない
    // → タスクをスケジュールしない
    return false;
}

export function getPreviousWorkEndTime(date: Date, events: WorkEvent[]): Date | null {
    const prevDate = subDays(date, 1);
    const prevEvents = events.filter(e => isSameDay(e.start, prevDate));

    // Find the latest ending event of the previous day
    // Filter for work events (Not '休み')? 
    // Requirement says "前日の終業時間". 
    // If previous day was '休み', maybe there is no work?
    // Let's look for '夜勤' or '日勤' events.

    const workEvents = prevEvents.filter(e => e.eventType === '夜勤' || e.eventType === '日勤');

    if (workEvents.length === 0) return null;

    // Sort by end time desc
    workEvents.sort((a, b) => b.end.getTime() - a.end.getTime());

    return workEvents[0].end;
}

export function scheduleTasksForHoliday(
    date: Date,
    tasks: Task[],
    events: WorkEvent[]
): ScheduledTask[] {
    if (!isHoliday(date, events)) {
        return [];
    }

    // Determine start time
    // Default 08:00
    let startHour = 8;

    const prevEndTime = getPreviousWorkEndTime(date, events);

    if (prevEndTime) {
        const endHour = getHours(prevEndTime);
        // "前日の終業時間が 12:00 未満 → 13:00 開始"
        // "前日の終業時間が 12:00 以上 → 08:00 開始"
        if (endHour < 12) {
            startHour = 13;
        } else {
            startHour = 8;
        }
    }

    // Sort tasks by priority (1 is highest? Usually 5 is high, 1 is low, or vice versa. 
    // Request: "優先度（1〜5）が高い順に割り当てる".
    // Let's assume 5 is Highest, 1 is Lowest.

    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);

    // Take top 3
    const tasksToSchedule = sortedTasks.slice(0, 3);

    const scheduledTasks: ScheduledTask[] = [];
    let currentStartTime = setHours(setMinutes(startOfDay(date), 0), startHour);

    for (const task of tasksToSchedule) {
        scheduledTasks.push({
            ...task,
            scheduledTime: currentStartTime.getTime(),
            isCompleted: false
        });

        // "2時間おきにタスクを割り当てる"
        // Add 2 hours for next task
        currentStartTime = new Date(currentStartTime.getTime() + 2 * 60 * 60 * 1000);
    }

    return scheduledTasks;
}
