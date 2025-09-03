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
  // 新フォーマットに対応: title, date, url
  // 旧フォーマットとの互換性を保つため、両方のキーワードを受け付ける
  const title = text.match(/(title|タイトル)[：:]\s*(.+)/i)?.[2]?.trim();
  
  // 日付: YYYY/MM/DD または YYYY-MM-DD 形式に対応
  let date = text.match(/(date|日付)[：:]\s*([\d\/\-]+)/i)?.[2]?.trim();
  if (date) {
    // YYYY/MM/DD を YYYY-MM-DD に変換
    date = date.replace(/\//g, '-');
  }
  
  // URLまたはリンク
  let link = text.match(/(url|link|リンク)[：:]\s*(.+)/i)?.[2]?.trim();
  
  // SlackのURLフォーマット <URL> からURLを抽出
  if (link) {
    const slackUrlMatch = link.match(/^<(.+?)>$/);
    if (slackUrlMatch) {
      link = slackUrlMatch[1];
    }
  }
  
  // バリデーション結果を格納
  const errors: string[] = [];
  
  // titleとurlはoptionalなので、未入力チェックはしない
  // dateはrequired
  if (!date) {
    errors.push('date (日付) は必須です');
  } else if (!isValidDate(date)) {
    errors.push('dateの形式が正しくありません (YYYY/MM/DD または YYYY-MM-DD)');
  }
  
  // urlが指定されている場合のみバリデーション
  if (link && !isValidUrl(link)) {
    errors.push('URLの形式が正しくありません');
  }
  
  // titleがない場合はデフォルト値を設定
  const finalTitle = title || `投稿_${date || new Date().toISOString().split('T')[0]}`;
  
  return { title: finalTitle, date, link: link || '', errors };
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
  
  // 新旧両方のフォーマットに対応
  const title = text.match(/(title|タイトル)[：:]\s*(.+)/i)?.[2]?.trim();
  let date = text.match(/(date|日付)[：:]\s*([\d\/\-]+)/i)?.[2]?.trim();
  if (date) {
    date = date.replace(/\//g, '-');
  }
  let link = text.match(/(url|link|リンク)[：:]\s*(.+)/i)?.[2]?.trim();
  
  // SlackのURLフォーマット <URL> からURLを抽出
  if (link) {
    const slackUrlMatch = link.match(/^<(.+?)>$/);
    if (slackUrlMatch) {
      link = slackUrlMatch[1];
    }
  }
  
  if (title) updates.title = title;
  if (date && isValidDate(date)) updates.datetime = date;  // date -> datetime
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
  message += '**正しい形式:**\n';
  message += 'title: [タイトル] **(optional)**\n';
  message += 'date: YYYY/MM/DD **(required)**\n';
  message += 'url: [URL] **(optional)**\n\n';
  
  if (errors.length > 0) {
    message += '**検出されたエラー:**\n';
    errors.forEach(error => {
      message += `- ${error}\n`;
    });
    message += '\n';
  }
  
  message += '**例:**\n';
  message += 'title: 新商品リリース\n';
  message += 'date: 2024/01/15\n';
  message += 'url: https://example.com\n\n';
  message += '※ 画像を必ず添付してください';
  
  return message;
}