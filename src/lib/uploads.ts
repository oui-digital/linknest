import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { getLimit, type PlanId } from "@/lib/entitlements";
import { processImage } from "@/lib/image-processing";
import { R2_BUCKET_NAME, getR2PublicUrl, r2Client } from "@/lib/r2";

/** Bytes stored and the plan's limit, for the storage quota. */
export async function storageUsage(workspaceId: string, plan: PlanId) {
  const [usage] = await db
    .select({ total: sql<number>`COALESCE(SUM(${assets.sizeBytes}), 0)` })
    .from(assets)
    .where(eq(assets.workspaceId, workspaceId));
  return { usedBytes: Number(usage?.total ?? 0), quota: getLimit(plan, "max_asset_bytes") };
}

/**
 * Re-encode an image, store it in R2 and record it in `assets` (which the
 * storage quota counts). Every image a page shows goes through here, whether
 * the owner uploaded it or LinkNest fetched it for them.
 */
export async function storeImage({
  workspaceId,
  buffer,
  type,
  filename,
}: {
  workspaceId: string;
  buffer: Buffer;
  type?: "avatar" | "thumbnail";
  filename: string;
}): Promise<string> {
  const processed = await processImage(buffer, type);
  const key = `${workspaceId}/${crypto.randomUUID()}.webp`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: processed,
      ContentType: "image/webp",
    }),
  );

  const url = getR2PublicUrl(key);
  await db.insert(assets).values({
    workspaceId,
    filename: filename.slice(0, 255),
    r2Key: key,
    url,
    mimeType: "image/webp",
    sizeBytes: processed.length,
  });
  return url;
}
