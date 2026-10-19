import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
/** A transaction handle; same query API as `db`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { __farmdoorPool?: Pool; __farmdoorDb?: Database };

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
}

export function getDb(): Database {
  if (!globalForDb.__farmdoorDb) {
    globalForDb.__farmdoorPool ??= createPool();
    globalForDb.__farmdoorDb = drizzle({ client: globalForDb.__farmdoorPool, schema, casing: "snake_case" });
  }
  return globalForDb.__farmdoorDb;
}

export { schema };
