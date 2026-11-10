import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { emailLog, orders, shipments } from "@/db/schema";
import { runTick } from "@/server/jobs";
import { codConfirmToken } from "@/server/orders/common";
import { confirmCodOrder, packOrder } from "@/server/orders/lifecycle";
import { mockPaymentId } from "@/server/payments/mock";
import { writeSettings } from "@/server/settings";
import { verifyWebhookSignature } from "@/server/payments/razorpay";
import { mapShiprocketStatus } from "@/server/shipping/shiprocket";
import { handleRazorpayEvent, handleShiprocketEvent } from "@/server/webhooks";
import { db, makeStaff, resetDb } from "./support/db";
import { placedOrder } from "./support/orders";

describe("Razorpay webhook", () => {
  beforeEach(resetDb);

  it("verifies the signature over the raw body", () => {
    const body = '{"event":"payment.captured"}';
    const sig = createHmac("sha256", "whsec").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, null, "whsec")).toBe(false);
  });

  it("confirms the order once, however many times the event is delivered", async () => {
    const placed = await placedOrder("PREPAID");
    const paymentId = mockPaymentId(placed.payment!.razorpayOrderId, placed.order.totalPaise, "captured");
    const event = { event: "payment.captured", payload: { payment: { entity: { id: paymentId, order_id: placed.payment!.razorpayOrderId } } } };
    expect(await handleRazorpayEvent(db, "evt_1", event)).toEqual({ changedStock: true });
    expect(await handleRazorpayEvent(db, "evt_1", event)).toEqual({ changedStock: false });
    // A different event for the same payment (order.paid) is also harmless.
    await handleRazorpayEvent(db, "evt_2", { ...event, event: "order.paid" });
    const [o] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
    expect(o).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID" });
    const confirmations = await db.select().from(emailLog).where(and(eq(emailLog.orderId, o.id), eq(emailLog.template, "order-confirmed")));
    expect(confirmations).toHaveLength(1);
  });
});

describe("courier tracking webhook", () => {
  beforeEach(resetDb);

  it("maps Shiprocket status codes", () => {
    expect(mapShiprocketStatus(18)).toBe("IN_TRANSIT");
    expect(mapShiprocketStatus(17)).toBe("OUT_FOR_DELIVERY");
    expect(mapShiprocketStatus(7)).toBe("DELIVERED");
    expect(mapShiprocketStatus(9)).toBe("RTO_INITIATED");
    expect(mapShiprocketStatus(10)).toBe("RTO_DELIVERED");
    expect(mapShiprocketStatus(999)).toBeNull();
  });

  it("moves the order along and marks COD collected on delivery", async () => {
    const placed = await placedOrder("COD");
    await confirmCodOrder(db, placed.order.id, { token: codConfirmToken(placed.order) });
    const staff = await makeStaff();
    const packed = await packOrder(db, placed.order.id, staff.id);
    if (!packed.ok) throw new Error(packed.message);
    const [s] = await db.select().from(shipments).where(eq(shipments.orderId, placed.order.id));
    const base = { awb: s.awb!, courier_name: "Test", order_id: placed.order.orderNumber };
    await handleShiprocketEvent(db, { ...base, shipment_status: "IN TRANSIT", shipment_status_id: 18, current_timestamp: "17 10 2026 10:00:00", scans: [{ date: "2026-10-17 09:30:00", activity: "Picked up", location: "Jaipur", "sr-status-label": "PICKED UP" }] });
    let [o] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
    expect(o.status).toBe("SHIPPED");
    await handleShiprocketEvent(db, { ...base, shipment_status: "DELIVERED", shipment_status_id: 7, current_timestamp: "19 10 2026 14:00:00" });
    await handleShiprocketEvent(db, { ...base, shipment_status: "DELIVERED", shipment_status_id: 7, current_timestamp: "19 10 2026 14:00:00" });
    [o] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
    expect(o).toMatchObject({ status: "DELIVERED", paymentStatus: "COD_COLLECTED" });
    const delivered = await db.select().from(emailLog).where(and(eq(emailLog.orderId, o.id), eq(emailLog.template, "order-delivered")));
    expect(delivered).toHaveLength(1);
  });

  it("ignores tracking for unknown parcels", async () => {
    expect(await handleShiprocketEvent(db, { awb: "NOPE", shipment_status_id: 7 })).toEqual({ matched: false });
  });
});

describe("scheduled job", () => {
  beforeEach(resetDb);

  it("expires overdue orders and sends the daily summary only once", async () => {
    const placed = await placedOrder("PREPAID");
    await db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 60 * 60_000) }).where(eq(orders.id, placed.order.id));
    await writeSettings(db, "notifications", { ownerEmail: "owner@example.com", newOrderEmails: true, lowStockEmails: true, dailySummary: true, unpaidReminder: false, unpaidReminderHours: 3 });
    const tenAmIst = new Date(`${new Date().toISOString().slice(0, 10)}T10:00:00+05:30`);
    const first = await runTick(db, tenAmIst);
    expect(first.orders).toMatchObject({ expired: 1 });
    expect(first.dailySummary).toBeTruthy();
    const second = await runTick(db, tenAmIst);
    expect(second.dailySummary).toBeUndefined();
    const [o] = await db.select().from(orders).where(eq(orders.id, placed.order.id));
    expect(o.status).toBe("CANCELLED");
    const summaries = await db.select().from(emailLog).where(eq(emailLog.template, "daily-summary"));
    expect(summaries).toHaveLength(1);
  });
});
