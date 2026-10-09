import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserWorkspace } from "@/lib/queries";
import { checkRateLimit, mutationRateLimit } from "@/lib/rate-limit";
import { type PlanId } from "@/lib/entitlements";
import { storageUsage, storeImage } from "@/lib/uploads";

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
    const { usedBytes, quota } = await storageUsage(
      workspace.id,
      workspace.plan as PlanId,
    );
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

    // Re-encode (avatar → 512x512, thumbnail → 160x160, default → max 1200px),
    // store in R2 and record the asset so the quota above can see it.
    const url = await storeImage({
      workspaceId: workspace.id,
      buffer,
      type: (typeField ?? undefined) as "avatar" | "thumbnail" | undefined,
      filename: file.name,
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
