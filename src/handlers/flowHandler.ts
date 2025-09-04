/**
 * フローハンドラー - メインコントローラー
 * 画像アップロードフローの統合管理
 */

import type { Context } from "hono";
import type { Bindings } from "../types";
import { sendColoredSlackMessage, sendInteractiveMessage } from "../utils/slack";
import { storeThreadData, getThreadData } from "../utils/kv";
import { okResponse } from "../utils/response";
import { MESSAGES, KV_CONFIG } from "../constants";
import { MessageUtils } from "../utils/messageFormatter";
import { BLOCK_TEMPLATES } from "../ui/slackBlocks";
import {
  FLOW_STATE,
  type FlowData,
  handleDateInput,
  handleTitleInput,
  handleLinkInput,
  handleEditInput,
  completeUpload,
} from "../flow";

/**
 * エラーハンドリング付きでSlackメッセージを送信
 */
async function sendErrorMessage(
  env: Bindings,
  channel: string,
  threadTs: string,
  message: string,
): Promise<void> {
  try {
    await sendColoredSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, message, 'danger');
  } catch (error) {
    console.error("Failed to send error message:", error);
  }
}

/**
 * 画像アップロードの初期処理
 * 画像ファイルを検証し、フロー開始のためのデータを保存
 */
export async function handleInitialImageUpload(
  _c: Context,
  env: Bindings,
  event: any,
): Promise<Response> {
  const file = event?.files?.[0];
  if (!file || !file.mimetype?.startsWith("image/")) {
    return okResponse();
  }

  try {
    const flowData: FlowData = {
      messageTs: event.ts,
      channel: event.channel,
      createdAt: new Date().toISOString(),
      flowState: FLOW_STATE.WAITING_DATE,
      imageFile: {
        url: file.url_private_download,
        name: file.name,
        mimetype: file.mimetype,
      },
      collectedData: {},
    };

    await storeThreadData(env, event.ts, flowData, KV_CONFIG.THREAD_TTL);

    const blocks = BLOCK_TEMPLATES.DATE_INPUT(MessageUtils.getRandomPraise("initial"));
    await sendInteractiveMessage(env.SLACK_BOT_TOKEN, event.channel, event.ts, "", blocks);
    
    return okResponse();
  } catch (error) {
    console.error("Initial upload error:", error);
    await sendErrorMessage(env, event.channel, event.ts, MESSAGES.ERRORS.UPLOAD_ERROR);
    return okResponse();
  }
}

/**
 * スレッド内のメッセージ処理（フロー制御）
 * フロー状態に応じて適切なハンドラーに処理を委譲
 */
export async function handleFlowMessage(
  _c: Context,
  env: Bindings,
  event: any,
): Promise<Response> {
  const threadTs = event.thread_ts;
  const flowData = (await getThreadData(env, threadTs)) as FlowData;

  if (!flowData?.flowState) {
    return okResponse();
  }

  const userInput = event.text?.trim() || "";

  // フロー状態に応じて適切なハンドラーに処理を委譲
  switch (flowData.flowState) {
    case FLOW_STATE.WAITING_DATE:
      return handleDateInput(env, flowData, userInput, threadTs);
    case FLOW_STATE.WAITING_TITLE:
      return handleTitleInput(env, flowData, userInput, threadTs);
    case FLOW_STATE.WAITING_LINK:
      return handleLinkInput(env, flowData, userInput, threadTs, completeUpload);
    case FLOW_STATE.EDITING:
      return handleEditInput(env, flowData, userInput, threadTs);
    default:
      return okResponse();
  }
}

// Export only the FlowData type for external use
export type { FlowData } from "../flow";