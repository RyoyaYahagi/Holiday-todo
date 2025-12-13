/**
 * IcsParserの手動テスト
 * 
 * 実行方法: node runTest.mjs
 * 
 * 目的: 
 * - test.icsファイルが正しく読み込まれるか確認
 * - IcsParserが期待通りに動作するか確認
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// IcsParserを再現（TypeScriptファイルを直接importできないため）
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

    createWorkEvent(raw) {
        const summary = raw.summary || '';
        let type = 'その他';

        if (summary.includes('夜勤')) type = '夜勤';
        else if (summary.includes('日勤')) type = '日勤';
        else if (summary.includes('休み')) type = '休み';

        if (type === 'その他') return null;

        let start = this.parseIcsDate(raw.dtstart);
        let end = raw.dtend ? this.parseIcsDate(raw.dtend) : start;

        return {
            title: summary,
            start,
            end,
            eventType: type
        };
    }
}

// テスト実行
console.log('=== IcsParser テスト ===\n');

// test.icsを読み込む
const testIcsPath = path.join(__dirname, 'test.ics');
console.log(`📁 テストファイル: ${testIcsPath}`);

try {
    const content = fs.readFileSync(testIcsPath, 'utf-8');
    console.log('✅ ファイル読み込み成功\n');

    console.log('--- ファイル内容 ---');
    console.log(content);
    console.log('-------------------\n');

    // パース実行
    const parser = new IcsParser(content);
    const events = parser.parse();

    console.log(`📊 パース結果: ${events.length}件のイベントを抽出\n`);

    events.forEach((event, index) => {
        console.log(`イベント ${index + 1}:`);
        console.log(`  タイトル: ${event.title}`);
        console.log(`  タイプ: ${event.eventType}`);
        console.log(`  開始: ${event.start.toLocaleString('ja-JP')}`);
        console.log(`  終了: ${event.end.toLocaleString('ja-JP')}`);
        console.log('');
    });

    // 検証
    console.log('=== 検証結果 ===');
    const expectedEvents = ['日勤', '夜勤', '休み'];
    const parsedTitles = events.map(e => e.title);

    let allPassed = true;

    // 1. 日勤、夜勤、休みが含まれているか
    expectedEvents.forEach(expected => {
        if (parsedTitles.includes(expected)) {
            console.log(`✅ 「${expected}」イベント: 正しく抽出`);
        } else {
            console.log(`❌ 「${expected}」イベント: 見つかりません`);
            allPassed = false;
        }
    });

    // 2. 「会議」が除外されているか
    if (!parsedTitles.includes('会議')) {
        console.log('✅ 「会議」イベント: 正しく除外');
    } else {
        console.log('❌ 「会議」イベント: 除外されるべきが含まれています');
        allPassed = false;
    }

    // 3. イベント数の確認
    if (events.length === 3) {
        console.log('✅ イベント数: 3件（期待通り）');
    } else {
        console.log(`❌ イベント数: ${events.length}件（期待: 3件）`);
        allPassed = false;
    }

    console.log('\n' + (allPassed ? '🎉 すべてのテストに成功しました！' : '⚠️ 一部のテストが失敗しました'));

} catch (error) {
    console.error('❌ エラーが発生しました:', error.message);
    process.exit(1);
}
