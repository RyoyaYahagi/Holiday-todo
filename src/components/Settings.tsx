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
}

export const Settings: React.FC<SettingsProps> = ({
    settings,
    onUpdateSettings,
    onSaveEvents,
    onExport,
    onImport
}) => {
    const [importStatus, setImportStatus] = useState<string>('');
    const [webhookTestStatus, setWebhookTestStatus] = useState<string>('');

    const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                try {
                    const parser = new IcsParser(content);
                    const events = parser.parse();
                    onSaveEvents(events);
                    setImportStatus(`成功: ${events.length}件のイベントを読み込みました`);
                } catch (err) {
                    setImportStatus('エラー: ファイルの読み込みに失敗しました');
                    console.error(err);
                }
            }
        };
        reader.readAsText(file);
    };

    const handleWebhookTest = async () => {
        setWebhookTestStatus('送信中...');
        const result = await sendDiscordNotification(
            settings.discordWebhookUrl,
            [{ id: 'test', title: 'テストタスク', priority: 5, createdAt: 0, scheduledTime: Date.now(), isCompleted: false }],
            '【テスト通知】これはテスト通知です。'
        );
        setWebhookTestStatus(result ? '送信成功' : '送信失敗 (URLを確認してください)');
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
            <section className="settings-section">
                <h3>カレンダー読み込み</h3>
                <p className="description">Googleカレンダーなどからエクスポートした .ics ファイルを読み込みます。</p>
                <input type="file" accept=".ics" onChange={handleFileUpload} />
                {importStatus && <p className="status-msg">{importStatus}</p>}
            </section>

            <section className="settings-section">
                <h3>Discord 通知設定</h3>
                <div className="form-group">
                    <label>Webhook URL</label>
                    <input
                        type="text"
                        value={settings.discordWebhookUrl}
                        onChange={(e) => onUpdateSettings({ ...settings, discordWebhookUrl: e.target.value })}
                        placeholder="https://discord.com/api/webhooks/..."
                    />
                </div>
                <button onClick={handleWebhookTest} className="btn-secondary">通知テスト</button>
                {webhookTestStatus && <p className="status-msg">{webhookTestStatus}</p>}

                <div className="checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.notifyOnDayBefore}
                            onChange={(e) => onUpdateSettings({ ...settings, notifyOnDayBefore: e.target.checked })}
                        />
                        前日に通知する ({settings.notifyDayBeforeTime})
                    </label>
                </div>
                <div className="checkbox-group">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.notifyBeforeTask}
                            onChange={(e) => onUpdateSettings({ ...settings, notifyBeforeTask: e.target.checked })}
                        />
                        タスク開始 {settings.notifyBeforeTaskMinutes} 分前に通知する
                    </label>
                </div>
            </section>

            <section className="settings-section">
                <h3>データ管理</h3>
                <div className="data-actions">
                    <button onClick={handleExport} className="btn-primary">バックアップ（エクスポート）</button>
                    <div className="import-area">
                        <label className="btn-secondary">
                            復元（インポート）
                            <input type="file" accept=".json" onChange={handleJsonImport} style={{ display: 'none' }} />
                        </label>
                    </div>
                </div>
            </section>
        </div>
    );
};
