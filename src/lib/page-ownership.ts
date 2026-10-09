import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages } from "@/lib/db/schema";
import { getUserWorkspace } from "@/lib/queries";

/**
 * The page and its workspace when `userId` owns `pageId`, else null.
 *
 * The workspace comes back with its effective plan already resolved (comped
 * overrides applied by getUserWorkspace), so callers can gate on it directly.
 */
export async function verifyPageOwnership(pageId: string, userId: string) {
  const workspace = await getUserWorkspace(userId);
  if (!workspace) return null;

  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspaceId, workspace.id)))
    .limit(1);

  if (!page) return null;
  return { page, workspace };
}
