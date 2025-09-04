/**
 * アプリケーション全体で使用する定数
 */
export const MESSAGES = {
  ERRORS: {
    UNAUTHORIZED: 'Unauthorized',
    INVALID_JSON: 'Invalid JSON',
    INTERNAL_SERVER_ERROR: 'Internal Server Error',
    DATE_FORMAT: 'Invalid date format',
    DATA_NOT_FOUND: 'Data not found',
    UPLOAD_ERROR: 'Upload error occurred',
    EDIT_INPUT_ERROR: 'Edit input error occurred'
  },
  SUCCESS: {
    UPLOAD_COMPLETE: '🎉 画像のアップロードが完了しました！',
    UPLOAD_PENDING_COMPLETE: '🎉 お待たせしました！アップロード完了です',
    UPDATE_COMPLETE: '🔄 更新完了しました！',
    DELETE_COMPLETE: '🗑️ 完了しました！',
    DELETE_PENDING: '🗑️ 了解しました！保留中の画像アップロードをキャンセルしました',
    FIELD_UPDATED: '✅ {field}を更新しました',
    CANCELLED: '❌ キャンセルしました'
  },
  PROMPTS: {
    DATE_FORMAT_HELP: `📅 **いつの画像？** 🤔
• \`date: 20241225\` (YYYYMMDD or MMDD)

✨ **Example** :
\`\`\`
date: 20241225
title: The new beginning
link: https://ie3.jp
\`\`\`

😊 下のボタンから編集するか、このスレッドに投稿してもらえれば、すぐに画像をアップロードします！`,
    DATE_FORMAT_ERROR: `📅 日付の形式がちょっと違うようです

🔍 **受け取った値**: \`{receivedValue}\`

😊 **正しい書き方**:
• \`date: 20241225\` (YYYYMMDD形式)
• \`date: 1225\` (MMDD形式、年は今年になります)

✨ **Example** :
\`\`\`
date: 20241225
title: The new beginning
link: https://ie3.jp
\`\`\`

🚀 下のボタンから編集するか、正しい形式で投稿していただければ、すぐに画像をアップロードします！`,
    WHAT_TO_EDIT: '🔧 **何を修正しますか？**',
    EDIT_DATE: '📅 **日付を入力してください**\n\n例: `20241225` または `1225`\n（YYYYMMDD または MMDD 形式）',
    EDIT_TITLE: '📝 **新しいタイトルを入力してください**\n\n空欄で送信するとタイトルが削除されます',
    EDIT_LINK: '🔗 **新しいリンクを入力してください**\n\n例: `https://example.com`\n空欄で送信するとリンクが削除されます'
  },
  EDIT_INSTRUCTIONS: '✏️ 修正が必要な場合は、このスレッドで **`edit`** または **`修正`** と入力してください。'
} as const

export const BUTTON_LABELS = {
  DATE: '📅 日付',
  TITLE: '📝 タイトル',
  LINK: '🔗 リンク',
  DELETE: '🗑️ 削除',
  CANCEL: '❌ キャンセル'
} as const

export const MODAL_TITLES = {
  EDIT_DATE: '📅 日付を編集',
  EDIT_TITLE: '📝 タイトルを編集',
  EDIT_LINK: '🔗 リンクを編集'
} as const

export const MODAL_PLACEHOLDERS = {
  DATE: '20241225 または 1225',
  TITLE: 'タイトルを入力（空欄で削除）',
  LINK: 'https://example.com（空欄で削除）'
} as const

export const MODAL_HINTS = {
  DATE: 'YYYYMMDD または MMDD 形式で入力してください',
  TITLE: '空欄にするとタイトルが削除されます',
  LINK: '空欄にするとリンクが削除されます'
} as const

export const FIELD_NAMES = {
  DATE: '日付',
  TITLE: 'タイトル',
  LINK: 'リンク'
} as const

export const VALIDATION = {
  DATE_REGEX: /^\d{4}\/\d{2}\/\d{2}$/,
  MIN_FILENAME_LENGTH: 3,
  MAX_TIMESTAMP_DIFF: 300, // 5 minutes
  CHUNK_SIZE: 0x1000
} as const

export const ENDPOINTS = {
  SLACK_API: {
    CHAT_POST_MESSAGE: 'https://slack.com/api/chat.postMessage',
    VIEWS_OPEN: 'https://slack.com/api/views.open'
  },
  GITHUB_API: {
    REPOS: 'https://api.github.com/repos'
  }
} as const

export const COMMANDS = {
  EDIT: ['edit', '修正'],
  DELETE: ['delete', '削除'],
  UPDATE_PATTERNS: /^(date|title|link):/m
} as const