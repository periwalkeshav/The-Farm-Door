"use server";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { orders, shipments } from "@/db/schema";
import { PermissionError, requireStaffAction } from "@/data/session";
import { env } from "@/lib/env";
import { cancelReasonSchema, manualShipSchema, orderNoteSchema, refundFormSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { logAudit } from "@/server/audit";
import { addOrderEvent, OrderActionError } from "@/server/orders/common";
import { applyShipmentUpdate, cancelOrder, confirmCodOrder, markDeliveredManually, markShippedManually, packOrder, refundOrder, restockReturnedOrder } from "@/server/orders/lifecycle";
import { shippingProvider, type NormalizedShipmentStatus } from "@/server/shipping";

export type AdminResult = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

const invalid = (error: z.ZodError): AdminResult => ({ ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(error) });

async function run(fn: () => Promise<string>): Promise<AdminResult> {
  try {
    const message = await fn();
    revalidateTag("stock", "max");
    refresh();
    return { ok: true, message };
  } catch (err) {
    if (err instanceof OrderActionError || err instanceof PermissionError) return { ok: false, message: err.message };
    console.error("[admin] order action failed:", err);
    return { ok: false, message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export async function confirmCodAdminAction(orderId: number): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.manage");
  return run(async () => {
    await confirmCodOrder(getDb(), orderId, { staffUserId: staff.id });
    return "Order confirmed.";
  });
}

export async function cancelAdminAction(orderId: number, reason: string): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.manage");
  const parsed = cancelReasonSchema.safeParse({ reason });
  if (!parsed.success) return invalid(parsed.error);
  return run(async () => {
    await cancelOrder(getDb(), orderId, { staffUserId: staff.id, reason: parsed.data.reason });
    return "Order cancelled. Any online payment has been refunded automatically.";
  });
}

export async function packAdminAction(orderId: number): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.pack");
  return run(async () => {
    const r = await packOrder(getDb(), orderId, staff.id);
    if (!r.ok) throw new OrderActionError(r.message);
    return `Packed and booked. AWB ${r.awb}.`;
  });
}

export async function markShippedAdminAction(orderId: number, input: { courierName: string; awb: string; trackingUrl: string }): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.pack");
  const parsed = manualShipSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  return run(async () => {
    await markShippedManually(getDb(), orderId, staff.id, parsed.data);
    return "Marked as shipped. The customer has been emailed.";
  });
}

export async function markDeliveredAdminAction(orderId: number): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.manage");
  return run(async () => {
    await markDeliveredManually(getDb(), orderId, staff.id);
    return "Marked as delivered.";
  });
}

export async function refundAdminAction(orderId: number, input: { amount: string; reason: string; mode: "RAZORPAY" | "MANUAL"; reference: string }): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.refund");
  // The real limit (what's still refundable) is enforced by refundOrder.
  const parsed = refundFormSchema(Number.MAX_SAFE_INTEGER).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  return run(async () => {
    await refundOrder(getDb(), orderId, { amountPaise: d.amount, reason: d.reason, staffUserId: staff.id, mode: d.mode, reference: d.reference });
    return "Refund recorded and the customer has been emailed.";
  });
}

export async function restockAdminAction(orderId: number): Promise<AdminResult> {
  const staff = await requireStaffAction("inventory.manage");
  return run(async () => {
    await restockReturnedOrder(getDb(), orderId, staff.id);
    return "Items put back into stock.";
  });
}

export async function addNoteAdminAction(orderId: number, note: string): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.manage");
  const parsed = orderNoteSchema.safeParse({ note });
  if (!parsed.success) return invalid(parsed.error);
  const text = parsed.data.note;
  return run(async () => {
    await getDb().transaction(async (tx) => {
      await addOrderEvent(tx, orderId, "note", text, { actor: `staff:${staff.id}` });
      await logAudit(tx, { staffUserId: staff.id, action: "order.note", entityType: "order", entityId: orderId });
    });
    return "Note added.";
  });
}

export async function syncTrackingAdminAction(orderId: number): Promise<AdminResult> {
  await requireStaffAction("orders.view");
  return run(async () => {
    const db = getDb();
    const [s] = await db.select().from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.isActive, true))).orderBy(desc(shipments.id));
    if (!s?.awb) throw new OrderActionError("No courier shipment to track yet.");
    const provider = shippingProvider();
    if (provider.isSimulated) throw new OrderActionError("Tracking is simulated in test mode; use 'Simulate courier update'.");
    const t = await provider.track(s.awb);
    await applyShipmentUpdate(db, s.id, { status: t.status, etaDate: t.etaDate, events: t.events });
    return `Tracking updated${t.rawStatus ? `: ${t.rawStatus}` : ""}.`;
  });
}

/** DEVELOPMENT ONLY: moves a simulated shipment along so the full lifecycle can be tested. */
export async function simulateCourierAdminAction(orderId: number, status: NormalizedShipmentStatus): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.manage");
  if (env().SHIPPING_PROVIDER !== "mock") return { ok: false, message: "Only available with the simulated courier." };
  return run(async () => {
    const db = getDb();
    const [s] = await db.select().from(shipments).where(and(eq(shipments.orderId, orderId), eq(shipments.isActive, true))).orderBy(desc(shipments.id));
    if (!s) throw new OrderActionError("Pack the order first.");
    const label = status.replaceAll("_", " ").toLowerCase();
    await applyShipmentUpdate(db, s.id, {
      status,
      events: [{ status: status, description: `Simulated courier update: ${label}`, location: "Test hub", occurredAt: new Date() }],
      actor: `staff:${staff.id}`,
    });
    const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    return `Simulated "${label}". Order is now ${o.status.toLowerCase().replaceAll("_", " ")}.`;
  });
}

export type BulkPackResult = { orderNumber: string; ok: boolean; message: string }[];

/** Packs and books the courier for several confirmed orders, one after another. */
export async function packOrdersAction(orderIds: number[]): Promise<{ results: BulkPackResult } | { error: string }> {
  const staff = await requireStaffAction("orders.pack");
  const ids = [...new Set(orderIds.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 50);
  if (!ids.length) return { error: "Select orders to pack first." };
  const db = getDb();
  const rows = await db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status }).from(orders).where(inArray(orders.id, ids));
  const results: BulkPackResult = [];
  for (const o of rows) {
    if (o.status !== "CONFIRMED") {
      results.push({ orderNumber: o.orderNumber, ok: false, message: "Skipped: not waiting to be packed." });
      continue;
    }
    try {
      const r = await packOrder(db, o.id, staff.id);
      results.push(r.ok ? { orderNumber: o.orderNumber, ok: true, message: `Booked, AWB ${r.awb}` } : { orderNumber: o.orderNumber, ok: false, message: r.message });
    } catch (err) {
      results.push({ orderNumber: o.orderNumber, ok: false, message: err instanceof OrderActionError ? err.message : "Couldn't pack this order. Try it from the order page." });
      if (!(err instanceof OrderActionError)) console.error(`[orders] bulk pack failed for ${o.orderNumber}:`, err);
    }
  }
  revalidateTag("stock", "max");
  refresh();
  return { results };
}

/** One PDF with the courier labels for the selected packed orders. */
export async function combinedLabelAction(orderIds: number[]): Promise<{ url: string } | { error: string }> {
  await requireStaffAction("orders.pack");
  const ids = [...new Set(orderIds.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 100);
  if (!ids.length) return { error: "Select packed orders first." };
  const db = getDb();
  const rows = await db
    .select({ providerShipmentId: shipments.providerShipmentId, provider: shipments.provider })
    .from(shipments)
    .where(and(inArray(shipments.orderId, ids), ne(shipments.status, "CANCELLED")));
  const provider = shippingProvider();
  const own = rows.filter((r) => r.provider === provider.name && r.providerShipmentId);
  if (!own.length) return { error: "None of the selected orders has a courier booking yet. Pack them first." };
  if (provider.isSimulated) return { error: "Test mode: the simulated courier doesn't make labels. Real labels appear once Shiprocket is connected." };
  try {
    const url = await provider.combinedLabel(own.map((r) => r.providerShipmentId));
    return url ? { url } : { error: "The courier didn't return a label. Try again in a minute." };
  } catch (err) {
    return { error: `The courier couldn't make the labels (${err instanceof Error ? err.message : "error"}).` };
  }
}
