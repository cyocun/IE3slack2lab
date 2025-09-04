import type { Context } from "hono";
import type { Bindings, ThreadData, LabEntry } from "../types";
import {
  parseMessage,
  detectThreadCommand,
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
import { MESSAGES, VALIDATION } from "../constants";

/**
 * スレッドメッセージ処理
 */
export async function handleThreadMessage(
  c: Context,
  env: Bindings,
  event: any,
): Promise<Response> {
  try {
    const threadData = await getThreadData(env, event.thread_ts);
    if (!threadData) {
      return c.text("OK");
    }

    if (threadData.waitingForEdit) {
      return handleEditInput(c, env, event, threadData);
    }

    const command = detectThreadCommand(event.text || "");

    switch (command) {
      case "edit":
        return handleEditCommand(env, event, threadData);
      case "delete":
        return handleDeleteCommand(env, event, threadData);
      case "update":
        return handleUpdateCommand(env, event, threadData);
      default:
        return c.text("OK");
    }
  } catch (error) {
    console.error("Thread message error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.thread_ts,
      `❌ エラーが発生しました: ${errorMessage}`,
    );
    return c.text("OK");
  }
}

/**
 * 編集入力処理
 */
async function handleEditInput(
  c: Context,
  env: Bindings,
  event: any,
  threadData: ThreadData,
): Promise<Response> {
  if (!threadData.waitingForEdit) {
    return c.text("OK");
  }

  const editType = threadData.waitingForEdit.type;
  const inputValue = event.text?.trim() || "";

  try {
    switch (editType) {
      case "date":
        return handleDateEdit(env, event, threadData, inputValue);
      case "title":
        return handleTitleEdit(env, event, threadData, inputValue);
      case "link":
        return handleLinkEdit(env, event, threadData, inputValue);
      default:
        return c.text("OK");
    }
  } catch (error) {
    console.error("Edit input error:", error);
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.thread_ts,
      `❌ エラーが発生しました: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return c.text("OK");
  }
}

/**
 * 日付編集処理
 */
async function handleDateEdit(
  env: Bindings,
  event: any,
  threadData: ThreadData,
  inputValue: string,
): Promise<Response> {
  const formattedDate = formatDateInput(inputValue);
  if (!formattedDate || !VALIDATION.DATE_REGEX.test(formattedDate)) {
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.thread_ts,
      "❌ 日付形式が正しくありません\n\n例: `20241225` または `1225`\n（YYYYMMDD または MMDD 形式で入力してください）",
    );
    return new Response("OK");
  }

  if (threadData.pendingFile) {
    await handlePendingImageUpload(
      env,
      threadData,
      formattedDate,
      event.thread_ts,
    );
  } else if (threadData.entryId) {
    await updateExistingEntry(
      env,
      threadData,
      { datetime: formattedDate.replace(/\//g, "-") },
      event.thread_ts,
    );
  }

  return new Response("OK");
}

/**
 * タイトル編集処理
 */
async function handleTitleEdit(
  env: Bindings,
  event: any,
  threadData: ThreadData,
  inputValue: string,
): Promise<Response> {
  if (threadData.pendingFile) {
    const updatedMetadata = { ...threadData.metadata, title: inputValue };
    const { waitingForEdit, ...baseThreadData } = threadData;
    const updatedThreadData: ThreadData = {
      ...baseThreadData,
      metadata: updatedMetadata,
    };
    await storeThreadData(env, event.thread_ts, updatedThreadData);
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.thread_ts,
      MESSAGES.SUCCESS.FIELD_UPDATED.replace("{field}", "タイトル") +
        (inputValue ? `: ${inputValue}` : "（削除）"),
    );
  } else if (threadData.entryId) {
    await updateExistingEntry(
      env,
      threadData,
      { title: inputValue },
      event.thread_ts,
    );
  }

  return new Response("OK");
}

/**
 * リンク編集処理
 */
async function handleLinkEdit(
  env: Bindings,
  event: any,
  threadData: ThreadData,
  inputValue: string,
): Promise<Response> {
  if (threadData.pendingFile) {
    const updatedMetadata = { ...threadData.metadata, url: inputValue };
    const { waitingForEdit, ...baseThreadData } = threadData;
    const updatedThreadData: ThreadData = {
      ...baseThreadData,
      metadata: updatedMetadata,
    };
    await storeThreadData(env, event.thread_ts, updatedThreadData);
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.thread_ts,
      MESSAGES.SUCCESS.FIELD_UPDATED.replace("{field}", "リンク") +
        (inputValue ? `: ${inputValue}` : "（削除）"),
    );
  } else if (threadData.entryId) {
    await updateExistingEntry(
      env,
      threadData,
      { link: inputValue },
      event.thread_ts,
    );
  }

  return new Response("OK");
}

/**
 * 保留中画像のアップロード処理
 */
async function handlePendingImageUpload(
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

  const { pendingFile, waitingForEdit, ...baseThreadData } = threadData;
  const updatedThreadData: ThreadData = {
    ...baseThreadData,
    entryId: newId,
  };
  await storeThreadData(env, threadTs, updatedThreadData);

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
 * 既存エントリの更新処理
 */
async function updateExistingEntry(
  env: Bindings,
  threadData: ThreadData,
  updates: Partial<LabEntry>,
  threadTs: string,
): Promise<void> {
  if (!threadData.entryId) return;

  const currentData = await getCurrentJsonData(env);
  const updatedData = updateEntryById(currentData, threadData.entryId, updates);

  await updateJsonOnGitHub(
    env,
    updatedData,
    `Update lab entry ID: ${threadData.entryId}`,
  );

  const { waitingForEdit, ...baseThreadData } = threadData;
  await storeThreadData(env, threadTs, baseThreadData);

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

// Additional handler functions would go here...
async function handleEditCommand(
  env: Bindings,
  event: any,
  threadData: ThreadData,
): Promise<Response> {
  // Implementation for edit command
  return new Response("OK");
}

async function handleDeleteCommand(
  env: Bindings,
  event: any,
  threadData: ThreadData,
): Promise<Response> {
  // Implementation for delete command
  return new Response("OK");
}

async function handleUpdateCommand(
  env: Bindings,
  event: any,
  threadData: ThreadData,
): Promise<Response> {
  // Implementation for update command
  return new Response("OK");
}
