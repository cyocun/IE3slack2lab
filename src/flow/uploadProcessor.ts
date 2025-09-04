/**
 * アップロード処理
 * 画像の最適化とGitHubへのアップロード処理
 */

import type { Bindings, LabEntry } from "../types";
import type { FlowData } from "./flowStates";
import { FLOW_STATE } from "./flowStates";
import { buildSuccessMessage } from "./flowMessages";
import { sendSlackMessage, sendColoredSlackMessage, getSlackFile, sanitizeFileName } from "../utils/slack";
import { uploadToGitHub, getCurrentJsonData } from "../github";
import { optimizeImage, changeExtensionToWebP } from "../utils/imageOptimizer";
import { storeThreadData } from "../utils/kv";
import { MESSAGES, ENDPOINTS, KV_CONFIG } from "../constants";
import { MessageUtils } from "../utils/messageFormatter";

/**
 * アップロード完了処理
 * 画像の最適化、アップロード、成功メッセージ送信を実行
 * @param env 環境変数
 * @param flowData フローデータ
 * @param threadTs スレッドタイムスタンプ
 * @returns レスポンス
 */
export async function completeUpload(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<Response> {
  if (!flowData.imageFile || !flowData.collectedData?.date) {
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MESSAGES.ERRORS.MISSING_DATA,
    );
    return new Response("OK");
  }

  try {
    // 処理開始メッセージを送信（褒め言葉付き）
    const praise = MessageUtils.getRandomPraise("processing");
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      `${praise}\n${MESSAGES.PROGRESS.UPLOAD_PROCESSING}`,
    );

    // 画像をダウンロード
    const imageBuffer = await getSlackFile(
      flowData.imageFile.url,
      env.SLACK_BOT_TOKEN,
    );

    // 画像を最適化（リサイズとWebP変換）
    const optimizedImageBuffer = await optimizeImage(imageBuffer, 1200, 1200);

    // ファイル名の生成（WebP拡張子に変更）
    const timestamp = Date.now();
    const [year, month] = flowData.collectedData.date.split("/");
    const sanitizedName = sanitizeFileName(flowData.imageFile.name);
    const webpFileName = changeExtensionToWebP(sanitizedName);
    const fileName = `${timestamp}_${webpFileName}`;
    const fullPath = `${year}/${month}/${fileName}`;

    // JSONデータの準備
    const currentData = await getCurrentJsonData(env);
    const newId = currentData.length
      ? Math.max(...currentData.map((item) => item.id)) + 1
      : 1;

    const newEntry: LabEntry = {
      id: newId,
      image: `/${env.IMAGE_PATH}${fullPath}`,
      title: flowData.collectedData.title || "",
      datetime: flowData.collectedData.date.replace(/\//g, "-"),
      link: flowData.collectedData.link || "",
    };

    // GitHubへアップロード（最適化された画像を使用）
    await uploadToGitHub(env, fullPath, optimizedImageBuffer, [
      newEntry,
      ...currentData,
    ]);

    // フロー状態を更新
    flowData.flowState = FLOW_STATE.COMPLETED;
    flowData.entryId = newId;
    await storeThreadData(env, threadTs, flowData, KV_CONFIG.COMPLETED_TTL);

    // 完了メッセージ（ボタン付き）を送信
    await sendSuccessMessage(env, flowData, threadTs, fileName, newEntry, newId);
    
    return new Response("OK");
  } catch (error) {
    console.error("Upload error:", error);
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatUploadFailed(
        error instanceof Error ? error.message : MESSAGES.ERRORS.UNKNOWN_ERROR,
      ),
      'danger',
    );
    return new Response("OK");
  }
}

/**
 * 成功メッセージとボタンを送信
 * @param env 環境変数
 * @param flowData フローデータ
 * @param threadTs スレッドタイムスタンプ
 * @param fileName ファイル名
 * @param newEntry 新しいエントリ
 * @param newId 新しいID
 */
async function sendSuccessMessage(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
  fileName: string,
  newEntry: LabEntry,
  newId: number,
): Promise<void> {
  const successText = buildSuccessMessage(
    fileName,
    newEntry.image,
    newId,
    flowData.collectedData!.date!,
    flowData.collectedData!.title || "",
    flowData.collectedData!.link || "",
  );

  // 成功メッセージとボタンを一緒に送信（グリーンサイドバー付き）
  const payload = {
    channel: flowData.channel,
    thread_ts: threadTs,
    text: "",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: successText,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "✏️ 修正",
              emoji: true,
            },
            action_id: "edit_entry",
            value: newId.toString(),
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "🗑️ 削除",
              emoji: true,
            },
            action_id: "delete_entry",
            value: newId.toString(),
          },
        ],
      },
    ],
    attachments: [
      {
        color: "good",
        text: "",
      },
    ],
  };

  await fetch(ENDPOINTS.SLACK_API.CHAT_POST_MESSAGE, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}