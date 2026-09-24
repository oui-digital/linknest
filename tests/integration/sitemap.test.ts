import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { entitlementOverrides, pages } from "@/lib/db/schema";
import { PLAN_OVERRIDE_FEATURE } from "@/lib/queries";
import { listIndexablePages } from "@/lib/sitemap-pages";
import { createTestDb, seedOwnedPage, truncateAll } from "./helpers";

const { db, pool } = createTestDb();
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const now = new Date("2026-09-24T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

async function page(
  plan: "free" | "pro",
  firstPublishedAt: Date | null,
  { isPublished = true, override }: { isPublished?: boolean; override?: unknown } = {},
) {
  const seeded = await seedOwnedPage(db, { plan, isPublished });
  await db.update(pages).set({ firstPublishedAt }).where(eq(pages.id, seeded.page.id));
  if (override !== undefined) {
    await db.insert(entitlementOverrides).values({
      workspaceId: seeded.workspace.id,
      feature: PLAN_OVERRIDE_FEATURE,
      value: override,
    });
  }
  return seeded.page.slug;
}

describe("sitemap eligibility", () => {
  it("applies probation to free pages only, honouring comped plans", async () => {
    const freeNew = await page("free", daysAgo(2));
    const freeOld = await page("free", daysAgo(30));
    const proNew = await page("pro", daysAgo(2));
    const compedProNew = await page("free", daysAgo(2), { override: { plan: "pro" } });
    const compedFreeNew = await page("pro", daysAgo(2), { override: { plan: "free" } });
    const junkOverrideProNew = await page("pro", daysAgo(2), { override: { plan: "gold" } });
    const neverDated = await page("free", null);
    const draft = await page("free", daysAgo(30), { isPublished: false });

    const listed = new Set((await listIndexablePages(db, { limit: 100, now })).map((p) => p.slug));

    expect(listed.has(freeOld)).toBe(true);
    expect(listed.has(proNew)).toBe(true);
    expect(listed.has(compedProNew)).toBe(true);
    expect(listed.has(junkOverrideProNew)).toBe(true);

    expect(listed.has(freeNew)).toBe(false);
    expect(listed.has(compedFreeNew)).toBe(false);
    expect(listed.has(neverDated)).toBe(false);
    expect(listed.has(draft)).toBe(false);
  });

  it("filters before the limit, so probation pages cannot crowd out eligible ones", async () => {
    const eligible = await page("free", daysAgo(60));
    for (let i = 0; i < 3; i++) await page("free", daysAgo(1)); // newer updatedAt
    const listed = await listIndexablePages(db, { limit: 1, now });
    expect(listed.map((p) => p.slug)).toEqual([eligible]);
  });
});
