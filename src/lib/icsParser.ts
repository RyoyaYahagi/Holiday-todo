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

    /**
     * SUMMARYから勤務開始時刻を抽出する
     * 
     * 対応パターン:
     * - "5時勤務", "8時勤務", "13時勤務", "20時勤務"
     * - "勤務 (8)", "勤務 (20)"
     * - "勤務: 20:05～5:15", "勤務: 5:00～14:10"
     * - "20勤務 (20:05-翌05:15)", "5勤務 (05:00-14:10)"
     * - "13勤務 早残" など
     * 
     * @param summary イベントのSUMMARY文字列
     * @returns 勤務開始時刻（時）、抽出できない場合はnull
     */
    private extractWorkStartHour(summary: string): number | null {
        // パターン1: "X時勤務" (例: "5時勤務", "20時勤務")
        const hourPattern = /(\d{1,2})時勤務/;
        const hourMatch = summary.match(hourPattern);
        if (hourMatch) {
            return parseInt(hourMatch[1], 10);
        }

        // パターン2: "勤務 (X)" (例: "勤務 (8)", "勤務 (20)")
        const parenPattern = /勤務\s*\((\d{1,2})\)/;
        const parenMatch = summary.match(parenPattern);
        if (parenMatch) {
            return parseInt(parenMatch[1], 10);
        }

        // パターン3: "勤務: X:XX～" (例: "勤務: 20:05～5:15")
        const colonPattern = /勤務:\s*(\d{1,2}):/;
        const colonMatch = summary.match(colonPattern);
        if (colonMatch) {
            return parseInt(colonMatch[1], 10);
        }

        // パターン4: "X勤務" で始まる (例: "20勤務 (20:05-翌05:15)", "13勤務 早残")
        const prefixPattern = /^(\d{1,2})勤務/;
        const prefixMatch = summary.match(prefixPattern);
        if (prefixMatch) {
            return parseInt(prefixMatch[1], 10);
        }

        // パターン5: "X時間勤務" は特殊（時間数なので除外）
        if (/\d+時間勤務/.test(summary)) {
            // 時間数なので、DTSTARTから判定する必要があるためnullを返す
            return null;
        }

        return null;
    }

    /**
     * 勤務イベントを判定し、WorkEventを作成する
     * 
     * イベントタイプの判定ルール:
     * - "夜勤" を含む → 夜勤
     * - "日勤" を含む → 日勤
     * - "休み" を含む → 休み
     * - "勤務" を含み、開始時刻が20時以降 → 夜勤
     * - "勤務" を含み、開始時刻が20時未満 → 日勤
     * - 上記以外 → その他（非勤務の予定として認識）
     * 
     * @param raw パースされた生データ
     * @returns WorkEvent
     */
    private createWorkEvent(raw: any): WorkEvent {
        const summary = raw.summary || '';
        let type: EventType = 'その他';

        // 従来のキーワードマッチング（優先）
        if (summary.includes('夜勤')) {
            type = '夜勤';
        } else if (summary.includes('日勤')) {
            type = '日勤';
        } else if (summary.includes('休み')) {
            type = '休み';
        } else if (summary.includes('勤務')) {
            // 新形式: 勤務イベントを時刻から判定
            const startHour = this.extractWorkStartHour(summary);

            if (startHour !== null) {
                // 20時以降開始は夜勤、それ以外は日勤
                type = startHour >= 20 ? '夜勤' : '日勤';
            } else {
                // 時刻を抽出できない場合、DTSTARTから判定
                const startDate = this.parseIcsDate(raw.dtstart);
                const hour = startDate.getHours();
                // 17時以降開始は夜勤とみなす（夜勤は通常17時～翌朝）
                type = hour >= 17 ? '夜勤' : '日勤';
            }
        }
        // type === 'その他' の場合も返す（非勤務イベントも予定として認識）

        const start = this.parseIcsDate(raw.dtstart);
        const end = raw.dtend ? this.parseIcsDate(raw.dtend) : start;

        return {
            title: summary,
            start,
            end,
            eventType: type
        };
    }
}
