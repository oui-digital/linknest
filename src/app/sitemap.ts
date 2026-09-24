import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { getPublicPageUrl } from "@/lib/slugs";
import { listIndexablePages } from "@/lib/sitemap-pages";

// Published pages change independently of deploys, so the sitemap is rebuilt
// hourly rather than frozen at build time. A page taken down by moderation can
// therefore stay listed for up to an hour; it 404s in the meantime.
export const revalidate = 3600;

const MAX_URLS = 5000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let published: { slug: string; updatedAt: Date | null }[] = [];
  try {
    // New free pages are left out while in search probation.
    published = await listIndexablePages(db, { limit: MAX_URLS });
  } catch (error) {
    // A sitemap failure must not take down the route.
    console.error("[sitemap] Failed to load published pages:", error);
  }

  return [
    ...staticRoutes,
    ...published.map((page) => ({
      url: `${SITE_URL}${getPublicPageUrl(page.slug)}`,
      lastModified: page.updatedAt ?? undefined,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
