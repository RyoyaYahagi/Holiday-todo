-- 1. Index on scheduled_tasks for priority rescheduling and general user queries
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user_priority_time
ON scheduled_tasks (user_id, is_completed, schedule_type, scheduled_time);

-- 2. Index on scheduled_tasks for task start notification queries
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_user_notified_time
ON scheduled_tasks (user_id, is_completed, notified_at, scheduled_time);

-- 3. Index on events for event queries/holiday checks
CREATE INDEX IF NOT EXISTS idx_events_user_start_time
ON events (user_id, start_time);

-- 4. Partial index on settings for selecting active notification users
CREATE INDEX IF NOT EXISTS idx_settings_notifications
ON settings (user_id)
WHERE (line_user_id IS NOT NULL AND line_user_id <> '')
   OR (discord_webhook_url IS NOT NULL AND discord_webhook_url <> '');
