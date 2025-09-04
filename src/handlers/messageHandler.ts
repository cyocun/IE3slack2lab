import type { Context } from 'hono'
import type { Bindings, ThreadData, LabEntry } from '../types'
import { parseMessage, getSlackFile, sendSlackMessage, sanitizeFileName, sendInteractiveMessage, createEditButtons } from '../utils/slack'
import { uploadToGitHub, getCurrentJsonData } from '../utils/github'
import { storeThreadData } from '../utils/kv'
import { MESSAGES, VALIDATION } from '../constants'

/**
 * 通常メッセージ（画像付き）処理
 */
export async function handleImageMessage(c: Context, env: Bindings, event: any): Promise<Response> {
  const file = event?.files?.[0]
  if (!file || !file.mimetype?.startsWith('image/')) {
    return c.text('OK')
  }

  try {
    const { title, date, url } = parseMessage(event.text || '')

    // 日付検証とエラーハンドリング
    if (!date || !VALIDATION.DATE_REGEX.test(date)) {
      await handleDateValidationError(env, event, file, title, date, url)
      return c.text('OK')
    }

    // 正常な画像アップロード処理
    await processImageUpload(env, event, file, title, date, url)
    return c.text('OK')
  } catch (error) {
    console.error('Upload error:', error)
    await handleUploadError(env, event, error)
    return c.text('OK')
  }
}

/**
 * 日付検証エラー処理
 */
async function handleDateValidationError(
  env: Bindings,
  event: any,
  file: any,
  title: string,
  date: string,
  url: string
): Promise<void> {
  // スレッドデータを保存（修正投稿用）
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

  const pendingButtons = createEditButtons(undefined, true)

  if (!date) {
    await sendInteractiveMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, MESSAGES.PROMPTS.DATE_FORMAT_HELP, pendingButtons)
  } else {
    const errorMessage = MESSAGES.PROMPTS.DATE_FORMAT_ERROR.replace('{receivedValue}', date)
    await sendInteractiveMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, errorMessage, pendingButtons)
  }
}

/**
 * 画像アップロード処理
 */
async function processImageUpload(
  env: Bindings,
  event: any,
  file: any,
  title: string,
  date: string,
  url: string
): Promise<void> {
  const imageBuffer = await getSlackFile(file.url_private_download, env.SLACK_BOT_TOKEN)
  const timestamp = Date.now()
  const [year, month] = date.split('/')
  const sanitizedName = sanitizeFileName(file.name)
  const fileName = `${timestamp}_${sanitizedName}`
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

  const successText = buildSuccessMessage(fileName, newId, date, title, url)
  await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, successText)
}

/**
 * アップロードエラー処理
 */
async function handleUploadError(env: Bindings, event: any, error: unknown): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
  const errorStack = error instanceof Error ? error.stack : undefined
  
  let detailedError = `❌ エラー: ${errorMessage}`
  if (errorStack) {
    const stackLines = errorStack.split('\n').slice(0, 3)
    detailedError += `\n\`\`\`\n${stackLines.join('\n')}\n\`\`\``
  }
  
  await sendSlackMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, detailedError)
}

/**
 * 成功メッセージを構築
 */
function buildSuccessMessage(fileName: string, id: number, date: string, title?: string, url?: string): string {
  let message = `${MESSAGES.SUCCESS.UPLOAD_COMPLETE}\n\n` +
    `📸 **ファイル名**: \`${fileName}\`\n` +
    `🔢 **エントリID**: ${id}\n` +
    `📅 **日付**: ${date}\n`
  
  if (title) message += `📝 **タイトル**: ${title}\n`
  if (url) message += `🔗 **リンク**: ${url}\n`
  
  message += `\n${MESSAGES.EDIT_INSTRUCTIONS}`
  
  return message
}