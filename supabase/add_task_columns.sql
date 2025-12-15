-- tasksテーブルへのカラム追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'priority';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manual_scheduled_time timestamp with time zone;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence jsonb;

-- scheduled_tasksテーブルへのカラム追加
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'priority';
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS manual_scheduled_time timestamp with time zone;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS recurrence jsonb;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS recurrence_source_id uuid;

-- 優先度(priority)のNOT NULL制約を解除（手動タスクやNoneタスク用）
ALTER TABLE tasks ALTER COLUMN priority DROP NOT NULL;
ALTER TABLE scheduled_tasks ALTER COLUMN priority DROP NOT NULL;

-- 既存データの補正（念の為）
UPDATE tasks SET schedule_type = 'priority' WHERE schedule_type IS NULL;
UPDATE scheduled_tasks SET schedule_type = 'priority' WHERE schedule_type IS NULL;
