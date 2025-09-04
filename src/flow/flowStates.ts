/**
 * フロー状態管理
 * アップロードフローの状態定義と関連するデータ構造
 */

import type { ThreadData } from "../types";

/**
 * フロー状態の定義
 * アップロード処理の各段階を表す
 */
export const FLOW_STATE = {
  /** 日付入力待ち */
  WAITING_DATE: "waiting_date",
  /** タイトル入力待ち */
  WAITING_TITLE: "waiting_title",
  /** リンク入力待ち */
  WAITING_LINK: "waiting_link",
  /** 処理完了 */
  COMPLETED: "completed",
  /** 編集中 */
  EDITING: "editing",
} as const;

/**
 * フロー状態の型定義
 */
export type FlowState = (typeof FLOW_STATE)[keyof typeof FLOW_STATE];

/**
 * フローデータ構造
 * スレッドデータにフロー固有の情報を追加
 */
export interface FlowData extends ThreadData {
  /** 現在のフロー状態 */
  flowState: FlowState;
  /** アップロード対象の画像ファイル情報 */
  imageFile?: {
    url: string;
    name: string;
    mimetype: string;
  };
  /** 収集されたデータ */
  collectedData?: {
    date?: string;
    title?: string;
    link?: string;
  };
  /** 編集中のフィールド */
  editingField?: "date" | "title" | "link" | undefined;
}