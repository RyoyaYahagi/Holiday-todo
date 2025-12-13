import React, { useState, type ChangeEvent } from 'react';
import type { AppSettings, WorkEvent } from '../types';
import { IcsParser } from '../lib/icsParser';
import { sendDiscordNotification } from '../lib/discordWebhook';

interface SettingsProps {
    settings: AppSettings;
    onUpdateSettings: (s: AppSettings) => void;
    onSaveEvents: (events: WorkEvent[]) => void;
    onExport: () => Promise<string>;
    onImport: (json: string) => Promise<void>;
    onNavigateToCalendar?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
    settings,
    onUpdateSettings,
    onSaveEvents,
    onExport,
    onImport,
    onNavigateToCalendar
}) => {
    const [importStatus, setImportStatus] = useState<string>('');
    const [webhookTestStatus, setWebhookTestStatus] = useState<string>('');
    const [showIcsHelp, setShowIcsHelp] = useState(false);
    const [showDiscordHelp, setShowDiscordHelp] = useState(false);

    const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                try {
                    console.log('ICS読み込み開始: ファイルサイズ =', content.length, 'bytes');
                    const parser = new IcsParser(content);
                    const events = parser.parse();
                    console.log('ICSパース完了: イベント数 =', events.length);

                    // イベントタイプ別にカウント
                    const typeCount = { '夜勤': 0, '日勤': 0, '休み': 0, 'その他': 0 };
                    events.forEach(ev => {
                        typeCount[ev.eventType]++;
                    });
                    console.log('イベントタイプ別:', typeCount);

                    onSaveEvents(events);

                    // 読み込み成功後、カレンダー画面に遷移してデータを確認できるようにする
                    if (onNavigateToCalendar) {
                        onNavigateToCalendar();
                    }
                } catch (err) {
                    console.error('ICSパースエラー:', err);
                    setImportStatus('❌ エラー: ファイルの読み込みに失敗しました');
                }
            }
        };
        reader.onerror = () => {
            console.error('FileReaderエラー:', reader.error);
            alert('ファイルの読み取りに失敗しました');
            setImportStatus('❌ エラー: ファイルの読み取りに失敗しました');
        };
        reader.readAsText(file);
    };

    const handleWebhookTest = async () => {
        if (!settings.discordWebhookUrl) {
            setWebhookTestStatus('❌ Webhook URLを入力してください');
            return;
        }
        setWebhookTestStatus('送信中...');
        const result = await sendDiscordNotification(
            settings.discordWebhookUrl,
            [{ id: 'test', taskId: 'test', title: 'テストタスク', priority: 5, createdAt: 0, scheduledTime: Date.now(), isCompleted: false }],
            '【テスト通知】これはテスト通知です。'
        );
        setWebhookTestStatus(result ? '✅ 送信成功！Discordを確認してください' : '❌ 送信失敗 (URLを確認してください)');
    };

    const handleExport = async () => {
        const json = await onExport();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `holiday-todo-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleJsonImport = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target?.result as string;
            if (content) {
                try {
                    await onImport(content);
                    alert("インポートが完了しました。画面を更新してください。");
                    window.location.reload();
                } catch (err) {
                    alert('インポート失敗');
                    console.error(err);
                }
            }
        };
        reader.readAsText(file);
    };

    return (
        <div className="settings-container">
            {/* カレンダー読み込みセクション */}
            <section className="settings-section">
                <h3>📅 勤務カレンダー読み込み</h3>
                <p className="description">
                    勤務表の .ics ファイルを読み込むと、休日を自動判定してタスクをスケジューリングします。
                </p>

                <button
                    className="btn-help"
                    onClick={() => setShowIcsHelp(!showIcsHelp)}
                >
                    {showIcsHelp ? '▲ 説明を閉じる' : '▼ .icsファイルの取得方法'}
                </button>

                {showIcsHelp && (
                    <div className="help-box">
                        <h4>📱 Googleカレンダーの場合</h4>
                        <ol>
                            <li>PCで <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer">Googleカレンダー</a> を開く</li>
                            <li>右上の ⚙️ → 「設定」をクリック</li>
                            <li>左メニューからカレンダーを選択</li>
                            <li>「カレンダーをエクスポート」をクリック</li>
                            <li>ダウンロードした .ics ファイルをここでアップロード</li>
                        </ol>

                        <h4>📝 イベント名の書き方</h4>
                        <p>カレンダーのイベント名は以下のいずれかにしてください：</p>
                        <ul>
                            <li><strong>夜勤</strong> - 夜間勤務</li>
                            <li><strong>日勤</strong> - 日中勤務</li>
                            <li><strong>休み</strong> - 休日</li>
                        </ul>

                        <h4>🎯 休日の判定ルール</h4>
                        <ul>
                            <li>「休み」イベントがある日 → 休日</li>
                            <li>イベントがない日 → 休日</li>
                        </ul>
                    </div>
                )}

                <div className="file-upload-area">
                    <label className="btn-primary file-label">
                        📁 .icsファイルを選択
                        <input type="file" accept=".ics" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                </div>
                {importStatus && <p className="status-msg">{importStatus}</p>}
            </section>

            {/* Discord通知セクション */}
            <section className="settings-section">
                <h3>💬 Discord 通知設定</h3>
                <p className="description">
                    休日の前日夜やタスク開始前に、Discordへ通知を送信します。
                </p>

                <button
                    className="btn-help"
                    onClick={() => setShowDiscordHelp(!showDiscordHelp)}
                >
                    {showDiscordHelp ? '▲ 説明を閉じる' : '▼ Webhook URLの取得方法'}
                </button>

                {showDiscordHelp && (
                    <div className="help-box">
                        <h4>🔧 Webhook URLの作成手順</h4>
                        <ol>
                            <li>Discordアプリを開く</li>
                            <li>通知を受け取りたいサーバーで、サーバー名をクリック</li>
                            <li>「サーバー設定」→「連携サービス」→「ウェブフック」</li>
                            <li>「新しいウェブフック」をクリック</li>
                            <li>名前を設定（例：Holiday Todo）</li>
                            <li>通知を送る<strong>チャンネル</strong>を選択</li>
                            <li>「ウェブフックURLをコピー」をクリック</li>
                            <li>コピーしたURLを下の入力欄に貼り付け</li>
                        </ol>

                        <h4>📢 通知タイミング</h4>
                        <ul>
                            <li><strong>前日 21:00</strong> - 翌日が休日の場合、タスク一覧を通知</li>
                            <li><strong>タスク開始30分前</strong> - 各タスクの開始直前に通知</li>
                        </ul>
                        <p className="note">⚠️ 通知はこのアプリをブラウザで開いている間のみ動作します</p>
                    </div>
                )}

                <div className="form-group">
                    <label>Webhook URL</label>
                    <input
                        type="text"
                        value={settings.discordWebhookUrl}
                        onChange={(e) => onUpdateSettings({ ...settings, discordWebhookUrl: e.target.value })}
                        placeholder="https://discord.com/api/webhooks/..."
                    />
                </div>
                <button onClick={handleWebhookTest} className="btn-secondary">🔔 通知テスト</button>
                {webhookTestStatus && <p className="status-msg">{webhookTestStatus}</p>}

                <div className="checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.notifyOnDayBefore}
                            onChange={(e) => onUpdateSettings({ ...settings, notifyOnDayBefore: e.target.checked })}
                        />
                        前日 {settings.notifyDayBeforeTime} に通知する
                    </label>
                </div>
                <div className="checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.notifyBeforeTask}
                            onChange={(e) => onUpdateSettings({ ...settings, notifyBeforeTask: e.target.checked })}
                        />
                        タスク開始 {settings.notifyBeforeTaskMinutes}分前に通知する
                    </label>
                </div>
            </section>

            {/* データ管理セクション */}
            <section className="settings-section">
                <h3>💾 データ管理</h3>
                <p className="description">
                    タスクや設定をバックアップしたり、別の端末に移行できます。
                </p>
                <div className="data-actions">
                    <button onClick={handleExport} className="btn-primary">📤 バックアップ（エクスポート）</button>
                    <div className="import-area">
                        <label className="btn-secondary">
                            📥 復元（インポート）
                            <input type="file" accept=".json" onChange={handleJsonImport} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>
            </section>
        </div>
    );
};
