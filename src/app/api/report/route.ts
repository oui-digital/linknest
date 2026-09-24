import { NextRequest, NextResponse, after } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { pageReports } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { getClientIp } from "@/lib/request-ip";
import { abuseKeyForIp } from "@/lib/ip";
import { TURNSTILE_FAILED_ERROR, verifyTurnstileToken } from "@/lib/turnstile";
import { alertDedupeRateLimit, checkRateLimit, reportRateLimit } from "@/lib/rate-limit";
import { recordReport, type RecordReportResult } from "@/lib/reports";
import { moderationDeps } from "@/lib/moderation-runtime";
import { workspaceOwnerEmails } from "@/lib/moderation-actions";
import { escapeHtml, sendAdminAlert, sendPageTakedownEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";
import { getPublicPageUrl } from "@/lib/slugs";

const VALID_REASONS = ["phishing", "malware", "spam", "other"] as const;
const DAILY_REPORTS_PER_REPORTER = 3;

export async function POST(request: NextRequest) {
  // Require a JSON content type. request.json() parses any body, which made
  // this a CORS "simple request": a third-party page could silently file
  // reports from every visitor's own IP, defeating the per-IP limit and
  // manufacturing a takedown signal against a competitor.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Unsupported content type" },
      { status: 415 },
    );
  }

  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("host");
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === host;
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: {
    pageId?: unknown;
    reason?: unknown;
    details?: unknown;
    turnstileToken?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { pageId, reason, details, turnstileToken } = body;

  if (typeof pageId !== "string" || typeof reason !== "string") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(pageId)) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  if (!VALID_REASONS.includes(reason as (typeof VALID_REASONS)[number])) {
    return NextResponse.json({ error: "Invalid reason" }, { status: 400 });
  }

  const ip = await getClientIp();

  // Reports can take a page down, so filing one has to cost a human action.
  const captcha = await verifyTurnstileToken({
    token: turnstileToken,
    remoteIp: ip,
    action: "report",
  });
  if (!captcha.ok) {
    return NextResponse.json({ error: TURNSTILE_FAILED_ERROR }, { status: 403 });
  }

  // One reporter = an IPv4 address or an IPv6 /64 (src/lib/ip.ts).
  const reporterKey = abuseKeyForIp(ip);

  const limited = await checkRateLimit(reportRateLimit, reporterKey);
  // Database floor for when Redis is not configured (the limiter fails open).
  const [today] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(pageReports)
    .where(
      and(
        eq(pageReports.reporterKey, reporterKey),
        gte(pageReports.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      ),
    );
  if (!limited.success || (today?.count ?? 0) >= DAILY_REPORTS_PER_REPORTER) {
    return NextResponse.json(
      { error: "Too many reports. Try again later." },
      { status: 429 },
    );
  }

  const result = await recordReport(
    db,
    {
      pageId,
      reporterIp: ip,
      reporterKey,
      reason,
      details: typeof details === "string" && details ? details.slice(0, 1000) : null,
      autoTakedown: process.env.MODERATION_AUTO_TAKEDOWN === "true",
    },
    moderationDeps,
  );

  if (!result.found) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  if (result.recorded || result.changed) {
    after(() => notifyReport(result, reason, typeof details === "string" ? details : ""));
  }

  // The same answer whether or not this was a duplicate: nothing to learn.
  return NextResponse.json({ success: true });
}

async function notifyReport(
  result: Extract<RecordReportResult, { found: true }>,
  reason: string,
  details: string,
) {
  const { page, changed, distinctReporters, plan } = result;
  try {
    Sentry.captureMessage("page_reported", {
      level: changed ? "error" : "warning",
      tags: { reason, autoTakedown: changed ? "yes" : "no" },
      extra: { pageId: page.id, slug: page.slug, distinctReporters, plan },
    });

    if (changed) {
      for (const to of await workspaceOwnerEmails(db, page.workspaceId)) {
        await sendPageTakedownEmail({ to, slug: page.slug, reasonCode: "user_reports" });
      }
    } else {
      const throttle = await checkRateLimit(alertDedupeRateLimit, page.id);
      if (!throttle.success) return;
    }

    const url = `${SITE_URL}${getPublicPageUrl(page.slug)}`;
    const api = `${SITE_URL}/api/admin/moderate`;
    const curl = (json: string) =>
      `curl -X POST ${api} -H "Authorization: Bearer $ADMIN_API_SECRET" -H 'content-type: application/json' -d '${json}'`;
    await sendAdminAlert({
      subject: changed
        ? `Taken down after reports: ${page.slug}`
        : `Page reported (${reason}): ${page.slug}`,
      html: `
        <p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a> (${escapeHtml(plan)} plan)</p>
        <p>Reason: <strong>${escapeHtml(reason)}</strong>. ${distinctReporters} distinct
        reporter(s) in this review period, last 24 hours.</p>
        ${details ? `<blockquote>${escapeHtml(details.slice(0, 1000))}</blockquote>` : ""}
        <p>${
          changed
            ? "The page was <strong>unpublished automatically</strong> and the owner was emailed."
            : "The page is still live."
        }</p>
        <pre>${escapeHtml(curl(`{"action":"takedown_page","pageId":"${page.id}","reason":"reported: ${reason}"}`))}
${escapeHtml(curl(`{"action":"reinstate_page","pageId":"${page.id}","reasonCode":"${changed ? "user_reports" : "manual_review"}"}`))}</pre>
      `,
    });
  } catch (error) {
    console.error("[report] Notification failed:", { pageId: page.id }, error);
    Sentry.captureException(error, { tags: { action: "reportNotify" } });
  }
}
