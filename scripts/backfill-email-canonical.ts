/**
 * Phase 4 — fill users.email_canonical for every existing user, using the
 * same canonicalizeEmail() the app uses. Run it right after `pnpm db:push`
 * and before relying on the one-account-per-mailbox rule: until a row has a
 * canonical value, it cannot be matched as a duplicate.
 *
 *   pnpm tsx scripts/backfill-email-canonical.ts           # dry run (default)
 *   pnpm tsx scripts/backfill-email-canonical.ts --apply   # write
 *
 * Targets DATABASE_URL from the environment, else from .env.local, and prints
 * the host first. Idempotent. `users.email` — the login identity — is never
 * changed.
 *
 * Collisions (several ESTABLISHED users sharing one canonical address) are
 * listed for review and left alone: the column is not unique, and existing
 * accounts are never merged or blocked by this rule. Rewriting identities or
 * merging accounts is a separate, deliberate migration.
 */
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { canonicalizeEmail } from "../src/lib/email-normalize";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const url = parse(readFileSync(".env.local"))["DATABASE_URL"];
    if (url) return url;
  } catch {}
  throw new Error("DATABASE_URL is not set (environment or .env.local).");
}

type Row = { id: string; email: string; email_canonical: string | null; established: boolean };

async function main() {
  const apply = process.argv.includes("--apply");
  const url = databaseUrl();
  const target = new URL(url);
  console.log(`Target: ${target.hostname}${target.pathname} (${apply ? "APPLY" : "dry run"})`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<Row>(
      `SELECT u.id, u.email, u.email_canonical,
              (u.email_verified IS NOT NULL
               OR EXISTS (SELECT 1 FROM accounts a WHERE a.user_id = u.id)) AS established
       FROM users u ORDER BY u.created_at, u.id`,
    );

    const changes = rows
      .map((r) => ({ ...r, canonical: canonicalizeEmail(r.email) }))
      .filter((r) => r.email_canonical !== r.canonical);
    const differs = changes.filter((r) => r.canonical !== r.email.trim().toLowerCase());

    console.log(`${rows.length} user(s); ${changes.length} need email_canonical set.`);
    console.log(`${differs.length} canonical value(s) differ from the stored address:`);
    for (const r of differs.slice(0, 50)) console.log(`  ${r.id}  ${r.email} → ${r.canonical}`);
    if (differs.length > 50) console.log(`  … ${differs.length - 50} more`);

    const byCanonical = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r.established) continue;
      const key = canonicalizeEmail(r.email);
      byCanonical.set(key, [...(byCanonical.get(key) ?? []), r]);
    }
    const collisions = [...byCanonical].filter(([, list]) => list.length > 1);
    console.log(`${collisions.length} collision(s) among established users (left as they are):`);
    for (const [canonical, list] of collisions) {
      console.log(`  ${canonical}: ${list.map((r) => `${r.email} (${r.id})`).join(", ")}`);
    }

    if (!apply) {
      console.log("Dry run: nothing written. Re-run with --apply.");
      return;
    }

    await client.query("BEGIN");
    for (const r of changes) {
      await client.query("UPDATE users SET email_canonical = $1 WHERE id = $2", [r.canonical, r.id]);
    }
    await client.query("COMMIT");
    console.log(`Updated ${changes.length} user(s).`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
