/**
 * Refill reminders ("remind me to reorder"): a customer picks how often, and
 * gets an email with a one-click reorder link until they stop it.
 */
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { emailOptOuts, orders, refillReminders } from "@/db/schema";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendEmail } from "./email/send";
import { refillReminderEmail } from "./email/templates";
import { loadOrderItems, orderUrl, type OrderRow } from "./orders/common";

const DAY = 24 * 3600_000;
export const REFILL_INTERVALS = [
  { days: 14, label: "2 weeks" },
  { days: 30, label: "month" },
  { days: 45, label: "6 weeks" },
  { days: 60, label: "2 months" },
  { days: 90, label: "3 months" },
] as const;
const labelFor = (days: number) => REFILL_INTERVALS.find((i) => i.days === days)?.label ?? `${days} days`;

export class RefillError extends Error {}

export function refillStopUrl(id: number) {
  return `${env().APP_URL}/refill/stop?r=${id}&t=${hmacHex(env().AUTH_SECRET, `refill-stop:${id}`).slice(0, 32)}`;
}

export function checkRefillStopToken(id: number, token: string) {
  return safeEqual(hmacHex(env().AUTH_SECRET, `refill-stop:${id}`).slice(0, 32), token);
}

export async function refillFor(db: DbOrTx, orderId: number) {
  const [r] = await db.select().from(refillReminders).where(and(eq(refillReminders.orderId, orderId), isNull(refillReminders.cancelledAt)));
  return r ?? null;
}

export async function setRefillReminder(db: DbOrTx, order: OrderRow, intervalDays: number, now = new Date()) {
  if (!REFILL_INTERVALS.some((i) => i.days === intervalDays)) throw new RefillError("Choose how often to be reminded.");
  if (order.status !== "DELIVERED") throw new RefillError("You can set a reminder once the order has been delivered.");
  const nextRemindAt = new Date(now.getTime() + intervalDays * DAY);
  await db
    .insert(refillReminders)
    .values({ orderId: order.id, email: order.email, intervalDays, nextRemindAt })
    .onConflictDoUpdate({ target: refillReminders.orderId, set: { intervalDays, nextRemindAt, cancelledAt: null } });
  return { nextRemindAt, label: labelFor(intervalDays) };
}

export async function stopRefillReminder(db: DbOrTx, where: { id?: number; orderId?: number }) {
  const cond = where.id ? eq(refillReminders.id, where.id) : eq(refillReminders.orderId, where.orderId!);
  await db.update(refillReminders).set({ cancelledAt: new Date() }).where(and(cond, isNull(refillReminders.cancelledAt)));
}

/** Sends due reminders and schedules the next one. */
export async function sendRefillReminders(db: Database, now = new Date()) {
  const due = await db
    .select({ r: refillReminders, order: orders })
    .from(refillReminders)
    .innerJoin(orders, eq(orders.id, refillReminders.orderId))
    .where(and(isNull(refillReminders.cancelledAt), lte(refillReminders.nextRemindAt, now), sql`not exists (select 1 from ${emailOptOuts} where ${emailOptOuts.email} = ${refillReminders.email})`))
    .orderBy(asc(refillReminders.nextRemindAt))
    .limit(100);
  let sent = 0;
  for (const { r, order } of due) {
    const [claimed] = await db
      .update(refillReminders)
      .set({ lastSentAt: now, nextRemindAt: new Date(now.getTime() + r.intervalDays * DAY) })
      .where(and(eq(refillReminders.id, r.id), lte(refillReminders.nextRemindAt, now)))
      .returning({ id: refillReminders.id });
    if (!claimed) continue;
    const items = await loadOrderItems(db, order.id);
    await sendEmail(db, { to: r.email, ...refillReminderEmail(order.shipName, items, orderUrl(order), refillStopUrl(r.id), labelFor(r.intervalDays)), template: "refill-reminder", orderId: order.id });
    sent++;
  }
  return sent;
}
