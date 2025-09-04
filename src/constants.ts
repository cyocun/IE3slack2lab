/**
 * アプリケーション全体で使用する定数
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
    UPLOAD_PROCESSING: "📤 UP中...",
  },
  PROMPTS: {
    DATE_INPUT: "📅 *いつ？*\n`YYYY/MM/DD、YYYYMMDD、MMDD`",
    DATE_INVALID:
      "{input}🤔\n`YYYY/MM/DD、YYYYMMDD、MMDD` で！",
    TITLE_INPUT: "📝 *タイトル？*\n「no」でもスキップ",
    LINK_INPUT: "🔗 *リンク？*\n「no」でも投稿",
    LINK_INVALID:
      "{input}🤔\nちゃんと書くか、「no」でスキップ",
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
  }
};

export const BUTTONS = {
  CANCEL_UPLOAD: "❌ 取り消し",
  SKIP: "スキップ",
  POST_NOW: "💾 投稿",
  TODAY: "📅 TODAY!",
} ;


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
          action_id: "today_date",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.CANCEL_UPLOAD,
          },
          action_id: "cancel_upload",
        },
      ],
    },
  ],
  TITLE_INPUT: () => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: MESSAGES.PROMPTS.TITLE_INPUT,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.SKIP,
          },
          action_id: "skip_title",
        },
      ],
    },
  ],
  LINK_INPUT: (date: string, title: string) => [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: MESSAGES.PROMPTS.LINK_INPUT,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.POST_NOW,
          },
          action_id: "post_now",
        },
      ],
    },
  ],
};

export const VALIDATION = {
  MIN_FILENAME_LENGTH: 3,
  MAX_TIMESTAMP_DIFF: 300, // 5 minutes
  CHUNK_SIZE: 0x1000,
};

export const ENDPOINTS = {
  SLACK_API: {
    CHAT_POST_MESSAGE: "https://slack.com/api/chat.postMessage",
  },
};

/**
 * Message utility functions
 */
export const MessageUtils = {
  getRandomPraise: (type: "initial" | "processing" = "initial") => {
    const praise = type === "initial" ? MESSAGES.PRAISE.INITIAL : MESSAGES.PRAISE.PROCESSING;
    return (
      praise[Math.floor(Math.random() * praise.length)] ??
      (type === "initial" ? "素敵な写真ですね！✨" : "準備完了！🚀")
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
};
