"use server";

import { eq } from "drizzle-orm";
import { refresh, revalidateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { orders } from "@/db/schema";
import { clientIp } from "@/data/request";
import { getCustomer } from "@/data/session";
import { checkOrderToken, OrderActionError, orderAccessToken } from "@/server/orders/common";
import { cancelOrder, confirmCodOrder } from "@/server/orders/lifecycle";
import { hitRateLimit } from "@/server/rate-limit";

export type ActionResult = { ok: boolean; message: string } | null;

async function findOrder(orderNumber: string) {
  const [order] = await getDb().select().from(orders).where(eq(orders.orderNumber, orderNumber));
  return order ?? null;
}

export async function confirmCodAction(orderNumber: string, confirmToken: string): Promise<ActionResult> {
  const order = await findOrder(orderNumber);
  if (!order) return { ok: false, message: "Order not found." };
  try {
    const confirmed = await confirmCodOrder(getDb(), order.id, { token: confirmToken });
    revalidateTag("stock", "max");
    refresh();
    return confirmed ? { ok: true, message: "Thank you! Your order is confirmed and we'll start packing it." } : { ok: true, message: "This order was already confirmed." };
  } catch (err) {
    if (err instanceof OrderActionError) return { ok: false, message: err.message };
    throw err;
  }
}

export async function cancelOrderAction(orderNumber: string, token: string, reason: string): Promise<ActionResult> {
  const db = getDb();
  if (!(await hitRateLimit(db, `cancel:${await clientIp()}`, 10, 600)).allowed) return { ok: false, message: "Please try again in a few minutes." };
  const order = await findOrder(orderNumber);
  if (!order) return { ok: false, message: "Order not found." };
  const customer = await getCustomer();
  const ownerBySession = customer && order.customerId === customer.id;
  if (!ownerBySession && !checkOrderToken(order, token)) return { ok: false, message: "Order not found." };
  const why = z.string().trim().max(200).catch("").parse(reason) || "No reason given";
  try {
    await cancelOrder(db, order.id, ownerBySession ? { customerId: customer!.id, reason: why } : { token, reason: why });
    revalidateTag("stock", "max");
    refresh();
    return { ok: true, message: "Your order has been cancelled." };
  } catch (err) {
    if (err instanceof OrderActionError) return { ok: false, message: err.message };
    throw err;
  }
}

export type TrackState = { ok: false; message: string } | { ok: true; orderNumber: string; token: string } | null;

/** Track an order with its number plus the email or phone used. */
export async function trackOrderAction(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const db = getDb();
  if (!(await hitRateLimit(db, `track:${await clientIp()}`, 20, 600)).allowed) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const orderNumber = String(formData.get("orderNumber") ?? "").replace(/\D/g, "").slice(0, 12);
  const contact = String(formData.get("contact") ?? "").trim().toLowerCase();
  const order = orderNumber ? await findOrder(orderNumber) : null;
  const digits = contact.replace(/\D/g, "").slice(-10);
  const match = order && (order.email === contact || (digits.length === 10 && (order.phone === digits || order.shipPhone === digits)));
  if (!order || !match) return { ok: false, message: "We couldn't find an order with those details. Check the order number and the email or mobile number you used." };
  return { ok: true, orderNumber: order.orderNumber, token: orderAccessToken(order) };
}
