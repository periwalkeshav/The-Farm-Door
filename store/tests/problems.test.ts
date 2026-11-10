import { eq } from "drizzle-orm";
import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, inventoryItems, invoices, orderItems, orders, problemPhotos, problemReports, refunds } from "@/db/schema";
import { codConfirmToken } from "@/server/orders/common";
import { applyShipmentUpdate, confirmCodOrder, packOrder } from "@/server/orders/lifecycle";
import { canReportProblem, closeProblem, createProblemReport, processProblemPhoto, refundForProblem, sendReplacement } from "@/server/problems";
import { sendReviewRequests } from "@/server/reminders";
import { shipments } from "@/db/schema";
import { db, makeStaff, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

const HOUR = 3600_000;

const photo = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#c33" } }).jpeg().withMetadata({ exif: { IFD0: { Copyright: "secret" } } }).toBuffer();

/** A COD order taken all the way to delivered, with stock committed and an invoice. */
async function deliveredOrder(hoursAgo = 1) {
  const staff = await makeStaff();
  const placed = await placedOrder("COD");
  await confirmCodOrder(db, placed.order.id, { token: codConfirmToken(placed.order) });
  const packed = await packOrder(db, placed.order.id, staff.id);
  if (!packed.ok) throw new Error(packed.message);
  const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, placed.order.id));
  await applyShipmentUpdate(db, shipment.id, { status: "DELIVERED" });
  const [order] = await db.update(orders).set({ deliveredAt: new Date(Date.now() - hoursAgo * HOUR) }).where(eq(orders.id, placed.order.id)).returning();
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return { staff, order, items };
}

describe("problem reports", () => {
  beforeEach(resetDb);

  it("can be made within 48 hours of delivery only", async () => {
    const now = new Date();
    expect(canReportProblem({ status: "DELIVERED", deliveredAt: new Date(now.getTime() - 47 * HOUR) }, now)).toBe(true);
    expect(canReportProblem({ status: "DELIVERED", deliveredAt: new Date(now.getTime() - 49 * HOUR) }, now)).toBe(false);
    expect(canReportProblem({ status: "SHIPPED", deliveredAt: null }, now)).toBe(false);

    const { order, items } = await deliveredOrder(50);
    await expect(createProblemReport(db, order, { kind: "DAMAGED", description: "The jar arrived broken.", orderItemIds: [items[0].id], photos: [await photo()] })).rejects.toThrow(/within 48 hours/);
  });

  it("needs a photo and an item from the order, and only one open report at a time", async () => {
    const { order, items } = await deliveredOrder();
    const base = { kind: "DAMAGED" as const, description: "The jar arrived broken." };
    await expect(createProblemReport(db, order, { ...base, orderItemIds: [items[0].id], photos: [] })).rejects.toThrow(/at least one photo/);
    await expect(createProblemReport(db, order, { ...base, orderItemIds: [999_999], photos: [await photo()] })).rejects.toThrow(/Tick the item/);
    await expect(createProblemReport(db, order, { ...base, orderItemIds: [items[0].id], photos: [Buffer.from("not an image")] })).rejects.toThrow(/isn't a photo/);

    await createProblemReport(db, order, { ...base, orderItemIds: [items[0].id], photos: [await photo(), await photo()] });
    expect(await db.select().from(problemPhotos)).toHaveLength(2);
    await expect(createProblemReport(db, order, { ...base, orderItemIds: [items[0].id], photos: [await photo()] })).rejects.toThrow(/already reported/);

    const mails = await db.select().from(emailLog);
    expect(mails.map((m) => m.template)).toContain("problem-received");
  });

  it("strips photo metadata (such as location) and stores WebP", async () => {
    const out = await processProblemPhoto(await photo());
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
  });

  it("sends a free replacement: a ₹0 order with stock taken, no invoice, and no review request", async () => {
    const { staff, order, items } = await deliveredOrder();
    const report = await createProblemReport(db, order, { kind: "DAMAGED", description: "Lid cracked, powder spilled.", orderItemIds: [items[0].id], photos: [await photo()] });
    const [poolBefore] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, items[0].inventoryItemId));

    const replacement = await sendReplacement(db, report.id, [{ orderItemId: items[0].id, quantity: 1 }], "Sorry! A fresh one is on its way.", staff.id);
    expect(replacement).toMatchObject({ status: "CONFIRMED", totalPaise: 0, paymentStatus: "NOT_APPLICABLE", stockState: "COMMITTED", replacementForOrderId: order.id });
    const [poolAfter] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, items[0].inventoryItemId));
    expect(poolAfter.onHand).toBe(poolBefore.onHand - 1);
    const [r] = await db.select().from(problemReports).where(eq(problemReports.id, report.id));
    expect(r).toMatchObject({ status: "REPLACEMENT_SENT", replacementOrderId: replacement.id });

    // Pressing it again does nothing.
    await expect(sendReplacement(db, report.id, [{ orderItemId: items[0].id, quantity: 1 }], "Again", staff.id)).rejects.toThrow(/already been resolved/);

    const packed = await packOrder(db, replacement.id, staff.id);
    expect(packed.ok).toBe(true);
    expect(await db.select().from(invoices).where(eq(invoices.orderId, replacement.id))).toHaveLength(0);

    const [s] = await db.select().from(shipments).where(eq(shipments.orderId, replacement.id));
    await applyShipmentUpdate(db, s.id, { status: "DELIVERED" });
    await db.update(orders).set({ deliveredAt: new Date(Date.now() - 10 * 24 * HOUR) }).where(eq(orders.id, replacement.id));
    await db.update(orders).set({ reviewRequestSentAt: new Date() }).where(eq(orders.id, order.id));
    expect(await sendReviewRequests(db)).toBe(0);
  });

  it("won't send more than was ordered, or without stock", async () => {
    const { staff, order, items } = await deliveredOrder();
    const report = await createProblemReport(db, order, { kind: "WRONG_ITEM", description: "Got cumin instead of turmeric.", orderItemIds: [items[0].id], photos: [await photo()] });
    await expect(sendReplacement(db, report.id, [{ orderItemId: items[0].id, quantity: 5 }], "Sorry", staff.id)).rejects.toThrow(/at most 1/);
    await db.update(inventoryItems).set({ onHand: 0 }).where(eq(inventoryItems.id, items[0].inventoryItemId));
    await expect(sendReplacement(db, report.id, [{ orderItemId: items[0].id, quantity: 1 }], "Sorry", staff.id)).rejects.toThrow(/enough stock/);
    expect((await db.select().from(problemReports).where(eq(problemReports.id, report.id)))[0].status).toBe("OPEN");
  });

  it("refunds through the normal refund flow, or closes with a message", async () => {
    const { staff, order, items } = await deliveredOrder();
    const report = await createProblemReport(db, order, { kind: "EXPIRED", description: "Best before date already passed.", orderItemIds: [items[0].id], photos: [await photo()] });
    await refundForProblem(db, report.id, { amountPaise: 10_000, mode: "MANUAL", reference: "UPI-123", reason: "Item past its date" }, staff.id);
    expect((await db.select().from(refunds).where(eq(refunds.orderId, order.id)))[0]).toMatchObject({ amountPaise: 10_000, mode: "MANUAL" });
    expect((await db.select().from(problemReports).where(eq(problemReports.id, report.id)))[0]).toMatchObject({ status: "REFUNDED", refundPaise: 10_000 });

    const second = await createProblemReport(db, order, { kind: "OTHER", description: "The box smelled of something.", orderItemIds: [items[0].id], photos: [await photo()] });
    await closeProblem(db, second.id, "We checked with the courier; the seal was intact.", staff.id);
    const mails = await db.select().from(emailLog).where(eq(emailLog.template, "problem-closed"));
    expect(mails).toHaveLength(1);
  });
});
