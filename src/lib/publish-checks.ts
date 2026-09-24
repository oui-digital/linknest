import { pendingUrlScans } from "@/lib/db/schema";
import type { DbOrTx } from "@/lib/db/types";
import type { SafeBrowsingResult } from "@/lib/safe-browsing";

export type UrlChecker = (urls: string[]) => Promise<SafeBrowsingResult>;

export type ScanOutcome =
  | { ok: true }
  | { ok: false; error: string; flaggedUrls: string[] };

/**
 * Safe Browsing gate shared by publish and by live edits to a published page.
 *
 * Fails open like publish always has: when Google is unreachable the URLs are
 * queued in pending_url_scans and the daily cron rescans them, unpublishing
 * the page if one turns out to be flagged. Callers must invoke this OUTSIDE
 * any transaction — it is a network call, and holding the page row lock across
 * it would stall every other edit to that page for up to the timeout.
 */
export async function checkUrlsOrQueue(
  db: DbOrTx,
  pageId: string,
  urls: string[],
  checkUrls: UrlChecker,
): Promise<ScanOutcome> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return { ok: true };

  const result = await checkUrls(unique);

  if (!result.safe) {
    return {
      ok: false,
      error: `${result.flaggedUrls.length} URL(s) flagged as unsafe. Remove or replace them.`,
      flaggedUrls: result.flaggedUrls,
    };
  }

  if (result.timedOut) {
    await db
      .insert(pendingUrlScans)
      .values(unique.map((url) => ({ pageId, url })));
  }

  return { ok: true };
}
