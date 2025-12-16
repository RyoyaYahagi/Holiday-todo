import { supabase } from './supabase';
import { DEFAULT_SETTINGS, type Task, type AppSettings, type WorkEvent, type ScheduledTask, type EventType, type TaskScheduleType, type RecurrenceRule } from '../types';

/**
 * Supabaseのデータベース行型定義
 */
interface TaskRow {
    id: string;
    title: string;
    priority: number | null;
    created_at: string;
    schedule_type: string;
    manual_scheduled_time: string | null;
    recurrence: RecurrenceRule | null;
}

interface ScheduledTaskRow {
    id: string;
    task_id: string;
    title: string;
    priority: number | null;
    scheduled_time: string;
    is_completed: boolean;
    notified_at?: string | null;
    created_at: string;
    schedule_type: string;
    manual_scheduled_time: string | null;
    recurrence: RecurrenceRule | null;
    recurrence_source_id: string | null;
}

interface EventRow {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    event_type: string;
}

interface SettingsRow {
    user_id: string;
    discord_webhook_url: string;
    notify_on_day_before: boolean;
    notify_day_before_time: string;
    notify_before_task: boolean;
    notify_before_task_minutes: number;
    max_priority: number;
    schedule_interval: number;
    start_time_morning: number;
    start_time_afternoon: number;
    max_tasks_per_day: number;
}

/**
 * TaskRow を Task 型に変換
 */
function rowToTask(row: TaskRow): Task {
    return {
        id: row.id,
        title: row.title,
        createdAt: new Date(row.created_at).getTime(),
        scheduleType: (row.schedule_type || 'priority') as TaskScheduleType,
        priority: row.priority ? (row.priority as 1 | 2 | 3 | 4 | 5) : undefined,
        manualScheduledTime: row.manual_scheduled_time ? new Date(row.manual_scheduled_time).getTime() : undefined,
        recurrence: row.recurrence || undefined
    };
}

function rowToScheduledTask(row: ScheduledTaskRow): ScheduledTask {
    return {
        id: row.id,
        taskId: row.task_id,
        title: row.title,
        createdAt: new Date(row.created_at).getTime(),
        scheduleType: (row.schedule_type || 'priority') as TaskScheduleType,
        priority: row.priority ? (row.priority as 1 | 2 | 3 | 4 | 5) : undefined,
        manualScheduledTime: row.manual_scheduled_time ? new Date(row.manual_scheduled_time).getTime() : undefined,
        recurrence: row.recurrence || undefined,
        scheduledTime: new Date(row.scheduled_time).getTime(),
        isCompleted: row.is_completed,
        notifiedAt: row.notified_at ? new Date(row.notified_at).getTime() : undefined,
        recurrenceSourceId: row.recurrence_source_id || undefined
    };
}

function rowToEvent(row: EventRow): WorkEvent {
    return {
        title: row.title,
        start: new Date(row.start_time),
        end: new Date(row.end_time),
        eventType: row.event_type as EventType
    };
}

function rowToSettings(row: SettingsRow): AppSettings {
    return {
        discordWebhookUrl: row.discord_webhook_url ?? '',
        notifyOnDayBefore: row.notify_on_day_before ?? true,
        notifyDayBeforeTime: row.notify_day_before_time ?? '21:00',
        notifyBeforeTask: row.notify_before_task ?? true,
        notifyBeforeTaskMinutes: row.notify_before_task_minutes ?? 30,
        maxPriority: row.max_priority ?? 5,
        scheduleInterval: row.schedule_interval ?? 2,
        startTimeMorning: row.start_time_morning ?? 8,
        startTimeAfternoon: row.start_time_afternoon ?? 13,
        maxTasksPerDay: row.max_tasks_per_day ?? 3
    };
}

export const supabaseDb = {

    /**
     * 全タスクを取得
     */
    async getAllTasks(): Promise<Task[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data || []).map(rowToTask);
    },

    /**
     * 設定を取得
     */
    async getSettings(): Promise<AppSettings> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return DEFAULT_SETTINGS;

        const { data, error } = await supabase
            .from('settings')
            .select('user_id, discord_webhook_url, notify_on_day_before, notify_day_before_time, notify_before_task, notify_before_task_minutes, max_priority, schedule_interval, start_time_morning, start_time_afternoon, max_tasks_per_day')
            .eq('user_id', user.id)
            .single();

        if (error) {
            // データがない場合はデフォルト設定を返す
            if (error.code === 'PGRST116') {
                return DEFAULT_SETTINGS;
            }
            throw error;
        }
        return data ? rowToSettings(data) : DEFAULT_SETTINGS;
    },

    /**
     * 設定を保存
     */
    async saveSettings(settings: AppSettings): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('認証が必要です');

        const { error } = await supabase
            .from('settings')
            .upsert({
                user_id: user.id,
                discord_webhook_url: settings.discordWebhookUrl,
                notify_on_day_before: settings.notifyOnDayBefore,
                notify_day_before_time: settings.notifyDayBeforeTime,
                notify_before_task: settings.notifyBeforeTask,
                notify_before_task_minutes: settings.notifyBeforeTaskMinutes,
                max_priority: settings.maxPriority,
                schedule_interval: settings.scheduleInterval,
                start_time_morning: settings.startTimeMorning,
                start_time_afternoon: settings.startTimeAfternoon,
                max_tasks_per_day: settings.maxTasksPerDay
            });

        if (error) throw error;
    },

    /**
     * タスクを追加
     */
    async addTask(task: Task): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('認証が必要です');

        const { error } = await supabase
            .from('tasks')
            .insert({
                id: task.id,
                user_id: user.id,
                title: task.title,
                priority: task.priority ?? null,
                created_at: new Date(task.createdAt).toISOString(),
                schedule_type: task.scheduleType,
                manual_scheduled_time: task.manualScheduledTime ? new Date(task.manualScheduledTime).toISOString() : null,
                recurrence: task.recurrence || null
            });

        if (error) throw error;
    },

    /**
     * タスクを更新
     */
    async updateTask(task: Task): Promise<void> {
        const { error } = await supabase
            .from('tasks')
            .update({
                title: task.title,
                priority: task.priority ?? null,
                schedule_type: task.scheduleType,
                manual_scheduled_time: task.manualScheduledTime ? new Date(task.manualScheduledTime).toISOString() : null,
                recurrence: task.recurrence || null
            })
            .eq('id', task.id);

        if (error) throw error;
    },

    /**
     * タスクを削除
     */
    async deleteTask(id: string): Promise<void> {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * イベントを保存（既存を置換）
     */
    async saveEvents(events: WorkEvent[]): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('認証が必要です');

        console.log('[supabaseDb.saveEvents] 開始:', events.length, '件');

        // 既存のイベントを削除
        const { error: deleteError } = await supabase
            .from('events')
            .delete()
            .eq('user_id', user.id);

        if (deleteError) {
            console.error('[supabaseDb.saveEvents] 削除エラー:', deleteError);
            throw deleteError;
        }

        // 新しいイベントを挿入
        if (events.length > 0) {
            const { error } = await supabase
                .from('events')
                .insert(events.map(event => ({
                    user_id: user.id,
                    title: event.title,
                    start_time: event.start.toISOString(),
                    end_time: event.end.toISOString(),
                    event_type: event.eventType
                })));

            if (error) {
                console.error('[supabaseDb.saveEvents] 挿入エラー:', error);
                throw error;
            }
        }

        console.log('[supabaseDb.saveEvents] 完了');
    },

    /**
     * 全イベントを取得
     */
    async getAllEvents(): Promise<WorkEvent[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('events')
            .select('id, title, start_time, end_time, event_type')
            .eq('user_id', user.id)
            .order('start_time', { ascending: true });

        if (error) throw error;
        return (data || []).map(rowToEvent);
    },

    /**
     * スケジュール済みタスクを保存
     */
    /**
     * スケジュール済みタスクをバッチで保存
     *
     * N+1クエリ問題を避けるため、1回のupsertで全タスクを保存する。
     */
    async saveScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('認証が必要です');

        if (tasks.length === 0) {
            console.log('saveScheduledTasks: タスクなし、スキップ');
            return;
        }

        console.log('saveScheduledTasks called with:', tasks.length, 'tasks');

        // バッチupsert用のレコード配列を構築
        const records = tasks.map(task => ({
            id: task.id,
            user_id: user.id,
            task_id: task.taskId,
            title: task.title,
            priority: task.priority ?? null,
            scheduled_time: new Date(task.scheduledTime).toISOString(),
            is_completed: task.isCompleted,
            notified_at: task.notifiedAt ? new Date(task.notifiedAt).toISOString() : null,
            created_at: new Date(task.createdAt).toISOString(),
            schedule_type: task.scheduleType,
            manual_scheduled_time: task.manualScheduledTime ? new Date(task.manualScheduledTime).toISOString() : null,
            recurrence: task.recurrence || null,
            recurrence_source_id: task.recurrenceSourceId || null
        }));

        const { error } = await supabase
            .from('scheduled_tasks')
            .upsert(records);

        if (error) {
            console.error('Error saving scheduled tasks (batch):', error);
            throw error;
        }

        console.log('Saved', tasks.length, 'scheduled tasks successfully (batch)');
    },

    /**
     * 全スケジュール済みタスクを取得
     */
    async getScheduledTasks(): Promise<ScheduledTask[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('scheduled_tasks')
            .select('*')
            .eq('user_id', user.id)
            .order('scheduled_time', { ascending: true });

        if (error) throw error;
        return (data || []).map(rowToScheduledTask);
    },

    /**
     * スケジュール済みタスクを削除
     */
    async deleteScheduledTask(id: string): Promise<void> {
        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * 元タスクIDに関連するすべてのScheduledTaskを削除
     */
    async deleteScheduledTasksByTaskId(taskId: string): Promise<void> {
        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .eq('task_id', taskId);

        if (error) throw error;
    },

    /**
     * 複数のスケジュール済みタスクを一括削除
     */
    async deleteScheduledTasks(ids: string[]): Promise<void> {
        if (ids.length === 0) return;

        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .in('id', ids);

        if (error) throw error;
    },

    /**
     * ユーザーの未完了・優先度ベースのスケジュール済みタスクを全て削除
     * (再スケジューリング時のクリーンアップ用)
     * 手動設定タスク(time, recurrence, none)は削除しない
     */
    async deletePendingScheduledTasks(): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .eq('user_id', user.id)
            .eq('is_completed', false)
            .eq('schedule_type', 'priority'); // 優先度タスクのみ削除

        if (error) throw error;
    },

    /**
     * データをエクスポート
     */
    async exportData(): Promise<string> {
        const [tasks, scheduledTasks, events, settings] = await Promise.all([
            this.getAllTasks(),
            this.getScheduledTasks(),
            this.getAllEvents(),
            this.getSettings()
        ]);

        const data = {
            tasks,
            scheduledTasks,
            events,
            settings,
            exportDate: new Date().toISOString()
        };
        return JSON.stringify(data, null, 2);
    },

    /**
     * データをインポート
     */
    async importData(jsonString: string): Promise<void> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('認証が必要です');

        const data = JSON.parse(jsonString);

        // タスクをインポート
        if (data.tasks && data.tasks.length > 0) {
            // 既存を削除
            await supabase.from('tasks').delete().eq('user_id', user.id);

            for (const task of data.tasks) {
                await this.addTask(task);
            }
        }

        // イベントをインポート
        if (data.events) {
            const events = data.events.map((e: { start: string | Date; end: string | Date; title: string; eventType: string }) => ({
                ...e,
                start: new Date(e.start),
                end: new Date(e.end)
            }));
            await this.saveEvents(events);
        }

        // スケジュール済みタスクをインポート
        if (data.scheduledTasks && data.scheduledTasks.length > 0) {
            // 既存を削除
            await supabase.from('scheduled_tasks').delete().eq('user_id', user.id);

            await this.saveScheduledTasks(data.scheduledTasks);
        }

        // 設定をインポート
        if (data.settings) {
            await this.saveSettings(data.settings);
        }
    }
};
