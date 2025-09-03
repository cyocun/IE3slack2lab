/**
 * Slack関連の型定義
 */

// Slackイベントメッセージの基本構造
export interface SlackMessage {
  type: string;
  subtype?: string;
  text?: string;
  user: string;
  channel: string;
  ts: string;
  thread_ts?: string;
  files?: SlackFile[];
}

// Slackファイル情報
export interface SlackFile {
  id: string;
  name: string;
  mimetype?: string;
  size?: number;
  url_private_download?: string;
}

// Slack APIレスポンス（ファイル情報）
export interface SlackFileInfo {
  ok: boolean;
  file: SlackFileDetail;
  error?: string;
}

export interface SlackFileDetail {
  id: string;
  name: string;
  mimetype?: string;
  size?: number;
  url_private_download: string;
}

// Slackイベント全体の構造
export interface SlackEvent {
  type: string;
  event: SlackMessage;
  event_id: string;
  event_time: number;
}

// Slack webhook検証用
export interface SlackVerificationEvent {
  type: 'url_verification';
  challenge: string;
}

/**
 * GitHub関連の型定義
 */

// GitHubファイル取得レスポンス
export interface GitHubFile {
  name: string;
  path: string;
  sha: string;
  content: string;
  encoding: string;
  size: number;
}

// GitHubアップロードリクエスト
export interface GitHubUploadRequest {
  message: string;
  content: string;
  branch: string;
  sha?: string;
}

/**
 * アプリケーション固有の型定義
 */

// メッセージパース結果
export interface ParsedMessage {
  title?: string;
  date?: string;
  link?: string;
  errors: string[];
}

// スレッド操作パース結果
export interface ThreadOperation {
  action: 'delete' | 'update';
  updates?: Partial<ItemData>;
}

// JSONデータ項目
export interface ItemData {
  id: string;
  title: string;
  date: string;
  link: string;
  image: string;
  metadata: ItemMetadata;
}

// アイテムのメタデータ
export interface ItemMetadata {
  uploaded_at: string;
  updated_at: string;
  slack_user: string;
  slack_channel: string;
  slack_thread_ts: string;
  slack_message_ts: string;
}

// JSON全体の構造
export interface JSONData {
  items: ItemData[];
  last_updated: string;
}

// 画像生成結果
export interface ImagePathResult {
  path: string;
  fileName: string;
}

/**
 * Cloudflare Workers環境変数
 */
export interface Environment {
  SLACK_BOT_TOKEN: string;
  SLACK_SIGNING_SECRET: string;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  IMAGE_PATH: string;
  JSON_PATH: string;
}