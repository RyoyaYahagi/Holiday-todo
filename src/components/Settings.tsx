import React, { useState, type ChangeEvent } from 'react';
import type { AppSettings, WorkEvent, TaskList as TaskListType } from '../types';
import { DEFAULT_LIST_COLORS } from '../types';
import { IcsParser } from '../lib/icsParser';
import { GoogleCalendarClient } from '../lib/googleCalendar';
import { sendLineTestNotification } from '../lib/lineNotification';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, type Theme } from '../hooks/useTheme';

interface SettingsProps {
    settings: AppSettings;
    onUpdateSettings: (s: AppSettings) => void;
    onSaveEvents: (events: WorkEvent[]) => void;
    onNavigateToCalendar?: () => void;
    onShowTutorial?: () => void;
    onShowHelp?: () => void;
    // リスト管理
    taskLists?: TaskListType[];
    onAddList?: (list: TaskListType) => void;
    onEditList?: (list: TaskListType) => void;
    onDeleteList?: (id: string) => void;
    onReorderList?: (listId: string, direction: 'up' | 'down') => void;
}

export const Settings: React.FC<SettingsProps> = ({
    settings,
    onUpdateSettings,
    onSaveEvents,
    onNavigateToCalendar,
    onShowTutorial,
    onShowHelp,
    taskLists = [],
    onAddList,
    onEditList,
    onDeleteList,
    onReorderList
}) => {
    const { providerToken, signInWithGoogle } = useAuth();
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
    const [importStatus, setImportStatus] = useState<string>('');
    const [webhookTestStatus, setWebhookTestStatus] = useState<string>('');
    const [saveStatus, setSaveStatus] = useState<string>('');
    const [showIcsHelp, setShowIcsHelp] = useState(false);
    const [showLineHelp, setShowLineHelp] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [googleSyncStatus, setGoogleSyncStatus] = useState<string>('');
    const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);
    // テーマ設定
    const { theme, setTheme } = useTheme();

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

    const handleLineNotificationTest = async () => {
        const token = localSettings.lineChannelAccessToken;
        const userId = localSettings.lineUserId;

        if (!token) {
            setWebhookTestStatus('❌ チャンネルアクセストークンを入力してください');
            return;
        }

        if (!userId) {
            setWebhookTestStatus('❌ ユーザーIDを入力してください');
            return;
        }

        // ユーザーID形式のバリデーション（Uで始まる33文字）
        if (!/^U[a-f0-9]{32}$/i.test(userId)) {
            setWebhookTestStatus('❌ ユーザーIDの形式が正しくありません（Uで始まる33文字）');
            return;
        }

        setWebhookTestStatus('送信中...');
        const result = await sendLineTestNotification(token, userId);
        setWebhookTestStatus(result ? '✅ 送信成功！LINEを確認してください' : '❌ 送信失敗 (設定を確認してください)');
    };

    return (
        <div className="settings-container">

            {/* カレンダー読み込みセクション */}
            <section className="settings-section">
                <h3>📅 予定表の読み込み</h3>
                <p className="description">
                    Googleカレンダーから予定を読み込み、休日を自動判定してタスクをスケジューリングします。
                </p>

                <div style={{ marginTop: '1rem' }}>
                    <button
                        className="btn-primary"
                        onClick={handleGoogleCalendarSync}
                        disabled={isGoogleSyncing}
                        style={{ background: '#4285f4' }}
                    >
                        {isGoogleSyncing ? '🔄 同期中...' : '📅 Googleカレンダーから同期'}
                    </button>
                </div>
                {googleSyncStatus && <p className="status-msg">{googleSyncStatus}</p>}
                <p className="description" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    ※ Googleカレンダー同期ができない場合は「その他」から.icsファイルを読み込んでください。
                </p>
            </section>

            {/* リスト管理セクション */}
            {onAddList && (
                <section className="settings-section">
                    <h3>📋 タスクリスト管理</h3>
                    <p className="description">
                        タスクをリストに分けて整理できます。
                    </p>

                    {/* リスト一覧 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                        {taskLists.map(list => (
                            <div
                                key={list.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    borderLeft: `4px solid ${list.color}`
                                }}
                            >
                                <span style={{ flex: 1, fontWeight: list.isDefault ? 'bold' : 'normal' }}>
                                    {list.name}
                                    {list.isDefault && <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>(デフォルト)</span>}
                                </span>
                                {/* 並び替えボタン */}
                                {onReorderList && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                console.log('[Settings] ▲ clicked for:', list.id);
                                                onReorderList(list.id, 'up');
                                            }}
                                            disabled={taskLists.indexOf(list) === 0}
                                            style={{
                                                padding: '0.2rem 0.4rem',
                                                fontSize: '0.8rem',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px',
                                                background: 'var(--bg-secondary)',
                                                cursor: taskLists.indexOf(list) === 0 ? 'not-allowed' : 'pointer',
                                                opacity: taskLists.indexOf(list) === 0 ? 0.4 : 1
                                            }}
                                        >
                                            ▲
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                console.log('[Settings] ▼ clicked for:', list.id);
                                                onReorderList(list.id, 'down');
                                            }}
                                            disabled={taskLists.indexOf(list) === taskLists.length - 1}
                                            style={{
                                                padding: '0.2rem 0.4rem',
                                                fontSize: '0.8rem',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px',
                                                background: 'var(--bg-secondary)',
                                                cursor: taskLists.indexOf(list) === taskLists.length - 1 ? 'not-allowed' : 'pointer',
                                                opacity: taskLists.indexOf(list) === taskLists.length - 1 ? 0.4 : 1
                                            }}
                                        >
                                            ▼
                                        </button>
                                    </>
                                )}
                                <button
                                    onClick={() => onEditList?.(list)}
                                    className="btn-secondary"
                                    style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                                >
                                    編集
                                </button>
                                {!list.isDefault && onDeleteList && (
                                    <button
                                        onClick={() => {
                                            if (window.confirm(`リスト「${list.name}」を削除しますか？\nこのリストに属するタスクはデフォルトリストに移動します。`)) {
                                                onDeleteList(list.id);
                                            }
                                        }}
                                        style={{
                                            padding: '0.3rem 0.6rem',
                                            fontSize: '0.8rem',
                                            border: 'none',
                                            borderRadius: '4px',
                                            backgroundColor: '#ff3b30',
                                            color: 'white',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        削除
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* 新規リスト追加ボタン */}
                    <button
                        className="btn-primary"
                        style={{ padding: '0.6rem 1rem', width: '100%' }}
                        onClick={() => {
                            const name = window.prompt('新しいリスト名を入力してください:');
                            if (name?.trim()) {
                                const newList: TaskListType = {
                                    id: crypto.randomUUID(),
                                    name: name.trim(),
                                    color: DEFAULT_LIST_COLORS[taskLists.length % DEFAULT_LIST_COLORS.length],
                                    isDefault: false,
                                    createdAt: Date.now()
                                };
                                onAddList(newList);
                            }
                        }}
                    >
                        + 新しいリストを追加
                    </button>
                </section>
            )}

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
                    <label>日勤後のタスク開始時間</label>
                    <p className="description" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        日勤や休みの日に、タスクを開始する時間
                    </p>
                    <select
                        value={localSettings.startTimeMorning}
                        onChange={(e) => setLocalSettings({ ...localSettings, startTimeMorning: parseInt(e.target.value) })}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg, var(--card-bg))', color: 'var(--text-primary)', marginTop: '0.3rem' }}
                    >
                        {Array.from({ length: 24 }, (_, i) => i).map(h => (
                            <option key={h} value={h}>{h}:00</option>
                        ))}
                    </select>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>夜勤明けのタスク開始時間</label>
                    <p className="description" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        夜勤明けの日に、タスクを開始する時間
                    </p>
                    <select
                        value={localSettings.startTimeAfternoon}
                        onChange={(e) => setLocalSettings({ ...localSettings, startTimeAfternoon: parseInt(e.target.value) })}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg, var(--card-bg))', color: 'var(--text-primary)', marginTop: '0.3rem' }}
                    >
                        {Array.from({ length: 24 }, (_, i) => i).map(h => (
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

            {/* LINE通知セクション */}
            <section className="settings-section">
                <h3>💬 LINE 通知設定</h3>
                <p className="description">
                    休日の前日夜やタスク開始前に、LINEへ通知を送信します。
                </p>

                <button
                    className="btn-help"
                    onClick={() => setShowLineHelp(!showLineHelp)}
                >
                    {showLineHelp ? '▲ 説明を閉じる' : '▼ LINE Bot設定方法'}
                </button>

                {showLineHelp && (
                    <div className="help-box">
                        <h4>🔧 LINE Bot作成手順</h4>
                        <ol>
                            <li><a href="https://developers.line.biz/console/" target="_blank" rel="noopener noreferrer">LINE Developers Console</a>にログイン</li>
                            <li>「新規プロバイダー作成」（初回のみ）</li>
                            <li>「新規チャンネル作成」→「Messaging API」を選択</li>
                            <li>チャンネル情報を入力して作成</li>
                            <li>「Messaging API設定」タブで「チャンネルアクセストークン（長期）」を発行</li>
                            <li>ボットをLINEで友達追加</li>
                            <li>「チャンネル基本設定」で「あなたのユーザーID」を確認</li>
                        </ol>

                        <h4>📢 通知タイミング</h4>
                        <ul>
                            <li><strong>前日 21:00</strong> - 翌日が休日の場合、タスク一覧を通知</li>
                            <li><strong>タスク開始30分前</strong> - 各タスクの開始直前に通知</li>
                        </ul>
                        <p className="note">💡 ユーザーIDは「U」で始まる33文字の文字列です</p>
                    </div>
                )}

                <div className="form-group">
                    <label>チャンネルアクセストークン</label>
                    <input
                        type="password"
                        value={localSettings.lineChannelAccessToken}
                        onChange={(e) => setLocalSettings({ ...localSettings, lineChannelAccessToken: e.target.value })}
                        placeholder="xxxxxxxxxx..."
                        style={{ fontFamily: 'monospace' }}
                    />
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                    <label>ユーザーID</label>
                    <input
                        type="text"
                        value={localSettings.lineUserId}
                        onChange={(e) => setLocalSettings({ ...localSettings, lineUserId: e.target.value })}
                        placeholder="Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        style={{ fontFamily: 'monospace' }}
                    />
                </div>
                <button onClick={handleLineNotificationTest} className="btn-secondary" style={{ marginTop: '0.5rem' }}>🔔 通知テスト</button>
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
                            style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--input-bg, var(--card-bg))', color: 'var(--text-primary)', width: '90px' }}
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

            {/* その他セクション（テーマ設定、ICSファイル読み込み） */}
            <section className="settings-section">
                <div
                    className="section-header-toggle"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <h3>⚙️ その他</h3>
                    <span style={{ fontSize: '1.2rem' }}>{showAdvanced ? '▲' : '▼'}</span>
                </div>

                {showAdvanced && (
                    <div className="advanced-content fade-in" style={{ marginTop: '1rem' }}>
                        {/* テーマ設定 */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <h4>🎨 テーマ設定</h4>
                            <p className="description">画面の明るさを切り替えます。</p>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                                {[
                                    { value: 'system' as Theme, label: '自動', icon: '🖥️' },
                                    { value: 'light' as Theme, label: 'ライト', icon: '☀️' },
                                    { value: 'dark' as Theme, label: 'ダーク', icon: '🌙' }
                                ].map(opt => (
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
                        </div>

                        {/* ICSファイル読み込み */}
                        <div>
                            <h4>📁 予定表ファイルの読み込み</h4>
                            <p className="description">
                                Googleカレンダー同期ができない場合は、ここから.icsファイルを読み込んでください。
                            </p>
                            <button
                                className="btn-help"
                                onClick={() => setShowIcsHelp(!showIcsHelp)}
                                style={{ marginTop: '0.5rem' }}
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
                                        <li><strong>夜勤</strong> - 次の日が空くパターン</li>
                                        <li><strong>日勤</strong> - 朝から夕方まで予定あり</li>
                                        <li><strong>休み</strong> / <strong>休日</strong> - 終日タスク可能</li>
                                    </ul>
                                </div>
                            )}

                            <div style={{ marginTop: '1rem' }}>
                                <label className="btn-secondary file-label">
                                    📁 .icsファイルを選択
                                    <input type="file" accept=".ics" onChange={handleFileUpload} style={{ display: 'none' }} />
                                </label>
                                {importStatus && <p className="status-msg" style={{ marginTop: '0.5rem' }}>{importStatus}</p>}
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
};
