/**
 * Slackブロック構築テンプレート
 * UIコンポーネントとしてのSlackブロック定義
 */

import { MESSAGES, BUTTONS } from "../constants";

/**
 * Slackブロックテンプレート
 * 各入力段階に対応するUIブロックを生成
 */
export const BLOCK_TEMPLATES = {
  /**
   * 日付入力ブロック（褒めメッセージ付き）
   */
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

  /**
   * タイトル入力ブロック
   */
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

  /**
   * リンク入力ブロック
   */
  LINK_INPUT: (_date: string, _title: string) => [
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