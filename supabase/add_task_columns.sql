-- tasksテーブルへのカラム追加
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'priority';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS manual_scheduled_time timestamp with time zone;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence jsonb;

-- scheduled_tasksテーブルへのカラム追加
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS schedule_type text DEFAULT 'priority';
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS manual_scheduled_time timestamp with time zone;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS recurrence jsonb;
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS recurrence_source_id uuid;

-- 既存データの補正
UPDATE tasks SET schedule_type = 'priority' WHERE schedule_type IS NULL;
UPDATE scheduled_tasks SET schedule_type = 'priority' WHERE schedule_type IS NULL;
