import imageCompression from 'browser-image-compression';
import type { ImagePathResult } from '../types/index.js';

/**
 * browser-image-compressionを使用して画像をリサイズ・圧縮
 * @param imageBuffer 元画像のバイナリデータ
 * @param maxWidth 最大幅（デフォルト: 1200px）
 * @returns リサイズ済み画像のバイナリデータ
 */
export async function resizeImage(imageBuffer: ArrayBuffer, maxWidth = 1200): Promise<ArrayBuffer> {
  console.log(`Processing image: ${Math.round(imageBuffer.byteLength / 1024)}KB`);
  
  // ArrayBufferをFileオブジェクトに変換
  const imageBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
  const imageFile = new File([imageBlob], 'image.jpg', { type: 'image/jpeg' });
  
  // 圧縮オプションを設定
  const options = {
    maxSizeMB: 2, // 最大2MBに圧縮
    maxWidthOrHeight: maxWidth, // 最大幅または高さ
    useWebWorker: false, // Cloudflare WorkersではWeb Workerは使用しない
    quality: 0.85, // JPEG品質 (0-1)
    initialQuality: 0.85
  };
  
  // 画像を圧縮・リサイズ（エラー時は例外をスロー）
  const compressedFile = await imageCompression(imageFile, options);
  
  // FileオブジェクトをArrayBufferに変換
  const compressedArrayBuffer = await compressedFile.arrayBuffer();
  
  const compressionRatio = Math.round((compressedArrayBuffer.byteLength / imageBuffer.byteLength) * 100);
  console.log(`Image compressed: ${Math.round(compressedArrayBuffer.byteLength / 1024)}KB (${compressionRatio}% of original)`);
  
  return compressedArrayBuffer;
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