import type { Task, ScheduledTask, WorkEvent, AppSettings, RecurrenceRule } from '../types';
import { isSameDay, getHours, setHours, setMinutes, startOfDay, subDays, addDays, addWeeks, addMonths, addYears, isWeekend, getDay } from 'date-fns';

/**
 * 繰り返しルールに基づいて次の予定日時を計算する
 */
export function getNextOccurrence(rule: RecurrenceRule, lastScheduledTime: number): number {
    const lastDate = new Date(lastScheduledTime);
    let nextDate = lastDate;

    // intervalのデフォルト値は1
    const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;

    switch (rule.type) {
        case 'daily':
            nextDate = addDays(lastDate, interval);
            break;
        case 'weekly':
            if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
                const dayMap = [...rule.daysOfWeek].sort((a, b) => a - b);
                const currentDay = getDay(lastDate);

                // 同じ週の中で、今の曜日より後の曜日を探す
                const nextDayInWeek = dayMap.find(d => d > currentDay);

                if (nextDayInWeek !== undefined) {
                    // 同じ週の次の該当曜日へ
                    nextDate = addDays(lastDate, nextDayInWeek - currentDay);
                } else {
                    // 次のサイクルの最初の該当曜日へ
                    // まず、今の週の日曜日（基準）に戻る
                    const currentSun = subDays(lastDate, currentDay);
                    // interval分だけ週を進める
                    const nextCycleSun = addWeeks(currentSun, interval);
                    // その週の最初の該当曜日（dayMap[0]）を足す
                    nextDate = addDays(nextCycleSun, dayMap[0]);
                }
            } else {
                nextDate = addWeeks(lastDate, interval);
            }
            break;
        case 'biweekly':
            // 隔週: 2週間後の同じ曜日
            nextDate = addWeeks(lastDate, 2);
            break;
        case 'monthly':
            nextDate = addMonths(lastDate, interval);
            // dayOfMonthが指定されている場合、その日に補正（必要なら）
            if (rule.dayOfMonth) {
                // 基本的にaddMonthsで日付は維持されるが、月末処理などでずれた場合に元に戻すか？
                // 例: 1/31 -> addMonths -> 2/28. dayOfMonth=31なら、2/28のままでよい（31日はないから）。
                // 逆に 2/28 -> addMonths -> 3/28. dayOfMonth=31なら 3/31にすべき？
                // ここでは単純なaddMonthsのみとする。
                // もし厳密にするなら setDate(rule.dayOfMonth) を試みるが、月によって存在しない日の処理が必要。
            }
            break;
        case 'yearly':
            nextDate = addYears(lastDate, interval);
            break;
        case 'weekdays':
            // 平日のみ (月〜金)
            // interval日数分の平日を進めるのが定義だが、ここでは単純に「次の平日」をinterval回探すと解釈
            // または単にinterval関係なく「次の平日」か？ 通常このタイプはinterval=1で毎日平日。
            let remaining = interval;
            while (remaining > 0) {
                nextDate = addDays(nextDate, 1);
                while (isWeekend(nextDate)) {
                    nextDate = addDays(nextDate, 1);
                }
                remaining--;
            }
            break;
    }

    // 時間を維持する
    const h = new Date(lastScheduledTime).getHours();
    const m = new Date(lastScheduledTime).getMinutes();
    nextDate = setHours(setMinutes(nextDate, m), h);

    return nextDate.getTime();
}

/**
 * 日本の祝日かどうかを判定する（簡易版）
 * 
 * 固定祝日と一部の変動祝日に対応
 * ※春分の日・秋分の日は年によって異なるため近似値を使用
 * 
 * @param date - 判定対象の日付
 * @returns 祝日の場合true
 */
function isJapaneseHoliday(date: Date): boolean {
    const month = date.getMonth() + 1; // 1-indexed
    const day = date.getDate();
    const dayOfWeek = getDay(date); // 0=日, 1=月, ...

    // 固定祝日
    const fixedHolidays: { [key: string]: boolean } = {
        '1-1': true,   // 元日
        '2-11': true,  // 建国記念の日
        '2-23': true,  // 天皇誕生日
        '4-29': true,  // 昭和の日
        '5-3': true,   // 憲法記念日
        '5-4': true,   // みどりの日
        '5-5': true,   // こどもの日
        '8-11': true,  // 山の日
        '11-3': true,  // 文化の日
        '11-23': true, // 勤労感謝の日
    };

    if (fixedHolidays[`${month}-${day}`]) {
        return true;
    }

    // 春分の日（3月20日または21日、概算）
    if (month === 3 && (day === 20 || day === 21)) {
        return true;
    }

    // 秋分の日（9月22日または23日、概算）
    if (month === 9 && (day === 22 || day === 23)) {
        return true;
    }

    // ハッピーマンデー制度
    // 成人の日: 1月第2月曜日
    if (month === 1 && dayOfWeek === 1 && day >= 8 && day <= 14) {
        return true;
    }
    // 海の日: 7月第3月曜日
    if (month === 7 && dayOfWeek === 1 && day >= 15 && day <= 21) {
        return true;
    }
    // 敬老の日: 9月第3月曜日
    if (month === 9 && dayOfWeek === 1 && day >= 15 && day <= 21) {
        return true;
    }
    // スポーツの日: 10月第2月曜日
    if (month === 10 && dayOfWeek === 1 && day >= 8 && day <= 14) {
        return true;
    }

    return false;
}

/**
 * 指定日が休日（タスクをスケジュールできる日）かどうかを判定する
 * 
 * 判定優先順位:
 * 1. 「スケジュール対象」がある → 休日として扱う（予定ありでも強制対象）
 * 2. 「スケジュール除外」がある → 休日ではない（休日でも強制除外）
 * 3. 「休み」がある → 休日
 * 4. 日勤/夜勤/その他がある → 休日ではない（予定あり）
 * 5. イベントなし:
 *    - 予定表読み込み前（全体イベント0件）→ 土日祝は休日
 *    - 予定表読み込み後（全体イベント1件以上）→ その日は休日
 * 
 * @param date - 判定対象の日付
 * @param events - 判定に使用するイベント配列
 * @returns 休日（自動スケジュール可能）の場合true
 */
export function isHoliday(date: Date, events: WorkEvent[]): boolean {
    const dayEvents = events.filter(e => isSameDay(e.start, date));

    // 「スケジュール対象」イベントがある場合は休日（予定ありでも強制的にスケジュール対象）
    const hasForceIncluded = dayEvents.some(e => e.eventType === 'スケジュール対象');
    if (hasForceIncluded) {
        return true;
    }

    // 「スケジュール除外」イベントがある場合は休日ではない（自動スケジュール対象外）
    const hasExcluded = dayEvents.some(e => e.eventType === 'スケジュール除外');
    if (hasExcluded) {
        return false;
    }

    // 「休み」イベントがある場合は休日
    const hasYasumi = dayEvents.some(e => e.eventType === '休み');
    if (hasYasumi) {
        return true;
    }

    // 予定（日勤/夜勤/その他）がある場合は休日ではない
    const hasWork = dayEvents.some(e =>
        e.eventType === '日勤' || e.eventType === '夜勤' || e.eventType === 'その他'
    );
    if (hasWork) {
        return false;
    }

    // イベントがない日の判定
    // 予定表（ICS）を読み込んでいるかどうかで振る舞いを変える
    // スケジュール対象/除外以外のイベントがあるかどうかで判定
    const hasCalendarEvents = events.some(e =>
        e.eventType !== 'スケジュール対象' && e.eventType !== 'スケジュール除外'
    );

    if (hasCalendarEvents) {
        // 予定表読み込み後: イベントがない日は休日
        return true;
    } else {
        // 予定表読み込み前: 土日祝のみ休日（一般的なカレンダーに準拠）
        return isWeekend(date) || isJapaneseHoliday(date);
    }
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
 * 「休み」「その他」イベントの時間帯は避ける
 */
export function scheduleTasksForHoliday(
    date: Date,
    tasksToSchedule: Task[],
    events: WorkEvent[],
    settings: AppSettings,
    existingTasks: ScheduledTask[] = []
): ScheduledTask[] {
    if (!isHoliday(date, events)) {
        return [];
    }
    if (tasksToSchedule.length === 0) {
        return [];
    }

    // 基本の開始時間を決定
    let startHour = settings.startTimeMorning;
    const prevEndTime = getPreviousWorkEndTime(date, events);
    if (prevEndTime) {
        const endHour = getHours(prevEndTime);
        if (endHour < 12) {
            startHour = settings.startTimeAfternoon;
        } else {
            startHour = settings.startTimeMorning;
        }
    }

    const scheduledTasks: ScheduledTask[] = [];

    // この日の既存タスクの時間をSetに（重複チェック用）
    const occupiedTimes = new Set(
        existingTasks
            .filter(t => isSameDay(new Date(t.scheduledTime), date))
            .map(t => new Date(t.scheduledTime).getTime())
    );

    // この日の「休み」「その他」イベントを取得（時間回避用）
    const dayEvents = events.filter(e =>
        isSameDay(e.start, date) &&
        (e.eventType === '休み' || e.eventType === 'その他')
    );

    /**
     * 指定時刻がイベントの時間帯と重複するか判定
     */
    const isTimeConflictWithEvents = (checkTime: Date): boolean => {
        const checkStart = checkTime.getTime();
        const checkEnd = checkStart + settings.scheduleInterval * 60 * 60 * 1000;

        for (const event of dayEvents) {
            const eventStart = event.start.getTime();
            const eventEnd = event.end.getTime();

            // 時間帯が重複する場合
            if (checkStart < eventEnd && checkEnd > eventStart) {
                return true;
            }
        }
        return false;
    };

    // スロット候補生成
    let currentStartTime = setHours(setMinutes(startOfDay(date), 0), startHour);

    for (const task of tasksToSchedule) {
        // 空きスロットを探す
        // ループ制限: 日付が変わるまで
        let slotFound = false;
        let attempts = 0;

        // 1日の最大タスク数の3倍まで探索（余裕を持たせる）
        const maxAttempts = (settings.maxTasksPerDay || 3) * 3;
        while (attempts < maxAttempts) {
            const timeTime = currentStartTime.getTime();

            // 既存タスクとの重複チェック + イベント時間との重複チェック
            if (!occupiedTimes.has(timeTime) && !isTimeConflictWithEvents(currentStartTime)) {
                // 空いている
                slotFound = true;
                break;
            }

            // 次のスロットへ（設定された間隔）
            currentStartTime = new Date(currentStartTime.getTime() + settings.scheduleInterval * 60 * 60 * 1000);
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
            currentStartTime = new Date(currentStartTime.getTime() + settings.scheduleInterval * 60 * 60 * 1000);
        } else {
            // スロットが見つからなかったらこのタスクはこの日にスケジュールできない
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

// ... (imports)

// ... (other functions: isHoliday, getPreviousWorkEndTime, scheduleTasksForHoliday, findNextHolidays)

/**
 * 未完了タスクを再スケジュールする
 * 
 * scheduleType === 'priority' のタスクのみ自動スケジュール対象。
 * 時間指定タスク(scheduleType === 'time')の時間帯は自動スケジュールで避ける。
 * 完了済みのスケジュール済みタスクは動かさない。
 */
export function reschedulePendingTasks(
    allTasks: Task[],
    existingScheduledTasks: ScheduledTask[],
    events: WorkEvent[],
    settings: AppSettings,
    today: Date = new Date()
): {
    newSchedules: ScheduledTask[],
    obsoleteScheduleIds: string[]
} {
    // 1. 完了済みのスケジュール済みタスクを特定（これは保持、動かさない）
    const completedSchedules = existingScheduledTasks.filter(t => t.isCompleted);
    const completedTaskIds = new Set(completedSchedules.map(t => t.taskId));

    // 2. 時間指定タスク・繰り返しタスク（手動スケジュール）を特定
    //    これらは自動スケジュールの対象外だがその時間帯を避ける必要がある
    const manualTimeTasks = allTasks.filter(t =>
        (t.scheduleType === 'time' || t.scheduleType === 'recurrence') && t.manualScheduledTime
    );

    // 3. 自動スケジューリング対象: scheduleType === 'priority' かつ未完了
    const pendingPriorityTasks = allTasks
        .filter(t => t.scheduleType === 'priority' && !completedTaskIds.has(t.id))
        .sort((a, b) => {
            // 優先度順（高い順）、同じ優先度なら古い順
            const priorityA = a.priority ?? 1;
            const priorityB = b.priority ?? 1;
            if (priorityB !== priorityA) return priorityB - priorityA;
            return a.createdAt - b.createdAt;
        });

    // 4. 削除すべき既存スケジュールID
    //    未完了のもの全て（自動スケジュール分のみ削除）
    const obsoleteScheduleIds = existingScheduledTasks
        .filter(t => !t.isCompleted && t.scheduleType === 'priority')
        .map(t => t.id);

    // 5. スケジューリング実行
    const newSchedules: ScheduledTask[] = [];

    // 保持するスケジュール（完了済み + 手動時間指定）をベースにする
    const currentAllocation = [...completedSchedules];

    // 手動時間指定タスクの時間もブロック対象に追加
    for (const task of manualTimeTasks) {
        if (task.manualScheduledTime) {
            currentAllocation.push({
                ...task,
                taskId: task.id,
                scheduledTime: task.manualScheduledTime,
                isCompleted: false
            } as ScheduledTask);
        }
    }

    let taskIndex = 0;
    // 今日から検索開始
    let searchDate = startOfDay(today);
    let daysSearched = 0;

    while (taskIndex < pendingPriorityTasks.length && daysSearched < 90) {
        if (isHoliday(searchDate, events)) {
            // この日の既存タスク（完了済み + 手動指定）
            const dayExisting = currentAllocation.filter(t => isSameDay(new Date(t.scheduledTime), searchDate));

            // 空きスロット数 (設定された1日の最大数 - 既存数)
            const slotsAvailable = Math.max(0, settings.maxTasksPerDay - dayExisting.length);

            if (slotsAvailable > 0) {
                // この日に割り当てるタスク
                const chunk = pendingPriorityTasks.slice(taskIndex, taskIndex + slotsAvailable);

                // スケジュール実行
                const scheduled = scheduleTasksForHoliday(searchDate, chunk, events, settings, dayExisting);

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

/**
 * @deprecated この関数は廃止予定です。代わりに reschedulePendingTasks を使用してください。
 * 互換性のためにのみ残されています。
 */
export const scheduleTasksAcrossHolidays = (
    _tasks: Task[],
    _events: WorkEvent[],
    _scheduledTasks: ScheduledTask[],
    _today: Date
    // Note: This needs refactoring if it's ever used again, to accept settings.
): ScheduledTask[] => {
    return [];
};
