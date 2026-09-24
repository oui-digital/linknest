import { and, asc, eq, inArray } from "drizzle-orm";
import { pageModerationLog, pages, users, workspaceMembers } from "@/lib/db/schema";
import type { Db, DbOrTx, Tx } from "@/lib/db/types";
import {
  REINSTATE_ALL,
  activeHolds,
  type HoldReason,
  type ModerationEntry,
} from "@/lib/moderation";

/**
 * Takedowns and reinstatements. Every state change happens under the page row
 * lock (SELECT … FOR UPDATE), the same lock publishPageCore takes for its final
 * step, so a takedown and an in-flight publish are serialized: whichever
 * commits second sees the other's result. Before this, a takedown that landed
 * while publish was waiting on Safe Browsing was silently undone.
 *
 * Callers pass `revalidate`, which production wires to
 * revalidateTag(tag, { expire: 0 }) (src/lib/moderation-runtime.ts). "max"
 * would keep serving the cached page while it refreshes; a takedown has to
 * take effect on the very next request.
 */

export type ModerationDeps = { revalidate: (slug: string) => void };

export type PageRef = {
  id: string;
  slug: string;
  workspaceId: string;
  isPublished: boolean;
};

export async function loadModerationEntries(
  db: DbOrTx,
  pageId: string,
): Promise<ModerationEntry[]> {
  return db
    .select({
      seq: pageModerationLog.seq,
      action: pageModerationLog.action,
      source: pageModerationLog.source,
      reasonCode: pageModerationLog.reasonCode,
    })
    .from(pageModerationLog)
    .where(
      and(
        eq(pageModerationLog.pageId, pageId),
        inArray(pageModerationLog.action, ["unpublished", "reinstated"]),
      ),
    )
    .orderBy(asc(pageModerationLog.seq));
}

export async function lockPage(tx: Tx, pageId: string): Promise<PageRef | null> {
  const [page] = await tx
    .select({
      id: pages.id,
      slug: pages.slug,
      workspaceId: pages.workspaceId,
      isPublished: pages.isPublished,
    })
    .from(pages)
    .where(eq(pages.id, pageId))
    .for("update");
  return page ?? null;
}

export type TakedownEntry = {
  reasonCode: string;
  source: string;
  details?: string | null;
};

export type TakedownResult =
  | { found: false }
  | { found: true; changed: boolean; wasPublished: boolean; page: PageRef };

/**
 * Place a hold on a page and unpublish it.
 *
 * Idempotent per hold: if the page already has this hold, nothing is written
 * and `changed` is false, so concurrent reports or repeated admin calls never
 * produce duplicate takedown rows or duplicate owner emails. A draft can be
 * held too — the hold is what stops it being published later.
 *
 * `precondition` runs under the lock with the fresh moderation entries; the
 * report path uses it to recount reports inside the same transaction.
 */
export async function takedownPage(
  db: Db,
  pageId: string,
  entry: TakedownEntry,
  deps: ModerationDeps,
  opts: {
    precondition?: (
      tx: Tx,
      ctx: { page: PageRef; entries: ModerationEntry[] },
    ) => Promise<boolean>;
  } = {},
): Promise<TakedownResult> {
  const result = await db.transaction(async (tx) => applyTakedown(tx, pageId, entry, opts));
  if (result.found && result.changed) deps.revalidate(result.page.slug);
  return result;
}

/** The locked body of takedownPage, for callers that own the transaction. */
export async function applyTakedown(
  tx: Tx,
  pageId: string,
  entry: TakedownEntry,
  opts: {
    precondition?: (
      tx: Tx,
      ctx: { page: PageRef; entries: ModerationEntry[] },
    ) => Promise<boolean>;
  } = {},
): Promise<TakedownResult> {
  const page = await lockPage(tx, pageId);
  if (!page) return { found: false };

  const entries = await loadModerationEntries(tx, pageId);
  const unchanged = { found: true as const, changed: false, wasPublished: page.isPublished, page };
  if (activeHolds(entries).has(entry.reasonCode)) return unchanged;
  if (opts.precondition && !(await opts.precondition(tx, { page, entries }))) {
    return unchanged;
  }

  if (page.isPublished) {
    await tx
      .update(pages)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(eq(pages.id, pageId));
  }
  await tx.insert(pageModerationLog).values({
    pageId,
    action: "unpublished",
    reasonCode: entry.reasonCode,
    source: entry.source,
    details: entry.details ?? null,
  });

  return {
    found: true,
    changed: true,
    wasPublished: page.isPublished,
    page: { ...page, isPublished: false },
  };
}

export type ReinstateResult =
  | { found: false }
  | { found: true; changed: boolean; page: PageRef; remainingHolds: string[] };

/**
 * Clear one hold (or every hold with "all"). Never republishes: the owner
 * decides when to publish again, and publish re-runs every check.
 */
export async function reinstatePage(
  db: Db,
  pageId: string,
  {
    reasonCode,
    source,
    details,
  }: { reasonCode: HoldReason | typeof REINSTATE_ALL; source: string; details?: string | null },
): Promise<ReinstateResult> {
  return db.transaction(async (tx) => {
    const page = await lockPage(tx, pageId);
    if (!page) return { found: false as const };

    const holds = activeHolds(await loadModerationEntries(tx, pageId));
    const clears = reasonCode === REINSTATE_ALL ? holds.size > 0 : holds.has(reasonCode);
    if (!clears) {
      return { found: true as const, changed: false, page, remainingHolds: [...holds] };
    }

    await tx.insert(pageModerationLog).values({
      pageId,
      action: "reinstated",
      reasonCode,
      source,
      details: details ?? null,
    });
    if (reasonCode === REINSTATE_ALL) holds.clear();
    else holds.delete(reasonCode);
    return { found: true as const, changed: true, page, remainingHolds: [...holds] };
  });
}

/**
 * Pages in workspaces the user OWNS. Membership alone is not enough: a
 * suspended collaborator must not take down someone else's pages.
 */
export async function listOwnedPageIds(db: DbOrTx, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: pages.id })
    .from(pages)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, pages.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, "owner")));
  return rows.map((r) => r.id);
}

export async function takedownOwnedPages(
  db: Db,
  userId: string,
  entry: TakedownEntry,
  deps: ModerationDeps,
): Promise<{ slug: string; changed: boolean; wasPublished: boolean }[]> {
  const results = [];
  for (const pageId of await listOwnedPageIds(db, userId)) {
    const result = await takedownPage(db, pageId, entry, deps);
    if (result.found) {
      results.push({ slug: result.page.slug, changed: result.changed, wasPublished: result.wasPublished });
    }
  }
  return results;
}

/** Clears only the account_suspended hold; any other hold stays. */
export async function reinstateOwnedPages(
  db: Db,
  userId: string,
  { source, details }: { source: string; details?: string | null },
): Promise<{ slug: string; changed: boolean; remainingHolds: string[] }[]> {
  const results = [];
  for (const pageId of await listOwnedPageIds(db, userId)) {
    const result = await reinstatePage(db, pageId, {
      reasonCode: "account_suspended",
      source,
      details,
    });
    if (result.found) {
      results.push({ slug: result.page.slug, changed: result.changed, remainingHolds: result.remainingHolds });
    }
  }
  return results;
}

/** Owner email addresses for a workspace, for takedown notices. */
export async function workspaceOwnerEmails(db: DbOrTx, workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")));
  return rows.map((r) => r.email);
}
