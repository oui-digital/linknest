import { readFileSync } from "node:fs";
import { parse } from "dotenv";

/**
 * The integration suite truncates every table. It must only ever touch a
 * disposable database, so the target comes from TEST_DATABASE_URL alone and is
 * refused when it points at the app's own database — including the pooled and
 * unpooled hostnames of the same Neon endpoint.
 */
export function requireTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. The integration suite needs a disposable " +
        "Postgres (e.g. `docker run -p 54329:5432 -e POSTGRES_PASSWORD=test postgres:17-alpine` " +
        "or a throwaway Neon branch). It is never skipped.",
    );
  }

  const appUrls = [process.env.DATABASE_URL, readEnvLocalDatabaseUrl()].filter(
    (u): u is string => Boolean(u),
  );
  for (const appUrl of appUrls) {
    if (sameDatabase(url, appUrl)) {
      throw new Error(
        "TEST_DATABASE_URL points at the same database as DATABASE_URL. " +
          "Refusing to run: the suite truncates every table.",
      );
    }
  }
  return url;
}

function readEnvLocalDatabaseUrl(): string | undefined {
  try {
    return parse(readFileSync(".env.local"))["DATABASE_URL"];
  } catch {
    return undefined;
  }
}

function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const host = (u: URL) => u.hostname.replace("-pooler.", ".");
    return host(ua) === host(ub) && ua.port === ub.port && ua.pathname === ub.pathname;
  } catch {
    return a === b;
  }
}
