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
 * 楽観的更新による即時UI反映を実現。
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
     * 自動スケジューリングを実行 (内部用・バックグラウンド)
     * UIをブロックせずに実行される
     */
    const runAutoScheduleBackground = useCallback((
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

        // 非同期で実行（UIをブロックしない）
        (async () => {
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
                    console.log('Running auto-schedule (background):', {
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
            } catch (error) {
                console.error('Auto-schedule failed:', error);
            } finally {
                isScheduling.current = false;
            }
        })();
    }, [queryClient]);

    /**
     * タスク追加ミューテーション
     * 楽観的更新で即時UIに反映し、DB保存とスケジューリングはバックグラウンドで実行
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
        onMutate: async ({ title, priority }) => {
            // キャンセル中のクエリをキャンセル
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });

            // 現在のキャッシュを保存（ロールバック用）
            const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);

            // 楽観的更新: DB保存前にUIを更新
            const optimisticTask: Task = {
                id: crypto.randomUUID(),
                title,
                priority,
                createdAt: Date.now()
            };
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old ? [...old, optimisticTask] : [optimisticTask]
            );

            return { previousTasks, optimisticTask };
        },
        onError: (_err, _variables, context) => {
            // エラー時はロールバック
            if (context?.previousTasks) {
                queryClient.setQueryData(QUERY_KEYS.tasks, context.previousTasks);
            }
        },
        onSuccess: (newTask, _variables, context) => {
            // 楽観的更新のIDを実際のタスクIDに更新
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) => {
                if (!old) return [newTask];
                return old.map(t => t.id === context?.optimisticTask.id ? newTask : t);
            });

            // 自動スケジューリング（バックグラウンド）
            const nextTasks = [...tasks, newTask];
            runAutoScheduleBackground(nextTasks, scheduledTasks, events, settings);
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
        onMutate: async (updatedTask) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
            const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);

            // 楽観的更新
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old?.map(t => t.id === updatedTask.id ? updatedTask : t) ?? []
            );

            return { previousTasks };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousTasks) {
                queryClient.setQueryData(QUERY_KEYS.tasks, context.previousTasks);
            }
        },
        onSuccess: (updatedTask) => {
            // 自動スケジューリング（バックグラウンド）
            const nextTasks = tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
            runAutoScheduleBackground(nextTasks, scheduledTasks, events, settings);
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
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.scheduledTasks });

            const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
            const previousScheduled = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks);

            // 楽観的更新
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old?.filter(t => t.id !== id) ?? []
            );
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                old?.filter(t => t.taskId !== id) ?? []
            );

            return { previousTasks, previousScheduled };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousTasks) {
                queryClient.setQueryData(QUERY_KEYS.tasks, context.previousTasks);
            }
            if (context?.previousScheduled) {
                queryClient.setQueryData(QUERY_KEYS.scheduledTasks, context.previousScheduled);
            }
        },
        onSuccess: ({ id, hasCompletedSchedule }) => {
            // 完了していないタスクを削除した時だけ再スケジュール（バックグラウンド）
            if (!hasCompletedSchedule) {
                const nextTasks = tasks.filter(t => t.id !== id);
                const nextScheduled = scheduledTasks.filter(t => t.taskId !== id);
                runAutoScheduleBackground(nextTasks, nextScheduled, events, settings);
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
        onMutate: async (newEvents) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.events });
            const previousEvents = queryClient.getQueryData<WorkEvent[]>(QUERY_KEYS.events);
            queryClient.setQueryData<WorkEvent[]>(QUERY_KEYS.events, newEvents);
            return { previousEvents };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousEvents) {
                queryClient.setQueryData(QUERY_KEYS.events, context.previousEvents);
            }
        },
        onSuccess: (newEvents) => {
            runAutoScheduleBackground(tasks, scheduledTasks, newEvents, settings);
        },
    });

    /**
     * スケジュール済みタスク保存ミューテーション（完了トグル用に最適化）
     */
    const saveScheduledTasksMutation = useMutation({
        mutationFn: async (newScheduledTasks: ScheduledTask[]) => {
            await supabaseDb.saveScheduledTasks(newScheduledTasks);
            return newScheduledTasks;
        },
        onMutate: async (newScheduledTasks) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.scheduledTasks });
            const previousScheduled = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks);

            // 楽観的更新: 指定されたタスクを即座にUIに反映
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) => {
                if (!old) return newScheduledTasks;
                const updatedIds = new Set(newScheduledTasks.map(t => t.id));
                return old.map(t => {
                    if (updatedIds.has(t.id)) {
                        return newScheduledTasks.find(nt => nt.id === t.id) || t;
                    }
                    return t;
                });
            });

            return { previousScheduled };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousScheduled) {
                queryClient.setQueryData(QUERY_KEYS.scheduledTasks, context.previousScheduled);
            }
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
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.scheduledTasks });
            const previousScheduled = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks);
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                old?.filter(t => t.id !== id) ?? []
            );
            return { previousScheduled };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousScheduled) {
                queryClient.setQueryData(QUERY_KEYS.scheduledTasks, context.previousScheduled);
            }
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
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.scheduledTasks });
            const previousScheduled = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks);
            const idsSet = new Set(ids);
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                old?.filter(t => !idsSet.has(t.id)) ?? []
            );
            return { previousScheduled };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousScheduled) {
                queryClient.setQueryData(QUERY_KEYS.scheduledTasks, context.previousScheduled);
            }
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
        onMutate: async (newSettings) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.settings });
            const previousSettings = queryClient.getQueryData<AppSettings>(QUERY_KEYS.settings);
            queryClient.setQueryData<AppSettings>(QUERY_KEYS.settings, newSettings);
            return { previousSettings };
        },
        onError: (_err, _variables, context) => {
            if (context?.previousSettings) {
                queryClient.setQueryData(QUERY_KEYS.settings, context.previousSettings);
            }
        },
        onSuccess: (newSettings) => {
            runAutoScheduleBackground(tasks, scheduledTasks, events, newSettings);
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
            runAutoScheduleBackground(allTasks, allScheduled, allEvents, currentSettings);
        },
    });

    // useSupabaseと同じインターフェースを維持
    // mutateを使用（mutateAsyncではなく）して、UIをブロックしない
    const addTask = (title: string, priority: 1 | 2 | 3 | 4 | 5) => {
        addTaskMutation.mutate({ title, priority });
    };

    const updateTask = (task: Task) => {
        updateTaskMutation.mutate(task);
    };

    const deleteTask = (id: string) => {
        deleteTaskMutation.mutate(id);
    };

    const saveEvents = async (newEvents: WorkEvent[]) => {
        await saveEventsMutation.mutateAsync(newEvents);
    };

    const saveScheduledTasks = (newScheduledTasks: ScheduledTask[]) => {
        saveScheduledTasksMutation.mutate(newScheduledTasks);
    };

    const deleteScheduledTask = (id: string) => {
        deleteScheduledTaskMutation.mutate(id);
    };

    const deleteScheduledTasks = (ids: string[]) => {
        deleteScheduledTasksMutation.mutate(ids);
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
