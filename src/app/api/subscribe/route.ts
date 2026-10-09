import { NextRequest, NextResponse, after } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";
import { getClientIp } from "@/lib/request-ip";
import { abuseKeyForIp } from "@/lib/ip";
import { TURNSTILE_FAILED_ERROR, verifyTurnstileToken } from "@/lib/turnstile";
import { checkRateLimit, emailRateLimit, subscribeRateLimit } from "@/lib/rate-limit";
import { canonicalizeEmail, getEmailDomain } from "@/lib/email-normalize";
import { isDisposableEmailDomain } from "@/lib/disposable-email";
import { deliverConfirmation, requestSubscription } from "@/lib/subscribers";
import { sendConfirmation } from "@/lib/subscribe-mail";
import { readJson, rejectCrossSiteJson } from "@/lib/public-json";

const bodySchema = z.object({
  pageId: z.string(),
  blockId: z.string(),
  email: z.string(),
  turnstileToken: z.unknown().optional(),
  // Honeypot: a field people never see and bots fill in.
  website: z.string().optional(),
});
const idSchema = z.uuid();
const emailSchema = z.email().max(255);

/** Database floor for when Redis is not configured (the limiters fail open). */
const MAX_REQUESTS_PER_PAGE_PER_HOUR = 50;

// The same answer whether the address was new, already pending or already on
// the list: the form must not reveal who has subscribed.
const ACCEPTED = () => NextResponse.json({ ok: true });

/**
 * POST /api/subscribe — a visitor asks to join a page's email list.
 * Mirrors the hardening of /api/report.
 */
export async function POST(request: NextRequest) {
  const rejected = rejectCrossSiteJson(request);
  if (rejected) return rejected;

  const body = bodySchema.safeParse(await readJson(request));
  if (!body.success) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const { pageId, blockId, email, turnstileToken, website } = body.data;

  if (!idSchema.safeParse(pageId).success || !idSchema.safeParse(blockId).success) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  const address = email.trim();
  if (!emailSchema.safeParse(address).success) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (website) return ACCEPTED();

  const ip = await getClientIp();
  const captcha = await verifyTurnstileToken({ token: turnstileToken, remoteIp: ip, action: "subscribe" });
  if (!captcha.ok) return NextResponse.json({ error: TURNSTILE_FAILED_ERROR }, { status: 403 });

  if (await isDisposableEmailDomain(getEmailDomain(address))) {
    return NextResponse.json({ error: "Please use a permanent email address." }, { status: 400 });
  }

  const network = await checkRateLimit(subscribeRateLimit, abuseKeyForIp(ip));
  const [recent] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(subscribers)
    .where(
      and(
        eq(subscribers.pageId, pageId),
        eq(subscribers.status, "pending"),
        gte(subscribers.requestedAt, new Date(Date.now() - 60 * 60 * 1000)),
      ),
    );
  if (!network.success || (recent?.n ?? 0) >= MAX_REQUESTS_PER_PAGE_PER_HOUR) {
    return NextResponse.json({ error: "Too many sign-ups. Try again later." }, { status: 429 });
  }

  // Per address: a throttled address gets the normal answer and no email.
  const mailbox = await checkRateLimit(emailRateLimit, `subscribe:${canonicalizeEmail(address)}`);
  if (!mailbox.success) return ACCEPTED();

  const result = await requestSubscription(db, { pageId, blockId, email: address });
  switch (result.outcome) {
    case "not_found":
      return NextResponse.json({ error: "This sign-up form is no longer available." }, { status: 404 });
    case "list_full":
      return NextResponse.json({ error: "Sign-ups are closed for now." }, { status: 409 });
    case "sent":
      // after() runs once the response is sent, within this function's
      // lifetime; a failure is recorded and retried by the cron.
      after(() =>
        deliverConfirmation(db, result.claim, sendConfirmation, (error) => {
          console.error("[subscribe] confirmation email failed:", error);
          Sentry.captureException(error, { tags: { action: "subscribeConfirmation" } });
        }),
      );
      return ACCEPTED();
    default:
      return ACCEPTED();
  }
}
