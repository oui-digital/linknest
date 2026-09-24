import { and, eq, sql } from "drizzle-orm";
import { entitlementOverrides, pageReports, workspaces } from "@/lib/db/schema";
import type { Db, Tx } from "@/lib/db/types";
import { PLAN_OVERRIDE_FEATURE, resolvePlanOverride } from "@/lib/queries";
import {
  REPORT_TAKEDOWN_SOURCE,
  currentReviewEpoch,
  shouldAutoTakedown,
} from "@/lib/moderation";
import {
  applyTakedown,
  loadModerationEntries,
  lockPage,
  type ModerationDeps,
  type PageRef,
} from "@/lib/moderation-actions";

export type RecordReportResult =
  | { found: false }
  | {
      found: true;
      /** False when this reporter already reported the page in this epoch. */
      recorded: boolean;
      /** True only when this report took the page down. */
      changed: boolean;
      distinctReporters: number;
      reviewEpoch: number;
      plan: string;
      page: PageRef;
    };

async function effectivePlan(tx: Tx, workspaceId: string): Promise<string> {
  const [row] = await tx
    .select({ plan: workspaces.plan, override: entitlementOverrides.value })
    .from(workspaces)
    .leftJoin(
      entitlementOverrides,
      and(
        eq(entitlementOverrides.workspaceId, workspaces.id),
        eq(entitlementOverrides.feature, PLAN_OVERRIDE_FEATURE),
      ),
    )
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return resolvePlanOverride(row?.override) ?? row?.plan ?? "free";
}

/**
 * File a report and, when enabled, apply the report-threshold takedown — all
 * in one transaction under the page row lock.
 *
 * Everything that decides a takedown is read under that lock: the review
 * epoch, the duplicate check, the reporter count and the page's state. A
 * report handler that computed its count and then waited while an admin
 * reinstated the page would otherwise take it down again with a stale count.
 */
export async function recordReport(
  db: Db,
  {
    pageId,
    reporterIp,
    reporterKey,
    reason,
    details,
    autoTakedown,
  }: {
    pageId: string;
    reporterIp: string;
    reporterKey: string;
    reason: string;
    details: string | null;
    autoTakedown: boolean;
  },
  deps: ModerationDeps,
): Promise<RecordReportResult> {
  const result = await db.transaction(async (tx): Promise<RecordReportResult> => {
    const page = await lockPage(tx, pageId);
    if (!page) return { found: false };

    const reviewEpoch = currentReviewEpoch(await loadModerationEntries(tx, pageId));

    const [duplicate] = await tx
      .select({ id: pageReports.id })
      .from(pageReports)
      .where(
        and(
          eq(pageReports.pageId, pageId),
          eq(pageReports.reviewEpoch, reviewEpoch),
          eq(pageReports.reporterKey, reporterKey),
        ),
      )
      .limit(1);

    if (!duplicate) {
      await tx
        .insert(pageReports)
        .values({ pageId, reporterIp, reporterKey, reviewEpoch, reason, details });
    }

    const [counted] = await tx
      .select({
        n: sql<number>`count(distinct ${pageReports.reporterKey})`.mapWith(Number),
      })
      .from(pageReports)
      .where(
        and(
          eq(pageReports.pageId, pageId),
          eq(pageReports.reviewEpoch, reviewEpoch),
          sql`${pageReports.createdAt} > now() - interval '24 hours'`,
        ),
      );
    const distinctReporters = counted?.n ?? 0;
    const plan = await effectivePlan(tx, page.workspaceId);

    let changed = false;
    if (
      shouldAutoTakedown({
        enabled: autoTakedown,
        isPublished: page.isPublished,
        plan,
        distinctReporters,
      })
    ) {
      const takedown = await applyTakedown(tx, pageId, {
        reasonCode: "user_reports",
        source: REPORT_TAKEDOWN_SOURCE,
        details: `${distinctReporters} distinct reporters within 24 hours`,
      });
      changed = takedown.found && takedown.changed;
    }

    return {
      found: true,
      recorded: !duplicate,
      changed,
      distinctReporters,
      reviewEpoch,
      plan,
      page: changed ? { ...page, isPublished: false } : page,
    };
  });

  if (result.found && result.changed) deps.revalidate(result.page.slug);
  return result;
}
