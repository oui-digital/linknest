import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { r2Client, R2_BUCKET_NAME, getR2PublicUrl } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { processImage } from "@/lib/image-processing";
import { db } from "@/lib/db";
import { assets } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { checkRateLimit, mutationRateLimit } from "@/lib/rate-limit";
import { getLimit, type PlanId } from "@/lib/entitlements";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await checkRateLimit(mutationRateLimit, session.user.id);
    if (!rl.success) {
      return NextResponse.json(
        { error: "Too many uploads. Please slow down." },
        { status: 429 },
      );
    }

    // Get workspace
    const workspace = await getUserWorkspace(session.user.id);
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    // Enforce the plan's storage quota. This route previously recorded nothing
    // in `assets`, so the quota was computed over an always-empty table and
    // every plan effectively had unlimited R2 storage.
    const [usage] = await db
      .select({ total: sql<number>`COALESCE(SUM(${assets.sizeBytes}), 0)` })
      .from(assets)
      .where(eq(assets.workspaceId, workspace.id));

    const usedBytes = Number(usage?.total ?? 0);
    const quota = getLimit(workspace.plan as PlanId, "max_asset_bytes");
    if (usedBytes >= quota) {
      return NextResponse.json(
        {
          error: `Storage limit reached (${Math.round(quota / 1_000_000)}MB). Upgrade to Pro for more space.`,
        },
        { status: 403 },
      );
    }

    // Parse FormData
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed." },
        { status: 400 },
      );
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB." },
        { status: 400 },
      );
    }

    // Validate type field ("avatar", "thumbnail" or omitted)
    const typeField = formData.get("type") as string | null;
    if (typeField && typeField !== "avatar" && typeField !== "thumbnail") {
      return NextResponse.json(
        { error: "Invalid type" },
        { status: 400 },
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Process image (avatar → 512x512, default → max 1200px)
    const processed = await processImage(buffer, typeField ?? undefined);

    // Generate R2 key
    const key = `${workspace.id}/${crypto.randomUUID()}.webp`;

    // Upload to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: processed,
        ContentType: "image/webp",
      }),
    );

    // Return public URL
    const url = getR2PublicUrl(key);

    // Record the asset so the quota above can actually see it, and so orphaned
    // objects are attributable for cleanup.
    await db.insert(assets).values({
      workspaceId: workspace.id,
      filename: file.name.slice(0, 255),
      r2Key: key,
      url,
      mimeType: "image/webp",
      sizeBytes: processed.length,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Image upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 },
    );
  }
}
