/**
 * GitHub アップロード操作
 * 画像とJSONファイルの同期アップロード
 */

import type { Bindings, LabEntry } from "../types";
import type { GitHubBlob, GitHubTree, GitHubCommit } from "./types";
import { GITHUB_BOT, COMMIT_PREFIXES } from "../constants";
import { createJsonHeaders, getCurrentCommitSha, getCommitDetails, handleGitHubApiError } from "./githubApi";
import { utf8ToBase64 } from "../utils/encoding";
import { createGitHubUrlBuilder } from "./urlBuilder";

/**
 * ArrayBufferをBase64文字列に変換
 */
export async function convertArrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let binaryString = '';
  const chunkSize = 0x1000; // 4KB chunks to avoid call stack overflow
  
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binaryString);
}

/**
 * UTF-8文字列をBase64に変換
 */
// utf8ToBase64 moved to utils/encoding

/**
 * 画像とJSONデータをGitHubリポジトリにアップロード
 */
export async function uploadToGitHub(
  env: Bindings,
  fileName: string,
  content: ArrayBuffer,
  jsonData: LabEntry[],
): Promise<void> {
  const {
    GITHUB_TOKEN,
    GITHUB_BRANCH,
    IMAGE_PATH,
    JSON_PATH,
  } = env;
  
  const jsonHeaders = createJsonHeaders(GITHUB_TOKEN);
  const urlBuilder = createGitHubUrlBuilder(env);

  // 現在のコミットSHAとツリー情報を取得
  const currentCommitSha = await getCurrentCommitSha(env);
  const commitData = await getCommitDetails(env, currentCommitSha);
  const currentTreeSha = commitData.tree.sha;

  // Blobを作成（画像とJSON）
  const imageBase64 = await convertArrayBufferToBase64(content);
  
  const imageBlobResponse = await fetch(
    urlBuilder.gitBlobs(),
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        content: imageBase64,
        encoding: "base64",
      }),
    },
  );

  if (!imageBlobResponse.ok) {
    await handleGitHubApiError(imageBlobResponse, "image blob");
  }

  const imageBlobData = await imageBlobResponse.json() as GitHubBlob;

  const jsonBlobResponse = await fetch(
    urlBuilder.gitBlobs(),
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        content: utf8ToBase64(JSON.stringify(jsonData, null, 2)),
        encoding: "base64",
      }),
    },
  );

  if (!jsonBlobResponse.ok) {
    await handleGitHubApiError(jsonBlobResponse, "JSON blob");
  }

  const jsonBlobData = await jsonBlobResponse.json() as GitHubBlob;

  // 新しいツリーを作成
  const treeResponse = await fetch(
    urlBuilder.gitTrees(),
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        base_tree: currentTreeSha,
        tree: [
          {
            path: `${IMAGE_PATH}${fileName}`,
            mode: "100644",
            type: "blob",
            sha: imageBlobData.sha,
          },
          {
            path: JSON_PATH,
            mode: "100644",
            type: "blob",
            sha: jsonBlobData.sha,
          },
        ],
      }),
    },
  );

  if (!treeResponse.ok) {
    await handleGitHubApiError(treeResponse, "tree");
  }

  const treeData = await treeResponse.json() as GitHubTree;

  // 新しいコミットを作成
  const commitResponse = await fetch(
    urlBuilder.gitCommits(),
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        message: `${COMMIT_PREFIXES.ADD_IMAGE} ${fileName}`,
        tree: treeData.sha,
        parents: [currentCommitSha],
        author: GITHUB_BOT,
        committer: GITHUB_BOT,
      }),
    },
  );

  if (!commitResponse.ok) {
    await handleGitHubApiError(commitResponse, "commit");
  }

  const newCommitData = await commitResponse.json() as GitHubCommit;

  // ブランチの参照を更新
  const refUpdateResponse = await fetch(
    urlBuilder.gitRefs(GITHUB_BRANCH),
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({
        sha: newCommitData.sha,
      }),
    },
  );

  if (!refUpdateResponse.ok) {
    await handleGitHubApiError(refUpdateResponse, "ref update");
  }

  console.log(`Successfully uploaded ${fileName} and updated JSON`);
}
