import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import App from './App'
import './index.css'

/**
 * React Queryクライアント設定
 * 
 * staleTime: データが「古い」と見なされるまでの時間（5分）
 *   - この間はキャッシュからデータを返し、バックグラウンドで再取得しない
 * gcTime: 使用されていないキャッシュが破棄されるまでの時間（10分）
 * refetchOnWindowFocus: ウィンドウフォーカス時の自動再取得を無効化（手動制御のため）
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,      // 5分間はキャッシュを使用
      gcTime: 10 * 60 * 1000,        // 10分後に未使用キャッシュを破棄
      refetchOnWindowFocus: false,   // フォーカス時の自動再取得を無効化
      retry: 1,                       // リトライ1回のみ
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)
