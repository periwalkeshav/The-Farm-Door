import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { couponRedemptions, coupons, emailLog, inventoryItems, invoices, orders, payments, refunds } from "@/db/schema";
import { addToCart, createCart, loadCartLines } from "@/server/cart";
import { summarizeCart } from "@/server/checkout";
import { cancelOrder, confirmCodOrder, packOrder, applyShipmentUpdate } from "@/server/orders/lifecycle";
import { expireOverdueOrders, processGatewayPayment } from "@/server/orders/payment";
import { placeOrder, type PlaceOrderInput } from "@/server/orders/place";
import { codConfirmToken } from "@/server/orders/common";
import { mockGateway, mockPaymentId } from "@/server/payments/mock";
import { writeSettings } from "@/server/settings";
import { shipments } from "@/db/schema";
import { db, makeProductWithVariant, makeStaff, resetDb } from "./support/db";

async function setup(opts: { onHand?: number; price?: number } = {}) {
  await writeSettings(db, "shipping", {
    pickupPincode: "302001",
    freeShippingThresholdPaise: null,
    handlingFeePaise: 0,
    packagingWeightGrams: 80,
    boxLengthCm: 20,
    boxBreadthCm: 15,
    boxHeightCm: 10,
    courierChoice: "RECOMMENDED",
  });
  await writeSettings(db, "store", { ...(await import("@/server/settings")).storeSettingsSchema.parse({}), state: "Rajasthan", gstin: "08ABCDE1234F1Z5" });
  const { variant, item } = await makeProductWithVariant({ pricePaise: opts.price ?? 19_900, onHand: opts.onHand ?? 10 });
  const cart = await createCart(db, null);
  await addToCart(db, cart.id, variant.id, 2);
  return { variant, item, cart };
}

async function inputFor(cartId: string, over: Partial<PlaceOrderInput> = {}): Promise<PlaceOrderInput> {
  const method = over.paymentMethod ?? "PREPAID";
  const summary = await summarizeCart(db, { cartId, couponCode: over.couponCode ?? null, pincode: over.pincode ?? "110001", paymentMethod: method, email: "asha@example.com" });
  return {
    cartId,
    couponCode: null,
    signedInCustomerId: null,
    idempotencyKey: crypto.randomUUID(),
    email: "Asha@Example.com",
    phone: "9829012345",
    name: "Asha Verma",
    line1: "12 Civil Lines",
    line2: "",
    landmark: "",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110001",
    gstin: "",
    businessName: "",
    paymentMethod: method,
    expectedTotalPaise: summary.breakdown.totalPaise ?? -1,
    marketingOptIn: false,
    saveAddress: false,
    note: "",
    ...over,
  };
}

async function pool(id: number) {
  const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  return row;
}

async function pay(razorpayOrderId: string, amountPaise: number) {
  return mockGateway.fetchPayment(mockPaymentId(razorpayOrderId, amountPaise, "captured"));
}

describe("order placement and payment", () => {
  beforeEach(resetDb);

  it("holds stock, then confirms only after a verified captured payment", async () => {
    const { cart, item } = await setup();
    const result = await placeOrder(db, await inputFor(cart.id));
    if (!result.ok) throw new Error(result.message);
    expect(result.order.status).toBe("AWAITING_PAYMENT");
    expect(result.order.email).toBe("asha@example.com");
    expect(await pool(item.id)).toMatchObject({ onHand: 10, reserved: 2 });
    expect(result.payment?.razorpayOrderId).toMatch(/^mock_order_/);
    expect(await loadCartLines(db, cart.id)).toHaveLength(0);

    const payment = await pay(result.payment!.razorpayOrderId, result.order.totalPaise);
    const first = await processGatewayPayment(db, payment, "checkout");
    expect(first.outcome).toBe("CONFIRMED");
    expect(await pool(item.id)).toMatchObject({ onHand: 8, reserved: 0 });

    // The same payment arriving again by webhook changes nothing.
    const again = await processGatewayPayment(db, payment, "webhook");
    expect(again.outcome).toBe("ALREADY_APPLIED");
    expect(await pool(item.id)).toMatchObject({ onHand: 8, reserved: 0 });

    const [order] = await db.select().from(orders).where(eq(orders.id, result.order.id));
    expect(order).toMatchObject({ status: "CONFIRMED", paymentStatus: "PAID", stockState: "COMMITTED" });
    const mails = await db.select().from(emailLog).where(eq(emailLog.orderId, order.id));
    expect(mails.map((m) => m.template)).toContain("order-confirmed");
  });

  it("refuses an amount that doesn't match the order", async () => {
    const { cart } = await setup();
    const result = await placeOrder(db, await inputFor(cart.id));
    if (!result.ok) throw new Error(result.message);
    const wrong = await pay(result.payment!.razorpayOrderId, result.order.totalPaise - 100);
    expect((await processGatewayPayment(db, wrong, "webhook")).outcome).toBe("AMOUNT_MISMATCH");
    const [order] = await db.select().from(orders).where(eq(orders.id, result.order.id));
    expect(order.status).toBe("AWAITING_PAYMENT");
  });

  it("refunds a second payment for an already-paid order", async () => {
    const { cart } = await setup();
    const result = await placeOrder(db, await inputFor(cart.id));
    if (!result.ok) throw new Error(result.message);
    await processGatewayPayment(db, await pay(result.payment!.razorpayOrderId, result.order.totalPaise), "checkout");
    const dup = await processGatewayPayment(db, await pay(result.payment!.razorpayOrderId, result.order.totalPaise), "webhook");
    expect(dup.outcome).toBe("DUPLICATE_REFUNDED");
    const rows = await db.select().from(refunds).where(eq(refunds.orderId, result.order.id));
    expect(rows).toHaveLength(1);
    const [order] = await db.select().from(orders).where(eq(orders.id, result.order.id));
    expect(order.paymentStatus).toBe("PAID");
  });

  it("is idempotent for a repeated submission", async () => {
    const { cart, item } = await setup();
    const input = await inputFor(cart.id);
    const a = await placeOrder(db, input);
    const b = await placeOrder(db, input);
    if (!a.ok || !b.ok) throw new Error("expected success");
    expect(b.existing).toBe(true);
    expect(b.order.id).toBe(a.order.id);
    expect(await pool(item.id)).toMatchObject({ reserved: 2 });
  });

  it("rejects the order when the total changed since checkout opened", async () => {
    const { cart } = await setup();
    const r = await placeOrder(db, { ...(await inputFor(cart.id)), expectedTotalPaise: 1 });
    expect(r).toMatchObject({ ok: false, code: "PRICE_CHANGED" });
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("won't take orders for pincodes no courier serves", async () => {
    const { cart } = await setup();
    const r = await placeOrder(db, { ...(await inputFor(cart.id)), pincode: "999999" });
    expect(r).toMatchObject({ ok: false, code: "NO_SHIPPING" });
  });

  it("expires unpaid orders and releases their stock; a late payment is still honoured when stock allows", async () => {
    const { cart, item } = await setup();
    const result = await placeOrder(db, await inputFor(cart.id));
    if (!result.ok) throw new Error(result.message);
    await db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 10 * 60_000) }).where(eq(orders.id, result.order.id));
    expect(await expireOverdueOrders(db)).toMatchObject({ expired: 1 });
    expect(await pool(item.id)).toMatchObject({ onHand: 10, reserved: 0 });

    const late = await processGatewayPayment(db, await pay(result.payment!.razorpayOrderId, result.order.totalPaise), "webhook");
    expect(late.outcome).toBe("LATE_CONFIRMED");
    expect(await pool(item.id)).toMatchObject({ onHand: 8, reserved: 0 });
  });

  it("refunds a late payment when the stock has gone", async () => {
    const { cart, item } = await setup({ onHand: 2 });
    const result = await placeOrder(db, await inputFor(cart.id));
    if (!result.ok) throw new Error(result.message);
    await db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 10 * 60_000) }).where(eq(orders.id, result.order.id));
    await expireOverdueOrders(db);
    await db.update(inventoryItems).set({ onHand: 0 }).where(eq(inventoryItems.id, item.id));
    const late = await processGatewayPayment(db, await pay(result.payment!.razorpayOrderId, result.order.totalPaise), "webhook");
    expect(late.outcome).toBe("LATE_REFUNDED");
    const [order] = await db.select().from(orders).where(eq(orders.id, result.order.id));
    expect(order).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED" });
  });

  it("cash on delivery waits for the customer's confirmation", async () => {
    const { cart, item } = await setup();
    const result = await placeOrder(db, await inputFor(cart.id, { paymentMethod: "COD" }));
    if (!result.ok) throw new Error(result.message);
    expect(result.order).toMatchObject({ status: "AWAITING_COD_CONFIRMATION", paymentStatus: "COD_PENDING" });
    expect(result.payment).toBeNull();
    await expect(confirmCodOrder(db, result.order.id, { token: "wrong" })).rejects.toThrow();
    const confirmed = await confirmCodOrder(db, result.order.id, { token: codConfirmToken(result.order) });
    expect(confirmed?.status).toBe("CONFIRMED");
    expect(await pool(item.id)).toMatchObject({ onHand: 8, reserved: 0 });
  });

  it("enforces coupon usage limits and gives the use back if the order expires", async () => {
    const { cart, variant } = await setup();
    await db.insert(coupons).values({ code: "WELCOME10", type: "PERCENT", value: 1000, usageLimitTotal: 1 });
    const first = await placeOrder(db, await inputFor(cart.id, { couponCode: "WELCOME10" }));
    if (!first.ok) throw new Error(first.message);
    expect(first.order.discountPaise).toBe(3_980);

    const cart2 = await createCart(db, null);
    await addToCart(db, cart2.id, variant.id, 1);
    const summary = await summarizeCart(db, { cartId: cart2.id, couponCode: "WELCOME10", pincode: "110001", paymentMethod: "PREPAID", email: "b@example.com" });
    expect(summary.coupon?.ok).toBe(false);

    await db.update(orders).set({ reservationExpiresAt: new Date(Date.now() - 10 * 60_000) }).where(eq(orders.id, first.order.id));
    await expireOverdueOrders(db);
    const [c] = await db.select().from(coupons).where(eq(coupons.code, "WELCOME10"));
    expect(c.timesUsed).toBe(0);
    const [redemption] = await db.select().from(couponRedemptions).where(eq(couponRedemptions.orderId, first.order.id));
    expect(redemption.isActive).toBe(false);
  });

  it("cancelling a paid order refunds it and returns the stock", async () => {
    const { cart, item } = await setup();
    const result = await placeOrder(db, await inputFor(cart.id));
    if (!result.ok) throw new Error(result.message);
    await processGatewayPayment(db, await pay(result.payment!.razorpayOrderId, result.order.totalPaise), "checkout");
    const [orderRow] = await db.select().from(orders).where(eq(orders.id, result.order.id));
    await cancelOrder(db, orderRow.id, { customerId: orderRow.customerId!, reason: "Changed my mind" });
    const [order] = await db.select().from(orders).where(eq(orders.id, result.order.id));
    expect(order).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED", stockState: "RETURNED" });
    expect(await pool(item.id)).toMatchObject({ onHand: 10, reserved: 0 });
  });

  it("packing issues a GST invoice and books the courier; delivery marks COD as collected", async () => {
    const { cart } = await setup();
    const result = await placeOrder(db, await inputFor(cart.id, { paymentMethod: "COD" }));
    if (!result.ok) throw new Error(result.message);
    await confirmCodOrder(db, result.order.id, { token: codConfirmToken(result.order) });
    const staff = await makeStaff();
    const packed = await packOrder(db, result.order.id, staff.id);
    expect(packed.ok).toBe(true);
    const [invoice] = await db.select().from(invoices).where(eq(invoices.orderId, result.order.id));
    expect(invoice.invoiceNumber).toMatch(/^TFD\/\d{2}-\d{2}\/00001$/);
    expect(invoice.snapshot.intraState).toBe(false); // Rajasthan → Delhi: IGST
    expect(invoice.snapshot.totals.totalPaise).toBe(result.order.totalPaise);
    expect(invoice.snapshot.totals.cgstPaise).toBe(0);

    const [shipment] = await db.select().from(shipments).where(eq(shipments.orderId, result.order.id));
    await applyShipmentUpdate(db, shipment.id, { status: "IN_TRANSIT" });
    await applyShipmentUpdate(db, shipment.id, { status: "DELIVERED" });
    const [order] = await db.select().from(orders).where(eq(orders.id, result.order.id));
    expect(order).toMatchObject({ status: "DELIVERED", paymentStatus: "COD_COLLECTED" });
    expect((await db.select().from(payments).where(eq(payments.orderId, order.id))).length).toBe(0);
  });
});
