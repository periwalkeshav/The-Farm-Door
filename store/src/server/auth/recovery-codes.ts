/**
 * One-time backup codes for staff 2-step verification, for when the phone
 * with the authenticator app is lost or broken. Ten codes are made at a time;
 * each works once. Only keyed hashes are stored, so a database copy can't be
 * used to sign in. Making new codes cancels the old ones.
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { randomInt } from "node:crypto";
import type { Database, DbOrTx } from "@/db";
import { staffRecoveryCodes } from "@/db/schema";
import { hmacHex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { enforceRateLimits } from "../rate-limit";

export const RECOVERY_CODE_COUNT = 10;
// No 0/O, 1/I/L, so codes are easy to read off paper.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Upper-cases and drops spaces and dashes, so "abcd-2345" and "ABCD 2345" both work. */
export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

function hashCode(staffId: number, code: string) {
  return hmacHex(env().AUTH_SECRET, `staff-recovery:${staffId}:${normalizeRecoveryCode(code)}`);
}

function newCode() {
  // randomInt picks each character evenly (a byte modulo 31 would favour the first few).
  const chars = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Replaces the staff member's codes with ten new ones and returns them (the only time they're visible). */
export async function createRecoveryCodes(db: Database, staffId: number): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(newCode());
  await db.transaction(async (tx) => {
    await tx.delete(staffRecoveryCodes).where(eq(staffRecoveryCodes.staffUserId, staffId));
    await tx.insert(staffRecoveryCodes).values([...codes].map((c) => ({ staffUserId: staffId, codeHash: hashCode(staffId, c) })));
  });
  return [...codes];
}

export async function recoveryCodesLeft(db: DbOrTx, staffId: number): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(staffRecoveryCodes).where(and(eq(staffRecoveryCodes.staffUserId, staffId), isNull(staffRecoveryCodes.usedAt)));
  return n;
}

/** Uses up one code. Returns the number left, or null if the code is wrong or already used. */
export async function redeemRecoveryCode(db: Database, staffId: number, code: string, ip: string): Promise<number | null> {
  await enforceRateLimits(db, [
    { key: `staff-totp:${staffId}`, limit: 10, windowSeconds: 900 },
    { key: `staff-totp:ip:${ip}`, limit: 30, windowSeconds: 900 },
  ]);
  const clean = normalizeRecoveryCode(code);
  if (!/^[A-Z0-9]{8}$/.test(clean)) return null;
  const [used] = await db
    .update(staffRecoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(staffRecoveryCodes.staffUserId, staffId), eq(staffRecoveryCodes.codeHash, hashCode(staffId, clean)), isNull(staffRecoveryCodes.usedAt)))
    .returning({ id: staffRecoveryCodes.id });
  if (!used) return null;
  return recoveryCodesLeft(db, staffId);
}

export async function deleteRecoveryCodes(db: DbOrTx, staffId: number) {
  await db.delete(staffRecoveryCodes).where(eq(staffRecoveryCodes.staffUserId, staffId));
}
