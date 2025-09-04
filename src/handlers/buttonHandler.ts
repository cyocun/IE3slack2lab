import type { Context } from "hono";
import type { Bindings } from "../types";
import { getThreadData, storeThreadData, deleteThreadData } from "../utils/kv";
import { sendSlackMessage, sendInteractiveMessage } from "../utils/slack";
import {
  FlowData,
  FLOW_STATE,
  completeUpload,
  handleEditSelection,
  handleDeleteEntry,
  confirmDelete,
} from "./flowHandler";
import { MESSAGES, BUTTONS, UI_TEXT } from "../constants";

/**
 * ボタンインタラクション処理
 */
export async function handleButtonInteraction(
  c: Context,
  env: Bindings,
  payload: any,
): Promise<Response> {
  try {
    const action = payload.actions[0];
    const actionId = action.action_id;
    const channel = payload.channel.id;
    const threadTs = payload.message.thread_ts || payload.message.ts;

    const flowData = (await getThreadData(env, threadTs)) as FlowData;

    if (!flowData) {
      await sendSlackMessage(
        env.SLACK_BOT_TOKEN,
        channel,
        threadTs,
        MESSAGES.ERRORS.DATA_NOT_FOUND,
      );
      return c.text("OK");
    }

    // アクションIDに基づく処理
    switch (actionId) {
      case "cancel_upload":
        await handleCancelUpload(env, flowData, threadTs);
        break;

      case "skip_title":
        await handleSkipTitle(env, flowData, threadTs);
        break;

      case "skip_link":
        await handleSkipLink(env, flowData, threadTs);
        break;

      case "post_now":
        await completeUpload(env, flowData, threadTs);
        break;

      case "edit_entry":
        await handleEditSelection(env, flowData, threadTs);
        break;

      case "edit_date":
      case "edit_title":
      case "edit_link":
        await handleEditFieldSelection(env, flowData, threadTs, actionId);
        break;

      case "cancel_edit":
        await handleCancelEdit(env, flowData, threadTs);
        break;

      case "delete_entry":
        await handleDeleteEntry(env, flowData, threadTs);
        break;

      case "confirm_delete":
        await confirmDelete(env, flowData, threadTs);
        break;

      case "cancel_delete":
        await handleCancelDelete(env, flowData, threadTs);
        break;
    }

    return c.text("OK");
  } catch (error) {
    console.error("Button interaction error:", error);
    return c.text("OK");
  }
}

/**
 * アップロード取り消し処理
 */
async function handleCancelUpload(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  await deleteThreadData(env, threadTs);
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    MESSAGES.SUCCESS.CANCELLED,
  );
}

/**
 * タイトルスキップ処理
 */
async function handleSkipTitle(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  flowData.collectedData = { ...flowData.collectedData, title: "" };
  flowData.flowState = FLOW_STATE.WAITING_LINK;
  await storeThreadData(env, threadTs, flowData);

  // リンク入力を促す（ボタン付き）
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: UI_TEXT.FLOW.TITLE_STATUS(
          flowData.collectedData?.date || "",
          "なし",
        ),
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
          style: "primary",
          action_id: "post_now",
        },
      ],
    },
  ];

  await sendInteractiveMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    "",
    blocks,
  );
}

/**
 * リンクスキップ処理
 */
async function handleSkipLink(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  flowData.collectedData = { ...flowData.collectedData, link: "" };
  await completeUpload(env, flowData, threadTs);
}

/**
 * 編集フィールド選択処理
 */
async function handleEditFieldSelection(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
  actionId: string,
): Promise<void> {
  const field = actionId.replace("edit_", "") as "date" | "title" | "link";

  flowData.flowState = FLOW_STATE.EDITING;
  flowData.editingField = field;
  await storeThreadData(env, threadTs, flowData);

  const prompts = {
    date: MESSAGES.PROMPTS.EDIT_DATE,
    title: MESSAGES.PROMPTS.EDIT_TITLE,
    link: MESSAGES.PROMPTS.EDIT_LINK,
  };

  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    prompts[field],
  );
}

/**
 * 編集キャンセル処理
 */
async function handleCancelEdit(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  flowData.flowState = FLOW_STATE.COMPLETED;
  delete flowData.editingField;
  await storeThreadData(env, threadTs, flowData);

  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    MESSAGES.SUCCESS.CANCELLED,
  );
}

/**
 * 削除キャンセル処理
 */
async function handleCancelDelete(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    MESSAGES.SUCCESS.CANCELLED,
  );
}
