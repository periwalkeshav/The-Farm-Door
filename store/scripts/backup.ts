/**
 * Saves a database backup to ./backups (gitignored):
 *
 *   npm run db:backup
 *
 * Uses DATABASE_URL from .env.local or the environment, and pg_dump from your
 * PATH (or Postgres.app). Restore with:
 *   pg_restore --no-owner --dbname "<empty database URL>" backups/<file>.dump
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";

function pgDump() {
  for (const candidate of [process.env.PG_DUMP, "pg_dump", "/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump", "/Applications/Postgres.app/Contents/Versions/18/bin/pg_dump"]) {
    if (!candidate) continue;
    if (spawnSync(candidate, ["--version"]).status === 0) return candidate;
  }
  throw new Error("pg_dump wasn't found. Install the PostgreSQL client tools or set PG_DUMP to its path.");
}

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  mkdirSync("backups", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const file = `backups/farmdoor-${stamp}.dump`;
  // Connection details go in through libpq's environment variables, so the password never shows up in the process list.
  const u = new URL(url);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    ...(u.searchParams.get("sslmode") ? { PGSSLMODE: u.searchParams.get("sslmode")! } : {}),
  };
  const r = spawnSync(pgDump(), ["--format=custom", "--no-owner", `--file=${file}`], { stdio: "inherit", env });
  if (r.status !== 0 || !existsSync(file) || statSync(file).size === 0) {
    if (existsSync(file)) unlinkSync(file);
    throw new Error("pg_dump failed");
  }
  console.log(`Saved ${file} (${(statSync(file).size / 1024 / 1024).toFixed(1)} MB). Store a copy somewhere safe, away from this computer.`);
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
