import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, orders, refillReminders } from "@/db/schema";
import { addToCart, createCart } from "@/server/cart";
import { boughtTogether } from "@/server/catalog/queries";
import { summarizeCart } from "@/server/checkout";
import { placeOrder } from "@/server/orders/place";
import { RefillError, sendRefillReminders, setRefillReminder, stopRefillReminder } from "@/server/refills";
import { optOut } from "@/server/reminders";
import { storeSettingsSchema, writeSettings } from "@/server/settings";
import { db, makeProductWithVariant, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

const DAY = 24 * 3600_000;

async function orderOf(variantIds: number[], confirmed = true) {
  await writeSettings(db, "shipping", { pickupPincode: "302001" });
  await writeSettings(db, "store", { ...storeSettingsSchema.parse({}), state: "Rajasthan" });
  const cart = await createCart(db, null);
  for (const id of variantIds) await addToCart(db, cart.id, id, 1);
  const s = await summarizeCart(db, { cartId: cart.id, couponCode: null, pincode: "560001", paymentMethod: "COD", email: "t@example.com" });
  const r = await placeOrder(db, { cartId: cart.id, couponCode: null, signedInCustomerId: null, idempotencyKey: crypto.randomUUID(), email: "t@example.com", phone: "9876543210", name: "T Rao", line1: "4 MG Road", line2: "", landmark: "", city: "Bengaluru", state: "Karnataka", pincode: "560001", gstin: "", businessName: "", paymentMethod: "COD", expectedTotalPaise: s.breakdown.totalPaise!, marketingOptIn: false, saveAddress: false, note: "" });
  if (!r.ok) throw new Error(r.message);
  if (confirmed) await db.update(orders).set({ status: "CONFIRMED", confirmedAt: new Date() }).where(eq(orders.id, r.order.id));
}

describe("often bought together", () => {
  beforeEach(resetDb);

  it("suggests products from at least two shared confirmed orders", async () => {
    const a = await makeProductWithVariant();
    const b = await makeProductWithVariant();
    const c = await makeProductWithVariant();
    await orderOf([a.variant.id, b.variant.id]);
    await orderOf([a.variant.id, c.variant.id]);
    expect(await boughtTogether(db, a.product.id)).toEqual([]); // one shared order each: not enough yet
    await orderOf([a.variant.id, b.variant.id]);
    await orderOf([a.variant.id, c.variant.id], false); // unconfirmed orders don't count
    expect((await boughtTogether(db, a.product.id)).map((p) => p.id)).toEqual([b.product.id]);
  });
});

describe("reorder reminders", () => {
  beforeEach(resetDb);

  it("emails on schedule until stopped", async () => {
    const placed = await placedOrder("COD", "refill@example.com");
    await expect(setRefillReminder(db, placed.order, 30)).rejects.toBeInstanceOf(RefillError); // not delivered yet
    await db.update(orders).set({ status: "DELIVERED", deliveredAt: new Date() }).where(eq(orders.id, placed.order.id));
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
    await setRefillReminder(db, order, 14);

    expect(await sendRefillReminders(db, new Date(Date.now() + 13 * DAY))).toBe(0);
    expect(await sendRefillReminders(db, new Date(Date.now() + 15 * DAY))).toBe(1);
    expect(await sendRefillReminders(db, new Date(Date.now() + 16 * DAY))).toBe(0); // next one is two weeks later
    expect(await sendRefillReminders(db, new Date(Date.now() + 30 * DAY))).toBe(1);
    const mails = await db.select().from(emailLog).where(eq(emailLog.template, "refill-reminder"));
    expect(mails[0].html).toContain("/refill/stop?r=");

    await stopRefillReminder(db, { orderId: order.id });
    expect(await sendRefillReminders(db, new Date(Date.now() + 60 * DAY))).toBe(0);
  });

  it("respects an email opt-out", async () => {
    const placed = await placedOrder("COD", "quiet@example.com");
    await db.update(orders).set({ status: "DELIVERED", deliveredAt: new Date() }).where(eq(orders.id, placed.order.id));
    const [order] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
    await setRefillReminder(db, order, 14);
    await optOut(db, "quiet@example.com");
    expect(await sendRefillReminders(db, new Date(Date.now() + 15 * DAY))).toBe(0);
    expect((await db.select().from(refillReminders))[0].lastSentAt).toBeNull();
  });
});
