/**
 * フロー入力ハンドラー
 * ユーザー入力に対する各段階の処理
 */

import type { Bindings } from "../types";
import type { FlowData } from "./flowStates";
import { FLOW_STATE } from "./flowStates";
import { validateDateInput, validateLinkInput } from "./flowValidation";
import { sendColoredSlackMessage, sendInteractiveMessage } from "../utils/slack";
import { storeThreadData } from "../utils/kv";
import { KV_CONFIG } from "../constants";
import { BLOCK_TEMPLATES } from "../ui/slackBlocks";

/**
 * 日付入力処理
 * @param env 環境変数
 * @param flowData フローデータ
 * @param input ユーザー入力
 * @param threadTs スレッドタイムスタンプ
 * @returns レスポンス
 */
export async function handleDateInput(
  env: Bindings,
  flowData: FlowData,
  input: string,
  threadTs: string,
): Promise<Response> {
  const validation = validateDateInput(input);

  if (!validation.isValid) {
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      validation.errorMessage!,
      'danger',
    );
    return new Response("OK");
  }

  // 日付を保存して次のステップへ
  flowData.collectedData = { ...flowData.collectedData, date: validation.formattedDate! };
  flowData.flowState = FLOW_STATE.WAITING_TITLE;
  await storeThreadData(env, threadTs, flowData, KV_CONFIG.THREAD_TTL);

  const blocks = BLOCK_TEMPLATES.TITLE_INPUT();

  await sendInteractiveMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    "",
    blocks,
  );
  return new Response("OK");
}

/**
 * タイトル入力処理
 * @param env 環境変数
 * @param flowData フローデータ
 * @param input ユーザー入力
 * @param threadTs スレッドタイムスタンプ
 * @returns レスポンス
 */
export async function handleTitleInput(
  env: Bindings,
  flowData: FlowData,
  input: string,
  threadTs: string,
): Promise<Response> {
  // "no"入力でスキップ
  const titleValue = input.toLowerCase() === "no" ? "" : input;

  // タイトルを保存
  flowData.collectedData = { ...flowData.collectedData, title: titleValue };
  flowData.flowState = FLOW_STATE.WAITING_LINK;
  await storeThreadData(env, threadTs, flowData, KV_CONFIG.THREAD_TTL);

  const blocks = BLOCK_TEMPLATES.LINK_INPUT(
    flowData.collectedData?.date || "",
    titleValue,
  );

  await sendInteractiveMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    "",
    blocks,
  );
  return new Response("OK");
}

/**
 * リンク入力処理
 * @param env 環境変数
 * @param flowData フローデータ
 * @param input ユーザー入力
 * @param threadTs スレッドタイムスタンプ
 * @param completeUpload アップロード完了関数
 * @returns レスポンス
 */
export async function handleLinkInput(
  env: Bindings,
  flowData: FlowData,
  input: string,
  threadTs: string,
  completeUpload: (env: Bindings, flowData: FlowData, threadTs: string) => Promise<Response>,
): Promise<Response> {
  const validation = validateLinkInput(input);

  if (!validation.isValid) {
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      validation.errorMessage!,
      'danger',
    );
    return new Response("OK");
  }

  // リンクを保存して投稿処理へ
  flowData.collectedData = { ...flowData.collectedData, link: validation.processedLink! };

  return await completeUpload(env, flowData, threadTs);
}