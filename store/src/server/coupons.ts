/**
 * Coupon checks that need the database (dates, usage limits). The discount
 * maths lives in src/lib/pricing.ts.
 */
import { and, count, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { couponRedemptions, coupons } from "@/db/schema";
import { describeCoupon } from "@/lib/coupon-label";
import { evaluateCoupon, type CouponResult, type CouponRule, type PricingLine } from "@/lib/pricing";
import { referralRules } from "./loyalty";

export type CouponRow = typeof coupons.$inferSelect;

export function toRule(c: CouponRow): CouponRule {
  return {
    code: c.code,
    type: c.type,
    value: c.value,
    maxDiscountPaise: c.maxDiscountPaise,
    minOrderPaise: c.minOrderPaise,
    scope: c.scope,
    productIds: c.productIds,
    categoryIds: c.categoryIds,
  };
}

export type CouponCheck =
  | { ok: true; coupon: CouponRow; rule: CouponRule; result: Extract<CouponResult, { ok: true }> }
  | { ok: false; reason: string };

export async function checkCoupon(db: DbOrTx, rawCode: string, lines: PricingLine[], email: string | null, now = new Date()): Promise<CouponCheck> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, reason: "Enter a code." };
  const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code));
  if (!coupon || !coupon.isActive) return { ok: false, reason: "That code isn't valid." };
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, reason: "That code isn't active yet." };
  if (coupon.endsAt && coupon.endsAt <= now) return { ok: false, reason: "That code has expired." };
  if (coupon.usageLimitTotal !== null && coupon.timesUsed >= coupon.usageLimitTotal) return { ok: false, reason: "That code has been fully used." };
  if (email && coupon.usageLimitPerCustomer !== null) {
    const [{ used }] = await db
      .select({ used: count() })
      .from(couponRedemptions)
      .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.email, email), eq(couponRedemptions.isActive, true)));
    if (used >= coupon.usageLimitPerCustomer) return { ok: false, reason: "You've already used this code." };
  }
  let rule = toRule(coupon);
  if (coupon.referrerCustomerId) {
    // Personal referral codes follow the current refer-a-friend settings.
    const referral = await referralRules(db, coupon.referrerCustomerId, email);
    if (!referral.ok) return { ok: false, reason: referral.reason };
    rule = { ...rule, type: "PERCENT", value: referral.percentBp, maxDiscountPaise: referral.maxDiscountPaise, minOrderPaise: 0, scope: "ALL" };
  }
  const result = evaluateCoupon(rule, lines);
  if (!result.ok) return result;
  return { ok: true, coupon, rule, result };
}

/** Takes one use of the coupon, atomically respecting the total limit. Returns false if it's used up. */
export async function claimCouponUse(tx: DbOrTx, couponId: number): Promise<boolean> {
  const rows = await tx
    .update(coupons)
    .set({ timesUsed: sql`${coupons.timesUsed} + 1` })
    .where(and(eq(coupons.id, couponId), sql`(${coupons.usageLimitTotal} is null or ${coupons.timesUsed} < ${coupons.usageLimitTotal})`))
    .returning({ id: coupons.id });
  return rows.length === 1;
}

/** Gives a use back when an order is cancelled before it was confirmed. */
export async function releaseCouponUse(tx: DbOrTx, orderId: number) {
  const [redemption] = await tx
    .update(couponRedemptions)
    .set({ isActive: false })
    .where(and(eq(couponRedemptions.orderId, orderId), eq(couponRedemptions.isActive, true)))
    .returning({ couponId: couponRedemptions.couponId });
  if (redemption) {
    await tx
      .update(coupons)
      .set({ timesUsed: sql`greatest(${coupons.timesUsed} - 1, 0)` })
      .where(eq(coupons.id, redemption.couponId));
  }
}

/** The code to advertise in the scrolling banner: the newest featured coupon that works right now. */
export async function featuredCoupon(db: DbOrTx, now = new Date()) {
  const [c] = await db
    .select()
    .from(coupons)
    .where(
      and(
        eq(coupons.isFeatured, true),
        eq(coupons.isActive, true),
        isNull(coupons.referrerCustomerId),
        or(isNull(coupons.startsAt), lte(coupons.startsAt, now)),
        or(isNull(coupons.endsAt), gt(coupons.endsAt, now)),
        or(isNull(coupons.usageLimitTotal), sql`${coupons.timesUsed} < ${coupons.usageLimitTotal}`),
      ),
    )
    .orderBy(desc(coupons.createdAt))
    .limit(1);
  return c ? { code: c.code, label: c.description || describeCoupon(c) } : null;
}
