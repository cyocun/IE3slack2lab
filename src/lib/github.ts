import type { GitHubFile, GitHubUploadRequest, JSONData, ItemData } from '../types/index.js';

/**
 * GitHub API操作クラス
 */
export class GitHubClient {
  private token: string;
  private owner: string;
  private repo: string;
  private branch: string;
  private baseUrl = 'https://api.github.com';

  constructor(token: string, owner: string, repo: string, branch = 'main') {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
  }

  /**
   * GitHubからファイルを取得
   * @param path ファイルパス
   * @returns ファイル情報またはnull（存在しない場合）
   */
  async getFile(path: string): Promise<GitHubFile | null> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // ファイルが存在しない
      }
      throw new Error(`GitHub API error: ${response.status}`);
    }

    return response.json();
  }

  /**
   * GitHubにファイルをアップロード（新規作成または更新）
   * @param path ファイルパス
   * @param content ファイルの内容（ArrayBuffer）
   * @param message コミットメッセージ
   * @returns アップロード結果
   */
  async uploadFile(path: string, content: ArrayBuffer, message: string): Promise<any> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
    
    // 既存ファイルが存在するかチェック（更新時はSHA値が必要）
    const existingFile = await this.getFile(path);
    
    const body: GitHubUploadRequest = {
      message,
      content: btoa(String.fromCharCode(...new Uint8Array(content))), // Base64エンコード
      branch: this.branch
    };

    // 既存ファイルがある場合はSHA値を設定
    if (existingFile) {
      body.sha = existingFile.sha;
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub upload failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * GitHubからファイルを削除
   * @param path ファイルパス
   * @param message コミットメッセージ
   * @returns 削除結果
   */
  async deleteFile(path: string, message: string): Promise<any> {
    const existingFile = await this.getFile(path);
    if (!existingFile) {
      throw new Error(`File not found: ${path}`);
    }

    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message,
        sha: existingFile.sha,
        branch: this.branch
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub delete failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * JSONファイルを取得してパース
   * @param path JSONファイルのパス
   * @returns アイテム配列
   */
  async getJSON(path: string): Promise<JSONData> {
    const file = await this.getFile(path);
    if (!file) {
      return [];
    }
    
    const content = atob(file.content);
    return JSON.parse(content);
  }

  /**
   * JSONデータを更新してGitHubにアップロード
   * @param path JSONファイルのパス
   * @param data アイテム配列
   * @param message コミットメッセージ
   * @returns アップロード結果
   */
  async updateJSON(path: string, data: JSONData, message: string): Promise<any> {
    const content = JSON.stringify(data, null, 2);
    const encoder = new TextEncoder();
    const buffer = encoder.encode(content);
    
    return this.uploadFile(path, buffer.buffer, message);
  }
}