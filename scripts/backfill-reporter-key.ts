/**
 * Phase 3 — fill page_reports.reporter_key for reports filed before the
 * column existed, using the same abuseKeyForIp() the report route uses, so
 * historical IPv6 reports are grouped by /64 like new ones.
 *
 *   pnpm tsx scripts/backfill-reporter-key.ts           # dry run (default)
 *   pnpm tsx scripts/backfill-reporter-key.ts --apply   # write
 *
 * Targets DATABASE_URL from the environment, else from .env.local, and prints
 * the host first. Idempotent: only rows with a NULL key are touched.
 *
 * Existing duplicate reports need no cleanup: dedup is per review epoch and
 * counting is `count(distinct reporter_key)`, so duplicates collapse.
 * Historical reports keep review_epoch 0. For a page reinstated before this
 * deploy that means its older reports never count toward an automatic
 * takedown — the conservative choice, since only timestamps could place them.
 * Once this has run in production, a later deploy can mark reporter_key
 * NOT NULL (adding that constraint while NULLs exist makes drizzle-kit push
 * truncate the table).
 */
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
import { abuseKeyForIp } from "../src/lib/ip";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const url = parse(readFileSync(".env.local"))["DATABASE_URL"];
    if (url) return url;
  } catch {}
  throw new Error("DATABASE_URL is not set (environment or .env.local).");
}

async function main() {
  const apply = process.argv.includes("--apply");
  const url = databaseUrl();
  const target = new URL(url);
  console.log(`Target: ${target.hostname}${target.pathname} (${apply ? "APPLY" : "dry run"})`);

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ reporter_ip: string; n: string }>(
      `SELECT reporter_ip, count(*) AS n FROM page_reports
       WHERE reporter_key IS NULL GROUP BY reporter_ip ORDER BY reporter_ip`,
    );
    const keys = new Map<string, string>();
    for (const row of rows) keys.set(row.reporter_ip, abuseKeyForIp(row.reporter_ip));

    const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
    const distinctKeys = new Set(keys.values()).size;
    console.log(`${total} report(s) from ${rows.length} IP(s) → ${distinctKeys} reporter key(s)`);
    for (const row of rows.slice(0, 20)) {
      console.log(`  ${row.reporter_ip} → ${keys.get(row.reporter_ip)} (${row.n})`);
    }
    if (rows.length > 20) console.log(`  … ${rows.length - 20} more`);

    if (!apply) {
      console.log("Dry run: nothing written. Re-run with --apply.");
      return;
    }

    await client.query("BEGIN");
    let updated = 0;
    for (const [ip, key] of keys) {
      const res = await client.query(
        "UPDATE page_reports SET reporter_key = $1 WHERE reporter_ip = $2 AND reporter_key IS NULL",
        [key, ip],
      );
      updated += res.rowCount ?? 0;
    }
    await client.query("COMMIT");
    console.log(`Updated ${updated} report(s).`);
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
