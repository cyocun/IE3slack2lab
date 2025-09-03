import { parseMessage, formatErrorMessage } from '../utils/parser.js';
import { resizeImage, generateImagePath } from '../lib/image.js';
import { handleThreadOperation } from './thread.js';
import { SlackClient } from '../lib/slack.js';
import { GitHubClient } from '../lib/github.js';
import type { 
  SlackMessage, 
  Environment, 
  ItemData, 
  ItemMetadata 
} from '../types/index.js';

/**
 * Slackメッセージの処理メインハンドラー
 * 新規投稿とスレッド操作を判定して適切な処理を実行
 * @param event Slackメッセージイベント
 * @param slackClient Slack APIクライアント
 * @param githubClient GitHub APIクライアント
 * @param env 環境変数
 */
export async function handleMessage(
  event: SlackMessage, 
  slackClient: SlackClient, 
  githubClient: GitHubClient, 
  env: Environment
): Promise<void> {
  const { text, files, channel, user, thread_ts, ts } = event;

  // スレッドでの返信の場合はスレッド操作として処理
  if (thread_ts) {
    await handleThreadOperation(event, slackClient, githubClient, env);
    return;
  }

  // 画像が添付されていない場合はエラー
  if (!files || files.length === 0) {
    await slackClient.postMessage(
      channel,
      '❌ 画像が添付されていません。画像を添付して投稿してください。',
      ts
    );
    return;
  }

  // メッセージをパースしてバリデーション
  const parsed = parseMessage(text || '');
  
  if (parsed.errors.length > 0) {
    // フォーマットエラーがある場合は詳細なエラーメッセージを返信
    const errorMessage = formatErrorMessage(parsed.errors);
    await slackClient.postMessage(channel, errorMessage, ts);
    return;
  }

  try {
    // 処理開始の通知
    await slackClient.postMessage(
      channel,
      '📤 画像をアップロード中...',
      ts
    );

    // 最初の添付ファイルを処理対象とする
    const file = files[0];
    if (!file) {
      throw new Error('ファイルが見つかりません');
    }
    const fileInfo = await slackClient.getFileInfo(file.id);
    
    if (!fileInfo.ok) {
      throw new Error('ファイル情報の取得に失敗しました');
    }

    // 画像ファイルかチェック
    if (!fileInfo.file.mimetype?.startsWith('image/')) {
      await slackClient.postMessage(
        channel,
        '❌ 添付ファイルは画像ではありません。',
        ts
      );
      return;
    }

    // 画像をダウンロードしてリサイズ
    let imageBuffer: ArrayBuffer;
    let resizedImage: ArrayBuffer;
    
    try {
      imageBuffer = await slackClient.downloadFile(fileInfo.file.url_private_download);
    } catch (downloadError) {
      console.error('Image download error:', downloadError);
      throw new Error(`画像のダウンロードに失敗しました: ${(downloadError as Error).message}`);
    }
    
    try {
      resizedImage = await resizeImage(imageBuffer);
    } catch (resizeError) {
      console.error('Image resize error:', resizeError);
      throw new Error(`画像のリサイズに失敗しました: ${(resizeError as Error).message}`);
    }
    
    // 保存パスを生成
    const timestamp = Date.now();
    const { path } = generateImagePath(fileInfo.file.name, timestamp);
    const fullPath = `${env.IMAGE_PATH}${path}`;
    
    // GitHubに画像をアップロード
    try {
      await githubClient.uploadFile(
        fullPath,
        resizedImage,
        `Add image: ${parsed.title}`
      );
    } catch (uploadError) {
      console.error('GitHub upload error:', uploadError);
      throw new Error(`GitHubへの画像アップロードに失敗しました: ${(uploadError as Error).message}`);
    }

    // 既存のJSONデータを取得
    let jsonData;
    try {
      jsonData = await githubClient.getJSON(env.JSON_PATH);
    } catch (jsonError) {
      console.error('JSON fetch error:', jsonError);
      throw new Error(`JSONデータの取得に失敗しました: ${(jsonError as Error).message}`);
    }
    
    // 新しいアイテムデータを作成
    const metadata: ItemMetadata = {
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      slack_user: user,
      slack_channel: channel,
      slack_thread_ts: ts,
      slack_message_ts: ts
    };

    const newItem: ItemData = {
      id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      title: parsed.title!,
      date: parsed.date!,
      link: parsed.link!,
      image: path,
      metadata
    };

    // JSONデータを更新（新しいアイテムを配列の先頭に追加）
    jsonData.items.splice(0, 0, newItem);
    jsonData.last_updated = new Date().toISOString();

    // GitHubのJSONファイルを更新
    try {
      await githubClient.updateJSON(
        env.JSON_PATH,
        jsonData,
        `Add item: ${parsed.title}`
      );
    } catch (updateError) {
      console.error('JSON update error:', updateError);
      // 画像はアップロード済みなので、削除を試みる
      try {
        await githubClient.deleteFile(fullPath, `Rollback: Delete orphaned image`);
      } catch (rollbackError) {
        console.error('Image rollback failed:', rollbackError);
      }
      throw new Error(`JSONファイルの更新に失敗しました: ${(updateError as Error).message}`);
    }

    // 完了通知メッセージ
    const successMessage = [
      '✅ 画像をアップロードしました！',
      `• タイトル: ${parsed.title}`,
      `• 日付: ${parsed.date}`,
      `• リンク: ${parsed.link}`,
      '',
      '💡 ヒント: このスレッドで以下の操作ができます:',
      '• `delete` - 投稿を削除',
      '• タイトル、日付、リンクの更新'
    ].join('\n');

    await slackClient.postMessage(channel, successMessage, ts);

  } catch (error) {
    console.error('Message handling error:', error);
    
    // エラーの詳細情報を作成
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error && error.stack ? error.stack : '';
    
    // エラーの種類を判定
    let errorType = 'エラー';
    if (errorMessage.includes('GitHub') || errorMessage.includes('git')) {
      errorType = 'GitHub連携エラー';
    } else if (errorMessage.includes('画像') || errorMessage.includes('image')) {
      errorType = '画像処理エラー';
    } else if (errorMessage.includes('JSON')) {
      errorType = 'データ処理エラー';
    } else if (errorMessage.includes('Slack')) {
      errorType = 'Slack連携エラー';
    }
    
    // Slackに詳細なエラー通知
    const notificationMessage = [
      `❌ ${errorType}が発生しました`,
      '',
      `**エラー内容:** ${errorMessage}`,
      '',
      '📋 **詳細情報:**',
      `• 発生時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
      `• ユーザー: <@${user}>`,
      `• チャンネル: <#${channel}>`,
      ...(parsed.title ? [`• タイトル: ${parsed.title}`] : []),
      '',
      '🔧 **対処法:**',
      '• しばらく待ってから再度お試しください',
      '• 問題が続く場合は、管理者にお問い合わせください'
    ].join('\n');
    
    try {
      await slackClient.postMessage(channel, notificationMessage, ts);
    } catch (notificationError) {
      console.error('Error notification failed:', notificationError);
      // 最低限のエラー通知を試みる
      try {
        await slackClient.postMessage(
          channel,
          `❌ エラーが発生しました: ${errorMessage}`,
          ts
        );
      } catch (fallbackError) {
        console.error('Fallback notification also failed:', fallbackError);
      }
    }
    
    // デバッグ用に詳細なログを出力
    console.error('Full error details:', {
      type: errorType,
      message: errorMessage,
      stack: errorStack,
      event: {
        channel,
        user,
        ts,
        hasFiles: !!files && files.length > 0,
        parsedData: parsed
      }
    });
  }
}