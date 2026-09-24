import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  entitlementOverrides,
  pageModerationLog,
  pageReports,
  pages,
  users,
  workspaceMembers,
  workspaces,
} from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { PLAN_OVERRIDE_FEATURE, resolvePlanOverride } from "@/lib/queries";
import { activeHolds, type ModerationEntry } from "@/lib/moderation";

export type ReportedPage = {
  pageId: string;
  slug: string;
  title: string;
  isPublished: boolean;
  pageCreatedAt: Date;
  plan: string;
  reportCount: number;
  distinctReporters: number;
  reasons: string[];
  lastReportedAt: Date;
  activeHolds: string[];
  owners: {
    email: string;
    signupMethod: string | null;
    signupIp: string | null;
    createdAt: Date;
    suspended: boolean;
  }[];
};

/**
 * Reported pages in a window, most-reported first, with owner signup
 * attribution so a ring of throwaway accounts is visible in one call.
 */
export async function listReportedPages(
  db: Db,
  { since, limit = 200 }: { since: Date; limit?: number },
): Promise<ReportedPage[]> {
  const distinctReporters = sql<number>`count(distinct ${pageReports.reporterIp})`;
  const grouped = await db
    .select({
      pageId: pageReports.pageId,
      reportCount: sql<number>`count(*)`.mapWith(Number),
      distinctReporters: distinctReporters.mapWith(Number),
      reasons: sql<string[]>`array_agg(distinct ${pageReports.reason})`,
      lastReportedAt: sql<string>`max(${pageReports.createdAt})`,
    })
    .from(pageReports)
    .where(gte(pageReports.createdAt, since))
    .groupBy(pageReports.pageId)
    .orderBy(desc(distinctReporters), desc(sql`count(*)`))
    .limit(limit);

  if (grouped.length === 0) return [];
  const pageIds = grouped.map((g) => g.pageId);

  const pageRows = await db
    .select({
      id: pages.id,
      slug: pages.slug,
      title: pages.title,
      isPublished: pages.isPublished,
      createdAt: pages.createdAt,
      workspaceId: pages.workspaceId,
      plan: workspaces.plan,
      planOverride: entitlementOverrides.value,
    })
    .from(pages)
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .leftJoin(
      entitlementOverrides,
      and(
        eq(entitlementOverrides.workspaceId, workspaces.id),
        eq(entitlementOverrides.feature, PLAN_OVERRIDE_FEATURE),
      ),
    )
    .where(inArray(pages.id, pageIds));

  const workspaceIds = [...new Set(pageRows.map((p) => p.workspaceId))];
  const ownerRows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      email: users.email,
      signupMethod: users.signupMethod,
      signupIp: users.signupIp,
      createdAt: users.createdAt,
      suspendedAt: users.suspendedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        inArray(workspaceMembers.workspaceId, workspaceIds),
        eq(workspaceMembers.role, "owner"),
      ),
    );

  const logRows = await db
    .select({
      pageId: pageModerationLog.pageId,
      seq: pageModerationLog.seq,
      action: pageModerationLog.action,
      source: pageModerationLog.source,
      reasonCode: pageModerationLog.reasonCode,
    })
    .from(pageModerationLog)
    .where(inArray(pageModerationLog.pageId, pageIds))
    .orderBy(asc(pageModerationLog.seq));

  const entriesByPage = new Map<string, ModerationEntry[]>();
  for (const row of logRows) {
    const list = entriesByPage.get(row.pageId) ?? [];
    list.push(row);
    entriesByPage.set(row.pageId, list);
  }
  const pageById = new Map(pageRows.map((p) => [p.id, p]));

  return grouped.flatMap((g) => {
    const page = pageById.get(g.pageId);
    if (!page) return [];
    return [
      {
        pageId: page.id,
        slug: page.slug,
        title: page.title,
        isPublished: page.isPublished,
        pageCreatedAt: page.createdAt,
        plan: resolvePlanOverride(page.planOverride) ?? page.plan,
        reportCount: g.reportCount,
        distinctReporters: g.distinctReporters,
        reasons: g.reasons,
        lastReportedAt: new Date(g.lastReportedAt),
        activeHolds: [...activeHolds(entriesByPage.get(page.id) ?? [])],
        owners: ownerRows
          .filter((o) => o.workspaceId === page.workspaceId)
          .map((o) => ({
            email: o.email,
            signupMethod: o.signupMethod,
            signupIp: o.signupIp,
            createdAt: o.createdAt,
            suspended: Boolean(o.suspendedAt),
          })),
      },
    ];
  });
}
