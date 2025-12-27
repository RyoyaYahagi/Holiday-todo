import { useEffect } from 'react';
import type { AppSettings, ScheduledTask, WorkEvent } from '../types';

/**
 * 通知機能を提供するカスタムフック
 *
 * 注意: 通知処理はEdge Function (notify-discord) で一元管理されています。
 * このフックは互換性のために残されていますが、
 * 現在はアクティブな通知処理は行いません。
 *
 * 以前はクライアントサイドとサーバーサイドの両方から通知を送信していたため、
 * 同じ内容の通知が2回送られる問題がありました（一方は日本語、一方は英語）。
 * この問題を解決するため、通知はEdge Functionのみで行うように変更しました。
 *
 * @param _settings - アプリケーション設定（現在は使用しない）
 * @param _events - ワークイベント配列（現在は使用しない）
 * @param _scheduledTasks - スケジュール済みタスク配列（現在は使用しない）
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useNotifications(
    _settings: AppSettings,
    _events: WorkEvent[],
    _scheduledTasks: ScheduledTask[]
) {
    useEffect(() => {
        // 通知処理はEdge Function (notify-discord) に一元化されました。
        // クライアントサイドからの通知送信は無効化されています。
        //
        // 以前のクライアントサイド通知:
        // 1. Day Before Notification (前日通知) - 無効化
        // 2. Task Start Notification (タスク開始通知) - 無効化
        //
        // 詳細はsupabase/functions/notify-discord/index.tsを参照してください。
    }, []);
}
