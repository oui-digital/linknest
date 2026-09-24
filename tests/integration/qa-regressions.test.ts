import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { blocks, users } from "@/lib/db/schema";
import { applyBlockUpdate } from "@/lib/live-edit";
import { createAuthAdapter } from "@/lib/auth-adapter";
import { IdentityConflictError } from "@/lib/signup-admission";
import {
  createTestDb,
  fakeCheckUrls,
  gate,
  seedOwnedPage,
  seedUser,
  truncateAll,
  warmPool,
} from "./helpers";

const { db, pool } = createTestDb();
beforeAll(() => warmPool(pool));
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

describe("QA regressions: security invariants", () => {
  it("never exposes an unscanned URL when showing and editing a hidden block concurrently", async () => {
    const good = "https://safe.example.test/";
    const bad = "https://flagged.example.test/";
    const { page } = await seedOwnedPage(db, { isPublished: true, links: [good] });
    const [block] = await db
      .update(blocks)
      .set({ isVisible: false })
      .where(eq(blocks.pageId, page.id))
      .returning();
    const check = fakeCheckUrls([bad]);
    const scanned = gate();
    const release = gate();

    // updateBlock's contract: a partial patch, with the URLs to scan derived
    // from the block as saved when each attempt starts.
    const show = applyBlockUpdate(db, {
      pageId: page.id,
      blockId: block.id,
      patch: { isVisible: true },
      checkUrls: check,
      hooks: {
        beforeLock: async () => {
          scanned.open();
          await release.opened;
        },
      },
    });

    await scanned.opened;
    try {
      const edit = await applyBlockUpdate(db, {
        pageId: page.id,
        blockId: block.id,
        patch: { url: bad },
        checkUrls: check,
      });
      expect(edit.ok).toBe(true); // The URL is still hidden at this point.
    } finally {
      release.open();
    }
    const shown = await show;

    // The show saw its snapshot go stale, re-read the block and refused the
    // URL it would now expose.
    expect(shown.ok).toBe(false);
    expect(check.calls.flat()).toContain(bad);
    const [saved] = await db.select().from(blocks).where(eq(blocks.id, block.id));
    expect(check.calls.flat()).toContain(good);
    expect({ url: saved.url, visible: saved.isVisible })
      .not.toEqual({ url: bad, visible: true });
  });

  it("does not delete a recent user merely because it resembles this adapter's orphan", async () => {
    const adapter = createAuthAdapter(db);
    await seedUser(db, {
      email: "someone@gmail.com",
      emailCanonical: "someone@gmail.com",
      emailVerified: new Date(),
    });
    // This row was not created by the adapter/signup attempt being rejected.
    const unrelated = await seedUser(db, {
      email: "some.one@gmail.com",
      emailCanonical: "someone@gmail.com",
    });

    await expect(adapter.linkAccount({
      userId: unrelated.id,
      type: "oauth",
      provider: "github",
      providerAccountId: "qa-unrelated-user",
    })).rejects.toBeInstanceOf(IdentityConflictError);

    const remaining = await db.select().from(users).where(eq(users.id, unrelated.id));
    expect(remaining).toHaveLength(1);
  });
});
