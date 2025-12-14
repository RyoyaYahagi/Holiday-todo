import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabaseDb } from '../lib/supabaseDb';
import { reschedulePendingTasks } from '../lib/scheduler';
import { DEFAULT_SETTINGS, type Task, type WorkEvent, type ScheduledTask, type AppSettings } from '../types';
import { useRef, useCallback } from 'react';

/**
 * React Queryのキー定義
 * 
 * キャッシュの識別と無効化に使用する。
 */
const QUERY_KEYS = {
    tasks: ['tasks'] as const,
    scheduledTasks: ['scheduledTasks'] as const,
    events: ['events'] as const,
    settings: ['settings'] as const,
};

/**
 * Supabaseをデータストアとして使用するカスタムフック（React Query版）
 * 
 * useIndexedDBと同じインターフェースを提供し、
 * バックエンドとしてSupabaseを使用する。
 * React Queryによるキャッシング機能を追加。
 * ユーザー認証が必要。
 */
export function useSupabaseQuery() {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    // スケジューリング処理の重複実行を防ぐためのフラグ
    const isScheduling = useRef(false);

    /**
     * タスク取得クエリ
     */
    const tasksQuery = useQuery({
        queryKey: QUERY_KEYS.tasks,
        queryFn: () => supabaseDb.getAllTasks(),
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
    });

    /**
     * スケジュール済みタスク取得クエリ
     */
    const scheduledTasksQuery = useQuery({
        queryKey: QUERY_KEYS.scheduledTasks,
        queryFn: () => supabaseDb.getScheduledTasks(),
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
    });

    /**
     * イベント取得クエリ
     */
    const eventsQuery = useQuery({
        queryKey: QUERY_KEYS.events,
        queryFn: () => supabaseDb.getAllEvents(),
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
    });

    /**
     * 設定取得クエリ
     */
    const settingsQuery = useQuery({
        queryKey: QUERY_KEYS.settings,
        queryFn: () => supabaseDb.getSettings(),
        enabled: !!user,
        staleTime: 5 * 60 * 1000,
    });

    // 現在のデータ（キャッシュまたは最新）
    const tasks = tasksQuery.data ?? [];
    const scheduledTasks = scheduledTasksQuery.data ?? [];
    const events = eventsQuery.data ?? [];
    const settings = settingsQuery.data ?? DEFAULT_SETTINGS;
    const loading = tasksQuery.isLoading || scheduledTasksQuery.isLoading ||
        eventsQuery.isLoading || settingsQuery.isLoading;

    /**
     * 全データを再読み込み（キャッシュを無効化）
     */
    const refreshData = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.tasks }),
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.scheduledTasks }),
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.events }),
            queryClient.invalidateQueries({ queryKey: QUERY_KEYS.settings }),
        ]);
    }, [queryClient]);

    /**
     * 自動スケジューリングを実行 (内部用)
     * 引数で渡された最新の状態をもとに再計算し、更新があればDBに反映する
     */
    const runAutoSchedule = async (
        currentTasks: Task[],
        currentScheduled: ScheduledTask[],
        currentEvents: WorkEvent[],
        currentSettings: AppSettings
    ) => {
        if (isScheduling.current) {
            console.log('Skipping auto-schedule: already running');
            return;
        }

        isScheduling.current = true;
        try {
            const today = new Date();
            const { newSchedules, obsoleteScheduleIds } = reschedulePendingTasks(
                currentTasks,
                currentScheduled,
                currentEvents,
                currentSettings,
                today
            );

            // 変更がある場合のみ実行
            if (obsoleteScheduleIds.length > 0 || newSchedules.length > 0) {
                console.log('Running auto-schedule:', {
                    toDelete: obsoleteScheduleIds.length,
                    toAdd: newSchedules.length
                });

                // 未完了スケジュールを一度全て削除してから新しいスケジュールを保存
                await supabaseDb.deletePendingScheduledTasks();

                if (newSchedules.length > 0) {
                    await supabaseDb.saveScheduledTasks(newSchedules);
                }

                // スケジュールキャッシュを更新
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.scheduledTasks });
            }
        } finally {
            isScheduling.current = false;
        }
    };

    /**
     * タスク追加ミューテーション
     */
    const addTaskMutation = useMutation({
        mutationFn: async ({ title, priority }: { title: string; priority: 1 | 2 | 3 | 4 | 5 }) => {
            const newTask: Task = {
                id: crypto.randomUUID(),
                title,
                priority,
                createdAt: Date.now()
            };
            await supabaseDb.addTask(newTask);
            return newTask;
        },
        onSuccess: async (newTask) => {
            // 楽観的更新: キャッシュに即座に反映
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old ? [...old, newTask] : [newTask]
            );

            // 自動スケジューリング
            const nextTasks = [...tasks, newTask];
            await runAutoSchedule(nextTasks, scheduledTasks, events, settings);
        },
    });

    /**
     * タスク更新ミューテーション
     */
    const updateTaskMutation = useMutation({
        mutationFn: async (task: Task) => {
            await supabaseDb.updateTask(task);
            return task;
        },
        onSuccess: async (updatedTask) => {
            // 楽観的更新
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old?.map(t => t.id === updatedTask.id ? updatedTask : t) ?? []
            );

            // 自動スケジューリング
            const nextTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
            await runAutoSchedule(nextTasks, scheduledTasks, events, settings);
        },
    });

    /**
     * タスク削除ミューテーション
     */
    const deleteTaskMutation = useMutation({
        mutationFn: async (id: string) => {
            const hasCompletedSchedule = scheduledTasks.some(t => t.taskId === id && t.isCompleted);
            await supabaseDb.deleteTask(id);
            await supabaseDb.deleteScheduledTasksByTaskId(id);
            return { id, hasCompletedSchedule };
        },
        onSuccess: async ({ id, hasCompletedSchedule }) => {
            // 楽観的更新
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old?.filter(t => t.id !== id) ?? []
            );
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                old?.filter(t => t.taskId !== id) ?? []
            );

            // 完了していないタスクを削除した時だけ再スケジュール
            if (!hasCompletedSchedule) {
                const nextTasks = tasks.filter(t => t.id !== id);
                const nextScheduled = scheduledTasks.filter(t => t.taskId !== id);
                await runAutoSchedule(nextTasks, nextScheduled, events, settings);
            }
        },
    });

    /**
     * イベント保存ミューテーション
     */
    const saveEventsMutation = useMutation({
        mutationFn: async (newEvents: WorkEvent[]) => {
            await supabaseDb.saveEvents(newEvents);
            return newEvents;
        },
        onSuccess: async (newEvents) => {
            // 楽観的更新
            queryClient.setQueryData<WorkEvent[]>(QUERY_KEYS.events, newEvents);

            // 自動スケジューリング
            await runAutoSchedule(tasks, scheduledTasks, newEvents, settings);
        },
    });

    /**
     * スケジュール済みタスク保存ミューテーション
     */
    const saveScheduledTasksMutation = useMutation({
        mutationFn: async (newScheduledTasks: ScheduledTask[]) => {
            await supabaseDb.saveScheduledTasks(newScheduledTasks);
            return newScheduledTasks;
        },
        onSuccess: (newScheduledTasks) => {
            // 楽観的更新
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) => {
                if (!old) return newScheduledTasks;
                const existingIds = new Set(newScheduledTasks.map(t => t.id));
                return [
                    ...old.filter(t => !existingIds.has(t.id)),
                    ...newScheduledTasks
                ];
            });
        },
    });

    /**
     * スケジュール済みタスク削除ミューテーション
     */
    const deleteScheduledTaskMutation = useMutation({
        mutationFn: async (id: string) => {
            await supabaseDb.deleteScheduledTask(id);
            return id;
        },
        onSuccess: (id) => {
            // 楽観的更新
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                old?.filter(t => t.id !== id) ?? []
            );
        },
    });

    /**
     * 複数スケジュール済みタスク削除ミューテーション
     */
    const deleteScheduledTasksMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            await supabaseDb.deleteScheduledTasks(ids);
            return ids;
        },
        onSuccess: (ids) => {
            const idsSet = new Set(ids);
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                old?.filter(t => !idsSet.has(t.id)) ?? []
            );
        },
    });

    /**
     * 設定更新ミューテーション
     */
    const updateSettingsMutation = useMutation({
        mutationFn: async (newSettings: AppSettings) => {
            await supabaseDb.saveSettings(newSettings);
            return newSettings;
        },
        onSuccess: async (newSettings) => {
            // 楽観的更新
            queryClient.setQueryData<AppSettings>(QUERY_KEYS.settings, newSettings);

            // 自動スケジューリング
            await runAutoSchedule(tasks, scheduledTasks, events, newSettings);
        },
    });

    /**
     * データエクスポート
     */
    const exportData = async () => {
        return await supabaseDb.exportData();
    };

    /**
     * データインポートミューテーション
     */
    const importDataMutation = useMutation({
        mutationFn: async (json: string) => {
            await supabaseDb.importData(json);
        },
        onSuccess: async () => {
            // 全キャッシュを無効化して再取得
            await refreshData();

            // 新しいデータでスケジューリング
            const [allTasks, allScheduled, allEvents, currentSettings] = await Promise.all([
                supabaseDb.getAllTasks(),
                supabaseDb.getScheduledTasks(),
                supabaseDb.getAllEvents(),
                supabaseDb.getSettings()
            ]);
            await runAutoSchedule(allTasks, allScheduled, allEvents, currentSettings);
        },
    });

    // useSupabaseと同じインターフェースを維持
    const addTask = async (title: string, priority: 1 | 2 | 3 | 4 | 5) => {
        await addTaskMutation.mutateAsync({ title, priority });
    };

    const updateTask = async (task: Task) => {
        await updateTaskMutation.mutateAsync(task);
    };

    const deleteTask = async (id: string) => {
        await deleteTaskMutation.mutateAsync(id);
    };

    const saveEvents = async (newEvents: WorkEvent[]) => {
        await saveEventsMutation.mutateAsync(newEvents);
    };

    const saveScheduledTasks = async (newScheduledTasks: ScheduledTask[]) => {
        await saveScheduledTasksMutation.mutateAsync(newScheduledTasks);
    };

    const deleteScheduledTask = async (id: string) => {
        await deleteScheduledTaskMutation.mutateAsync(id);
    };

    const deleteScheduledTasks = async (ids: string[]) => {
        await deleteScheduledTasksMutation.mutateAsync(ids);
    };

    const updateSettings = async (newSettings: AppSettings) => {
        await updateSettingsMutation.mutateAsync(newSettings);
    };

    const importData = async (json: string) => {
        await importDataMutation.mutateAsync(json);
    };

    return {
        tasks,
        scheduledTasks,
        events,
        settings,
        loading,
        refreshData,
        addTask,
        updateTask,
        deleteTask,
        saveEvents,
        saveScheduledTasks,
        deleteScheduledTask,
        deleteScheduledTasks,
        updateSettings,
        exportData,
        importData
    };
}
