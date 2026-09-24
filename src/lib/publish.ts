import { eq, sql } from "drizzle-orm";
import { blocks, pages } from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import { checkUrlsOrQueue, type UrlChecker } from "@/lib/publish-checks";
import type { LiveEditHooks } from "@/lib/live-edit";

type Page = typeof pages.$inferSelect;

export type PublishResult =
  | { ok: true; page: Page }
  | { ok: false; error: string; flaggedUrls?: string[] };

export const PUBLISH_STALE_ERROR =
  "Your page changed while we were checking it. Please publish again.";

const MAX_ATTEMPTS = 2;

/**
 * Publish a page: scan every link on it, then flip it live — but only if the
 * content is still what was scanned. See src/lib/live-edit.ts for the protocol
 * this shares with block edits.
 *
 * All blocks are scanned, hidden ones included (as before): a hidden link can
 * later be shown, and showing it is only rescanned as a precaution.
 */
export async function publishPageCore(
  db: Db,
  pageId: string,
  {
    checkUrls,
    hooks,
  }: {
    checkUrls: UrlChecker;
    hooks?: LiveEditHooks;
  },
): Promise<PublishResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const [snapshot] = await db
      .select({ contentVersion: pages.contentVersion })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!snapshot) return { ok: false, error: "Page not found" };

    const rows = await db
      .select({ url: blocks.url })
      .from(blocks)
      .where(eq(blocks.pageId, pageId));
    const urls = rows.map((b) => b.url).filter((u): u is string => Boolean(u));

    const scan = await checkUrlsOrQueue(db, pageId, urls, checkUrls);
    if (!scan.ok) {
      return {
        ok: false,
        error: `Cannot publish: ${scan.error}`,
        flaggedUrls: scan.flaggedUrls,
      };
    }

    await hooks?.beforeLock?.();

    const outcome = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ contentVersion: pages.contentVersion })
        .from(pages)
        .where(eq(pages.id, pageId))
        .for("update");
      if (!locked) return { kind: "missing" as const };

      // An edit committed between the scan and now: the scan is stale.
      if (locked.contentVersion !== snapshot.contentVersion) {
        return { kind: "stale" as const };
      }

      const now = new Date();
      const [updated] = await tx
        .update(pages)
        .set({
          isPublished: true,
          publishedAt: now,
          // Set once; see the column comment in schema.ts.
          firstPublishedAt: sql`COALESCE(${pages.firstPublishedAt}, now())`,
          updatedAt: now,
        })
        .where(eq(pages.id, pageId))
        .returning();

      return { kind: "published" as const, page: updated };
    });

    if (outcome.kind === "stale") continue;
    if (outcome.kind === "missing") return { ok: false, error: "Page not found" };
    return { ok: true, page: outcome.page };
  }

  return { ok: false, error: PUBLISH_STALE_ERROR };
}
