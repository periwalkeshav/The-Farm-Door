import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { customers, emailLog, inventoryItems, orderItems, orders, reviews } from "@/db/schema";
import { optOut, sendReviewRequests } from "@/server/reminders";
import { sendBackInStockAlerts, StockAlertError, subscribeStockAlert, waitingForRestock } from "@/server/stock-alerts";
import { db, makeProductWithVariant, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

const DAY = 24 * 3600_000;
const sentWith = (template: string) => db.select().from(emailLog).where(eq(emailLog.template, template));

async function deliveredOrder(email: string, daysAgo: number) {
  const placed = await placedOrder("COD", email);
  await db.update(orders).set({ status: "DELIVERED", deliveredAt: new Date(Date.now() - daysAgo * DAY) }).where(eq(orders.id, placed.order.id));
  return placed.order;
}

describe("review requests", () => {
  beforeEach(resetDb);

  it("asks once, a few days after delivery", async () => {
    await deliveredOrder("fresh@example.com", 1);
    const order = await deliveredOrder("due@example.com", 6);
    expect(await sendReviewRequests(db)).toBe(1);
    expect(await sendReviewRequests(db)).toBe(0);
    const [mail] = await sentWith("review-request");
    expect(mail).toMatchObject({ to: "due@example.com", orderId: order.id });
    expect(mail.html).toContain("/account#reviews");
  });

  it("skips people who opted out or already reviewed everything", async () => {
    await deliveredOrder("optout@example.com", 6);
    await optOut(db, "optout@example.com");
    const reviewedOrder = await deliveredOrder("reviewed@example.com", 6);
    const [item] = await db.select().from(orderItems).where(eq(orderItems.orderId, reviewedOrder.id));
    const [c] = await db.select().from(customers).where(eq(customers.email, "reviewed@example.com"));
    await db.insert(reviews).values({ productId: item.productId!, customerId: c.id, rating: 5, body: "Lovely and fresh", authorName: "R" });
    expect(await sendReviewRequests(db)).toBe(0);
    expect(await sentWith("review-request")).toHaveLength(0);
  });
});

describe("back-in-stock alerts", () => {
  beforeEach(resetDb);

  it("emails once when a sold-out pack can be bought again", async () => {
    const { variant, item } = await makeProductWithVariant({ onHand: 0 });
    await subscribeStockAlert(db, variant.id, "Wait@Example.com");
    await subscribeStockAlert(db, variant.id, "wait@example.com"); // same person, no duplicate
    expect((await waitingForRestock(db))[0].waiting).toBe(1);
    expect(await sendBackInStockAlerts(db)).toBe(0);

    await db.update(inventoryItems).set({ onHand: 5 }).where(eq(inventoryItems.id, item.id));
    expect(await sendBackInStockAlerts(db)).toBe(1);
    expect(await sendBackInStockAlerts(db)).toBe(0);
    const [mail] = await sentWith("back-in-stock");
    expect(mail.to).toBe("wait@example.com");
    expect(await waitingForRestock(db)).toEqual([]);
  });

  it("doesn't take sign-ups for packs that are in stock", async () => {
    const { variant } = await makeProductWithVariant({ onHand: 3 });
    await expect(subscribeStockAlert(db, variant.id, "a@example.com")).rejects.toBeInstanceOf(StockAlertError);
  });
});
