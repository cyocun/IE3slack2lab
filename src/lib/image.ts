import type { ImagePathResult } from '../types/index.js';

/**
 * Cloudflare Image Resizingを使用して画像をリサイズ
 * @param imageBuffer 元画像のバイナリデータ
 * @param maxWidth 最大幅（デフォルト: 1200px）
 * @returns リサイズ済み画像のバイナリデータ
 */
export async function resizeImage(imageBuffer: ArrayBuffer, maxWidth = 1200): Promise<ArrayBuffer> {
  // ArrayBufferからBlobを作成
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  
  try {
    // Cloudflare Image Resizingを使用してリサイズ
    const response = await fetch(url, {
      cf: {
        image: {
          width: maxWidth,
          quality: 85,
          format: 'jpeg',
          fit: 'scale-down' // アスペクト比を維持してリサイズ
        }
      }
    });
    
    if (!response.ok) {
      throw new Error(`Image resize failed: ${response.status}`);
    }
    
    return await response.arrayBuffer();
  } finally {
    // メモリリークを防ぐため、作成したURLを解放
    URL.revokeObjectURL(url);
  }
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