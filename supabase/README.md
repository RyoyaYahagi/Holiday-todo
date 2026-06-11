# LINE/Discord通知Cron設定

Supabase Edge Functions + pg_cron を使用したバックグラウンドLINE/Discord通知のセットアップ手順。

> [!NOTE]
> 以前の `notify-discord` Edge Function は非推奨になりました。現在は、LINE/Discordの両方の通知をハンドリングできる `notify-line` へ一本化されています。

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
cd /Users/yappa/code/app/todo
supabase link --project-ref <your-project-ref>
```

### 2. Edge Functionのデプロイ

```bash
supabase functions deploy notify-line
```

### 3. 拡張機能の有効化

Supabaseダッシュボード > Database > Extensions で以下を有効化:
- `pg_cron`
- `pg_net`

### 4. インデックス追加とCronジョブの登録

Supabaseダッシュボード > SQL Editor で以下の2つのファイルを実行してください。

1. **インデックスの追加**: `supabase/add_performance_indexes.sql` の内容を実行して、高負荷対策のためのインデックスを追加します。
2. **Cronジョブの登録**: `supabase/setup_cron.sql` の内容を実行して、毎分のバックグラウンド実行を設定します。

**重要**: `setup_cron.sql` 内の `<project-ref>` と `<ANON_KEY>` を実際の値に置き換えてください。

```sql
select cron.schedule(
  'line-notify-cron',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/notify-line',
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
curl -X POST https://<project-ref>.supabase.co/functions/v1/notify-line \
  -H "Authorization: Bearer <ANON_KEY>"
```

### Cronジョブ確認

```sql
select * from cron.job;
```

### ログ確認

Supabaseダッシュボード > Edge Functions > notify-line > Logs
