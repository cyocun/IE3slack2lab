import type { Context } from "hono";
import type { Bindings, ThreadData, LabEntry } from "../types";
import {
  sendSlackMessage,
  sendColoredSlackMessage,
  sendInteractiveMessage,
  formatDateInput,
  sanitizeFileName,
  getSlackFile,
  isValidUrl,
  extractUrlFromSlackFormat,
} from "../utils/slack";
import {
  uploadToGitHub,
  getCurrentJsonData,
  updateJsonOnGitHub,
  deleteImageAndUpdateJson,
} from "../utils/github";
import {
  optimizeImage,
  changeExtensionToWebP,
} from "../utils/imageOptimizer";
import {
  storeThreadData,
  getThreadData,
  deleteThreadData,
  updateEntryById,
  deleteEntryById,
  getImagePathByEntryId,
} from "../utils/kv";
import {
  MESSAGES,
  BLOCK_TEMPLATES,
  MessageUtils,
  ENDPOINTS,
  KV_CONFIG,
} from "../constants";

export const FLOW_STATE = {
  WAITING_DATE: "waiting_date",
  WAITING_TITLE: "waiting_title",
  WAITING_LINK: "waiting_link",
  COMPLETED: "completed",
  EDITING: "editing",
} as const;

export type FlowState = (typeof FLOW_STATE)[keyof typeof FLOW_STATE];

export interface FlowData extends ThreadData {
  flowState: FlowState;
  imageFile?: {
    url: string;
    name: string;
    mimetype: string;
  };
  collectedData?: {
    date?: string;
    title?: string;
    link?: string;
  };
  editingField?: "date" | "title" | "link" | undefined;
}

/**
 * 成功メッセージを構築
 */
function buildSuccessMessage(
  fileName: string,
  imageUrl: string,
  id: number,
  date: string,
  title?: string,
  link?: string,
): string {
  let message =
    `${MESSAGES.SUCCESS.UPLOAD_COMPLETE}\n\n` +
    `\`\`\``+
    `📸  <https://ie3.jp${imageUrl}|${fileName}>\n` +
    `🔢  ${id}\n` +
    `📅  ${date}\n`;

    if (title) message += `📝  ${title}\n`;
    if (link) message += `🔗  ${link}\n`;

    message +=
    `👩‍💻  <https://ie3.jp/lab>\n` +
    `\`\`\``;

  return message;
}

/**
 * 画像アップロードの初期処理
 */
export async function handleInitialImageUpload(
  c: Context,
  env: Bindings,
  event: any,
): Promise<Response> {
  const file = event?.files?.[0];
  if (!file || !file.mimetype?.startsWith("image/")) {
    return c.text("OK");
  }

  try {
    // 初期データを保存
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

    // ランダム褒めメッセージと日付入力を促す
    const blocks = BLOCK_TEMPLATES.DATE_INPUT(MessageUtils.getRandomPraise("initial"));
    await sendInteractiveMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.ts,
      "",
      blocks,
    );
    return c.text("OK");
  } catch (error) {
    console.error("Initial upload error:", error);
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.ts,
      MESSAGES.ERRORS.UPLOAD_ERROR,
      'danger',
    );
    return c.text("OK");
  }
}

/**
 * スレッド内のメッセージ処理（フロー制御）
 */
export async function handleFlowMessage(
  c: Context,
  env: Bindings,
  event: any,
): Promise<Response> {
  const threadTs = event.thread_ts;
  const flowData = (await getThreadData(env, threadTs)) as FlowData;

  if (!flowData || !flowData.flowState) {
    return c.text("OK");
  }

  const userInput = event.text?.trim() || "";

  switch (flowData.flowState) {
    case FLOW_STATE.WAITING_DATE:
      return handleDateInput(env, flowData, userInput, threadTs);
    case FLOW_STATE.WAITING_TITLE:
      return handleTitleInput(env, flowData, userInput, threadTs);
    case FLOW_STATE.WAITING_LINK:
      return handleLinkInput(env, flowData, userInput, threadTs);
    case FLOW_STATE.EDITING:
      return handleEditInput(env, flowData, userInput, threadTs);
    default:
      return c.text("OK");
  }
}

/**
 * 日付入力処理
 */
async function handleDateInput(
  env: Bindings,
  flowData: FlowData,
  input: string,
  threadTs: string,
): Promise<Response> {
  const formattedDate = formatDateInput(input);

  if (!formattedDate || !/^\d{4}\/\d{2}\/\d{2}$/.test(formattedDate)) {
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatDateInvalid(input),
      'danger',
    );
    return new Response("OK");
  }

  // 日付を保存して次のステップへ
  flowData.collectedData = { ...flowData.collectedData, date: formattedDate };
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
 */
async function handleTitleInput(
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
 */
async function handleLinkInput(
  env: Bindings,
  flowData: FlowData,
  input: string,
  threadTs: string,
): Promise<Response> {
  const cleanInput = input.trim();

  // URL検証
  if (!isValidUrl(cleanInput)) {
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatLinkInvalid(cleanInput),
      'danger',
    );
    return new Response("OK");
  }

  // "no"入力でスキップ、それ以外はSlackハイパーリンク形式からURLを抽出
  const linkValue = cleanInput.toLowerCase() === "no" ? "" : extractUrlFromSlackFormat(cleanInput);

  // リンクを保存して投稿処理へ
  flowData.collectedData = { ...flowData.collectedData, link: linkValue };

  return await completeUpload(env, flowData, threadTs);
}

/**
 * アップロード完了処理
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

    // 完了メッセージ（ボタン付き）
    const successText = buildSuccessMessage(
      fileName,
      newEntry.image,
      newId,
      flowData.collectedData.date,
      flowData.collectedData.title || "",
      flowData.collectedData.link || "",
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
 * 編集フィールド選択処理（ボタン付き）
 */
export async function handleEditSelection(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<Response> {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: MESSAGES.PROMPTS.WHAT_FIELD_TO_FIX,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📅 日付",
            emoji: true,
          },
          action_id: "edit_date",
          value: flowData.entryId?.toString() || "",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📝 タイトル",
            emoji: true,
          },
          action_id: "edit_title",
          value: flowData.entryId?.toString() || "",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "🔗 リンク",
            emoji: true,
          },
          action_id: "edit_link",
          value: flowData.entryId?.toString() || "",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "❌ キャンセル",
            emoji: true,
          },
          action_id: "cancel_edit",
          value: flowData.entryId?.toString() || "",
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
  return new Response("OK");
}

/**
 * 編集入力処理
 */
async function handleEditInput(
  env: Bindings,
  flowData: FlowData,
  input: string,
  threadTs: string,
): Promise<Response> {
  if (!flowData.editingField || !flowData.entryId) {
    return new Response("OK");
  }

  const field = flowData.editingField;
  let processedInput = input;

  // 日付の場合は検証
  if (field === "date") {
    processedInput = formatDateInput(input);
    if (!processedInput || !/^\d{4}\/\d{2}\/\d{2}$/.test(processedInput)) {
      await sendColoredSlackMessage(
        env.SLACK_BOT_TOKEN,
        flowData.channel,
        threadTs,
        MessageUtils.formatDateInvalid(input),
        'danger',
      );
      return new Response("OK");
    }
  }

  // リンクの場合はURL検証
  if (field === "link") {
    const cleanInput = input.trim();
    if (!isValidUrl(cleanInput)) {
      await sendColoredSlackMessage(
        env.SLACK_BOT_TOKEN,
        flowData.channel,
        threadTs,
        MessageUtils.formatLinkInvalid(cleanInput),
        'danger',
      );
      return new Response("OK");
    }
    // Slackハイパーリンク形式からURLを抽出
    processedInput = cleanInput.toLowerCase() === "no" ? "" : extractUrlFromSlackFormat(cleanInput);
  }

  // データベース更新
  const currentData = await getCurrentJsonData(env);
  const updates: Partial<LabEntry> = {};

  if (field === "date") {
    updates.datetime = processedInput.replace(/\//g, "-");
  } else if (field === "title") {
    updates.title = processedInput;
  } else if (field === "link") {
    updates.link = processedInput;
  }

  const updatedData = updateEntryById(currentData, flowData.entryId, updates);
  await updateJsonOnGitHub(
    env,
    updatedData,
    `✏️ lab: Update lab entry ID: ${flowData.entryId}`,
  );

  // フロー状態をリセット
  flowData.flowState = FLOW_STATE.COMPLETED;
  delete flowData.editingField;

  // collectedDataも更新
  if (field === "date") {
    flowData.collectedData = {
      ...flowData.collectedData,
      date: processedInput,
    };
  } else if (field === "title") {
    flowData.collectedData = {
      ...flowData.collectedData,
      title: processedInput,
    };
  } else if (field === "link") {
    flowData.collectedData = {
      ...flowData.collectedData,
      link: processedInput,
    };
  }

  await storeThreadData(env, threadTs, flowData, KV_CONFIG.COMPLETED_TTL);

  // 完了メッセージ
  await sendColoredSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    MessageUtils.formatUpdateField(field, processedInput),
    'good',
  );

  return new Response("OK");
}

/**
 * エントリ削除処理（確認ボタン付き）
 */
export async function handleDeleteEntry(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<Response> {
  if (!flowData.entryId) {
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MESSAGES.ERRORS.DATA_NOT_FOUND,
      'danger',
    );
    return new Response("OK");
  }

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: MessageUtils.formatDeleteConfirm(flowData.entryId),
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "🗑️ 削除実行",
            emoji: true,
          },
          action_id: "confirm_delete",
          value: flowData.entryId.toString(),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "❌ キャンセル",
            emoji: true,
          },
          action_id: "cancel_delete",
          value: flowData.entryId.toString(),
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
  return new Response("OK");
}

/**
 * 削除確認後の処理
 */
export async function confirmDelete(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<Response> {
  if (!flowData.entryId) {
    return new Response("OK");
  }

  try {
    const currentData = await getCurrentJsonData(env);

    // 削除前に画像パスを取得
    const imagePath = getImagePathByEntryId(currentData, flowData.entryId);

    // JSONからエントリを削除
    const updatedData = deleteEntryById(currentData, flowData.entryId);

    // 画像ファイル削除とJSON更新を1つのコミットで実行
    if (imagePath) {
      // imagePathから先頭の/を除去（存在する場合）
      const cleanPath = imagePath.startsWith('/') ? imagePath.substring(1) : imagePath;

      await deleteImageAndUpdateJson(
        env,
        cleanPath,
        updatedData,
        `🗑️ lab: Delete lab entry ID: ${flowData.entryId}`,
      );
    } else {
      // 画像がない場合はJSONのみ更新
      await updateJsonOnGitHub(
        env,
        updatedData,
        `🗑️ lab: Delete lab entry ID: ${flowData.entryId}`,
      );
    }

    await deleteThreadData(env, threadTs);

    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatDeleteEntry(flowData.entryId),
      'warning',
    );
  } catch (error) {
    console.error("Delete error:", error);
    await sendColoredSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatDeleteFailed(
        error instanceof Error ? error.message : MESSAGES.ERRORS.UNKNOWN_ERROR,
      ),
      'danger',
    );
  }

  return new Response("OK");
}
