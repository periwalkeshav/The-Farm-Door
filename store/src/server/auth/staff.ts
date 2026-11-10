/**
 * Staff (admin) sign-in: password + authenticator-app code (2-step verification
 * is mandatory). Accounts lock for 15 minutes after 5 wrong passwords.
 */
import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { staffUsers } from "@/db/schema";
import { decrypt, encrypt, hashPassword, verifyPassword } from "@/lib/crypto";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/india";
import { generateTotpSecret, totpStep } from "@/lib/totp";
import { enforceRateLimits } from "../rate-limit";

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

// Used when the email doesn't exist, so response time doesn't reveal valid accounts.
let dummyHash: Promise<string> | undefined;

export type StaffUser = typeof staffUsers.$inferSelect;

export type PasswordResult =
  | { ok: true; staff: StaffUser }
  | { ok: false; reason: string };

export async function checkStaffPassword(db: Database, rawEmail: string, password: string, ip: string): Promise<PasswordResult> {
  const email = normalizeEmail(rawEmail);
  await enforceRateLimits(db, [
    { key: `staff-login:ip:${ip}`, limit: 20, windowSeconds: 900 },
    { key: `staff-login:email:${email}`, limit: 10, windowSeconds: 900 },
  ]);
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.email, email));
  const generic = { ok: false as const, reason: "Email or password is incorrect." };
  if (!staff) {
    dummyHash ??= hashPassword("not-a-real-password-Aa1!");
    await verifyPassword(password, await dummyHash);
    return generic;
  }
  if (!staff.isActive) return { ok: false, reason: "This account has been deactivated." };
  if (staff.lockedUntil && staff.lockedUntil.getTime() > Date.now()) {
    return { ok: false, reason: "Too many wrong attempts. This account is locked for 15 minutes." };
  }
  const valid = await verifyPassword(password, staff.passwordHash);
  if (!valid) {
    const failed = staff.failedLogins + 1;
    await db
      .update(staffUsers)
      .set({ failedLogins: failed >= LOCK_AFTER ? 0 : failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null })
      .where(eq(staffUsers.id, staff.id));
    return generic;
  }
  await db.update(staffUsers).set({ failedLogins: 0, lockedUntil: null }).where(eq(staffUsers.id, staff.id));
  return { ok: true, staff };
}

/**
 * Checks an authenticator code. For signing in (`signIn`), each code works
 * once: a code seen over someone's shoulder can't be used again while it's
 * still current (RFC 6238 §5.2).
 */
export async function checkStaffTotp(db: Database, staff: StaffUser, code: string, ip: string, { signIn = false } = {}): Promise<boolean> {
  await enforceRateLimits(db, [{ key: `staff-totp:${staff.id}`, limit: 10, windowSeconds: 900 }, { key: `staff-totp:ip:${ip}`, limit: 30, windowSeconds: 900 }]);
  if (!staff.totpSecretEnc) return false;
  const step = totpStep(decrypt(staff.totpSecretEnc, env().ENCRYPTION_KEY), code);
  if (step === null) return false;
  if (!signIn) return true;
  return markTotpUsed(db, staff.id, step);
}

/** Records the step of a code used to sign in; false if that code (or a later one) was already used. */
export async function markTotpUsed(db: DbOrTx, staffId: number, step: number): Promise<boolean> {
  const [row] = await db
    .update(staffUsers)
    .set({ totpLastStep: step })
    .where(and(eq(staffUsers.id, staffId), or(isNull(staffUsers.totpLastStep), lt(staffUsers.totpLastStep, step))))
    .returning({ id: staffUsers.id });
  return !!row;
}

/** Starts authenticator setup: stores a new (not yet enabled) secret and returns it for the QR code. */
export async function beginTotpSetup(db: DbOrTx, staffId: number): Promise<string> {
  const secret = generateTotpSecret();
  await db.update(staffUsers).set({ totpSecretEnc: encrypt(secret, env().ENCRYPTION_KEY), totpEnabled: false }).where(eq(staffUsers.id, staffId));
  return secret;
}

export function readTotpSecret(staff: StaffUser): string | null {
  return staff.totpSecretEnc ? decrypt(staff.totpSecretEnc, env().ENCRYPTION_KEY) : null;
}

export async function getStaff(db: DbOrTx, id: number): Promise<StaffUser | null> {
  const [staff] = await db.select().from(staffUsers).where(eq(staffUsers.id, id));
  return staff ?? null;
}
