import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { pageModerationLog, pageReports, pages, users, workspaceMembers } from "@/lib/db/schema";
import { publishPageCore } from "@/lib/publish";
import { takedownPage } from "@/lib/moderation-actions";
import { runModerationCommand, type AdminDeps } from "@/lib/admin-moderation";
import { listReportedPages } from "@/lib/admin-reports";
import { MODERATION_BLOCKED_ERROR } from "@/lib/moderation";
import { createTestDb, fakeCheckUrls, gate, seedOwnedPage, seedUser, truncateAll } from "./helpers";

const { db, pool } = createTestDb();
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

function adminDeps() {
  const revalidated: string[] = [];
  const notices: { to: string; slug: string; reasonCode: string }[] = [];
  const deps: AdminDeps = {
    revalidate: (slug) => void revalidated.push(slug),
    notifyOwner: async (n) => void notices.push(n),
  };
  return { deps, revalidated, notices };
}

const publish = (pageId: string) => publishPageCore(db, pageId, { checkUrls: fakeCheckUrls() });
const manual = { reasonCode: "manual_review", source: "admin_manual" };

describe("publish vs takedown (two connections)", () => {
  it("a takedown that lands while publish is scanning wins", async () => {
    const { page } = await seedOwnedPage(db, { links: ["https://fine.example/"] });
    const hold = gate();
    const scanned = gate();

    const publishing = publishPageCore(db, page.id, {
      checkUrls: fakeCheckUrls(),
      hooks: {
        beforeLock: async () => {
          scanned.open();
          await hold.opened;
        },
      },
    });
    await scanned.opened;
    const takedown = await takedownPage(db, page.id, manual, { revalidate: () => {} });
    expect(takedown).toMatchObject({ found: true, changed: true });

    hold.open();
    expect(await publishing).toEqual({ ok: false, error: MODERATION_BLOCKED_ERROR });
    const [after] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(after.isPublished).toBe(false);
  });

  it("a takedown after publish commits unpublishes the page", async () => {
    const { page } = await seedOwnedPage(db, { links: ["https://fine.example/"] });
    expect((await publish(page.id)).ok).toBe(true);
    await takedownPage(db, page.id, manual, { revalidate: () => {} });
    const [after] = await db.select().from(pages).where(eq(pages.id, page.id));
    expect(after.isPublished).toBe(false);
  });
});

describe("independent holds", () => {
  it("a manual ban survives lifting a later account suspension", async () => {
    const { page, user } = await seedOwnedPage(db, { isPublished: true });
    const { deps } = adminDeps();

    await runModerationCommand(db, { action: "takedown_page", pageId: page.id }, deps);
    await runModerationCommand(db, { action: "suspend_user", userId: user.id }, deps);
    const lifted = await runModerationCommand(db, { action: "reinstate_user", userId: user.id }, deps);

    expect(lifted).toMatchObject({
      status: 200,
      body: { pages: [{ changed: true, remainingHolds: ["manual_review"] }] },
    });
    expect((await publish(page.id)).ok).toBe(false);

    await runModerationCommand(
      db,
      { action: "reinstate_page", pageId: page.id, reasonCode: "manual_review" },
      deps,
    );
    expect((await publish(page.id)).ok).toBe(true);
  });

  it("reinstating the wrong reason changes nothing", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    const { deps } = adminDeps();
    await runModerationCommand(db, { action: "takedown_page", pageId: page.id }, deps);

    const result = await runModerationCommand(
      db,
      { action: "reinstate_page", pageId: page.id, reasonCode: "user_reports" },
      deps,
    );
    expect(result).toMatchObject({ status: 200, body: { changed: false, remainingHolds: ["manual_review"] } });
    expect((await publish(page.id)).ok).toBe(false);
  });

  it("'all' lifts every hold", async () => {
    const { page, user } = await seedOwnedPage(db, { isPublished: true });
    const { deps } = adminDeps();
    await runModerationCommand(db, { action: "takedown_page", pageId: page.id }, deps);
    await runModerationCommand(db, { action: "suspend_user", userId: user.id }, deps);
    await runModerationCommand(db, { action: "reinstate_page", pageId: page.id, reasonCode: "all" }, deps);
    expect((await publish(page.id)).ok).toBe(true);
  });
});

describe("takedown idempotency", () => {
  it("concurrent takedowns write one row and report one change", async () => {
    const { page } = await seedOwnedPage(db, { isPublished: true });
    const results = await Promise.all(
      Array.from({ length: 4 }, () => takedownPage(db, page.id, manual, { revalidate: () => {} })),
    );
    expect(results.filter((r) => r.found && r.changed)).toHaveLength(1);
    const rows = await db
      .select()
      .from(pageModerationLog)
      .where(and(eq(pageModerationLog.pageId, page.id), eq(pageModerationLog.action, "unpublished")));
    expect(rows).toHaveLength(1);
  });

  it("notifies the owner and expires the cache only on a real change", async () => {
    const { page, user } = await seedOwnedPage(db, { isPublished: true });
    const { deps, notices, revalidated } = adminDeps();
    await runModerationCommand(db, { action: "takedown_page", pageId: page.id }, deps);
    await runModerationCommand(db, { action: "takedown_page", slug: page.slug }, deps);
    expect(notices).toEqual([{ to: user.email, slug: page.slug, reasonCode: "manual_review" }]);
    expect(revalidated).toEqual([page.slug]);
  });
});

describe("account suspension", () => {
  it("sets and clears suspended_at and only touches pages the user owns", async () => {
    const { page: owned, user } = await seedOwnedPage(db, { isPublished: true });
    const { page: shared, workspace: sharedWs } = await seedOwnedPage(db, { isPublished: true });
    await db.insert(workspaceMembers).values({ workspaceId: sharedWs.id, userId: user.id, role: "editor" });
    const { deps } = adminDeps();

    await runModerationCommand(db, { action: "suspend_user", email: user.email.toUpperCase() }, deps);
    const [suspended] = await db.select().from(users).where(eq(users.id, user.id));
    expect(suspended.suspendedAt).toBeTruthy();

    const [ownedAfter] = await db.select().from(pages).where(eq(pages.id, owned.id));
    const [sharedAfter] = await db.select().from(pages).where(eq(pages.id, shared.id));
    expect(ownedAfter.isPublished).toBe(false);
    expect(sharedAfter.isPublished).toBe(true);

    await runModerationCommand(db, { action: "reinstate_user", userId: user.id }, deps);
    const [cleared] = await db.select().from(users).where(eq(users.id, user.id));
    expect(cleared.suspendedAt).toBeNull();
    // Reinstating never republishes.
    const [stillDraft] = await db.select().from(pages).where(eq(pages.id, owned.id));
    expect(stillDraft.isPublished).toBe(false);
  });

  it("rejects ambiguous and unknown targets", async () => {
    const { deps } = adminDeps();
    expect(await runModerationCommand(db, { action: "suspend_user" }, deps)).toMatchObject({ status: 400 });
    expect(
      await runModerationCommand(db, { action: "takedown_page", slug: "nobody-here" }, deps),
    ).toMatchObject({ status: 404 });
  });
});

describe("reported pages listing", () => {
  it("groups reports per page with holds and owner attribution", async () => {
    const owner = await seedUser(db, { signupMethod: "magic_link", signupIp: "203.0.113.9" });
    const { page } = await seedOwnedPage(db, { isPublished: true, user: owner });
    for (const [ip, reason] of [
      ["198.51.100.1", "spam"],
      ["198.51.100.1", "spam"],
      ["198.51.100.2", "phishing"],
    ]) {
      await db.insert(pageReports).values({ pageId: page.id, reporterIp: ip, reason });
    }
    await takedownPage(db, page.id, manual, { revalidate: () => {} });

    const [listed] = await listReportedPages(db, { since: new Date(Date.now() - 86_400_000) });
    expect(listed).toMatchObject({
      slug: page.slug,
      reportCount: 3,
      distinctReporters: 2,
      activeHolds: ["manual_review"],
      owners: [{ email: owner.email, signupMethod: "magic_link", signupIp: "203.0.113.9" }],
    });
    expect(listed.reasons.sort()).toEqual(["phishing", "spam"]);
  });
});
