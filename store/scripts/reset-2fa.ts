/**
 * Turns off 2-step verification for one staff account, from the server, for
 * when the only owner has lost both their phone and their backup codes:
 *
 *   npm run staff:reset-2fa -- --email you@thefarmdoor.com
 *
 * It also cancels their backup codes, signs them out everywhere and lifts any
 * wrong-password lock. They set the authenticator up again at next sign-in.
 * Only someone with access to the server (and its DATABASE_URL) can run this.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staffUsers } from "@/db/schema";
import { normalizeEmail } from "@/lib/india";
import { logAudit } from "@/server/audit";
import { resetTwoFactor } from "@/server/staff-admin";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const raw = arg("email");
  if (!raw) {
    console.error("Usage: npm run staff:reset-2fa -- --email you@example.com");
    process.exit(1);
  }
  const db = getDb();
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, normalizeEmail(raw)));
  if (!staff) {
    console.error(`No staff account with the email ${raw}.`);
    process.exit(1);
  }
  await resetTwoFactor(db, staff.id, null);
  await db.update(staffUsers).set({ failedLogins: 0, lockedUntil: null }).where(eq(staffUsers.id, staff.id));
  await logAudit(db, { staffUserId: null, action: "staff.reset_2fa_cli", entityType: "staff", entityId: staff.id, data: { email: staff.email } });
  console.log(`\n2-step verification reset for ${staff.email}.`);
  console.log("Sign in at /admin/login with your password, scan the new QR code, then save the new backup codes.\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
