/**
 * メッセージフォーマッター
 * テンプレート文字列の置換と動的メッセージ生成
 */

import { MESSAGES } from "../constants";

/**
 * メッセージユーティリティ関数
 * テンプレート置換とランダム選択機能
 */
export const MessageUtils = {
  /**
   * ランダムな褒め言葉を取得
   */
  getRandomPraise: (type: "initial" | "processing" = "initial"): string => {
    const praise = type === "initial" ? MESSAGES.PRAISE.INITIAL : MESSAGES.PRAISE.PROCESSING;
    return (
      praise[Math.floor(Math.random() * praise.length)] ??
      (type === "initial" ? "素敵な写真ですね！✨" : "準備完了！🚀")
    );
  },

  /**
   * 日付入力エラーメッセージをフォーマット
   */
  formatDateInvalid: (input: string): string =>
    MESSAGES.PROMPTS.DATE_INVALID.replace("{input}", input),

  /**
   * リンク入力エラーメッセージをフォーマット
   */
  formatLinkInvalid: (input: string): string =>
    MESSAGES.PROMPTS.LINK_INVALID.replace("{input}", input),

  /**
   * 削除確認メッセージをフォーマット
   */
  formatDeleteConfirm: (id: number): string =>
    MESSAGES.PROMPTS.DELETE_CONFIRM.replace("{id}", id.toString()),

  /**
   * アップロード失敗メッセージをフォーマット
   */
  formatUploadFailed: (message: string): string =>
    MESSAGES.ERROR_HANDLING.UPLOAD_FAILED.replace("{message}", message),

  /**
   * 削除失敗メッセージをフォーマット
   */
  formatDeleteFailed: (message: string): string =>
    MESSAGES.ERROR_HANDLING.DELETE_FAILED.replace("{message}", message),

  /**
   * フィールド更新完了メッセージをフォーマット
   */
  formatUpdateField: (field: "date" | "title" | "link", value: string): string =>
    MESSAGES.COMPLETIONS.UPDATE_FIELD.replace(
      "{field}",
      MESSAGES.ERROR_HANDLING.FIELD_NAMES[field],
    ).replace("{value}", value || "なし"),

  /**
   * エントリ削除完了メッセージをフォーマット
   */
  formatDeleteEntry: (id: number): string =>
    MESSAGES.COMPLETIONS.DELETE_ENTRY.replace("{id}", id.toString()),
};