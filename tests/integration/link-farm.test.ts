import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { pageModerationLog } from "@/lib/db/schema";
import { LINK_FARM_MIN_WORKSPACES } from "@/lib/link-farm";
import { runLinkFarmCheck } from "@/lib/link-farm-check";
import { createTestDb, seedOwnedPage, truncateAll } from "./helpers";

const { db, pool } = createTestDb();
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

function alerts() {
  const sent: { subject: string }[] = [];
  return { sent, sendAlert: async (a: { subject: string; html: string }) => void sent.push(a) };
}

describe("link-farm signal", () => {
  it("flags a host shared by enough other workspaces, once per day", async () => {
    for (let i = 0; i < LINK_FARM_MIN_WORKSPACES; i++) {
      await seedOwnedPage(db, { isPublished: true, links: [`https://www.casino.example/r/${i}`] });
    }
    const { page } = await seedOwnedPage(db, {
      isPublished: true,
      links: ["https://casino.example/join", "https://instagram.com/me"],
    });
    const a = alerts();

    const first = await runLinkFarmCheck(db, page.id, a);
    expect(first).toEqual({ flagged: true, host: "casino.example", workspaces: LINK_FARM_MIN_WORKSPACES });

    const second = await runLinkFarmCheck(db, page.id, a);
    expect(second).toEqual({ flagged: false, reason: "debounced" });

    const warnings = await db
      .select()
      .from(pageModerationLog)
      .where(and(eq(pageModerationLog.pageId, page.id), eq(pageModerationLog.action, "warning")));
    expect(warnings).toHaveLength(1);
    expect(a.sent).toHaveLength(1);
  });

  it("counts per host, not across the page's hosts", async () => {
    const hosts = ["a.example", "b.example", "c.example", "d.example", "e.example"];
    for (const host of hosts) {
      await seedOwnedPage(db, { isPublished: true, links: [`https://${host}/`] });
    }
    const { page } = await seedOwnedPage(db, {
      isPublished: true,
      links: hosts.map((h) => `https://${h}/x`),
    });

    const result = await runLinkFarmCheck(db, page.id, alerts());
    expect(result).toEqual({ flagged: false, reason: "below_threshold" });
  });

  it("ignores drafts, other pages of the same workspace, and hidden links", async () => {
    for (let i = 0; i < LINK_FARM_MIN_WORKSPACES; i++) {
      await seedOwnedPage(db, { isPublished: false, links: ["https://casino.example/"] });
    }
    const { page } = await seedOwnedPage(db, { isPublished: true, links: ["https://casino.example/"] });
    expect(await runLinkFarmCheck(db, page.id, alerts())).toEqual({
      flagged: false,
      reason: "below_threshold",
    });
  });

  it("resolves userinfo in stored URLs to the real host, as the JS side does", async () => {
    for (let i = 0; i < LINK_FARM_MIN_WORKSPACES; i++) {
      await seedOwnedPage(db, { isPublished: true, links: ["https://instagram.com@casino.example/"] });
    }
    const { page } = await seedOwnedPage(db, { isPublished: true, links: ["https://casino.example/"] });
    const result = await runLinkFarmCheck(db, page.id, alerts());
    expect(result).toMatchObject({ flagged: true, host: "casino.example" });
  });
});
