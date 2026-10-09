import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { pages } from "@/lib/db/schema";
import { saveBanner } from "@/lib/banner";
import { publishPageCore } from "@/lib/publish";
import { createTestDb, fakeCheckUrls, seedOwnedPage, truncateAll, warmPool } from "./helpers";

const { db, pool } = createTestDb();
beforeAll(() => warmPool(pool));
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const BAD = "https://malware.example/";
const GOOD = "https://shop.example/";

describe("announcement banner", () => {
  it("updates only the target page, never another workspace's", async () => {
    const mine = await seedOwnedPage(db);
    const theirs = await seedOwnedPage(db);

    const result = await saveBanner(db, {
      pageId: mine.page.id,
      banner: { text: "New album out", url: GOOD },
      checkUrls: fakeCheckUrls(),
    });

    expect(result.ok).toBe(true);
    const [a] = await db.select().from(pages).where(eq(pages.id, mine.page.id));
    const [b] = await db.select().from(pages).where(eq(pages.id, theirs.page.id));
    expect(a.banner).toEqual({ text: "New album out", url: GOOD });
    expect(b.banner).toBeNull();
  });

  it("refuses a flagged link on a live page and keeps the old banner", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    await db.update(pages).set({ banner: { text: "Old", url: GOOD } }).where(eq(pages.id, page.id));

    const result = await saveBanner(db, {
      pageId: page.id,
      banner: { text: "New", url: BAD },
      checkUrls: fakeCheckUrls([BAD]),
    });

    expect(result.ok).toBe(false);
    const [after] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(after.banner).toEqual({ text: "Old", url: GOOD });
  });

  it("bumps the content version so a concurrent publish rescans", async () => {
    const { page } = await seedOwnedPage(db);
    await saveBanner(db, { pageId: page.id, banner: null, checkUrls: fakeCheckUrls() });
    const [after] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(after.contentVersion).toBe(1);
  });

  it("refuses to publish a page whose banner link is flagged", async () => {
    const { page } = await seedOwnedPage(db);
    await db.update(pages).set({ banner: { text: "Sale", url: BAD } }).where(eq(pages.id, page.id));

    const result = await publishPageCore(db, page.id, { checkUrls: fakeCheckUrls([BAD]) });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.flaggedUrls).toEqual([BAD]);
  });
});
