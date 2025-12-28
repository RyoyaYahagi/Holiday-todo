// @ts-nocheck
// Supabase Edge Function (Deno runtime)
// LINE連携用リンクトークン生成

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * LINE連携用のリンクトークンを生成するAPI
 *
 * 主な機能:
 * 1. 認証済みユーザーのみアクセス可能
 * 2. 6桁のユニークなトークンを生成
 * 3. 既存の未使用トークンを無効化（削除）
 * 4. トークンの有効期限は10分
 */

// 6桁のランダムコードを生成（紛らわしい文字を除外）
function generateLinkCode(): string {
    const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ' // I, O を除外
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}

Deno.serve(async (req) => {
    // CORS対応
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
            },
        })
    }

    // Supabaseクライアント初期化
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 認証ヘッダーからユーザー情報取得
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
        return new Response(JSON.stringify({ error: '認証が必要です' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
        return new Response(JSON.stringify({ error: '認証に失敗しました' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        })
    }

    // GET: 連携状態を確認（ポーリング用）
    if (req.method === 'GET') {
        try {
            // settingsからline_user_idを取得
            const { data: settings } = await supabase
                .from('settings')
                .select('line_user_id')
                .eq('user_id', user.id)
                .single()

            if (settings?.line_user_id) {
                return new Response(JSON.stringify({
                    linked: true,
                    lineUserId: settings.line_user_id,
                }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                })
            }

            // 有効なトークンがあるかチェック
            const { data: activeToken } = await supabase
                .from('line_link_tokens')
                .select('token, expires_at')
                .eq('user_id', user.id)
                .eq('used', false)
                .gt('expires_at', new Date().toISOString())
                .single()

            return new Response(JSON.stringify({
                linked: false,
                hasActiveToken: !!activeToken,
                token: activeToken?.token || null,
                expiresAt: activeToken?.expires_at || null,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        } catch (error) {
            console.error('[generate-line-token] GET error:', error)
            return new Response(JSON.stringify({ error: 'サーバーエラー' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            })
        }
    }

    // POST: 新しいトークンを生成
    if (req.method === 'POST') {
        try {
            // 既存の未使用トークンを削除
            await supabase
                .from('line_link_tokens')
                .delete()
                .eq('user_id', user.id)
                .eq('used', false)

            // 新しいトークンを生成
            const linkToken = generateLinkCode()
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10分間有効

            const { data: newToken, error: insertError } = await supabase
                .from('line_link_tokens')
                .insert({
                    user_id: user.id,
                    token: linkToken,
                    expires_at: expiresAt.toISOString(),
                })
                .select()
                .single()

            if (insertError) {
                console.error('[generate-line-token] Insert error:', insertError)
                return new Response(JSON.stringify({ error: 'トークン生成に失敗しました' }), {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' },
                })
            }

            console.log(`[generate-line-token] Token generated for user: ${user.id}`)

            return new Response(JSON.stringify({
                token: newToken.token,
                expiresAt: newToken.expires_at,
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            })
        } catch (error) {
            console.error('[generate-line-token] POST error:', error)
            return new Response(JSON.stringify({ error: 'サーバーエラー' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            })
        }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
    })
})
