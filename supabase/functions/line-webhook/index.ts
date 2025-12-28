// @ts-nocheck
// Supabase Edge Function (Deno runtime)
// LINE Webhook受信用 - フォロー/アンフォロー/メッセージイベントを処理
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

/**
 * LINE Webhookイベント受信エンドポイント
 *
 * 主な機能:
 * 1. 署名検証（LINE_CHANNEL_SECRET）
 * 2. フォローイベント → ウェルカムメッセージ送信
 * 3. アンフォローイベント → ユーザーIDを削除
 * 4. メッセージイベント → リンクトークン検証・LINE連携
 */

interface LineMessageEvent {
    type: 'message'
    source: {
        type: string
        userId: string
    }
    replyToken: string
    message: {
        type: string
        text?: string
    }
}

interface LineFollowEvent {
    type: 'follow' | 'unfollow'
    source: {
        type: string
        userId: string
    }
    replyToken?: string
}

type LineEvent = LineMessageEvent | LineFollowEvent

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
 * LINEにリプライメッセージを送信
 */
async function sendReplyMessage(replyToken: string, message: string): Promise<void> {
    const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
    if (!channelAccessToken) {
        console.error('[line-webhook] LINE_CHANNEL_ACCESS_TOKEN が設定されていません')
        return
    }

    try {
        const response = await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({
                replyToken,
                messages: [{
                    type: 'text',
                    text: message,
                }],
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[line-webhook] リプライ送信失敗:', response.status, errorText)
        }
    } catch (error) {
        console.error('[line-webhook] リプライ送信エラー:', error)
    }
}

/**
 * リンクトークン形式かチェック（6桁英数字、I/Oを除く）
 */
function isLinkTokenFormat(text: string): boolean {
    return /^[0-9A-HJ-NP-Z]{6}$/i.test(text.trim())
}

/**
 * メッセージイベント処理 - リンクトークン検証
 */
async function handleMessage(
    supabase: ReturnType<typeof createClient>,
    event: LineMessageEvent
): Promise<void> {
    const lineUserId = event.source.userId
    const messageText = event.message.text?.trim()

    console.log(`[line-webhook] メッセージイベント: ${lineUserId}, text=${messageText}`)

    // テキストメッセージでない場合はスキップ
    if (event.message.type !== 'text' || !messageText) {
        return
    }

    // リンクトークン形式をチェック
    if (!isLinkTokenFormat(messageText)) {
        await sendReplyMessage(
            event.replyToken,
            '💬 Holiday Todo Appです！\n\nLINE連携するには、アプリの設定画面で発行された6桁のコードを送信してください。'
        )
        return
    }

    const token = messageText.toUpperCase()

    // トークンを検索（有効期限内、未使用）
    const { data: tokenData, error: tokenError } = await supabase
        .from('line_link_tokens')
        .select('id, user_id')
        .eq('token', token)
        .eq('used', false)
        .gt('expires_at', new Date().toISOString())
        .single()

    if (tokenError || !tokenData) {
        console.log(`[line-webhook] トークン無効または期限切れ: ${token}`)
        await sendReplyMessage(
            event.replyToken,
            '❌ このコードは無効または期限切れです。\n\nアプリの設定画面で新しいコードを発行してください。'
        )
        return
    }

    // トークンを使用済みにマーク
    await supabase
        .from('line_link_tokens')
        .update({ used: true })
        .eq('id', tokenData.id)

    // settingsテーブルのline_user_idを更新
    const { error: updateError } = await supabase
        .from('settings')
        .update({ line_user_id: lineUserId })
        .eq('user_id', tokenData.user_id)

    if (updateError) {
        console.error('[line-webhook] line_user_id更新エラー:', updateError)
        await sendReplyMessage(
            event.replyToken,
            '❌ 連携に失敗しました。もう一度お試しください。'
        )
        return
    }

    console.log(`[line-webhook] LINE連携成功: user_id=${tokenData.user_id}, lineUserId=${lineUserId}`)

    await sendReplyMessage(
        event.replyToken,
        '✅ LINE連携が完了しました！\n\n📱 Holiday Todo Appからの通知を受け取れるようになりました。\n\nアプリの設定画面を更新すると、連携状態が反映されます。'
    )
}

/**
 * フォローイベント処理 - ウェルカムメッセージ送信
 */
async function handleFollow(
    event: LineFollowEvent
): Promise<void> {
    console.log(`[line-webhook] フォローイベント: ${event.source.userId}`)

    if (event.replyToken) {
        await sendReplyMessage(
            event.replyToken,
            '👋 Holiday Todo Appの公式アカウントへようこそ！\n\n📝 LINE連携の手順:\n1. アプリの設定画面で「LINE連携」ボタンをクリック\n2. 表示された6桁のコードをこのチャットに送信\n\nこれで通知が届くようになります！'
        )
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
            case 'message':
                await handleMessage(supabase, event as LineMessageEvent)
                break
            case 'follow':
                await handleFollow(event as LineFollowEvent)
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
