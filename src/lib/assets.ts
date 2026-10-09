/**
 * Whether `url` points at an object in this deployment's own R2 bucket.
 *
 * Owner-uploaded images (block images, thumbnails, covers) must be first-party:
 * they are never Safe-Browsing scanned, so a third-party URL in their place
 * would be an unscanned destination and a free tracking pixel on every visit.
 * Uploads go through /api/upload/image, which re-encodes and stores to R2.
 */
export function isOwnAssetUrl(
  url: string,
  publicBase: string | undefined = process.env.R2_PUBLIC_URL,
): boolean {
  if (!publicBase) return false;
  const base = `${publicBase.replace(/\/+$/, "")}/`;
  return url.startsWith(base) && url.length > base.length;
}
