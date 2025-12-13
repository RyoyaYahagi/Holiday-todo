/**
 * IcsParser テスト
 * 
 * 前提条件:
 * - Node.js 環境
 * - vitestがインストール済み
 * 
 * テスト目的:
 * - icsファイルのパースが正しく動作するか確認
 * - 日勤、夜勤、休みのイベントが正しく抽出されるか確認
 * - その他のイベントは無視されるか確認
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { IcsParser } from '../icsParser';
import fs from 'fs';
import path from 'path';

describe('IcsParser', () => {
    let testIcsContent: string;

    beforeAll(() => {
        const testIcsPath = path.join(__dirname, 'test.ics');
        testIcsContent = fs.readFileSync(testIcsPath, 'utf-8');
    });

    it('icsファイルの内容が正しく読み込めること', () => {
        expect(testIcsContent).toBeTruthy();
        expect(testIcsContent).toContain('BEGIN:VCALENDAR');
        expect(testIcsContent).toContain('END:VCALENDAR');
    });

    it('パーサーがイベントを正しく抽出すること', () => {
        const parser = new IcsParser(testIcsContent);
        const events = parser.parse();

        // 「会議」は「その他」なので除外され、3件になるはず
        expect(events.length).toBe(3);
    });

    it('日勤イベントが正しくパースされること', () => {
        const parser = new IcsParser(testIcsContent);
        const events = parser.parse();

        const nikkinEvent = events.find(e => e.title === '日勤');
        expect(nikkinEvent).toBeDefined();
        expect(nikkinEvent?.eventType).toBe('日勤');
        expect(nikkinEvent?.start.getFullYear()).toBe(2025);
        expect(nikkinEvent?.start.getMonth()).toBe(11); // 12月 (0-indexed)
        expect(nikkinEvent?.start.getDate()).toBe(15);
    });

    it('夜勤イベントが正しくパースされること', () => {
        const parser = new IcsParser(testIcsContent);
        const events = parser.parse();

        const yakinEvent = events.find(e => e.title === '夜勤');
        expect(yakinEvent).toBeDefined();
        expect(yakinEvent?.eventType).toBe('夜勤');
    });

    it('休みイベントが正しくパースされること', () => {
        const parser = new IcsParser(testIcsContent);
        const events = parser.parse();

        const yasumiEvent = events.find(e => e.title === '休み');
        expect(yasumiEvent).toBeDefined();
        expect(yasumiEvent?.eventType).toBe('休み');
    });

    it('その他のイベントは除外されること', () => {
        const parser = new IcsParser(testIcsContent);
        const events = parser.parse();

        const kaigiEvent = events.find(e => e.title === '会議');
        expect(kaigiEvent).toBeUndefined();
    });

    it('UTC時刻（Zサフィックス付き）が正しくパースされること', () => {
        const icsWithUtc = `BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:日勤
DTSTART:20251220T100000Z
DTEND:20251220T190000Z
END:VEVENT
END:VCALENDAR`;

        const parser = new IcsParser(icsWithUtc);
        const events = parser.parse();

        expect(events.length).toBe(1);
        // UTCで10:00なので日本時間では19:00
        expect(events[0].start.getUTCHours()).toBe(10);
    });
});
