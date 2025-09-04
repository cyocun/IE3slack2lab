import { Hono } from 'hono'
import type { Bindings, LabEntry, ThreadData } from './types'
import { verifySlackSignature, parseMessage, getSlackFile, sendSlackMessage, detectThreadCommand } from './utils/slack'
import { uploadToGitHub, getCurrentJsonData, updateJsonOnGitHub } from './utils/github'
import { storeThreadData, getThreadData, deleteThreadData, updateEntryById, deleteEntryById } from './utils/kv'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * イベント処理用メインSlack Webhookエンドポイント
 */
app.post('/slack/events', async (c) => {
  const env = c.env

  try {
    const signature = c.req.header('X-Slack-Signature') ?? ''
    const timestamp = c.req.header('X-Slack-Request-Timestamp') ?? ''
    const bodyText = await c.req.text()

    if (!(await verifySlackSignature(signature, timestamp, bodyText, env.SLACK_SIGNING_SECRET))) {
      return c.text('Unauthorized', 401)
    }

    let body: any
    try {
      body = JSON.parse(bodyText)
    } catch {
      return bodyText.includes('Request for Retry') ? c.text('OK') : c.text('Invalid JSON', 400)
    }

    if (body.type === 'url_verification') {
      return c.text(body.challenge)
    }

    const event = body.event
    
    // ボットメッセージを除外
    if (event.bot_id || event.type !== 'message') {
      return c.text('OK')
    }

    // スレッドメッセージの場合
    if (event.thread_ts) {
      return handleThreadMessage(c, env, event)
    }

    // 通常メッセージ（画像付き）の場合
    const file = event?.files?.[0]
    if (!file || !file.mimetype?.startsWith('image/')) {
      return c.text('OK')
    }

    try {
      const { title, date, url } = parseMessage(event.text || '')

      // エラー時にもスレッドデータを保存（修正投稿用）
      if (!date || !/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
        const threadData: ThreadData = {
          messageTs: event.ts,
          channel: event.channel,
          createdAt: new Date().toISOString(),
          pendingFile: {
            url: file.url_private_download,
            name: file.name,
            mimetype: file.mimetype
          },
          metadata: { title, date, url }
        }
        await storeThreadData(env, event.ts, threadData)

        if (!date) {
          const formatExample = `❌ 日付が指定されていません

**正しい形式**:
• \`date: 20241225\` (YYYYMMDD形式)
• \`date: 1225\` (MMDD形式、現在年自動設定)

**例**:
\`\`\`
date: 20241225
title: 新商品リリース  
link: https://example.com
\`\`\`

このスレッドで正しい形式を投稿すると、画像がアップロードされます。`
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, formatExample)
          return c.text('OK')
        }

        const formatExample = `❌ 日付フォーマットが正しくありません

**受け取った値**: \`${date}\`

**正しい形式**:
• \`date: 20241225\` (YYYYMMDD形式)  
• \`date: 1225\` (MMDD形式、現在年自動設定)

**例**:
\`\`\`
date: 20241225
title: 新商品リリース
link: https://example.com
\`\`\`

このスレッドで正しい形式を投稿すると、画像がアップロードされます。`
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, formatExample)
        return c.text('OK')
      }

      const imageBuffer = await getSlackFile(file.url_private_download, env.SLACK_BOT_TOKEN)
      const timestamp = Date.now()
      const [year, month] = date.split('/')
      const fileName = `${timestamp}_${file.name}`
      const fullPath = `${year}/${month}/${fileName}`

      const currentData = await getCurrentJsonData(env)
      const newId = currentData.length ? Math.max(...currentData.map(item => item.id)) + 1 : 1
      const newEntry: LabEntry = {
        id: newId,
        image: `/${env.IMAGE_PATH}${fullPath}`,
        title: title || '',
        datetime: date.replace(/\//g, '-'),
        link: url || ''
      }

      await uploadToGitHub(env, fullPath, imageBuffer, [newEntry, ...currentData])
      
      // スレッドデータを保存（編集・削除用）
      const threadData: ThreadData = {
        entryId: newId,
        messageTs: event.ts,
        channel: event.channel,
        createdAt: new Date().toISOString()
      }
      await storeThreadData(env, event.ts, threadData)
      
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, `✅ アップロード完了: ${fileName}\n\nこのスレッドで \`delete\` または \`削除\` と投稿すると削除、メタデータ形式で投稿すると更新できます。`)
    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      let detailedError = `❌ エラー: ${errorMessage}`
      if (errorStack) {
        const stackLines = errorStack.split('\n').slice(0, 3)
        detailedError += `\n\`\`\`\n${stackLines.join('\n')}\n\`\`\``
      }
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, detailedError)
    }

    return c.text('OK')
  } catch (error) {
    console.error('Unexpected error in Slack webhook:', error)
    return c.text('Internal Server Error', 500)
  }
})

/**
 * スレッドメッセージ処理
 */
async function handleThreadMessage(c: any, env: Bindings, event: any) {
  try {
    // スレッドデータを取得
    const threadData = await getThreadData(env, event.thread_ts)
    if (!threadData) {
      // スレッドが見つからない場合は何もしない
      return c.text('OK')
    }

    const command = detectThreadCommand(event.text || '')
    
    if (command === 'delete') {
      if (!threadData.entryId) {
        // アップロード前の削除（保留データの削除）
        await deleteThreadData(env, event.thread_ts)
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
          `✅ 保留中の画像アップロードをキャンセルしました`)
        return c.text('OK')
      }
      
      // アップロード済みエントリの削除処理
      const currentData = await getCurrentJsonData(env)
      const updatedData = deleteEntryById(currentData, threadData.entryId)
      
      await updateJsonOnGitHub(env, updatedData, `Delete lab entry ID: ${threadData.entryId}`)
      await deleteThreadData(env, event.thread_ts)
      
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
        `✅ エントリID ${threadData.entryId} を削除しました`)
      
    } else if (command === 'update') {
      // 更新処理
      const { title, date, url } = parseMessage(event.text || '')
      
      // 保留中の画像アップロードの場合
      if (!threadData.entryId && threadData.pendingFile) {
        if (!date) {
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
            '❌ 画像をアップロードするには日付が必要です。`date: YYYYMMDD` または `date: MMDD` を指定してください。')
          return c.text('OK')
        }
        
        if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
          const formatExample = `❌ 日付フォーマットが正しくありません

**受け取った値**: \`${date}\`

**正しい形式**:
• \`date: 20241225\` (YYYYMMDD形式)  
• \`date: 1225\` (MMDD形式、現在年自動設定)`
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, formatExample)
          return c.text('OK')
        }
        
        // 保留中の画像をアップロード
        try {
          const imageBuffer = await getSlackFile(threadData.pendingFile.url, env.SLACK_BOT_TOKEN)
          const timestamp = Date.now()
          const [year, month] = date.split('/')
          const fileName = `${timestamp}_${threadData.pendingFile.name}`
          const fullPath = `${year}/${month}/${fileName}`
          
          const currentData = await getCurrentJsonData(env)
          const newId = currentData.length ? Math.max(...currentData.map(item => item.id)) + 1 : 1
          
          const newEntry: LabEntry = {
            id: newId,
            image: `/${env.IMAGE_PATH}${fullPath}`,
            title: title || threadData.metadata?.title || '',
            datetime: date.replace(/\//g, '-'),
            link: url || threadData.metadata?.url || ''
          }
          
          await uploadToGitHub(env, fullPath, imageBuffer, [newEntry, ...currentData])
          
          // スレッドデータを更新（entryIdを追加、pendingFileを削除）
          const { pendingFile, ...baseThreadData } = threadData
          const updatedThreadData: ThreadData = {
            ...baseThreadData,
            entryId: newId
          }
          await storeThreadData(env, event.thread_ts, updatedThreadData)
          
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
            `✅ アップロード完了: ${fileName}\nエントリID: ${newId}`)
          return c.text('OK')
        } catch (error) {
          console.error('Pending upload error:', error)
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
            `❌ アップロードエラー: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return c.text('OK')
        }
      }
      
      // 既存エントリの更新処理
      if (!threadData.entryId) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
          '❌ 更新対象のエントリが見つかりません。')
        return c.text('OK')
      }
      
      const updates: Partial<LabEntry> = {}
      
      if (title) updates.title = title
      if (date) {
        if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
          const formatExample = `❌ 日付フォーマットが正しくありません

**受け取った値**: \`${date}\`

**正しい形式**:
• \`date: 20241225\` (YYYYMMDD形式)  
• \`date: 1225\` (MMDD形式、現在年自動設定)`
          await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, formatExample)
          return c.text('OK')
        }
        updates.datetime = date.replace(/\//g, '-')
      }
      if (url) updates.link = url
      
      if (Object.keys(updates).length === 0) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
          '❌ 更新する内容が見つかりません。date、title、linkのいずれかを指定してください。')
        return c.text('OK')
      }
      
      const currentData = await getCurrentJsonData(env)
      const updatedData = updateEntryById(currentData, threadData.entryId, updates)
      
      await updateJsonOnGitHub(env, updatedData, `Update lab entry ID: ${threadData.entryId}`)
      
      const updateSummary = Object.entries(updates)
        .map(([key, value]) => `• ${key}: ${value}`)
        .join('\n')
      
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
        `✅ エントリID ${threadData.entryId} を更新しました\n\n${updateSummary}`)
    }
    
    return c.text('OK')
  } catch (error) {
    console.error('Thread message error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.thread_ts, 
      `❌ エラーが発生しました: ${errorMessage}`)
    return c.text('OK')
  }
}

/**
 * ヘルスチェックエンドポイント
 */
app.get('/', (c) => c.text('OK'))

export default app
