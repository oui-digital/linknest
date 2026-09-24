import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  pages,
  workspaces,
  subscriptions,
  pendingUrlScans,
  pageModerationLog,
  stripeProcessedEvents,
} from "@/lib/db/schema";
import { eq, and, isNull, lt, asc, inArray } from "drizzle-orm";
import { checkUrls } from "@/lib/safe-browsing";
import { stripe } from "@/lib/stripe";
import { getLimit, type PlanId } from "@/lib/entitlements";
import { revalidateTag } from "next/cache";
import { publicPageTag } from "@/lib/cache-tags";

/**
 * Daily reconciliation.
 *
 * Three tables were being written and never read, so each of these safety nets
 * existed only on paper:
 *   - `subscriptions.downgraded_at` — nothing enforced the page limit after a
 *     downgrade, so a cancelled account kept every extra page published.
 *   - `pending_url_scans` — URLs published while Safe Browsing was timing out
 *     (the deliberate fail-open) were queued for a rescan that never ran, so a
 *     malicious link could stay live indefinitely.
 *   - `workspaces.plan` — a derived cache that could drift from the canonical
 *     `subscriptions` row with nothing to re-derive it.
 *
 * Schedule via vercel.json. Protected by CRON_SECRET.
 */

const GRACE_PERIOD_DAYS = 7;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary = {
    plansCorrected: 0,
    pagesUnpublished: 0,
    urlsScanned: 0,
    pagesFlagged: 0,
    eventsPruned: 0,
  };

  try {
    summary.plansCorrected = await reconcilePlans();
    summary.pagesUnpublished = await enforcePageLimits();
    const scan = await rescanPendingUrls();
    summary.urlsScanned = scan.scanned;
    summary.pagesFlagged = scan.flagged;
    summary.eventsPruned = await pruneProcessedEvents();
  } catch (error) {
    console.error("[cron/reconcile] Failed:", error);
    return NextResponse.json(
      { error: "Reconciliation failed", summary },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, ...summary });
}

/**
 * Re-derive `workspaces.plan`.
 *
 * `subscriptions` is the canonical local record, but a row there can itself go
 * stale — a subscription deleted in Stripe (or wiped with test data) leaves
 * status='active' locally and keeps granting Pro forever. So each pro workspace
 * is confirmed against Stripe, not just against the local row.
 *
 * Comped workspaces are unaffected: plan overrides live in entitlement_overrides
 * and are applied at read time, so setting workspaces.plan='free' here does not
 * revoke a comp.
 */
async function reconcilePlans(): Promise<number> {
  const proWorkspaces = await db
    .select({
      id: workspaces.id,
      status: subscriptions.status,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(workspaces)
    .leftJoin(subscriptions, eq(subscriptions.workspaceId, workspaces.id))
    .where(eq(workspaces.plan, "pro"));

  const stale: string[] = [];

  for (const workspace of proWorkspaces) {
    const locallyEntitled =
      workspace.status &&
      ["active", "trialing", "past_due"].includes(workspace.status);

    if (!locallyEntitled) {
      stale.push(workspace.id);
      continue;
    }

    // Local record says entitled — confirm Stripe agrees.
    try {
      const sub = await stripe.subscriptions.retrieve(
        workspace.stripeSubscriptionId!,
      );
      if (!["active", "trialing", "past_due"].includes(sub.status)) {
        stale.push(workspace.id);
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      // resource_missing == deleted in Stripe. Any other error (network, rate
      // limit) must NOT downgrade a paying customer, so leave them alone.
      if (code === "resource_missing") {
        console.warn(
          `[cron/reconcile] subscription ${workspace.stripeSubscriptionId} missing in Stripe`,
        );
        stale.push(workspace.id);
      } else {
        console.error("[cron/reconcile] Stripe lookup failed:", error);
      }
    }
  }

  if (stale.length === 0) return 0;

  await db
    .update(workspaces)
    .set({ plan: "free", updatedAt: new Date() })
    .where(inArray(workspaces.id, stale));

  return stale.length;
}

/**
 * After the grace period, a downgraded workspace keeps only its oldest
 * published page. Ordering is fully deterministic (published_at, created_at,
 * id) so reruns are idempotent — the same page always survives.
 */
async function enforcePageLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 86_400_000);

  const downgraded = await db
    .select({ workspaceId: subscriptions.workspaceId })
    .from(subscriptions)
    .innerJoin(workspaces, eq(workspaces.id, subscriptions.workspaceId))
    .where(
      and(eq(workspaces.plan, "free"), lt(subscriptions.downgradedAt, cutoff)),
    );

  let unpublished = 0;

  for (const { workspaceId } of downgraded) {
    const published = await db
      .select({ id: pages.id, slug: pages.slug })
      .from(pages)
      .where(
        and(eq(pages.workspaceId, workspaceId), eq(pages.isPublished, true)),
      )
      .orderBy(asc(pages.publishedAt), asc(pages.createdAt), asc(pages.id));

    const allowed = getLimit("free" as PlanId, "max_pages");
    const excess = published.slice(allowed);
    if (excess.length === 0) continue;

    await db
      .update(pages)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(
        inArray(
          pages.id,
          excess.map((p) => p.id),
        ),
      );

    await db.insert(pageModerationLog).values(
      excess.map((p) => ({
        pageId: p.id,
        action: "unpublished",
        reasonCode: "plan_downgraded",
        source: "cron_reconcile",
        details:
          "Your plan was downgraded to Free, which includes one published page. Re-publish this page by upgrading to Pro.",
      })),
    );

    for (const page of excess) {
      // Expire immediately: "max" would keep serving the cached live page.
      revalidateTag(publicPageTag(page.slug), { expire: 0 });
    }
    unpublished += excess.length;
  }

  return unpublished;
}

/** Drain the fail-open queue: rescan URLs published while Safe Browsing was down. */
async function rescanPendingUrls(): Promise<{
  scanned: number;
  flagged: number;
}> {
  const pending = await db
    .select({
      id: pendingUrlScans.id,
      pageId: pendingUrlScans.pageId,
      url: pendingUrlScans.url,
    })
    .from(pendingUrlScans)
    .where(isNull(pendingUrlScans.scannedAt))
    .limit(500);

  if (pending.length === 0) return { scanned: 0, flagged: 0 };

  const result = await checkUrls(pending.map((p) => p.url));
  // Still unreachable — leave the rows pending for the next run.
  if (result.timedOut) return { scanned: 0, flagged: 0 };

  const flaggedUrls = new Set(result.flaggedUrls);
  const now = new Date();
  const flaggedPageIds = new Set<string>();

  for (const row of pending) {
    const isSafe = !flaggedUrls.has(row.url);
    if (!isSafe) flaggedPageIds.add(row.pageId);
    await db
      .update(pendingUrlScans)
      .set({ scannedAt: now, isSafe })
      .where(eq(pendingUrlScans.id, row.id));
  }

  for (const pageId of flaggedPageIds) {
    const [page] = await db
      .select({ slug: pages.slug })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);

    await db
      .update(pages)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(eq(pages.id, pageId));

    await db.insert(pageModerationLog).values({
      pageId,
      action: "unpublished",
      reasonCode: "safe_browsing_flagged",
      source: "cron_rescan",
      details:
        "Your page was unpublished because a link on it was flagged as unsafe. Remove the flagged link and re-publish.",
    });

    // Expire immediately: a page with a flagged link must stop serving now.
    if (page) revalidateTag(publicPageTag(page.slug), { expire: 0 });
  }

  return { scanned: pending.length, flagged: flaggedPageIds.size };
}

/** Dedup markers only need to outlive Stripe's retry window. */
async function pruneProcessedEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 86_400_000);
  const deleted = await db
    .delete(stripeProcessedEvents)
    .where(lt(stripeProcessedEvents.processedAt, cutoff))
    .returning({ eventId: stripeProcessedEvents.eventId });
  return deleted.length;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;
