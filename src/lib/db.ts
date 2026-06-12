import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DEFAULT_SETTINGS, type Task, type AppSettings, type WorkEvent, type ScheduledTask, type TaskList } from '../types';

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
    taskLists: {
        key: string;
        value: TaskList;
    };
}

const DB_NAME = 'holiday-todo-db';
const DB_VERSION = 2;

const DEFAULT_TASK_LIST: TaskList = {
    id: 'default',
    name: 'すべて',
    color: '#6B7280',
    isDefault: true,
    createdAt: 0,
    sortOrder: 0
};

function sortTaskLists(lists: TaskList[]): TaskList[] {
    return lists.sort((a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.createdAt - b.createdAt
    );
}

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
            if (!db.objectStoreNames.contains('taskLists')) {
                db.createObjectStore('taskLists', { keyPath: 'id' });
            }
        },
    });
}

async function ensureDefaultTaskList(database: IDBPDatabase<TodoDB>): Promise<TaskList> {
    const existing = await database.get('taskLists', DEFAULT_TASK_LIST.id);
    if (existing) return existing;

    await database.put('taskLists', DEFAULT_TASK_LIST);
    return DEFAULT_TASK_LIST;
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

    async deleteScheduledTasks(ids: string[]): Promise<void> {
        const db = await initDB();
        const tx = db.transaction('scheduledTasks', 'readwrite');

        for (const id of ids) {
            await tx.store.delete(id);
        }

        await tx.done;
    },

    async getAllTaskLists(): Promise<TaskList[]> {
        const db = await initDB();
        await ensureDefaultTaskList(db);
        const lists = await db.getAll('taskLists');
        return sortTaskLists(lists);
    },

    async getOrCreateDefaultList(): Promise<TaskList> {
        const db = await initDB();
        return ensureDefaultTaskList(db);
    },

    async addTaskList(list: TaskList): Promise<void> {
        const db = await initDB();
        await db.put('taskLists', list);
    },

    async updateTaskList(list: TaskList): Promise<void> {
        const db = await initDB();
        await db.put('taskLists', list);
    },

    async deleteTaskList(id: string): Promise<void> {
        const db = await initDB();
        const list = await db.get('taskLists', id);

        if (list?.isDefault) {
            throw new Error('デフォルトリストは削除できません');
        }

        await db.delete('taskLists', id);

        const tx = db.transaction('tasks', 'readwrite');
        const tasks = await tx.store.getAll();
        for (const task of tasks) {
            if (task.listId === id) {
                await tx.store.put({ ...task, listId: undefined });
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
        const taskLists = await db.getAll('taskLists');

        const data = {
            tasks,
            scheduledTasks,
            events,
            settings,
            taskLists,
            exportDate: new Date().toISOString()
        };
        return JSON.stringify(data, null, 2);
    },

    async importData(jsonString: string): Promise<void> {
        try {
            const data = JSON.parse(jsonString);
            const db = await initDB();
            const tx = db.transaction(['tasks', 'scheduledTasks', 'events', 'settings', 'taskLists'], 'readwrite');

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
                    e.id = e.id ?? crypto.randomUUID();
                    await tx.objectStore('events').add(e);
                }
            }
            if (data.settings) {
                await tx.objectStore('settings').put(data.settings, 'app-settings');
            }
            if (data.taskLists) {
                await tx.objectStore('taskLists').clear();
                for (const list of data.taskLists) await tx.objectStore('taskLists').add(list);
            }
            await tx.done;
        } catch (e) {
            console.error("Import failed", e);
            throw e;
        }
    }
};
