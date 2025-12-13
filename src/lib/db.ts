import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Task, type AppSettings, type WorkEvent, type ScheduledTask } from '../types';

interface TodoDB extends DBSchema {
    tasks: {
        key: string;
        value: Task;
    };
    scheduledTasks: {
        key: string; // Composite key? Or just ID? 
        // We might want to query by date.
        // Let's use ID as key, but maybe index by scheduledTime.
        value: ScheduledTask;
        indexes: { 'by-date': number };
    };
    events: {
        key: number; // timestamp of start date (unique enough for calendar?) 
        // Or we can use autoIncrement
        value: WorkEvent;
        indexes: { 'by-start': Date };
    };
    settings: {
        key: string; // 'app-settings'
        value: AppSettings;
    };
}

const DB_NAME = 'holiday-todo-db';
const DB_VERSION = 1;

export async function initDB(): Promise<IDBPDatabase<TodoDB>> {
    return openDB<TodoDB>(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains('tasks')) {
                db.createObjectStore('tasks', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('scheduledTasks')) {
                const store = db.createObjectStore('scheduledTasks', { keyPath: 'id' });
                store.createIndex('by-date', 'scheduledTime');
            }
            if (!db.objectStoreNames.contains('events')) {
                const store = db.createObjectStore('events', { autoIncrement: true });
                store.createIndex('by-start', 'start');
            }
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings');
            }
        },
    });
}

export const db = {
    async getSettings(): Promise<AppSettings> {
        const db = await initDB();
        const settings = await db.get('settings', 'app-settings');
        return settings || DEFAULT_SETTINGS;
    },

    async saveSettings(settings: AppSettings): Promise<void> {
        const db = await initDB();
        await db.put('settings', settings, 'app-settings');
    },

    async getAllTasks(): Promise<Task[]> {
        const db = await initDB();
        return db.getAll('tasks');
    },

    async addTask(task: Task): Promise<void> {
        const db = await initDB();
        await db.put('tasks', task);
    },

    async updateTask(task: Task): Promise<void> {
        const db = await initDB();
        await db.put('tasks', task);
    },

    async deleteTask(id: string): Promise<void> {
        const db = await initDB();
        await db.delete('tasks', id);
    },

    async saveEvents(events: WorkEvent[]): Promise<void> {
        const db = await initDB();
        const tx = db.transaction('events', 'readwrite');
        await tx.store.clear(); // Replace all events
        for (const event of events) {
            await tx.store.add(event);
        }
        await tx.done;
    },

    async getAllEvents(): Promise<WorkEvent[]> {
        const db = await initDB();
        return db.getAll('events');
    },

    async saveScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
        const db = await initDB();
        const tx = db.transaction('scheduledTasks', 'readwrite');
        // We might want to be careful not to delete past history if we re-schedule
        // But for now, simple implementation
        for (const task of tasks) {
            await tx.store.put(task);
        }
        await tx.done;
    },

    async getScheduledTasks(): Promise<ScheduledTask[]> {
        const db = await initDB();
        return db.getAll('scheduledTasks');
    },

    async deleteScheduledTask(id: string): Promise<void> {
        const db = await initDB();
        await db.delete('scheduledTasks', id);
    },

    /**
     * 元タスクIDに関連するすべてのScheduledTaskを削除する
     * 
     * @param taskId 元タスクのID
     */
    async deleteScheduledTasksByTaskId(taskId: string): Promise<void> {
        const db = await initDB();
        const tx = db.transaction('scheduledTasks', 'readwrite');
        const allScheduled = await tx.store.getAll();

        for (const scheduled of allScheduled) {
            // taskIdフィールドがない既存データの後方互換性のため、idをフォールバックとして使用
            const scheduledTaskId = scheduled.taskId || scheduled.id;
            if (scheduledTaskId === taskId) {
                await tx.store.delete(scheduled.id);
            }
        }

        await tx.done;
    },

    async exportData(): Promise<string> {
        const db = await initDB();
        const tasks = await db.getAll('tasks');
        const scheduledTasks = await db.getAll('scheduledTasks');
        const events = await db.getAll('events');
        const settings = await db.get('settings', 'app-settings');

        const data = {
            tasks,
            scheduledTasks,
            events,
            settings,
            exportDate: new Date().toISOString()
        };
        return JSON.stringify(data, null, 2);
    },

    async importData(jsonString: string): Promise<void> {
        try {
            const data = JSON.parse(jsonString);
            const db = await initDB();
            const tx = db.transaction(['tasks', 'scheduledTasks', 'events', 'settings'], 'readwrite');

            if (data.tasks) {
                await tx.objectStore('tasks').clear();
                for (const t of data.tasks) await tx.objectStore('tasks').add(t);
            }
            if (data.scheduledTasks) {
                await tx.objectStore('scheduledTasks').clear();
                for (const t of data.scheduledTasks) await tx.objectStore('scheduledTasks').add(t);
            }
            if (data.events) {
                await tx.objectStore('events').clear();
                // Events need to convert date strings back to Date objects if JSON.parsed
                // JSON.parse leaves dates as strings
                // We need to fix this.
                // Ideally the caller handles this or we define a reviver, but manual fix is safer here
                for (const e of data.events) {
                    e.start = new Date(e.start);
                    e.end = new Date(e.end);
                    await tx.objectStore('events').add(e);
                }
            }
            if (data.settings) {
                await tx.objectStore('settings').put(data.settings, 'app-settings');
            }
            await tx.done;
        } catch (e) {
            console.error("Import failed", e);
            throw e;
        }
    }
};
