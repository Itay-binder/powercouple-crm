/** מנתח URL הורדה של Firebase Storage (alt=media&token=...) */
export function parseFirebaseStorageDownloadUrl(
  url: string
): { bucket: string; objectPath: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!m) return null;
    return {
      bucket: decodeURIComponent(m[1]),
      objectPath: decodeURIComponent(m[2]),
    };
  } catch {
    return null;
  }
}
