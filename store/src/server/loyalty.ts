/**
 * Loyalty points and refer-a-friend. Both are off until the owner turns them
 * on in Admin > Settings.
 *
 * Points live in an append-only ledger; a balance is the sum of a customer's
 * rows. They're earned when an order is delivered, used as a discount at
 * checkout (signed-in customers only), returned if that order is cancelled, and
 * taken back in proportion when an order that earned points is refunded.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { coupons, customers, loyaltyLedger, orders } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import type { OrderRow } from "./orders/common";
import { readSettings, type SettingsValue } from "./settings";

export class PointsChangedError extends Error {}

type Loyalty = SettingsValue<"loyalty">;

export async function pointsBalance(db: DbOrTx, customerId: number): Promise<number> {
  const [row] = await db.select({ total: sql<number>`coalesce(sum(${loyaltyLedger.points}), 0)::int` }).from(loyaltyLedger).where(eq(loyaltyLedger.customerId, customerId));
  return row?.total ?? 0;
}

export async function pointsHistory(db: DbOrTx, customerId: number, limit = 20) {
  return db
    .select({ id: loyaltyLedger.id, points: loyaltyLedger.points, reason: loyaltyLedger.reason, note: loyaltyLedger.note, createdAt: loyaltyLedger.createdAt, orderNumber: orders.orderNumber })
    .from(loyaltyLedger)
    .leftJoin(orders, eq(orders.id, loyaltyLedger.orderId))
    .where(eq(loyaltyLedger.customerId, customerId))
    .orderBy(desc(loyaltyLedger.createdAt), desc(loyaltyLedger.id))
    .limit(limit);
}

export const POINT_REASONS: Record<(typeof loyaltyLedger.$inferSelect)["reason"], string> = {
  EARNED: "Earned on order",
  REDEEMED: "Used on order",
  REDEEM_RETURNED: "Returned (order cancelled)",
  REFUND_REVERSAL: "Taken back (order refunded)",
  REFERRAL: "Friend's first order",
  ADJUSTMENT: "Adjusted by the store",
};

/** Points a delivered order earns: whole points per ₹100 of items actually paid for. */
export function pointsEarnedFor(order: Pick<OrderRow, "subtotalPaise" | "discountPaise">, loyalty: Loyalty) {
  return Math.floor(((order.subtotalPaise - order.discountPaise) * loyalty.pointsPerHundredRupees) / 10_000);
}

/** How many points this customer may use on a cart, and what they're worth. */
export async function usablePoints(db: DbOrTx, customerId: number | null, itemsAfterCouponPaise: number, loyalty: Loyalty) {
  if (!loyalty.pointsEnabled || !customerId) return { balance: 0, usable: 0, valuePaise: 0 };
  const balance = await pointsBalance(db, customerId);
  const cap = Math.floor((itemsAfterCouponPaise * loyalty.maxRedeemPercent) / 100 / loyalty.pointValuePaise);
  const usable = balance >= loyalty.minPointsToRedeem ? Math.max(0, Math.min(balance, cap)) : 0;
  return { balance, usable, valuePaise: usable * loyalty.pointValuePaise };
}

/** Takes points for an order inside the order transaction, after locking the customer. */
export async function redeemPoints(tx: DbOrTx, customerId: number, orderId: number, points: number) {
  if (points <= 0) return;
  await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).for("update");
  if ((await pointsBalance(tx, customerId)) < points) throw new PointsChangedError("Your points balance changed. Please review your order.");
  await tx.insert(loyaltyLedger).values({ customerId, orderId, points: -points, reason: "REDEEMED" });
}

async function hasRow(tx: DbOrTx, orderId: number, reason: (typeof loyaltyLedger.$inferSelect)["reason"], customerId?: number) {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(loyaltyLedger)
    .where(and(eq(loyaltyLedger.orderId, orderId), eq(loyaltyLedger.reason, reason), customerId ? eq(loyaltyLedger.customerId, customerId) : undefined));
  return n > 0;
}

/** Gives points back when an order that used them is cancelled. Safe to call twice. */
export async function returnRedeemedPoints(tx: DbOrTx, order: Pick<OrderRow, "id" | "customerId" | "pointsRedeemed">) {
  if (!order.pointsRedeemed || !order.customerId) return;
  if (await hasRow(tx, order.id, "REDEEM_RETURNED")) return;
  await tx.insert(loyaltyLedger).values({ customerId: order.customerId, orderId: order.id, points: order.pointsRedeemed, reason: "REDEEM_RETURNED" });
}

/** On delivery: points for the customer, and the referral reward for whoever referred them. Safe to call twice. */
export async function rewardDeliveredOrder(tx: DbOrTx, order: OrderRow) {
  const loyalty = await readSettings(tx, "loyalty");
  if (!loyalty.pointsEnabled) return;
  if (order.customerId && !(await hasRow(tx, order.id, "EARNED"))) {
    const points = pointsEarnedFor(order, loyalty);
    if (points > 0) await tx.insert(loyaltyLedger).values({ customerId: order.customerId, orderId: order.id, points, reason: "EARNED" });
  }
  if (loyalty.referralsEnabled && loyalty.referralRewardPoints > 0 && order.couponId) {
    const [code] = await tx.select({ referrer: coupons.referrerCustomerId }).from(coupons).where(eq(coupons.id, order.couponId));
    if (code?.referrer && code.referrer !== order.customerId && !(await hasRow(tx, order.id, "REFERRAL", code.referrer))) {
      await tx.insert(loyaltyLedger).values({ customerId: code.referrer, orderId: order.id, points: loyalty.referralRewardPoints, reason: "REFERRAL", note: `Order ${order.orderNumber}` });
    }
  }
}

/** On a refund: takes back the share of earned points (never below a zero balance). */
export async function reversePointsForRefund(tx: DbOrTx, order: OrderRow, refundPaise: number) {
  if (!order.customerId || refundPaise <= 0 || order.totalPaise <= 0) return;
  const [earned] = await tx
    .select({ points: sql<number>`coalesce(sum(${loyaltyLedger.points}), 0)::int` })
    .from(loyaltyLedger)
    .where(and(eq(loyaltyLedger.orderId, order.id), eq(loyaltyLedger.reason, "EARNED"), eq(loyaltyLedger.customerId, order.customerId)));
  if (!earned?.points) return;
  const share = Math.min(earned.points, Math.ceil((earned.points * refundPaise) / order.totalPaise));
  const take = Math.min(share, Math.max(0, await pointsBalance(tx, order.customerId)));
  if (take > 0) await tx.insert(loyaltyLedger).values({ customerId: order.customerId, orderId: order.id, points: -take, reason: "REFUND_REVERSAL" });
}

export async function adjustPoints(db: Database, customerId: number, points: number, note: string, staffUserId: number) {
  if (!Number.isInteger(points) || points === 0) throw new PointsChangedError("Enter a whole number of points (use minus to remove).");
  await db.transaction(async (tx) => {
    await tx.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).for("update");
    if (points < 0 && (await pointsBalance(tx, customerId)) + points < 0) throw new PointsChangedError("That would take the balance below zero.");
    await tx.insert(loyaltyLedger).values({ customerId, points, reason: "ADJUSTMENT", note: note.slice(0, 200), staffUserId });
  });
}

/* ---------------- Refer a friend ---------------- */

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The customer's personal referral code, created the first time it's needed. */
export async function referralCodeFor(db: DbOrTx, customer: { id: number; name: string; email: string }) {
  const [existing] = await db.select({ code: coupons.code }).from(coupons).where(eq(coupons.referrerCustomerId, customer.id));
  if (existing) return existing.code;
  const base =
    (customer.name || customer.email.split("@")[0])
      .normalize("NFKD")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 8) || "FRIEND";
  for (let i = 0; i < 10; i++) {
    const suffix = Array.from(randomToken(8)).map((c) => CODE_CHARS[c.charCodeAt(0) % CODE_CHARS.length]).join("").slice(0, 4);
    const code = `${base}-${suffix}`;
    const [row] = await db
      .insert(coupons)
      .values({ code, description: "Friend's first-order discount", type: "PERCENT", value: 1000, usageLimitPerCustomer: 1, referrerCustomerId: customer.id })
      .onConflictDoNothing()
      .returning({ code: coupons.code });
    if (row) return row.code;
    const [mine] = await db.select({ code: coupons.code }).from(coupons).where(eq(coupons.referrerCustomerId, customer.id));
    if (mine) return mine.code;
  }
  throw new Error("Couldn't create a referral code.");
}

/** Extra rules for referral codes; returns a reason to refuse, or the current discount settings. */
export async function referralRules(db: DbOrTx, referrerCustomerId: number, email: string | null) {
  const loyalty = await readSettings(db, "loyalty");
  if (!loyalty.referralsEnabled) return { ok: false as const, reason: "That code isn't valid." };
  if (email) {
    const [referrer] = await db.select({ email: customers.email }).from(customers).where(eq(customers.id, referrerCustomerId));
    if (referrer?.email === email) return { ok: false as const, reason: "You can't use your own referral code. Share it with friends instead." };
    const [{ n }] = await db.select({ n: count() }).from(orders).where(and(eq(orders.email, email), sql`${orders.confirmedAt} is not null`));
    if (n > 0) return { ok: false as const, reason: "Referral codes are for a customer's first order." };
  }
  return { ok: true as const, percentBp: loyalty.referralDiscountPercent * 100, maxDiscountPaise: loyalty.referralMaxDiscountPaise };
}
