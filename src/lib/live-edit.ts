import { and, eq, sql } from "drizzle-orm";
import { blocks, pages } from "@/lib/db/schema";
import type { Db, Tx } from "@/lib/db/types";
import { checkUrlsOrQueue, type UrlChecker } from "@/lib/publish-checks";

/**
 * Publish and block edits share one protocol so that no link reaches a live
 * page without a Safe Browsing check.
 *
 * Before this, createBlock/updateBlock wrote straight to the served content of
 * a published page: publish an innocuous page, then swap its links, and
 * nothing ever scanned the replacements. Scanning edits on published pages is
 * not enough on its own, because of three races:
 *
 *   1. An edit reads isPublished=false and skips the scan; publish scans the
 *      old links and commits; the edit then saves an unscanned link onto the
 *      now-live page.
 *   2. Publish scans; an edit commits a new link; publish commits, having
 *      scanned content that no longer exists.
 *   3. Two edits to one block: A shows a hidden block and scans its URL; B
 *      swaps the still-hidden URL (nothing to scan) and commits; A commits
 *      isVisible=true, putting B's unscanned URL live.
 *
 * The network scan stays outside the transaction. Correctness comes from the
 * page row lock (SELECT … FOR UPDATE) taken in the final step of both paths:
 *
 *   - An edit re-reads isPublished under the lock. If the page went live after
 *     the edit decided no scan was needed, it retries (and scans).
 *   - Every edit bumps pages.content_version under the lock. Publish re-reads
 *     it under the lock; if it moved since the scan, the scan is stale and
 *     publish retries.
 *   - An edit whose URLs depend on current block state (race 3) reads the
 *     version before that state and re-checks it under the lock. If it moved,
 *     the state it scanned is stale, and it retries: re-read, re-scan.
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
 * only when the page is published. Pass a list when they are fixed by the
 * request alone (a new block), and a function when they depend on what is
 * already saved (an update to an existing block): the function is re-run on
 * every attempt, after the page's content version is read, and the commit is
 * refused as stale if that version moved before the lock.
 *
 * `write` runs inside the transaction, after the page row is locked, so
 * anything it reads (block counts, positions) is serialized against every
 * other edit to the same page.
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
    introducedUrls: string[] | ((db: Db) => Promise<string[]>);
    write: (tx: Tx) => Promise<T | { error: string }>;
    checkUrls: UrlChecker;
    hooks?: LiveEditHooks;
  },
): Promise<LiveEditResult<T>> {
  const readsState = typeof introducedUrls === "function";
  const readUrls = readsState ? introducedUrls : async () => introducedUrls;
  const cleared = new Set<string>();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [page] = await db
      .select({ isPublished: pages.isPublished, contentVersion: pages.contentVersion })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) return { ok: false, error: "Page not found" };

    // Read after the version: any edit that commits after this read moves
    // the version past the snapshot, so the locked check below catches it.
    const urls = [...new Set((await readUrls(db)).filter(Boolean))];
    const unscanned = urls.filter((url) => !cleared.has(url));

    if (page.isPublished && unscanned.length > 0) {
      const scan = await checkUrlsOrQueue(db, pageId, unscanned, checkUrls);
      if (!scan.ok) {
        return {
          ok: false,
          error: `Can't save: ${scan.error}`,
          flaggedUrls: scan.flaggedUrls,
        };
      }
      for (const url of unscanned) cleared.add(url);
    }
    const scanned = urls.every((url) => cleared.has(url));

    await hooks?.beforeLock?.();

    let outcome;
    try {
      outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ isPublished: pages.isPublished, contentVersion: pages.contentVersion })
        .from(pages)
        .where(eq(pages.id, pageId))
        .for("update");
      if (!locked) return { kind: "missing" as const };

      // Race 1: the page went live after we decided no scan was needed.
      if (locked.isPublished && !scanned) return { kind: "retry" as const };

      // Race 3: another edit changed the state our URLs were derived from.
      if (
        readsState &&
        locked.isPublished &&
        locked.contentVersion !== page.contentVersion
      ) {
        return { kind: "retry" as const };
      }

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

export type BlockPatch = {
  label?: string;
  url?: string | null;
  content?: Record<string, unknown>;
  isVisible?: boolean;
};

type Block = typeof blocks.$inferSelect;

/**
 * Apply a partial update to an existing block through the live-edit protocol.
 *
 * The URLs to scan are derived from the block as saved at the time of each
 * attempt, not from a read taken before calling this: the patch is partial,
 * so what it puts in front of visitors depends on the fields it leaves alone.
 *
 * `introducedUrls` in the result are those of the attempt that committed.
 */
export async function applyBlockUpdate(
  db: Db,
  {
    pageId,
    blockId,
    patch,
    checkUrls,
    hooks,
  }: {
    pageId: string;
    blockId: string;
    patch: BlockPatch;
    checkUrls: UrlChecker;
    hooks?: LiveEditHooks;
  },
): Promise<LiveEditResult<{ block: Block; introducedUrls: string[] }>> {
  let introduced: string[] = [];

  const outcome = await applyLiveEdit(db, {
    pageId,
    introducedUrls: async (reader) => {
      const [current] = await reader
        .select({ url: blocks.url, isVisible: blocks.isVisible })
        .from(blocks)
        .where(and(eq(blocks.id, blockId), eq(blocks.pageId, pageId)))
        .limit(1);
      introduced = current ? urlsIntroducedByUpdate(current, patch) : [];
      return introduced;
    },
    checkUrls,
    hooks,
    write: async (tx) => {
      const [updated] = await tx
        .update(blocks)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(blocks.id, blockId), eq(blocks.pageId, pageId)))
        .returning();
      return updated ?? { error: "Block not found" };
    },
  });

  if (!outcome.ok) return outcome;
  return { ...outcome, value: { block: outcome.value, introducedUrls: introduced } };
}
