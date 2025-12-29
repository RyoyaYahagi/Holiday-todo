import React, { useState, useEffect, useCallback, type ChangeEvent } from 'react';
import type { AppSettings, WorkEvent, TaskList as TaskListType } from '../types';
import { DEFAULT_LIST_COLORS } from '../types';
import { IcsParser } from '../lib/icsParser';
import { GoogleCalendarClient } from '../lib/googleCalendar';
import { useAuth } from '../contexts/AuthContext';
import { useTheme, type Theme } from '../hooks/useTheme';
import { supabase } from '../lib/supabase';

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
    const [saveStatus, setSaveStatus] = useState<string>('');
    const [showIcsHelp, setShowIcsHelp] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [googleSyncStatus, setGoogleSyncStatus] = useState<string>('');
    const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);
    // テーマ設定
    const { theme, setTheme } = useTheme();

    // LINE連携用のstate
    const [linkToken, setLinkToken] = useState<string | null>(null);
    const [linkTokenExpiresAt, setLinkTokenExpiresAt] = useState<Date | null>(null);
    const [isGeneratingToken, setIsGeneratingToken] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState<number>(0);

    /**
     * LINE連携状態を確認（ポーリング）
     */
    const checkLinkStatus = useCallback(async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-line-token`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                if (data.linked && data.lineUserId) {
                    // 連携完了！設定を更新
                    setLocalSettings(prev => ({ ...prev, lineUserId: data.lineUserId }));
                    onUpdateSettings({ ...localSettings, lineUserId: data.lineUserId });
                    setLinkToken(null);
                    setLinkTokenExpiresAt(null);
                } else if (data.hasActiveToken && data.token) {
                    setLinkToken(data.token);
                    setLinkTokenExpiresAt(new Date(data.expiresAt));
                }
            }
        } catch (error) {
            console.error('LINE連携状態確認エラー:', error);
        }
    }, [localSettings, onUpdateSettings]);

    /**
     * リンクトークンを生成
     */
    const generateLinkToken = async () => {
        setIsGeneratingToken(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                alert('ログインが必要です');
                return;
            }

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-line-token`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (response.ok) {
                const data = await response.json();
                setLinkToken(data.token);
                setLinkTokenExpiresAt(new Date(data.expiresAt));
            } else {
                const error = await response.json();
                alert(error.error || 'トークン生成に失敗しました');
            }
        } catch (error) {
            console.error('トークン生成エラー:', error);
            alert('トークン生成に失敗しました');
        } finally {
            setIsGeneratingToken(false);
        }
    };

    /**
     * LINE連携を解除
     */
    const unlinkLine = () => {
        if (window.confirm('LINE連携を解除しますか？')) {
            setLocalSettings(prev => ({ ...prev, lineUserId: '' }));
            onUpdateSettings({ ...localSettings, lineUserId: '' });
            setSaveStatus('✅ LINE連携を解除しました');
            setTimeout(() => setSaveStatus(''), 3000);
        }
    };

    // ポーリング：トークン発行中は5秒ごとに連携状態を確認
    useEffect(() => {
        if (!linkToken || localSettings.lineUserId) return;

        const interval = setInterval(() => {
            checkLinkStatus();
        }, 5000);

        return () => clearInterval(interval);
    }, [linkToken, localSettings.lineUserId, checkLinkStatus]);

    // カウントダウン：トークンの残り有効時間を表示
    useEffect(() => {
        if (!linkTokenExpiresAt) {
            setRemainingSeconds(0);
            return;
        }

        const updateRemaining = () => {
            const remaining = Math.max(0, Math.floor((linkTokenExpiresAt.getTime() - Date.now()) / 1000));
            setRemainingSeconds(remaining);
            if (remaining === 0) {
                setLinkToken(null);
                setLinkTokenExpiresAt(null);
            }
        };

        updateRemaining();
        const interval = setInterval(updateRemaining, 1000);

        return () => clearInterval(interval);
    }, [linkTokenExpiresAt]);

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
                                                color: 'var(--text-primary)',
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
                                                color: 'var(--text-primary)',
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

            {/* 通知設定セクション */}
            <section className="settings-section">
                <h3>💬 通知設定</h3>
                <p className="description">
                    休日の前日夜やタスク開始前に、通知を送信します。
                </p>

                {/* 通知方法選択 */}
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label style={{ fontWeight: 'bold', marginBottom: '0.5rem', display: 'block' }}>通知方法</label>
                    <div style={{ display: 'flex', gap: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="notificationMethod"
                                value="line"
                                checked={localSettings.notificationMethod === 'line'}
                                onChange={() => setLocalSettings({ ...localSettings, notificationMethod: 'line' })}
                            />
                            <span>📱 LINE</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                            <input
                                type="radio"
                                name="notificationMethod"
                                value="discord"
                                checked={localSettings.notificationMethod === 'discord'}
                                onChange={() => setLocalSettings({ ...localSettings, notificationMethod: 'discord' })}
                            />
                            <span>💬 Discord</span>
                        </label>
                    </div>
                </div>

                {/* LINE設定（LINEが選択されている場合のみ表示） */}
                {localSettings.notificationMethod === 'line' && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '1.5rem',
                        background: 'var(--card-bg)',
                        borderRadius: '12px',
                        border: '1px solid var(--border-color)',
                        marginBottom: '1rem'
                    }}>
                        {/* 連携済みの場合 */}
                        {localSettings.lineUserId ? (
                            <>
                                <div style={{
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: '20px',
                                    background: 'rgba(76, 175, 80, 0.1)',
                                    border: '1px solid #4caf50',
                                    color: '#4caf50',
                                    fontWeight: 'bold',
                                    fontSize: '0.9rem'
                                }}>
                                    ✅ LINE連携済み
                                </div>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                    通知がLINEに届きます
                                </p>
                                <button
                                    onClick={unlinkLine}
                                    className="btn-secondary"
                                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                                >
                                    🔗 連携を解除
                                </button>
                            </>
                        ) : linkToken ? (
                            /* トークン発行中の場合 */
                            <>
                                <p style={{ margin: 0, textAlign: 'center', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                    📱 LINE公式アカウントを友達追加して、<br />
                                    以下のコードをメッセージで送信してください
                                </p>

                                {/* QRコード画像 */}
                                <img
                                    src="/line-qr.png"
                                    alt="LINE友達追加QRコード"
                                    style={{
                                        width: '120px',
                                        height: '120px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border-color)'
                                    }}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                />

                                {/* トークン表示 */}
                                <div
                                    onClick={() => {
                                        navigator.clipboard.writeText(linkToken);
                                        setSaveStatus('📋 コードをコピーしました');
                                        setTimeout(() => setSaveStatus(''), 2000);
                                    }}
                                    style={{
                                        padding: '1rem 2rem',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '12px',
                                        border: '2px dashed var(--primary-color)',
                                        cursor: 'pointer',
                                        textAlign: 'center'
                                    }}
                                >
                                    <div style={{
                                        fontFamily: 'monospace',
                                        fontSize: '2rem',
                                        fontWeight: 'bold',
                                        letterSpacing: '0.3em',
                                        color: 'var(--primary-color)'
                                    }}>
                                        {linkToken}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                        👆 タップしてコピー
                                    </div>
                                </div>

                                {/* カウントダウン */}
                                <div style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '20px',
                                    background: remainingSeconds < 60 ? 'rgba(255, 152, 0, 0.1)' : 'rgba(33, 150, 243, 0.1)',
                                    border: `1px solid ${remainingSeconds < 60 ? '#ff9800' : '#2196f3'}`,
                                    color: remainingSeconds < 60 ? '#ff9800' : '#2196f3',
                                    fontSize: '0.85rem'
                                }}>
                                    ⏱️ 有効期限: {Math.floor(remainingSeconds / 60)}分{remainingSeconds % 60}秒
                                </div>

                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                    🔄 連携が完了すると自動的に画面が更新されます
                                </p>

                                <button
                                    onClick={generateLinkToken}
                                    className="btn-secondary"
                                    disabled={isGeneratingToken}
                                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                                >
                                    🔄 コードを再発行
                                </button>
                            </>
                        ) : (
                            /* 未連携の場合 */
                            <>
                                <div style={{
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: '20px',
                                    background: 'rgba(255, 152, 0, 0.1)',
                                    border: '1px solid #ff9800',
                                    color: '#ff9800',
                                    fontWeight: 'bold',
                                    fontSize: '0.9rem'
                                }}>
                                    ⚠️ LINE未連携
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                                    LINE連携すると通知を受け取れます
                                </p>
                                <button
                                    onClick={generateLinkToken}
                                    className="btn-primary"
                                    disabled={isGeneratingToken}
                                    style={{ padding: '0.8rem 1.5rem', fontSize: '1rem' }}
                                >
                                    {isGeneratingToken ? '⏳ 発行中...' : '📱 LINE連携を開始'}
                                </button>
                            </>
                        )}

                        {/* フォールバック説明 */}
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            💡 LINE APIの月間送信上限（200通）に達した場合、<br />
                            Discord Webhook URLが設定されていれば自動的にDiscordへ通知します
                        </p>

                        {/* Discordフォールバック設定 */}
                        <div style={{ width: '100%' }}>
                            <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Discord Webhook URL（任意・フォールバック用）</label>
                            <input
                                type="text"
                                value={localSettings.discordWebhookUrl}
                                onChange={(e) => setLocalSettings({ ...localSettings, discordWebhookUrl: e.target.value })}
                                placeholder="https://discord.com/api/webhooks/..."
                                style={{ fontFamily: 'monospace', width: '100%', marginTop: '0.25rem' }}
                            />
                        </div>
                    </div>
                )}

                {/* Discord設定（Discordが選択されている場合のみ表示） */}
                {localSettings.notificationMethod === 'discord' && (
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label>Discord Webhook URL</label>
                        <input
                            type="text"
                            value={localSettings.discordWebhookUrl}
                            onChange={(e) => setLocalSettings({ ...localSettings, discordWebhookUrl: e.target.value })}
                            placeholder="https://discord.com/api/webhooks/..."
                            style={{ fontFamily: 'monospace' }}
                        />
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Discord Webhookの作成方法は「サーバー設定 → 連携サービス → ウェブフック」から
                        </p>
                    </div>
                )}

                {/* 通知タイミング設定 */}
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
