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

    // 署名検証用ヘッダーを取得
    const signature = c.req.header('X-Slack-Signature') ?? null
    const timestamp = c.req.header('X-Slack-Request-Timestamp') ?? null

    // 署名検証用にリクエストボディをテキストで取得
    const bodyText = await c.req.text()

    // セキュリティのためSlack署名を検証
    const isValid = await verifySlackSignature(signature, timestamp, bodyText, env.SLACK_SIGNING_SECRET)
    if (!isValid) {
      return c.text('Unauthorized', 401)
    }

    // ボディテキストからJSONをパース
    let body: any
    try {
      body = JSON.parse(bodyText)
    } catch (parseError) {
      // Slackリトライメッセージかどうか確認
      if (bodyText.includes('Request for Retry')) {
        return c.text('OK')
      }
      return c.text('Invalid JSON', 400)
    }

  // Slack URL検証チャレンジを処理
  if (body.type === 'url_verification') {
    return c.text(body.challenge)
  }

  // ファイル添付付きメッセージイベントを処理（ボットメッセージを除く）
  if (body.event?.type === 'message' && !body.event.bot_id && body.event.files) {
    const event = body.event
    const file = event.files[0]

    // 画像ファイルのみをフィルタ
    if (!file.mimetype?.startsWith('image/')) {
      return c.text('OK')
    }

    try {
      // メッセージテキストからメタデータを抽出
      const { title, date, url } = parseMessage(event.text || '')

      // 必要な日付フォーマット（YYYY/MM/DD）を検証
      if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
        await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, '❌ 日付は YYYY/MM/DD 形式で入力してください')
        return c.text('OK')
      }

      // Slackから画像をダウンロード
      const imageBuffer = await getSlackFile(file.url_private_download, env.SLACK_BOT_TOKEN)

      // タイムスタンプ付きファイル名とディレクトリ構造を生成
      const timestamp = Date.now()
      const fileName = `${timestamp}_${file.name}`
      const [year, month] = date.split('/')
      const fullPath = `${year}/${month}/${fileName}`

      // GitHubから現在のJSONデータを取得
      const currentData = await getCurrentJsonData(env)

      // 新しいメタデータエントリを作成
      const newId = currentData.length > 0 ? Math.max(...currentData.map(item => item.id)) + 1 : 1
      const newEntry: LabEntry = {
        id: newId,
        image: `/${env.IMAGE_PATH}${fullPath}`,
        title: title || '',
        datetime: date.replace(/\//g, '-'),
        link: url || '',
      }

      // 新しいエントリを先頭に挿入（時間顺）
      const updatedData = [newEntry, ...currentData]

      // 画像とJSONの両方をGitHubにコミット
      await uploadToGitHub(env, fullPath, imageBuffer, updatedData)

      // 成功通知をSlackに送信
      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, `✅ アップロード完了: ${fileName}`)

    } catch (error) {
      console.error('Upload error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const errorStack = error instanceof Error ? error.stack : undefined
      
      // 詳細なエラー情報を含めてSlackに送信
      let detailedError = `❌ エラー: ${errorMessage}`
      if (errorStack) {
        // スタックトレースの最初の数行のみを含める（Slackのメッセージ制限を考慮）
        const stackLines = errorStack.split('\n').slice(0, 3)
        detailedError += `\n\`\`\`\n${stackLines.join('\n')}\n\`\`\``
      }

      await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, detailedError)
    }
  }

    // 常にSlackに200 OKを返す
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