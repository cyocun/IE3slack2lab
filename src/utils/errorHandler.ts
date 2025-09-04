import type { Bindings } from "../types";
import { sendSlackMessage } from "./slack";

/**
 * 一般的なエラーハンドリング用のユーティリティ
 */

export interface ErrorHandlerOptions {
  env: Bindings;
  channel: string;
  threadTs: string;
  operation: string;
}

/**
 * 標準化されたエラーハンドリング
 */
export async function handleError(
  error: unknown,
  options: ErrorHandlerOptions,
): Promise<void> {
  const { env, channel, threadTs, operation } = options;
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  console.error(`${operation} error:`, error);

  let detailedError = `❌ ${operation}でエラーが発生しました: ${errorMessage}`;

  // エラースタックの表示（開発時のみ）
  if (error instanceof Error && error.stack) {
    const stackLines = error.stack.split("\n").slice(0, 3);
    detailedError += `\n\`\`\`\n${stackLines.join("\n")}\n\`\`\``;
  }

  await sendSlackMessage(env.SLACK_BOT_TOKEN, channel, threadTs, detailedError);
}

/**
 * GitHub APIエラー専用のハンドリング
 */
export class GitHubAPIError extends Error {
  constructor(
    public status: number,
    public response: string,
    public operation: string,
  ) {
    super(`GitHub API error: ${status} - ${response.substring(0, 100)}`);
    this.name = "GitHubAPIError";
  }
}

/**
 * GitHub APIレスポンスを検証し、エラーの場合は例外を投げる
 */
export async function validateGitHubResponse(
  response: Response,
  operation: string,
): Promise<void> {
  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      `GitHub API error (${operation}):`,
      response.status,
      errorText,
    );
    throw new GitHubAPIError(response.status, errorText, operation);
  }
}

/**
 * 非同期操作を安全に実行し、エラーハンドリングを統一
 */
export async function safeAsyncOperation<T>(
  operation: () => Promise<T>,
  options: ErrorHandlerOptions,
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    await handleError(error, options);
    return null;
  }
}

/**
 * 検証エラー用のクラス
 */
export class ValidationError extends Error {
  constructor(field: string, value: string, expected: string) {
    super(`Invalid ${field}: received "${value}", expected ${expected}`);
    this.name = "ValidationError";
  }
}

/**
 * 日付検証のヘルパー
 */
export function validateDateFormat(date: string): void {
  if (!date) {
    throw new ValidationError("date", date, "YYYYMMDD or MMDD format");
  }

  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
    throw new ValidationError("date format", date, "YYYY/MM/DD format");
  }
}
