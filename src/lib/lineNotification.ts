import type { ScheduledTask } from '../types';
import { format } from 'date-fns';

/**
 * LINE Messaging APIへタスク通知を送信する
 *
 * 指定されたチャンネルアクセストークンとユーザーIDを使用して、
 * タスク一覧をフォーマットしてLINEへ送信する。
 * ネットワークエラーや送信失敗時はfalseを返し、例外をスローしない。
 *
 * @param channelAccessToken - LINEチャンネルアクセストークン（長期）
 * @param userId - 通知先のLINEユーザーID（Uで始まる33文字）
 * @param tasks - 通知するスケジュール済みタスクの配列
 * @param messagePrefix - 通知メッセージの接頭辞（省略時は「本日の予定」）
 * @returns 送信成功時true、失敗時false
 */
export async function sendLineNotification(
    channelAccessToken: string,
    userId: string,
    tasks: ScheduledTask[],
    messagePrefix: string = ''
): Promise<boolean> {
    if (!channelAccessToken) {
        console.error('LINE Channel Access Token is not set');
        return false;
    }

    if (!userId) {
        console.error('LINE User ID is not set');
        return false;
    }

    const taskLines = tasks.map(t => {
        const time = format(new Date(t.scheduledTime), 'HH:mm');
        return `・${time} - ${t.title} (優先度: ${t.priority ?? '-'})`;
    }).join('\n');

    const content = messagePrefix
        ? `${messagePrefix}\n${taskLines}`
        : `📋 本日の予定\n${taskLines}`;

    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({
                to: userId,
                messages: [{
                    type: 'text',
                    text: content,
                }],
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Failed to send LINE notification', response.status, errorBody);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error sending LINE notification:', error);
        return false;
    }
}

/**
 * LINE通知テストを送信する
 *
 * 設定確認用のテストメッセージを送信する。
 *
 * @param channelAccessToken - LINEチャンネルアクセストークン
 * @param userId - 通知先のLINEユーザーID
 * @returns 送信成功時true、失敗時false
 */
export async function sendLineTestNotification(
    channelAccessToken: string,
    userId: string
): Promise<boolean> {
    if (!channelAccessToken || !userId) {
        console.error('LINE credentials not set');
        return false;
    }

    try {
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({
                to: userId,
                messages: [{
                    type: 'text',
                    text: '🔔 【テスト通知】\nHoliday Todo Appからの通知テストです。\nこのメッセージが届いていれば、LINE通知の設定は正しく完了しています！',
                }],
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error('Failed to send LINE test notification', response.status, errorBody);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error sending LINE test notification:', error);
        return false;
    }
}
