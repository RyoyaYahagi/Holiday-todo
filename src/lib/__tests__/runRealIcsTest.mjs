/**
 * 非勤務イベントを含むIcsParserテスト
 * 
 * 実行方法: node runRealIcsTest.mjs
 * 
 * 目的: 
 * - 非勤務イベント（ランニング、ライブ等）も正しく認識されるか確認
 * - isHoliday関数が非勤務イベントがある日を休日ではないと判定するか確認
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// IcsParserを再現（修正版 - その他イベントも返す）
class IcsParser {
    constructor(content) {
        this.icsContent = content;
    }

    parse() {
        const events = [];
        const lines = this.icsContent.split(/\r\n|\n|\r/);

        let inEvent = false;
        let currentEvent = {};

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

    extractDateValue(line) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) return '';
        return line.substring(colonIndex + 1);
    }

    parseIcsDate(dateString) {
        const year = parseInt(dateString.substring(0, 4));
        const month = parseInt(dateString.substring(4, 6)) - 1;
        const day = parseInt(dateString.substring(6, 8));

        if (dateString.length > 8) {
            const hour = parseInt(dateString.substring(9, 11));
            const minute = parseInt(dateString.substring(11, 13));
            const second = parseInt(dateString.substring(13, 15));

            let date = new Date(year, month, day, hour, minute, second);

            if (dateString.endsWith('Z')) {
                date = new Date(Date.UTC(year, month, day, hour, minute, second));
            }
            return date;
        } else {
            return new Date(year, month, day);
        }
    }

    extractWorkStartHour(summary) {
        const hourPattern = /(\d{1,2})時勤務/;
        const hourMatch = summary.match(hourPattern);
        if (hourMatch) return parseInt(hourMatch[1], 10);

        const parenPattern = /勤務\s*\((\d{1,2})\)/;
        const parenMatch = summary.match(parenPattern);
        if (parenMatch) return parseInt(parenMatch[1], 10);

        const colonPattern = /勤務:\s*(\d{1,2}):/;
        const colonMatch = summary.match(colonPattern);
        if (colonMatch) return parseInt(colonMatch[1], 10);

        const prefixPattern = /^(\d{1,2})勤務/;
        const prefixMatch = summary.match(prefixPattern);
        if (prefixMatch) return parseInt(prefixMatch[1], 10);

        if (/\d+時間勤務/.test(summary)) return null;

        return null;
    }

    createWorkEvent(raw) {
        const summary = raw.summary || '';
        let type = 'その他';

        if (summary.includes('夜勤')) {
            type = '夜勤';
        } else if (summary.includes('日勤')) {
            type = '日勤';
        } else if (summary.includes('休み')) {
            type = '休み';
        } else if (summary.includes('勤務')) {
            const startHour = this.extractWorkStartHour(summary);
            if (startHour !== null) {
                type = startHour >= 20 ? '夜勤' : '日勤';
            } else {
                const startDate = this.parseIcsDate(raw.dtstart);
                const hour = startDate.getHours();
                type = hour >= 17 ? '夜勤' : '日勤';
            }
        }
        // type === 'その他' でも返す（非勤務イベントも予定として認識）

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

// isHoliday関数を再現（修正版）
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate();
}

function isHoliday(date, events) {
    const dayEvents = events.filter(e => isSameDay(e.start, date));

    // イベントがない日は休日
    if (dayEvents.length === 0) {
        return true;
    }

    // 「休み」イベントがある場合は休日
    const hasYasumi = dayEvents.some(e => e.eventType === '休み');
    if (hasYasumi) {
        return true;
    }

    // 勤務イベント（日勤/夜勤）または非勤務イベント（その他）がある場合は休日ではない
    return false;
}

// テスト実行
console.log('=== 非勤務イベント対応テスト ===\n');

const realIcsPath = path.join(__dirname, '../../..', 'arr38.kmr203@gmail.com.ics');
console.log(`📁 テストファイル: ${realIcsPath}`);

try {
    const content = fs.readFileSync(realIcsPath, 'utf-8');
    console.log('✅ ファイル読み込み成功\n');

    const parser = new IcsParser(content);
    const events = parser.parse();

    console.log(`📊 パース結果: 全${events.length}件のイベントを抽出\n`);

    // イベントタイプ別にカウント
    const typeCount = { '夜勤': 0, '日勤': 0, '休み': 0, 'その他': 0 };
    events.forEach(event => {
        typeCount[event.eventType]++;
    });

    console.log('=== イベントタイプ別集計 ===');
    console.log(`  夜勤: ${typeCount['夜勤']}件`);
    console.log(`  日勤: ${typeCount['日勤']}件`);
    console.log(`  休み: ${typeCount['休み']}件`);
    console.log(`  その他（非勤務予定）: ${typeCount['その他']}件`);
    console.log('');

    // 「その他」イベントのサンプルを表示
    const otherEvents = events.filter(e => e.eventType === 'その他');
    console.log('=== 非勤務イベント（その他）のサンプル ===');
    otherEvents.slice(0, 10).forEach((event, index) => {
        console.log(`${index + 1}. ${event.title}`);
        console.log(`   ${event.start.toLocaleString('ja-JP')}`);
    });
    console.log('');

    // isHoliday関数のテスト
    console.log('=== isHoliday関数のテスト ===');

    // 非勤務イベントがある日をテスト
    if (otherEvents.length > 0) {
        const testDate = otherEvents[0].start;
        const isHol = isHoliday(testDate, events);
        console.log(`テスト日: ${testDate.toLocaleDateString('ja-JP')}`);
        console.log(`イベント: ${otherEvents[0].title}`);
        console.log(`休日判定: ${isHol ? '休日（タスク可）' : '予定あり（タスク不可）'}`);

        if (!isHol) {
            console.log('✅ 非勤務イベントがある日は正しく「予定あり」と判定されました');
        } else {
            console.log('❌ 非勤務イベントがある日が「休日」と判定されました');
        }
    }
    console.log('');

    // イベントがない日をテスト
    console.log('=== イベントがない日のテスト ===');
    const noEventDate = new Date(2025, 11, 31); // 2025/12/31
    const isHolNoEvent = isHoliday(noEventDate, events);
    console.log(`テスト日: ${noEventDate.toLocaleDateString('ja-JP')}`);
    console.log(`休日判定: ${isHolNoEvent ? '休日（タスク可）' : '予定あり（タスク不可）'}`);
    if (isHolNoEvent) {
        console.log('✅ イベントがない日は正しく「休日」と判定されました');
    }
    console.log('');

    console.log('🎉 テスト完了！');

} catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
}
