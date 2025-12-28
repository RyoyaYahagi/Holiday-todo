-- LINE通知用カラムを settingsテーブルに追加
-- 実行: Supabase Dashboard > SQL Editor でこのSQLを実行

-- LINE Messaging API用のカラムを追加
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS line_channel_access_token TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS line_user_id TEXT DEFAULT '';

-- 確認用: 追加されたカラムを確認
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'settings' AND column_name LIKE 'line_%';

-- 注意: discord_webhook_url カラムは一旦残しておく（後でデータ移行が不要であれば削除可能）
-- 削除する場合: ALTER TABLE settings DROP COLUMN IF EXISTS discord_webhook_url;
