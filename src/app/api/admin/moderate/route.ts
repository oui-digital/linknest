import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-auth";
import { moderationCommandSchema, runModerationCommand } from "@/lib/admin-moderation";
import { moderationDeps } from "@/lib/moderation-runtime";
import { sendPageTakedownEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * Admin moderation API. Bearer ADMIN_API_SECRET; there is no admin UI.
 * See README → Moderation for the commands and curl examples.
 */
export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = moderationCommandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid command", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const command = parsed.data;
  console.info("[admin]", command.action, {
    pageId: "pageId" in command ? command.pageId : undefined,
    slug: "slug" in command ? command.slug : undefined,
    userId: "userId" in command ? command.userId : undefined,
    email: "email" in command ? command.email : undefined,
  });

  const result = await runModerationCommand(db, command, {
    ...moderationDeps,
    notifyOwner: sendPageTakedownEmail,
  });

  return result.status === 200
    ? NextResponse.json(result.body)
    : NextResponse.json({ error: result.error }, { status: result.status });
}
