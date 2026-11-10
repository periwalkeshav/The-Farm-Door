import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, orderItems, orders, productVariants } from "@/db/schema";
import { addOrderItemsToCart, createCart } from "@/server/cart";
import { expireOverdueOrders } from "@/server/orders/payment";
import { checkOptOutToken, optOut, sendUnpaidReminders, unsubscribeUrl } from "@/server/reminders";
import { notificationSettingsSchema, writeSettings } from "@/server/settings";
import { db, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

const HOUR = 3600_000;

async function expiredUnpaidOrder(email = "k@example.com") {
  const placed = await placedOrder("PREPAID", email);
  await db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - HOUR) }).where(eq(orders.id, placed.order.id));
  await expireOverdueOrders(db);
  const [order] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
  expect(order.status).toBe("CANCELLED");
  return order;
}

const reminderEmails = () => db.select().from(emailLog).where(eq(emailLog.template, "unpaid-reminder"));
const later = (hours: number) => new Date(Date.now() + hours * HOUR);

describe("unpaid-order reminder", () => {
  beforeEach(resetDb);

  it("sends one reminder a few hours after an online-payment order expires unpaid", async () => {
    const order = await expiredUnpaidOrder();
    expect(await sendUnpaidReminders(db, new Date())).toBe(0); // too early
    expect(await sendUnpaidReminders(db, later(4))).toBe(1);
    expect(await sendUnpaidReminders(db, later(5))).toBe(0); // only once
    const sent = await reminderEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "k@example.com", orderId: order.id });
    expect(sent[0].html).toContain(`/orders/${order.orderNumber}?t=`);
    expect(sent[0].html).toContain("/unsubscribe?e=");
  });

  it("skips people who ordered again, opted out, or were reminded this week", async () => {
    await expiredUnpaidOrder("again@example.com");
    await placedOrder("PREPAID", "again@example.com"); // a newer order exists
    await expiredUnpaidOrder("optout@example.com");
    await optOut(db, "OptOut@Example.com");
    expect(await sendUnpaidReminders(db, later(4))).toBe(0);

    await expiredUnpaidOrder("weekly@example.com");
    expect(await sendUnpaidReminders(db, later(4))).toBe(1);
    // A second abandoned order the same week gets no second reminder.
    const second = await expiredUnpaidOrder("weekly@example.com");
    await db.update(orders).set({ placedAt: new Date(Date.now() + HOUR) }).where(eq(orders.id, second.id));
    expect(await sendUnpaidReminders(db, later(6))).toBe(0);
  });

  it("does nothing when the owner turns reminders off", async () => {
    await writeSettings(db, "notifications", { ...notificationSettingsSchema.parse({}), unpaidReminder: false });
    await expiredUnpaidOrder();
    expect(await sendUnpaidReminders(db, later(4))).toBe(0);
  });

  it("only accepts opt-out links signed for that address", () => {
    const url = new URL(unsubscribeUrl("K@Example.com"));
    const email = url.searchParams.get("e")!;
    const token = url.searchParams.get("t")!;
    expect(email).toBe("k@example.com");
    expect(checkOptOutToken(email, token)).toBe(true);
    expect(checkOptOutToken("someone@example.com", token)).toBe(false);
  });
});

describe("buy again", () => {
  beforeEach(resetDb);

  it("adds a past order's items to a cart and reports what's no longer sold", async () => {
    const placed = await placedOrder("COD");
    const items = await db
      .select({ variantId: orderItems.variantId, productName: orderItems.productName, variantTitle: orderItems.variantTitle, quantity: orderItems.quantity })
      .from(orderItems)
      .where(eq(orderItems.orderId, placed.order.id));

    const cart = await createCart(db, null);
    expect(await addOrderItemsToCart(db, cart.id, items)).toMatchObject({ added: 1, unavailable: [] });

    await db.update(productVariants).set({ isActive: false }).where(eq(productVariants.id, items[0].variantId!));
    const other = await createCart(db, null);
    const r = await addOrderItemsToCart(db, other.id, items);
    expect(r.added).toBe(0);
    expect(r.unavailable).toEqual([expect.stringContaining("Test Turmeric")]);
  });
});
