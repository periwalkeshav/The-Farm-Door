/** Staff account management (owner only), with guards against locking the store out. */
import { and, eq, ne, sql } from "drizzle-orm";
import { randomInt } from "node:crypto";
import type { Database } from "@/db";
import { staffUsers } from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/india";
import { logAudit } from "./audit";
import { deleteRecoveryCodes } from "./auth/recovery-codes";
import { deleteAllSessions } from "./auth/sessions";
import type { StaffRole } from "./permissions";

export class StaffAdminError extends Error {}

/** 16-character temporary password with upper, lower, digit and symbol; no look-alike characters. */
export function temporaryPassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "-_.!@#"];
  const all = sets.join("");
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 16) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function otherActiveOwners(db: Database, excludeId: number) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(staffUsers)
    .where(and(eq(staffUsers.role, "OWNER"), eq(staffUsers.isActive, true), ne(staffUsers.id, excludeId)));
  return n;
}

export async function createStaff(db: Database, input: { name: string; email: string; role: StaffRole }, byStaffId: number | null) {
  const email = normalizeEmail(input.email);
  const [exists] = await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, email));
  if (exists) throw new StaffAdminError("A staff account with that email already exists.");
  const password = temporaryPassword();
  const [staff] = await db
    .insert(staffUsers)
    .values({ email, name: input.name.trim(), role: input.role, passwordHash: await hashPassword(password) })
    .returning({ id: staffUsers.id });
  await logAudit(db, { staffUserId: byStaffId, action: "staff.create", entityType: "staff", entityId: staff.id, data: { email, role: input.role } });
  return { id: staff.id, password };
}

export async function changeRole(db: Database, staffId: number, role: StaffRole, byStaffId: number) {
  if (staffId === byStaffId) throw new StaffAdminError("You can't change your own role.");
  const [target] = await db.select().from(staffUsers).where(eq(staffUsers.id, staffId));
  if (!target) throw new StaffAdminError("Staff member not found.");
  if (target.role === "OWNER" && role !== "OWNER" && (await otherActiveOwners(db, staffId)) === 0) throw new StaffAdminError("The store needs at least one owner.");
  await db.update(staffUsers).set({ role }).where(eq(staffUsers.id, staffId));
  await deleteAllSessions(db, "STAFF", staffId);
  await logAudit(db, { staffUserId: byStaffId, action: "staff.role", entityType: "staff", entityId: staffId, data: { from: target.role, to: role } });
}

export async function setActive(db: Database, staffId: number, active: boolean, byStaffId: number) {
  if (staffId === byStaffId) throw new StaffAdminError("You can't deactivate your own account.");
  const [target] = await db.select().from(staffUsers).where(eq(staffUsers.id, staffId));
  if (!target) throw new StaffAdminError("Staff member not found.");
  if (!active && target.role === "OWNER" && (await otherActiveOwners(db, staffId)) === 0) throw new StaffAdminError("The store needs at least one active owner.");
  await db.update(staffUsers).set({ isActive: active }).where(eq(staffUsers.id, staffId));
  if (!active) await deleteAllSessions(db, "STAFF", staffId);
  await logAudit(db, { staffUserId: byStaffId, action: active ? "staff.activate" : "staff.deactivate", entityType: "staff", entityId: staffId });
}

export async function resetPassword(db: Database, staffId: number, byStaffId: number) {
  const password = temporaryPassword();
  await db.update(staffUsers).set({ passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null }).where(eq(staffUsers.id, staffId));
  await deleteAllSessions(db, "STAFF", staffId);
  await logAudit(db, { staffUserId: byStaffId, action: "staff.reset_password", entityType: "staff", entityId: staffId });
  return password;
}

/** Turns off 2-step verification (it's set up again at next sign-in) and cancels backup codes. byStaffId is null from the command line. */
export async function resetTwoFactor(db: Database, staffId: number, byStaffId: number | null) {
  await db.update(staffUsers).set({ totpEnabled: false, totpSecretEnc: null }).where(eq(staffUsers.id, staffId));
  await deleteRecoveryCodes(db, staffId);
  await deleteAllSessions(db, "STAFF", staffId);
  await logAudit(db, { staffUserId: byStaffId, action: "staff.reset_2fa", entityType: "staff", entityId: staffId });
}
