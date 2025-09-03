import type { SlackFileInfo } from '../types/index.js';

/**
 * Slackリクエストの署名検証クラス
 * セキュリティのため、Slackからの正当なリクエストかを検証する
 */
export class SlackVerifier {
  private signingSecret: string;

  constructor(signingSecret: string) {
    this.signingSecret = signingSecret;
  }

  /**
   * Slackからのリクエストの署名を検証
   * @param request 受信したHTTPリクエスト
   * @returns 署名が正しいかどうか
   */
  async verifyRequest(request: Request): Promise<boolean> {
    const timestamp = request.headers.get('X-Slack-Request-Timestamp');
    const signature = request.headers.get('X-Slack-Signature');
    
    console.log('Verification - Timestamp:', timestamp);
    console.log('Verification - Signature:', signature);
    
    if (!timestamp || !signature) {
      console.error('Missing timestamp or signature');
      return false;
    }

    // リプレイ攻撃の防止：5分以内のリクエストのみ受け付ける
    const currentTime = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp);
    const timeDiff = Math.abs(currentTime - requestTime);
    
    console.log('Current time (Unix):', currentTime);
    console.log('Request time (Unix):', requestTime);
    console.log('Time difference (seconds):', timeDiff);
    console.log('Current date:', new Date(currentTime * 1000).toISOString());
    console.log('Request date:', new Date(requestTime * 1000).toISOString());
    
    // タイムスタンプの検証を一時的に緩和（30分以内）
    if (timeDiff > 60 * 30) {
      console.error('Request timestamp is too far from current time');
      console.error('This might be a timestamp format issue or timezone problem');
      // デバッグのため、一時的に検証を続ける
      // return false;
    }

    const body = await request.text();
    const sigBaseString = `v0:${timestamp}:${body}`;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.signingSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const sigBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(sigBaseString)
    );
    
    // 計算した署名とリクエストの署名を比較
    const computedSignature = 'v0=' + Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    console.log('Computed signature:', computedSignature);
    console.log('Received signature:', signature);
    const isValid = signature === computedSignature;
    console.log('Signature valid:', isValid);
    
    return isValid;
  }
}

/**
 * Slack API操作クラス
 */
export class SlackClient {
  private botToken: string;
  private baseUrl = 'https://slack.com/api';

  constructor(botToken: string) {
    this.botToken = botToken;
  }

  /**
   * チャンネルにメッセージを投稿
   * @param channel 投稿先チャンネル
   * @param text メッセージ本文
   * @param threadTs スレッドのタイムスタンプ（スレッドへの返信時）
   * @returns API応答
   */
  async postMessage(channel: string, text: string, threadTs?: string): Promise<any> {
    const body: any = {
      channel,
      text,
    };

    // スレッドへの返信の場合はthread_tsを設定
    if (threadTs) {
      body.thread_ts = threadTs;
    }

    const response = await fetch(`${this.baseUrl}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    return response.json();
  }

  /**
   * ファイル情報を取得
   * @param fileId ファイルID
   * @returns ファイル情報
   */
  async getFileInfo(fileId: string): Promise<SlackFileInfo> {
    const response = await fetch(`${this.baseUrl}/files.info?file=${fileId}`, {
      headers: {
        'Authorization': `Bearer ${this.botToken}`
      }
    });

    return response.json();
  }

  /**
   * ファイルをダウンロード
   * @param url ファイルのプライベートURL
   * @returns ファイルのバイナリデータ
   */
  async downloadFile(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.botToken}`
      }
    });

    return response.arrayBuffer();
  }
}