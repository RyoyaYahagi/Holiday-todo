import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Discord通知Cronハンドラ
 *
 * 定期的に全ユーザーの設定とスケジュール済みタスクをチェックし、
 * 条件に該当する場合にDiscord Webhookへ通知を送信する。
 *
 * 通知条件:
 * 1. 前日通知 (notifyOnDayBefore): 設定時刻に翌日が休日ならスケジュール送信
 * 2. タスク開始前通知 (notifyBeforeTask): タスク開始N分前に通知
 */

interface SettingsRow {
    user_id: string
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
function isHoliday(date: Date, events: EventRow[]): boolean {
    const dateStr = date.toISOString().split('T')[0]
    const dayEvents = events.filter(e => e.start_time.startsWith(dateStr))

    if (dayEvents.length === 0) return true
    if (dayEvents.some(e => e.event_type === '休み')) return true

    return false
}

/**
 * Discord Webhookへ通知を送信
 */
async function sendDiscordNotification(
    webhookUrl: string,
    content: string
): Promise<boolean> {
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                username: 'Holiday Todo App',
            }),
        })
        return response.ok
    } catch (error) {
        console.error('Discord通知送信エラー:', error)
        return false
    }
}

/**
 * 時刻をHH:mm形式で取得（JST）
 */
function getCurrentTimeHHMM(): string {
    const now = new Date()
    // JSTに変換（UTC+9）
    const jstOffset = 9 * 60 * 60 * 1000
    const jstTime = new Date(now.getTime() + jstOffset)
    const hours = jstTime.getUTCHours().toString().padStart(2, '0')
    const minutes = jstTime.getUTCMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
}

/**
 * 現在時刻をJSTで取得
 */
function getJSTNow(): Date {
    const now = new Date()
    const jstOffset = 9 * 60 * 60 * 1000
    return new Date(now.getTime() + jstOffset)
}

Deno.serve(async (req) => {
    // OPTIONSリクエスト対応
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const jstNow = getJSTNow()
    const currentHHMM = getCurrentTimeHHMM()
    const currentMinute = jstNow.getUTCMinutes()

    console.log(`[notify-discord] 実行開始: ${jstNow.toISOString()} (JST ${currentHHMM})`)

    // 全ユーザーの設定を取得
    const { data: allSettings, error: settingsError } = await supabase
        .from('settings')
        .select('user_id, discord_webhook_url, notify_on_day_before, notify_day_before_time, notify_before_task, notify_before_task_minutes')

    if (settingsError) {
        console.error('設定取得エラー:', settingsError)
        return new Response(JSON.stringify({ error: settingsError.message }), { status: 500 })
    }

    const notifiedCount = { dayBefore: 0, taskReminder: 0 }

    for (const settings of (allSettings as SettingsRow[]) || []) {
        if (!settings.discord_webhook_url) continue

        const userId = settings.user_id

        // 1) 前日通知のチェック
        if (settings.notify_on_day_before && settings.notify_day_before_time === currentHHMM) {
            // 明日の日付
            const tomorrow = new Date(jstNow)
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
            const tomorrowStr = tomorrow.toISOString().split('T')[0]

            // ユーザーのイベントを取得
            const { data: events } = await supabase
                .from('events')
                .select('user_id, event_type, start_time')
                .eq('user_id', userId)

            if (isHoliday(tomorrow, events as EventRow[] || [])) {
                // 明日の未完了タスクを取得
                const { data: tasks } = await supabase
                    .from('scheduled_tasks')
                    .select('id, title, priority, scheduled_time, is_completed')
                    .eq('user_id', userId)
                    .eq('is_completed', false)
                    .gte('scheduled_time', `${tomorrowStr}T00:00:00`)
                    .lt('scheduled_time', `${tomorrowStr}T23:59:59`)
                    .order('scheduled_time', { ascending: true })

                if (tasks && tasks.length > 0) {
                    const taskLines = tasks.map(t => {
                        const time = new Date(t.scheduled_time)
                        const hh = time.getUTCHours().toString().padStart(2, '0')
                        const mm = time.getUTCMinutes().toString().padStart(2, '0')
                        return `・${hh}:${mm} - ${t.title} (優先度: ${t.priority})`
                    }).join('\n')

                    await sendDiscordNotification(
                        settings.discord_webhook_url,
                        `📅 **明日の休日スケジュール**\n${taskLines}`
                    )
                    notifiedCount.dayBefore++
                }
            }
        }

        // 2) タスク開始前通知のチェック
        if (settings.notify_before_task && settings.notify_before_task_minutes > 0) {
            // N分後のタスクを探す
            const targetTime = new Date(jstNow)
            targetTime.setUTCMinutes(targetTime.getUTCMinutes() + settings.notify_before_task_minutes)

            // 同じ分のタスクを検索（秒は無視）
            const targetMinute = targetTime.getUTCMinutes()
            const targetHour = targetTime.getUTCHours()
            const targetDateStr = targetTime.toISOString().split('T')[0]

            const { data: tasks } = await supabase
                .from('scheduled_tasks')
                .select('id, title, priority, scheduled_time, is_completed, notified_at')
                .eq('user_id', userId)
                .eq('is_completed', false)
                .gte('scheduled_time', `${targetDateStr}T00:00:00`)
                .lte('scheduled_time', `${targetDateStr}T23:59:59`)

            for (const task of (tasks as ScheduledTaskRow[]) || []) {
                const taskTime = new Date(task.scheduled_time)
                const taskHour = taskTime.getUTCHours()
                const taskMinute = taskTime.getUTCMinutes()

                // 時間と分が一致するか確認
                if (taskHour === targetHour && taskMinute === targetMinute) {
                    // 既に通知済みでないか確認
                    if (!task.notified_at) {
                        await sendDiscordNotification(
                            settings.discord_webhook_url,
                            `⏰ **タスク開始 ${settings.notify_before_task_minutes}分前**\n・${task.title} (優先度: ${task.priority})`
                        )

                        // 通知済みとしてマーク
                        await supabase
                            .from('scheduled_tasks')
                            .update({ notified_at: new Date().toISOString() })
                            .eq('id', task.id)

                        notifiedCount.taskReminder++
                    }
                }
            }
        }
    }

    console.log(`[notify-discord] 完了: 前日通知=${notifiedCount.dayBefore}, タスク通知=${notifiedCount.taskReminder}`)

    return new Response(
        JSON.stringify({
            ok: true,
            timestamp: jstNow.toISOString(),
            notified: notifiedCount,
        }),
        { headers: { 'Content-Type': 'application/json' } }
    )
})
