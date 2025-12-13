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
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
