// @ts-nocheck
// Supabase Edge Function (Deno runtime)
// LINE Webhook受信用 - フォロー/アンフォローイベントを処理
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

/**
 * LINE Webhookイベント受信エンドポイント
 *
 * 主な機能:
 * 1. 署名検証（LINE_CHANNEL_SECRET）
 * 2. フォローイベント → ユーザーIDをDBに保存
 * 3. アンフォローイベント → ユーザーIDを削除
 */

interface LineEvent {
    type: string
    source: {
        type: string
        userId: string
    }
    replyToken?: string
}

interface LineWebhookBody {
    destination: string
    events: LineEvent[]
}

/**
 * LINE署名を検証
 */
function verifySignature(body: string, signature: string, channelSecret: string): boolean {
    const hmac = createHmac('sha256', channelSecret)
    hmac.update(body)
    const expectedSignature = hmac.digest('base64')
    return signature === expectedSignature
}

/**
 * ユーザーIDでsettingsテーブルのline_user_idを更新
 * 
 * 注意: この実装では、LINEユーザーIDとSupabaseユーザーを紐づける方法が必要です。
 * 現在の設計では、リダイレクトURLまたはLIFFを使用して認証済みユーザーと紐づけます。
 * 
 * 簡易実装: 初回はline_user_idが空のレコードを探して更新
 */
async function handleFollow(
    supabase: ReturnType<typeof createClient>,
    lineUserId: string
): Promise<void> {
    console.log(`[line-webhook] フォローイベント: ${lineUserId}`)

    // line_user_idが空のユーザーを探して更新
    // 本番環境では、LIFFや認証フローで正確にマッピングすることを推奨
    const { data: emptySettings, error: findError } = await supabase
        .from('settings')
        .select('user_id')
        .or('line_user_id.is.null,line_user_id.eq.')
        .limit(1)
        .single()

    if (findError) {
        console.log('[line-webhook] 空のsettingsが見つかりません、新規ユーザーの可能性')
        // 新規の場合は何もしない（ユーザーがアプリにログイン後に設定が作成される）
        return
    }

    const { error: updateError } = await supabase
        .from('settings')
        .update({ line_user_id: lineUserId })
        .eq('user_id', emptySettings.user_id)

    if (updateError) {
        console.error('[line-webhook] line_user_id更新エラー:', updateError)
    } else {
        console.log(`[line-webhook] line_user_id更新成功: user_id=${emptySettings.user_id}`)
    }
}

/**
 * アンフォロー時にline_user_idをクリア
 */
async function handleUnfollow(
    supabase: ReturnType<typeof createClient>,
    lineUserId: string
): Promise<void> {
    console.log(`[line-webhook] アンフォローイベント: ${lineUserId}`)

    const { error } = await supabase
        .from('settings')
        .update({ line_user_id: '' })
        .eq('line_user_id', lineUserId)

    if (error) {
        console.error('[line-webhook] line_user_idクリアエラー:', error)
    } else {
        console.log('[line-webhook] line_user_idクリア成功')
    }
}

Deno.serve(async (req) => {
    // OPTIONSリクエスト対応（CORS）
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Line-Signature',
            },
        })
    }

    // POSTのみ受け付け
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
    }

    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET')
    if (!channelSecret) {
        console.error('[line-webhook] LINE_CHANNEL_SECRET が設定されていません')
        return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 })
    }

    // 署名取得
    const signature = req.headers.get('x-line-signature')
    if (!signature) {
        console.error('[line-webhook] X-Line-Signature ヘッダーがありません')
        return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 })
    }

    // リクエストボディ取得
    const bodyText = await req.text()

    // 署名検証
    if (!verifySignature(bodyText, signature, channelSecret)) {
        console.error('[line-webhook] 署名検証失敗')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 })
    }

    // ボディをパース
    let body: LineWebhookBody
    try {
        body = JSON.parse(bodyText)
    } catch (e) {
        console.error('[line-webhook] JSONパースエラー:', e)
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
    }

    console.log(`[line-webhook] イベント受信: ${body.events.length}件`)

    // Supabaseクライアント初期化
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // イベント処理
    for (const event of body.events) {
        console.log(`[line-webhook] イベントタイプ: ${event.type}`)

        switch (event.type) {
            case 'follow':
                await handleFollow(supabase, event.source.userId)
                break
            case 'unfollow':
                await handleUnfollow(supabase, event.source.userId)
                break
            default:
                console.log(`[line-webhook] 未対応のイベントタイプ: ${event.type}`)
        }
    }

    // LINEには常に200を返す
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    })
})
