import { eq } from "drizzle-orm";
import { z } from "zod";
import { pages, type PageBanner } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { applyLiveEdit, type LiveEditResult } from "@/lib/live-edit";
import type { UrlChecker } from "@/lib/publish-checks";
import { normalizeUrl } from "@/lib/url";

export const BANNER_TEXT_MAX = 140;

/** null removes the banner. */
export const bannerSchema = z
  .strictObject({
    text: z.string().trim().min(1).max(BANNER_TEXT_MAX),
    url: z.string().trim().max(2048).nullable(),
  })
  .nullable();

/** Validate and normalize a banner for storage. */
export function prepareBanner(input: unknown): { banner: PageBanner | null } | { error: string } {
  const parsed = bannerSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter banner text (up to 140 characters)." };
  if (!parsed.data) return { banner: null };
  if (!parsed.data.url) return { banner: { text: parsed.data.text, url: null } };
  const url = normalizeUrl(parsed.data.url);
  if ("error" in url) return { error: url.error };
  return { banner: { text: parsed.data.text, url: url.url } };
}

/**
 * Save a page's banner through the live-edit protocol: on a published page its
 * link is Safe-Browsing scanned first, and the content version moves so a
 * publish that scanned the old banner retries.
 */
export function saveBanner(
  db: Db,
  { pageId, banner, checkUrls }: { pageId: string; banner: PageBanner | null; checkUrls: UrlChecker },
): Promise<LiveEditResult<typeof pages.$inferSelect>> {
  return applyLiveEdit(db, {
    pageId,
    introducedUrls: banner?.url ? [banner.url] : [],
    checkUrls,
    write: async (tx) => {
      const [updated] = await tx
        .update(pages)
        .set({ banner, updatedAt: new Date() })
        .where(eq(pages.id, pageId))
        .returning();
      return updated ?? { error: "Page not found" };
    },
  });
}
