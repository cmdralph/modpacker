/** Characters Windows forbids in file names (plus ASCII control characters). */
// oxlint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const FORBIDDEN = /[\u0000-\u001f<>:"|?*]/;

/**
 * Normalises a path inside an archive and rejects anything that could escape its folder
 * ("zip slip": `..`, absolute paths, drive letters) or break on Windows. Returns null when unsafe.
 */
export function sanitizeRelativePath(raw: string): string | null {
  const parts = raw
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.');
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part === '..' || part.length > 255 || FORBIDDEN.test(part) || /[. ]$/.test(part)) return null;
  }
  const path = parts.join('/');
  return path.length > 1024 ? null : path;
}
