import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-auth";
import { listReportedPages } from "@/lib/admin-reports";

export const dynamic = "force-dynamic";

/** Reported pages in the last `days` (1–90, default 7). Bearer ADMIN_API_SECRET. */
export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = Number(new URL(request.url).searchParams.get("days") ?? 7);
  const days = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.floor(raw))) : 7;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const pagesReported = await listReportedPages(db, { since });
  return NextResponse.json({ days, pages: pagesReported });
}
