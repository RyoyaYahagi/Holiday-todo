import type { WorkEvent, EventType } from '../types';

export class IcsParser {
    private icsContent: string;

    constructor(content: string) {
        this.icsContent = content;
    }

    public parse(): WorkEvent[] {
        const events: WorkEvent[] = [];
        const lines = this.icsContent.split(/\r\n|\n|\r/);

        let inEvent = false;
        let currentEvent: Partial<{
            summary: string;
            dtstart: string;
            dtend: string;
        }> = {};

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('BEGIN:VEVENT')) {
                inEvent = true;
                currentEvent = {};
                continue;
            }

            if (line.startsWith('END:VEVENT')) {
                inEvent = false;
                if (currentEvent.summary && currentEvent.dtstart) {
                    const event = this.createWorkEvent(currentEvent);
                    if (event) {
                        events.push(event);
                    }
                }
                continue;
            }

            if (inEvent) {
                if (line.startsWith('SUMMARY:')) {
                    currentEvent.summary = line.substring(8);
                } else if (line.startsWith('DTSTART')) {
                    currentEvent.dtstart = this.extractDateValue(line);
                } else if (line.startsWith('DTEND')) {
                    currentEvent.dtend = this.extractDateValue(line);
                }
            }
        }

        return events;
    }

    private extractDateValue(line: string): string {
        // Basic extraction, handling parameters like ;VALUE=DATE
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return '';
        return line.substring(colonIndex + 1);
    }

    private parseIcsDate(dateString: string): Date {
        // 20230101T120000Z or 20230101
        const year = parseInt(dateString.substring(0, 4));
        const month = parseInt(dateString.substring(4, 6)) - 1;
        const day = parseInt(dateString.substring(6, 8));

        if (dateString.length > 8) {
            // Has time
            const hour = parseInt(dateString.substring(9, 11));
            const minute = parseInt(dateString.substring(11, 13));
            const second = parseInt(dateString.substring(13, 15));

            // Simple UTC handling if Z is present, otherwise assuming local for simplicity as mostly just need relative times
            // However, for correct "end time" logic, local time matters.
            // If 'Z' is at end, it is UTC.
            // Google calendar export usually does UTC.

            let date = new Date(year, month, day, hour, minute, second);

            if (dateString.endsWith('Z')) {
                date = new Date(Date.UTC(year, month, day, hour, minute, second));
            }
            return date;
        } else {
            // Date only
            return new Date(year, month, day);
        }
    }

    private createWorkEvent(raw: any): WorkEvent | null {
        const summary = raw.summary || '';
        let type: EventType = 'その他';

        if (summary.includes('夜勤')) type = '夜勤';
        else if (summary.includes('日勤')) type = '日勤';
        else if (summary.includes('休み')) type = '休み';

        // Only return events that match the naming rule
        if (type === 'その他') return null;

        let start = this.parseIcsDate(raw.dtstart);
        let end = raw.dtend ? this.parseIcsDate(raw.dtend) : start;

        // If it's an all-day event (no time component in string usually implies length 8), 
        // DTEND is usually the next day.
        // For shifts, we assume they have times? 
        // User requirement: "イベントの開始・終了日時を使用して勤務日・休日を判定する"
        // "休日の開始時刻は前日の終業時間で決定" -> implies shifts have times.

        return {
            title: summary,
            start,
            end,
            eventType: type
        };
    }
}
