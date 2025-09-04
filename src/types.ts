/**
 * Cloudflare Workers用の環境変数
 */
export type Bindings = {
  /** Slack Webhook署名検証用シークレット */
  SLACK_SIGNING_SECRET: string
  /** Slack API アクセス用ボットトークン */
  SLACK_BOT_TOKEN: string
  /** GitHub 個人アクセストークン */
  GITHUB_TOKEN: string
  /** GitHub リポジトリオーナー */
  GITHUB_OWNER: string
  /** GitHub リポジトリ名 */
  GITHUB_REPO: string
  /** アップロード対象ブランチ */
  GITHUB_BRANCH: string
  /** 画像保存パス */
  IMAGE_PATH: string
  /** JSONメタデータファイルパス */
  JSON_PATH: string
  /** KV Storage for thread management */
  THREADS_KV: KVNamespace
}

/**
 * パースされたメッセージメタデータ構造
 */
export interface MessageMetadata {
  title: string
  date: string
  url: string
}

/**
 * ラボデータ用JSONエントリ構造
 */
export interface LabEntry {
  id: number
  image: string
  title: string
  datetime: string
  link: string
}

/**
 * スレッド管理用のデータ構造
 */
export interface ThreadData {
  /** エントリID（アップロード済みの場合のみ） */
  entryId?: number
  /** Slackメッセージタイムスタンプ */
  messageTs: string
  /** チャンネルID */
  channel: string
  /** 作成日時 */
  createdAt: string
  /** ファイル情報（アップロード待ち用） */
  pendingFile?: {
    url: string
    name: string
    mimetype: string
  }
  /** パースされたメタデータ（部分的な場合もある） */
  metadata?: {
    title?: string
    date?: string
    url?: string
  }
  /** 編集待ち状態 */
  waitingForEdit?: {
    type: EditType
    message: string
  }
}

/**
 * スレッド操作のタイプ
 */
export type ThreadAction = 'edit' | 'delete' | 'update'

/**
 * 編集タイプ
 */
export type EditType = 'date' | 'title' | 'link'

/**
 * Slack Event API のイベント構造
 */
export interface SlackEvent {
  type: string
  ts: string
  thread_ts?: string
  channel: string
  user: string
  text?: string
  files?: SlackFile[]
  bot_id?: string
}

/**
 * Slack ファイル構造
 */
export interface SlackFile {
  id: string
  name: string
  mimetype: string
  url_private_download: string
}

/**
 * Slack Webhook ペイロード構造
 */
export interface SlackWebhookPayload {
  type: string
  challenge?: string
  event?: SlackEvent
}

/**
 * Slack インタラクティブ ペイロード構造
 */
export interface SlackInteractivePayload {
  type: string
  actions?: Array<{
    action_id: string
    value: string
  }>
  channel: {
    id: string
  }
  message: {
    ts: string
    thread_ts?: string
  }
  view?: {
    callback_id: string
    state: {
      values: {
        edit_input: {
          edit_value: {
            value: string
          }
        }
      }
    }
  }
  user: {
    id: string
  }
}

/**
 * GitHub API レスポンス構造
 */
export interface GitHubBranchResponse {
  object: {
    sha: string
  }
}

export interface GitHubCommitResponse {
  tree: {
    sha: string
  }
}

export interface GitHubBlobResponse {
  sha: string
}

export interface GitHubTreeResponse {
  sha: string
}

export interface GitHubContentsResponse {
  content?: string
  sha?: string
}