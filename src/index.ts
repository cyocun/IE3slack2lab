import { SlackVerifier, SlackClient } from './lib/slack.js';
import { GitHubClient } from './lib/github.js';
import { handleMessage } from './handlers/message.js';
import type { 
  SlackEvent, 
  SlackVerificationEvent, 
  Environment 
} from './types/index.js';

/**
 * Cloudflare Workerのメインエクスポート
 * すべてのHTTPリクエストがここを通る
 */
const worker: ExportedHandler<Environment> = {
  async fetch(request: Request, env: Environment): Promise<Response> {
    // POSTリクエストのみ受け付ける
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    
    // Slackイベントエンドポイント
    if (url.pathname === '/slack/events') {
      return handleSlackEvent(request, env);
    }

    return new Response('Not found', { status: 404 });
  }
};

/**
 * Slackイベントの処理
 * @param request HTTPリクエスト
 * @param env 環境変数
 * @returns HTTP応答
 */
async function handleSlackEvent(request: Request, env: Environment): Promise<Response> {
  // Slack署名の検証
  const verifier = new SlackVerifier(env.SLACK_SIGNING_SECRET);
  
  const clonedRequest = request.clone();
  const isValid = await verifier.verifyRequest(clonedRequest);
  
  if (!isValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body: SlackEvent | SlackVerificationEvent = await request.json();

  // URL検証（Slack App設定時の初回リクエスト）
  if (body.type === 'url_verification') {
    return new Response((body as SlackVerificationEvent).challenge, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // イベント処理
  if ('event' in body) {
    const slackClient = new SlackClient(env.SLACK_BOT_TOKEN);
    const githubClient = new GitHubClient(
      env.GITHUB_TOKEN,
      env.GITHUB_OWNER,
      env.GITHUB_REPO,
      env.GITHUB_BRANCH
    );

    const eventType = body.event.type;
    const subtype = body.event.subtype;

    // メッセージイベントの処理（ボットや編集メッセージは除く）
    if (eventType === 'message' && !subtype) {
      try {
        await handleMessage(body.event, slackClient, githubClient, env);
      } catch (error) {
        console.error('Event processing error:', error);
        
        // エラーが発生した場合はSlackに通知
        if (body.event.channel && body.event.ts) {
          try {
            await slackClient.postMessage(
              body.event.channel,
              `❌ 処理中にエラーが発生しました: ${(error as Error).message}`,
              body.event.ts
            );
          } catch (notificationError) {
            console.error('Error notification failed:', notificationError);
          }
        }
      }
    } else if (eventType === 'file_shared') {
      // ファイル共有イベントは通常messageイベントでも受信されるため
      // ここでは特別な処理は行わない
      console.log('File shared event received - handled via message event');
    }
  }

  // Slackには常に200 OKを返す（重複処理を避けるため）
  return new Response('OK', { status: 200 });
}

export default worker;