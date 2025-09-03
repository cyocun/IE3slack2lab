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
  const jsonData = await githubClient.getJSON(env.JSON_PATH);
  const targetItem = jsonData.items.find(
    item => item.metadata?.slack_message_ts === thread_ts
  );

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
    await slackClient.postMessage(
      channel,
      `❌ 操作中にエラーが発生しました: ${(error as Error).message}`,
      thread_ts
    );
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
  await githubClient.updateJSON(
    env.JSON_PATH,
    updatedJson,
    `Delete item: ${targetItem.title}`
  );

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
    const fileInfo = await slackClient.getFileInfo(file.id);
    
    // 画像ファイルかチェック
    if (fileInfo.ok && fileInfo.file.mimetype?.startsWith('image/')) {
      // 新しい画像をダウンロード・リサイズ・アップロード
      const imageBuffer = await slackClient.downloadFile(fileInfo.file.url_private_download);
      const resizedImage = await resizeImage(imageBuffer);
      const { path } = generateImagePath(fileInfo.file.name);
      const fullPath = `${env.IMAGE_PATH}${path}`;
      
      await githubClient.uploadFile(
        fullPath,
        resizedImage,
        `Update image: ${updatedItem.title}`
      );

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
  await githubClient.updateJSON(
    env.JSON_PATH,
    updatedJson,
    `Update item: ${updatedItem.title}`
  );

  // 更新完了の通知メッセージを作成
  let updateMessage = '✅ 更新完了:\n';
  if (updates.title) updateMessage += `• タイトル: ${updates.title}\n`;
  if (updates.date) updateMessage += `• 日付: ${updates.date}\n`;
  if (updates.link) updateMessage += `• リンク: ${updates.link}\n`;
  if (imageUpdated) updateMessage += `• 画像: 更新されました\n`;

  await slackClient.postMessage(channel, updateMessage, threadTs);
}