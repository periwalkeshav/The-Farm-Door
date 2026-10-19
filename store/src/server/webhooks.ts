/**
 * Incoming webhooks from Razorpay (payments, refunds) and Shiprocket (tracking).
 * Each event is recorded once (provider + event id) so retries are harmless.
 */
import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/db";
import { shipments, webhookEvents } from "@/db/schema";
import { applyShipmentUpdate } from "./orders/lifecycle";
import { processGatewayPayment, recordRefundWebhook } from "./orders/payment";
import { paymentGateway } from "./payments";
import { mapShiprocketStatus } from "./shipping/shiprocket";

/** Returns false if this event was already processed successfully. */
async function claimEvent(db: Database, provider: string, eventId: string, eventType: string, payload: unknown): Promise<boolean> {
  const [done] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId), isNotNull(webhookEvents.processedAt)));
  if (done) return false;
  await db
    .insert(webhookEvents)
    .values({ provider, eventId, eventType, payload: payload as Record<string, unknown> })
    .onConflictDoUpdate({ target: [webhookEvents.provider, webhookEvents.eventId], set: { error: "" } });
  return true;
}

async function finishEvent(db: Database, provider: string, eventId: string, error?: string) {
  await db
    .update(webhookEvents)
    .set(error ? { error: error.slice(0, 1000) } : { processedAt: new Date(), error: "" })
    .where(and(eq(webhookEvents.provider, provider), eq(webhookEvents.eventId, eventId)));
}

type RazorpayEvent = {
  event: string;
  payload?: {
    payment?: { entity?: { id: string; order_id: string } };
    refund?: { entity?: { id: string; status: string } };
  };
};

export async function handleRazorpayEvent(db: Database, eventId: string, body: RazorpayEvent): Promise<{ changedStock: boolean }> {
  if (!(await claimEvent(db, "razorpay", eventId, body.event, body))) return { changedStock: false };
  try {
    let changedStock = false;
    switch (body.event) {
      case "payment.captured":
      case "payment.authorized":
      case "payment.failed":
      case "order.paid": {
        const paymentId = body.payload?.payment?.entity?.id;
        if (paymentId) {
          // Re-read the payment from Razorpay rather than trusting the event body.
          const payment = await paymentGateway().fetchPayment(paymentId);
          const r = await processGatewayPayment(db, payment, "webhook");
          changedStock = ["CONFIRMED", "LATE_CONFIRMED"].includes(r.outcome);
        }
        break;
      }
      case "refund.processed":
      case "refund.failed": {
        const refundId = body.payload?.refund?.entity?.id;
        if (refundId) await recordRefundWebhook(db, refundId, body.event === "refund.processed" ? "processed" : "failed");
        break;
      }
      default:
        break; // Other events are acknowledged and ignored.
    }
    await finishEvent(db, "razorpay", eventId);
    return { changedStock };
  } catch (err) {
    await finishEvent(db, "razorpay", eventId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

type ShiprocketEvent = {
  awb?: string | number;
  current_status?: string;
  current_status_id?: number;
  shipment_status?: string;
  shipment_status_id?: number;
  current_timestamp?: string;
  etd?: string;
  scans?: { date: string; status?: string; activity?: string; location?: string; "sr-status"?: string; "sr-status-label"?: string }[];
};

function istDate(value: string | undefined): Date | null {
  if (!value) return null;
  // Shiprocket sends "2023-05-19 11:59:16" or "23 05 2023 11:43:52" in IST.
  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+05:30`);
  m = /^(\d{2}) (\d{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+05:30`);
  return null;
}

export async function handleShiprocketEvent(db: Database, body: ShiprocketEvent) {
  const awb = body.awb ? String(body.awb) : "";
  if (!awb) return { matched: false };
  const statusId = body.shipment_status_id ?? body.current_status_id ?? null;
  const eventId = `${awb}:${statusId ?? "?"}:${body.current_timestamp ?? ""}`;
  if (!(await claimEvent(db, "shiprocket", eventId, body.shipment_status ?? body.current_status ?? "update", body))) return { matched: true };
  try {
    const [shipment] = await db.select().from(shipments).where(eq(shipments.awb, awb));
    if (!shipment) {
      await finishEvent(db, "shiprocket", eventId, "No shipment with this AWB");
      return { matched: false };
    }
    const events = (body.scans ?? [])
      .map((s) => ({
        status: s["sr-status-label"] && s["sr-status-label"] !== "NA" ? s["sr-status-label"] : (s.status ?? ""),
        description: s.activity ?? "",
        location: s.location ?? "",
        occurredAt: istDate(s.date) ?? new Date(NaN),
      }))
      .filter((e) => !Number.isNaN(e.occurredAt.getTime()));
    const etd = istDate(body.etd);
    await applyShipmentUpdate(db, shipment.id, { status: mapShiprocketStatus(statusId), etaDate: etd ? etd.toISOString().slice(0, 10) : null, events, actor: "courier" });
    await finishEvent(db, "shiprocket", eventId);
    return { matched: true };
  } catch (err) {
    await finishEvent(db, "shiprocket", eventId, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
