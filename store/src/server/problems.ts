/**
 * Problems with delivered orders: damaged, wrong, expired or missing items.
 *
 * The customer reports it from their order page within 48 hours of delivery
 * (as the refund policy says), with photos. Staff see reports in Admin >
 * Problem reports and resolve each one by sending a free replacement, refunding
 * (part of) the order, or replying and closing it. The customer is emailed at
 * each step.
 *
 * Photos are re-encoded on upload (which also strips location data from phone
 * pictures) and kept apart from catalogue images: only signed-in staff can see them.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import type { Database, DbOrTx } from "@/db";
import { orderItems, orders, problemPhotos, problemReports, productVariants } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { MAX_PROBLEM_PHOTOS, PROBLEM_KINDS } from "@/lib/form-schemas";
import { logAudit } from "./audit";
import { sendEmail } from "./email/send";
import { problemClosedEmail, problemOwnerEmail, problemReceivedEmail, replacementSentEmail } from "./email/templates";
import { aggregateNeeds, commitStock, OutOfStockError, reserveStock } from "./inventory";
import { nextOrderNumber } from "./counters";
import { addOrderEvent, emailOrder, loadOrderItems, lockOrder, OrderActionError, orderAccessToken, orderUrl, type OrderRow } from "./orders/common";
import { refundableAmount, refundOrder } from "./orders/lifecycle";
import { readSettings } from "./settings";

export const REPORT_WINDOW_HOURS = 48;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export type ProblemKind = (typeof PROBLEM_KINDS)[number];
export type ProblemStatus = (typeof problemReports.$inferSelect)["status"];

export const PROBLEM_KIND_LABELS: Record<ProblemKind, string> = {
  DAMAGED: "Damaged or leaking",
  WRONG_ITEM: "Wrong item sent",
  EXPIRED: "Past its best-before date",
  MISSING: "Item missing from the parcel",
  OTHER: "Something else",
};

export const PROBLEM_STATUS_LABELS: Record<ProblemStatus, string> = {
  OPEN: "Open",
  REPLACEMENT_SENT: "Replacement sent",
  REFUNDED: "Refunded",
  CLOSED: "Closed",
};

/** What the customer sees about their report. */
export const PROBLEM_STATUS_FOR_CUSTOMER: Record<ProblemStatus, string> = {
  OPEN: "We're looking into it and will email you soon.",
  REPLACEMENT_SENT: "We're sending you a free replacement.",
  REFUNDED: "We've refunded you.",
  CLOSED: "Closed.",
};

export class ProblemError extends Error {}

export function reportDeadline(order: Pick<OrderRow, "deliveredAt">): Date | null {
  return order.deliveredAt ? new Date(order.deliveredAt.getTime() + REPORT_WINDOW_HOURS * 3600_000) : null;
}

/** Delivered within the last 48 hours. */
export function canReportProblem(order: Pick<OrderRow, "status" | "deliveredAt">, now = new Date()) {
  const deadline = reportDeadline(order);
  return order.status === "DELIVERED" && !!deadline && now < deadline;
}

export async function reportsForOrder(db: DbOrTx, orderId: number) {
  return db.select().from(problemReports).where(eq(problemReports.orderId, orderId)).orderBy(desc(problemReports.createdAt));
}

/** Re-encodes a customer photo as WebP (max 1600 px). Strips EXIF, including GPS location. */
export async function processProblemPhoto(input: Buffer) {
  if (input.length === 0) throw new ProblemError("One of the photos is empty. Please choose it again.");
  if (input.length > MAX_PHOTO_BYTES) throw new ProblemError("Each photo must be 8 MB or smaller.");
  try {
    const out = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new ProblemError("One of the files isn't a photo we can read. Please use JPEG, PNG or WebP photos.");
  }
}

export async function createProblemReport(
  db: Database,
  order: OrderRow,
  input: { kind: ProblemKind; description: string; orderItemIds: number[]; photos: Buffer[] },
  now = new Date(),
) {
  if (!canReportProblem(order, now)) {
    throw new ProblemError(order.status === "DELIVERED" ? `Problems can be reported within ${REPORT_WINDOW_HOURS} hours of delivery. Please reply to your delivery email and we'll help.` : "You can report a problem once your order has been delivered.");
  }
  if (input.photos.length === 0) throw new ProblemError("Add at least one photo of the item and its packaging.");
  if (input.photos.length > MAX_PROBLEM_PHOTOS) throw new ProblemError(`You can add up to ${MAX_PROBLEM_PHOTOS} photos.`);
  const items = await loadOrderItems(db, order.id);
  const chosen = items.filter((i) => input.orderItemIds.includes(i.id));
  if (!chosen.length || chosen.length !== new Set(input.orderItemIds).size) throw new ProblemError("Tick the item (or items) with the problem.");
  const photos = await Promise.all(input.photos.map(processProblemPhoto));

  const report = await db.transaction(async (tx) => {
    await lockOrder(tx, { id: order.id });
    const [open] = await tx.select({ id: problemReports.id }).from(problemReports).where(and(eq(problemReports.orderId, order.id), eq(problemReports.status, "OPEN")));
    if (open) throw new ProblemError("You've already reported a problem with this order. We'll be in touch by email; reply to it if you have more to add.");
    const [row] = await tx
      .insert(problemReports)
      .values({ orderId: order.id, kind: input.kind, description: input.description, orderItemIds: chosen.map((i) => i.id) })
      .returning();
    await tx.insert(problemPhotos).values(photos.map((p) => ({ reportId: row.id, width: p.width, height: p.height, data: p.data })));
    await addOrderEvent(tx, order.id, "problem.reported", `You reported a problem: ${PROBLEM_KIND_LABELS[input.kind].toLowerCase()}. We'll email you about a replacement or refund.`, {
      isPublic: true,
      actor: "customer",
      data: { reportId: row.id },
    });
    return row;
  });

  const kindLabel = PROBLEM_KIND_LABELS[input.kind];
  await sendEmail(db, { to: order.email, ...problemReceivedEmail(order.shipName, order.orderNumber, kindLabel, orderUrl(order)), template: "problem-received", orderId: order.id });
  const { ownerEmail } = await readSettings(db, "notifications");
  if (ownerEmail) {
    await sendEmail(db, {
      to: ownerEmail,
      ...problemOwnerEmail(
        {
          orderNumber: order.orderNumber,
          name: order.shipName,
          email: order.email,
          phone: order.shipPhone,
          kindLabel,
          description: input.description,
          items: chosen.map((i) => `${i.productName} (${i.variantTitle}) × ${i.quantity}`),
          photos: photos.length,
        },
        `${env().APP_URL}/admin/problems`,
      ),
      template: "problem-owner",
      orderId: order.id,
    });
  }
  return report;
}

/* ---------------- Admin ---------------- */

export async function problemCounts(db: DbOrTx) {
  const rows = await db.select({ status: problemReports.status, n: sql<number>`count(*)::int` }).from(problemReports).groupBy(problemReports.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ProblemStatus, number>>;
}

export async function listProblemReports(db: DbOrTx, status: ProblemStatus) {
  const reports = await db
    .select({ report: problemReports, order: orders })
    .from(problemReports)
    .innerJoin(orders, eq(orders.id, problemReports.orderId))
    .where(eq(problemReports.status, status))
    .orderBy(status === "OPEN" ? asc(problemReports.createdAt) : desc(problemReports.updatedAt))
    .limit(100);
  const ids = reports.map((r) => r.report.id);
  const orderIds = [...new Set(reports.map((r) => r.order.id))];
  const replacementIds = reports.map((r) => r.report.replacementOrderId).filter((x): x is number => x !== null);
  const [photos, items, replacements] = await Promise.all([
    ids.length ? db.select({ id: problemPhotos.id, reportId: problemPhotos.reportId }).from(problemPhotos).where(inArray(problemPhotos.reportId, ids)).orderBy(asc(problemPhotos.id)) : [],
    orderIds.length ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)).orderBy(asc(orderItems.id)) : [],
    replacementIds.length ? db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status }).from(orders).where(inArray(orders.id, replacementIds)) : [],
  ]);
  return Promise.all(
    reports.map(async ({ report, order }) => ({
      report,
      order,
      photoIds: photos.filter((p) => p.reportId === report.id).map((p) => p.id),
      items: items.filter((i) => i.orderId === order.id),
      replacement: replacements.find((o) => o.id === report.replacementOrderId) ?? null,
      refundablePaise: report.status === "OPEN" ? await refundableAmount(db, order) : 0,
    })),
  );
}

export type ProblemListEntry = Awaited<ReturnType<typeof listProblemReports>>[number];

export async function problemPhoto(db: DbOrTx, id: number) {
  const [row] = await db.select({ data: problemPhotos.data }).from(problemPhotos).where(eq(problemPhotos.id, id));
  return row?.data ?? null;
}

async function openReport(tx: DbOrTx, reportId: number) {
  const [report] = await tx.select().from(problemReports).where(eq(problemReports.id, reportId)).for("update");
  if (!report) throw new ProblemError("Report not found.");
  if (report.status !== "OPEN") throw new ProblemError("This report has already been resolved.");
  return report;
}

/**
 * Sends a free replacement: a new ₹0 order for the chosen items, confirmed
 * straight away with its stock taken, ready to pack like any other order.
 * No tax invoice is issued for it (nothing is sold); ask your CA whether you
 * need a delivery challan for replacements.
 */
export async function sendReplacement(db: Database, reportId: number, lines: { orderItemId: number; quantity: number }[], note: string, staffUserId: number) {
  const wanted = lines.filter((l) => l.quantity > 0);
  if (!wanted.length) throw new ProblemError("Choose at least one item to send again.");

  const { replacement, original } = await db.transaction(async (tx) => {
    const report = await openReport(tx, reportId);
    const original = await lockOrder(tx, { id: report.orderId });
    if (!original) throw new ProblemError("Order not found.");
    const items = await loadOrderItems(tx, original.id);
    const chosen = wanted.map((l) => {
      const item = items.find((i) => i.id === l.orderItemId);
      if (!item) throw new ProblemError("That item isn't on this order.");
      if (!Number.isInteger(l.quantity) || l.quantity > item.quantity) throw new ProblemError(`You can send at most ${item.quantity} of ${item.productName}.`);
      return { item, quantity: l.quantity };
    });
    const variantIds = chosen.map((c) => c.item.variantId).filter((v): v is number => v !== null);
    const weights = variantIds.length ? await tx.select({ id: productVariants.id, grams: productVariants.shippingWeightGrams }).from(productVariants).where(inArray(productVariants.id, variantIds)) : [];
    const weightOf = (variantId: number | null) => weights.find((w) => w.id === variantId)?.grams ?? 250;

    const now = new Date();
    const [created] = await tx
      .insert(orders)
      .values({
        orderNumber: await nextOrderNumber(tx),
        accessTokenHash: "pending",
        // One replacement per report, even if the button is pressed twice.
        idempotencyKey: `replacement:${report.id}`,
        customerId: original.customerId,
        email: original.email,
        phone: original.phone,
        status: "CONFIRMED",
        paymentMethod: "PREPAID",
        paymentStatus: "NOT_APPLICABLE",
        stockState: "COMMITTED",
        shipName: original.shipName,
        shipPhone: original.shipPhone,
        shipLine1: original.shipLine1,
        shipLine2: original.shipLine2,
        shipLandmark: original.shipLandmark,
        shipCity: original.shipCity,
        shipState: original.shipState,
        shipPincode: original.shipPincode,
        billingGstin: original.billingGstin,
        billingBusinessName: original.billingBusinessName,
        subtotalPaise: 0,
        totalPaise: 0,
        totalWeightGrams: chosen.reduce((s, c) => s + weightOf(c.item.variantId) * c.quantity, 0),
        customerNote: `Free replacement for order ${original.orderNumber}`,
        replacementForOrderId: original.id,
        confirmedAt: now,
        placedAt: now,
      })
      .returning();
    const [replacement] = await tx.update(orders).set({ accessTokenHash: sha256Hex(orderAccessToken(created)) }).where(eq(orders.id, created.id)).returning();
    await tx.insert(orderItems).values(
      chosen.map(({ item, quantity }) => ({
        orderId: replacement.id,
        productId: item.productId,
        variantId: item.variantId,
        inventoryItemId: item.inventoryItemId,
        unitsPerSale: item.unitsPerSale,
        productName: item.productName,
        variantTitle: item.variantTitle,
        sku: item.sku,
        hsnCode: item.hsnCode,
        gstRateBp: item.gstRateBp,
        unitPricePaise: 0,
        mrpPaise: item.mrpPaise,
        quantity,
        lineSubtotalPaise: 0,
        lineTotalPaise: 0,
        taxableValuePaise: 0,
        taxPaise: 0,
        costPaise: item.costPaise === null ? null : Math.round((item.costPaise * quantity) / item.quantity),
        categoryId: item.categoryId,
      })),
    );
    const needs = aggregateNeeds(chosen.map((c) => ({ inventoryItemId: c.item.inventoryItemId, unitsPerSale: c.item.unitsPerSale, quantity: c.quantity })));
    try {
      await reserveStock(tx, needs, replacement.id);
    } catch (err) {
      if (err instanceof OutOfStockError) throw new ProblemError("There isn't enough stock to send this replacement. Restock first, or refund instead.");
      throw err;
    }
    await commitStock(tx, needs, replacement.id);

    await tx
      .update(problemReports)
      .set({ status: "REPLACEMENT_SENT", replacementOrderId: replacement.id, resolutionNote: note, resolvedAt: now, resolvedByStaffId: staffUserId })
      .where(eq(problemReports.id, report.id));
    await addOrderEvent(tx, replacement.id, "replacement.created", `Free replacement for order ${original.orderNumber}. Nothing to pay.`, { isPublic: true, actor: `staff:${staffUserId}` });
    await addOrderEvent(tx, original.id, "problem.replacement", `We're sending a free replacement (order ${replacement.orderNumber}).`, { isPublic: true, actor: `staff:${staffUserId}` });
    await logAudit(tx, { staffUserId, action: "problem.replacement", entityType: "order", entityId: original.id, data: { reportId: report.id, replacementOrderId: replacement.id } });
    return { replacement, original };
  });

  await sendEmail(db, {
    to: replacement.email,
    ...replacementSentEmail(await emailOrder(db, replacement), original.orderNumber, note, orderUrl(replacement)),
    template: "replacement-sent",
    orderId: replacement.id,
  });
  return replacement;
}

/** Refunds (part of) the order through the normal refund flow, then marks the report resolved. */
export async function refundForProblem(
  db: Database,
  reportId: number,
  input: { amountPaise: number; mode: "RAZORPAY" | "MANUAL"; reference: string; reason: string },
  staffUserId: number,
) {
  const [report] = await db.select().from(problemReports).where(eq(problemReports.id, reportId));
  if (!report) throw new ProblemError("Report not found.");
  if (report.status !== "OPEN") throw new ProblemError("This report has already been resolved.");
  try {
    await refundOrder(db, report.orderId, { amountPaise: input.amountPaise, reason: input.reason, staffUserId, mode: input.mode, reference: input.reference });
  } catch (err) {
    if (err instanceof OrderActionError) throw new ProblemError(err.message);
    throw err;
  }
  await db.transaction(async (tx) => {
    await tx
      .update(problemReports)
      .set({ status: "REFUNDED", refundPaise: input.amountPaise, resolutionNote: input.reason, resolvedAt: new Date(), resolvedByStaffId: staffUserId })
      .where(and(eq(problemReports.id, reportId), eq(problemReports.status, "OPEN")));
    await logAudit(tx, { staffUserId, action: "problem.refund", entityType: "order", entityId: report.orderId, data: { reportId, amountPaise: input.amountPaise } });
  });
}

/** Replies to the customer and closes the report without a replacement or refund. */
export async function closeProblem(db: Database, reportId: number, note: string, staffUserId: number) {
  const order = await db.transaction(async (tx) => {
    const report = await openReport(tx, reportId);
    await tx.update(problemReports).set({ status: "CLOSED", resolutionNote: note, resolvedAt: new Date(), resolvedByStaffId: staffUserId }).where(eq(problemReports.id, report.id));
    await addOrderEvent(tx, report.orderId, "problem.closed", `About the problem you reported: ${note}`, { isPublic: true, actor: `staff:${staffUserId}` });
    await logAudit(tx, { staffUserId, action: "problem.close", entityType: "order", entityId: report.orderId, data: { reportId } });
    const [o] = await tx.select().from(orders).where(eq(orders.id, report.orderId));
    return o;
  });
  await sendEmail(db, { to: order.email, ...problemClosedEmail(order.shipName, order.orderNumber, note, orderUrl(order)), template: "problem-closed", orderId: order.id });
}

export async function setProblemStaffNote(db: DbOrTx, reportId: number, note: string) {
  await db.update(problemReports).set({ staffNote: note.slice(0, 2000) }).where(eq(problemReports.id, reportId));
}
