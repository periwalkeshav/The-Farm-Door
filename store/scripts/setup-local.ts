/**
 * One-time setup on a new computer, for testers and developers:
 *
 *   npm run setup
 *
 * 1. Writes .env.local (only if it doesn't exist yet) with simulated payments,
 *    courier and email, and freshly generated secrets.
 * 2. Creates the store's database and the unit-test database if they're missing.
 * 3. Applies migrations and loads the SAMPLE catalogue and owner account
 *    (sign-in details go to DEV_CREDENTIALS.md).
 *
 * Safe to run again: it keeps an existing .env.local and never deletes data.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Client } from "pg";

const ENV_FILE = ".env.local";
const DEFAULT_DATABASE_URL = "postgres://postgres@localhost:54329/farmdoor";
const DEFAULT_TEST_DATABASE_URL = "postgres://postgres@localhost:54329/farmdoor_test";

function writeEnvFile(databaseUrl: string) {
  const secret = (bytes: number, encoding: BufferEncoding) => randomBytes(bytes).toString(encoding);
  writeFileSync(
    ENV_FILE,
    `# Local test copy of The Farm Door. Written by "npm run setup"; never used on the live site.
# Every variable is explained in .env.example.

DATABASE_URL=${databaseUrl}
APP_URL=http://localhost:3000

# Generated for this computer only.
AUTH_SECRET=${secret(48, "base64url")}
ENCRYPTION_KEY=${secret(32, "base64")}
CRON_SECRET=${secret(24, "base64url")}

# Simulated payments, courier and email: no real money moves and no email is sent.
# Emails (including sign-in codes) appear in the terminal and in Admin > Email log.
PAYMENTS_PROVIDER=mock
SHIPPING_PROVIDER=mock
EMAIL_TRANSPORT=log

# Staff sign in with email and password only (no authenticator app). Local testing only.
STAFF_TWO_STEP=off
`,
  );
}

/** Creates the database named in the URL, on the same server, if it doesn't exist. */
async function ensureDatabase(url: string) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (exists.rowCount) return `Database "${name}" already exists.`;
    await client.query(`create database "${name.replace(/"/g, "")}"`);
    return `Created database "${name}".`;
  } finally {
    await client.end();
  }
}

async function countProducts(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return (await client.query<{ n: number }>("select count(*)::int as n from products")).rows[0].n;
  } finally {
    await client.end();
  }
}

function npm(...args: string[]) {
  // On Windows npm is a .cmd file, which Node only starts through a shell.
  const r = spawnSync("npm", args, { stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) throw new Error(`"npm ${args.join(" ")}" failed. See the messages above.`);
}

function cannotConnect(url: string, err: unknown): never {
  const { hostname, port } = new URL(url);
  console.error(`\nCouldn't connect to PostgreSQL at ${hostname}:${port || 5432}.`);
  console.error("Start the database first (see SETUP-FOR-TESTERS.md, step 3), then run npm run setup again.");
  console.error(`Details: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}

async function main() {
  if (existsSync(ENV_FILE)) {
    console.log(`Keeping your existing ${ENV_FILE}.`);
  } else {
    writeEnvFile(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
    console.log(`Wrote ${ENV_FILE} with simulated payments, courier and email, and new secrets.`);
  }
  const databaseUrl = /^DATABASE_URL=(.+)$/m.exec(readFileSync(ENV_FILE, "utf8"))?.[1].trim();
  if (!databaseUrl) throw new Error(`${ENV_FILE} has no DATABASE_URL line.`);
  if (!new URL(databaseUrl).hostname.includes("localhost")) throw new Error("DATABASE_URL must point at localhost: the sample data is only ever loaded into a local database.");

  try {
    console.log(await ensureDatabase(databaseUrl));
  } catch (err) {
    cannotConnect(databaseUrl, err);
  }
  const testUrl = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  try {
    console.log(await ensureDatabase(testUrl));
  } catch (err) {
    console.warn(`Skipped the unit-test database (${err instanceof Error ? err.message : err}). Only needed for "npm test".`);
  }

  npm("run", "db:migrate");
  if ((await countProducts(databaseUrl)) > 0) {
    console.log('Sample catalogue already loaded. To start again from scratch (deletes all test orders): npm run db:seed -- --reset');
  } else {
    npm("run", "db:seed");
  }
  console.log('\nSetup complete. Start the store with "npm run dev" and open http://localhost:3000');
  console.log("Admin sign-in details are in DEV_CREDENTIALS.md (admin: http://localhost:3000/admin).\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
