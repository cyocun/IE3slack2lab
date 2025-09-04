import type { MessageMetadata, Bindings } from '../types'

/**
 * Slack Webhook署名を検証
 * @param signature - X-Slack-Signature ヘッダー
 * @param timestamp - X-Slack-Request-Timestamp ヘッダー
 * @param body - テキスト形式のリクエストボディ
 * @param signingSecret - Slack署名シークレット
 * @returns Promise<boolean> - 署名が有効な場合true
 */
export async function verifySlackSignature(
  signature: string | null,
  timestamp: string | null,
  body: string,
  signingSecret: string
): Promise<boolean> {
  // 必要なヘッダーの存在確認
  if (!signature || !timestamp) return false

  // タイムスタンプの鮮度確認（最大5分前まで）
  const time = Math.floor(Date.now() / 1000)
  if (Math.abs(time - parseInt(timestamp)) > 300) return false

  // 署名ベース文字列の作成
  const baseString = `v0:${timestamp}:${body}`

  // HMAC-SHA256署名の生成
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature_bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString))
  const computed_signature = `v0=${Array.from(new Uint8Array(signature_bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')}`

  return computed_signature === signature
}

/**
 * Slackメッセージテキストからメタデータを抽出
 * @param text - Slackメッセージテキスト
 * @returns title、date、urlを含むオブジェクト
 */
export function parseMessage(text: string): MessageMetadata {
  const metadata: MessageMetadata = { title: '', date: '', url: '' }

  for (const line of text.split('\n')) {
    const match = line.trim().match(/^([a-z]+):\s*(.+)$/i)
    if (!match) continue
    const key = match[1].toLowerCase()
    const value = match[2].trim()

    switch (key) {
      case 'title':
        metadata.title = value
        break
      case 'date':
        metadata.date = value
        break
      case 'url':
        metadata.url = value
        break
    }
  }

  return metadata
}


/**
 * ボットトークンを使用してSlackからファイルをダウンロード
 * @param fileUrl - SlackファイルURL
 * @param token - Slackボットトークン
 * @returns Promise<ArrayBuffer> - ArrayBuffer形式のファイル内容
 */
export async function getSlackFile(fileUrl: string, token: string): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`)
  }
  return response.arrayBuffer()
}

/**
 * Slackチャンネルにメッセージを送信
 * @param token - Slackボットトークン
 * @param channel - 対象チャンネル
 * @param threadTs - スレッドタイムスタンプ（オプション）
 * @param text - メッセージテキスト
 */
export async function sendSlackMessage(
  token: string,
  channel: string,
  threadTs: string | undefined,
  text: string
): Promise<void> {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text
    })
  })
}