/**
 * Prepares the database used by the automated browser tests (npm run test:e2e):
 * creates it if needed, wipes it, applies migrations and loads the sample
 * catalogue. Refuses to touch any database whose name doesn't end in "_e2e".
 */
import { execFileSync } from "node:child_process";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const target = new URL(url);
  const name = target.pathname.slice(1);
  if (!name.endsWith("_e2e")) throw new Error(`Refusing to reset "${name}": the browser-test database name must end in _e2e.`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const server = new Client({ connectionString: admin.toString() });
  await server.connect();
  const exists = await server.query("select 1 from pg_database where datname = $1", [name]);
  if (!exists.rowCount) await server.query(`create database "${name.replace(/"/g, "")}"`);
  await server.end();

  const db = new Client({ connectionString: url });
  await db.connect();
  await db.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await db.end();

  const env = { ...process.env, SEED_SKIP_CREDENTIALS: "1" };
  // On Windows npx is a .cmd file, which Node only starts through a shell.
  const shell = process.platform === "win32";
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], { stdio: "inherit", env, shell });
  execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/seed.ts"], { stdio: "inherit", env, shell });
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
