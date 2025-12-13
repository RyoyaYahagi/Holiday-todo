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
    /** Googleアカウントでサインイン */
    signInWithGoogle: () => Promise<void>;
    /** サインアウト */
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 初期セッション取得
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // 認証状態の変更を監視
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session);
                setUser(session?.user ?? null);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    /**
     * Googleアカウントでサインイン
     * 
     * OAuth認証フローを開始し、Googleのログイン画面にリダイレクトする。
     * 認証成功後、アプリケーションのルートURLに戻る。
     */
    const signInWithGoogle = async () => {
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin }
        });
    };

    /**
     * サインアウト
     * 
     * 現在のセッションを終了し、ユーザーをログアウト状態にする。
     */
    const signOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, signInWithGoogle, signOut }}>
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
