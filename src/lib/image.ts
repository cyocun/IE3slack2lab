import type { ImagePathResult } from '../types/index.js';

/**
 * シンプルな画像処理（Cloudflare Workers対応）
 * @param imageBuffer 元画像のバイナリデータ
 * @param maxWidth 最大幅（現時点では使用せず）
 * @returns 元画像のバイナリデータ（サイズ制限のみ実施）
 */
export async function resizeImage(imageBuffer: ArrayBuffer, maxWidth = 1200): Promise<ArrayBuffer> {
  console.log(`Processing image: ${Math.round(imageBuffer.byteLength / 1024)}KB`);
  
  // ファイルサイズ制限をチェック（5MBを超える場合はエラー）
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (imageBuffer.byteLength > maxSize) {
    throw new Error(`画像サイズが大きすぎます: ${Math.round(imageBuffer.byteLength / 1024 / 1024)}MB (上限: 5MB)`);
  }
  
  // 現時点では元画像をそのまま使用
  // 将来的にリサイズ機能を追加する場合は、Cloudflare Image Resizingサービスを使用
  console.log('Using original image (no compression applied)');
  
  return imageBuffer;
}

/**
 * 画像の保存パスとファイル名を生成
 * @param originalName 元ファイル名
 * @param timestamp タイムスタンプ（省略時は現在時刻）
 * @returns 生成されたパス情報
 */
export function generateImagePath(originalName: string, timestamp = Date.now()): ImagePathResult {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  
  // ファイル名のサニタイズ（安全な文字のみ使用）
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9._-]/g, '_') // 英数字とドット、ハイフン、アンダースコア以外を_に変換
    .replace(/\.[^.]+$/, ''); // 拡張子を除去
  
  const fileName = `${timestamp}_${sanitizedName}.jpg`;
  
  // YYYY/MM/ファイル名 の形式でパスを生成
  return {
    path: `${year}/${month}/${fileName}`,
    fileName
  };
}