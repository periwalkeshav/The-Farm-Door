import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Brings the test database schema up to date once per test run. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://postgres@localhost:54329/farmdoor_test";
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool, casing: "snake_case" }), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
}
