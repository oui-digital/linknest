import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { blocks, subscribers } from "@/lib/db/schema";
import {
  claimUnsentConfirmations,
  completeSend,
  confirmSubscription,
  countByStatus,
  iterateSubscribers,
  listSubscribers,
  deliverConfirmation,
  hashToken,
  purgeStalePending,
  purgeUnsubscribed,
  requestSubscription,
  unsubscribe,
  unsubscribeTokenFor,
  SEND_CLAIM_TTL_MS,
  type SendClaim,
} from "@/lib/subscribers";
import { createTestDb, seedOwnedPage, truncateAll, warmPool } from "./helpers";

const { db, pool } = createTestDb();
beforeAll(() => warmPool(pool));
beforeEach(() => truncateAll(db));
afterAll(() => pool.end());

const SECRET = "integration-secret";
const later = (ms: number) => new Date(Date.now() + ms);

async function pageWithForm(opts: { plan?: "free" | "pro"; isPublished?: boolean; visible?: boolean } = {}) {
  const seeded = await seedOwnedPage(db, { plan: opts.plan ?? "free", isPublished: opts.isPublished ?? true });
  const [block] = await db
    .insert(blocks)
    .values({ pageId: seeded.page.id, type: "email_capture", position: 0, isVisible: opts.visible ?? true, content: {} })
    .returning();
  return { ...seeded, block };
}

async function subscribe(page: { id: string }, block: { id: string }, email: string, now?: Date) {
  return requestSubscription(db, { pageId: page.id, blockId: block.id, email, now });
}

function claimOf(result: Awaited<ReturnType<typeof requestSubscription>>): SendClaim {
  if (result.outcome !== "sent") throw new Error(`expected a claim, got ${result.outcome}`);
  return result.claim;
}

async function row(id: string) {
  const [r] = await db.select().from(subscribers).where(eq(subscribers.id, id));
  return r;
}

describe("requesting", () => {
  it("creates a pending row holding only the token hash and the consent text", async () => {
    const { page, block } = await pageWithForm();
    const claim = claimOf(await subscribe(page, block, "Fan@Example.com"));
    const r = await row(claim.subscriberId);
    expect(r.status).toBe("pending");
    expect(r.email).toBe("fan@example.com");
    expect(r.confirmTokenHash).toBe(hashToken(claim.rawConfirmToken));
    expect(r.consentText).toContain(page.title);
    expect(JSON.stringify(r)).not.toContain(claim.rawConfirmToken);
  });

  it("accepts sign-ups only for a published page with a visible form", async () => {
    const draft = await pageWithForm({ isPublished: false });
    expect((await subscribe(draft.page, draft.block, "a@example.com")).outcome).toBe("not_found");
    const hidden = await pageWithForm({ visible: false });
    expect((await subscribe(hidden.page, hidden.block, "a@example.com")).outcome).toBe("not_found");
    const other = await pageWithForm();
    expect((await subscribe(other.page, hidden.block, "a@example.com")).outcome).toBe("not_found");
  });

  it("keeps one row per page and canonical address, and separate lists per page", async () => {
    const one = await pageWithForm();
    claimOf(await subscribe(one.page, one.block, "fan@gmail.com"));
    // Same mailbox, different spelling: deferred while the first send is in flight.
    expect((await subscribe(one.page, one.block, "f.a.n+news@gmail.com")).outcome).toBe("deferred");
    expect(await db.select().from(subscribers).where(eq(subscribers.pageId, one.page.id))).toHaveLength(1);

    const two = await pageWithForm();
    expect((await subscribe(two.page, two.block, "fan@gmail.com")).outcome).toBe("sent");
  });
});

describe("the send claim", () => {
  it("lets only one of two overlapping submissions send", async () => {
    const { page, block } = await pageWithForm();
    const results = await Promise.all([
      subscribe(page, block, "fan@example.com"),
      subscribe(page, block, "fan@example.com"),
    ]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["deferred", "sent"]);
  });

  it("does not let the cron take a claim a submission holds", async () => {
    const { page, block } = await pageWithForm();
    claimOf(await subscribe(page, block, "fan@example.com"));
    expect(await claimUnsentConfirmations(db)).toEqual([]);
  });

  it("ignores a completion from an attempt that no longer owns the claim", async () => {
    const { page, block } = await pageWithForm();
    const first = claimOf(await subscribe(page, block, "fan@example.com"));
    // The first attempt hangs past the claim TTL; a re-submission takes over.
    const second = claimOf(await subscribe(page, block, "fan@example.com", later(SEND_CLAIM_TTL_MS + 1000)));
    expect(second.attemptId).not.toBe(first.attemptId);

    expect(await completeSend(db, { subscriberId: first.subscriberId, attemptId: first.attemptId, ok: true })).toBe(false);
    expect((await row(first.subscriberId)).confirmEmailSentAt).toBeNull();
    expect(await completeSend(db, { subscriberId: second.subscriberId, attemptId: second.attemptId, ok: true })).toBe(true);
    // The first email's token was rotated away; only the second one confirms.
    expect((await confirmSubscription(db, first.rawConfirmToken)).outcome).toBe("invalid");
    expect((await confirmSubscription(db, second.rawConfirmToken)).outcome).toBe("confirmed");
  });

  it("does not mark an unsubscribed row as sent when an old send finishes", async () => {
    const { page, block } = await pageWithForm();
    const claim = claimOf(await subscribe(page, block, "fan@example.com"));
    await unsubscribe(db, {
      subscriberId: claim.subscriberId,
      token: unsubscribeTokenFor(claim.subscriberId, SECRET),
      secret: SECRET,
    });
    expect(await completeSend(db, { subscriberId: claim.subscriberId, attemptId: claim.attemptId, ok: true })).toBe(false);
    const r = await row(claim.subscriberId);
    expect(r.status).toBe("unsubscribed");
    expect(r.confirmEmailSentAt).toBeNull();
  });

  it("releases the claim on failure and retries up to three attempts", async () => {
    const { page, block } = await pageWithForm();
    const claim = claimOf(await subscribe(page, block, "fan@example.com"));
    const fail = async () => {
      throw new Error("Emailit down");
    };
    expect(await deliverConfirmation(db, claim, fail, () => {})).toBe(false);
    expect((await row(claim.subscriberId)).confirmSendClaimedAt).toBeNull();

    for (let attempt = 2; attempt <= 3; attempt++) {
      const [retry] = await claimUnsentConfirmations(db);
      expect(retry.subscriberId).toBe(claim.subscriberId);
      expect(retry.attemptId).not.toBe(claim.attemptId);
      await deliverConfirmation(db, retry, fail, () => {});
    }
    expect((await row(claim.subscriberId)).confirmEmailAttempts).toBe(3);
    expect(await claimUnsentConfirmations(db)).toEqual([]);
  });

  it("re-sends on a fresh submission when the earlier email never went out", async () => {
    const { page, block } = await pageWithForm();
    const claim = claimOf(await subscribe(page, block, "fan@example.com"));
    await completeSend(db, { subscriberId: claim.subscriberId, attemptId: claim.attemptId, ok: false });
    expect((await subscribe(page, block, "fan@example.com")).outcome).toBe("sent");
  });
});

describe("confirming and unsubscribing", () => {
  it("confirms once, then the token is spent", async () => {
    const { page, block } = await pageWithForm();
    const claim = claimOf(await subscribe(page, block, "fan@example.com"));
    expect(await confirmSubscription(db, claim.rawConfirmToken)).toEqual({ outcome: "confirmed", slug: page.slug });
    const r = await row(claim.subscriberId);
    expect(r.status).toBe("confirmed");
    expect(r.confirmTokenHash).toBeNull();
    expect((await confirmSubscription(db, claim.rawConfirmToken)).outcome).toBe("invalid");
    expect((await subscribe(page, block, "fan@example.com")).outcome).toBe("already_confirmed");
  });

  it("refuses an expired link", async () => {
    const { page, block } = await pageWithForm();
    const claim = claimOf(await subscribe(page, block, "fan@example.com"));
    expect((await confirmSubscription(db, claim.rawConfirmToken, later(49 * 3600_000))).outcome).toBe("expired");
  });

  it("unsubscribing invalidates an outstanding confirmation link", async () => {
    const { page, block } = await pageWithForm();
    const claim = claimOf(await subscribe(page, block, "fan@example.com"));
    const token = unsubscribeTokenFor(claim.subscriberId, SECRET);
    expect(await unsubscribe(db, { subscriberId: claim.subscriberId, token, secret: SECRET })).toBe("ok");
    expect((await confirmSubscription(db, claim.rawConfirmToken)).outcome).toBe("invalid");
    expect((await row(claim.subscriberId)).status).toBe("unsubscribed");
    // Idempotent, and forged links are refused.
    expect(await unsubscribe(db, { subscriberId: claim.subscriberId, token, secret: SECRET })).toBe("ok");
    expect(await unsubscribe(db, { subscriberId: claim.subscriberId, token: "0".repeat(64), secret: SECRET })).toBe("invalid");
  });

  it("re-subscribing after unsubscribing starts a fresh request", async () => {
    const { page, block } = await pageWithForm();
    const first = claimOf(await subscribe(page, block, "fan@example.com"));
    await confirmSubscription(db, first.rawConfirmToken);
    await unsubscribe(db, { subscriberId: first.subscriberId, token: unsubscribeTokenFor(first.subscriberId, SECRET), secret: SECRET });
    const before = (await row(first.subscriberId)).requestedAt;

    const again = claimOf(await subscribe(page, block, "fan@example.com", later(60_000)));
    const r = await row(again.subscriberId);
    expect(again.subscriberId).toBe(first.subscriberId);
    expect(r.status).toBe("pending");
    expect(r.requestedAt.getTime()).toBeGreaterThan(before.getTime());
    expect(r.confirmedAt).toBeNull();
  });
});

describe("plan cap", () => {
  async function fillConfirmed(workspaceId: string, pageId: string, count: number) {
    const rows = Array.from({ length: count }, (_, i) => ({
      workspaceId,
      pageId,
      email: `c${i}@example.com`,
      emailCanonical: `c${i}@example.com`,
      status: "confirmed",
      consentText: "x",
    }));
    await db.insert(subscribers).values(rows);
  }

  it("closes a free list at 100 confirmed subscribers across pages", async () => {
    const { workspace, page, block } = await pageWithForm();
    await fillConfirmed(workspace.id, page.id, 100);
    expect((await subscribe(page, block, "new@example.com")).outcome).toBe("list_full");
  });

  it("lets exactly one of two concurrent confirmations take the last free slot", async () => {
    const { workspace, page, block } = await pageWithForm();
    await fillConfirmed(workspace.id, page.id, 98);
    const a = claimOf(await subscribe(page, block, "a@example.com"));
    const b = claimOf(await subscribe(page, block, "b@example.com"));
    await db.insert(subscribers).values({
      workspaceId: workspace.id, pageId: page.id, email: "c98@example.com", emailCanonical: "c98@example.com",
      status: "confirmed", consentText: "x",
    });

    const results = await Promise.all([
      confirmSubscription(db, a.rawConfirmToken),
      confirmSubscription(db, b.rawConfirmToken),
    ]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["confirmed", "list_full"]);
    const confirmed = await db
      .select()
      .from(subscribers)
      .where(and(eq(subscribers.workspaceId, workspace.id), eq(subscribers.status, "confirmed")));
    expect(confirmed).toHaveLength(100);
  });

  it("does not cap Pro workspaces", async () => {
    const { workspace, page, block } = await pageWithForm({ plan: "pro" });
    await fillConfirmed(workspace.id, page.id, 150);
    expect((await subscribe(page, block, "new@example.com")).outcome).toBe("sent");
  });
});

describe("retention", () => {
  it("purges only stale pending rows and old unsubscribes", async () => {
    const { page, block } = await pageWithForm();
    const stale = claimOf(await subscribe(page, block, "stale@example.com", later(-8 * 86_400_000)));
    const fresh = claimOf(await subscribe(page, block, "fresh@example.com"));
    const gone = claimOf(await subscribe(page, block, "gone@example.com"));
    await confirmSubscription(db, gone.rawConfirmToken);
    await unsubscribe(db, {
      subscriberId: gone.subscriberId,
      token: unsubscribeTokenFor(gone.subscriberId, SECRET),
      secret: SECRET,
      now: later(-31 * 86_400_000),
    });

    expect(await purgeStalePending(db)).toBe(1);
    expect(await purgeUnsubscribed(db)).toBe(1);
    expect(await row(stale.subscriberId)).toBeUndefined();
    expect(await row(gone.subscriberId)).toBeUndefined();
    expect((await row(fresh.subscriberId)).status).toBe("pending");
  });
});

describe("pre-merge QA regressions (October 9)", () => {
  async function audience(n: number, plan: "free" | "pro") {
    const seeded = await pageWithForm({ plan });
    await db.execute(sql`
      INSERT INTO subscribers (workspace_id, page_id, email, email_canonical, status, consent_text, confirmed_at)
      SELECT ${seeded.workspace.id}::uuid, ${seeded.page.id}::uuid, 'fan' || g || '@example.com',
             'fan' || g || '@example.com', 'confirmed', 'QA consent', now()
      FROM generate_series(1, ${n}) g`);
    return seeded;
  }

  it("answers a full list identically for subscribed, pending and new addresses", async () => {
    const { workspace, page, block } = await audience(99, "free");
    const pending = claimOf(await subscribe(page, block, "pending@example.com"));
    await db.insert(subscribers).values({
      workspaceId: workspace.id, pageId: page.id, email: "last@example.com",
      emailCanonical: "last@example.com", status: "confirmed", consentText: "x",
    });

    const outcomes = await Promise.all(
      ["fan1@example.com", "pending@example.com", "new@example.com"].map(
        async (email) => (await subscribe(page, block, email, later(SEND_CLAIM_TTL_MS + 1000))).outcome,
      ),
    );
    expect(outcomes).toEqual(["list_full", "list_full", "list_full"]);
    expect((await row(pending.subscriberId)).status).toBe("pending");
  });

  it("exports every subscriber of a large Pro list, in batches", async () => {
    const { workspace } = await audience(10_001, "pro");
    let exported = 0;
    const seen = new Set<string>();
    for await (const batch of iterateSubscribers(db, { workspaceId: workspace.id, status: "confirmed" })) {
      exported += batch.length;
      for (const r of batch) seen.add(r.id);
    }
    expect(exported).toBe(10_001);
    expect(seen.size).toBe(10_001);
  });

  it("counts from SQL, independently of the page of rows shown", async () => {
    const { workspace, page, block } = await audience(150, "pro");
    claimOf(await subscribe(page, block, "waiting@example.com"));
    expect(await listSubscribers(db, { workspaceId: workspace.id, limit: 100 })).toHaveLength(100);
    expect(await countByStatus(db, { workspaceId: workspace.id })).toEqual({
      confirmed: 150, pending: 1, unsubscribed: 0, total: 151,
    });
  });
});
