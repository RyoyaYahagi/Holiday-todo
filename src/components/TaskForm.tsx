import React, { useState } from 'react';
import type { Priority } from '../types';

interface TaskFormProps {
    onAdd: (title: string, priority: Priority) => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ onAdd }) => {
    const [title, setTitle] = useState('');
    const [priority, setPriority] = useState<Priority>(3);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd(title, priority);
        setTitle('');
        setPriority(3);
    };

    return (
        <form onSubmit={handleSubmit} className="task-form">
            <div className="form-group">
                <label htmlFor="task-title">タスク名</label>
                <input
                    id="task-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="新しいタスクを入力..."
                    required
                />
            </div>

            <div className="form-group">
                <label htmlFor="task-priority">優先度 (1:低 - 5:高)</label>
                <div className="priority-selector">
                    {[1, 2, 3, 4, 5].map((p) => (
                        <label key={p} className={`priority-label ${priority === p ? 'selected' : ''}`}>
                            <input
                                type="radio"
                                name="priority"
                                value={p}
                                checked={priority === p}
                                onChange={() => setPriority(p as Priority)}
                            />
                            {p}
                        </label>
                    ))}
                </div>
            </div>

            <button type="submit" className="btn-primary">追加</button>
        </form>
    );
};
