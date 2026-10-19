"use server";

import { and, desc, eq } from "drizzle-orm";
import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { orders, shipments } from "@/db/schema";
import { PermissionError, requireStaffAction } from "@/data/session";
import { env } from "@/lib/env";
import { rupeesToPaise } from "@/lib/money";
import { logAudit } from "@/server/audit";
import { addOrderEvent, OrderActionError } from "@/server/orders/common";
import { applyShipmentUpdate, cancelOrder, confirmCodOrder, markDeliveredManually, markShippedManually, packOrder, refundOrder, restockReturnedOrder } from "@/server/orders/lifecycle";
import { shippingProvider, type NormalizedShipmentStatus } from "@/server/shipping";

export type AdminResult = { ok: boolean; message: string } | null;

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
  const why = reason.trim().slice(0, 200);
  if (!why) return { ok: false, message: "Give a reason (it's shown to the customer)." };
  return run(async () => {
    await cancelOrder(getDb(), orderId, { staffUserId: staff.id, reason: why });
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

const shipSchema = z.object({ courierName: z.string().trim().min(2).max(80), awb: z.string().trim().max(60), trackingUrl: z.union([z.literal(""), z.url().max(500)]) });

export async function markShippedAdminAction(orderId: number, input: { courierName: string; awb: string; trackingUrl: string }): Promise<AdminResult> {
  const staff = await requireStaffAction("orders.pack");
  const parsed = shipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter the courier name, and a valid tracking link if you have one." };
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
  const amountPaise = rupeesToPaise(input.amount);
  if (amountPaise === null) return { ok: false, message: "Enter the amount in rupees, e.g. 149.50." };
  return run(async () => {
    await refundOrder(getDb(), orderId, { amountPaise, reason: input.reason.trim().slice(0, 200), staffUserId: staff.id, mode: input.mode, reference: input.reference.trim().slice(0, 100) });
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
  const text = note.trim().slice(0, 1000);
  if (!text) return { ok: false, message: "Write a note first." };
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
