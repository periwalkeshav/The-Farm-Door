import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db";
import { customers, staffUsers } from "@/db/schema";
import { validateSession } from "@/server/auth/sessions";
import { can, type Permission } from "@/server/permissions";
import { cookieName } from "./cookies";

export type CurrentCustomer = { id: number; email: string; name: string; phone: string };

/** The signed-in customer for this request, or null. Deduplicated per request. */
export const getCustomer = cache(async (): Promise<CurrentCustomer | null> => {
  const token = (await cookies()).get(cookieName("session"))?.value;
  if (!token) return null;
  // Session checks compare against the current time, so they must run per request.
  await connection();
  const db = getDb();
  const session = await validateSession(db, token, "CUSTOMER");
  if (!session) return null;
  const [c] = await db
    .select({ id: customers.id, email: customers.email, name: customers.name, phone: customers.phone })
    .from(customers)
    .where(eq(customers.id, session.subjectId));
  return c ?? null;
});

export async function requireCustomer(next = "/account"): Promise<CurrentCustomer> {
  const customer = await getCustomer();
  if (!customer) redirect(`/login?next=${encodeURIComponent(next)}`);
  return customer;
}

export type CurrentStaff = {
  id: number;
  email: string;
  name: string;
  role: "OWNER" | "MANAGER" | "PACKER" | "ACCOUNTANT";
  totpEnabled: boolean;
  mfaPending: boolean;
};

export const getStaffSession = cache(async (): Promise<CurrentStaff | null> => {
  const token = (await cookies()).get(cookieName("admin"))?.value;
  if (!token) return null;
  await connection();
  const db = getDb();
  const session = await validateSession(db, token, "STAFF");
  if (!session) return null;
  const [s] = await db.select().from(staffUsers).where(eq(staffUsers.id, session.subjectId));
  if (!s || !s.isActive) return null;
  return { id: s.id, email: s.email, name: s.name, role: s.role, totpEnabled: s.totpEnabled, mfaPending: session.mfaPending };
});

export class PermissionError extends Error {
  constructor() {
    super("You don't have permission to do that.");
  }
}

/**
 * Admin guard for pages: fully signed in (password + 2-step code) and, if
 * given, holding the permission. Redirects otherwise.
 */
export async function requireStaff(permission?: Permission): Promise<CurrentStaff> {
  const staff = await getStaffSession();
  if (!staff) redirect("/admin/login");
  if (!staff.totpEnabled) redirect("/admin/setup-2fa");
  if (staff.mfaPending) redirect("/admin/login/verify");
  if (permission && !can(staff.role, permission)) redirect("/admin/no-access");
  return staff;
}

/** Admin guard for server actions: throws instead of redirecting when permission is missing. */
export async function requireStaffAction(permission?: Permission): Promise<CurrentStaff> {
  const staff = await getStaffSession();
  if (!staff || !staff.totpEnabled || staff.mfaPending) redirect("/admin/login");
  if (permission && !can(staff.role, permission)) throw new PermissionError();
  return staff;
}
