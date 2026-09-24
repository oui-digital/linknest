import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * A Drizzle database handle for this schema, independent of the driver.
 *
 * The app uses neon-serverless; the integration tests use node-postgres
 * against a disposable Postgres. Core moderation and publishing helpers take
 * this type as an argument so both can call them.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The `tx` handed to a `db.transaction()` callback. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type DbOrTx = Db | Tx;
