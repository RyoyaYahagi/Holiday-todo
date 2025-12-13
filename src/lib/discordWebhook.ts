import type { ScheduledTask } from '../types';
import { format } from 'date-fns';

export async function sendDiscordNotification(webhookUrl: string, tasks: ScheduledTask[], messagePrefix: string = ''): Promise<boolean> {
    if (!webhookUrl) {
        console.error('Webhook URL is not set');
        return false;
    }

    const taskLines = tasks.map(t => {
        const time = format(new Date(t.scheduledTime), 'HH:mm');
        return `・${time} - ${t.title} (Priority: ${t.priority})`;
    }).join('\n');

    const content = `${messagePrefix}\n\n**本日の予定**\n${taskLines}`;

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: content,
                username: 'Holiday Todo App',
            }),
        });

        if (!response.ok) {
            console.error('Failed to send Discord notification', response.statusText);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error sending Discord notification:', error);
        return false;
    }
}
