import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabaseDb } from '../lib/supabaseDb';
import { reschedulePendingTasks } from '../lib/scheduler';
import { DEFAULT_SETTINGS, type Task, type WorkEvent, type ScheduledTask, type AppSettings, type TaskScheduleType, type Priority, type RecurrenceRule } from '../types';
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
    const { user, loading: authLoading } = useAuth();
    const queryClient = useQueryClient();

    // 認証が完了するまでクエリを有効にしない
    const isAuthReady = !authLoading && !!user;

    // スケジューリング処理の重複実行を防ぐためのフラグ
    const isScheduling = useRef(false);

    /**
     * タスク取得クエリ
     */
    const tasksQuery = useQuery({
        queryKey: QUERY_KEYS.tasks,
        queryFn: () => supabaseDb.getAllTasks(),
        enabled: isAuthReady,
        staleTime: 5 * 60 * 1000,
    });

    /**
     * スケジュール済みタスク取得クエリ
     */
    const scheduledTasksQuery = useQuery({
        queryKey: QUERY_KEYS.scheduledTasks,
        queryFn: () => supabaseDb.getScheduledTasks(),
        enabled: isAuthReady,
        staleTime: 5 * 60 * 1000,
    });

    /**
     * イベント取得クエリ
     * 除外設定の変更時にキャッシュが上書きされないよう設定
     */
    const eventsQuery = useQuery({
        queryKey: QUERY_KEYS.events,
        queryFn: () => supabaseDb.getAllEvents(),
        enabled: isAuthReady,
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false, // ウィンドウフォーカス時に再取得しない
        refetchOnMount: false, // マウント時に再取得しない（キャッシュ優先）
    });

    /**
     * 設定取得クエリ
     */
    const settingsQuery = useQuery({
        queryKey: QUERY_KEYS.settings,
        queryFn: () => supabaseDb.getSettings(),
        enabled: isAuthReady,
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
     * キャッシュから最新のデータを取得してスケジューリングを行う
     */
    const runAutoScheduleBackground = useCallback(() => {
        if (isScheduling.current) {
            console.log('Skipping auto-schedule: already running');
            return;
        }

        isScheduling.current = true;

        // 非同期で実行（UIをブロックしない）
        (async () => {
            try {
                // キャッシュから最新のデータを取得
                const currentTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks) ?? [];
                const currentScheduled = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks) ?? [];
                const currentEvents = queryClient.getQueryData<WorkEvent[]>(QUERY_KEYS.events) ?? [];
                const currentSettings = queryClient.getQueryData<AppSettings>(QUERY_KEYS.settings) ?? DEFAULT_SETTINGS;

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
     * scheduleType === 'priority' の場合のみ自動スケジューリングを実行
     */
    const addTaskMutation = useMutation({
        mutationFn: async ({ id, title, scheduleType, priority, manualScheduledTime, recurrence, createdAt }: {
            id: string;
            title: string;
            scheduleType: TaskScheduleType;
            priority?: Priority;
            manualScheduledTime?: number;
            recurrence?: RecurrenceRule;
            createdAt: number;
        }) => {
            const newTask: Task = {
                id,
                title,
                scheduleType,
                createdAt,
                priority,
                manualScheduledTime,
                recurrence
            };
            await supabaseDb.addTask(newTask);

            // 日時指定タスクの場合、scheduled_tasks にも保存
            // (繰り返し設定がある場合は、繰り返しロジック側で処理が必要だが、一旦初回分として保存する)
            if ((scheduleType === 'time' || scheduleType === 'recurrence') && manualScheduledTime) {
                const scheduledTask: ScheduledTask = {
                    id: crypto.randomUUID(),
                    taskId: newTask.id,
                    title: newTask.title,
                    scheduledTime: manualScheduledTime,
                    isCompleted: false,
                    createdAt: newTask.createdAt,
                    priority: newTask.priority,
                    scheduleType: newTask.scheduleType,
                    manualScheduledTime: newTask.manualScheduledTime,
                    recurrence: newTask.recurrence
                };
                // ScheduledTask型に合わせた保存（内部でカラム除外などの処理はsupabaseDb側で行われる）
                await supabaseDb.saveScheduledTasks([scheduledTask]);
            }

            return newTask;
        },
        onMutate: async ({ id, title, scheduleType, priority, manualScheduledTime, recurrence, createdAt }) => {
            // キャンセル中のクエリをキャンセル
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.scheduledTasks });

            // 現在のキャッシュを保存（ロールバック用）
            const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
            const previousScheduledTasks = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks);

            // 楽観的更新: DB保存前にUIを更新（同じIDを使用）
            const optimisticTask: Task = {
                id,
                title,
                scheduleType,
                createdAt,
                priority,
                manualScheduledTime,
                recurrence
            };
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old ? [...old, optimisticTask] : [optimisticTask]
            );

            // 日時指定タスクの場合、scheduledTasks にも楽観的追加
            if ((scheduleType === 'time' || scheduleType === 'recurrence') && manualScheduledTime) {
                const optimisticScheduledTask: ScheduledTask = {
                    id: crypto.randomUUID(), // 一時的なID（リロードまで有効）
                    taskId: id,
                    title,
                    scheduledTime: manualScheduledTime,
                    isCompleted: false,
                    createdAt,
                    priority,
                    scheduleType,
                    manualScheduledTime,
                    recurrence
                };
                queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                    old ? [...old, optimisticScheduledTask] : [optimisticScheduledTask]
                );
            }

            return { previousTasks, previousScheduledTasks };
        },
        onError: (_err, _variables, context) => {
            // エラー時はロールバック
            console.error('タスク追加エラー:', _err);
            if (context?.previousTasks) {
                queryClient.setQueryData(QUERY_KEYS.tasks, context.previousTasks);
            }
            if (context?.previousScheduledTasks) {
                queryClient.setQueryData(QUERY_KEYS.scheduledTasks, context.previousScheduledTasks);
            }
        },
        onSuccess: (newTask) => {
            // IDは既に一致しているので置き換え不要、キャッシュはそのまま維持

            // 優先度タスクの場合のみ自動スケジューリング（バックグラウンド）
            if (newTask.scheduleType === 'priority') {
                runAutoScheduleBackground();
            } else {
                // 日時指定などは即時反映済みだが、念のため正規化のためにinvalidateしてもいいかもしれない
                // しかし楽観的更新がスムーズに見えるため、ここでは何もしないか、遅延してinvalidate
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.scheduledTasks });
            }
        },
    });

    /**
     * タスク更新ミューテーション
     * タイトル・優先度等の変更をScheduledTaskにも同期
     */
    const updateTaskMutation = useMutation({
        mutationFn: async (task: Task) => {
            await supabaseDb.updateTask(task);

            // 対応するScheduledTaskも更新
            const currentScheduled = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks) ?? [];
            const relatedSchedules = currentScheduled.filter(s => s.taskId === task.id);

            if (relatedSchedules.length > 0) {
                const updatedSchedules = relatedSchedules.map(s => ({
                    ...s,
                    title: task.title,
                    priority: task.priority,
                    scheduleType: task.scheduleType,
                    manualScheduledTime: task.manualScheduledTime,
                    recurrence: task.recurrence,
                    // time/recurrence タイプでmanualScheduledTimeが変更された場合、scheduledTimeも更新
                    scheduledTime: (task.scheduleType === 'time' || task.scheduleType === 'recurrence') && task.manualScheduledTime
                        ? task.manualScheduledTime
                        : s.scheduledTime
                }));
                await supabaseDb.saveScheduledTasks(updatedSchedules);
            }

            return task;
        },
        onMutate: async (updatedTask) => {
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.tasks });
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.scheduledTasks });

            const previousTasks = queryClient.getQueryData<Task[]>(QUERY_KEYS.tasks);
            const previousScheduled = queryClient.getQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks);

            // Taskの楽観的更新
            queryClient.setQueryData<Task[]>(QUERY_KEYS.tasks, (old) =>
                old?.map(t => t.id === updatedTask.id ? updatedTask : t) ?? []
            );

            // ScheduledTaskの楽観的更新（title, priority等を同期）
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) =>
                old?.map(s => s.taskId === updatedTask.id ? {
                    ...s,
                    title: updatedTask.title,
                    priority: updatedTask.priority,
                    scheduleType: updatedTask.scheduleType,
                    manualScheduledTime: updatedTask.manualScheduledTime,
                    recurrence: updatedTask.recurrence,
                    scheduledTime: (updatedTask.scheduleType === 'time' || updatedTask.scheduleType === 'recurrence') && updatedTask.manualScheduledTime
                        ? updatedTask.manualScheduledTime
                        : s.scheduledTime
                } : s) ?? []
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
        onSuccess: () => {
            // 自動スケジューリング（バックグラウンド）
            runAutoScheduleBackground();
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
        onSuccess: ({ hasCompletedSchedule }) => {
            // 完了していないタスクを削除した時だけ再スケジュール（バックグラウンド）
            if (!hasCompletedSchedule) {
                runAutoScheduleBackground();
            }
        },
    });

    /**
     * イベント保存ミューテーション
     * 除外設定の変更時も使用される
     */
    const saveEventsMutation = useMutation({
        mutationFn: async (newEvents: WorkEvent[]) => {
            console.log('[saveEventsMutation] mutationFn開始:', newEvents.length, '件');
            await supabaseDb.saveEvents(newEvents);
            console.log('[saveEventsMutation] mutationFn完了');
            return newEvents;
        },
        onMutate: async (newEvents) => {
            console.log('[saveEventsMutation] onMutate: 楽観的更新開始');
            // 進行中のクエリをキャンセル（競合防止）
            await queryClient.cancelQueries({ queryKey: QUERY_KEYS.events });
            const previousEvents = queryClient.getQueryData<WorkEvent[]>(QUERY_KEYS.events);
            console.log('[saveEventsMutation] 前のイベント数:', previousEvents?.length);
            // 楽観的更新
            queryClient.setQueryData<WorkEvent[]>(QUERY_KEYS.events, newEvents);
            console.log('[saveEventsMutation] 楽観的更新完了:', newEvents.length, '件に設定');
            return { previousEvents };
        },
        onError: (err, _variables, context) => {
            console.error('[saveEventsMutation] onError:', err);
            if (context?.previousEvents) {
                console.log('[saveEventsMutation] ロールバック:', context.previousEvents.length, '件に戻す');
                queryClient.setQueryData(QUERY_KEYS.events, context.previousEvents);
            }
        },
        onSuccess: (newEvents) => {
            console.log('[saveEventsMutation] onSuccess:', newEvents.length, '件で確定');
            // 成功後も明示的にキャッシュを設定（他の処理による上書き防止）
            queryClient.setQueryData<WorkEvent[]>(QUERY_KEYS.events, newEvents);
            // 自動スケジュールをバックグラウンドで実行
            runAutoScheduleBackground();
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
            // 楽観的更新: 指定されたタスクを即座にUIに反映（追加・更新）
            queryClient.setQueryData<ScheduledTask[]>(QUERY_KEYS.scheduledTasks, (old) => {
                const current = old || [];
                const taskMap = new Map(current.map(t => [t.id, t]));

                newScheduledTasks.forEach(nt => {
                    taskMap.set(nt.id, nt);
                });

                return Array.from(taskMap.values());
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
        onSuccess: () => {
            runAutoScheduleBackground();
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

            // 新しいデータでスケジューリング（refreshDataでキャッシュが更新されるのを待つ）
            runAutoScheduleBackground();
        },
    });

    // useSupabaseと同じインターフェースを拡張
    // mutateAsyncを使用してPromiseを返す（UIはonMutateで即時更新済み）
    const addTask = async (
        title: string,
        scheduleType: TaskScheduleType,
        options?: {
            priority?: Priority;
            manualScheduledTime?: number;
            recurrence?: RecurrenceRule;
        }
    ) => {
        // IDとタイムスタンプを事前生成して楽観的更新と一致させる
        const id = crypto.randomUUID();
        const createdAt = Date.now();

        await addTaskMutation.mutateAsync({
            id,
            title,
            scheduleType,
            createdAt,
            priority: options?.priority,
            manualScheduledTime: options?.manualScheduledTime,
            recurrence: options?.recurrence
        });
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
