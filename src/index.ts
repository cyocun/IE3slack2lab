import { Hono } from 'hono'
import type { Bindings, LabEntry } from './types'
import { verifySlackSignature, parseMessage, getSlackFile, sendSlackMessage } from './utils/slack'
import { uploadToGitHub, getCurrentJsonData } from './utils/github'

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
    const file = event?.files?.[0]

    if (!file || event.bot_id || event.type !== 'message' || !file.mimetype?.startsWith('image/')) {
      return c.text('OK')
    }

    try {
      const { title, date, url } = parseMessage(event.text || '')

      if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, '❌ 日付は YYYY/MM/DD 形式で入力してください')
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
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, `✅ アップロード完了: ${fileName}`)
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
 * ヘルスチェックエンドポイント
 */
app.get('/', (c) => c.text('OK'))

export default app
