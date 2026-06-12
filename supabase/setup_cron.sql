-- LINE/Discord通知Cron設定（一本化）
-- Supabase SQL Editorで実行してください

-- 1. 必要な拡張機能を有効化
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. 旧Cronジョブ（notify-discord）の削除（登録されている場合）
-- select cron.unschedule('discord-notify-cron');

-- 3. 新しいCronジョブを登録（毎分実行 - LINE/Discord両対応の notify-line を使用）
-- 注意: <project-ref>、<ANON_KEY>、<NOTIFY_CRON_SECRET> を実際の値に置き換えてください
select cron.schedule(
  'line-notify-cron',
  '* * * * *',  -- 毎分実行
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/notify-line',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <ANON_KEY>',
      'Content-Type', 'application/json',
      'x-cron-secret', '<NOTIFY_CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ジョブ確認
-- select * from cron.job;

-- ジョブ削除（必要な場合）
-- select cron.unschedule('line-notify-cron');
