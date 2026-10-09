import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { unsubscribe } from "@/lib/subscribers";
import { readJson, rejectCrossSiteJson } from "@/lib/public-json";

/** POST /api/subscribe/unsubscribe { id, token } — idempotent. */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSiteJson(request);
  if (rejected) return rejected;

  const body = z.object({ id: z.unknown(), token: z.unknown() }).safeParse(await readJson(request));
  const result = body.success
    ? await unsubscribe(db, { subscriberId: body.data.id, token: body.data.token })
    : "invalid";
  return result === "ok"
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "This link isn't valid." }, { status: 400 });
}
