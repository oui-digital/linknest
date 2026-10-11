import { and, eq, gt, sql } from "drizzle-orm";
import { blocks } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/types";

/**
 * Position writes for a page's blocks. Both run inside the `write` step of
 * applyLiveEdit, i.e. with the page row locked, so an insert that shifts
 * positions and a reorder that rewrites them can never interleave.
 *
 * Before this, reorderBlocks validated its permutation outside any lock and
 * wrote positions in its own transaction: a reorder could validate against the
 * old list, lose the race to an insert, and overwrite the shifted positions
 * with duplicates.
 */

export const ORDER_OUT_OF_DATE_ERROR = "Block order is out of date. Refresh and try again.";
export const BLOCK_NOT_FOUND_ERROR = "Block not found";

/**
 * Where a new block goes: `undefined` appends, `null` inserts at the top, an
 * id inserts right after that block. Blocks after the slot move down by one.
 * The (page_id, position) index is not unique, so one UPDATE is safe.
 */
export async function resolveInsertPosition(
  tx: Tx,
  pageId: string,
  afterBlockId: string | null | undefined,
): Promise<number | { error: string }> {
  if (afterBlockId === undefined) {
    const [row] = await tx
      .select({ max: sql<number>`COALESCE(MAX(${blocks.position}), -1)`.mapWith(Number) })
      .from(blocks)
      .where(eq(blocks.pageId, pageId));
    return (row?.max ?? -1) + 1;
  }

  let after = -1;
  if (afterBlockId !== null) {
    const [anchor] = await tx
      .select({ position: blocks.position })
      .from(blocks)
      .where(and(eq(blocks.id, afterBlockId), eq(blocks.pageId, pageId)))
      .limit(1);
    if (!anchor) return { error: BLOCK_NOT_FOUND_ERROR };
    after = anchor.position;
  }

  await tx
    .update(blocks)
    .set({ position: sql`${blocks.position} + 1`, updatedAt: new Date() })
    .where(and(eq(blocks.pageId, pageId), gt(blocks.position, after)));

  return after + 1;
}

/**
 * Write `blockIds` as the page's order. The list must be an exact permutation
 * of the page's blocks, checked under the lock: a duplicated id would collapse
 * two blocks onto one position and a short list would leave stale positions
 * behind, making ORDER BY position non-deterministic.
 */
export async function reorderBlocksWrite(
  tx: Tx,
  pageId: string,
  blockIds: string[],
): Promise<{ ok: true } | { error: string }> {
  const owned = await tx.select({ id: blocks.id }).from(blocks).where(eq(blocks.pageId, pageId));
  const ownedIds = new Set(owned.map((b) => b.id));
  const uniqueIncoming = new Set(blockIds);
  if (
    uniqueIncoming.size !== blockIds.length ||
    blockIds.length !== ownedIds.size ||
    blockIds.some((id) => !ownedIds.has(id))
  ) {
    return { error: ORDER_OUT_OF_DATE_ERROR };
  }

  const now = new Date();
  for (const [index, id] of blockIds.entries()) {
    await tx
      .update(blocks)
      .set({ position: index, updatedAt: now })
      .where(and(eq(blocks.id, id), eq(blocks.pageId, pageId)));
  }
  return { ok: true };
}
