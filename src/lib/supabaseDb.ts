import { supabase } from './supabase';
import { DEFAULT_SETTINGS, type Task, type AppSettings, type WorkEvent, type ScheduledTask, type EventType, type TaskScheduleType, type RecurrenceRule, type TaskList } from '../types';
import { computeEventDiff } from './eventDiff';

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
    list_id: string | null;
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
    list_id: string | null;
}

interface TaskListRow {
    id: string;
    name: string;
    color: string;
    is_default: boolean;
    created_at: string;
    sort_order: number | null;
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
    notification_method: string;
    line_user_id: string;
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

function rowToTask(row: TaskRow): Task {
    return {
        id: row.id,
        title: row.title,
        createdAt: new Date(row.created_at).getTime(),
        scheduleType: (row.schedule_type || 'priority') as TaskScheduleType,
        listId: row.list_id || undefined,
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
        listId: row.list_id || undefined,
        priority: row.priority ? (row.priority as 1 | 2 | 3 | 4 | 5) : undefined,
        manualScheduledTime: row.manual_scheduled_time ? new Date(row.manual_scheduled_time).getTime() : undefined,
        recurrence: row.recurrence || undefined,
        scheduledTime: new Date(row.scheduled_time).getTime(),
        isCompleted: row.is_completed,
        notifiedAt: row.notified_at ? new Date(row.notified_at).getTime() : undefined,
        recurrenceSourceId: row.recurrence_source_id || undefined
    };
}

/**
 * TaskListRow を TaskList 型に変換
 */
function rowToTaskList(row: TaskListRow): TaskList {
    return {
        id: row.id,
        name: row.name,
        color: row.color,
        isDefault: row.is_default,
        createdAt: new Date(row.created_at).getTime(),
        sortOrder: row.sort_order ?? undefined
    };
}

function rowToEvent(row: EventRow): WorkEvent {
    return {
        id: row.id,
        title: row.title,
        start: new Date(row.start_time),
        end: new Date(row.end_time),
        eventType: row.event_type as EventType
    };
}

function rowToSettings(row: SettingsRow): AppSettings {
    return {
        notificationMethod: (row.notification_method as 'line' | 'discord') ?? 'line',
        lineUserId: row.line_user_id ?? '',
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

async function getCurrentUserId(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id ?? null;
}

async function requireCurrentUserId(): Promise<string> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('認証が必要です');
    return userId;
}

function taskToInsert(task: Task, userId: string) {
    return {
        id: task.id,
        user_id: userId,
        title: task.title,
        priority: task.priority ?? null,
        created_at: new Date(task.createdAt).toISOString(),
        schedule_type: task.scheduleType,
        manual_scheduled_time: task.manualScheduledTime ? new Date(task.manualScheduledTime).toISOString() : null,
        recurrence: task.recurrence || null,
        list_id: task.listId || null
    };
}

function scheduledTaskToInsert(task: ScheduledTask, userId: string) {
    return {
        id: task.id,
        user_id: userId,
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
        recurrence_source_id: task.recurrenceSourceId || null,
        list_id: task.listId || null
    };
}

export const supabaseDb = {

    /**
     * 全タスクを取得
     */
    async getAllTasks(): Promise<Task[]> {
        const userId = await getCurrentUserId();
        if (!userId) return [];

        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('user_id', userId)
            .order('sort_order', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data || []).map(rowToTask);
    },

    /**
     * 設定を取得
     */
    async getSettings(): Promise<AppSettings> {
        const userId = await getCurrentUserId();
        if (!userId) return DEFAULT_SETTINGS;

        const { data, error } = await supabase
            .from('settings')
            .select('user_id, notification_method, line_user_id, discord_webhook_url, notify_on_day_before, notify_day_before_time, notify_before_task, notify_before_task_minutes, max_priority, schedule_interval, start_time_morning, start_time_afternoon, max_tasks_per_day')
            .eq('user_id', userId)
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
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('settings')
            .upsert({
                user_id: userId,
                notification_method: settings.notificationMethod,
                line_user_id: settings.lineUserId,
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
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('tasks')
            .insert(taskToInsert(task, userId));

        if (error) throw error;
    },

    /**
     * タスクを更新
     */
    async updateTask(task: Task): Promise<void> {
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('tasks')
            .update({
                title: task.title,
                priority: task.priority ?? null,
                schedule_type: task.scheduleType,
                manual_scheduled_time: task.manualScheduledTime ? new Date(task.manualScheduledTime).toISOString() : null,
                recurrence: task.recurrence || null,
                list_id: task.listId || null
            })
            .eq('id', task.id)
            .eq('user_id', userId);

        if (error) throw error;
    },

    /**
     * タスクを削除
     */
    async deleteTask(id: string): Promise<void> {
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
    },

    /**
     * イベントを保存（差分更新方式）
     * 
     * クライアント操作時の大量書き込みを抑えるため、
     * 既存イベントとの差分を取り、追加分だけinsert、不要分だけdeleteする。
     */
    async saveEvents(events: WorkEvent[]): Promise<void> {
        const userId = await requireCurrentUserId();

        console.log('[supabaseDb.saveEvents] 開始 (差分更新方式):', events.length, '件');

        // 既存イベントを取得
        const { data: dbRows, error: fetchError } = await supabase
            .from('events')
            .select('id, title, start_time, end_time, event_type')
            .eq('user_id', userId);

        if (fetchError) {
            console.error('[supabaseDb.saveEvents] 既存イベント取得エラー:', fetchError);
            throw fetchError;
        }

        const { toInsert, toDeleteIds } = computeEventDiff(dbRows || [], events, userId);

        console.log(`[supabaseDb.saveEvents] 差分検出: 追加=${toInsert.length}件, 削除=${toDeleteIds.length}件`);

        // 不要分を削除
        if (toDeleteIds.length > 0) {
            const { error: deleteError } = await supabase
                .from('events')
                .delete()
                .eq('user_id', userId)
                .in('id', toDeleteIds);

            if (deleteError) {
                console.error('[supabaseDb.saveEvents] 削除エラー:', deleteError);
                throw deleteError;
            }
        }

        // 追加分を挿入
        if (toInsert.length > 0) {
            const { error: insertError } = await supabase
                .from('events')
                .insert(toInsert);

            if (insertError) {
                console.error('[supabaseDb.saveEvents] 挿入エラー:', insertError);
                throw insertError;
            }
        }

        console.log('[supabaseDb.saveEvents] 完了');
    },

    /**
     * 全イベントを取得
     */
    async getAllEvents(): Promise<WorkEvent[]> {
        const userId = await getCurrentUserId();
        if (!userId) return [];

        const { data, error } = await supabase
            .from('events')
            .select('id, title, start_time, end_time, event_type')
            .eq('user_id', userId)
            .order('start_time', { ascending: true });

        if (error) throw error;
        return (data || []).map(rowToEvent);
    },

    /**
     * 重複イベントを削除
     * 
     * 同じ日付・タイトル・イベントタイプのイベントが複数ある場合、
     * 最初の1件を残して他を削除する。
     */
    async deduplicateEvents(): Promise<number> {
        const userId = await requireCurrentUserId();

        const { data: events, error: fetchError } = await supabase
            .from('events')
            .select('id, title, start_time, event_type')
            .eq('user_id', userId)
            .order('start_time', { ascending: true });

        if (fetchError) throw fetchError;
        if (!events || events.length === 0) return 0;

        // 重複を検出（日付を正規化して比較）
        const normalizeDate = (dateStr: string) => new Date(dateStr).toISOString();
        const seen = new Map<string, string>(); // key -> first id
        const duplicateIds: string[] = [];

        for (const event of events) {
            const key = `${normalizeDate(event.start_time)}_${event.event_type}_${event.title}`;
            if (seen.has(key)) {
                duplicateIds.push(event.id);
            } else {
                seen.set(key, event.id);
            }
        }

        console.log('[supabaseDb.deduplicateEvents] 重複:', duplicateIds.length, '件');

        // 重複を削除
        if (duplicateIds.length > 0) {
            const { error: deleteError } = await supabase
                .from('events')
                .delete()
                .in('id', duplicateIds);

            if (deleteError) throw deleteError;
        }

        return duplicateIds.length;
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
        const userId = await requireCurrentUserId();

        if (tasks.length === 0) {
            console.log('saveScheduledTasks: タスクなし、スキップ');
            return;
        }

        console.log('saveScheduledTasks called with:', tasks.length, 'tasks');

        // バッチupsert用のレコード配列を構築
        const records = tasks.map(task => scheduledTaskToInsert(task, userId));

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
        const userId = await getCurrentUserId();
        if (!userId) return [];

        const { data, error } = await supabase
            .from('scheduled_tasks')
            .select('*')
            .eq('user_id', userId)
            .order('scheduled_time', { ascending: true });

        if (error) throw error;
        return (data || []).map(rowToScheduledTask);
    },

    /**
     * スケジュール済みタスクを削除
     */
    async deleteScheduledTask(id: string): Promise<void> {
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
    },

    /**
     * 元タスクIDに関連するすべてのScheduledTaskを削除
     */
    async deleteScheduledTasksByTaskId(taskId: string): Promise<void> {
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .eq('task_id', taskId)
            .eq('user_id', userId);

        if (error) throw error;
    },

    /**
     * 複数のスケジュール済みタスクを一括削除
     */
    async deleteScheduledTasks(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .eq('user_id', userId)
            .in('id', ids);

        if (error) throw error;
    },

    /**
     * ユーザーの未完了・優先度ベースのスケジュール済みタスクを全て削除
     * (再スケジューリング時のクリーンアップ用)
     * 手動設定タスク(time, recurrence, none)は削除しない
     */
    async deletePendingScheduledTasks(): Promise<void> {
        const userId = await getCurrentUserId();
        if (!userId) return;

        const { error } = await supabase
            .from('scheduled_tasks')
            .delete()
            .eq('user_id', userId)
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
        const userId = await requireCurrentUserId();

        const data = JSON.parse(jsonString);

        // タスクをインポート
        if (Array.isArray(data.tasks)) {
            const tasks = data.tasks as Task[];
            if (tasks.length > 0) {
                const { error: upsertError } = await supabase
                    .from('tasks')
                    .upsert(tasks.map(task => taskToInsert(task, userId)));
                if (upsertError) throw upsertError;

                const keepTaskIds = tasks.map(task => task.id);
                const { error: deleteError } = await supabase
                    .from('tasks')
                    .delete()
                    .eq('user_id', userId)
                    .not('id', 'in', `(${keepTaskIds.join(',')})`);
                if (deleteError) throw deleteError;
            } else {
                const { error: deleteError } = await supabase
                    .from('tasks')
                    .delete()
                    .eq('user_id', userId);
                if (deleteError) throw deleteError;
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
        if (Array.isArray(data.scheduledTasks)) {
            const scheduledTasks = data.scheduledTasks as ScheduledTask[];
            if (scheduledTasks.length > 0) {
                await this.saveScheduledTasks(scheduledTasks);

                const keepScheduledIds = scheduledTasks.map(task => task.id);
                const { error: deleteError } = await supabase
                    .from('scheduled_tasks')
                    .delete()
                    .eq('user_id', userId)
                    .not('id', 'in', `(${keepScheduledIds.join(',')})`);
                if (deleteError) throw deleteError;
            } else {
                const { error: deleteError } = await supabase
                    .from('scheduled_tasks')
                    .delete()
                    .eq('user_id', userId);
                if (deleteError) throw deleteError;
            }
        }

        // 設定をインポート
        if (data.settings) {
            await this.saveSettings(data.settings);
        }
    },

    // =========================================
    // タスクリスト関連
    // =========================================

    /**
     * 全タスクリストを取得
     */
    async getAllTaskLists(): Promise<TaskList[]> {
        const userId = await getCurrentUserId();
        if (!userId) return [];

        const { data, error } = await supabase
            .from('task_lists')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return (data || []).map(rowToTaskList);
    },

    /**
     * デフォルトリストを取得または作成
     * 
     * ユーザーにデフォルトリストがない場合は「すべて」という名前で作成する。
     */
    async getOrCreateDefaultList(): Promise<TaskList> {
        const userId = await requireCurrentUserId();

        // まずデフォルトリストを検索
        const { data: existingList, error: findError } = await supabase
            .from('task_lists')
            .select('*')
            .eq('user_id', userId)
            .eq('is_default', true)
            .single();

        if (findError && findError.code !== 'PGRST116') {
            // PGRST116 = 行が見つからない
            throw findError;
        }

        if (existingList) {
            return rowToTaskList(existingList);
        }

        // デフォルトリストを作成
        const newList = {
            id: crypto.randomUUID(),
            user_id: userId,
            name: 'すべて',
            color: '#6B7280',
            is_default: true,
            created_at: new Date().toISOString(),
            sort_order: 0
        };

        const { error: insertError } = await supabase
            .from('task_lists')
            .insert(newList);

        if (insertError) throw insertError;

        return {
            id: newList.id,
            name: newList.name,
            color: newList.color,
            isDefault: true,
            createdAt: new Date(newList.created_at).getTime(),
            sortOrder: newList.sort_order
        };
    },

    /**
     * タスクリストを追加
     */
    async addTaskList(list: TaskList): Promise<void> {
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('task_lists')
            .insert({
                id: list.id,
                user_id: userId,
                name: list.name,
                color: list.color,
                is_default: list.isDefault,
                created_at: new Date(list.createdAt).toISOString(),
                sort_order: list.sortOrder ?? null
            });

        if (error) throw error;
    },

    /**
     * タスクリストを更新
     */
    async updateTaskList(list: TaskList): Promise<void> {
        const userId = await requireCurrentUserId();

        const { error } = await supabase
            .from('task_lists')
            .update({
                name: list.name,
                color: list.color,
                sort_order: list.sortOrder ?? null
            })
            .eq('id', list.id)
            .eq('user_id', userId);

        if (error) throw error;
    },

    /**
     * タスクリストを削除
     * 
     * デフォルトリストは削除できない。
     * 削除時、そのリストに属するタスクのlist_idはnullになる。
     */
    async deleteTaskList(id: string): Promise<void> {
        const userId = await requireCurrentUserId();

        // デフォルトリストの削除を防止
        const { data: list, error: findError } = await supabase
            .from('task_lists')
            .select('is_default')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (findError) throw findError;
        if (list?.is_default) {
            throw new Error('デフォルトリストは削除できません');
        }

        const { error } = await supabase
            .from('task_lists')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) throw error;
    }
};
