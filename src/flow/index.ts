/**
 * フロー処理のメインエクスポート
 * 分割されたモジュールを統合してエクスポート
 */

// 状態管理
export { FLOW_STATE, type FlowState, type FlowData } from "./flowStates";

// 入力ハンドラー
export { 
  handleDateInput,
  handleTitleInput,
  handleLinkInput 
} from "./flowInputHandlers";

// アップロード処理
export { completeUpload } from "./uploadProcessor";

// 編集処理
export {
  handleEditSelection,
  handleEditInput,
  handleDeleteEntry,
  confirmDelete
} from "./editHandlers";

// 検証機能
export {
  validateDateInput,
  validateLinkInput,
  type DateValidationResult,
  type LinkValidationResult
} from "./flowValidation";

// メッセージ構築
export { buildSuccessMessage } from "./flowMessages";