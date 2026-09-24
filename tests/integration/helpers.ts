import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db/types";
import type { SafeBrowsingResult } from "@/lib/safe-browsing";
import { requireTestDatabaseUrl } from "./test-db-guard";

const { users, workspaces, workspaceMembers, pages, blocks } = schema;

/** A real Postgres pool: concurrent calls use separate connections. */
export function createTestDb(): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString: requireTestDatabaseUrl(), max: 8 });
  return { db: drizzle(pool, { schema }) as unknown as Db, pool };
}

/**
 * Open several connections up front. Without this, the second of two
 * "concurrent" transactions can spend its first milliseconds opening a new
 * connection while the first one commits, and a race test passes without the
 * two ever overlapping.
 */
export async function warmPool(pool: Pool, connections = 4): Promise<void> {
  const clients = await Promise.all(Array.from({ length: connections }, () => pool.connect()));
  for (const client of clients) client.release();
}

export async function truncateAll(db: Db): Promise<void> {
  const result = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const rows = (result as unknown as { rows: { tablename: string }[] }).rows;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
}

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function seedUser(
  db: Db,
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const [user] = await db
    .insert(users)
    .values({ email: `user-${uid()}@example.test`, ...overrides })
    .returning();
  return user;
}

/** A user who owns a workspace with one page. */
export async function seedOwnedPage(
  db: Db,
  {
    plan = "free",
    isPublished = false,
    links = [],
    user,
  }: {
    plan?: "free" | "pro";
    isPublished?: boolean;
    links?: string[];
    user?: typeof users.$inferSelect;
  } = {},
) {
  const owner = user ?? (await seedUser(db));
  const id = uid();
  const [workspace] = await db
    .insert(workspaces)
    .values({ name: `ws ${id}`, slug: `ws-${id}`, plan })
    .returning();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId: workspace.id, userId: owner.id, role: "owner" });
  const [page] = await db
    .insert(pages)
    .values({
      workspaceId: workspace.id,
      slug: `p-${id}`,
      title: `Page ${id}`,
      isPublished,
      publishedAt: isPublished ? new Date() : null,
      firstPublishedAt: isPublished ? new Date() : null,
    })
    .returning();
  for (const [position, url] of links.entries()) {
    await db
      .insert(blocks)
      .values({ pageId: page.id, type: "link", position, label: url, url });
  }
  return { user: owner, workspace, page };
}

/** A Safe Browsing stand-in that flags a fixed set of URLs. */
export function fakeCheckUrls(
  flagged: string[] = [],
  { timedOut = false }: { timedOut?: boolean } = {},
) {
  const calls: string[][] = [];
  const check = async (urls: string[]): Promise<SafeBrowsingResult> => {
    calls.push(urls);
    const hits = urls.filter((u) => flagged.includes(u));
    return { safe: hits.length === 0, flaggedUrls: hits, timedOut };
  };
  return Object.assign(check, { calls });
}

/** A promise you can resolve from outside, for interleaving two operations. */
export function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { open, opened };
}
