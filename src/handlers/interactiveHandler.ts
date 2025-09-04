import type { Context } from "hono";
import type { Bindings, ThreadData, LabEntry } from "../types";
import {
  sendSlackMessage,
  formatDateInput,
  sanitizeFileName,
  getSlackFile,
} from "../utils/slack";
import {
  uploadToGitHub,
  getCurrentJsonData,
  updateJsonOnGitHub,
} from "../utils/github";
import {
  storeThreadData,
  getThreadData,
  deleteThreadData,
  updateEntryById,
  deleteEntryById,
} from "../utils/kv";
import { MESSAGES, VALIDATION, FIELD_NAMES } from "../constants";

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

    // キャンセル処理
    if (actionId.endsWith("_cancel")) {
      await sendSlackMessage(
        env.SLACK_BOT_TOKEN,
        channel,
        threadTs,
        MESSAGES.SUCCESS.CANCELLED,
      );
      return c.text("OK");
    }

    // 削除処理
    if (actionId.endsWith("_delete")) {
      return handleDeleteButtonAction(env, channel, threadTs);
    }

    // 編集処理（日付、タイトル、リンク）
    return handleEditButtonAction(env, actionId, channel, threadTs);
  } catch (error) {
    console.error("Button interaction error:", error);
    return c.text("OK");
  }
}

/**
 * 削除ボタンアクション処理
 */
async function handleDeleteButtonAction(
  env: Bindings,
  channel: string,
  threadTs: string,
): Promise<Response> {
  const threadData = await getThreadData(env, threadTs);
  if (!threadData) {
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      channel,
      threadTs,
      MESSAGES.ERRORS.DATA_NOT_FOUND,
    );
    return new Response("OK");
  }

  if (threadData.entryId) {
    // 既存エントリの削除
    const currentData = await getCurrentJsonData(env);
    const updatedData = deleteEntryById(currentData, threadData.entryId);
    await updateJsonOnGitHub(
      env,
      updatedData,
      `Delete lab entry ID: ${threadData.entryId}`,
    );
    await deleteThreadData(env, threadTs);
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      channel,
      threadTs,
      `${MESSAGES.SUCCESS.DELETE_COMPLETE}エントリID ${threadData.entryId} を削除しました`,
    );
  } else {
    // 保留データの削除
    await deleteThreadData(env, threadTs);
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      channel,
      threadTs,
      MESSAGES.SUCCESS.DELETE_PENDING,
    );
  }

  return new Response("OK");
}

/**
 * 編集ボタンアクション処理
 */
async function handleEditButtonAction(
  env: Bindings,
  actionId: string,
  channel: string,
  threadTs: string,
): Promise<Response> {
  const editType = actionId.split("_")[1] as "date" | "title" | "link";

  const threadData = await getThreadData(env, threadTs);
  if (!threadData) {
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      channel,
      threadTs,
      MESSAGES.ERRORS.DATA_NOT_FOUND,
    );
    return new Response("OK");
  }

  // 編集待ち状態を設定
  const editPrompts = {
    date: MESSAGES.PROMPTS.EDIT_DATE,
    title: MESSAGES.PROMPTS.EDIT_TITLE,
    link: MESSAGES.PROMPTS.EDIT_LINK,
  };

  const updatedThreadData: ThreadData = {
    ...threadData,
    waitingForEdit: {
      type: editType,
      message: editPrompts[editType],
    },
  };

  await storeThreadData(env, threadTs, updatedThreadData);
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    channel,
    threadTs,
    editPrompts[editType],
  );

  return new Response("OK");
}

/**
 * モーダル送信処理
 */
export async function handleModalSubmission(
  c: Context,
  env: Bindings,
  payload: any,
): Promise<Response> {
  try {
    const callbackId = payload.view.callback_id;
    const inputValue =
      payload.view.state.values.edit_input.edit_value.value || "";

    // callback_idから情報を抽出: edit_{type}_{pending|existing}_{threadTs}
    const [, editType, status, threadTs] = callbackId.split("_");
    const isPending = status === "pending";

    if (isPending) {
      return handlePendingModalEdit(env, threadTs, editType, inputValue);
    } else {
      return handleExistingModalEdit(env, threadTs, editType, inputValue);
    }
  } catch (error) {
    console.error("Modal submission error:", error);
    return c.json({
      response_action: "errors",
      errors: { edit_input: MESSAGES.ERRORS.EDIT_INPUT_ERROR },
    });
  }
}

/**
 * 保留中画像のモーダル編集処理
 */
async function handlePendingModalEdit(
  env: Bindings,
  threadTs: string,
  editType: string,
  inputValue: string,
): Promise<Response> {
  const threadData = await getThreadData(env, threadTs);
  if (!threadData || !threadData.pendingFile) {
    return new Response(
      JSON.stringify({
        response_action: "errors",
        errors: { edit_input: MESSAGES.ERRORS.DATA_NOT_FOUND },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  // 日付の場合は即座にアップロード処理
  if (editType === "date") {
    return handlePendingDateEdit(env, threadData, threadTs, inputValue);
  } else {
    return handlePendingFieldEdit(
      env,
      threadData,
      threadTs,
      editType,
      inputValue,
    );
  }
}

/**
 * 保留中の日付編集処理
 */
async function handlePendingDateEdit(
  env: Bindings,
  threadData: ThreadData,
  threadTs: string,
  inputValue: string,
): Promise<Response> {
  const formattedDate = formatDateInput(inputValue);
  if (!formattedDate || !VALIDATION.DATE_REGEX.test(formattedDate)) {
    return new Response(
      JSON.stringify({
        response_action: "errors",
        errors: {
          edit_input: `${MESSAGES.ERRORS.DATE_FORMAT}（YYYYMMDD または MMDD）`,
        },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    await uploadPendingImage(env, threadData, formattedDate, threadTs);
  } catch (error) {
    console.error("Pending upload error:", error);
    return new Response(
      JSON.stringify({
        response_action: "errors",
        errors: { edit_input: MESSAGES.ERRORS.UPLOAD_ERROR },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response("", { status: 200 });
}

/**
 * 保留中のフィールド編集処理
 */
async function handlePendingFieldEdit(
  env: Bindings,
  threadData: ThreadData,
  threadTs: string,
  editType: string,
  inputValue: string,
): Promise<Response> {
  const updatedMetadata = { ...threadData.metadata };
  if (editType === "title") {
    updatedMetadata.title = inputValue;
  } else if (editType === "link") {
    updatedMetadata.url = inputValue;
  }

  const updatedThreadData: ThreadData = {
    ...threadData,
    metadata: updatedMetadata,
  };
  await storeThreadData(env, threadTs, updatedThreadData);

  const fieldName = editType === "title" ? FIELD_NAMES.TITLE : FIELD_NAMES.LINK;
  const successMessage =
    MESSAGES.SUCCESS.FIELD_UPDATED.replace("{field}", fieldName) +
    (inputValue ? `: ${inputValue}` : "（削除）");

  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    threadData.channel,
    threadTs,
    successMessage,
  );

  return new Response("", { status: 200 });
}

/**
 * 保留中の画像をアップロード
 */
async function uploadPendingImage(
  env: Bindings,
  threadData: ThreadData,
  formattedDate: string,
  threadTs: string,
): Promise<void> {
  if (!threadData.pendingFile) return;

  const imageBuffer = await getSlackFile(
    threadData.pendingFile.url,
    env.SLACK_BOT_TOKEN,
  );
  const timestamp = Date.now();
  const [year, month] = formattedDate.split("/");
  const sanitizedName = sanitizeFileName(threadData.pendingFile.name);
  const fileName = `${timestamp}_${sanitizedName}`;
  const fullPath = `${year}/${month}/${fileName}`;

  const currentData = await getCurrentJsonData(env);
  const newId = currentData.length
    ? Math.max(...currentData.map((item) => item.id)) + 1
    : 1;

  const newEntry: LabEntry = {
    id: newId,
    image: `/${env.IMAGE_PATH}${fullPath}`,
    title: threadData.metadata?.title || "",
    datetime: formattedDate.replace(/\//g, "-"),
    link: threadData.metadata?.url || "",
  };

  await uploadToGitHub(env, fullPath, imageBuffer, [newEntry, ...currentData]);

  // スレッドデータを更新
  const { pendingFile, ...baseThreadData } = threadData;
  const updatedThreadData: ThreadData = {
    ...baseThreadData,
    entryId: newId,
  };
  await storeThreadData(env, threadTs, updatedThreadData);

  // 成功メッセージを送信
  const successText = buildSuccessMessage(
    fileName,
    newId,
    formattedDate,
    newEntry.title,
    newEntry.link,
  );
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    threadData.channel,
    threadTs,
    successText,
  );
}

/**
 * 既存エントリのモーダル編集処理
 */
async function handleExistingModalEdit(
  env: Bindings,
  threadTs: string,
  editType: string,
  inputValue: string,
): Promise<Response> {
  const threadData = await getThreadData(env, threadTs);
  if (!threadData || !threadData.entryId) {
    return new Response(
      JSON.stringify({
        response_action: "errors",
        errors: { edit_input: MESSAGES.ERRORS.DATA_NOT_FOUND },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const updates: Partial<LabEntry> = {};

  if (editType === "date") {
    const formattedDate = formatDateInput(inputValue);
    if (!formattedDate || !VALIDATION.DATE_REGEX.test(formattedDate)) {
      return new Response(
        JSON.stringify({
          response_action: "errors",
          errors: {
            edit_input: `${MESSAGES.ERRORS.DATE_FORMAT}（YYYYMMDD または MMDD）`,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    updates.datetime = formattedDate.replace(/\//g, "-");
  } else if (editType === "title") {
    updates.title = inputValue;
  } else if (editType === "link") {
    updates.link = inputValue;
  }

  if (Object.keys(updates).length > 0) {
    const currentData = await getCurrentJsonData(env);
    const updatedData = updateEntryById(
      currentData,
      threadData.entryId,
      updates,
    );

    await updateJsonOnGitHub(
      env,
      updatedData,
      `Update lab entry ID: ${threadData.entryId}`,
    );

    const updateSummary = Object.entries(updates)
      .map(([key, value]) => `• ${key}: ${value || "（削除）"}`)
      .join("\n");

    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      threadData.channel,
      threadTs,
      `${MESSAGES.SUCCESS.UPDATE_COMPLETE}\n\n` +
        `🔢 **エントリID**: ${threadData.entryId}\n` +
        `📝 **更新内容**:\n${updateSummary}`,
    );
  }

  return new Response("", { status: 200 });
}

/**
 * 成功メッセージを構築
 */
function buildSuccessMessage(
  fileName: string,
  id: number,
  date: string,
  title?: string,
  link?: string,
): string {
  let message =
    `${MESSAGES.SUCCESS.UPLOAD_PENDING_COMPLETE}\n\n` +
    `📸 **ファイル名**: \`${fileName}\`\n` +
    `🔢 **エントリID**: ${id}\n` +
    `📅 **日付**: ${date}\n`;

  if (title) message += `📝 **タイトル**: ${title}\n`;
  if (link) message += `🔗 **リンク**: ${link}\n`;

  message += `\n${MESSAGES.EDIT_INSTRUCTIONS}`;

  return message;
}
