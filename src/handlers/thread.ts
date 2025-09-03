import { parseThreadMessage } from '../utils/parser.js';
import { resizeImage, generateImagePath } from '../lib/image.js';
import { SlackClient } from '../lib/slack.js';
import { GitHubClient } from '../lib/github.js';
import type { 
  SlackMessage, 
  Environment, 
  ItemData, 
  JSONData 
} from '../types/index.js';

/**
 * スレッド操作（削除・更新）のハンドラー
 * @param event Slackメッセージイベント
 * @param slackClient Slack APIクライアント
 * @param githubClient GitHub APIクライアント
 * @param env 環境変数
 */
export async function handleThreadOperation(
  event: SlackMessage, 
  slackClient: SlackClient, 
  githubClient: GitHubClient, 
  env: Environment
): Promise<void> {
  const { text, thread_ts, channel, user, files } = event;
  
  // スレッド内でない場合は処理しない
  if (!thread_ts) {
    return;
  }

  // メッセージをパースして操作内容を判定
  const parsed = parseThreadMessage(text || '');
  if (!parsed) {
    return; // 操作に該当しない場合は何もしない
  }

  // JSONから対象のアイテムを検索
  let jsonData;
  let targetItem;
  
  try {
    jsonData = await githubClient.getJSON(env.JSON_PATH);
    targetItem = jsonData.items.find(
      item => item.metadata?.slack_message_ts === thread_ts
    );
  } catch (fetchError) {
    console.error('Failed to fetch JSON data:', fetchError);
    await slackClient.postMessage(
      channel,
      `❌ JSONデータの取得に失敗しました: ${(fetchError as Error).message}`,
      thread_ts
    );
    return;
  }

  if (!targetItem) {
    await slackClient.postMessage(
      channel,
      '❌ 対象の投稿が見つかりません。',
      thread_ts
    );
    return;
  }

  try {
    if (parsed.action === 'delete') {
      // 削除操作
      await handleDelete(targetItem, jsonData, slackClient, githubClient, env, channel, thread_ts);
    } else if (parsed.action === 'update') {
      // 更新操作
      await handleUpdate(targetItem, parsed.updates!, files, jsonData, slackClient, githubClient, env, channel, thread_ts);
    }
  } catch (error) {
    console.error('Thread operation error:', error);
    
    // エラーの詳細情報を作成
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error && error.stack ? error.stack : '';
    
    // エラーの種類を判定
    let errorType = '操作エラー';
    if (errorMessage.includes('GitHub') || errorMessage.includes('git')) {
      errorType = 'GitHub連携エラー';
    } else if (errorMessage.includes('画像') || errorMessage.includes('image')) {
      errorType = '画像処理エラー';
    } else if (errorMessage.includes('JSON')) {
      errorType = 'データ処理エラー';
    } else if (errorMessage.includes('Slack')) {
      errorType = 'Slack連携エラー';
    } else if (errorMessage.includes('削除') || errorMessage.includes('delete')) {
      errorType = '削除処理エラー';
    } else if (errorMessage.includes('更新') || errorMessage.includes('update')) {
      errorType = '更新処理エラー';
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
      `• 操作種別: ${parsed?.action || '不明'}`,
      ...(targetItem ? [`• 対象アイテム: ${targetItem.title}`] : []),
      '',
      '🔧 **対処法:**',
      '• しばらく待ってから再度お試しください',
      '• 問題が続く場合は、管理者にお問い合わせください'
    ].join('\n');
    
    try {
      await slackClient.postMessage(channel, notificationMessage, thread_ts);
    } catch (notificationError) {
      console.error('Error notification failed:', notificationError);
      // 最低限のエラー通知を試みる
      try {
        await slackClient.postMessage(
          channel,
          `❌ 操作中にエラーが発生しました: ${errorMessage}`,
          thread_ts
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
        thread_ts,
        hasFiles: !!files && files.length > 0,
        parsedData: parsed,
        targetItem: targetItem ? {
          id: targetItem.id,
          title: targetItem.title
        } : null
      }
    });
  }
}

/**
 * 削除処理
 * @param targetItem 削除対象のアイテム
 * @param jsonData 現在のJSONデータ
 * @param slackClient Slack APIクライアント
 * @param githubClient GitHub APIクライアント
 * @param env 環境変数
 * @param channel 投稿チャンネル
 * @param threadTs スレッドタイムスタンプ
 */
async function handleDelete(
  targetItem: ItemData,
  jsonData: JSONData,
  slackClient: SlackClient,
  githubClient: GitHubClient,
  env: Environment,
  channel: string,
  threadTs: string
): Promise<void> {
  // 削除開始の通知
  await slackClient.postMessage(
    channel,
    `🗑️ 「${targetItem.title}」を削除しています...`,
    threadTs
  );

  // 関連する画像ファイルを削除
  if (targetItem.image) {
    try {
      const imagePath = `${env.IMAGE_PATH}${targetItem.image}`;
      await githubClient.deleteFile(imagePath, `Delete image: ${targetItem.title}`);
    } catch (error) {
      console.error('Image deletion error:', error);
      // 画像削除に失敗してもJSONの更新は続行
      await slackClient.postMessage(
        channel,
        `⚠️ 画像ファイルの削除に失敗しましたが、データの削除は続行します`,
        threadTs
      );
    }
  }

  // JSONから該当アイテムを削除
  const updatedItems = jsonData.items.filter(item => item.id !== targetItem.id);
  const updatedJson: JSONData = {
    ...jsonData,
    items: updatedItems,
    last_updated: new Date().toISOString()
  };

  // GitHubのJSONファイルを更新
  try {
    await githubClient.updateJSON(
      env.JSON_PATH,
      updatedJson,
      `Delete item: ${targetItem.title}`
    );
  } catch (updateError) {
    console.error('JSON update error during deletion:', updateError);
    throw new Error(`JSONファイルの更新に失敗しました: ${(updateError as Error).message}`);
  }

  // 削除完了の通知
  await slackClient.postMessage(
    channel,
    `✅ 「${targetItem.title}」を削除しました。`,
    threadTs
  );
}

/**
 * 更新処理
 * @param targetItem 更新対象のアイテム
 * @param updates 更新内容
 * @param files 添付ファイル（画像更新時）
 * @param jsonData 現在のJSONデータ
 * @param slackClient Slack APIクライアント
 * @param githubClient GitHub APIクライアント
 * @param env 環境変数
 * @param channel 投稿チャンネル
 * @param threadTs スレッドタイムスタンプ
 */
async function handleUpdate(
  targetItem: ItemData,
  updates: Partial<ItemData>,
  files: any[] | undefined,
  jsonData: JSONData,
  slackClient: SlackClient,
  githubClient: GitHubClient,
  env: Environment,
  channel: string,
  threadTs: string
): Promise<void> {
  const updatedItem = { ...targetItem };
  let imageUpdated = false;

  // テキスト項目の更新
  if (updates.title) updatedItem.title = updates.title;
  if (updates.date) updatedItem.date = updates.date;
  if (updates.link) updatedItem.link = updates.link;

  // 画像の更新処理
  if (files && files.length > 0) {
    const file = files[0];
    let fileInfo;
    try {
      fileInfo = await slackClient.getFileInfo(file.id);
    } catch (fileError) {
      console.error('Failed to get file info:', fileError);
      throw new Error(`ファイル情報の取得に失敗しました: ${(fileError as Error).message}`);
    }
    
    // 画像ファイルかチェック
    if (fileInfo.ok && fileInfo.file.mimetype?.startsWith('image/')) {
      // 新しい画像をダウンロード・リサイズ・アップロード
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
      
      const { path } = generateImagePath(fileInfo.file.name);
      const fullPath = `${env.IMAGE_PATH}${path}`;
      
      try {
        await githubClient.uploadFile(
          fullPath,
          resizedImage,
          `Update image: ${updatedItem.title}`
        );
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        throw new Error(`画像のアップロードに失敗しました: ${(uploadError as Error).message}`);
      }

      // 古い画像の削除
      if (targetItem.image && targetItem.image !== path) {
        try {
          await githubClient.deleteFile(
            `${env.IMAGE_PATH}${targetItem.image}`,
            `Delete old image: ${targetItem.title}`
          );
        } catch (error) {
          console.error('Old image deletion error:', error);
          // 古い画像の削除に失敗しても処理は続行
          console.warn('古い画像ファイルの削除に失敗しましたが、処理を続行します');
        }
      }

      updatedItem.image = path;
      imageUpdated = true;
    }
  }

  // メタデータの更新
  updatedItem.metadata = {
    ...updatedItem.metadata,
    updated_at: new Date().toISOString()
  };

  // JSONデータの更新
  const updatedItems = jsonData.items.map(item => 
    item.id === targetItem.id ? updatedItem : item
  );

  const updatedJson: JSONData = {
    ...jsonData,
    items: updatedItems,
    last_updated: new Date().toISOString()
  };

  // GitHubのJSONファイルを更新
  try {
    await githubClient.updateJSON(
      env.JSON_PATH,
      updatedJson,
      `Update item: ${updatedItem.title}`
    );
  } catch (updateError) {
    console.error('JSON update error:', updateError);
    throw new Error(`JSONファイルの更新に失敗しました: ${(updateError as Error).message}`);
  }

  // 更新完了の通知メッセージを作成
  let updateMessage = '✅ 更新完了:\n';
  if (updates.title) updateMessage += `• タイトル: ${updates.title}\n`;
  if (updates.date) updateMessage += `• 日付: ${updates.date}\n`;
  if (updates.link) updateMessage += `• リンク: ${updates.link}\n`;
  if (imageUpdated) updateMessage += `• 画像: 更新されました\n`;

  await slackClient.postMessage(channel, updateMessage, threadTs);
}