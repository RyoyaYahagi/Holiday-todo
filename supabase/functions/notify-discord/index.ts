// @ts-nocheck
// Supabase Edge Function (Deno runtime)
// deno-lint-ignore-file no-explicit-any
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
 * 
 * イベントのstart_timeはUTCで保存されている可能性があるため、
 * JSTに変換してから日付を比較する。
 */
function isHoliday(dateStr: string, events: EventRow[]): boolean {
    // dateStrはYYYY-MM-DD形式（JST）
    const dayEvents = events.filter(e => {
        // start_timeをDateオブジェクトに変換
        const eventDate = new Date(e.start_time)
        // JSTでの日付を取得（UTC+9）
        const jstHours = eventDate.getUTCHours() + 9
        const jstDate = new Date(eventDate)
        if (jstHours >= 24) {
            jstDate.setUTCDate(jstDate.getUTCDate() + 1)
        }
        const eventDateStrJST = jstDate.toISOString().split('T')[0]
        return eventDateStrJST === dateStr
    })

    console.log(`[notify-discord] isHoliday(${dateStr}): イベント数=${dayEvents.length}`)
    if (dayEvents.length > 0) {
        console.log(`[notify-discord] isHoliday: イベント詳細=${JSON.stringify(dayEvents.slice(0, 3).map(e => ({ type: e.event_type, start: e.start_time })))}`)
    }

    // イベントがない日は休日
    if (dayEvents.length === 0) {
        console.log(`[notify-discord] isHoliday: イベントなし → 休日`)
        return true
    }
    // 「休み」イベントがある場合は休日
    if (dayEvents.some(e => e.event_type === '休み')) {
        console.log(`[notify-discord] isHoliday: 「休み」イベントあり → 休日`)
        return true
    }

    console.log(`[notify-discord] isHoliday: 勤務イベントあり → 休日ではない`)
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
        console.log('[notify-discord] Discordに送信:', content.substring(0, 100))
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content,
                username: 'Holiday Todo App',
            }),
        })
        console.log('[notify-discord] Discord応答:', response.status)
        return response.ok
    } catch (error) {
        console.error('Discord通知送信エラー:', error)
        return false
    }
}

/**
 * 現在のJST時刻をHH:mm形式で取得
 */
function getJSTTimeHHMM(): string {
    const now = new Date()
    // UTC時刻に9時間を加算してJSTを計算
    const jstHours = (now.getUTCHours() + 9) % 24
    const jstMinutes = now.getUTCMinutes()
    return `${jstHours.toString().padStart(2, '0')}:${jstMinutes.toString().padStart(2, '0')}`
}

/**
 * 現在のJST日付をYYYY-MM-DD形式で取得
 */
function getJSTDateStr(): string {
    const now = new Date()
    // UTC時刻に9時間を加算してJSTを計算
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
    // 今日の日付を計算
    if (jstHours >= 24) {
        jstDate.setUTCDate(jstDate.getUTCDate() + 1)
    }
    // 明日に進める
    jstDate.setUTCDate(jstDate.getUTCDate() + 1)
    return jstDate.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
    // OPTIONSリクエスト対応
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

    console.log(`[notify-discord] 実行開始: UTC=${now.toISOString()}, JST時刻=${currentJSTTime}, JST今日=${todayJST}, JST明日=${tomorrowJST}`)

    // 全ユーザーの設定を取得
    const { data: allSettings, error: settingsError } = await supabase
        .from('settings')
        .select('user_id, discord_webhook_url, notify_on_day_before, notify_day_before_time, notify_before_task, notify_before_task_minutes')

    if (settingsError) {
        console.error('設定取得エラー:', settingsError)
        return new Response(JSON.stringify({ error: settingsError.message }), { status: 500 })
    }

    console.log(`[notify-discord] 設定取得: ${allSettings?.length || 0}件`)

    const notifiedCount = { dayBefore: 0, taskReminder: 0 }

    for (const settings of (allSettings as SettingsRow[]) || []) {
        console.log(`[notify-discord] ユーザー処理: ${settings.user_id}, webhook=${settings.discord_webhook_url ? 'あり' : 'なし'}`)

        if (!settings.discord_webhook_url) {
            console.log('[notify-discord] Webhook URLなし、スキップ')
            continue
        }

        const userId = settings.user_id

        // 1) 前日通知のチェック
        console.log(`[notify-discord] 前日通知チェック: enabled=${settings.notify_on_day_before}, 設定時刻=${settings.notify_day_before_time}, 現在時刻=${currentJSTTime}`)

        if (settings.notify_on_day_before && settings.notify_day_before_time === currentJSTTime) {
            console.log('[notify-discord] 前日通知時刻一致！明日の休日チェック開始')

            // ユーザーのイベントを取得
            const { data: events } = await supabase
                .from('events')
                .select('user_id, event_type, start_time')
                .eq('user_id', userId)

            console.log(`[notify-discord] イベント取得: ${events?.length || 0}件`)

            // 明日の日付で休日判定（tomorrowJSTはYYYY-MM-DD形式）
            const isTomorrowHoliday = isHoliday(tomorrowJST, events as EventRow[] || [])
            console.log(`[notify-discord] 明日(${tomorrowJST})は休日: ${isTomorrowHoliday}`)

            if (isTomorrowHoliday) {
                // 明日の未完了タスクを取得
                // JST日付をUTCに変換してクエリ（DBはUTCで保存されている）
                const tomorrowStartJST = new Date(`${tomorrowJST}T00:00:00+09:00`)
                const tomorrowEndJST = new Date(`${tomorrowJST}T23:59:59+09:00`)
                const tomorrowStartUTC = tomorrowStartJST.toISOString()
                const tomorrowEndUTC = tomorrowEndJST.toISOString()

                console.log(`[notify-discord] タスク検索範囲: ${tomorrowStartUTC} ～ ${tomorrowEndUTC}`)

                const { data: tasks, error: tasksError } = await supabase
                    .from('scheduled_tasks')
                    .select('id, title, priority, scheduled_time, is_completed')
                    .eq('user_id', userId)
                    .eq('is_completed', false)
                    .gte('scheduled_time', tomorrowStartUTC)
                    .lt('scheduled_time', tomorrowEndUTC)
                    .order('scheduled_time', { ascending: true })

                console.log(`[notify-discord] 明日のタスク: ${tasks?.length || 0}件, error=${tasksError?.message || 'なし'}`)

                if (tasks && tasks.length > 0) {
                    const taskLines = tasks.map(t => {
                        const time = new Date(t.scheduled_time)
                        // JSTに変換して表示
                        const jstH = (time.getUTCHours() + 9) % 24
                        const jstM = time.getUTCMinutes()
                        return `・${jstH.toString().padStart(2, '0')}:${jstM.toString().padStart(2, '0')} - ${t.title}`
                    }).join('\n')

                    const sent = await sendDiscordNotification(
                        settings.discord_webhook_url,
                        `📅 **明日の休日スケジュール**\n${taskLines}`
                    )
                    if (sent) notifiedCount.dayBefore++
                }
            }
        }

        // 2) タスク開始前通知のチェック
        console.log(`[notify-discord] タスク通知チェック: enabled=${settings.notify_before_task}, 分前=${settings.notify_before_task_minutes}`)

        if (settings.notify_before_task && settings.notify_before_task_minutes >= 0) {
            // 現在時刻からN分後のタスクを探す
            const targetTime = new Date(now.getTime() + settings.notify_before_task_minutes * 60 * 1000)
            const targetJSTH = (targetTime.getUTCHours() + 9) % 24
            const targetJSTM = targetTime.getUTCMinutes()

            console.log(`[notify-discord] 対象時刻: ${targetJSTH}:${targetJSTM} (${settings.notify_before_task_minutes}分後)`)

            // 今日の未完了・未通知タスクを取得
            // JST日付をUTCに変換してクエリ
            const todayStartJST = new Date(`${todayJST}T00:00:00+09:00`)
            const todayEndJST = new Date(`${todayJST}T23:59:59+09:00`)
            const todayStartUTC = todayStartJST.toISOString()
            const todayEndUTC = todayEndJST.toISOString()

            const { data: tasks } = await supabase
                .from('scheduled_tasks')
                .select('id, title, priority, scheduled_time, is_completed, notified_at')
                .eq('user_id', userId)
                .eq('is_completed', false)
                .is('notified_at', null) // 未通知のものだけ
                .gte('scheduled_time', todayStartUTC)
                .lte('scheduled_time', todayEndUTC)

            console.log(`[notify-discord] 今日の未通知タスク: ${tasks?.length || 0}件`)

            for (const task of (tasks as ScheduledTaskRow[]) || []) {
                const taskTime = new Date(task.scheduled_time)
                // タスク時刻をJSTに変換
                const taskJSTH = (taskTime.getUTCHours() + 9) % 24
                const taskJSTM = taskTime.getUTCMinutes()

                console.log(`[notify-discord] タスク「${task.title}」: ${taskJSTH}:${taskJSTM}`)

                // 時間と分が一致するか確認
                if (taskJSTH === targetJSTH && taskJSTM === targetJSTM) {
                    console.log('[notify-discord] 通知タイミング到来。送信権ロックを試行...')

                    // アトミックに通知済みフラグを更新（排他制御）
                    // 成功した（更新できた）場合のみ通知処理に進む
                    const { data: updatedTask, error: updateError } = await supabase
                        .from('scheduled_tasks')
                        .update({ notified_at: new Date().toISOString() })
                        .eq('id', task.id)
                        .is('notified_at', null) // 二重チェック
                        .select()
                        .single()

                    if (updatedTask && !updateError) {
                        const taskTimeForDisplay = new Date(task.scheduled_time)
                        const taskDisplayH = (taskTimeForDisplay.getUTCHours() + 9) % 24
                        const taskDisplayM = taskTimeForDisplay.getUTCMinutes()
                        const sent = await sendDiscordNotification(
                            settings.discord_webhook_url,
                            `⏰ **タスク開始 ${settings.notify_before_task_minutes}分前**\n・${taskDisplayH.toString().padStart(2, '0')}:${taskDisplayM.toString().padStart(2, '0')} - ${task.title}`
                        )

                        if (sent) {
                            notifiedCount.taskReminder++
                        } else {
                            console.error('[notify-discord] 送信失敗。notified_atは更新済みのままスキップ')
                            // 必要ならここでnotified_atをnullに戻す処理を入れるが、再送ループを防ぐためこのままにする
                        }
                    } else {
                        console.log('[notify-discord] 既に他プロセスが処理済みのためスキップ')
                    }
                }
            }
        }
    }

    console.log(`[notify-discord] 完了: 前日通知=${notifiedCount.dayBefore}, タスク通知=${notifiedCount.taskReminder}`)

    return new Response(
        JSON.stringify({
            ok: true,
            utcTime: now.toISOString(),
            jstTime: currentJSTTime,
            jstToday: todayJST,
            jstTomorrow: tomorrowJST,
            notified: notifiedCount,
        }),
        { headers: { 'Content-Type': 'application/json' } }
    )
})

