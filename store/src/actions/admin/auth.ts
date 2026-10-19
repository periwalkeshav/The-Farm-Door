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
import { beginTotpSetup, checkStaffPassword, checkStaffTotp, getStaff, readTotpSecret } from "@/server/auth/staff";
import { RateLimitError } from "@/server/rate-limit";
import { verifyTotp } from "@/lib/totp";

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
  // Always start with a partial session: the 2-step code (or its setup) is required next.
  const { token, expiresAt } = await createSession(db, "STAFF", result.staff.id, { mfaPending: true, ip, userAgent: await userAgent() });
  (await cookies()).set(cookieName("admin"), token, cookieOptions({ expires: expiresAt, sameSite: "strict" }));
  redirect(result.staff.totpEnabled ? "/admin/login/verify" : "/admin/setup-2fa");
}

async function finishSignIn(staffId: number) {
  const db = getDb();
  const jar = await cookies();
  const old = jar.get(cookieName("admin"))?.value ?? "";
  const fresh = await completeMfa(db, old, { ip: await clientIp(), userAgent: await userAgent() });
  if (!fresh) redirect("/admin/login");
  jar.set(cookieName("admin"), fresh.token, cookieOptions({ expires: fresh.expiresAt, sameSite: "strict" }));
  await db.update(staffUsers).set({ lastLoginAt: new Date() }).where(eq(staffUsers.id, staffId));
  await logAudit(db, { staffUserId: staffId, action: "staff.login", entityType: "staff", entityId: staffId, ip: await clientIp() });
  redirect("/admin");
}

export async function verifyTotpAction(_prev: AdminAuthState, formData: FormData): Promise<AdminAuthState> {
  const session = await getStaffSession();
  if (!session || !session.mfaPending) redirect("/admin/login");
  const db = getDb();
  const staff = await getStaff(db, session.id);
  if (!staff?.totpEnabled) redirect("/admin/setup-2fa");
  try {
    if (!(await checkStaffTotp(db, staff, String(formData.get("code") ?? ""), await clientIp()))) return { error: "That code isn't right. Codes change every 30 seconds." };
  } catch (err) {
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }
  await finishSignIn(staff.id);
  return null;
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
  if (!secret || !verifyTotp(secret, String(formData.get("code") ?? ""))) return { error: "That code didn't match. Check the time on your phone and try the current code." };
  await db.update(staffUsers).set({ totpEnabled: true }).where(eq(staffUsers.id, staff.id));
  await logAudit(db, { staffUserId: staff.id, action: "staff.2fa_enabled", entityType: "staff", entityId: staff.id });
  await finishSignIn(staff.id);
  return null;
}

export async function staffSignOutAction() {
  const jar = await cookies();
  const token = jar.get(cookieName("admin"))?.value;
  if (token) await deleteSessionByToken(getDb(), token);
  jar.delete(cookieName("admin"));
  redirect("/admin/login");
}
