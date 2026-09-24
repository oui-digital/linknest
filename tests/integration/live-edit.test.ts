import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { blocks, pages, pendingUrlScans } from "@/lib/db/schema";
import { applyLiveEdit } from "@/lib/live-edit";
import { publishPageCore, PUBLISH_STALE_ERROR } from "@/lib/publish";
import {
  createTestDb,
  fakeCheckUrls,
  gate,
  seedOwnedPage,
  truncateAll,
} from "./helpers";

const { db, pool } = createTestDb();
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const BAD = "https://malware.example/";
const GOOD = "https://fine.example/";

function replaceLink(blockId: string, url: string) {
  return async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    const [row] = await tx
      .update(blocks)
      .set({ url })
      .where(eq(blocks.id, blockId))
      .returning();
    return row;
  };
}

describe("live edits on a published page", () => {
  it("rejects replacing a link with a flagged URL and leaves the old one", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true, links: [GOOD] });
    const [block] = await db.select().from(blocks).where(eq(blocks.pageId, page.id));

    const result = await applyLiveEdit(db, {
      pageId: page.id,
      introducedUrls: [BAD],
      checkUrls: fakeCheckUrls([BAD]),
      write: replaceLink(block.id, BAD),
    });

    expect(result.ok).toBe(false);
    const [after] = await db.select().from(blocks).where(eq(blocks.id, block.id));
    expect(after.url).toBe(GOOD);
  });

  it("does not scan edits to an unpublished page", async () => {
    const { page } = await seedOwnedPage(db, { links: [GOOD] });
    const [block] = await db.select().from(blocks).where(eq(blocks.pageId, page.id));
    const check = fakeCheckUrls([BAD]);

    const result = await applyLiveEdit(db, {
      pageId: page.id,
      introducedUrls: [BAD],
      checkUrls: check,
      write: replaceLink(block.id, BAD),
    });

    expect(result.ok).toBe(true);
    expect(check.calls).toHaveLength(0);
  });

  it("queues the URL for the cron rescan when Safe Browsing times out", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true, links: [GOOD] });
    const [block] = await db.select().from(blocks).where(eq(blocks.pageId, page.id));
    const NEW = "https://new.example/";

    const result = await applyLiveEdit(db, {
      pageId: page.id,
      introducedUrls: [NEW],
      checkUrls: fakeCheckUrls([], { timedOut: true }),
      write: replaceLink(block.id, NEW),
    });

    expect(result.ok).toBe(true);
    const queued = await db.select().from(pendingUrlScans).where(eq(pendingUrlScans.pageId, page.id));
    expect(queued.map((q) => q.url)).toEqual([NEW]);
  });

  it("bumps the content version on every edit", async () => {
    const { page } = await seedOwnedPage(db, { links: [GOOD] });
    const [block] = await db.select().from(blocks).where(eq(blocks.pageId, page.id));
    await applyLiveEdit(db, {
      pageId: page.id,
      introducedUrls: [],
      checkUrls: fakeCheckUrls(),
      write: replaceLink(block.id, "https://other.example/"),
    });
    const [after] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(after.contentVersion).toBe(1);
  });
});

describe("publish vs edit races (two connections)", () => {
  it("an edit that read the page as a draft rescans once publish has gone live", async () => {
    const { page } = await seedOwnedPage(db, { links: [GOOD] });
    const [block] = await db.select().from(blocks).where(eq(blocks.pageId, page.id));
    const check = fakeCheckUrls([BAD]);
    const hold = gate();
    const reachedLock = gate();

    // The edit reads isPublished=false (no scan), then pauses before its lock.
    const edit = applyLiveEdit(db, {
      pageId: page.id,
      introducedUrls: [BAD],
      checkUrls: check,
      write: replaceLink(block.id, BAD),
      hooks: {
        beforeLock: async () => {
          reachedLock.open();
          await hold.opened;
        },
      },
    });

    await reachedLock.opened;
    // Publish scans the old content and commits while the edit is paused.
    const published = await publishPageCore(db, page.id, { checkUrls: check });
    expect(published.ok).toBe(true);

    hold.open();
    const result = await edit;

    // The edit's locked recheck saw a live page, retried, scanned and refused.
    expect(result.ok).toBe(false);
    expect(check.calls.some((urls) => urls.includes(BAD))).toBe(true);
    const [after] = await db.select().from(blocks).where(eq(blocks.id, block.id));
    expect(after.url).toBe(GOOD);
  });

  it("publish re-scans when an edit commits between its scan and its commit", async () => {
    const { page } = await seedOwnedPage(db, { links: [GOOD] });
    const [block] = await db.select().from(blocks).where(eq(blocks.pageId, page.id));
    const check = fakeCheckUrls([BAD]);
    const hold = gate();
    const scanned = gate();
    let first = true;

    const publish = publishPageCore(db, page.id, {
      checkUrls: check,
      hooks: {
        beforeLock: async () => {
          if (!first) return;
          first = false;
          scanned.open();
          await hold.opened;
        },
      },
    });

    await scanned.opened;
    // The page is still a draft, so this edit is saved without a scan.
    const edit = await applyLiveEdit(db, {
      pageId: page.id,
      introducedUrls: [BAD],
      checkUrls: check,
      write: replaceLink(block.id, BAD),
    });
    expect(edit.ok).toBe(true);

    hold.open();
    const result = await publish;

    // The content version moved, so publish discarded its scan and re-scanned.
    expect(result.ok).toBe(false);
    const [after] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(after.isPublished).toBe(false);
  });

  it("gives up with a clear message if the page keeps changing", async () => {
    const { page } = await seedOwnedPage(db, { links: [GOOD] });
    const [block] = await db.select().from(blocks).where(eq(blocks.pageId, page.id));

    const result = await publishPageCore(db, page.id, {
      checkUrls: fakeCheckUrls(),
      hooks: {
        // Every attempt sees a concurrent edit land after its scan.
        beforeLock: async () => {
          await applyLiveEdit(db, {
            pageId: page.id,
            introducedUrls: [],
            checkUrls: fakeCheckUrls(),
            write: replaceLink(block.id, `https://${Math.random()}.example/`),
          });
        },
      },
    });
    expect(result).toEqual({ ok: false, error: PUBLISH_STALE_ERROR });
  });
});

describe("first publication", () => {
  it("is set once and survives unpublish and republish", async () => {
    const { page } = await seedOwnedPage(db, { links: [GOOD] });
    const first = await publishPageCore(db, page.id, { checkUrls: fakeCheckUrls() });
    expect(first.ok && first.page.firstPublishedAt).toBeTruthy();

    const old = new Date("2026-01-01T00:00:00Z");
    await db.update(pages).set({ firstPublishedAt: old, isPublished: false }).where(eq(pages.id, page.id));

    const again = await publishPageCore(db, page.id, { checkUrls: fakeCheckUrls() });
    expect(again.ok && again.page.firstPublishedAt?.toISOString()).toBe(old.toISOString());
  });
});
