import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUserWorkspace, getWorkspacePages } from "@/lib/queries";
import { hasFeature, type PlanId } from "@/lib/entitlements";
import { CSV_HEADER, csvRows, iterateSubscribers } from "@/lib/subscribers";

/** GET /api/subscribers/export?pageId=&status=all — complete CSV download (Pro). */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspace = await getUserWorkspace(session.user.id);
  if (!workspace) return NextResponse.json({ error: "No workspace" }, { status: 400 });
  if (!hasFeature(workspace.plan as PlanId, "subscriber_export")) {
    return NextResponse.json({ error: "Exporting subscribers requires a Pro plan" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const rawPageId = params.get("pageId");
  let pageId: string | undefined;
  let slug = "all-pages";
  if (rawPageId) {
    const page = z.uuid().safeParse(rawPageId).success
      ? (await getWorkspacePages(workspace.id)).find((p) => p.id === rawPageId)
      : undefined;
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    pageId = page.id;
    slug = page.slug;
  }

  const filter = {
    workspaceId: workspace.id,
    pageId,
    status: params.get("status") === "all" ? undefined : "confirmed",
  };
  // Streamed in batches: complete for any list size ("unlimited" on Pro),
  // without holding the whole list in memory.
  const encoder = new TextEncoder();
  const batches = iterateSubscribers(db, filter);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_HEADER));
    },
    async pull(controller) {
      try {
        const next = await batches.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(csvRows(next.value)));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await batches.return(undefined);
    },
  });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="linknest-subscribers-${slug}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
