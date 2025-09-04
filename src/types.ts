/**
 * Cloudflare Workers用の環境変数
 */
export type Bindings = {
  /** Slack Webhook署名検証用シークレット */
  SLACK_SIGNING_SECRET: string;
  /** Slack API アクセス用ボットトークン */
  SLACK_BOT_TOKEN: string;
  /** GitHub 個人アクセストークン */
  GITHUB_TOKEN: string;
  /** GitHub リポジトリオーナー */
  GITHUB_OWNER: string;
  /** GitHub リポジトリ名 */
  GITHUB_REPO: string;
  /** アップロード対象ブランチ */
  GITHUB_BRANCH: string;
  /** 画像保存パス */
  IMAGE_PATH: string;
  /** JSONメタデータファイルパス */
  JSON_PATH: string;
  /** KV Storage for thread management */
  slack2postlab_threads: KVNamespace;
};


/**
 * ラボデータ用JSONエントリ構造
 */
export interface LabEntry {
  id: number;
  image: string;
  title: string;
  datetime: string;
  link: string;
}

/**
 * スレッド管理用の基本データ構造
 * フローデータのベース型として使用
 */
export interface ThreadData {
  /** エントリID（アップロード済みの場合のみ） */
  entryId?: number;
  /** Slackメッセージタイムスタンプ */
  messageTs: string;
  /** チャンネルID */
  channel: string;
  /** 作成日時 */
  createdAt: string;
}

/**
 * Slack Event API のイベント構造
 */
export interface SlackEvent {
  type: string;
  ts: string;
  thread_ts?: string;
  channel: string;
  user: string;
  text?: string;
  files?: SlackFile[];
  bot_id?: string;
}

/**
 * Slack ファイル構造
 */
export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private_download: string;
}

/**
 * Slack Block Actions（ボタン操作）用の最小限ペイロード型
 * 実際のSlackの型はさらに多いが、利用する範囲に限定して定義
 */
export interface SlackBlockActionsPayload {
  type: 'block_actions';
  user: { id: string };
  channel: { id: string };
  message: { ts: string; thread_ts?: string };
  actions: Array<{
    action_id: string;
    value?: string;
  }>;
}
