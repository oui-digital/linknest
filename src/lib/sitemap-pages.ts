import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { entitlementOverrides, pages, workspaces } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { PLAN_OVERRIDE_FEATURE } from "@/lib/queries";
import { indexProbationCutoff } from "@/lib/indexing";

/**
 * Published pages that are out of search probation (src/lib/indexing.ts).
 *
 * The probation filter has to be in SQL: LIMIT runs first, so filtering the
 * rows afterwards would silently drop eligible pages once there are more
 * published pages than the limit.
 */
export async function listIndexablePages(
  db: Db,
  { limit, now = new Date() }: { limit: number; now?: Date },
): Promise<{ slug: string; updatedAt: Date | null }[]> {
  // Effective plan, resolved in SQL. This CASE must stay in step with
  // resolvePlanOverride() in src/lib/queries.ts: a comped plan in
  // entitlement_overrides wins, and any other override value is ignored.
  const effectivePlan = sql`CASE WHEN ${entitlementOverrides.value}->>'plan' IN ('pro', 'free')
    THEN ${entitlementOverrides.value}->>'plan' ELSE ${workspaces.plan} END`;

  return db
    .select({ slug: pages.slug, updatedAt: pages.updatedAt })
    .from(pages)
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .leftJoin(
      entitlementOverrides,
      and(
        eq(entitlementOverrides.workspaceId, workspaces.id),
        eq(entitlementOverrides.feature, PLAN_OVERRIDE_FEATURE),
      ),
    )
    .where(
      and(
        // Only published pages are publicly reachable — listing drafts would
        // advertise URLs that 404.
        eq(pages.isPublished, true),
        or(
          sql`${effectivePlan} = 'pro'`,
          lt(pages.firstPublishedAt, indexProbationCutoff(now)),
        ),
      ),
    )
    .orderBy(desc(pages.updatedAt))
    .limit(limit);
}
