import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase環境変数が設定されていません。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env.local に設定してください。');
}

/**
 * Supabaseクライアントインスタンス
 * 
 * 認証、データベース操作、リアルタイム機能へのアクセスを提供する。
 * 環境変数 VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が必要。
 * 
 * GZIP/Brotli圧縮を有効化し、レスポンスサイズを削減。
 */
/**
 * Headersオブジェクトをプレーンオブジェクトに変換
 * 
 * Supabase SDKがHeadersインスタンスを渡す場合があるため、
 * スプレッド演算子で正しくマージできるように変換する。
 */
function headersToObject(headers: HeadersInit | undefined): Record<string, string> {
    if (!headers) return {};
    if (headers instanceof Headers) {
        const obj: Record<string, string> = {};
        headers.forEach((value, key) => {
            obj[key] = value;
        });
        return obj;
    }
    if (Array.isArray(headers)) {
        return Object.fromEntries(headers);
    }
    return headers as Record<string, string>;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: (input, init) => {
            const existingHeaders = headersToObject(init?.headers);
            return fetch(input, {
                ...init,
                headers: {
                    ...existingHeaders,
                    'Accept-Encoding': 'gzip, deflate, br',
                },
            });
        },
    },
});
