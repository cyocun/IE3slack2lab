/**
 * Encoding utilities shared across GitHub operations
 */

/**
 * UTF-8文字列をBase64に変換
 */
export function utf8ToBase64(text: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  const binaryString = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  return btoa(binaryString);
}

/**
 * Base64文字列をUTF-8に変換
 */
export function base64ToUtf8(base64: string): string {
  const cleanBase64 = (base64 || '').replace(/\s/g, '');
  if (!cleanBase64) return '';

  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

