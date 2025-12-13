import React from 'react';
import type { Task } from '../types';

interface TaskListProps {
    tasks: Task[];
    onDelete: (id: string) => void;
}

export const TaskList: React.FC<TaskListProps> = ({ tasks, onDelete }) => {
    if (tasks.length === 0) {
        return <div className="empty-state">タスクがありません</div>;
    }

    // Sort by priority desc, then createdAt desc
    const sortedTasks = [...tasks].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.createdAt - a.createdAt;
    });

    return (
        <ul className="task-list">
            {sortedTasks.map(task => (
                <li key={task.id} className="task-item">
                    <div className="task-info">
                        <span className={`priority-badge p-${task.priority}`}>P{task.priority}</span>
                        <span className="task-title">{task.title}</span>
                    </div>
                    <button
                        className="btn-delete"
                        onClick={() => onDelete(task.id)}
                        aria-label="削除"
                    >
                        ×
                    </button>
                </li>
            ))}
        </ul>
    );
};
