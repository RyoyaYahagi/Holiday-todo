-- LINE友達追加方式通知 + Discordフォールバック用マイグレーション
-- 
-- 変更内容:
-- 1. line_user_id - Webhookから自動取得されるLINEユーザーID
-- 2. discord_webhook_url - フォールバック用Discord Webhook URL
-- 3. line_channel_access_token - 環境変数に移行するため削除（すでに存在する場合）

-- line_user_idカラムの追加（まだ存在しない場合）
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS line_user_id TEXT DEFAULT '';

-- discord_webhook_urlカラムの追加（まだ存在しない場合）
ALTER TABLE settings
ADD COLUMN IF NOT EXISTS discord_webhook_url TEXT DEFAULT '';

-- 注意: line_channel_access_tokenは環境変数に移行するため、
-- このカラムは今後使用されませんが、既存データの互換性のため削除しません。
-- 将来的なクリーンアップ時に以下のコマンドで削除可能:
-- ALTER TABLE settings DROP COLUMN IF EXISTS line_channel_access_token;
