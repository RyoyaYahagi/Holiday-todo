# Discord通知Cron設定

Supabase Edge Functions + pg_cron を使用したバックグラウンドDiscord通知のセットアップ手順。

## 前提条件

- Supabase CLIがインストールされていること
- Supabaseプロジェクトがリンクされていること

## セットアップ手順

### 1. Supabase CLIのセットアップ

```bash
# インストール（未インストールの場合）
npm install -g supabase

# ログイン
supabase login

# プロジェクトをリンク
cd /Users/yappa/code/web-app/todo
supabase link --project-ref <your-project-ref>
```

### 2. Edge Functionのデプロイ

```bash
supabase functions deploy notify-discord
```

### 3. 拡張機能の有効化

Supabaseダッシュボード > Database > Extensions で以下を有効化:
- `pg_cron`
- `pg_net`

### 4. Cronジョブの登録

Supabase SQL Editor で `supabase/setup_cron.sql` を実行。

**重要**: `<project-ref>` と `<ANON_KEY>` を実際の値に置き換えてください。

```sql
select cron.schedule(
  'discord-notify-cron',
  '* * * * *',
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
```

## 動作確認

### 手動テスト

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/notify-discord \
  -H "Authorization: Bearer <ANON_KEY>"
```

### Cronジョブ確認

```sql
select * from cron.job;
```

### ログ確認

Supabaseダッシュボード > Edge Functions > notify-discord > Logs
