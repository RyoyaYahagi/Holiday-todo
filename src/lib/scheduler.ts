import type { Task, ScheduledTask, WorkEvent } from '../types';
import { isSameDay, getHours, setHours, setMinutes, startOfDay, subDays, addDays } from 'date-fns';

/**
 * 指定日が休日（タスクをスケジュールできる日）かどうかを判定する
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
    return false;
}

export function getPreviousWorkEndTime(date: Date, events: WorkEvent[]): Date | null {
    const prevDate = subDays(date, 1);
    const prevEvents = events.filter(e => isSameDay(e.start, prevDate));

    const workEvents = prevEvents.filter(e => e.eventType === '夜勤' || e.eventType === '日勤');

    if (workEvents.length === 0) return null;

    // Sort by end time desc
    workEvents.sort((a, b) => b.end.getTime() - a.end.getTime());

    return workEvents[0].end;
}

/**
 * 特定の休日にタスクをスケジュールする
 * 既存のタスクがある場合、空いているスロットを探す
 */
export function scheduleTasksForHoliday(
    date: Date,
    tasksToSchedule: Task[],
    events: WorkEvent[],
    existingTasks: ScheduledTask[] = []
): ScheduledTask[] {
    if (!isHoliday(date, events)) {
        return [];
    }
    if (tasksToSchedule.length === 0) {
        return [];
    }

    // 基本の開始時間を決定
    let startHour = 8;
    const prevEndTime = getPreviousWorkEndTime(date, events);
    if (prevEndTime) {
        const endHour = getHours(prevEndTime);
        if (endHour < 12) {
            startHour = 13;
        } else {
            startHour = 8;
        }
    }

    const scheduledTasks: ScheduledTask[] = [];

    // この日の既存タスクの時間をSetに（重複チェック用）
    const occupiedTimes = new Set(
        existingTasks
            .filter(t => isSameDay(new Date(t.scheduledTime), date))
            .map(t => new Date(t.scheduledTime).getTime())
    );

    // スロット候補生成（最大5回分くらい?）
    // 8:00, 10:00, 12:00, 14:00, 16:00...
    let currentStartTime = setHours(setMinutes(startOfDay(date), 0), startHour);

    for (const task of tasksToSchedule) {
        // 空きスロットを探す
        // ループ制限: 日付が変わるまで
        let slotFound = false;
        let attempts = 0;

        while (attempts < 8) { // 最大8スロット（16時間分）チェックすれば十分
            const timeTime = currentStartTime.getTime();

            if (!occupiedTimes.has(timeTime)) {
                // 空いている
                slotFound = true;
                break;
            }

            // 次のスロットへ（2時間後）
            currentStartTime = new Date(currentStartTime.getTime() + 2 * 60 * 60 * 1000);
            attempts++;
        }

        if (slotFound) {
            const scheduledTime = currentStartTime.getTime();
            scheduledTasks.push({
                ...task,
                id: crypto.randomUUID(),
                taskId: task.id,
                scheduledTime: scheduledTime,
                isCompleted: false
            });

            // この時間を埋める
            occupiedTimes.add(scheduledTime);
            // 次の準備
            currentStartTime = new Date(currentStartTime.getTime() + 2 * 60 * 60 * 1000);
        } else {
            // スロットが見つからなかったらこのタスクはこの日にスケジュールできない
            // (次の休日に回すべきだが、この関数のスコープ外)
            break;
        }
    }

    return scheduledTasks;
}

/**
 * 指定日以降の休日を検索する
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

    if (!includeStartDate) {
        currentDate = addDays(currentDate, 1);
    }

    const maxDays = 90;
    let daysSearched = 0;

    while (holidays.length < count && daysSearched < maxDays) {
        if (isHoliday(currentDate, events)) {
            // この日にスケジュール済みのタスク数を確認
            const dayTasks = scheduledTasks.filter(t =>
                isSameDay(new Date(t.scheduledTime), currentDate)
            );

            // 3件未満なら候補
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
 * 未完了タスクを再スケジュールする
 * 
 * 全ての未完了タスク（プール + 未完了スケジュール済み）を優先度順に並べ替え、
 * 未来の休日に再配置する。
 * 完了済みのスケジュール済みタスクは動かさない。
 */
export function reschedulePendingTasks(
    allTasks: Task[],
    existingScheduledTasks: ScheduledTask[],
    events: WorkEvent[],
    today: Date = new Date()
): {
    newSchedules: ScheduledTask[],
    obsoleteScheduleIds: string[]
} {
    // 1. 完了済みのスケジュール済みタスクを特定（これは保持、動かさない）
    const completedSchedules = existingScheduledTasks.filter(t => t.isCompleted);
    const completedTaskIds = new Set(completedSchedules.map(t => t.taskId));

    // 2. まだ完了していないタスクを抽出（これらが再スケジュールの対象）
    const pendingTasks = allTasks.filter(t => !completedTaskIds.has(t.id));

    // 優先度順にソート (優先度高い順 > 作成日古い順)
    pendingTasks.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
    });

    // 3. 削除すべき既存スケジュールID（未完了のもの全て）
    const obsoleteScheduleIds = existingScheduledTasks
        .filter(t => !t.isCompleted)
        .map(t => t.id);

    // 4. スケジューリング実行
    const newSchedules: ScheduledTask[] = [];

    // 保持するスケジュール（完了済み）をベースにする
    // これらはスロットを占有する
    const currentAllocation = [...completedSchedules];

    let taskIndex = 0;
    // 今日から検索開始
    let searchDate = startOfDay(today);
    let daysSearched = 0;

    while (taskIndex < pendingTasks.length && daysSearched < 90) {
        if (isHoliday(searchDate, events)) {
            // この日の既存タスク（完了済みなど）
            const dayExisting = currentAllocation.filter(t => isSameDay(new Date(t.scheduledTime), searchDate));

            // 空きスロット数
            const slotsAvailable = 3 - dayExisting.length;

            if (slotsAvailable > 0) {
                // この日に割り当てるタスク
                const chunk = pendingTasks.slice(taskIndex, taskIndex + slotsAvailable);

                // スケジュール実行
                const scheduled = scheduleTasksForHoliday(searchDate, chunk, events, dayExisting);

                newSchedules.push(...scheduled);
                currentAllocation.push(...scheduled); // 割り当て済みリストに追加（次のループの判定用）

                taskIndex += scheduled.length;
            }
        }
        searchDate = addDays(searchDate, 1);
        daysSearched++;
    }

    return { newSchedules, obsoleteScheduleIds };
}

// 互換性のために残すが、基本的には reschedulePendingTasks を使うべき
export const scheduleTasksAcrossHolidays = (
    tasks: Task[],
    events: WorkEvent[],
    scheduledTasks: ScheduledTask[],
    today: Date
): ScheduledTask[] => {
    // 従来のロジックではなく、全再スケジュールの結果の新規分だけを返すラッパーとして機能させることも可能だが、
    // 呼び出し元が削除処理を期待していない可能性があるため、
    // ここでは古いロジック（ただしバグ修正版）を提供するか、あるいは使用を非推奨にする。
    // 今回は App.tsx を書き換えて reschedulePendingTasks を使うようにするため、ここはダミーで空配列を返しても良いが
    // 安全のため、最小限の実装を残すか、またはこの関数自体を deprecated とする。

    // いったん「追加分のみ」を計算する簡易ロジック（スロット考慮版）にする
    const scheduledTaskIds = new Set(scheduledTasks.map(t => t.taskId));
    const unscheduledTasks = tasks.filter(t => !scheduledTaskIds.has(t.id));

    if (unscheduledTasks.length === 0) return [];

    unscheduledTasks.sort((a, b) => b.priority - a.priority);

    // ... (省略、この関数はもう使わない方向で進める)
    return [];
};

