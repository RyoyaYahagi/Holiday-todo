import { useState, useEffect, useCallback, useRef } from 'react';
import { supabaseDb } from '../lib/supabaseDb';
import { useAuth } from '../contexts/AuthContext';
import { reschedulePendingTasks } from '../lib/scheduler';
import { DEFAULT_SETTINGS, type Task, type WorkEvent, type ScheduledTask, type AppSettings } from '../types';

/**
 * Supabaseをデータストアとして使用するカスタムフック
 * 
 * useIndexedDBと同じインターフェースを提供し、
 * バックエンドとしてSupabaseを使用する。
 * ユーザー認証が必要。
 */
export function useSupabase() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
    const [events, setEvents] = useState<WorkEvent[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    // スケジューリング処理の重複実行を防ぐためのフラグ
    const isScheduling = useRef(false);

    /**
     * 全データを再読み込み
     */
    const refreshData = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const [allTasks, allScheduled, allEvents, currentSettings] = await Promise.all([
                supabaseDb.getAllTasks(),
                supabaseDb.getScheduledTasks(),
                supabaseDb.getAllEvents(),
                supabaseDb.getSettings()
            ]);

            setTasks(allTasks);
            setScheduledTasks(allScheduled);
            setEvents(allEvents);
            setSettings(currentSettings);
        } catch (err) {
            console.error("データの読み込みに失敗しました", err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    /**
     * 自動スケジューリングを実行 (内部用)
     * 引数で渡された最新の状態をもとに再計算し、更新があればDBに反映する
     * DBからの再取得は行わない
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

                // 一貫性を保つため、未完了スケジュールを一度全て削除してから新しいスケジュールを保存する
                // これにより、重複やゴミデータの残留を防ぐ
                await supabaseDb.deletePendingScheduledTasks();

                if (newSchedules.length > 0) {
                    await supabaseDb.saveScheduledTasks(newSchedules);
                }
            }
        } finally {
            isScheduling.current = false;
        }
    };

    /**
     * タスクを追加
     */
    const addTask = async (title: string, priority: 1 | 2 | 3 | 4 | 5) => {
        const newTask: Task = {
            id: crypto.randomUUID(),
            title,
            priority,
            createdAt: Date.now()
        };
        await supabaseDb.addTask(newTask);

        // ローカルステートを楽観的に更新してスケジューラーに渡す
        const nextTasks = [...tasks, newTask];
        await runAutoSchedule(nextTasks, scheduledTasks, events, settings);
        await refreshData();
    };

    /**
     * タスクを更新
     */
    const updateTask = async (task: Task) => {
        await supabaseDb.updateTask(task);

        // ローカルステートを更新してスケジューラーに渡す
        const nextTasks = tasks.map(t => t.id === task.id ? task : t);
        await runAutoSchedule(nextTasks, scheduledTasks, events, settings);
        await refreshData();
    };

    /**
     * タスクを削除
     */
    const deleteTask = async (id: string) => {
        // 削除対象のタスクが完了済みスケジュールを持っているか確認
        // ステート(scheduledTasks)は最新とは限らないが、ユーザー操作直後なら概ね正しい
        const hasCompletedSchedule = scheduledTasks.some(t => t.taskId === id && t.isCompleted);

        await supabaseDb.deleteTask(id);
        await supabaseDb.deleteScheduledTasksByTaskId(id);

        // 完了していないタスクを削除した時だけ再スケジュール
        // (完了済みタスクを削除した時は、穴埋めをせずそのままにする)
        if (!hasCompletedSchedule) {
            const nextTasks = tasks.filter(t => t.id !== id);
            const nextScheduled = scheduledTasks.filter(t => t.taskId !== id);
            await runAutoSchedule(nextTasks, nextScheduled, events, settings);
        }
        await refreshData();
    };

    /**
     * イベントを保存
     */
    const saveEvents = async (newEvents: WorkEvent[]) => {
        await supabaseDb.saveEvents(newEvents);
        await runAutoSchedule(tasks, scheduledTasks, newEvents, settings); // イベント変更に合わせて再スケジュール
        await refreshData();
    };

    /**
     * スケジュール済みタスクを保存
     */
    const saveScheduledTasks = async (newScheduledTasks: ScheduledTask[]) => {
        await supabaseDb.saveScheduledTasks(newScheduledTasks);
        await refreshData();
    };

    /**
     * スケジュール済みタスクを削除
     */
    const deleteScheduledTask = async (id: string) => {
        await supabaseDb.deleteScheduledTask(id);
        // 手動削除の場合は再スケジュールしない（再スケジュールすると復活してしまうため）
        await refreshData();
    };

    /**
     * 複数のスケジュール済みタスクを一括削除
     */
    const deleteScheduledTasks = async (ids: string[]) => {
        await supabaseDb.deleteScheduledTasks(ids);
        await refreshData();
    };

    /**
     * 設定を更新
     */
    const updateSettings = async (newSettings: AppSettings) => {
        await supabaseDb.saveSettings(newSettings);
        // 設定変更（間隔変更など）に合わせて再スケジュール
        await runAutoSchedule(tasks, scheduledTasks, events, newSettings);
        await refreshData();
    };

    /**
     * データをエクスポート
     */
    const exportData = async () => {
        return await supabaseDb.exportData();
    };

    /**
     * データをインポート
     */
    const importData = async (json: string) => {
        await supabaseDb.importData(json);
        // インポート後はDBの状態が正なので、一度リフレッシュしてからスケジュールを回すのが安全だが
        // ここではまだリフレッシュしていないので、DBから最新を取る必要があるか、
        // あるいは importData 側で返り値としてデータをもらうか。
        // UseSupabase の設計上、importData は void.
        // ここだけは例外的に refreshData して、その結果を使って runAutoSchedule する必要があるが、
        // runAutoSchedule は引数をとるようになった。

        // 簡易実装: import直後は refreshData して、そのデータを取る... のは非効率だが import は頻度低い。
        // しかし refreshData は state update するだけ。
        // ここは手動で fetch する
        const [allTasks, allScheduled, allEvents, currentSettings] = await Promise.all([
            supabaseDb.getAllTasks(),
            supabaseDb.getScheduledTasks(),
            supabaseDb.getAllEvents(),
            supabaseDb.getSettings()
        ]);

        // State update
        setTasks(allTasks);
        setScheduledTasks(allScheduled);
        setEvents(allEvents);
        setSettings(currentSettings);

        // そのデータでスケジュール
        await runAutoSchedule(allTasks, allScheduled, allEvents, currentSettings);
        await refreshData();
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
