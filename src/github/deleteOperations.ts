/**
 * GitHub 削除操作
 * ファイル削除と複合操作
 */

import type { Bindings, LabEntry } from "../types";
import type { GitHubFile, GitHubBlob, GitHubTree, GitHubCommit } from "./types";
import { GITHUB_BOT } from "../constants";
import { createAuthHeaders, createJsonHeaders, getCurrentCommitSha, getCommitDetails, handleGitHubApiError } from "./githubApi";
import { utf8ToBase64 } from "../utils/encoding";
import { createGitHubUrlBuilder } from "./urlBuilder";

/**
 * GitHubからファイルを削除
 */
export async function deleteFileFromGitHub(
  env: Bindings,
  filePath: string,
  commitMessage: string,
): Promise<void> {
  const { GITHUB_TOKEN, GITHUB_BRANCH } = env;
  const urlBuilder = createGitHubUrlBuilder(env);
  
  // ファイル情報を取得
  const fileResponse = await fetch(
    urlBuilder.contents(filePath, GITHUB_BRANCH),
    { headers: createAuthHeaders(GITHUB_TOKEN) },
  );

  if (!fileResponse.ok) {
    if (fileResponse.status === 404) {
      console.log(`File ${filePath} not found, skipping deletion`);
      return;
    }
    await handleGitHubApiError(fileResponse, "get file for deletion");
  }

  const fileData = await fileResponse.json() as GitHubFile;

  // ファイルを削除
  const deleteResponse = await fetch(
    urlBuilder.contents(filePath, GITHUB_BRANCH),
    {
      method: "DELETE",
      headers: createJsonHeaders(GITHUB_TOKEN),
      body: JSON.stringify({
        message: commitMessage,
        sha: fileData.sha,
        branch: GITHUB_BRANCH,
        committer: GITHUB_BOT,
      }),
    },
  );

  if (!deleteResponse.ok) {
    await handleGitHubApiError(deleteResponse, "delete file");
  }

  console.log(`Successfully deleted ${filePath}`);
}

/**
 * 画像削除とJSON更新を同時実行
 */
export async function deleteImageAndUpdateJson(
  env: Bindings,
  imagePath: string,
  updatedJsonData: LabEntry[],
  commitMessage: string,
): Promise<void> {
  const {
    GITHUB_TOKEN,
    GITHUB_BRANCH,
    JSON_PATH,
  } = env;
  
  const authHeaders = createAuthHeaders(GITHUB_TOKEN);
  const jsonHeaders = createJsonHeaders(GITHUB_TOKEN);
  const urlBuilder = createGitHubUrlBuilder(env);

  try {
    // 現在のコミット情報を取得
    const currentCommitSha = await getCurrentCommitSha(env);
    const commitData = await getCommitDetails(env, currentCommitSha);
    const currentTreeSha = commitData.tree.sha;

    // JSONファイルのblobを作成
    const jsonBlobResponse = await fetch(
      urlBuilder.gitBlobs(),
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          content: utf8ToBase64(JSON.stringify(updatedJsonData, null, 2)),
          encoding: "base64",
        }),
      },
    );

    if (!jsonBlobResponse.ok) {
      await handleGitHubApiError(jsonBlobResponse, "JSON blob for delete");
    }

    const jsonBlobData = await jsonBlobResponse.json() as GitHubBlob;

    // 現在のツリー構造を取得（再帰）
    const treeResponse = await fetch(
      urlBuilder.gitTrees(currentTreeSha, true),
      { headers: authHeaders },
    );

    if (!treeResponse.ok) {
      await handleGitHubApiError(treeResponse, "get tree for delete");
    }

    const treeData = await treeResponse.json() as GitHubTree;

    // blob（ファイル）のみで新ツリーを再構築し、対象画像を除外
    let removed = false;
    const newTree = treeData.tree
      .filter((item: any) => item.type === 'blob')
      .filter((item: any) => {
        const isTarget = item.path === imagePath;
        if (isTarget) {
          removed = true;
          console.log(`Excluding image blob from tree: ${item.path}`);
        }
        return !isTarget;
      })
      .map((item: any) => ({
        path: item.path,
        mode: item.mode,
        type: 'blob',
        sha: item.path === JSON_PATH ? jsonBlobData.sha : item.sha,
      }));

    if (!removed) {
      console.log(`Warning: target image not found in tree: ${imagePath}`);
    }

    // 新しいツリーを作成（完全ツリーを渡す）
    const newTreeResponse = await fetch(
      urlBuilder.gitTrees(),
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          tree: newTree,
        }),
      },
    );

    if (!newTreeResponse.ok) {
      await handleGitHubApiError(newTreeResponse, "create new tree");
    }

    const newTreeData = await newTreeResponse.json() as GitHubTree;

    // 新しいコミットを作成
    const commitResponse = await fetch(
      urlBuilder.gitCommits(),
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
          message: commitMessage,
          tree: newTreeData.sha,
          parents: [currentCommitSha],
          author: GITHUB_BOT,
          committer: GITHUB_BOT,
        }),
      },
    );

    if (!commitResponse.ok) {
      await handleGitHubApiError(commitResponse, "commit delete");
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
      await handleGitHubApiError(refUpdateResponse, "ref update delete");
    }

    console.log(`Successfully deleted ${imagePath} and updated JSON in single commit`);
  } catch (error) {
    console.error("Error in deleteImageAndUpdateJson:", error);
    throw error;
  }
}
