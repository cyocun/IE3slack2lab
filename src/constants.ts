/**
 * アプリケーション全体で使用する純粋な定数
 * 関数やテンプレートは別ファイルに分離
 */

/**
 * GitHubコミット用のBot情報
 */
export const GITHUB_BOT = {
  name: "IE3 Lab Postman",
  email: "dev@ie3.jp",
} as const;

/**
 * API設定
 */
export const API_CONFIG = {
  USER_AGENT: "Slack-to-GitHub-Worker",
} as const;

/**
 * コミットメッセージプレフィックス
 */
export const COMMIT_PREFIXES = {
  ADD_IMAGE: "📸 lab: Add lab image:",
  UPDATE_ENTRY: "✏️ lab: Update lab entry ID:",
  DELETE_ENTRY: "🗑️ lab: Delete lab entry ID:",
} as const;

/**
 * KV Storage設定
 */
export const KV_CONFIG = {
  /** スレッドデータの有効期限（秒） */
  THREAD_TTL: 86400, // 24時間
  /** 編集中データの有効期限（秒） */
  EDITING_TTL: 7200, // 2時間
  /** 完了後データの有効期限（秒） */
  COMPLETED_TTL: 259200, // 3日間（編集・削除のため長めに保持）
} as const;

/**
 * バリデーション設定
 */
export const VALIDATION = {
  MIN_FILENAME_LENGTH: 3,
  MAX_TIMESTAMP_DIFF: 300, // 5 minutes
  CHUNK_SIZE: 0x1000,
} as const;

/**
 * 外部APIエンドポイント
 */
export const ENDPOINTS = {
  SLACK_API: {
    CHAT_POST_MESSAGE: "https://slack.com/api/chat.postMessage",
  },
} as const;

/**
 * ボタンテキスト定数
 */
export const BUTTONS = {
  CANCEL_UPLOAD: "❌ 取り消し",
  SKIP: "スキップ",
  POST_NOW: "💾 投稿",
  TODAY: "📅 TODAY!",
} as const;

/**
 * アプリケーションメッセージテキスト定数
 */
export const MESSAGES = {
  ERRORS: {
    UNAUTHORIZED: "Unauthorized",
    INVALID_JSON: "Invalid JSON",
    INTERNAL_SERVER_ERROR: "Internal Server Error",
    DATA_NOT_FOUND: "データがない🤔",
    UPLOAD_ERROR: "❌ 画像の処理中にエラーが発生した",
    MISSING_DATA: "データが足りない🤔",
    UNKNOWN_ERROR: "原因不明",
  },
  SUCCESS: {
    UPLOAD_COMPLETE: "🎉 UP DONE 🎉",
    CANCELLED: "キャンセル Done👌",
  },
  PROGRESS: {
    UPLOAD_PROCESSING: "📤 UP中...\n```UP DONEがでない？\nタイムアウトしてるけど終わってるかも。\ncheck it out -> <https://ie3.jp/lab>```",
  },
  PROMPTS: {
    DATE_INPUT: "📅 *いつ？*\n`YYYY/MM/DD、YYYYMMDD、MMDD`",
    DATE_INVALID: "{input}🤔\n`YYYY/MM/DD、YYYYMMDD、MMDD` で！",
    TITLE_INPUT: "📝 *タイトル？*\n「no」でもスキップ",
    LINK_INPUT: "🔗 *リンク？*\n「no」でも投稿",
    LINK_INVALID: "{input}🤔\nちゃんと書くか、「no」でスキップ",
    EDIT_DATE: "📅 日付 `YYYY/MM/DD、YYYYMMDD、MMDD`",
    EDIT_TITLE: "📝 タイトル（「no」でなし）",
    EDIT_LINK: "🔗 リンク（「no」でなし）",
    DELETE_CONFIRM: "⚠️ *削除？*\nID: {id}",
    WHAT_FIELD_TO_FIX: "✏️ *直す？*",
  },
  PRAISE: {
    INITIAL: [
      "素敵な写真！✨",
      "いい写真！📸",
      "ナイスショット！🎯",
      "いいね！👍",
      "最高の一枚！🌟",
      "Beautiful! 🌈",
      "すばらしい！🎉",
      "グッドチョイス！👌",
      "センスしかない！🎨",
      "いい感じ！😊",
    ],
    PROCESSING: [
      "リスペクト🎵",
      "準備完了！🚀",
      "素晴！✨",
      "バッチリ！👌",
      "いい感じ！😊",
      "完璧！💫",
      "お疲れ！🎯",
      "ナイスです！👍",
    ],
  },
  COMPLETIONS: {
    UPDATE_FIELD: "更新完了✨\n{field}: {value}",
    DELETE_ENTRY: "削除完了👋 ID: {id}",
  },
  ERROR_HANDLING: {
    UPLOAD_FAILED: "エラー！😱\n{message}\nもう一度お願い！",
    DELETE_FAILED: "削除エラー😱\n{message}\nもう一度お願い！",
    FIELD_NAMES: {
      date: "日付",
      title: "タイトル",
      link: "リンク",
    },
  },
} as const;
