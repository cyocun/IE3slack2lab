import type { Context } from "hono";
import type { Bindings } from "../types";
import { getThreadData, storeThreadData, deleteThreadData } from "../utils/kv";
import {
  sendSlackMessage,
  sendColoredSlackMessage,
  sendInteractiveMessage,
} from "../utils/slack";
import {
  FlowData,
  FLOW_STATE,
  completeUpload,
  handleEditSelection,
  handleDeleteEntry,
  confirmDelete,
} from "./flowHandler";
import { MESSAGES, BLOCK_TEMPLATES, KV_CONFIG } from "../constants";

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

    let flowData = (await getThreadData(env, threadTs)) as FlowData;

    // 削除・編集系の操作の場合、flowDataがなくてもボタンのvalueからentryIdを取得可能
    const needsEntryId = [
      "edit_entry",
      "delete_entry",
      "confirm_delete",
      "edit_date",
      "edit_title",
      "edit_link",
    ].includes(actionId);

    if (!flowData && needsEntryId && action.value) {
      // KVデータが期限切れの場合、最小限のデータを作成
      flowData = {
        messageTs: threadTs,
        channel: channel,
        createdAt: new Date().toISOString(),
        flowState: FLOW_STATE.COMPLETED,
        entryId: parseInt(action.value, 10),
      } as FlowData;
    } else if (!flowData) {
      await sendColoredSlackMessage(
        env.SLACK_BOT_TOKEN,
        channel,
        threadTs,
        MESSAGES.ERRORS.DATA_NOT_FOUND,
        "danger",
      );
      return c.text("OK");
    }

    // アクションIDに基づく処理
    switch (actionId) {
      case "today_date":
        await handleTodayDate(env, flowData, threadTs);
        break;

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

async function sendCancelMessage(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  await sendColoredSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    MESSAGES.SUCCESS.CANCELLED,
    "warning",
  );
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
  await sendCancelMessage(env, flowData, threadTs);
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
  await storeThreadData(env, threadTs, flowData, KV_CONFIG.EDITING_TTL);

  const blocks = BLOCK_TEMPLATES.LINK_INPUT(
    flowData.collectedData?.date || "",
    "なし",
  );

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
  await storeThreadData(env, threadTs, flowData, KV_CONFIG.EDITING_TTL);

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
  await storeThreadData(env, threadTs, flowData, KV_CONFIG.COMPLETED_TTL);
  await sendCancelMessage(env, flowData, threadTs);
}

/**
 * 削除キャンセル処理
 */
async function handleCancelDelete(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  await sendCancelMessage(env, flowData, threadTs);
}

/**
 * TODAY!ボタン処理 - 今日の日付を自動設定
 */
async function handleTodayDate(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<void> {
  // 今日の日付をYYYY/MM/DD形式で取得
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const todayDate = `${year}/${month}/${day}`;

  // フローデータを更新
  flowData.collectedData = { ...flowData.collectedData, date: todayDate };
  flowData.flowState = FLOW_STATE.WAITING_TITLE;
  await storeThreadData(env, threadTs, flowData, KV_CONFIG.EDITING_TTL);

  const blocks = BLOCK_TEMPLATES.TITLE_INPUT();

  await sendInteractiveMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    "",
    blocks,
  );
}
