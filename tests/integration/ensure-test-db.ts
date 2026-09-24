import { Client } from "pg";
import { requireTestDatabaseUrl } from "./test-db-guard";

// Runs before `drizzle-kit push`: refuses a non-disposable target, then empties
// every table so push never has to reason about existing rows.
async function main() {
  const client = new Client({ connectionString: requireTestDatabaseUrl() });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
    console.log(`[test-db] ready (${rows.length} tables truncated)`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
