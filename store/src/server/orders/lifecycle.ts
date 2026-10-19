/**
 * Order lifecycle after placement: COD confirmation, cancellation, packing and
 * courier booking, shipment tracking updates, delivery, returns and refunds.
 *
 *   AWAITING_PAYMENT ──paid──▶ CONFIRMED ──pack──▶ PACKED ──courier──▶ SHIPPED
 *   AWAITING_COD_CONFIRMATION ──confirm──▶ CONFIRMED          ▼
 *   (expired / cancelled) ──▶ CANCELLED      OUT_FOR_DELIVERY ──▶ DELIVERED
 *                                            DELIVERY_FAILED ──▶ RETURNED_TO_ORIGIN
 */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { orders, payments, refunds, shipmentEvents, shipments } from "@/db/schema";
import { sha256Hex, safeEqual } from "@/lib/crypto";
import { logAudit } from "../audit";
import { releaseCouponUse } from "../coupons";
import { sendEmail } from "../email/send";
import { orderCancelledEmail, orderDeliveredEmail, orderShippedEmail, refundEmail } from "../email/templates";
import { commitStock, releaseStock, returnStock } from "../inventory";
import { readSettings } from "../settings";
import { shippingProvider, ShipmentStepError, type NormalizedShipmentStatus, type TrackingEvent } from "../shipping";
import { addOrderEvent, checkOrderToken, emailOrder, loadOrderItems, lockOrder, OrderActionError, orderNeeds, orderUrl, type OrderRow } from "./common";
import { ensureInvoice, issueCreditNote } from "./invoices";
import { notifyOrderConfirmed, recomputeRefundStatus, refundViaGateway } from "./payment";

/* ---------------- COD confirmation ---------------- */

export async function confirmCodOrder(db: Database, orderId: number, by: { token?: string; staffUserId?: number }) {
  const order = await db.transaction(async (tx) => {
    const o = await lockOrder(tx, { id: orderId });
    if (!o) throw new OrderActionError("Order not found.");
    if (o.status !== "AWAITING_COD_CONFIRMATION") return null; // already confirmed or cancelled
    if (by.token !== undefined && !(o.codConfirmTokenHash && safeEqual(o.codConfirmTokenHash, sha256Hex(by.token)))) {
      throw new OrderActionError("This confirmation link isn't valid.");
    }
    if (by.token === undefined && !by.staffUserId) throw new OrderActionError("Not allowed.");
    await commitStock(tx, await orderNeeds(tx, o.id), o.id);
    const [updated] = await tx
      .update(orders)
      .set({ status: "CONFIRMED", stockState: "COMMITTED", confirmedAt: new Date(), reservationExpiresAt: null })
      .where(eq(orders.id, o.id))
      .returning();
    await addOrderEvent(tx, o.id, "cod.confirmed", by.staffUserId ? "Cash-on-delivery order confirmed by our team." : "You confirmed your cash-on-delivery order.", {
      isPublic: true,
      actor: by.staffUserId ? `staff:${by.staffUserId}` : "customer",
    });
    if (by.staffUserId) await logAudit(tx, { staffUserId: by.staffUserId, action: "order.cod_confirm", entityType: "order", entityId: o.id });
    return updated;
  });
  if (order) await notifyOrderConfirmed(db, order);
  return order;
}

/* ---------------- Cancellation ---------------- */

const CUSTOMER_CANCELLABLE: OrderRow["status"][] = ["AWAITING_PAYMENT", "AWAITING_COD_CONFIRMATION", "CONFIRMED"];
const STAFF_CANCELLABLE: OrderRow["status"][] = [...CUSTOMER_CANCELLABLE, "PACKED"];

export function canCustomerCancel(order: Pick<OrderRow, "status">) {
  return CUSTOMER_CANCELLABLE.includes(order.status);
}

export async function cancelOrder(db: Database, orderId: number, by: { customerId?: number; token?: string; staffUserId?: number; reason: string }) {
  const isStaff = by.staffUserId !== undefined;
  // If a courier shipment was booked (packed), cancel it with the courier first.
  const [activeShipment] = await db.select().from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.isActive, true)));
  if (activeShipment?.awb && isStaff) {
    try {
      await shippingProvider().cancelShipment(activeShipment.awb);
    } catch (err) {
      throw new OrderActionError(`The courier didn't accept the cancellation (${err instanceof Error ? err.message : "error"}). It may already be picked up.`);
    }
  }

  const result = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, { id: orderId });
    if (!order) throw new OrderActionError("Order not found.");
    if (!isStaff) {
      const owner = (by.customerId !== undefined && order.customerId === by.customerId) || checkOrderToken(order, by.token);
      if (!owner) throw new OrderActionError("Order not found.");
    }
    const allowed = isStaff ? STAFF_CANCELLABLE : CUSTOMER_CANCELLABLE;
    if (!allowed.includes(order.status)) {
      throw new OrderActionError(isStaff ? "This order can't be cancelled at this stage." : "This order has already been packed, so it can't be cancelled online. Please contact us.");
    }
    const needs = await orderNeeds(tx, order.id);
    if (order.stockState === "RESERVED") await releaseStock(tx, needs, order.id, "Order cancelled");
    if (order.stockState === "COMMITTED") await returnStock(tx, needs, order.id, { staffUserId: by.staffUserId ?? null, note: "Order cancelled before dispatch" });
    await releaseCouponUse(tx, order.id);
    if (activeShipment) await tx.update(shipments).set({ isActive: false, status: "CANCELLED" }).where(eq(shipments.id, activeShipment.id));

    const wasPaid = order.paymentStatus === "PAID";
    const [updated] = await tx
      .update(orders)
      .set({
        status: "CANCELLED",
        stockState: order.stockState === "RESERVED" ? "RELEASED" : order.stockState === "COMMITTED" ? "RETURNED" : order.stockState,
        paymentStatus: order.paymentMethod === "COD" ? "NOT_APPLICABLE" : order.paymentStatus === "PENDING" ? "FAILED" : order.paymentStatus,
        cancelledAt: new Date(),
        cancelReason: by.reason,
        reservationExpiresAt: null,
      })
      .where(eq(orders.id, order.id))
      .returning();
    await addOrderEvent(tx, order.id, "cancelled", isStaff ? `Cancelled by our team: ${by.reason}` : `You cancelled this order: ${by.reason}`, {
      isPublic: true,
      actor: isStaff ? `staff:${by.staffUserId}` : "customer",
    });
    if (isStaff) await logAudit(tx, { staffUserId: by.staffUserId!, action: "order.cancel", entityType: "order", entityId: order.id, data: { reason: by.reason } });

    const [payment] = wasPaid
      ? await tx.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.isDuplicate, false), eq(payments.status, "CAPTURED")))
      : [];
    return { order: updated, payment: payment ?? null };
  });

  let refundNote = "";
  if (result.payment) {
    // Paid online: refund in full automatically.
    try {
      await refundViaGateway(db, result.order, result.payment, result.order.totalPaise, "Order cancelled", by.staffUserId ?? null);
      refundNote = "We've refunded the full amount to your original payment method. It usually arrives within 5–7 working days.";
    } catch (err) {
      console.error(`[orders] automatic refund failed for ${result.order.orderNumber}:`, err);
      await db.transaction((tx) =>
        addOrderEvent(tx, result.order.id, "refund.failed", "Automatic refund failed. Please refund this order manually from the admin panel.", { actor: "system" }),
      );
      refundNote = "Your refund is being processed and our team will confirm it shortly.";
    }
  }
  await sendEmail(db, {
    to: result.order.email,
    ...orderCancelledEmail(await emailOrder(db, result.order), "", refundNote),
    template: "order-cancelled",
    orderId: result.order.id,
  });
  return result.order;
}

/* ---------------- Packing & courier booking ---------------- */

export type PackResult = { ok: true; order: OrderRow; awb: string; labelUrl: string } | { ok: false; message: string };

export async function packOrder(db: Database, orderId: number, staffUserId: number): Promise<PackResult> {
  const prepared = await db.transaction(async (tx) => {
    const order = await lockOrder(tx, { id: orderId });
    if (!order) throw new OrderActionError("Order not found.");
    if (order.status !== "CONFIRMED") throw new OrderActionError("Only confirmed orders can be packed.");
    const invoice = await ensureInvoice(tx, order);
    const [existing] = await tx.select().from(shipments).where(and(eq(shipments.orderId, order.id), eq(shipments.isActive, true)));
    return { order, invoice, existing: existing ?? null, items: await loadOrderItems(tx, order.id) };
  });
  const { order, invoice, existing, items } = prepared;
  const shipping = await readSettings(db, "shipping");
  const provider = shippingProvider();

  let created;
  try {
    created = await provider.createShipment({
      orderNumber: order.orderNumber,
      orderDate: order.placedAt,
      paymentMethod: order.paymentMethod,
      customer: { name: order.shipName, phone: order.shipPhone, email: order.email, line1: order.shipLine1, line2: [order.shipLine2, order.shipLandmark].filter(Boolean).join(", "), city: order.shipCity, state: order.shipState, pincode: order.shipPincode },
      items: items.map((i) => ({ name: `${i.productName} ${i.variantTitle}`, sku: i.sku, units: i.quantity, unitPricePaise: i.unitPricePaise, gstRateBp: i.gstRateBp, hsn: i.hsnCode })),
      subtotalPaise: order.subtotalPaise,
      discountPaise: order.discountPaise,
      shippingPaise: order.shippingPaise,
      codFeePaise: order.codFeePaise,
      totalPaise: order.totalPaise,
      weightGrams: order.totalWeightGrams,
      lengthCm: shipping.boxLengthCm,
      breadthCm: shipping.boxBreadthCm,
      heightCm: shipping.boxHeightCm,
      customerGstin: order.billingGstin,
      invoiceNumber: invoice.invoiceNumber,
      courierId: order.shippingQuote?.provider === provider.name ? order.shippingQuote.courierId : null,
      existing: existing ? { providerOrderId: existing.providerOrderId, providerShipmentId: existing.providerShipmentId, awb: existing.awb } : undefined,
    });
  } catch (err) {
    const partial = err instanceof ShipmentStepError ? err.partial : {};
    await db.transaction(async (tx) => {
      if (partial.providerShipmentId) {
        if (existing) {
          await tx.update(shipments).set({ providerOrderId: partial.providerOrderId ?? "", providerShipmentId: partial.providerShipmentId, awb: partial.awb ?? null }).where(eq(shipments.id, existing.id));
        } else {
          await tx.insert(shipments).values({ orderId: order.id, provider: provider.name, providerOrderId: partial.providerOrderId ?? "", providerShipmentId: partial.providerShipmentId, awb: partial.awb ?? null });
        }
      }
      await addOrderEvent(tx, order.id, "shipment.failed", `Courier booking failed: ${err instanceof Error ? err.message : String(err)}`, { actor: `staff:${staffUserId}` });
    });
    return { ok: false, message: `Courier booking failed: ${err instanceof Error ? err.message : String(err)}. You can retry.` };
  }

  const updated = await db.transaction(async (tx) => {
    const values = {
      orderId: order.id,
      provider: provider.name,
      providerOrderId: created.providerOrderId,
      providerShipmentId: created.providerShipmentId,
      awb: created.awb,
      courierName: created.courierName || order.shippingQuote?.courierName || "",
      status: "PICKUP_SCHEDULED" as const,
      labelUrl: created.labelUrl,
      trackingUrl: created.trackingUrl,
      costPaise: order.shippingQuote?.quotedCostPaise ?? null,
      etaDate: order.shippingQuote?.etaDate ?? null,
    };
    if (existing) await tx.update(shipments).set(values).where(eq(shipments.id, existing.id));
    else await tx.insert(shipments).values(values);
    const [o] = await tx.update(orders).set({ status: "PACKED", packedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.status, "CONFIRMED"))).returning();
    await addOrderEvent(tx, order.id, "packed", `Packed and booked with ${values.courierName} (AWB ${created.awb}).`, { isPublic: true, actor: `staff:${staffUserId}` });
    await logAudit(tx, { staffUserId, action: "order.pack", entityType: "order", entityId: order.id, data: { awb: created.awb } });
    return o ?? order;
  });
  return { ok: true, order: updated, awb: created.awb, labelUrl: created.labelUrl };
}

/** For orders sent without the courier integration (e.g. hand delivery): record shipping details manually. */
export async function markShippedManually(db: Database, orderId: number, staffUserId: number, info: { courierName: string; awb: string; trackingUrl: string }) {
  const order = await db.transaction(async (tx) => {
    const o = await lockOrder(tx, { id: orderId });
    if (!o) throw new OrderActionError("Order not found.");
    if (o.status !== "CONFIRMED" && o.status !== "PACKED") throw new OrderActionError("Only confirmed or packed orders can be marked as shipped.");
    await ensureInvoice(tx, o);
    await tx.update(shipments).set({ isActive: false }).where(eq(shipments.orderId, o.id));
    await tx.insert(shipments).values({ orderId: o.id, provider: "manual", awb: info.awb || null, courierName: info.courierName, trackingUrl: info.trackingUrl, status: "IN_TRANSIT" });
    const [updated] = await tx
      .update(orders)
      .set({ status: "SHIPPED", packedAt: o.packedAt ?? new Date(), shippedAt: new Date() })
      .where(eq(orders.id, o.id))
      .returning();
    await addOrderEvent(tx, o.id, "shipped", `Shipped with ${info.courierName}${info.awb ? ` (tracking ${info.awb})` : ""}.`, { isPublic: true, actor: `staff:${staffUserId}` });
    await logAudit(tx, { staffUserId, action: "order.ship_manual", entityType: "order", entityId: o.id, data: info });
    return updated;
  });
  await sendEmail(db, {
    to: order.email,
    ...orderShippedEmail(await emailOrder(db, order), { courier: info.courierName, awb: info.awb, trackingUrl: info.trackingUrl, orderUrl: orderUrl(order) }),
    template: "order-shipped",
    orderId: order.id,
  });
  return order;
}

/* ---------------- Tracking updates ---------------- */

const ORDER_STATUS_FOR_SHIPMENT: Partial<Record<NormalizedShipmentStatus, OrderRow["status"]>> = {
  IN_TRANSIT: "SHIPPED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  RTO_INITIATED: "DELIVERY_FAILED",
  RTO_DELIVERED: "RETURNED_TO_ORIGIN",
};

const PUBLIC_MESSAGES: Partial<Record<OrderRow["status"], string>> = {
  SHIPPED: "Your parcel is on its way.",
  OUT_FOR_DELIVERY: "Your parcel is out for delivery today.",
  DELIVERED: "Delivered. Enjoy!",
  DELIVERY_FAILED: "The courier couldn't deliver your parcel. They usually try again; we'll be in touch if needed.",
  RETURNED_TO_ORIGIN: "The parcel was returned to us after unsuccessful delivery attempts.",
};

/** Applies a tracking update from the courier webhook, the sync job or a simulated update. */
export async function applyShipmentUpdate(
  db: Database,
  shipmentId: number,
  update: { status: NormalizedShipmentStatus | null; etaDate?: string | null; events?: TrackingEvent[]; actor?: string },
) {
  const changed = await db.transaction(async (tx) => {
    const [shipment] = await tx.select().from(shipments).where(eq(shipments.id, shipmentId)).for("update");
    if (!shipment) return null;
    for (const e of update.events ?? []) {
      if (Number.isNaN(e.occurredAt.getTime())) continue;
      await tx
        .insert(shipmentEvents)
        .values({ shipmentId, status: e.status.slice(0, 100), description: e.description.slice(0, 500), location: e.location.slice(0, 200), occurredAt: e.occurredAt })
        .onConflictDoNothing();
    }
    await tx
      .update(shipments)
      .set({ status: update.status ?? shipment.status, etaDate: update.etaDate ?? shipment.etaDate, lastSyncedAt: new Date() })
      .where(eq(shipments.id, shipmentId));
    if (!update.status || update.status === shipment.status || !shipment.isActive) return null;

    const order = await lockOrder(tx, { id: shipment.orderId });
    const next = ORDER_STATUS_FOR_SHIPMENT[update.status];
    if (!order || !next || order.status === next || order.status === "CANCELLED" || order.status === "DELIVERED" || order.status === "RETURNED_TO_ORIGIN") return null;
    const now = new Date();
    const [updated] = await tx
      .update(orders)
      .set({
        status: next,
        shippedAt: next === "SHIPPED" && !order.shippedAt ? now : order.shippedAt,
        deliveredAt: next === "DELIVERED" ? now : order.deliveredAt,
        paymentStatus: next === "DELIVERED" && order.paymentMethod === "COD" ? "COD_COLLECTED" : next === "RETURNED_TO_ORIGIN" && order.paymentMethod === "COD" ? "NOT_APPLICABLE" : order.paymentStatus,
      })
      .where(eq(orders.id, order.id))
      .returning();
    await addOrderEvent(tx, order.id, `shipment.${update.status.toLowerCase()}`, PUBLIC_MESSAGES[next] ?? next, { isPublic: true, actor: update.actor ?? "courier" });
    return { order: updated, shipment, from: order.status };
  });

  if (changed) {
    const { order, shipment } = changed;
    if (order.status === "SHIPPED" && changed.from !== "SHIPPED") {
      await sendEmail(db, {
        to: order.email,
        ...orderShippedEmail(await emailOrder(db, order), { courier: shipment.courierName, awb: shipment.awb ?? "", trackingUrl: shipment.trackingUrl, orderUrl: orderUrl(order) }),
        template: "order-shipped",
        orderId: order.id,
      });
    }
    if (order.status === "DELIVERED") {
      await sendEmail(db, { to: order.email, ...orderDeliveredEmail(await emailOrder(db, order), orderUrl(order)), template: "order-delivered", orderId: order.id });
    }
  }
  return changed?.order ?? null;
}

/** Job: pulls tracking for active shipments that haven't been updated recently (webhook fallback). */
export async function syncActiveShipments(db: Database, limit = 50) {
  const provider = shippingProvider();
  if (provider.isSimulated) return 0;
  const due = await db
    .select()
    .from(shipments)
    .where(
      and(
        eq(shipments.isActive, true),
        sql`${shipments.awb} is not null`,
        sql`${shipments.status} not in ('DELIVERED','RTO_DELIVERED','CANCELLED')`,
        sql`coalesce(${shipments.lastSyncedAt}, ${shipments.createdAt}) < now() - interval '3 hours'`,
      ),
    )
    .orderBy(shipments.lastSyncedAt)
    .limit(limit);
  for (const s of due) {
    try {
      const t = await provider.track(s.awb!);
      await applyShipmentUpdate(db, s.id, { status: t.status, etaDate: t.etaDate, events: t.events });
    } catch (err) {
      console.error(`[shipping] tracking sync failed for AWB ${s.awb}:`, err);
    }
  }
  return due.length;
}

/** Staff marks an order delivered when it was shipped outside the courier integration. */
export async function markDeliveredManually(db: Database, orderId: number, staffUserId: number) {
  const [shipment] = await db.select().from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.isActive, true))).orderBy(desc(shipments.id));
  if (!shipment) throw new OrderActionError("This order has no shipment yet.");
  const order = await applyShipmentUpdate(db, shipment.id, { status: "DELIVERED", actor: `staff:${staffUserId}` });
  await db.transaction((tx) => logAudit(tx, { staffUserId, action: "order.mark_delivered", entityType: "order", entityId: orderId }));
  return order;
}

/** After a parcel comes back (RTO), put its items back into stock if they're in good condition. */
export async function restockReturnedOrder(db: Database, orderId: number, staffUserId: number) {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, { id: orderId });
    if (!order) throw new OrderActionError("Order not found.");
    if (order.status !== "RETURNED_TO_ORIGIN" || order.stockState !== "COMMITTED") throw new OrderActionError("Only returned orders that haven't been restocked can be restocked.");
    await returnStock(tx, await orderNeeds(tx, order.id), order.id, { staffUserId, note: "Returned parcel restocked" });
    await tx.update(orders).set({ stockState: "RETURNED" }).where(eq(orders.id, order.id));
    await addOrderEvent(tx, order.id, "restocked", "Returned items put back into stock.", { actor: `staff:${staffUserId}` });
    await logAudit(tx, { staffUserId, action: "order.restock_return", entityType: "order", entityId: order.id });
  });
}

/* ---------------- Refunds (staff) ---------------- */

export async function refundableAmount(db: DbOrTx, order: OrderRow): Promise<number> {
  const [{ refunded }] = await db
    .select({ refunded: sql<number>`coalesce(sum(${refunds.amountPaise}) filter (where ${refunds.status} <> 'FAILED'), 0)::int` })
    .from(refunds)
    .leftJoin(payments, eq(payments.id, refunds.paymentId))
    .where(and(eq(refunds.orderId, order.id), sql`coalesce(${payments.isDuplicate}, false) = false`));
  const collected = order.paymentMethod === "PREPAID" ? (["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.paymentStatus) ? order.totalPaise : 0) : order.paymentStatus === "COD_COLLECTED" || order.paymentStatus === "PARTIALLY_REFUNDED" || order.paymentStatus === "REFUNDED" ? order.totalPaise : 0;
  return Math.max(0, collected - refunded);
}

export async function refundOrder(
  db: Database,
  orderId: number,
  input: { amountPaise: number; reason: string; staffUserId: number; mode: "RAZORPAY" | "MANUAL"; reference: string },
) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OrderActionError("Order not found.");
  const max = await refundableAmount(db, order);
  if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) throw new OrderActionError("Enter an amount greater than zero.");
  if (input.amountPaise > max) throw new OrderActionError(`You can refund at most ₹${(max / 100).toFixed(2)} on this order.`);
  if (!input.reason.trim()) throw new OrderActionError("Give a reason for the refund.");

  if (input.mode === "RAZORPAY") {
    if (order.paymentMethod !== "PREPAID") throw new OrderActionError("Cash-on-delivery orders are refunded manually (UPI or bank transfer).");
    const [payment] = await db.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.isDuplicate, false), sql`${payments.status} in ('CAPTURED','PARTIALLY_REFUNDED')`));
    if (!payment) throw new OrderActionError("No captured payment found for this order.");
    await refundViaGateway(db, order, payment, input.amountPaise, input.reason, input.staffUserId);
  } else {
    if (!input.reference.trim()) throw new OrderActionError("Enter the UPI/bank reference for the manual refund.");
    await db.transaction(async (tx) => {
      await tx.insert(refunds).values({
        orderId: order.id,
        mode: "MANUAL",
        amountPaise: input.amountPaise,
        status: "PROCESSED",
        reason: input.reason,
        reference: input.reference,
        createdByStaffId: input.staffUserId,
        processedAt: new Date(),
      });
      await addOrderEvent(tx, order.id, "refund.manual", `Refund of ₹${(input.amountPaise / 100).toFixed(2)} sent manually (ref ${input.reference}).`, {
        isPublic: true,
        actor: `staff:${input.staffUserId}`,
      });
      await recomputeRefundStatus(tx, order.id);
    });
  }

  await db.transaction(async (tx) => {
    const [latest] = await tx.select({ id: refunds.id }).from(refunds).where(eq(refunds.orderId, order.id)).orderBy(desc(refunds.id)).limit(1);
    await issueCreditNote(tx, order.id, latest?.id ?? null, input.amountPaise);
    await logAudit(tx, { staffUserId: input.staffUserId, action: "order.refund", entityType: "order", entityId: order.id, data: { amountPaise: input.amountPaise, mode: input.mode, reason: input.reason } });
  });
  await sendEmail(db, { to: order.email, ...refundEmail(await emailOrder(db, order), input.amountPaise, input.mode), template: "refund", orderId: order.id });
}
