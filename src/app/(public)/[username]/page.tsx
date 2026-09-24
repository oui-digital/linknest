import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import {
  pages,
  blocks,
  workspaces,
  entitlementOverrides,
} from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { TemplateRenderer } from "@/components/templates/template-renderer";
import { PageBeacon } from "@/components/analytics/page-beacon";
import type { ThemeTokens } from "@/lib/templates/theme";
import { getPublicPageUrl, normalizeSlug } from "@/lib/slugs";
import {
  resolvePlanOverride,
  PLAN_OVERRIDE_FEATURE,
} from "@/lib/queries";
import { publicPageTag } from "@/lib/cache-tags";
import { SITE_URL } from "@/lib/site";
import { isInIndexProbation } from "@/lib/indexing";

interface Props {
  params: Promise<{ username: string }>;
}

// NOTE: `export const revalidate = false` used to sit here. It was a no-op —
// a dynamic segment with no generateStaticParams is server-rendered on demand
// (confirmed by `next build`: this route reports as ƒ, and prerender-manifest
// lists no dynamic route for it), so the page was never in the full-route
// cache and revalidatePath() could not affect it. The result was two database
// queries on every single public page view.
//
// Caching is therefore done at the data layer, which works regardless of how
// the route itself is rendered, and is invalidated by tag on publish/edit.
async function getPageData(slug: string) {
  const normalized = normalizeSlug(slug);

  return unstable_cache(
    async () => {
      const result = await db
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

      const row = result[0];
      if (!row) return null;

      const { planOverride, ...rest } = row;
      return { ...rest, plan: resolvePlanOverride(planOverride) ?? rest.plan };
    },
    ["public-page", normalized],
    { tags: [publicPageTag(normalized)], revalidate: 300 },
  )();
}

async function getPageBlocks(pageId: string, slug: string) {
  const normalized = normalizeSlug(slug);

  return unstable_cache(
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
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const result = await getPageData(username);

  // Also gate on isPublished: metadata used to be generated for draft pages,
  // exposing an unpublished title/bio on a route that 404s.
  if (!result || !result.page.isPublished) {
    return { title: "Not Found", robots: { index: false, follow: false } };
  }

  const { page, plan } = result;
  const title = page.seoTitle || page.title;
  const description =
    page.seoDescription || page.bio || `${page.title} — LinkNest`;
  const canonical = getPublicPageUrl(page.slug);

  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      type: "profile",
      url: canonical,
      siteName: "LinkNest",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    // New free pages are kept out of search for their first weeks (see
    // src/lib/indexing.ts). Evaluated per request, so it lifts on its own.
    ...(isInIndexProbation({ plan, firstPublishedAt: page.firstPublishedAt })
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}

export default async function PublicPage({ params }: Props) {
  const { username } = await params;
  const result = await getPageData(username);

  if (!result || !result.page.isPublished) {
    notFound();
  }

  const { page, plan } = result;
  const pageBlocks = await getPageBlocks(page.id, page.slug);

  const theme = page.theme as Partial<ThemeTokens> | null;
  const isPro = plan === "pro";
  const showBadge = !(isPro && theme?.hideBranding);

  return (
    <>
      <TemplateRenderer
        page={page}
        blocks={pageBlocks}
        showBadge={showBadge}
        showReport
      />
      <PageBeacon slug={page.slug} />
    </>
  );
}
