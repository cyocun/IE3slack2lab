/**
 * GitHub データ操作
 * JSONファイルの読み込み、更新、削除操作
 */

import type { Bindings, LabEntry } from "../types";
import type { GitHubFile } from "./types";
import { createAuthHeaders, handleGitHubApiError } from "./githubApi";
import { createGitHubUrlBuilder } from "./urlBuilder";
import { GITHUB_BOT } from "../constants";

/**
 * 現在のJSONデータを取得
 */
export async function getCurrentJsonData(env: Bindings): Promise<LabEntry[]> {
  const { GITHUB_TOKEN, JSON_PATH } = env;
  const urlBuilder = createGitHubUrlBuilder(env);
  
  try {
    const response = await fetch(
      urlBuilder.contents(JSON_PATH),
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
    const content = base64ToUtf8(data.content);
    return JSON.parse(content);
  } catch (error) {
    console.error("Error fetching JSON data:", error);
    return [];
  }
}

/**
 * Base64文字列をUTF-8に変換
 */
function base64ToUtf8(base64: string): string {
  try {
    const binaryString = atob(base64.replace(/\s/g, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch (error) {
    console.error('Base64 decode error:', error);
    throw new Error('Failed to decode base64 content');
  }
}

/**
 * UTF-8文字列をBase64に変換
 */
function utf8ToBase64(text: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binaryString);
}

/**
 * JSONファイルをGitHubで更新
 */
export async function updateJsonOnGitHub(
  env: Bindings,
  jsonData: LabEntry[],
  commitMessage: string,
): Promise<void> {
  const { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, JSON_PATH } = env;
  
  // 現在のファイル情報を取得してSHA値を取得
  const currentFileResponse = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}`,
    { headers: createAuthHeaders(GITHUB_TOKEN) },
  );

  let currentSha: string | undefined;
  if (currentFileResponse.ok) {
    const currentFileData = await currentFileResponse.json() as GitHubFile;
    currentSha = currentFileData.sha;
  }

  // ファイルを更新
  const updateResponse = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${JSON_PATH}`,
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
        committer: GITHUB_BOT,
      }),
    },
  );

  if (!updateResponse.ok) {
    await handleGitHubApiError(updateResponse, "update JSON");
  }
}