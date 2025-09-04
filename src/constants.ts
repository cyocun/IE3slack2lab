/**
 * アプリケーション全体で使用する定数
 */
export const MESSAGES = {
  ERRORS: {
    UNAUTHORIZED: "Unauthorized",
    INVALID_JSON: "Invalid JSON",
    INTERNAL_SERVER_ERROR: "Internal Server Error",
    DATE_FORMAT: "Invalid date format",
    DATA_NOT_FOUND: "データがない🤔",
    UPLOAD_ERROR: "❌ 画像の処理中にエラーが発生した",
    EDIT_INPUT_ERROR: "Edit input error occurred",
    MISSING_DATA: "データが足りない🤔",
    DELETE_ERROR: "削除エラー😱",
    UNKNOWN_ERROR: "原因不明",
  },
  SUCCESS: {
    UPLOAD_COMPLETE: "🎉 画像のUPが完了した！",
    UPDATE_COMPLETE: "更新完了✨",
    DELETE_COMPLETE: "削除完了👋",
    CANCELLED: "キャンセル👌",
  },
  PROGRESS: {
    UPLOAD_STARTING: "🔄 ちょっと待ってね！画像をUP中だよ...",
    UPLOAD_PROCESSING: "📤 GitHubにUP中...",
  },
  PROMPTS: {
    DATE_INPUT: "📅 *いつ？*\n`YYYY/MM/DD、YYYYMMDD、MMDD`",
    DATE_INVALID:
      "😅「{input}」は認識できない\n`YYYY/MM/DD、YYYYMMDD、MMDD` で！",
    TITLE_INPUT: "📝 *タイトルは？*\n「no」かスキップでなしにできるよ",
    LINK_INPUT: "🔗 *リンクは？*\n「no」か投稿ボタンでスキップ",
    LINK_INVALID:
      "😅「{input}」は正しいURLじゃないよ！\n`https://example.com` の形式で入力するか、「no」でスキップしてね",
    WHAT_TO_EDIT: "🔧 *修正する？*",
    EDIT_DATE: "📅 新しい日付 `YYYY/MM/DD、YYYYMMDD、MMDD`",
    EDIT_TITLE: "📝 新しいタイトル（「no」でなし）",
    EDIT_LINK: "🔗 新しいリンク（「no」でなし）",
    DELETE_CONFIRM: "⚠️ *削除？*\nID: {id}",
    WHAT_FIELD_TO_FIX: "✏️ *直す？*",
    DATE_FORMAT_HELP: `📅 **いつ？** 🤔
• \`date: 20241225\` (YYYYMMDD or MMDD)

✨ **Example** :
\`\`\`
date: 20241225
title: The new beginning
link: https://ie3.jp
\`\`\`

😊 下のボタンから編集するか、このスレッドに投稿してもらえれば、すぐに画像をUPします！`,
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

🚀 下のボタンから編集するか、正しい形式で投稿していただければ、すぐに画像をUPします！`,
  },
  PRAISE: [
    "素敵な写真ですね！✨",
    "いい写真！📸",
    "ナイスショット！🎯",
    "いいね！👍",
    "最高の一枚！🌟",
    "Beautiful! 🌈",
    "すばらしい！🎉",
    "グッドチョイス！👌",
    "センスありますね！🎨",
    "いい感じ！😊",
  ],
  FLOW_STATUS: {
    DATE_CONFIRMED: "日付: {date} ✅",
    TITLE_CONFIRMED: "タイトル: {title} ✅",
    LINK_CONFIRMED: "リンク: {link} ✅",
    SUMMARY: `📸 \`{fileName}\`
🔢 ID: {id}
📅 {date}
📝 {title}
🔗 {link}`,
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
  EDIT_INSTRUCTIONS:
    "✏️ 修正が必要な場合は、このスレッドで **`edit`** または **`修正`** と入力してください。",
} as const;

export const BUTTONS = {
  CANCEL_UPLOAD: "❌ 取り消し",
  SKIP: "スキップ",
  POST_NOW: "💾 投稿",
  TODAY: "📅 TODAY!",
} as const;

export const UI_TEXT = {
  FLOW: {
    TITLE_STATUS: (date: string, title: string) =>
      `日付: ${date} ✅\n` +
      `タイトル: ${title || "なし"} ✅\n\n` +
      `🔗 *リンクは？*\n「no」か投稿ボタンでスキップ`,
  },
} as const;

export const BLOCK_TEMPLATES = {
  DATE_INPUT: (praise: string) => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${praise}\n\n${MESSAGES.PROMPTS.DATE_INPUT}`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.TODAY,
          },
          style: "primary",
          action_id: "today_date",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.CANCEL_UPLOAD,
          },
          style: "danger",
          action_id: "cancel_upload",
        },
      ],
    },
  ],
} as const;

export const VALIDATION = {
  MIN_FILENAME_LENGTH: 3,
  MAX_TIMESTAMP_DIFF: 300, // 5 minutes
  CHUNK_SIZE: 0x1000,
} as const;

export const ENDPOINTS = {
  SLACK_API: {
    CHAT_POST_MESSAGE: "https://slack.com/api/chat.postMessage",
  },
} as const;

/**
 * Message utility functions
 */
export const MessageUtils = {
  getRandomPraise: () => {
    const praise = MESSAGES.PRAISE;
    return (
      praise[Math.floor(Math.random() * praise.length)] ??
      "素敵な写真ですね！✨"
    );
  },

  formatDateInvalid: (input: string) =>
    MESSAGES.PROMPTS.DATE_INVALID.replace("{input}", input),

  formatLinkInvalid: (input: string) =>
    MESSAGES.PROMPTS.LINK_INVALID.replace("{input}", input),

  formatDeleteConfirm: (id: number) =>
    MESSAGES.PROMPTS.DELETE_CONFIRM.replace("{id}", id.toString()),

  formatUploadFailed: (message: string) =>
    MESSAGES.ERROR_HANDLING.UPLOAD_FAILED.replace("{message}", message),

  formatDeleteFailed: (message: string) =>
    MESSAGES.ERROR_HANDLING.DELETE_FAILED.replace("{message}", message),

  formatUpdateField: (field: "date" | "title" | "link", value: string) =>
    MESSAGES.COMPLETIONS.UPDATE_FIELD.replace(
      "{field}",
      MESSAGES.ERROR_HANDLING.FIELD_NAMES[field],
    ).replace("{value}", value || "なし"),

  formatDeleteEntry: (id: number) =>
    MESSAGES.COMPLETIONS.DELETE_ENTRY.replace("{id}", id.toString()),
} as const;
