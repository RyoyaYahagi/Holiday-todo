/**
 * scheduler.ts のユニットテスト
 *
 * テストの目的:
 * - 休日判定ロジック（isHoliday）の正確性を検証
 * - 繰り返しタスクの次回日時計算（getNextOccurrence）の正確性を検証
 * - 自動スケジューリング（reschedulePendingTasks）が手動設定タスクを保護することを検証
 * - スケジューリングスロットの衝突回避を検証
 *
 * 前提:
 * - Node.js 20+
 * - vitest がインストール済み
 */
import { describe, it, expect } from 'vitest';
import {
    isHoliday,
    getNextOccurrence,
    reschedulePendingTasks,
    scheduleTasksForHoliday,
    findNextHolidays,
    getPreviousWorkEndTime,
} from './scheduler';
import type { Task, ScheduledTask, WorkEvent, AppSettings, RecurrenceRule } from '../types';
import { addDays, startOfDay, setHours, setMinutes } from 'date-fns';

/**
 * テスト用のモックデータ生成ヘルパー
 */
const createMockEvent = (
    date: Date,
    eventType: '夜勤' | '日勤' | '休み' | 'その他' | 'スケジュール除外' | 'スケジュール対象',
    endDate?: Date
): WorkEvent => ({
    title: `${eventType}イベント`,
    start: date,
    end: endDate || new Date(date.getTime() + 8 * 60 * 60 * 1000), // 8時間後
    eventType,
});

const createMockTask = (
    id: string,
    title: string,
    scheduleType: 'priority' | 'time' | 'recurrence' | 'none',
    priority?: 1 | 2 | 3 | 4 | 5,
    manualScheduledTime?: number
): Task => ({
    id,
    title,
    createdAt: Date.now(),
    scheduleType,
    priority,
    manualScheduledTime,
});

const createMockScheduledTask = (
    taskId: string,
    title: string,
    scheduledTime: number,
    isCompleted: boolean,
    scheduleType: 'priority' | 'time' | 'recurrence' | 'none' = 'priority'
): ScheduledTask => ({
    id: `scheduled-${taskId}`,
    taskId,
    title,
    createdAt: Date.now(),
    scheduleType,
    scheduledTime,
    isCompleted,
});

const defaultSettings: AppSettings = {
    notificationMethod: 'line',
    lineUserId: '',
    discordWebhookUrl: '',
    notifyOnDayBefore: true,
    notifyDayBeforeTime: '21:00',
    notifyBeforeTask: true,
    notifyBeforeTaskMinutes: 30,
    maxPriority: 5,
    scheduleInterval: 2,
    startTimeMorning: 8,
    startTimeAfternoon: 13,
    maxTasksPerDay: 3,
};

// =========================================
// isHoliday テスト
// =========================================
describe('isHoliday - 休日判定ロジック', () => {
    // 予定表読み込み前（イベントなし）のテスト
    it('予定表読み込み前: イベントがない土日は休日として判定される', () => {
        const date = new Date('2024-01-13'); // 土曜日
        const events: WorkEvent[] = [];

        expect(isHoliday(date, events)).toBe(true);
    });

    it('予定表読み込み前: イベントがない平日は休日ではない', () => {
        const date = new Date('2024-01-15'); // 月曜日
        const events: WorkEvent[] = [];

        expect(isHoliday(date, events)).toBe(false);
    });

    // 予定表読み込み後（イベントあり）のテスト
    it('予定表読み込み後: イベントがない日は休日として判定される', () => {
        const date = new Date('2024-01-15'); // 月曜日
        // 他の日にイベントがある（ICS読み込み済みの状態）
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-14T09:00:00'), '日勤'),
        ];

        expect(isHoliday(date, events)).toBe(true);
    });

    it('「休み」イベントがある日は休日として判定される', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T09:00:00'), '休み'),
        ];

        expect(isHoliday(date, events)).toBe(true);
    });

    it('「日勤」イベントがある日は休日ではない', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T09:00:00'), '日勤'),
        ];

        expect(isHoliday(date, events)).toBe(false);
    });

    it('「夜勤」イベントがある日は休日ではない', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T21:00:00'), '夜勤'),
        ];

        expect(isHoliday(date, events)).toBe(false);
    });

    it('「その他」イベントがある日は休日ではない', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T10:00:00'), 'その他'),
        ];

        expect(isHoliday(date, events)).toBe(false);
    });

    it('複数イベントがあり「休み」が含まれる場合は休日', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T09:00:00'), 'その他'),
            createMockEvent(new Date('2024-01-15T14:00:00'), '休み'),
        ];

        expect(isHoliday(date, events)).toBe(true);
    });

    it('異なる日のイベントは判定に影響しない（土日は休日）', () => {
        const date = new Date('2024-01-13'); // 土曜日
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-12T09:00:00'), '日勤'),
            createMockEvent(new Date('2024-01-14T09:00:00'), '夜勤'),
        ];

        expect(isHoliday(date, events)).toBe(true);
    });

    it('「スケジュール除外」イベントがある日は休日ではない（自動スケジュール対象外）', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T00:00:00'), 'スケジュール除外'),
        ];

        expect(isHoliday(date, events)).toBe(false);
    });

    it('「休み」と「スケジュール除外」が両方ある場合、スケジュール除外が優先される', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T00:00:00'), '休み'),
            createMockEvent(new Date('2024-01-15T00:00:00'), 'スケジュール除外'),
        ];

        expect(isHoliday(date, events)).toBe(false);
    });

    it('「スケジュール対象」イベントがある日は休日（勤務日でも強制対象）', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T09:00:00'), '日勤'),
            createMockEvent(new Date('2024-01-15T00:00:00'), 'スケジュール対象'),
        ];

        expect(isHoliday(date, events)).toBe(true);
    });

    it('「スケジュール対象」は「スケジュール除外」より優先される', () => {
        const date = new Date('2024-01-15');
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-15T00:00:00'), 'スケジュール対象'),
            createMockEvent(new Date('2024-01-15T00:00:00'), 'スケジュール除外'),
        ];

        // スケジュール対象が最優先
        expect(isHoliday(date, events)).toBe(true);
    });
});

// =========================================
// getNextOccurrence テスト
// =========================================
describe('getNextOccurrence - 繰り返し次回日時計算', () => {
    const baseTime = new Date('2024-01-15T10:00:00').getTime(); // 月曜日

    describe('daily（毎日）', () => {
        it('interval=1で翌日に繰り返し', () => {
            const rule: RecurrenceRule = { type: 'daily', interval: 1 };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getDate()).toBe(16);
            expect(nextDate.getHours()).toBe(10);
            expect(nextDate.getMinutes()).toBe(0);
        });

        it('interval=3で3日後に繰り返し', () => {
            const rule: RecurrenceRule = { type: 'daily', interval: 3 };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getDate()).toBe(18);
        });

        it('intervalが未設定の場合はデフォルト1', () => {
            const rule: RecurrenceRule = { type: 'daily' };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getDate()).toBe(16);
        });
    });

    describe('weekly（毎週）', () => {
        it('daysOfWeek指定なしでinterval=1の場合、1週間後', () => {
            const rule: RecurrenceRule = { type: 'weekly', interval: 1 };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getDate()).toBe(22); // 1週間後
        });

        it('daysOfWeek=[3]（水曜）で次の水曜日に繰り返し', () => {
            // 2024-01-15は月曜日（getDay()=1）
            const rule: RecurrenceRule = { type: 'weekly', daysOfWeek: [3] };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getDay()).toBe(3); // 水曜日
            expect(nextDate.getDate()).toBe(17); // 1/17
        });

        it('daysOfWeek=[0]（日曜）で次の週の日曜日に繰り返し', () => {
            // 2024-01-15は月曜日、次の日曜は1/21
            const rule: RecurrenceRule = { type: 'weekly', daysOfWeek: [0], interval: 1 };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getDay()).toBe(0); // 日曜日
            expect(nextDate.getDate()).toBe(21); // 1/21
        });
    });

    describe('monthly（毎月）', () => {
        it('interval=1で翌月の同日に繰り返し', () => {
            const rule: RecurrenceRule = { type: 'monthly', interval: 1 };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getMonth()).toBe(1); // 2月
            expect(nextDate.getDate()).toBe(15);
        });
    });

    describe('yearly（毎年）', () => {
        it('interval=1で翌年の同日に繰り返し', () => {
            const rule: RecurrenceRule = { type: 'yearly', interval: 1 };
            const next = getNextOccurrence(rule, baseTime);

            const nextDate = new Date(next);
            expect(nextDate.getFullYear()).toBe(2025);
            expect(nextDate.getMonth()).toBe(0); // 1月
            expect(nextDate.getDate()).toBe(15);
        });
    });

    describe('weekdays（平日のみ）', () => {
        it('金曜日の場合、次の平日（月曜日）に繰り返し', () => {
            const fridayTime = new Date('2024-01-19T10:00:00').getTime();
            const rule: RecurrenceRule = { type: 'weekdays', interval: 1 };
            const next = getNextOccurrence(rule, fridayTime);

            const nextDate = new Date(next);
            expect(nextDate.getDay()).toBe(1); // 月曜日
            expect(nextDate.getDate()).toBe(22);
        });

        it('水曜日の場合、翌日（木曜日）に繰り返し', () => {
            const wednesdayTime = new Date('2024-01-17T10:00:00').getTime();
            const rule: RecurrenceRule = { type: 'weekdays', interval: 1 };
            const next = getNextOccurrence(rule, wednesdayTime);

            const nextDate = new Date(next);
            expect(nextDate.getDay()).toBe(4); // 木曜日
            expect(nextDate.getDate()).toBe(18);
        });
    });

    it('時刻が維持される', () => {
        const timeWithMinutes = new Date('2024-01-15T14:30:00').getTime();
        const rule: RecurrenceRule = { type: 'daily', interval: 1 };
        const next = getNextOccurrence(rule, timeWithMinutes);

        const nextDate = new Date(next);
        expect(nextDate.getHours()).toBe(14);
        expect(nextDate.getMinutes()).toBe(30);
    });
});

// =========================================
// reschedulePendingTasks テスト
// =========================================
describe('reschedulePendingTasks - 自動スケジューリング', () => {
    const today = new Date('2024-01-15T09:00:00'); // 月曜日

    it('手動スケジュールタスク（time）は削除されない', () => {
        const tasks: Task[] = [
            createMockTask('task-1', 'タスク1', 'priority', 3),
            createMockTask('task-2', 'タスク2', 'time', undefined, new Date('2024-01-16T10:00:00').getTime()),
        ];

        const existingScheduledTasks: ScheduledTask[] = [
            createMockScheduledTask('task-2', 'タスク2', new Date('2024-01-16T10:00:00').getTime(), false, 'time'),
        ];

        const events: WorkEvent[] = []; // 全日休日

        const result = reschedulePendingTasks(tasks, existingScheduledTasks, events, defaultSettings, today);

        // 手動タスクのIDは削除対象に含まれない
        expect(result.obsoleteScheduleIds).not.toContain('scheduled-task-2');
    });

    it('手動スケジュールタスク（recurrence）は削除されない', () => {
        const tasks: Task[] = [
            createMockTask('task-1', 'タスク1', 'recurrence', undefined, new Date('2024-01-16T10:00:00').getTime()),
        ];

        const existingScheduledTasks: ScheduledTask[] = [
            createMockScheduledTask('task-1', 'タスク1', new Date('2024-01-16T10:00:00').getTime(), false, 'recurrence'),
        ];

        const events: WorkEvent[] = [];

        const result = reschedulePendingTasks(tasks, existingScheduledTasks, events, defaultSettings, today);

        expect(result.obsoleteScheduleIds).not.toContain('scheduled-task-1');
    });

    it('完了済みタスクは再スケジュールされない', () => {
        const tasks: Task[] = [
            createMockTask('task-1', 'タスク1', 'priority', 3),
        ];

        const existingScheduledTasks: ScheduledTask[] = [
            createMockScheduledTask('task-1', 'タスク1', new Date('2024-01-16T10:00:00').getTime(), true, 'priority'),
        ];

        const events: WorkEvent[] = [];

        const result = reschedulePendingTasks(tasks, existingScheduledTasks, events, defaultSettings, today);

        // 完了済みは削除対象に含まれない
        expect(result.obsoleteScheduleIds).not.toContain('scheduled-task-1');
        // 新しいスケジュールにも含まれない
        expect(result.newSchedules.find(s => s.taskId === 'task-1')).toBeUndefined();
    });

    it('優先度の高いタスクから順にスケジュールされる', () => {
        const tasks: Task[] = [
            createMockTask('task-low', 'タスク低', 'priority', 1),
            createMockTask('task-high', 'タスク高', 'priority', 5),
            createMockTask('task-mid', 'タスク中', 'priority', 3),
        ];

        const events: WorkEvent[] = [];

        const result = reschedulePendingTasks(tasks, [], events, defaultSettings, today);

        // 最初にスケジュールされるのは優先度5のタスク
        expect(result.newSchedules[0].title).toBe('タスク高');
        expect(result.newSchedules[1].title).toBe('タスク中');
        expect(result.newSchedules[2].title).toBe('タスク低');
    });

    it('既存の手動スケジュール時間と重複しない', () => {
        const manualTime = new Date('2024-01-15T08:00:00').getTime();

        const tasks: Task[] = [
            createMockTask('task-manual', 'タスク手動', 'time', undefined, manualTime),
            createMockTask('task-auto', 'タスク自動', 'priority', 3),
        ];

        const events: WorkEvent[] = [];

        const result = reschedulePendingTasks(tasks, [], events, defaultSettings, today);

        // 自動スケジュールタスクは手動スケジュールと異なる時間に配置される
        const autoScheduled = result.newSchedules.find(s => s.title === 'タスク自動');
        expect(autoScheduled).toBeDefined();
        expect(autoScheduled!.scheduledTime).not.toBe(manualTime);
    });

    it('休日以外の日にはスケジュールされない', () => {
        const tasks: Task[] = [
            createMockTask('task-1', 'タスク1', 'priority', 3),
        ];

        // 今後90日間すべて勤務日
        const events: WorkEvent[] = [];
        for (let i = 0; i < 90; i++) {
            events.push(createMockEvent(addDays(today, i), '日勤'));
        }

        const result = reschedulePendingTasks(tasks, [], events, defaultSettings, today);

        // 休日がないのでスケジュールされない
        expect(result.newSchedules.length).toBe(0);
    });
});

// =========================================
// scheduleTasksForHoliday テスト
// =========================================
describe('scheduleTasksForHoliday - 休日タスクスケジューリング', () => {
    const holidayDate = new Date('2024-01-13'); // 土曜日

    it('休日でない日はスケジュールを生成しない', () => {
        const weekday = new Date('2024-01-15'); // 月曜日（イベントなしの平日は休日ではない）
        const tasks: Task[] = [createMockTask('task-1', 'タスク1', 'priority', 3)];
        const events: WorkEvent[] = [];

        const result = scheduleTasksForHoliday(weekday, tasks, events, defaultSettings);

        expect(result.length).toBe(0);
    });

    it('タスクがない場合は空配列を返す', () => {
        const result = scheduleTasksForHoliday(holidayDate, [], [], defaultSettings);

        expect(result.length).toBe(0);
    });

    it('既存タスクと衝突しないスロットにスケジュールされる', () => {
        const existingTime = setHours(setMinutes(startOfDay(holidayDate), 0), 8).getTime();
        const existingTasks: ScheduledTask[] = [
            createMockScheduledTask('existing', '既存タスク', existingTime, false),
        ];

        const tasks: Task[] = [createMockTask('new-task', '新タスク', 'priority', 3)];

        const result = scheduleTasksForHoliday(holidayDate, tasks, [], defaultSettings, existingTasks);

        expect(result.length).toBe(1);
        expect(result[0].scheduledTime).not.toBe(existingTime);
    });

    it('前日夜勤明けの場合、午後からスケジュール開始', () => {
        const saturday = new Date('2024-01-13'); // 土曜日
        const friday = new Date('2024-01-12'); // 金曜日
        const saturdayMorning = new Date('2024-01-13T07:00:00');
        const events: WorkEvent[] = [
            createMockEvent(
                new Date(friday.setHours(22, 0, 0, 0)),
                '夜勤',
                saturdayMorning
            ),
        ];

        const tasks: Task[] = [createMockTask('task-1', 'タスク1', 'priority', 3)];

        const result = scheduleTasksForHoliday(saturday, tasks, events, defaultSettings);

        // 前日の夜勤終了が7時（12時未満）なので午後開始
        expect(result.length).toBe(1);
        const scheduledHour = new Date(result[0].scheduledTime).getHours();
        expect(scheduledHour).toBe(defaultSettings.startTimeAfternoon);
    });
});

// =========================================
// findNextHolidays テスト
// =========================================
describe('findNextHolidays - 休日検索', () => {

    it('指定した数の休日を返す（土日から開始）', () => {
        const saturday = new Date('2024-01-13'); // 土曜日から開始
        const events: WorkEvent[] = [];
        const result = findNextHolidays(saturday, events, [], 3);

        expect(result.length).toBe(3);
    });

    it('予定がある日を除いて休日を返す', () => {
        const saturday = new Date('2024-01-13'); // 土曜日
        const events: WorkEvent[] = [
            createMockEvent(new Date('2024-01-13'), '日勤'), // 土曜日に予定
            createMockEvent(new Date('2024-01-14'), '日勤'), // 日曜日に予定
        ];

        const result = findNextHolidays(saturday, events, [], 3, true);

        // 1/13, 1/14は予定ありなので、1/15（イベントなし=休日）以降が返される
        // ※ 予定表読み込み後は、イベントがない日は休日として扱われる
        expect(result[0].getDate()).toBeGreaterThanOrEqual(15);
    });

    it('すでにタスクが3件ある日は候補から除外', () => {
        const saturday = new Date('2024-01-13'); // 土曜日
        const scheduledTasks: ScheduledTask[] = [
            createMockScheduledTask('t1', 'タスク1', new Date('2024-01-13T08:00:00').getTime(), false),
            createMockScheduledTask('t2', 'タスク2', new Date('2024-01-13T10:00:00').getTime(), false),
            createMockScheduledTask('t3', 'タスク3', new Date('2024-01-13T12:00:00').getTime(), false),
        ];

        const result = findNextHolidays(saturday, [], scheduledTasks, 3, true);

        // 1/13は3件あるので除外、1/14（日曜日）以降が返される
        expect(result[0].getDate()).toBeGreaterThan(13);
    });

    it('includeStartDate=falseの場合、開始日を含まない', () => {
        const saturday = new Date('2024-01-13'); // 土曜日
        const events: WorkEvent[] = [];
        const result = findNextHolidays(saturday, events, [], 1, false);

        // 1/13を含まないので、1/14（日曜日）が返される
        expect(result[0].getDate()).toBe(14);
    });
});

// =========================================
// getPreviousWorkEndTime テスト
// =========================================
describe('getPreviousWorkEndTime - 前日勤務終了時刻取得', () => {
    const date = new Date('2024-01-15');

    it('前日に勤務がない場合はnullを返す', () => {
        const events: WorkEvent[] = [];
        const result = getPreviousWorkEndTime(date, events);

        expect(result).toBeNull();
    });

    it('前日の最も遅い勤務終了時刻を返す', () => {
        const prevDay = new Date('2024-01-14');
        const events: WorkEvent[] = [
            createMockEvent(
                new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 9, 0),
                '日勤',
                new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 17, 0)
            ),
            createMockEvent(
                new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 22, 0),
                '夜勤',
                new Date(date.getFullYear(), date.getMonth(), date.getDate(), 7, 0)
            ),
        ];

        const result = getPreviousWorkEndTime(date, events);

        expect(result).not.toBeNull();
        expect(result!.getHours()).toBe(7); // 夜勤終了が最も遅い
    });

    it('「休み」イベントは勤務として扱われない', () => {
        const prevDay = new Date('2024-01-14');
        const events: WorkEvent[] = [
            createMockEvent(
                new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 0, 0),
                '休み',
                new Date(prevDay.getFullYear(), prevDay.getMonth(), prevDay.getDate(), 23, 59)
            ),
        ];

        const result = getPreviousWorkEndTime(date, events);

        expect(result).toBeNull();
    });
});
