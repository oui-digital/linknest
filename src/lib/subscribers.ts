import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { and, asc, desc, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { blocks, pages, subscribers } from "@/lib/db/schema";
import type { Db, DbOrTx, Tx } from "@/lib/db/types";
import { canonicalizeEmail } from "@/lib/email-normalize";
import { getLimit, type PlanId } from "@/lib/entitlements";
import { lockPage } from "@/lib/moderation-actions";
import { effectivePlan } from "@/lib/queries";

/**
 * Email capture with double opt-in.
 *
 * Lifecycle of a row (one per page and canonical address):
 *
 *   pending ──confirm link──▶ confirmed ──unsubscribe──▶ unsubscribed
 *      │                                                     │
 *      └── purged 7 days after requestedAt                   └── purged after 30 days
 *
 * - A request is accepted only for a published page with a visible email
 *   block, and records the consent sentence shown with the form.
 * - The confirmation email is owned by one send attempt at a time (the
 *   "claim": attempt id + claimed-at, valid for 2 minutes). Taking a claim
 *   rotates the confirm token in the same statement, so the token in an email
 *   is always the one stored. Requests that find an active claim, or an email
 *   sent less than 10 minutes ago, defer instead of sending again. Only the
 *   attempt that owns the claim can record the outcome, and only while the
 *   row is still pending, so a slow send finishing after an unsubscribe or a
 *   newer attempt changes nothing.
 * - Failed sends release the claim; the daily cron retries unsent rows (up to
 *   three attempts within 48 hours of the request), and the visitor can simply
 *   submit the form again.
 * - Confirming is serialised per workspace (advisory lock) so concurrent
 *   confirmations cannot exceed the plan's cap.
 * - Unsubscribing clears the confirm token, so an older confirmation email can
 *   never restore the subscription.
 *
 * Tokens: the confirm token is random and stored only as a sha256 hash. The
 * unsubscribe token is an HMAC of the row id under AUTH_SECRET: stable across
 * resends (every email, retries included, carries a valid link) and never
 * stored.
 */

export const CONFIRM_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
export const SEND_CLAIM_TTL_MS = 2 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 10 * 60 * 1000;
export const MAX_SEND_ATTEMPTS = 3;
export const RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;
export const PENDING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export const UNSUBSCRIBED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Tokens ─────────────────────────────────────────────────────────────────

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

function unsubscribeSecret(secret?: string): string {
  const value = secret ?? process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required for unsubscribe links");
  return value;
}

export function unsubscribeTokenFor(subscriberId: string, secret?: string): string {
  return createHmac("sha256", unsubscribeSecret(secret)).update(`unsub:v1:${subscriberId}`).digest("hex");
}

export function verifyUnsubscribeToken(subscriberId: string, token: unknown, secret?: string): boolean {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return false;
  const expected = Buffer.from(unsubscribeTokenFor(subscriberId, secret), "hex");
  return timingSafeEqual(expected, Buffer.from(token, "hex"));
}

export function consentTextFor(pageTitle: string): string {
  return `By subscribing you agree to receive emails from ${pageTitle}. Unsubscribe anytime.`;
}

// ─── Requesting ─────────────────────────────────────────────────────────────

/** What a sender needs to email one confirmation. */
export type SendClaim = {
  subscriberId: string;
  attemptId: string;
  rawConfirmToken: string;
  email: string;
  pageTitle: string;
  slug: string;
};

export type RequestOutcome =
  | { outcome: "sent"; claim: SendClaim }
  | { outcome: "deferred" | "already_confirmed" | "list_full" | "not_found" };

function claimFields(now: Date) {
  const rawConfirmToken = newToken();
  const attemptId = randomUUID();
  return {
    rawConfirmToken,
    attemptId,
    set: {
      confirmTokenHash: hashToken(rawConfirmToken),
      confirmTokenExpiresAt: new Date(now.getTime() + CONFIRM_TOKEN_TTL_MS),
      confirmSendAttemptId: attemptId,
      confirmSendClaimedAt: now,
      confirmEmailSentAt: null,
      updatedAt: now,
    },
  };
}

async function confirmedCount(executor: DbOrTx, workspaceId: string): Promise<number> {
  const [row] = await executor
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(subscribers)
    .where(and(eq(subscribers.workspaceId, workspaceId), eq(subscribers.status, "confirmed")));
  return row?.n ?? 0;
}

export function countConfirmed(db: Db, workspaceId: string): Promise<number> {
  return confirmedCount(db, workspaceId);
}

async function lockWorkspaceList(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`subscribers:${workspaceId}`}))`);
}

async function capReached(tx: Tx, workspaceId: string): Promise<boolean> {
  const plan = (await effectivePlan(tx, workspaceId)) as PlanId;
  return (await confirmedCount(tx, workspaceId)) >= getLimit(plan, "max_subscribers");
}

/**
 * Record a sign-up request and, when an email should go out, take the send
 * claim. All under the page row lock, which serialises requests per page.
 */
export async function requestSubscription(
  db: Db,
  { pageId, blockId, email, now = new Date() }: { pageId: string; blockId: string; email: string; now?: Date },
): Promise<RequestOutcome> {
  return db.transaction(async (tx): Promise<RequestOutcome> => {
    const page = await lockPage(tx, pageId);
    if (!page || !page.isPublished) return { outcome: "not_found" };

    const [block] = await tx
      .select({ id: blocks.id })
      .from(blocks)
      .where(
        and(
          eq(blocks.id, blockId),
          eq(blocks.pageId, pageId),
          eq(blocks.type, "email_capture"),
          eq(blocks.isVisible, true),
        ),
      )
      .limit(1);
    if (!block) return { outcome: "not_found" };

    const [{ title }] = await tx.select({ title: pages.title }).from(pages).where(eq(pages.id, pageId));
    const address = email.trim().toLowerCase();
    const canonical = canonicalizeEmail(address);

    const [existing] = await tx
      .select()
      .from(subscribers)
      .where(and(eq(subscribers.pageId, pageId), eq(subscribers.emailCanonical, canonical)))
      .for("update");

    if (existing?.status === "confirmed") return { outcome: "already_confirmed" };

    if (existing?.status === "pending") {
      const claimActive =
        !existing.confirmEmailSentAt &&
        existing.confirmSendClaimedAt &&
        now.getTime() - existing.confirmSendClaimedAt.getTime() < SEND_CLAIM_TTL_MS;
      const recentlySent =
        existing.confirmEmailSentAt &&
        now.getTime() - existing.confirmEmailSentAt.getTime() < RESEND_COOLDOWN_MS &&
        existing.confirmTokenExpiresAt &&
        existing.confirmTokenExpiresAt > now;
      if (claimActive || recentlySent) return { outcome: "deferred" };
    }

    if (await capReached(tx, page.workspaceId)) return { outcome: "list_full" };

    const claim = claimFields(now);
    const fresh = {
      email: address,
      sourceBlockId: block.id,
      consentText: consentTextFor(title),
      status: "pending",
      requestedAt: now,
      confirmEmailAttempts: 0,
      confirmedAt: null,
      unsubscribedAt: null,
      ...claim.set,
    };

    let subscriberId: string;
    if (existing) {
      await tx.update(subscribers).set(fresh).where(eq(subscribers.id, existing.id));
      subscriberId = existing.id;
    } else {
      const [row] = await tx
        .insert(subscribers)
        .values({ workspaceId: page.workspaceId, pageId, emailCanonical: canonical, createdAt: now, ...fresh })
        .returning({ id: subscribers.id });
      subscriberId = row.id;
    }

    return {
      outcome: "sent",
      claim: {
        subscriberId,
        attemptId: claim.attemptId,
        rawConfirmToken: claim.rawConfirmToken,
        email: address,
        pageTitle: title,
        slug: page.slug,
      },
    };
  });
}

/** Record a send's outcome, only for the attempt that owns the claim. */
export async function completeSend(
  db: Db,
  { subscriberId, attemptId, ok, now = new Date() }: { subscriberId: string; attemptId: string; ok: boolean; now?: Date },
): Promise<boolean> {
  const owns = and(
    eq(subscribers.id, subscriberId),
    eq(subscribers.confirmSendAttemptId, attemptId),
    eq(subscribers.status, "pending"),
  );
  const rows = ok
    ? await db
        .update(subscribers)
        .set({ confirmEmailSentAt: now, confirmSendClaimedAt: null, updatedAt: now })
        .where(owns)
        .returning({ id: subscribers.id })
    : await db
        .update(subscribers)
        .set({
          confirmEmailAttempts: sql`${subscribers.confirmEmailAttempts} + 1`,
          confirmSendClaimedAt: null,
          updatedAt: now,
        })
        .where(owns)
        .returning({ id: subscribers.id });
  return rows.length > 0;
}

/** Send one confirmation and record the outcome. Never throws. */
export async function deliverConfirmation(
  db: Db,
  claim: SendClaim,
  send: (claim: SendClaim) => Promise<void>,
  onError: (error: unknown) => void = (error) => console.error("[subscribe] send failed:", error),
): Promise<boolean> {
  try {
    await send(claim);
    await completeSend(db, { subscriberId: claim.subscriberId, attemptId: claim.attemptId, ok: true });
    return true;
  } catch (error) {
    onError(error);
    await completeSend(db, { subscriberId: claim.subscriberId, attemptId: claim.attemptId, ok: false }).catch(
      onError,
    );
    return false;
  }
}

// ─── Confirming and unsubscribing ───────────────────────────────────────────

export type ConfirmOutcome =
  | { outcome: "confirmed"; slug: string }
  | { outcome: "invalid" | "expired" | "list_full" };

export async function confirmSubscription(
  db: Db,
  rawToken: unknown,
  now: Date = new Date(),
): Promise<ConfirmOutcome> {
  if (typeof rawToken !== "string" || !/^[0-9a-f]{64}$/.test(rawToken)) return { outcome: "invalid" };
  const hash = hashToken(rawToken);

  return db.transaction(async (tx): Promise<ConfirmOutcome> => {
    const [row] = await tx
      .select({
        id: subscribers.id,
        workspaceId: subscribers.workspaceId,
        status: subscribers.status,
        expiresAt: subscribers.confirmTokenExpiresAt,
        slug: pages.slug,
      })
      .from(subscribers)
      .innerJoin(pages, eq(pages.id, subscribers.pageId))
      .where(eq(subscribers.confirmTokenHash, hash))
      .for("update", { of: subscribers });
    if (!row || row.status !== "pending") return { outcome: "invalid" };
    if (!row.expiresAt || row.expiresAt <= now) return { outcome: "expired" };

    await lockWorkspaceList(tx, row.workspaceId);
    if (await capReached(tx, row.workspaceId)) return { outcome: "list_full" };

    await tx
      .update(subscribers)
      .set({
        status: "confirmed",
        confirmedAt: now,
        confirmTokenHash: null,
        confirmTokenExpiresAt: null,
        confirmSendAttemptId: null,
        confirmSendClaimedAt: null,
        updatedAt: now,
      })
      .where(eq(subscribers.id, row.id));
    return { outcome: "confirmed", slug: row.slug };
  });
}

/** Idempotent. "invalid" only when the link was not issued by us. */
export async function unsubscribe(
  db: Db,
  { subscriberId, token, now = new Date(), secret }: { subscriberId: unknown; token: unknown; now?: Date; secret?: string },
): Promise<"ok" | "invalid"> {
  if (typeof subscriberId !== "string" || !/^[0-9a-f-]{36}$/i.test(subscriberId)) return "invalid";
  if (!verifyUnsubscribeToken(subscriberId, token, secret)) return "invalid";

  await db
    .update(subscribers)
    .set({
      status: "unsubscribed",
      unsubscribedAt: sql`COALESCE(${subscribers.unsubscribedAt}, ${now})`,
      confirmTokenHash: null,
      confirmTokenExpiresAt: null,
      confirmSendAttemptId: null,
      confirmSendClaimedAt: null,
      updatedAt: now,
    })
    .where(eq(subscribers.id, subscriberId));
  return "ok";
}

// ─── Cron ───────────────────────────────────────────────────────────────────

/**
 * Take a fresh claim on each pending row whose email never went out, within
 * the retry window and attempt limit. The caller sends them.
 */
export async function claimUnsentConfirmations(
  db: Db,
  { now = new Date(), limit = 100 }: { now?: Date; limit?: number } = {},
): Promise<SendClaim[]> {
  const eligible = (): SQL =>
    and(
      eq(subscribers.status, "pending"),
      isNull(subscribers.confirmEmailSentAt),
      or(
        isNull(subscribers.confirmSendClaimedAt),
        lt(subscribers.confirmSendClaimedAt, new Date(now.getTime() - SEND_CLAIM_TTL_MS)),
      ),
      lt(subscribers.confirmEmailAttempts, MAX_SEND_ATTEMPTS),
      sql`${subscribers.requestedAt} > ${new Date(now.getTime() - RETRY_WINDOW_MS)}`,
    )!;

  const candidates = await db
    .select({ id: subscribers.id })
    .from(subscribers)
    .where(eligible())
    .orderBy(asc(subscribers.requestedAt))
    .limit(limit);

  const claims: SendClaim[] = [];
  for (const { id } of candidates) {
    const claim = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: subscribers.id, email: subscribers.email, title: pages.title, slug: pages.slug })
        .from(subscribers)
        .innerJoin(pages, eq(pages.id, subscribers.pageId))
        .where(and(eq(subscribers.id, id), eligible()))
        .for("update", { of: subscribers });
      if (!row) return null; // claimed, sent or unsubscribed meanwhile
      const fields = claimFields(now);
      await tx.update(subscribers).set(fields.set).where(eq(subscribers.id, id));
      return {
        subscriberId: id,
        attemptId: fields.attemptId,
        rawConfirmToken: fields.rawConfirmToken,
        email: row.email,
        pageTitle: row.title,
        slug: row.slug,
      } satisfies SendClaim;
    });
    if (claim) claims.push(claim);
  }
  return claims;
}

export async function purgeStalePending(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db
    .delete(subscribers)
    .where(
      and(
        eq(subscribers.status, "pending"),
        lt(subscribers.requestedAt, new Date(now.getTime() - PENDING_RETENTION_MS)),
      ),
    )
    .returning({ id: subscribers.id });
  return rows.length;
}

export async function purgeUnsubscribed(db: Db, now: Date = new Date()): Promise<number> {
  const rows = await db
    .delete(subscribers)
    .where(
      and(
        eq(subscribers.status, "unsubscribed"),
        lt(subscribers.unsubscribedAt, new Date(now.getTime() - UNSUBSCRIBED_RETENTION_MS)),
      ),
    )
    .returning({ id: subscribers.id });
  return rows.length;
}

// ─── Owner views ────────────────────────────────────────────────────────────

export type SubscriberRow = {
  id: string;
  email: string;
  status: string;
  pageId: string;
  pageSlug: string;
  requestedAt: Date;
  confirmedAt: Date | null;
  unsubscribedAt: Date | null;
};

export function listSubscribers(
  db: Db,
  { workspaceId, pageId, status }: { workspaceId: string; pageId?: string; status?: string },
): Promise<SubscriberRow[]> {
  const conditions = [eq(subscribers.workspaceId, workspaceId)];
  if (pageId) conditions.push(eq(subscribers.pageId, pageId));
  if (status) conditions.push(eq(subscribers.status, status));
  return db
    .select({
      id: subscribers.id,
      email: subscribers.email,
      status: subscribers.status,
      pageId: subscribers.pageId,
      pageSlug: pages.slug,
      requestedAt: subscribers.requestedAt,
      confirmedAt: subscribers.confirmedAt,
      unsubscribedAt: subscribers.unsubscribedAt,
    })
    .from(subscribers)
    .innerJoin(pages, eq(pages.id, subscribers.pageId))
    .where(and(...conditions))
    .orderBy(desc(subscribers.requestedAt))
    .limit(10_000);
}

export async function deleteSubscriber(db: Db, { workspaceId, id }: { workspaceId: string; id: string }) {
  const rows = await db
    .delete(subscribers)
    .where(and(eq(subscribers.id, id), eq(subscribers.workspaceId, workspaceId)))
    .returning({ id: subscribers.id });
  return rows.length > 0;
}

/** RFC 4180 CSV. Cells that a spreadsheet would run as a formula are prefixed with '. */
export function toCsv(rows: SubscriberRow[]): string {
  const cell = (value: string) => {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  const lines = [
    ["email", "status", "page", "requested_at", "confirmed_at", "unsubscribed_at"].join(","),
    ...rows.map((r) =>
      [r.email, r.status, r.pageSlug, iso(r.requestedAt), iso(r.confirmedAt), iso(r.unsubscribedAt)]
        .map(cell)
        .join(","),
    ),
  ];
  return `${lines.join("\r\n")}\r\n`;
}
