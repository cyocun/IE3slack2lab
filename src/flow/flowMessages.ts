/**
 * フロー専用メッセージ構築
 * 成功メッセージやフォーマット処理
 */

/**
 * 成功メッセージを構築
 * @param fileName ファイル名
 * @param imageUrl 画像URL
 * @param id エントリID
 * @param date 日付
 * @param title タイトル（オプション）
 * @param link リンク（オプション）
 * @returns フォーマットされた成功メッセージ
 */
export function buildSuccessMessage(
  fileName: string,
  imageUrl: string,
  id: number,
  date: string,
  title?: string,
  link?: string,
): string {
  let message =
    `🎉 UP DONE 🎉\n\n` +
    `\`\`\`` +
    `📸  <https://ie3.jp${imageUrl}|${fileName}>\n` +
    `🔢  ${id}\n` +
    `📅  ${date}\n`;

  if (title) message += `📝  ${title}\n`;
  if (link) message += `🔗  ${link}\n`;

  message +=
    `👩‍💻  <https://ie3.jp/lab>\n` +
    `\`\`\``;

  return message;
}