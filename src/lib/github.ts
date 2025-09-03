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
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
    
    console.log('GitHub API Request:', {
      url,
      owner: this.owner,
      repo: this.repo,
      path,
      branch: this.branch,
      tokenLength: this.token?.length || 0
    });
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'slack-to-github-image-uploader/1.0.0'
      }
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('GitHub API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        contentType: response.headers.get('content-type'),
        rateLimit: response.headers.get('x-ratelimit-remaining'),
        rateLimitReset: response.headers.get('x-ratelimit-reset')
      });
      
      if (response.status === 404) {
        return null;
      }
      throw new Error(`GitHub API error: ${response.status} - ${errorBody}`);
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
    // リトライの場合は必ず最新のファイル情報を取得
    const existingFile = await this.getFile(path);
    
    // 大きなファイルでスタックオーバーフローを避けるため、チャンク処理でBase64エンコード
    const uint8Array = new Uint8Array(content);
    let binaryString = '';
    const chunkSize = 8192; // 8KB chunks to avoid stack overflow
    
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode(...chunk);
    }
    
    const body: GitHubUploadRequest = {
      message,
      content: btoa(binaryString), // Base64エンコード
      branch: this.branch
    };

    // 既存ファイルがある場合はSHA値を設定
    if (existingFile) {
      body.sha = existingFile.sha;
      console.log(`Using SHA for file update: ${existingFile.sha}`);
    } else {
      console.log('No existing file found, creating new file');
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'slack-to-github-image-uploader/1.0.0'
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
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'slack-to-github-image-uploader/1.0.0'
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
      console.log('JSON file not found, returning empty array');
      return [];
    }
    
    try {
      const content = atob(file.content);
      console.log('JSON file content length:', content.length);
      console.log('JSON file content preview:', content.substring(0, 200));
      
      if (!content.trim()) {
        console.log('Empty JSON file, returning empty array');
        return [];
      }
      
      const parsed = JSON.parse(content);
      console.log('Successfully parsed JSON, item count:', Array.isArray(parsed) ? parsed.length : 'not an array');
      return parsed;
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw file content length:', file.content.length);
      console.error('Decoded content length:', atob(file.content).length);
      throw new Error(`JSONファイルの解析に失敗しました: ${(parseError as Error).message}`);
    }
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
    
    // リトライなし、即座に実行
    return this.uploadFile(path, buffer.buffer, message);
  }

  /**
   * 複数ファイルを1つのコミットでアップロード（Tree API使用）
   * @param files アップロードするファイルの配列
   * @param message コミットメッセージ
   * @returns コミット結果
   */
  async uploadMultipleFiles(files: Array<{path: string, content: ArrayBuffer, isText?: boolean}>, message: string): Promise<any> {
    // 1. 現在のブランチの最新コミットを取得
    const branchResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/branches/${this.branch}`, {
      headers: {
        'Authorization': `token ${this.token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'slack-to-github-image-uploader/1.0.0'
      }
    });

    if (!branchResponse.ok) {
      throw new Error(`Branch fetch failed: ${branchResponse.status}`);
    }

    const branchData = await branchResponse.json() as any;
    const latestCommitSha = branchData.commit.sha;
    const baseTreeSha = branchData.commit.commit.tree.sha;

    // 2. ブロブを作成
    const blobs = await Promise.all(files.map(async (file) => {
      let blobContent: string;
      
      if (file.isText) {
        // テキストファイル（JSON）の場合：UTF-8として正しく処理
        const uint8Array = new Uint8Array(file.content);
        let binaryString = '';
        
        // UTF-8バイト配列をバイナリ文字列に変換
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]!);
        }
        blobContent = btoa(binaryString);
      } else {
        // バイナリファイル（画像）の場合：従来のチャンク処理
        const uint8Array = new Uint8Array(file.content);
        let binaryString = '';
        const chunkSize = 8192;
        
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          binaryString += String.fromCharCode(...chunk);
        }
        blobContent = btoa(binaryString);
      }

      const blobResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/git/blobs`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'slack-to-github-image-uploader/1.0.0'
        },
        body: JSON.stringify({
          content: blobContent,
          encoding: 'base64'
        })
      });

      if (!blobResponse.ok) {
        throw new Error(`Blob creation failed: ${blobResponse.status}`);
      }

      const blobData = await blobResponse.json() as any;
      return {
        path: file.path,
        sha: blobData.sha
      };
    }));

    // 3. ツリーを作成
    const treeResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/git/trees`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'slack-to-github-image-uploader/1.0.0'
      },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: blobs.map(blob => ({
          path: blob.path,
          mode: '100644',
          type: 'blob',
          sha: blob.sha
        }))
      })
    });

    if (!treeResponse.ok) {
      throw new Error(`Tree creation failed: ${treeResponse.status}`);
    }

    const treeData = await treeResponse.json() as any;

    // 4. コミットを作成
    const commitResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/git/commits`, {
      method: 'POST',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'slack-to-github-image-uploader/1.0.0'
      },
      body: JSON.stringify({
        message,
        tree: treeData.sha,
        parents: [latestCommitSha]
      })
    });

    if (!commitResponse.ok) {
      throw new Error(`Commit creation failed: ${commitResponse.status}`);
    }

    const commitData = await commitResponse.json() as any;

    // 5. ブランチの参照を更新
    const refResponse = await fetch(`${this.baseUrl}/repos/${this.owner}/${this.repo}/git/refs/heads/${this.branch}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${this.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'slack-to-github-image-uploader/1.0.0'
      },
      body: JSON.stringify({
        sha: commitData.sha
      })
    });

    if (!refResponse.ok) {
      throw new Error(`Reference update failed: ${refResponse.status}`);
    }

    return commitData;
  }
}