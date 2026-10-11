import { cache } from "react";
import { unstable_cache } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/lib/db";
import { blocks, entitlementOverrides, pages, workspaces } from "@/lib/db/schema";
import { normalizeSlug } from "@/lib/slugs";
import { PLAN_OVERRIDE_FEATURE, resolvePlanOverride } from "@/lib/queries";
import { publicPageTag } from "@/lib/cache-tags";

type Page = InferSelectModel<typeof pages>;
type Block = InferSelectModel<typeof blocks>;

export type PublicPageData = { page: Page; plan: string };

/**
 * The public page's data, cached at the data layer.
 *
 * The route renders dynamically (a dynamic segment with no
 * generateStaticParams), so `revalidatePath` never applied to it and every
 * view used to cost two queries. `unstable_cache` keyed by slug, invalidated by
 * tag on publish and edit, works regardless of how the route itself renders.
 *
 * Two things every caller must know:
 *
 *   - `unstable_cache` serialises its result as JSON, so on a cache hit every
 *     Date column comes back as an ISO string. Both loaders revive those
 *     columns before returning, so `page.updatedAt.toISOString()` works on a
 *     cold and a warm cache alike (JSON-LD, OG URLs). Before this, the only
 *     consumer (`isInIndexProbation`) had to accept `Date | string` itself.
 *   - React's `cache()` dedupes the call within one request, so the layout,
 *     `generateMetadata` and the page share one lookup.
 *
 * Anything that depends on the request (the User-Agent for the in-app bar)
 * stays out of these loaders.
 */
export const getPublicPageData = cache(async (slug: string): Promise<PublicPageData | null> => {
  const normalized = normalizeSlug(slug);

  const result = await unstable_cache(
    async () => {
      const rows = await db
        .select({
          page: pages,
          plan: workspaces.plan,
          planOverride: entitlementOverrides.value,
        })
        .from(pages)
        .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
        // Comped plans live in entitlement_overrides, not in workspaces.plan.
        // Without this join the render path disagreed with the editor: a comped
        // Pro account could hide the badge, have it saved, and still see it.
        .leftJoin(
          entitlementOverrides,
          and(
            eq(entitlementOverrides.workspaceId, workspaces.id),
            eq(entitlementOverrides.feature, PLAN_OVERRIDE_FEATURE),
          ),
        )
        // Slugs are stored normalized; lowercasing here means a shared link
        // with different capitalisation still resolves instead of 404ing.
        .where(eq(pages.slug, normalized))
        .limit(1);

      const row = rows[0];
      if (!row) return null;

      const { planOverride, ...rest } = row;
      return { ...rest, plan: resolvePlanOverride(planOverride) ?? rest.plan };
    },
    ["public-page", normalized],
    { tags: [publicPageTag(normalized)], revalidate: 300 },
  )();

  if (!result) return null;
  return { ...result, page: reviveDates(result.page, PAGE_DATE_COLUMNS) };
});

export const getPublicPageBlocks = cache(async (pageId: string, slug: string): Promise<Block[]> => {
  const normalized = normalizeSlug(slug);

  const rows = await unstable_cache(
    async () =>
      db
        .select()
        .from(blocks)
        // Filter hidden blocks in SQL, not at render time. BlockRenderer
        // returning null keeps them out of the DOM, but they still travelled to
        // the browser inside the RSC payload — so a block the owner hid was
        // readable in View Source, label, URL and all.
        .where(and(eq(blocks.pageId, pageId), eq(blocks.isVisible, true)))
        .orderBy(asc(blocks.position)),
    ["public-page-blocks", pageId],
    { tags: [publicPageTag(normalized)], revalidate: 300 },
  )();

  return rows.map((row) => reviveDates(row, BLOCK_DATE_COLUMNS));
});

const PAGE_DATE_COLUMNS = ["createdAt", "updatedAt", "publishedAt", "firstPublishedAt"] as const;
const BLOCK_DATE_COLUMNS = ["createdAt", "updatedAt"] as const;

/** Rebuild Date columns that a JSON round trip turned into strings. */
export function reviveDates<T extends object, K extends keyof T>(row: T, keys: readonly K[]): T {
  const revived = { ...row };
  for (const key of keys) {
    const value = row[key] as unknown;
    if (value === null || value === undefined) continue;
    (revived as Record<K, unknown>)[key] = value instanceof Date ? value : new Date(value as string);
  }
  return revived;
}
