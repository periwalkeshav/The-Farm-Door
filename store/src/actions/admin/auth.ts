"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { staffUsers } from "@/db/schema";
import { cookieName, cookieOptions } from "@/data/cookies";
import { clientIp, userAgent } from "@/data/request";
import { getStaffSession } from "@/data/session";
import { logAudit } from "@/server/audit";
import { completeMfa, createSession, deleteSessionByToken } from "@/server/auth/sessions";
import { beginTotpSetup, checkStaffPassword, checkStaffTotp, getStaff, markTotpUsed, readTotpSecret } from "@/server/auth/staff";
import { createRecoveryCodes, redeemRecoveryCode } from "@/server/auth/recovery-codes";
import { sendEmail } from "@/server/email/send";
import { backupCodeUsedEmail } from "@/server/email/templates";
import { RateLimitError } from "@/server/rate-limit";
import { env, staffTwoStepRequired } from "@/lib/env";
import { totpStep } from "@/lib/totp";

export type AdminAuthState = { error: string } | null;

export async function staffLoginAction(_prev: AdminAuthState, formData: FormData): Promise<AdminAuthState> {
  const db = getDb();
  const ip = await clientIp();
  let result;
  try {
    result = await checkStaffPassword(db, String(formData.get("email") ?? ""), String(formData.get("password") ?? ""), ip);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }
  if (!result.ok) return { error: result.reason };
  const twoStep = staffTwoStepRequired();
  // Normally a partial session: the 2-step code (or its setup) is required next.
  // With STAFF_TWO_STEP=off (development/demos only), the password alone signs in.
  const { token, expiresAt } = await createSession(db, "STAFF", result.staff.id, { mfaPending: twoStep, ip, userAgent: await userAgent() });
  (await cookies()).set(cookieName("admin"), token, cookieOptions({ expires: expiresAt, sameSite: "strict" }));
  if (!twoStep) {
    await db.update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, result.staff.id));
    await logAudit(db, { staffUserId: result.staff.id, action: "staff.login", entityType: "staff", entityId: result.staff.id, data: { twoStep: "off" }, ip });
    redirect("/admin");
  }
  redirect(result.staff.totpEnabled ? "/admin/login/verify" : "/admin/setup-2fa");
}

async function finishSignIn(staffId: number, next = "/admin") {
  const db = getDb();
  const jar = await cookies();
  const old = jar.get(cookieName("admin"))?.value ?? "";
  const fresh = await completeMfa(db, old, { ip: await clientIp(), userAgent: await userAgent() });
  if (!fresh) redirect("/admin/login");
  jar.set(cookieName("admin"), fresh.token, cookieOptions({ expires: fresh.expiresAt, sameSite: "strict" }));
  await db.update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, staffId));
  await logAudit(db, { staffUserId: staffId, action: "staff.login", entityType: "staff", entityId: staffId, ip: await clientIp() });
  redirect(next);
}

export async function verifyTotpAction(_prev: AdminAuthState, formData: FormData): Promise<AdminAuthState> {
  const session = await getStaffSession();
  if (!session || !session.mfaPending) redirect("/admin/login");
  const db = getDb();
  const staff = await getStaff(db, session.id);
  if (!staff?.totpEnabled) redirect("/admin/setup-2fa");
  try {
    if (!(await checkStaffTotp(db, staff, String(formData.get("code") ?? ""), await clientIp(), { signIn: true })))
      return { error: "That code isn't right, or it was just used. Wait for the next code (they change every 30 seconds)." };
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }
  await finishSignIn(staff.id);
  return null;
}

/** Sign-in with a one-time backup code instead of the authenticator app. The staff member is emailed. */
export async function verifyBackupCodeAction(_prev: AdminAuthState, formData: FormData): Promise<AdminAuthState> {
  const session = await getStaffSession();
  if (!session || !session.mfaPending) redirect("/admin/login");
  const db = getDb();
  const staff = await getStaff(db, session.id);
  if (!staff?.totpEnabled) redirect("/admin/setup-2fa");
  const ip = await clientIp();
  let remaining: number | null;
  try {
    remaining = await redeemRecoveryCode(db, staff.id, String(formData.get("code") ?? ""), ip);
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }
  if (remaining === null) return { error: "That backup code isn't right, or it has already been used." };
  await logAudit(db, { staffUserId: staff.id, action: "staff.backup_code_used", entityType: "staff", entityId: staff.id, data: { remaining }, ip });
  await sendEmail(db, { to: staff.email, ...backupCodeUsedEmail(staff.name, remaining, `${env().APP_URL}/admin/account`), template: "staff-backup-code-used" });
  await finishSignIn(staff.id, "/admin/account?backup=used");
  return null;
}

export type BackupCodesState = { error?: string; codes?: string[] } | null;

/** Makes ten new backup codes (cancelling old ones). Needs the current authenticator code. */
export async function createBackupCodesAction(_prev: BackupCodesState, formData: FormData): Promise<BackupCodesState> {
  const session = await getStaffSession();
  if (!session || session.mfaPending || !session.totpEnabled) redirect("/admin/login");
  const db = getDb();
  const staff = await getStaff(db, session.id);
  if (!staff) redirect("/admin/login");
  try {
    if (!(await checkStaffTotp(db, staff, String(formData.get("code") ?? ""), await clientIp()))) return { error: "That code isn't right. Enter the current code from your authenticator app." };
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }
  const codes = await createRecoveryCodes(db, staff.id);
  await logAudit(db, { staffUserId: staff.id, action: "staff.backup_codes_created", entityType: "staff", entityId: staff.id });
  return { codes };
}

export async function startTotpSetupAction() {
  const session = await getStaffSession();
  if (!session) redirect("/admin/login");
  const db = getDb();
  const staff = await getStaff(db, session.id);
  if (!staff || staff.totpEnabled) redirect("/admin");
  await beginTotpSetup(db, staff.id);
  redirect("/admin/setup-2fa");
}

export async function confirmTotpSetupAction(_prev: AdminAuthState, formData: FormData): Promise<AdminAuthState> {
  const session = await getStaffSession();
  if (!session) redirect("/admin/login");
  const db = getDb();
  const staff = await getStaff(db, session.id);
  if (!staff) redirect("/admin/login");
  if (staff.totpEnabled) redirect("/admin");
  const secret = readTotpSecret(staff);
  const step = secret ? totpStep(secret, String(formData.get("code") ?? "")) : null;
  if (step === null) return { error: "That code didn't match. Check the time on your phone and try the current code." };
  await markTotpUsed(db, staff.id, step);
  await db.update(staffUsers).set({ totpEnabled: true }).where(eq(staffUsers.id, staff.id));
  await logAudit(db, { staffUserId: staff.id, action: "staff.2fa_enabled", entityType: "staff", entityId: staff.id });
  // Straight on to backup codes, so a lost phone never locks anyone out.
  await finishSignIn(staff.id, "/admin/account/backup-codes?setup=1");
  return null;
}

export async function staffSignOutAction() {
  const jar = await cookies();
  const token = jar.get(cookieName("admin"))?.value;
  if (token) await deleteSessionByToken(getDb(), token);
  jar.delete(cookieName("admin"));
  redirect("/admin/login");
}
