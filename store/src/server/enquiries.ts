/**
 * Bulk and business order enquiries. Customers send requirements from
 * /bulk-orders; staff follow up by phone or email and track progress in
 * Admin > Enquiries. Quotes and invoices for these happen outside the shop.
 */
import { desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import type { DbOrTx } from "@/db";
import { enquiries } from "@/db/schema";
import { env } from "@/lib/env";
import { enquirySchema } from "@/lib/form-schemas";
import { logAudit } from "./audit";
import { sendEmail } from "./email/send";
import { enquiryAckEmail, enquiryOwnerEmail } from "./email/templates";
import { readSettings } from "./settings";

export const ENQUIRY_STATUS_LABELS = { NEW: "New", CONTACTED: "Contacted", CLOSED: "Closed" } as const;
export type EnquiryStatus = keyof typeof ENQUIRY_STATUS_LABELS;

/** Shared with the browser form; see src/lib/form-schemas.ts. */
export const enquiryInputSchema = enquirySchema;

export type EnquiryInput = z.input<typeof enquiryInputSchema>;

export async function createEnquiry(db: DbOrTx, input: z.output<typeof enquiryInputSchema>) {
  const [row] = await db.insert(enquiries).values(input).returning();
  const notifications = await readSettings(db, "notifications");
  if (notifications.ownerEmail) {
    await sendEmail(db, { to: notifications.ownerEmail, ...enquiryOwnerEmail(row, `${env().APP_URL}/admin/enquiries`), template: "enquiry-owner" });
  }
  await sendEmail(db, { to: row.email, ...enquiryAckEmail(row.name), template: "enquiry-ack" });
  return row;
}

export async function listEnquiries(db: DbOrTx, status: EnquiryStatus) {
  return db.select().from(enquiries).where(eq(enquiries.status, status)).orderBy(desc(enquiries.createdAt)).limit(200);
}

export async function enquiryCounts(db: DbOrTx) {
  const rows = await db.select({ status: enquiries.status, n: sql<number>`count(*)::int` }).from(enquiries).groupBy(enquiries.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<EnquiryStatus, number>>;
}

export async function updateEnquiry(db: DbOrTx, id: number, change: { status: EnquiryStatus; staffNote: string }, staffUserId: number) {
  const [row] = await db.update(enquiries).set({ status: change.status, staffNote: change.staffNote.slice(0, 2000) }).where(eq(enquiries.id, id)).returning({ id: enquiries.id });
  if (!row) return false;
  await logAudit(db, { staffUserId, action: "enquiry.update", entityType: "enquiry", entityId: id, data: { status: change.status } });
  return true;
}
