import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/queries", () => ({
  getUserWorkspace: async () => ({ id: "ws", plan: "free" }),
  getWorkspacePages: async () => [{ id: "page", slug: "qa" }],
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => [
          { id: "b", type: "link", label: "Example", url: "https://example.com/", isVisible: true, content: {} },
        ],
      }),
    }),
  },
}));
vi.mock("@/lib/site", () => ({ SITE_URL: "https://qa.example" }));

import { GET } from "./route";

// Clicks on the shop link: five on Oct 2 after noon (inside a rolling 7-day
// interval, outside the seven calendar days shown) and one on Oct 3.
const CLICKS = [
  ...Array.from({ length: 5 }, () => "2026-10-02T13:00:00Z"),
  "2026-10-03T09:00:00Z",
];

/** A PostHog stand-in that applies the window the route actually sends. */
function fakePostHog() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const { query, values } = JSON.parse(String(init.body)).query;
    const start = new Date(`${values.start.replace(" ", "T")}Z`);
    const end = new Date(`${values.end.replace(" ", "T")}Z`);
    const inWindow = CLICKS.filter((t) => new Date(t) >= start && new Date(t) <= end);
    let results: unknown[] = [];
    if (query.includes("AS day") && values.event === "link_click") {
      const byDay = new Map<string, number>();
      for (const t of inWindow) byDay.set(t.slice(0, 10), (byDay.get(t.slice(0, 10)) ?? 0) + 1);
      results = [...byDay];
    } else if (query.includes("countIf(")) {
      results = inWindow.length ? [["b", inWindow.length, 0, "Example"]] : [];
    }
    return new Response(JSON.stringify({ results }), { status: 200 });
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("GET /api/analytics", () => {
  // Regression (QA, October 9): the summary said 1 click, the top-links table 6.
  it("reports the same window in the summary and the top-links table", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
    vi.stubEnv("POSTHOG_PERSONAL_API_KEY", "qa-key");
    vi.stubEnv("POSTHOG_PROJECT_ID", "qa-project");
    const fetchMock = fakePostHog();
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(new NextRequest("https://qa.example/api/analytics?slug=qa&days=7&view=full"));
    const data = await res.json();

    expect(data.labels).toHaveLength(7);
    expect(data.clicks.total).toBe(1);
    expect(data.topLinks[0].clicks).toBe(data.clicks.total);
    for (const [, init] of fetchMock.mock.calls) {
      expect(JSON.parse(String(init.body)).query.values).toMatchObject({
        start: "2026-10-03 00:00:00",
        end: "2026-10-09 12:00:00",
      });
    }
  });
});
