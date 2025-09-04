import * as photon from "@cf-wasm/photon";
import { IMAGE_CONFIG } from "../constants";

/**
 * 画像最適化ユーティリティ
 * Photon WebAssemblyライブラリを使用して画像をリサイズしてWebP形式に変換
 * Cloudflare Workers環境で動作
 */

/**
 * 画像を最適化（リサイズとWebP変換）
 * @param imageBuffer - 元の画像データ
 * @param maxWidth - 最大幅（デフォルト: 800px）
 * @param maxHeight - 最大高さ（デフォルト: 800px）
 * @returns 最適化された画像データ
 */
export async function optimizeImage(
  imageBuffer: ArrayBuffer,
  maxWidth: number = IMAGE_CONFIG.MAX_WIDTH,
  maxHeight: number = IMAGE_CONFIG.MAX_WIDTH,
): Promise<ArrayBuffer> {
  try {
    // ArrayBufferをUint8Arrayに変換
    const inputBytes = new Uint8Array(imageBuffer);

    // Photonで画像を読み込み
    const image = photon.PhotonImage.new_from_byteslice(inputBytes);

    // 現在のサイズを取得
    const currentWidth = image.get_width();
    const currentHeight = image.get_height();

    // リサイズが必要か判定
    if (currentWidth > maxWidth || currentHeight > maxHeight) {
      // アスペクト比を保持しながらリサイズ
      const widthRatio = maxWidth / currentWidth;
      const heightRatio = maxHeight / currentHeight;
      const scaleFactor = Math.min(widthRatio, heightRatio);

      const newWidth = Math.floor(currentWidth * scaleFactor);
      const newHeight = Math.floor(currentHeight * scaleFactor);

      // リサイズ実行
      const resizedImage = photon.resize(
        image,
        newWidth,
        newHeight,
        photon.SamplingFilter.Lanczos3
      );

      // WebP形式でエンコード
      const webpBytes = resizedImage.get_bytes_webp();

      // メモリクリーンアップ
      image.free();
      resizedImage.free();

      return webpBytes.buffer as ArrayBuffer;
    } else {
      // リサイズ不要の場合はWebP変換のみ
      const webpBytes = image.get_bytes_webp();

      // メモリクリーンアップ
      image.free();

      return webpBytes.buffer as ArrayBuffer;
    }
  } catch (error) {
    console.error('Image optimization failed:', error);
    // エラー時は元の画像を返す
    return imageBuffer;
  }
}

/**
 * 画像のMIMEタイプを検出
 * @param buffer - 画像データ
 * @returns MIMEタイプ
 */
export function detectImageType(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }

  // JPEG
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'image/gif';
  }

  // WebP
  if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp';
  }

  return 'image/unknown';
}

/**
 * ファイル名をWebP拡張子に変更
 * @param fileName - 元のファイル名
 * @returns WebP拡張子のファイル名
 */
export function changeExtensionToWebP(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return `${fileName}.webp`;
  }
  return `${fileName.substring(0, lastDotIndex)}.webp`;
}