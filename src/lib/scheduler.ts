import type { Task, ScheduledTask, WorkEvent } from '../types';
import { isSameDay, getHours, setHours, setMinutes, startOfDay, subDays, addDays } from 'date-fns';

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
            id: crypto.randomUUID(), // ScheduledTask独自のID
            taskId: task.id, // 元タスクへの参照
            scheduledTime: currentStartTime.getTime(),
            isCompleted: false
        });

        // "2時間おきにタスクを割り当てる"
        // Add 2 hours for next task
        currentStartTime = new Date(currentStartTime.getTime() + 2 * 60 * 60 * 1000);
    }

    return scheduledTasks;
}

/**
 * 指定日以降の休日を検索する
 * 
 * @param startDate 検索開始日
 * @param events 勤務イベントの配列
 * @param scheduledTasks 既存のスケジュール済みタスク
 * @param count 検索する休日の数
 * @param includeStartDate 開始日を含めるかどうか
 * @returns 休日の配列（最大count件）
 */
export function findNextHolidays(
    startDate: Date,
    events: WorkEvent[],
    scheduledTasks: ScheduledTask[],
    count: number,
    includeStartDate: boolean = true
): Date[] {
    const holidays: Date[] = [];
    let currentDate = startOfDay(startDate);

    // 開始日を含めない場合は1日進める
    if (!includeStartDate) {
        currentDate = addDays(currentDate, 1);
    }

    // 最大90日先まで検索（無限ループ防止）
    const maxDays = 90;
    let daysSearched = 0;

    while (holidays.length < count && daysSearched < maxDays) {
        if (isHoliday(currentDate, events)) {
            // この日にスケジュール済みのタスクが3件未満かチェック
            const dayTasks = scheduledTasks.filter(t =>
                isSameDay(new Date(t.scheduledTime), currentDate)
            );

            if (dayTasks.length < 3) {
                holidays.push(new Date(currentDate));
            }
        }

        currentDate = addDays(currentDate, 1);
        daysSearched++;
    }

    return holidays;
}

/**
 * タスクを複数の休日に分配してスケジュールする
 * 
 * ルール:
 * - タスク追加日が休日 → その休日 + 次の休日にスケジュール
 * - タスク追加日が休日ではない → 次の休日 + 次の次の休日にスケジュール
 * - 各休日には最大3件まで
 * - 優先度が高い順にスケジュール
 * 
 * @param tasks タスクプールのタスク
 * @param events 勤務イベントの配列
 * @param scheduledTasks 既存のスケジュール済みタスク
 * @param today 今日の日付
 * @returns 新しくスケジュールされたタスクの配列
 */
export function scheduleTasksAcrossHolidays(
    tasks: Task[],
    events: WorkEvent[],
    scheduledTasks: ScheduledTask[],
    today: Date
): ScheduledTask[] {
    // 既にスケジュール済みのタスクID（元タスクのID）を取得
    // taskIdフィールドがない既存データの後方互換性のため、idをフォールバックとして使用
    const scheduledTaskIds = new Set(scheduledTasks.map(t => t.taskId || t.id));

    // まだスケジュールされていないタスクのみを対象にする
    const unscheduledTasks = tasks.filter(t => !scheduledTaskIds.has(t.id));

    if (unscheduledTasks.length === 0) {
        return [];
    }

    // 優先度順にソート
    const sortedTasks = [...unscheduledTasks].sort((a, b) => b.priority - a.priority);

    // 今日が休日かどうかで対象の休日を決定
    const isTodayHoliday = isHoliday(today, events);

    // 対象の休日を取得（2件）
    const targetHolidays = findNextHolidays(
        today,
        events,
        scheduledTasks,
        2,
        isTodayHoliday // 今日が休日なら今日を含める
    );

    if (targetHolidays.length === 0) {
        return [];
    }

    const newScheduledTasks: ScheduledTask[] = [];
    let taskIndex = 0;

    for (const holiday of targetHolidays) {
        // この日の既存スケジュール数を確認
        const existingDayTasks = scheduledTasks.filter(t =>
            isSameDay(new Date(t.scheduledTime), holiday)
        );

        // この日に追加できる残り枠
        const slotsAvailable = 3 - existingDayTasks.length;

        if (slotsAvailable <= 0) continue;

        // この日にスケジュールするタスクを取得
        const tasksForThisDay = sortedTasks.slice(taskIndex, taskIndex + slotsAvailable);

        if (tasksForThisDay.length === 0) break;

        // この日のスケジュールを作成
        const daySchedule = scheduleTasksForHoliday(holiday, tasksForThisDay, events);
        newScheduledTasks.push(...daySchedule);

        taskIndex += tasksForThisDay.length;

        // 全タスクをスケジュールした場合は終了
        if (taskIndex >= sortedTasks.length) break;
    }

    return newScheduledTasks;
}
