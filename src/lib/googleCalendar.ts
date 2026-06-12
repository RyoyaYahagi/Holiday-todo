import type { WorkEvent, EventType } from '../types';

/**
 * Google Calendar APIレスポンスのイベント型
 */
interface GoogleCalendarEvent {
    id: string;
    summary?: string;
    start: {
        dateTime?: string;
        date?: string;
    };
    end: {
        dateTime?: string;
        date?: string;
    };
}

/**
 * Google Calendar APIレスポンス型
 */
interface GoogleCalendarEventsResponse {
    items: GoogleCalendarEvent[];
    nextPageToken?: string;
}

/**
 * Google Calendar APIからイベントを取得するクライアント
 * 
 * Supabaseのprovider_tokenを使用してGoogle APIを呼び出し、
 * イベントをWorkEvent形式に変換する。
 */
export class GoogleCalendarClient {
    private accessToken: string;

    /**
     * @param accessToken - Supabaseから取得したGoogleのアクセストークン
     */
    constructor(accessToken: string) {
        this.accessToken = accessToken;
    }

    /**
     * プライマリカレンダーからイベントを取得
     * 
     * @param timeMin - 取得開始日時（ISO 8601形式）
     * @param timeMax - 取得終了日時（ISO 8601形式）
     * @returns WorkEvent配列
     */
    async fetchEvents(timeMin?: string, timeMax?: string): Promise<WorkEvent[]> {
        // 過去1年分のイベントを取得（履歴保持のため）
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const threeMonthsLater = new Date();
        threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

        const allItems: GoogleCalendarEvent[] = [];
        let pageToken: string | undefined;

        do {
            const params = new URLSearchParams({
                timeMin: timeMin || oneYearAgo.toISOString(),
                timeMax: timeMax || threeMonthsLater.toISOString(),
                singleEvents: 'true',
                orderBy: 'startTime',
                maxResults: '500',
            });
            if (pageToken) {
                params.set('pageToken', pageToken);
            }

            const response = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[GoogleCalendarClient] APIエラー:', response.status, errorText);
                throw new Error(`Google Calendar API error: ${response.status}`);
            }

            const data: GoogleCalendarEventsResponse = await response.json();
            allItems.push(...data.items);
            pageToken = data.nextPageToken;
        } while (pageToken);

        return allItems
            .filter(event => event.start?.dateTime || event.start?.date)
            .map(event => this.convertToWorkEvent(event));
    }

    /**
     * GoogleカレンダーイベントをWorkEvent形式に変換
     * 
     * イベントタイプの判定ルール:
     * - 「夜勤」を含む → 夜勤
     * - 「日勤」を含む → 日勤
     * - 「休み」を含む → 休み
     * - 「勤務」を含む → 開始時刻で判定（20時以降→夜勤）
     * - 上記以外 → その他
     */
    private convertToWorkEvent(event: GoogleCalendarEvent): WorkEvent {
        const summary = event.summary || '';
        const start = this.parseGoogleDate(event.start);
        const end = this.parseGoogleDate(event.end) || start;

        const eventType = this.determineEventType(summary, start);

        return {
            id: event.id,
            title: summary,
            start,
            end,
            eventType,
        };
    }

    /**
     * Googleの日付形式をDateに変換
     */
    private parseGoogleDate(dateObj: { dateTime?: string; date?: string }): Date {
        if (dateObj.dateTime) {
            return new Date(dateObj.dateTime);
        }
        if (dateObj.date) {
            // 終日イベント（YYYY-MM-DD形式）
            return new Date(dateObj.date + 'T00:00:00');
        }
        return new Date();
    }

    /**
     * イベントタイプを判定
     * 
     * ICSパーサーと同じロジックを使用
     */
    private determineEventType(summary: string, start: Date): EventType {
        if (summary.includes('夜勤')) {
            return '夜勤';
        }
        if (summary.includes('日勤')) {
            return '日勤';
        }
        if (summary.includes('休み')) {
            return '休み';
        }
        if (summary.includes('勤務')) {
            const hour = this.extractWorkStartHour(summary) ?? start.getHours();
            return hour >= 20 ? '夜勤' : '日勤';
        }
        return 'その他';
    }

    /**
     * SUMMARYから勤務開始時刻を抽出
     * 
     * ICSパーサーと同じロジック
     */
    private extractWorkStartHour(summary: string): number | null {
        // パターン1: "X時勤務"
        const hourPattern = /(\d{1,2})時勤務/;
        const hourMatch = summary.match(hourPattern);
        if (hourMatch) {
            return parseInt(hourMatch[1], 10);
        }

        // パターン2: "勤務 (X)"
        const parenPattern = /勤務\s*\((\d{1,2})\)/;
        const parenMatch = summary.match(parenPattern);
        if (parenMatch) {
            return parseInt(parenMatch[1], 10);
        }

        // パターン3: "勤務: X:XX～"
        const colonPattern = /勤務:\s*(\d{1,2}):/;
        const colonMatch = summary.match(colonPattern);
        if (colonMatch) {
            return parseInt(colonMatch[1], 10);
        }

        // パターン4: "X勤務" で始まる
        const prefixPattern = /^(\d{1,2})勤務/;
        const prefixMatch = summary.match(prefixPattern);
        if (prefixMatch) {
            return parseInt(prefixMatch[1], 10);
        }

        return null;
    }
}
