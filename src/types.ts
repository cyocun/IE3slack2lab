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