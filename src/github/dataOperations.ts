/**
 * GitHub データ操作
 * JSONファイルの読み込み、更新、削除操作
 */

import type { Bindings, LabEntry } from "../types";
import type { GitHubFile } from "./types";
import { createAuthHeaders, handleGitHubApiError } from "./githubApi";
import { createGitHubUrlBuilder } from "./urlBuilder";
import { GITHUB_BOT } from "../constants";
import { base64ToUtf8, utf8ToBase64 } from "../utils/encoding";

/**
 * 現在のJSONデータを取得
 */
export async function getCurrentJsonData(env: Bindings): Promise<LabEntry[]> {
  const { GITHUB_TOKEN, JSON_PATH, GITHUB_BRANCH } = env;
  const urlBuilder = createGitHubUrlBuilder(env);
  
  try {
    const response = await fetch(
      urlBuilder.contents(JSON_PATH, GITHUB_BRANCH),
      { headers: createAuthHeaders(GITHUB_TOKEN) },
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log("JSON file not found, returning empty array");
        return [];
      }
      await handleGitHubApiError(response, "get JSON");
    }

    const data = await response.json() as GitHubFile;
    
    if (!data.content || typeof data.content !== 'string') {
      console.log("Empty or invalid content in GitHub response, returning empty array");
      return [];
    }
    
    const content = base64ToUtf8(data.content);
    
    if (!content.trim()) {
      console.log("Empty JSON content after decoding, returning empty array");
      return [];
    }
    
    return JSON.parse(content);
  } catch (error) {
    console.error("Error fetching JSON data:", error);
    // GitHubのJSONデータ取得エラーは重要なので、可能であればSlackに通知
    if (env.SLACK_BOT_TOKEN) {
      try {
        const { notifySystemError } = await import("../utils/slack");
        await notifySystemError(
          env.SLACK_BOT_TOKEN,
          undefined, // チャンネルは指定しない（ログのみ）
          undefined,
          error,
          "GitHub JSON data fetch"
        );
      } catch (notifyError) {
        console.error("Failed to notify GitHub data error:", notifyError);
      }
    }
    return [];
  }
}

// moved base64 helpers to utils/encoding

/**
 * JSONファイルをGitHubで更新
 */
export async function updateJsonOnGitHub(
  env: Bindings,
  jsonData: LabEntry[],
  commitMessage: string,
): Promise<void> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, JSON_PATH, GITHUB_BRANCH } = env;
  const urlBuilder = createGitHubUrlBuilder(env);
  
  // 現在のファイル情報を取得してSHA値を取得
  const currentFileResponse = await fetch(
    urlBuilder.contents(JSON_PATH, GITHUB_BRANCH),
    { headers: createAuthHeaders(GITHUB_TOKEN) },
  );

  let currentSha: string | undefined;
  if (currentFileResponse.ok) {
    const currentFileData = await currentFileResponse.json() as GitHubFile;
    currentSha = currentFileData.sha;
  }

  // ファイルを更新
  const updateResponse = await fetch(
    urlBuilder.contents(JSON_PATH, GITHUB_BRANCH),
    {
      method: "PUT",
      headers: {
        ...createAuthHeaders(GITHUB_TOKEN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: commitMessage,
        content: utf8ToBase64(JSON.stringify(jsonData, null, 2)),
        sha: currentSha,
        branch: GITHUB_BRANCH,
        committer: GITHUB_BOT,
      }),
    },
  );

  if (!updateResponse.ok) {
    await handleGitHubApiError(updateResponse, "update JSON");
  }
}
