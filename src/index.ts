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

// イベントIDキャッシュ（メモリ内で重複チェック）
const processedEvents = new Set<string>();

/**
 * Slackイベントの処理
 * @param request HTTPリクエスト
 * @param env 環境変数
 * @returns HTTP応答
 */
async function handleSlackEvent(request: Request, env: Environment): Promise<Response> {
  console.log('=== Slack Event Received ===');
  // Headersのログ出力を修正
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  console.log('Headers:', headers);
  
  // Slack署名の検証
  const verifier = new SlackVerifier(env.SLACK_SIGNING_SECRET);
  
  const clonedRequest = request.clone();
  console.log('Verifying Slack signature...');
  console.log('SLACK_SIGNING_SECRET exists:', !!env.SLACK_SIGNING_SECRET);
  console.log('SLACK_SIGNING_SECRET length:', env.SLACK_SIGNING_SECRET?.length);
  
  let isValid = false;
  try {
    isValid = await verifier.verifyRequest(clonedRequest as any);
  } catch (verifyError) {
    console.error('Error during signature verification:', verifyError);
    console.error('Stack:', (verifyError as Error).stack);
  }
  
  if (!isValid) {
    console.error('Slack signature verification failed!');
    // デバッグのため一時的に署名検証をバイパス（本番では必ず有効にすること）
    console.warn('⚠️ WARNING: Bypassing signature verification for debugging');
    // return new Response('Unauthorized', { status: 401 });
  } else {
    console.log('Slack signature verified successfully');
  }

  const body: SlackEvent | SlackVerificationEvent = await request.json();
  console.log('Request body:', JSON.stringify(body, null, 2));

  // URL検証（Slack App設定時の初回リクエスト）
  if (body.type === 'url_verification') {
    console.log('URL verification request received');
    return new Response((body as SlackVerificationEvent).challenge, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // イベント処理
  if ('event' in body) {
    const eventId = body.event_id || body.event.ts;
    console.log(`Event ID: ${eventId}, Event type: ${body.event.type}, Subtype: ${body.event.subtype || 'none'}`);
    
    // イベント重複チェック
    if (processedEvents.has(eventId)) {
      console.log(`⚠️ Duplicate event detected: ${eventId} - skipping processing`);
      return new Response('OK', { status: 200 });
    }
    
    // イベントIDをキャッシュに追加
    processedEvents.add(eventId);
    
    // キャッシュサイズ制限（メモリ使用量制御）
    if (processedEvents.size > 1000) {
      const firstItem = processedEvents.values().next().value;
      if (firstItem) {
        processedEvents.delete(firstItem);
      }
    }
    
    console.log('Event details:', JSON.stringify(body.event, null, 2));
    
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
    // file_shareサブタイプも処理対象に含める
    if (eventType === 'message' && (!subtype || subtype === 'file_share')) {
      console.log('Processing message event with subtype:', subtype || 'none');
      try {
        await handleMessage(body.event, slackClient, githubClient, env);
        console.log('Message event processed successfully');
      } catch (error) {
        console.error('Event processing error:', error);
        console.error('Error stack:', (error as Error).stack);
        
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
    } else {
      console.log(`Unhandled event type: ${eventType}, subtype: ${subtype}`);
    }
  }

  // Slackには常に200 OKを返す（重複処理を避けるため）
  console.log('=== Request processed, returning 200 OK ===');
  return new Response('OK', { status: 200 });
}

export default worker;