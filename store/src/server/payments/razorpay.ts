/**
 * Razorpay REST API (https://razorpay.com/docs/api/). Uses Basic auth with the
 * key id/secret. Secrets never leave the server; the browser only gets the key id
 * and the Razorpay order id.
 */
import { createHmac } from "node:crypto";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { GatewayOrder, GatewayPayment, GatewayRefund, PaymentGateway } from "./types";

const BASE = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
  ) {
    super(message);
  }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) throw new Error("Razorpay API keys are not configured.");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new RazorpayError(`Razorpay ${method} ${path} failed (${res.status}): ${json?.error?.description ?? "unknown error"}`, res.status, json);
  return json;
}

type RzpPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string;
  fee?: number | null;
  tax?: number | null;
  amount_refunded?: number;
  error_code?: string | null;
  error_description?: string | null;
};

function toPayment(p: RzpPayment): GatewayPayment {
  return {
    id: p.id,
    orderId: p.order_id,
    amountPaise: p.amount,
    currency: p.currency,
    status: p.status,
    method: p.method ?? "",
    feePaise: p.fee ?? null,
    taxOnFeePaise: p.tax ?? null,
    amountRefundedPaise: p.amount_refunded ?? 0,
    errorCode: p.error_code ?? "",
    errorDescription: p.error_description ?? "",
    raw: p,
  };
}

/** Signature Razorpay Checkout returns on success: HMAC-SHA256(order_id|payment_id, key_secret). */
export function checkoutSignature(orderId: string, paymentId: string, secret: string) {
  return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

/** Webhook signature: HMAC-SHA256 of the raw request body with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false;
  return safeEqual(createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
}

export const razorpayGateway: PaymentGateway = {
  name: "razorpay",
  isSimulated: false,

  publicKeyId() {
    return env().RAZORPAY_KEY_ID;
  },

  async createOrder(amountPaise, receipt, notes): Promise<GatewayOrder> {
    const order = await call<{ id: string; amount: number; currency: string; status: string }>("POST", "/orders", {
      amount: amountPaise,
      currency: "INR",
      receipt: receipt.slice(0, 40),
      notes,
    });
    return { id: order.id, amountPaise: order.amount };
  },

  verifyCheckoutSignature(orderId, paymentId, signature) {
    return safeEqual(checkoutSignature(orderId, paymentId, env().RAZORPAY_KEY_SECRET), signature);
  },

  async fetchPayment(paymentId) {
    return toPayment(await call<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`));
  },

  async fetchOrderPayments(orderId) {
    const list = await call<{ items: RzpPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
    return list.items.map(toPayment);
  },

  async capture(paymentId, amountPaise) {
    return toPayment(await call<RzpPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: amountPaise, currency: "INR" }));
  },

  async refund(paymentId, amountPaise, notes): Promise<GatewayRefund> {
    const r = await call<{ id: string; status: "pending" | "processed" | "failed"; amount: number }>("POST", `/payments/${encodeURIComponent(paymentId)}/refund`, {
      amount: amountPaise,
      speed: "normal",
      notes,
    });
    return { id: r.id, status: r.status, amountPaise: r.amount };
  },
};
