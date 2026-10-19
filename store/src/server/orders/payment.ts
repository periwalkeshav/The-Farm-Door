/**
 * Online payment handling. The single entry point is processGatewayPayment(),
 * called from (1) the checkout success handler after signature verification,
 * (2) Razorpay webhooks, and (3) the reconciliation job. It is idempotent: the
 * same payment can arrive through all three paths and is applied once.
 *
 * Only a payment fetched from Razorpay's API with status "captured" and the
 * exact order amount confirms an order. The browser's word is never enough.
 */
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@/db";
import { couponRedemptions, coupons, orders, payments, refunds } from "@/db/schema";
import { env } from "@/lib/env";
import { releaseCouponUse } from "../coupons";
import { sendEmail } from "../email/send";
import { adminNewOrderEmail, latePaymentRefundEmail, orderCancelledEmail, orderConfirmedEmail, refundEmail } from "../email/templates";
import { commitStock, OutOfStockError, releaseStock, reserveStock } from "../inventory";
import { paymentGateway, type GatewayPayment } from "../payments";
import { readSettings } from "../settings";
import { addOrderEvent, emailOrder, lockOrder, orderNeeds, orderUrl, type OrderRow } from "./common";

export type PaymentOutcome =
  | "CONFIRMED"
  | "LATE_CONFIRMED"
  | "ALREADY_APPLIED"
  | "DUPLICATE_REFUNDED"
  | "LATE_REFUNDED"
  | "FAILED_ATTEMPT"
  | "AMOUNT_MISMATCH"
  | "UNKNOWN_ORDER";

type PaymentRow = typeof payments.$inferSelect;

function paymentStatus(p: GatewayPayment): PaymentRow["status"] {
  switch (p.status) {
    case "captured":
      return p.amountRefundedPaise > 0 ? (p.amountRefundedPaise >= p.amountPaise ? "REFUNDED" : "PARTIALLY_REFUNDED") : "CAPTURED";
    case "authorized":
      return "AUTHORIZED";
    case "refunded":
      return "REFUNDED";
    case "failed":
      return "FAILED";
    default:
      return "CREATED";
  }
}

async function upsertPayment(tx: DbOrTx, orderId: number, p: GatewayPayment, isDuplicate = false) {
  const values = {
    orderId,
    providerOrderId: p.orderId,
    providerPaymentId: p.id,
    amountPaise: p.amountPaise,
    status: paymentStatus(p),
    method: p.method,
    feePaise: p.feePaise,
    taxOnFeePaise: p.taxOnFeePaise,
    errorCode: p.errorCode,
    errorDescription: p.errorDescription,
    isDuplicate,
    raw: (p.raw ?? {}) as Record<string, unknown>,
  };
  const [before] = await tx.select().from(payments).where(eq(payments.providerPaymentId, p.id));
  const [row] = await tx
    .insert(payments)
    .values(values)
    .onConflictDoUpdate({
      target: payments.providerPaymentId,
      // Don't let a stale "authorized" event overwrite a later "captured".
      set: before && before.status === "CAPTURED" && values.status === "AUTHORIZED" ? { updatedAt: new Date() } : { ...values, isDuplicate: before?.isDuplicate || isDuplicate },
    })
    .returning();
  return { row, before: before ?? null };
}

export async function processGatewayPayment(db: Database, input: GatewayPayment, source: "checkout" | "webhook" | "reconcile"): Promise<{ outcome: PaymentOutcome; order: OrderRow | null }> {
  const gateway = paymentGateway();
  let payment = input;
  // Payments are normally auto-captured; capture explicitly if one is only authorised.
  if (payment.status === "authorized") payment = await gateway.capture(payment.id, payment.amountPaise);

  type TxResult = { outcome: PaymentOutcome; order: OrderRow | null; paymentRow: PaymentRow | null };
  const result: TxResult = await db.transaction(async (tx): Promise<TxResult> => {
    const order = await lockOrder(tx, { razorpayOrderId: payment.orderId });
    if (!order) return { outcome: "UNKNOWN_ORDER", order: null, paymentRow: null };

    if (payment.status === "failed") {
      const { before } = await upsertPayment(tx, order.id, payment);
      if (!before) {
        await addOrderEvent(tx, order.id, "payment.failed", `Payment attempt failed${payment.errorDescription ? `: ${payment.errorDescription}` : ""}.`, { actor: "razorpay", data: { paymentId: payment.id, source } });
      }
      return { outcome: "FAILED_ATTEMPT", order, paymentRow: null };
    }
    if (payment.status !== "captured" && payment.status !== "refunded") return { outcome: "ALREADY_APPLIED", order, paymentRow: null };

    if (payment.amountPaise !== order.totalPaise || payment.currency !== "INR") {
      const { row } = await upsertPayment(tx, order.id, payment);
      await addOrderEvent(tx, order.id, "payment.amount_mismatch", `Payment ${payment.id} amount ${payment.amountPaise} paise does not match order total ${order.totalPaise}. Needs manual review.`, {
        actor: "razorpay",
      });
      return { outcome: "AMOUNT_MISMATCH", order, paymentRow: row };
    }

    const alreadyPaid = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.paymentStatus);
    if (alreadyPaid) {
      const [existing] = await tx.select().from(payments).where(and(eq(payments.orderId, order.id), eq(payments.isDuplicate, false), inArray(payments.status, ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"])));
      if (!existing || existing.providerPaymentId === payment.id) {
        await upsertPayment(tx, order.id, payment);
        return { outcome: "ALREADY_APPLIED", order, paymentRow: null };
      }
      // A second, separate payment for an order that's already paid: refund it.
      const { row, before } = await upsertPayment(tx, order.id, payment, true);
      if (before?.isDuplicate) return { outcome: "ALREADY_APPLIED", order, paymentRow: null };
      await addOrderEvent(tx, order.id, "payment.duplicate", `Duplicate payment ${payment.id} received; refunding it in full.`, { actor: "razorpay" });
      return { outcome: "DUPLICATE_REFUNDED", order, paymentRow: row };
    }

    const { row } = await upsertPayment(tx, order.id, payment);

    if (order.status === "AWAITING_PAYMENT" && order.stockState === "RESERVED") {
      await commitStock(tx, await orderNeeds(tx, order.id), order.id);
      const [updated] = await tx
        .update(orders)
        .set({ status: "CONFIRMED", paymentStatus: "PAID", stockState: "COMMITTED", confirmedAt: new Date(), reservationExpiresAt: null })
        .where(eq(orders.id, order.id))
        .returning();
      await addOrderEvent(tx, order.id, "payment.captured", "Payment received. Order confirmed.", { isPublic: true, actor: "razorpay", data: { paymentId: payment.id, method: payment.method, source } });
      return { outcome: "CONFIRMED", order: updated, paymentRow: row };
    }

    if (order.status === "CANCELLED" && order.stockState === "RELEASED") {
      // Paid after the payment window closed. Confirm if the stock is still there, otherwise refund.
      try {
        await tx.transaction(async (sp) => {
          const needs = await orderNeeds(sp, order.id);
          await reserveStock(sp, needs, order.id);
          await commitStock(sp, needs, order.id);
        });
      } catch (err) {
        if (!(err instanceof OutOfStockError)) throw err;
        await addOrderEvent(tx, order.id, "payment.late_refund", "Payment arrived after the order expired and stock is no longer available. Refunding in full.", { actor: "system" });
        return { outcome: "LATE_REFUNDED", order, paymentRow: row };
      }
      const [updated] = await tx
        .update(orders)
        .set({ status: "CONFIRMED", paymentStatus: "PAID", stockState: "COMMITTED", confirmedAt: new Date(), cancelledAt: null, cancelReason: "" })
        .where(eq(orders.id, order.id))
        .returning();
      // Restore the coupon use given back when the order expired.
      const [redemption] = await tx
        .update(couponRedemptions)
        .set({ isActive: true })
        .where(and(eq(couponRedemptions.orderId, order.id), eq(couponRedemptions.isActive, false)))
        .returning({ couponId: couponRedemptions.couponId });
      if (redemption) await tx.update(coupons).set({ timesUsed: sql`${coupons.timesUsed} + 1` }).where(eq(coupons.id, redemption.couponId));
      await addOrderEvent(tx, order.id, "payment.captured_late", "Payment received after the payment window closed; stock was still available, so the order is confirmed.", {
        isPublic: true,
        actor: "razorpay",
        data: { paymentId: payment.id },
      });
      return { outcome: "LATE_CONFIRMED", order: updated, paymentRow: row };
    }

    await addOrderEvent(tx, order.id, "payment.unexpected", `Captured payment ${payment.id} for an order in status ${order.status}. Needs manual review.`, { actor: "razorpay" });
    return { outcome: "AMOUNT_MISMATCH", order, paymentRow: row };
  });

  // Side effects after commit.
  if (result.order && (result.outcome === "CONFIRMED" || result.outcome === "LATE_CONFIRMED")) {
    await notifyOrderConfirmed(db, result.order);
  }
  if (result.order && result.paymentRow && (result.outcome === "DUPLICATE_REFUNDED" || result.outcome === "LATE_REFUNDED")) {
    await refundViaGateway(db, result.order, result.paymentRow, result.paymentRow.amountPaise, result.outcome === "DUPLICATE_REFUNDED" ? "Duplicate payment" : "Payment after expiry; out of stock", null, {
      updateOrderStatus: result.outcome === "LATE_REFUNDED",
    });
    if (result.outcome === "LATE_REFUNDED") {
      await sendEmail(db, { to: result.order.email, ...latePaymentRefundEmail(await emailOrder(db, result.order)), template: "late-payment-refund", orderId: result.order.id });
    }
  }
  return { outcome: result.outcome, order: result.order };
}

export async function notifyOrderConfirmed(db: DbOrTx, order: OrderRow) {
  const data = await emailOrder(db, order);
  await sendEmail(db, { to: order.email, ...orderConfirmedEmail(data, orderUrl(order)), template: "order-confirmed", orderId: order.id });
  const notifications = await readSettings(db, "notifications");
  if (notifications.newOrderEmails && notifications.ownerEmail) {
    await sendEmail(db, {
      to: notifications.ownerEmail,
      ...adminNewOrderEmail(data, `${env().APP_URL}/admin/orders/${order.id}`),
      template: "admin-new-order",
      orderId: order.id,
    });
  }
}

/**
 * Refunds through Razorpay and records it. Throws if the gateway rejects it.
 * `updateOrderStatus` recalculates the order's payment status from all refunds.
 */
export async function refundViaGateway(
  db: Database,
  order: OrderRow,
  payment: PaymentRow,
  amountPaise: number,
  reason: string,
  staffUserId: number | null,
  opts: { updateOrderStatus?: boolean } = { updateOrderStatus: true },
) {
  const gateway = paymentGateway();
  const refund = await gateway.refund(payment.providerPaymentId, amountPaise, { order_number: order.orderNumber, reason: reason.slice(0, 200) });
  await db.transaction(async (tx) => {
    await tx.insert(refunds).values({
      orderId: order.id,
      paymentId: payment.id,
      mode: "RAZORPAY",
      providerRefundId: refund.id,
      amountPaise,
      status: refund.status === "processed" ? "PROCESSED" : refund.status === "failed" ? "FAILED" : "PENDING",
      reason,
      createdByStaffId: staffUserId,
      processedAt: refund.status === "processed" ? new Date() : null,
    });
    await addOrderEvent(tx, order.id, "refund.created", `Refund of ₹${(amountPaise / 100).toFixed(2)} issued via Razorpay (${reason}).`, {
      isPublic: true,
      actor: staffUserId ? `staff:${staffUserId}` : "system",
      data: { refundId: refund.id },
    });
    if (opts.updateOrderStatus !== false) await recomputeRefundStatus(tx, order.id);
  });
  return refund;
}

/** Sets the order's payment status from the refunds issued so far. */
export async function recomputeRefundStatus(tx: DbOrTx, orderId: number) {
  const [order] = await tx.select().from(orders).where(eq(orders.id, orderId));
  if (!order) return;
  // Refunds of duplicate payments don't count against the order itself.
  const [{ refunded }] = await tx
    .select({ refunded: sql<number>`coalesce(sum(${refunds.amountPaise}) filter (where ${refunds.status} <> 'FAILED'), 0)::int` })
    .from(refunds)
    .leftJoin(payments, eq(payments.id, refunds.paymentId))
    .where(and(eq(refunds.orderId, orderId), sql`coalesce(${payments.isDuplicate}, false) = false`));
  if (refunded <= 0) return;
  await tx
    .update(orders)
    .set({ paymentStatus: refunded >= order.totalPaise ? "REFUNDED" : "PARTIALLY_REFUNDED" })
    .where(eq(orders.id, orderId));
}

/** Cancels an order that was never paid / never confirmed and gives back its stock hold and coupon use. */
export async function cancelUnconfirmedOrder(tx: DbOrTx, order: OrderRow, reason: string, actor: string) {
  if (order.status !== "AWAITING_PAYMENT" && order.status !== "AWAITING_COD_CONFIRMATION") return false;
  if (order.stockState === "RESERVED") await releaseStock(tx, await orderNeeds(tx, order.id), order.id, reason);
  await releaseCouponUse(tx, order.id);
  await tx
    .update(orders)
    .set({
      status: "CANCELLED",
      paymentStatus: order.paymentMethod === "COD" ? "NOT_APPLICABLE" : "FAILED",
      stockState: order.stockState === "RESERVED" ? "RELEASED" : order.stockState,
      cancelledAt: new Date(),
      cancelReason: reason,
      reservationExpiresAt: null,
    })
    .where(eq(orders.id, order.id));
  await addOrderEvent(tx, order.id, "cancelled", reason, { isPublic: true, actor });
  return true;
}

/**
 * Job: expires unpaid prepaid orders (after checking Razorpay for a payment we
 * may have missed) and unconfirmed COD orders. Safe to run often.
 */
export async function expireOverdueOrders(db: Database): Promise<{ expired: number; recovered: number }> {
  const graceMs = 2 * 60 * 1000;
  const overdue = await db
    .select()
    .from(orders)
    .where(and(inArray(orders.status, ["AWAITING_PAYMENT", "AWAITING_COD_CONFIRMATION"]), lt(orders.reservationExpiresAt, new Date(Date.now() - graceMs))))
    .limit(200);
  let expired = 0;
  let recovered = 0;
  const gateway = paymentGateway();
  for (const candidate of overdue) {
    if (candidate.paymentMethod === "PREPAID" && candidate.razorpayOrderId) {
      try {
        const attempts = await gateway.fetchOrderPayments(candidate.razorpayOrderId);
        const paid = attempts.find((p) => p.status === "captured" || p.status === "authorized");
        if (paid) {
          const r = await processGatewayPayment(db, paid, "reconcile");
          if (r.outcome === "CONFIRMED") {
            recovered++;
            continue;
          }
        }
      } catch (err) {
        // If Razorpay can't be reached, try again on the next run rather than cancelling.
        console.error(`[orders] could not check payments for ${candidate.orderNumber}:`, err);
        continue;
      }
    }
    const cancelled = await db.transaction(async (tx) => {
      const order = await lockOrder(tx, { id: candidate.id });
      if (!order) return null;
      const reason =
        order.paymentMethod === "COD" ? "Cancelled automatically: the cash-on-delivery order wasn't confirmed in time." : "Cancelled automatically: payment wasn't completed in time.";
      return (await cancelUnconfirmedOrder(tx, order, reason, "system")) ? order : null;
    });
    if (cancelled) {
      expired++;
      if (cancelled.paymentMethod === "COD") {
        await sendEmail(db, {
          to: cancelled.email,
          ...orderCancelledEmail(await emailOrder(db, cancelled), "It wasn't confirmed within the time limit.", ""),
          template: "order-cancelled",
          orderId: cancelled.id,
        });
      }
    }
  }
  return { expired, recovered };
}

export async function recordRefundWebhook(db: Database, providerRefundId: string, status: "processed" | "failed") {
  await db.transaction(async (tx) => {
    const [refund] = await tx
      .update(refunds)
      .set({ status: status === "processed" ? "PROCESSED" : "FAILED", processedAt: status === "processed" ? new Date() : null })
      .where(eq(refunds.providerRefundId, providerRefundId))
      .returning();
    if (!refund) return;
    if (status === "failed") await addOrderEvent(tx, refund.orderId, "refund.failed", `Razorpay reports refund ${providerRefundId} failed. Please retry or refund manually.`, { actor: "razorpay" });
    await recomputeRefundStatus(tx, refund.orderId);
  });
}

export { refundEmail };
