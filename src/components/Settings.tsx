import React, { useState, type ChangeEvent } from 'react';
import type { AppSettings, WorkEvent } from '../types';
import { IcsParser } from '../lib/icsParser';
import { GoogleCalendarClient } from '../lib/googleCalendar';
import { sendDiscordNotification } from '../lib/discordWebhook';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, type Theme } from '../hooks/useTheme';

interface SettingsProps {
    settings: AppSettings;
    onUpdateSettings: (s: AppSettings) => void;
    onSaveEvents: (events: WorkEvent[]) => void;
    onExport: () => Promise<string>;
    onImport: (json: string) => Promise<void>;
    onNavigateToCalendar?: () => void;
    onShowTutorial?: () => void;
    onShowHelp?: () => void;
}

export const Settings: React.FC<SettingsProps> = ({
    settings,
    onUpdateSettings,
    onSaveEvents,
    onExport,
    onImport,
    onNavigateToCalendar,
    onShowTutorial,
    onShowHelp
}) => {
    const { providerToken, signInWithGoogle } = useAuth();
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [importStatus, setImportStatus] = useState<string>('');
    const [webhookTestStatus, setWebhookTestStatus] = useState<string>('');
    const [saveStatus, setSaveStatus] = useState<string>('');
    const [showIcsHelp, setShowIcsHelp] = useState(false);
    const [showDiscordHelp, setShowDiscordHelp] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [googleSyncStatus, setGoogleSyncStatus] = useState<string>('');
    const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);

    // テーマ切り替えコンポーネント
    const ThemeSelector: React.FC = () => {
        const { theme, setTheme } = useTheme();
        const themeOptions: { value: Theme; label: string; icon: string }[] = [
            { value: 'light', label: 'ライト', icon: '☀️' },
            { value: 'dark', label: 'ダーク', icon: '🌙' },
            { value: 'system', label: 'システム', icon: '💻' }
        ];

        return (
            <section className="settings-section">
                <h3>🎨 テーマ設定</h3>
                <p className="description">
                    画面の明るさを切り替えます。
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {themeOptions.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => setTheme(opt.value)}
                            className={theme === opt.value ? 'btn-primary' : 'btn-secondary'}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.9rem'
                            }}
                        >
                            <span>{opt.icon}</span>
                            <span>{opt.label}</span>
                        </button>
                    ))}
                </div>
            </section>
        );
    };

    /**
     * Googleカレンダーからイベントを同期
     */
    const handleGoogleCalendarSync = async () => {
        if (!providerToken) {
            // トークンがない場合は再ログインが必要
            setGoogleSyncStatus('⚠️ カレンダーアクセス権限がありません。再ログインしてください。');
            setTimeout(async () => {
                if (window.confirm('Googleカレンダーにアクセスするには再ログインが必要です。続けますか？')) {
                    await signInWithGoogle();
                }
            }, 100);
            return;
        }

        setIsGoogleSyncing(true);
        setGoogleSyncStatus('🔄 Googleカレンダーから取得中...');

        try {
            const client = new GoogleCalendarClient(providerToken);
            const events = await client.fetchEvents();

            // イベントタイプ別にカウント
            const typeCount: Record<string, number> = { '夜勤': 0, '日勤': 0, '休み': 0, 'その他': 0 };
            events.forEach(ev => {
                if (typeCount[ev.eventType] !== undefined) {
                    typeCount[ev.eventType]++;
                }
            });

            const summary = Object.entries(typeCount)
                .filter(([, count]) => count > 0)
                .map(([type, count]) => `${type}: ${count}件`)
                .join('、');

            onSaveEvents(events);
            setGoogleSyncStatus(`✅ ${events.length}件のイベントを取得しました（${summary || '予定なし'}）`);

            // カレンダータブに移動を提案
            if (onNavigateToCalendar && events.length > 0) {
                setTimeout(() => {
                    if (window.confirm('カレンダーで予定を確認しますか？')) {
                        onNavigateToCalendar();
                    }
                }, 500);
            }
        } catch (error) {
            console.error('[Settings] Googleカレンダー同期エラー:', error);
            if (error instanceof Error && error.message.includes('401')) {
                setGoogleSyncStatus('⚠️ アクセストークンが無効です。再ログインしてください。');
            } else {
                setGoogleSyncStatus('❌ 同期に失敗しました。再度お試しください。');
            }
        } finally {
            setIsGoogleSyncing(false);
        }
    };

    // settingsプロップが変更されたらローカルステートも更新（外部からの変更を反映）
    React.useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleSave = () => {
        onUpdateSettings(localSettings);
        setSaveStatus('✅ 設定を保存しました');
        setTimeout(() => setSaveStatus(''), 3000);
    };

    const handleReset = () => {
        if (window.confirm('変更を破棄して元の設定に戻しますか？')) {
            setLocalSettings(settings);
            setSaveStatus('↩️ 変更を破棄しました');
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

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
                    const typeCount: Record<string, number> = { '夜勤': 0, '日勤': 0, '休み': 0, 'その他': 0, 'スケジュール除外': 0, 'スケジュール対象': 0 };
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
        if (!localSettings.discordWebhookUrl) {
            setWebhookTestStatus('❌ Webhook URLを入力してください');
            return;
        }
        setWebhookTestStatus('送信中...');
        const result = await sendDiscordNotification(
            localSettings.discordWebhookUrl,
            [{ id: 'test', taskId: 'test', title: 'テストタスク', priority: 5, createdAt: 0, scheduledTime: Date.now(), isCompleted: false, scheduleType: 'priority' }],
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

        // Reset input value to allow re-selecting the same file if needed
        e.target.value = '';

        if (!window.confirm("⚠️ 警告: データをインポートすると、現在のすべてのデータ（タスク、イベント、設定など）が完全に上書きされ、消去されます。\n\n本当に実行しますか？")) {
            return;
        }

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
            {/* テーマ設定 */}
            <ThemeSelector />

            {/* チュートリアル・ヘルプ */}
            {(onShowTutorial || onShowHelp) && (
                <section className="settings-section">
                    <h3>📚 ヘルプ & ガイド</h3>
                    <p className="description">
                        アプリの使い方を確認できます。
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {onShowTutorial && (
                            <button onClick={onShowTutorial} className="btn-secondary">
                                📖 チュートリアル
                            </button>
                        )}
                        {onShowHelp && (
                            <button onClick={onShowHelp} className="btn-secondary">
                                ❓ 詳細ヘルプ
                            </button>
                        )}
                    </div>
                </section>
            )}

            {/* カレンダー読み込みセクション */}
            <section className="settings-section">
                <h3>📅 予定表の読み込み</h3>
                <p className="description">
                    予定表の .ics ファイルを読み込むと、休日を自動判定してタスクをスケジューリングします。
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
                            <li><strong>夜勤</strong> - 夜間の予定</li>
                            <li><strong>日勤</strong> - 日中の予定</li>
                            <li><strong>休み</strong> - 休日（タスクを予定可能）</li>
                        </ul>

                        <h4>🎯 休日の判定ルール</h4>
                        <ul>
                            <li>「休み」イベントがある日 → 休日</li>
                            <li>イベントがない日 → 休日</li>
                        </ul>
                    </div>
                )}

                <div className="file-upload-area" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label className="btn-primary file-label">
                        📁 .icsファイルを選択
                        <input type="file" accept=".ics" onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                    <span style={{ color: '#888', fontSize: '0.9rem' }}>または</span>
                    <button
                        className="btn-primary"
                        onClick={handleGoogleCalendarSync}
                        disabled={isGoogleSyncing}
                        style={{ background: '#4285f4' }}
                    >
                        {isGoogleSyncing ? '🔄 同期中...' : '📅 Googleカレンダーから同期'}
                    </button>
                </div>
                {importStatus && <p className="status-msg">{importStatus}</p>}
                {googleSyncStatus && <p className="status-msg">{googleSyncStatus}</p>}
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
                        value={localSettings.discordWebhookUrl}
                        onChange={(e) => setLocalSettings({ ...localSettings, discordWebhookUrl: e.target.value })}
                        placeholder="https://discord.com/api/webhooks/..."
                    />
                </div>
                <button onClick={handleWebhookTest} className="btn-secondary">🔔 通知テスト</button>
                {webhookTestStatus && <p className="status-msg">{webhookTestStatus}</p>}

                <div className="checkbox-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={localSettings.notifyOnDayBefore}
                            onChange={(e) => setLocalSettings({ ...localSettings, notifyOnDayBefore: e.target.checked })}
                        />
                        <span>前日</span>
                        <input
                            type="time"
                            value={localSettings.notifyDayBeforeTime}
                            onChange={(e) => setLocalSettings({ ...localSettings, notifyDayBeforeTime: e.target.value })}
                            disabled={!localSettings.notifyOnDayBefore}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc', width: '90px' }}
                        />
                        <span>に通知</span>
                    </label>
                </div>
                <div className="checkbox-group">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={localSettings.notifyBeforeTask}
                            onChange={(e) => setLocalSettings({ ...localSettings, notifyBeforeTask: e.target.checked })}
                        />
                        <span>タスク開始</span>
                        <select
                            value={localSettings.notifyBeforeTaskMinutes}
                            onChange={(e) => setLocalSettings({ ...localSettings, notifyBeforeTaskMinutes: parseInt(e.target.value) })}
                            disabled={!localSettings.notifyBeforeTask}
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #ccc' }}
                        >
                            <option value={0}>0分前（開始時）</option>
                            <option value={5}>5分前</option>
                            <option value={10}>10分前</option>
                            <option value={15}>15分前</option>
                            <option value={30}>30分前</option>
                            <option value={45}>45分前</option>
                            <option value={60}>60分前</option>
                        </select>
                        <span>に通知</span>
                    </label>
                </div>

                <div className="action-buttons" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={handleReset} className="btn-secondary" style={{ padding: '0.5rem 1rem' }}>
                            ↩️ 元に戻す
                        </button>
                        <button onClick={handleSave} className="btn-primary" style={{ padding: '0.5rem 1.5rem', width: 'auto' }}>
                            💾 保存
                        </button>
                    </div>
                    {saveStatus && <p className="status-msg" style={{ color: '#4caf50', fontWeight: 'bold', fontSize: '0.9rem' }}>{saveStatus}</p>}
                </div>
            </section>

            {/* スケジュール設定セクション */}
            <section className="settings-section">
                <h3>⏰ スケジュール設定</h3>
                <p className="description">
                    タスクの自動スケジューリングに関する設定です。変更後は「保存」ボタンを押してください。
                </p>

                <div className="form-group">
                    <label>タスクの時間間隔</label>
                    <select
                        value={localSettings.scheduleInterval}
                        onChange={(e) => setLocalSettings({ ...localSettings, scheduleInterval: parseFloat(e.target.value) })}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginLeft: '10px' }}
                    >
                        <option value={0.5}>30分</option>
                        <option value={1}>1時間</option>
                        <option value={1.5}>1時間半</option>
                        <option value={2}>2時間</option>
                        <option value={2.5}>2時間半</option>
                        <option value={3}>3時間</option>
                        <option value={4}>4時間</option>
                        <option value={5}>5時間</option>
                        <option value={6}>6時間</option>
                    </select>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>午前の開始時間（日勤/休み）</label>
                    <select
                        value={localSettings.startTimeMorning}
                        onChange={(e) => setLocalSettings({ ...localSettings, startTimeMorning: parseInt(e.target.value) })}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginLeft: '10px' }}
                    >
                        {Array.from({ length: 12 }, (_, i) => i).map(h => (
                            <option key={h} value={h}>{h}:00</option>
                        ))}
                    </select>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>午後の開始時間（夜勤明けなど）</label>
                    <select
                        value={localSettings.startTimeAfternoon}
                        onChange={(e) => setLocalSettings({ ...localSettings, startTimeAfternoon: parseInt(e.target.value) })}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginLeft: '10px' }}
                    >
                        {Array.from({ length: 12 }, (_, i) => i + 12).map(h => (
                            <option key={h} value={h}>{h}:00</option>
                        ))}
                    </select>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>1日の最大タスク数</label>
                    <select
                        value={localSettings.maxTasksPerDay}
                        onChange={(e) => setLocalSettings({ ...localSettings, maxTasksPerDay: parseInt(e.target.value) })}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginLeft: '10px' }}
                    >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n}件</option>
                        ))}
                    </select>
                </div>

                <div className="section-divider" style={{ margin: '1.5rem 0', borderTop: '2px dashed #eee' }} />

                <div className="form-group">
                    <label>最大優先度 (1〜5)</label>
                    <select
                        value={localSettings.maxPriority || 5}
                        onChange={(e) => setLocalSettings({ ...localSettings, maxPriority: parseInt(e.target.value) })}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', marginLeft: '10px' }}
                    >
                        {[1, 2, 3, 4, 5].map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                    <p className="description" style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.2rem' }}>
                        タスクの優先度の選択肢を制限します。（例: 3に設定するとP1〜P3のみ選択可能）
                    </p>
                </div>

                <div className="action-buttons" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={handleReset} className="btn-secondary">
                            ↩️ 元に戻す
                        </button>
                        <button onClick={handleSave} className="btn-primary" style={{ padding: '0.8rem 2rem', fontSize: '1.1rem', width: 'auto' }}>
                            💾 設定を保存する
                        </button>
                    </div>
                    {saveStatus && <p className="status-msg" style={{ color: '#4caf50', fontWeight: 'bold' }}>{saveStatus}</p>}
                </div>
            </section>

            {/* 詳細設定セクション（データ管理など） */}
            <section className="settings-section">
                <div
                    className="section-header-toggle"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <h3>🔧 詳細設定 (データ管理)</h3>
                    <span style={{ fontSize: '1.2rem' }}>{showAdvanced ? '▲' : '▼'}</span>
                </div>

                {showAdvanced && (
                    <div className="advanced-content fade-in" style={{ marginTop: '1rem' }}>
                        <p className="description">
                            データのバックアップ（エクスポート）や復元（インポート）を行えます。
                            通常はクラウドに自動保存されるため操作不要です。
                        </p>
                        <div className="data-actions">
                            <button onClick={handleExport} className="btn-secondary">📤 バックアップ（ファイルに保存）</button>
                            <div className="import-area">
                                <label className="btn-secondary" style={{ backgroundColor: '#f0f0f0', color: '#333' }}>
                                    📥 復元（ファイルから読み込み）
                                    <input type="file" accept=".json" onChange={handleJsonImport} style={{ display: 'none' }} />
                                </label>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};
