/** One read-only production check. Pass an explicit Postgres URL as argv[2]. */
import { Client } from "pg";

async function main() {
  const connectionString = process.argv[2];
  if (!connectionString || process.argv.length !== 3) {
    throw new Error("Usage: node --import tsx scripts/check-features-slug.ts '<verified production Postgres URL>'");
  }
  const parsed = new URL(connectionString);
  if (!parsed.hostname || parsed.protocol !== "postgresql:") throw new Error("Expected a PostgreSQL connection URL.");
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query<{ occupied: boolean }>("SELECT EXISTS (SELECT 1 FROM pages WHERE slug = $1) AS occupied", ["features"]);
    await client.query("COMMIT");
    console.log(`Host: ${parsed.hostname}; features slug occupied: ${result.rows[0]?.occupied === true}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/g, "<redacted-url>") : "Slug check failed"); process.exitCode = 1; });
