/**
 * GitHub API URL構築ユーティリティ
 * 繰り返されるURL構築パターンを統合
 */

import type { Bindings } from "../types";

/**
 * GitHub API のベースURL構築クラス
 */
export class GitHubUrlBuilder {
  private readonly baseUrl: string;
  
  constructor(owner: string, repo: string) {
    this.baseUrl = `https://api.github.com/repos/${owner}/${repo}`;
  }

  /**
   * Contents API URL (ファイルの読み書き用)
   */
  contents(path: string): string {
    return `${this.baseUrl}/contents/${path}`;
  }

  /**
   * Git References API URL (ブランチ参照用)
   */
  gitRefs(branch: string): string {
    return `${this.baseUrl}/git/refs/heads/${branch}`;
  }

  /**
   * Git Commits API URL
   */
  gitCommits(commitSha?: string): string {
    return commitSha 
      ? `${this.baseUrl}/git/commits/${commitSha}`
      : `${this.baseUrl}/git/commits`;
  }

  /**
   * Git Blobs API URL
   */
  gitBlobs(): string {
    return `${this.baseUrl}/git/blobs`;
  }

  /**
   * Git Trees API URL
   */
  gitTrees(treeSha?: string, recursive?: boolean): string {
    const baseTreeUrl = `${this.baseUrl}/git/trees`;
    if (!treeSha) return baseTreeUrl;
    
    const treeUrl = `${baseTreeUrl}/${treeSha}`;
    return recursive ? `${treeUrl}?recursive=1` : treeUrl;
  }
}

/**
 * Bindings から GitHubUrlBuilder を作成するヘルパー関数
 */
export function createGitHubUrlBuilder(env: Bindings): GitHubUrlBuilder {
  return new GitHubUrlBuilder(env.GITHUB_OWNER, env.GITHUB_REPO);
}