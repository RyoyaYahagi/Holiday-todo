import { useState, useEffect, useCallback } from 'react';
import { supabaseDb } from '../lib/supabaseDb';
import { useAuth } from '../contexts/AuthContext';
import { reschedulePendingTasks } from '../lib/scheduler'; // reschedulePendingTasksを追加
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
     * 現在のDBの状態をもとに再計算し、更新があればDBに反映する
     */
    const runAutoSchedule = async () => {
        // 最新のデータを取得
        const [currentTasks, currentScheduled, currentEvents] = await Promise.all([
            supabaseDb.getAllTasks(),
            supabaseDb.getScheduledTasks(),
            supabaseDb.getAllEvents()
        ]);

        const today = new Date();
        const { newSchedules, obsoleteScheduleIds } = reschedulePendingTasks(
            currentTasks,
            currentScheduled,
            currentEvents,
            today
        );

        // 変更がある場合のみ実行
        if (obsoleteScheduleIds.length > 0 || newSchedules.length > 0) {
            console.log('Running auto-schedule:', {
                deleted: obsoleteScheduleIds.length,
                added: newSchedules.length
            });

            if (obsoleteScheduleIds.length > 0) {
                await supabaseDb.deleteScheduledTasks(obsoleteScheduleIds);
            }
            if (newSchedules.length > 0) {
                await supabaseDb.saveScheduledTasks(newSchedules);
            }
            // 変更があった場合はデータをリフレッシュ
            await refreshData();
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
        await runAutoSchedule(); // 自動スケジュール
        await refreshData();
    };

    /**
     * タスクを更新
     */
    const updateTask = async (task: Task) => {
        await supabaseDb.updateTask(task);
        await runAutoSchedule(); // 自動スケジュール（優先度変更などに対応）
        await refreshData();
    };

    /**
     * タスクを削除
     */
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
            await runAutoSchedule();
        }

        await refreshData();
    };

    /**
     * イベントを保存
     */
    const saveEvents = async (newEvents: WorkEvent[]) => {
        await supabaseDb.saveEvents(newEvents);
        await runAutoSchedule(); // イベント変更に合わせて再スケジュール
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
        // ただし、「この回のスケジュールをスキップ」という意味なら、復活しないように
        // 何らかの除外リストが必要だが、現状の仕様では「削除＝プールに戻る」挙動
        // → プールに戻ると、次の autoSchedule でまたスケジュールされる
        // → つまり「削除」しても即復活する？
        // ユーザーが明示的に削除した場合、再スケジュールすべきではないか？
        // 仕様: "休日に自動的にスケジューリングされます"
        // 手動削除の概念が「キャンセル」なら、プールに戻るべきではない（完了扱いや、プール除外？）
        // ここでは「削除してプールに戻す」挙動にするなら再スケジュールが必要だが、
        // ユーザーの意図が「この時間はやらない」なら、どうするか。
        // いったんデータリフレッシュのみ。
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
        setSettings(newSettings);
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
        await runAutoSchedule(); // インポート後に整合性を取る
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
