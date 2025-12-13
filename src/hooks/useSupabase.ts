import { useState, useEffect, useCallback } from 'react';
import { supabaseDb } from '../lib/supabaseDb';
import { useAuth } from '../contexts/AuthContext';
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
        await refreshData();
    };

    /**
     * タスクを更新
     */
    const updateTask = async (task: Task) => {
        await supabaseDb.updateTask(task);
        await refreshData();
    };

    /**
     * タスクを削除
     */
    const deleteTask = async (id: string) => {
        await supabaseDb.deleteTask(id);
        // 関連するスケジュール済みタスクも削除
        await supabaseDb.deleteScheduledTasksByTaskId(id);
        await refreshData();
    };

    /**
     * イベントを保存
     */
    const saveEvents = async (newEvents: WorkEvent[]) => {
        await supabaseDb.saveEvents(newEvents);
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
        updateSettings,
        exportData,
        importData
    };
}
