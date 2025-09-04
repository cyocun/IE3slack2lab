/**
 * GitHub API 基本操作
 * レスポンスラッパーと共通ヘルパー関数
 */

import type { Bindings } from "../types";
import type { GitHubBranch, GitHubCommit } from "./types";
import { API_CONFIG } from "../constants";
import { createGitHubUrlBuilder } from "./urlBuilder";

/**
 * GitHub API用の認証ヘッダーを生成
 */
export function createAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `token ${token}`,
    "User-Agent": API_CONFIG.USER_AGENT,
  };
}

/**
 * GitHub API用のJSONヘッダーを生成
 */
export function createJsonHeaders(token: string): HeadersInit {
  return {
    ...createAuthHeaders(token),
    "Content-Type": "application/json",
  };
}

/**
 * GitHub APIレスポンスのエラーハンドリング
 */
export async function handleGitHubApiError(
  response: Response,
  context: string,
): Promise<never> {
  const errorText = await response.text();
  console.error(`GitHub API error (${context}):`, response.status, errorText);
  throw new Error(
    `GitHub API error: ${response.status} - ${errorText.substring(0, 100)}`,
  );
}

/**
 * ブランチの最新コミットSHAを取得
 */
export async function getCurrentCommitSha(
  env: Bindings,
): Promise<string> {
  const { GITHUB_TOKEN, GITHUB_BRANCH } = env;
  const urlBuilder = createGitHubUrlBuilder(env);
  
  const response = await fetch(
    urlBuilder.gitRefs(GITHUB_BRANCH),
    { headers: createAuthHeaders(GITHUB_TOKEN) },
  );

  if (!response.ok) {
    await handleGitHubApiError(response, "branch");
  }

  const data = await response.json() as GitHubBranch;
  return data.object.sha;
}

/**
 * コミットの詳細情報を取得
 */
export async function getCommitDetails(
  env: Bindings,
  commitSha: string,
): Promise<GitHubCommit> {
  const { GITHUB_TOKEN } = env;
  const urlBuilder = createGitHubUrlBuilder(env);
  
  const response = await fetch(
    urlBuilder.gitCommits(commitSha),
    { headers: createAuthHeaders(GITHUB_TOKEN) },
  );

  if (!response.ok) {
    await handleGitHubApiError(response, "commit");
  }

  return response.json() as Promise<GitHubCommit>;
}