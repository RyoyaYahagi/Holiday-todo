import type { WorkEvent } from '../types';

export interface MinimalEventRow {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    event_type: string;
}

export interface EventInsertPayload {
    user_id: string;
    title: string;
    start_time: string;
    end_time: string;
    event_type: string;
}

/**
 * 既存のDBイベント群と、新規保存対象イベント群の差分を計算する。
 * 比較キー: start_time + end_time + event_type + title
 */
export function computeEventDiff(
    dbRows: MinimalEventRow[],
    events: WorkEvent[],
    userId: string
): {
    toInsert: EventInsertPayload[];
    toDeleteIds: string[];
} {
    const makeKeyFromEvent = (e: WorkEvent): string => {
        const startStr = e.start instanceof Date ? e.start.toISOString() : new Date(e.start).toISOString();
        const endStr = e.end instanceof Date ? e.end.toISOString() : new Date(e.end).toISOString();
        return `${startStr}_${endStr}_${e.eventType}_${e.title}`;
    };

    const makeKeyFromRow = (r: MinimalEventRow): string => {
        const startStr = new Date(r.start_time).toISOString();
        const endStr = new Date(r.end_time).toISOString();
        return `${startStr}_${endStr}_${r.event_type}_${r.title}`;
    };

    const incomingMap = new Map<string, WorkEvent>();
    for (const e of events) {
        incomingMap.set(makeKeyFromEvent(e), e);
    }

    const dbMap = new Map<string, MinimalEventRow>();
    for (const r of dbRows || []) {
        dbMap.set(makeKeyFromRow(r), r);
    }

    const toInsert: EventInsertPayload[] = [];
    for (const [key, e] of incomingMap.entries()) {
        if (!dbMap.has(key)) {
            toInsert.push({
                user_id: userId,
                title: e.title,
                start_time: (e.start instanceof Date ? e.start : new Date(e.start)).toISOString(),
                end_time: (e.end instanceof Date ? e.end : new Date(e.end)).toISOString(),
                event_type: e.eventType
            });
        }
    }

    const toDeleteIds: string[] = [];
    for (const [key, r] of dbMap.entries()) {
        if (!incomingMap.has(key)) {
            toDeleteIds.push(r.id);
        }
    }

    return { toInsert, toDeleteIds };
}
