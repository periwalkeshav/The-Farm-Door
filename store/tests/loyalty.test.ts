import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { customers, loyaltyLedger, orders } from "@/db/schema";
import { addToCart, createCart } from "@/server/cart";
import { summarizeCart } from "@/server/checkout";
import { adjustPoints, pointsBalance, referralCodeFor, returnRedeemedPoints, reversePointsForRefund, rewardDeliveredOrder } from "@/server/loyalty";
import { placeOrder } from "@/server/orders/place";
import { storeSettingsSchema, writeSettings } from "@/server/settings";
import { db, makeProductWithVariant, makeStaff, resetDb } from "./support/db";

async function setup(loyalty: Record<string, unknown> = {}) {
  await writeSettings(db, "shipping", { pickupPincode: "302001" });
  await writeSettings(db, "store", { ...storeSettingsSchema.parse({}), state: "Rajasthan" });
  await writeSettings(db, "loyalty", { pointsEnabled: true, referralsEnabled: true, ...loyalty });
}

async function customer(email: string, points = 0) {
  const [c] = await db.insert(customers).values({ email, name: email.split("@")[0] }).returning();
  if (points) await adjustPoints(db, c.id, points, "opening", (await makeStaff()).id);
  return c;
}

async function checkout(opts: { customerId: number | null; email: string; usePoints?: boolean; coupon?: string | null; pricePaise?: number }) {
  const { variant } = await makeProductWithVariant({ pricePaise: opts.pricePaise ?? 19_900 });
  const cart = await createCart(db, opts.customerId);
  await addToCart(db, cart.id, variant.id, 1);
  const input = { cartId: cart.id, couponCode: opts.coupon ?? null, pincode: "560001", paymentMethod: "COD" as const, email: opts.email, customerId: opts.customerId, usePoints: opts.usePoints };
  const summary = await summarizeCart(db, input);
  return { cart, summary, place: () =>
    placeOrder(db, { cartId: cart.id, couponCode: opts.coupon ?? null, signedInCustomerId: opts.customerId, idempotencyKey: crypto.randomUUID(), email: opts.email, phone: "9876543210", name: "Asha Rao", line1: "4 MG Road", line2: "", landmark: "", city: "Bengaluru", state: "Karnataka", pincode: "560001", gstin: "", businessName: "", paymentMethod: "COD", expectedTotalPaise: summary.breakdown.totalPaise!, marketingOptIn: false, saveAddress: false, note: "", usePoints: opts.usePoints }) };
}

describe("loyalty points", () => {
  beforeEach(resetDb);

  it("are off by default", async () => {
    await writeSettings(db, "shipping", { pickupPincode: "302001" });
    const c = await customer("off@example.com");
    const { summary } = await checkout({ customerId: c.id, email: c.email, usePoints: true });
    expect(summary.points.enabled).toBe(false);
    expect(summary.breakdown.pointsDiscountPaise).toBe(0);
  });

  it("can pay up to 20% of the items, are taken when ordering and returned if it's cancelled", async () => {
    await setup();
    const c = await customer("asha@example.com", 200);
    const { summary, place } = await checkout({ customerId: c.id, email: c.email, usePoints: true });
    expect(summary.points).toMatchObject({ balance: 200, usable: 39, applied: true });
    expect(summary.breakdown.pointsDiscountPaise).toBe(3_900);
    const r = await place();
    if (!r.ok) throw new Error(r.message);
    expect(r.order).toMatchObject({ pointsRedeemed: 39, pointsDiscountPaise: 3_900, discountPaise: 3_900 });
    expect(await pointsBalance(db, c.id)).toBe(161);

    await db.transaction(async (tx) => {
      await returnRedeemedPoints(tx, r.order);
      await returnRedeemedPoints(tx, r.order); // only once
    });
    expect(await pointsBalance(db, c.id)).toBe(200);
  });

  it("won't place an order if the balance dropped in the meantime", async () => {
    await setup();
    const c = await customer("race@example.com", 100);
    const { place } = await checkout({ customerId: c.id, email: c.email, usePoints: true });
    await adjustPoints(db, c.id, -90, "spent elsewhere", (await makeStaff()).id);
    const r = await place();
    expect(r).toMatchObject({ ok: false, code: "PRICE_CHANGED" });
  });

  it("are earned on delivery and taken back in proportion to a refund", async () => {
    await setup();
    const c = await customer("earn@example.com");
    const { place } = await checkout({ customerId: c.id, email: c.email, pricePaise: 100_000 });
    const r = await place();
    if (!r.ok) throw new Error(r.message);
    const [delivered] = await db.update(orders).set({ status: "DELIVERED", deliveredAt: new Date() }).where(eq(orders.id, r.order.id)).returning();
    await db.transaction(async (tx) => {
      await rewardDeliveredOrder(tx, delivered);
      await rewardDeliveredOrder(tx, delivered); // only once
    });
    expect(await pointsBalance(db, c.id)).toBe(20); // 2 per ₹100 of ₹1,000
    await db.transaction((tx) => reversePointsForRefund(tx, delivered, Math.round(delivered.totalPaise / 2)));
    expect(await pointsBalance(db, c.id)).toBe(10);
  });
});

describe("refer a friend", () => {
  beforeEach(resetDb);

  it("gives a new customer the discount and the referrer points on delivery", async () => {
    await setup();
    const referrer = await customer("ravi@example.com");
    const code = await referralCodeFor(db, referrer);
    expect(code).toMatch(/^RAVI-[A-Z2-9]{4}$/);
    expect(await referralCodeFor(db, referrer)).toBe(code); // one code per customer

    const own = await checkout({ customerId: referrer.id, email: referrer.email, coupon: code });
    expect(own.summary.coupon).toMatchObject({ ok: false, reason: expect.stringMatching(/your own referral code/) });

    const friend = await checkout({ customerId: null, email: "friend@example.com", coupon: code, pricePaise: 50_000 });
    expect(friend.summary.coupon?.ok).toBe(true);
    expect(friend.summary.breakdown.couponDiscountPaise).toBe(5_000); // 10%
    const r = await friend.place();
    if (!r.ok) throw new Error(r.message);
    const [delivered] = await db.update(orders).set({ status: "DELIVERED", deliveredAt: new Date(), confirmedAt: new Date() }).where(eq(orders.id, r.order.id)).returning();
    await db.transaction((tx) => rewardDeliveredOrder(tx, delivered));
    const rows = await db.select().from(loyaltyLedger).where(and(eq(loyaltyLedger.customerId, referrer.id), eq(loyaltyLedger.reason, "REFERRAL")));
    expect(rows.map((x) => x.points)).toEqual([100]);

    const again = await checkout({ customerId: null, email: "friend@example.com", coupon: code });
    expect(again.summary.coupon).toMatchObject({ ok: false, reason: "You've already used this code." });

    // Someone who has ordered before (without the code) can't use it either.
    const regular = await checkout({ customerId: null, email: "regular@example.com" });
    const placed = await regular.place();
    if (!placed.ok) throw new Error(placed.message);
    await db.update(orders).set({ confirmedAt: new Date() }).where(eq(orders.id, placed.order.id));
    const late = await checkout({ customerId: null, email: "regular@example.com", coupon: code });
    expect(late.summary.coupon).toMatchObject({ ok: false, reason: expect.stringMatching(/first order/) });
  });

  it("codes stop working when referrals are switched off", async () => {
    await setup({ referralsEnabled: false });
    const referrer = await customer("off@example.com");
    const [code] = await Promise.all([referralCodeFor(db, referrer)]);
    const { summary } = await checkout({ customerId: null, email: "new@example.com", coupon: code });
    expect(summary.coupon?.ok).toBe(false);
  });
});
