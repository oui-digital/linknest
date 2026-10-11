import { eq, sql } from "drizzle-orm";
import { blocks, pages, workspaces } from "@/lib/db/schema";
import type { Db, Tx } from "@/lib/db/types";
import { getLimit, type PlanId } from "@/lib/entitlements";
import { effectivePlan } from "@/lib/queries";

export const PAGE_LIMIT_ERROR = "Page limit reached. Upgrade to Pro for more pages.";

type PageValues = typeof pages.$inferInsert;
type BlockValues = Omit<typeof blocks.$inferInsert, "pageId">;

/**
 * Insert a page into a workspace, enforcing the plan's page limit.
 *
 * The limit check and the insert happen with the workspace row locked, so two
 * concurrent creations (a new page and a duplicate, say) cannot both pass the
 * check at four of five pages and leave six. `/api/pages` used to count, then
 * insert, with nothing in between.
 *
 * Callable with an open transaction (`tx`) so a caller that must read other
 * rows under the same lock (duplicating a page) can; otherwise it opens one.
 */
export async function insertPageInWorkspace(
  db: Db,
  {
    workspaceId,
    values,
    blocks: blockRows = [],
    tx,
  }: {
    workspaceId: string;
    values: Omit<PageValues, "workspaceId">;
    blocks?: BlockValues[];
    tx?: Tx;
  },
): Promise<{ page: typeof pages.$inferSelect } | { error: string }> {
  const run = async (t: Tx) => {
    await lockWorkspace(t, workspaceId);
    const plan = (await effectivePlan(t, workspaceId)) as PlanId;
    const [count] = await t
      .select({ n: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(pages)
      .where(eq(pages.workspaceId, workspaceId));
    if ((count?.n ?? 0) >= getLimit(plan, "max_pages")) {
      return { error: PAGE_LIMIT_ERROR };
    }

    const [page] = await t.insert(pages).values({ ...values, workspaceId }).returning();
    if (blockRows.length > 0) {
      await t.insert(blocks).values(blockRows.map((row) => ({ ...row, pageId: page.id })));
    }
    return { page };
  };

  return tx ? run(tx) : db.transaction(run);
}

/** Serialises page creation per workspace for the rest of the transaction. */
export async function lockWorkspace(tx: Tx, workspaceId: string): Promise<void> {
  await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for("update");
}
