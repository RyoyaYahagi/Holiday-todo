# Holiday Todo App

勤務表（.ics）に基づいて、休日にタスクを自動でスマートにスケジューリングする Todo アプリケーションです。
不規則なシフト勤務の方でも、「次の休みにやること」を効率的に管理・消化できるよう設計されています。

## ✨ 特徴

- **スマートスケジューリング**:
    - 優先度（P1〜P5）の高いタスクから順に、次の休日に自動で割り当てられます。
    - 1日のタスク数上限や開始時間を生活リズムに合わせて設定可能。
- **勤務表連携**:
    - Googleカレンダー等からエクスポートした `.ics` ファイルを読み込み、「夜勤」「日勤」「休み」を自動判定。
- **クラウド同期 (Supabase)**:
    - Googleアカウントでログインし、PC・スマホ間でデータを同期。
- **Discord通知**:
    - 休日の前日夜や、タスク開始直前にDiscordへリマインド通知を送信。
- **チュートリアル機能**:
    - 初回利用時に分かりやすいガイドを表示。いつでも設定画面から再確認可能。
- **PWA対応**:
    - アプリとしてインストール可能。

## 🛠 技術スタック

- **Frontend**: React (TypeScript), Vite
- **Backend/DB**: Supabase (Auth, Database, Realtime)
- **Deployment**: Vercel
- **Styling**: Vanilla CSS (with modern variables & responsiveness)

## 🚀 始め方 (開発者向け)

### 1. リポジトリのクローン
```bash
git clone https://github.com/RyoyaYahagi/todo.git
cd todo
npm install
```

### 2. 環境変数の設定
`.env.local` ファイルを作成し、Supabaseのプロジェクト情報を設定します。

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. 開発サーバー起動
```bash
npm run dev
```

### 4. ビルド
```bash
npm run build
```

## 📱 使い方

1. **ログイン**: Googleアカウントでサインインします。
2. **初期設定 (チュートリアル)**:
   - アプリの基本操作ガイドが表示されます。
3. **カレンダー読込**:
   - 「設定」タブ → 「勤務カレンダー読み込み」から `.ics` ファイルをアップロード。
   - イベント名に「夜勤」「日勤」「休み」を含むイベントが自動解析されます。
4. **タスク追加**:
   - 右下の「＋」ボタンからタスクを追加。優先度を設定すると、自動でスケジュールが組まれます。
5. **通知設定**:
   - Discord Webhook URLを設定すると、リマインダーを受け取れます。

## 📋 スケジューリングロジック

- **優先度順**: P5 (最高) 〜 P1 (最低) の順にスロットを確保。
- **休日判定**: 「休み」イベントがある日、またはイベントがない日を休日とみなします。
- **開始時間**:
    - 前日が「夜勤」の場合 → 午後スタート (例: 13:00)
    - それ以外 → 午前スタート (例: 08:00)
    - ※設定画面でカスタマイズ可能

## 🛡️ セキュリティ

- **RLS (Row Level Security)**: Supabase側で、ログインユーザー自身のデータにのみアクセスできるよう制限されています。
- **認証**: Supabase Auth (Google OAuth) を使用。

---

© 2025 RyoyaYahagi
