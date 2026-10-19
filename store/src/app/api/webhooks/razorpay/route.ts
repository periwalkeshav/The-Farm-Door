import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { verifyWebhookSignature } from "@/server/payments/razorpay";
import { handleRazorpayEvent } from "@/server/webhooks";

/**
 * Razorpay webhook. Configure in Razorpay Dashboard > Webhooks with this URL,
 * the secret in RAZORPAY_WEBHOOK_SECRET, and events: payment.authorized,
 * payment.captured, payment.failed, order.paid, refund.processed, refund.failed.
 */
export async function POST(request: Request) {
  const e = env();
  if (e.PAYMENTS_PROVIDER !== "razorpay" || !e.RAZORPAY_WEBHOOK_SECRET) return new Response("Not configured", { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return new Response("Too large", { status: 413 });
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"), e.RAZORPAY_WEBHOOK_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const eventId = request.headers.get("x-razorpay-event-id") ?? `body:${sha256Hex(raw)}`;
  try {
    const { changedStock } = await handleRazorpayEvent(getDb(), eventId, body);
    if (changedStock) revalidateTag("stock", "max");
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[webhook:razorpay] failed:", err);
    // A non-2xx response makes Razorpay retry later.
    return new Response("Processing failed", { status: 500 });
  }
}
