import sharp from "sharp";

/**
 * Process an uploaded image buffer.
 * - "avatar" → center-crop to 512x512 square WebP
 * - "thumbnail" → center-crop to 160x160 square WebP (link card images,
 *   displayed at 48px; 160px covers 3x screens)
 * - default → resize to max 1200px width, WebP
 */
export async function processImage(
  buffer: Buffer,
  type?: string,
): Promise<Buffer> {
  if (type === "avatar") {
    return sharp(buffer)
      .resize(512, 512, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
  }

  if (type === "thumbnail") {
    return sharp(buffer)
      .resize(160, 160, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
  }

  return sharp(buffer)
    .resize(1200, undefined, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
