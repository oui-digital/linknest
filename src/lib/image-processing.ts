import sharp from "sharp";

/** Processing presets; the upload route accepts exactly these names. */
export const UPLOAD_TYPES = ["avatar", "thumbnail", "og", "favicon"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export type ProcessedImage = {
  buffer: Buffer;
  contentType: "image/webp" | "image/jpeg" | "image/png";
  extension: "webp" | "jpg" | "png";
};

/**
 * Process an uploaded image buffer.
 * - "avatar" → center-crop to 512x512 square WebP
 * - "thumbnail" → center-crop to 160x160 square WebP (link card images,
 *   displayed at 48px; 160px covers 3x screens)
 * - "og" → 1200x630 cover JPEG: the social preview card. JPEG, not WebP,
 *   because not every crawler that renders link previews decodes WebP
 * - "favicon" → 256x256 PNG, the format every browser accepts for icons
 * - default → resize to max 1200px width, WebP
 */
export async function processImage(buffer: Buffer, type?: string): Promise<ProcessedImage> {
  if (type === "avatar") {
    return webp(sharp(buffer).resize(512, 512, { fit: "cover", position: "centre" }), 85);
  }

  if (type === "thumbnail") {
    return webp(sharp(buffer).resize(160, 160, { fit: "cover", position: "centre" }), 85);
  }

  if (type === "og") {
    const out = await sharp(buffer)
      .resize(1200, 630, { fit: "cover", position: "centre" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return { buffer: out, contentType: "image/jpeg", extension: "jpg" };
  }

  if (type === "favicon") {
    const out = await sharp(buffer)
      .resize(256, 256, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
    return { buffer: out, contentType: "image/png", extension: "png" };
  }

  return webp(sharp(buffer).resize(1200, undefined, { withoutEnlargement: true }), 80);
}

async function webp(pipeline: sharp.Sharp, quality: number): Promise<ProcessedImage> {
  return {
    buffer: await pipeline.webp({ quality }).toBuffer(),
    contentType: "image/webp",
    extension: "webp",
  };
}
