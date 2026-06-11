import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * 認証コンテキストの型定義
 * 
 * ユーザー情報、セッション、認証状態、認証操作メソッドを提供する。
 */
interface AuthContextType {
    /** 現在のログインユーザー。未ログイン時はnull */
    user: User | null;
    /** 現在のセッション。未ログイン時はnull */
    session: Session | null;
    /** 認証状態の読み込み中フラグ */
    loading: boolean;
    /** Googleのアクセストークン（Calendar API用） */
    providerToken: string | null;
    /** ゲスト（匿名）ユーザーかどうか */
    isGuest: boolean;
    /** Supabaseに接続できず、ローカル保存で動作しているかどうか */
    isLocalMode: boolean;
    /** Googleアカウントでサインイン */
    signInWithGoogle: () => Promise<void>;
    /** ゲストとしてサインイン */
    signInAsGuest: () => Promise<void>;
    /** サインアウト */
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(new Error('Supabase認証の確認がタイムアウトしました'));
        }, timeoutMs);

        promise
            .then(resolve)
            .catch(reject)
            .finally(() => window.clearTimeout(timeoutId));
    });
}

/**
 * 認証プロバイダーコンポーネント
 * 
 * アプリケーション全体で認証状態を共有するためのContext Provider。
 * Supabaseの認証状態変更を監視し、自動的に状態を更新する。
 * 
 * @param children 子コンポーネント
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [providerToken, setProviderToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isLocalMode, setIsLocalMode] = useState(false);

    // ゲストユーザーかどうかを判定
    const isGuest = user?.is_anonymous ?? false;

    useEffect(() => {
        // 初期セッション取得
        withTimeout(supabase.auth.getSession(), AUTH_TIMEOUT_MS)
            .then(({ data: { session } }) => {
                setSession(session);
                setUser(session?.user ?? null);
                setProviderToken(session?.provider_token ?? null);
                setIsLocalMode(false);
            })
            .catch((error) => {
                console.error('Supabase認証の初期化に失敗しました。ローカル保存モードで起動します。', error);
                setSession(null);
                setUser(null);
                setProviderToken(null);
                setIsLocalMode(true);
            })
            .finally(() => setLoading(false));

        // 認証状態の変更を監視
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
                setProviderToken(session?.provider_token ?? null);
                setIsLocalMode(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    /**
     * Googleアカウントでサインイン
     * 
     * OAuth認証フローを開始し、Googleのログイン画面にリダイレクトする。
     * 認証成功後、現在開いているURLのオリジンに戻る（動的）。
     * Google Calendar APIアクセス用のスコープも要求する。
     */
    const signInWithGoogle = async () => {
        if (isLocalMode) {
            throw new Error('Supabaseに接続できないため、Googleログインは現在利用できません');
        }

        const redirectUrl = `${window.location.origin}/auth/callback`;

        console.log('OAuth redirect URL:', redirectUrl);

        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectUrl,
                scopes: 'https://www.googleapis.com/auth/calendar.readonly',
            },
        });
    };

    /**
     * ゲストとしてサインイン（匿名認証）
     * 
     * アカウント登録なしでアプリを試用できる。
     * ゲストデータはブラウザセッション終了まで保持される。
     */
    const signInAsGuest = async () => {
        if (isLocalMode) {
            throw new Error('Supabaseに接続できないため、ゲストログインは現在利用できません');
        }

        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
            console.error('ゲストログインエラー:', error);
            throw error;
        }
    };

    /**
     * サインアウト
     * 
     * 現在のセッションを終了し、ユーザーをログアウト状態にする。
     */
    const signOut = async () => {
        if (isLocalMode) {
            return;
        }

        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, providerToken, isGuest, isLocalMode, signInWithGoogle, signInAsGuest, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * 認証コンテキストを使用するカスタムフック
 * 
 * AuthProvider内でのみ使用可能。
 * 
 * @returns 認証コンテキストの値
 * @throws AuthProvider外で呼び出された場合
 */
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth は AuthProvider 内で使用してください');
    }
    return context;
}
