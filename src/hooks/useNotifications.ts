import { useEffect, useRef } from 'react';
import type { AppSettings, ScheduledTask, WorkEvent } from '../types';
import { sendDiscordNotification } from '../lib/discordWebhook';
import { subDays } from 'date-fns';
import { scheduleTasksForHoliday, isHoliday } from '../lib/scheduler';

export function useNotifications(
    settings: AppSettings,
    tasks: any[], // Raw tasks to schedule for tomorrow check
    events: WorkEvent[],
    scheduledTasks: ScheduledTask[],
    _saveScheduledTasks: (t: ScheduledTask[]) => void
) {
    const lastCheckRef = useRef<number>(Date.now());

    useEffect(() => {
        const checkInterval = setInterval(async () => {
            const now = new Date();

            // 1. Day Before Notification
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

                    if (isHoliday(tomorrow, events)) {
                        // Schedule tasks for tomorrow if not already scheduled?
                        // Or just simulate what would be scheduled.
                        // Ideally, we should persist the scheduled tasks for tomorrow NOW if they don't exist.

                        // Let's generate potential schedule
                        const potentialSchedule = scheduleTasksForHoliday(tomorrow, tasks, events);

                        if (potentialSchedule.length > 0) {
                            await sendDiscordNotification(
                                settings.discordWebhookUrl,
                                potentialSchedule,
                                '📅 **明日の休日スケジュール**'
                            );
                        }
                    }
                }
            }

            // 2. Task Start Notification
            if (settings.notifyBeforeTask && settings.discordWebhookUrl) {
                scheduledTasks.forEach(async (task) => {
                    if (task.isCompleted) return;

                    const taskTime = new Date(task.scheduledTime);
                    const notifyTime = subDays(taskTime, 0); // copy
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
    }, [settings, tasks, events, scheduledTasks]);
}
