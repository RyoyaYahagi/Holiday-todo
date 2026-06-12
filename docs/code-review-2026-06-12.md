# コードレビュー レポート

**日付**: 2026-06-12  
**対象ブランチ**: fix/ui-bottom-nav-padding  
**レビュアー**: Claude Sonnet 4.6

---

## 重大：セキュリティ・データ保護

### 1. `notify-line` Edge Function に呼び出し元の検証がない
`supabase/functions/notify-line/index.ts:235` は cron から anon key で呼ばれる設計だが、anon key はクライアントバンドルに埋め込まれた公開情報。誰でもこの関数を任意の回数叩けて、全ユーザーへの通知を勝手に発火できる。LINE 無料枠（月200通）の枯渇やスパムに直結するため、cron 専用のシークレットヘッダー検証を入れるべき。

### 2. メインテーブルのスキーマ・RLS ポリシーがリポジトリにない
`supabase/` には `task_lists` と `line_link_tokens` の RLS 定義しかなく、肝心の `tasks` / `scheduled_tasks` / `events` / `settings` の CREATE TABLE と RLS ポリシーが存在しない。一方で `src/lib/supabaseDb.ts:234` 以降の `updateTask` / `deleteTask` / `deleteScheduledTask` などは `user_id` フィルタなしで `id` だけを条件に更新・削除しており、**安全性が完全に RLS 頼み**。その RLS が repo で検証できない状態は危険（RLS が漏れていれば他人のタスクを UUID 指定で消せる）。

### 3. クライアントから LINE トークンを使う前提のデッドコード
`src/lib/lineNotification.ts` はチャンネルアクセストークン（秘密情報）を引数に取りブラウザから LINE API を直接叩く実装。現在どこからも呼ばれていないが、トークンをクライアントに渡す前提のコードが残っているのは事故の元。そもそも CORS で動かない。削除すべき。

---

## 高：データ整合性のバグ

### 4. React Query のキャッシュがユーザーを区別しない
`src/hooks/useSupabaseQuery.ts:13` のクエリキーは `['tasks']` 等で `user.id` を含まず、ログアウト時に `queryClient.clear()` も呼んでいない。同一ブラウザでアカウントを切り替えると（ゲスト→Google など）、staleTime の5分間は**前のユーザーのデータが表示され得る**。

### 5. 楽観的更新の ID 不一致
`src/hooks/useSupabaseQuery.ts:270` の `onMutate` と同:225 の `mutationFn` がそれぞれ別の `crypto.randomUUID()` で ScheduledTask を作るため、キャッシュと DB で ID が食い違う。invalidate で最終的に収束するが、その間の完了トグルや削除は存在しない ID を操作して空振りする。

### 6. イベントに ID がなく「開始時刻＋タイトル」で同一性を判定
`src/App.tsx:589` の編集・削除は `start.getTime() && title` の一致で対象を特定するため、同名・同時刻のイベントが複数あると巻き添えで書き換わる。`deduplicateEvents` メソッドの存在自体が、この設計で過去に重複バグが起きた証拠。`WorkEvent` に ID を持たせるべき。

### 7. インポートが非トランザクションで「全削除→1件ずつ insert」
`src/lib/supabaseDb.ts:538` は既存タスクを全削除した後、for ループで1件ずつ `addTask` する。途中でネットワークが切れると**元データが消えて復元不能**になる。バッチ upsert にして、削除は成功後に行うべき。

### 8. リスト並び替えが `created_at` の入れ替えで実装
`src/App.tsx:60` は順序変更のために作成日時という事実データを破壊している。`sort_order` カラムを追加するのが正道。

### 9. 月次繰り返しの月末処理が未実装
`src/lib/scheduler.ts:49` では `dayOfMonth` の扱いをコメントで悩んだまま放置（1/31 → 2/28 → 3/28 とずれていく）。`biweekly` も `interval` を無視して固定2週。

---

## 中：パフォーマンス・正しさ

### 10. 全 DB メソッドが毎回 `supabase.auth.getUser()` を呼ぶ
`getUser()` は auth サーバーへのネットワーク往復。初期ロードの5クエリそれぞれに余計な往復が乗っている。ローカルのセッションから user を取る `getSession()` で十分。

### 11. `Accept-Encoding` の手動設定は無意味
`src/lib/supabase.ts:47` の fetch ラッパーはこのヘッダーのために存在するが、`Accept-Encoding` はブラウザの forbidden header で設定できない。「圧縮を有効化」というコメントごと誤りで、ラッパー全体が削除できる。

### 12. Google Calendar のページネーション未対応
`src/lib/googleCalendar.ts:62` は `maxResults: 500` で1回取得するだけで、型定義にある `nextPageToken` を使っていない。過去1年＋未来3ヶ月の範囲では500件を超えるユーザーのイベントが**黙って欠落**する。

### 13. 完了タスク一括削除が N+1
`src/App.tsx:325` は for ループで1件ずつ削除し、各削除が再スケジュールを誘発し得る。

---

## 低：コード品質・リポジトリ衛生

- **デバッグログの残骸**: 本番コードに `console.log` が37箇所。Vite の `esbuild.drop` で落とすか削除を。
- **巨大コンポーネント**: `src/components/Settings.tsx`（933行）、`src/App.tsx`（704行）。特に App.tsx 内のイベント編集モーダルはインライン style ベタ書きで180行あり、ダークモード対応も漏れている（`background: 'white'` 固定）。
- **Edge Functions が全部 `@ts-nocheck`**: 4ファイル1,200行が型チェック放棄状態。
- **コミットすべきでないファイルが追跡されている**: `supabase/.temp/`（project-ref 含む）、`dev-dist/`、学習用メモの `index.js`、AI とのチャットログ `docs/chat-history.md` など。`.gitignore` に追加して `git rm --cached` を。
- **テストの偏り**: scheduler / eventDiff / Settings のみ。最も複雑でバグの温床になっている `useSupabaseQuery` の楽観的更新ロジックにテストがない。

---

## 優先度まとめ

| 優先度 | 項目 | 場所 |
|--------|------|------|
| 🔴 最高 | notify-line の認可不備 | supabase/functions/notify-line |
| 🔴 最高 | RLS 定義のリポジトリ管理 | supabase/*.sql |
| 🔴 最高 | インポートのデータ喪失リスク | src/lib/supabaseDb.ts:538 |
| 🔴 最高 | ユーザー切替時のキャッシュ漏れ | src/hooks/useSupabaseQuery.ts |
| 🟠 高 | 楽観的更新の ID 不一致 | src/hooks/useSupabaseQuery.ts |
| 🟠 高 | イベント ID 欠如 | src/types/index.ts, src/App.tsx |
| 🟠 高 | LINE クライアント直接呼び出しのデッドコード削除 | src/lib/lineNotification.ts |
| 🟡 中 | getUser() → getSession() 最適化 | src/lib/supabaseDb.ts |
| 🟡 中 | Google Calendar ページネーション | src/lib/googleCalendar.ts |
| 🟢 低 | console.log 削除 | 全体 |
| 🟢 低 | .gitignore 整備 | .gitignore |
