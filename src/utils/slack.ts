import { VALIDATION, ENDPOINTS } from "../constants";

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
  signingSecret: string,
): Promise<boolean> {
  // 必要なヘッダーの存在確認
  if (!signature || !timestamp) return false;

  // タイムスタンプの鮮度確認（最大5分前まで）
  const time = Math.floor(Date.now() / 1000);
  if (Math.abs(time - parseInt(timestamp)) > VALIDATION.MAX_TIMESTAMP_DIFF)
    return false;

  // 署名ベース文字列の作成
  const baseString = `v0:${timestamp}:${body}`;

  // HMAC-SHA256署名の生成
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature_bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(baseString),
  );
  const computed_signature = `v0=${Array.from(new Uint8Array(signature_bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  return computed_signature === signature;
}



/**
 * Slackハイパーリンク形式からURLを抽出
 * @param text - Slackハイパーリンク形式のテキスト (<URL|表示名> または URL)
 * @returns 抽出されたURL
 */
export function extractUrlFromSlackFormat(text: string): string {
  if (!text) return "";
  
  // Slackハイパーリンク形式 <URL|表示名> または <URL> を検出
  const hyperlinkMatch = text.match(/^<([^|>]+)(\|[^>]*)?>/);
  if (hyperlinkMatch) {
    return hyperlinkMatch[1] || "";
  }
  
  // 通常のURLの場合はそのまま返す
  return text.trim();
}

/**
 * URLの形式を検証
 * @param url - 検証するURL文字列（Slackハイパーリンク形式にも対応）
 * @returns 有効なURLの場合true、無効な場合false
 */
export function isValidUrl(url: string): boolean {
  if (!url || url.trim() === "" || url.toLowerCase().trim() === "no") {
    return true; // 空文字や"no"は許可
  }
  
  // URLをクリーンアップ（前後の空白、改行等を除去）
  const cleanUrl = url.trim().replace(/[\n\r]/g, '');
  
  // Slackハイパーリンク形式からURLを抽出
  const actualUrl = extractUrlFromSlackFormat(cleanUrl);
  
  try {
    const urlObj = new URL(actualUrl);
    // httpまたはhttpsプロトコルのみ許可
    return urlObj.protocol === "http:" || urlObj.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * 日付入力を YYYY/MM/DD 形式に変換
 * @param dateInput - YYYYMMDD または MMDD 形式の日付文字列
 * @returns YYYY/MM/DD 形式の日付文字列、または空文字列（無効な場合）
 */
export function formatDateInput(dateInput: string): string {
  if (!dateInput) return "";

  const cleanDate = dateInput.replace(/[^\d]/g, "");
  const currentYear = new Date().getFullYear().toString();

  if (cleanDate.length === 8) {
    // YYYYMMDD format
    const year = cleanDate.slice(0, 4);
    const month = cleanDate.slice(4, 6);
    const day = cleanDate.slice(6, 8);

    // Basic validation
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return "";
    }

    return `${year}/${month}/${day}`;
  } else if (cleanDate.length === 4) {
    // MMDD format - use current year
    const month = cleanDate.slice(0, 2);
    const day = cleanDate.slice(2, 4);

    // Basic validation
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return "";
    }

    return `${currentYear}/${month}/${day}`;
  }

  // Return empty if format doesn't match
  return "";
}

/**
 * ファイル名を安全な英数字形式に変換
 * @param fileName - 元のファイル名
 * @returns 英数字のみのファイル名
 */
export function sanitizeFileName(fileName: string): string {
  // ファイル名と拡張子を分離
  const lastDotIndex = fileName.lastIndexOf(".");
  const name =
    lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
  const extension = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : "";

  // 英数字とハイフン、アンダースコアのみを許可
  const cleanName = name.replace(/[^a-zA-Z0-9\-_]/g, "");

  // 空になった場合や非英数字が多い場合はハッシュを使用
  if (cleanName.length < VALIDATION.MIN_FILENAME_LENGTH) {
    const hash = generateSimpleHash(name);
    return `file_${hash}${extension}`;
  }

  return `${cleanName}${extension}`;
}

/**
 * 文字列から簡単なハッシュを生成
 * @param str - ハッシュ化する文字列
 * @returns ハッシュ値（英数字）
 */
function generateSimpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32bit整数に変換
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

/**
 * ボットトークンを使用してSlackからファイルをダウンロード
 * @param fileUrl - SlackファイルURL
 * @param token - Slackボットトークン
 * @returns Promise<ArrayBuffer> - ArrayBuffer形式のファイル内容
 */
export async function getSlackFile(
  fileUrl: string,
  token: string,
): Promise<ArrayBuffer> {
  const response = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }
  return response.arrayBuffer();
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
  text: string,
): Promise<void> {
  await fetch(ENDPOINTS.SLACK_API.CHAT_POST_MESSAGE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
    }),
  });
}

/**
 * カラー付きメッセージを送信
 * @param token - Slackボットトークン
 * @param channel - 対象チャンネル
 * @param threadTs - スレッドタイムスタンプ（オプション）
 * @param text - メッセージテキスト
 * @param color - サイドバーの色 ('good' | 'warning' | 'danger' | hex色)
 */
export async function sendColoredSlackMessage(
  token: string,
  channel: string,
  threadTs: string | undefined,
  text: string,
  color: 'good' | 'warning' | 'danger' | string,
): Promise<void> {
  await fetch(ENDPOINTS.SLACK_API.CHAT_POST_MESSAGE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text: "", // メインテキストは空にする
      attachments: [
        {
          color: color,
          text: text,
          mrkdwn_in: ["text"],
        },
      ],
    }),
  });
}

/**
 * Slackチャンネルにインタラクティブメッセージを送信
 * @param token - Slackボットトークン
 * @param channel - 対象チャンネル
 * @param threadTs - スレッドタイムスタンプ（オプション）
 * @param text - メッセージテキスト
 * @param blocks - Slack Block Kit blocks
 */
export async function sendInteractiveMessage(
  token: string,
  channel: string,
  threadTs: string | undefined,
  text: string,
  blocks: any[],
): Promise<void> {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      thread_ts: threadTs,
      text,
      blocks,
    }),
  });
}

