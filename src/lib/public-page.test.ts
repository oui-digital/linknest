import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `unstable_cache` serialises to JSON: the first call runs the loader and
 * returns real Dates, every later call returns the JSON round trip, where the
 * Dates are ISO strings. This stand-in reproduces exactly that.
 */
vi.mock("next/cache", () => {
  // Keyed like the real thing: the loaders call unstable_cache afresh on
  // every request and rely on the key parts to hit the shared store.
  const store = new Map<string, unknown>();
  return {
    unstable_cache: (loader: () => Promise<unknown>, keyParts: string[]) => {
      const key = JSON.stringify(keyParts);
      return async () => {
        if (!store.has(key)) {
          const value = await loader();
          store.set(key, value);
          return value;
        }
        return JSON.parse(JSON.stringify(store.get(key)));
      };
    },
  };
});

const NOW = new Date("2026-10-11T18:51:24.478Z");
const pageRow = {
  id: "p1",
  slug: "demo",
  title: "Demo",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: NOW,
  publishedAt: NOW,
  firstPublishedAt: null,
  isPublished: true,
};
const blockRow = { id: "b1", pageId: "p1", position: 0, createdAt: NOW, updatedAt: NOW, isVisible: true };

/** A thenable query builder: every method returns itself, awaiting yields rows. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  for (const m of ["select", "from", "innerJoin", "leftJoin", "where", "limit", "orderBy"]) {
    c[m] = () => c;
  }
  return c;
}

const selects: unknown[][] = [];
vi.mock("@/lib/db", () => ({
  db: { select: () => chain(selects.shift() ?? []) },
}));

import { getPublicPageBlocks, getPublicPageData, reviveDates } from "./public-page";

beforeEach(() => {
  selects.length = 0;
});

describe("getPublicPageData", () => {
  it("returns real Dates on a cold cache and on a warm (JSON) cache alike", async () => {
    selects.push([{ page: pageRow, plan: "free", planOverride: null }]);

    const cold = await getPublicPageData("Demo");
    const warm = await getPublicPageData("demo");

    for (const result of [cold, warm]) {
      expect(result?.page.updatedAt).toBeInstanceOf(Date);
      expect(result?.page.updatedAt.toISOString()).toBe(NOW.toISOString());
      expect(result?.page.createdAt.getTime()).toBe(pageRow.createdAt.getTime());
      expect(result?.page.firstPublishedAt).toBeNull();
      expect(result?.plan).toBe("free");
    }
  });

  it("is null for an unknown slug", async () => {
    selects.push([]);
    expect(await getPublicPageData("nobody")).toBeNull();
  });
});

describe("getPublicPageBlocks", () => {
  it("revives block dates on both cache paths", async () => {
    selects.push([blockRow]);
    const cold = await getPublicPageBlocks("p1", "demo");
    const warm = await getPublicPageBlocks("p1", "demo");
    expect(cold[0].updatedAt).toBeInstanceOf(Date);
    expect(warm[0].updatedAt).toBeInstanceOf(Date);
    expect(warm[0].updatedAt.toISOString()).toBe(NOW.toISOString());
  });
});

describe("reviveDates", () => {
  it("parses strings, keeps Dates and leaves null alone", () => {
    const row = { a: NOW.toISOString(), b: NOW, c: null as Date | null, d: "untouched" };
    const out = reviveDates(row, ["a", "b", "c"]);
    expect(out.a).toBeInstanceOf(Date);
    expect(out.b).toBe(NOW);
    expect(out.c).toBeNull();
    expect(out.d).toBe("untouched");
  });
});
