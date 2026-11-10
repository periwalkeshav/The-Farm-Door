/**
 * Customer reminders and email opt-outs.
 *
 * One reminder goes out when someone placed an online-payment order but never
 * paid (the order expired). It is skipped if they ordered again afterwards, got
 * a reminder in the last week, or opted out. Order and delivery emails are
 * never affected by an opt-out.
 */
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { customers, emailOptOuts, newsletterSubscribers, orderItems, orders, reviews } from "@/db/schema";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { normalizeEmail } from "@/lib/india";
import { sendEmail } from "./email/send";
import { reviewRequestEmail, unpaidReminderEmail } from "./email/templates";
import { emailOrder, orderUrl } from "./orders/common";
import { PAYMENT_TIMEOUT_REASON } from "./orders/payment";
import { readSettings } from "./settings";

const HOUR = 3600_000;

function optOutToken(email: string) {
  return hmacHex(env().AUTH_SECRET, `opt-out:${normalizeEmail(email)}`).slice(0, 32);
}

export function unsubscribeUrl(email: string) {
  const e = normalizeEmail(email);
  return `${env().APP_URL}/unsubscribe?e=${encodeURIComponent(e)}&t=${optOutToken(e)}`;
}

export function checkOptOutToken(email: string, token: string) {
  return safeEqual(optOutToken(email), token);
}

/** Stops reminder and marketing emails for this address (newsletter and customer opt-in included). */
export async function optOut(db: DbOrTx, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const now = new Date();
  await db.insert(emailOptOuts).values({ email }).onConflictDoNothing();
  await db.update(newsletterSubscribers).set({ unsubscribedAt: now }).where(and(eq(newsletterSubscribers.email, email), isNull(newsletterSubscribers.unsubscribedAt)));
  await db.update(customers).set({ marketingOptIn: false }).where(eq(customers.email, email));
}

export async function isOptedOut(db: DbOrTx, rawEmail: string) {
  const [row] = await db.select({ email: emailOptOuts.email }).from(emailOptOuts).where(eq(emailOptOuts.email, normalizeEmail(rawEmail)));
  return !!row;
}

export async function sendUnpaidReminders(db: Database, now = new Date()) {
  const settings = await readSettings(db, "notifications");
  if (!settings.unpaidReminder) return 0;
  const due = new Date(now.getTime() - settings.unpaidReminderHours * HOUR);
  const oldest = new Date(now.getTime() - 48 * HOUR);
  const weekAgo = new Date(now.getTime() - 7 * 24 * HOUR);

  const candidates = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "CANCELLED"),
        eq(orders.paymentMethod, "PREPAID"),
        isNull(orders.confirmedAt),
        eq(orders.cancelReason, PAYMENT_TIMEOUT_REASON),
        isNull(orders.paymentReminderSentAt),
        lte(orders.placedAt, due),
        gte(orders.placedAt, oldest),
        sql`not exists (select 1 from ${emailOptOuts} where ${emailOptOuts.email} = ${orders.email})`,
        sql`not exists (select 1 from orders later where later.email = ${orders.email} and later.placed_at > ${orders.placedAt})`,
        sql`not exists (select 1 from orders recent where recent.email = ${orders.email} and recent.payment_reminder_sent_at > ${weekAgo})`,
      ),
    )
    .orderBy(asc(orders.placedAt))
    .limit(50);

  let sent = 0;
  for (const order of candidates) {
    // Claim first so two overlapping runs can't both send.
    const [claimed] = await db
      .update(orders)
      .set({ paymentReminderSentAt: now })
      .where(and(eq(orders.id, order.id), isNull(orders.paymentReminderSentAt)))
      .returning({ id: orders.id });
    if (!claimed) continue;
    await sendEmail(db, {
      to: order.email,
      ...unpaidReminderEmail(await emailOrder(db, order), orderUrl(order), unsubscribeUrl(order.email)),
      template: "unpaid-reminder",
      orderId: order.id,
    });
    sent++;
  }
  return sent;
}

/** "How are your spices?" a few days after delivery, for products the customer hasn't reviewed yet. Once per order. */
export async function sendReviewRequests(db: Database, now = new Date()) {
  const settings = await readSettings(db, "notifications");
  if (!settings.reviewRequests) return 0;
  const due = new Date(now.getTime() - settings.reviewRequestDays * 24 * HOUR);
  const oldest = new Date(due.getTime() - 14 * 24 * HOUR);
  const candidates = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.status, "DELIVERED"),
        isNotNull(orders.deliveredAt),
        lte(orders.deliveredAt, due),
        gte(orders.deliveredAt, oldest),
        isNull(orders.reviewRequestSentAt),
        isNull(orders.replacementForOrderId),
        sql`not exists (select 1 from ${emailOptOuts} where ${emailOptOuts.email} = ${orders.email})`,
      ),
    )
    .orderBy(asc(orders.deliveredAt))
    .limit(50);

  let sent = 0;
  for (const order of candidates) {
    const [claimed] = await db
      .update(orders)
      .set({ reviewRequestSentAt: now })
      .where(and(eq(orders.id, order.id), isNull(orders.reviewRequestSentAt)))
      .returning({ id: orders.id });
    if (!claimed) continue;
    const items = await db.selectDistinct({ productId: orderItems.productId, name: orderItems.productName }).from(orderItems).where(and(eq(orderItems.orderId, order.id), isNotNull(orderItems.productId)));
    const ids = items.map((i) => i.productId!);
    const reviewed = ids.length
      ? await db
          .select({ productId: reviews.productId })
          .from(reviews)
          .innerJoin(customers, eq(customers.id, reviews.customerId))
          .where(and(eq(customers.email, order.email), inArray(reviews.productId, ids)))
      : [];
    const toReview = items.filter((i) => !reviewed.some((r) => r.productId === i.productId));
    if (!toReview.length) continue;
    await sendEmail(db, {
      to: order.email,
      ...reviewRequestEmail(order.shipName, toReview.map((i) => i.name), `${env().APP_URL}/account#reviews`, unsubscribeUrl(order.email)),
      template: "review-request",
      orderId: order.id,
    });
    sent++;
  }
  return sent;
}
