import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { asc, eq } from "drizzle-orm";
import { blocks, pages } from "@/lib/db/schema";
import { applyLiveEdit } from "@/lib/live-edit";
import {
  ORDER_OUT_OF_DATE_ERROR,
  reorderBlocksWrite,
  resolveInsertPosition,
} from "@/lib/block-order";
import type { Tx } from "@/lib/db/types";
import { createTestDb, fakeCheckUrls, gate, seedOwnedPage, truncateAll, warmPool } from "./helpers";

const { db, pool } = createTestDb();
beforeAll(() => warmPool(pool));
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const LINKS = ["https://a.example/", "https://b.example/", "https://c.example/"];

async function orderOf(pageId: string) {
  const rows = await db
    .select({ id: blocks.id, label: blocks.label, position: blocks.position, isVisible: blocks.isVisible })
    .from(blocks)
    .where(eq(blocks.pageId, pageId))
    .orderBy(asc(blocks.position), asc(blocks.createdAt));
  return rows;
}

async function versionOf(pageId: string) {
  const [row] = await db.select({ v: pages.contentVersion }).from(pages).where(eq(pages.id, pageId));
  return row.v;
}

/** The same write createBlock performs, with the page lock from applyLiveEdit. */
function insert(pageId: string, label: string, afterBlockId: string | null | undefined, hooks?: { beforeLock?: () => Promise<void> }) {
  return applyLiveEdit(db, {
    pageId,
    introducedUrls: [],
    checkUrls: fakeCheckUrls(),
    hooks,
    write: async (tx: Tx) => {
      const position = await resolveInsertPosition(tx, pageId, afterBlockId);
      if (typeof position !== "number") return position;
      const [live] = await tx.select({ isPublished: pages.isPublished }).from(pages).where(eq(pages.id, pageId));
      const [row] = await tx
        .insert(blocks)
        .values({ pageId, type: "text", position, label, isVisible: !live.isPublished })
        .returning();
      return row;
    },
  });
}

function reorder(pageId: string, blockIds: string[], hooks?: { beforeLock?: () => Promise<void> }) {
  return applyLiveEdit(db, {
    pageId,
    introducedUrls: [],
    checkUrls: fakeCheckUrls(),
    hooks,
    write: (tx: Tx) => reorderBlocksWrite(tx, pageId, blockIds),
  });
}

describe("insert position", () => {
  it("inserts after a block and shifts the ones below it", async () => {
    const { page } = await seedOwnedPage(db, { links: LINKS });
    const [first] = await orderOf(page.id);

    const result = await insert(page.id, "new", first.id);
    expect(result.ok).toBe(true);

    const order = await orderOf(page.id);
    expect(order.map((b) => b.position)).toEqual([0, 1, 2, 3]);
    expect(order.map((b) => b.label)).toEqual([LINKS[0], "new", LINKS[1], LINKS[2]]);
  });

  it("inserts at the top for null and appends when omitted", async () => {
    const { page } = await seedOwnedPage(db, { links: LINKS });

    await insert(page.id, "top", null);
    await insert(page.id, "end", undefined);

    const order = await orderOf(page.id);
    expect(order.map((b) => b.position)).toEqual([0, 1, 2, 3, 4]);
    expect(order[0].label).toBe("top");
    expect(order[4].label).toBe("end");
  });

  it("refuses an anchor that belongs to another page", async () => {
    const { page } = await seedOwnedPage(db, { links: LINKS });
    const other = await seedOwnedPage(db, { links: [LINKS[0]] });
    const [foreign] = await orderOf(other.page.id);

    const result = await insert(page.id, "x", foreign.id);
    expect(result.ok).toBe(false);
    expect((await orderOf(page.id)).map((b) => b.position)).toEqual([0, 1, 2]);
  });

  it("starts hidden on a live page and visible on a draft", async () => {
    const live = await seedOwnedPage(db, { isPublished: true, links: [LINKS[0]] });
    const draft = await seedOwnedPage(db, { links: [LINKS[0]] });

    await insert(live.page.id, "on live", undefined);
    await insert(draft.page.id, "on draft", undefined);

    expect((await orderOf(live.page.id)).find((b) => b.label === "on live")?.isVisible).toBe(false);
    expect((await orderOf(draft.page.id)).find((b) => b.label === "on draft")?.isVisible).toBe(true);
  });

  it("gives two concurrent inserts after the same block distinct positions", async () => {
    const { page } = await seedOwnedPage(db, { links: LINKS });
    const [first] = await orderOf(page.id);

    await Promise.all([insert(page.id, "x", first.id), insert(page.id, "y", first.id)]);

    const positions = (await orderOf(page.id)).map((b) => b.position);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("reorder under the page lock", () => {
  it("writes the permutation and bumps the content version", async () => {
    const { page } = await seedOwnedPage(db, { links: LINKS });
    const before = await orderOf(page.id);
    const reversed = [...before].reverse().map((b) => b.id);

    const result = await reorder(page.id, reversed);
    expect(result.ok).toBe(true);
    expect((await orderOf(page.id)).map((b) => b.id)).toEqual(reversed);
    expect(await versionOf(page.id)).toBe(1);
  });

  it("refuses a list that is not an exact permutation", async () => {
    const { page } = await seedOwnedPage(db, { links: LINKS });
    const before = await orderOf(page.id);

    const short = await reorder(page.id, [before[0].id, before[1].id]);
    expect(short).toMatchObject({ ok: false, error: ORDER_OUT_OF_DATE_ERROR });
    const duplicated = await reorder(page.id, [before[0].id, before[0].id, before[2].id]);
    expect(duplicated).toMatchObject({ ok: false, error: ORDER_OUT_OF_DATE_ERROR });
    expect((await orderOf(page.id)).map((b) => b.position)).toEqual([0, 1, 2]);
  });

  // Regression: the reorder used to validate outside any lock and write
  // positions in its own transaction, so an insert committing in between
  // could be overwritten with duplicate positions.
  it("loses cleanly to an insert that commits first", async () => {
    const { page } = await seedOwnedPage(db, { links: LINKS });
    const before = await orderOf(page.id);
    const insertCommitted = gate();

    // The reorder reads the pre-insert list, then waits before taking the lock.
    const reordering = reorder(page.id, [...before].reverse().map((b) => b.id), {
      beforeLock: () => insertCommitted.opened,
    });
    const inserted = await insert(page.id, "new", before[0].id);
    expect(inserted.ok).toBe(true);
    insertCommitted.open();
    const result = await reordering;

    expect(result).toMatchObject({ ok: false, error: ORDER_OUT_OF_DATE_ERROR });
    const order = await orderOf(page.id);
    expect(order.map((b) => b.position)).toEqual([0, 1, 2, 3]);
    expect(new Set(order.map((b) => b.position)).size).toBe(4);
    expect(await versionOf(page.id)).toBe(1);
  });
});
