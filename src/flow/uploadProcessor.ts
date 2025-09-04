/**
 * アップロード処理
 * 画像の最適化とGitHubへのアップロード処理
 */

import type { Bindings, LabEntry } from "../types";
import type { FlowData } from "./flowStates";
import { FLOW_STATE } from "./flowStates";
import { buildSuccessMessage } from "./flowMessages";
import { sendSlackMessage, sendColoredSlackMessage, getSlackFile, sanitizeFileName, sendInteractiveColoredMessage } from "../utils/slack";
import { uploadToGitHub, getCurrentJsonData } from "../github";
import { toSiteImagePath } from "../utils/paths";
import { optimizeImage, changeExtensionToWebP } from "../utils/imageOptimizer";
import { storeThreadData } from "../utils/kv";
import { MESSAGES, ENDPOINTS, KV_CONFIG, LOG_MESSAGES, BACKGROUND_MESSAGES, BUTTONS, IMAGE_CONFIG } from "../constants";
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
    console.error("Missing critical data for upload:", {
      hasImageFile: !!flowData.imageFile,
      hasDate: !!flowData.collectedData?.date,
      flowState: flowData.flowState,
      threadTs
    });
    
    // データが不足している場合、再度フローを開始できるように状態をリセット
    flowData.flowState = FLOW_STATE.WAITING_DATE;
    await storeThreadData(env, threadTs, flowData, KV_CONFIG.THREAD_TTL);
    
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      `${MESSAGES.ERRORS.MISSING_DATA}\n${MESSAGES.ERRORS.MISSING_DATA_RETRY}`,
    );
    return new Response("OK");
  }

  let uploadSucceeded = false;
  let newEntry: LabEntry | undefined;
  let newId: number | undefined;
  let fileName: string | undefined;

  try {
    // 画像をダウンロード
    console.log(LOG_MESSAGES.PROCESSING.DOWNLOADING_IMAGE);
    const imageBuffer = await getSlackFile(
      flowData.imageFile.url,
      env.SLACK_BOT_TOKEN,
    );

    // 画像を最適化（リサイズとWebP変換）
    console.log(LOG_MESSAGES.PROCESSING.OPTIMIZING_IMAGE);
    const optimizedImageBuffer = await optimizeImage(imageBuffer, IMAGE_CONFIG.MAX_WIDTH, IMAGE_CONFIG.MAX_WIDTH);

    // ファイル名の生成（WebP拡張子に変更）
    const timestamp = Date.now();
    const [year, month] = flowData.collectedData.date.split("/");
    const sanitizedName = sanitizeFileName(flowData.imageFile.name);
    const webpFileName = changeExtensionToWebP(sanitizedName);
    fileName = `${timestamp}_${webpFileName}`;
    const fullPath = `${year}/${month}/${fileName}`;

    // JSONデータの準備
    console.log(LOG_MESSAGES.PROCESSING.PREPARING_JSON);
    const currentData = await getCurrentJsonData(env);
    newId = currentData.length
      ? Math.max(...currentData.map((item) => item.id)) + 1
      : 1;

    newEntry = {
      id: newId,
      image: toSiteImagePath(env.IMAGE_PATH, fullPath),
      title: flowData.collectedData.title || "",
      datetime: flowData.collectedData.date.replace(/\//g, "-"),
      link: flowData.collectedData.link || "",
    };

    // GitHubへアップロード（最適化された画像を使用）
    console.log(LOG_MESSAGES.PROCESSING.UPLOADING_TO_GITHUB);
    try {
      // 最新のデータを取得してマージ（アップロード直前に再度取得）
      const latestData = await getCurrentJsonData(env);
      const mergedData = [newEntry, ...latestData];

      await uploadToGitHub(env, fullPath, optimizedImageBuffer, mergedData);
      uploadSucceeded = true;
      console.log(LOG_MESSAGES.SUCCESS.GITHUB_UPLOAD_COMPLETED);
    } catch (githubError) {
      console.error(LOG_MESSAGES.ERROR.GITHUB_UPLOAD_FAILED, githubError);
      throw githubError;
    }

    // フロー状態を更新
    flowData.flowState = FLOW_STATE.COMPLETED;
    flowData.entryId = newId;
    await storeThreadData(env, threadTs, flowData, KV_CONFIG.COMPLETED_TTL);

    // 完了メッセージ（ボタン付き）を送信
    console.log("📨 Sending success message to Slack...");
    try {
      await sendSuccessMessage(env, flowData, threadTs, fileName, newEntry, newId);
      console.log(LOG_MESSAGES.SUCCESS.SUCCESS_MESSAGE_SENT);
    } catch (slackError) {
      console.error(LOG_MESSAGES.ERROR.SUCCESS_MESSAGE_FAILED, slackError);
      // GitHub成功したがSlackメッセージ失敗の場合、簡易メッセージを送信
      try {
        await sendSlackMessage(
          env.SLACK_BOT_TOKEN,
          flowData.channel,
          threadTs,
          BACKGROUND_MESSAGES.UPLOAD_SUCCESS_FALLBACK.replace('{id}', newId.toString()).replace('{fileName}', fileName),
        );
      } catch (fallbackError) {
        console.error(LOG_MESSAGES.ERROR.FALLBACK_MESSAGE_FAILED, fallbackError);
      }
    }

    return new Response("OK");
  } catch (error) {
    console.error(LOG_MESSAGES.ERROR.UPLOAD_PROCESS_ERROR, error);

    // エラーメッセージを構築
    let errorMessage = error instanceof Error ? error.message : MESSAGES.ERRORS.UNKNOWN_ERROR;

    // 部分的な成功情報を含める
    if (uploadSucceeded && newId && fileName) {
      errorMessage = BACKGROUND_MESSAGES.PARTIAL_SUCCESS.replace('{id}', newId.toString()).replace('{fileName}', fileName).replace('{error}', errorMessage);
    } else {
      errorMessage = MessageUtils.formatUploadFailed(errorMessage);
    }

    try {
      await sendColoredSlackMessage(
        env.SLACK_BOT_TOKEN,
        flowData.channel,
        threadTs,
        errorMessage,
        uploadSucceeded ? 'warning' : 'danger',
      );
    } catch (messageError) {
      console.error(LOG_MESSAGES.ERROR.SLACK_MESSAGE_FAILED, messageError);
    }

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
  const blocks = [
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
            text: BUTTONS.EDIT_ENTRY,
            emoji: true,
          },
          action_id: "edit_entry",
          value: newId.toString(),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.DELETE_ENTRY,
            emoji: true,
          },
          action_id: "delete_entry",
          value: newId.toString(),
        },
      ],
    },
  ];

  await sendInteractiveColoredMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    blocks,
    'good',
  );
}
