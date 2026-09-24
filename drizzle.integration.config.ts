import { defineConfig } from "drizzle-kit";
import { requireTestDatabaseUrl } from "./tests/integration/test-db-guard";

// Integration tests only. Deliberately does NOT load .env.local and does NOT
// read DATABASE_URL: `drizzle-kit push` with the main config would target the
// app database. The guard throws when TEST_DATABASE_URL is missing or points
// at the app database.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: { url: requireTestDatabaseUrl() },
});
