import type { RecurrenceRule } from '../types';

/**
 * 繰り返しルールを日本語の文字列に変換する
 */
export function formatRecurrence(rule?: RecurrenceRule): string {
    if (!rule) return '';

    const { type, interval, daysOfWeek, dayOfMonth } = rule;
    const intervalText = interval && interval > 1 ? `${interval}` : '';

    switch (type) {
        case 'daily':
            return intervalText ? `${intervalText}日ごと` : '毎日';
        case 'weekdays':
            return '平日（月〜金）';
        case 'weekly': {
            const dayMap = ['日', '月', '火', '水', '木', '金', '土'];
            const days = daysOfWeek
                ? daysOfWeek.map(d => dayMap[d]).join('・')
                : '';
            const prefix = intervalText ? `${intervalText}週間ごと` : '毎週';
            return days ? `${prefix} ${days}曜日` : prefix;
        }
        case 'monthly':
            const date = dayOfMonth ? `${dayOfMonth}日` : '';
            return intervalText ? `${intervalText}ヶ月ごとの${date}` : `毎月 ${date}`;
        case 'yearly':
            return intervalText ? `${intervalText}年ごと` : '毎年';
        default:
            return '';
    }
}
