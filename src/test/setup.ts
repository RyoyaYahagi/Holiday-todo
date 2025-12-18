import '@testing-library/jest-dom';
import { vi } from 'vitest';

// window.matchMediaモック（JSDOMはmatchMediaをサポートしていない）
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    })),
});

// Vite環境変数をモック
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

// Supabaseモジュールをモック
vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
            onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
            signInWithOAuth: vi.fn(),
            signInAnonymously: vi.fn(),
            signOut: vi.fn(),
        },
    },
}));

// AuthContextをモック
vi.mock('../contexts/AuthContext', () => ({
    useAuth: vi.fn().mockReturnValue({
        user: null,
        session: null,
        loading: false,
        providerToken: null,
        isGuest: false,
        signInWithGoogle: vi.fn(),
        signInAsGuest: vi.fn(),
        signOut: vi.fn(),
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
