import { useEffect, useRef } from 'react';
import type { AppSettings, ScheduledTask, WorkEvent } from '../types';
import { sendDiscordNotification } from '../lib/discordWebhook';
import { isSameDay } from 'date-fns';
import { isHoliday } from '../lib/scheduler';

export function useNotifications(
    settings: AppSettings,
    _tasks: any[], // Raw tasks (現在は使用しない - 既存スケジュールを使う)
    events: WorkEvent[],
    scheduledTasks: ScheduledTask[],
    _saveScheduledTasks: (t: ScheduledTask[]) => void
) {
    const lastCheckRef = useRef<number>(Date.now());
    // 重複通知防止: 最後に「前日通知」を送った日付
    const lastDayBeforeNotificationDateRef = useRef<string>('');

    useEffect(() => {
        const checkInterval = setInterval(async () => {
            const now = new Date();

            // 1. Day Before Notification (前日通知)
            if (settings.notifyOnDayBefore && settings.discordWebhookUrl) {
                const [notifyHour, notifyMinute] = settings.notifyDayBeforeTime.split(':').map(Number);
                const notifyTimeToday = new Date(now);
                notifyTimeToday.setHours(notifyHour, notifyMinute, 0, 0);

                // Check if we just passed the notification time within the last minute
                const diff = now.getTime() - notifyTimeToday.getTime();
                if (diff >= 0 && diff < 60000) {
                    // It's time!
                    // Check if tomorrow is holiday
                    const tomorrow = new Date(now);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const tomorrowKey = tomorrow.toISOString().split('T')[0]; // YYYY-MM-DD

                    // 重複防止: 今日既にこの日付の通知を送っていたらスキップ
                    if (lastDayBeforeNotificationDateRef.current !== tomorrowKey) {
                        if (isHoliday(tomorrow, events)) {
                            // 明日のスケジュール済みタスクを取得（未完了のみ）
                            const tomorrowTasks = scheduledTasks.filter(t =>
                                !t.isCompleted &&
                                isSameDay(new Date(t.scheduledTime), tomorrow)
                            );

                            if (tomorrowTasks.length > 0) {
                                // 時間順にソート
                                const sortedTasks = [...tomorrowTasks].sort((a, b) =>
                                    a.scheduledTime - b.scheduledTime
                                );

                                await sendDiscordNotification(
                                    settings.discordWebhookUrl,
                                    sortedTasks,
                                    '📅 **明日の休日スケジュール**'
                                );

                                // 送信済みとしてマーク
                                lastDayBeforeNotificationDateRef.current = tomorrowKey;
                            }
                        }
                    }
                }
            }

            // 2. Task Start Notification (タスク開始通知)
            if (settings.notifyBeforeTask && settings.discordWebhookUrl) {
                scheduledTasks.forEach(async (task) => {
                    if (task.isCompleted) return;

                    const taskTime = new Date(task.scheduledTime);
                    const notifyTime = new Date(taskTime);
                    notifyTime.setMinutes(notifyTime.getMinutes() - settings.notifyBeforeTaskMinutes);

                    // Check if we hit the notify time
                    // We need to avoid double sending. 
                    // Usually we flag the task as "notified", but scheduledTask structure doesn't have it.
                    // For simplicity, we check if current time is within [notifyTime, notifyTime + 1min]

                    const diff = now.getTime() - notifyTime.getTime();
                    if (diff >= 0 && diff < 60000) {
                        await sendDiscordNotification(
                            settings.discordWebhookUrl,
                            [task],
                            `⏰ **タスク開始 ${settings.notifyBeforeTaskMinutes}分前**`
                        );
                    }
                });
            }

            lastCheckRef.current = Date.now();
        }, 30000); // Check every 30 seconds

        return () => clearInterval(checkInterval);
    }, [settings, events, scheduledTasks]);
}
