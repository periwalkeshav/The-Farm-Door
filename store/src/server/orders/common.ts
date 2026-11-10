import { asc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { orderEvents, orderItems, orders } from "@/db/schema";
import { hmacHex, safeEqual, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { EmailOrder } from "../email/templates";
import { aggregateNeeds } from "../inventory";

export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;

/** Secret token in links that let a guest open their order (derived, so it can be re-sent in later emails). */
export function orderAccessToken(order: Pick<OrderRow, "id" | "idempotencyKey">): string {
  return hmacHex(env().AUTH_SECRET, `order-access:${order.id}:${order.idempotencyKey}`).slice(0, 40);
}

export function codConfirmToken(order: Pick<OrderRow, "id" | "idempotencyKey">): string {
  return hmacHex(env().AUTH_SECRET, `cod-confirm:${order.id}:${order.idempotencyKey}`).slice(0, 40);
}

export function checkOrderToken(order: Pick<OrderRow, "accessTokenHash">, token: string | null | undefined): boolean {
  return !!token && safeEqual(order.accessTokenHash, sha256Hex(token));
}

export function orderUrl(order: Pick<OrderRow, "id" | "idempotencyKey" | "orderNumber">): string {
  return `${env().APP_URL}/orders/${order.orderNumber}?t=${orderAccessToken(order)}`;
}

export async function addOrderEvent(
  tx: DbOrTx,
  orderId: number,
  type: string,
  message: string,
  opts: { isPublic?: boolean; actor?: string; data?: Record<string, unknown> } = {},
) {
  await tx.insert(orderEvents).values({ orderId, type, message, isPublic: opts.isPublic ?? false, actor: opts.actor ?? "system", data: opts.data ?? {} });
}

export async function loadOrderItems(tx: DbOrTx, orderId: number) {
  return tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id));
}

export async function orderNeeds(tx: DbOrTx, orderId: number) {
  const items = await loadOrderItems(tx, orderId);
  return aggregateNeeds(items.map((i) => ({ inventoryItemId: i.inventoryItemId, unitsPerSale: i.unitsPerSale, quantity: i.quantity })));
}

/** Locks the order row for the rest of the transaction. */
export async function lockOrder(tx: DbOrTx, where: { id?: number; razorpayOrderId?: string }) {
  const condition = where.id !== undefined ? eq(orders.id, where.id) : eq(orders.razorpayOrderId, where.razorpayOrderId!);
  const [order] = await tx.select().from(orders).where(condition).for("update");
  return order ?? null;
}

export function formatAddress(o: Pick<OrderRow, "shipLine1" | "shipLine2" | "shipLandmark" | "shipCity" | "shipState" | "shipPincode">) {
  return [o.shipLine1, o.shipLine2, o.shipLandmark && `Near ${o.shipLandmark}`, `${o.shipCity}, ${o.shipState} ${o.shipPincode}`].filter(Boolean).join(", ");
}

export async function emailOrder(tx: DbOrTx, order: OrderRow): Promise<EmailOrder> {
  const items = await loadOrderItems(tx, order.id);
  return {
    orderNumber: order.orderNumber,
    shipName: order.shipName,
    totalPaise: order.totalPaise,
    paymentMethod: order.paymentMethod,
    items: items.map((i) => ({ productName: i.productName, variantTitle: i.variantTitle, quantity: i.quantity, lineTotalPaise: i.lineTotalPaise })),
    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    shippingPaise: order.shippingPaise,
    codFeePaise: order.codFeePaise,
    address: formatAddress(order),
  };
}

export const STATUS_LABELS: Record<OrderRow["status"], string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  AWAITING_COD_CONFIRMATION: "Awaiting your confirmation",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery attempt failed",
  RETURNED_TO_ORIGIN: "Returned to us",
  CANCELLED: "Cancelled",
};

export const PAYMENT_STATUS_LABELS: Record<OrderRow["paymentStatus"], string> = {
  PENDING: "Pending",
  PAID: "Paid",
  FAILED: "Not paid",
  COD_PENDING: "To collect",
  COD_COLLECTED: "Cash collected",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  NOT_APPLICABLE: "Not applicable",
};

/** The payment line customers see on their order page, under "Cash on delivery" or "Online payment". */
export const PAYMENT_STATUS_FOR_CUSTOMER: Record<OrderRow["paymentStatus"], string> = {
  PENDING: "Not paid yet",
  PAID: "Paid",
  FAILED: "Payment didn't go through",
  COD_PENDING: "Pay when it arrives",
  COD_COLLECTED: "Paid on delivery",
  PARTIALLY_REFUNDED: "Partly refunded",
  REFUNDED: "Refunded",
  NOT_APPLICABLE: "",
};

export class OrderActionError extends Error {}
