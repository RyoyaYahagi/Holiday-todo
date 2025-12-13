export type Priority = 1 | 2 | 3 | 4 | 5;

export interface Task {
    id: string;
    title: string;
    priority: Priority;
    createdAt: number;
}

export interface ScheduledTask extends Task {
    taskId: string; // 元のTaskのID
    scheduledTime: number; // timestamp
    isCompleted: boolean;
    notifiedAt?: number; // timestamp when notification was sent
}

export type EventType = '夜勤' | '日勤' | '休み' | 'その他';

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
}

export const DEFAULT_SETTINGS: AppSettings = {
    discordWebhookUrl: '',
    notifyOnDayBefore: true,
    notifyDayBeforeTime: '21:00',
    notifyBeforeTask: true,
    notifyBeforeTaskMinutes: 30,
};
