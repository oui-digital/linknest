import { eq, sql } from "drizzle-orm";
import { pages } from "@/lib/db/schema";
import type { Db, Tx } from "@/lib/db/types";
import { checkUrlsOrQueue, type UrlChecker } from "@/lib/publish-checks";

/**
 * Publish and block edits share one protocol so that no link reaches a live
 * page without a Safe Browsing check.
 *
 * Before this, createBlock/updateBlock wrote straight to the served content of
 * a published page: publish an innocuous page, then swap its links, and
 * nothing ever scanned the replacements. Scanning edits on published pages is
 * not enough on its own, because of two races:
 *
 *   1. An edit reads isPublished=false and skips the scan; publish scans the
 *      old links and commits; the edit then saves an unscanned link onto the
 *      now-live page.
 *   2. Publish scans; an edit commits a new link; publish commits, having
 *      scanned content that no longer exists.
 *
 * The network scan stays outside the transaction. Correctness comes from the
 * page row lock (SELECT … FOR UPDATE) taken in the final step of both paths:
 *
 *   - An edit re-reads isPublished under the lock. If the page went live after
 *     the edit decided no scan was needed, it retries (and scans).
 *   - Every edit bumps pages.content_version under the lock. Publish re-reads
 *     it under the lock; if it moved since the scan, the scan is stale and
 *     publish retries.
 */

/**
 * The URL an update to an existing block puts in front of visitors, if any:
 * a changed URL on a visible block, or any URL on a block being shown. A URL
 * changed on a hidden block is picked up later, when the block is shown.
 *
 * Showing a block re-scans a URL that was scanned at publish time. That is a
 * cheap precaution: a destination can be flagged long after it was added.
 */
export function urlsIntroducedByUpdate(
  before: { url: string | null; isVisible: boolean },
  patch: { url?: string | null; isVisible?: boolean },
): string[] {
  const nextUrl = patch.url !== undefined ? patch.url : before.url;
  const nextVisible = patch.isVisible ?? before.isVisible;
  const urlChanged = patch.url !== undefined && patch.url !== before.url;
  const becameVisible = nextVisible && !before.isVisible;
  return nextUrl && nextVisible && (urlChanged || becameVisible) ? [nextUrl] : [];
}

export type LiveEditHooks = {
  /** Test-only: runs between the unlocked read/scan and the locked commit. */
  beforeLock?: () => Promise<void>;
};

export type LiveEditResult<T> =
  | { ok: true; value: T; isPublished: boolean }
  | { ok: false; error: string; flaggedUrls?: string[] };

const MAX_ATTEMPTS = 2;

/** Thrown inside the transaction so a rejected write rolls back cleanly. */
class RejectedWrite extends Error {}

/**
 * Apply a block mutation to a page.
 *
 * `introducedUrls` are the URLs this edit would make visible on the page (a
 * new link, a changed link, or a hidden link being shown). They are scanned
 * only when the page is published. `write` runs inside the transaction, after
 * the page row is locked, so anything it reads (block counts, positions) is
 * serialized against every other edit to the same page.
 */
export async function applyLiveEdit<T>(
  db: Db,
  {
    pageId,
    introducedUrls,
    write,
    checkUrls,
    hooks,
  }: {
    pageId: string;
    introducedUrls: string[];
    write: (tx: Tx) => Promise<T | { error: string }>;
    checkUrls: UrlChecker;
    hooks?: LiveEditHooks;
  },
): Promise<LiveEditResult<T>> {
  const urls = [...new Set(introducedUrls.filter(Boolean))];
  let scanned = urls.length === 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [page] = await db
      .select({ isPublished: pages.isPublished })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) return { ok: false, error: "Page not found" };

    if (page.isPublished && !scanned) {
      const scan = await checkUrlsOrQueue(db, pageId, urls, checkUrls);
      if (!scan.ok) {
        return {
          ok: false,
          error: `Can't save: ${scan.error}`,
          flaggedUrls: scan.flaggedUrls,
        };
      }
      scanned = true;
    }

    await hooks?.beforeLock?.();

    let outcome;
    try {
      outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ isPublished: pages.isPublished })
        .from(pages)
        .where(eq(pages.id, pageId))
        .for("update");
      if (!locked) return { kind: "missing" as const };

      // Race 1: the page went live after we decided no scan was needed.
      if (locked.isPublished && !scanned) return { kind: "retry" as const };

      const value = await write(tx);
      if (value && typeof value === "object" && "error" in value) {
        throw new RejectedWrite(value.error);
      }

      await tx
        .update(pages)
        .set({ contentVersion: sql`${pages.contentVersion} + 1` })
        .where(eq(pages.id, pageId));

      return {
        kind: "done" as const,
        value: value as T,
        isPublished: locked.isPublished,
      };
      });
    } catch (error) {
      if (error instanceof RejectedWrite) return { ok: false, error: error.message };
      throw error;
    }

    if (outcome.kind === "retry") continue;
    if (outcome.kind === "missing") return { ok: false, error: "Page not found" };
    return { ok: true, value: outcome.value, isPublished: outcome.isPublished };
  }

  return {
    ok: false,
    error: "Your page changed while we were saving. Please try again.",
  };
}
