import { describe, it, expect } from 'vitest';
import { computeEventDiff } from './eventDiff';
import type { MinimalEventRow } from './eventDiff';
import type { WorkEvent } from '../types';

describe('computeEventDiff - イベント差分計算', () => {
    const userId = 'user-123';

    it('空配列の場合、追加・削除ともに空になること', () => {
        const dbRows: MinimalEventRow[] = [];
        const events: WorkEvent[] = [];

        const result = computeEventDiff(dbRows, events, userId);

        expect(result.toInsert).toEqual([]);
        expect(result.toDeleteIds).toEqual([]);
    });

    it('DBが空で新規イベントがある場合、すべて追加されること', () => {
        const dbRows: MinimalEventRow[] = [];
        const events: WorkEvent[] = [
            { title: '休み', start: new Date('2026-06-12T00:00:00Z'), end: new Date('2026-06-12T23:59:59Z'), eventType: '休み' },
            { title: '日勤', start: new Date('2026-06-13T09:00:00Z'), end: new Date('2026-06-13T18:00:00Z'), eventType: '日勤' }
        ];

        const result = computeEventDiff(dbRows, events, userId);

        expect(result.toInsert.length).toBe(2);
        expect(result.toInsert[0]).toEqual({
            user_id: userId,
            title: '休み',
            start_time: '2026-06-12T00:00:00.000Z',
            end_time: '2026-06-12T23:59:59.000Z',
            event_type: '休み'
        });
        expect(result.toDeleteIds).toEqual([]);
    });

    it('DBにイベントがあり、新規イベントが空の場合、すべて削除されること', () => {
        const dbRows: MinimalEventRow[] = [
            { id: 'db-1', title: '休み', start_time: '2026-06-12T00:00:00Z', end_time: '2026-06-12T23:59:59Z', event_type: '休み' }
        ];
        const events: WorkEvent[] = [];

        const result = computeEventDiff(dbRows, events, userId);

        expect(result.toInsert).toEqual([]);
        expect(result.toDeleteIds).toEqual(['db-1']);
    });

    it('DBイベントと新規イベントが同一の場合、追加・削除ともに空になること', () => {
        const dbRows: MinimalEventRow[] = [
            { id: 'db-1', title: '休み', start_time: '2026-06-12T00:00:00Z', end_time: '2026-06-12T23:59:59Z', event_type: '休み' }
        ];
        const events: WorkEvent[] = [
            { title: '休み', start: new Date('2026-06-12T00:00:00Z'), end: new Date('2026-06-12T23:59:59Z'), eventType: '休み' }
        ];

        const result = computeEventDiff(dbRows, events, userId);

        expect(result.toInsert).toEqual([]);
        expect(result.toDeleteIds).toEqual([]);
    });

    it('追加、削除、変更なしが混在する場合、正しく分類されること', () => {
        const dbRows: MinimalEventRow[] = [
            // 変更なし
            { id: 'db-1', title: '休み', start_time: '2026-06-12T00:00:00.000Z', end_time: '2026-06-12T23:59:59.000Z', event_type: '休み' },
            // 削除対象
            { id: 'db-2', title: '夜勤', start_time: '2026-06-13T20:00:00.000Z', end_time: '2026-06-14T05:00:00.000Z', event_type: '夜勤' }
        ];
        const events: WorkEvent[] = [
            // 変更なし
            { title: '休み', start: new Date('2026-06-12T00:00:00Z'), end: new Date('2026-06-12T23:59:59Z'), eventType: '休み' },
            // 追加対象
            { title: '日勤', start: new Date('2026-06-15T09:00:00Z'), end: new Date('2026-06-15T18:00:00Z'), eventType: '日勤' }
        ];

        const result = computeEventDiff(dbRows, events, userId);

        expect(result.toInsert.length).toBe(1);
        expect(result.toInsert[0].title).toBe('日勤');
        expect(result.toDeleteIds).toEqual(['db-2']);
    });
});
