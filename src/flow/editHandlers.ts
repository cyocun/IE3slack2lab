/**
 * 編集機能ハンドラー
 * エントリの編集・削除処理
 */

import type { Bindings, LabEntry } from "../types";
import type { FlowData } from "./flowStates";
import { FLOW_STATE } from "./flowStates";
import { validateDateInput, validateLinkInput } from "./flowValidation";
import { sendColoredSlackMessage, sendInteractiveMessage } from "../utils/slack";
import { getCurrentJsonData, updateJsonOnGitHub, deleteImageAndUpdateJson } from "../github";
import { storeThreadData, deleteThreadData, updateEntryById, deleteEntryById, getImagePathByEntryId } from "../utils/kv";
import { MESSAGES, KV_CONFIG, COMMIT_PREFIXES, BUTTONS } from "../constants";
import { MessageUtils } from "../utils/messageFormatter";

/**
 * 編集フィールド選択処理（ボタン付き）
 * @param env 環境変数
 * @param flowData フローデータ
 * @param threadTs スレッドタイムスタンプ
 * @returns レスポンス
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
            text: BUTTONS.EDIT_DATE,
            emoji: true,
          },
          action_id: "edit_date",
          value: flowData.entryId?.toString() || "",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.EDIT_TITLE,
            emoji: true,
          },
          action_id: "edit_title",
          value: flowData.entryId?.toString() || "",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.EDIT_LINK,
            emoji: true,
          },
          action_id: "edit_link",
          value: flowData.entryId?.toString() || "",
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.CANCEL,
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
 * @param env 環境変数
 * @param flowData フローデータ
 * @param input ユーザー入力
 * @param threadTs スレッドタイムスタンプ
 * @returns レスポンス
 */
export async function handleEditInput(
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

  // フィールド別の検証
  if (field === "date") {
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
    processedInput = validation.formattedDate!;
  } else if (field === "link") {
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
    processedInput = validation.processedLink!;
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
    `${COMMIT_PREFIXES.UPDATE_ENTRY} ${flowData.entryId}`,
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
 * @param env 環境変数
 * @param flowData フローデータ
 * @param threadTs スレッドタイムスタンプ
 * @returns レスポンス
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
            text: BUTTONS.DELETE_CONFIRM,
            emoji: true,
          },
          action_id: "confirm_delete",
          value: flowData.entryId.toString(),
        },
        {
          type: "button",
          text: {
            type: "plain_text",
            text: BUTTONS.CANCEL,
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
 * @param env 環境変数
 * @param flowData フローデータ
 * @param threadTs スレッドタイムスタンプ
 * @returns レスポンス
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
        `${COMMIT_PREFIXES.DELETE_ENTRY} ${flowData.entryId}`,
      );
    } else {
      // 画像がない場合はJSONのみ更新
      await updateJsonOnGitHub(
        env,
        updatedData,
        `${COMMIT_PREFIXES.DELETE_ENTRY} ${flowData.entryId}`,
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