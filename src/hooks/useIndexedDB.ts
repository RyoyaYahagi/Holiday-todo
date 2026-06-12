import { useState, useEffect, useCallback } from 'react';
import { db } from '../lib/db';
import { DEFAULT_SETTINGS, type Task, type WorkEvent, type ScheduledTask, type AppSettings, type TaskScheduleType, type Priority, type RecurrenceRule, type TaskList } from '../types';

export function useIndexedDB() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
    const [events, setEvents] = useState<WorkEvent[]>([]);
    const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
    const [taskLists, setTaskLists] = useState<TaskList[]>([]);
    const [loading, setLoading] = useState(true);

    const refreshData = useCallback(async () => {
        setLoading(true);
        try {
            const [allTasks, allScheduled, allEvents, currentSettings, allTaskLists] = await Promise.all([
                db.getAllTasks(),
                db.getScheduledTasks(),
                db.getAllEvents(),
                db.getSettings(),
                db.getAllTaskLists()
            ]);

            setTasks(allTasks);
            setScheduledTasks(allScheduled);
            setEvents(allEvents);
            setSettings(currentSettings);
            setTaskLists(allTaskLists);
        } catch (err) {
            console.error("Failed to load data", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    const addTask = async (
        title: string,
        scheduleType: TaskScheduleType,
        options?: {
            priority?: Priority;
            manualScheduledTime?: number;
            recurrence?: RecurrenceRule;
            listId?: string;
        }
    ) => {
        const newTask: Task = {
            id: crypto.randomUUID(),
            title,
            scheduleType,
            createdAt: Date.now(),
            priority: options?.priority,
            manualScheduledTime: options?.manualScheduledTime,
            recurrence: options?.recurrence,
            listId: options?.listId
        };
        await db.addTask(newTask);

        if ((scheduleType === 'time' || scheduleType === 'recurrence') && options?.manualScheduledTime) {
            await db.saveScheduledTasks([{
                ...newTask,
                id: crypto.randomUUID(),
                taskId: newTask.id,
                scheduledTime: options.manualScheduledTime,
                isCompleted: false
            }]);
        }

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

    const deleteScheduledTasks = async (ids: string[]) => {
        await db.deleteScheduledTasks(ids);
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

    const addTaskList = async (list: TaskList) => {
        await db.addTaskList(list);
        await refreshData();
    };

    const updateTaskList = async (list: TaskList) => {
        await db.updateTaskList(list);
        await refreshData();
    };

    const deleteTaskList = async (id: string) => {
        await db.deleteTaskList(id);
        await refreshData();
    };

    return {
        tasks,
        scheduledTasks,
        events,
        settings,
        taskLists,
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
        importData,
        addTaskList,
        updateTaskList,
        deleteTaskList
    };
}
