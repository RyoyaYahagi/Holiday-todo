export type Priority = 1 | 2 | 3 | 4 | 5;

/**
 * タスクのスケジュールタイプ
 * 
 * - priority: 優先度を設定。自動スケジュール対象
 * - time: 日時を手動設定。自動スケジュール対象外
 * - recurrence: 繰り返しルールを設定。自動スケジュール対象外
 * - none: 設定なし。プールに追加のみ
 */
export type TaskScheduleType = 'priority' | 'time' | 'recurrence' | 'none';

/**
 * 繰り返しタイプ
 */
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'weekdays';

/**
 * 繰り返しルール
 */
export interface RecurrenceRule {
    type: RecurrenceType;
    interval?: number;       // 例: 2週間ごと → interval=2, type='weekly'
    daysOfWeek?: number[];   // 週ごと: 0=日曜, 1=月曜...
    dayOfMonth?: number;     // 月ごと: 1-31日
    endDate?: number;        // 終了日 (timestamp)
}

export interface Task {
    id: string;
    title: string;
    createdAt: number;
    scheduleType: TaskScheduleType;
    priority?: Priority;              // 優先度選択時のみ設定
    manualScheduledTime?: number;     // 時間選択時: 手動設定した日時
    recurrence?: RecurrenceRule;      // 繰り返し選択時: ルール
}

export interface ScheduledTask extends Task {
    taskId: string; // 元のTaskのID
    scheduledTime: number; // timestamp
    isCompleted: boolean;
    notifiedAt?: number; // timestamp when notification was sent
    recurrenceSourceId?: string; // 繰り返し元のタスクID
}

export type EventType = '夜勤' | '日勤' | '休み' | 'その他' | 'スケジュール除外' | 'スケジュール対象';

export interface WorkEvent {
    title: string;
    start: Date;
    end: Date;
    eventType: EventType;
}

export interface AppSettings {
    discordWebhookUrl: string;
    notifyOnDayBefore: boolean;
    notifyDayBeforeTime: string; // "21:00"
    notifyBeforeTask: boolean;
    notifyBeforeTaskMinutes: number; // 30
    maxPriority: number; // 5
    scheduleInterval: number; // 2
    startTimeMorning: number; // 8
    startTimeAfternoon: number; // 13
    maxTasksPerDay: number; // 3
}

export const DEFAULT_SETTINGS: AppSettings = {
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
