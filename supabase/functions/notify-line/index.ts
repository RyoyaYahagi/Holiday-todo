// @ts-nocheck
// Supabase Edge Function (Deno runtime)
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * LINE/Discord通知Cronハンドラ
 *
 * 定期的に全ユーザーの設定とスケジュール済みタスクをチェックし、
 * 条件に該当する場合にLINE Messaging APIへ通知を送信する。
 * LINE APIが失敗した場合（上限到達など）はDiscord Webhookへフォールバック。
 *
 * 通知条件:
 * 1. 前日通知 (notifyOnDayBefore): 設定時刻に翌日が休日ならスケジュール送信
 * 2. タスク開始前通知 (notifyBeforeTask): タスク開始N分前に通知
 */

interface SettingsRow {
    user_id: string
    notification_method: string
    line_user_id: string
    discord_webhook_url: string
    notify_on_day_before: boolean
    notify_day_before_time: string
    notify_before_task: boolean
    notify_before_task_minutes: number
}

interface ScheduledTaskRow {
    id: string
    user_id: string
    title: string
    priority: number
    scheduled_time: string
    is_completed: boolean
    notified_at: string | null
}

interface EventRow {
    user_id: string
    event_type: string
    start_time: string
}

/**
 * 指定日が休日かを判定
 */
function isHoliday(dateStr: string, events: EventRow[]): boolean {
    const dayEvents = events.filter(e => {
        const eventDate = new Date(e.start_time)
        const jstHours = eventDate.getUTCHours() + 9
        const jstDate = new Date(eventDate)
        if (jstHours >= 24) {
            jstDate.setUTCDate(jstDate.getUTCDate() + 1)
        }
        const eventDateStrJST = jstDate.toISOString().split('T')[0]
        return eventDateStrJST === dateStr
    })

    console.log(`[notify-line] isHoliday(${dateStr}): イベント数=${dayEvents.length}`)

    if (dayEvents.length === 0) {
        return true
    }
    if (dayEvents.some(e => e.event_type === '休み')) {
        return true
    }

    return false
}

/**
 * LINE Messaging APIへ通知を送信
 * 環境変数からトークンを取得
 * 
 * @returns true=成功, false=失敗（フォールバックが必要）
 */
async function sendLineNotification(
    userId: string,
    content: string
): Promise<boolean> {
    const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')

    if (!channelAccessToken) {
        console.error('[notify-line] LINE_CHANNEL_ACCESS_TOKEN が設定されていません')
        return false
    }

    if (!userId) {
        console.log('[notify-line] line_user_idが未設定、スキップ')
        return false
    }

    try {
        console.log('[notify-line] LINEに送信:', content.substring(0, 100))
        const response = await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${channelAccessToken}`,
            },
            body: JSON.stringify({
                to: userId,
                messages: [{
                    type: 'text',
                    text: content,
                }],
            }),
        })
        console.log('[notify-line] LINE応答:', response.status)

        if (response.status === 429) {
            console.log('[notify-line] LINE API上限到達（429）')
            return false
        }

        if (!response.ok) {
            const errorBody = await response.text()
            console.error('[notify-line] LINEエラー詳細:', errorBody)
            return false
        }
        return true
    } catch (error) {
        console.error('LINE通知送信エラー:', error)
        return false
    }
}

/**
 * Discord Webhookへ通知を送信（フォールバック用）
 */
async function sendDiscordNotification(
    webhookUrl: string,
    content: string
): Promise<boolean> {
    if (!webhookUrl) {
        console.log('[notify-line] Discord Webhook URLなし、スキップ')
        return false
    }

    try {
        console.log('[notify-line] Discordにフォールバック送信:', content.substring(0, 100))
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: content,
            }),
        })
        console.log('[notify-line] Discord応答:', response.status)
        return response.ok
    } catch (error) {
        console.error('Discord通知送信エラー:', error)
        return false
    }
}

/**
 * 通知送信（ユーザーの設定に基づいて送信先を決定）
 */
async function sendNotification(
    notificationMethod: string,
    lineUserId: string,
    discordWebhookUrl: string,
    content: string
): Promise<{ success: boolean; channel: 'line' | 'discord' | 'none' }> {
    // ユーザーが選択した通知方法に基づいて送信
    if (notificationMethod === 'discord') {
        // Discordが選択されている場合
        if (discordWebhookUrl) {
            const discordSent = await sendDiscordNotification(discordWebhookUrl, content)
            if (discordSent) {
                return { success: true, channel: 'discord' }
            }
        }
        return { success: false, channel: 'none' }
    }

    // LINEが選択されている場合（デフォルト）
    if (lineUserId) {
        const lineSent = await sendLineNotification(lineUserId, content)
        if (lineSent) {
            return { success: true, channel: 'line' }
        }
    }

    // LINEが失敗した場合、Discordにフォールバック
    if (discordWebhookUrl) {
        const discordSent = await sendDiscordNotification(discordWebhookUrl, content)
        if (discordSent) {
            return { success: true, channel: 'discord' }
        }
    }

    return { success: false, channel: 'none' }
}

/**
 * 現在のJST時刻をHH:mm形式で取得
 */
function getJSTTimeHHMM(): string {
    const now = new Date()
    const jstHours = (now.getUTCHours() + 9) % 24
    const jstMinutes = now.getUTCMinutes()
    return `${jstHours.toString().padStart(2, '0')}:${jstMinutes.toString().padStart(2, '0')}`
}

/**
 * 現在のJST日付をYYYY-MM-DD形式で取得
 */
function getJSTDateStr(): string {
    const now = new Date()
    const jstHours = now.getUTCHours() + 9
    const jstDate = new Date(now)
    if (jstHours >= 24) {
        jstDate.setUTCDate(jstDate.getUTCDate() + 1)
    }
    return jstDate.toISOString().split('T')[0]
}

/**
 * 明日のJST日付をYYYY-MM-DD形式で取得
 */
function getJSTTomorrowDateStr(): string {
    const now = new Date()
    const jstHours = now.getUTCHours() + 9
    const jstDate = new Date(now)
    if (jstHours >= 24) {
        jstDate.setUTCDate(jstDate.getUTCDate() + 1)
    }
    jstDate.setUTCDate(jstDate.getUTCDate() + 1)
    return jstDate.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const now = new Date()
    const currentJSTTime = getJSTTimeHHMM()
    const todayJST = getJSTDateStr()
    const tomorrowJST = getJSTTomorrowDateStr()

    console.log(`[notify-line] 実行開始: UTC=${now.toISOString()}, JST時刻=${currentJSTTime}`)

    // 全ユーザーの設定を取得
    const { data: allSettings, error: settingsError } = await supabase
        .from('settings')
        .select('user_id, notification_method, line_user_id, discord_webhook_url, notify_on_day_before, notify_day_before_time, notify_before_task, notify_before_task_minutes')

    if (settingsError) {
        console.error('設定取得エラー:', settingsError)
        return new Response(JSON.stringify({ error: settingsError.message }), { status: 500 })
    }

    console.log(`[notify-line] 設定取得: ${allSettings?.length || 0}件`)

    const notifiedCount = { line: 0, discord: 0, failed: 0 }

    for (const settings of (allSettings as SettingsRow[]) || []) {
        console.log(`[notify-line] ユーザー処理: ${settings.user_id}`)

        // LINE User IDもDiscord Webhook URLもない場合はスキップ
        if (!settings.line_user_id && !settings.discord_webhook_url) {
            console.log('[notify-line] 通知設定なし、スキップ')
            continue
        }

        const userId = settings.user_id

        // 1) 前日通知のチェック
        if (settings.notify_on_day_before && settings.notify_day_before_time === currentJSTTime) {
            console.log('[notify-line] 前日通知時刻一致！')

            const { data: events } = await supabase
                .from('events')
                .select('user_id, event_type, start_time')
                .eq('user_id', userId)

            const isTomorrowHoliday = isHoliday(tomorrowJST, events as EventRow[] || [])

            if (isTomorrowHoliday) {
                const tomorrowStartJST = new Date(`${tomorrowJST}T00:00:00+09:00`)
                const tomorrowEndJST = new Date(`${tomorrowJST}T23:59:59+09:00`)

                const { data: tasks } = await supabase
                    .from('scheduled_tasks')
                    .select('id, title, priority, scheduled_time, is_completed')
                    .eq('user_id', userId)
                    .eq('is_completed', false)
                    .gte('scheduled_time', tomorrowStartJST.toISOString())
                    .lt('scheduled_time', tomorrowEndJST.toISOString())
                    .order('scheduled_time', { ascending: true })

                if (tasks && tasks.length > 0) {
                    const taskLines = tasks.map(t => {
                        const time = new Date(t.scheduled_time)
                        const jstH = (time.getUTCHours() + 9) % 24
                        const jstM = time.getUTCMinutes()
                        return `・${jstH.toString().padStart(2, '0')}:${jstM.toString().padStart(2, '0')} - ${t.title}`
                    }).join('\n')

                    const result = await sendNotification(
                        settings.notification_method ?? 'line',
                        settings.line_user_id,
                        settings.discord_webhook_url,
                        `📅 明日の休日スケジュール\n${taskLines}`
                    )

                    if (result.channel === 'line') notifiedCount.line++
                    else if (result.channel === 'discord') notifiedCount.discord++
                    else notifiedCount.failed++
                }
            }
        }

        // 2) タスク開始前通知のチェック
        if (settings.notify_before_task && settings.notify_before_task_minutes >= 0) {
            const targetTime = new Date(now.getTime() + settings.notify_before_task_minutes * 60 * 1000)
            const targetJSTH = (targetTime.getUTCHours() + 9) % 24
            const targetJSTM = targetTime.getUTCMinutes()

            const todayStartJST = new Date(`${todayJST}T00:00:00+09:00`)
            const todayEndJST = new Date(`${todayJST}T23:59:59+09:00`)

            const { data: tasks } = await supabase
                .from('scheduled_tasks')
                .select('id, title, priority, scheduled_time, is_completed, notified_at')
                .eq('user_id', userId)
                .eq('is_completed', false)
                .is('notified_at', null)
                .gte('scheduled_time', todayStartJST.toISOString())
                .lte('scheduled_time', todayEndJST.toISOString())

            for (const task of (tasks as ScheduledTaskRow[]) || []) {
                const taskTime = new Date(task.scheduled_time)
                const taskJSTH = (taskTime.getUTCHours() + 9) % 24
                const taskJSTM = taskTime.getUTCMinutes()

                if (taskJSTH === targetJSTH && taskJSTM === targetJSTM) {
                    const { data: updatedTask, error: updateError } = await supabase
                        .from('scheduled_tasks')
                        .update({ notified_at: new Date().toISOString() })
                        .eq('id', task.id)
                        .is('notified_at', null)
                        .select()
                        .single()

                    if (updatedTask && !updateError) {
                        const taskDisplayH = (taskTime.getUTCHours() + 9) % 24
                        const taskDisplayM = taskTime.getUTCMinutes()

                        const result = await sendNotification(
                            settings.notification_method ?? 'line',
                            settings.line_user_id,
                            settings.discord_webhook_url,
                            `⏰ タスク開始 ${settings.notify_before_task_minutes}分前\n・${taskDisplayH.toString().padStart(2, '0')}:${taskDisplayM.toString().padStart(2, '0')} - ${task.title}`
                        )

                        if (result.channel === 'line') notifiedCount.line++
                        else if (result.channel === 'discord') notifiedCount.discord++
                        else notifiedCount.failed++
                    }
                }
            }
        }
    }

    console.log(`[notify-line] 完了: LINE=${notifiedCount.line}, Discord=${notifiedCount.discord}, 失敗=${notifiedCount.failed}`)

    return new Response(
        JSON.stringify({
            ok: true,
            utcTime: now.toISOString(),
            jstTime: currentJSTTime,
            notified: notifiedCount,
        }),
        { headers: { 'Content-Type': 'application/json' } }
    )
})
