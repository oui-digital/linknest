import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { pageModerationLog, pageReports, pages } from "@/lib/db/schema";
import { recordReport } from "@/lib/reports";
import { reinstatePage } from "@/lib/moderation-actions";
import { abuseKeyForIp } from "@/lib/ip";
import { listReportedPages } from "@/lib/admin-reports";
import { createTestDb, seedOwnedPage, truncateAll } from "./helpers";

const { db, pool } = createTestDb();
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const deps = { revalidate: () => {} };

function report(pageId: string, ip: string, { autoTakedown = true } = {}) {
  return recordReport(
    db,
    { pageId, reporterIp: ip, reporterKey: abuseKeyForIp(ip), reason: "spam", details: null, autoTakedown },
    deps,
  );
}

async function takedownRows(pageId: string) {
  return db
    .select()
    .from(pageModerationLog)
    .where(and(eq(pageModerationLog.pageId, pageId), eq(pageModerationLog.action, "unpublished")));
}

async function isLive(pageId: string) {
  const [row] = await db.select({ live: pages.isPublished }).from(pages).where(eq(pages.id, pageId));
  return row.live;
}

describe("report threshold", () => {
  it("takes a live free page down at three distinct reporters, once", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    expect(await report(page.id, "198.51.100.1")).toMatchObject({ changed: false, distinctReporters: 1 });
    expect(await report(page.id, "198.51.100.2")).toMatchObject({ changed: false, distinctReporters: 2 });
    expect(await report(page.id, "198.51.100.3")).toMatchObject({ changed: true, distinctReporters: 3 });
    expect(await report(page.id, "198.51.100.4")).toMatchObject({ changed: false });

    expect(await isLive(page.id)).toBe(false);
    const rows = await takedownRows(page.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reasonCode: "user_reports", source: "report_threshold" });
  });

  it("only records while the rollout flag is off", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    for (let i = 1; i <= 5; i++) await report(page.id, `198.51.100.${i}`, { autoTakedown: false });
    expect(await isLive(page.id)).toBe(true);
    expect(await takedownRows(page.id)).toHaveLength(0);
  });

  it("never takes a Pro page down automatically", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true, plan: "pro" });
    for (let i = 1; i <= 5; i++) await report(page.id, `198.51.100.${i}`);
    expect(await isLive(page.id)).toBe(true);
  });

  it("counts one IPv6 /64 as one reporter", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    for (const ip of ["2001:db8:1:1::a", "2001:db8:1:1::b", "2001:db8:1:1:ffff::c"]) {
      await report(page.id, ip);
    }
    expect(await isLive(page.id)).toBe(true);
    const [only] = await db.select().from(pageReports).where(eq(pageReports.pageId, page.id));
    expect(only.reporterKey).toBe("2001:db8:1:1::/64");
  });

  it("ignores repeat reports from the same reporter in an epoch", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    expect(await report(page.id, "198.51.100.1")).toMatchObject({ recorded: true });
    expect(await report(page.id, "198.51.100.1")).toMatchObject({ recorded: false, distinctReporters: 1 });
  });

  it("does not count reports older than 24 hours", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    await report(page.id, "198.51.100.1");
    await report(page.id, "198.51.100.2");
    await db.execute(sql`UPDATE page_reports SET created_at = now() - interval '2 days'`);
    expect(await report(page.id, "198.51.100.3")).toMatchObject({ changed: false, distinctReporters: 1 });
  });
});

describe("review epochs", () => {
  it("starts over after a reinstatement, and lets earlier reporters report again", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    for (let i = 1; i <= 3; i++) await report(page.id, `198.51.100.${i}`);
    expect(await isLive(page.id)).toBe(false);

    await reinstatePage(db, page.id, { reasonCode: "user_reports", source: "admin_manual" });
    await db.update(pages).set({ isPublished: true }).where(eq(pages.id, page.id));

    // One new report after review must not re-trigger the takedown.
    expect(await report(page.id, "198.51.100.1")).toMatchObject({
      recorded: true,
      changed: false,
      distinctReporters: 1,
    });
    expect(await isLive(page.id)).toBe(true);
  });

  it("a report that waited on the lock behind a reinstatement lands in the new epoch", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    await report(page.id, "198.51.100.1");
    await report(page.id, "198.51.100.2");

    // An admin reinstatement holds the page lock, uncommitted.
    const admin = await pool.connect();
    await admin.query("BEGIN");
    await admin.query("SELECT id FROM pages WHERE id = $1 FOR UPDATE", [page.id]);
    const inserted = await admin.query<{ seq: string }>(
      `INSERT INTO page_moderation_log (page_id, action, reason_code, source)
       VALUES ($1, 'reinstated', 'all', 'admin_manual') RETURNING seq`,
      [page.id],
    );

    const reporting = report(page.id, "198.51.100.3");

    // Wait until the report is blocked on the page lock, then commit.
    let sawWait = false;
    for (let i = 0; i < 100 && !sawWait; i++) {
      const { rows } = await pool.query<{ n: string }>(
        "SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()",
      );
      sawWait = Number(rows[0].n) > 0;
      if (!sawWait) await new Promise((r) => setTimeout(r, 20));
    }
    expect(sawWait).toBe(true);
    await admin.query("COMMIT");
    admin.release();

    const result = await reporting;
    const newEpoch = Number(inserted.rows[0].seq);
    expect(result).toMatchObject({ reviewEpoch: newEpoch, distinctReporters: 1, changed: false });
    const [stored] = await db
      .select()
      .from(pageReports)
      .where(and(eq(pageReports.pageId, page.id), eq(pageReports.reporterIp, "198.51.100.3")));
    expect(stored.reviewEpoch).toBe(newEpoch);
    expect(await isLive(page.id)).toBe(true);
  });
});

describe("concurrent reports", () => {
  it("never write two takedowns for one page", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    await report(page.id, "198.51.100.1");
    await report(page.id, "198.51.100.2");

    const results = await Promise.all(
      ["198.51.100.3", "198.51.100.4", "198.51.100.5", "198.51.100.6"].map((ip) => report(page.id, ip)),
    );
    expect(results.filter((r) => r.found && r.changed)).toHaveLength(1);
    expect(await takedownRows(page.id)).toHaveLength(1);
  });
});

describe("admin listing", () => {
  it("counts reporters by abuse key", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    for (const ip of ["2001:db8:1:1::a", "2001:db8:1:1::b", "198.51.100.1"]) {
      await report(page.id, ip, { autoTakedown: false });
    }
    // The second /64 address was a duplicate and not recorded.
    const [listed] = await listReportedPages(db, { since: new Date(Date.now() - 86_400_000) });
    expect(listed).toMatchObject({ reportCount: 2, distinctReporters: 2 });
  });
});
