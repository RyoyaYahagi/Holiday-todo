-- Discord通知Cron設定
-- Supabase SQL Editorで実行してください

-- 1. 必要な拡張機能を有効化
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Cronジョブを登録（毎分実行）
-- 注意: <project-ref> と <ANON_KEY> を実際の値に置き換えてください
select cron.schedule(
  'discord-notify-cron',
  '* * * * *',  -- 毎分実行
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/notify-discord',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <ANON_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ジョブ確認
-- select * from cron.job;

-- ジョブ削除（必要な場合）
-- select cron.unschedule('discord-notify-cron');
