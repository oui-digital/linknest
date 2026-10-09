import { describe, it, expect } from "vitest";
import {
  DAILY_QUERY,
  SOCIAL_DESTINATIONS_QUERY,
  TOP_BLOCKS_QUERY,
  TOP_SOURCES_QUERY,
  analyticsWindow,
  canonicalReferrer,
  clampDays,
  clicksPerView,
  dayKeys,
  dayLabels,
  denseSeries,
  mergeTopLinks,
  type BlockRow,
  type PageBlock,
} from "./analytics";

describe("clampDays", () => {
  it("honours an offered range within the plan", () => {
    expect(clampDays(30, 90)).toBe(30);
    expect(clampDays(7, 90)).toBe(7);
  });
  it("caps a range above the plan", () => {
    expect(clampDays(90, 7)).toBe(7);
  });
  it("falls back to the plan maximum for missing or unoffered ranges", () => {
    expect(clampDays(null, 90)).toBe(90);
    expect(clampDays(45, 90)).toBe(90);
    expect(clampDays(NaN, 7)).toBe(7);
  });
});

describe("canonicalReferrer", () => {
  it("strips www and maps link shims to the platform", () => {
    expect(canonicalReferrer("www.example.com")).toBe("example.com");
    expect(canonicalReferrer("l.instagram.com")).toBe("instagram.com");
    expect(canonicalReferrer("t.co")).toBe("x.com");
    expect(canonicalReferrer("LM.Facebook.com")).toBe("facebook.com");
  });
  it("rejects anything that is not a hostname", () => {
    expect(canonicalReferrer("")).toBeNull();
    expect(canonicalReferrer("example.com/path")).toBeNull();
    expect(canonicalReferrer("exa mple.com")).toBeNull();
  });
});

describe("day series", () => {
  const now = new Date("2026-10-09T15:00:00Z");
  it("lists UTC days oldest first, ending today", () => {
    expect(dayKeys(3, now)).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
  });
  it("fills missing days with zeros", () => {
    const keys = dayKeys(3, now);
    expect(denseSeries(new Map([["2026-10-08", 5]]), keys)).toEqual([0, 5, 0]);
  });
  it("labels short ranges by weekday and long ranges by date", () => {
    expect(dayLabels(["2026-10-09"])).toEqual(["Fri"]);
    expect(dayLabels(dayKeys(30, now)).at(-1)).toBe("Oct 9");
  });
});

describe("TOP_BLOCKS_QUERY", () => {
  // Regression: grouping by URL before the LIMIT could drop or undercount a
  // link whose destination had been edited many times.
  it("groups by block only, so URL history is summed before the limit", () => {
    expect(TOP_BLOCKS_QUERY).toMatch(/GROUP BY block_id\s/);
    expect(TOP_BLOCKS_QUERY).not.toMatch(/GROUP BY[^\n]*url/);
  });
});

describe("mergeTopLinks", () => {
  const blocks: PageBlock[] = [
    { id: "a", type: "link", label: "Shop", url: "https://shop.example/", isVisible: true, content: {} },
    { id: "b", type: "link", label: "Old promo", url: "https://promo.example/", isVisible: false, content: {} },
    {
      id: "s",
      type: "socials",
      label: null,
      url: null,
      isVisible: true,
      content: {
        items: [
          { platform: "instagram", url: "https://www.instagram.com/me/" },
          { platform: "x", url: "https://x.com/me" },
        ],
      },
    },
  ];

  it("prefers current labels and flags hidden, deleted and banner rows", () => {
    const rows: BlockRow[] = [
      { blockId: "a", clicks: 10, plays: 0, label: "Shop (old label)" },
      { blockId: "b", clicks: 4, plays: 0, label: null },
      { blockId: "gone", clicks: 3, plays: 0, label: "Spring sale" },
      { blockId: "banner", clicks: 2, plays: 0, label: "Banner" },
    ];
    expect(mergeTopLinks(rows, [], blocks).map((l) => [l.label, l.status])).toEqual([
      ["Shop", "live"],
      ["Old promo", "hidden"],
      ["Spring sale", "deleted"],
      ["Announcement banner", "banner"],
    ]);
  });

  it("expands social icons per destination with platform names", () => {
    const [row] = mergeTopLinks(
      [{ blockId: "s", clicks: 9, plays: 0, label: "Instagram" }],
      [
        { blockId: "s", url: "https://x.com/me", label: "X", clicks: 2 },
        { blockId: "s", url: "https://www.instagram.com/me/", label: "Instagram", clicks: 7 },
        { blockId: "other", url: "https://x.com/no", label: "X", clicks: 50 },
      ],
      blocks,
    );
    expect(row.label).toBe("Social icons");
    expect(row.children).toEqual([
      { url: "https://www.instagram.com/me/", label: "Instagram", clicks: 7 },
      { url: "https://x.com/me", label: "X", clicks: 2 },
    ]);
  });

  it("ranks by clicks plus plays and keeps at most 25 rows", () => {
    const rows: BlockRow[] = Array.from({ length: 30 }, (_, i) => ({
      blockId: `id-${i}`,
      clicks: i,
      plays: i === 0 ? 100 : 0,
      label: `L${i}`,
    }));
    const merged = mergeTopLinks(rows, [], []);
    expect(merged).toHaveLength(25);
    expect(merged[0].id).toBe("id-0");
  });
});

describe("clicksPerView", () => {
  it("can exceed 1 and is null without views", () => {
    expect(clicksPerView(15, 10)).toBe(1.5);
    expect(clicksPerView(3, 0)).toBeNull();
  });
});

describe("analyticsWindow", () => {
  it("starts at 00:00 UTC on the first day shown and ends now", () => {
    const w = analyticsWindow(7, new Date("2026-10-09T12:00:00Z"));
    expect(w.keys[0]).toBe("2026-10-03");
    expect(w.start).toBe("2026-10-03 00:00:00");
    expect(w.end).toBe("2026-10-09 12:00:00");
  });

  it("is used by every query, with UTC day buckets", () => {
    for (const q of [DAILY_QUERY, TOP_BLOCKS_QUERY, SOCIAL_DESTINATIONS_QUERY, TOP_SOURCES_QUERY]) {
      expect(q).toContain("toDateTime({start}, 'UTC')");
      expect(q).toContain("toDateTime({end}, 'UTC')");
      expect(q).not.toContain("INTERVAL");
    }
    expect(DAILY_QUERY).toContain("toTimeZone(timestamp, 'UTC')");
  });
});
