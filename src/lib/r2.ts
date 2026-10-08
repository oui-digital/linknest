import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!; // e.g. https://pub-xxx.r2.dev

// Missing R2 config used to surface only as a generic "Failed to upload image"
// 500 per attempt, with the client pointed at https://undefined.r2.cloudflarestorage.com.
if (
  process.env.NODE_ENV === "production" &&
  (!R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET_NAME ||
    !R2_PUBLIC_URL)
) {
  console.error(
    "[r2] R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME " +
      "and R2_PUBLIC_URL must all be set. Image uploads will fail with 500.",
  );
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export { r2 as r2Client };

// NOTE: the presigned direct-upload flow was removed. It was unreachable from
// the UI but still live, it accepted image/svg+xml (SVG can carry <script>, so
// uploads became stored XSS on the R2 public origin), and it bypassed the
// storage quota. All uploads now go through /api/upload/image, which validates
// the MIME type, re-encodes via sharp, enforces the quota and records the asset.

/**
 * Get the public URL for an R2 object.
 */
export function getR2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}

/**
 * Delete an object from R2.
 */
export async function deleteR2Object(key: string): Promise<void> {
  await r2.send(
    new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }),
  );
}
