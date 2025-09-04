/**
 * パス変換ユーティリティ
 * レポジトリ内パスとサイト公開パス（JSONに保存されるパス）の相互変換を扱う
 */

/**
 * 末尾に必ずスラッシュを1つだけ付与
 */
export function withTrailingSlash(input: string): string {
  return input.endsWith('/') ? input : `${input}/`;
}

/**
 * レポジトリの画像ベースパス（例: "public/images/"）と相対パス（例: "YYYY/MM/file.webp"）から
 * サイト公開パス（例: "/images/YYYY/MM/file.webp"）を生成
 */
export function toSiteImagePath(repoImageBase: string, relativePath: string): string {
  const base = withTrailingSlash(repoImageBase).replace(/^public\//, '');
  const rel = relativePath.replace(/^\//, '');
  return `/${base}${rel}`;
}

/**
 * サイト公開パス（例: "/images/YYYY/MM/file.webp"）をレポジトリ内パス（例: "public/images/YYYY/MM/file.webp"）へ変換
 */
export function toRepoImagePath(repoImageBase: string, sitePath: string): string {
  const base = withTrailingSlash(repoImageBase);
  const noPublicBase = base.replace(/^public\//, '');
  const p = sitePath.replace(/^\//, '');

  if (p.startsWith('public/')) return p; // already repo path
  if (p.startsWith(noPublicBase)) return `public/${p}`;
  return `${base}${p}`;
}
