/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Holiday Todo Scheduler',
        short_name: 'HolidayTodo',
        description: 'Smart holiday todo scheduler based on work shifts',
        theme_color: '#4a90e2',
        icons: [
          {
            src: 'logo192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'logo512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        // Custom workbox options if needed
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      },
      devOptions: {
        enabled: false // 開発中はPWAを無効化（キャッシュの問題を回避）
      }
    })
  ],
  build: {
    // チャンクサイズ警告の制限を調整
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // ベンダーライブラリを分割してメインチャンクを小さくする
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-datefns': ['date-fns']
        }
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts']
  }
})
