import type { Context } from "hono";
import type { Bindings, ThreadData, LabEntry } from "../types";
import {
  sendSlackMessage,
  sendInteractiveMessage,
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
import {
  MESSAGES,
  BUTTONS,
  UI_TEXT,
  BLOCK_TEMPLATES,
  MessageUtils,
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

    await storeThreadData(env, event.ts, flowData);

    // ランダム褒めメッセージと日付入力を促す
    const blocks = BLOCK_TEMPLATES.DATE_INPUT(MessageUtils.getRandomPraise());
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
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      event.channel,
      event.ts,
      MESSAGES.ERRORS.UPLOAD_ERROR,
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
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatDateInvalid(input),
    );
    return new Response("OK");
  }

  // 日付を保存して次のステップへ
  flowData.collectedData = { ...flowData.collectedData, date: formattedDate };
  flowData.flowState = FLOW_STATE.WAITING_TITLE;
  await storeThreadData(env, threadTs, flowData);

  // タイトル入力を促す
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `日付: ${formattedDate} ✅\n\n${MESSAGES.PROMPTS.TITLE_INPUT}`,
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
  await storeThreadData(env, threadTs, flowData);

  // リンク入力を促す
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: UI_TEXT.FLOW.TITLE_STATUS(
          flowData.collectedData?.date || "",
          titleValue,
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
  // "no"入力でスキップ
  const linkValue = input.toLowerCase() === "no" ? "" : input;

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
    // 画像をダウンロード
    const imageBuffer = await getSlackFile(
      flowData.imageFile.url,
      env.SLACK_BOT_TOKEN,
    );

    // ファイル名の生成
    const timestamp = Date.now();
    const [year, month] = flowData.collectedData.date.split("/");
    const sanitizedName = sanitizeFileName(flowData.imageFile.name);
    const fileName = `${timestamp}_${sanitizedName}`;
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

    // GitHubへアップロード
    await uploadToGitHub(env, fullPath, imageBuffer, [
      newEntry,
      ...currentData,
    ]);

    // フロー状態を更新
    flowData.flowState = FLOW_STATE.COMPLETED;
    flowData.entryId = newId;
    await storeThreadData(env, threadTs, flowData);

    // 完了メッセージ
    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: UI_TEXT.COMPLETION.SUMMARY(
            fileName,
            newId,
            flowData.collectedData.date,
            flowData.collectedData.title || "",
            flowData.collectedData.link || "",
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
              text: BUTTONS.EDIT,
            },
            action_id: "edit_entry",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: BUTTONS.DELETE,
            },
            style: "danger",
            action_id: "delete_entry",
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
  } catch (error) {
    console.error("Upload error:", error);
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatUploadFailed(
        error instanceof Error ? error.message : MESSAGES.ERRORS.UNKNOWN_ERROR,
      ),
    );
    return new Response("OK");
  }
}

/**
 * 編集フィールド選択処理
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
            text: BUTTONS.DATE,
          },
          action_id: "edit_date",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.TITLE,
          },
          action_id: "edit_title",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.LINK,
          },
          action_id: "edit_link",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.CANCEL,
          },
          style: "danger",
          action_id: "cancel_edit",
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
      await sendSlackMessage(
        env.SLACK_BOT_TOKEN,
        flowData.channel,
        threadTs,
        MessageUtils.formatDateInvalid(input),
      );
      return new Response("OK");
    }
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
    `Update lab entry ID: ${flowData.entryId}`,
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

  await storeThreadData(env, threadTs, flowData);

  // 完了メッセージ
  await sendSlackMessage(
    env.SLACK_BOT_TOKEN,
    flowData.channel,
    threadTs,
    MessageUtils.formatUpdateField(field, processedInput),
  );

  return new Response("OK");
}

/**
 * エントリ削除処理
 */
export async function handleDeleteEntry(
  env: Bindings,
  flowData: FlowData,
  threadTs: string,
): Promise<Response> {
  if (!flowData.entryId) {
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MESSAGES.ERRORS.DATA_NOT_FOUND,
    );
    return new Response("OK");
  }

  // 確認メッセージ
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
            text: BUTTONS.CONFIRM_DELETE,
          },
          style: "danger",
          action_id: "confirm_delete",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.CANCEL,
          },
          action_id: "cancel_delete",
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
    const updatedData = deleteEntryById(currentData, flowData.entryId);
    await updateJsonOnGitHub(
      env,
      updatedData,
      `Delete lab entry ID: ${flowData.entryId}`,
    );

    await deleteThreadData(env, threadTs);

    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatDeleteEntry(flowData.entryId),
    );
  } catch (error) {
    console.error("Delete error:", error);
    await sendSlackMessage(
      env.SLACK_BOT_TOKEN,
      flowData.channel,
      threadTs,
      MessageUtils.formatDeleteFailed(
        error instanceof Error ? error.message : MESSAGES.ERRORS.UNKNOWN_ERROR,
      ),
    );
  }

  return new Response("OK");
}
