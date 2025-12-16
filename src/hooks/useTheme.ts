import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

/**
 * テーマ管理カスタムフック
 * 
 * ライト、ダーク、システム設定の3モードに対応。
 * LocalStorageに設定を保存し、html要素のdata-theme属性を更新。
 */
export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(() => {
        const saved = localStorage.getItem('theme') as Theme;
        return saved || 'system';
    });

    /**
     * html要素にdata-theme属性を設定
     */
    const applyTheme = useCallback((newTheme: Theme) => {
        const root = document.documentElement;

        if (newTheme === 'system') {
            // システム設定に従う（data-theme属性を削除してメディアクエリに任せる）
            root.removeAttribute('data-theme');
        } else {
            root.setAttribute('data-theme', newTheme);
        }
    }, []);

    /**
     * テーマを変更
     */
    const setTheme = useCallback((newTheme: Theme) => {
        setThemeState(newTheme);
        localStorage.setItem('theme', newTheme);
        applyTheme(newTheme);
    }, [applyTheme]);

    // 初回マウント時にテーマを適用
    useEffect(() => {
        applyTheme(theme);
    }, [theme, applyTheme]);

    /**
     * 現在の実際のテーマを取得（system設定の場合はシステムの設定を考慮）
     */
    const getEffectiveTheme = useCallback((): 'light' | 'dark' => {
        if (theme === 'system') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
    }, [theme]);

    return {
        theme,
        setTheme,
        getEffectiveTheme,
        isDark: getEffectiveTheme() === 'dark'
    };
}
