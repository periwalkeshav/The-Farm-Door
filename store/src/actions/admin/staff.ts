"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { staffUsers } from "@/db/schema";
import { requireStaffAction } from "@/data/session";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { changePasswordSchema, createStaffSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { changeRole, createStaff, resetPassword, resetTwoFactor, setActive, StaffAdminError } from "@/server/staff-admin";

export type StaffResult = { ok: boolean; message: string; secret?: string; fieldErrors?: FieldErrors } | null;
const ROLE = z.enum(["OWNER", "MANAGER", "PACKER", "ACCOUNTANT"]);

async function guarded(fn: () => Promise<StaffResult>): Promise<StaffResult> {
  try {
    const r = await fn();
    refresh();
    return r;
  } catch (err) {
    if (err instanceof StaffAdminError) return { ok: false, message: err.message, fieldErrors: /already exists/.test(err.message) ? { email: err.message } : undefined };
    throw err;
  }
}

export async function createStaffAction(_prev: StaffResult, formData: FormData): Promise<StaffResult> {
  const me = await requireStaffAction("staff.manage");
  const parsed = createStaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  return guarded(async () => {
    const r = await createStaff(getDb(), parsed.data, me.id);
    return { ok: true, message: `Account created for ${parsed.data.email}. Share this temporary password with them privately; they'll set up 2-step verification at first sign-in and should then change it.`, secret: r.password };
  });
}

export async function changeRoleAction(staffId: number, role: string): Promise<StaffResult> {
  const me = await requireStaffAction("staff.manage");
  const parsed = ROLE.safeParse(role);
  if (!parsed.success) return { ok: false, message: "Unknown role." };
  return guarded(async () => {
    await changeRole(getDb(), staffId, parsed.data, me.id);
    return { ok: true, message: "Role changed. They'll need to sign in again." };
  });
}

export async function setActiveAction(staffId: number, active: boolean): Promise<StaffResult> {
  const me = await requireStaffAction("staff.manage");
  return guarded(async () => {
    await setActive(getDb(), staffId, active, me.id);
    return { ok: true, message: active ? "Account re-activated." : "Account deactivated and signed out." };
  });
}

export async function resetPasswordAction(staffId: number): Promise<StaffResult> {
  const me = await requireStaffAction("staff.manage");
  return guarded(async () => {
    const password = await resetPassword(getDb(), staffId, me.id);
    return { ok: true, message: "New temporary password (shown once). Share it privately.", secret: password };
  });
}

export async function resetTwoFactorAction(staffId: number): Promise<StaffResult> {
  const me = await requireStaffAction("staff.manage");
  return guarded(async () => {
    await resetTwoFactor(getDb(), staffId, me.id);
    return { ok: true, message: "2-step verification reset. They'll set it up again at their next sign-in." };
  });
}

export async function changeMyPasswordAction(_prev: StaffResult, formData: FormData): Promise<StaffResult> {
  const me = await requireStaffAction();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const { current, next } = parsed.data;
  const db = getDb();
  const [row] = await db.select().from(staffUsers).where(eq(staffUsers.id, me.id));
  if (!row || !(await verifyPassword(current, row.passwordHash))) return { ok: false, message: "Your current password isn't right.", fieldErrors: { current: "Your current password isn't right." } };
  await db.update(staffUsers).set({ passwordHash: await hashPassword(next) }).where(eq(staffUsers.id, me.id));
  await logAudit(db, { staffUserId: me.id, action: "staff.change_password", entityType: "staff", entityId: me.id });
  return { ok: true, message: "Password changed." };
}
