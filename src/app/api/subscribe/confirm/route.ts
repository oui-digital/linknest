import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { publicPageTag } from "@/lib/cache-tags";
import { getClientIp } from "@/lib/request-ip";
import { checkRateLimit, mutationRateLimit } from "@/lib/rate-limit";
import { confirmSubscription } from "@/lib/subscribers";
import { readJson, rejectCrossSiteJson } from "@/lib/public-json";

/** POST /api/subscribe/confirm { token } — the button on the confirm page. */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSiteJson(request);
  if (rejected) return rejected;

  const rl = await checkRateLimit(mutationRateLimit, `subscribe-confirm:${await getClientIp()}`);
  if (!rl.success) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });

  const body = z.object({ token: z.unknown() }).safeParse(await readJson(request));
  const result = await confirmSubscription(db, body.success ? body.data.token : undefined);

  switch (result.outcome) {
    case "confirmed":
      // The page's form shows "closed" once the plan's cap is reached.
      revalidateTag(publicPageTag(result.slug), "max");
      return NextResponse.json({ ok: true });
    case "list_full":
      return NextResponse.json({ error: "This list isn't accepting new subscribers right now." }, { status: 409 });
    case "expired":
      return NextResponse.json({ error: "This link has expired. Sign up again to get a new one." }, { status: 400 });
    default:
      return NextResponse.json({ error: "This link isn't valid any more." }, { status: 400 });
  }
}
