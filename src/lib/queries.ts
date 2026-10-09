import { db } from "@/lib/db";
import {
  workspaceMembers,
  workspaces,
  pages,
  entitlementOverrides,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db/types";
import { normalizeSlug } from "@/lib/slugs";

/**
 * Get the workspace for a user (at MVP, each user has exactly one workspace).
 *
 * Ordered by creation so the result stays stable once a user belongs to more
 * than one workspace — an unordered LIMIT 1 would let the editor, dashboard,
 * entitlement checks and uploads each target a different workspace.
 */
export async function getUserWorkspace(userId: string) {
  const result = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      plan: workspaces.plan,
      stripeCustomerId: workspaces.stripeCustomerId,
      planOverride: entitlementOverrides.value,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    // Joined rather than queried separately: this runs on every dashboard
    // request and inside every server action.
    .leftJoin(
      entitlementOverrides,
      and(
        eq(entitlementOverrides.workspaceId, workspaces.id),
        eq(entitlementOverrides.feature, PLAN_OVERRIDE_FEATURE),
      ),
    )
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
    .limit(1);

  const row = result[0];
  if (!row) return null;

  const { planOverride, ...workspace } = row;

  // A comped plan (staff, beta tester, internal testing) grants entitlements
  // without inventing a Stripe subscription. Every gate reads `plan`, so this
  // one substitution covers all of them — and because the override lives in its
  // own table, the Stripe reconciliation cron can still hold `workspaces.plan`
  // honest without stripping access.
  const override = resolvePlanOverride(planOverride);

  return { ...workspace, plan: override ?? workspace.plan };
}

/** Feature key used by entitlement_overrides to comp an entire plan. */
export const PLAN_OVERRIDE_FEATURE = "plan";

/**
 * Resolve a comped plan from an entitlement_overrides row value.
 *
 * Exported because more than one query resolves a plan. When only
 * getUserWorkspace() applied overrides, the public page — which reads
 * `workspaces.plan` through its own join — disagreed with the editor: a comped
 * Pro account could tick "hide the badge", have it saved and accepted, and
 * still see the badge on the live page.
 */
export function resolvePlanOverride(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const plan = (value as { plan?: unknown }).plan;
  return plan === "pro" || plan === "free" ? plan : null;
}

/**
 * Get all pages for a workspace.
 */
export async function getWorkspacePages(workspaceId: string) {
  return db
    .select()
    .from(pages)
    .where(eq(pages.workspaceId, workspaceId))
    .orderBy(pages.createdAt);
}

/**
 * Check if a page slug is already taken.
 *
 * Also checks `workspaces.slug`: that column is unique too, and onboarding
 * claims both at once. Checking only `pages` let a user pass the availability
 * check and then fail forever on the workspace unique constraint.
 */
export async function isSlugTaken(slug: string): Promise<boolean> {
  const normalized = normalizeSlug(slug);

  const [takenPage] = await db
    .select({ id: pages.id })
    .from(pages)
    .where(eq(pages.slug, normalized))
    .limit(1);

  if (takenPage) return true;

  const [takenWorkspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, normalized))
    .limit(1);

  return Boolean(takenWorkspace);
}

/**
 * A workspace's effective plan (comped overrides applied), read through the
 * given handle so it can run inside a transaction under a lock.
 */
export async function effectivePlan(executor: DbOrTx, workspaceId: string): Promise<string> {
  const [row] = await executor
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
