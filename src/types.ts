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
}

/**
 * スレッド操作のタイプ
 */
export type ThreadAction = 'edit' | 'delete' | 'update'