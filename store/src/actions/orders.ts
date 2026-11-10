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
import { MAX_PROBLEM_PHOTOS, problemReportSchema, trackSchema } from "@/lib/form-schemas";
import { fieldErrorsFrom, type FieldErrors } from "@/lib/validation";
import { hitRateLimit } from "@/server/rate-limit";
import { createProblemReport, ProblemError } from "@/server/problems";
import { checkRefillStopToken, RefillError, setRefillReminder, stopRefillReminder } from "@/server/refills";

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

export type TrackState = { ok: false; message: string; fieldErrors?: FieldErrors } | { ok: true; orderNumber: string; token: string } | null;

/** Track an order with its number plus the email or phone used. */
export async function trackOrderAction(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const db = getDb();
  if (!(await hitRateLimit(db, `track:${await clientIp()}`, 20, 600)).allowed) return { ok: false, message: "Too many attempts. Please wait a few minutes." };
  const parsed = trackSchema.safeParse({ orderNumber: formData.get("orderNumber"), contact: formData.get("contact") });
  if (!parsed.success) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const orderNumber = parsed.data.orderNumber;
  const contact = parsed.data.contact.toLowerCase();
  const order = await findOrder(orderNumber);
  const digits = contact.replace(/\D/g, "").slice(-10);
  const match = order && (order.email === contact || (digits.length === 10 && (order.phone === digits || order.shipPhone === digits)));
  if (!order || !match) return { ok: false, message: "We couldn't find an order with those details. Check the order number and the email or mobile number you used." };
  return { ok: true, orderNumber: order.orderNumber, token: orderAccessToken(order) };
}

export type RefillState = { ok: boolean; message: string; intervalDays?: number | null } | null;

async function ownedOrder(orderNumber: string, token: string) {
  const order = await findOrder(String(orderNumber).slice(0, 20));
  if (!order) return null;
  const customer = await getCustomer();
  return (customer && order.customerId === customer.id) || checkOrderToken(order, token) ? order : null;
}

/** "Remind me to reorder every …" on a delivered order (0 stops it). */
export async function setRefillAction(orderNumber: string, token: string, intervalDays: number): Promise<RefillState> {
  const db = getDb();
  if (!(await hitRateLimit(db, `refill:${await clientIp()}`, 20, 600)).allowed) return { ok: false, message: "Please try again in a few minutes." };
  const order = await ownedOrder(orderNumber, token);
  if (!order) return { ok: false, message: "Order not found." };
  if (!intervalDays) {
    await stopRefillReminder(db, { orderId: order.id });
    refresh();
    return { ok: true, message: "Reminder stopped.", intervalDays: null };
  }
  try {
    const r = await setRefillReminder(db, order, intervalDays);
    refresh();
    return { ok: true, message: `Done. We'll email you every ${r.label}, starting ${r.nextRemindAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}.`, intervalDays };
  } catch (err) {
    if (err instanceof RefillError) return { ok: false, message: err.message };
    throw err;
  }
}

/** From the "stop these reminders" link in a reminder email. */
export async function stopRefillByLinkAction(id: number, token: string): Promise<RefillState> {
  if (!Number.isInteger(id) || !checkRefillStopToken(id, token)) return { ok: false, message: "This link isn't valid. Please use the link from your email." };
  await stopRefillReminder(getDb(), { id });
  return { ok: true, message: "Done. You won't get any more reorder reminders for that order." };
}

export type ProblemState = { ok: boolean; message: string; fieldErrors?: FieldErrors } | null;

/** "Report a problem" on a delivered order: items, what went wrong, and photos. */
export async function reportProblemAction(orderNumber: string, token: string, _prev: ProblemState, formData: FormData): Promise<ProblemState> {
  const db = getDb();
  const ip = await clientIp();
  if (!(await hitRateLimit(db, `problem:${ip}`, 5, 3600)).allowed) return { ok: false, message: "Too many reports from this connection. Please email us instead." };
  const order = await ownedOrder(orderNumber, token);
  if (!order) return { ok: false, message: "Order not found." };
  const parsed = problemReportSchema.safeParse({ items: formData.getAll("items"), kind: formData.get("kind"), description: formData.get("description") });
  if (!parsed.success) return { ok: false, message: "Please check the highlighted fields.", fieldErrors: fieldErrorsFrom(parsed.error) };
  const files = formData.getAll("photos").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f && f.size > 0);
  if (!files.length) return { ok: false, message: "Add at least one photo.", fieldErrors: { photos: "Add at least one photo of the item and its packaging." } };
  if (files.length > MAX_PROBLEM_PHOTOS) return { ok: false, message: `You can add up to ${MAX_PROBLEM_PHOTOS} photos.`, fieldErrors: { photos: `Choose up to ${MAX_PROBLEM_PHOTOS} photos.` } };
  try {
    await createProblemReport(db, order, {
      kind: parsed.data.kind,
      description: parsed.data.description,
      orderItemIds: parsed.data.items,
      photos: await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer()))),
    });
    // No refresh: the page would swap the form (and this thank-you) for the report's status.
    return { ok: true, message: "Thanks. We've got your report and photos, and we'll email you about a replacement or refund." };
  } catch (err) {
    if (err instanceof ProblemError) return { ok: false, message: err.message };
    throw err;
  }
}
