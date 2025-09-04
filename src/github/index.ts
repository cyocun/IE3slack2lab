/**
 * GitHub操作のメインエクスポート
 * 分割されたモジュールを統合してエクスポート
 */

// API基本操作
export {
  createAuthHeaders,
  createJsonHeaders,
  getCurrentCommitSha,
  getCommitDetails,
  handleGitHubApiError,
} from "./githubApi";

// データ操作
export {
  getCurrentJsonData,
  updateJsonOnGitHub,
} from "./dataOperations";

// アップロード操作
export {
  uploadToGitHub,
  convertArrayBufferToBase64,
} from "./uploadOperations";
export { utf8ToBase64 } from "../utils/encoding";

// 削除操作
export {
  deleteFileFromGitHub,
  deleteImageAndUpdateJson,
} from "./deleteOperations";
