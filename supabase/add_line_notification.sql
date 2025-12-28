-- 通知方法選択カラム追加マイグレーション
-- 
-- notification_method: 'line' または 'discord'
-- デフォルト値は 'line'

ALTER TABLE settings
ADD COLUMN IF NOT EXISTS notification_method TEXT DEFAULT 'line';

-- 既存のマイグレーション（念のため再実行可能に）
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS line_user_id TEXT DEFAULT '';

ALTER TABLE settings
ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT DEFAULT '';
