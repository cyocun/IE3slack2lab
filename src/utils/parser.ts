import type { ParsedMessage, ThreadOperation, ItemData } from '../types/index.js';

/**
 * 日付の形式が正しいかチェック
 * @param dateStr YYYY-MM-DD形式の日付文字列
 * @returns 正しい日付かどうか
 */
export function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  
  const date = new Date(dateStr + 'T00:00:00');
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * URLの形式が正しいかチェック
 * @param urlStr URL文字列
 * @returns 正しいURLかどうか
 */
export function isValidUrl(urlStr: string): boolean {
  try {
    new URL(urlStr);
    return true;
  } catch {
    return false;
  }
}

/**
 * Slackメッセージから必要な情報を抽出・バリデーション
 * @param text Slackメッセージのテキスト
 * @returns パース結果とエラー情報
 */
export function parseMessage(text: string): ParsedMessage {
  // 正規表現でタイトル、日付、リンクを抽出
  const title = text.match(/タイトル[：:]\s*(.+)/)?.[1]?.trim();
  const date = text.match(/日付[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1]?.trim();
  const link = text.match(/リンク[：:]\s*(.+)/)?.[1]?.trim();
  
  // バリデーション結果を格納
  const errors: string[] = [];
  
  if (!title) errors.push('タイトルが未入力です');
  if (!date) errors.push('日付が未入力です');
  else if (!isValidDate(date)) errors.push('日付の形式が正しくありません (YYYY-MM-DD)');
  if (!link) errors.push('リンクが未入力です');
  else if (!isValidUrl(link)) errors.push('リンクの形式が正しくありません');
  
  return { title, date, link, errors };
}

/**
 * スレッドメッセージから操作を判定
 * @param text スレッドメッセージのテキスト
 * @returns 操作内容またはnull
 */
export function parseThreadMessage(text: string): ThreadOperation | null {
  // 削除操作の判定
  if (text.toLowerCase() === 'delete') {
    return { action: 'delete' };
  }
  
  // 更新操作の判定
  const updates: Partial<ItemData> = {};
  
  const title = text.match(/タイトル[：:]\s*(.+)/)?.[1]?.trim();
  const date = text.match(/日付[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1]?.trim();
  const link = text.match(/リンク[：:]\s*(.+)/)?.[1]?.trim();
  
  if (title) updates.title = title;
  if (date && isValidDate(date)) updates.date = date;
  if (link && isValidUrl(link)) updates.link = link;
  
  // 更新項目があれば更新操作として返す
  if (Object.keys(updates).length > 0) {
    return { action: 'update', updates };
  }
  
  return null;
}

/**
 * エラーメッセージのフォーマット
 * @param errors エラーの配列
 * @returns フォーマット済みエラーメッセージ
 */
export function formatErrorMessage(errors: string[]): string {
  let message = '❌ 投稿フォーマットが正しくありません。\n\n';
  message += '正しい形式:\n';
  message += 'タイトル: [タイトル]\n';
  message += '日付: [YYYY-MM-DD]\n';
  message += 'リンク: [URL]\n\n';
  
  if (errors.length > 0) {
    message += '検出されたエラー:\n';
    errors.forEach(error => {
      message += `- ${error}\n`;
    });
    message += '\n';
  }
  
  message += '例:\n';
  message += 'タイトル: 新商品リリース\n';
  message += '日付: 2024-01-15\n';
  message += 'リンク: https://example.com';
  
  return message;
}