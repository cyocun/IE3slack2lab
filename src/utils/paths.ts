/**
 * Path utilities for converting between repo paths and site paths
 */

/**
 * Ensure a string ends with exactly one trailing slash
 */
export function withTrailingSlash(input: string): string {
  return input.endsWith('/') ? input : `${input}/`;
}

/**
 * Convert repo image base (e.g. "public/images/") + relative path (e.g. "YYYY/MM/file.webp")
 * to site path used in JSON (e.g. "/images/YYYY/MM/file.webp")
 */
export function toSiteImagePath(repoImageBase: string, relativePath: string): string {
  const base = withTrailingSlash(repoImageBase).replace(/^public\//, '');
  const rel = relativePath.replace(/^\//, '');
  return `/${base}${rel}`;
}

/**
 * Convert site path (e.g. "/images/YYYY/MM/file.webp") to repo path (e.g. "public/images/YYYY/MM/file.webp")
 */
export function toRepoImagePath(repoImageBase: string, sitePath: string): string {
  const base = withTrailingSlash(repoImageBase);
  const noPublicBase = base.replace(/^public\//, '');
  const p = sitePath.replace(/^\//, '');

  if (p.startsWith('public/')) return p; // already repo path
  if (p.startsWith(noPublicBase)) return `public/${p}`;
  return `${base}${p}`;
}

