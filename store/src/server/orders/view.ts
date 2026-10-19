import { and, asc, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { invoices, orderEvents, orders, refunds, shipmentEvents, shipments } from "@/db/schema";
import { loadOrderItems, type OrderRow } from "./common";

export async function loadOrderDetail(db: DbOrTx, order: OrderRow, opts: { publicOnly: boolean }) {
  const [items, events, shipmentRows, invoiceRows, refundRows] = await Promise.all([
    loadOrderItems(db, order.id),
    db
      .select()
      .from(orderEvents)
      .where(opts.publicOnly ? and(eq(orderEvents.orderId, order.id), eq(orderEvents.isPublic, true)) : eq(orderEvents.orderId, order.id))
      .orderBy(desc(orderEvents.createdAt), desc(orderEvents.id)),
    db.select().from(shipments).where(eq(shipments.orderId, order.id)).orderBy(desc(shipments.id)),
    db.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.orderId, order.id)),
    db.select().from(refunds).where(eq(refunds.orderId, order.id)).orderBy(asc(refunds.createdAt)),
  ]);
  const shipment = shipmentRows.find((s) => s.isActive) ?? shipmentRows[0] ?? null;
  const tracking = shipment ? await db.select().from(shipmentEvents).where(eq(shipmentEvents.shipmentId, shipment.id)).orderBy(desc(shipmentEvents.occurredAt)).limit(30) : [];
  return { order, items, events, shipment, shipments: shipmentRows, tracking, invoice: invoiceRows[0] ?? null, refunds: refundRows };
}

export type OrderDetail = Awaited<ReturnType<typeof loadOrderDetail>>;

export async function findOrderByNumber(db: DbOrTx, orderNumber: string) {
  if (!/^\d{1,12}$/.test(orderNumber)) return null;
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
  return order ?? null;
}
