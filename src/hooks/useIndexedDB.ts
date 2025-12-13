import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/db';
import { DEFAULT_SETTINGS, type Task, type WorkEvent, type ScheduledTask, type AppSettings } from '../types';

export function useIndexedDB() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
    const [events, setEvents] = useState<WorkEvent[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    const refreshData = useCallback(async () => {
        setLoading(true);
        try {
            const [allTasks, allScheduled, allEvents, currentSettings] = await Promise.all([
                db.getAllTasks(),
                db.getScheduledTasks(),
                db.getAllEvents(),
                db.getSettings()
            ]);

            setTasks(allTasks);
            setScheduledTasks(allScheduled);
            setEvents(allEvents);
            setSettings(currentSettings);
        } catch (err) {
            console.error("Failed to load data", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    const addTask = async (title: string, priority: 1 | 2 | 3 | 4 | 5) => {
        const newTask: Task = {
            id: crypto.randomUUID(),
            title,
            priority,
            createdAt: Date.now()
        };
        await db.addTask(newTask);
        await refreshData();
    };

    const updateTask = async (task: Task) => {
        await db.updateTask(task);
        await refreshData();
    };

    const deleteTask = async (id: string) => {
        await db.deleteTask(id);
        // タスクプールから削除する際、関連するスケジュール済みタスクも削除
        await db.deleteScheduledTasksByTaskId(id);
        await refreshData();
    };

    const saveEvents = async (newEvents: WorkEvent[]) => {
        await db.saveEvents(newEvents);
        await refreshData();
    };

    const saveScheduledTasks = async (newScheduledTasks: ScheduledTask[]) => {
        await db.saveScheduledTasks(newScheduledTasks);
        await refreshData();
    };

    const deleteScheduledTask = async (id: string) => {
        await db.deleteScheduledTask(id);
        await refreshData();
    };

    const updateSettings = async (newSettings: AppSettings) => {
        await db.saveSettings(newSettings);
        setSettings(newSettings);
    };

    const exportData = async () => {
        return await db.exportData();
    };

    const importData = async (json: string) => {
        await db.importData(json);
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
